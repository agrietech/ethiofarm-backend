/**
 * @file test_expert_limitations_fixes.js
 * @description Comprehensive verification suite for all expert limitation fixes in AgriEtech.
 */

const assert = require('assert');
const { calculateSmsMetrics, formatEmergencySms } = require('../src/delivery/sms/smsFormatter');
const { handleUssdSession, ussdSessions } = require('../src/delivery/ussd/ussdMenu.controller');
const diseaseDiagnosisService = require('../src/modules/diseaseDiagnosis/diseaseDiagnosis.service');
const { getBBox, bboxOverlap, validateFarmPolygon, assertContainedByWoreda } = require('../src/modules/farms/farmGeometry');
const earthEngineConnector = require('../src/ingestion/connectors/earthEngineConnector');
const hyperLocalEngine = require('../src/processing/hyperLocalAgronomyEngine');

async function runVerification() {
  console.log('\n================================================================================');
  console.log('       AGRIETECH EXPERT LIMITATION FIXES VERIFICATION SUITE');
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

  // ── 1. SMS Formatter & Character Budgeting ──────────────────────────────────
  console.log('--- 1. Testing SMS Character Budgeting & Multi-language Formatting ---');

  test('GSM 7-bit vs UCS-2 Unicode Detection', () => {
    const asciiText = 'AgriEtech Alert: Normal rainfall expected in Adama woreda.';
    const amharicText = 'አግሪኢቴክ፡ በአዳማ ወረዳ መደበኛ ዝናብ ይጠበቃል።';

    const asciiMetrics = calculateSmsMetrics(asciiText);
    assert.strictEqual(asciiMetrics.isUnicode, false);
    assert.strictEqual(asciiMetrics.segmentCount, 1);

    const amMetrics = calculateSmsMetrics(amharicText);
    assert.strictEqual(amMetrics.isUnicode, true);
    assert.strictEqual(amMetrics.segmentCount, 1);
  });

  test('Emergency SMS Formatting in Amharic & Afaan Oromoo', () => {
    const amAlert = formatEmergencySms({
      hazardType: 'LOCUST_PEST',
      severity: 'CRITICAL',
      woredaName: 'Adama',
      actionAm: 'ለግብርና ባለሙያዎች ያሳውቁ',
      lang: 'am',
    });
    assert(amAlert.message.includes('[አስቸኳይ ማስጠንቀቂያ]'));
    assert(amAlert.message.includes('*212#'));
    assert(amAlert.metrics.segmentCount <= 2);

    const omAlert = formatEmergencySms({
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      woredaName: 'Bishoftu',
      actionOm: 'Iddoo ol-ka\'aatti ba\'aa',
      lang: 'om',
    });
    assert(omAlert.message.includes('[AKEAKKACHIISA CIKKAA]'));
    assert(omAlert.metrics.segmentCount === 1);
  });

  // ── 2. USSD Controller & Multi-Step Stateful Flows ────────────────────────
  console.log('\n--- 2. Testing Stateful Dynamic USSD Controller ---');

  async function simulateUssd(reqBody) {
    return new Promise((resolve) => {
      const res = {
        headers: {},
        set(k, v) { this.headers[k] = v; },
        send(body) { resolve(body); },
      };
      handleUssdSession({ body: reqBody }, res, (err) => resolve(`ERROR: ${err.message}`));
    });
  }

  await testAsync('USSD Root Menu Navigation (*212#)', async () => {
    const resp = await simulateUssd({ phoneNumber: '+251911223344', text: '' });
    assert(resp.startsWith('CON '));
    assert(resp.includes('*212#'));
    assert(resp.includes('1.'));
  });

  await testAsync('USSD Option 1: Live Weather Forecast', async () => {
    const resp = await simulateUssd({ phoneNumber: '+251911223344', text: '1' });
    assert(resp.startsWith('END '));
    assert(resp.includes('°C') || resp.includes('የሙቀት'));
  });

  await testAsync('USSD Option 5: Threat Reporting Sub-Menu & Multi-step submission', async () => {
    const menuResp = await simulateUssd({ sessionId: 'sess_1', phoneNumber: '+251911223344', text: '5' });
    assert(menuResp.startsWith('CON '));

    const sevResp = await simulateUssd({ sessionId: 'sess_1', phoneNumber: '+251911223344', text: '5*1' });
    assert(sevResp.startsWith('CON '));

    const finalResp = await simulateUssd({ sessionId: 'sess_1', phoneNumber: '+251911223344', text: '5*1*1' });
    assert(finalResp.startsWith('END '));
    assert(finalResp.includes('DA') || finalResp.includes('የልማት ጣቢያ') || finalResp.includes('Ogeessa Qonnaa'));
  });

  await testAsync('USSD Language Switch to Afaan Oromoo (Option 6)', async () => {
    const langResp = await simulateUssd({ sessionId: 'sess_lang', phoneNumber: '+251911223344', text: '6*2' });
    assert(langResp.startsWith('END '));
    assert(langResp.includes('Afaan Oromootti'));
  });


  // ── 3. Ethiopian Crop Disease Diagnosis & DA Triaging ──────────────────────
  console.log('\n--- 3. Testing Ethiopian Crop Pathology & DA Triaging ---');

  await testAsync('Diagnose Teff Rust with Endemic Pathology Taxonomy', async () => {
    const result = await diseaseDiagnosisService.diagnoseCropImage({
      cropType: 'TEFF',
      language: 'am',
    });

    assert.strictEqual(result.cropType, 'TEFF');
    assert(result.diseaseName.includes('Teff') || result.diseaseName.includes('Rust') || result.diseaseNameAm.includes('ዝገት'));
    assert(result.treatmentAm.includes('ማንኮዜብ') || result.treatmentAm.includes('ቲልት'));
    assert.strictEqual(typeof result.needsExpertReview, 'boolean');
    assert(['AI_VERIFIED', 'PENDING_DA_REVIEW'].includes(result.triageStatus));
  });

  await testAsync('Diagnose Coffee Leaf Rust with Organic and Chemical Prescriptions', async () => {
    const result = await diseaseDiagnosisService.diagnoseCropImage({
      cropType: 'COFFEE',
      language: 'om',
    });

    assert(result.diseaseName.includes('Coffee') || result.diseaseName.includes('Rust'));
    assert(result.treatmentOm != null && result.treatmentOm.length > 0);
  });

  // ── 4. Remote Sensing & Sentinel-1 SAR Cloud-Penetrating Radar ─────────────
  console.log('\n--- 4. Testing Sentinel-1 SAR Radar & Cloud Masking Fusion ---');

  await testAsync('Compute Sentinel-1 SAR Radar Vegetation Index (RVI) & Dielectric Moisture', async () => {
    const sar = await earthEngineConnector.fetchSentinel1SarSoilMoisture(8.54, 39.27);
    assert.strictEqual(sar.allWeatherRadar, true);
    assert(sar.radarBackscatterVv != null);
    assert(sar.radarBackscatterVh != null);
    assert(sar.radarVegetationIndex >= 0.0 && sar.radarVegetationIndex <= 1.0);
    assert(sar.soilDielectricConstant > 0);
  });

  await testAsync('Hyper-Local Agronomy Engine Integration of SAR Radar & Afaan Oromoo Advisory', async () => {
    const profile = await hyperLocalEngine.computeHyperLocalProfile({
      lat: 8.54,
      lng: 39.27,
      crop: 'TEFF',
    });

    assert(profile.remoteSensing.cloudPenetratingRadar === true);
    assert(profile.remoteSensing.radarVegetationIndex != null);
    assert(profile.advisoryAlert.headlineOm != null);
    assert(profile.advisoryAlert.bodyOm != null);
  });

  // ── 5. Spatial Geometry Performance & Bounding Box Filtering ───────────────
  console.log('\n--- 5. Testing Spatial Geometry BBox Optimization ---');

  test('Fast 2D Bounding Box and Overlap Logic', () => {
    const farmPoly = validateFarmPolygon({
      type: 'Polygon',
      coordinates: [[[38.74, 9.01], [38.76, 9.01], [38.76, 9.03], [38.74, 9.03], [38.74, 9.01]]],
    });

    const bbox = getBBox(farmPoly);
    assert.strictEqual(bbox[0], 38.74);
    assert.strictEqual(bbox[1], 9.01);
    assert.strictEqual(bbox[2], 38.76);
    assert.strictEqual(bbox[3], 9.03);

    const woredaPoly = validateFarmPolygon({
      type: 'Polygon',
      coordinates: [[[38.70, 8.95], [38.80, 8.95], [38.80, 9.10], [38.70, 9.10], [38.70, 8.95]]],
    });

    const isContained = assertContainedByWoreda(farmPoly, woredaPoly);
    assert.strictEqual(isContained, true);
  });

  console.log('\n================================================================================');
  console.log(`   TEST SUMMARY: ${passed}/${total} TESTS PASSED SUCCESSFULLY (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
