const EventEmitter = require('events');
const { prisma } = require('../../../config/db');
const redis = require('../../../config/redis');
const logger = require('../../../utils/logger');

class RealtimeAnalyticsService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.metricsBuffer = new Map();
    this.flushInterval = 10000; // 10 seconds

    // Start periodic flush
    this.startFlushLoop();
  }

  /**
   * Track real-time metric
   */
  trackMetric(metric, value, metadata = {}) {
    const timestamp = Date.now();
    const key = `${metric}:${metadata.woredaId || 'global'}`;

    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    this.metricsBuffer.get(key).push({
      metric,
      value,
      timestamp,
      metadata
    });

    // Emit for real-time subscribers
    this.emit('metric', { metric, value, timestamp, metadata });

    logger.debug(`[RealtimeAnalytics] Tracked ${metric}: ${value}`);
  }

  /**
   * Get live sensor readings
   */
  async getLiveSensorReadings(woredaId, limit = 10) {
    const cacheKey = `live:sensors:${woredaId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const readings = await prisma.sensorReading.findMany({
      where: {
        sensor: {
          farm: { woredaId }
        },
        recordedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      include: {
        sensor: {
          include: {
            farm: { select: { farmName: true, woredaId: true } }
          }
        }
      },
      orderBy: { recordedAt: 'desc' },
      take: limit
    });

    const result = readings.map(r => ({
      sensorId: r.sensorId,
      farmName: r.sensor.farm.farmName,
      type: r.sensor.sensorType,
      soilMoisture: r.soilMoisture,
      temperature: r.ambientTemp,
      humidity: r.humidity,
      timestamp: r.recordedAt
    }));

    await redis.setex(cacheKey, 30, JSON.stringify(result));
    return result;
  }

  /**
   * Get live alert stream
   */
  async getLiveAlertStream(woredaId) {
    const alerts = await prisma.alert.findMany({
      where: {
        woredaId,
        status: 'ACTIVE',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return alerts.map(a => ({
      id: a.id,
      type: a.hazardType,
      severity: a.severity,
      title: a.titleAm || a.titleEn,
      createdAt: a.createdAt,
      isNew: Date.now() - a.createdAt.getTime() < 5 * 60 * 1000 // Last 5 min
    }));
  }

  /**
   * Get system activity metrics
   */
  async getSystemActivityMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    const [
      newFarms,
      newDiagnoses,
      newSensorReadings,
      activeUsers
    ] = await Promise.all([
      prisma.farm.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.diseaseDiagnosis.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.sensorReading.count({ where: { recordedAt: { gte: oneHourAgo } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: oneHourAgo } } })
    ]);

    return {
      period: 'Last Hour',
      newFarms,
      newDiagnoses,
      newSensorReadings,
      activeUsers,
      timestamp: now
    };
  }

  /**
   * Subscribe to real-time updates
   */
  subscribe(clientId, filters = {}) {
    const stream = {
      clientId,
      filters,
      startedAt: Date.now()
    };

    this.activeStreams.set(clientId, stream);
    logger.info(`[RealtimeAnalytics] Client ${clientId} subscribed`);

    return stream;
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(clientId) {
    this.activeStreams.delete(clientId);
    logger.info(`[RealtimeAnalytics] Client ${clientId} unsubscribed`);
  }

  /**
   * Flush metrics buffer to database
   */
  async flushMetrics() {
    if (this.metricsBuffer.size === 0) return;

    const metrics = [];
    for (const values of this.metricsBuffer.values()) {
      metrics.push(...values);
    }

    this.metricsBuffer.clear();

    // Store aggregated metrics (implementation depends on your schema)
    logger.info(`[RealtimeAnalytics] Flushed ${metrics.length} metrics`);
  }

  /**
   * Start periodic flush loop
   */
  startFlushLoop() {
    setInterval(() => {
      this.flushMetrics().catch(err => {
        logger.error(`[RealtimeAnalytics] Flush error: ${err.message}`);
      });
    }, this.flushInterval);
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount() {
    return this.activeStreams.size;
  }
}

// Singleton instance
const realtimeService = new RealtimeAnalyticsService();

module.exports = realtimeService;
