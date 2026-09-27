const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { initSocket } = require('./config/socket');
const { initScheduler } = require('./ingestion/jobs/scheduler');
const { closeQueue } = require('./ingestion/jobs/queue');
const redis = require('./config/redis');

const { warmBoundariesCache } = require('./modules/boundaries/boundaries.service');

const server = http.createServer(app);
const PORT = env.PORT || 5000;

// Render Keep-Alive Pinger to eliminate free-tier sleep / cold starts
function initRenderKeepAlive() {
  const targetUrl = process.env.RENDER_EXTERNAL_URL || env.APP_URL || 'https://agrietech.onrender.com';
  if (!targetUrl || !targetUrl.includes('onrender.com')) return;

  const pingIntervalMs = 10 * 60 * 1000; // 10 minutes (Render sleeps after 15 mins)
  setInterval(() => {
    try {
      const https = require('https');
      https.get(`${targetUrl}/health`, (res) => {
        logger.debug(`[Render Keep-Alive] Ping ${targetUrl}/health -> HTTP ${res.statusCode}`);
      }).on('error', (err) => {
        logger.debug(`[Render Keep-Alive] Ping notice: ${err.message}`);
      });
    } catch (_e) {}
  }, pingIntervalMs).unref();

  logger.info(`[Render Keep-Alive] Keep-alive pinger scheduled for ${targetUrl} (every 10 min)`);
}

// Start HTTP server with specific error handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`[EthioFarm] Port ${PORT} is already in use by another process. Please terminate the conflicting process or set a different PORT in .env`);
    process.exit(1);
  } else {
    logger.error(`[EthioFarm] Server error: ${err.message}`);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  logger.info(`[EthioFarm] Server running on port ${PORT} [${env.NODE_ENV}]`);
});

async function autoSyncAdminAccount() {
  // Provisioning an administrator is deliberately opt-in.  A server must
  // never create privileged accounts from fallback credentials at startup.
  if (process.env.BOOTSTRAP_ADMIN_ON_STARTUP !== 'true') return;

  try {
    const adminPassword = (process.env.ADMIN_CONSOLE_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!adminPassword || !adminEmail) {
      throw new Error('BOOTSTRAP_ADMIN_ON_STARTUP requires ADMIN_EMAIL and ADMIN_CONSOLE_PASSWORD');
    }

    const adminEmails = [adminEmail];

    const bcrypt = require('bcryptjs');
    const { prisma } = require('./config/db');
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    for (const email of adminEmails) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN', passwordHash, isEmailVerified: true },
        });
        logger.info(`[Admin Sync] Admin account (${email}) synchronized with administrator privileges.`);
      } else {
        await prisma.user.create({
          data: {
            email,
            fullName: email.includes('abraham') ? 'Abraham Tiruneh (Admin)' : 'Platform Administrator',
            passwordHash,
            role: 'ADMIN',
            isEmailVerified: true,
            preferredLang: 'en',
          },
        });
        logger.info(`[Admin Sync] Created admin account (${email}) with administrator privileges.`);
      }
    }
  } catch (err) {
    logger.warn(`[Admin Sync] Background sync notice: ${err.message}`);
  }
}

// Initialize background services
(async () => {
  try {
    initSocket(server);
    await connectDB();

    // Explicit, one-off provisioning only; disabled by default.
    autoSyncAdminAccount().catch((e) => logger.warn(`Admin sync notice: ${e.message}`));

    // Warm boundaries in memory for sub-millisecond response times
    warmBoundariesCache().catch((e) => logger.warn(`Cache warming notice: ${e.message}`));

    if (env.NODE_ENV !== 'test') {
      initScheduler();
      initRenderKeepAlive();
    }
  } catch (err) {
    logger.warn(`Service startup notice: ${err.message}`);
  }
})();

// Graceful Shutdown Handler
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[EthioFarm] Received ${signal}. Initiating graceful shutdown...`);

  // Force shutdown after 15 seconds if drain hangs
  const forceTimeout = setTimeout(() => {
    logger.error('[EthioFarm] Forcefully terminating process after shutdown timeout');
    process.exit(1);
  }, 15000);
  forceTimeout.unref();

  try {
    // 1. Stop accepting new HTTP connections
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) logger.warn(`Error closing HTTP server: ${err.message}`);
        resolve();
      });
    });
    logger.info('[EthioFarm] HTTP server closed');

    // 2. Close BullMQ queues & workers
    await closeQueue();
    logger.info('[EthioFarm] Ingestion queues closed');

    // 3. Disconnect Redis
    if (redis && redis.status === 'ready') {
      await redis.quit().catch(() => {});
      logger.info('[EthioFarm] Redis disconnected');
    }

    // 4. Disconnect Prisma DB
    await disconnectDB();
    logger.info('[EthioFarm] Database disconnected');

    logger.info('[EthioFarm] Graceful shutdown completed cleanly');
    process.exit(0);
  } catch (error) {
    logger.error(`[EthioFarm] Error during graceful shutdown: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process error traps
process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`, { stack: err.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[FATAL] Unhandled Rejection at:', { promise, reason });
});

module.exports = server;
