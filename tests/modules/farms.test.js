const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');
const { prisma, connectDB } = require('../../src/config/db');

describe('Farms Module API Suite', () => {
  const user = { id: 'usr_farm_test_farmer_01', phoneNumber: '+251911887766', role: 'FARMER' };
  const token = generateAccessToken(user);
  let createdFarmId = '';
  let testWoreda = null;

  beforeAll(async () => {
    await connectDB();
    // Ensure region, zone, woreda exist
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
    testWoreda = await prisma.woreda.upsert({
      where: { id: 'woreda_adama_01' },
      update: {},
      create: { id: 'woreda_adama_01', nameEn: 'Adama Zuria', nameAm: 'አዳማ ዙሪያ', zoneId: 'zone_east_shewa_01', centerLat: 8.54, centerLng: 39.27 },
    });

    // Ensure test user exists for foreign key constraint
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: 'Test Farm Farmer',
        role: 'FARMER',
      },
    }).catch(() => {});
  });

  afterAll(async () => {
    if (createdFarmId) {
      await prisma.farm.deleteMany({ where: { id: createdFarmId } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
  });

  it('POST /api/v1/farms - should register a farm plot with valid coordinates and polygon', async () => {
    const lat = testWoreda?.centerLat || 8.7496;
    const lng = testWoreda?.centerLng || 38.9762;
    const offset = 0.002;

    const res = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        farmName: 'Bishoftu Wheat Plot Alpha',
        primaryCrop: 'Wheat',
        areaHectares: 3.5,
        latitude: lat,
        longitude: lng,
        woredaId: testWoreda?.id || 'ET040709',
        polygonGeojson: {
          type: 'Polygon',
          coordinates: [
            [
              [lng - offset, lat - offset],
              [lng + offset, lat - offset],
              [lng + offset, lat + offset],
              [lng - offset, lat + offset],
              [lng - offset, lat - offset],
            ],
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.farmName).toBe('Bishoftu Wheat Plot Alpha');

    createdFarmId = res.body.data.id;
  });

  it('POST /api/v1/farms - should reject coordinates outside Ethiopia (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        farmName: 'Invalid Farm Out of Country',
        latitude: 51.5074, // London coordinates
        longitude: -0.1278,
        polygonGeojson: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.13, 51.50],
              [-0.12, 51.50],
              [-0.12, 51.51],
              [-0.13, 51.51],
              [-0.13, 51.50],
            ],
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/farms - should reject farm registration by non-farmer roles (403 Forbidden)', async () => {
    const daUser = { id: 'usr_da_test_01', phoneNumber: '+251911990011', role: 'DEVELOPMENT_AGENT' };
    const daToken = generateAccessToken(daUser);

    const res = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${daToken}`)
      .send({
        farmName: 'DA Unauthorized Farm Plot',
        polygonGeojson: {
          type: 'Polygon',
          coordinates: [
            [
              [39.26, 8.53],
              [39.28, 8.53],
              [39.28, 8.55],
              [39.26, 8.55],
              [39.26, 8.53],
            ],
          ],
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/farms - should list plots belonging to the authenticated user', async () => {
    const res = await request(app).get('/api/v1/farms').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/farms/:id - should get farm details by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/farms/${createdFarmId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.farmName).toBe('Bishoftu Wheat Plot Alpha');
  });
});
