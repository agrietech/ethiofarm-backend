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
  const hasCustom = Object.keys(customWeights).length > 0;
  const weights = hasCustom ? customWeights : seasonal;

  const allKeys = ['drought', 'flood', 'locust', 'vegetation', 'earthquake', 'landslide', 'volcanic', 'erosion', 'animalDisease'];
  const inputKeys = Object.keys(hazardScores);

  // If custom weights provided, evaluate based on custom weights keys
  // If hazardScores provided with a subset of keys, evaluate based on that subset
  const evalKeys = hasCustom
    ? Object.keys(customWeights).filter((k) => k !== 'season')
    : (inputKeys.length > 0 ? inputKeys.filter((k) => allKeys.includes(k)) : allKeys);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const k of evalKeys) {
    const score = Math.max(0, Math.min(1, Number(hazardScores[k]) || 0));
    const w = Number(weights[k]) || 0;
    weightedSum += score * w;
    totalWeight += w;
  }

  const compositeScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

  const drivers = allKeys.map((k) => {
    let name = k.toUpperCase();
    if (k === 'vegetation') name = 'VEGETATION_STRESS';
    if (k === 'erosion') name = 'SOIL_DEGRADATION';
    if (k === 'animalDisease') name = 'ANIMAL_DISEASE';
    return {
      name,
      score: Math.max(0, Math.min(1, Number(hazardScores[k]) || 0)),
    };
  }).sort((a, b) => b.score - a.score);

  const primaryThreat = drivers[0].score > 0.2 ? drivers[0].name : 'NONE';

  return {
    compositeScore,
    alertLevel: getAlertLevel(compositeScore),
    primaryThreat,
    season: (hasCustom && customWeights.season) || seasonal.season || 'CUSTOM',
    breakdown: {
      drought: { score: Number(hazardScores.drought) || 0, weight: weights.drought || 0 },
      flood: { score: Number(hazardScores.flood) || 0, weight: weights.flood || 0 },
      locust: { score: Number(hazardScores.locust) || 0, weight: weights.locust || 0 },
      vegetation: { score: Number(hazardScores.vegetation) || 0, weight: weights.vegetation || 0 },
      earthquake: { score: Number(hazardScores.earthquake) || 0, weight: weights.earthquake || 0 },
      landslide: { score: Number(hazardScores.landslide) || 0, weight: weights.landslide || 0 },
      volcanic: { score: Number(hazardScores.volcanic) || 0, weight: weights.volcanic || 0 },
      erosion: { score: Number(hazardScores.erosion) || 0, weight: weights.erosion || 0 },
      animalDisease: { score: Number(hazardScores.animalDisease) || 0, weight: weights.animalDisease || 0 },
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

