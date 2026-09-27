const express = require('express');
const router = express.Router();
const controller = require('./hazards.controller');
const mapController = require('./hazardMapController');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

// All hazard routes require authentication
router.use(authenticate);

// Multi-hazard integrated assessment
router.get('/assess', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.assessMultiHazard);

// Earthquake / Seismology endpoints
router.get('/earthquakes', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.getLiveEarthquakes);
router.get('/earthquakes/assess', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.assessEarthquakeRisk);

// Soil degradation / erosion
router.get('/soil-degradation', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.assessSoilDegradation);

// Landslide susceptibility
router.get('/landslides', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.assessLandslideRisk);

// Volcanic proximity risk
router.get('/volcanic', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.assessVolcanicRisk);

// National hazard summary
router.get('/national-summary', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER'), controller.getNationalHazardSummary);

// ─── Hazard Map Data Endpoints ────────────────────────────────────────────────
router.get('/map/layers', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), mapController.getAvailableLayers);
router.get('/map/regions', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), mapController.getRegionHazardMap);
router.get('/map/zones/:regionId', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), mapController.getZoneHazardMap);
router.get('/map/woredas/:zoneId', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), mapController.getWoredaHazardMap);

module.exports = router;
