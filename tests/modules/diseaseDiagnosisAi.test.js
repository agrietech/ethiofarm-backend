const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');

describe('Dual-AI Crop Disease Diagnosis Suite (Plant.id + Gemini 2.5 Flash)', () => {
  let authToken = '';

  beforeAll(() => {
    authToken = generateAccessToken({
      id: 'usr_test_farmer_01',
      role: 'FARMER',
      woredaId: 'woreda_adama_01',
    });
  });

  it('should diagnose a crop image using Plant.id + Gemini 2.5 Flash and return bilingual Amharic & English treatment', async () => {
    const res = await request(app)
      .post('/api/v1/disease-diagnosis/diagnose')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        cropType: 'Wheat',
        imageUrl: 'https://images.unsplash.com/photo-wheat-rust.jpg',
        language: 'am',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const diag = res.body.data;
    expect(diag.cropIdentified).toBeDefined();
    expect(diag.diseaseName).toBeDefined();
    expect(diag.diseaseNameAm).toBeDefined();
    expect(diag.severity).toBeDefined();
    expect(diag.confidenceScore).toBeGreaterThan(0.7);
    expect(diag.treatmentEn).toBeDefined();
    expect(diag.treatmentAm).toBeDefined();
    expect(diag.symptomsAm).toBeDefined();
    expect(diag.preventionAm).toBeDefined();
    expect(diag.aiModel).toContain('Gemini');
  }, 90000);

  it('should retrieve all historical diagnoses', async () => {
    const res = await request(app)
      .get('/api/v1/disease-diagnosis')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
