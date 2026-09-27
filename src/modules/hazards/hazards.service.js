/**
 * @file hazards.service.js
 * @description Multi-Hazard Assessment Service for Ethiopia.
 * Orchestrates calls to all 6 disaster pillars:
 *   1. Earthquakes & Seismic Rifting (USGS API + Ethiopian Fault Systems)
 *   2. Soil Degradation & Severe Land Erosion (RUSLE Modeling)
 *   3. Landslides & Mudflows (Highland Slope + SAR Soil Saturation)
 *   4. Volcanic & Geothermal Anomalies (Afar & Central Rift)
 *   5. Flash Floods & River Inundation (GloFAS + Topographic Sinks)
 *   6. Drought & Crop Desiccation (CHIRPS SPI + VCI Vegetation Deficits)
 */

const naturalDisasterPredictor = require('../../processing/naturalDisasterPredictor');
const seismologyHazardEngine = require('../../processing/seismologyHazardEngine');
const soilDegradationEngine = require('../../processing/soilDegradationEngine');
const earthEngineConnector = require('../../ingestion/connectors/earthEngineConnector');
const { getWoredaCoordinates } = require('../boundaries/boundaries.service');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

const HAZARD_CACHE_TTL = 30 * 60; // 30 minutes

function hazardCacheKey(type, lat, lng) {
  return `hazard:${type}:${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
}

/**
 * Full integrated multi-hazard assessment for a location
 */
async function assessMultiHazard({ lat, lng, woredaId, woredaName }) {
  let latitude = Number(lat);
  let longitude = Number(lng);
  let resolvedName = woredaName || 'Target Area';

  // Resolve coordinates from woredaId if only woredaId provided
  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
    resolvedName = woredaName || coords.nameEn || woredaId;
  }

  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    throw new Error('Valid latitude and longitude are required for hazard assessment');
  }

  // Check cache
  const cacheKey = hazardCacheKey('multi', latitude, longitude);
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  logger.info(`[HazardsService] Running integrated multi-hazard assessment at [${latitude}, ${longitude}] (${resolvedName})`);

  const result = await naturalDisasterPredictor.predictMultiHazardDisasters({
    lat: latitude,
    lng: longitude,
    woredaName: resolvedName,
  });

  // Cache result
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', HAZARD_CACHE_TTL);
    }
  } catch (_e) { /* non-fatal */ }

  return result;
}

/**
 * Live USGS earthquake events for the Horn of Africa
 */
async function getLiveEarthquakes({ days = 30, minMagnitude = 2.5 } = {}) {
  const cacheKey = `hazard:earthquakes:${days}:${minMagnitude}`;
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  const events = await seismologyHazardEngine.fetchLiveSeismicEvents({
    days: Number(days) || 30,
    minMagnitude: Number(minMagnitude) || 2.5,
  });

  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(events), 'EX', 15 * 60); // 15 min cache
    }
  } catch (_e) { /* non-fatal */ }

  return events;
}

/**
 * Location-specific earthquake risk assessment
 */
async function assessEarthquakeRisk({ lat, lng, woredaId, woredaName }) {
  let latitude = Number(lat);
  let longitude = Number(lng);

  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
  }

  return await seismologyHazardEngine.getSeismicAssessmentForLocation({
    lat: latitude,
    lng: longitude,
    woredaName: woredaName || null,
  });
}

/**
 * Soil degradation / erosion assessment (RUSLE)
 */
async function assessSoilDegradation({ lat, lng, woredaId, woredaName, slopePct, conservationPractice }) {
  let latitude = Number(lat);
  let longitude = Number(lng);
  let resolvedName = woredaName || null;

  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
    resolvedName = woredaName || coords.nameEn;
  }

  return await soilDegradationEngine.assessSoilDegradation({
    lat: latitude,
    lng: longitude,
    woredaName: resolvedName,
    slopePct: slopePct ? Number(slopePct) : null,
    conservationPractice: conservationPractice || 'NONE',
  });
}

/**
 * Landslide susceptibility assessment
 */
async function assessLandslideRisk({ lat, lng, woredaId }) {
  let latitude = Number(lat);
  let longitude = Number(lng);

  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
  }

  // Fetch planetary data for slope and soil moisture
  const planetary = await earthEngineConnector.fetchPlanetaryMetrics({
    lat: latitude,
    lng: longitude,
    level: 'WOREDA',
  });

  const elevation = planetary.elevationMeters || 1800;
  const slope = planetary.slopePercent || 8;
  const soilMoisture = planetary.soilMoisturePct || 45.0;
  const isHeavySaturation = soilMoisture > 70.0;
  const isSteepHighland = slope > 22.0 && elevation > 2000;

  let score = 0.1;
  let riskLevel = 'LOW';
  let riskLevelAm = 'ዝቅተኛ የመሬት መንሸራተት ስጋት';
  let riskLevelOm = 'Balaa Sigiga Lafaa Gadi-aanaa';
  let triggerFactors = [];

  if (isSteepHighland && isHeavySaturation) {
    score = 0.88;
    riskLevel = 'CRITICAL_HIGH';
    riskLevelAm = 'እጅግ ከፍተኛ የመሬት መንሸራተትና የናዳ አደጋ';
    riskLevelOm = 'Balaa Sigiga Lafaa Cimaa fi Hatattamaa';
    triggerFactors = ['Steep Highland Terrain (>2000m)', 'Saturated Soil (>70%)', 'Heavy Monsoon Rainfall'];
  } else if (isSteepHighland || (slope > 15.0 && soilMoisture > 60.0)) {
    score = 0.55;
    riskLevel = 'MODERATE';
    riskLevelAm = 'መካከለኛ የመሬት መንሸራተት ስጋት';
    riskLevelOm = 'Balaa Sigiga Lafaa Giddu-galeessa';
    triggerFactors = ['Moderate Slope Gradient', 'Elevated Soil Moisture'];
  } else if (slope > 10.0) {
    score = 0.25;
    riskLevel = 'LOW_MODERATE';
    riskLevelAm = 'ዝቅተኛ-መካከለኛ የመሬት መንሸራተት ስጋት';
    riskLevelOm = 'Balaa Sigiga Lafaa Gadi-aanaa hanga Giddu-galeessa';
    triggerFactors = ['Mild Slope'];
  }

  return {
    coordinates: { lat: latitude, lng: longitude },
    assessedAt: new Date().toISOString(),
    score,
    riskLevel,
    riskLevelAm,
    riskLevelOm,
    triggerFactors,
    terrain: {
      elevationMeters: elevation,
      slopePercent: slope,
      soilMoisturePct: soilMoisture,
      aspect: planetary.slopeAspect || 'Unknown',
    },
    recommendations: {
      en: score > 0.5
        ? ['Evacuate homesteads on steep saturated slopes (>22°)', 'Divert surface run-off with drainage channels', 'Plant deep-rooted stabilization trees (Eucalyptus, Grevillea)']
        : ['Monitor slope stability during Kiremt rainy season', 'Maintain existing drainage channels'],
      am: score > 0.5
        ? ['ከፍተኛ ቁልቁለታማ ዳገቶች ላይ የሚገኙ ሰዎችን ያስጠነቅቁ', 'የዝናብ ጎርፍ ማስቀየሻ ቦዮችን ያዘጋጁ', 'ጥልቅ ስር ያላቸውን ዛፎች ይትከሉ']
        : ['በክረምት ወቅት የመሬቱን ሁኔታ ይከታተሉ', 'ያሉ የውሃ ማስተንፈሻ ቦዮችን ይጠብቁ'],
    },
  };
}

/**
 * Volcanic proximity risk assessment
 */
async function assessVolcanicRisk({ lat, lng, woredaId }) {
  let latitude = Number(lat);
  let longitude = Number(lng);

  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
  }

  // Use the multi-hazard predictor and extract volcanic pillar
  const fullAssessment = await naturalDisasterPredictor.predictMultiHazardDisasters({
    lat: latitude,
    lng: longitude,
    woredaName: 'Target Area',
  });

  return {
    coordinates: { lat: latitude, lng: longitude },
    assessedAt: new Date().toISOString(),
    ...fullAssessment.detailedPillars.volcanology,
    recommendations: {
      en: fullAssessment.detailedPillars.volcanology.riskLevel !== 'LOW'
        ? ['Monitor volcanic gas emissions and seismic micro-tremors', 'Establish evacuation routes for nearby communities', 'Protect water sources from volcanic ash contamination']
        : ['No imminent volcanic threat. Continue standard monitoring.'],
      am: fullAssessment.detailedPillars.volcanology.riskLevel !== 'LOW'
        ? ['የእሳተ ገሞራ ጋዝ ልቀቶችን ይከታተሉ', 'ለአቅራቢያ ማህበረሰቦች የመልቀቂያ መንገዶችን ያዘጋጁ']
        : ['ምንም አፋጣኝ የእሳተ ገሞራ ስጋት የለም።'],
    },
  };
}

/**
 * National hazard summary statistics
 */
async function getNationalHazardSummary() {
  const cacheKey = 'hazard:national:summary';
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (_e) { /* non-fatal */ }

  // Sample key locations across Ethiopia for national overview
  const sampleLocations = [
    { name: 'Afar Depression (Semera)', lat: 11.79, lng: 41.00 },
    { name: 'Addis Ababa', lat: 9.02, lng: 38.75 },
    { name: 'Hawassa (SNNPR)', lat: 7.06, lng: 38.48 },
    { name: 'Bahir Dar (Amhara)', lat: 11.60, lng: 37.39 },
    { name: 'Dire Dawa', lat: 9.60, lng: 41.85 },
    { name: 'Jijiga (Somali)', lat: 9.35, lng: 42.80 },
    { name: 'Gambela', lat: 8.25, lng: 34.59 },
    { name: 'Mekelle (Tigray)', lat: 13.50, lng: 39.47 },
    { name: 'Jimma (Oromia West)', lat: 7.67, lng: 36.83 },
    { name: 'Arba Minch (Gofa/Gamo)', lat: 6.04, lng: 37.55 },
  ];

  const assessments = await Promise.allSettled(
    sampleLocations.map(async (loc) => {
      const result = await naturalDisasterPredictor.predictMultiHazardDisasters({
        lat: loc.lat,
        lng: loc.lng,
        woredaName: loc.name,
      });
      return { location: loc, ...result };
    })
  );

  const successful = assessments
    .filter((a) => a.status === 'fulfilled')
    .map((a) => a.value);

  const criticalZones = successful.filter((a) => a.compositeDisasterIndex >= 0.70);
  const highAlertZones = successful.filter((a) => a.compositeDisasterIndex >= 0.45 && a.compositeDisasterIndex < 0.70);
  const watchZones = successful.filter((a) => a.compositeDisasterIndex >= 0.25 && a.compositeDisasterIndex < 0.45);
  const safeZones = successful.filter((a) => a.compositeDisasterIndex < 0.25);

  const summary = {
    country: 'Ethiopia',
    assessedAt: new Date().toISOString(),
    sampleLocationsAssessed: successful.length,
    alertDistribution: {
      RED_CRITICAL: criticalZones.length,
      ORANGE_HIGH: highAlertZones.length,
      YELLOW_WATCH: watchZones.length,
      GREEN_SAFE: safeZones.length,
    },
    topThreats: successful
      .sort((a, b) => b.compositeDisasterIndex - a.compositeDisasterIndex)
      .slice(0, 5)
      .map((a) => ({
        location: a.location.name,
        compositeIndex: a.compositeDisasterIndex,
        alertLevel: a.overallAlertLevel,
        primaryThreat: a.primaryNaturalThreat?.hazard,
      })),
    hazardPillarAverages: {
      seismic: avg(successful.map((a) => a.detailedPillars?.seismology?.seismicHazard?.peakGroundAccelerationG || 0)),
      erosion: avg(successful.map((a) => a.detailedPillars?.soilDegradation?.erosionMetrics?.annualSoilLossTonsPerHa || 0)),
      landslide: avg(successful.map((a) => a.detailedPillars?.landslides?.score || 0)),
      flood: avg(successful.map((a) => a.detailedPillars?.hydrologyFlood?.score || 0)),
      drought: avg(successful.map((a) => a.detailedPillars?.droughtClimate?.score || 0)),
    },
  };

  // Cache for 1 hour
  try {
    if (redis && redis.isConnected && redis.isConnected()) {
      await redis.set(cacheKey, JSON.stringify(summary), 'EX', 3600);
    }
  } catch (_e) { /* non-fatal */ }

  return summary;
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
}

module.exports = {
  assessMultiHazard,
  getLiveEarthquakes,
  assessEarthquakeRisk,
  assessSoilDegradation,
  assessLandslideRisk,
  assessVolcanicRisk,
  getNationalHazardSummary,
};
