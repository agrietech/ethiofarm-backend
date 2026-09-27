/**
 * @file hazardMapService.js
 * @description Ethiopia Hazard Map Data Service.
 * Computes multi-hazard risk layers for choropleth map rendering at Region, Zone, and Woreda levels.
 * Returns GeoJSON-compatible data structures for Flutter/Leaflet map visualization.
 */

const { prisma } = require('../../config/db');
const naturalDisasterPredictor = require('../../processing/naturalDisasterPredictor');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

const MAP_CACHE_TTL = 60 * 60; // 1 hour

/**
 * Available hazard layers catalog
 */
function getHazardLayers() {
  return [
    { id: 'composite', name: 'Composite Disaster Index', description: 'Weighted aggregate of all 6 hazard pillars', colorScale: 'green-yellow-orange-red' },
    { id: 'earthquake', name: 'Seismic / Earthquake Risk', description: 'Proximity to active fault zones and PGA', colorScale: 'blue-purple-red' },
    { id: 'erosion', name: 'Soil Erosion & Land Degradation', description: 'RUSLE annual soil loss (t/ha/yr)', colorScale: 'green-brown-red' },
    { id: 'landslide', name: 'Landslide Susceptibility', description: 'Slope + soil saturation + elevation', colorScale: 'green-yellow-red' },
    { id: 'flood', name: 'Flash Flood & River Inundation', description: 'GloFAS discharge + topographic sinks', colorScale: 'white-blue-darkblue' },
    { id: 'drought', name: 'Drought & Vegetation Stress', description: 'CHIRPS SPI + NDVI deficit', colorScale: 'green-yellow-orange-red' },
    { id: 'volcanic', name: 'Volcanic & Geothermal Proximity', description: 'Distance to active Ethiopian volcanoes', colorScale: 'green-orange-red' },
    { id: 'locust', name: 'Desert Locust Threat', description: 'FAO Locust Watch + breeding conditions', colorScale: 'green-yellow-red' },
    { id: 'animal_disease', name: 'Animal Disease Risk', description: 'Livestock disease outbreak surveillance', colorScale: 'green-yellow-red' },
  ];
}

/**
 * Region-level hazard map data
 * Computes average hazard scores for each region using representative coordinates
 */
async function getRegionHazardData({ hazardLayer = 'composite' } = {}) {
  const cacheKey = `hazard:map:regions:${hazardLayer}`;
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  logger.info(`[HazardMapService] Computing region-level hazard map (layer: ${hazardLayer})`);

  const regions = await prisma.region.findMany({
    orderBy: { nameEn: 'asc' },
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAm: true,
      geojson: true,
      zones: {
        select: {
          woredas: {
            select: { centerLat: true, centerLng: true },
            take: 3,
          },
        },
        take: 3,
      },
    },
  });

  const regionFeatures = await Promise.allSettled(
    regions.map(async (region) => {
      // Get representative coordinate from first woreda
      let lat = 9.0, lng = 39.0;
      for (const zone of region.zones) {
        for (const w of zone.woredas) {
          if (w.centerLat && w.centerLng) {
            lat = w.centerLat;
            lng = w.centerLng;
            break;
          }
        }
        if (lat !== 9.0) break;
      }

      try {
        const assessment = await naturalDisasterPredictor.predictMultiHazardDisasters({
          lat, lng, woredaName: region.nameEn,
        });

        return {
          id: region.id,
          code: region.code,
          nameEn: region.nameEn,
          nameAm: region.nameAm,
          geojson: region.geojson,
          representativeCoords: { lat, lng },
          hazardData: {
            compositeIndex: assessment.compositeDisasterIndex,
            alertLevel: assessment.overallAlertLevel,
            alertLevelAm: assessment.overallAlertAm,
            primaryThreat: assessment.primaryNaturalThreat?.hazard,
            primaryThreatScore: assessment.primaryNaturalThreat?.score,
            pillars: {
              earthquake: extractPillarScore(assessment, 'seismology'),
              erosion: extractPillarScore(assessment, 'soilDegradation'),
              landslide: assessment.detailedPillars?.landslides?.score || 0,
              flood: assessment.detailedPillars?.hydrologyFlood?.score || 0,
              drought: assessment.detailedPillars?.droughtClimate?.score || 0,
            },
            color: getHazardColor(assessment.compositeDisasterIndex),
          },
        };
      } catch (err) {
        logger.warn(`[HazardMapService] Region ${region.nameEn} assessment fallback: ${err.message}`);
        return {
          id: region.id,
          code: region.code,
          nameEn: region.nameEn,
          nameAm: region.nameAm,
          geojson: region.geojson,
          hazardData: { compositeIndex: 0.2, alertLevel: 'GREEN_SAFE', color: '#22c55e' },
        };
      }
    })
  );

  const result = regionFeatures
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', MAP_CACHE_TTL);
    }
  } catch (_e) { /* non-fatal */ }

  return result;
}

/**
 * Zone-level hazard map data for a specific region
 */
