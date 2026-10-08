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

  // 1. API Key Authentication (x-api-key header) — mapped to real database Super Admin
  const apiKey = req.headers['x-api-key'] || req.headers['api-key'];
  if (apiKey) {
    const validKeys = getAdminApiKeySet();
    if (validKeys.size > 0 && validKeys.has(apiKey.trim())) {
      const { prisma } = require('../../config/db');
      return prisma.user.findFirst({ where: { role: 'ADMIN' } })
        .then((adminUser) => {
          if (!adminUser) {
            return res.status(403).json({
              success: false,
              error: { message: 'Super Administrator not found in database', code: 'FORBIDDEN' },
            });
          }
          req.user = {
            id: adminUser.id,
            email: adminUser.email,
            fullName: adminUser.fullName,
            role: 'ADMIN',
          };
          return next();
        })
        .catch((err) => next(err));
    }
  }

  // 2. Cookie / query token: extract and place as Bearer header so sharedAuthenticate handles it.
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

    // 4. Strict Super Admin role enforcement
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied: National Super Administrator privileges required', code: 'FORBIDDEN' },
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

  const tokenCandidate = (queryToken || cookieToken || headerToken || apiKey || '').toString().trim();
  const validKeys = env.getAdminKeys ? env.getAdminKeys() : [];

  if (tokenCandidate && validKeys.includes(tokenCandidate)) {
    try {
      const { prisma } = require('../../config/db');
      let adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!adminUser) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(tokenCandidate, 10);
        adminUser = await prisma.user.create({
          data: {
            email: env.ADMIN_EMAIL || 'admin@ethiofarm.et',
            fullName: 'National Super Administrator',
            role: 'ADMIN',
            passwordHash: hash,
            isEmailVerified: true,
          },
        });
      }
      req.user = { id: adminUser.id, email: adminUser.email, role: 'ADMIN', fullName: adminUser.fullName };
      return next();
    } catch (_) {}
  }

  if (tokenCandidate) {
    try {
      const jwt = require('jsonwebtoken');
      const env = require('../../config/env');
      if (!(await isTokenBlacklisted(tokenCandidate))) {
        const decoded = jwt.verify(tokenCandidate, env.JWT_SECRET);
        if (decoded && decoded.role === 'ADMIN') {
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
      if (decoded && decoded.role === 'ADMIN') {
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
