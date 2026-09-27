const redis = require('../../config/redis');
const logger = require('../../utils/logger');

// In-memory fallback
const memoryFailedAttempts = new Map();
const memoryLockedAccounts = new Map();

class SecurityMonitorService {
  /**
   * Track login attempts and enforce brute-force lockout
   */
  async recordLoginAttempt(identifier, success, ipAddress = '127.0.0.1', _userAgent = '') {
    if (!identifier) return { locked: false, attempts: 0 };
    const cleanId = String(identifier).toLowerCase().trim();
    const key = `login:attempts:${cleanId}`;

    if (!success) {
      let attempts = 1;

      if (redis && typeof redis.incr === 'function') {
        try {
          attempts = await redis.incr(key);
          await redis.expire(key, 15 * 60); // 15-minute sliding window
        } catch (err) {
          attempts = (memoryFailedAttempts.get(cleanId) || 0) + 1;
          memoryFailedAttempts.set(cleanId, attempts);
        }
      } else {
        attempts = (memoryFailedAttempts.get(cleanId) || 0) + 1;
        memoryFailedAttempts.set(cleanId, attempts);
      }

      logger.warn(`[SecurityMonitor] Failed login attempt #${attempts} for ${cleanId} from ${ipAddress}`);

      // Lock account after 5 failed attempts for 30 minutes
      if (attempts >= 5) {
        await this.lockAccount(cleanId, 30 * 60, 'MULTIPLE_FAILED_LOGIN_ATTEMPTS');
        return { locked: true, attempts, lockDurationMinutes: 30 };
      }

      return { locked: false, attempts, remainingAttempts: Math.max(0, 5 - attempts) };
    } else {
      // Success: reset failed attempt counter
      if (redis && typeof redis.del === 'function') {
        try {
          await redis.del(key);
        } catch (_err) {}
      }
      memoryFailedAttempts.delete(cleanId);
      return { locked: false, attempts: 0 };
    }
  }

  /**
   * Check if account is temporarily locked
   */
  async isAccountLocked(identifier) {
    if (!identifier) return false;
    const cleanId = String(identifier).toLowerCase().trim();
    const key = `account:locked:${cleanId}`;

    if (redis && typeof redis.get === 'function') {
      try {
        const locked = await redis.get(key);
        if (locked) return true;
      } catch (_err) {}
    }

    const memLock = memoryLockedAccounts.get(cleanId);
    if (memLock && memLock.expires > Date.now()) {
      return true;
    } else if (memLock) {
      memoryLockedAccounts.delete(cleanId);
    }

    return false;
  }

  /**
   * Lock account
   */
  async lockAccount(identifier, durationSeconds = 1800, reason = 'SECURITY_POLICY') {
    const cleanId = String(identifier).toLowerCase().trim();
    const key = `account:locked:${cleanId}`;

    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(key, durationSeconds, JSON.stringify({ lockedAt: new Date().toISOString(), reason }));
      } catch (_err) {
        memoryLockedAccounts.set(cleanId, { expires: Date.now() + durationSeconds * 1000, reason });
      }
    } else {
      memoryLockedAccounts.set(cleanId, { expires: Date.now() + durationSeconds * 1000, reason });
    }

    logger.warn(`[SecurityMonitor] Account locked for ${cleanId}: ${reason} for ${durationSeconds}s`);
  }

  /**
   * Unlock account manually
   */
  async unlockAccount(identifier) {
    const cleanId = String(identifier).toLowerCase().trim();
    const key = `account:locked:${cleanId}`;

    if (redis && typeof redis.del === 'function') {
      try {
        await redis.del(key);
        await redis.del(`login:attempts:${cleanId}`);
      } catch (_err) {}
    }

    memoryLockedAccounts.delete(cleanId);
    memoryFailedAttempts.delete(cleanId);

    logger.info(`[SecurityMonitor] Account unlocked for ${cleanId}`);
    return { unlocked: true, identifier: cleanId };
  }

  /**
   * Anomaly detection: check for impossible travel velocity between consecutive logins
   */
  detectSuspiciousActivity(currentLogin, previousLogins = []) {
    if (!previousLogins || previousLogins.length === 0) {
      return { suspicious: false };
    }

    const lastLogin = previousLogins[0];
    if (!lastLogin || !lastLogin.coords || !currentLogin.coords) {
      return { suspicious: false };
    }

    const timeDiffMs = Math.abs(new Date(currentLogin.timestamp) - new Date(lastLogin.timestamp));
    const hours = timeDiffMs / (1000 * 60 * 60);

    const distanceKm = this._haversineDistance(
      lastLogin.coords.lat,
      lastLogin.coords.lng,
      currentLogin.coords.lat,
      currentLogin.coords.lng
    );

    // If speed exceeds 900 km/h (commercial aircraft speed) in short duration
    if (hours < 2 && distanceKm > 1000) {
      logger.warn(`[SecurityMonitor] Impossible travel detected: ${distanceKm.toFixed(1)} km in ${hours.toFixed(2)} hours`);
      return {
        suspicious: true,
        reason: 'IMPOSSIBLE_TRAVEL',
        distanceKm,
        timeHours: hours,
        requiresVerification: true,
      };
    }

    return { suspicious: false };
  }

  _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

module.exports = new SecurityMonitorService();
