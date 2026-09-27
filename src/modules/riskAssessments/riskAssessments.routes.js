const express = require('express');
const router = express.Router();
const controller = require('./riskAssessments.controller');
const { authenticate, authorizeWoredaScope } = require('../../middleware/auth.middleware');

// POST /evaluate — triggers a risk assessment for a specific woreda.
// authorizeWoredaScope ensures FARMER/DA/WOREDA_OFFICER can only evaluate
// their own woreda; higher roles (ZONAL, REGIONAL, ADMIN, RESEARCHER) pass through.
router.post(
  '/evaluate',
  authenticate,
  authorizeWoredaScope('woredaId'),
  controller.evaluateRisk
);

// GET /statistics — national-level stats; no geographic scope restriction needed
router.get('/statistics', authenticate, controller.getStatistics);

// GET /woreda/:woredaId — already correctly scoped
router.get('/woreda/:woredaId', authenticate, authorizeWoredaScope('woredaId'), controller.getWoredaAssessments);

// GET /latest and / — scoped queries; controller handles filtering by user's jurisdiction
router.get('/latest', authenticate, controller.getLatestAssessments);
router.get('/', authenticate, controller.getLatestAssessments);

module.exports = router;
