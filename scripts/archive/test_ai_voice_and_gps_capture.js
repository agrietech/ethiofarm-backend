const openRouterClient = require('../src/utils/openRouterClient');
const aiVoiceService = require('../src/modules/ai/aiVoice.service');
const farmsService = require('../src/modules/farms/farms.service');

async function testAiVoiceAndGpsCapture() {
  console.log('================================================================');
  console.log('      AI VOICE & GPS CAPTURE INTEGRATION VERIFICATION TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Real AI Completion via OpenRouter Live Free Model
  totalTests++;
  console.log('[Test 1] Testing Real AI Completion for Teff Sowing in Amharic & English...');
  try {
    const aiResult = await openRouterClient.chatCompletion({
      messages: [
        {
          role: 'user',
          content: 'What is the recommended sowing period for Teff in Oromia? Answer in English and Amharic.',
        },
      ],
      maxTokens: 250,
    });

    console.log('   Model Used:', aiResult.model);
    console.log('   Response Snippet:', aiResult.content?.substring(0, 150) + '...');

    const isRealAnswer =
      aiResult.content &&
      aiResult.content.length > 50 &&
      !aiResult.content.includes('simulated') &&
      !aiResult.content.includes('Wheat leaf yellowing is commonly caused');

    if (isRealAnswer) {
      console.log('✅ PASS: Real live LLM returned custom bilingual agronomic answer!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: AI returned simulated fallback response!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 2: Voice Audio Synthesis Delivery
  totalTests++;
  console.log('[Test 2] Testing Audio Synthesis URL & Config Generation...');
  try {
    const synthesisResult = await aiVoiceService.synthesizeSpeech({
      text: 'ጤፍ ለመዝራት ትክክለኛው ጊዜ ከሐምሌ እኩሌታ እስከ ነሐሴ መጀመሪያ ነው::',
      language: 'am',
    });

    console.log('   Audio Stream URL:', synthesisResult.audioUrl);
    console.log('   Voice Identified:', synthesisResult.voice);

    if (synthesisResult.audioUrl && (synthesisResult.audioUrl.includes('translate_tts') || synthesisResult.audioUrl.includes('tts-stream') || synthesisResult.audioUrl.includes('http'))) {
      console.log('✅ PASS: Audio synthesis URL & playback config generated successfully!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Audio synthesis URL missing!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 3: GPS Point Capture & Farm Plot Creation
  totalTests++;
  console.log('[Test 3] Testing GPS Point Capture Farm Creation (Lat: 8.54, Lng: 39.27)...');
  try {
    const farmInput = {
      userId: 'usr_farmer_gps_test_01',
      farmName: 'Adama GPS Point Capture Teff Plot',
      primaryCrop: 'Teff',
      areaHectares: 2.0,
      latitude: 8.54,
      longitude: 39.27,
    };

    const createdFarm = await farmsService.registerFarm(farmInput);
    console.log('   Created Farm ID:', createdFarm.id);
    console.log('   Auto-Resolved Woreda ID:', createdFarm.woredaId);

    if (createdFarm && createdFarm.id && createdFarm.woredaId) {
      console.log('✅ PASS: GPS point farm plot registered & Woreda auto-resolved successfully!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: GPS farm plot registration failed!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  console.log('================================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  process.exit(passedTests === totalTests ? 0 : 1);
}

testAiVoiceAndGpsCapture();
