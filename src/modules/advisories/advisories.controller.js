const advisoriesService = require('./advisories.service');
const { ForbiddenError } = require('../../utils/errors');
const { prisma } = require('../../config/db');
const { assertResourceInScope } = require('../../middleware/scope-filter.utils');

/**
 * Advisories Controller
 */

async function getAdvisories(req, res, next) {
  try {
    const user = req.user;
    let { woredaId, zoneId, regionId, hazardType, cropType, status, limit, offset } = req.query;

    // RBAC & Scoping enforcement
    if (user) {
      if (user.role === 'FARMER') {
        if (user.woredaId) {
          if (woredaId && woredaId !== user.woredaId) {
            throw new ForbiddenError('You can only view advisories for your assigned woreda');
          }
          woredaId = user.woredaId;
        } else {
          try {
            const firstFarm = await prisma.farm.findFirst({
              where: { userId: user.id },
              select: { woredaId: true },
            });
            if (firstFarm?.woredaId) {
              woredaId = firstFarm.woredaId;
            }
          } catch (_) {}
        }
      } else if (user.role === 'DEVELOPMENT_AGENT' || user.role === 'WOREDA_OFFICER') {
        if (!user.woredaId) {
          throw new ForbiddenError('Your account has no administrative woreda assigned');
        }
        if (woredaId && woredaId !== user.woredaId) {
          throw new ForbiddenError('You can only view advisories for your assigned woreda');
        }
        woredaId = user.woredaId;
      } else if (user.role === 'ZONAL_OFFICER') {
        if (!user.zoneId) {
          throw new ForbiddenError('Your account has no administrative zone assigned');
        }
        if (woredaId) {
          const w = await prisma.woreda.findUnique({ where: { id: woredaId }, select: { zoneId: true } });
          if (!w || w.zoneId !== user.zoneId) {
            throw new ForbiddenError('You can only view advisories for woredas within your assigned zone');
          }
        } else {
          zoneId = user.zoneId;
        }
      } else if (user.role === 'REGIONAL_OFFICER') {
        if (!user.regionId) {
          throw new ForbiddenError('Your account has no administrative region assigned');
        }
        if (woredaId) {
          const w = await prisma.woreda.findUnique({
            where: { id: woredaId },
            select: { zone: { select: { regionId: true } } },
          });
          if (!w || w.zone?.regionId !== user.regionId) {
            throw new ForbiddenError('You can only view advisories for woredas within your assigned region');
          }
        } else {
          regionId = user.regionId;
        }
      }
    }

    const result = await advisoriesService.getAdvisories({
      woredaId,
      zoneId,
      regionId,
      hazardType,
      cropType,
      status,
      limit,
      offset,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getAdvisoryById(req, res, next) {
  try {
    const advisory = await advisoriesService.getAdvisoryById(req.params.id);
    if (req.user) {
      assertResourceInScope(req.user, advisory, 'advisory');
    }
    res.status(200).json({ success: true, data: advisory });
  } catch (error) {
    next(error);
  }
}

async function createAdvisory(req, res, next) {
  try {
    const user = req.user;
    const body = { ...req.body };

    // Scoping for advisory creators
    if (user.role === 'DEVELOPMENT_AGENT' || user.role === 'WOREDA_OFFICER') {
      if (!user.woredaId) {
        throw new ForbiddenError('No woreda assigned to your profile');
      }
      body.woredaId = user.woredaId;
    }

    const advisory = await advisoriesService.createAdvisory(body);
    res.status(201).json({ success: true, data: advisory });
  } catch (error) {
    next(error);
  }
}

async function updateAdvisory(req, res, next) {
  try {
    const advisory = await advisoriesService.getAdvisoryById(req.params.id);
    if (req.user) {
      assertResourceInScope(req.user, advisory, 'advisory');
    }
    const updated = await advisoriesService.updateAdvisory(req.params.id, req.body);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteAdvisory(req, res, next) {
  try {
    const advisory = await advisoriesService.getAdvisoryById(req.params.id);
    if (req.user) {
      assertResourceInScope(req.user, advisory, 'advisory');
    }
    const result = await advisoriesService.deleteAdvisory(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAdvisories,
  getAdvisoryById,
  createAdvisory,
  updateAdvisory,
  deleteAdvisory,
};
