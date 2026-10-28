const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('./env');
const { prisma } = require('./db');
const logger = require('../utils/logger');

let io = null;

/**
 * Validate Bearer token from Socket.IO handshake.
 * Token can arrive via:
 *   - socket.handshake.auth.token
 *   - Authorization header: Bearer <token>
 *   - socket.handshake.query.token
 */
function extractAndVerifyToken(socket) {
  try {
    const authToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      socket.handshake.query?.token;

    if (!authToken) return null;
    return jwt.verify(authToken, env.JWT_SECRET);
  } catch (_err) {
    return null;
  }
}

/**
 * Initialize Enterprise WebSocket server with JWT authentication and Hierarchical Room Scoping.
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── JWT Authentication Middleware ──
  io.use((socket, next) => {
    const user = extractAndVerifyToken(socket);
    if (!user) {
      logger.warn(`[WebSocket] Rejected unauthenticated connection from ${socket.handshake.address}`);
      return next(new Error('UNAUTHORIZED: Valid JWT required to connect'));
    }
    socket.user = user;
    logger.info(`[WebSocket] Authenticated connection: userId=${user.id} role=${user.role}`);
    next();
  });

  io.on('connection', async (socket) => {
    const { id: userId, role, regionId, zoneId, woredaId, kebeleId } = socket.user;

    // ── 1. Automatic Jurisdictional Room Subscriptions ──
    socket.join(`user:${userId}`);

    if (kebeleId) socket.join(`kebele:${kebeleId}`);
    if (woredaId) socket.join(`woreda:${woredaId}`);
    if (zoneId) socket.join(`zone:${zoneId}`);
    if (regionId) socket.join(`region:${regionId}`);

    if (role === 'ADMIN' || role === 'RESEARCHER') {
      socket.join('national:telemetry');
    }

    if (role === 'FARMER') {
      try {
        const userFarms = await prisma.farm.findMany({
          where: { userId },
          select: { id: true, woredaId: true, kebeleId: true },
        });
        for (const farm of userFarms) {
          socket.join(`farm:${farm.id}`);
          if (farm.woredaId) socket.join(`woreda:${farm.woredaId}`);
          if (farm.kebeleId) socket.join(`kebele:${farm.kebeleId}`);
        }
        logger.debug(`[WebSocket] Auto-subscribed farmer ${userId} to ${userFarms.length} farm plot rooms`);
      } catch (err) {
        logger.debug(`[WebSocket] Farmer farm auto-join notice: ${err.message}`);
      }
    }

    // ── 2. Woreda Scope Subscription ──
    socket.on('subscribe:woreda', async (targetWoredaId) => {
      if (!targetWoredaId || typeof targetWoredaId !== 'string') {
        socket.emit('error', { code: 'INVALID_WOREDA', message: 'woredaId must be a non-empty string' });
        return;
      }

      if (role === 'ADMIN' || role === 'RESEARCHER') {
        socket.join(`woreda:${targetWoredaId}`);
        socket.emit('subscribed', { woredaId: targetWoredaId });
        return;
      }

      if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') {
        if (targetWoredaId === woredaId) {
          socket.join(`woreda:${targetWoredaId}`);
          socket.emit('subscribed', { woredaId: targetWoredaId });
        } else {
          socket.emit('error', { code: 'FORBIDDEN_SCOPE', message: 'You can only subscribe to your assigned woreda' });
          logger.warn(`[WebSocket] Scope violation: userId=${userId} (${role}) tried to subscribe to woreda:${targetWoredaId}`);
        }
        return;
      }

      if (role === 'ZONAL_OFFICER') {
        try {
          const woreda = await prisma.woreda.findFirst({
            where: { id: targetWoredaId, zoneId },
            select: { id: true },
          });
          if (woreda) {
            socket.join(`woreda:${targetWoredaId}`);
            socket.emit('subscribed', { woredaId: targetWoredaId });
          } else {
            socket.emit('error', { code: 'FORBIDDEN_SCOPE', message: 'Target woreda is outside your assigned zone' });
          }
        } catch (_err) {
          socket.emit('error', { code: 'LOOKUP_FAILED', message: 'Scope check failed' });
        }
        return;
      }

      if (role === 'REGIONAL_OFFICER') {
        try {
          const woreda = await prisma.woreda.findFirst({
            where: { id: targetWoredaId, zone: { regionId } },
            select: { id: true },
          });
          if (woreda) {
            socket.join(`woreda:${targetWoredaId}`);
            socket.emit('subscribed', { woredaId: targetWoredaId });
          } else {
            socket.emit('error', { code: 'FORBIDDEN_SCOPE', message: 'Target woreda is outside your assigned region' });
          }
        } catch (_err) {
          socket.emit('error', { code: 'LOOKUP_FAILED', message: 'Scope check failed' });
        }
        return;
      }

      socket.emit('error', { code: 'FORBIDDEN_SCOPE', message: 'Unauthorized role for woreda subscription' });
    });

    // ── 3. Farm Scope Subscription ──
    socket.on('subscribe:farm', async (targetFarmId) => {
      if (!targetFarmId || typeof targetFarmId !== 'string') {
        socket.emit('error', { code: 'INVALID_FARM', message: 'farmId must be a non-empty string' });
        return;
      }

      if (role === 'ADMIN' || role === 'RESEARCHER') {
        socket.join(`farm:${targetFarmId}`);
        socket.emit('subscribed', { farmId: targetFarmId });
        return;
      }

      try {
        const farm = await prisma.farm.findUnique({
          where: { id: targetFarmId },
          select: {
            id: true,
            userId: true,
            woredaId: true,
            woreda: {
              select: {
                zoneId: true,
                zone: { select: { regionId: true } },
              },
            },
          },
        });

        if (!farm) {
          socket.emit('error', { code: 'FARM_NOT_FOUND', message: 'Farm plot does not exist' });
          return;
        }

        if (role === 'FARMER' && farm.userId === userId) {
          socket.join(`farm:${targetFarmId}`);
          socket.emit('subscribed', { farmId: targetFarmId });
          return;
        }

        if ((role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') && farm.woredaId === woredaId) {
          socket.join(`farm:${targetFarmId}`);
          socket.emit('subscribed', { farmId: targetFarmId });
          return;
        }

        if (role === 'ZONAL_OFFICER' && farm.woreda?.zoneId === zoneId) {
          socket.join(`farm:${targetFarmId}`);
          socket.emit('subscribed', { farmId: targetFarmId });
          return;
        }

        if (role === 'REGIONAL_OFFICER' && farm.woreda?.zone?.regionId === regionId) {
          socket.join(`farm:${targetFarmId}`);
          socket.emit('subscribed', { farmId: targetFarmId });
          return;
        }

        socket.emit('error', { code: 'FORBIDDEN_SCOPE', message: 'Farm plot is outside your jurisdictional scope' });
      } catch (_err) {
        socket.emit('error', { code: 'LOOKUP_FAILED', message: 'Scope check failed' });
      }
    });

    // ── 4. Generic Channel Join Handler (Flutter socket_client compatibility) ──
    socket.on('join', (channel) => {
      if (!channel || typeof channel !== 'string') return;
      if (channel.startsWith('woreda:')) {
        const targetId = channel.replace('woreda:', '');
        socket.emit('subscribe:woreda', targetId);
      } else if (channel.startsWith('farm:')) {
        const targetId = channel.replace('farm:', '');
        socket.emit('subscribe:farm', targetId);
      } else if (channel === 'national:telemetry' && (role === 'ADMIN' || role === 'RESEARCHER')) {
        socket.join('national:telemetry');
        socket.emit('subscribed', { channel });
      }
    });

    // ── 5. Unsubscribe Handlers ──
    socket.on('unsubscribe:woreda', (woredaId) => {
      socket.leave(`woreda:${woredaId}`);
      socket.emit('unsubscribed', { woredaId });
    });

    socket.on('unsubscribe:farm', (farmId) => {
      socket.leave(`farm:${farmId}`);
      socket.emit('unsubscribed', { farmId });
    });

    // ── 6. Real-Time AI Live Voice & Telemetry Stream ──
    socket.on('ai:voice-query', async (payload = {}) => {
      const {
        question,
        audioTranscript,
        language = 'am',
        userRole: overrideRole,
        userName: overrideName,
        jurisdiction: overrideJurisdiction,
        requestId = `ai_${Date.now()}`,
      } = payload;

      const cleanQuery = (question || audioTranscript || '').trim();
      if (!cleanQuery) {
        socket.emit('ai:voice-error', {
          requestId,
          error: 'EMPTY_QUERY',
          message: language === 'am' ? 'ባዶ ጥያቄ ማቅረብ አይቻልም።' : 'Query cannot be empty.',
        });
        return;
      }

      // 1. Emit instant acknowledgment / thinking state
      socket.emit('ai:voice-thinking', {
        requestId,
        query: cleanQuery,
        language,
        timestamp: new Date().toISOString(),
      });

      try {
        const aiVoiceService = require('../modules/ai/aiVoice.service');
        const effectiveRole = overrideRole || role || 'FARMER';
        const effectiveName = overrideName || socket.user?.fullName || null;
        const effectiveJurisdiction = overrideJurisdiction || {
          region: socket.user?.regionName || null,
          zone: socket.user?.zoneName || null,
          woreda: socket.user?.woredaName || null,
          kebele: socket.user?.kebeleName || null,
        };

        const result = await aiVoiceService.processVoiceInquiry({
          userQuestion: cleanQuery,
          audioTranscript,
          language,
          userId,
          userRole: effectiveRole,
          userName: effectiveName,
          userJurisdiction: effectiveJurisdiction,
          baseUrl: env.APP_URL || 'https://agrietech.onrender.com',
        });

        socket.emit('ai:voice-response', {
          requestId,
          success: true,
          isOfflineFallback: result.isAiOffline || false,
          data: result,
          ...result,
        });
      } catch (aiErr) {
        logger.warn(`[WebSocket] Live AI voice error for user ${userId}: ${aiErr.message}`);
        socket.emit('ai:voice-error', {
          requestId,
          error: 'AI_INFERENCE_ERROR',
          message: aiErr.message,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[WebSocket] Disconnected: userId=${userId} reason=${reason}`);
    });
  });

  return io;
}

// Access initialized Socket.IO instance
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

module.exports = {
  initSocket,
  getIO,
};

