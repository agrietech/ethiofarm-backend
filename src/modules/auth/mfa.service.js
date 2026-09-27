const crypto = require('crypto');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

// Base32 character set (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_CHARS[bytes[i] % 32];
  }
  return secret;
}

function base32ToBuffer(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secretBase32, timeStepOffset = 0) {
  const key = base32ToBuffer(secretBase32);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + timeStepOffset;

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

// In-memory fallback if Redis is unavailable
const memoryMfaStore = new Map();

class MFAService {
  /**
   * Generate TOTP secret and recovery codes for user setup
   */
  async generateTOTPSecret(userId, accountIdentifier = 'Farmer') {
    const secret = generateBase32Secret(20);
    const backupCodes = this.generateBackupCodes(10);
    const issuer = 'EthioFarm';
    const otpauthUrl = `otpauth://totp/${issuer}:${encodeURIComponent(accountIdentifier)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    // Store pending setup in redis / memory for verification
    const pendingData = {
      secret,
      backupCodes,
      verified: false,
      createdAt: new Date().toISOString(),
    };

    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(`mfa:pending:${userId}`, 900, JSON.stringify(pendingData)); // 15 min window
      } catch (err) {
        logger.warn(`[MFA] Redis setex failed, using memory store: ${err.message}`);
        memoryMfaStore.set(`mfa:pending:${userId}`, pendingData);
      }
    } else {
      memoryMfaStore.set(`mfa:pending:${userId}`, pendingData);
    }

    return {
      secret,
      otpauthUrl,
      backupCodes,
      issuer,
      account: accountIdentifier,
    };
  }

  /**
   * Verify TOTP token with tolerance window (-1, 0, +1 time steps)
   */
  async verifyTOTP(secretBase32, token) {
    if (!secretBase32 || !token) return false;
    const cleanToken = String(token).trim();

    for (let offset = -1; offset <= 1; offset++) {
      const generated = generateTOTP(secretBase32, offset);
      if (generated === cleanToken) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finalize MFA activation after user verifies their first code
   */
  async enableMFA(userId, token) {
    let pendingData = null;

    if (redis && typeof redis.get === 'function') {
      try {
        const data = await redis.get(`mfa:pending:${userId}`);
        if (data) pendingData = JSON.parse(data);
      } catch (err) {
        logger.warn(`[MFA] Redis get failed: ${err.message}`);
      }
    }

    if (!pendingData) {
      pendingData = memoryMfaStore.get(`mfa:pending:${userId}`);
    }

    if (!pendingData) {
      throw new Error('No pending MFA setup found. Please initiate MFA setup again.');
    }

    const isValid = await this.verifyTOTP(pendingData.secret, token);
    if (!isValid) {
      return { success: false, message: 'Invalid verification code' };
    }

    // Save active MFA
    const activeData = {
      secret: pendingData.secret,
      backupCodes: pendingData.backupCodes,
      enabledAt: new Date().toISOString(),
      enabled: true,
    };

    if (redis && typeof redis.set === 'function') {
      try {
        await redis.set(`mfa:active:${userId}`, JSON.stringify(activeData));
        await redis.del(`mfa:pending:${userId}`);
      } catch (err) {
        memoryMfaStore.set(`mfa:active:${userId}`, activeData);
      }
    } else {
      memoryMfaStore.set(`mfa:active:${userId}`, activeData);
    }

    return {
      success: true,
      backupCodes: pendingData.backupCodes,
      message: 'MFA successfully enabled',
    };
  }

  /**
   * Check if MFA is enabled for a user
   */
  async isMFAEnabled(userId) {
    let data = null;
    if (redis && typeof redis.get === 'function') {
      try {
        const raw = await redis.get(`mfa:active:${userId}`);
        if (raw) data = JSON.parse(raw);
      } catch (_err) {}
    }
    if (!data) {
      data = memoryMfaStore.get(`mfa:active:${userId}`);
    }
    return Boolean(data && data.enabled);
  }

  /**
   * Verify token for an active MFA user (or use backup code)
   */
  async verifyUserMFA(userId, token) {
    let data = null;
    if (redis && typeof redis.get === 'function') {
      try {
        const raw = await redis.get(`mfa:active:${userId}`);
        if (raw) data = JSON.parse(raw);
      } catch (_err) {}
    }
    if (!data) {
      data = memoryMfaStore.get(`mfa:active:${userId}`);
    }

    if (!data || !data.secret) {
      return { valid: true, mfaRequired: false }; // User does not have MFA enabled
    }

    // Check TOTP
    const isTotpValid = await this.verifyTOTP(data.secret, token);
    if (isTotpValid) {
      return { valid: true, usedBackupCode: false };
    }

    // Check backup codes
    const cleanToken = String(token).toUpperCase().trim();
    if (Array.isArray(data.backupCodes) && data.backupCodes.includes(cleanToken)) {
      // Consume backup code
      data.backupCodes = data.backupCodes.filter((c) => c !== cleanToken);
      if (redis && typeof redis.set === 'function') {
        try {
          await redis.set(`mfa:active:${userId}`, JSON.stringify(data));
        } catch (_err) {}
      }
      memoryMfaStore.set(`mfa:active:${userId}`, data);
      return { valid: true, usedBackupCode: true, remainingCodes: data.backupCodes.length };
    }

    return { valid: false };
  }

  /**
   * Generate random hexadecimal backup recovery codes
   */
  generateBackupCodes(count = 10) {
    return Array.from({ length: count }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
  }

  /**
   * Send SMS OTP code
   */
  async sendSMSOTP(phoneNumber) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:sms:${phoneNumber}`;

    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(key, 600, otp); // 10 minutes
      } catch (_err) {
        memoryMfaStore.set(key, { otp, expires: Date.now() + 600000 });
      }
    } else {
      memoryMfaStore.set(key, { otp, expires: Date.now() + 600000 });
    }

    logger.info(`[MFA] Generated SMS OTP for ${phoneNumber}: ${otp}`);
    return { sent: true, expiresIn: 600, otpPreview: process.env.NODE_ENV !== 'production' ? otp : undefined };
  }

  /**
   * Verify SMS OTP code
   */
  async verifySMSOTP(phoneNumber, code) {
    const key = `otp:sms:${phoneNumber}`;
    let storedOtp = null;

    if (redis && typeof redis.get === 'function') {
      try {
        storedOtp = await redis.get(key);
        if (storedOtp) await redis.del(key);
      } catch (_err) {}
    }

    if (!storedOtp) {
      const entry = memoryMfaStore.get(key);
      if (entry && entry.expires > Date.now()) {
        storedOtp = entry.otp;
        memoryMfaStore.delete(key);
      }
    }

    return storedOtp === String(code).trim();
  }

  /**
   * Disable MFA for user and purge active/pending secrets
   */
  async disableMFA(userId) {
    if (redis && typeof redis.del === 'function') {
      try {
        await redis.del(`mfa:active:${userId}`);
        await redis.del(`mfa:pending:${userId}`);
      } catch (err) {
        logger.warn(`[MFA] Redis delete failed: ${err.message}`);
      }
    }
    memoryMfaStore.delete(`mfa:active:${userId}`);
    memoryMfaStore.delete(`mfa:pending:${userId}`);
    logger.info(`[MFA] Successfully disabled MFA for user ${userId}`);
    return { success: true, message: 'MFA successfully disabled' };
  }
}

module.exports = new MFAService();