async function getZoneHazardData(regionId, { hazardLayer = 'composite' } = {}) {
  const cacheKey = `hazard:map:zones:${regionId}:${hazardLayer}`;
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  logger.info(`[HazardMapService] Computing zone-level hazard map for region ${regionId}`);

  const zones = await prisma.zone.findMany({
    where: { regionId },
    orderBy: { nameEn: 'asc' },
    select: {
      id: true,
      nameEn: true,
      nameAm: true,
      geojson: true,
      region: { select: { id: true, nameEn: true, code: true } },
      woredas: {
        select: { centerLat: true, centerLng: true, nameEn: true },
        take: 2,
      },
    },
  });

  const zoneFeatures = await Promise.allSettled(
    zones.map(async (zone) => {
      let lat = 9.0, lng = 39.0;
      const firstWoreda = zone.woredas[0];
      if (firstWoreda && firstWoreda.centerLat && firstWoreda.centerLng) {
        lat = firstWoreda.centerLat;
        lng = firstWoreda.centerLng;
      }

      try {
        const assessment = await naturalDisasterPredictor.predictMultiHazardDisasters({
          lat, lng, woredaName: zone.nameEn,
        });

        return {
          id: zone.id,
          nameEn: zone.nameEn,
          nameAm: zone.nameAm,
          regionNameEn: zone.region?.nameEn,
          geojson: zone.geojson,
          hazardData: {
            compositeIndex: assessment.compositeDisasterIndex,
            alertLevel: assessment.overallAlertLevel,
            alertLevelAm: assessment.overallAlertAm,
            primaryThreat: assessment.primaryNaturalThreat?.hazard,
            color: getHazardColor(assessment.compositeDisasterIndex),
          },
        };
      } catch (_err) {
        return {
          id: zone.id,
          nameEn: zone.nameEn,
          nameAm: zone.nameAm,
          geojson: zone.geojson,
          hazardData: { compositeIndex: 0.2, alertLevel: 'GREEN_SAFE', color: '#22c55e' },
        };
      }
    })
  );

  const result = zoneFeatures
    .filter((z) => z.status === 'fulfilled')
    .map((z) => z.value);

  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', MAP_CACHE_TTL);
    }
  } catch (_e) { /* non-fatal */ }

  return result;
}

/**
 * Woreda-level hazard map data for a specific zone
 */
async function getWoredaHazardData(zoneId, { hazardLayer = 'composite' } = {}) {
  const cacheKey = `hazard:map:woredas:${zoneId}:${hazardLayer}`;
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  logger.info(`[HazardMapService] Computing woreda-level hazard map for zone ${zoneId}`);

  const woredas = await prisma.woreda.findMany({
    where: { zoneId },
    orderBy: { nameEn: 'asc' },
    select: {
      id: true,
      nameEn: true,
      nameAm: true,
      centerLat: true,
      centerLng: true,
      geojson: true,
      zone: {
        select: {
          id: true,
          nameEn: true,
          region: { select: { nameEn: true, code: true } },
        },
      },
    },
  });

  const woredaFeatures = await Promise.allSettled(
    woredas.map(async (woreda) => {
      const lat = woreda.centerLat || 9.0;
      const lng = woreda.centerLng || 39.0;

      try {
        const assessment = await naturalDisasterPredictor.predictMultiHazardDisasters({
          lat, lng, woredaName: woreda.nameEn,
        });

        return {
          id: woreda.id,
          nameEn: woreda.nameEn,
          nameAm: woreda.nameAm,
          coordinates: { lat, lng },
          zoneName: woreda.zone?.nameEn,
          regionName: woreda.zone?.region?.nameEn,
          geojson: woreda.geojson,
          hazardData: {
            compositeIndex: assessment.compositeDisasterIndex,
            alertLevel: assessment.overallAlertLevel,
            alertLevelAm: assessment.overallAlertAm,
            alertLevelOm: assessment.overallAlertOm,
            primaryThreat: assessment.primaryNaturalThreat?.hazard,
            primaryThreatDetails: assessment.primaryNaturalThreat?.details,
            top3Risks: assessment.top3DisasterRisks,
            pillars: {
              earthquake: extractPillarScore(assessment, 'seismology'),
              erosion: extractPillarScore(assessment, 'soilDegradation'),
              landslide: assessment.detailedPillars?.landslides?.score || 0,
              flood: assessment.detailedPillars?.hydrologyFlood?.score || 0,
              drought: assessment.detailedPillars?.droughtClimate?.score || 0,
            },
            color: getHazardColor(assessment.compositeDisasterIndex),
            emergencyActions: assessment.recommendedEmergencyActions,
          },
        };
      } catch (_err) {
        return {
          id: woreda.id,
          nameEn: woreda.nameEn,
          nameAm: woreda.nameAm,
          coordinates: { lat, lng },
          geojson: woreda.geojson,
          hazardData: { compositeIndex: 0.2, alertLevel: 'GREEN_SAFE', color: '#22c55e' },
        };
      }
    })
  );

  const result = woredaFeatures
    .filter((w) => w.status === 'fulfilled')
    .map((w) => w.value);

  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', MAP_CACHE_TTL);
    }
  } catch (_e) { /* non-fatal */ }

  return result;
}

// ── Utility Functions ──────────────────────────────────────────────────────────

function getHazardColor(compositeIndex) {
  if (compositeIndex >= 0.70) return '#ef4444'; // Red - Critical
  if (compositeIndex >= 0.45) return '#f97316'; // Orange - High
  if (compositeIndex >= 0.25) return '#eab308'; // Yellow - Watch
  return '#22c55e'; // Green - Safe
}

function extractPillarScore(assessment, pillar) {
  if (pillar === 'seismology') {
    const pga = assessment.detailedPillars?.seismology?.seismicHazard?.peakGroundAccelerationG || 0;
    return pga > 0.15 ? 0.85 : (pga > 0.05 ? 0.45 : 0.15);
  }
  if (pillar === 'soilDegradation') {
    const loss = assessment.detailedPillars?.soilDegradation?.erosionMetrics?.annualSoilLossTonsPerHa || 0;
    return loss > 25.0 ? 0.90 : (loss > 12.0 ? 0.50 : 0.20);
  }
  return 0;
}

module.exports = {
  getHazardLayers,
  getRegionHazardData,
  getZoneHazardData,
  getWoredaHazardData,
};
