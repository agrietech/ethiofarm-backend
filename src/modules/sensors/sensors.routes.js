const express = require('express');
const router = express.Router();
const controller = require('./sensors.controller');
const { telemetryLimiter } = require('../../middleware/rate-limiter.middleware');

// authenticateSensor is now maintained in the unified auth middleware
const { authenticate, authenticateSensor, authorize } = require('../../middleware/auth.middleware');
const { buildSensorScope } = require('../../middleware/scope-filter.utils');

// Centralized scope filter middleware for sensor queries.
// Delegates to the canonical buildSensorScope() to avoid duplicating
// jurisdiction logic that lives in scope-filter.utils.js.
const enforceSensorScope = (req, _res, next) => {
  const user = req.user;
  if (!user) return next();

  const scope = buildSensorScope(user);

  // Translate the Prisma where-clause into query params that the controller
  // can merge into its own queries when it reads from req.query.
  if (scope.farm) {
    if (scope.farm.userId) req.query.userId = scope.farm.userId;
    if (scope.farm.kebeleId) req.query.kebeleId = scope.farm.kebeleId;
    if (scope.farm.woredaId) req.query.woredaId = scope.farm.woredaId;
    if (scope.farm.woreda?.zoneId) req.query.zoneId = scope.farm.woreda.zoneId;
    if (scope.farm.woreda?.zone?.regionId) req.query.regionId = scope.farm.woreda.zone.regionId;
  }
  next();
};

// Individual Farmer Sensor Ownership Endpoints
router.get('/my-sensors', authenticate, controller.getMySensors);
router.get('/farmer/:userId', authenticate, controller.getFarmerSensors);
router.post('/claim', authenticate, controller.claimSensor);

// GET /telemetry — returns recent telemetry readings (used by Flutter frontend dashboard)
router.get('/telemetry', authenticate, enforceSensorScope, controller.getAllTelemetry);
router.get('/telemetry/summary', authenticate, enforceSensorScope, controller.getAllTelemetry);

router.post('/telemetry', authenticateSensor, telemetryLimiter, controller.recordTelemetry);
router.get('/farm/:farmId', authenticate, controller.getSensors);

// Register a sensor — restricted to Farmer owner, assigned Development Agent, or Super Admin
router.post('/', authenticate, authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'), controller.registerSensor);
router.get('/', authenticate, enforceSensorScope, controller.getSensors);

// Telemetry query endpoints matching Flutter SensorRepository (accessible to all authenticated users in their scope)
router.get('/:id/telemetry', authenticate, controller.getSensorTelemetry);
router.get('/:hardwareId/latest', authenticate, controller.getLatestSensorReading);

// Single sensor details & OCC update endpoints
router.get('/:id', authenticate, controller.getSensorDetails);
router.put('/:id', authenticate, authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'), controller.updateSensor);
router.patch('/:id', authenticate, authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'), controller.updateSensor);

module.exports = router;
