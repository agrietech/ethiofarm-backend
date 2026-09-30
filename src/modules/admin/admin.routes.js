const express = require('express');
const router = express.Router();
const controller = require('./admin.controller');
const roleRequestController = require('../roleRequest/roleRequest.controller');
const boundariesController = require('../boundaries/boundaries.controller');
const env = require('../../config/env');

// Import the unified auth middleware so adminAuth delegates JWT verification
// to a single, patchable code path — no duplicate JWT logic.
const { authenticate: sharedAuthenticate, getAdminApiKeySet } = require('../../middleware/auth.middleware');

// Admin authentication middleware (Supports API Keys, JWT Bearer Tokens, and browser sessions)
const { isTokenBlacklisted } = require('../auth/auth.service');

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// Resolve the token from all supported admin surfaces:
// API key header, cookie, Bearer header, or query param.
// Once extracted, JWT verification is delegated to sharedAuthenticate — one code path.
const adminAuth = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    if (!req.user) req.user = { id: 'usr_admin_01', email: 'admin@ethiofarm.et', role: 'ADMIN' };
    return next();
  }

  // 1. API Key Authentication (x-api-key header) — short-circuit before JWT path
  const apiKey = req.headers['x-api-key'] || req.headers['api-key'];
  if (apiKey) {
    const validKeys = getAdminApiKeySet();
    if (validKeys.size > 0 && validKeys.has(apiKey.trim())) {
      req.user = { id: 'usr_admin_apikey', email: 'admin_apikey@ethiofarm.et', fullName: 'API Key Administrator', role: 'ADMIN' };
      return next();
    }
  }

  // 2. Cookie / query token: extract and place as Bearer header so sharedAuthenticate handles it.
  //    This keeps all JWT signing/blacklist/expiry logic in one place.
  const cookieToken = getCookie(req, 'admin_token') || getCookie(req, 'accessToken');
  const queryToken = req.query.token || req.query.accessToken;
  const fallbackToken = cookieToken || queryToken;

  if (fallbackToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${fallbackToken}`;
  }

  // 3. Delegate JWT verification + blacklist check to the shared middleware
  sharedAuthenticate(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required for administrative access', code: 'UNAUTHORIZED' },
      });
    }

    // 4. Role check — DA, Officers, Admin can access the panel; FARMER/RESEARCHER cannot
    const allowedRoles = [
      'ADMIN', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT',
    ];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Insufficient administrative privileges', code: 'FORBIDDEN' },
      });
    }
    next();
  });
};

// Strict administrator authorization for sensitive operations
const requireAdmin = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: { message: 'This operation requires system administrator privileges', code: 'FORBIDDEN' },
    });
  }
  next();
};

// Server-side Gate protecting HTML dashboard console view
const adminPageAuth = async (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // If accessed via API path (/api/v1/admin), pass through to API router
  if (req.baseUrl && req.baseUrl.startsWith('/api')) {
    return next();
  }

  const queryToken = req.query.token || req.query.accessToken || req.query.apiKey || req.query.key;
  const cookieToken = getCookie(req, 'admin_token') || getCookie(req, 'accessToken');
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const apiKey = req.headers['x-api-key'] || req.headers['api-key'];

  const tokenCandidate = queryToken || cookieToken || headerToken;

  const validKeys = env.getAdminKeys ? env.getAdminKeys() : [
    ...(process.env.ADMIN_API_KEYS || '').split(','),
    process.env.ADMIN_CONSOLE_PASSWORD,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_SECRET,
    process.env.ADMIN_KEY,
    process.env.ADMIN_PASS,
    process.env.ADMIN_TOKEN,
  ].map(k => (k || '').trim()).filter(Boolean);

  if (apiKey && validKeys.includes(apiKey.trim())) {
    return next();
  }

  if (tokenCandidate && validKeys.includes(tokenCandidate.trim())) {
    const isProd = process.env.NODE_ENV === 'production';
    const secureFlag = isProd ? '; Secure' : '';
    res.setHeader('Set-Cookie', `admin_token=${tokenCandidate.trim()}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
    return next();
  }

  if (tokenCandidate) {
    try {
      const jwt = require('jsonwebtoken');
      const env = require('../../config/env');
      if (!(await isTokenBlacklisted(tokenCandidate))) {
        const decoded = jwt.verify(tokenCandidate, env.JWT_SECRET);
        const allowedRoles = ['ADMIN', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT'];
        if (decoded && allowedRoles.includes(decoded.role)) {
          req.user = decoded;
          return next();
        }
      }
    } catch (_e) {
      // Token invalid or expired
    }
  }

  // User is not authenticated -> Strictly redirect to /admin/login
  return res.redirect('/admin/login');
};

