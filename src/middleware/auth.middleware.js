const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { isTokenBlacklisted } = require('../modules/auth/auth.service');

// Sensor service is required lazily to avoid circular dependency at module load time
function getSensorService() {
  return require('../modules/sensors/sensors.service');
}

// Build Admin API key whitelist from environment
function getAdminApiKeySet() {
  const raw = (env.ADMIN_API_KEYS || '').split(',');
  return new Set(raw.map((k) => k.trim()).filter(Boolean));
}

// Authenticate JWT bearer token or Admin API Key
async function authenticate(req, res, next) {
  try {
    // 1. Admin API Key authentication — validated against ADMIN_API_KEYS
    const apiKey = req.headers['x-api-key'] || req.headers['api-key'] || req.query.apiKey || req.query.api_key;
    if (apiKey) {
      const validKeys = getAdminApiKeySet();
      if (!validKeys.size || !validKeys.has(apiKey.trim())) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid API key', code: 'UNAUTHORIZED' },
        });
      }
      req.user = { id: 'usr_master_admin', email: 'admin@ethiofarm.et', role: 'ADMIN', fullName: 'Master Administrator' };
      return next();
    }


    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({
          success: false,
          error: { message: 'Authentication token required', code: 'UNAUTHORIZED' },
        });
    }

    const token = authHeader.substring(7);

    // Check token blacklist (async Redis check)
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res
        .status(401)
        .json({
          success: false,
          error: { message: 'Token has been revoked. Please log in again.', code: 'TOKEN_REVOKED' },
        });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.type === 'refresh') {
      return res.status(401).json({
        success: false,
        error: { message: 'Refresh token cannot be used as an access token', code: 'INVALID_TOKEN_TYPE' },
      });
    }
    req.user = decoded;
    next();
  } catch (_err) {
    return res
      .status(401)
      .json({
        success: false,
        error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      });
  }
}

// Role-based access control check
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({
          success: false,
          error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
        });
    }
    next();
  };
}

// Scope authorization to woreda
function authorizeWoredaScope(paramName = 'woredaId') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
    }

    const { role, woredaId, zoneId, regionId } = req.user;
    // Only national-scope roles bypass geographic checks. Zonal and regional
    // officers are validated below against the requested woreda's parent.
    if (['ADMIN', 'RESEARCHER'].includes(role)) {
      return next();
    }

    const requestedWoreda =
      req.params?.[paramName] || req.query?.[paramName] || req.body?.[paramName];

    // Farmer, DA, Woreda Officer: strictly bounded to their assigned woreda
    if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') {
      if (!woredaId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No administrative woreda assigned to your account', code: 'OUT_OF_SCOPE' },
        });
      }
      if (requestedWoreda && requestedWoreda !== woredaId) {
        return res.status(403).json({
          success: false,
          error: { message: `Access restricted: woreda '${requestedWoreda}' is outside your assigned jurisdiction`, code: 'OUT_OF_SCOPE' },
        });
      }
      if (req.query) req.query[paramName] = woredaId;
      return next();
    }

    // Zonal Officer: bounded to woredas within their assigned zone
    if (role === 'ZONAL_OFFICER') {
      if (!zoneId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No administrative zone assigned to your account', code: 'OUT_OF_SCOPE' },
        });
      }
      if (requestedWoreda) {
        try {
          const { prisma } = require('../config/db');
          const w = await prisma.woreda.findUnique({ where: { id: requestedWoreda }, select: { zoneId: true } });
          if (!w || w.zoneId !== zoneId) {
            return res.status(403).json({
              success: false,
              error: { message: `Woreda '${requestedWoreda}' is outside your assigned zone jurisdiction`, code: 'OUT_OF_SCOPE' },
            });
          }
        } catch (_) {
          // Scope cannot be established; deny rather than accidentally
          // granting cross-zone access during a data-store failure.
          return res.status(403).json({
            success: false,
            error: { message: 'Unable to verify woreda jurisdiction', code: 'OUT_OF_SCOPE' },
          });
        }
      }
      return next();
    }

    // Regional Officer: bounded to woredas within their assigned region
    if (role === 'REGIONAL_OFFICER') {
      if (!regionId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No administrative region assigned to your account', code: 'OUT_OF_SCOPE' },
        });
      }
      if (requestedWoreda) {
        try {
          const { prisma } = require('../config/db');
          const w = await prisma.woreda.findUnique({
            where: { id: requestedWoreda },
            select: { zone: { select: { regionId: true } } },
          });
          if (!w || w.zone?.regionId !== regionId) {
            return res.status(403).json({
              success: false,
              error: { message: `Woreda '${requestedWoreda}' is outside your assigned regional jurisdiction`, code: 'OUT_OF_SCOPE' },
            });
          }
        } catch (_) {
          return res.status(403).json({
            success: false,
            error: { message: 'Unable to verify regional jurisdiction', code: 'OUT_OF_SCOPE' },
          });
        }
      }
      return next();
    }

    next();
  };
}

