const express = require('express');
const router = express.Router();
const controller = require('./diseaseDiagnosis.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const upload = require('../../middleware/upload.middleware');

const { aiLimiter } = require('../../middleware/rate-limiter.middleware');

// Scope filter middleware for crop disease diagnoses
const enforceDiagnosisScope = (req, _res, next) => {
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

router.get('/', authenticate, enforceDiagnosisScope, controller.getAllDiagnoses);
router.get('/farm/:farmId', authenticate, controller.getDiagnosesByFarm);
router.get('/jobs/:jobId', authenticate, controller.getJobStatus);
router.get('/status/:jobId', authenticate, controller.getJobStatus);
router.get('/:id', authenticate, controller.getDiagnosisById);
router.post('/diagnose', authenticate, aiLimiter, upload.single('image'), controller.diagnose);

module.exports = router;

