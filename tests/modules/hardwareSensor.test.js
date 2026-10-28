const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');
const { prisma } = require('../../src/config/db');

const farmerUser = { id: 'usr_test_farmer_hw_01', phoneNumber: '+251911999888', role: 'FARMER' };
const farmerToken = generateAccessToken(farmerUser);
const adminUser = { id: 'usr_admin_01', phoneNumber: '+251911000000', role: 'ADMIN' };
const adminToken = generateAccessToken(adminUser);

describe('Hardware ID Sensor Registration & Direct Telemetry Suite', () => {
  let testFarm;
  const testHardwareId = 'HW-ESP32-ETH-001';

  beforeAll(async () => {
    // Pre-clean leftover test data from any interrupted prior run
    // (sensors/farms/users must be removed in FK-safe order)
    await prisma.sensorReading.deleteMany({
      where: { sensor: { hardwareId: testHardwareId } },
    });
    await prisma.sensor.deleteMany({ where: { hardwareId: testHardwareId } });
    await prisma.farm.deleteMany({ where: { id: 'farm_hw_test_01' } });
    await prisma.user.deleteMany({
      where: { OR: [{ id: farmerUser.id }, { phoneNumber: farmerUser.phoneNumber }] },
    });

    // Create test user fresh
    await prisma.user.create({
      data: {
        id: farmerUser.id,
        phoneNumber: farmerUser.phoneNumber,
        email: 'farmer_hw_test@ethiofarm.et',
        fullName: 'Hardware Test Farmer',
        role: 'FARMER',
        isPhoneVerified: true,
      },
    });

    // Ensure test farm exists
    const woreda = await prisma.woreda.findFirst();
    testFarm = await prisma.farm.upsert({
      where: { id: 'farm_hw_test_01' },
      update: {},
      create: {
        id: 'farm_hw_test_01',
        userId: farmerUser.id,
        farmName: 'Bishoftu Hardware Sensor Test Plot',
        woredaId: woreda ? woreda.id : 'woreda_adama_01',
        latitude: 8.75,
        longitude: 38.98,
        primaryCrop: 'TEFF',
        areaHectares: 2.5,
      },
    });
  });


  afterAll(async () => {
    // Clean up test records
    await prisma.sensorReading.deleteMany({
      where: { sensor: { hardwareId: testHardwareId } },
    });
    await prisma.sensor.deleteMany({
      where: { hardwareId: testHardwareId },
    });
    await prisma.farm.deleteMany({
      where: { id: 'farm_hw_test_01' },
    });
    await prisma.user.deleteMany({
      where: { id: farmerUser.id },
    });
  });

  describe('Direct Hardware ID Sensor Registration Tests', () => {
    it('POST /api/v1/sensors - should register sensor directly by Hardware ID', async () => {
      const res = await request(app)
        .post('/api/v1/sensors')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({
          farmId: testFarm.id,
          hardwareId: testHardwareId,
          sensorType: 'SOIL_MOISTURE',
          deviceType: 'ESP32_SOIL_NODE',
          firmwareVersion: '1.2.0',
        });

      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hardwareId).toBe(testHardwareId);
      expect(res.body.data.sensorType).toBe('SOIL_MOISTURE');
    });

    it('GET /api/v1/sensors/my-sensors - should return sensors registered to current farmer', async () => {
      const res = await request(app)
        .get('/api/v1/sensors/my-sensors')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((s) => s.hardwareId === testHardwareId);
      expect(found).toBeDefined();
    });

    it('POST /api/v1/sensors/telemetry - should record direct telemetry using hardwareId', async () => {
      const res = await request(app)
        .post('/api/v1/sensors/telemetry')
        .send({
          hardwareId: testHardwareId,
          farmId: testFarm.id,
          soilMoisture: 42.5,
          soilTemp: 23.1,
          ambientTemp: 26.0,
          humidity: 58.0,
          batteryLevel: 96.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.soilMoisture).toBe(42.5);
      expect(res.body.data.batteryLevel).toBe(96.0);
    });

    it('GET /api/v1/sensors/:hardwareId/latest - should fetch latest reading by hardwareId', async () => {
      const res = await request(app)
        .get(`/api/v1/sensors/${testHardwareId}/latest`)
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.soilMoisture).toBe(42.5);
      expect(res.body.data.sensor.hardwareId).toBe(testHardwareId);
    });
  });
});

