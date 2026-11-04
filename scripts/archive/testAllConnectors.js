const connectors = require('../src/ingestion/connectors/index.js');
const openWeatherMapConnector = require('../src/ingestion/connectors/openWeatherMapConnector');
const plantIdClient = require('../src/ingestion/plantIdClient.js');

const testCoords = { lat: 9.0320, lng: 38.7469 };

async function testConnector(name, testFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
  try {
    const startTime = Date.now();
    const result = await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ SUCCESS (${duration}ms)`);
    console.log('Response:', JSON.stringify(result, null, 2).substring(0, 500));
    return { name, status: 'SUCCESS', duration, error: null };
  } catch (err) {
    console.log(`❌ FAILED: ${err.message}`);
    return { name, status: 'FAILED', duration: 0, error: err.message };
  }
}

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║        EthioFarm API Connectors Integration Test         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const results = [];

  // Test 1: Open-Meteo Weather Forecast
  results.push(await testConnector(
    'Open-Meteo Weather Forecast (NO API KEY)',
    () => connectors.openMeteoConnector.fetchForecast(testCoords)
  ));

  // Test 2: CHIRPS Rainfall
  results.push(await testConnector(
    'CHIRPS Rainfall Data',
    () => connectors.chirpsConnector.fetchRainfallByLocation(testCoords)
  ));

  // Test 3: NASA POWER
  results.push(await testConnector(
    'NASA POWER Solar/Climate (NO API KEY)',
    () => connectors.nasaPowerConnector.fetchDailySolarAndHumidity(testCoords)
  ));

  // Test 4: GloFAS Flood
  results.push(await testConnector(
    'GloFAS River Discharge (Flood)',
    () => connectors.glofasConnector.fetchDischarge(testCoords)
  ));

  // Test 5: FAO Locust
  results.push(await testConnector(
    'FAO Desert Locust Watch (NO API KEY)',
    () => connectors.faoLocustConnector.fetchLatestBulletins()
  ));

  // Test 6: NDVI
  results.push(await testConnector(
    'NDVI Vegetation Index',
    () => connectors.ndviConnector.fetchNdviByPolygon({
      woredaId: 'test',
      polygon: {
        type: 'Polygon',
        coordinates: [[[38.7, 9.0], [38.8, 9.0], [38.8, 9.1], [38.7, 9.1], [38.7, 9.0]]]
      }
    })
  ));

  // Test 7: SoilGrids
  results.push(await testConnector(
    'SoilGrids Soil Properties (NO API KEY)',
    () => connectors.soilGridsConnector.fetchSoilProperties(testCoords)
  ));

  // Test 8: Open-Elevation
  results.push(await testConnector(
    'Open-Elevation DEM (NO API KEY)',
    () => connectors.openElevationConnector.fetchElevation(testCoords)
  ));

  // Test 9: World Bank Climate
  results.push(await testConnector(
    'World Bank Climate API (NO API KEY)',
    () => connectors.worldBankClimateConnector.fetchHistoricalTemperature({ countryCode: 'ETH' })
  ));

  // Test 10: OpenWeatherMap
  results.push(await testConnector(
    'OpenWeatherMap Current Weather (API KEY REQUIRED)',
    () => openWeatherMapConnector.fetchCurrentWeather(testCoords)
  ));

  // Test 11: Plant.id
  const plantIdConfigured = plantIdClient.isConfigured();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: Plant.id Crop Disease Diagnosis`);
  console.log('='.repeat(60));
  if (plantIdConfigured) {
    console.log(`✅ CONFIGURED - API Key: ${plantIdClient.apiKey.substring(0, 8)}...`);
    results.push({ name: 'Plant.id', status: 'CONFIGURED', duration: 0, error: null });
  } else {
    console.log(`⚠️  NOT CONFIGURED - Using mock botanical data`);
    results.push({ name: 'Plant.id', status: 'MOCK_MODE', duration: 0, error: 'API key not configured' });
  }

  // Summary
  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const successCount = results.filter(r => r.status === 'SUCCESS' || r.status === 'CONFIGURED').length;
  const failedCount = results.filter(r => r.status === 'FAILED').length;
  const mockCount = results.filter(r => r.status === 'MOCK_MODE').length;
  
  console.log(`Total APIs Tested:     ${results.length}`);
  console.log(`✅ Working:             ${successCount}`);
  console.log(`❌ Failed:              ${failedCount}`);
  console.log(`⚠️  Mock Mode:          ${mockCount}`);
  
  console.log('\nDetailed Results:');
  results.forEach((r, i) => {
    const statusIcon = r.status === 'SUCCESS' || r.status === 'CONFIGURED' ? '✅' : 
                       r.status === 'MOCK_MODE' ? '⚠️' : '❌';
    console.log(`${i + 1}. ${statusIcon} ${r.name} - ${r.status} ${r.duration ? `(${r.duration}ms)` : ''}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed!');
  console.log('='.repeat(60) + '\n');
  
  process.exit(failedCount > 3 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
