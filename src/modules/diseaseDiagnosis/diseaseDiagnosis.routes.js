const express = require('express');
const router = express.Router();
const controller = require('./diseaseDiagnosis.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const upload = require('../../middleware/upload.middleware');
const { buildDiagnosisScope } = require('../../middleware/scope-filter.utils');

const { aiLimiter } = require('../../middleware/rate-limiter.middleware');

// Centralized scope filter middleware for crop disease diagnoses.
// Delegates to the canonical buildDiagnosisScope() to avoid duplicating
// jurisdiction logic that lives in scope-filter.utils.js.
const enforceDiagnosisScope = (req, _res, next) => {
  const user = req.user;
  if (!user) return next();

  const scope = buildDiagnosisScope(user);

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

router.get('/', authenticate, enforceDiagnosisScope, controller.getAllDiagnoses);
router.get('/farm/:farmId', authenticate, controller.getDiagnosesByFarm);
router.get('/jobs/:jobId', authenticate, controller.getJobStatus);
router.get('/status/:jobId', authenticate, controller.getJobStatus);
router.get('/:id', authenticate, controller.getDiagnosisById);
router.post('/diagnose', authenticate, aiLimiter, upload.single('image'), controller.diagnose);

module.exports = router;


