const { prisma } = require('../../config/db');
const redis = require('../../config/redis');
const { getScopedWeatherSummary } = require('./dashboardWeatherHelper');

// Fallback memory cache
const memoryOfficerCache = new Map();

class OfficerDashboardService {
  /**
   * Command Center for Woreda Agricultural Officers
   */
  async getWoredaCommandCenter(userId, woredaId, user = {}) {
    const cacheKey = `dashboard:officer:woreda:${woredaId || 'all'}`;

    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryOfficerCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const scope = { woredaId, zoneId: null, regionId: null };

    const [
      woredaRecord,
      farmsCount,
      farmersCount,
      activeAlerts,
      sensorStats,
      developmentAgents,
      riskStats,
      weatherData,
      farmDistribution,
    ] = await Promise.all([
      this.getWoredaDetails(woredaId),
      this.getFarmsCount(scope),
      this.getFarmersCount(scope),
      this.getActiveAlerts(scope),
      this.getSensorNetwork(scope),
      this.getDevelopmentAgents(scope),
      this.getRiskHeatmap(scope),
      getScopedWeatherSummary({ woredaId, user }),
      this.getFarmDistribution(scope),
    ]);

    const dashboard = {
      jurisdiction: {
        level: 'WOREDA',
        woredaId: woredaRecord?.id || woredaId || 'ET040101',
        nameEn: woredaRecord?.nameEn || 'Woreda Command',
        nameAm: woredaRecord?.nameAm || 'የወረዳ እርሻ መምሪያ',
        zoneName: woredaRecord?.zone?.nameEn || 'Regional Zone',
        regionName: woredaRecord?.zone?.region?.nameEn || 'Oromia / National',
        totalFarms: farmsCount.count,
        totalAreaHectares: farmsCount.totalArea,
        totalRegisteredFarmers: farmersCount,
        kebelesCount: woredaRecord?.kebeles?.length || 12,
      },

      // Emergency Command Panel
      emergencyPanel: {
        activeEmergencies: activeAlerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
        totalActiveAlerts: activeAlerts.length,
        criticalAlerts: activeAlerts.slice(0, 5).map((a) => ({
          id: a.id,
          hazardType: a.hazardType,
          severity: a.severity,
          title: a.titleAm || a.titleEn,
          status: a.status,
          dispatchedAt: a.createdAt,
          targetKebele: a.kebele || 'Woreda Wide',
        })),
        responseTeamsAvailable: 4,
      },

      // Risk assessment heatmap
      riskMap: riskStats,

      // Farm distribution and agro-ecological health
      farmDistribution,

      // Sensor Network Telemetry Status
      sensorNetwork: sensorStats,

      // Kebele Development Agents (DA) Management
      developmentAgents,

      // Agricultural Resource Allocation & Inputs
      resourceAllocation: {
        fertilizersUreaTons: 450,
        fertilizersDapTons: 380,
        certifiedSeedsQuintals: 1200,
        pesticidesLiters: 850,
        distributionProgressPercent: 78,
      },

      // Quick Officer Actions
      quickActions: [
        { action: 'BROADCAST_ALERT', label: 'Broadcast Emergency Alert', icon: 'alert-triangle' },
        { action: 'ASSIGN_DA', label: 'Assign Development Agent', icon: 'user-plus' },
        { action: 'APPROVE_REQUESTS', label: 'Review Role Upgrades', icon: 'check-circle' },
        { action: 'VIEW_REPORTS', label: 'Generate Woreda Report', icon: 'file-text' },
      ],

      // Live Scoped Weather Telemetry
      weather: weatherData,
    };

    // Cache for 2 minutes
    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(cacheKey, 120, JSON.stringify(dashboard));
      } catch (_err) {}
    } else {
      memoryOfficerCache.set(cacheKey, { data: dashboard, expires: Date.now() + 120000 });
    }

    return dashboard;
  }

  /**
   * Command Center for Zonal Agricultural Officers
   * Properly scoped: filters all data to woredas within the assigned zone
   */
  async getZonalCommandCenter(userId, zoneId, user = {}) {
    const cacheKey = `dashboard:officer:zone:${zoneId || 'all'}`;

    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryOfficerCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const scope = { woredaId: null, zoneId, regionId: null };

    // Resolve zone details
    let zoneRecord = null;
    let woredaCount = 0;
    try {
      zoneRecord = await prisma.zone.findUnique({
        where: { id: zoneId },
        include: { region: true },
      });
      woredaCount = await prisma.woreda.count({ where: { zoneId } });
    } catch (_e) {}

    const [
      farmsCount,
      farmersCount,
      activeAlerts,
      sensorStats,
      developmentAgents,
      riskStats,
      weatherData,
      farmDistribution,
    ] = await Promise.all([
      this.getFarmsCount(scope),
      this.getFarmersCount(scope),
      this.getActiveAlerts(scope),
      this.getSensorNetwork(scope),
      this.getDevelopmentAgents(scope),
      this.getRiskHeatmap(scope),
      getScopedWeatherSummary({ zoneId, user }),
      this.getFarmDistribution(scope),
    ]);

    const dashboard = {
      jurisdiction: {
        level: 'ZONE',
        zoneId: zoneRecord?.id || zoneId,
        nameEn: zoneRecord?.nameEn || 'Zonal Command',
        nameAm: zoneRecord?.nameAm || 'የዞን እርሻ መምሪያ',
        regionName: zoneRecord?.region?.nameEn || 'Region',
        totalWoredas: woredaCount || 14,
        totalFarms: farmsCount.count,
        totalAreaHectares: farmsCount.totalArea,
        totalRegisteredFarmers: farmersCount,
      },
      emergencyPanel: {
        activeEmergencies: activeAlerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
        totalActiveAlerts: activeAlerts.length,
        criticalAlerts: activeAlerts.slice(0, 5).map((a) => ({
          id: a.id, hazardType: a.hazardType, severity: a.severity,
          title: a.titleAm || a.titleEn, status: a.status, dispatchedAt: a.createdAt,
        })),
        responseTeamsAvailable: 4,
      },
      riskMap: riskStats,
      farmDistribution,
      sensorNetwork: sensorStats,
      developmentAgents,
      quickActions: [
        { action: 'BROADCAST_ALERT', label: 'Broadcast Zonal Alert', icon: 'alert-triangle' },
        { action: 'VIEW_REPORTS', label: 'Generate Zone Report', icon: 'file-text' },
        { action: 'APPROVE_REQUESTS', label: 'Review Role Upgrades', icon: 'check-circle' },
      ],

      // Live Scoped Weather Telemetry
      weather: weatherData,
    };

    if (redis && typeof redis.setex === 'function') {
      try { await redis.setex(cacheKey, 120, JSON.stringify(dashboard)); } catch (_err) {}
    } else {
      memoryOfficerCache.set(cacheKey, { data: dashboard, expires: Date.now() + 120000 });
    }

    return dashboard;
  }

  /**
   * Command Center for Regional Agricultural Officers
   * Properly scoped: filters all data to woredas/zones within the assigned region
   */
  async getRegionalCommandCenter(userId, regionId, user = {}) {
    const cacheKey = `dashboard:officer:region:${regionId || 'all'}`;

    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryOfficerCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const scope = { woredaId: null, zoneId: null, regionId };

    // Resolve region details
    let regionRecord = null;
    let zoneCount = 0;
    let woredaCount = 0;
    try {
      regionRecord = await prisma.region.findUnique({ where: { id: regionId } });
      zoneCount = await prisma.zone.count({ where: { regionId } });
      woredaCount = await prisma.woreda.count({ where: { zone: { regionId } } });
    } catch (_e) {}

    const [
      farmsCount,
      farmersCount,
      activeAlerts,
      sensorStats,
      developmentAgents,
      riskStats,
      weatherData,
      farmDistribution,
    ] = await Promise.all([
      this.getFarmsCount(scope),
      this.getFarmersCount(scope),
      this.getActiveAlerts(scope),
      this.getSensorNetwork(scope),
      this.getDevelopmentAgents(scope),
      this.getRiskHeatmap(scope),
      getScopedWeatherSummary({ regionId, user }),
      this.getFarmDistribution(scope),
    ]);

    const dashboard = {
      jurisdiction: {
        level: 'REGION',
        regionId: regionRecord?.id || regionId,
        nameEn: regionRecord?.nameEn || 'Regional Command',
        nameAm: regionRecord?.nameAm || 'የክልል እርሻ መምሪያ',
        totalZones: zoneCount || 18,
        totalWoredas: woredaCount || 330,
        totalFarms: farmsCount.count,
        totalAreaHectares: farmsCount.totalArea,
        totalRegisteredFarmers: farmersCount,
      },
      emergencyPanel: {
        activeEmergencies: activeAlerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
        totalActiveAlerts: activeAlerts.length,
        criticalAlerts: activeAlerts.slice(0, 5).map((a) => ({
          id: a.id, hazardType: a.hazardType, severity: a.severity,
          title: a.titleAm || a.titleEn, status: a.status, dispatchedAt: a.createdAt,
        })),
        responseTeamsAvailable: 4,
      },
      riskMap: riskStats,
      farmDistribution,
      sensorNetwork: sensorStats,
      developmentAgents,
      quickActions: [
        { action: 'BROADCAST_ALERT', label: 'Broadcast Regional Alert', icon: 'alert-triangle' },
        { action: 'VIEW_REPORTS', label: 'Generate Region Report', icon: 'file-text' },
        { action: 'APPROVE_REQUESTS', label: 'Review Role Upgrades', icon: 'check-circle' },
      ],

      // Live Scoped Weather Telemetry
      weather: weatherData,
    };

    if (redis && typeof redis.setex === 'function') {
      try { await redis.setex(cacheKey, 120, JSON.stringify(dashboard)); } catch (_err) {}
    } else {
      memoryOfficerCache.set(cacheKey, { data: dashboard, expires: Date.now() + 120000 });
    }

    return dashboard;
  }

  // ── Shared Helper Methods with Scope Support ──

  async getWoredaDetails(woredaId) {
    if (!woredaId) return null;
    try {
      return await prisma.woreda.findUnique({
        where: { id: woredaId },
        include: {
          zone: { include: { region: true } },
          kebeles: { select: { id: true, nameEn: true } },
        },
      });
    } catch (e) {
      return null;
    }
  }

  /** Build Prisma where for farms from scope */
  _buildFarmWhere(scope) {
    if (scope.woredaId) return { woredaId: scope.woredaId };
    if (scope.zoneId) return { woreda: { zoneId: scope.zoneId } };
    if (scope.regionId) return { woreda: { zone: { regionId: scope.regionId } } };
    return {};
  }

  _buildAlertWhere(scope) {
    if (scope.woredaId) return { woredaId: scope.woredaId };
    if (scope.zoneId) return { woreda: { zoneId: scope.zoneId } };
    if (scope.regionId) return { woreda: { zone: { regionId: scope.regionId } } };
    return {};
  }

  _buildUserWhere(scope) {
    if (scope.woredaId) return { woredaId: scope.woredaId };
    if (scope.zoneId) return { zoneId: scope.zoneId };
    if (scope.regionId) return { regionId: scope.regionId };
    return {};
  }

  _buildSensorWhere(scope) {
    if (scope.woredaId) return { farm: { woredaId: scope.woredaId } };
    if (scope.zoneId) return { farm: { woreda: { zoneId: scope.zoneId } } };
    if (scope.regionId) return { farm: { woreda: { zone: { regionId: scope.regionId } } } };
    return {};
  }

  _buildRiskWhere(scope) {
    if (scope.woredaId) return { woredaId: scope.woredaId };
    if (scope.zoneId) return { woreda: { zoneId: scope.zoneId } };
    if (scope.regionId) return { woreda: { zone: { regionId: scope.regionId } } };
    return {};
  }

  async getFarmDistribution(scope) {
    try {
      const where = this._buildFarmWhere(scope);
      const [cropGroups, totalCount, totalAreaAgg] = await Promise.all([
        prisma.farm.groupBy({
          by: ['primaryCrop'],
          where,
          _count: { id: true },
          _sum: { areaHectares: true },
        }),
        prisma.farm.count({ where }),
        prisma.farm.aggregate({ where, _sum: { areaHectares: true } }),
      ]);

      const totalFarms = totalCount || 0;
      const totalArea = totalAreaAgg._sum?.areaHectares || 0.0;

      const byCrop = cropGroups.map((cg) => {
        const cropName = cg.primaryCrop || 'Other';
        const count = cg._count?.id || 0;
        const hectares = cg._sum?.areaHectares || 0.0;
        const percentage = totalFarms > 0 ? Math.round((count / totalFarms) * 100) : 0;
        return {
          crop: cropName.charAt(0).toUpperCase() + cropName.slice(1).toLowerCase(),
          count,
          percentage,
          hectares: Math.round(hectares * 10) / 10,
        };
      });

      return {
        total: totalFarms,
        totalArea: Math.round(totalArea * 10) / 10,
        byCrop,
        byScale: {
          smallholder: totalFarms,
          mediumScale: 0,
          commercial: 0,
        },
        atRiskCount: 0,
      };
    } catch (_e) {
      return { total: 0, totalArea: 0.0, byCrop: [], byScale: { smallholder: 0, mediumScale: 0, commercial: 0 }, atRiskCount: 0 };
    }
  }

  async getFarmsCount(scope) {
    try {
      const where = this._buildFarmWhere(scope);
      const [count, aggregate] = await Promise.all([
        prisma.farm.count({ where }),
        prisma.farm.aggregate({ where, _sum: { areaHectares: true } }),
      ]);
      return {
        count: count || 0,
        totalArea: parseFloat((aggregate._sum.areaHectares || 0.0).toFixed(1)),
      };
    } catch (e) {
      return { count: 0, totalArea: 0.0 };
    }
  }

  async getFarmersCount(scope) {
    try {
      const where = { role: 'FARMER', ...this._buildUserWhere(scope) };
      return await prisma.user.count({ where });
    } catch (e) {
      return 0;
    }
  }

  async getActiveAlerts(scope) {
    try {
      const where = { status: 'ACTIVE', ...this._buildAlertWhere(scope) };
      return await prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10 });
    } catch (e) {
      return [];
    }
  }

  async getSensorNetwork(scope) {
    try {
      const where = this._buildSensorWhere(scope);
      const sensors = await prisma.sensor.findMany({ where, select: { id: true, isActive: true } });
      const total = sensors.length;
      const active = sensors.filter((s) => s.isActive).length;
      const coverage = total > 0 ? Math.round((active / total) * 1000) / 10 : 0.0;
      return {
        totalSensors: total,
        activeSensors: active,
        offlineSensors: total - active,
        coveragePercent: coverage,
        networkHealthScore: active > 0 ? 100 : 0,
      };
    } catch (e) {
      return { totalSensors: 0, activeSensors: 0, offlineSensors: 0, coveragePercent: 0.0, networkHealthScore: 0 };
    }
  }

  async getDevelopmentAgents(scope) {
    try {
      const where = { role: 'DEVELOPMENT_AGENT', ...this._buildUserWhere(scope) };
      const agents = await prisma.user.findMany({
        where,
        select: { id: true, fullName: true, phoneNumber: true, kebeleName: true },
        take: 10,
      });
      return {
        totalAgents: agents.length,
        activeToday: agents.length,
        list: agents.map((da, idx) => ({
          id: da.id,
          name: da.fullName || `Agent ${idx + 1}`,
          kebele: da.kebeleName || 'Local Kebele',
          phone: da.phoneNumber || 'N/A',
          visitsThisWeek: 0,
          performanceRating: 5.0,
        })),
      };
    } catch (e) {
      return { totalAgents: 0, activeToday: 0, list: [] };
    }
  }

  async getRiskHeatmap(scope) {
    try {
      const where = this._buildRiskWhere(scope);
      const assessments = await prisma.riskAssessment.findMany({
        where, select: { id: true, alertLevel: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 5,
      });
      const overall = assessments[0]?.alertLevel || 'NORMAL';
      const alertGroups = await prisma.alert.groupBy({
        by: ['hazardType'],
        where: { status: 'ACTIVE', ...this._buildAlertWhere(scope) },
        _count: { id: true },
      });
      const primaryHazards = alertGroups.map((g) => g.hazardType);
      return {
        overallRiskLevel: overall,
        primaryHazards: primaryHazards.length > 0 ? primaryHazards : ['NORMAL_MONITORING'],
        riskTrend: 'STABLE',
        kebelesHighRisk: [],
      };
    } catch (e) {
      return {
        overallRiskLevel: 'NORMAL',
        primaryHazards: ['NORMAL_MONITORING'],
        riskTrend: 'STABLE',
        kebelesHighRisk: [],
      };
    }
  }
}

module.exports = new OfficerDashboardService();
