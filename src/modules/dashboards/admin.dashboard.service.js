const { prisma, isConnected } = require('../../config/db');
const redis = require('../../config/redis');
const { getScopedWeatherSummary } = require('./dashboardWeatherHelper');
const servicesRegistryService = require('../admin/servicesRegistry.service');

// Fallback memory cache
const memoryAdminCache = new Map();

class AdminDashboardService {
  /**
   * System-Wide Administrative Control Panel
   */
  async getAdminPanel(_userId, user = {}) {
    const cacheKey = 'dashboard:admin:system';

    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryAdminCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const [userCounts, farmCount, sensorCount, alertCount, pendingRoleRequests, weatherData, servicesRegistry] = await Promise.all([
      this.getUserCountsByRole(),
      this.getTotalFarms(),
      prisma.sensor.count().catch(() => 0),
      this.getTotalAlerts(),
      this.getPendingRoleRequests(),
      getScopedWeatherSummary({ user }),
      servicesRegistryService.getServicesRegistry().catch(() => null),
    ]);

    const mem = process.memoryUsage();
    const dbUp = isConnected();
    const redisUp = redis && typeof redis.isConnected === 'function' ? redis.isConnected() : false;
    const totalUsers = Object.values(userCounts).reduce((a, b) => a + b, 0);
    const dayAgo = new Date(Date.now() - 86400000);

    const [newUsersCount, newAlertsCount] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
      prisma.alert.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
    ]);

    const dashboard = {
      systemHealth: {
        status: dbUp ? (redisUp ? 'OPERATIONAL' : 'DEGRADED') : 'CRITICAL',
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        nodeVersion: process.version,
        database: dbUp ? 'ONLINE' : 'OFFLINE',
        redis: redisUp ? 'ONLINE' : 'OFFLINE',
      },

      systemOverview: {
        systemStatus: dbUp ? (redisUp ? 'OPERATIONAL' : 'DEGRADED') : 'CRITICAL',
        totalUsers,
        totalFarms: farmCount,
        totalSensors: sensorCount,
        activeAlerts: alertCount,
      },

      userMetrics: {
        totalUsers,
        byRole: userCounts,
        pendingRoleRequests: pendingRoleRequests.length,
      },

      usersOverview: {
        totalUsers,
        byRole: userCounts,
        pendingRoleRequestsCount: pendingRoleRequests.length,
      },

      agriculturalMetrics: {
        totalRegisteredFarms: farmCount,
        totalActiveAlerts: alertCount,
      },

      recentActivity: {
        period: 'Last 24 hours',
        newUsers: newUsersCount,
        newAlerts: newAlertsCount,
      },

      securityStatus: {
        securityLevel: 'NORMAL',
        lockedAccounts: 0,
        failedLoginsLast24h: 0,
        activeSessions: 1,
      },

      pendingRoleRequests: pendingRoleRequests.slice(0, 5).map((r) => ({
        id: r.id,
        user: r.user ? { id: r.user.id, name: r.user.fullName, email: r.user.email } : null,
        requestedRole: r.requestedRole,
        status: r.status,
        createdAt: r.createdAt,
      })),

      securityAudit: {
        activeLocks: 0,
        mfaEnforcedRoles: ['ADMIN', 'REGIONAL_OFFICER', 'ZONAL_OFFICER'],
        suspiciousEventsLast24h: 0,
      },

      // Live Scoped Weather Telemetry
      weather: weatherData,

      // Live Services Registry & Microservices Sentinel
      servicesRegistry: servicesRegistry || {},
    };

    // Cache for 60 seconds
    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(cacheKey, 60, JSON.stringify(dashboard));
      } catch (_err) {}
    } else {
      memoryAdminCache.set(cacheKey, { data: dashboard, expires: Date.now() + 60000 });
    }

    return dashboard;
  }

  /**
   * Scientific & Agronomic Research Data Dashboard
   */
  async getResearchDashboard(userId, user = {}) {
    const [satelliteObsCount, riskAssessmentsCount, totalFarms, weatherData] = await Promise.all([
      prisma.satelliteObservation.count().catch(() => 0),
      prisma.riskAssessment.count().catch(() => 0),
      prisma.farm.count().catch(() => 0),
      getScopedWeatherSummary({ user }),
    ]);

    return {
      researchPortal: {
        userId,
        scope: 'NATIONAL_ETHIOPIA',
        totalFarms,
        satelliteObsCount,
        riskAssessmentsCount,
        availableDatasets: [
          { name: 'CHIRPS Daily Rainfall GeoTIFF', recordsCount: satelliteObsCount, temporalCoverage: '2020-2026' },
          { name: 'NASA POWER Surface Solar & Agro-climatology', recordsCount: satelliteObsCount, temporalCoverage: '2020-2026' },
          { name: 'Sentinel-2 Normalized Difference Vegetation Index (NDVI)', recordsCount: satelliteObsCount, temporalCoverage: '2021-2026' },
          { name: 'Multi-Hazard SPI Drought & Flood Integrated Risk', recordsCount: riskAssessmentsCount, temporalCoverage: 'Real-time' },
          { name: 'Ethiopian Smallholder Farm Cadastre & Geometries', recordsCount: totalFarms, temporalCoverage: 'Current' },
        ],
        exportFormats: ['GeoJSON', 'CSV', 'Parquet', 'NetCDF'],
      },
      farmSummary: {
        totalFarms,
        totalArea: 0,
      },
      // Live Scoped Weather Telemetry
      weather: weatherData,
    };
  }

  async getUserCountsByRole() {
    const roles = ['FARMER', 'DEVELOPMENT_AGENT', 'WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'RESEARCHER', 'ADMIN'];
    const counts = {};
    for (const r of roles) {
      try {
        counts[r] = await prisma.user.count({ where: { role: r } });
      } catch (e) {
        counts[r] = 0;
      }
    }
    return counts;
  }

  async getTotalFarms() {
    try {
      return await prisma.farm.count();
    } catch (e) {
      return 0;
    }
  }

  async getTotalAlerts() {
    try {
      return await prisma.alert.count({ where: { status: 'ACTIVE' } });
    } catch (e) {
      return 0;
    }
  }

  async getPendingRoleRequests() {
    try {
      return await prisma.roleRequest.findMany({
        where: { status: 'PENDING' },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch (e) {
      return [];
    }
  }
}

module.exports = new AdminDashboardService();
