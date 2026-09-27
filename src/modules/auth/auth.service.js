const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/db');
const env = require('../../config/env');
const {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} = require('../../utils/errors');
const {
  sendPasswordResetEmail,
  sendVerificationEmail: _sendVerificationEmail,
} = require('../../delivery/email/emailDispatcher');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');
const {
  normalizeEthiopianPhone,
  getPhoneLookupVariants,
  formatPhoneForDisplay,
} = require('../../utils/phoneUtils');

// Helper to validate email format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeUser(user) {
  if (!user) return null;
  const {
    passwordHash: _passwordHash,
    resetPasswordToken: _resetPasswordToken,
    resetPasswordExpires: _resetPasswordExpires,
    verificationToken: _verificationToken,
    phoneVerificationToken: _phoneVerificationToken,
    phoneVerificationExpires: _phoneVerificationExpires,
    ...sanitized
  } = user;

  return {
    ...sanitized,
    email: sanitized.email || null,
    phoneNumber: sanitized.phoneNumber || null,
    fullName: sanitized.fullName,
    role: sanitized.role,
    regionId: sanitized.regionId || null,
    zoneId: sanitized.zoneId || null,
    woredaId: sanitized.woredaId || null,
    kebeleId: sanitized.kebeleId || null,
    kebeleName: sanitized.kebeleName || null,
    preferredLang: sanitized.preferredLang || 'en',
    isEmailVerified: Boolean(sanitized.isEmailVerified),
    isPhoneVerified: Boolean(sanitized.isPhoneVerified),
    createdAt: sanitized.createdAt,
    updatedAt: sanitized.updatedAt,
  };
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email || null,
      phoneNumber: user.phoneNumber || null,
      fullName: user.fullName,
      role: user.role,
      regionId: user.regionId || null,
      zoneId: user.zoneId || null,
      woredaId: user.woredaId || null,
      kebeleId: user.kebeleId || null,
      kebeleName: user.kebeleName || null,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN || '7d' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    env.JWT_REFRESH_SECRET || env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Distributed & In-Memory Hybrid Rate Limiting for Account Lockout
const loginAttemptsMap = new Map();
const resetAttemptsMap = new Map();
const phoneResendMap = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RESET_ATTEMPTS = 5;
const PHONE_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

async function _checkLoginLockout(identifier) {
  const cleanId = (identifier || '').toString().trim().toLowerCase();
  if (!cleanId) return;

  // 1. Check Redis distributed lockout if available
  try {
    if (redis && typeof redis.get === 'function') {
      const lockVal = await redis.get(`lockout:${cleanId}`);
      if (lockVal) {
        const lockedUntil = Number(lockVal);
        if (Date.now() < lockedUntil) {
          const remainingMin = Math.ceil((lockedUntil - Date.now()) / 60000);
          throw new UnauthorizedError(
            `Account temporarily locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`
          );
        }
      }
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
  }

  // 2. In-memory fallback
  const record = loginAttemptsMap.get(cleanId);
  if (!record) return;
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMin = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    throw new UnauthorizedError(
      `Account temporarily locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`
    );
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttemptsMap.delete(cleanId);
  }
}

async function _recordLoginFailure(identifier) {
  const cleanId = (identifier || '').toString().trim().toLowerCase();
  if (!cleanId) return;

  // In-memory update
  const record = loginAttemptsMap.get(cleanId) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    logger.warn(`[Auth Service] Account locked for 15 minutes after ${record.count} failed attempts: ${cleanId}`);
  }
  loginAttemptsMap.set(cleanId, record);

  // Redis distributed update (15m TTL)
  try {
    if (redis && typeof redis.incr === 'function') {
      const attempts = await redis.incr(`failed_attempts:${cleanId}`);
      if (attempts === 1) {
        await redis.expire(`failed_attempts:${cleanId}`, 900);
      }
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
        await redis.setex(`lockout:${cleanId}`, 900, lockedUntil.toString());
        logger.warn(`[Auth Service] Distributed Redis account locked for 15m: ${cleanId}`);
      }
    }
  } catch (_e) {
    // Non-blocking fallback
  }
}

async function _clearLoginFailure(identifier) {
  const cleanId = (identifier || '').toString().trim().toLowerCase();
  if (!cleanId) return;
  loginAttemptsMap.delete(cleanId);
  try {
    if (redis && typeof redis.del === 'function') {
      await redis.del(`failed_attempts:${cleanId}`, `lockout:${cleanId}`);
    }
  } catch (_e) {}
}

