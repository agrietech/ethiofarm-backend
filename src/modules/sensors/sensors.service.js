const { prisma, isConnected } = require('../../config/db');
const { BadRequestError, NotFoundError, ForbiddenError, ConflictError, ServiceUnavailableError } = require('../../utils/errors');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { broadcastTelemetry } = require('../../delivery/websocket/riskAssessmentChannel');

// Register or provision an IoT sensor device for an individual farmer or farm
async function registerSensor({
  farmId,
  farmerId,
  userId,
  hardwareId,
  serialNumber,
  sensorType,
  deviceType,
  user,
}) {
  const finalHardwareId = (hardwareId || serialNumber || '').trim();
  const finalSensorType = sensorType || deviceType || 'SOIL_MOISTURE';

  if (!finalHardwareId) {
    throw new BadRequestError('hardwareId or serialNumber is required');
  }

  const callerRole = (user?.role || 'FARMER').toUpperCase();
  const callerId = user?.id;

  let targetFarmId = farmId;
  let targetFarmerId = farmerId || userId;

  // If caller is a FARMER, target is always themselves
  if (callerRole === 'FARMER') {
    targetFarmerId = callerId;
  }

  // If farmId is not specified, resolve or auto-provision a plot for this farmer
  if (!targetFarmId) {
    const ownerId = targetFarmerId || callerId;
    if (ownerId) {
      let farm = await prisma.farm.findFirst({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
      });

      if (!farm) {
        const farmerUser = await prisma.user.findUnique({ where: { id: ownerId } });
        if (!farmerUser) {
          throw new NotFoundError(`Farmer user with ID ${ownerId} not found`);
        }
        let woredaId = farmerUser.woredaId;
        if (!woredaId) {
          const firstWoreda = await prisma.woreda.findFirst();
          woredaId = firstWoreda?.id;
        }

        farm = await prisma.farm.create({
          data: {
            userId: ownerId,
            farmName: `${farmerUser.fullName || 'Farmer'}'s Farm Plot`,
            primaryCrop: 'Mixed Crops',
            latitude: 8.54,
            longitude: 39.27,
            woredaId,
          },
        });
      }
      targetFarmId = farm.id;
    }
  }

  if (!targetFarmId) {
    throw new BadRequestError('farmId or farmerId is required to register sensor');
  }

  const farm = await prisma.farm.findUnique({
    where: { id: targetFarmId },
    include: {
      user: { select: { id: true, fullName: true, phoneNumber: true, email: true, role: true } },
      woreda: { include: { zone: true } },
    },
  });

  if (!farm) {
    throw new NotFoundError(`Farm with ID ${targetFarmId} not found`);
  }

  // Ownership & Super Admin Authorization
  if (callerRole === 'FARMER' && farm.userId !== callerId) {
    throw new ForbiddenError('Access denied: You can only register sensors for your own farm');
  }
  if (callerRole === 'DEVELOPMENT_AGENT') {
    if (user?.kebeleId && farm.kebeleId && farm.kebeleId !== user.kebeleId) {
      throw new ForbiddenError('Access denied: Farmer/farm is outside your kebele jurisdiction');
    }
    if (user?.woredaId && farm.woredaId !== user.woredaId) {
      throw new ForbiddenError('Access denied: Farmer/farm is outside your woreda jurisdiction');
    }
  }
  if (['WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'RESEARCHER'].includes(callerRole)) {
    throw new ForbiddenError('Access denied: Officers have read/monitoring access only. Sensor provisioning requires a Development Agent, Farm Owner, or Super Admin');
  }

  // Check if sensor with this hardwareId already exists: update and reassign to this farmer's farm
  const existing = await prisma.sensor.findUnique({
    where: { hardwareId: finalHardwareId },
  });

  const generatedToken = 'sec_' + crypto.randomBytes(24).toString('hex');

  if (existing) {
    return await prisma.sensor.update({
      where: { id: existing.id },
      data: {
        farmId: targetFarmId,
        sensorType: finalSensorType,
        isActive: true,
        secretToken: existing.secretToken || generatedToken,
      },
      include: {
        farm: {
          include: {
            user: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
          },
        },
      },
    });
  }

  return await prisma.sensor.create({
    data: {
      farmId: targetFarmId,
      hardwareId: finalHardwareId,
      sensorType: finalSensorType,
      isActive: true,
      secretToken: generatedToken,
    },
    include: {
      farm: {
        include: {
          user: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
        },
      },
    },
  });
}

/**
 * Validate an incoming sensor secret token against database record
 */
async function verifySensorToken(hardwareId, token) {
  if (!hardwareId || !token) return false;
  try {
    const sensor = await prisma.sensor.findUnique({
      where: { hardwareId: String(hardwareId).trim() },
      select: { id: true, secretToken: true, isActive: true },
    });
    if (!sensor || !sensor.isActive) return false;
    if (sensor.secretToken && sensor.secretToken === String(token).trim()) {
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[SensorAuth] Token verification error for ${hardwareId}: ${err.message}`);
    return false;
  }
}

/**
 * Normalizes analog soil moisture readings into percentage if raw ADC value detected.
 * Standard Arduino ADC (0-1023) or ESP32 ADC (0-4095)
 */
function normalizeSoilMoisture(val) {
  if (val === undefined || val === null || isNaN(Number(val))) return null;
  const num = Number(val);

  if (num >= 0 && num <= 100) {
    return Math.round(num * 10) / 10;
  }

  if (num > 100 && num <= 1024) {
    const pct = ((1023 - num) / (1023 - 300)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
  }

  if (num > 1024 && num <= 4095) {
    const pct = ((3000 - num) / (3000 - 1500)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
  }

  return Math.min(100, Math.max(0, num));
}

// Record authentic telemetry readings
async function recordTelemetry({
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
}) {
  const timestamp = recordedAt ? new Date(recordedAt) : new Date();
  const normalizedMoisture = normalizeSoilMoisture(soilMoisture);

  let actualSensorId = null;
  const lookupIdentifier = hardwareId || sensorId;
  let sensor = null;

  if (lookupIdentifier) {
    sensor = await prisma.sensor.findFirst({
      where: {
        OR: [
          { id: lookupIdentifier },
          { hardwareId: lookupIdentifier },
        ],
      },
    });

    // Auto-provision if sensor hardwareId is new
    if (!sensor) {
      let targetFarmId = farmId;
      if (!targetFarmId) {
        const defaultFarm = await prisma.farm.findFirst();
        targetFarmId = defaultFarm ? defaultFarm.id : null;
      }

      if (targetFarmId) {
        try {
          sensor = await prisma.sensor.create({
            data: {
              farmId: targetFarmId,
              hardwareId: lookupIdentifier,
              sensorType: 'SOIL_MOISTURE',
              isActive: true,
            },
          });
        } catch (createErr) {
          logger.warn(`[SensorService] Auto-provision warning for ${lookupIdentifier}: ${createErr.message}`);
        }
      }
    }
  }

  if (sensor) {
    actualSensorId = sensor.id;
  } else if (sensorId) {
    actualSensorId = sensorId;
  }

  if (!actualSensorId) {
    throw new BadRequestError('Valid sensorId or registered hardwareId is required to record telemetry');
  }

  const reading = await prisma.sensorReading.create({
    data: {
      sensorId: actualSensorId,
      soilMoisture: normalizedMoisture !== null ? Number(normalizedMoisture) : null,
      soilTemp: soilTemp !== undefined && soilTemp !== null ? Number(soilTemp) : null,
      ambientTemp: ambientTemp !== undefined && ambientTemp !== null ? Number(ambientTemp) : null,
      humidity: humidity !== undefined && humidity !== null ? Number(humidity) : null,
      rainfallMm: rainfallMm !== undefined && rainfallMm !== null ? Number(rainfallMm) : null,
      batteryLevel: batteryLevel !== undefined && batteryLevel !== null ? Number(batteryLevel) : null,
      recordedAt: timestamp,
    },
    include: {
      sensor: {
        select: {
          id: true,
          hardwareId: true,
          sensorType: true,
          farmId: true,
          farm: {
            select: {
              woredaId: true,
            },
          },
        },
      },
    },
  });

  // Real-time broadcast to farm plot room, woreda room, and national telemetry
  broadcastTelemetry({
    farmId: reading.sensor?.farmId,
    woredaId: reading.sensor?.farm?.woredaId,
    reading,
  });

  return reading;
}

// Get sensors by farm
async function getSensorsByFarm(farmId) {
  if (!farmId) return [];
  return await prisma.sensor.findMany({
    where: { farmId },
    include: {
      readings: { take: 10, orderBy: { recordedAt: 'desc' } },
      farm: { select: { id: true, farmName: true, userId: true } },
    },
  });
}

// Get all sensors owned by an individual farmer across all their farms
async function getSensorsByFarmer(userId) {
  if (!userId) {
    throw new BadRequestError('userId is required');
  }

  return await prisma.sensor.findMany({
    where: {
      farm: { userId },
    },
    include: {
      farm: {
        select: {
          id: true,
          farmName: true,
          latitude: true,
          longitude: true,
          primaryCrop: true,
        },
      },
      readings: {
        take: 10,
        orderBy: { recordedAt: 'desc' },
      },
    },
  });
}

// Allow an individual farmer to claim/register a sensor device to their farm
async function claimSensor({ userId, farmId, hardwareId, serialNumber, sensorType = 'SOIL_MOISTURE' }) {
  const hwId = hardwareId || serialNumber;
  if (!hwId) {
    throw new BadRequestError('hardwareId or serialNumber is required');
  }
  if (!farmId) {
    throw new BadRequestError('farmId is required');
  }

  // Verify farmer owns the target farm
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
  });

  if (!farm) {
    throw new NotFoundError(`Farm with ID ${farmId} not found`);
  }

  if (userId && farm.userId !== userId) {
    throw new BadRequestError('You do not have permission to attach sensors to this farm');
  }

  // Check if sensor exists
  const existing = await prisma.sensor.findFirst({
    where: { hardwareId: hwId },
  });

  if (existing) {
    return await prisma.sensor.update({
      where: { id: existing.id },
      data: {
        farmId,
        sensorType: sensorType || existing.sensorType,
        isActive: true,
      },
    });
  }

  // Create new sensor record
  return await prisma.sensor.create({
    data: {
      farmId,
      hardwareId: hwId,
      sensorType,
      isActive: true,
    },
  });
}


// Update sensor with Optimistic Concurrency Control (OCC) and ownership checks
async function updateSensor({ id, data = {}, user = {}, clientUpdatedAt }) {
  if (!isConnected()) {
    throw new ServiceUnavailableError('Database service unavailable for sensor updates');
  }

  const existing = await prisma.sensor.findUnique({
    where: { id },
    include: {
      farm: {
        include: {
          woreda: {
            include: {
              zone: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError(`Sensor with ID ${id} not found`);
  }

  // 1. Ownership & Super Admin Authorization
  const role = (user.role || 'FARMER').toUpperCase();
  if (role !== 'ADMIN') {
    if (role === 'FARMER' && existing.farm.userId !== user.id) {
      throw new ForbiddenError('Access denied: You can only update sensors on your own farms');
    }
    if (role === 'DEVELOPMENT_AGENT') {
      if (user.kebeleId && existing.farm.kebeleId && existing.farm.kebeleId !== user.kebeleId) {
        throw new ForbiddenError('Access denied: Sensor is outside your kebele jurisdiction');
      }
      if (user.woredaId && existing.farm.woredaId !== user.woredaId) {
        throw new ForbiddenError('Access denied: Sensor is outside your woreda jurisdiction');
      }
    }
    if (['WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'RESEARCHER'].includes(role)) {
      throw new ForbiddenError('Access denied: Officers have read/monitoring access only. Sensor modification requires Super Admin, assigned Development Agent, or Farm Owner');
    }
  }

  // 2. Optimistic Concurrency Control (OCC)
  const clientTs = clientUpdatedAt || data.clientUpdatedAt || data.updatedAt || data.lastUpdatedAt;
  if (clientTs) {
    const clientTime = new Date(clientTs).getTime();
    const serverTime = new Date(existing.updatedAt).getTime();
    if (!isNaN(clientTime) && serverTime - clientTime > 500) {
      throw new ConflictError(
        'Concurrency conflict: Sensor settings were modified by another session. Please refresh and re-apply.',
        'CONCURRENCY_CONFLICT',
        {
          currentUpdatedAt: existing.updatedAt.toISOString(),
          clientUpdatedAt: new Date(clientTs).toISOString(),
          conflictRecord: {
            id: existing.id,
            hardwareId: existing.hardwareId,
            isActive: existing.isActive,
            sensorType: existing.sensorType,
            updatedAt: existing.updatedAt,
          },
        }
      );
    }
  }

  // 3. Apply updates
  const updatePayload = {};
  if (typeof data.isActive === 'boolean') updatePayload.isActive = data.isActive;
  if (data.sensorType) updatePayload.sensorType = data.sensorType;
  if (data.farmId && data.farmId !== existing.farmId) {
    // If moving to another farm, verify ownership of destination farm
    const targetFarm = await prisma.farm.findUnique({ where: { id: data.farmId } });
    if (!targetFarm) throw new NotFoundError(`Destination farm ${data.farmId} not found`);
    if (role === 'FARMER' && targetFarm.userId !== user.id) {
      throw new ForbiddenError('Cannot move sensor to a farm you do not own');
    }
    updatePayload.farmId = data.farmId;
  }

  return await prisma.sensor.update({
    where: { id },
    data: updatePayload,
    include: { farm: true },
  });
}

// Get single sensor by ID
async function getSensorById(id) {
  return await prisma.sensor.findUnique({
    where: { id },
    include: {
      farm: {
        include: {
          woreda: {
            include: {
              zone: true,
            },
          },
        },
      },
      readings: {
        take: 20,
        orderBy: { recordedAt: 'desc' },
      },
    },
  });
}

// Get telemetry history for a sensor by id or hardwareId
async function getSensorTelemetry({ id, hardwareId, startDate, endDate, limit = 50 } = {}) {
  const target = id || hardwareId;
  if (!target) {
    throw new BadRequestError('Sensor ID or Hardware ID is required');
  }

  const sensor = await prisma.sensor.findFirst({
    where: {
      OR: [{ id: target }, { hardwareId: target }],
    },
  });

  if (!sensor) {
    throw new NotFoundError(`Sensor with identifier '${target}' not found`);
  }

  const where = { sensorId: sensor.id };
  if (startDate || endDate) {
    where.recordedAt = {};
    if (startDate) where.recordedAt.gte = new Date(startDate);
    if (endDate) where.recordedAt.lte = new Date(endDate);
  }

  const take = Math.min(Math.max(Number(limit) || 50, 1), 500);

  return await prisma.sensorReading.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
    take,
    include: {
      sensor: {
        select: {
          id: true,
          hardwareId: true,
          sensorType: true,
          farmId: true,
        },
      },
    },
  });
}

// Get latest telemetry reading for a sensor device
async function getLatestSensorReading(idOrHardwareId) {
  if (!idOrHardwareId) {
    throw new BadRequestError('Sensor ID or Hardware ID is required');
  }

  const sensor = await prisma.sensor.findFirst({
    where: {
      OR: [{ id: idOrHardwareId }, { hardwareId: idOrHardwareId }],
    },
  });

  if (!sensor) {
    throw new NotFoundError(`Sensor with identifier '${idOrHardwareId}' not found`);
  }

  return await prisma.sensorReading.findFirst({
    where: { sensorId: sensor.id },
    orderBy: { recordedAt: 'desc' },
    include: {
      sensor: {
        select: {
          id: true,
          hardwareId: true,
          sensorType: true,
          farmId: true,
        },
      },
    },
  });
}

module.exports = {
  registerSensor,
  verifySensorToken,
  recordTelemetry,
  getSensorsByFarm,
  getSensorsByFarmer,
  getSensorById,
  updateSensor,
  claimSensor,
  getSensorTelemetry,
  getLatestSensorReading,
};

