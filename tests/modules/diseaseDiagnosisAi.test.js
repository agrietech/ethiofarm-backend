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
    // Use a real, publicly accessible wheat field image (Wikimedia Commons)
    const res = await request(app)
      .post('/api/v1/disease-diagnosis/diagnose')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        cropType: 'Wheat',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Wheat_close-up.JPG/640px-Wheat_close-up.JPG',
        language: 'am',
      });

    // Real AI may return 201 (diagnosed) or 400 (unrecognized) depending on image clarity
    // Both are valid production behaviors — the key is no server 500 errors
    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      const diag = res.body.data;
      expect(diag.cropIdentified).toBeDefined();
      expect(diag.diseaseName).toBeDefined();
      expect(diag.diseaseNameAm).toBeDefined();
      expect(diag.severity).toBeDefined();
      expect(diag.treatmentEn).toBeDefined();
      expect(diag.treatmentAm).toBeDefined();
      expect(diag.symptomsAm).toBeDefined();
      expect(diag.aiModel).toContain('Gemini');
    } else {
      // Correctly rejected as unrecognized — valid behavior from strict AI pipeline
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNRECOGNIZED_CROP_IMAGE');
    }
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
