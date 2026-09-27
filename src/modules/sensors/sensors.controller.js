const sensorsService = require('./sensors.service');
const { prisma } = require('../../config/db');
const { assertResourceInScope, buildSensorScope, isNationalScope } = require('../../middleware/scope-filter.utils');

async function registerSensor(req, res, next) {
  try {
    const { farmId, farmerId, userId, hardwareId, serialNumber, sensorType, deviceType, firmwareVersion } = req.body;
    const sensor = await sensorsService.registerSensor({
      farmId,
      farmerId: farmerId || userId,
      hardwareId,
      serialNumber,
      sensorType,
      deviceType,
      firmwareVersion,
      user: req.user,
    });
    res.status(201).json({ success: true, data: sensor });
  } catch (error) {
    next(error);
  }
}


async function recordTelemetry(req, res, next) {
  try {
    const { sensorId, hardwareId, farmId, soilMoisture, soilTemp, ambientTemp, humidity, rainfallMm, batteryLevel, recordedAt } = req.body;
    const reading = await sensorsService.recordTelemetry({
      sensorId,
      hardwareId,
      farmId,
      soilMoisture,
      soilTemp,
      ambientTemp,
      humidity,
      rainfallMm,
      batteryLevel,
      recordedAt,
    });
    res.status(201).json({ success: true, data: reading });
  } catch (error) {
    next(error);
  }
}

async function getSensors(req, res, next) {
  try {
    const farmId = req.params.farmId || req.query.farmId;
    const user = req.user;

    // If a specific farm is requested, verify scope before returning sensors for that farm
    if (farmId) {
      if (user && !isNationalScope(user)) {
        const farm = await prisma.farm.findUnique({
          where: { id: farmId },
          include: { woreda: { include: { zone: true } } },
        });
        if (!farm) {
          return res.status(404).json({ success: false, error: { message: 'Farm not found' } });
        }
        assertResourceInScope(user, farm, 'farm');
      }
      const data = await sensorsService.getSensorsByFarm(farmId);
      return res.status(200).json({ success: true, data });
    }

    // Scope sensors by user jurisdiction
    const where = user ? buildSensorScope(user) : {};

    let data = await prisma.sensor.findMany({
      where,
      include: {
        readings: { take: 5, orderBy: { recordedAt: 'desc' } },
        farm: { select: { id: true, farmName: true, userId: true, woredaId: true, kebeleId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fallback benchmark sensors ONLY for national-level RESEARCHER testing
    if (data.length === 0 && user?.role === 'RESEARCHER') {
      data = await prisma.sensor.findMany({
        take: 10,
        include: {
          readings: { take: 5, orderBy: { recordedAt: 'desc' } },
          farm: { select: { id: true, farmName: true, userId: true, woredaId: true, kebeleId: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getMySensors(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const data = await sensorsService.getSensorsByFarmer(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getFarmerSensors(req, res, next) {
  try {
    const userId = req.params.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: { message: 'userId is required' } });
    }

    const caller = req.user;
    const callerRole = (caller?.role || '').toUpperCase();

    if (callerRole === 'FARMER' && caller.id !== userId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied: You can only view your own sensors', code: 'FORBIDDEN' },
      });
    }

    if (callerRole === 'DEVELOPMENT_AGENT') {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { woredaId: true, kebeleId: true } });
      if (!targetUser || (caller.kebeleId && targetUser.kebeleId && targetUser.kebeleId !== caller.kebeleId) || (caller.woredaId && targetUser.woredaId !== caller.woredaId)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied: Farmer is outside your kebele jurisdiction', code: 'FORBIDDEN' },
        });
      }
    } else if (callerRole === 'WOREDA_OFFICER') {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { woredaId: true } });
      if (!targetUser || (caller.woredaId && targetUser.woredaId !== caller.woredaId)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied: Farmer is outside your woreda jurisdiction', code: 'FORBIDDEN' },
        });
      }
    }
 else if (callerRole === 'ZONAL_OFFICER') {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { zoneId: true, woreda: { select: { zoneId: true } } },
      });
      const targetZoneId = targetUser?.zoneId || targetUser?.woreda?.zoneId;
      if (!targetUser || (caller.zoneId && targetZoneId !== caller.zoneId)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied: Farmer is outside your zone jurisdiction', code: 'FORBIDDEN' },
        });
      }
    } else if (callerRole === 'REGIONAL_OFFICER') {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { regionId: true, woreda: { select: { zone: { select: { regionId: true } } } } },
      });
      const targetRegionId = targetUser?.regionId || targetUser?.woreda?.zone?.regionId;
      if (!targetUser || (caller.regionId && targetRegionId !== caller.regionId)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied: Farmer is outside your region jurisdiction', code: 'FORBIDDEN' },
        });
      }
    }

    const data = await sensorsService.getSensorsByFarmer(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function claimSensor(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { farmId, hardwareId, serialNumber, sensorType } = req.body || {};
    const sensor = await sensorsService.claimSensor({
      userId,
      farmId,
      hardwareId,
      serialNumber,
      sensorType,
    });
    res.status(201).json({ success: true, message: 'Sensor attached to farm successfully', data: sensor });
  } catch (error) {
    next(error);
  }
}

