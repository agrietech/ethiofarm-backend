const service = require('./cropProtection.service');
const { ETHIOPIAN_PEST_REGISTRY } = require('./pestDatabase');
const { NUTRIENT_DEFICIENCIES } = require('./nutrientDeficiencyRules');
const { COMMON_AGROCHEMICALS } = require('./tankMixDatabase');
const { ETHIOPIAN_CROP_AGRONOMY } = require('./seedRateDatabase');

/**
 * Controller for Smart Crop Protection & Precision Field Management Suite
 */
class CropProtectionController {
  async detectWeed(req, res, next) {
    try {
      const { cropType, areaHectares, imageBase64, imageUrl, language } = req.body;
      const result = await service.detectWeed({
        imageBase64,
        imageUrl,
        imageFile: req.file,
        cropType: cropType || 'Wheat',
        areaHectares: parseFloat(areaHectares) || 1.0,
        language: language || 'en'
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getWeeds(req, res, next) {
    try {
      const { cropType, weedType } = req.query;
      const result = service.getWeedDatabase({ cropType, weedType });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getSprayWindow(req, res, next) {
    try {
      const { latitude, longitude, farmId } = req.query;
      const result = await service.evaluateSprayWindow({
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        farmId,
        user: req.user,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async scanNutrient(req, res, next) {
    try {
      const { cropType, leafPosition, pattern, soilPh, imageBase64, imageUrl, language } = req.body;
      const result = await service.scanNutrientDeficiency({
        imageBase64,
        imageUrl,
        imageFile: req.file,
        cropType: cropType || 'Maize',
        leafPosition: leafPosition || 'older',
        pattern: pattern || 'v_shaped',
        soilPh: soilPh ? parseFloat(soilPh) : 6.5,
        language: language || 'en'
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getNutrients(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: {
          total: NUTRIENT_DEFICIENCIES.length,
          deficiencies: NUTRIENT_DEFICIENCIES
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async scoutPest(req, res, next) {
    try {
      const { pestId, cropType, cropStage, observedDamagePercent, infestedPlantsCount, totalSampledPlants, imageBase64, imageUrl, language } = req.body;
      const result = await service.scoutPest({
        imageBase64,
        imageUrl,
        imageFile: req.file,
        pestId,
        cropType: cropType || 'Maize',
        cropStage: cropStage || 'midWhorl',
        observedDamagePercent: observedDamagePercent !== undefined ? parseFloat(observedDamagePercent) : 15,
        infestedPlantsCount: infestedPlantsCount !== undefined && infestedPlantsCount !== null ? parseInt(infestedPlantsCount, 10) : null,
        totalSampledPlants: totalSampledPlants !== undefined ? parseInt(totalSampledPlants, 10) : 100,
        language: language || 'en'
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getPests(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: {
          total: ETHIOPIAN_PEST_REGISTRY.length,
          pests: ETHIOPIAN_PEST_REGISTRY
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async validateTankMix(req, res, next) {
    try {
      let { productIds, waterVolumeLiters } = req.body;
      if (typeof productIds === 'string') {
        productIds = productIds.split(',').map(s => s.trim()).filter(Boolean);
      }
      const result = service.validateTankMix({
        productIds: Array.isArray(productIds) ? productIds : [],
        waterVolumeLiters: parseFloat(waterVolumeLiters) || 16
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getAgrochemicals(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: {
          total: COMMON_AGROCHEMICALS.length,
          chemicals: COMMON_AGROCHEMICALS
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async calculateSeed(req, res, next) {
    try {
      const { cropId, areaValue, areaUnit, plantingMethod } = req.body;
      const result = service.calculateSeedAndPlanting({
        cropId: cropId || 'teff',
        areaValue: areaValue !== undefined ? parseFloat(areaValue) : 1.0,
        areaUnit: areaUnit || 'HECTARES',
        plantingMethod: plantingMethod || 'ROW'
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getCrops(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: {
          total: ETHIOPIAN_CROP_AGRONOMY.length,
          crops: ETHIOPIAN_CROP_AGRONOMY
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CropProtectionController();
