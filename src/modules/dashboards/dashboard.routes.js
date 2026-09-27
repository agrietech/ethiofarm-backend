const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const farmerDashboard = require('./farmer.dashboard.service');
const officerDashboard = require('./officer.dashboard.service');
const agentDashboard = require('./agent.dashboard.service');
const adminDashboard = require('./admin.dashboard.service');
const logger = require('../../utils/logger');

/**
 * Auto-detect role and return appropriate jurisdictional dashboard
 * GET /api/v1/dashboard
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user;
    let dashboard;

    logger.info(`[Dashboard] Loading ${user.role} dashboard for user ${user.id}`);

    switch (user.role) {
      case 'FARMER':
        dashboard = await farmerDashboard.getFarmerDashboard(user.id, user.woredaId);
        break;

      case 'DEVELOPMENT_AGENT':
        dashboard = await agentDashboard.getAgentDashboard(user.id, user.woredaId, user.kebeleId);
        break;

      case 'WOREDA_OFFICER':
        dashboard = await officerDashboard.getWoredaCommandCenter(user.id, user.woredaId);
        break;

      case 'ZONAL_OFFICER':
        dashboard = await officerDashboard.getZonalCommandCenter(user.id, user.zoneId);
        break;

      case 'REGIONAL_OFFICER':
        dashboard = await officerDashboard.getRegionalCommandCenter(user.id, user.regionId);
        break;

      case 'ADMIN':
      case 'RESEARCHER':
        dashboard = await adminDashboard.getAdminPanel(user.id);
        break;

      default:
        dashboard = await farmerDashboard.getFarmerDashboard(user.id, user.woredaId);
    }

    res.json({
      success: true,
      data: {
        role: user.role,
        dashboard,
      },
    });
  } catch (error) {
    logger.error(`[Dashboard] Error: ${error.message}`);
    next(error);
  }
});

/**
 * Farmer-specific dashboard
 * GET /api/v1/dashboard/farmer
 */
router.get('/farmer', authenticate, authorize('FARMER'), async (req, res, next) => {
  try {
    const dashboard = await farmerDashboard.getFarmerDashboard(req.user.id, req.user.woredaId);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

/**
 * Officer command center (scoped to Woreda, Zone, Region, or DA)
 * GET /api/v1/dashboard/officer
 */
router.get(
  '/officer',
  authenticate,
  authorize('WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'DEVELOPMENT_AGENT'),
  async (req, res, next) => {
    try {
      let dashboard;
      if (req.user.role === 'DEVELOPMENT_AGENT') {
        dashboard = await agentDashboard.getAgentDashboard(req.user.id, req.user.woredaId, req.user.kebeleId);
      } else if (req.user.role === 'ZONAL_OFFICER') {
        dashboard = await officerDashboard.getZonalCommandCenter(req.user.id, req.user.zoneId);
      } else if (req.user.role === 'REGIONAL_OFFICER') {
        dashboard = await officerDashboard.getRegionalCommandCenter(req.user.id, req.user.regionId);
      } else {
        dashboard = await officerDashboard.getWoredaCommandCenter(req.user.id, req.user.woredaId);
      }
      res.json({ success: true, data: dashboard });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Admin control panel (Super Admin & Researcher)
 * GET /api/v1/dashboard/admin
 */
router.get('/admin', authenticate, authorize('ADMIN', 'RESEARCHER'), async (req, res, next) => {
  try {
    const dashboard = await adminDashboard.getAdminPanel(req.user.id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
