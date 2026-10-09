const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const controller = require('./boundaries.controller');
const validate = require('../../middleware/validate.middleware');
const { setCacheHeaders } = require('../../middleware/cache-control.middleware');
const { authenticate, authorize, optionalAuthenticate } = require('../../middleware/auth.middleware');

// Administrative boundary data is intentionally public for map rendering and
// coordinate resolution use cases (e.g., Flutter map, USSD location lookup).
// optionalAuthenticate attaches user context when a token is present — enabling
// future audit logging and personalized scope responses — while not blocking
// unauthenticated access to the reference data.
router.get('/regions', optionalAuthenticate, setCacheHeaders(3600), controller.getRegions);
router.get('/zones', optionalAuthenticate, setCacheHeaders(3600), controller.getZones);
router.get('/woredas', optionalAuthenticate, setCacheHeaders(3600), controller.getWoredas);
router.get('/woredas/:id', optionalAuthenticate, setCacheHeaders(3600), controller.getWoredaDetails);
router.get('/kebeles', optionalAuthenticate, setCacheHeaders(3600), controller.getKebeles);
router.get('/kebeles/:id', optionalAuthenticate, setCacheHeaders(3600), controller.getKebeleDetails);

// Register a new Kebele boundary with polygon (Development Agents, Officers, and Admin)
router.post(
  '/kebeles',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  [
    body('nameEn')
      .trim()
      .notEmpty()
      .withMessage('nameEn (Kebele name) is required')
      .isLength({ max: 200 })
      .withMessage('nameEn must be at most 200 characters'),
    body('woredaId')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('woredaId must be a non-empty string'),
    body('centerLat')
      .optional()
      .isFloat()
      .withMessage('centerLat must be a valid number'),
    body('centerLng')
      .optional()
      .isFloat()
      .withMessage('centerLng must be a valid number'),
    body('polygonGeojson')
      .optional()
      .custom((value) => {
        if (!value) return true;
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
            return true;
          } catch {
            throw new Error('polygonGeojson must be valid JSON');
          }
        }
        if (typeof value === 'object' && value !== null) return true;
        throw new Error('polygonGeojson must be a GeoJSON object or JSON string');
      }),
  ],
  validate,
  controller.createKebele
);

// Development Agent / Officers / Admin endpoint to insert/update Kebele location and polygon boundary in GIS
router.put(
  '/kebeles/:id/polygon',
  authenticate,
  authorize('DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
  [
    body('polygonGeojson')
      .notEmpty()
      .withMessage('polygonGeojson boundary is required')
      .isObject()
      .withMessage('polygonGeojson must be a GeoJSON object'),
    body('polygonGeojson.type')
      .notEmpty()
      .isIn(['Polygon', 'Feature'])
      .withMessage('polygonGeojson.type must be "Polygon" or "Feature"'),
    body('polygonGeojson.coordinates')
      .isArray({ min: 1 })
      .withMessage('polygonGeojson.coordinates must be an array of rings with at least 1 linear ring'),
  ],
  validate,
  controller.updateKebelePolygon
);

router.get('/hierarchy', optionalAuthenticate, setCacheHeaders(3600), controller.getHierarchy);
router.get('/summary', optionalAuthenticate, setCacheHeaders(3600), controller.getNationalSummary);
router.get('/resolve-coords', optionalAuthenticate, controller.resolveCoordinates);

module.exports = router;