async function _checkResetAttempts(tokenKey) {
  const cleanKey = (tokenKey || '').toString().trim();
  if (!cleanKey) return;
  try {
    if (redis && typeof redis.get === 'function') {
      const val = await redis.get(`reset_attempts:${cleanKey}`);
      if (val && Number(val) >= MAX_RESET_ATTEMPTS) {
        throw new BadRequestError('Too many failed reset attempts. Please request a new code.');
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }
  const attempts = resetAttemptsMap.get(cleanKey) || 0;
  if (attempts >= MAX_RESET_ATTEMPTS) {
    throw new BadRequestError('Too many failed reset attempts. Please request a new code.');
  }
}

async function _recordResetFailure(tokenKey) {
  const cleanKey = (tokenKey || '').toString().trim();
  if (!cleanKey) return;
  const attempts = (resetAttemptsMap.get(cleanKey) || 0) + 1;
  resetAttemptsMap.set(cleanKey, attempts);
  try {
    if (redis && typeof redis.incr === 'function') {
      const c = await redis.incr(`reset_attempts:${cleanKey}`);
      if (c === 1) await redis.expire(`reset_attempts:${cleanKey}`, 600);
    }
  } catch (_e) {}
}

async function _clearResetAttempts(tokenKey) {
  const cleanKey = (tokenKey || '').toString().trim();
  if (!cleanKey) return;
  resetAttemptsMap.delete(cleanKey);
  try {
    if (redis && typeof redis.del === 'function') {
      await redis.del(`reset_attempts:${cleanKey}`);
    }
  } catch (_e) {}
}

/**
 * Register a new user
 */
async function registerUser({
  email,
  phoneNumber,
  phone,
  fullName,
  name,
  password,
  role = 'FARMER',
  regionId,
  zoneId,
  woredaId,
  kebeleId,
  kebeleName,
  preferredLang = 'en',
  deviceToken,
  fcmToken,
  staffIdNumber,
  organizationName,
  officialRole,
}) {
  const resolvedEmail = email && typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
  const rawPhone = (phoneNumber || phone || '').toString().trim() || null;
  const resolvedPhone = rawPhone ? (normalizeEthiopianPhone(rawPhone) || rawPhone) : null;
  const resolvedName = (fullName || name || '').toString().trim();
  const resolvedRole = (role || 'FARMER').toString().trim().toUpperCase();

  if (!resolvedEmail && !resolvedPhone) {
    throw new BadRequestError('Phone number or email address is required');
  }
  if (resolvedEmail && !isValidEmail(resolvedEmail)) {
    throw new BadRequestError('Invalid email format');
  }
  if (!resolvedName) {
    throw new BadRequestError('Full name is required');
  }
  if (!password || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long');
  }
  if (!/\d/.test(password)) {
    throw new BadRequestError('Password must contain at least one number');
  }

  // Enforce staff credentials for professional roles
  const requiresStaffCredentials = [
    'DEVELOPMENT_AGENT',
    'WOREDA_OFFICER',
    'ZONAL_OFFICER',
    'REGIONAL_OFFICER',
    'RESEARCHER',
    'ADMIN',
  ].includes(resolvedRole);

  if (requiresStaffCredentials) {
    const staffId = staffIdNumber || officialRole;
    const org = organizationName;
    if (!staffId || !org) {
      throw new BadRequestError(
        `Official Staff ID / Badge Number and Organization are required for '${resolvedRole}' registration.`
      );
    }
  }

  // Check if email already exists
  if (resolvedEmail) {
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: resolvedEmail, mode: 'insensitive' } },
    });
    if (existingEmail) {
      throw new ConflictError('User with this email already exists');
    }
  }

  // Check if phone already exists (checks all format variants, e.g. +251... vs 09...)
  if (resolvedPhone) {
    const variants = getPhoneLookupVariants(resolvedPhone);
    const existingPhone = await prisma.user.findFirst({
      where: {
        OR: variants.map((p) => ({ phoneNumber: p })),
      },
    });
    if (existingPhone) {
      throw new ConflictError('User with this phone number already exists');
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = `${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;

  let phoneVerificationCode = null;
  let phoneVerificationToken = null;
  let phoneVerificationExpires = null;

  if (resolvedPhone) {
    phoneVerificationCode = crypto.randomInt(100000, 999999).toString();
    phoneVerificationToken = crypto.createHash('sha256').update(phoneVerificationCode).digest('hex');
    phoneVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: resolvedEmail || (resolvedPhone ? `user_${resolvedPhone.replace(/[^0-9]/g, '')}@phone.ethiofarm.et` : null),
        phoneNumber: resolvedPhone || null,
        fullName: resolvedName,
        passwordHash,
        role: resolvedRole,
        regionId: (regionId && String(regionId).trim()) || null,
        zoneId: (zoneId && String(zoneId).trim()) || null,
        woredaId: (woredaId && String(woredaId).trim()) || null,
        kebeleId: (kebeleId && String(kebeleId).trim()) || null,
        kebeleName: (kebeleName && String(kebeleName).trim()) || null,
        preferredLang: (preferredLang && String(preferredLang).trim()) || 'en',
        deviceToken: (deviceToken && String(deviceToken).trim()) || null,
        fcmToken: (fcmToken && String(fcmToken).trim()) || null,
        verificationToken,
        isPhoneVerified: false,
        phoneVerificationToken,
        phoneVerificationExpires,
      },
      include: {
        region: { select: { id: true, code: true, nameEn: true, nameAm: true } },
        zone: { select: { id: true, nameEn: true, nameAm: true } },
        woreda: { select: { id: true, nameEn: true, nameAm: true } },
      },
    });
  } catch (dbErr) {
    if (dbErr.code === 'P2002') {
      const targetField = Array.isArray(dbErr.meta?.target) ? dbErr.meta.target.join(', ') : 'email or phone';
      throw new ConflictError(`User with this ${targetField} already exists`);
    }
    throw dbErr;
  }

  // Send verification email asynchronously if real email was provided (non-blocking)
  if (resolvedEmail && !resolvedEmail.includes('@phone.')) {
    setImmediate(async () => {
      try {
        await _sendVerificationEmail(resolvedEmail, verificationToken);
        logger.info(`[Auth Service] Verification email dispatched to ${resolvedEmail}`);
      } catch (emailErr) {
        logger.warn(`[Auth Service] Verification email notice: ${emailErr.message}`);
      }
    });
  }

  // Send phone verification OTP asynchronously if phone was provided (non-blocking)
  if (resolvedPhone && phoneVerificationCode) {
    phoneResendMap.set(resolvedPhone, Date.now());
    try {
      if (redis && typeof redis.setex === 'function') {
        redis.setex(`phone_cooldown:${resolvedPhone}`, 60, '1').catch(() => {});
      }
    } catch (_e) {}

    setImmediate(async () => {
      try {
        const { sendSms } = require('../../delivery/sms/smsEthiopiaClient');
        const smsText = `EthioFarm: Your registration verification code is ${phoneVerificationCode}. Valid for 10 minutes. Do not share this code.`;
        await sendSms([resolvedPhone], smsText);
        logger.info(`[Auth Service] Phone verification SMS OTP dispatched to ${resolvedPhone}`);
      } catch (smsErr) {
        logger.warn(`[Auth Service] Phone verification SMS notice: ${smsErr.message}`);
      }
    });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    user: sanitizeUser(user),
    token: accessToken,
    accessToken,
    refreshToken,
    requiresPhoneVerification: Boolean(resolvedPhone && !user.isPhoneVerified),
    ...(process.env.NODE_ENV === 'test' && phoneVerificationCode ? { phoneVerificationCode } : {}),
  };
}

/**
 * Log in an existing user
 */
/**
 * Log in an existing user
 */
async function loginUser({ email, phoneNumber, phone, identifier, password }) {
  const rawIdentifier = (phoneNumber || phone || identifier || email || '').toString().trim();
  if (!rawIdentifier) {
    throw new BadRequestError('Phone number or email address is required');
  }
  if (!password) {
    throw new BadRequestError('Password is required');
  }

  const isEmail = rawIdentifier.includes('@');
  const canonicalPhone = !isEmail ? (normalizeEthiopianPhone(rawIdentifier) || rawIdentifier) : null;
  const normalizedIdentifier = isEmail ? rawIdentifier.toLowerCase() : canonicalPhone;

  await _checkLoginLockout(normalizedIdentifier);
  if (!isEmail && canonicalPhone !== rawIdentifier) {
    await _checkLoginLockout(rawIdentifier);
  }

  const includeRelations = {
    region: { select: { id: true, code: true, nameEn: true, nameAm: true } },
    zone: { select: { id: true, nameEn: true, nameAm: true } },
    woreda: { select: { id: true, nameEn: true, nameAm: true } },
  };

  let user = null;
  if (isEmail) {
    user = await prisma.user.findFirst({
      where: { email: { equals: normalizedIdentifier, mode: 'insensitive' } },
      include: includeRelations,
    });
  } else {
    const variants = getPhoneLookupVariants(rawIdentifier);
    user = await prisma.user.findFirst({
      where: {
        OR: variants.map((p) => ({ phoneNumber: p })),
      },
      include: includeRelations,
    });
  }

  if (!user) {
    await _recordLoginFailure(normalizedIdentifier);
    throw new UnauthorizedError(isEmail ? 'Invalid email or password' : 'Invalid phone number or password');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash || '').catch(() => false);
  if (!isMatch) {
    await _recordLoginFailure(normalizedIdentifier);
    throw new UnauthorizedError(isEmail ? 'Invalid email or password' : 'Invalid phone number or password');
  }

  // Clear failed login attempts on success
  await _clearLoginFailure(normalizedIdentifier);
  if (!isEmail && canonicalPhone !== rawIdentifier) {
    await _clearLoginFailure(rawIdentifier);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    user: sanitizeUser(user),
    token: accessToken,
    accessToken,
    refreshToken,
  };
}

/**
 * Request Password Reset OTP (with SHA-256 OTP hashing)
 */
async function requestPasswordReset(identifierOrPayload) {
  let rawIdentifier = '';
  if (typeof identifierOrPayload === 'string') {
    rawIdentifier = identifierOrPayload.trim();
  } else if (identifierOrPayload && typeof identifierOrPayload === 'object') {
    rawIdentifier = (
      identifierOrPayload.phoneNumber ||
      identifierOrPayload.phone ||
      identifierOrPayload.identifier ||
      identifierOrPayload.email ||
      ''
    ).toString().trim();
  }

  if (!rawIdentifier) {
    throw new BadRequestError('Phone number or email is required');
  }

  const isEmail = rawIdentifier.includes('@');
  const normalizedEmail = isEmail ? rawIdentifier.toLowerCase() : null;
  const canonicalPhone = !isEmail ? (normalizeEthiopianPhone(rawIdentifier) || rawIdentifier) : null;

  let user = null;
  if (isEmail) {
    user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
  } else if (canonicalPhone) {
    const variants = getPhoneLookupVariants(canonicalPhone);
    user = await prisma.user.findFirst({
      where: {
        OR: variants.map((p) => ({ phoneNumber: p })),
      },
    });
  }

  // Generate a secure 6-digit numeric OTP code with 5-minute validation
  const rawOtp = crypto.randomInt(100000, 999999).toString();
  // SHA-256 hash stored in DB for defense-in-depth against db snapshot leaks
  const tokenHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  const AUTH_VALIDATION_TTL_MS = 5 * 60 * 1000;
  const resetExpires = new Date(Date.now() + AUTH_VALIDATION_TTL_MS);

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: resetExpires,
      },
    });

    logger.info(`[Auth Service] Password reset OTP generated for ${user.email || user.phoneNumber} (valid 5 min)`);

    // Dispatch via Email if real email exists
    if (user.email && !user.email.includes('@phone.')) {
      setImmediate(async () => {
        try {
          const resetLink = `${env.APP_URL}/reset-password?token=${rawOtp}&email=${encodeURIComponent(user.email)}`;
          await sendPasswordResetEmail(user.email, rawOtp, resetLink);
          logger.info(`[Auth Service] Password reset email dispatched to ${user.email}`);
        } catch (emailErr) {
          logger.warn(`[Auth Service] Password reset email notice: ${emailErr.message}`);
        }
      });
    }

    // Dispatch via SMS if phone number exists (using normalized recipient)
    if (user.phoneNumber) {
      setImmediate(async () => {
        try {
          const { sendSms } = require('../../delivery/sms/smsEthiopiaClient');
          const destinationPhone = normalizeEthiopianPhone(user.phoneNumber) || user.phoneNumber;
          const smsText = `EthioFarm: Your 6-digit password reset OTP is ${rawOtp}. Valid for 5 minutes. Do not share this code with anyone.`;
          await sendSms([destinationPhone], smsText);
          logger.info(`[Auth Service] Password reset SMS dispatched to ${destinationPhone}`);
        } catch (smsErr) {
          logger.warn(`[Auth Service] Password reset SMS notice: ${smsErr.message}`);
        }
      });
    }
  }

  return {
    message: 'If an account matches that identifier, a password reset code has been sent.',
    expiresInSeconds: 300,
    ...(process.env.NODE_ENV === 'test' && {
      token: rawOtp,
      resetLink: `${env.APP_URL}/reset-password?token=${rawOtp}`,
    }),
  };
}

const forgotPassword = requestPasswordReset;

/**
 * Reset password with OTP code (supports SHA-256 hashed token with backward compatibility)
 */
async function resetPassword({ token, resetToken, code, resetCode, newPassword, password } = {}) {
  const resolvedToken = (token || resetToken || code || resetCode || '').toString().trim();
  const resolvedPassword = (newPassword || password || '').toString();

  if (!resolvedToken) {
    throw new BadRequestError('Password reset code is required');
  }
  if (!resolvedPassword || resolvedPassword.length < 8) {
    throw new BadRequestError('New password must be at least 8 characters long');
  }
  if (!/\d/.test(resolvedPassword)) {
    throw new BadRequestError('New password must contain at least one number');
  }

  const tokenHash = crypto.createHash('sha256').update(resolvedToken).digest('hex');

  await _checkResetAttempts(resolvedToken);
  await _checkResetAttempts(tokenHash);

  // Search by either SHA-256 hash or plain token (for seamless backward-compatibility)
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { resetPasswordToken: tokenHash },
        { resetPasswordToken: resolvedToken },
      ],
      resetPasswordExpires: { gt: new Date() },
    },
  });

  if (!user) {
    await _recordResetFailure(resolvedToken);
    await _recordResetFailure(tokenHash);
    throw new BadRequestError('Password reset code is invalid or has expired');
  }

  await _clearResetAttempts(resolvedToken);
  await _clearResetAttempts(tokenHash);

  const newHash = await bcrypt.hash(resolvedPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    }),
    prisma.userSession.deleteMany({
      where: { userId: user.id },
    }),
    prisma.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_COMPLETED',
        adminEmail: user.email || user.phoneNumber,
        details: `Password reset successfully completed for user ${user.id}`,
      },
    }),
  ]);

  return {
    message: 'Password has been reset successfully. You can now log in with your new password.',
  };
}

/**
 * Request direct passwordless login OTP via SMS
 */
async function requestLoginOtp(phoneNumberOrPayload) {
  let rawPhone = '';
  if (typeof phoneNumberOrPayload === 'string') {
    rawPhone = phoneNumberOrPayload.trim();
  } else if (phoneNumberOrPayload && typeof phoneNumberOrPayload === 'object') {
    rawPhone = (phoneNumberOrPayload.phoneNumber || phoneNumberOrPayload.phone || phoneNumberOrPayload.identifier || '').toString().trim();
  }

  if (!rawPhone) {
    throw new BadRequestError('Phone number is required');
  }

  const canonicalPhone = normalizeEthiopianPhone(rawPhone) || rawPhone;
  const variants = getPhoneLookupVariants(canonicalPhone);

  await _checkLoginLockout(canonicalPhone);

  let user = await prisma.user.findFirst({
    where: {
      OR: variants.map((p) => ({ phoneNumber: p })),
    },
  });

  // Auto-onboard grassroots farmers if not yet registered
  if (!user) {
    const placeholderEmail = `farmer_${canonicalPhone.replace(/[^0-9]/g, '')}@phone.ethiofarm.et`;
    user = await prisma.user.create({
      data: {
        phoneNumber: canonicalPhone,
        fullName: `Farmer (${formatPhoneForDisplay(canonicalPhone)})`,
        email: placeholderEmail,
        role: 'FARMER',
        preferredLang: 'am',
      },
    });
    logger.info(`[Auth Service] Auto-onboarded new FARMER via Phone OTP: ${canonicalPhone}`);
  }

  const rawOtp = crypto.randomInt(100000, 999999).toString();
  const tokenHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  const AUTH_VALIDATION_TTL_MS = 5 * 60 * 1000;
  const resetExpires = new Date(Date.now() + AUTH_VALIDATION_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: resetExpires,
    },
  });

  // Dispatch SMS
  setImmediate(async () => {
    try {
      const { sendSms } = require('../../delivery/sms/smsEthiopiaClient');
      const smsText = `EthioFarm: Your login verification code is ${rawOtp}. Valid for 5 minutes. Do not share this code.`;
      await sendSms([canonicalPhone], smsText);
      logger.info(`[Auth Service] Login OTP SMS dispatched to ${canonicalPhone}`);
    } catch (smsErr) {
      logger.warn(`[Auth Service] Login OTP SMS notice: ${smsErr.message}`);
    }
  });

  return {
    message: 'Login code sent via SMS to your phone.',
    phoneNumber: formatPhoneForDisplay(canonicalPhone),
    expiresInSeconds: 300,
    ...(process.env.NODE_ENV === 'test' && { code: rawOtp }),
  };
}

/**
 * Verify direct passwordless login OTP and return JWT session
 */
async function verifyLoginOtp({ phoneNumber, phone, code, otp } = {}) {
  const rawPhone = (phoneNumber || phone || '').toString().trim();
  const rawCode = (code || otp || '').toString().trim();

  if (!rawPhone || !rawCode) {
    throw new BadRequestError('Phone number and 6-digit verification code are required');
  }

  const canonicalPhone = normalizeEthiopianPhone(rawPhone) || rawPhone;
  const variants = getPhoneLookupVariants(canonicalPhone);
  const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

  await _checkLoginLockout(canonicalPhone);
  await _checkResetAttempts(`login_otp:${canonicalPhone}`);

  const user = await prisma.user.findFirst({
    where: {
      OR: variants.map((p) => ({ phoneNumber: p })),
      AND: [
        {
          OR: [
            { resetPasswordToken: codeHash },
            { resetPasswordToken: rawCode },
          ],
        },
        {
          resetPasswordExpires: { gt: new Date() },
        },
      ],
    },
  });

  if (!user) {
    await _recordLoginFailure(canonicalPhone);
    await _recordResetFailure(`login_otp:${canonicalPhone}`);
    throw new UnauthorizedError('Invalid or expired verification code');
  }

  // Clear counters and consumed OTP token
  await _clearLoginFailure(canonicalPhone);
  await _clearResetAttempts(`login_otp:${canonicalPhone}`);

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: null,
        resetPasswordExpires: null,
        isPhoneVerified: true,
        lastLoginAt: new Date(),
      },
      include: {
        region: { select: { id: true, code: true, nameEn: true, nameAm: true } },
        zone: { select: { id: true, nameEn: true, nameAm: true } },
        woreda: { select: { id: true, nameEn: true, nameAm: true } },
      },
    }),
    prisma.loginAttempt.create({
      data: {
        userId: user.id,
        identifier: canonicalPhone,
        success: true,
      },
    }),
  ]);

  const accessToken = generateAccessToken(updatedUser);
  const refreshToken = generateRefreshToken(updatedUser);

  return {
    user: sanitizeUser(updatedUser),
    token: accessToken,
    accessToken,
    refreshToken,
    message: 'Login successful via phone verification.',
  };
}

/**
 * Verify Email with Verification Token
 */
async function verifyEmail(token) {
  if (!token) {
    throw new BadRequestError('Verification token is required');
  }

  const user = await prisma.user.findFirst({
    where: { verificationToken: token },
  });

  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  const tokenParts = token.split('_');
  if (tokenParts.length >= 2) {
    const tokenTimestamp = parseInt(tokenParts[tokenParts.length - 1], 10);
    const maxAgeMs = 24 * 60 * 60 * 1000;
    if (!isNaN(tokenTimestamp) && Date.now() - tokenTimestamp > maxAgeMs) {
      throw new BadRequestError('Verification token has expired. Please request a new verification email.');
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'EMAIL_VERIFIED',
        adminEmail: user.email || user.phoneNumber,
        details: `User ${user.id} verified email address`,
      },
    }),
  ]);

  return {
    message: 'Email address verified successfully',
  };
}

/**
 * Resend Email Verification Link
 */
async function resendVerificationEmail(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    throw new BadRequestError('A valid email address is required');
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (!user) {
    return { message: 'If an account with this email exists, a verification link has been sent.' };
  }

  if (user.isEmailVerified) {
    return { message: 'This email address is already verified.' };
  }

  const newToken = `${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;
  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: newToken },
  });

  setImmediate(async () => {
    try {
      await _sendVerificationEmail(user.email, newToken);
      logger.info(`[Auth Service] Verification email resent to ${user.email}`);
    } catch (emailErr) {
      logger.warn(`[Auth Service] Resend verification email failed: ${emailErr.message}`);
    }
  });

  return {
    message: 'A new verification link has been sent to your email address.',
  };
}

