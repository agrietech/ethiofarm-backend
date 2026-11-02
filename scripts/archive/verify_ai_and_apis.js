const openRouterClient = require('../src/utils/openRouterClient');
const plantIdClient = require('../src/ingestion/plantIdClient');
const connectors = require('../src/ingestion/connectors');
const logger = require('../src/utils/logger');

async function verifyAiAndApis() {
  console.log('================================================================');
  console.log('      AGRIETECH AI & EXTERNAL API INTEGRATION VERIFICATION');
  console.log('================================================================\n');

  const results = [];

  // 1. Test OpenRouter / Google Gemini 2.5 Flash Core Chat Completion
  console.log('1. Testing OpenRouter Gemini 2.5 Flash Core Completion...');
  try {
    const chatRes = await openRouterClient.chatCompletion({
      messages: [
        { role: 'system', content: 'You are an Ethiopian agronomist assistant. Answer concisely.' },
        { role: 'user', content: 'What is the primary planting season in Oromia region for Teff?' },
      ],
      maxTokens: 150,
    });
    const success = Boolean(chatRes && chatRes.success && chatRes.content);
    results.push({ name: 'OpenRouter Gemini 2.5 Flash Core Chat', success, detail: chatRes.content?.substring(0, 80) });
    console.log(success ? '✅ PASS: Gemini 2.5 Flash responded' : '❌ FAIL: No completion returned');
    if (success) console.log(`   Response snippet: "${chatRes.content?.substring(0, 100)}..."\n`);
  } catch (err) {
    results.push({ name: 'OpenRouter Gemini 2.5 Flash Core Chat', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 2. Test AI Farmer Voice Inquiry (Bilingual Amharic & English)
  console.log('2. Testing AI Farmer Voice Inquiry (Amharic & English)...');
  try {
    const voiceRes = await openRouterClient.processVoiceInquiry({
      userQuestion: 'የበቆሎ አባጨጓሬን ለመከላከል ምን ማድረግ አለብኝ?',
      language: 'am',
    });
    const success = Boolean(voiceRes && voiceRes.success && voiceRes.data);
    results.push({ name: 'AI Voice Inquiry (Amharic)', success, detail: voiceRes.data?.responseAm?.substring(0, 80) });
    console.log(success ? '✅ PASS: AI Voice reasoning processed' : '❌ FAIL: Voice processing failed');
    if (success) {
      console.log(`   Amharic response: "${voiceRes.data?.responseAm?.substring(0, 80)}..."`);
      console.log(`   English summary: "${voiceRes.data?.responseEn?.substring(0, 80)}..."\n`);
    }
  } catch (err) {
    results.push({ name: 'AI Voice Inquiry (Amharic)', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 3. Test Multimodal AI Crop Vision Diagnosis (Plant.id + Gemini Vision)
  console.log('3. Testing Multimodal AI Crop Vision Diagnosis...');
  try {
    const plantIdData = await plantIdClient.identifyCropHealth({ cropHint: 'Wheat' });
    const visionRes = await openRouterClient.analyzeCropVision({
      cropHint: 'Wheat',
      plantIdData,
      language: 'am',
    });
    const success = Boolean(visionRes && visionRes.success && visionRes.diagnosis);
    results.push({ name: 'Multimodal AI Crop Vision (Plant.id + Gemini)', success, detail: visionRes.diagnosis?.diseaseName?.nameEn });
    console.log(success ? '✅ PASS: Dual-AI Diagnosis generated' : '❌ FAIL: Diagnosis failed');
    if (success) {
      console.log(`   Identified Crop: ${visionRes.diagnosis?.cropIdentified?.nameEn} (${visionRes.diagnosis?.cropIdentified?.nameAm})`);
      console.log(`   Disease: ${visionRes.diagnosis?.diseaseName?.nameEn} (${visionRes.diagnosis?.diseaseName?.nameAm})`);
      console.log(`   Severity: ${visionRes.diagnosis?.severity}, Confidence: ${visionRes.diagnosis?.confidenceScore}\n`);
    }
  } catch (err) {
    results.push({ name: 'Multimodal AI Crop Vision', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 4. Test AI Time-Series Graph Insights
  console.log('4. Testing AI Time-Series Graph Insights...');
  try {
    const graphRes = await openRouterClient.analyzeGraphSeries({
      woredaName: 'Adama Zuria',
      timeframe: 'DAILY',
      metrics: [
        { date: '2026-08-10', rainfallMm: 0.5, avgNdvi: 0.42, tempMaxC: 28 },
        { date: '2026-08-11', rainfallMm: 0.0, avgNdvi: 0.40, tempMaxC: 30 },
        { date: '2026-08-12', rainfallMm: 0.0, avgNdvi: 0.38, tempMaxC: 31 },
      ],
      language: 'am',
    });
    const success = Boolean(graphRes && graphRes.success && graphRes.insights);
    results.push({ name: 'AI Graph & Climate Trend Reasoning', success, detail: graphRes.insights?.trendSummary?.en });
    console.log(success ? '✅ PASS: AI Climate Insights computed' : '❌ FAIL: Graph analysis failed');
    if (success) {
      console.log(`   Summary (EN): "${graphRes.insights?.trendSummary?.en?.substring(0, 80)}..."`);
      console.log(`   Summary (AM): "${graphRes.insights?.trendSummary?.am?.substring(0, 80)}..."\n`);
    }
  } catch (err) {
    results.push({ name: 'AI Graph & Climate Trend Reasoning', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 5. Test Live Open-Meteo Weather Forecast Connector
  console.log('5. Testing Live Open-Meteo Weather API Connector...');
  try {
    const weatherData = await connectors.openMeteoConnector.fetchForecast({ lat: 8.54, lng: 39.27, days: 3 });
    const success = Boolean(weatherData && weatherData.daily && weatherData.daily.time);
    results.push({ name: 'Open-Meteo Weather Forecast API', success, detail: `${weatherData?.daily?.time?.length} days forecast` });
    console.log(success ? `✅ PASS: Weather Forecast received (${weatherData.daily.time.length} days)` : '❌ FAIL: Weather fetch failed');
    if (success) {
      console.log(`   Dates: ${weatherData.daily.time.join(', ')}`);
      console.log(`   Max Temps: ${weatherData.daily.temperature_2m_max?.join('°C, ')}°C\n`);
    }
  } catch (err) {
    results.push({ name: 'Open-Meteo Weather Forecast API', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 6. Test Live NASA POWER Agroclimatology API Connector
  console.log('6. Testing Live NASA POWER Agroclimatology API Connector...');
  try {
    const nasaData = await connectors.nasaPowerConnector.fetchDailySolarAndHumidity({ lat: 8.54, lng: 39.27 });
    const success = Boolean(nasaData && nasaData.summary);
    results.push({ name: 'NASA POWER Agroclimatology API', success, detail: `Solar: ${nasaData?.summary?.avgSolarRadiation} MJ/m²` });
    console.log(success ? '✅ PASS: NASA POWER data received' : '❌ FAIL: NASA POWER fetch failed');
    if (success) {
      console.log(`   Avg Solar Radiation: ${nasaData.summary.avgSolarRadiation} MJ/m²`);
      console.log(`   Avg Temp Max/Min: ${nasaData.summary.avgTempMax}°C / ${nasaData.summary.avgTempMin}°C\n`);
    }
  } catch (err) {
    results.push({ name: 'NASA POWER Agroclimatology API', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 7. Test Live GloFAS River Discharge Connector
  console.log('7. Testing Live GloFAS / Flood Discharge API Connector...');
  try {
    const floodData = await connectors.glofasConnector.fetchDischarge({ lat: 8.54, lng: 39.27, basinName: 'Awash' });
    const success = Boolean(floodData && floodData.forecastDays);
    results.push({ name: 'GloFAS River Discharge API', success, detail: `Max: ${floodData?.maxForecastDischargeM3s} m³/s` });
    console.log(success ? `✅ PASS: River Discharge data received (${floodData.currentDischargeM3s} m³/s)` : '❌ FAIL: Flood fetch failed');
    console.log('');
  } catch (err) {
    results.push({ name: 'GloFAS River Discharge API', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // 8. Test Live FAO Locust Hub API Connector
  console.log('8. Testing Live FAO Locust Watch API Connector (ArcGIS)...');
  try {
    const locustData = await connectors.faoLocustConnector.fetchLatestBulletins();
    const success = Boolean(locustData && locustData.bulletinDate);
    results.push({ name: 'FAO Locust Hub API', success, detail: `${locustData?.totalRecords} records queried` });
    console.log(success ? `✅ PASS: FAO Locust Hub queried successfully (${locustData.totalRecords} records)` : '❌ FAIL: Locust fetch failed');
    console.log('');
  } catch (err) {
    results.push({ name: 'FAO Locust Hub API', success: false, detail: err.message });
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  console.log('================================================================');
  const passed = results.filter((r) => r.success).length;
  console.log(`  INTEGRATION SUMMARY: ${passed}/${results.length} INTEGRATIONS VERIFIED (${Math.round((passed / results.length) * 100)}%)`);
  console.log('================================================================');

  process.exit(passed === results.length ? 0 : 1);
}

verifyAiAndApis();
