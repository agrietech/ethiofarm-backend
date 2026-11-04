const openRouterClient = require('../src/utils/openRouterClient');
const farmsService = require('../src/modules/farms/farms.service');

async function testFixes() {
  console.log('================================================================');
  console.log('      AGRIETECH AI & GPS FARM REGISTRATION VERIFICATION TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: AI Inquiry on Teff Disease in Amharic
  totalTests++;
  console.log(`[Test 1] Querying AI Voice Inquiry on Teff Disease (Amharic)...`);
  try {
    const res1 = await openRouterClient.processVoiceInquiry({
      userQuestion: 'የጤፍ በሽታዎችን እና የፈንገስ ዋግን እንዴት መከላከል እችላለሁ?',
      language: 'am',
    });
    console.log('   Transcription:', res1.data?.transcription);
    console.log('   Amharic Response:', res1.data?.responseAm);
    console.log('   English Response:', res1.data?.responseEn);
    console.log('   Action:', res1.data?.recommendedAction);

    const isTeffRelated = (res1.data?.responseAm || '').includes('ጤፍ') || (res1.data?.responseEn || '').toLowerCase().includes('teff') || (res1.data?.responseAm || '').includes('ዋግ') || (res1.data?.responseAm || '').includes('ፈንገስ');
    const notWheatHardcoded = !((res1.data?.transcription || '').includes('የስንዴ ቅጠል ቢጫ ሆኗል'));

    if (res1.success && isTeffRelated && notWheatHardcoded) {
      console.log('✅ PASS: AI returned dynamic, topic-matched Teff response!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Response was not tailored or was static mock!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 2: AI Inquiry on Maize Armyworm Pest in Amharic
  totalTests++;
  console.log(`[Test 2] Querying AI Voice Inquiry on Maize Armyworm (Amharic)...`);
  try {
    const res2 = await openRouterClient.processVoiceInquiry({
      userQuestion: 'በበቆሎ ላይ የታየውን አባጨጓሬ ለመግደል የትኛው ፀረ-ተባይ ይረጫል?',
      language: 'am',
    });
    console.log('   Amharic Response:', res2.data?.responseAm);
    console.log('   English Response:', res2.data?.responseEn);

    const isMaizePestRelated = (res2.data?.responseAm || '').includes('በቆሎ') || (res2.data?.responseEn || '').toLowerCase().includes('maize') || (res2.data?.responseAm || '').includes('ተባይ');

    if (res2.success && isMaizePestRelated) {
      console.log('✅ PASS: AI returned dynamic Maize pest response!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Response was not tailored to Maize pest!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 3: AI Inquiry on Drought & Irrigation in English
  totalTests++;
  console.log(`[Test 3] Querying AI Voice Inquiry on Drought & Irrigation (English)...`);
  try {
    const res3 = await openRouterClient.processVoiceInquiry({
      userQuestion: 'How can I save my crop during dry spell using irrigation and soil mulching?',
      language: 'en',
    });
    console.log('   Amharic Response:', res3.data?.responseAm);
    console.log('   English Response:', res3.data?.responseEn);

    const isWaterRelated = (res3.data?.responseEn || '').toLowerCase().includes('water') || (res3.data?.responseEn || '').toLowerCase().includes('irrigation') || (res3.data?.responseEn || '').toLowerCase().includes('mulch');

    if (res3.success && isWaterRelated) {
      console.log('✅ PASS: AI returned dynamic drought/water advice!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Response was not tailored to drought/water!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 4: GPS Farm Registration WITHOUT woredaId (GPS Capture Point)
  totalTests++;
  console.log(`[Test 4] Adding Farm via GPS Capture (lat/lng, no woredaId)...`);
  try {
    const farm1 = await farmsService.createFarm({
      userId: 'usr_farmer_test',
      farmName: 'Bishoftu GPS Plot Beta',
      primaryCrop: 'Teff',
      areaHectares: 2.5,
      latitude: 8.7523,
      longitude: 38.9785,
    });
    console.log('   Created Farm ID:', farm1.id);
    console.log('   Resolved Woreda ID:', farm1.woredaId);
    console.log('   Coordinates:', farm1.latitude, farm1.longitude);

    if (farm1 && farm1.id && farm1.woredaId) {
      console.log('✅ PASS: Farm successfully created via GPS capture!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Farm creation returned invalid data!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 5: GPS Farm Registration WITH Polygon
  totalTests++;
  console.log(`[Test 5] Adding Farm with GeoJSON Polygon...`);
  try {
    const farm2 = await farmsService.createFarm({
      userId: 'usr_farmer_test',
      farmName: 'Adama Zuria Farm Plot Gamma',
      primaryCrop: 'Maize',
      areaHectares: 4.0,
      woredaId: 'ET040101',
      polygonGeojson: {
        type: 'Polygon',
        coordinates: [
          [
            [39.26, 8.53],
            [39.28, 8.53],
            [39.28, 8.55],
            [39.26, 8.55],
            [39.26, 8.53],
          ],
        ],
      },
    });
    console.log('   Created Farm ID:', farm2.id);
    console.log('   Woreda ID:', farm2.woredaId);

    if (farm2 && farm2.id) {
      console.log('✅ PASS: Polygon farm successfully registered!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Polygon farm creation failed!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  console.log('================================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  process.exit(passedTests === totalTests ? 0 : 1);
}

testFixes();