const localBlacklist = new Set();

async function logout(token) {
  if (token) localBlacklist.add(token);
  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0 && redis && typeof redis.setex === 'function') {
          await redis.setex(`blacklist:${token}`, ttl, '1');
        }
      }
    } catch (err) {
      logger.warn(`[Auth Service] Failed to blacklist token: ${err.message}`);
    }
  }
  return { message: 'Logged out successfully' };
}

async function logoutUser(accessToken, refreshToken) {
  const promises = [];
  if (accessToken) promises.push(logout(accessToken));
  if (refreshToken) promises.push(logout(refreshToken));
  await Promise.all(promises);
  return { message: 'Logged out successfully' };
}

async function isTokenBlacklisted(token) {
  if (token && localBlacklist.has(token)) return true;
  if (!token) return false;
  try {
    if (redis && typeof redis.get === 'function') {
      const result = await redis.get(`blacklist:${token}`);
      return result !== null;
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(`[SECURITY ALERT] Redis token blacklist check failed in production: ${err.message}`);
    } else {
      logger.warn(`[Auth Service] Redis blacklist check failed: ${err.message}`);
    }
  }
  return false;
}

/**
 * Refresh access token with token rotation & blacklist protection
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new BadRequestError('Refresh token is required');
  }

  // Check if refresh token has been revoked
  if (await isTokenBlacklisted(refreshToken)) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  let decoded;
  try {
    // Try separate refresh secret first
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET || env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');
  } catch (err) {
    // Graceful backward compatibility fallback to JWT_SECRET
    try {
      decoded = jwt.verify(refreshToken, env.JWT_SECRET);
      if (decoded.type !== 'refresh') throw new Error('Invalid token type');
    } catch (_fallbackErr) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    throw new UnauthorizedError('User account not found');
  }

  // Token Rotation (M4): Invalidate the consumed refresh token
  await logout(refreshToken);

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  return {
    token: newAccessToken,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: sanitizeUser(user),
  };
}

async function getUserProfile(userId) {
  if (!userId) throw new BadRequestError('User ID required');

  if (userId === 'usr_master_admin' || userId === 'usr_admin_apikey' || userId === 'usr_master_console') {
    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'abraham.tiruneh7@gmail.com' },
          { email: 'admin@ethiofarm.et' },
          { role: 'ADMIN' },
        ],
      },
      include: {
        region: true,
        zone: true,
        woreda: true,
        kebele: true,
      },
    });
    if (adminUser) return sanitizeUser(adminUser);

    return {
      id: userId,
      email: 'abraham.tiruneh7@gmail.com',
      fullName: 'Abraham Tiruneh (Administrator)',
      role: 'ADMIN',
      isEmailVerified: true,
      isPhoneVerified: true,
      createdAt: new Date().toISOString(),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      region: true,
      zone: true,
      woreda: true,
      kebele: true,
    },
  });

  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  return sanitizeUser(user);
}

async function updatePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw new BadRequestError('Current and new passwords required');
  }
  if (newPassword.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long');
  }
  if (!/\d/.test(newPassword)) {
    throw new BadRequestError('Password must contain at least one number');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash || '');
  if (!valid) {
    throw new UnauthorizedError('Current password incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    }),
    prisma.userSession.deleteMany({
      where: { userId },
    }),
    prisma.auditLog.create({
      data: {
        action: 'PASSWORD_UPDATED',
        adminEmail: user.email || user.phoneNumber,
        details: `User ${userId} updated their password`,
      },
    }),
  ]);

  return true;
}

async function updateUserProfile(userId, data = {}) {
  if (!userId) throw new BadRequestError('User ID required');

  const allowedFields = [
    'fullName',
    'preferredLang',
    'role',
    'deviceToken',
    'fcmToken',
    'regionId',
    'zoneId',
    'woredaId',
    'kebeleId',
    'kebeleName',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  if (data.token && !updateData.deviceToken) {
    updateData.deviceToken = data.token;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    include: {
      region: true,
      zone: true,
      woreda: true,
    },
  });

  return sanitizeUser(user);
}

/**
 * Verify Phone Ownership OTP for user sign-up
 */
