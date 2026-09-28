const { prisma } = require('../../config/db');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

// Fallback memory cache
const memoryDashboardCache = new Map();

class FarmerDashboardService {
  /**
   * Complete Farmer-specific dashboard aggregation
   */
  async getFarmerDashboard(userId, woredaId, user = {}) {
    const cacheKey = `dashboard:farmer:${userId}`;

    // Check Redis cache first
    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryDashboardCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const myFarms = await this.getMyFarms(userId);
    const primaryFarm = myFarms?.[0];

    // Parallel data fetching for optimal latency
    const [
      myAlerts,
      sensorStatus,
      recentDiagnoses,
      advisories,
      marketPrices,
      weatherData,
    ] = await Promise.all([
      this.getMyAlerts(userId, woredaId),
      this.getSensorStatus(userId),
      this.getRecentDiagnoses(userId),
      this.getAdvisories(woredaId),
      this.getMarketPrices(woredaId),
      this.getWeatherSummary(woredaId, primaryFarm?.id, user),
    ]);

    const totalArea = myFarms.reduce((sum, f) => sum + (Number(f.areaHectares) || 0), 0);

    const dashboard = {
      userProfile: {
        userId,
        totalFarms: myFarms.length,
        totalAreaHectares: parseFloat(totalArea.toFixed(2)),
        activeSensors: sensorStatus.active,
        totalSensors: sensorStatus.total,
      },

      // Quick action cards
      quickActions: [
        {
          action: 'REPORT_ISSUE',
          label: 'Report Farm Problem',
          labelAm: 'የእርሻ ችግር ሪፖርት አድርግ',
          icon: 'alert-circle',
          route: '/report-issue',
        },
        {
          action: 'DIAGNOSE_DISEASE',
          label: 'Diagnose Crop Disease',
          labelAm: 'የሰብል በሽታ መርምር',
          icon: 'camera',
          route: '/disease-diagnosis',
        },
        {
          action: 'VIEW_WEATHER',
          label: '7-Day Forecast',
          labelAm: 'የ 7 ቀን የአየር ሁኔታ ትንበያ',
          icon: 'cloud',
          route: '/weather',
        },
        {
          action: 'MARKET_PRICES',
          label: 'Market Prices',
          labelAm: 'የእህል ገበያ ዋጋ',
          icon: 'trending-up',
          route: '/market',
        },
      ],

      // Farm status overview
      farmOverview: {
        farms: myFarms.map((f) => {
          const farmAlerts = myAlerts.filter((a) => a.farmId === f.id);
          const healthStatus = this.calculateFarmHealth(f, farmAlerts.length);
          return {
            id: f.id,
            name: f.farmName,
            areaHectares: f.areaHectares,
            primaryCrop: f.primaryCrop,
            soilType: f.soilType,
            healthStatus,
            alertCount: farmAlerts.length,
            lastVisitedAt: f.updatedAt,
            nextAction: this.recommendNextAction(f, farmAlerts.length),
          };
        }),
        atRiskFarms: myFarms.filter((f) => this.calculateFarmHealth(f, 0) === 'AT_RISK').length,
      },

      // Active alerts requiring immediate action
      activeAlerts: myAlerts.slice(0, 5).map((a) => ({
        id: a.id,
        hazardType: a.hazardType,
        severity: a.severity,
        title: a.titleAm || a.titleEn || `${a.hazardType} Alert`,
        titleEn: a.titleEn,
        titleAm: a.titleAm,
        message: a.messageAm || a.messageEn,
        actionRequired: a.actionItems || ['Inspect crops and prepare preventive irrigation/drainage.'],
        createdAt: a.createdAt,
        isUrgent: a.severity === 'CRITICAL' || a.severity === 'HIGH',
      })),

      // Weather forecast with agricultural advice
      weather: weatherData,

      // Sensor telemetry dashboard
      sensors: {
        summary: sensorStatus,
        latestReadings: sensorStatus.latestReadings,
        alerts: sensorStatus.alerts,
      },

      // Recent disease diagnoses
      recentDiagnoses: recentDiagnoses.slice(0, 5).map((d) => ({
        id: d.id,
        farmName: d.farm?.farmName || 'Primary Farm',
        diseaseName: d.diseaseName || d.diagnosis,
        severity: d.severity || 'MODERATE',
        confidence: d.confidence || 0.85,
        treatment: d.treatmentAm || d.treatmentEn || d.recommendation,
        diagnosedAt: d.createdAt,
      })),

      // Personalized agronomic advisories
      advisories: advisories.slice(0, 5).map((adv) => ({
        id: adv.id,
        title: adv.titleAm || adv.titleEn,
        advice: adv.adviceAm || adv.adviceEn,
        cropType: adv.cropType,
        severity: adv.severity,
        validUntil: adv.validUntil,
      })),

      // Local commodity market prices (ETB / Quintal)
      marketPrices,

      // Seasonal calendar & upcoming agronomic operations
      calendar: {
        currentSeason: this.getCurrentSeason(),
        upcomingActivities: this.getUpcomingActivities(),
      },

      // Projected performance metrics
      performance: {
        estimatedYieldQuintals: parseFloat((totalArea * 28.5).toFixed(1)),
        waterEfficiencyScore: 84,
        projectedRevenueEtb: Math.round(totalArea * 145000),
      },
    };

    // Cache for 5 minutes (300 seconds)
    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(dashboard));
      } catch (_err) {}
    } else {
      memoryDashboardCache.set(cacheKey, { data: dashboard, expires: Date.now() + 300000 });
    }

    return dashboard;
  }

  async getMyFarms(userId) {
    try {
      return await prisma.farm.findMany({
        where: { userId },
        include: {
          woreda: { select: { nameEn: true, nameAm: true, zone: { select: { nameEn: true } } } },
          sensors: { select: { id: true, sensorType: true, isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.warn(`[FarmerDashboard] Failed to fetch farms: ${err.message}`);
      return [];
    }
  }

  async getMyAlerts(userId, woredaId) {
    try {
      const whereClause = { status: 'ACTIVE' };
      if (woredaId) {
        whereClause.woredaId = woredaId;
      }
      return await prisma.alert.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch (err) {
      logger.warn(`[FarmerDashboard] Failed to fetch alerts: ${err.message}`);
      return [];
    }
  }

  async getSensorStatus(userId) {
    try {
      const userFarms = await prisma.farm.findMany({
        where: { userId },
        select: { id: true },
      });
      const farmIds = userFarms.map((f) => f.id);

      const sensors = await prisma.sensor.findMany({
        where: { farmId: { in: farmIds } },
        include: {
          readings: { take: 1, orderBy: { recordedAt: 'desc' } },
          farm: { select: { farmName: true } },
        },
      });

      const active = sensors.filter((s) => s.isActive).length;
      const latestReadings = sensors
        .filter((s) => s.readings && s.readings.length > 0)
        .map((s) => ({
          sensorId: s.id,
          sensorType: s.sensorType,
          farmName: s.farm?.farmName,
          value: s.readings[0].value,
          unit: s.readings[0].unit,
          recordedAt: s.readings[0].recordedAt,
          status: s.readings[0].status || 'NORMAL',
        }));

      return {
        total: sensors.length,
        active,
        offline: sensors.length - active,
        latestReadings,
        alerts: latestReadings.filter((r) => r.status === 'WARNING' || r.status === 'ALERT'),
      };
    } catch (err) {
      return { total: 0, active: 0, offline: 0, latestReadings: [], alerts: [] };
    }
  }

  async getRecentDiagnoses(userId) {
    try {
      const userFarms = await prisma.farm.findMany({
        where: { userId },
        select: { id: true },
      });
      const farmIds = userFarms.map((f) => f.id);

      return await prisma.diseaseDiagnosis.findMany({
        where: { farmId: { in: farmIds } },
        include: { farm: { select: { farmName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch (err) {
      return [];
    }
  }

  async getAdvisories(woredaId) {
    try {
      const where = woredaId ? { woredaId } : {};
      return await prisma.advisory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch (err) {
      return [];
    }
  }

  getMarketPrices(_woredaId) {
    // Current typical Ethiopian commodity market prices (ETB per 100kg quintal)
    return [
      { commodity: 'Teff (Magna / White)', commodityAm: 'ነጭ ጤፍ', pricePerQuintal: 11500, trend: 'up', market: 'Addis Ababa / Regional' },
      { commodity: 'Wheat (Durum)', commodityAm: 'ስንዴ', pricePerQuintal: 4800, trend: 'stable', market: 'Adama' },
      { commodity: 'Maize (Corn)', commodityAm: 'በቆሎ', pricePerQuintal: 3600, trend: 'down', market: 'Hawassa' },
      { commodity: 'Barley', commodityAm: 'ገብስ', pricePerQuintal: 4200, trend: 'stable', market: 'Bishoftu' },
      { commodity: 'Coffee (Grade 1)', commodityAm: 'ቡና', pricePerQuintal: 38000, trend: 'up', market: 'ECX Jimma' },
    ];
  }

  async getWeatherSummary(woredaId, farmId = null, user = {}) {
    const { getScopedWeatherSummary } = require('./dashboardWeatherHelper');
    return getScopedWeatherSummary({ woredaId, farmId, user });
  }

  calculateFarmHealth(farm, alertCount = 0) {
    if (alertCount > 0) return 'AT_RISK';
    if (farm.soilType && farm.areaHectares) return 'HEALTHY';
    return 'MODERATE';
  }

  recommendNextAction(farm, alertCount = 0) {
    if (alertCount > 0) {
      return { action: 'REVIEW_ALERTS', label: 'Review Active Alerts', priority: 'HIGH' };
    }
    return { action: 'INSPECT_SOIL', label: 'Inspect Soil Moisture & Growth Stage', priority: 'MEDIUM' };
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 6 && month <= 9) return { code: 'KIREMT', name: 'Kiremt (Main Rainy Season)', seasonAm: 'ክረምት' };
    if (month >= 10 || month <= 1) return { code: 'BALEG', name: 'Bega (Harvest & Dry Season)', seasonAm: 'በጋ' };
    return { code: 'BELG', name: 'Belg (Short Rainy Season)', seasonAm: 'በልግ' };
  }

  getUpcomingActivities() {
    return [
      { activity: 'Top-dressing with UREA', period: 'Days 35-42 after emergence', priority: 'HIGH' },
      { activity: 'Fall armyworm field scout', period: 'Weekly monitoring', priority: 'CRITICAL' },
      { activity: 'Drainage trench clearance', period: 'Prior to peak rain weeks', priority: 'MEDIUM' },
    ];
  }
}

module.exports = new FarmerDashboardService();
