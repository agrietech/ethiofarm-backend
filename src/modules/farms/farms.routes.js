const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const controller = require('./farms.controller');
const validate = require('../../middleware/validate.middleware');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

// POST /api/v1/farms – Register a new farm (Strictly FARMER only)
router.post(
  '/',
  authenticate,
  authorize('FARMER'),
  [
    body('farmName')
      .trim()
      .notEmpty()
      .withMessage('farmName is required')
      .isLength({ max: 200 })
      .withMessage('farmName must be at most 200 characters'),
    body('woredaId')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('woredaId must be a non-empty string'),
    body('polygonGeojson')
      .notEmpty()
      .withMessage('polygonGeojson GIS boundary is required to register a farm plot')
      .isObject()
      .withMessage('polygonGeojson must be a GeoJSON object'),
    body('polygonGeojson.type')
      .notEmpty()
      .isIn(['Polygon', 'Feature'])
      .withMessage('polygonGeojson.type must be "Polygon" or "Feature"'),
    body('polygonGeojson.coordinates')
      .isArray({ min: 1 })
      .withMessage('polygonGeojson.coordinates must be an array of rings'),
    body('latitude')
      .optional()
      .isFloat()
      .withMessage('latitude must be a valid number'),
    body('longitude')
      .optional()
      .isFloat()
      .withMessage('longitude must be a valid number'),
    body('primaryCrop')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('primaryCrop must be a non-empty string'),
    body('areaHectares')
      .optional()
      .isFloat({ gt: 0 })
      .withMessage('areaHectares must be greater than zero'),
  ],
  validate,
  controller.createFarm
);

// GET /api/v1/farms – List farms for the authenticated user
router.get('/', authenticate, controller.getFarms);

// GET /api/v1/farms/:id – Get single farm details
router.get('/:id', authenticate, controller.getFarmDetails);

// PUT & PATCH /api/v1/farms/:id – Update farm plot with OCC conflict protection
router.put(
  '/:id',
  authenticate,
  authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'),
  [
    body('farmName').optional().trim().notEmpty().withMessage('farmName cannot be empty').isLength({ max: 200 }),
    body('primaryCrop').optional().isString().trim().notEmpty(),
    body('areaHectares').optional().isFloat({ gt: 0 }),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('soilType').optional().isString(),
    body('irrigationType').optional().isString(),
    body('clientUpdatedAt').optional().isISO8601(),
  ],
  validate,
  controller.updateFarm
);

router.patch(
  '/:id',
  authenticate,
  authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'),
  [
    body('farmName').optional().trim().notEmpty().withMessage('farmName cannot be empty').isLength({ max: 200 }),
    body('primaryCrop').optional().isString().trim().notEmpty(),
    body('areaHectares').optional().isFloat({ gt: 0 }),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('soilType').optional().isString(),
    body('irrigationType').optional().isString(),
    body('clientUpdatedAt').optional().isISO8601(),
  ],
  validate,
  controller.updateFarm
);

// Planning & Agronomic Management Routes
router.post('/:id/planning/rotation', authenticate, controller.authorizeFarmAccess, controller.generateCropRotation);
router.get('/:id/planning/rotation', authenticate, controller.authorizeFarmAccess, controller.generateCropRotation);
router.get('/:id/planning/inputs', authenticate, controller.authorizeFarmAccess, controller.calculateInputs);
router.get('/:id/planning/calendar', authenticate, controller.authorizeFarmAccess, controller.getPlantingCalendar);

// Analytics & Peer Benchmarking Routes
router.get('/:id/analytics', authenticate, controller.authorizeFarmAccess, controller.getFarmAnalytics);
router.get('/:id/benchmarks', authenticate, controller.authorizeFarmAccess, controller.getFarmBenchmarks);

// DELETE /api/v1/farms/:id – Delete a farm plot
router.delete('/:id', authenticate, authorize('FARMER', 'DEVELOPMENT_AGENT', 'ADMIN'), controller.deleteFarm);

module.exports = router;

