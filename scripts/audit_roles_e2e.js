const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB, prisma } = require('../src/config/db');

const ROLES = [
  'FARMER',
  'DEVELOPMENT_AGENT',
  'WOREDA_OFFICER',
  'ZONAL_OFFICER',
  'REGIONAL_OFFICER',
  'RESEARCHER',
  'ADMIN',
];

function generateTokenForRole(role, overrides = {}) {
  const payload = {
    id: overrides.id || `usr_test_${role.toLowerCase()}_01`,
    phoneNumber: overrides.phoneNumber || '+251911000000',
    email: overrides.email || `${role.toLowerCase()}@ethiofarm.et`,
    role,
    fullName: `Test ${role} User`,
    regionId: overrides.regionId || 'ET-OR',
    zoneId: overrides.zoneId || 'zone_east_shewa_01',
    woredaId: overrides.woredaId || 'woreda_adama_01',
    kebeleId: overrides.kebeleId || 'kebele_adama_01',
    preferredLang: 'am',
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '2h' });
}

async function runRoleAudit() {
  console.log('===============================================================');
  console.log('    ETHIOFARM EXPERT ROLE-BY-ROLE FUNCTIONALITY AUDIT');
  console.log('===============================================================');

  await connectDB();

  // Ensure test woreda exists for tests
  let testWoreda = await prisma.woreda.findFirst();
  const woredaId = testWoreda ? testWoreda.id : 'woreda_adama_01';

  const auditSummary = [];

  for (const role of ROLES) {
    console.log(`\n===============================================================`);
    console.log(` ▶ AUDITING ROLE: [ ${role} ]`);
    console.log(`===============================================================`);

    const token = generateTokenForRole(role, { woredaId });
    const roleResults = {
      role,
      checksPassed: 0,
      totalChecks: 0,
      details: [],
    };

    function recordResult(name, passed, detail = '') {
      roleResults.totalChecks++;
      if (passed) {
        roleResults.checksPassed++;
        console.log(`  ✅ PASS: ${name}`);
      } else {
        console.log(`  ❌ FAIL: ${name} -> ${detail}`);
      }
      roleResults.details.push({ name, passed, detail });
    }

    // 1. Role-Adaptive Unified Dashboard Probe
    try {
      const res = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${token}`);

      const is200 = res.status === 200;
      const returnedRole = res.body?.data?.role === role;
      const hasDashboardPayload = Boolean(res.body?.data?.dashboard);

      recordResult(
        'Unified Dashboard Route (GET /api/v1/dashboard)',
        is200 && returnedRole && hasDashboardPayload,
        `Status: ${res.status}, Role match: ${returnedRole}, HasPayload: ${hasDashboardPayload}`
      );
    } catch (err) {
      recordResult('Unified Dashboard Route (GET /api/v1/dashboard)', false, err.message);
    }

    // 2. Role-Specific Feature Verifications
    if (role === 'FARMER') {
      // Farmer Feature: Get Farms
      const resFarms = await request(app)
        .get('/api/v1/farms')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Farmer Farms Management (GET /api/v1/farms)', resFarms.status === 200, `Status: ${resFarms.status}`);

      // Farmer Feature: Current Weather
      const resWeather = await request(app)
        .get('/api/v1/weather/current?lat=8.54&lng=39.27')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Farmer Real-Time Weather (GET /api/v1/weather/current)', resWeather.status === 200, `Status: ${resWeather.status}`);

      // Farmer Feature: AI Voice Assistant inquiry
      const resAi = await request(app)
        .post('/api/v1/ai/voice-inquiry')
        .set('Authorization', `Bearer ${token}`)
        .send({ userQuestion: 'ስንዴ መቼ ነው የሚዘራው?', language: 'am' });
      recordResult('Farmer AI Voice/Text Inquiry (POST /api/v1/ai/voice-inquiry)', resAi.status === 200, `Status: ${resAi.status}`);

      // Farmer Security Isolation Check: Cannot access Admin Overview
      const resAdmin = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', `Bearer ${token}`);
      recordResult('RBAC Isolation: Farmer Denied Admin Access (403)', resAdmin.status === 403, `Status: ${resAdmin.status}`);
    }

    if (role === 'DEVELOPMENT_AGENT') {
      // DA Feature: Officer/DA Command Center
      const resOfficer = await request(app)
        .get('/api/v1/dashboard/officer')
        .set('Authorization', `Bearer ${token}`);
      recordResult('DA Kebele Extension Dashboard (GET /api/v1/dashboard/officer)', resOfficer.status === 200, `Status: ${resOfficer.status}`);

      // DA Feature: Crop Protection & Scouting tools
      const resDef = await request(app)
        .get('/api/v1/crop-protection/nutrient/database')
        .set('Authorization', `Bearer ${token}`);
      recordResult('DA Crop Deficiency Reference (GET /api/v1/crop-protection/nutrient/database)', resDef.status === 200, `Status: ${resDef.status}`);

      // DA Feature: Animal Disease Surveillance
      const resAnimals = await request(app)
        .get('/api/v1/animal-health/diseases')
        .set('Authorization', `Bearer ${token}`);
      recordResult('DA Livestock Disease Knowledge Base (GET /api/v1/animal-health/diseases)', resAnimals.status === 200, `Status: ${resAnimals.status}`);

      // DA Security Isolation: Cannot trigger raw administrative ingestion pipeline
      const resIngest = await request(app)
        .post('/api/v1/admin/ingestion/trigger')
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'CHIRPS' });
      recordResult('RBAC Isolation: DA Denied Admin Pipeline Control (403)', resIngest.status === 403, `Status: ${resIngest.status}`);
    }

    if (role === 'WOREDA_OFFICER') {
      // Woreda Officer: Command Center
      const resWoreda = await request(app)
        .get('/api/v1/dashboard/officer')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Woreda Command Center (GET /api/v1/dashboard/officer)', resWoreda.status === 200, `Status: ${resWoreda.status}`);

      // Woreda Officer: Hourly & Daily Agro-Meteorological Weather Forecast
      const resWeather = await request(app)
        .get('/api/v1/weather/forecast?lat=8.54&lng=39.27')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Woreda Agro-Met Forecast (GET /api/v1/weather/forecast)', resWeather.status === 200, `Status: ${resWeather.status}`);

      // Woreda Officer: Create & Dispatch Emergency Alert
      const resAlert = await request(app)
        .post('/api/v1/alerts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          woredaId,
          hazardType: 'FLOOD',
          severity: 'HIGH',
          titleEn: 'Woreda Flash Flood Notice',
          messageEn: 'Heavy rainfall in upper catchment.',
          messageAm: 'በከፍተኛ ዝናብ ምክንያት የጎርፍ ስጋት አለ።',
        });
      recordResult('Woreda Early Warning Dispatch (POST /api/v1/alerts)', resAlert.status === 201, `Status: ${resAlert.status}`);

      // Woreda Officer Security Isolation: Cannot access Super Admin operations
      const resAdminDeny = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${token}`);
      recordResult('RBAC Isolation: Woreda Officer Denied Admin Logs (403)', resAdminDeny.status === 403, `Status: ${resAdminDeny.status}`);
    }

    if (role === 'ZONAL_OFFICER') {
      // Zonal Officer: Command Center
      const resZonal = await request(app)
        .get('/api/v1/dashboard/officer')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Zonal Multi-Woreda Command Center (GET /api/v1/dashboard/officer)', resZonal.status === 200, `Status: ${resZonal.status}`);

      // Zonal Officer: Boundaries & Zones
      const resZones = await request(app)
        .get('/api/v1/boundaries/zones')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Zonal Administrative Boundaries Access (GET /api/v1/boundaries/zones)', resZones.status === 200, `Status: ${resZones.status}`);

      // Zonal Officer: Multi-hazard assessment access
      const resHazards = await request(app)
        .get('/api/v1/hazards/earthquakes')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Zonal Multi-Hazard Assessment (GET /api/v1/hazards/earthquakes)', resHazards.status === 200, `Status: ${resHazards.status}`);
    }

    if (role === 'REGIONAL_OFFICER') {
      // Regional Officer: Command Center
      const resRegional = await request(app)
        .get('/api/v1/dashboard/officer')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Regional Macro Command Center (GET /api/v1/dashboard/officer)', resRegional.status === 200, `Status: ${resRegional.status}`);

      // Regional Officer: Regional Analytics Breakdown
      const resRegAnalytics = await request(app)
        .get('/api/v1/analytics/regional')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Regional Agriculture Analytics (GET /api/v1/analytics/regional)', resRegAnalytics.status === 200, `Status: ${resRegAnalytics.status}`);

      // Regional Officer: Multi-hazard woreda overview
      const resWoredas = await request(app)
        .get('/api/v1/boundaries/woredas')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Regional Woredas Overview (GET /api/v1/boundaries/woredas)', resWoredas.status === 200, `Status: ${resWoredas.status}`);
    }

    if (role === 'RESEARCHER') {
      // Researcher: Research Dashboard
      const resResearch = await request(app)
        .get('/api/v1/dashboard/admin')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Research & Science Dashboard (GET /api/v1/dashboard/admin)', resResearch.status === 200, `Status: ${resResearch.status}`);

      // Researcher: Executive Summary Analytics
      const resSummary = await request(app)
        .get('/api/v1/analytics/summary')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Researcher Statistical Analytics Summary (GET /api/v1/analytics/summary)', resSummary.status === 200, `Status: ${resSummary.status}`);

      // Researcher: Temporal Trends & Environmental Metrics
      const resTrends = await request(app)
        .get('/api/v1/analytics/temporal-trends')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Researcher Temporal Environmental Trends (GET /api/v1/analytics/temporal-trends)', resTrends.status === 200, `Status: ${resTrends.status}`);

      // Researcher: Agronomic Advisories Meta-Analysis
      const resAdv = await request(app)
        .get('/api/v1/analytics/agronomic-advisories')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Researcher Agronomic Advisories Meta-Analysis (GET /api/v1/analytics/agronomic-advisories)', resAdv.status === 200, `Status: ${resAdv.status}`);
    }

    if (role === 'ADMIN') {
      // Admin: Full Platform Overview KPI
      const resAdminOverview = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Super Admin Platform Overview KPI (GET /api/v1/admin/overview)', resAdminOverview.status === 200, `Status: ${resAdminOverview.status}`);

      // Admin: Deep System Health
      const resHealth = await request(app)
        .get('/api/v1/admin/system/health')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Admin Deep Diagnostics & Telemetry (GET /api/v1/admin/system/health)', resHealth.status === 200, `Status: ${resHealth.status}`);

      // Admin: User Administration
      const resUsers = await request(app)
        .get('/api/v1/admin/users?limit=5')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Admin User Directory & RBAC Management (GET /api/v1/admin/users)', resUsers.status === 200, `Status: ${resUsers.status}`);

      // Admin: Audit Log Entries
      const resAudit = await request(app)
        .get('/api/v1/admin/audit-logs?limit=5')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Admin Enterprise Audit Logs (GET /api/v1/admin/audit-logs)', resAudit.status === 200, `Status: ${resAudit.status}`);

      // Admin: Role Upgrade Requests Queue
      const resRoleReq = await request(app)
        .get('/api/v1/admin/role-requests')
        .set('Authorization', `Bearer ${token}`);
      recordResult('Admin Role Upgrade Approvals Queue (GET /api/v1/admin/role-requests)', resRoleReq.status === 200, `Status: ${resRoleReq.status}`);
    }

    auditSummary.push(roleResults);
  }

  await disconnectDB();

  console.log('\n===============================================================');
  console.log('                 FINAL ROLE AUDIT SUMMARY');
  console.log('===============================================================');
  let allPass = true;
  for (const s of auditSummary) {
    const passed = s.checksPassed === s.totalChecks;
    if (!passed) allPass = false;
    const icon = passed ? '✅' : '❌';
    console.log(` ${icon} [${s.role.padEnd(18)}]: ${s.checksPassed} / ${s.totalChecks} checks passed`);
  }
  console.log('===============================================================');

  if (allPass) {
    console.log('🎉 ALL 7 ROLES AND CORRESPONDING FEATURES ARE 100% OPERATIONAL!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME ROLE CHECKS FAILED!');
    process.exit(1);
  }
}

runRoleAudit().catch((err) => {
  console.error('[Audit Crash]', err);
  process.exit(1);
});
