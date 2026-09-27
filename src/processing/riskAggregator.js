// ── Ethiopian Agricultural Season Definitions ──
// Kiremt (Main Rainy): June–September (months 6–9)
// Belg (Short Rainy):  March–May (months 3–5)
// Dry / Bega:          October–February (months 10–2)

const SEASON_WEIGHTS = {
  KIREMT: { drought: 0.15, flood: 0.25, locust: 0.15, vegetation: 0.10, earthquake: 0.10, landslide: 0.10, volcanic: 0.05, erosion: 0.05, animalDisease: 0.05 },
  BELG:   { drought: 0.20, flood: 0.15, locust: 0.20, vegetation: 0.10, earthquake: 0.10, landslide: 0.05, volcanic: 0.05, erosion: 0.10, animalDisease: 0.05 },
  DRY:    { drought: 0.30, flood: 0.05, locust: 0.15, vegetation: 0.15, earthquake: 0.10, landslide: 0.05, volcanic: 0.05, erosion: 0.05, animalDisease: 0.10 },
};

const DEFAULT_WEIGHTS = SEASON_WEIGHTS.BELG; // fallback (exported for backward compat)

/**
 * Returns the active hazard weights for the current Ethiopian season.
 * Month is 1-indexed (1 = January).
 */
function getSeasonalWeights(month = new Date().getMonth() + 1) {
  if (month >= 6 && month <= 9) return { season: 'KIREMT', ...SEASON_WEIGHTS.KIREMT };
  if (month >= 3 && month <= 5) return { season: 'BELG',   ...SEASON_WEIGHTS.BELG };
  return { season: 'DRY', ...SEASON_WEIGHTS.DRY };
}

// Map composite score (0-1) to 4-tier alert level
function getAlertLevel(score) {
  if (score >= 0.75) return 'RED';
  if (score >= 0.5) return 'ORANGE';
  if (score >= 0.25) return 'YELLOW';
  return 'GREEN';
}

// Calculate weighted integrated risk composite risk index
function calculateCompositeRisk(hazardScores = {}, customWeights = {}) {
  const seasonal = getSeasonalWeights();
  // customWeights fully override seasonal weights when provided
  const weights = Object.keys(customWeights).length > 0
    ? { ...seasonal, ...customWeights }
    : seasonal;

  const sDrought = Math.max(0, Math.min(1, hazardScores.drought || 0));
  const sFlood = Math.max(0, Math.min(1, hazardScores.flood || 0));
  const sLocust = Math.max(0, Math.min(1, hazardScores.locust || 0));
  const sVeg = Math.max(0, Math.min(1, hazardScores.vegetation || 0));
  const sEarthquake = Math.max(0, Math.min(1, hazardScores.earthquake || 0));
  const sLandslide = Math.max(0, Math.min(1, hazardScores.landslide || 0));
  const sVolcanic = Math.max(0, Math.min(1, hazardScores.volcanic || 0));
  const sErosion = Math.max(0, Math.min(1, hazardScores.erosion || 0));
  const sAnimalDisease = Math.max(0, Math.min(1, hazardScores.animalDisease || 0));

  const weightedSum =
    sDrought * (weights.drought || 0) +
    sFlood * (weights.flood || 0) +
    sLocust * (weights.locust || 0) +
    sVeg * (weights.vegetation || 0) +
    sEarthquake * (weights.earthquake || 0) +
    sLandslide * (weights.landslide || 0) +
    sVolcanic * (weights.volcanic || 0) +
    sErosion * (weights.erosion || 0) +
    sAnimalDisease * (weights.animalDisease || 0);

  const totalWeight = (weights.drought || 0) + (weights.flood || 0) + (weights.locust || 0) +
    (weights.vegetation || 0) + (weights.earthquake || 0) + (weights.landslide || 0) +
    (weights.volcanic || 0) + (weights.erosion || 0) + (weights.animalDisease || 0);
  const compositeScore = Math.round((weightedSum / (totalWeight || 1)) * 100) / 100;

  const drivers = [
    { name: 'DROUGHT', score: sDrought },
    { name: 'FLOOD', score: sFlood },
    { name: 'LOCUST', score: sLocust },
    { name: 'VEGETATION_STRESS', score: sVeg },
    { name: 'EARTHQUAKE', score: sEarthquake },
    { name: 'LANDSLIDE', score: sLandslide },
    { name: 'VOLCANIC', score: sVolcanic },
    { name: 'SOIL_DEGRADATION', score: sErosion },
    { name: 'ANIMAL_DISEASE', score: sAnimalDisease },
  ];
  drivers.sort((a, b) => b.score - a.score);
  const primaryThreat = drivers[0].score > 0.2 ? drivers[0].name : 'NONE';

  return {
    compositeScore,
    alertLevel: getAlertLevel(compositeScore),
    primaryThreat,
    season: weights.season || 'CUSTOM',
    breakdown: {
      drought: { score: sDrought, weight: weights.drought || 0 },
      flood: { score: sFlood, weight: weights.flood || 0 },
      locust: { score: sLocust, weight: weights.locust || 0 },
      vegetation: { score: sVeg, weight: weights.vegetation || 0 },
      earthquake: { score: sEarthquake, weight: weights.earthquake || 0 },
      landslide: { score: sLandslide, weight: weights.landslide || 0 },
      volcanic: { score: sVolcanic, weight: weights.volcanic || 0 },
      erosion: { score: sErosion, weight: weights.erosion || 0 },
      animalDisease: { score: sAnimalDisease, weight: weights.animalDisease || 0 },
    },
  };
}

// Pipeline processor interface
function processData(payload = {}) {
  const result = calculateCompositeRisk(payload.hazardScores, payload.weights);

  return {
    woredaId: payload.woredaId || 'UNKNOWN',
    assessedAt: new Date().toISOString(),
    ...result,
  };
}

module.exports = {
  calculateCompositeRisk,
  getAlertLevel,
  getSeasonalWeights,
  processData,
  DEFAULT_WEIGHTS,
  SEASON_WEIGHTS,
};

