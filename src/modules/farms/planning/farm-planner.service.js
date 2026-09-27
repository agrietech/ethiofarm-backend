const { prisma } = require('../../../config/db');
const { NotFoundError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

class FarmPlannerService {
  /**
   * Generate crop rotation plan
   */
  async generateCropRotationPlan(farmId, years = 3) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { crop: true, woreda: true }
    });

    if (!farm) throw new NotFoundError('Farm not found');

    const plan = [];
    const rotationSequence = this.getRotationSequence(farm.primaryCrop);

    for (let year = 1; year <= years; year++) {
      const cropIndex = (year - 1) % rotationSequence.length;
      const crop = rotationSequence[cropIndex];

      plan.push({
        year,
        season: 'MEHER',
        crop: crop.name,
        plantingMonth: crop.plantingMonth,
        harvestMonth: crop.harvestMonth,
        expectedYield: this.estimateYield(farm, crop),
        benefits: crop.benefits
      });
    }

    // Save plan
    await prisma.cropRotationPlan.create({
      data: {
        farmId,
        years,
        plan: plan,
        status: 'DRAFT'
      }
    });

    logger.info(`[FarmPlanner] Generated ${years}-year rotation plan for farm ${farmId}`);

    return {
      farmId,
      farmName: farm.farmName,
      currentCrop: farm.primaryCrop,
      rotationPlan: plan
    };
  }

  /**
   * Get rotation sequence for a crop
   */
  getRotationSequence(currentCrop) {
    const rotations = {
      WHEAT: [
        { name: 'WHEAT', plantingMonth: 6, harvestMonth: 11, benefits: 'Main cereal crop' },
        { name: 'PULSES', plantingMonth: 6, harvestMonth: 11, benefits: 'Nitrogen fixation' },
        { name: 'BARLEY', plantingMonth: 6, harvestMonth: 11, benefits: 'Disease break' }
      ],
      TEFF: [
        { name: 'TEFF', plantingMonth: 6, harvestMonth: 11, benefits: 'High-value crop' },
        { name: 'FABA_BEAN', plantingMonth: 7, harvestMonth: 12, benefits: 'Soil enrichment' },
        { name: 'WHEAT', plantingMonth: 6, harvestMonth: 11, benefits: 'Stable yield' }
      ],
      MAIZE: [
        { name: 'MAIZE', plantingMonth: 4, harvestMonth: 9, benefits: 'High biomass' },
        { name: 'BEANS', plantingMonth: 4, harvestMonth: 8, benefits: 'Nitrogen fixation' },
        { name: 'SORGHUM', plantingMonth: 5, harvestMonth: 10, benefits: 'Drought tolerant' }
      ]
    };

    return rotations[currentCrop] || rotations.WHEAT;
  }

  /**
   * Estimate yield
   */
  estimateYield(farm, crop) {
    const baseYield = {
      WHEAT: 2.5,
      TEFF: 1.8,
      MAIZE: 3.5,
      BARLEY: 2.0,
      PULSES: 1.5
    };

    const yieldPerHa = baseYield[crop.name] || 2.0;
    return Math.round(yieldPerHa * (farm.areaHectares || 1) * 10) / 10;
  }

  /**
   * Generate planting calendar
   */
  async generatePlantingCalendar(farmId) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { crop: true }
    });

    if (!farm) throw new NotFoundError('Farm not found');

    const activities = [
      { activity: 'LAND_PREPARATION', startMonth: 5, duration: 2, priority: 'HIGH' },
      { activity: 'PLANTING', startMonth: 6, duration: 1, priority: 'CRITICAL' },
      { activity: 'FIRST_WEEDING', startMonth: 7, duration: 1, priority: 'HIGH' },
      { activity: 'FERTILIZER_APPLICATION', startMonth: 8, duration: 1, priority: 'HIGH' },
      { activity: 'PEST_MONITORING', startMonth: 7, duration: 4, priority: 'MEDIUM' },
      { activity: 'HARVESTING', startMonth: 11, duration: 2, priority: 'CRITICAL' }
    ];

    logger.info(`[FarmPlanner] Generated planting calendar for farm ${farmId}`);

    return {
      farmId,
      crop: farm.primaryCrop,
      activities
    };
  }

  /**
   * Calculate input requirements
   */
  async calculateInputRequirements(farmId) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { crop: true }
    });

    if (!farm) throw new NotFoundError('Farm not found');

    const area = farm.areaHectares || 1;

    return {
      farmId,
      area,
      seeds: {
        quantity: Math.round(area * 100), // kg
        estimatedCost: Math.round(area * 100 * 15) // ETB
      },
      fertilizers: {
        urea: {
          quantity: Math.round(area * 100), // kg
          estimatedCost: Math.round(area * 100 * 20)
        },
        dap: {
          quantity: Math.round(area * 100), // kg
          estimatedCost: Math.round(area * 100 * 25)
        }
      },
      labor: {
        personDays: Math.round(area * 22),
        estimatedCost: Math.round(area * 22 * 150) // ETB
      }
    };
  }
}

module.exports = new FarmPlannerService();
