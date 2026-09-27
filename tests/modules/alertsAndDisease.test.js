const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');

describe('Alerts & Disease Diagnosis API Suite', () => {
  jest.setTimeout(60000);

  // Seed geography hierarchy + farmer user + demo farm so ownership checks pass
  beforeAll(async () => {
    const { prisma } = require('../../src/config/db');
    await prisma.region.upsert({
      where: { id: 'reg_oromia_01' },
      update: {},
      create: { id: 'reg_oromia_01', nameEn: 'Oromia', nameAm: 'ኦሮሚያ', code: 'ET-OR' },
    });
    await prisma.zone.upsert({
      where: { id: 'zone_east_shewa_01' },
      update: {},
      create: { id: 'zone_east_shewa_01', nameEn: 'East Shewa', nameAm: 'ምስራቅ ሸዋ', regionId: 'reg_oromia_01' },
    });
    await prisma.woreda.upsert({
      where: { id: 'woreda_adama_01' },
      update: {},
      create: { id: 'woreda_adama_01', nameEn: 'Adama Zuria', nameAm: 'አዳማ ዙሪያ', zoneId: 'zone_east_shewa_01', centerLat: 8.54, centerLng: 39.27 },
    });
    await prisma.user.upsert({
      where: { id: 'usr_farmer_01' },
      update: { woredaId: 'woreda_adama_01' },
      create: {
        id: 'usr_farmer_01',
        phoneNumber: '+251911223344',
        fullName: 'Test Farmer',
        role: 'FARMER',
        woredaId: 'woreda_adama_01',
      },
    });
    await prisma.user.upsert({
      where: { id: 'usr_officer_01' },
      update: { woredaId: 'woreda_adama_01' },
      create: {
        id: 'usr_officer_01',
        phoneNumber: '+251911998877',
        fullName: 'Test Officer',
        role: 'WOREDA_OFFICER',
        woredaId: 'woreda_adama_01',
      },
    });
    await prisma.farm.upsert({
      where: { id: 'farm_disease_test_01' },
      update: { userId: 'usr_farmer_01' },
      create: {
        id: 'farm_disease_test_01',
        userId: 'usr_farmer_01',
        woredaId: 'woreda_adama_01',
        farmName: 'Disease Diagnosis Test Farm',
        latitude: 8.54,
        longitude: 39.27,
      },
    });
  });

  const officerUser = {
    id: 'usr_officer_01',
    phoneNumber: '+251911998877',
    role: 'WOREDA_OFFICER',
    woredaId: 'woreda_adama_01',
  };
  const officerToken = generateAccessToken(officerUser);

  const farmerUser = {
    id: 'usr_farmer_01',
    phoneNumber: '+251911223344',
    role: 'FARMER',
    woredaId: 'woreda_adama_01',
  };
  const farmerToken = generateAccessToken(farmerUser);

  describe('Alerts Module', () => {
    it('POST /api/v1/alerts - should create and dispatch an early warning alert (Woreda Officer)', async () => {
      const res = await request(app)
        .post('/api/v1/alerts')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          woredaId: 'woreda_adama_01',
          woredaName: 'Adama Zuria',
          hazardType: 'DROUGHT',
          severity: 'HIGH',
          titleEn: 'Severe Drought Early Warning',
          titleAm: 'የከፋ የድርቅ ማስጠንቀቂያ',
          messageEn: 'Prepare supplemental irrigation.',
          messageAm: 'ተጨማሪ መስኖ ያዘጋጁ።',
          targetPhones: ['+251911223344'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.hazardType).toBe('DROUGHT');
    });

    it('GET /api/v1/alerts - should list active early warnings', async () => {
      const res = await request(app)
        .get('/api/v1/alerts?severity=HIGH')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Disease Diagnosis Module', () => {
    it('POST /api/v1/disease-diagnosis/diagnose - should analyze crop image from JSON URL', async () => {
      const res = await request(app)
        .post('/api/v1/disease-diagnosis/diagnose')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({
          farmId: 'farm_disease_test_01',
          cropType: 'Wheat',
          imageUrl: 'https://storage.agrietech.et/photos/wheat_rust_sample.jpg',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diseaseName).toBeDefined();
      expect(res.body.data.confidenceScore).toBeGreaterThan(0.8);
      expect(res.body.data.treatmentEn).toBeDefined();
      expect(res.body.data.treatmentAm).toBeDefined();
    }, 120000);

    it('POST /api/v1/disease-diagnosis/diagnose - should handle multipart camera photo / file upload', async () => {
      const fakeImageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

      const res = await request(app)
        .post('/api/v1/disease-diagnosis/diagnose')
        .set('Authorization', `Bearer ${farmerToken}`)
        .field('farmId', 'farm_disease_test_01')
        .field('cropType', 'MAIZE')
        .attach('image', fakeImageBuffer, 'camera_leaf_snap.jpg');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cropIdentified).toBe('Maize (Zea mays)');
      expect(res.body.data.diseaseName).toBeDefined();
      expect(res.body.data.imageUrl).toMatch(/(?:\/uploads\/diagnoses\/|supabase\.co)/);
    }, 120000);

    it('GET /api/v1/disease-diagnosis/farm/:farmId - should retrieve farm diagnosis history', async () => {
      const res = await request(app)
        .get('/api/v1/disease-diagnosis/farm/farm_disease_test_01')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