async function verifyPhoneOtp({ phoneNumber, phone, code, otp } = {}) {
  const rawPhone = (phoneNumber || phone || '').toString().trim();
  const rawCode = (code || otp || '').toString().trim();

  if (!rawPhone || !rawCode) {
    throw new BadRequestError('Phone number and 6-digit verification code are required');
  }

  const canonicalPhone = normalizeEthiopianPhone(rawPhone) || rawPhone;
  const variants = getPhoneLookupVariants(canonicalPhone);
  const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

  await _checkLoginLockout(canonicalPhone);
  await _checkResetAttempts(`phone_verify:${canonicalPhone}`);

  const user = await prisma.user.findFirst({
    where: {
      OR: variants.map((p) => ({ phoneNumber: p })),
      AND: [
        {
          OR: [
            { phoneVerificationToken: codeHash },
            { phoneVerificationToken: rawCode },
          ],
        },
        {
          phoneVerificationExpires: { gt: new Date() },
        },
      ],
    },
  });

  if (!user) {
    await _recordResetFailure(`phone_verify:${canonicalPhone}`);
    throw new BadRequestError('Invalid or expired phone verification code');
  }

  // Clear counters on successful verification
  await _clearResetAttempts(`phone_verify:${canonicalPhone}`);

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        isPhoneVerified: true,
        phoneVerificationToken: null,
        phoneVerificationExpires: null,
      },
      include: {
        region: true,
        zone: true,
        woreda: true,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'PHONE_VERIFIED',
        adminEmail: user.phoneNumber || user.email,
        details: `User ${user.id} verified phone number ${canonicalPhone}`,
      },
    }),
  ]);

  const accessToken = generateAccessToken(updatedUser);
  const refreshToken = generateRefreshToken(updatedUser);

  return {
    message: 'Phone number verified successfully.',
    user: sanitizeUser(updatedUser),
    token: accessToken,
    accessToken,
    refreshToken,
  };
}

