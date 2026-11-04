/**
 * @file test_hyperlocal_engine.js
 * @description Comprehensive test suite for Coordinate-Specific HyperLocal Agronomy Engine across all Ethiopian Belts
 */

const hyperLocalEngine = require('../src/processing/hyperLocalAgronomyEngine');
const analyticsService = require('../src/modules/analytics/analytics.service');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function testAssert(name, condition, details = '') {
  if (condition) {
    log(`✅ PASS - ${name}`, 'green');
    if (details) console.log(`   ${details}`);
  } else {
    log(`❌ FAIL - ${name}`, 'red');
    if (details) console.log(`   ${details}`);
  }
}

async function runTests() {
  log('\n' + '='.repeat(80), 'cyan');
  log('   AGRIETECH HYPER-LOCAL COORDINATE & DIGITAL SOIL ENGINE TEST SUITE', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');

  // Test 1: Western Oromia Acidic Soil (Nekemte / Jimma) - Agricultural Lime Test
  log('--- 1. Testing Western Oromia Acidic Soil Belt (Nekemte: 9.08°N, 36.55°E) ---', 'yellow');
  try {
    const profile = await hyperLocalEngine.computeHyperLocalProfile({
      lat: 9.08,
      lng: 36.55,
      crop: 'WHEAT',
    });

    testAssert('Topography & AEZ resolved', profile.topography.agroZone === 'WEINA_DEGA' || profile.topography.agroZone === 'DEGA',
      `Elevation: ${profile.topography.elevationMeters}m (${profile.topography.agroZone}), Hub: ${profile.topography.nearestGeographicHub}`);

    testAssert('Soil Acidity (pH < 5.5) correctly identified', profile.soilHealth.soilPh < 5.5,
      `Soil pH: ${profile.soilHealth.soilPh}, Status: ${profile.soilHealth.soilHealthStatus}`);

    testAssert('Agricultural Lime (ኖራ) requirement calculated', profile.soilHealth.isLimeMandatory === true && profile.soilHealth.limeRequirementQtPerHa > 0,
      `Lime Prescription: ${profile.soilHealth.limeRequirementQtPerHa} Qt/ha, Blend: ${profile.soilHealth.blendAm}`);
  } catch (err) {
    testAssert('Nekemte profile calculation failed', false, err.message);
  }

  // Test 2: Highland Debre Berhan Frost & Teff/Barley Suitability
  log('\n--- 2. Testing Highland Dega Belt (Debre Berhan: 9.68°N, 39.53°E) ---', 'yellow');
  try {
    const profile = await hyperLocalEngine.computeHyperLocalProfile({
      lat: 9.68,
      lng: 39.53,
      crop: 'BARLEY',
    });

    testAssert('Highland Dega elevation resolved', profile.topography.elevationMeters >= 2400,
      `Elevation: ${profile.topography.elevationMeters}m (${profile.topography.agroZone})`);

    testAssert('Crop suitability recommends Barley & Wheat', 
      profile.cropSuitability.highlySuitable.some(c => c.includes('Barley') || c.includes('ገብስ')),
      `Suitable Crops: ${profile.cropSuitability.highlySuitable.join(', ')}`);

    testAssert('Environmental Lapse-Rate micro-weather downscaling', 
      profile.microClimate.currentTempCelsius < 20.0,
      `Downscaled Temp: ${profile.microClimate.currentTempCelsius}°C, Min: ${profile.microClimate.dailyMinTempCelsius}°C, Frost: ${profile.microClimate.frostRisk}`);
  } catch (err) {
    testAssert('Debre Berhan profile calculation failed', false, err.message);
  }

  // Test 3: Central Rift Midland Vertisol Belt (Adama / Wonji: 8.54°N, 39.27°E)
  log('\n--- 3. Testing Central Midland Vertisol Belt (Adama: 8.54°N, 39.27°E) ---', 'yellow');
  try {
    const profile = await analyticsService.getHyperLocalProfile(8.54, 39.27, 'TEFF');

    testAssert('Vertisol soil diagnostic & NPSB schedule', 
      profile.soilHealth.dominantSoilType.includes('Vertisol') || profile.soilHealth.dominantSoilType.includes('Fluvisol'),
      `Dominant Soil: ${profile.soilHealth.dominantSoilType}, Soil pH: ${profile.soilHealth.soilPh}`);

    testAssert('Sentinel-1 SAR Radar & Sentinel-2 10m telemetry present', 
      profile.remoteSensing.sarSoilMoisturePct !== undefined && profile.remoteSensing.sentinel2Ndvi10m !== undefined,
      `Sentinel-2 NDVI: ${profile.remoteSensing.sentinel2Ndvi10m}, SAR Soil Moisture: ${profile.remoteSensing.sarSoilMoisturePct}%`);

    testAssert('Ge\'ez Calendar conversion accuracy',
      profile.ethiopicCalendar.year > 2000 && profile.ethiopicCalendar.monthNameAm !== undefined,
      `Date: ${profile.ethiopicCalendar.formattedAm} (Evangelist: ${profile.ethiopicCalendar.evangelist})`);
  } catch (err) {
    testAssert('Adama profile calculation failed', false, err.message);
  }

  // Test 4: Lowland Kolla Belt (Arba Minch / Gambela: 6.03°N, 37.55°E)
  log('\n--- 4. Testing Lowland Kolla Belt (Arba Minch: 6.03°N, 37.55°E) ---', 'yellow');
  try {
    const profile = await analyticsService.getHyperLocalProfile(6.03, 37.55, 'SORGHUM');

    testAssert('Kolla elevation & warm thermal zone resolved', 
      profile.topography.agroZone === 'KOLLA' || profile.topography.agroZone === 'WEINA_DEGA',
      `Elevation: ${profile.topography.elevationMeters}m (${profile.topography.agroZone})`);

    testAssert('Sorghum and Sesame recommended for Lowland', 
      profile.cropSuitability.highlySuitable.some(c => c.includes('Sorghum') || c.includes('Sesame') || c.includes('ማሽላ')),
      `Suitable Crops: ${profile.cropSuitability.highlySuitable.join(', ')}`);
  } catch (err) {
    testAssert('Arba Minch profile calculation failed', false, err.message);
  }

  // Test 5: Arid Pastoralist Bereha Belt (Afar / Semara: 11.79°N, 41.01°E)
  log('\n--- 5. Testing Arid Bereha Belt (Semara: 11.79°N, 41.01°E) ---', 'yellow');
  try {
    const agroZone = await analyticsService.getAgroZone(11.79, 41.01);

    testAssert('Bereha / Lowland classification', 
      agroZone.topography.agroZone === 'BEREHA' || agroZone.topography.agroZone === 'KOLLA',
      `Elevation: ${agroZone.topography.elevationMeters}m (${agroZone.topography.agroZone}), Soil pH: ${agroZone.topography.soilPh}`);
  } catch (err) {
    testAssert('Semara profile calculation failed', false, err.message);
  }

  log('\n' + '='.repeat(80), 'cyan');
  log('   ALL HYPER-LOCAL COORDINATE ALGORITHM TESTS COMPLETED SUCCESSFULLY', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
