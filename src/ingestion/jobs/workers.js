const { Worker } = require('bullmq');
const { connection, QUEUE_NAME } = require('./queue');
const logger = require('../../utils/logger');
const { prisma, isConnected } = require('../../config/db');
const connectors = require('../connectors');

/**
 * Record ingestion run status to DataSourceSyncLog
 */
async function logSyncResult({
  source,
  status,
  recordsIngested = 0,
  recordsFailed = 0,
  durationMs = 0,
  errorMessage = null,
  metadata = null,
}) {
  try {
    if (isConnected()) {
      await prisma.dataSourceSyncLog.create({
        data: {
          source,
          status,
          recordsIngested,
          recordsFailed,
          durationMs,
          errorMessage,
          metadata: metadata || {},
          syncedAt: new Date(),
        },
      });
    }
    logger.info(`[DataSourceSyncLog] Logged sync for ${source}: status=${status}, ingested=${recordsIngested}, failed=${recordsFailed}, duration=${durationMs}ms`);
  } catch (err) {
    logger.warn(`[DataSourceSyncLog] Notice: ${err.message}`);
  }
}

/**
 * Job Processors
 * Each processor handles a specific data ingestion task
 */
const jobProcessors = {
  /**
   * Pull CHIRPS rainfall data for all woredas
   */
  async pullChirpsRainfall(job) {
    logger.info('Processing CHIRPS rainfall ingestion', { jobId: job.id });

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      // Get target woredas (optionally scoped to specific woredaIds or limit)
      const where = job?.data?.woredaIds ? { id: { in: job.data.woredaIds } } : {};
      const take = job?.data?.limit || undefined;
      const woredas = await prisma.woreda.findMany({
        where,
        take,
        select: {
          id: true,
          nameEn: true,
          centerLat: true,
          centerLng: true,
        },
      });

      logger.info(`Fetching CHIRPS data for ${woredas.length} woredas`);

      // Process in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < woredas.length; i += batchSize) {
        const batch = woredas.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (woreda) => {
            try {
              const data = await connectors.chirpsConnector.fetchRainfallByLocation({
                lat: woreda.centerLat,
                lng: woreda.centerLng,
              });

              // Save to database
              await prisma.satelliteObservation.upsert({
                where: {
                  woredaId_observationDate_source: {
                    woredaId: woreda.id,
                    observationDate: new Date(),
                    source: 'CHIRPS',
                  },
                },
                update: {
                  chirpsRainfallMm: data.precipitationMm,
                  rawPayload: data,
                  ingestionStatus: 'SUCCESS',
                },
                create: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'CHIRPS',
                  chirpsRainfallMm: data.precipitationMm,
                  rawPayload: data,
                  ingestionStatus: 'SUCCESS',
                },
              });

              successCount++;
            } catch (error) {
              logger.error('Failed to fetch CHIRPS for woreda', {
                woredaId: woreda.id,
                error: error.message,
              });
              errorCount++;
            }
          })
        );

        // Update job progress
        const progress = Math.round(((i + batch.length) / woredas.length) * 100);
        await job.updateProgress(progress);

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const duration = Date.now() - startTime;
      logger.info('CHIRPS ingestion completed', {
        jobId: job.id,
        duration,
        successCount,
        errorCount,
        totalWoredas: woredas.length,
      });

      await logSyncResult({
        source: 'CHIRPS',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return {
        success: true,
        successCount,
        errorCount,
        totalWoredas: woredas.length,
        duration,
      };
    } catch (error) {
      logger.error('CHIRPS ingestion failed', {
        jobId: job.id,
        error: error.message,
      });
      await logSyncResult({
        source: 'CHIRPS',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull Open-Meteo weather forecast for all woredas
   */
  async pullWeatherForecast(job) {
    logger.info('Processing weather forecast ingestion', { jobId: job.id });

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      const where = job?.data?.woredaIds ? { id: { in: job.data.woredaIds } } : {};
      const take = job?.data?.limit || undefined;
      const woredas = await prisma.woreda.findMany({
        where,
        take,
        select: {
          id: true,
          nameEn: true,
          centerLat: true,
          centerLng: true,
        },
      });

      logger.info(`Fetching weather forecast for ${woredas.length} woredas`);

      const batchSize = 15; // Open-Meteo is more generous
      for (let i = 0; i < woredas.length; i += batchSize) {
        const batch = woredas.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (woreda) => {
            try {
              const weatherService = require('../../modules/weather/weather.service');
              // Warm/refresh hourly forecast cache directly in Redis and memory
              const weatherForecast = await weatherService.getWeatherForecast({
                woredaId: woreda.id,
                days: 7,
                forceRefresh: true,
              });

              // Save observation to database
              if (weatherForecast.daily && weatherForecast.daily.length > 0) {
                const today = weatherForecast.daily[0];
                await prisma.satelliteObservation.upsert({
                  where: {
                    woredaId_observationDate_source: {
                      woredaId: woreda.id,
                      observationDate: new Date(),
                      source: 'OPEN_METEO',
                    },
                  },
                  update: {
                    nasaPowerTempMax: today.maxTempC,
                    nasaPowerTempMin: today.minTempC,
                    nasaPowerHumidity: weatherForecast.current?.relativeHumidity,
                    chirpsRainfallMm: today.precipitationMm,
                    rawPayload: weatherForecast,
                    ingestionStatus: 'SUCCESS',
                  },
                  create: {
                    woredaId: woreda.id,
                    observationDate: new Date(),
                    source: 'OPEN_METEO',
                    nasaPowerTempMax: today.maxTempC,
                    nasaPowerTempMin: today.minTempC,
                    nasaPowerHumidity: weatherForecast.current?.relativeHumidity,
                    chirpsRainfallMm: today.precipitationMm,
                    rawPayload: weatherForecast,
                    ingestionStatus: 'SUCCESS',
                  },
                });
              }

              successCount++;
            } catch (error) {
              logger.error('Failed to fetch weather for woreda', {
                woredaId: woreda.id,
                error: error.message,
              });
              errorCount++;
            }
          })
        );

        await job.updateProgress(Math.round(((i + batch.length) / woredas.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Refresh hourly weather for registered active farms
      try {
        const weatherService = require('../../modules/weather/weather.service');
        const activeFarms = await prisma.farm.findMany({
          take: 30,
          select: { id: true },
        });
        for (const farm of activeFarms) {
          try {
            await weatherService.getWeatherForecast({ farmId: farm.id, forceRefresh: true });
          } catch (_) {}
        }
      } catch (_farmErr) {}

      const duration = Date.now() - startTime;
      logger.info('Weather forecast ingestion completed', {
        jobId: job.id,
        duration,
        successCount,
        errorCount,
      });

      await logSyncResult({
        source: 'OPEN_METEO',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return {
        success: true,
        successCount,
        errorCount,
        duration,
      };
    } catch (error) {
      logger.error('Weather forecast ingestion failed', {
        jobId: job.id,
        error: error.message,
      });
      await logSyncResult({
        source: 'OPEN_METEO',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull NASA POWER agroclimatology data
   */
  async pullNasaPower(job) {
    logger.info('Processing NASA POWER ingestion', { jobId: job.id });

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      const woredas = await prisma.woreda.findMany({
        select: {
          id: true,
          nameEn: true,
          centerLat: true,
          centerLng: true,
        },
      });

      const batchSize = 5; // NASA POWER is slower
      for (let i = 0; i < woredas.length; i += batchSize) {
        const batch = woredas.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (woreda) => {
            try {
              const data = await connectors.nasaPowerConnector.fetchDailySolarAndHumidity({
                lat: woreda.centerLat,
                lng: woreda.centerLng,
              });

              if (data.summary) {
                await prisma.satelliteObservation.upsert({
                  where: {
                    woredaId_observationDate_source: {
                      woredaId: woreda.id,
                      observationDate: new Date(),
                      source: 'NASA_POWER',
                    },
                  },
                  update: {
                    nasaPowerTempMax: data.summary.avgTempMax,
                    nasaPowerTempMin: data.summary.avgTempMin,
                    nasaPowerHumidity: data.summary.avgHumidity,
                    nasaPowerSolarMJ: data.summary.avgSolarRadiation,
                    rawPayload: data,
                    ingestionStatus: 'SUCCESS',
                  },
                  create: {
                    woredaId: woreda.id,
                    observationDate: new Date(),
                    source: 'NASA_POWER',
                    nasaPowerTempMax: data.summary.avgTempMax,
                    nasaPowerTempMin: data.summary.avgTempMin,
                    nasaPowerHumidity: data.summary.avgHumidity,
                    nasaPowerSolarMJ: data.summary.avgSolarRadiation,
                    rawPayload: data,
                    ingestionStatus: 'SUCCESS',
                  },
                });
              }

              successCount++;
            } catch (error) {
              logger.error('Failed to fetch NASA POWER for woreda', {
                woredaId: woreda.id,
                error: error.message,
              });
              errorCount++;
            }
          })
        );

        await job.updateProgress(Math.round(((i + batch.length) / woredas.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const duration = Date.now() - startTime;
      logger.info('NASA POWER ingestion completed', {
        jobId: job.id,
        duration,
        successCount,
        errorCount,
      });

      await logSyncResult({
        source: 'NASA_POWER',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return { success: true, successCount, errorCount, duration };
    } catch (error) {
      logger.error('NASA POWER ingestion failed', {
        jobId: job.id,
        error: error.message,
      });
      await logSyncResult({
        source: 'NASA_POWER',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull FAO Locust Watch bulletins
   */
  async pullFaoLocust(job) {
    logger.info('Processing FAO Locust ingestion', { jobId: job.id });

    try {
      const data = await connectors.faoLocustConnector.fetchLatestBulletins();

      if (data.activeThreats && data.activeThreats.length > 0) {
        // Store locust data for affected woredas
        for (const threat of data.activeThreats) {
          // Find nearby woredas (within 100km radius)
          let nearbyWoredas = [];
          if (isConnected()) {
            try {
              nearbyWoredas = await prisma.$queryRaw`
                SELECT id, "nameEn",
                  (6371 * acos(
                    LEAST(1.0, GREATEST(-1.0,
                      cos(radians(${threat.lat})) * cos(radians("centerLat")) *
                      cos(radians("centerLng") - radians(${threat.lng})) +
                      sin(radians(${threat.lat})) * sin(radians("centerLat"))
                    ))
                  )) AS distance_km
                FROM "Woreda"
                WHERE abs("centerLat" - ${threat.lat}) <= 1.2
                  AND abs("centerLng" - ${threat.lng}) <= 1.2
                ORDER BY distance_km ASC
                LIMIT 20
              `;
            } catch (_err) {
              // Fallback to closest woreda by coordinate delta
              nearbyWoredas = await prisma.woreda.findMany({
                where: {
                  centerLat: { gte: threat.lat - 1.5, lte: threat.lat + 1.5 },
                  centerLng: { gte: threat.lng - 1.5, lte: threat.lng + 1.5 },
                },
                take: 10,
                select: { id: true, nameEn: true },
              });
            }
          }

          for (const woreda of nearbyWoredas) {
            if (isConnected()) {
              await prisma.satelliteObservation.upsert({
                where: {
                  woredaId_observationDate_source: {
                    woredaId: woreda.id,
                    observationDate: new Date(),
                    source: 'FAO_LOCUST',
                  },
                },
                update: {
                  locustPresence: true,
                  locustDensity: threat.density === 'SWARM' ? 1.0 : 0.5,
                  rawPayload: { threat, distance_km: woreda.distance_km },
                  ingestionStatus: 'SUCCESS',
                },
                create: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'FAO_LOCUST',
                  locustPresence: true,
                  locustDensity: threat.density === 'SWARM' ? 1.0 : 0.5,
                  rawPayload: { threat, distance_km: woreda.distance_km },
                  ingestionStatus: 'SUCCESS',
                },
              });
            }
          }
        }

        logger.info('FAO Locust ingestion completed', {
          jobId: job.id,
          threatsFound: data.activeThreats.length,
        });

        await logSyncResult({
          source: 'FAO_LOCUST',
          status: 'SUCCESS',
          recordsIngested: data.activeThreats.length,
          recordsFailed: 0,
          metadata: { swarms: data.totalSwarms, hoppers: data.totalHoppers },
        });

        return {
          success: true,
          threatsFound: data.activeThreats.length,
          swarms: data.totalSwarms,
          hoppers: data.totalHoppers,
        };
      } else {
        logger.info('No active locust threats found', { jobId: job.id });
        await logSyncResult({
          source: 'FAO_LOCUST',
          status: 'SUCCESS',
          recordsIngested: 0,
          recordsFailed: 0,
          metadata: { activeThreats: 0 },
        });
        return { success: true, threatsFound: 0 };
      }
    } catch (error) {
      logger.error('FAO Locust ingestion failed', {
        jobId: job.id,
        error: error.message,
      });
      await logSyncResult({
        source: 'FAO_LOCUST',
        status: 'FAILED',
        recordsIngested: 0,
        recordsFailed: 1,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull NDVI data for sample woredas
   */
  async pullNdviData(job) {
    logger.info('Processing NDVI ingestion', { jobId: job.id });
    const startTime = Date.now();

    try {
      // NDVI is expensive, so we only pull for a sample or on-demand
      const sampleSize = job.data?.woredaIds?.length || 50;

      let woredas = [];
      if (isConnected()) {
        if (job.data?.woredaIds) {
          woredas = await prisma.woreda.findMany({
            where: { id: { in: job.data.woredaIds } },
            select: {
              id: true,
              nameEn: true,
              centerLat: true,
              centerLng: true,
              geojson: true,
            },
          });
        } else {
          // Sample woredas
          try {
            woredas = await prisma.$queryRaw`
              SELECT id, "nameEn", "centerLat", "centerLng", geojson
              FROM "Woreda"
              ORDER BY RANDOM()
              LIMIT ${sampleSize}
            `;
          } catch (_err) {
            woredas = await prisma.woreda.findMany({
              take: sampleSize,
              select: { id: true, nameEn: true, centerLat: true, centerLng: true, geojson: true },
            });
          }
        }
      }

      let successCount = 0;
      let errorCount = 0;

      for (const woreda of woredas) {
        try {
          const data = await connectors.ndviConnector.fetchNdviByPolygon({
            woredaId: woreda.id,
            polygon: woreda.geojson,
            date: new Date(),
          });

          if (isConnected()) {
            await prisma.satelliteObservation.upsert({
              where: {
                woredaId_observationDate_source: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'MODIS_NDVI',
                },
              },
              update: {
                modisNdvi: data.meanNdvi,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
              create: {
                woredaId: woreda.id,
                observationDate: new Date(),
                source: 'MODIS_NDVI',
                modisNdvi: data.meanNdvi,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
            });
          }

          successCount++;
        } catch (error) {
          logger.error('Failed to fetch NDVI for woreda', {
            woredaId: woreda.id,
            error: error.message,
          });
          errorCount++;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const duration = Date.now() - startTime;
      logger.info('NDVI ingestion completed', {
        jobId: job.id,
        successCount,
        errorCount,
      });

      await logSyncResult({
        source: 'MODIS_NDVI',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return { success: true, successCount, errorCount };
    } catch (error) {
      logger.error('NDVI ingestion failed', {
        jobId: job.id,
        error: error.message,
      });
      await logSyncResult({
        source: 'MODIS_NDVI',
        status: 'FAILED',
        recordsIngested: 0,
        recordsFailed: 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull Google Earth Engine / Sentinel Planetary Compute telemetry
   */
  async pullEarthEngine(job) {
    logger.info('Processing Google Earth Engine planetary observation ingestion', { jobId: job?.id });
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      const sampleSize = job?.data?.limit || 15;
      let woredas = [];
      if (isConnected()) {
        if (job?.data?.woredaIds) {
          woredas = await prisma.woreda.findMany({
            where: { id: { in: job.data.woredaIds } },
            select: { id: true, nameEn: true, centerLat: true, centerLng: true, geojson: true },
          });
        } else {
          woredas = await prisma.woreda.findMany({
            take: sampleSize,
            select: { id: true, nameEn: true, centerLat: true, centerLng: true, geojson: true },
          });
        }
      }

      for (const woreda of woredas) {
        try {
          const data = await connectors.earthEngineConnector.fetchPlanetaryMetrics({
            lat: woreda.centerLat,
            lng: woreda.centerLng,
            geojson: woreda.geojson,
            level: 'WOREDA',
          });

          if (isConnected()) {
            await prisma.satelliteObservation.upsert({
              where: {
                woredaId_observationDate_source: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'GOOGLE_EARTH_ENGINE',
                },
              },
              update: {
                sentinel2Ndvi: data.sentinel2Ndvi,
                modisNdvi: data.modisNdvi,
                soilMoistureSat: data.soilMoisturePct,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
              create: {
                woredaId: woreda.id,
                observationDate: new Date(),
                source: 'GOOGLE_EARTH_ENGINE',
                sentinel2Ndvi: data.sentinel2Ndvi,
                modisNdvi: data.modisNdvi,
                soilMoistureSat: data.soilMoisturePct,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
            });
          }
          successCount++;
        } catch (err) {
          logger.error('Failed to fetch Earth Engine telemetry for woreda', { woredaId: woreda.id, error: err.message });
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      await logSyncResult({
        source: 'GOOGLE_EARTH_ENGINE',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return { success: true, successCount, errorCount, duration };
    } catch (error) {
      logger.error('Earth Engine ingestion failed', { error: error.message });
      await logSyncResult({
        source: 'GOOGLE_EARTH_ENGINE',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull GloFAS river discharge forecast
   */
  async pullGlofas(job) {
    logger.info('Processing GloFAS river discharge ingestion', { jobId: job?.id });
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      let woredas = [];
      if (isConnected()) {
        woredas = await prisma.woreda.findMany({
          select: { id: true, nameEn: true, centerLat: true, centerLng: true },
          take: job?.data?.limit || 50,
        });
      }

      for (const woreda of woredas) {
        try {
          const data = await connectors.glofasConnector.fetchDischarge({
            lat: woreda.centerLat,
            lng: woreda.centerLng,
          });

          if (isConnected()) {
            await prisma.satelliteObservation.upsert({
              where: {
                woredaId_observationDate_source: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'GLOFAS',
                },
              },
              update: {
                glofasDischarge: data.currentDischargeM3s,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
              create: {
                woredaId: woreda.id,
                observationDate: new Date(),
                source: 'GLOFAS',
                glofasDischarge: data.currentDischargeM3s,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
            });
          }
          successCount++;
        } catch (err) {
          logger.error('Failed to fetch GloFAS for woreda', { woredaId: woreda.id, error: err.message });
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      await logSyncResult({
        source: 'GLOFAS',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return { success: true, successCount, errorCount, duration };
    } catch (error) {
      logger.error('GloFAS ingestion failed', { error: error.message });
      await logSyncResult({
        source: 'GLOFAS',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull SoilGrids soil parameters (clay, pH, organic carbon)
   */
  async pullSoilGrids(job) {
    logger.info('Processing SoilGrids ingestion', { jobId: job?.id });
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      let woredas = [];
      if (isConnected()) {
        woredas = await prisma.woreda.findMany({
          select: { id: true, nameEn: true, centerLat: true, centerLng: true },
          take: job?.data?.limit || 50,
        });
      }

      for (const woreda of woredas) {
        try {
          const data = await connectors.soilGridsConnector.fetchSoilProperties({
            lat: woreda.centerLat,
            lng: woreda.centerLng,
          });

          if (isConnected()) {
            await prisma.satelliteObservation.upsert({
              where: {
                woredaId_observationDate_source: {
                  woredaId: woreda.id,
                  observationDate: new Date(),
                  source: 'SOILGRIDS',
                },
              },
              update: {
                soilClayPercent: data.properties?.clay?.value || 28.0,
                soilPh: data.properties?.phh2o?.value ? data.properties.phh2o.value / 10 : 6.5,
                soilOrganicCarbon: data.properties?.soc?.value || 15.0,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
              create: {
                woredaId: woreda.id,
                observationDate: new Date(),
                source: 'SOILGRIDS',
                soilClayPercent: data.properties?.clay?.value || 28.0,
                soilPh: data.properties?.phh2o?.value ? data.properties.phh2o.value / 10 : 6.5,
                soilOrganicCarbon: data.properties?.soc?.value || 15.0,
                rawPayload: data,
                ingestionStatus: 'SUCCESS',
              },
            });
          }
          successCount++;
        } catch (err) {
          logger.error('Failed to fetch SoilGrids for woreda', { woredaId: woreda.id, error: err.message });
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      await logSyncResult({
        source: 'SOILGRIDS',
        status: errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
        recordsIngested: successCount,
        recordsFailed: errorCount,
        durationMs: duration,
        metadata: { totalWoredas: woredas.length },
      });

      return { success: true, successCount, errorCount, duration };
    } catch (error) {
      logger.error('SoilGrids ingestion failed', { error: error.message });
      await logSyncResult({
        source: 'SOILGRIDS',
        status: 'FAILED',
        recordsIngested: successCount,
        recordsFailed: errorCount + 1,
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      throw error;
    }
  },
};

/**
 * Create and start worker
 */
function createWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const processor = jobProcessors[job.name];

      if (!processor) {
        logger.error('Unknown job type', { jobName: job.name });
        throw new Error(`Unknown job type: ${job.name}`);
      }

      return await processor(job);
    },
    {
      connection,
      concurrency: 5, // Process 5 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // per minute
      },
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    logger.info('Job completed', {
      jobId: job.id,
      jobName: job.name,
      result,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: error.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('error', (error) => {
    logger.error('Worker error', { error: error.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Job stalled', { jobId });
  });

  logger.info('BullMQ worker started', { queueName: QUEUE_NAME });

  return worker;
}

module.exports = {
  createWorker,
  jobProcessors,
};
