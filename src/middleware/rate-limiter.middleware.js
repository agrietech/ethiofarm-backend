const redis = require('../config/redis');
const logger = require('../utils/logger');
const { RateLimitError } = require('../utils/errors');
const ApiResponse = require('../utils/apiResponse');

// In-memory sliding window store fallback
const memoryStore = new Map();

// Periodic cleanup of memory store (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

/**
 * Creates a rate limiting middleware supporting Redis with in-memory failover.
 * @param {Object} options
 * @param {number} options.windowMs Window duration in milliseconds (default 60,000ms = 1 min)
 * @param {number} options.max Maximum allowed requests in window (default 100)
 * @param {string} options.prefix Key prefix for Redis / Memory store
 * @param {Function} options.keyGenerator Key generator function (default: IP based)
 * @param {string} options.message Custom error message on rate limit exceed
 */
function createRateLimiter({
  windowMs = 60 * 1000,
  max = 100,
  prefix = 'rl:global',
  keyGenerator = (req) =>
    req.ip || req.socket?.remoteAddress || 'unknown_ip',
  message = 'Too many requests from this IP, please try again later.',
} = {}) {
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    // Bypass rate limiting if disabled globally
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    // Bypass in local test environment unless explicitly testing rate limits
    if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_TEST_RATELIMIT) {
      return next();
    }

    // Bypass for authenticated E2E test runners in deployment/staging
    const testKeyHeader = req.headers['x-e2e-test-key'] || req.headers['x-test-bypass-secret'];
    const configuredSecret = process.env.E2E_TEST_SECRET || process.env.TEST_API_KEY;
    if (testKeyHeader && configuredSecret && testKeyHeader === configuredSecret) {
      return next();
    }

    const clientIdentifier = keyGenerator(req);
    const key = `${prefix}:${clientIdentifier}`;
    const now = Date.now();

    let currentHits = 0;
    let ttlSeconds = windowSec;

    const isRedisReady = redis && typeof redis.isConnected === 'function' && redis.isConnected();

    if (isRedisReady) {
      try {
        // Multi-command atomic increment + expire
        const results = await redis.multi().incr(key).ttl(key).exec();
        currentHits = results[0][1];
        const existingTtl = results[1][1];

        if (existingTtl === -1 || currentHits === 1) {
          await redis.expire(key, windowSec);
          ttlSeconds = windowSec;
        } else {
          ttlSeconds = Math.max(1, existingTtl);
        }
      } catch (err) {
        logger.warn(`[RateLimiter] Redis error, falling back to memory store: ${err.message}`);
        currentHits = handleMemoryRateLimit(key, now, windowMs);
      }
    } else {
      currentHits = handleMemoryRateLimit(key, now, windowMs);
    }

    const remaining = Math.max(0, max - currentHits);
    const resetTime = new Date(now + ttlSeconds * 1000).toUTCString();

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (currentHits > max) {
      res.setHeader('Retry-After', ttlSeconds);
      logger.warn(`[RateLimiter] Rate limit exceeded for ${key} (${currentHits}/${max})`);

      const error = new RateLimitError(message, {
        limit: max,
        current: currentHits,
        retryAfterSeconds: ttlSeconds,
      });

      return ApiResponse.error(res, {
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: error.message,
        details: error.details,
      });
    }

    next();
  };
}

function handleMemoryRateLimit(key, now, windowMs) {
  if (memoryStore.size > 5000) {
    memoryStore.clear();
  }
  let record = memoryStore.get(key);
  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    memoryStore.set(key, record);
    return 1;
  }

  record.count += 1;
  return record.count;
}

const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  prefix: 'rl:global',
  message: 'General API request limit reached. Please slow down.',
});

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: 'rl:auth',
  message: 'Too many authentication attempts. Please try again after 1 minute.',
});

const ussdLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  prefix: 'rl:ussd',
  message: 'USSD request rate limit exceeded.',
});

const telemetryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  prefix: 'rl:telemetry',
  message: 'Telemetry ingestion rate limit exceeded.',
});

// Per-user auth limiter (account-based lockout)
const userAuthLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  prefix: 'rl:auth:user',
  keyGenerator: (req) => {
    const identifier = req.body.email || req.body.phoneNumber || req.body.identifier || req.body.phone;
    return `user:${identifier ? String(identifier).toLowerCase().trim() : req.ip}`;
  },
  message: 'Too many login attempts for this account. Please try again in 15 minutes.',
});

// AI & disease diagnosis limiter — prevents external API cost abuse (20 req/min)
const aiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: 'rl:ai',
  message: 'AI request limit reached (20/min). Please wait before sending more requests.',
});

module.exports = {
  createRateLimiter,
  globalLimiter,
  authLimiter,
  ussdLimiter,
  telemetryLimiter,
  userAuthLimiter,
  aiLimiter,
};
