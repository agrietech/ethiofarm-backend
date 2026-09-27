/**
 * @file animalHealth.controller.js
 * @description REST API Controller for Animal Health & Livestock Surveillance.
 */

const animalHealthService = require('./animalHealth.service');
const logger = require('../../utils/logger');

// GET /api/v1/animal-health/diseases — Disease reference database
async function getDiseases(req, res) {
  const { animalType, zoonotic, notifiable, season } = req.query;
  const result = animalHealthService.getAllDiseases({ animalType, zoonotic, notifiable, season });
  res.json({ success: true, data: result });
}

// GET /api/v1/animal-health/diseases/:diseaseId — Disease details
async function getDiseaseDetails(req, res) {
  const { diseaseId } = req.params;
  const disease = animalHealthService.getDiseaseDetails(diseaseId);
  if (!disease) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Disease '${diseaseId}' not found` } });
  }
  res.json({ success: true, data: disease });
}

// POST /api/v1/animal-health/outbreaks — Report new outbreak
async function reportOutbreak(req, res, next) {
  try {
    const result = await animalHealthService.reportOutbreak(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[AnimalHealthController] Outbreak report error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/outbreaks — Get active outbreaks
async function getOutbreaks(req, res, next) {
  try {
    let { woredaId, zoneId, regionId, status, animalType, limit } = req.query;
    const user = req.user;
    if (user && !['ADMIN', 'RESEARCHER'].includes(user.role)) {
      if (user.role === 'FARMER' || user.role === 'DEVELOPMENT_AGENT' || user.role === 'WOREDA_OFFICER') {
        woredaId = user.woredaId;
      } else if (user.role === 'ZONAL_OFFICER') {
        zoneId = user.zoneId;
      } else if (user.role === 'REGIONAL_OFFICER') {
        regionId = user.regionId;
      }
    }
    const outbreaks = await animalHealthService.getOutbreaks({ woredaId, zoneId, regionId, status, animalType, limit });
    res.json({ success: true, data: { total: outbreaks.length, outbreaks } });
  } catch (err) {
    logger.error(`[AnimalHealthController] Outbreaks query error: ${err.message}`);
    next(err);
  }
}

// POST /api/v1/animal-health/livestock — Register livestock herd
async function registerLivestock(req, res, next) {
  try {
    const result = await animalHealthService.registerLivestock({
      ...req.body,
      userId: req.user?.id || req.body.userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[AnimalHealthController] Livestock registration error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/livestock — Get livestock by woreda
async function getLivestock(req, res, next) {
  try {
    const { woredaId } = req.query;
    if (!woredaId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'woredaId is required' } });
    }
    const livestock = await animalHealthService.getLivestockByWoreda(woredaId);
    res.json({ success: true, data: { total: livestock.length, livestock } });
  } catch (err) {
    logger.error(`[AnimalHealthController] Livestock query error: ${err.message}`);
    next(err);
  }
}

// POST /api/v1/animal-health/vaccinations — Record vaccination event
async function recordVaccination(req, res, next) {
  try {
    const result = await animalHealthService.recordVaccination(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[AnimalHealthController] Vaccination record error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/vaccinations — Get vaccination status
async function getVaccinationStatus(req, res, next) {
  try {
    const { woredaId, animalType } = req.query;
    const records = await animalHealthService.getVaccinationStatus({ woredaId, animalType });
    res.json({ success: true, data: { total: records.length, records } });
  } catch (err) {
    logger.error(`[AnimalHealthController] Vaccination status error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/pasture-condition — Rangeland NDVI + forage quality
async function getPastureCondition(req, res, next) {
  try {
    const { lat, lng, woredaId } = req.query;
    if (!lat && !lng && !woredaId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'Provide lat & lng or woredaId' } });
    }
    const result = await animalHealthService.getPastureCondition({ lat, lng, woredaId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[AnimalHealthController] Pasture condition error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/risk-assessment — Combined animal health risk
async function getRiskAssessment(req, res, next) {
  try {
    const { woredaId } = req.query;
    if (!woredaId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'woredaId is required' } });
    }
    const result = await animalHealthService.getAnimalHealthRiskAssessment({ woredaId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[AnimalHealthController] Risk assessment error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/campaigns — Ongoing vaccination campaigns
async function getCampaigns(req, res, next) {
  try {
    const { woredaId, status } = req.query;
    const campaigns = await animalHealthService.getVaccinationCampaigns({ woredaId, status });
    res.json({ success: true, data: campaigns });
  } catch (err) {
    logger.error(`[AnimalHealthController] Campaigns error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/pasture — Multi-woreda pasture monitoring
async function getPastureMonitoring(req, res, next) {
  try {
    const { woredaId } = req.query;
    const pasture = await animalHealthService.getPastureMonitoring({ woredaId });
    res.json({ success: true, data: pasture });
  } catch (err) {
    logger.error(`[AnimalHealthController] Pasture monitoring error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/stats — Summary health KPIs
async function getHealthStats(req, res, next) {
  try {
    const { woredaId } = req.query;
    const stats = await animalHealthService.getHealthStats({ woredaId });
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error(`[AnimalHealthController] Health stats error: ${err.message}`);
    next(err);
  }
}

// GET /api/v1/animal-health/vet-calendar — Upcoming veterinary tasks
async function getVetCalendar(req, res) {
  const { month } = req.query;
  const result = animalHealthService.getUpcomingVetTasks(month ? Number(month) : undefined);
  res.json({ success: true, data: result });
}

module.exports = {
  getDiseases,
  getDiseaseDetails,
  reportOutbreak,
  getOutbreaks,
  registerLivestock,
  getLivestock,
  recordVaccination,
  getVaccinationStatus,
  getVaccinationCampaigns: getCampaigns,
  getCampaigns,
  getPastureCondition,
  getPastureMonitoring,
  getRiskAssessment,
  getHealthStats,
  getVetCalendar,
};
