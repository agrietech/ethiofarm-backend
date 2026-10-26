const farmsService = require('./farms.service');
const { validateFarmData } = require('../../validation/schemas');
const { UnauthorizedError } = require('../../utils/errors');
const { assertResourceInScope } = require('../../middleware/scope-filter.utils');

// Shared read authorization for all farm-derived data, including planning,
// analytics and peer benchmarks. These routes must not expose a farm merely
// because a caller is authenticated.
// Delegates jurisdiction checking to the canonical assertResourceInScope()
// so scope logic lives in a single place (scope-filter.utils.js).
async function authorizeFarmAccess(req, res, next) {
  try {
    const farm = await farmsService.getFarmById(req.params.id);
    if (!farm) return res.status(404).json({ success: false, error: 'Farm not found' });

    try {
      assertResourceInScope(req.user, farm, 'farm');
    } catch (scopeErr) {
      return res.status(403).json({
        success: false,
        error: { message: scopeErr.message, code: 'FORBIDDEN' },
      });
    }

    req.farm = farm;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function createFarm(req, res, next) {
  try {
    validateFarmData(req.body);
    const body = req.body || {};
    const farmName = body.farmName || body.name || body.title || 'My Farm Plot';
    const primaryCrop = body.primaryCrop || body.cropType || body.crop || 'Mixed Crops';
    const areaHectares = body.areaHectares !== undefined ? Number(body.areaHectares) : (body.size !== undefined ? Number(body.size) : (body.area !== undefined ? Number(body.area) : 1.0));
    const woredaId = body.woredaId || body.woreda_id || (body.woreda && body.woreda.id);
    const polygonGeojson = body.polygonGeojson || body.geoJsonBoundary || body.boundary;
    const latitude = body.latitude !== undefined ? Number(body.latitude) : (body.lat !== undefined ? Number(body.lat) : undefined);
    const longitude = body.longitude !== undefined ? Number(body.longitude) : (body.lng !== undefined ? Number(body.lng) : (body.lon !== undefined ? Number(body.lon) : undefined));
    const soilType = body.soilType || body.soil_type;
    const irrigationType = body.irrigationType || body.irrigation_type;

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new UnauthorizedError('Authentication required to register a farm');
    }

    const kebeleId = body.kebeleId || body.kebele_id;
    let targetUserId = userId;
    if (body.userId && ['ADMIN', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER'].includes(req.user?.role)) {
      targetUserId = body.userId;
    }

    const farm = await farmsService.createFarm({
      userId: targetUserId,
      farmName,
      primaryCrop,
      areaHectares,
      woredaId,
      kebeleId,
      polygonGeojson,
      latitude,
      longitude,
      soilType,
      irrigationType,
    });
    res.status(201).json({ success: true, data: farm });
  } catch (error) {
    next(error);
  }
}

async function getFarms(req, res, next) {
  try {
    const data = await farmsService.getFarmsByScope(req.user);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getFarmDetails(req, res, next) {
  try {
    const data = await farmsService.getFarmById(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Farm not found' });

    // ── Scope check: Verify the requesting user has jurisdictional access ──
    // Delegates to the canonical assertResourceInScope() so scope logic
    // lives in a single place (scope-filter.utils.js).
    try {
      assertResourceInScope(req.user, data, 'farm');
    } catch (scopeErr) {
      return res.status(403).json({
        success: false,
        error: { message: scopeErr.message, code: 'FORBIDDEN' },
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function updateFarm(req, res, next) {
  try {
    const { id } = req.params;
    const clientUpdatedAt =
      req.headers['if-unmodified-since'] ||
      req.body.clientUpdatedAt ||
      req.body.updatedAt ||
      req.body.lastUpdatedAt;

    const updated = await farmsService.updateFarm({
      id,
      data: req.body,
      user: req.user,
      clientUpdatedAt,
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

const farmPlannerService = require('./planning/farm-planner.service');
const farmAnalyticsService = require('./analytics/farm-analytics.service');

async function deleteFarm(req, res, next) {
  try {
    const { id } = req.params;
    const result = await farmsService.deleteFarm({ id, user: req.user });
    res.status(200).json({
      success: true,
      data: { id: result.id, message: result.message },
      id: result.id,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

// Generate crop rotation plan for farm
async function generateCropRotation(req, res, next) {
  try {
    const { id } = req.params;
    const years = req.body?.years ? parseInt(req.body.years, 10) : 3;
    const plan = await farmPlannerService.generateCropRotationPlan(id, years);
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
}

// Calculate input requirements (seeds, fertilizer, labor, water)
async function calculateInputs(req, res, next) {
  try {
    const { id } = req.params;
    const crop = req.query?.crop || req.body?.crop;
    const inputs = await farmPlannerService.calculateInputs(id, crop);
    res.status(200).json({ success: true, data: inputs });
  } catch (error) {
    next(error);
  }
}

// Generate seasonal planting and agronomic calendar
async function getPlantingCalendar(req, res, next) {
  try {
    const { id } = req.params;
    const calendar = await farmPlannerService.generatePlantingCalendar(id);
    res.status(200).json({ success: true, data: calendar });
  } catch (error) {
    next(error);
  }
}

// Get comprehensive analytical dashboard for farm
async function getFarmAnalytics(req, res, next) {
  try {
    const { id } = req.params;
    const analytics = await farmAnalyticsService.getFarmDashboard(id, req.user?.id);
    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
}

// Get regional benchmarking against peer farms
async function getFarmBenchmarks(req, res, next) {
  try {
    const { id } = req.params;
    const farm = await farmsService.getFarmById(id);
    if (!farm) return res.status(404).json({ success: false, error: 'Farm not found' });
    const benchmarks = await farmAnalyticsService.getBenchmarks(farm);
    res.status(200).json({ success: true, data: benchmarks });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authorizeFarmAccess,
  createFarm,
  getFarms,
  getFarmDetails,
  updateFarm,
  deleteFarm,
  generateCropRotation,
  calculateInputs,
  getPlantingCalendar,
  getFarmAnalytics,
  getFarmBenchmarks,
};
