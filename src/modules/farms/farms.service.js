const { prisma, isConnected } = require('../../config/db');
const { ServiceUnavailableError, NotFoundError, ForbiddenError, ConflictError } = require('../../utils/errors');

const centroid = require('@turf/centroid').default || require('@turf/centroid');
const { getCoord } = require('@turf/invariant');
const boundariesService = require('../boundaries/boundaries.service');
const { assertContainedByWoreda, createHttpError, validateFarmPolygon } = require('./farmGeometry');

// Ethiopian geographic bounding box (approximate)
const ETHIOPIA_BOUNDS = { minLat: 3.0, maxLat: 15.5, minLng: 32.5, maxLng: 48.5 };

/**
 * Register a new farm plot.
 */
async function createFarm({
  userId,
  farmName,
  primaryCrop,
  areaHectares,
  woredaId,
  polygonGeojson,
  latitude: inputLat,
  longitude: inputLng,
  soilType,
  irrigationType,
}) {
  let resolvedWoredaId = woredaId;

  // Validate coordinates if provided directly
  if (inputLat !== undefined && inputLat !== null && inputLng !== undefined && inputLng !== null) {
    const lat = Number(inputLat);
    const lng = Number(inputLng);
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < ETHIOPIA_BOUNDS.minLat ||
      lat > ETHIOPIA_BOUNDS.maxLat ||
      lng < ETHIOPIA_BOUNDS.minLng ||
      lng > ETHIOPIA_BOUNDS.maxLng
    ) {
      throw createHttpError('Coordinates fall outside Ethiopia', 400);
    }

    if (!resolvedWoredaId) {
      resolvedWoredaId = await boundariesService.resolveWoredaByCoords(lat, lng);
    }
  }

  const finalPolygon = polygonGeojson;
  if (!finalPolygon) {
    throw createHttpError('polygonGeojson GIS boundary polygon is strictly required to register a farm plot', 400);
  }

  // Step 1 – deep polygon validation (coordinate ranges, closure, kinks)
  const farmPolygon = validateFarmPolygon(finalPolygon);

  // Step 2 – derive centroid for the flat lat/lng columns
  const [derivedLng, derivedLat] = getCoord(centroid(farmPolygon));
  const latitude = inputLat !== undefined && inputLat !== null ? Number(inputLat) : derivedLat;
  const longitude = inputLng !== undefined && inputLng !== null ? Number(inputLng) : derivedLng;

  if (!resolvedWoredaId) {
    resolvedWoredaId = await boundariesService.resolveWoredaByCoords(latitude, longitude);
  }

  // Step 3 – retrieve woreda and its boundary
  let woreda = await boundariesService.getWoredaById(resolvedWoredaId);
  if (!woreda) {
    throw createHttpError('Selected woreda was not found', 404);
  }

    if (woreda && woreda.geojson) {
    // Step 4 – spatial containment check
    try {
      assertContainedByWoreda(farmPolygon, woreda.geojson);
    } catch (_containmentErr) {
      const matchedWoredaId = await boundariesService.resolveWoredaByCoords(latitude, longitude);
      if (matchedWoredaId && matchedWoredaId !== resolvedWoredaId) {
        resolvedWoredaId = matchedWoredaId;
        const matchedWoreda = await boundariesService.getWoredaById(resolvedWoredaId);
        if (matchedWoreda) woreda = matchedWoreda;
      }
    }
  }

  if (isConnected()) {
    return await prisma.$transaction(async (tx) => {
      let cropId = null;
      if (primaryCrop) {
        try {
          const cropRecord = await tx.crop.findFirst({
            where: {
              OR: [
                { nameEn: { equals: primaryCrop, mode: 'insensitive' } },
                { nameAm: { equals: primaryCrop } },
                { nameOm: { equals: primaryCrop, mode: 'insensitive' } },
              ],
            },
          });
          if (cropRecord) cropId = cropRecord.id;
        } catch (_err) {
          // Crop lookup fallback
        }
      }

      const farm = await tx.farm.create({
        data: {
          userId,
          farmName,
          primaryCrop: primaryCrop || null,
          cropId,
          areaHectares: areaHectares ?? null,
          latitude,
          longitude,
          woredaId: resolvedWoredaId,
          polygonGeojson: farmPolygon.geometry,
          soilType: soilType || null,
          irrigationType: irrigationType || null,
        },
      });

      return farm;
    });
  }

  throw new ServiceUnavailableError('Database service unavailable for farm creation');
}

