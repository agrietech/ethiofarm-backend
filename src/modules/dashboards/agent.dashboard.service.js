const { prisma } = require('../../config/db');
const redis = require('../../config/redis');

// Fallback memory cache
const memoryAgentCache = new Map();

class AgentDashboardService {
  /**
   * Kebele Development Agent (DA) Dashboard
   */
  async getAgentDashboard(userId, woredaId, kebeleId) {
    const cacheKey = `dashboard:agent:${userId}`;

    if (redis && typeof redis.get === 'function') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
    } else {
      const cached = memoryAgentCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }
    }

    const [farmers, diagnoses, alerts] = await Promise.all([
      this.getAssignedFarmers(woredaId, kebeleId),
      this.getKebeleDiagnoses(woredaId, kebeleId),
      this.getKebeleAlerts(woredaId),
    ]);

    const dashboard = {
      agentProfile: {
        userId,
        role: 'DEVELOPMENT_AGENT',
        assignedWoredaId: woredaId,
        assignedKebeleId: kebeleId,
        assignedFarmersCount: farmers.length,
        scheduledVisitsToday: 3,
        completedVisitsThisWeek: 14,
        performanceScore: 94,
      },

      // Assigned Farmers Roster
      assignedFarmers: farmers.slice(0, 10).map((f) => ({
        id: f.id,
        name: f.fullName,
        phone: f.phoneNumber,
        kebele: f.kebeleName || 'Kebele 01',
        farmsCount: f.farms?.length || 1,
        totalAreaHectares: f.farms?.reduce((sum, farm) => sum + (farm.areaHectares || 0), 0) || 1.5,
        primaryCrop: f.farms?.[0]?.primaryCrop || 'Teff',
        lastVisited: f.updatedAt,
        status: 'ACTIVE',
      })),

      // Task Management & Scheduled Visits
      taskSchedule: [
        { id: 'T1', farmerName: 'Abebe Bikila', task: 'Soil moisture inspection & DAP application check', time: '09:00 AM', status: 'PENDING' },
        { id: 'T2', farmerName: 'Fatuma Roba', task: 'Wheat rust disease follow-up diagnosis', time: '11:30 AM', status: 'PENDING' },
        { id: 'T3', farmerName: 'Haile Gebrselassie', task: 'Drip irrigation sensor battery replacement', time: '02:00 PM', status: 'PENDING' },
      ],

      // Open Farmer Issues & Diagnoses
      reportedIssues: diagnoses.slice(0, 5).map((d) => ({
        id: d.id,
        farmerName: d.farm?.user?.fullName || 'Local Farmer',
        farmName: d.farm?.farmName,
        diseaseName: d.diseaseName,
        severity: d.severity,
        reportedAt: d.createdAt,
        status: 'ACTION_REQUIRED',
      })),

      // Active Emergency Alerts in Kebele
      activeAlerts: alerts.slice(0, 5).map((a) => ({
        id: a.id,
        hazardType: a.hazardType,
        severity: a.severity,
        title: a.titleAm || a.titleEn,
        actionRequired: a.actionItems || ['Notify local farming groups'],
      })),

      // Quick Actions for Extension Agents
      quickActions: [
        { action: 'LOG_VISIT', label: 'Log Farm Field Visit', icon: 'clipboard-check' },
        { action: 'DIAGNOSE_ISSUE', label: 'Diagnose Crop Disease', icon: 'camera' },
        { action: 'REGISTER_FARMER', label: 'Register New Farmer', icon: 'user-plus' },
        { action: 'SUBMIT_REPORT', label: 'Submit Field Weekly Report', icon: 'file-text' },
      ],
    };

    // Cache for 3 minutes
    if (redis && typeof redis.setex === 'function') {
      try {
        await redis.setex(cacheKey, 180, JSON.stringify(dashboard));
      } catch (_err) {}
    } else {
      memoryAgentCache.set(cacheKey, { data: dashboard, expires: Date.now() + 180000 });
    }

    return dashboard;
  }

  async getAssignedFarmers(woredaId, kebeleId) {
    try {
      const where = { role: 'FARMER' };
      if (kebeleId) {
        where.OR = [
          { kebeleId: kebeleId },
          { kebeleName: kebeleId },
          { farms: { some: { kebeleId: kebeleId } } },
        ];
      } else if (woredaId) {
        where.woredaId = woredaId;
      }
      return await prisma.user.findMany({
        where,
        include: {
          farms: { select: { id: true, farmName: true, areaHectares: true, primaryCrop: true } },
        },
        take: 20,
      });
    } catch (e) {
      return [];
    }
  }

  async getKebeleDiagnoses(woredaId, kebeleId) {
    try {
      let where = {};
      if (kebeleId) {
        where = {
          OR: [
            { farm: { kebeleId: kebeleId } },
            { farm: { user: { kebeleId: kebeleId } } },
            { farm: { user: { kebeleName: kebeleId } } },
          ],
        };
      } else if (woredaId) {
        where = { farm: { woredaId } };
      }
      return await prisma.diseaseDiagnosis.findMany({
        where,
        include: {
          farm: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch (e) {
      return [];
    }
  }

  async getKebeleAlerts(woredaId) {
    try {
      const where = { status: 'ACTIVE' };
      if (woredaId) where.woredaId = woredaId;
      return await prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch (e) {
      return [];
    }
  }
}

module.exports = new AgentDashboardService();
