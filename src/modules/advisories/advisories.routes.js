const express = require('express');
const router = express.Router();
const controller = require('./advisories.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

// Scope filter middleware for agricultural advisories
const enforceAdvisoryScope = (req, _res, next) => {
  const user = req.user;
  if (!user || ['ADMIN', 'RESEARCHER'].includes(user.role)) return next();
  if (user.woredaId && !req.query.woredaId) req.query.woredaId = user.woredaId;
  next();
};

// Public/authenticated queries
router.get('/', authenticate, enforceAdvisoryScope, controller.getAdvisories);
router.get('/:id', authenticate, controller.getAdvisoryById);

// Staff-only management routes
router.post(
  '/',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'RESEARCHER', 'ADMIN'),
  controller.createAdvisory
);

router.put(
  '/:id',
  authenticate,
  authorize('WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  controller.updateAdvisory
);

router.delete(
  '/:id',
  authenticate,
  authorize('REGIONAL_OFFICER', 'ADMIN'),
  controller.deleteAdvisory
);

module.exports = router;
