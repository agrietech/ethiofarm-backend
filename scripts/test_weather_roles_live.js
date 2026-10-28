const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB, prisma } = require('../src/config/db');

function generateTokenForRole(role, overrides = {}) {
  const payload = {
    id: overrides.id || `usr_test_${role.toLowerCase()}_01`,
    phoneNumber: overrides.phoneNumber || '+251911000000',
    email: overrides.email || `${role.toLowerCase()}@ethiofarm.et`,
    role,
    fullName: `Test ${role} Officer`,
    regionId: overrides.regionId || 'ET-OR',
    zoneId: overrides.zoneId || 'zone_east_shewa_01',
    woredaId: overrides.woredaId || 'woreda_adama_01',
    kebeleId: overrides.kebeleId || 'kebele_adama_01',
    preferredLang: 'am',
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '2h' });
}

async function testLiveWeatherAcrossRoles() {
  console.log('===============================================================');
  console.log('   ETHIOFARM LIVE WEATHER ROLE & LOCATION SCOPING AUDIT');
  console.log('===============================================================');

  await connectDB();

  // Retrieve actual DB records for testing
  const sampleFarm = await prisma.farm.findFirst({
    select: { id: true, farmName: true, latitude: true, longitude: true },
  });
  const sampleKebele = await prisma.kebele.findFirst({
    select: { id: true, nameEn: true, centerLat: true, centerLng: true },
  });
  const sampleWoreda = await prisma.woreda.findFirst({
    select: { id: true, nameEn: true, centerLat: true, centerLng: true },
  });
  const sampleZone = await prisma.zone.findFirst({
    select: { id: true, nameEn: true },
  });
  const sampleRegion = await prisma.region.findFirst({
    select: { id: true, nameEn: true, code: true },
  });

  const testCases = [
    {
      role: 'FARMER',
      overrides: {
        farmId: sampleFarm ? sampleFarm.id : 'farm_test_01',
      },
      query: sampleFarm ? `?farmId=${sampleFarm.id}` : '',
      expectedLevel: 'FARM',
      description: 'Farmer hyper-local plot weather (plot GPS centroid)',
    },
    {
      role: 'DEVELOPMENT_AGENT',
      overrides: {
        kebeleId: sampleKebele ? sampleKebele.id : 'kebele_test_01',
        kebeleName: sampleKebele ? sampleKebele.nameEn : 'Test Kebele',
      },
      query: sampleKebele ? `?kebeleId=${sampleKebele.id}` : '',
      expectedLevel: 'KEBELE',
      description: 'Development Agent kebele extension weather',
    },
    {
      role: 'WOREDA_OFFICER',
      overrides: {
        woredaId: sampleWoreda ? sampleWoreda.id : 'woreda_adama_01',
      },
      query: sampleWoreda ? `?woredaId=${sampleWoreda.id}` : '',
      expectedLevel: 'WOREDA',
      description: 'Woreda Officer district-level weather balance',
    },
    {
      role: 'ZONAL_OFFICER',
      overrides: {
        zoneId: sampleZone ? sampleZone.id : 'zone_east_shewa_01',
      },
      query: sampleZone ? `?zoneId=${sampleZone.id}` : '',
      expectedLevel: 'ZONE',
      description: 'Zonal Officer inter-woreda macro-climatic weather',
    },
    {
      role: 'REGIONAL_OFFICER',
      overrides: {
        regionId: sampleRegion ? sampleRegion.id : 'ET-OR',
      },
      query: sampleRegion ? `?regionId=${sampleRegion.id}` : '',
      expectedLevel: 'REGION',
      description: 'Regional Officer regional watershed state weather',
    },
    {
      role: 'RESEARCHER',
      overrides: {
        woredaId: sampleWoreda ? sampleWoreda.id : 'woreda_adama_01',
      },
      query: '?days=7',
      expectedLevel: ['WOREDA', 'ZONE', 'NATIONAL'],
      description: 'Researcher multi-day thermal GDD and phenology metrics',
    },
    {
      role: 'ADMIN',
      overrides: {},
      query: '?forceRefresh=true',
      expectedLevel: ['WOREDA', 'NATIONAL', 'REGION'],
      description: 'Super Admin live weather feed & telemetry sync',
    },
  ];

  let passed = 0;
  let total = testCases.length;

  for (const tc of testCases) {
    console.log(`\n▶ Testing Role: [ ${tc.role} ] -> ${tc.description}`);
    const token = generateTokenForRole(tc.role, tc.overrides);

    const res = await request(app)
      .get(`/api/v1/weather/forecast${tc.query}`)
      .set('Authorization', `Bearer ${token}`);

    if (res.status !== 200) {
      console.error(`  ❌ FAIL: HTTP ${res.status}: ${JSON.stringify(res.body)}`);
      continue;
    }

    const data = res.body.data;
    if (!data || !data.location) {
      console.error(`  ❌ FAIL: Missing data.location in response`);
      continue;
    }

    const locLevel = data.location.level;
    const isLevelMatch = Array.isArray(tc.expectedLevel)
      ? tc.expectedLevel.includes(locLevel)
      : locLevel === tc.expectedLevel;

    if (!isLevelMatch) {
      console.error(`  ❌ FAIL: Expected level ${JSON.stringify(tc.expectedLevel)}, got: ${locLevel}`);
      continue;
    }

    // Verify live weather fields
    const current = data.current || (data.daily && data.daily[0]);
    if (!current) {
      console.error(`  ❌ FAIL: Missing current weather forecast data`);
      continue;
    }

    const hasLiveMetrics =
      (current.temperature !== undefined || current.maxTempC !== undefined) &&
      current.relativeHumidity !== undefined &&
      current.windSpeedKmh !== undefined;

    if (!hasLiveMetrics) {
      console.error(`  ❌ FAIL: Missing essential meteorological variables (temp, humidity, wind)`);
      continue;
    }

    console.log(`  ✅ PASS: Scoped to ${locLevel} ('${data.location.nameEn || data.location.farmName || data.location.woredaName}')`);
    console.log(`     Live Metrics: Temp: ${current.temperature || current.maxTempC}°C | Humidity: ${current.relativeHumidity}% | Wind: ${current.windSpeedKmh} km/h | Sources: ${data.dataSources || 'WMO Open-Meteo'}`);
    passed++;
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} / ${total} LIVE WEATHER ROLE AUDIT CHECKS PASSED`);
  console.log('===============================================================');

  await disconnectDB();

  if (passed === total) {
    console.log('🎉 ALL ROLES VERIFIED WITH LIVE, BACKEND-SCOPED WEATHER DATA!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testLiveWeatherAcrossRoles().catch((err) => {
  console.error('Fatal error running live weather test:', err);
  process.exit(1);
});
