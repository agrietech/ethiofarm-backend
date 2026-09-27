const express = require('express');
const router = express.Router();
const controller = require('./animalHealth.controller');
const { authenticate, authorize, authorizeWoredaScope } = require('../../middleware/auth.middleware');

// All animal health routes require authentication
router.use(authenticate);

// Disease reference database (read-only, all roles)
router.get('/diseases', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.getDiseases);
router.get('/diseases/:diseaseId', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.getDiseaseDetails);

// Outbreak reporting and tracking
router.post('/outbreaks', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.reportOutbreak);
router.get('/outbreaks', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.getOutbreaks);

// Livestock registry
router.post('/livestock', authorize('ADMIN', 'RESEARCHER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.registerLivestock);
router.get('/livestock', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getLivestock);

// Vaccination campaigns
router.post('/vaccinations', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT'), authorizeWoredaScope('woredaId'), controller.recordVaccination);
router.get('/vaccinations', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getVaccinationStatus);
router.get('/campaigns', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getCampaigns);

// Pasture/forage condition (NDVI-based)
router.get('/pasture-condition', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getPastureCondition);
router.get('/pasture', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getPastureMonitoring);

// Health statistics summary
router.get('/stats', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getHealthStats);

// Combined animal health risk assessment
router.get('/risk-assessment', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), authorizeWoredaScope('woredaId'), controller.getRiskAssessment);

// Veterinary calendar
router.get('/vet-calendar', authorize('ADMIN', 'RESEARCHER', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'FARMER'), controller.getVetCalendar);

module.exports = router;
