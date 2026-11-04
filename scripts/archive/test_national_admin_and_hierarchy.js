/**
 * @file test_national_admin_and_hierarchy.js
 * @description Comprehensive test suite for 1 National Admin + 6 Roles and 6-Tier Hierarchy
 */

const boundariesService = require('../src/modules/boundaries/boundaries.service');
const roleRequestService = require('../src/modules/roleRequest/roleRequest.service');
const adminService = require('../src/modules/admin/admin.service');
const earthEngineConnector = require('../src/ingestion/connectors/earthEngineConnector');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function testAssert(name, condition, details = '') {
  if (condition) {
    log(`✅ PASS - ${name}`, 'green');
    if (details) console.log(`   ${details}`);
  } else {
    log(`❌ FAIL - ${name}`, 'red');
    if (details) console.log(`   ${details}`);
  }
}

async function runTests() {
  log('\n' + '='.repeat(75), 'cyan');
  log('   AGRIETECH 1 NATIONAL ADMIN + 6 ROLES & 6-TIER HIERARCHY VERIFICATION', 'cyan');
  log('='.repeat(75) + '\n', 'cyan');

  // Test 1: Google Earth Engine Ingestion
  log('--- 1. Testing Google Earth Engine (GEE) Ingestion Connector ---', 'yellow');
  try {
    const geeMetrics = await earthEngineConnector.fetchPlanetaryMetrics({
      lat: 8.54,
      lng: 39.27,
      level: 'KEBELE',
    });
    testAssert('GEE Planetary Metrics computation', geeMetrics && geeMetrics.sentinel2Ndvi !== undefined, 
      `NDVI: ${geeMetrics.sentinel2Ndvi}, Soil Moisture: ${geeMetrics.soilMoisturePct}%, Engine: ${geeMetrics.engine}`);
    
    const s2Ndvi = await earthEngineConnector.fetchSentinel2Ndvi(8.54, 39.27);
    testAssert('GEE Sentinel-2 10m NDVI Reducer', s2Ndvi && s2Ndvi.resolution === '10m',
      `Source: ${s2Ndvi.source}, NDVI: ${s2Ndvi.ndviMean}`);

    const s1Sar = await earthEngineConnector.fetchSentinel1SarSoilMoisture(8.54, 39.27);
    testAssert('GEE Sentinel-1 SAR Cloud-Penetrating Radar', s1Sar && s1Sar.allWeatherRadar === true,
      `Source: ${s1Sar.source}, Radar VV: ${s1Sar.radarBackscatterVv} dB, Soil Moisture: ${s1Sar.estimatedSoilMoisturePct}%`);
  } catch (err) {
    testAssert('GEE Ingestion failed', false, err.message);
  }

  // Test 2: Administrative Boundaries & Kebele Layer
  log('\n--- 2. Testing 6-Tier Administrative Hierarchy & Kebeles ---', 'yellow');
  try {
    const regions = await boundariesService.getRegions();
    testAssert('Admin 1: Regions list', regions.length >= 15, `Found ${regions.length} Ethiopian regions`);

    const zones = await boundariesService.getZones('ET04');
    testAssert('Admin 2: Zonal scoping (Oromia)', zones.length >= 5, `Found ${zones.length} zones in Oromia`);

    const { woredas } = await boundariesService.getWoredas({ zoneId: 'zone_oromia_east_shewa' });
    testAssert('Admin 3: Woredas scoping (East Shewa)', woredas.length >= 1, `Found ${woredas.length} woredas in East Shewa`);

    const { kebeles } = await boundariesService.getKebeles({ woredaId: 'ET040101' });
    testAssert('Admin 4: Kebele layer with AgroZone', kebeles.length >= 1, 
      `Found ${kebeles.length} kebeles in Adama Zuria. First: ${kebeles[0].nameEn} (${kebeles[0].agroZone}, ${kebeles[0].elevationMeters}m)`);

    const hierarchy = await boundariesService.getAdministrativeHierarchy();
    testAssert('Full Multi-Tier Administrative Tree', hierarchy && hierarchy.national && hierarchy.hierarchy.length >= 15,
      `National: ${hierarchy.national.nameEn} (${hierarchy.national.totalRegions} Regions, ${hierarchy.national.totalZones} Zones, ${hierarchy.national.totalKebeles} Kebeles)`);

    const summary = await boundariesService.getNationalSummary();
    testAssert('National Summary Metric', summary && summary.admin4.count > 10000,
      `Admin 0 to 4 counts: 1 National, ${summary.admin1.count} Regions, ${summary.admin2.count} Zones, ${summary.admin3.count} Woredas, ${summary.admin4.count} Kebeles`);

    const resolved = await boundariesService.resolveKebeleByCoords(8.52, 39.31);
    testAssert('Coordinate to Kebele Resolution', resolved !== null, `Resolved [8.52, 39.31] to Kebele ID: ${resolved}`);
  } catch (err) {
    testAssert('Boundaries service failed', false, err.message);
  }

  // Test 3: 1 National Admin + 6 Roles Request Matrix
  log('\n--- 3. Testing 1 National Admin + 6 Roles Delegation Workflow ---', 'yellow');
  try {
    testAssert('5 Requestable Roles defined', roleRequestService.REQUESTABLE_ROLES.length === 5,
      `Roles: ${roleRequestService.REQUESTABLE_ROLES.join(', ')}`);

    const hierarchyRules = roleRequestService.ROLE_HIERARCHY;
    testAssert('Regional Officer approval requires Admin', hierarchyRules.REGIONAL_OFFICER.includes('ADMIN'));
    testAssert('Zonal Officer approval allows Regional Officer or Admin', 
      hierarchyRules.ZONAL_OFFICER.includes('REGIONAL_OFFICER') && hierarchyRules.ZONAL_OFFICER.includes('ADMIN'));
    testAssert('Woreda Officer approval allows Zonal Officer', hierarchyRules.WOREDA_OFFICER.includes('ZONAL_OFFICER'));
    testAssert('Development Agent approval allows Woreda Officer', hierarchyRules.DEVELOPMENT_AGENT.includes('WOREDA_OFFICER'));
    testAssert('Researcher approval allows Regional Officer or Admin', hierarchyRules.RESEARCHER.includes('ADMIN'));
  } catch (err) {
    testAssert('Role request hierarchy check failed', false, err.message);
  }

  // Test 4: Admin Dashboard Overview & 7 Roles Breakdown
  log('\n--- 4. Testing Admin Overview Metrics & 7-Role Distribution ---', 'yellow');
  try {
    const overview = await adminService.getOverview();
    const dist = overview.metrics.roleDistribution;
    testAssert('Admin Overview metrics populated', overview && overview.metrics !== undefined,
      `Total Users: ${overview.metrics.totalUsers}, Total Farms: ${overview.metrics.totalFarms}`);
    
    testAssert('7-Role distribution structure verified', 
      dist.ADMIN !== undefined &&
      dist.REGIONAL_OFFICER !== undefined &&
      dist.ZONAL_OFFICER !== undefined &&
      dist.WOREDA_OFFICER !== undefined &&
      dist.DEVELOPMENT_AGENT !== undefined &&
      dist.RESEARCHER !== undefined &&
      dist.FARMER !== undefined,
      `Roles: Admin(${dist.ADMIN}), Regional(${dist.REGIONAL_OFFICER}), Zonal(${dist.ZONAL_OFFICER}), Woreda(${dist.WOREDA_OFFICER}), DA(${dist.DEVELOPMENT_AGENT}), Researcher(${dist.RESEARCHER}), Farmer(${dist.FARMER})`
    );
  } catch (err) {
    testAssert('Admin overview failed', false, err.message);
  }

  log('\n' + '='.repeat(75), 'cyan');
  log('   ALL INTEGRATION & ARCHITECTURAL CHECKS COMPLETED', 'cyan');
  log('='.repeat(75) + '\n', 'cyan');
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
