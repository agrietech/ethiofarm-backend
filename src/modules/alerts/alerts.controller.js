const alertsService = require('./alerts.service');
const { ForbiddenError, BadRequestError } = require('../../utils/errors');
const { prisma } = require('../../config/db');

async function createAlert(req, res, next) {
  try {
    const {
      woredaId,
      woredaName,
      hazardType,
      severity,
      headline,
      message,
      titleEn,
      titleAm,
      titleOm,
      messageEn,
      messageAm,
      messageOm,
      actionItems,
      priority,
      expiresAt,
      targetPhones,
    } = req.body;

    const resolvedHeadline = headline || titleEn || titleAm || titleOm;
    const resolvedMessage = message || messageEn || messageAm || messageOm;

    if (!woredaId || !hazardType || !resolvedHeadline) {
      throw new BadRequestError('woredaId, hazardType, and a title/headline are required');
    }

    const alert = await alertsService.createAlert({
      woredaId,
      woredaName,
      hazardType,
      severity,
      headline: resolvedHeadline,
      message: resolvedMessage,
      titleEn,
      titleAm,
      titleOm,
      messageEn,
      messageAm,
      messageOm,
      actionItems: actionItems || [],
      priority: priority != null ? parseInt(priority, 10) : 1,
      expiresAt,
      targetPhones: targetPhones || [],
    });

    res.status(201).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
}

async function getAlerts(req, res, next) {
  try {
    const { severity, woredaId, hazardType, status } = req.query;
    const user = req.user;
    const userRole = (user?.role || '').toUpperCase();

    // ── RBAC: Auto-scope alert queries by the user's jurisdiction ──
    let scopedWoredaId = woredaId || null;
    let scopedZoneId = null;
    let scopedRegionId = null;

    if (userRole === 'FARMER') {
      if (user?.woredaId) {
        if (woredaId && woredaId !== user.woredaId) {
          throw new ForbiddenError(`Access restricted: you cannot view alerts for woreda '${woredaId}' outside your assigned jurisdiction`);
        }
        scopedWoredaId = user.woredaId;
      } else {
        try {
          const firstFarm = await prisma.farm.findFirst({
            where: { userId: user.id },
            select: { woredaId: true },
          });
          if (firstFarm?.woredaId) {
            scopedWoredaId = firstFarm.woredaId;
          }
        } catch (_) {}
      }
    } else if (userRole === 'DEVELOPMENT_AGENT' || userRole === 'WOREDA_OFFICER') {
      if (!user?.woredaId) {
        throw new ForbiddenError('No administrative woreda assigned to your account');
      }
      if (woredaId && woredaId !== user.woredaId) {
        throw new ForbiddenError(`Access restricted: you cannot view alerts for woreda '${woredaId}' outside your assigned jurisdiction`);
      }
      scopedWoredaId = user.woredaId;
    } else if (userRole === 'ZONAL_OFFICER') {
      if (!user?.zoneId) {
        throw new ForbiddenError('No administrative zone assigned to your account');
      }
      if (woredaId) {
        const w = await prisma.woreda.findUnique({ where: { id: woredaId }, select: { zoneId: true } });
        if (!w || w.zoneId !== user.zoneId) {
          throw new ForbiddenError(`Access restricted: woreda '${woredaId}' is outside your assigned zone`);
        }
        scopedWoredaId = woredaId;
      } else {
        scopedZoneId = user.zoneId;
      }
    } else if (userRole === 'REGIONAL_OFFICER') {
      if (!user?.regionId) {
        throw new ForbiddenError('No administrative region assigned to your account');
      }
      if (woredaId) {
        const w = await prisma.woreda.findUnique({
          where: { id: woredaId },
          select: { zone: { select: { regionId: true } } },
        });
        if (!w || w.zone?.regionId !== user.regionId) {
          throw new ForbiddenError(`Access restricted: woreda '${woredaId}' is outside your assigned region`);
        }
        scopedWoredaId = woredaId;
      } else {
        scopedRegionId = user.regionId;
      }
    }
    // ADMIN and RESEARCHER see all alerts (no scope filter)

    const data = await alertsService.getActiveAlerts({
      severity,
      woredaId: scopedWoredaId,
      zoneId: scopedZoneId,
      regionId: scopedRegionId,
      hazardType,
      status,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getAlertById(req, res, next) {
  try {
    const alert = await alertsService.getAlertById(req.params.id);
    return res.status(200).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
}

async function markAlertAsRead(req, res, next) {
  try {
    const alert = await alertsService.markAlertAsRead(req.params.id);
    return res.status(200).json({ success: true, data: alert, message: 'Alert marked as read.' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /alerts/:id/feedback
 * Accepts ground-truth feedback from farmers/agents about alert accuracy.
 * Body: { accurate: boolean, notes?: string }
 */
async function submitFeedback(req, res, next) {
  try {
    const { id } = req.params;
    const { accurate, notes } = req.body;

    if (typeof accurate !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { message: "'accurate' field is required and must be a boolean", code: 'VALIDATION_ERROR' },
      });
    }

    const feedback = await alertsService.submitAlertFeedback({
      alertId: id,
      userId: req.user?.id,
      accurate,
      notes: (notes || '').toString().substring(0, 500),
    });

    return res.status(201).json({
      success: true,
      data: feedback,
      message: 'Thank you for your feedback. It helps us improve alert accuracy.',
    });
  } catch (error) {
    next(error);
  }
}

const alertTargetingService = require('./targeting/alert-targeting.service');
const alertTemplatesService = require('./templates/alert-templates.service');

/**
 * POST /alerts/campaigns/targeted
 * Create targeted alert campaign with intelligent audience selection
 */
async function createTargetedAlert(req, res, next) {
  try {
    const result = await alertTargetingService.createTargetedAlert(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /alerts/templates
 * Retrieve all pre-approved multi-hazard alert templates
 */
async function getAllTemplates(_req, res, next) {
  try {
    const templates = alertTemplatesService.getAllTemplates();
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /alerts/templates/:id
 * Retrieve specific template by ID
 */
async function getTemplateById(req, res, next) {
  try {
    const template = alertTemplatesService.getTemplate(req.params.id);
    res.status(200).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /alerts/templates/:id/dispatch
 * Dispatch an alert created from a pre-defined template with interpolated variables
 */
async function dispatchTemplateAlert(req, res, next) {
  try {
    const { id } = req.params;
    const { variables = {}, targeting = {} } = req.body;
    const result = await alertTemplatesService.createFromTemplate(id, variables, targeting);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAlert,
  getAlerts,
  getAlertById,
  markAlertAsRead,
  submitFeedback,
  createTargetedAlert,
  getAllTemplates,
  getTemplateById,
  dispatchTemplateAlert,
};

