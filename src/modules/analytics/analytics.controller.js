const analyticsService = require('./analytics.service');
const { ForbiddenError } = require('../../utils/errors');
const { prisma } = require('../../config/db');

/**
 * Validates and locks down requested woreda to the user's jurisdictional scope.
 * Prevents horizontal privilege escalation across woredas, zones, and regions.
 */
async function resolveAndValidateWoredaScope(user, requestedWoredaId) {
  if (!user || ['ADMIN', 'RESEARCHER'].includes(user.role)) {
    return requestedWoredaId || null;
  }

  const role = (user.role || '').toUpperCase();

  // Farmer, DA, Woreda Officer are strictly locked to their assigned woreda
  if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') {
    if (!user.woredaId) {
      throw new ForbiddenError('No administrative woreda assigned to your account');
    }
    if (requestedWoredaId && requestedWoredaId !== user.woredaId) {
      throw new ForbiddenError(`Access restricted: woreda '${requestedWoredaId}' is outside your assigned jurisdiction`);
    }
    return user.woredaId;
  }

  // Zonal Officer: bounded to woredas within their assigned zone
  if (role === 'ZONAL_OFFICER') {
    if (!user.zoneId) {
      throw new ForbiddenError('No administrative zone assigned to your account');
    }
    if (requestedWoredaId) {
      const w = await prisma.woreda.findUnique({ where: { id: requestedWoredaId }, select: { zoneId: true } });
      if (!w || w.zoneId !== user.zoneId) {
        throw new ForbiddenError(`Access restricted: woreda '${requestedWoredaId}' is outside your assigned zone jurisdiction`);
      }
      return requestedWoredaId;
    }
    const firstWoreda = await prisma.woreda.findFirst({ where: { zoneId: user.zoneId }, select: { id: true } });
    return firstWoreda ? firstWoreda.id : null;
  }

  // Regional Officer: bounded to woredas within their assigned region
  if (role === 'REGIONAL_OFFICER') {
    if (!user.regionId) {
      throw new ForbiddenError('No administrative region assigned to your account');
    }
    if (requestedWoredaId) {
      const w = await prisma.woreda.findUnique({
        where: { id: requestedWoredaId },
        select: { zone: { select: { regionId: true } } },
      });
      if (!w || w.zone?.regionId !== user.regionId) {
        throw new ForbiddenError(`Access restricted: woreda '${requestedWoredaId}' is outside your assigned regional jurisdiction`);
      }
      return requestedWoredaId;
    }
    const firstWoreda = await prisma.woreda.findFirst({
      where: { zone: { regionId: user.regionId } },
      select: { id: true },
    });
    return firstWoreda ? firstWoreda.id : null;
  }

  return requestedWoredaId || null;
}

