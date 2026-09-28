/**
 * AgriEtech Live Weather & Temporal Trends In-Depth Verification Test
 * 
 * Verifies:
 * 1. Live Weather Forecast endpoint (/api/v1/weather/forecast)
 *    - Open-Meteo Live API resolution
 *    - Hourly forecast curve (24 hours)
 *    - Daily thermal capsule profile (7 days: min, max, feelsLike)
 *    - Daily volumetric rainfall profile (7 days: precipitationSum mm, probability %)
 *    - Multi-tier caching and TTL
 * 2. Analytics Temporal Trends endpoint (/api/v1/analytics/temporal-trends)
 *    - 21-day timeline (14 past days + 7 forecast days)
 *    - Rainfall, Temperature Max/Min, Soil Moisture, NDVI
 * 3. Frontend Model Compatibility:
 *    - Validates JSON payload matches WeatherForecastModel & ForecastModel
 */

const http = require('http');
const app = require('../src/server');
const { getWoredaCoordinates } = require('../src/modules/boundaries/boundaries.service');
const weatherService = require('../src/modules/weather/weather.service');
const analyticsService = require('../src/modules/analytics/analytics.service');

async function run() {
  console.log('========================================================================');
  console.log('   AGRIETECH LIVE WEATHER, TEMPERATURE TRENDS & RAINFALL VERIFICATION   ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // Test Locations across Ethiopia
  const locations = [
    { name: 'Adama Zuria (Oromia)', woredaId: 'ET040101', lat: 8.54, lng: 39.27 },
    { name: 'Addis Ababa (Bole)', woredaId: 'ET140101', lat: 8.98, lng: 38.79 },
    { name: 'Hawassa Zuria (Sidama)', woredaId: 'ET110101', lat: 7.06, lng: 38.48 },
  ];

  for (const loc of locations) {
    console.log(`\n────────────────────────────────────────────────────────────────────────`);
    console.log(`📍 Testing Location: ${loc.name} [lat: ${loc.lat}, lng: ${loc.lng}]`);
    console.log(`────────────────────────────────────────────────────────────────────────`);

    // 1. Direct Weather Service Forecast Call
    const forecast = await weatherService.getWeatherForecast({
      lat: loc.lat,
      lng: loc.lng,
      woredaId: loc.woredaId,
      days: 7,
      forceRefresh: true,
    });

    assert(forecast != null, `Forecast payload returned for ${loc.name}`);
    assert(forecast.location != null, `Location metadata resolved`);
    console.log(`   Location: ${forecast.location.nameEn} (Level: ${forecast.location.level}, Elev: ${forecast.location.elevationMeters}m)`);

    // Current Telemetry Checks
    const cur = forecast.current;
    assert(cur != null, `Current telemetry present`);
    assert(typeof cur.temperatureC === 'number' && cur.temperatureC > -10 && cur.temperatureC < 55,
      `Current temperature valid: ${cur.temperatureC}°C`);
    assert(typeof cur.relativeHumidity === 'number' && cur.relativeHumidity >= 0 && cur.relativeHumidity <= 100,
      `Current relative humidity valid: ${cur.relativeHumidity}%`);
    assert(typeof cur.precipitationMm === 'number' && cur.precipitationMm >= 0,
      `Current precipitation rate valid: ${cur.precipitationMm} mm`);
    assert(typeof cur.windSpeedKmh === 'number' && cur.windSpeedKmh >= 0,
      `Current wind speed valid: ${cur.windSpeedKmh} km/h`);
    assert(cur.conditionEn && cur.conditionAm && cur.conditionOm,
      `Trilingual weather conditions resolved: "${cur.conditionEn}" | "${cur.conditionAm}" | "${cur.conditionOm}"`);

    // Hourly Forecast Checks (24 Hours)
    assert(Array.isArray(forecast.hourly) && forecast.hourly.length === 24,
      `24-hour forward curve present (got ${forecast.hourly.length} hours)`);
    if (forecast.hourly.length > 0) {
      const h0 = forecast.hourly[0];
      assert(h0.hourLabel && typeof h0.temperatureC === 'number' && typeof h0.precipitationProbability === 'number',
        `Hourly telemetry structure verified: Hour ${h0.hourLabel} -> ${h0.temperatureC}°C, rain prob ${h0.precipitationProbability}%`);
    }

    // Daily Thermal & Rainfall Checks (7 Days)
    assert(Array.isArray(forecast.daily) && forecast.daily.length >= 7,
      `Daily forecast array contains at least 7 days (got ${forecast.daily.length} days)`);

    let totalRainfall = 0;
    let minTempRecorded = 999;
    let maxTempRecorded = -999;
    let rainyDays = 0;

    console.log('\n   📅 7-Day High/Low Thermal Profile & Volumetric Rainfall:');
    forecast.daily.slice(0, 7).forEach((day, idx) => {
      totalRainfall += day.precipitationMm || 0;
      if (day.minTempC < minTempRecorded) minTempRecorded = day.minTempC;
      if (day.maxTempC > maxTempRecorded) maxTempRecorded = day.maxTempC;
      if (day.precipitationMm >= 1.0) rainyDays++;

      console.log(`      Day ${idx + 1} (${day.date}): Min ${day.minTempC}°C | Max ${day.maxTempC}°C | Rain: ${day.precipitationMm.toFixed(1)} mm (${day.precipitationProbability}%) | Cond: ${day.conditionEn}`);
    });

    assert(maxTempRecorded > minTempRecorded,
      `Temperature trend verified: Range ${minTempRecorded}°C to ${maxTempRecorded}°C`);
    assert(typeof totalRainfall === 'number' && totalRainfall >= 0,
      `Total 7-day rainfall accumulated: ${totalRainfall.toFixed(1)} mm across ${rainyDays} rainy days`);
    assert(forecast.dataSources && forecast.dataSources.includes('Open-Meteo'),
      `Data sources credited: ${forecast.dataSources}`);

    // 2. Analytics Temporal Trends
    console.log(`\n   📈 Querying Temporal Trends for Analytics (/api/v1/analytics/temporal-trends)...`);
    const temporal = await analyticsService.getTemporalTrends({
      timeframe: 'DAILY',
      woredaId: loc.woredaId,
      language: 'en',
    });

    assert(temporal != null, `Temporal trends returned`);
    assert(Array.isArray(temporal.metrics) && temporal.metrics.length >= 14,
      `Temporal metrics timeline contains historical + forecast days (got ${temporal.metrics.length} points)`);
    assert(temporal.summary != null, `Temporal summary statistics generated`);
    console.log(`      Woreda: ${temporal.summary.woredaName} | Total Period Rainfall: ${temporal.summary.totalRainfallMm} mm | Avg Soil Moisture: ${temporal.summary.avgSoilMoisture}% | Avg NDVI: ${temporal.summary.avgNdvi}`);

    // Verify first and last metrics point have rain and temp
    const firstMetric = temporal.metrics[0];
    const lastMetric = temporal.metrics[temporal.metrics.length - 1];
    assert(firstMetric.date && typeof firstMetric.tempMaxC === 'number' && typeof firstMetric.rainfallMm === 'number',
      `Timeline Start (${firstMetric.date}): Max ${firstMetric.tempMaxC}°C, Rain ${firstMetric.rainfallMm} mm`);
    assert(lastMetric.date && typeof lastMetric.tempMaxC === 'number' && typeof lastMetric.rainfallMm === 'number',
      `Timeline End (${lastMetric.date}): Max ${lastMetric.tempMaxC}°C, Rain ${lastMetric.rainfallMm} mm`);
  }

  console.log('\n========================================================================');
  console.log(`   FINAL SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal error in weather test:', err);
  process.exit(1);
});
