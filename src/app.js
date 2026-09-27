const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const env = require('./config/env');
const errorHandler = require('./middleware/error-handler.middleware');
const requestLogger = require('./middleware/request-logger.middleware');
const auditLogger = require('./middleware/audit-logger.middleware');
const { correlationIdMiddleware, sanitizeInput, requestTimeout } = require('./middleware/security.middleware');
const {
  globalLimiter,
  authLimiter,
  ussdLimiter,
  telemetryLimiter,
  aiLimiter,
} = require('./middleware/rate-limiter.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const boundariesRoutes = require('./modules/boundaries/boundaries.routes');
const farmsRoutes = require('./modules/farms/farms.routes');
const sensorsRoutes = require('./modules/sensors/sensors.routes');
const satelliteRoutes = require('./modules/satelliteObservations/satelliteObservations.routes');
const riskAssessmentsRoutes = require('./modules/riskAssessments/riskAssessments.routes');
const alertsRoutes = require('./modules/alerts/alerts.routes');
const advisoriesRoutes = require('./modules/advisories/advisories.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const diseaseRoutes = require('./modules/diseaseDiagnosis/diseaseDiagnosis.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const aiRoutes = require('./modules/ai/aiVoice.routes');
const ingestionRoutes = require('./ingestion/ingestion.routes');
const ussdRoutes = require('./delivery/ussd/ussd.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const mediaRoutes = require('./modules/media/media.routes');
const roleRequestRoutes = require('./modules/roleRequest/roleRequest.routes');
const weatherRoutes = require('./modules/weather/weather.routes');
const cropProtectionRoutes = require('./modules/cropProtection/cropProtection.routes');
const hazardsRoutes = require('./modules/hazards/hazards.routes');
const animalHealthRoutes = require('./modules/animalHealth/animalHealth.routes');
const dashboardsRoutes = require('./modules/dashboards/dashboard.routes');
const { isConnected } = require('./config/db');


const app = express();
app.set('trust proxy', 1);

const crypto = require('crypto');

// Generate per-request cryptographically secure nonce for CSP
app.use((_req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

const supabaseHost = env.SUPABASE_URL
  ? new URL(env.SUPABASE_URL).origin
  : 'https://uhktbbeqqdsfkooyrgmq.supabase.co';

// Robust Content Security Policy (CSP) & HTTP security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://unpkg.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          supabaseHost,
          'https://*.tile.openstreetmap.org',
          'https://unpkg.com',
        ],
        mediaSrc: [
          "'self'",
          'data:',
          'blob:',
          supabaseHost,
        ],
        connectSrc: [
          "'self'",
          supabaseHost,
          'https://openrouter.ai',
          'https://api.plant.id',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(requestTimeout(60)); // 60 second default timeout for requests


// Configurable CORS whitelist
const rawOrigins = Array.isArray(env.CORS_ORIGIN)
  ? env.CORS_ORIGIN
  : (typeof env.CORS_ORIGIN === 'string' ? env.CORS_ORIGIN.split(',') : ['*']);

const configuredOrigins = rawOrigins
  .map((o) => (typeof o === 'string' ? o.trim() : String(o)))
  .filter(Boolean);

const isWildcardOrigin = configuredOrigins.includes('*');

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, native clients)
    if (!origin) return callback(null, true);
    if (isWildcardOrigin) return callback(null, true);
    if (configuredOrigins.includes(origin)) return callback(null, true);

    // Support any localhost / 127.0.0.1 port for Flutter Web and local development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Support any onrender.com deployment (backend, web client, staging)
    if (/^https:\/\/([a-zA-Z0-9-]+\.)?onrender\.com$/.test(origin)) {
      return callback(null, true);
    }

    // Safely deny without unhandled exception
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'X-Correlation-Id',
    'x-api-key',
    'x-sensor-api-key',
    'x-sensor-token',
    'x-device-token',
    'Origin',
    'Cache-Control',
  ],
  exposedHeaders: ['X-Correlation-Id'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
// Explicit preflight handling
app.options('*', cors(corsOptions));
app.use(compression());
app.use(requestLogger);
app.use(auditLogger);
app.use(correlationIdMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
const path = require('path');
app.use(
  '/uploads',
  require('./middleware/auth.middleware').authenticate,
  express.static(path.resolve(__dirname, '../uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Global rate limiter
app.use(globalLimiter);

// Health check handlers
const healthHandler = (_req, res) => {
  const memUsage = process.memoryUsage();
  const dbUp = isConnected();
  const redis = require('./config/redis');
  const redisUp = redis && typeof redis.isConnected === 'function' ? redis.isConnected() : false;
  const overallStatus = dbUp ? (redisUp ? 'UP' : 'DEGRADED') : 'DOWN';

  res.status(dbUp ? 200 : 503).json({
    status: overallStatus,
    service: 'EthioFarm Smart Farming Backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    system: {
      memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      platform: process.platform,
      nodeVersion: process.version,
    },
    dependencies: {
      database: dbUp ? 'UP' : 'DOWN',
      redis: redisUp ? 'UP' : 'DOWN',
    },
  });
};

const livenessHandler = (_req, res) => {
  res.status(200).json({ status: 'LIVE', timestamp: new Date().toISOString() });
};

const readinessHandler = (_req, res) => {
  const dbReady = isConnected();
  res.status(dbReady ? 200 : 503).json({
    database: dbReady ? 'UP' : 'DOWN',
    ready: dbReady,
    timestamp: new Date().toISOString(),
  });
};

// Health check – comprehensive (root & /api/v1)
app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// Liveness probe (root & /api/v1)
app.get('/health/liveness', livenessHandler);
app.get('/api/v1/health/liveness', livenessHandler);

// Readiness probe (root & /api/v1)
app.get('/health/readiness', readinessHandler);
app.get('/api/v1/health/readiness', readinessHandler);

// API root metadata
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      project: 'EthioFarm Smart Farming Platform',
      version: '1.0.0',
      status: 'ONLINE',
      docs: '/api/v1',
      admin: '/admin/dashboard',
    },
  });
});

// API v1 root catalog index
app.get('/api/v1', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'EthioFarm Smart Farming Platform API',
      version: '1.0.0',
      status: 'ONLINE',
      baseUrl: '/api/v1',
      authentication: {
        type: 'Bearer JWT',
        header: 'Authorization: Bearer <token>',
      },
      modules: {
        auth: { path: '/api/v1/auth', description: 'User registration, authentication, token refresh, password management, role upgrade requests' },
        boundaries: { path: '/api/v1/boundaries', description: 'Administrative regions, zones, and woredas with GeoJSON' },
        farms: { path: '/api/v1/farms', description: 'Farm plot registration, spatial boundaries, crop metadata' },
        sensors: { path: '/api/v1/sensors', description: 'IoT sensor registration, telemetry readings, telemetry history' },
        satelliteObservations: { path: '/api/v1/satellite-observations', description: 'CHIRPS rainfall, NASA POWER, NDVI, GloFAS river discharge' },
        riskAssessments: { path: '/api/v1/risk-assessments', description: 'Integrated SPI drought, flood, locust, vegetation risk calculation' },
        alerts: { path: '/api/v1/alerts', description: 'Smart alert generation, advisory dispatch, push notifications' },
        diseaseDiagnosis: { path: '/api/v1/disease-diagnosis', description: 'Plant.id botanical identification + Gemini 2.5 Flash multimodal vision' },
        dashboards: { path: '/api/v1/dashboards', description: 'Role-tailored dashboards for Farmers, DAs, Officers, and Admins' },
        analytics: { path: '/api/v1/analytics', description: 'Executive dashboard analytics, regional breakdown, temporal trends' },
        ai: { path: '/api/v1/ai', description: 'Bilingual AI voice assistant, farmer Q&A, text-to-speech' },
        weather: { path: '/api/v1/weather', description: 'Real live weather forecasts, evapotranspiration, and hourly agro-meteorological metrics' },
        cropProtection: { path: '/api/v1/crop-protection', description: 'AI weed detection, smart spray window, nutrient deficiency, pest ETL scout, tank mix compatibility, seed calculator' },
        hazards: { path: '/api/v1/hazards', description: 'Multi-hazard assessment: earthquakes, soil degradation, landslides, volcanic, floods, drought, hazard maps' },
        animalHealth: { path: '/api/v1/animal-health', description: 'Livestock disease surveillance, outbreak tracking, vaccination campaigns, pasture monitoring, vet calendar' },
        ingestion: { path: '/api/v1/ingestion', description: 'Data connector status, manual pipeline pull triggers' },
        ussd: { path: '/api/v1/delivery/ussd', description: 'Interactive USSD menu handler (*212#)' },
        admin: { path: '/api/v1/admin', description: 'System administration, user roles, emergency broadcasts, audit logs, role request approvals' },
      },
      documentation: '/docs/API_SPECIFICATION.md',
    },
  });
});

