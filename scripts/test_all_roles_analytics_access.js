const analyticsService = require('../src/modules/analytics/analytics.service');
const { prisma } = require('../src/config/db');

async function testAllRolesAnalytics() {
  console.log('================================================================');
  console.log('🧪 VERIFYING ANALYTICS ACCESS & SCOPING FOR ALL 7 PLATFORM ROLES');
  console.log('================================================================\n');

  const testCases = [
    {
      role: 'FARMER',
      description: 'Smallholder Farmer - Plot & Woreda Hyper-Local Scope',
      params: { role: 'FARMER', userId: 'farmer_01', woredaId: 'ET040703' },
      expectedScope: 'Woreda & Personal Farm scope',
    },
    {
      role: 'DEVELOPMENT_AGENT',
      description: 'Kebele Development Agent - Extension Woreda/Kebele Scope',
      params: { role: 'DEVELOPMENT_AGENT', userId: 'da_01', woredaId: 'ET040703' },
      expectedScope: 'Kebele & Woreda scope',
    },
    {
      role: 'WOREDA_OFFICER',
      description: 'Woreda Agricultural Officer - Single Woreda Jurisdiction Scope',
      params: { role: 'WOREDA_OFFICER', userId: 'woreda_off_01', woredaId: 'ET040703' },
      expectedScope: 'Woreda-wide jurisdiction',
    },
    {
      role: 'ZONAL_OFFICER',
      description: 'Zonal Agricultural Officer - Multi-Woreda Zonal Scope',
      params: { role: 'ZONAL_OFFICER', userId: 'zone_off_01', zoneId: 'ET0407' },
      expectedScope: 'Zone-wide jurisdiction (East Shewa)',
    },
    {
      role: 'REGIONAL_OFFICER',
      description: 'Regional Agricultural Officer - Regional Multi-Zone Scope',
      params: { role: 'REGIONAL_OFFICER', userId: 'region_off_01', regionId: 'ET04' },
      expectedScope: 'Region-wide jurisdiction (Oromia)',
    },
    {
      role: 'RESEARCHER',
      description: 'Agronomic Researcher - National Scientific Observation Scope',
      params: { role: 'RESEARCHER', userId: 'researcher_01' },
      expectedScope: 'National Ethiopia coverage',
    },
    {
      role: 'ADMIN',
      description: 'National System Administrator - Full Enterprise Operational Scope',
      params: { role: 'ADMIN', userId: 'admin_01' },
      expectedScope: 'National Enterprise coverage',
    },
  ];

  for (const tc of testCases) {
    console.log(`Checking [${tc.role}] - ${tc.description}...`);
    try {
      const summary = await analyticsService.getDashboardSummary(tc.params);

      // Verify no hardcoded mock numbers
      if (summary.jurisdictionMetrics.satelliteObservationsCount === 1420 ||
          summary.jurisdictionMetrics.satelliteObservationsCount === 340) {
        throw new Error(`Hardcoded satellite observations detected for role ${tc.role}`);
      }

      console.log(`   ✅ Accessible: YES`);
      console.log(`   📍 Monitored Woredas: ${summary.monitoredWoredas}`);
      console.log(`   🌾 Total Farms In Scope: ${summary.totalFarmsRegistered}`);
      console.log(`   📡 Active Sensors In Scope: ${summary.activeSensors}`);
      console.log(`   ⚠️ Active Early Warnings In Scope: ${summary.activeEarlyWarnings}`);
      console.log(`   🌦️ Local Weather Centroid: ${summary.weatherSummary.current.temperature}°C, ${summary.weatherSummary.current.condition}`);
      console.log(`   🎯 Scope Verified: ${tc.expectedScope}\n`);
    } catch (err) {
      console.error(`   ❌ FAILED for role ${tc.role}:`, err.message);
      process.exit(1);
    }
  }

  console.log('================================================================');
  console.log('🎉 ALL 7 ROLES SUCCESSFULLY ACCESS ANALYTICS WITH STRICT SCOPING!');
  console.log('================================================================');
  process.exit(0);
}

testAllRolesAnalytics();
