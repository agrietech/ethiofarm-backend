const analyticsService = require('../src/modules/analytics/analytics.service');
const farmsService = require('../src/modules/farms/farms.service');
const sensorsService = require('../src/modules/sensors/sensors.service');
const diseaseService = require('../src/modules/diseaseDiagnosis/diseaseDiagnosis.service');

async function testAnalyticsAndLiveData() {
  console.log('================================================================');
  console.log('      ANALYTICS & LIVE SYSTEM DATA VERIFICATION TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Regional Breakdown (Zero Null Elements)
  totalTests++;
  console.log('[Test 1] Testing Regional Breakdown for non-null objects...');
  try {
    const breakdown = await analyticsService.getRegionalBreakdown();
    const hasNulls = breakdown.some((item) => item === null || item === undefined);
    console.log(`   Total regions returned: ${breakdown.length}`);
    console.log(`   Has null items: ${hasNulls}`);
    if (breakdown.length > 0 && !hasNulls) {
      console.log('✅ PASS: Regional breakdown contains valid non-null region metrics!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Regional breakdown contains null elements!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 2: Region Analytics with Region Code ("ET04")
  totalTests++;
  console.log('[Test 2] Testing Region Analytics for code "ET04" (Oromia)...');
  try {
    const regionData = await analyticsService.getRegionAnalytics('ET04');
    console.log('   Region Name:', regionData.region?.nameEn);
    console.log('   Statistics:', regionData.statistics);
    console.log('   Risk Distribution:', regionData.riskDistribution);

    if (regionData && regionData.statistics && regionData.riskDistribution) {
      console.log('✅ PASS: Region Analytics returned complete non-null statistics structure!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Region Analytics statistics object was missing/null!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 3: Zone Analytics for "zone_east_shewa"
  totalTests++;
  console.log('[Test 3] Testing Zone Analytics for "zone_east_shewa"...');
  try {
    const zoneData = await analyticsService.getZoneAnalytics('zone_east_shewa');
    console.log('   Zone Name:', zoneData.zone?.nameEn);
    console.log('   Statistics:', zoneData.statistics);

    if (zoneData && zoneData.statistics) {
      console.log('✅ PASS: Zone Analytics returned non-null statistics!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Zone Analytics returned null statistics!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 4: Woreda Analytics for "ET040101"
  totalTests++;
  console.log('[Test 4] Testing Woreda Analytics for "ET040101" (Adama Zuria)...');
  try {
    const woredaData = await analyticsService.getWoredaAnalytics('ET040101');
    console.log('   Woreda Name:', woredaData.woreda?.nameEn);
    console.log('   Statistics:', woredaData.statistics);
    console.log('   Current Conditions:', woredaData.currentConditions);

    if (woredaData && woredaData.statistics && woredaData.currentConditions) {
      console.log('✅ PASS: Woreda Analytics returned complete non-null data!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Woreda Analytics returned null data!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 5: Clean Empty Array for New User Farms (No Mock Injection)
  totalTests++;
  console.log('[Test 5] Testing Farm query for new user with 0 farms...');
  try {
    const newUserId = 'usr_test_brand_new_user_123';
    const userFarms = await farmsService.getFarmsByUser(newUserId);
    console.log(`   Farms returned for new user: ${userFarms.length}`);

    const hasDemoFarm = userFarms.some((f) => f.id === 'farm_demo_01');

    if (userFarms.length === 0 || !hasDemoFarm) {
      console.log('✅ PASS: Real user accounts return clean user data without mock data injection!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Demo mock farm was injected into user response!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  console.log('================================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  process.exit(passedTests === totalTests ? 0 : 1);
}

testAnalyticsAndLiveData();