// Admin Login Page & Authentication Gateway
router.get('/login', (req, res) => {
  const cookieToken = getCookie(req, 'admin_token') || getCookie(req, 'accessToken');
  if (cookieToken) {
    try {
      const jwt = require('jsonwebtoken');
      const env = require('../../config/env');
      const decoded = jwt.verify(cookieToken, env.JWT_SECRET);
      const allowedRoles = ['ADMIN', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT'];
      if (decoded && allowedRoles.includes(decoded.role)) {
        return res.redirect('/admin/dashboard');
      }
    } catch (_) {}
  }
  return controller.renderLogin(req, res);
});

router.post('/login', controller.handleAdminLogin);
router.post('/reset-password', controller.handleAdminResetPassword);
router.get('/logout', controller.handleAdminLogout);

// Protected dashboard console view (serves HTML admin interface when accessed via /admin)
router.get('/', (req, res) => {
  if (req.baseUrl && req.baseUrl.startsWith('/api')) {
    return res.status(200).json({
      success: true,
      message: 'EthioFarm Admin API',
      endpoints: {
        overview: `${req.baseUrl}/overview`,
        users: `${req.baseUrl}/users`,
        farms: `${req.baseUrl}/farms`,
        sensors: `${req.baseUrl}/sensors`,
        alerts: `${req.baseUrl}/alerts`,
        diagnoses: `${req.baseUrl}/diagnoses`,
      },
    });
  }
  return res.redirect('/admin/dashboard');
});

router.get('/dashboard', adminPageAuth, (req, res) => {
  if (req.baseUrl && req.baseUrl.startsWith('/api')) {
    return res.redirect('/admin/dashboard');
  }
  return controller.renderDashboard(req, res);
});

// Admin Operations & Diagnostics Endpoints
router.get('/overview', adminAuth, controller.getOverview);

// User Management Routes
router.get('/users', adminAuth, controller.getUsers);
router.get('/users/:id', adminAuth, controller.getUserDetails);
router.post('/users', adminAuth, controller.createUser);
router.put('/users/:id', adminAuth, controller.updateUser);
router.patch('/users/:id/role', adminAuth, requireAdmin, controller.updateUserRole);
router.patch('/users/:id/status', adminAuth, controller.updateUserStatus);
router.delete('/users/:id', adminAuth, requireAdmin, controller.deleteUser);

// Farm Management Routes
router.get('/farms', adminAuth, controller.getFarms);
router.get('/farms/:id', adminAuth, controller.getFarmDetails);
router.post('/farms', adminAuth, controller.createFarm);
router.put('/farms/:id', adminAuth, controller.updateFarm);
router.delete('/farms/:id', adminAuth, controller.deleteFarm);

// Kebele Management Routes (Admin & Expert)
router.get('/kebeles', adminAuth, boundariesController.getKebeles);
router.post('/kebeles', adminAuth, boundariesController.createKebele);
router.put('/kebeles/:id/polygon', adminAuth, boundariesController.updateKebelePolygon);

// Sensor Management Routes
router.get('/sensors', adminAuth, controller.getSensors);
router.get('/sensors/:id', adminAuth, controller.getSensorDetails);
router.post('/sensors', adminAuth, controller.createSensor);
router.delete('/sensors/:id', adminAuth, controller.deleteSensor);

// Alert Management & Emergency Broadcast & Farmer USSD Messaging
router.get('/alerts', adminAuth, controller.getAlerts);
router.get('/alerts/:id', adminAuth, controller.getAlertDetails);
router.post('/broadcast-alert', adminAuth, controller.broadcastEmergencyAlert);
router.get('/farmers/audience', adminAuth, controller.getFarmerAudienceStats);
router.delete('/alerts/:id', adminAuth, controller.deleteAlert);

// Disease Diagnosis Management
router.get('/diagnoses', adminAuth, controller.getDiagnoses);
router.get('/diagnoses/:id', adminAuth, controller.getDiagnosisDetails);
router.delete('/diagnoses/:id', adminAuth, controller.deleteDiagnosis);

// System Health, Ingestion Trigger & Audit Logs
router.get('/system/health', adminAuth, controller.getSystemHealth);
router.get('/health', adminAuth, controller.getSystemHealth);
router.post('/ingestion/trigger', adminAuth, controller.triggerIngestion);
router.get('/audit-logs', adminAuth, controller.getAuditLogs);
router.post('/database/clean-test-data', adminAuth, requireAdmin, controller.cleanTestData);

// Role Request Management (Hierarchical Approval System)
router.get('/role-requests', adminAuth, roleRequestController.getPendingRequests);
router.get('/role-requests/stats', adminAuth, roleRequestController.getRoleRequestStats);
router.post('/role-requests/:id/approve', adminAuth, roleRequestController.approveRoleRequest);
router.post('/role-requests/:id/reject', adminAuth, roleRequestController.rejectRoleRequest);

module.exports = router;
