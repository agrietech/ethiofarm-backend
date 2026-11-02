/**
 * @file test_earth_engine_disasters_seismology.js
 * @description Comprehensive Test Suite for Google Earth Engine Satellite Compute,
 * Soil Degradation (RUSLE), Seismology Hazards (USGS API), and Multi-Disaster Predictions.
 */

const assert = require('assert');
const earthEngineConnector = require('../src/ingestion/connectors/earthEngineConnector');
const soilDegradationEngine = require('../src/processing/soilDegradationEngine');
const seismologyHazardEngine = require('../src/processing/seismologyHazardEngine');
const naturalDisasterPredictor = require('../src/processing/naturalDisasterPredictor');
const { handleUssdSession } = require('../src/delivery/ussd/ussdMenu.controller');
const { formatEmergencySms } = require('../src/delivery/sms/smsFormatter');

async function runSuite() {
  console.log('\n================================================================================');
  console.log('   AGRIETECH SATELLITE, SEISMOLOGY & SOIL DISASTER ENGINE TEST SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS - ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL - ${name}: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ PASS - ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL - ${name}: ${err.message}`);
    }
  }

  // ── 1. Shortcode *212# Verification ──────────────────────────────────────────
  console.log('--- 1. Testing USSD *212# Shortcode & New Menu Options ---');

  async function simulateUssd(text) {
    return new Promise((resolve) => {
      const req = { body: { sessionId: 'test_212', phoneNumber: '+251911223344', text } };
      const res = {
        headers: {},
        set(k, v) { this.headers[k] = v; },
        send(b) { resolve(b); },
      };
      handleUssdSession(req, res, (e) => resolve(`ERR: ${e.message}`));
    });
  }

  await testAsync('USSD Root Welcome includes *212# and Option 4 Soil/Earthquake', async () => {
    const resp = await simulateUssd('');
    assert(resp.includes('*212#'));
    assert(resp.includes('4.'));
  });

  await testAsync('USSD Option 4: Live Soil Erosion & Seismic Risk Output', async () => {
    const resp = await simulateUssd('4');
    assert(resp.startsWith('END '));
    assert(resp.includes('PGA') || resp.includes('የመሬት መንቀጥቀጥ') || resp.includes('Sochii'));
  });

  test('SMS Formatter references shortcode *212#', () => {
    const alert = formatEmergencySms({
      hazardType: 'FLOOD',
      severity: 'HIGH',
      woredaName: 'Adama',
      lang: 'am',
    });
    assert(alert.message.includes('*212#'));
  });

  // ── 2. Google Earth Engine Multi-Satellite Analytics ─────────────────────────
  console.log('\n--- 2. Testing Google Earth Engine Multi-Satellite Analytics ---');

  await testAsync('Sentinel-2 Multispectral Indices (NDVI, NDRE, EVI, SAVI, NDWI, MSI)', async () => {
    const s2 = await earthEngineConnector.fetchSentinel2Ndvi(8.54, 39.27);
    assert(s2.ndviMean >= 0.1 && s2.ndviMean <= 1.0);
    assert(s2.ndreMean != null);
    assert(s2.eviMean != null);
    assert(s2.saviMean != null);
    assert(s2.ndwiMean != null);
    assert(s2.moistureStressIndex != null);
  });

  await testAsync('Sentinel-1 SAR C-Band Radar & Dielectric Permittivity', async () => {
    const sar = await earthEngineConnector.fetchSentinel1SarSoilMoisture(11.59, 37.39);
    assert.strictEqual(sar.allWeatherRadar, true);
    assert(sar.radarBackscatterVv <= 0);
    assert(sar.radarBackscatterVh <= 0);
    assert(sar.radarVegetationIndex >= 0.0 && sar.radarVegetationIndex <= 1.0);
    assert(sar.soilDielectricConstant >= 1.0);
  });

  await testAsync('Landsat 8/9 Thermal Infrared & MODIS FIRMS Fire Telemetry', async () => {
    const thermal = await earthEngineConnector.fetchThermalAndFireMetrics(11.75, 41.00); // Afar
    assert(thermal.landSurfaceTempCelsius > 0);
    assert(thermal.surfaceEmissivity >= 0.9);
    assert(['NORMAL', 'HIGH_HEAT_ANOMALY'].includes(thermal.thermalAnomalyStatus));
  });

  await testAsync('SRTM 30m DEM Elevation, Slope & Topographic Wetness Index (TWI)', async () => {
    const dem = await earthEngineConnector.fetchTopographicDemMetrics(9.68, 39.53); // Debre Berhan
    assert(dem.elevationMeters >= 1000);
    assert(dem.slopePercent > 0);
    assert(dem.slopeAspect != null);
    assert(dem.topographicWetnessIndex > 0);
  });


  // ── 3. Soil Degradation & Land Loss (RUSLE) Engine ───────────────────────────
  console.log('\n--- 3. Testing Soil Degradation & Land Loss (RUSLE) Engine ---');

  await testAsync('Assess Highland Soil Loss (Debre Berhan / North Shewa Steep Slope)', async () => {
    const assessment = await soilDegradationEngine.assessSoilDegradation({
      lat: 9.68,
      lng: 39.53,
      woredaName: 'Debre Berhan Highland',
      slopePct: 24.0,
      conservationPractice: 'NONE',
    });

    assert(assessment.rusleFactors.R_rainfallErosivity > 0);
    assert(assessment.rusleFactors.K_soilErodibility > 0);
    assert(assessment.rusleFactors.LS_slopeLengthSteepness > 1.0);
    assert(assessment.erosionMetrics.annualSoilLossTonsPerHa > 0);
    assert(assessment.conservationInterventions.am.length > 0);
    assert(assessment.conservationInterventions.om.length > 0);
  });

  await testAsync('Assess Western Oromia Acidic Soil Leaching (Nekemte)', async () => {
    const assessment = await soilDegradationEngine.assessSoilDegradation({
      lat: 9.08,
      lng: 36.55,
      woredaName: 'Nekemte / Western Oromia',
    });

    assert.strictEqual(assessment.chemicalDegradation.type, 'SEVERE_ACIDIFICATION');
    assert(assessment.conservationInterventions.am.some((i) => i.includes('ኖራ')));
  });

  // ── 4. Seismology & Earthquake Hazard Engine ─────────────────────────────────
  console.log('\n--- 4. Testing Real-Time Seismology & Fault Line Modeling ---');

  await testAsync('Live/Calibrated USGS Tectonic Event Fetching for Ethiopia', async () => {
    const events = await seismologyHazardEngine.fetchLiveSeismicEvents({ days: 60, minMagnitude: 2.5 });
    assert(Array.isArray(events));
    assert(events.length > 0);
    assert(events[0].coordinates.lat >= 3.0 && events[0].coordinates.lat <= 15.5);
  });

  await testAsync('Seismic Hazard Assessment for Wonji Fault Belt (Adama / Central Rift)', async () => {
    const seismic = seismologyHazardEngine.assessLocationSeismicRisk(8.55, 39.30);
    assert(seismic.nearestFaultSystem.name.includes('Wonji') || seismic.nearestFaultSystem.name.includes('Rift'));
    assert(seismic.seismicHazard.peakGroundAccelerationG > 0);
    assert(seismic.seismicHazard.modifiedMercalliIntensity != null);
    assert(['CRITICAL_FAULT_ZONE', 'HIGH', 'MODERATE', 'LOW'].includes(seismic.seismicHazard.riskLevel));
    assert(seismic.infrastructureSafety.am.length > 0);
  });

  // ── 5. Multi-Hazard Natural Disaster Master Prediction Engine ────────────────
  console.log('\n--- 5. Testing Multi-Hazard Natural Disaster Master Predictor ---');

  await testAsync('Predict Multi-Hazard Disaster Profile for Afar Rifting & Volcanic Zone (Semara)', async () => {
    const prediction = await naturalDisasterPredictor.predictMultiHazardDisasters({
      lat: 11.79,
      lng: 41.01,
      woredaName: 'Semara Woreda',
    });

    assert(prediction.compositeDisasterIndex >= 0.0 && prediction.compositeDisasterIndex <= 1.0);
    assert(prediction.top3DisasterRisks.length === 3);
    assert(prediction.detailedPillars.seismology != null);
    assert(prediction.detailedPillars.soilDegradation != null);
    assert(prediction.detailedPillars.volcanology != null);
    assert(prediction.recommendedEmergencyActions.am != null);
  });

  console.log('\n================================================================================');
  console.log(`   TEST SUMMARY: ${passed}/${total} TESTS PASSED SUCCESSFULLY (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================================\n');

  if (passed === total) process.exit(0);
  else process.exit(1);
}

runSuite().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
