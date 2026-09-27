/**
 * @file verify_hazards_and_animal_health.js
 * @description Smoke test script to verify all new Hazard and Animal Health services.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const hazardsService = require('../src/modules/hazards/hazards.service');
const hazardMapService = require('../src/modules/hazards/hazardMapService');
const animalHealthService = require('../src/modules/animalHealth/animalHealth.service');
const { calculateCompositeRisk } = require('../src/processing/riskAggregator');

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AGRIETECH MULTI-HAZARD & ANIMAL HEALTH VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Risk Aggregator with 9 pillars
  console.log('--- 1. Testing Enhanced Risk Aggregator (9 Pillars) ---');
  try {
    const riskResult = calculateCompositeRisk({
      drought: 0.7,
      flood: 0.2,
      locust: 0.1,
      vegetation: 0.6,
      earthquake: 0.5,
      landslide: 0.3,
      volcanic: 0.1,
      erosion: 0.4,
      animalDisease: 0.8,
    });
    assert(riskResult && typeof riskResult.compositeScore === 'number', 'Composite score calculated as number');
    assert(riskResult.compositeScore > 0 && riskResult.compositeScore <= 1.0, 'Composite score bounded in [0, 1]');
    assert(riskResult.breakdown && riskResult.breakdown.earthquake !== undefined, 'Breakdown includes earthquake pillar');
    assert(riskResult.breakdown && riskResult.breakdown.animalDisease !== undefined, 'Breakdown includes animalDisease pillar');
    console.log(`    Composite Risk Score: ${riskResult.compositeScore.toFixed(3)} (${riskResult.alertLevel})`);
  } catch (e) {
    assert(false, `Risk Aggregator error: ${e.message}`);
  }

  // 2. Hazard Map Service
  console.log('\n--- 2. Testing Earth Engine Hazard Map Service ---');
  try {
    const layers = hazardMapService.getHazardLayers();
    assert(Array.isArray(layers) && layers.length >= 7, 'Available layers includes all 7+ hazard layers');
    console.log(`    Cataloged hazard layers: ${layers.length}`);

    const regionMap = await hazardMapService.getRegionHazardData({ hazardLayer: 'composite' });
    assert(regionMap && (Array.isArray(regionMap) || Array.isArray(regionMap.regions)), 'Regional map data returned');
    const regCount = Array.isArray(regionMap) ? regionMap.length : regionMap.regions.length;
    console.log(`    Regions mapped: ${regCount}`);
  } catch (e) {
    assert(false, `Hazard Map error: ${e.message}`);
  }

  // 3. Hazards Service (Earthquake, Landslide, Soil, Volcanic)
  console.log('\n--- 3. Testing Hazards Service ---');
  try {
    const quakes = await hazardsService.getLiveEarthquakes({ minMagnitude: 3.0, days: 30 });
    assert(Array.isArray(quakes), 'Earthquakes returned as array');
    console.log(`    Live tectonic events queried: ${quakes.length}`);

    const soil = await hazardsService.assessSoilDegradation({ latitude: 9.0, longitude: 38.7 });
    assert(soil && (soil.soilDegradation || soil.assessedAt), 'Soil degradation assessment returned');

    const landslides = await hazardsService.assessLandslideRisk({ latitude: 9.0, longitude: 38.7 });
    assert(landslides && (landslides.landslide || landslides.assessedAt), 'Landslide susceptibility assessment returned');

    const volcanic = await hazardsService.assessVolcanicRisk({ latitude: 8.5, longitude: 39.2 });
    assert(volcanic && (volcanic.volcanic || volcanic.assessedAt), 'Volcanic risk assessment returned');
  } catch (e) {
    assert(false, `Hazards Service error: ${e.message}`);
  }

  // 4. Animal Health Service
  console.log('\n--- 4. Testing Animal Health & Veterinary Service ---');
  try {
    const result = animalHealthService.getAllDiseases({});
    assert(result && Array.isArray(result.diseases) && result.diseases.length >= 10, 'Endemic livestock diseases catalog returned (10+ diseases)');
    console.log(`    Endemic diseases cataloged: ${result.totalDiseases}`);

    const calendar = animalHealthService.getUpcomingVetTasks(new Date().getMonth() + 1);
    assert(calendar && calendar.tasks, 'Veterinary vaccination tasks returned for current month');
    console.log(`    Upcoming vet tasks: ${calendar.upcomingTaskCount}`);

    const pasture = await animalHealthService.getPastureCondition({ latitude: 8.54, longitude: 39.27 });
    assert(pasture && pasture.forageAssessment, 'Pasture & rangeland condition evaluated');
    console.log(`    Pasture Quality: ${pasture.forageAssessment.quality} (${pasture.forageAssessment.estimatedBiomassDryMatterKgPerHa} kg DM/ha)`);
  } catch (e) {
    assert(false, `Animal Health Service error: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runVerification();
