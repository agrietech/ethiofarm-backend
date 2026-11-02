/**
 * Automated Verification Script for Crop Protection & Precision Management Suite
 * Tests full integration including camera/upload file attachments and base64 payloads
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');

const testToken = jwt.sign(
  { id: 'usr_test_da_01', email: 'da@ethiofarm.et', role: 'DEVELOPMENT_AGENT', woredaId: 'woreda_adama_01' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

// 1x1 transparent JPEG test buffer
const sampleImageBuffer = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);
const sampleBase64 = sampleImageBuffer.toString('base64');

async function runCropProtectionVerification() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING CROP PROTECTION & PRECISION FIELD SUITE');
  console.log('   (Verifying Camera/Upload & Backend Integration)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Weed Database & Detection
    console.log('--- Feature 1: Weed Registry & Selective Herbicide Prescriptions ---');
    const weedDbRes = await request(app).get('/api/v1/crop-protection/weed/database');
    assert('GET /weed/database returns 200', weedDbRes.status === 200);
    assert('Weed database has Parthenium', weedDbRes.body?.data?.weeds?.some(w => w.id === 'parthenium_hysterophorus'));

    // Test standard JSON request
    const weedDetectRes = await request(app)
      .post('/api/v1/crop-protection/weed/detect')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ cropType: 'Wheat', areaHectares: 2.5 });
    assert('POST /weed/detect (JSON) returns 200', weedDetectRes.status === 200);
    assert('Detect provides calibrated knapsack plan', weedDetectRes.body?.data?.calibratedKnapsackSprayerPlan?.totalKnapsacksNeeded > 0);
    assert('Prescribes selective herbicides for Wheat', weedDetectRes.body?.data?.recommendedHerbicides?.length > 0);

    // Test multipart image upload (Camera / Gallery simulation)
    const weedUploadRes = await request(app)
      .post('/api/v1/crop-protection/weed/detect')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('image', sampleImageBuffer, 'weed_sample.jpg')
      .field('cropType', 'Wheat')
      .field('areaHectares', '1.5');
    assert('POST /weed/detect with Camera/Gallery image upload returns 200', weedUploadRes.status === 200);
    assert('Image upload triggers calibrated knapsack plan', weedUploadRes.body?.data?.calibratedKnapsackSprayerPlan?.totalKnapsacksNeeded > 0);

    // Test base64 payload upload
    const weedBase64Res = await request(app)
      .post('/api/v1/crop-protection/weed/detect')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ cropType: 'Teff', areaHectares: 1.0, imageBase64: sampleBase64 });
    assert('POST /weed/detect with Base64 payload returns 200', weedBase64Res.status === 200);

    // 2. Spray Window Weather Advisory
    console.log('\n--- Feature 2: Smart Spray Window Weather Advisory ---');
    const sprayRes = await request(app).get('/api/v1/crop-protection/spray-window?latitude=8.54&longitude=39.27');
    assert('GET /spray-window returns 200', sprayRes.status === 200);
    assert('Spray window provides current suitability status', ['OPTIMAL_TO_SPRAY', 'SPRAY_WITH_CAUTION', 'DO_NOT_SPRAY'].includes(sprayRes.body?.data?.currentConditions?.status));
    assert('Spray window evaluates hourly forecast', sprayRes.body?.data?.next12HoursAdvisory?.length > 0);
    assert('Provides bilingual rainfastness advisory', !!sprayRes.body?.data?.rainfastnessAdvisoryAm);

    // 3. Nutrient Deficiency Scanner
    console.log('\n--- Feature 3: Nutrient Deficiency Scanner & Top-Dressing ---');
    const nutDbRes = await request(app).get('/api/v1/crop-protection/nutrient/database');
    assert('GET /nutrient/database returns 200', nutDbRes.status === 200);
    assert('Nutrient DB contains Nitrogen and Zinc', nutDbRes.body?.data?.deficiencies?.some(d => d.id === 'nitrogen_deficiency'));

    const nutScanRes = await request(app)
      .post('/api/v1/crop-protection/nutrient/scan')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ cropType: 'Maize', leafPosition: 'older', pattern: 'v_shaped' });
    assert('POST /nutrient/scan returns 200', nutScanRes.status === 200);
    assert('Detects Nitrogen deficiency from V-pattern', nutScanRes.body?.data?.diagnosedDeficiency?.id === 'nitrogen_deficiency');
    assert('Provides Urea top-dressing & foliar rescue rate', !!nutScanRes.body?.data?.correctiveAction?.knapsackFoliarRescue);

    // Test multipart image upload for nutrient scanner (Camera / Gallery simulation)
    const nutUploadRes = await request(app)
      .post('/api/v1/crop-protection/nutrient/scan')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('image', sampleImageBuffer, 'leaf_sample.jpg')
      .field('cropType', 'Maize')
      .field('leafPosition', 'older')
      .field('pattern', 'v_shaped');
    assert('POST /nutrient/scan with Camera/Gallery image upload returns 200', nutUploadRes.status === 200);
    assert('Image upload provides diagnosed deficiency and corrective action', !!nutUploadRes.body?.data?.diagnosedDeficiency?.nutrient);

    // 4. Insect Pest Scout & Economic Threshold (ETL) Evaluator
    console.log('\n--- Feature 4: Insect Pest Scout & ETL Evaluator ---');
    const pestDbRes = await request(app).get('/api/v1/crop-protection/pest/database');
    assert('GET /pest/database returns 200', pestDbRes.status === 200);
    assert('Pest DB contains Fall Armyworm', pestDbRes.body?.data?.pests?.some(p => p.id === 'fall_armyworm'));

    // Test ETL threshold calculation (25% damage > 20% early whorl threshold)
    const pestScoutRes = await request(app)
      .post('/api/v1/crop-protection/pest/scout')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ pestId: 'fall_armyworm', cropType: 'Maize', cropStage: 'seedling', observedDamagePercent: 25 });
    assert('POST /pest/scout returns 200', pestScoutRes.status === 200);
    assert('ETL indicates threshold exceeded (treat now)', pestScoutRes.body?.data?.economicThresholdEvaluation?.isAboveETL === true);
    assert('Recommends chemical and cultural controls', pestScoutRes.body?.data?.economicThresholdEvaluation?.firstLinePesticides?.length > 0);

    // Test multipart image upload for pest scout (Camera / Gallery simulation)
    const pestUploadRes = await request(app)
      .post('/api/v1/crop-protection/pest/scout')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('image', sampleImageBuffer, 'pest_sample.jpg')
      .field('pestId', 'fall_armyworm')
      .field('cropType', 'Maize')
      .field('cropStage', 'seedling')
      .field('observedDamagePercent', '30');
    assert('POST /pest/scout with Camera/Gallery image upload returns 200', pestUploadRes.status === 200);
    assert('Image upload evaluates ETL and gives intervention protocols', pestUploadRes.body?.data?.economicThresholdEvaluation?.isAboveETL === true && !!pestUploadRes.body?.data?.economicThresholdEvaluation?.recommendation?.en);

    // 5. Chemical Tank-Mix & Compatibility Validator
    console.log('\n--- Feature 5: Chemical Tank-Mix & Compatibility Validator ---');
    const chemsRes = await request(app).get('/api/v1/crop-protection/tank-mix/chemicals');
    assert('GET /tank-mix/chemicals returns 200', chemsRes.status === 200);

    // Test incompatible mix (2,4-D Amine + Copper Hydroxide)
    const tankIncompatRes = await request(app)
      .post('/api/v1/crop-protection/tank-mix/validate')
      .send({ productIds: ['2_4_d_amine', 'copper_hydroxide_wp'], waterVolumeLiters: 16 });
    assert('POST /tank-mix/validate returns 200', tankIncompatRes.status === 200);
    assert('Detects severe incompatibility between 2,4-D and Copper', tankIncompatRes.body?.data?.isValid === false && tankIncompatRes.body?.data?.riskLevel === 'INCOMPATIBLE');
    assert('Generates W-A-L-E-S mixing sequence', tankIncompatRes.body?.data?.mixingSequence?.length >= 3);
    assert('Provides 500 mL Jar Test Protocol in English and Amharic', !!tankIncompatRes.body?.data?.jarTestProcedure?.instructionsAm);

    // 6. Seed Rate & Plant Population Calculator
    console.log('\n--- Feature 6: Seed Rate & Planting Spacing Calculator ---');
    const cropsRes = await request(app).get('/api/v1/crop-protection/seed-calculator/crops');
    assert('GET /seed-calculator/crops returns 200', cropsRes.status === 200);

    const seedCalcRes = await request(app)
      .post('/api/v1/crop-protection/seed-calculator')
      .send({ cropId: 'teff', areaValue: 2, areaUnit: 'TIMAD', plantingMethod: 'ROW' });
    assert('POST /seed-calculator returns 200', seedCalcRes.status === 200);
    assert('Calculates exact seed requirement (2 Timad = 0.5 ha, 5kg/ha = 2.5 kg seed)', seedCalcRes.body?.data?.seedPlan?.totalSeedRequiredKg === 2.5);
    assert('Calculates Basal NPSB and top-dress Urea requirements', seedCalcRes.body?.data?.fertilizerPlan?.basalNpsb?.totalRequiredKg === 50);

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runCropProtectionVerification();
