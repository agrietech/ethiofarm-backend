const request = require('supertest');
const app = require('../../src/app');

describe('Core Backend - Health & Resilience Probes Suite', () => {
  describe('GET /health', () => {
    it('should return 200 with comprehensive service status and memory metrics', async () => {
      const res = await request(app).get('/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toMatch(/EthioFarm|AgriEtech/);
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(res.body.system).toBeDefined();
      expect(res.body.system.memoryUsageMb).toBeDefined();
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.database).toBeDefined();
    });

    it('should also respond at /api/v1/health alias', async () => {
      const res = await request(app).get('/api/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toMatch(/EthioFarm|AgriEtech/);
      expect(res.body.dependencies).toBeDefined();
    });
  });

  describe('GET /health/liveness', () => {
    it('should return 200 LIVE for container orchestration', async () => {
      const res = await request(app).get('/health/liveness');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('LIVE');
    });
  });

  describe('GET /health/readiness', () => {
    it('should return readiness state probe', async () => {
      const res = await request(app).get('/health/readiness');

      expect([200, 503]).toContain(res.status);
      expect(res.body.database).toBeDefined();
    });
  });

  describe('GET / (Gateway Metadata)', () => {
    it('should return API gateway metadata with correlation ID header', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.project).toMatch(/EthioFarm|AgriEtech/);
      expect(res.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Catch-all 404 Route Handler', () => {
    it('should return standardized 404 NOT_FOUND for non-existent paths', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