async function getDashboardSummary(req, res, next) {
  try {
    // ── RBAC: Pass user jurisdiction context for scoped statistics ──
    const user = req.user || {};
    const data = await analyticsService.getDashboardSummary({
      role: (user.role || '').toUpperCase(),
      userId: user.id || null,
      woredaId: user.woredaId || null,
      zoneId: user.zoneId || null,
      regionId: user.regionId || null,
      kebeleId: user.kebeleId || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getRegionalBreakdown(req, res, next) {
  try {
    const user = req.user || {};
    const role = (user.role || '').toUpperCase();
    const regionId = ['ADMIN', 'RESEARCHER'].includes(role) ? null : user.regionId;
    const data = await analyticsService.getRegionalBreakdown(regionId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getTemporalTrends(req, res, next) {
  try {
    let { timeframe, woredaId, includeAi, language } = req.query;
    woredaId = await resolveAndValidateWoredaScope(req.user, woredaId);
    const data = await analyticsService.getTemporalTrends({
      timeframe,
      woredaId,
      includeAi,
      language,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getAgronomicAdvisories(req, res, next) {
  try {
    let { cropType, season, woredaId } = req.query;
    woredaId = await resolveAndValidateWoredaScope(req.user, woredaId);
    const data = await analyticsService.getAgronomicAdvisories({
      cropType,
      season,
      woredaId,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getAiInsights(req, res, next) {
  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    let { woredaId, timeframe, language, metrics } = params;
    woredaId = await resolveAndValidateWoredaScope(req.user, woredaId);
    const parsedMetrics = typeof metrics === 'string' ? metrics.split(',').map(m => m.trim()) : metrics;
    const data = await analyticsService.getAiInsights({
      woredaId,
      timeframe,
      language,
      metrics: parsedMetrics,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// Location-specific map and analytics
async function getLocationMap(req, res, next) {
  try {
    const userId = req.user.id;
    const data = await analyticsService.getLocationMap(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getLocationAnalytics(req, res, next) {
  try {
    const userId = req.user.id;
    const data = await analyticsService.getLocationAnalytics(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getRegionMap(req, res, next) {
  try {
    const { regionId } = req.params;
    const data = await analyticsService.getRegionMap(regionId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getRegionAnalytics(req, res, next) {
  try {
    const { regionId } = req.params;
    const data = await analyticsService.getRegionAnalytics(regionId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getZoneMap(req, res, next) {
  try {
    const { zoneId } = req.params;
    const data = await analyticsService.getZoneMap(zoneId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getZoneAnalytics(req, res, next) {
  try {
    const { zoneId } = req.params;
    const data = await analyticsService.getZoneAnalytics(zoneId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getWoredaMap(req, res, next) {
  try {
    const { woredaId } = req.params;
    const data = await analyticsService.getWoredaMap(woredaId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getWoredaAnalytics(req, res, next) {
  try {
    const { woredaId } = req.params;
    const data = await analyticsService.getWoredaAnalytics(woredaId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getHyperLocalProfile(req, res, next) {
  try {
    const { lat, lng, crop } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required' });
    }
    const data = await analyticsService.getHyperLocalProfile(Number(lat), Number(lng), crop);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getSoilProfile(req, res, next) {
  try {
    const { lat, lng, crop } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required' });
    }
    const data = await analyticsService.getSoilProfile(Number(lat), Number(lng), crop);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getDownscaledForecast(req, res, next) {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required' });
    }
    const data = await analyticsService.getDownscaledForecast(Number(lat), Number(lng));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getAgroZone(req, res, next) {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required' });
    }
    const data = await analyticsService.getAgroZone(Number(lat), Number(lng));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getSeismologyAnalytics(req, res, next) {
  try {
    const { lat, lng, woredaName } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required for seismology assessment' });
    }
    const data = await analyticsService.getSeismologyAssessment(Number(lat), Number(lng), woredaName);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getSoilDegradationAnalytics(req, res, next) {
  try {
    const { lat, lng, woredaName, slopePct, conservationPractice } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required for soil degradation assessment' });
    }
    const data = await analyticsService.getSoilDegradationAssessment(
      Number(lat),
      Number(lng),
      woredaName,
      slopePct ? Number(slopePct) : null,
      conservationPractice || 'NONE'
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getNaturalDisastersPrediction(req, res, next) {
  try {
    const { lat, lng, woredaName } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Query parameters lat and lng are required for disaster predictions' });
    }
    const data = await analyticsService.getNaturalDisastersPrediction(Number(lat), Number(lng), woredaName);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function exportData(req, res, next) {
  try {
    const { format = 'json', scope = 'summary' } = req.query;
    const user = req.user;
    const summary = await analyticsService.getDashboardSummary({
      role: (user?.role || '').toUpperCase(),
      userId: user?.id,
      woredaId: user?.woredaId,
      zoneId: user?.zoneId,
      regionId: user?.regionId,
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ethiofarm_analytics_${Date.now()}.csv"`);
      return res.status(200).send(`Export Timestamp,User Role,Jurisdiction\n${new Date().toISOString()},${user?.role || 'OFFICER'},${user?.woredaId || user?.zoneId || user?.regionId || 'NATIONAL'}`);
    }

    res.status(200).json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        exportedBy: user?.id,
        role: user?.role,
        scope,
        analytics: summary,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  resolveAndValidateWoredaScope,
  getDashboardSummary,
  getRegionalBreakdown,
  getTemporalTrends,
  getAgronomicAdvisories,
  getAiInsights,
  getLocationMap,
  getLocationAnalytics,
  getRegionMap,
  getRegionAnalytics,
  getZoneMap,
  getZoneAnalytics,
  getWoredaMap,
  getWoredaAnalytics,
  getHyperLocalProfile,
  getSoilProfile,
  getDownscaledForecast,
  getAgroZone,
  getSeismologyAnalytics,
  getSoilDegradationAnalytics,
  getNaturalDisastersPrediction,
  exportData,
};


