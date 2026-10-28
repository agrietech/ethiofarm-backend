const request = require('supertest');
const app = require('../../src/app');

describe('USSD Delivery Gateway Suite', () => {
  it('should return initial menu on empty text input', async () => {
    const res = await request(app).post('/api/v1/delivery/ussd').send({
      sessionId: 'test-session-01',
      phoneNumber: '+251911223344',
      text: '',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('CON');
    expect(res.text).toContain('(*212#)');
  });

  it('should return weather information when 1 is selected', async () => {
    const res = await request(app).post('/api/v1/delivery/ussd').send({
      sessionId: 'test-session-01',
      phoneNumber: '+251911223344',
      text: '1',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('END');
  });

  it('should return drought status when 2 is selected', async () => {
    const res = await request(app).post('/api/v1/delivery/ussd').send({
      sessionId: 'test-session-01',
      phoneNumber: '+251911223344',
      text: '2',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('END');
  });

  it('should support SMSEthiopia and Ethiopian telco payload aliases (msisdn, session_id, input)', async () => {
    const res = await request(app).post('/api/v1/delivery/ussd').send({
      session_id: 'smsethiopia-sess-99',
      msisdn: '251911223344',
      input: '',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('CON');
  });

  it('should support JSON content negotiation for USSD gateways requesting application/json', async () => {
    const res = await request(app)
      .post('/api/v1/delivery/ussd')
      .set('Accept', 'application/json')
      .send({
        sessionId: 'json-test-01',
        phoneNumber: '0911223344',
        text: '1',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('response');
    expect(res.body.shouldClose).toBe(true);
  }, 60000);
});
