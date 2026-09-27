/**
 * @file hazardMapController.js
 * @description REST API Controller for Ethiopia Hazard Map Data.
 * Serves choropleth-ready data at Region, Zone, Woreda administrative levels.
 */

const hazardMapService = require('./hazardMapService');
const logger = require('../../utils/logger');

// GET /api/v1/hazards/map/layers — Available hazard layers catalog
async function getAvailableLayers(_req, res) {
  res.json({
    success: true,
    data: {
      layers: hazardMapService.getHazardLayers(),
      description: 'Hazard layers available for Ethiopia choropleth map visualization',
      adminLevels: ['region', 'zone', 'woreda'],
    },
  });
}

// GET /api/v1/hazards/map/regions — Region-level hazard summary
async function getRegionHazardMap(req, res, next) {
  try {
    const { layer } = req.query;
    const regions = await hazardMapService.getRegionHazardData({
      hazardLayer: layer || 'composite',
    });

    res.json({
      success: true,
      data: {
        adminLevel: 'region',
        hazardLayer: layer || 'composite',
        totalFeatures: regions.length,
        features: regions,
      },
    });
  } catch (err) {
    logger.error(`[HazardMapController] Region map error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/map/zones/:regionId — Zone-level hazard breakdown
async function getZoneHazardMap(req, res, next) {
  try {
    const { regionId } = req.params;
    const { layer } = req.query;

    if (!regionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'regionId is required' },
      });
    }

    const zones = await hazardMapService.getZoneHazardData(regionId, {
      hazardLayer: layer || 'composite',
    });

    res.json({
      success: true,
      data: {
        adminLevel: 'zone',
        regionId,
        hazardLayer: layer || 'composite',
        totalFeatures: zones.length,
        features: zones,
      },
    });
  } catch (err) {
    logger.error(`[HazardMapController] Zone map error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/map/woredas/:zoneId — Woreda-level hazard details
async function getWoredaHazardMap(req, res, next) {
  try {
    const { zoneId } = req.params;
    const { layer } = req.query;

    if (!zoneId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'zoneId is required' },
      });
    }

    const woredas = await hazardMapService.getWoredaHazardData(zoneId, {
      hazardLayer: layer || 'composite',
    });

    res.json({
      success: true,
      data: {
        adminLevel: 'woreda',
        zoneId,
        hazardLayer: layer || 'composite',
        totalFeatures: woredas.length,
        features: woredas,
      },
    });
  } catch (err) {
    logger.error(`[HazardMapController] Woreda map error: ${err.message}`);
    next(err);
  }
}

module.exports = {
  getAvailableLayers,
  getRegionHazardMap,
  getZoneHazardMap,
  getWoredaHazardMap,
};