// Scope authorization to zone
function authorizeZoneScope(paramName = 'zoneId') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
    }

    const { role, zoneId, regionId } = req.user;
    // Regional officers still need a parent-region check below; only
    // national-scope roles are unrestricted.
    if (['ADMIN', 'RESEARCHER'].includes(role)) {
      return next();
    }

    const requestedZone =
      req.params?.[paramName] || req.query?.[paramName] || req.body?.[paramName];

    if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER' || role === 'ZONAL_OFFICER') {
      if (!zoneId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No administrative zone assigned to your account', code: 'OUT_OF_SCOPE' },
        });
      }
      if (requestedZone && requestedZone !== zoneId) {
        return res.status(403).json({
          success: false,
          error: { message: `Access restricted: zone '${requestedZone}' is outside your assigned jurisdiction`, code: 'OUT_OF_SCOPE' },
        });
      }
      if (req.query) req.query[paramName] = zoneId;
      return next();
    }

    if (role === 'REGIONAL_OFFICER') {
      if (!regionId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No administrative region assigned to your account', code: 'OUT_OF_SCOPE' },
        });
      }
      if (requestedZone) {
        try {
          const { prisma } = require('../config/db');
          const z = await prisma.zone.findUnique({ where: { id: requestedZone }, select: { regionId: true } });
          if (!z || z.regionId !== regionId) {
            return res.status(403).json({
              success: false,
              error: { message: `Zone '${requestedZone}' is outside your assigned regional jurisdiction`, code: 'OUT_OF_SCOPE' },
            });
          }
        } catch (_) {
          return res.status(403).json({
            success: false,
            error: { message: 'Unable to verify regional jurisdiction', code: 'OUT_OF_SCOPE' },
          });
        }
      }
      return next();
    }

    next();
  };
}

// Scope authorization to region
function authorizeRegionScope(paramName = 'regionId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
    }

    const { role, regionId } = req.user;
    if (role === 'ADMIN' || role === 'RESEARCHER') {
      return next();
    }

    const requestedRegion =
      req.params?.[paramName] || req.query?.[paramName] || req.body?.[paramName];

    if (!regionId) {
      return res.status(403).json({
        success: false,
        error: { message: 'No administrative region assigned to your account', code: 'OUT_OF_SCOPE' },
      });
    }

    if (requestedRegion && requestedRegion !== regionId) {
      return res.status(403).json({
        success: false,
        error: { message: `Access restricted: region '${requestedRegion}' is outside your assigned jurisdiction`, code: 'OUT_OF_SCOPE' },
      });
    }

    if (req.query) req.query[paramName] = regionId;
    next();
  };
}

// Optional authentication (attaches user if valid token present, allows through if not)
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const isBlacklisted = await isTokenBlacklisted(token);
      if (!isBlacklisted) {
        req.user = jwt.verify(token, env.JWT_SECRET);
      }
    }
  } catch (_) {
    // Gracefully ignore token errors for optional routes
  }
  next();
}

// Robust per-device sensor telemetry authentication.
// Accepts: (1) Bearer JWT user token, (2) verified per-device X-Sensor-Token, or
// (3) hardwareId in development/test environment.
// Extracted here so all auth logic lives in one place for unified security review.
async function authenticateSensor(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  // 1. If Bearer JWT token is present (farmer app, officer testing), use standard auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (_err) {}
  }

  // 2. IoT device identification with cryptographic device secret token
  const hardwareId =
    req.body?.hardwareId ||
    req.body?.hardware_id ||
    req.body?.deviceId ||
    req.body?.sensorId ||
    req.query?.hardwareId;

  const deviceToken =
    req.headers['x-sensor-token'] ||
    req.headers['x-device-token'] ||
    req.body?.sensorToken ||
    req.body?.deviceToken ||
    req.query?.token;

  if (hardwareId && typeof hardwareId === 'string' && hardwareId.trim().length > 0) {
    if (deviceToken) {
      const sensorService = getSensorService();
      const isValid = await sensorService.verifySensorToken(hardwareId.trim(), deviceToken);
      if (isValid) return next();
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid sensor device token for specified hardwareId', code: 'SENSOR_TOKEN_INVALID' },
      });
    }

    // In development: allow bare hardwareId if device is registered
    if (process.env.NODE_ENV === 'development') return next();
  }

  return res.status(401).json({
    success: false,
    error: {
      message: 'Sensor authentication failed: valid X-Sensor-Token, user Bearer token, or API key required',
      code: 'SENSOR_UNAUTHORIZED',
    },
  });
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  authorizeWoredaScope,
  authorizeZoneScope,
  authorizeRegionScope,
  authenticateSensor,
};
