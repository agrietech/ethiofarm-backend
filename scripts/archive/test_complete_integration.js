const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { prisma, connectDB } = require('../src/config/db');

async function runTests() {
  console.log('====================================================');
  console.log('    ETHIOFARM FRONTEND & BACKEND INTEGRATION AUDIT  ');
  console.log('====================================================\n');

  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Fetch or provision test users and woreda
  let farmer = await prisma.user.findFirst({ where: { role: 'FARMER' } });
  if (!farmer) {
    farmer = await prisma.user.create({
      data: {
        email: `farmer_audit_${Date.now()}@ethiofarm.et`,
        fullName: 'Integration Audit Farmer',
        role: 'FARMER',
        passwordHash: 'auditpassword',
      },
    });
  }

  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: `admin_audit_${Date.now()}@ethiofarm.et`,
        fullName: 'Integration Audit Admin',
        role: 'ADMIN',
        passwordHash: 'auditpassword',
      },
    });
  }

  const woreda = await prisma.woreda.findFirst();
  const woredaId = woreda ? woreda.id : 'ET040101';

  const farmerToken = jwt.sign(
    { id: farmer.id, email: farmer.email, role: 'FARMER' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { id: admin.id, email: admin.email, role: 'ADMIN' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 1. Root & Catalog Branding Check
  const rootRes = await request(app).get('/');
  assert(rootRes.status === 200, 'Root status is 200');
  assert(rootRes.body.data?.project?.includes('EthioFarm'), `Root brand contains EthioFarm (${rootRes.body.data?.project})`);

  // 2. Farm Plot Creation, Retrieval, and Deletion
  const createFarmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${farmerToken}`)
    .send({
      farmName: 'Integration Test Farm Plot',
      primaryCrop: 'Teff',
      areaHectares: 2.5,
      latitude: 8.541,
      longitude: 39.271,
      woredaId,
    });
  assert(createFarmRes.status === 201, `Farm created successfully (Status ${createFarmRes.status})`);
  const createdFarmId = createFarmRes.body.data?.id;

  // Read Farm
  const getFarmRes = await request(app)
    .get(`/api/v1/farms/${createdFarmId}`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(getFarmRes.status === 200, `Farm retrieved successfully (Status ${getFarmRes.status})`);

  // Delete Farm (The newly added endpoint DELETE /api/v1/farms/:id)
  const deleteFarmRes = await request(app)
    .delete(`/api/v1/farms/${createdFarmId}`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(deleteFarmRes.status === 200, `DELETE /api/v1/farms/:id succeeded with 200 (Status ${deleteFarmRes.status})`);

  // Confirm deleted
  const verifyDeleteRes = await request(app)
    .get(`/api/v1/farms/${createdFarmId}`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(verifyDeleteRes.status === 404, `Farm confirmed deleted (Status ${verifyDeleteRes.status})`);

  // 3. Sensor Provisioning, Telemetry History, and Latest Reading
  const testHardwareId = `ESP32-INTEG-${Date.now()}`;
  const regSensorRes = await request(app)
    .post('/api/v1/sensors')
    .set('Authorization', `Bearer ${farmerToken}`)
    .send({
      hardwareId: testHardwareId,
      sensorType: 'SOIL_MOISTURE',
    });
  assert(regSensorRes.status === 201, `Sensor registered for farmer (Status ${regSensorRes.status})`);
  const sensor = regSensorRes.body.data;
  const sensorId = sensor?.id;
  const hardwareId = sensor?.hardwareId;

  // Post reading
  const postReadingRes = await request(app)
    .post('/api/v1/sensors/telemetry')
    .set('Authorization', `Bearer ${farmerToken}`)
    .send({
      hardwareId,
      soilMoisture: 42.5,
      soilTemp: 22.0,
      ambientTemp: 25.1,
      humidity: 63.0,
    });
  assert(postReadingRes.status === 201, `Sensor telemetry recorded (Status ${postReadingRes.status})`);

  // Query Telemetry History (The newly added endpoint GET /sensors/:id/telemetry)
  const historyRes = await request(app)
    .get(`/api/v1/sensors/${sensorId}/telemetry`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(historyRes.status === 200, `GET /sensors/:id/telemetry succeeded with 200`);
  assert(Array.isArray(historyRes.body.data) && historyRes.body.data.length > 0, `Telemetry history contains readings (${historyRes.body.data?.length})`);

  // Query Latest Reading (The newly added endpoint GET /sensors/:hardwareId/latest)
  const latestRes = await request(app)
    .get(`/api/v1/sensors/${hardwareId}/latest`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(latestRes.status === 200, `GET /sensors/:hardwareId/latest succeeded with 200`);
  assert(latestRes.body.data?.soilMoisture === 42.5, `Latest reading matches recorded value (moisture: ${latestRes.body.data?.soilMoisture}%)`);

  // 4. Ingestion & Satellite observation endpoints
  const satIngestRes = await request(app)
    .post('/api/v1/satellite-observations/ingest')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ source: 'CHIRPS', woredaId });
  assert(satIngestRes.status === 201, `POST /satellite-observations/ingest succeeded with 201`);

  const queueStatsRes = await request(app)
    .get('/api/v1/ingestion/queue/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(queueStatsRes.status === 200, `GET /ingestion/queue/stats succeeded with 200`);

  const retryJobRes = await request(app)
    .post('/api/v1/ingestion/jobs/job_test_01/retry')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(retryJobRes.status === 200, `POST /ingestion/jobs/:id/retry succeeded with 200`);

  // 5. Alert Mark-As-Read (POST and PATCH)
  const createAlertRes = await request(app)
    .post('/api/v1/alerts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      woredaId,
      titleEn: 'Frost Warning Test',
      messageEn: 'Frost anticipated tonight',
      headline: 'Urgent Frost Warning',
      hazardType: 'DROUGHT',
      severity: 'MODERATE',
    });
  const alertId = createAlertRes.body.data?.id;
  assert(createAlertRes.status === 201, `Alert created (Status ${createAlertRes.status})`);

  // Test PATCH /alerts/:id/read
  const patchReadRes = await request(app)
    .patch(`/api/v1/alerts/${alertId}/read`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(patchReadRes.status === 200, `PATCH /alerts/:id/read succeeded with 200`);

  // Test POST /alerts/:id/read
  const postReadRes = await request(app)
    .post(`/api/v1/alerts/${alertId}/read`)
    .set('Authorization', `Bearer ${farmerToken}`);
  assert(postReadRes.status === 200, `POST /alerts/:id/read succeeded with 200`);

  // 6. Admin Detail Endpoints
  const adminFarmRes = await request(app)
    .get(`/api/v1/admin/farms/${sensor.farmId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminFarmRes.status === 200, `GET /admin/farms/:id succeeded with 200`);

  const adminSensorRes = await request(app)
    .get(`/api/v1/admin/sensors/${sensorId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminSensorRes.status === 200, `GET /admin/sensors/:id succeeded with 200`);

  const adminAlertRes = await request(app)
    .get(`/api/v1/admin/alerts/${alertId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminAlertRes.status === 200, `GET /admin/alerts/:id succeeded with 200`);

  const adminUserRes = await request(app)
    .get(`/api/v1/admin/users/${farmer.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminUserRes.status === 200, `GET /admin/users/:id succeeded with 200`);

  // Cleanup created test records
  try {
    await prisma.sensorReading.deleteMany({ where: { sensorId } });
    await prisma.sensor.delete({ where: { id: sensorId } });
    await prisma.alert.delete({ where: { id: alertId } });
  } catch (_e) {}

  console.log('\n====================================================');
  console.log(`  INTEGRATION TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
