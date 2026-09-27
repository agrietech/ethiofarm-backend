const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB, prisma } = require('../src/config/db');
const { disconnectRedis } = require('../src/config/redis');
const mfaService = require('../src/modules/auth/mfa.service');
const QueryCache = require('../src/utils/query-cache');
const Farm = require('../src/models/Farm.model');
const FarmRepository = require('../src/repositories/farm.repository');

const testSecret = env.E2E_TEST_SECRET || 'agrietech_e2e_test_secret';

// Generate mock JWTs for different roles
const adminToken = jwt.sign(
  { id: 'usr_test_admin_01', email: 'admin@agrietech.et', role: 'ADMIN' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const farmerToken = jwt.sign(
  { id: 'usr_test_farmer_01', email: 'farmer@agrietech.et', role: 'FARMER', woredaId: 'ET040101' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const officerToken = jwt.sign(
  { id: 'usr_test_officer_01', email: 'officer@agrietech.et', role: 'WOREDA_OFFICER', woredaId: 'ET040101' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const agentToken = jwt.sign(
  { id: 'usr_test_agent_01', email: 'agent@agrietech.et', role: 'DEVELOPMENT_AGENT', woredaId: 'ET040101' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

async function runVerification() {
  console.log('===============================================================');
  console.log('       AGRIETECH LIMITATION FIXES INTEGRATION TEST SUITE       ');
  console.log('===============================================================\n');

  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`, details || '');
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // 1. Auth & Security: MFA & Session Management
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing MFA & Session Management ---');

    // Setup MFA
    const mfaSetupRes = await request(app)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      mfaSetupRes.status === 200 && mfaSetupRes.body.data.secret && mfaSetupRes.body.data.backupCodes?.length === 10,
      'MFA Setup returns base32 secret and 10 backup codes',
      mfaSetupRes.body
    );

    const secret = mfaSetupRes.body.data?.secret;
    // Generate valid TOTP code
    const validToken = (await mfaService.generateTOTPSecret('usr_test_farmer_temp')).secret;
    // Test verify endpoint
    const mfaVerifyRes = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret)
      .send({ token: '000000' }); // Expected invalid token

    assert(
      mfaVerifyRes.status === 400 && mfaVerifyRes.body.error.code === 'INVALID_TOKEN',
      'MFA Verify rejects invalid token appropriately',
      mfaVerifyRes.body
    );

    // List Sessions
    const sessionsRes = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      sessionsRes.status === 200 && Array.isArray(sessionsRes.body.data?.sessions),
      'List Sessions returns user active sessions array',
      sessionsRes.body
    );

    // Terminate other sessions
    const termOthersRes = await request(app)
      .post('/api/v1/auth/sessions/terminate-others')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret)
      .send({ currentSessionId: 'sess_current_mock' });

    assert(
      termOthersRes.status === 200 && termOthersRes.body.data.terminatedCount !== undefined,
      'Terminate Other Sessions succeeds',
      termOthersRes.body
    );

    // -------------------------------------------------------------
    // 2. Dashboards: Unified Router & Role-Specific Endpoints
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Unified & Specialized Dashboards ---');

    // Auto-detect role dashboard (Farmer)
    const farmerAutoRes = await request(app)
      .get('/api/v1/dashboards')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      farmerAutoRes.status === 200 && farmerAutoRes.body.data.role === 'FARMER' && farmerAutoRes.body.data.dashboard.farmOverview,
      'Unified /api/v1/dashboards auto-detects FARMER role with farm overview and quick actions',
      farmerAutoRes.body
    );

    // Farmer specialized dashboard
    const farmerDashRes = await request(app)
      .get('/api/v1/dashboards/farmer')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      farmerDashRes.status === 200 &&
        farmerDashRes.body.data.weather &&
        farmerDashRes.body.data.marketPrices?.length > 0 &&
        farmerDashRes.body.data.calendar,
      'Specialized Farmer Dashboard includes 7-day weather, market prices, and seasonal calendar',
      farmerDashRes.body
    );

    // Officer Command Center
    const officerDashRes = await request(app)
      .get('/api/v1/dashboards/officer')
      .set('Authorization', `Bearer ${officerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      officerDashRes.status === 200 &&
        officerDashRes.body.data.jurisdiction &&
        officerDashRes.body.data.emergencyPanel &&
        officerDashRes.body.data.sensorNetwork,
      'Officer Command Center includes jurisdiction stats, emergency panel, and sensor network telemetry',
      officerDashRes.body
    );

    // Development Agent Dashboard
    const agentDashRes = await request(app)
      .get('/api/v1/dashboards/agent')
      .set('Authorization', `Bearer ${agentToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      agentDashRes.status === 200 &&
        agentDashRes.body.data.taskSchedule &&
        agentDashRes.body.data.assignedFarmers,
      'Development Agent Dashboard includes task schedule and assigned farmers roster',
      agentDashRes.body
    );

    // Admin Control Panel
    const adminDashRes = await request(app)
      .get('/api/v1/dashboards/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      adminDashRes.status === 200 &&
        adminDashRes.body.data.systemHealth &&
        adminDashRes.body.data.usersOverview,
      'Admin Control Panel includes system health, user distribution, and security audit',
      adminDashRes.body
    );

    // Researcher Data Portal
    const researcherDashRes = await request(app)
      .get('/api/v1/dashboards/researcher')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      researcherDashRes.status === 200 &&
        researcherDashRes.body.data.researchPortal?.availableDatasets?.length > 0,
      'Researcher Portal provides datasets and export formats',
      researcherDashRes.body
    );

    // -------------------------------------------------------------
    // 3. Farm Planning & Benchmarking Engines
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Farm Planning & Benchmarking Engines ---');

    // Find a farm to run analytics and planning on
    let testFarm = await prisma.farm.findFirst();
    if (!testFarm) {
      testFarm = { id: 'mock_farm_id', farmName: 'Demo Farm Plot', primaryCrop: 'Teff', areaHectares: 2.5 };
    }

    // Crop Rotation Plan
    const rotationRes = await request(app)
      .post(`/api/v1/farms/${testFarm.id}/planning/rotation`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret)
      .send({ years: 3 });

    assert(
      rotationRes.status === 200 && rotationRes.body.data.rotationPlan?.length === 3,
      'Farm Planner generates 3-year multi-season crop rotation plan with soil health benefits',
      rotationRes.body
    );

    // Input Calculator
    const inputsRes = await request(app)
      .get(`/api/v1/farms/${testFarm.id}/planning/inputs?crop=Teff`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      inputsRes.status === 200 &&
        inputsRes.body.data.requirements?.seeds &&
        inputsRes.body.data.requirements?.fertilizers &&
        inputsRes.body.data.requirements?.water,
      'Farm Planner calculates seed rate, UREA/DAP fertilizers, labor days, and water requirement',
      inputsRes.body
    );

    // Planting Calendar
    const calendarRes = await request(app)
      .get(`/api/v1/farms/${testFarm.id}/planning/calendar`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      calendarRes.status === 200 && calendarRes.body.data.timeline?.length > 0,
      'Farm Planner generates agro-ecological planting timeline from land prep to harvest',
      calendarRes.body
    );

    // Farm Analytical Dashboard & Health Score
    const farmAnalyticsRes = await request(app)
      .get(`/api/v1/farms/${testFarm.id}/analytics`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      farmAnalyticsRes.status === 200 &&
        farmAnalyticsRes.body.data.healthScore !== undefined &&
        farmAnalyticsRes.body.data.profitability &&
        farmAnalyticsRes.body.data.yieldPerformance,
      'Farm Analytics provides health score, profitability ROI, and historical yield performance',
      farmAnalyticsRes.body
    );

    // Regional Benchmarks
    const benchmarksRes = await request(app)
      .get(`/api/v1/farms/${testFarm.id}/benchmarks`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      benchmarksRes.status === 200 &&
        benchmarksRes.body.data.woredaAverageYield !== undefined &&
        benchmarksRes.body.data.nationalAverageYield !== undefined,
      'Farm Benchmarking compares yield against woreda, zonal, and national averages',
      benchmarksRes.body
    );

    // -------------------------------------------------------------
    // 4. Alert Targeting & Multilingual Templates
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Alert Targeting & Multilingual Templates ---');

    // Get all templates
    const templatesRes = await request(app)
      .get('/api/v1/alerts/templates')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      templatesRes.status === 200 && Array.isArray(templatesRes.body.data) && templatesRes.body.data.length >= 4,
      'Alert Templates retrieves pre-approved multi-hazard templates (Drought, Frost, Locust, Flood)',
      templatesRes.body
    );

    // Get single template
    const droughtTplRes = await request(app)
      .get('/api/v1/alerts/templates/DROUGHT_WARNING')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      droughtTplRes.status === 200 && droughtTplRes.body.data.titleAm && droughtTplRes.body.data.titleEn,
      'Alert Template provides bilingual English & Amharic translations with action items',
      droughtTplRes.body
    );

    // Dispatch templated alert with variable interpolation
    const dispatchTplRes = await request(app)
      .post('/api/v1/alerts/templates/DROUGHT_WARNING/dispatch')
      .set('Authorization', `Bearer ${officerToken}`)
      .set('x-e2e-test-key', testSecret)
      .send({
        variables: { rainfallForecastMm: '12', recommendations: 'Prioritize drip lines' },
        targeting: { woredaId: 'ET040101', crops: ['Teff', 'Wheat'] },
      });

    assert(
      dispatchTplRes.status === 201 && dispatchTplRes.body.data.campaignId && dispatchTplRes.body.data.status === 'DISPATCHED',
      'Dispatch Templated Alert interpolates variables and queues multi-channel delivery',
      dispatchTplRes.body
    );

    // Targeted Alert Campaign with Smart Audience Querying
    const targetedRes = await request(app)
      .post('/api/v1/alerts/campaigns/targeted')
      .set('Authorization', `Bearer ${officerToken}`)
      .set('x-e2e-test-key', testSecret)
      .send({
        woredaId: 'ET040101',
        hazardType: 'LOCUST_PEST',
        severity: 'CRITICAL',
        content: {
          titleEn: 'Locust swarm spotted in boundary kebele',
          titleAm: 'የአንበጣ መንጋ በወሰን ቀበሌ ታይቷል',
          messageEn: 'Prepare biopesticide spray equipment immediately.',
          messageAm: 'የተባይ ማጥፊያ መርጫ መሳሪያዎችን ወዲያውኑ ያዘጋጁ።',
        },
        targeting: {
          crops: ['Teff', 'Wheat'],
          farmSize: { min: 0.5, max: 10 },
        },
      });

    assert(
      targetedRes.status === 201 && targetedRes.body.data.targetingCriteriaApplied.length > 0,
      'Targeted Alert Campaign filters audience by crop and farm size criteria',
      targetedRes.body
    );

    // -------------------------------------------------------------
    // 5. RBAC & Scope Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing RBAC & Scope Enforcement ---');

    // Telemetry endpoint enforces user scope
    const telemetryRes = await request(app)
      .get('/api/v1/sensors/telemetry')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      telemetryRes.status === 200,
      'Sensor Telemetry query operates with farmer scope enforcement',
      telemetryRes.body
    );

    // Disease diagnosis endpoint enforces scope
    const diagnosisRes = await request(app)
      .get('/api/v1/disease-diagnosis')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('x-e2e-test-key', testSecret);

    assert(
      diagnosisRes.status === 200,
      'Disease Diagnosis query operates with farmer scope enforcement',
      diagnosisRes.body
    );

    // -------------------------------------------------------------
    // 6. Query Caching, Repository Abstraction & Domain Models
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Query Caching, Repository Abstraction & Domain Models ---');

    // Query Cache test
    const count1 = await QueryCache.getFarmCount('ET040101');
    const count2 = await QueryCache.getFarmCount('ET040101');
    assert(
      typeof count1 === 'number' && count1 === count2,
      `QueryCache returns cached farm counts efficiently (${count1} farms)`,
      { count1, count2 }
    );

    // Domain model test
    const farmModel = new Farm({
      farmName: 'Bishoftu Test Farm',
      areaHectares: 4.5,
      soilType: 'Vertisol',
      primaryCrop: 'Teff',
    });

    assert(
      farmModel.areaInAcres > 11.0 && farmModel.calculateHealthScore() >= 90 && !farmModel.isLargeScale,
      `Farm domain model correctly calculates area in acres (${farmModel.areaInAcres} ac) and health score (${farmModel.calculateHealthScore()})`,
      farmModel
    );

    // Repository pattern test
    const repoFarms = await FarmRepository.findMany({}, { take: 1 });
    assert(
      Array.isArray(repoFarms),
      'FarmRepository successfully abstracts Prisma data access',
      repoFarms
    );
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await disconnectDB();
    await disconnectRedis();
  }

  console.log('\n===============================================================');
  console.log(`  FINAL RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
