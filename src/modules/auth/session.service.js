const crypto = require('crypto');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

// Fallback in-memory session store
const memorySessions = new Map();
const memoryUserSessions = new Map();

class SessionService {
  /**
   * Track active session upon login
   */
  async createSession(userId, deviceInfo = {}, ipAddress = '127.0.0.1') {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const sessionData = {
      sessionId,
      userId,
      device: deviceInfo.device || 'Unknown Device',
      browser: deviceInfo.browser || deviceInfo.userAgent || 'App Client',
      os: deviceInfo.os || 'Unknown OS',
      ipAddress,
      location: deviceInfo.location || 'Ethiopia',
      createdAt: now,
      lastActivity: now,
    };

    const ttlSeconds = 7 * 24 * 60 * 60; // 7 days

    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(sessionData));
        if (typeof redis.sadd === 'function') {
          await redis.sadd(`user:${userId}:sessions`, sessionId);
        }
      } catch (err) {
        logger.warn(`[SessionService] Redis setex error, fallback to memory: ${err.message}`);
        this._saveToMemory(userId, sessionId, sessionData);
      }
    } else {
      this._saveToMemory(userId, sessionId, sessionData);
    }

    return sessionData;
  }

  _saveToMemory(userId, sessionId, sessionData) {
    memorySessions.set(`session:${sessionId}`, sessionData);
    if (!memoryUserSessions.has(userId)) {
      memoryUserSessions.set(userId, new Set());
    }
    memoryUserSessions.get(userId).add(sessionId);
  }

  /**
   * List all active sessions for a user
   */
  async getUserSessions(userId) {
    const sessions = [];

    if (redis && typeof redis.smembers === 'function') {
      try {
        const sessionIds = await redis.smembers(`user:${userId}:sessions`);
        for (const sid of sessionIds) {
          const raw = await redis.get(`session:${sid}`);
          if (raw) {
            sessions.push(JSON.parse(raw));
          } else {
            // Clean up stale session ID from user's set
            await redis.srem(`user:${userId}:sessions`, sid);
          }
        }
      } catch (err) {
        logger.warn(`[SessionService] Redis smembers error: ${err.message}`);
      }
    }

    // Also merge with in-memory sessions if any
    const memSet = memoryUserSessions.get(userId);
    if (memSet) {
      for (const sid of memSet) {
        const data = memorySessions.get(`session:${sid}`);
        if (data && !sessions.some((s) => s.sessionId === sid)) {
          sessions.push(data);
        }
      }
    }

    return sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  /**
   * Terminate a specific session (remote logout)
   */
  async terminateSession(userId, sessionId) {
    if (redis && typeof redis.del === 'function') {
      try {
        await redis.del(`session:${sessionId}`);
        if (typeof redis.srem === 'function') {
          await redis.srem(`user:${userId}:sessions`, sessionId);
        }
        if (typeof redis.setex === 'function') {
          await redis.setex(`blacklist:session:${sessionId}`, 86400, '1');
        }
      } catch (err) {
        logger.warn(`[SessionService] Redis del error: ${err.message}`);
      }
    }

    memorySessions.delete(`session:${sessionId}`);
    const memSet = memoryUserSessions.get(userId);
    if (memSet) {
      memSet.delete(sessionId);
    }

    return { terminated: true, sessionId };
  }

  /**
   * Terminate all other sessions for a user except current
   */
  async terminateOtherSessions(userId, currentSessionId) {
    const sessions = await this.getUserSessions(userId);
    const terminated = [];

    for (const session of sessions) {
      if (session.sessionId !== currentSessionId) {
        await this.terminateSession(userId, session.sessionId);
        terminated.push(session.sessionId);
      }
    }

    return { terminatedCount: terminated.length, terminatedSessionIds: terminated };
  }

  /**
   * Check if a session is currently valid
   */
  async isSessionValid(sessionId) {
    if (!sessionId) return false;

    if (redis && typeof redis.get === 'function') {
      try {
        const raw = await redis.get(`session:${sessionId}`);
        if (raw) return true;
      } catch (_err) {}
    }

    return memorySessions.has(`session:${sessionId}`);
  }
}

module.exports = new SessionService();
