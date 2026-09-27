const express = require('express');
const router = express.Router();
const controller = require('./alerts.controller');
const { authenticate, authorize, authorizeWoredaScope } = require('../../middleware/auth.middleware');
const { assertResourceInScope } = require('../../middleware/scope-filter.utils');

// POST / — Create alert.
// authorize() enforces role (only officers/DAs can broadcast).
// authorizeWoredaScope() ensures the alert's target woreda is within the creator's
// assigned jurisdiction, preventing cross-jurisdiction alert spoofing.
router.post(
  '/',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  authorizeWoredaScope('woredaId'),
  controller.createAlert
);

// Pre-approved multi-hazard templates & targeted campaigns
// authorizeWoredaScope ensures dispatch/targeting is within user's jurisdiction
router.get('/templates', authenticate, controller.getAllTemplates);
router.get('/templates/:id', authenticate, controller.getTemplateById);
router.post(
  '/templates/:id/dispatch',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  authorizeWoredaScope('woredaId'),
  controller.dispatchTemplateAlert
);
router.post(
  '/campaigns/targeted',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  authorizeWoredaScope('woredaId'),
  controller.createTargetedAlert
);

// GET routes — all authenticated users can view alerts scoped to their jurisdiction
router.get('/', authenticate, controller.getAlerts);
router.get('/active', authenticate, controller.getAlerts);

// GET single alert by ID — scope check performed in controller
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const alertsService = require('./alerts.service');
    const alert = await alertsService.getAlertById(req.params.id);

    // Verify the alert is within the user's jurisdiction
    try {
      assertResourceInScope(req.user, alert, 'alert');
    } catch (scopeErr) {
      return res.status(403).json({
        success: false,
        error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' },
      });
    }

    return res.status(200).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
});

// Mark read / feedback — any authenticated user (farmers responding to alerts)
router.patch('/:id/read', authenticate, controller.markAlertAsRead);
router.post('/:id/read', authenticate, controller.markAlertAsRead);

// Ground-truth feedback: farmers can validate whether an alert was accurate
router.post('/:id/feedback', authenticate, controller.submitFeedback);

module.exports = router;
