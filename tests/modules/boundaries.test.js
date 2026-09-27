const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');
const { prisma } = require('../../src/config/db');

describe('Boundaries Module API Suite', () => {
  const daUser = {
    id: 'usr_da_bnd_test_01',
    phoneNumber: '+251922001122',
    role: 'DEVELOPMENT_AGENT',
    woredaId: 'woreda_adama_01',
    kebeleId: 'kebele_adama_01',
  };
  const farmerUser = {
    id: 'usr_farmer_bnd_test_01',
    phoneNumber: '+251911002233',
    role: 'FARMER',
  };

  const daToken = generateAccessToken(daUser);
  const farmerToken = generateAccessToken(farmerUser);

  beforeAll(async () => {
    await prisma.region.upsert({
      where: { id: 'reg_oromia_01' },
      update: {},
      create: {
        id: 'reg_oromia_01',
        nameEn: 'Oromia',
        nameAm: 'ኦሮሚያ',
        code: 'ET-OR',
      },
    });

    await prisma.zone.upsert({
      where: { id: 'zone_east_shewa_01' },
      update: {},
      create: {
        id: 'zone_east_shewa_01',
        nameEn: 'East Shewa',
        nameAm: 'ምስራቅ ሸዋ',
        regionId: 'reg_oromia_01',
      },
    });

    await prisma.woreda.upsert({
      where: { id: 'woreda_adama_01' },
      update: {},
      create: {
        id: 'woreda_adama_01',
        nameEn: 'Adama Zuria',
        nameAm: 'አዳማ ዙሪያ',
        zoneId: 'zone_east_shewa_01',
        centerLat: 8.54,
        centerLng: 39.27,
      },
    });

    await prisma.kebele.upsert({
      where: { id: 'kebele_adama_01' },
      update: {},
      create: {
        id: 'kebele_adama_01',
        nameEn: 'Boku Shenen',
        nameAm: 'ቦቁ ሸነን',
        woredaId: 'woreda_adama_01',
        centerLat: 8.54,
        centerLng: 39.27,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [daUser.id, farmerUser.id] } },
    }).catch(() => {});
  });

  it('GET /api/v1/boundaries/regions - should return administrative regions list', async () => {
    const res = await request(app).get('/api/v1/boundaries/regions');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].nameEn).toBeDefined();
  });

  it('GET /api/v1/boundaries/woredas - should return list of woredas', async () => {
    const res = await request(app).get('/api/v1/boundaries/woredas?zoneId=zone_east_shewa_01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/boundaries/woredas/:id - should return woreda detail with centroid and boundary', async () => {
    const res = await request(app).get('/api/v1/boundaries/woredas/woreda_adama_01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nameEn).toBe('Adama Zuria');
    expect(res.body.data.centerLat).toBeDefined();
    expect(res.body.data.centerLng).toBeDefined();
  });

  it('PUT /api/v1/boundaries/kebeles/:id/polygon - should forbid non-DA/non-admin roles (e.g. Farmer)', async () => {
    const validPolygon = {
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
    };

    const res = await request(app)
      .put('/api/v1/boundaries/kebeles/kebele_adama_01/polygon')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ polygonGeojson: validPolygon });

    expect(res.status).toBe(403);
  });

  it('PUT /api/v1/boundaries/kebeles/:id/polygon - should allow Development Agent to update Kebele polygon', async () => {
    const validPolygon = {
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
    };

    const res = await request(app)
      .put('/api/v1/boundaries/kebeles/kebele_adama_01/polygon')
      .set('Authorization', `Bearer ${daToken}`)
      .send({ polygonGeojson: validPolygon });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('kebele_adama_01');
    expect(res.body.data.centerLat).toBeCloseTo(8.54, 1);
    expect(res.body.data.centerLng).toBeCloseTo(39.27, 1);
    expect(res.body.data.geojson).toBeDefined();
  });

  it('PUT /api/v1/boundaries/kebeles/:id/polygon - should reject unclosed or invalid polygon coordinates', async () => {
    const invalidPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [39.26, 8.53],
          [39.28, 8.53],
          [39.28, 8.55],
        ],
      ],
    };

    const res = await request(app)
      .put('/api/v1/boundaries/kebeles/kebele_adama_01/polygon')
      .set('Authorization', `Bearer ${daToken}`)
      .send({ polygonGeojson: invalidPolygon });

    expect(res.status).toBe(400);
  });
});
