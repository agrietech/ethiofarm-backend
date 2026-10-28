const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');

describe('AI Voice & Speech Processing Suite (Amharic & English)', () => {
  let authToken = '';

  beforeAll(() => {
    authToken = generateAccessToken({
      id: 'usr_test_farmer_02',
      role: 'FARMER',
      woredaId: 'woreda_adama_01',
    });
  });

  it('should process farmer voice inquiry in Amharic and return bilingual spoken response', async () => {
    const res = await request(app)
      .post('/api/v1/ai/voice-inquiry')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        userQuestion: 'የስንዴ ቅጠል ቢጫ ሆኗል ምን ላድርግ?',
        language: 'am',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transcription).toBeDefined();
    expect(res.body.responseAm).toBeDefined();
    expect(res.body.responseEn).toBeDefined();
    expect(res.body.audioSynthesis).toBeDefined();
    expect(res.body.audioSynthesis.voiceAmharic).toBeDefined();
  }, 90000);

  it('should process farmer voice inquiry in English', async () => {
    const res = await request(app)
      .post('/api/v1/ai/voice-inquiry')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        userQuestion: 'How can I prevent armyworm from attacking my maize?',
        language: 'en',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.responseEn).toBeDefined();
    expect(res.body.responseAm).toBeDefined();
  }, 90000);

  it('should generate text-to-speech audio metadata for Amharic text', async () => {
    const res = await request(app)
      .post('/api/v1/ai/text-to-speech')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        text: 'የአፈር እርጥበትን ለመጠበቅ በእርሻው ላይ ሙልጭ ይሸፍኑ።',
        language: 'am',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('am-ET');
    expect(res.body.voice).toContain('am-ET');
  });
});
