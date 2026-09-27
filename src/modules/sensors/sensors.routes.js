const express = require('express');
const router = express.Router();
const controller = require('./sensors.controller');
const { telemetryLimiter } = require('../../middleware/rate-limiter.middleware');

// authenticateSensor is now maintained in the unified auth middleware
const { authenticate, authenticateSensor } = require('../../middleware/auth.middleware');




// Scope filter middleware for sensor queries
const enforceSensorScope = (req, _res, next) => {
  const user = req.user;
  if (!user) return next();
  if (user.role === 'FARMER') {
    req.query.userId = user.id;
  } else if (user.role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId) req.query.kebeleId = user.kebeleId;
    else if (user.woredaId) req.query.woredaId = user.woredaId;
  } else if (user.role === 'WOREDA_OFFICER') {
    if (user.woredaId) req.query.woredaId = user.woredaId;
  } else if (user.role === 'ZONAL_OFFICER') {
    if (user.zoneId) req.query.zoneId = user.zoneId;
  } else if (user.role === 'REGIONAL_OFFICER') {
    if (user.regionId) req.query.regionId = user.regionId;
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

// Allow farmers, agents, officers, and admins to register a sensor individually
router.post('/', authenticate, controller.registerSensor);
router.get('/', authenticate, enforceSensorScope, controller.getSensors);


// Telemetry query endpoints matching Flutter SensorRepository
router.get('/:id/telemetry', authenticate, controller.getSensorTelemetry);
router.get('/:hardwareId/latest', authenticate, controller.getLatestSensorReading);

// Single sensor details & OCC update endpoints
router.get('/:id', authenticate, controller.getSensorDetails);
router.put('/:id', authenticate, controller.updateSensor);
router.patch('/:id', authenticate, controller.updateSensor);

module.exports = router;
