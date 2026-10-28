const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');

describe('AI Graph & Time-Series Analytics Suite (Gemini 2.5 Flash)', () => {
  let authToken = '';

  beforeAll(() => {
    authToken = generateAccessToken({
      id: 'usr_test_analyst_01',
      role: 'RESEARCHER',
      woredaId: 'woreda_adama_01',
    });
  });

  it('should generate bilingual AI graph insights via POST /api/v1/analytics/ai-insights', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/ai-insights')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        woredaId: 'woreda_adama_01',
        timeframe: 'DAILY',
        language: 'am',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.aiInsights).toBeDefined();
    expect(res.body.data.aiInsights.trendSummary.am).toBeDefined();
    expect(res.body.data.aiInsights.trendSummary.en).toBeDefined();
    expect(res.body.data.aiInsights.droughtRiskStatus).toBeDefined();
    expect(res.body.data.aiInsights.actionableGuidance.am.length).toBeGreaterThan(0);
  }, 120000);

  it('should include AI insights when temporal-trends is called with includeAi=true', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/temporal-trends?includeAi=true&woredaId=woreda_adama_01')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.aiInsights).toBeDefined();
    expect(res.body.data.aiInsights.trendSummary).toBeDefined();
  }, 120000);
});
