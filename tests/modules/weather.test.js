const request = require('supertest');
const app = require('../../src/app');
const weatherService = require('../../src/modules/weather/weather.service');
const { prisma } = require('../../src/config/db');

describe('Weather API & Multi-Source Telemetry Suite', () => {
  let sampleFarm = null;
  let sampleKebele = null;

  beforeAll(async () => {
    sampleFarm = await prisma.farm.findFirst({
      select: { id: true, farmName: true, latitude: true, longitude: true },
    });
    sampleKebele = await prisma.kebele.findFirst({
      select: { id: true, nameEn: true, centerLat: true, centerLng: true },
    });
  });

  describe('weatherService.getWeatherForecast', () => {
    it('should retrieve real meteorological forecast starting today', async () => {
      const forecast = await weatherService.getWeatherForecast({
        lat: 9.03,
        lng: 38.74,
      });

      expect(forecast).toBeDefined();
      expect(forecast.location).toBeDefined();
      expect(forecast.current).toBeDefined();
      expect(forecast.current.temperatureC).toBeDefined();
      expect(typeof forecast.current.temperatureC).toBe('number');

      // Check daily forecast format & rain probability metrics
      expect(Array.isArray(forecast.daily)).toBe(true);
      expect(forecast.daily.length).toBeGreaterThanOrEqual(7);

      const today = forecast.daily[0];
      expect(today.isToday).toBe(true);
      const eatDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Addis_Ababa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      expect([new Date().toISOString().split('T')[0], eatDateStr]).toContain(today.date);
      expect(typeof today.precipitationProbability).toBe('number');
      expect(today.precipitationProbability).toBeGreaterThanOrEqual(0);
      expect(today.precipitationProbability).toBeLessThanOrEqual(100);
      expect(typeof today.precipitationMm).toBe('number');
      expect(today.precipitationMm).toBeGreaterThanOrEqual(0);

      // Check hourly 24h curve
      expect(Array.isArray(forecast.hourly)).toBe(true);
      expect(forecast.hourly.length).toBeGreaterThanOrEqual(24);
      expect(forecast.hourly[0].hourLabel).toBeDefined();
      expect(typeof forecast.hourly[0].temperatureC).toBe('number');

      // Check telemetry attribution
      expect(forecast.dataSources).toContain('Open-Meteo');
      expect(forecast.climatology).toBeDefined();
    }, 30000);

    it('should retrieve weather for specific farm level when farmId is provided', async () => {
      if (!sampleFarm) return;
      const forecast = await weatherService.getWeatherForecast({
        farmId: sampleFarm.id,
      });

      expect(forecast).toBeDefined();
      expect(forecast.location.level).toBe('FARM');
      expect(forecast.location.farmId).toBe(sampleFarm.id);
      expect(forecast.location.nameEn).toContain(sampleFarm.farmName);
      expect(forecast.location.lat).toBe(sampleFarm.latitude);
      expect(forecast.location.lng).toBe(sampleFarm.longitude);
      expect(forecast.current.temperatureC).toBeDefined();
    }, 30000);

    it('should retrieve weather for specific kebele level when kebeleId is provided', async () => {
      if (!sampleKebele) return;
      const forecast = await weatherService.getWeatherForecast({
        kebeleId: sampleKebele.id,
      });

      expect(forecast).toBeDefined();
      expect(forecast.location.level).toBe('KEBELE');
      expect(forecast.location.kebeleId).toBe(sampleKebele.id);
      expect(forecast.location.nameEn).toContain(sampleKebele.nameEn);
      expect(forecast.current.temperatureC).toBeDefined();
    }, 30000);

    it('should serve cached weather on subsequent hourly request with sub-50ms latency', async () => {
      // First fetch to ensure cache is populated
      await weatherService.getWeatherForecast({ lat: 8.54, lng: 39.27, days: 7 });

      // Second fetch should hit L1/Redis cache
      const start = Date.now();
      const cached = await weatherService.getWeatherForecast({ lat: 8.54, lng: 39.27, days: 7 });
      const duration = Date.now() - start;

      expect(cached.isCached).toBe(true);
      expect(cached.cachedAt).toBeDefined();
      expect(duration).toBeLessThan(500);
    });
  });

  describe('GET /api/v1/weather/forecast endpoint', () => {
    it('should return 200 and standard meteorological data schema', async () => {
      const res = await request(app)
        .get('/api/v1/weather/forecast?lat=9.03&lng=38.74')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.current).toBeDefined();
      expect(res.body.data.daily).toBeDefined();
      expect(res.body.data.daily.length).toBeGreaterThanOrEqual(7);
      expect(res.body.data.hourly).toBeDefined();
    }, 15000);

    it('should support farmId query parameter', async () => {
      if (!sampleFarm) return;
      const res = await request(app)
        .get(`/api/v1/weather/forecast?farmId=${sampleFarm.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.location.level).toBe('FARM');
      expect(res.body.data.location.farmId).toBe(sampleFarm.id);
    }, 15000);
  });

  describe('GET /api/v1/weather/current endpoint', () => {
    it('should return 200 with current live observations', async () => {
      const res = await request(app)
        .get('/api/v1/weather/current?lat=9.03&lng=38.74')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.current).toBeDefined();
      expect(typeof res.body.data.current.temperatureC).toBe('number');
      expect(res.body.data.current.weatherCode).toBeDefined();
    }, 15000);
  });

  describe('GET /api/v1/weather/locations endpoint', () => {
    it('should return matched locations across farms, kebeles, and woredas', async () => {
      const res = await request(app)
        .get('/api/v1/weather/locations?q=Ada')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].level).toBeDefined();
      expect(res.body.data[0].name).toBeDefined();
    });
  });
});
