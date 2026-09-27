const { prisma } = require('../../../config/db');
const { NotFoundError } = require('../../../utils/errors');

class FarmAnalyticsService {
  /**
   * Get comprehensive farm dashboard
   */
  async getFarmDashboard(farmId) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        crop: true,
        sensors: { where: { isActive: true } },
        user: { select: { fullName: true, phoneNumber: true } }
      }
    });

    if (!farm) throw new NotFoundError('Farm not found');

    const [yieldHistory, activities, benchmarks] = await Promise.all([
      this.getYieldHistory(farmId),
      this.getRecentActivities(farmId, 10),
      this.getBenchmarks(farmId)
    ]);

    return {
      farmInfo: {
        id: farm.id,
        name: farm.farmName,
        area: farm.areaHectares,
        crop: farm.primaryCrop,
        owner: farm.user.fullName,
        activeSensors: farm.sensors.length
      },
      performance: {
        yieldHistory,
        averageYield: this.calculateAverage(yieldHistory.map(y => y.yield)),
        trend: this.calculateTrend(yieldHistory)
      },
      activities,
      benchmarks
    };
  }

  /**
   * Get yield history
   */
  async getYieldHistory(farmId, years = 3) {
    const records = await prisma.farmYieldRecord.findMany({
      where: { farmId },
      orderBy: { harvestDate: 'desc' },
      take: years
    });

    return records.map(r => ({
      year: r.harvestDate.getFullYear(),
      season: r.season,
      yield: r.yieldQuintals,
      quality: r.quality,
      harvestDate: r.harvestDate
    }));
  }

  /**
   * Get recent farm activities
   */
  async getRecentActivities(farmId, limit = 10) {
    const activities = await prisma.farmActivity.findMany({
      where: { farmId },
      orderBy: { activityDate: 'desc' },
      take: limit
    });

    return activities.map(a => ({
      id: a.id,
      type: a.activityType,
      description: a.description,
      date: a.activityDate,
      cost: a.cost
    }));
  }

  /**
   * Get benchmarks (compare with woreda averages)
   */
  async getBenchmarks(farmId) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { crop: true }
    });

    if (!farm) return null;

    // Get woreda average for same crop
    const woredaFarms = await prisma.farm.findMany({
      where: {
        woredaId: farm.woredaId,
        primaryCrop: farm.primaryCrop
      },
      include: {
        yieldRecords: {
          take: 1,
          orderBy: { harvestDate: 'desc' }
        }
      }
    });

    const yields = woredaFarms
      .map(f => f.yieldRecords[0]?.yieldQuintals)
      .filter(Boolean);

    const woredaAverage = yields.length > 0 
      ? yields.reduce((a, b) => a + b, 0) / yields.length 
      : 0;

    return {
      woredaAverage: Math.round(woredaAverage * 10) / 10,
      totalFarmsInWoreda: woredaFarms.length,
      crop: farm.primaryCrop
    };
  }

  /**
   * Calculate profitability
   */
  async calculateProfitability(farmId, season = 'MEHER') {
    const [yieldRecord, activities] = await Promise.all([
      prisma.farmYieldRecord.findFirst({
        where: { farmId, season },
        orderBy: { harvestDate: 'desc' }
      }),
      prisma.farmActivity.findMany({
        where: { farmId }
      })
    ]);

    const totalCost = activities.reduce((sum, a) => sum + (a.cost || 0), 0);
    const revenue = yieldRecord ? yieldRecord.yieldQuintals * 3000 : 0; // ETB per quintal
    const profit = revenue - totalCost;

    return {
      season,
      revenue,
      totalCost,
      profit,
      profitMargin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0
    };
  }

  /**
   * Helper: Calculate average
   */
  calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    return Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10;
  }

  /**
   * Helper: Calculate trend
   */
  calculateTrend(yieldHistory) {
    if (yieldHistory.length < 2) return 'STABLE';
    const recent = yieldHistory[0]?.yield || 0;
    const previous = yieldHistory[1]?.yield || 0;
    
    if (recent > previous * 1.1) return 'IMPROVING';
    if (recent < previous * 0.9) return 'DECLINING';
    return 'STABLE';
  }
}

module.exports = new FarmAnalyticsService();
