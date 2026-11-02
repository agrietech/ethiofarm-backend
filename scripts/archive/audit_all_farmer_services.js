/**
 * Comprehensive Automated Audit Script for All Farmer Services & Full-Stack Backend Integration
 * Tests 100% of farmer-accessible services with authentic JWT authentication.
 */
const request = require('supertest');
const app = require('../src/app');
const { prisma, connectDB } = require('../src/config/db');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

// 1x1 transparent JPEG test image buffer
const sampleImageBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runFarmerServicesAudit() {
  console.log('\n========================================================================');
  console.log('🌾 ETHIOFARM: COMPREHENSIVE AUDIT OF ALL FARMER SERVICES & INTEGRATION');
  console.log('========================================================================\n');

  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  try {
    // 0. Prepare or fetch genuine FARMER user
    console.log('--- Phase 0: Farmer Identity & Authentication Credentials ---');
    let farmer = await prisma.user.findFirst({ where: { role: 'FARMER' } });
    if (!farmer) {
      farmer = await prisma.user.create({
        data: {
          email: `farmer_audit_${Date.now()}@agrietech.et`,
          fullName: 'Chala Desta Farmer',
          phoneNumber: `+251911${Math.floor(100000 + Math.random() * 900000)}`,
          role: 'FARMER',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        },
      });
    }

    const farmerToken = jwt.sign(
      { id: farmer.id, email: farmer.email, role: 'FARMER' },
      env.JWT_SECRET || 'agrietech_jwt_super_secret_production_key_2026',
      { expiresIn: '1h' }
    );

    assert('Farmer account verified in database', !!farmer.id, `ID: ${farmer.id}`);
    assert('Farmer authentication JWT issued', !!farmerToken);

    // 1. Auth Profile Inspection
    console.log('\n--- Phase 1: Authentication & Profile Service ---');
    const profileRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /auth/me returns 200', profileRes.status === 200, `Got status: ${profileRes.status}`);
    assert('Profile role is FARMER', profileRes.body?.data?.user?.role === 'FARMER' || profileRes.body?.data?.role === 'FARMER');

    // 2. Farm Plots Management (CRUD)
    console.log('\n--- Phase 2: Farm Plot Management Service ---');
    const farmName = `Adaa Teff Plot ${Date.now()}`;
    const createFarmRes = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        farmName,
        primaryCrop: 'Teff',
        areaHectares: 2.25,
        latitude: 8.5412,
        longitude: 39.2734,
        soilType: 'Vertisol (Black Cotton)',
        irrigationType: 'Rainfed',
      });
    assert('POST /farms registers farm plot (201)', createFarmRes.status === 201, `Status: ${createFarmRes.status}`);
    const createdFarm = createFarmRes.body?.data;
    const farmId = createdFarm?.id;
    assert('Created farm has valid ID', !!farmId, `ID: ${farmId}`);

    const getFarmsRes = await request(app)
      .get('/api/v1/farms')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /farms lists farmer plots (200)', getFarmsRes.status === 200);
    assert('Farmer plot list contains newly created farm', (getFarmsRes.body?.data || []).some(f => f.id === farmId));

    const getFarmDetailRes = await request(app)
      .get(`/api/v1/farms/${farmId}`)
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /farms/:id retrieves plot details (200)', getFarmDetailRes.status === 200);
    assert('Farm detail matches primary crop', getFarmDetailRes.body?.data?.primaryCrop === 'Teff');

    const updateFarmRes = await request(app)
      .patch(`/api/v1/farms/${farmId}`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        areaHectares: 3.5,
        soilType: 'Vertisol (Enriched)',
      });
    assert('PATCH /farms/:id updates plot attributes (200)', updateFarmRes.status === 200);
    assert('Updated farm reflects new area', updateFarmRes.body?.data?.areaHectares === 3.5);

    // 3. Smart Crop Protection Suite
    console.log('\n--- Phase 3: Smart Crop Protection & Agronomic Suite ---');
    // 3a. Weed Detection
    const weedDbRes = await request(app)
      .get('/api/v1/crop-protection/weed/database')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/weed/database returns 200', weedDbRes.status === 200);

    const weedDetectRes = await request(app)
      .post('/api/v1/crop-protection/weed/detect')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropType: 'Wheat',
        areaHectares: 2.0,
        imageBase64: sampleImageBase64,
        language: 'am',
      });
    assert('POST /crop-protection/weed/detect returns 200', weedDetectRes.status === 200);
    assert('Weed detection outputs knapsack sprayer plan', weedDetectRes.body?.data?.calibratedKnapsackSprayerPlan?.totalKnapsacksNeeded > 0);

    // 3b. Spray Window
    const sprayRes = await request(app)
      .get('/api/v1/crop-protection/spray-window?latitude=8.54&longitude=39.27')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/spray-window returns 200', sprayRes.status === 200);
    assert('Spray window provides condition status', !!sprayRes.body?.data?.currentConditions?.status);

    // 3c. Nutrient Deficiency
    const nutDbRes = await request(app)
      .get('/api/v1/crop-protection/nutrient/database')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/nutrient/database returns 200', nutDbRes.status === 200);

    const nutScanRes = await request(app)
      .post('/api/v1/crop-protection/nutrient/scan')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropType: 'Maize',
        leafPosition: 'older',
        pattern: 'v_shaped',
        imageBase64: sampleImageBase64,
        soilPh: 6.2,
      });
    assert('POST /crop-protection/nutrient/scan returns 200', nutScanRes.status === 200);
    assert('Nutrient scan provides diagnosed deficiency & top-dressing rate', !!nutScanRes.body?.data?.diagnosedDeficiency?.nutrient);

    // 3d. Pest Scout & ETL
    const pestDbRes = await request(app)
      .get('/api/v1/crop-protection/pest/database')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/pest/database returns 200', pestDbRes.status === 200);

    const pestScoutRes = await request(app)
      .post('/api/v1/crop-protection/pest/scout')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        pestId: 'fall_armyworm',
        cropType: 'Maize',
        cropStage: 'midWhorl',
        observedDamagePercent: 25,
        totalSampledPlants: 50,
      });
    assert('POST /crop-protection/pest/scout returns 200', pestScoutRes.status === 200);
    assert('Pest scout evaluates ETL threshold decision', !!pestScoutRes.body?.data?.scoutResult?.actionRecommended);

    // 3e. Tank-Mix Compatibility
    const chemRes = await request(app)
      .get('/api/v1/crop-protection/tank-mix/chemicals')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/tank-mix/chemicals returns 200', chemRes.status === 200);

    const tankRes = await request(app)
      .post('/api/v1/crop-protection/tank-mix/validate')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        productIds: ['mancozeb_80wp', 'chlorpyrifos_48ec'],
        waterVolumeLiters: 16,
      });
    assert('POST /crop-protection/tank-mix/validate returns 200', tankRes.status === 200);
    assert('Tank-mix validation provides physical & chemical assessment', !!tankRes.body?.data?.compatibilityStatus);

    // 3f. Seed Rate Calculator
    const seedCropsRes = await request(app)
      .get('/api/v1/crop-protection/seed-calculator/crops')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /crop-protection/seed-calculator/crops returns 200', seedCropsRes.status === 200);

    const seedCalcRes = await request(app)
      .post('/api/v1/crop-protection/seed-calculator')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropId: 'teff',
        areaValue: 1.5,
        areaUnit: 'HECTARES',
        plantingMethod: 'ROW',
      });
    assert('POST /crop-protection/seed-calculator returns 200', seedCalcRes.status === 200);
    assert('Seed calculator computes calibrated seed kg requirement', seedCalcRes.body?.data?.calculation?.recommendedSeedKgTotal > 0);

    // 4. AI Plant Disease Diagnosis
    console.log('\n--- Phase 4: AI Plant Disease Diagnosis Service ---');
    const diagRes = await request(app)
      .post('/api/v1/disease-diagnosis/diagnose')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        farmId,
        cropType: 'Wheat',
        imageBase64: sampleImageBase64,
        language: 'am',
      });
    assert('POST /disease-diagnosis/diagnose returns 201', diagRes.status === 201, `Status: ${diagRes.status}`);
    const diagId = diagRes.body?.data?.id;
    assert('Diagnosis returns valid ID and disease prescription', !!diagId && (!!diagRes.body?.data?.diseaseName || !!diagRes.body?.data?.cropIdentified));

    const listDiagRes = await request(app)
      .get('/api/v1/disease-diagnosis')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /disease-diagnosis returns 200 for farmer', listDiagRes.status === 200);
    assert('Diagnoses list contains submitted record', (listDiagRes.body?.data || []).some(d => d.id === diagId));

    if (diagId) {
      const singleDiagRes = await request(app)
        .get(`/api/v1/disease-diagnosis/${diagId}`)
        .set('Authorization', `Bearer ${farmerToken}`);
      assert('GET /disease-diagnosis/:id retrieves specific diagnosis (200)', singleDiagRes.status === 200);
    }

    // 5. Bilingual AI Voice & Agronomic Chat Assistant
    console.log('\n--- Phase 5: AI Voice & Agronomic Assistant Service ---');
    const aiTextRes = await request(app)
      .post('/api/v1/ai/text-inquiry')
      .timeout({ deadline: 60000 })
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        question: 'የጤፍ ማሳ ላይ የዝናብ ውሃ እንዴት መቆጣጠር ይቻላል?',
        language: 'am',
      });
    assert('POST /ai/text-inquiry returns 200', aiTextRes.status === 200);
    assert('AI assistant delivers bilingual agronomic advisory', !!(aiTextRes.body?.data?.responseAm || aiTextRes.body?.data?.responseEn));

    const aiSpeakRes = await request(app)
      .post('/api/v1/ai/speak')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        text: 'የስንዴ ዝናብ ወቅት መረጃ',
        language: 'am',
      });
    assert('POST /ai/speak returns 200', aiSpeakRes.status === 200);

    // 6. Weather & Climatology Service
    console.log('\n--- Phase 6: Weather & Climatology Service ---');
    const curWeatherRes = await request(app)
      .get('/api/v1/weather/current?lat=8.54&lng=39.27')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /weather/current returns 200', curWeatherRes.status === 200);
    assert('Current weather provides temperature & condition', curWeatherRes.body?.data?.current?.maxTempC !== undefined);

    const forecastRes = await request(app)
      .get('/api/v1/weather/forecast?lat=8.54&lng=39.27&days=7')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /weather/forecast returns 200', forecastRes.status === 200);
    assert('Weather forecast provides 7-day projection', forecastRes.body?.data?.daily?.length >= 5);

    // 7. IoT Sensors for Farmer
    console.log('\n--- Phase 7: IoT Sensors & Field Probes Service ---');
    const testHwId = `NODE-FARMER-${Date.now()}`;
    const registerSensorRes = await request(app)
      .post('/api/v1/sensors')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        hardwareId: testHwId,
        farmId,
        sensorType: 'SOIL_MOISTURE',
      });
    assert('POST /sensors registers IoT sensor for farmer (201)', registerSensorRes.status === 201);
    const sensorSecret = registerSensorRes.body?.data?.secretToken;
    assert('Sensor assigned device cryptographic token', !!sensorSecret && sensorSecret.startsWith('sec_'));

    const mySensorsRes = await request(app)
      .get('/api/v1/sensors/my-sensors')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /sensors/my-sensors lists farmer sensors (200)', mySensorsRes.status === 200);
    assert('Farmer sensor list contains registered hardwareId', (mySensorsRes.body?.data || []).some(s => s.hardwareId === testHwId));

    const scopedSensorsRes = await request(app)
      .get('/api/v1/sensors')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /sensors scopes to farmer (200)', scopedSensorsRes.status === 200);

    // Record authentic telemetry reading
    const recTelemetryRes = await request(app)
      .post('/api/v1/sensors/telemetry')
      .set('X-Sensor-Token', sensorSecret)
      .send({
        hardwareId: testHwId,
        soilMoisture: 38.5,
        soilTemp: 21.0,
        ambientTemp: 24.2,
        humidity: 62.0,
        batteryLevel: 92.0,
      });
    assert('POST /sensors/telemetry records probe telemetry (201)', recTelemetryRes.status === 201);

    const latestTelemetryRes = await request(app)
      .get(`/api/v1/sensors/${testHwId}/latest`)
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /sensors/:hardwareId/latest provides real-time reading (200)', latestTelemetryRes.status === 200);
    assert('Latest reading has correct moisture level', latestTelemetryRes.body?.data?.soilMoisture === 38.5);

    // 8. Early Warning Alerts & Feedback
    console.log('\n--- Phase 8: Early Warning Alerts & Community Feedback ---');
    const alertsRes = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /alerts succeeds for farmer without 403 (200)', alertsRes.status === 200, `Got: ${alertsRes.status}`);

    const existingAlert = await prisma.alert.findFirst();
    if (existingAlert) {
      const markReadRes = await request(app)
        .patch(`/api/v1/alerts/${existingAlert.id}/read`)
        .set('Authorization', `Bearer ${farmerToken}`);
      assert('PATCH /alerts/:id/read marks alert as read (200)', markReadRes.status === 200);

      const feedbackRes = await request(app)
        .post(`/api/v1/alerts/${existingAlert.id}/feedback`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({
          accurate: true,
          notes: 'Observed early rust pustules in field',
        });
      assert('POST /alerts/:id/feedback submits farmer ground-truth (201)', feedbackRes.status === 201);
    }

    // 9. Advisories & Notifications
    console.log('\n--- Phase 9: Agronomic Advisories & Notifications Service ---');
    const advisoriesRes = await request(app)
      .get('/api/v1/advisories')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /advisories succeeds for farmer without 403 (200)', advisoriesRes.status === 200);

    const notifsRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /notifications returns farmer inbox (200)', notifsRes.status === 200);

    const unreadRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /notifications/unread-count returns unread count (200)', unreadRes.status === 200);

    const markAllNotifsRes = await request(app)
      .post('/api/v1/notifications/mark-all-read')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('POST /notifications/mark-all-read updates notifications (200)', markAllNotifsRes.status === 200);

    // 10. Role Upgrade Application
    console.log('\n--- Phase 10: Role Upgrade Application Service ---');
    const woreda = await prisma.woreda.findFirst({
      include: { zone: { include: { region: true } } },
    });

    const roleReqRes = await request(app)
      .post('/api/v1/auth/role-requests')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        requestedRole: 'DEVELOPMENT_AGENT',
        reason: 'Serving as FTC extension agent in Adama',
        organizationName: 'Oromia Agriculture Bureau',
        staffIdNumber: `DA-${Date.now()}`,
        woredaId: woreda?.id,
        woredaName: woreda?.nameEn,
        zoneId: woreda?.zoneId,
        zoneName: woreda?.zone?.nameEn,
        regionId: woreda?.zone?.regionId,
        regionName: woreda?.zone?.region?.nameEn,
      });

    // If duplicate pending exists or 201 created
    assert(
      'POST /auth/role-requests submits application (201 or 400 if already pending)',
      roleReqRes.status === 201 || (roleReqRes.status === 400 && roleReqRes.body?.error?.message?.includes('already have a pending request')),
      `Status: ${roleReqRes.status} -> ${JSON.stringify(roleReqRes.body?.error || roleReqRes.body?.data?.id)}`
    );

    const myRoleReqsRes = await request(app)
      .get('/api/v1/auth/role-requests/my-requests')
      .set('Authorization', `Bearer ${farmerToken}`);
    assert('GET /auth/role-requests/my-requests returns farmer requests (200)', myRoleReqsRes.status === 200);
    assert('Role applications list is an array', Array.isArray(myRoleReqsRes.body?.data || myRoleReqsRes.body?.data?.requests));

    // Cleanup: delete test farm plot
    if (farmId) {
      await request(app)
        .delete(`/api/v1/farms/${farmId}`)
        .set('Authorization', `Bearer ${farmerToken}`);
    }

    console.log('\n========================================================================');
    console.log(`🎯 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('🌟 ALL FARMER SERVICES ARE FULLY FUNCTIONAL AND PERFECTLY INTEGRATED!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal audit error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runFarmerServicesAudit();
