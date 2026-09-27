/**
 * @file hazards.controller.js
 * @description Multi-Hazard Assessment REST API Controller.
 * Exposes earthquake, soil degradation, landslide, volcanic, flood, drought engines.
 */

const hazardsService = require('./hazards.service');
const logger = require('../../utils/logger');

// GET /api/v1/hazards/assess — Integrated multi-hazard assessment
async function assessMultiHazard(req, res, next) {
  try {
    const { lat, lng, woredaId, woredaName } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng coordinates or woredaId' },
      });
    }

    const result = await hazardsService.assessMultiHazard({ lat, lng, woredaId, woredaName });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[HazardsController] Multi-hazard assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/earthquakes — Live USGS seismic events
async function getLiveEarthquakes(req, res, next) {
  try {
    const { days, minMagnitude } = req.query;
    const events = await hazardsService.getLiveEarthquakes({
      days: days ? Number(days) : 30,
      minMagnitude: minMagnitude ? Number(minMagnitude) : 2.5,
    });

    res.json({
      success: true,
      data: {
        totalEvents: events.length,
        events,
        queryParams: {
          days: Number(days) || 30,
          minMagnitude: Number(minMagnitude) || 2.5,
          region: 'Horn of Africa (3.0-15.5°N, 32.5-48.5°E)',
        },
      },
    });
  } catch (err) {
    logger.error(`[HazardsController] Earthquake fetch error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/earthquakes/assess — Location-specific earthquake risk
async function assessEarthquakeRisk(req, res, next) {
  try {
    const { lat, lng, woredaId, woredaName } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng coordinates or woredaId' },
      });
    }

    const result = await hazardsService.assessEarthquakeRisk({ lat, lng, woredaId, woredaName });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[HazardsController] Earthquake risk assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/soil-degradation — RUSLE erosion assessment
async function assessSoilDegradation(req, res, next) {
  try {
    const { lat, lng, woredaId, woredaName, slopePct, conservationPractice } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng coordinates or woredaId' },
      });
    }

    const result = await hazardsService.assessSoilDegradation({
      lat, lng, woredaId, woredaName, slopePct, conservationPractice,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[HazardsController] Soil degradation assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/landslides — Landslide susceptibility
async function assessLandslideRisk(req, res, next) {
  try {
    const { lat, lng, woredaId } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng coordinates or woredaId' },
      });
    }

    const result = await hazardsService.assessLandslideRisk({ lat, lng, woredaId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[HazardsController] Landslide assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/volcanic — Volcanic proximity risk
async function assessVolcanicRisk(req, res, next) {
  try {
    const { lat, lng, woredaId } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng coordinates or woredaId' },
      });
    }

    const result = await hazardsService.assessVolcanicRisk({ lat, lng, woredaId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[HazardsController] Volcanic risk assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/hazards/national-summary — National hazard overview
async function getNationalHazardSummary(_req, res, next) {
  try {
    const summary = await hazardsService.getNationalHazardSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    logger.error(`[HazardsController] National summary error: ${err.message}`);
    next(err);
  }
}

module.exports = {
  assessMultiHazard,
  getLiveEarthquakes,
  assessEarthquakeRisk,
  assessSoilDegradation,
  assessLandslideRisk,
  assessVolcanicRisk,
  getNationalHazardSummary,
};
