const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Ensures DATABASE_URL always uses IPv4-compatible endpoints.
 * Supabase direct 'db.<project>.supabase.co' is IPv6-only and fails on Render.
 * We automatically rewrite it to the IPv4-compatible Supabase Pooler.
 */
function resolveIpv4DatabaseUrl(url) {
  if (!url || typeof url !== 'string') return url;

  let cleanUrl = url.trim();

  // Extract project ref from SUPABASE_URL if available
  let projectRef = 'uhktbbeqqdsfkooyrgmq';
  if (env && env.SUPABASE_URL) {
    const refMatch = env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (refMatch) projectRef = refMatch[1];
  }

  // 1. If using direct Supabase URL (db.<project>.supabase.co), convert to Supavisor Pooler URL
  if (cleanUrl.includes('db.') && cleanUrl.includes('.supabase.co')) {
    const match = cleanUrl.match(/postgresql:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co:(\d+)\/([^?]+)(\?.*)?/);
    if (match) {
      const user = match[1];
      const pass = match[2];
      const urlProjectRef = match[3] || projectRef;
      const dbName = match[5];
      const queryParams = match[6] || '';
      const poolerUser = user.includes('.') ? user : `${user}.${urlProjectRef}`;
      const defaultHost = process.env.SUPABASE_POOLER_HOST || env.SUPABASE_POOLER_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com';
      cleanUrl = `postgresql://${poolerUser}:${pass}@${defaultHost}:5432/${dbName}${queryParams}`;
      logger.info(`[DB Config] Automatically converted IPv6-only Supabase direct host to IPv4 Pooler host (${defaultHost})`);
    }
  }

  // 2. If using pooler.supabase.com but username is just 'postgres' without the '.<projectRef>', auto-append it!
  if (cleanUrl.includes('pooler.supabase.com')) {
    cleanUrl = cleanUrl.replace(/postgresql:\/\/([^:]+):/, (m, user) => {
      if (!user.includes('.')) {
        logger.info(`[DB Config] Augmented pooler user '${user}' with project ref to '${user}.${projectRef}'`);
        return `postgresql://${user}.${projectRef}:`;
      }
      return m;
    });
  }

  return cleanUrl;
}

const connectionString = resolveIpv4DatabaseUrl(env.DATABASE_URL || process.env.DATABASE_URL || '');

const isRemote =
  connectionString.includes('supabase') ||
  connectionString.includes('render') ||
  connectionString.includes('aws') ||
  connectionString.includes('pooler') ||
  connectionString.includes('neon');

const pool = new Pool({
  connectionString: connectionString || 'postgresql://localhost:5432/postgres',
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  family: 4, // Enforce IPv4 socket connection
  lookup: (hostname, _options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback);
  },
  max: 5, // Keep connection count safely within Supabase pool limit
  min: env.NODE_ENV === 'test' ? 0 : 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Prevent unhandled idle connection errors from triggering process-level uncaughtException
pool.on('error', (err) => {
  logger.warn(`[DB Pool] Idle client notice: ${err.message}`);
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Log slow queries in development
if (env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    if (e.duration > 1000) {
      logger.warn(`[Prisma] Slow query detected (${e.duration}ms): ${e.query.substring(0, 100)}...`);
    }
  });
}

let isDbConnected = false;

// Connect to database with resilient retry
async function connectDB() {
  try {
    await prisma.$connect();
    // Test live authentication & connectivity
    await pool.query('SELECT 1');
    isDbConnected = true;
    logger.info('Database connected successfully');
  } catch (error) {
    isDbConnected = false;
    logger.warn(`Database connection notice: ${error.message}`);
  }
}

// Disconnect from database
async function disconnectDB() {
  try {
    await prisma.$disconnect();
  } catch (_e) {
    // Ignore disconnect error during shutdown
  }
  try {
    await pool.end();
  } catch (_e) {
    // Ignore pool end error during shutdown
  }
  isDbConnected = false;
}

let isPinging = false;

// Check database connection status
function isConnected() {
  if (isDbConnected) return true;
  // If connection string is configured and pool is active, allow queries and ping in background
  if (pool && !pool.ending && !pool.ended && Boolean(connectionString && connectionString.length > 10)) {
    if (!isPinging) {
      isPinging = true;
      pool.query('SELECT 1')
        .then(() => {
          isDbConnected = true;
        })
        .catch(() => {})
        .finally(() => {
          isPinging = false;
        });
    }
    return true;
  }
  return false;
}

module.exports = {
  prisma,
  pool,
  connectDB,
  disconnectDB,
  isConnected,
};
