const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');

describe('Analytics Module API Suite', () => {
  const researcherUser = {
    id: 'usr_researcher_01',
    phoneNumber: '+251911334455',
    role: 'RESEARCHER',
  };
  const token = generateAccessToken(researcherUser);

  it('GET /api/v1/analytics/dashboard - should return national early warning overview metrics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalFarmsRegistered).toBeDefined();
    expect(res.body.data.nationalBelgSeasonVigor).toBeDefined();
    expect(res.body.data.compositeRiskDistribution).toBeDefined();
  }, 90000);

  it('GET /api/v1/analytics/regional-breakdown - should return region-by-region hazard and rainfall metrics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/regional-breakdown')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].region).toBeDefined();
    expect(res.body.data[0].avgRainfallMm).toBeDefined();
  }, 90000);

  it('GET /api/v1/analytics/temporal-trends - should return multi-horizon trends (DAILY, MONTHLY, YEARLY, OVER_YEARS)', async () => {
    // 1. Daily
    const resDaily = await request(app)
      .get('/api/v1/analytics/temporal-trends?timeframe=DAILY&woredaId=woreda_adama_01')
      .set('Authorization', `Bearer ${token}`);

    expect(resDaily.status).toBe(200);
    expect(resDaily.body.success).toBe(true);
    expect(resDaily.body.data.timeframe).toBe('DAILY');
    expect(resDaily.body.data.metrics.length).toBeGreaterThan(0);

    // 2. Monthly
    const resMonthly = await request(app)
      .get('/api/v1/analytics/temporal-trends?timeframe=MONTHLY&woredaId=woreda_adama_01')
      .set('Authorization', `Bearer ${token}`);

    expect(resMonthly.status).toBe(200);
    expect(resMonthly.body.data.timeframe).toBe('MONTHLY');
    expect(resMonthly.body.data.summary.currentSpiStatus).toBeDefined();

    // 3. Yearly & Decadal Multi-Year
    const resMultiYear = await request(app)
      .get('/api/v1/analytics/temporal-trends?timeframe=OVER_YEARS&woredaId=woreda_adama_01')
      .set('Authorization', `Bearer ${token}`);

    expect(resMultiYear.status).toBe(200);
    expect(resMultiYear.body.data.timeframe).toBe('OVER_YEARS');
    expect(resMultiYear.body.data.decadalShifts).toBeDefined();
  }, 90000);

  it('GET /api/v1/analytics/agronomic-advisories - should return multilingual actionable recommendations', async () => {
    const res = await request(app)
      .get(
        '/api/v1/analytics/agronomic-advisories?cropType=WHEAT&season=MEHER&woredaId=woreda_adama_01'
      )
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.advisories.length).toBeGreaterThan(0);
    expect(res.body.data.advisories[0].titleAm).toBeDefined();
    expect(res.body.data.advisories[0].titleOm).toBeDefined();
    expect(res.body.data.advisories[0].actionEn).toBeDefined();
  }, 90000);
});
