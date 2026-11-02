/**
 * Test Script for Real API Connectors
 * Tests NASA POWER and FAO Locust APIs with Ethiopian coordinates
 */

const { nasaPowerConnector, faoLocustConnector, openMeteoConnector } = require('../src/ingestion/connectors');
const logger = require('../src/utils/logger');

// Test coordinates: Addis Ababa, Bishoftu, Dire Dawa
const TEST_LOCATIONS = [
  { name: 'Addis Ababa', lat: 9.0320, lng: 38.7469 },
  { name: 'Bishoftu', lat: 8.7523, lng: 38.9785 },
  { name: 'Dire Dawa', lat: 9.6010, lng: 41.8661 },
];

async function testNASAPower() {
  console.log('\n=== TESTING NASA POWER API ===\n');
  
  const location = TEST_LOCATIONS[0]; // Addis Ababa
  
  try {
    console.log(`Fetching data for ${location.name} (${location.lat}, ${location.lng})...`);
    
    const result = await nasaPowerConnector.fetchDailySolarAndHumidity({
      lat: location.lat,
      lng: location.lng,
      startDate: '20240810',
      endDate: '20240816',
    });
    
    console.log('\n✅ NASA POWER API SUCCESS');
    console.log('Source:', result.source);
    console.log('Data Quality:', result.dataQuality || 'UNKNOWN');
    console.log('Date Range:', result.startDate, 'to', result.endDate);
    
    if (result.summary) {
      console.log('\nSummary Statistics:');
      console.log('  Avg Max Temp:', result.summary.avgTempMax?.toFixed(1), '°C');
      console.log('  Avg Min Temp:', result.summary.avgTempMin?.toFixed(1), '°C');
      console.log('  Avg Humidity:', result.summary.avgHumidity?.toFixed(1), '%');
      console.log('  Avg Solar Radiation:', result.summary.avgSolarRadiation?.toFixed(1), 'kWh/m²/day');
      console.log('  Total Precipitation:', result.summary.totalPrecipitation?.toFixed(1), 'mm');
    }
    
    if (result.isMockData) {
      console.warn('\n⚠️  WARNING: Receiving MOCK data (API may not be working)');
    } else {
      console.log('\n✅ Receiving REAL data from NASA');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ NASA POWER API FAILED');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check internet connection');
    console.error('2. NASA POWER URL: https://power.larc.nasa.gov/api/temporal/daily/point');
    console.error('3. No API key required');
    return false;
  }
}

async function testFAOLocust() {
  console.log('\n=== TESTING FAO LOCUST API ===\n');
  
  try {
    console.log('Fetching locust data for East Africa...');
    
    const result = await faoLocustConnector.fetchLatestBulletins();
    
    console.log('\n✅ FAO LOCUST API SUCCESS');
    console.log('Source:', result.source);
    console.log('Data Quality:', result.dataQuality || 'UNKNOWN');
    console.log('Bulletin Date:', result.bulletinDate);
    console.log('Active Threats:', result.activeThreats.length);
    console.log('Total Swarms:', result.totalSwarms);
    console.log('Total Hopper Bands:', result.totalHoppers);
    
    if (result.activeThreats.length > 0) {
      console.log('\n🦗 ACTIVE LOCUST THREATS:');
      result.activeThreats.slice(0, 5).forEach((threat, idx) => {
        console.log(`\n  Threat ${idx + 1}:`);
        console.log(`    Location: ${threat.location} (${threat.country})`);
        console.log(`    Type: ${threat.threatType}`);
        console.log(`    Density: ${threat.density}`);
        console.log(`    Maturity: ${threat.maturity}`);
        console.log(`    Reported: ${new Date(threat.reportedAt).toLocaleDateString()}`);
        console.log(`    Coordinates: ${threat.lat.toFixed(4)}, ${threat.lng.toFixed(4)}`);
      });
      
      if (result.activeThreats.length > 5) {
        console.log(`\n  ... and ${result.activeThreats.length - 5} more threats`);
      }
    } else {
      console.log('\n✅ No active locust threats in the region (good news!)');
    }
    
    if (result.isMockData) {
      console.warn('\n⚠️  WARNING: Receiving MOCK data (API may not be working)');
    } else {
      console.log('\n✅ Receiving REAL data from FAO');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ FAO LOCUST API FAILED');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check internet connection');
    console.error('2. FAO API: https://services3.arcgis.com/I8qrgDAxm1XPcUCr/arcgis/rest/services/Locust_Hub_Data/FeatureServer/0/query');
    console.error('3. No API key required');
    return false;
  }
}