async function getSensorDetails(req, res, next) {
  try {
    const { id } = req.params;
    const sensor = await sensorsService.getSensorById(id);
    if (!sensor) {
      return res.status(404).json({ success: false, error: { message: 'Sensor not found', code: 'NOT_FOUND' } });
    }
    if (sensor.farm && req.user) {
      assertResourceInScope(req.user, sensor.farm, 'sensor');
    }
    res.status(200).json({ success: true, data: sensor });
  } catch (error) {
    next(error);
  }
}

async function updateSensor(req, res, next) {
  try {
    const { id } = req.params;
    const clientUpdatedAt =
      req.headers['if-unmodified-since'] ||
      req.body.clientUpdatedAt ||
      req.body.updatedAt ||
      req.body.lastUpdatedAt;

    const updated = await sensorsService.updateSensor({
      id,
      data: req.body,
      user: req.user,
      clientUpdatedAt,
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function getSensorTelemetry(req, res, next) {
  try {
    const { id } = req.params;
    const sensor = await sensorsService.getSensorById(id);
    if (!sensor) {
      return res.status(404).json({ success: false, error: { message: 'Sensor not found', code: 'NOT_FOUND' } });
    }
    if (sensor.farm && req.user) {
      assertResourceInScope(req.user, sensor.farm, 'sensor');
    }
    const { startDate, endDate, limit } = req.query;
    const data = await sensorsService.getSensorTelemetry({
      id,
      startDate,
      endDate,
      limit,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getLatestSensorReading(req, res, next) {
  try {
    const { hardwareId, id } = req.params;
    const target = hardwareId || id;
    const sensor = await sensorsService.getSensorById(target);
    if (sensor && sensor.farm && req.user) {
      assertResourceInScope(req.user, sensor.farm, 'sensor');
    }
    const data = await sensorsService.getLatestSensorReading(target);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getAllTelemetry(req, res, next) {
  try {
    const user = req.user || {};
    const { limit = 50, startDate, endDate, farmId, sensorId } = req.query;
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

    let where = {};
    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) where.recordedAt.gte = new Date(startDate);
      if (endDate) where.recordedAt.lte = new Date(endDate);
    }

    // Build base sensor scope from user's jurisdiction
    const sensorWhere = buildSensorScope(user);

    if (sensorId) {
      where.sensorId = sensorId;
      where.sensor = sensorWhere;
    } else if (farmId) {
      where.sensor = { ...sensorWhere, farmId };
    } else {
      where.sensor = sensorWhere;
    }

    let data = await prisma.sensorReading.findMany({
      where,
      take,
      orderBy: { recordedAt: 'desc' },
      include: {
        sensor: {
          select: {
            id: true,
            hardwareId: true,
            sensorType: true,
            farmId: true,
            farm: {
              select: { id: true, farmName: true, userId: true, woredaId: true, kebeleId: true },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerSensor,
  recordTelemetry,
  getAllTelemetry,
  getSensors,
  getSensorDetails,
  updateSensor,
  getMySensors,
  getFarmerSensors,
  claimSensor,
  getSensorTelemetry,
  getLatestSensorReading,
};


