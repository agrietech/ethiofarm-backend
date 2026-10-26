const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const controller = require('./farms.controller');
const validate = require('../../middleware/validate.middleware');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

// POST /api/v1/farms – Register a new farm (Farmers and Agricultural Experts / DAs / Officers / Admins)
router.post(
  '/',
  authenticate,
  authorize('FARMER', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
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
    body('kebeleId')
      .optional()
      .isString()
      .trim(),
    body('userId')
      .optional()
      .isString()
      .trim(),
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
  authorize('FARMER', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
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
  authorize('FARMER', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
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
router.delete('/:id', authenticate, authorize('FARMER', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'), controller.deleteFarm);

module.exports = router;

