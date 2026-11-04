const request = require('supertest');
const app = require('../src/app');
const { prisma, connectDB } = require('../src/config/db');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

async function testFarmerSensors() {
  console.log('=== TEST: INDIVIDUAL FARMER SENSOR REGISTRATION & TELEMETRY ===');
  await connectDB();

  // 1. Fetch or create a test farmer
  let farmer = await prisma.user.findFirst({ where: { role: 'FARMER' } });
  if (!farmer) {
    farmer = await prisma.user.create({
      data: {
        email: `test_farmer_${Date.now()}@agrietech.et`,
        fullName: 'Abebe Bikila Farmer',
        role: 'FARMER',
        passwordHash: 'dummyhash',
      },
    });
  }

  const farmerToken = jwt.sign(
    { id: farmer.id, email: farmer.email, role: 'FARMER' },
    env.JWT_SECRET || 'agrietech_jwt_super_secret_production_key_2026',
    { expiresIn: '15m' }
  );

  const testHwId = `FARMER-NODE-${Date.now()}`;

  // 2. Farmer registers sensor directly via POST /api/v1/sensors
  const regRes = await request(app)
    .post('/api/v1/sensors')
    .set('Authorization', `Bearer ${farmerToken}`)
    .send({
      hardwareId: testHwId,
      sensorType: 'SOIL_MOISTURE',
    });

  console.log(`Register Sensor Status: ${regRes.status}`);
  if (regRes.status !== 201) {
    console.error('Registration failed:', regRes.body);
    process.exit(1);
  }
  const secretToken = regRes.body.data.secretToken;
  if (!secretToken || !secretToken.startsWith('sec_')) {
    console.error('❌ FAIL: secretToken was not generated or returned properly:', regRes.body.data);
    process.exit(1);
  }
  console.log('✅ PASS: Farmer registered sensor successfully and received secretToken:', secretToken.substring(0, 12) + '...');
  console.log(`Sensor ID: ${regRes.body.data.id}, Farm: ${regRes.body.data.farm?.farmName}`);

  // 3a. Verify invalid token is rejected
  const badTelRes = await request(app)
    .post('/api/v1/sensors/telemetry')
    .set('X-Sensor-Token', 'sec_invalid_attacker_token')
    .send({
      hardwareId: testHwId,
      soilMoisture: 99.9,
    });
  if (badTelRes.status === 401) {
    console.log('✅ PASS: Telemetry with forged/invalid X-Sensor-Token was rejected with 401');
  } else {
    console.error('❌ FAIL: Telemetry with invalid token should be 401, got:', badTelRes.status);
    process.exit(1);
  }

  // 3b. Sensor records telemetry using genuine per-device X-Sensor-Token
  const telRes = await request(app)
    .post('/api/v1/sensors/telemetry')
    .set('X-Sensor-Token', secretToken)
    .send({
      hardwareId: testHwId,
      soilMoisture: 41.2,
      ambientTemp: 23.5,
      humidity: 68.0,
      batteryLevel: 94.0,
    });

  console.log(`Record Telemetry Status: ${telRes.status}`);
  if (telRes.status !== 201) {
    console.error('Telemetry record failed:', telRes.body);
    process.exit(1);
  }
  console.log('✅ PASS: Telemetry accepted directly using hardwareId without sensor API key');

  // 4. Farmer retrieves their individual sensors
  const mySensorsRes = await request(app)
    .get('/api/v1/sensors/my-sensors')
    .set('Authorization', `Bearer ${farmerToken}`);

  console.log(`Get My Sensors Status: ${mySensorsRes.status}`);
  const foundSensor = (mySensorsRes.body.data || []).find(s => s.hardwareId === testHwId);
  if (!foundSensor) {
    console.error('Sensor not found in farmer list:', mySensorsRes.body);
    process.exit(1);
  }
  console.log('✅ PASS: Sensor successfully provided in farmer individual sensor list');
  console.log(`Farmer Sensors Count: ${mySensorsRes.body.data.length}, Latest Reading Moisture: ${foundSensor.readings?.[0]?.soilMoisture}%`);

  // 5. Query /api/v1/sensors as farmer
  const scopedSensorsRes = await request(app)
    .get('/api/v1/sensors')
    .set('Authorization', `Bearer ${farmerToken}`);

  const foundScoped = (scopedSensorsRes.body.data || []).find(s => s.hardwareId === testHwId);
  if (!foundScoped) {
    console.error('Sensor not found in scoped list:', scopedSensorsRes.body);
    process.exit(1);
  }
  console.log('✅ PASS: Scoped /api/v1/sensors endpoint isolates and provides data for this farmer');

  console.log('\nALL FARMER SENSOR TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

testFarmerSensors().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
