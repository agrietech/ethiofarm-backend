const jwt = require('jsonwebtoken');
const app = require('../src/app');
const request = require('supertest');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { disconnectRedis } = require('../src/config/redis');

const targetUrl = process.env.TARGET_URL;
const testSecret = env.E2E_TEST_SECRET || process.env.E2E_TEST_SECRET || 'agrietech_e2e_test_secret';

const testToken = jwt.sign(
  { id: 'usr_test_farmer_01', email: 'farmer@agrietech.et', role: 'ADMIN' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

async function warmupRemoteInstance(url) {
  console.log(`[Warmup] Pinging ${url}/health/liveness to wake up Render container (handling cold starts)...`);
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const ping = await request(url).get('/health/liveness');
      if (ping.status === 200) {
        console.log(`[Warmup] Instance is awake and healthy (attempt ${attempt})!\n`);
        return true;
      }
    } catch (_err) {
      // Waiting on sleep/spin-up
    }
    console.log(`[Warmup] Service waking up... (${attempt}/15 - sleeping 5s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.warn('[Warmup] Timed out waiting for 200 response, proceeding with test suite anyway...\n');
  return false;
}

async function testSuite() {
  console.log('====================================================');
  console.log('       AGRIETECH FULL SYSTEM SERVICE SMOKE TEST');
  console.log('====================================================');
  if (targetUrl) {
    console.log(` Target Environment: DEPLOYED (${targetUrl})`);
    await warmupRemoteInstance(targetUrl);
  } else {
    console.log(' Target Environment: LOCAL IN-PROCESS');
    await connectDB();
  }
  console.log('====================================================\n');

  const requester = targetUrl ? request(targetUrl) : request(app);

  const tests = [
    { name: 'Root API Metadata', method: 'get', url: '/' },
    { name: 'Liveness Healthcheck', method: 'get', url: '/health/liveness' },
    { name: 'Comprehensive Healthcheck', method: 'get', url: '/health' },
    { name: 'Admin Dashboard HTML', method: 'get', url: '/admin/dashboard' },
    { name: 'Admin Overview API', method: 'get', url: '/api/v1/admin/overview', auth: true },
    { name: 'Admin System Health API', method: 'get', url: '/api/v1/admin/system/health', auth: true },
    { name: 'Boundaries Regions', method: 'get', url: '/api/v1/boundaries/regions' },
    { name: 'Boundaries Zones', method: 'get', url: '/api/v1/boundaries/zones' },
    { name: 'Boundaries Woredas', method: 'get', url: '/api/v1/boundaries/woredas' },
    { name: 'Boundaries Woreda Detail', method: 'get', url: '/api/v1/boundaries/woredas/ET040101' },
    { name: 'Analytics Dashboard Summary', method: 'get', url: '/api/v1/analytics/summary', auth: true },
    { name: 'Analytics Regional Breakdown', method: 'get', url: '/api/v1/analytics/regional', auth: true },
    { name: 'Analytics Temporal Trends', method: 'get', url: '/api/v1/analytics/temporal-trends', auth: true },
    { name: 'Analytics Agronomic Advisories', method: 'get', url: '/api/v1/analytics/agronomic-advisories', auth: true },
    { name: 'AI Voice Query (Bilingual)', method: 'post', url: '/api/v1/ai/voice-inquiry', auth: true, body: { textQuestion: 'What is the rain forecast for Adama?' } },
    { name: 'AI Text-to-Speech (Amharic)', method: 'post', url: '/api/v1/ai/text-to-speech', auth: true, body: { text: 'ሰላም ገበሬዎች', language: 'am' } },
    { name: 'Auth Validation Trap (Empty Login)', method: 'post', url: '/api/v1/auth/login', body: {} },
    { name: 'Auth Register Validation (Empty Body)', method: 'post', url: '/api/v1/auth/register', body: {} },
    { name: '404 Catch-All Handler', method: 'get', url: '/api/v1/invalid-route-test' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      let req = requester[t.method](t.url).timeout({ response: 60000, deadline: 75000 });
      req = req.set('x-e2e-test-key', testSecret);
      if (t.auth) {
        req = req.set('Authorization', `Bearer ${testToken}`);
      }
      if (t.body) {
        req = req.send(t.body);
      }
      const res = await req;

      const isSuccess = (t.name.includes('404') && res.status === 404) ||
                        (t.name.includes('Validation') && (res.status === 400 || res.status === 422)) ||
                        (res.status >= 200 && res.status < 400) ||
                        (t.name.includes('Healthcheck') && (res.status === 200 || res.status === 503));

      if (isSuccess) {
        console.log(`✅ PASS [HTTP ${res.status}]: ${t.name} (${t.url})`);
        passed++;
      } else {
        console.log(`❌ FAIL [HTTP ${res.status}]: ${t.name} (${t.url})`, res.body);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ERROR: ${t.name} (${t.url}): ${err.message}`);
      failed++;
    }
  }

  console.log('\n====================================================');
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');
  if (!targetUrl) {
    await disconnectDB();
    await disconnectRedis();
  }
  process.exit(failed > 0 ? 1 : 0);
}

testSuite();
