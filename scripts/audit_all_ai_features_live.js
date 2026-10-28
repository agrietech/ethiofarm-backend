/**
 * Comprehensive System & AI Feature Audit across All 7 Roles
 * Checks which features are running live and which have limitations/fallbacks.
 */

const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const openRouterClient = require('../src/utils/openRouterClient');
const aiVoiceService = require('../src/modules/ai/aiVoice.service');
const plantIdClient = require('../src/ingestion/plantIdClient');
const plantNetClient = require('../src/ingestion/plantNetClient');
const perenualClient = require('../src/ingestion/perenualClient');
const earthEngineConnector = require('../src/ingestion/connectors/earthEngineConnector');
const { getWeatherForecast } = require('../src/modules/weather/weather.service');
const { detectWeed, evaluateSprayWindow, validateTankMix } = require('../src/modules/cropProtection/cropProtection.service');
const { getAllDiseases, getSeasonalHighRiskDiseases } = require('../src/modules/animalHealth/animalHealth.service');
const { getTemporalTrends } = require('../src/modules/analytics/analytics.service');

async function auditAllFeatures() {
  console.log('========================================================================');
  console.log('   ETHIOFARM COMPREHENSIVE EXPERT FEATURE & ROLE DIAGNOSTIC AUDIT       ');
  console.log('========================================================================\n');

  const report = [];

  // Feature 1: Core Bilingual AI Voice Assistant
  console.log('>>> [1/8] Testing Core Bilingual AI Voice Assistant (Gemini)...');
  try {
    const res = await aiVoiceService.processVoiceInquiry({
      userQuestion: 'ስለ ስንዴ ዝገት በሽታ መከላከያ በአጭሩ ንገረኝ',
      language: 'am',
      userRole: 'FARMER',
    });
    const passed = res.success && !res.isAiOffline && res.aiModel.includes('gemini');
    report.push({
      feature: 'AI Voice Assistant & Conversational Agronomist',
      status: passed ? 'RUNNING (LIVE)' : 'DEGRADED / FALLBACK',
      details: `Model: ${res.aiModel}, OfflineFallback: ${res.isAiOffline}, ResponseAm: ${Boolean(res.responseAm)}`,
      runningLive: passed,
    });
  } catch (e) {
    report.push({
      feature: 'AI Voice Assistant & Conversational Agronomist',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 2: Multimodal Crop Disease Vision (Plant.id, Pl@ntNet, Gemini Vision)
  console.log('>>> [2/8] Testing Multimodal Crop Disease Diagnosis Connectors...');
  let plantIdStatus = 'UNKNOWN';
  let plantNetStatus = 'UNKNOWN';
  let perenualStatus = 'UNKNOWN';

  try {
    // Test Perenual live search
    const pRes = await perenualClient.searchPestDisease('rust');
    perenualStatus = pRes.success ? 'RUNNING (LIVE)' : 'OFFLINE / RATE_LIMITED';
  } catch (e) {
    perenualStatus = `FAILED: ${e.message}`;
  }

  try {
    // Test Gemini Vision direct completion
    const vRes = await openRouterClient.analyzeCropVision({
      cropHint: 'Wheat',
      plantIdData: { isHealthy: false, diseases: [{ name: 'Wheat Rust' }] },
      plantNetData: { success: true },
      perenualData: { success: true },
    });
    const vPassed = vRes.success && vRes.diagnosis;
    report.push({
      feature: 'AI Crop Disease Diagnosis (Multimodal Vision & Knowledge Graph)',
      status: vPassed ? 'RUNNING (LIVE)' : 'FALLBACK',
      details: `Perenual: ${perenualStatus}, Engine: ${vRes.engine || 'OpenRouter/Gemini'}, Succeeded: ${vPassed}`,
      runningLive: vPassed,
    });
  } catch (e) {
    report.push({
      feature: 'AI Crop Disease Diagnosis (Multimodal Vision & Knowledge Graph)',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 3: Hyperlocal Weather & Agro-Climatic Forecast
  console.log('>>> [3/8] Testing Hyperlocal Weather Forecast & Open-Meteo API...');
  try {
    const wRes = await getWeatherForecast({ woredaId: 'woreda_adama_01', days: 7 });
    const wPassed = Boolean(wRes && wRes.current && wRes.daily && wRes.daily.length >= 7);
    report.push({
      feature: 'Hyperlocal Weather & Climate Forecasting (Hourly & 7-Day)',
      status: wPassed ? 'RUNNING (LIVE)' : 'FALLBACK',
      details: `Sources: ${wRes.dataSources}, DailyCount: ${wRes.daily?.length}, CurrentTemp: ${wRes.current?.temperatureC}°C`,
      runningLive: wPassed,
    });
  } catch (e) {
    report.push({
      feature: 'Hyperlocal Weather & Climate Forecasting (Hourly & 7-Day)',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 4: Remote Sensing & Google Earth Engine (Sentinel-2, CHIRPS, DEM)
  console.log('>>> [4/8] Testing Google Earth Engine (GEE) Connector & Service Account Token...');
  try {
    const token = await earthEngineConnector.getAccessToken();
    const geePassed = Boolean(token && token.length > 20);
    report.push({
      feature: 'Google Earth Engine (GEE) Planetary Remote Sensing & NDVI',
      status: geePassed ? 'RUNNING (LIVE)' : 'AUTH_FAILED',
      details: `ServiceAccount: ${earthEngineConnector.serviceAccountEmail}, TokenAcquired: ${geePassed}`,
      runningLive: geePassed,
    });
  } catch (e) {
    report.push({
      feature: 'Google Earth Engine (GEE) Planetary Remote Sensing & NDVI',
      status: 'CREDENTIAL_ISSUE / RESTRICTED',
      details: `GEE error: ${e.message}`,
      runningLive: false,
    });
  }

  // Feature 5: AI Time-Series & Drought Graph Analytics
  console.log('>>> [5/8] Testing AI Time-Series & Drought Trend Analytics...');
  try {
    const aRes = await getTemporalTrends({ woredaId: 'woreda_adama_01', includeAi: true, language: 'en' });
    const aPassed = Boolean(aRes && aRes.aiInsights && aRes.aiInsights.trendSummary);
    report.push({
      feature: 'AI Time-Series Graph Analytics (NDVI, SPI, Soil Moisture)',
      status: aPassed ? 'RUNNING (LIVE)' : 'FALLBACK',
      details: `AI Insights Available: ${aPassed}, Summary: ${aRes.aiInsights?.trendSummary?.en?.substring(0, 60)}...`,
      runningLive: aPassed,
    });
  } catch (e) {
    report.push({
      feature: 'AI Time-Series Graph Analytics (NDVI, SPI, Soil Moisture)',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 6: Crop Protection & Spray Planner
  console.log('>>> [6/8] Testing Crop Protection & Tank Mix Safety Checker...');
  try {
    const sprayRes = await evaluateSprayWindow({ woredaId: 'woreda_adama_01' });
    const tankRes = validateTankMix({
      productIds: ['tilt_250_ec', 'mancozeb_80_wp'],
      waterVolumeLiters: 16,
    });
    const cpPassed = Boolean(sprayRes && tankRes);
    report.push({
      feature: 'Crop Protection & Tank Mix Chemical Safety Validator',
      status: cpPassed ? 'RUNNING (LIVE)' : 'FAILED',
      details: `SprayWindowStatus: ${sprayRes?.sprayStatus || 'OK'}, TankMixCompatible: ${tankRes?.isCompatible}`,
      runningLive: cpPassed,
    });
  } catch (e) {
    report.push({
      feature: 'Crop Protection & Tank Mix Chemical Safety Validator',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 7: Animal Health & Livestock Disease Intelligence
  console.log('>>> [7/8] Testing Animal Health & Outbreak Intelligence...');
  try {
    const diseases = getAllDiseases();
    const highRisk = getSeasonalHighRiskDiseases ? getSeasonalHighRiskDiseases('KEREMT') : [];
    const ahPassed = diseases && diseases.totalDiseases > 0;
    report.push({
      feature: 'Animal Health & Livestock Outbreak Surveillance',
      status: ahPassed ? 'RUNNING (LIVE)' : 'FAILED',
      details: `TotalDiseasesCataloged: ${diseases.totalDiseases}, Breeds: ${Object.keys(diseases.breeds || {}).length}`,
      runningLive: ahPassed,
    });
  } catch (e) {
    report.push({
      feature: 'Animal Health & Livestock Outbreak Surveillance',
      status: 'FAILED',
      details: e.message,
      runningLive: false,
    });
  }

  // Feature 8: SMS & Early Warning Dispatch Gateway
  console.log('>>> [8/8] Testing SMS Gateway Credentials...');
  const smsProvider = process.env.SMS_PROVIDER || 'smsethiopia';
  const hasSmsKey = Boolean(process.env.SMS_ETHIOPIA_API_KEY && process.env.SMS_ETHIOPIA_API_KEY.length > 5);
  report.push({
    feature: 'SMS & USSD Emergency Alert Broadcast (*212# / SMSEthiopia)',
    status: hasSmsKey ? 'CONFIGURED (LIVE)' : 'NOT_CONFIGURED',
    details: `Provider: ${smsProvider}, KeyPresent: ${hasSmsKey}, SenderId: ${process.env.SMS_ETHIOPIA_SENDER_ID || 'EthioFarm'}`,
    runningLive: hasSmsKey,
  });

  console.log('\n========================================================================');
  console.log('                   COMPREHENSIVE AUDIT REPORT                           ');
  console.log('========================================================================\n');

  report.forEach((r, idx) => {
    const symbol = r.runningLive ? '✅' : '⚠️';
    console.log(`${idx + 1}. [${symbol} ${r.status}] ${r.feature}`);
    console.log(`   Details: ${r.details}\n`);
  });

  const totalRunning = report.filter((r) => r.runningLive).length;
  console.log(`Summary: ${totalRunning}/${report.length} Core Features Running Live.`);
}

auditAllFeatures().catch((err) => {
  console.error('Fatal audit error:', err);
});