// Web Admin Dashboard UI
app.use('/admin', adminRoutes);

// Top-level email verification and password reset handlers (for user-friendly links)
app.get('/verify-email', (req, res, next) => {
  const authController = require('./modules/auth/auth.controller');
  return authController.verifyEmail(req, res, next);
});

app.get('/reset-password', (req, res) => {
  const authController = require('./modules/auth/auth.controller');
  return authController.renderResetPasswordPage(req, res);
});

app.get('/forgot-password', (req, res) => {
  const authController = require('./modules/auth/auth.controller');
  return authController.renderForgotPasswordPage(req, res);
});

// API feature routes with specialized rate limiters
// Mounted before the generic /api/v1/auth router so the more specific path wins
// without relying on router fall-through. Path is the one documented in
// roleRequest.routes.js and already used by the Flutter client.
app.use('/api/v1/auth/role-requests', authLimiter, roleRequestRoutes);
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/boundaries', boundariesRoutes);
app.use('/api/v1/farms', farmsRoutes);
app.use('/api/v1/sensors', telemetryLimiter, sensorsRoutes);
app.use('/api/v1/satellite-observations', satelliteRoutes);
app.use('/api/v1/risk-assessments', riskAssessmentsRoutes);
app.use('/api/v1/alerts', alertsRoutes);
app.use('/api/v1/advisories', advisoriesRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/disease-diagnosis', aiLimiter, diseaseRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/dashboard', dashboardsRoutes);
app.use('/api/v1/dashboards', dashboardsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/ai', aiLimiter, aiRoutes);
app.use('/api/v1/weather', weatherRoutes);
app.use('/api/v1/crop-protection', cropProtectionRoutes);
app.use('/api/v1/hazards', hazardsRoutes);
app.use('/api/v1/animal-health', animalHealthRoutes);
app.use('/api/v1/ingestion', telemetryLimiter, ingestionRoutes);
app.use('/api/v1/delivery/ussd', ussdLimiter, ussdRoutes);
app.use('/api/v1/admin', adminRoutes);


// 404 catch-all
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