async function testOpenMeteo() {
  console.log('\n=== TESTING OPEN-METEO API (Already Working) ===\n');
  
  const location = TEST_LOCATIONS[1]; // Bishoftu
  
  try {
    console.log(`Fetching forecast for ${location.name} (${location.lat}, ${location.lng})...`);
    
    const result = await openMeteoConnector.fetchForecast({
      lat: location.lat,
      lng: location.lng,
      days: 3,
    });
    
    console.log('\n✅ OPEN-METEO API SUCCESS');
    console.log('Source:', result.source);
    console.log('Latitude:', result.latitude);
    console.log('Longitude:', result.longitude);
    console.log('Timezone:', result.timezone);
    console.log('Elevation:', result.elevation, 'm');
    
    if (result.daily && result.daily.time) {
      console.log('\n3-Day Forecast:');
      for (let i = 0; i < 3 && i < result.daily.time.length; i++) {
        console.log(`\n  ${result.daily.time[i]}:`);
        console.log(`    Temp: ${result.daily.temperature_2m_min[i].toFixed(1)}°C - ${result.daily.temperature_2m_max[i].toFixed(1)}°C`);
        console.log(`    Precipitation: ${result.daily.precipitation_sum[i].toFixed(1)} mm`);
        console.log(`    Humidity: ${result.daily.relative_humidity_2m_mean[i].toFixed(0)}%`);
      }
    }
    
    if (result.isMockData) {
      console.warn('\n⚠️  WARNING: Receiving MOCK data');
    } else {
      console.log('\n✅ Receiving REAL data from Open-Meteo');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ OPEN-METEO API FAILED');
    console.error('Error:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   AgriEtech API Connector Test Suite          ║');
  console.log('║   Testing Real APIs for Ethiopian Farmers     ║');
  console.log('╚════════════════════════════════════════════════╝');
  
  const results = {
    nasaPower: false,
    faoLocust: false,
    openMeteo: false,
  };
  
  // Test each API
  results.nasaPower = await testNASAPower();
  await sleep(2000); // Wait 2 seconds between tests
  
  results.faoLocust = await testFAOLocust();
  await sleep(2000);
  
  results.openMeteo = await testOpenMeteo();
  
  // Summary
  console.log('\n\n╔════════════════════════════════════════════════╗');
  console.log('║   TEST SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  console.log('NASA POWER (Temperature, Humidity):', results.nasaPower ? '✅ PASS' : '❌ FAIL');
  console.log('FAO Locust (Desert Locust Alerts):', results.faoLocust ? '✅ PASS' : '❌ FAIL');
  console.log('Open-Meteo (Weather Forecast):   ', results.openMeteo ? '✅ PASS' : '❌ FAIL');
  
  const passCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.values(results).length;
  
  console.log(`\nTotal: ${passCount}/${totalCount} APIs working`);
  
  if (passCount === totalCount) {
    console.log('\n🎉 ALL APIS WORKING! System ready for Ethiopian farmers.');
  } else if (passCount > 0) {
    console.log('\n⚠️  Some APIs working, but system needs all APIs for full functionality.');
  } else {
    console.log('\n❌ NO APIS WORKING. Check internet connection and firewall settings.');
  }
  
  console.log('\n');
  process.exit(passCount === totalCount ? 0 : 1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