/**
 * Resend Phone Verification OTP with 60-second cooldown
 */
async function resendPhoneOtp(phoneNumberOrPayload) {
  let rawPhone = '';
  if (typeof phoneNumberOrPayload === 'string') {
    rawPhone = phoneNumberOrPayload.trim();
  } else if (phoneNumberOrPayload && typeof phoneNumberOrPayload === 'object') {
    rawPhone = (phoneNumberOrPayload.phoneNumber || phoneNumberOrPayload.phone || '').toString().trim();
  }

  if (!rawPhone) {
    throw new BadRequestError('Phone number is required');
  }

  const canonicalPhone = normalizeEthiopianPhone(rawPhone) || rawPhone;
  const variants = getPhoneLookupVariants(canonicalPhone);

  // 1. Check 60-second cooldown (Redis distributed + in-memory)
  const cooldownKey = `phone_cooldown:${canonicalPhone}`;
  try {
    if (redis && typeof redis.get === 'function') {
      const remainingTtl = await redis.ttl(cooldownKey);
      if (remainingTtl > 0) {
        throw new BadRequestError(`Please wait ${remainingTtl} second(s) before requesting another code.`);
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }

  const lastSent = phoneResendMap.get(canonicalPhone) || 0;
  const elapsed = Date.now() - lastSent;
  if (elapsed < PHONE_RESEND_COOLDOWN_MS) {
    const remainingSec = Math.ceil((PHONE_RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new BadRequestError(`Please wait ${remainingSec} second(s) before requesting another code.`);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: variants.map((p) => ({ phoneNumber: p })),
    },
  });

  if (!user) {
    return {
      message: 'If an account with this phone number exists, a verification code has been sent.',
      cooldownSeconds: 60,
    };
  }

  if (user.isPhoneVerified) {
    return {
      message: 'This phone number is already verified.',
      alreadyVerified: true,
    };
  }

  const rawOtp = crypto.randomInt(100000, 999999).toString();
  const tokenHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerificationToken: tokenHash,
      phoneVerificationExpires: expires,
    },
  });

  // Set cooldown in memory and Redis
  phoneResendMap.set(canonicalPhone, Date.now());
  try {
    if (redis && typeof redis.setex === 'function') {
      await redis.setex(cooldownKey, 60, '1');
    }
  } catch (_e) {}

  // Dispatch SMS
  setImmediate(async () => {
    try {
      const { sendSms } = require('../../delivery/sms/smsEthiopiaClient');
      const smsText = `EthioFarm: Your new registration verification code is ${rawOtp}. Valid for 10 minutes.`;
      await sendSms([canonicalPhone], smsText);
      logger.info(`[Auth Service] Resent phone verification SMS OTP to ${canonicalPhone}`);
    } catch (smsErr) {
      logger.warn(`[Auth Service] Resend phone verification SMS notice: ${smsErr.message}`);
    }
  });

  return {
    message: 'A new verification code has been sent via SMS.',
    phoneNumber: formatPhoneForDisplay(canonicalPhone),
    expiresInSeconds: 600,
    cooldownSeconds: 60,
    ...(process.env.NODE_ENV === 'test' && { code: rawOtp }),
  };
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logout,
  logoutUser,
  generateAccessToken,
  generateRefreshToken,
  getUserProfile,
  updateUserProfile,
  updatePassword,
  isTokenBlacklisted,
  requestLoginOtp,
  verifyLoginOtp,
  verifyPhoneOtp,
  resendPhoneOtp,
};
