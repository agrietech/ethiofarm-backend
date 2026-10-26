const request = require('supertest');
const app = require('../../src/app');

describe('Admin Module & Operations Suite', () => {
  beforeAll(async () => {
    const { prisma } = require('../../src/config/db');
    await prisma.user.upsert({
      where: { id: 'usr_farmer_01' },
      update: {},
      create: {
        id: 'usr_farmer_01',
        phoneNumber: '+251911999999',
        fullName: 'Test Farmer',
        role: 'FARMER',
        isEmailVerified: false,
      },
    });
  });
  it('GET /api/v1/admin/overview - should return system-wide KPI metrics and status', async () => {
    const res = await request(app).get('/api/v1/admin/overview');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.totalUsers).toBeGreaterThan(0);
    expect(res.body.data.metrics.roleDistribution).toBeDefined();
    expect(res.body.data.system.status).toBe('OPERATIONAL');
  });

  it('GET /api/v1/admin/users - should return paginated users list', async () => {
    const res = await request(app).get('/api/v1/admin/users?page=1&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.page).toBe(1);
  });

  it('PATCH /api/v1/admin/users/:id/role - should update user role', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/usr_farmer_01/role')
      .send({ role: 'DEVELOPMENT_AGENT' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('DEVELOPMENT_AGENT');
  });

  it('PATCH /api/v1/admin/users/:id/role - should reject invalid role', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/usr_farmer_01/role')
      .send({ role: 'SUPER_HERO' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/v1/admin/users/:id/status - should update user verification status', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/usr_farmer_01/status')
      .send({ isEmailVerified: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isEmailVerified).toBe(true);
  });

  it('GET /api/v1/admin/system/health - should return deep diagnostics', async () => {
    const res = await request(app).get('/api/v1/admin/system/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subsystems).toBeDefined();
    expect(res.body.data.subsystems.database).toBeDefined();
    expect(res.body.data.subsystems.jobQueue).toBeDefined();
    expect(res.body.data.subsystems.memory).toBeDefined();
  });

  it('POST /api/v1/admin/ingestion/trigger - should schedule manual ingestion job', async () => {
    const res = await request(app)
      .post('/api/v1/admin/ingestion/trigger')
      .send({ jobType: 'pullChirpsRainfall' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.jobType).toBe('pullChirpsRainfall');
  });

  it('GET /api/v1/admin/farmers/audience - should return audience reach metrics for target woreda', async () => {
    const res = await request(app).get('/api/v1/admin/farmers/audience?woredaId=woreda_adama_01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalSignedUpFarmers).toBeDefined();
    expect(res.body.data.phoneReachableFarmers).toBeDefined();
    expect(res.body.data.reachabilityPercentage).toBeDefined();
    expect(Array.isArray(res.body.data.cropDistribution)).toBe(true);
  });

  it('POST /api/v1/admin/broadcast-alert - should dispatch emergency alert with USSD and SMS channels', async () => {
    const res = await request(app)
      .post('/api/v1/admin/broadcast-alert')
      .send({
        woredaId: 'woreda_adama_01',
        hazardType: 'FLOOD',
        severity: 'CRITICAL',
        titleEn: 'Flash Flood Warning - Awash Basin',
        titleAm: 'የአዋሽ ተፋሰስ የጎርፍ አደጋ ማስጠንቀቂያ',
        messageEn: 'Severe upstream discharge observed. Relocate livestock from riverbanks.',
        messageAm: 'ከፍተኛ የጎርፍ መጠን ስለታየ ከወንዝ ዳርቻ እንስሳትን ያርቁ።',
        sendSms: true,
        sendUssd: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.titleEn).toContain('Flash Flood Warning');
    expect(res.body.data.channels).toBeDefined();
    expect(res.body.data.channels).toContain('USSD (*212#)');
    expect(res.body.data.channels).toContain('SMS');
    expect(res.body.data.recipientsCount).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/v1/admin/audit-logs - should return audit trail entries', async () => {
    const res = await request(app).get('/api/v1/admin/audit-logs?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /admin/dashboard - should render interactive HTML admin dashboard', async () => {
    const res = await request(app).get('/admin/dashboard');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toMatch(/(?:EthioFarm|AgriEtech) \| Enterprise Admin/);
    expect(res.text).toContain('API & Services Sentinel');
  });

  it('GET /api/v1/admin/services-registry - should return full microservices health matrix, host telemetry, env audit, and API catalog', async () => {
    const res = await request(app).get('/api/v1/admin/services-registry');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.totalServices).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(res.body.data.services)).toBe(true);
    expect(res.body.data.hostTelemetry).toBeDefined();
    expect(res.body.data.hostTelemetry.memory).toBeDefined();
    expect(Array.isArray(res.body.data.environmentAudit)).toBe(true);
    expect(Array.isArray(res.body.data.apiRouteCatalog)).toBe(true);

    // Verify key external services are present in the matrix
    const serviceIds = res.body.data.services.map(s => s.id);
    expect(serviceIds).toContain('postgresql_postgis');
    expect(serviceIds).toContain('open_meteo_weather');
    expect(serviceIds).toContain('chirps_satellite_rainfall');
    expect(serviceIds).toContain('nasa_power_climatology');
    expect(serviceIds).toContain('openrouter_gemini_ai');
    expect(serviceIds).toContain('sms_ethiopia_gateway');
  });

  it('POST /api/v1/admin/services-registry/ping - should ping a specific microservice', async () => {
    const res = await request(app)
      .post('/api/v1/admin/services-registry/ping')
      .send({ serviceId: 'postgresql_postgis' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.serviceId).toBe('postgresql_postgis');
    expect(res.body.data.status).toBe('OPERATIONAL');
    expect(typeof res.body.data.latencyMs).toBe('number');
  });

  it('POST /api/v1/admin/services-registry/action - should execute purgeCache, clearRateLimits, and sendTestNotification', async () => {
    // 1. Purge Cache
    const purgeRes = await request(app)
      .post('/api/v1/admin/services-registry/action')
      .send({ action: 'purgeCache' });
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.success).toBe(true);

    // 2. Clear Rate Limits
    const limitRes = await request(app)
      .post('/api/v1/admin/services-registry/action')
      .send({ action: 'clearRateLimits' });
    expect(limitRes.status).toBe(200);
    expect(limitRes.body.success).toBe(true);

    // 3. Test Notification
    const notifRes = await request(app)
      .post('/api/v1/admin/services-registry/action')
      .send({
        action: 'sendTestNotification',
        payload: { channel: 'SMS', recipient: '+251911223344' }
      });
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.success).toBe(true);
  });
});