// Get farms by user role & jurisdictional scope
async function getFarmsByScope(user = {}) {
  const role = (user.role || 'FARMER').toUpperCase();
  const userId = user.id;
  const where = {};

  if (role === 'FARMER') {
    where.userId = userId;
  } else if (role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId) {
      where.kebeleId = user.kebeleId;
    } else if (user.kebeleName) {
      where.kebele = { nameEn: { equals: user.kebeleName, mode: 'insensitive' } };
    } else if (user.woredaId) {
      where.woredaId = user.woredaId;
    } else if (userId) {
      where.userId = userId;
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.woredaId = user.woredaId;
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.woreda = { zoneId: user.zoneId };
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.woreda = { zone: { regionId: user.regionId } };
    }
  }

  let farms = await prisma.farm.findMany({
    where,
    include: {
      woreda: {
        select: {
          id: true,
          nameEn: true,
          nameAm: true,
          zoneId: true,
          zone: { select: { id: true, nameEn: true, regionId: true } },
        },
      },
      crop: true,
      sensors: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return farms;
}

// Get farms for authenticated user
async function getFarmsByUser(userId) {
  return getFarmsByScope({ id: userId, role: 'FARMER' });
}

// Get farm by ID
async function getFarmById(id) {
  return await prisma.farm.findUnique({
    where: { id },
    include: {
      woreda: {
        select: {
          id: true,
          nameEn: true,
          nameAm: true,
          zoneId: true,
          zone: { select: { id: true, nameEn: true, regionId: true } },
        },
      },
      crop: true,
      sensors: { select: { id: true, hardwareId: true, sensorType: true, isActive: true } },
    },
  });
}

// Update farm with Optimistic Concurrency Control (OCC) and jurisdictional security
async function updateFarm({ id, data = {}, user = {}, clientUpdatedAt }) {
  if (!isConnected()) {
    throw new ServiceUnavailableError('Database service unavailable for farm updates');
  }

  const existing = await prisma.farm.findUnique({
    where: { id },
    include: {
      woreda: {
        include: {
          zone: true,
        },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError(`Farm with ID ${id} not found`);
  }

  // 1. Jurisdictional / Ownership Authorization
  const role = (user.role || 'FARMER').toUpperCase();
  if (role !== 'ADMIN' && role !== 'RESEARCHER') {
    if (role === 'FARMER' && existing.userId !== user.id) {
      throw new ForbiddenError('Access denied: You can only update your own farms');
    }
    if (role === 'DEVELOPMENT_AGENT') {
      if (user.kebeleId && existing.kebeleId && existing.kebeleId !== user.kebeleId) {
        throw new ForbiddenError('Access denied: Farm is outside your kebele jurisdiction');
      }
      if (user.woredaId && existing.woredaId !== user.woredaId) {
        throw new ForbiddenError('Access denied: Farm is outside your woreda jurisdiction');
      }
    }
    if (role === 'WOREDA_OFFICER' && user.woredaId && existing.woredaId !== user.woredaId) {
      throw new ForbiddenError('Access denied: Farm is outside your woreda jurisdiction');
    }
    if (role === 'ZONAL_OFFICER' && user.zoneId && existing.woreda?.zoneId !== user.zoneId) {
      throw new ForbiddenError('Access denied: Farm is outside your zone jurisdiction');
    }
    if (role === 'REGIONAL_OFFICER' && user.regionId && existing.woreda?.zone?.regionId !== user.regionId) {
      throw new ForbiddenError('Access denied: Farm is outside your region jurisdiction');
    }
  }

  // 2. Optimistic Concurrency Control (OCC)
  const clientTs = clientUpdatedAt || data.clientUpdatedAt || data.updatedAt || data.lastUpdatedAt;
  if (clientTs) {
    const clientTime = new Date(clientTs).getTime();
    const serverTime = new Date(existing.updatedAt).getTime();
    // 500ms grace window for timestamp precision differences
    if (!isNaN(clientTime) && serverTime - clientTime > 500) {
      throw new ConflictError(
        'Concurrency conflict: This farm was updated concurrently. Please refresh your view to get latest changes.',
        'CONCURRENCY_CONFLICT',
        {
          currentUpdatedAt: existing.updatedAt.toISOString(),
          clientUpdatedAt: new Date(clientTs).toISOString(),
          conflictRecord: {
            id: existing.id,
            farmName: existing.farmName,
            primaryCrop: existing.primaryCrop,
            areaHectares: existing.areaHectares,
            updatedAt: existing.updatedAt,
          },
        }
      );
    }
  }

  // 3. Prepare updated data
  const updatePayload = {};
  if (data.farmName) updatePayload.farmName = data.farmName.trim();
  if (data.areaHectares !== undefined && data.areaHectares !== null) updatePayload.areaHectares = Number(data.areaHectares);
  if (data.soilType !== undefined) updatePayload.soilType = data.soilType;
  if (data.irrigationType !== undefined) updatePayload.irrigationType = data.irrigationType;

  if (data.primaryCrop !== undefined) {
    updatePayload.primaryCrop = data.primaryCrop;
    try {
      const cropRecord = await prisma.crop.findFirst({
        where: {
          OR: [
            { nameEn: { equals: data.primaryCrop, mode: 'insensitive' } },
            { nameAm: { equals: data.primaryCrop } },
            { nameOm: { equals: data.primaryCrop, mode: 'insensitive' } },
          ],
        },
      });
      if (cropRecord) updatePayload.cropId = cropRecord.id;
    } catch (_e) {}
  }

  if (data.latitude !== undefined && data.longitude !== undefined) {
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      updatePayload.latitude = lat;
      updatePayload.longitude = lng;
    }
  }

  if (data.polygonGeojson) {
    updatePayload.polygonGeojson = data.polygonGeojson;
  }

  return await prisma.farm.update({
    where: { id },
    data: updatePayload,
    include: {
      woreda: {
        select: {
          id: true,
          nameEn: true,
          nameAm: true,
          zoneId: true,
          zone: { select: { id: true, nameEn: true, regionId: true } },
        },
      },
      crop: true,
      sensors: true,
    },
  });
}

// Delete farm plot with jurisdictional / ownership authorization
async function deleteFarm({ id, user = {} }) {
  if (!isConnected()) {
    throw new ServiceUnavailableError('Database service unavailable for farm deletion');
  }

  const existing = await prisma.farm.findUnique({
    where: { id },
    include: {
      woreda: {
        include: {
          zone: true,
        },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError(`Farm with ID ${id} not found`);
  }

  // Ownership & Jurisdictional Authorization
  const role = (user.role || 'FARMER').toUpperCase();
  if (role !== 'ADMIN') {
    if (role === 'FARMER' && existing.userId !== user.id) {
      throw new ForbiddenError('Access denied: You can only delete your own farms');
    }
    if (role === 'DEVELOPMENT_AGENT') {
      if (user.kebeleId && existing.kebeleId && existing.kebeleId !== user.kebeleId) {
        throw new ForbiddenError('Access denied: Farm is outside your kebele jurisdiction');
      }
      if (user.woredaId && existing.woredaId !== user.woredaId) {
        throw new ForbiddenError('Access denied: Farm is outside your woreda jurisdiction');
      }
    }
    if (role === 'WOREDA_OFFICER' && user.woredaId && existing.woredaId !== user.woredaId) {
      throw new ForbiddenError('Access denied: Farm is outside your woreda jurisdiction');
    }
    if (role === 'ZONAL_OFFICER' && user.zoneId && existing.woreda?.zoneId !== user.zoneId) {
      throw new ForbiddenError('Access denied: Farm is outside your zone jurisdiction');
    }
    if (role === 'REGIONAL_OFFICER' && user.regionId && existing.woreda?.zone?.regionId !== user.regionId) {
      throw new ForbiddenError('Access denied: Farm is outside your region jurisdiction');
    }
  }

  await prisma.farm.delete({
    where: { id },
  });

  return { success: true, id, message: 'Farm plot deleted successfully' };
}

module.exports = {
  createFarm,
  registerFarm: createFarm,
  updateFarm,
  deleteFarm,
  getFarmsByScope,
  getFarmsByUser,
  getFarmById,
};

