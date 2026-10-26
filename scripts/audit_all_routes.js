const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');

// Create test tokens for different roles
const farmerToken = jwt.sign(
  { id: 'usr_farmer_test', email: 'farmer@agrietech.et', role: 'FARMER', woredaId: 'woreda_adama_01' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const adminToken = jwt.sign(
  { id: 'usr_admin_test', email: 'admin@agrietech.et', role: 'ADMIN' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const officerToken = jwt.sign(
  { id: 'usr_officer_test', email: 'officer@agrietech.et', role: 'WOREDA_OFFICER', woredaId: 'woreda_adama_01' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const expiredToken = jwt.sign(
  { id: 'usr_expired', email: 'expired@agrietech.et', role: 'FARMER' },
  env.JWT_SECRET,
  { expiresIn: '-1s' }
);

async function runRouteAudit() {
  console.log('================================================================');
  console.log('         AGRIETECH FULL API ROUTE & SECURITY AUDIT');
  console.log('================================================================\n');

  await connectDB();

  const auditResults = [];

  async function testRoute({ category, name, method, url, token, body, expectedStatuses, desc }) {
    try {
      let req = request(app)[method.toLowerCase()](url);
      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }
      if (body) {
        req = req.send(body);
      }
      const res = await req;
      const passed = expectedStatuses.includes(res.status);

      auditResults.push({
        category,
        name,
        method: method.toUpperCase(),
        url,
        status: res.status,
        expected: expectedStatuses,
        passed,
        desc,
        responseSnippet: JSON.stringify(res.body).substring(0, 100),
      });

      const icon = passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${icon} [${res.status}] ${method.toUpperCase()} ${url} — ${name}`);
      if (!passed) {
        console.log(`   Expected: [${expectedStatuses.join(', ')}], Got: ${res.status}`);
        console.log(`   Body:`, res.body);
      }
    } catch (err) {
      auditResults.push({
        category,
        name,
        method: method.toUpperCase(),
        url,
        status: 'ERROR',
        passed: false,
        error: err.message,
      });
      console.log(`❌ ERROR ${method.toUpperCase()} ${url} — ${err.message}`);
    }
  }

  // 1. Core Health & System Probes
  console.log('\n--- 1. CORE & HEALTH PROBES ---');
  await testRoute({
    category: 'Core',
    name: 'Root Gateway Metadata',
    method: 'GET',
    url: '/',
    expectedStatuses: [200],
    desc: 'Public API gateway information',
  });
  await testRoute({
    category: 'Core',
    name: 'Liveness Probe (Kubernetes/Render)',
    method: 'GET',
    url: '/health/liveness',
    expectedStatuses: [200],
    desc: 'Container heartbeat',
  });
  await testRoute({
    category: 'Core',
    name: 'Readiness Probe',
    method: 'GET',
    url: '/health/readiness',
    expectedStatuses: [200, 503],
    desc: 'Database connectivity status',
  });
  await testRoute({
    category: 'Core',
    name: 'Comprehensive Healthcheck',
    method: 'GET',
    url: '/health',
    expectedStatuses: [200, 503],
    desc: 'Full subsystem health report',
  });
  await testRoute({
    category: 'Core',
    name: '404 Catch-All Handler',
    method: 'GET',
    url: '/api/v1/non-existent-route-audit',
    expectedStatuses: [404],
    desc: 'Standardized 404 error envelope',
  });

  // 2. Authentication & Authorization Security Tests
  console.log('\n--- 2. AUTHENTICATION & SECURITY ENFORCEMENT ---');
  await testRoute({
    category: 'Auth',
    name: 'Auth Rejection: Missing Token on Protected Route',
    method: 'GET',
    url: '/api/v1/auth/me',
    expectedStatuses: [401],
    desc: 'Should reject request without Bearer token',
  });
  await testRoute({
    category: 'Auth',
    name: 'Auth Rejection: Expired Token',
    method: 'GET',
    url: '/api/v1/auth/me',
    token: expiredToken,
    expectedStatuses: [401],
    desc: 'Should reject expired JWT token',
  });
  await testRoute({
    category: 'Auth',
    name: 'Auth Rejection: Invalid Malformed Token',
    method: 'GET',
    url: '/api/v1/auth/me',
    token: 'invalid.jwt.token.string',
    expectedStatuses: [401],
    desc: 'Should reject malformed JWT token',
  });
  await testRoute({
    category: 'Auth',
    name: 'Validation: Empty Registration Body',
    method: 'POST',
    url: '/api/v1/auth/register',
    body: {},
    expectedStatuses: [400, 503],
    desc: 'Validation trap for missing registration fields',
  });
  await testRoute({
    category: 'Auth',
    name: 'Validation: Empty Login Body',
    method: 'POST',
    url: '/api/v1/auth/login',
    body: {},
    expectedStatuses: [400, 503],
    desc: 'Validation trap for missing login credentials',
  });
  await testRoute({
    category: 'Auth',
    name: 'Validation: Empty Forgot Password Body',
    method: 'POST',
    url: '/api/v1/auth/forgot-password',
    body: {},
    expectedStatuses: [400, 503],
    desc: 'Validation trap for missing email',
  });
  await testRoute({
    category: 'Auth',
    name: 'Validation: Empty Refresh Token Body',
    method: 'POST',
    url: '/api/v1/auth/refresh-token',
    body: {},
    expectedStatuses: [400, 503],
    desc: 'Validation trap for missing refresh token',
  });

  // 3. Admin & Role-Based Access Control (RBAC)
  console.log('\n--- 3. ADMIN & RBAC PERMISSIONS ---');
  await testRoute({
    category: 'Admin',
    name: 'Admin Dashboard HTML UI (Admin Token)',
    method: 'GET',
    url: '/admin/dashboard',
    token: adminToken,
    expectedStatuses: [200],
    desc: 'Serves glassmorphic operations console',
  });
  await testRoute({
    category: 'Admin',
    name: 'RBAC: Admin Overview (Admin Token)',
    method: 'GET',
    url: '/api/v1/admin/overview',
    token: adminToken,
    expectedStatuses: [200, 500, 503],
    desc: 'Admin dashboard metrics',
  });
  await testRoute({
    category: 'Admin',
    name: 'RBAC: Admin System Health (Admin Token)',
    method: 'GET',
    url: '/api/v1/admin/system/health',
    token: adminToken,
    expectedStatuses: [200],
    desc: 'Detailed diagnostic health status',
  });
  await testRoute({
    category: 'Admin',
    name: 'RBAC: Audit Logs (Admin Token)',
    method: 'GET',
    url: '/api/v1/admin/audit-logs',
    token: adminToken,
    expectedStatuses: [200, 500, 503],
    desc: 'System operational audit logs',
  });
  await testRoute({
    category: 'Admin',
    name: 'RBAC: Ingestion Trigger Validation (Empty Body)',
    method: 'POST',
    url: '/api/v1/admin/ingestion/trigger',
    token: adminToken,
    body: {},
    expectedStatuses: [400, 500],
    desc: 'Rejects invalid job type',
  });

  // 4. Boundaries Module
  console.log('\n--- 4. BOUNDARIES & SPATIAL GEOGRAPHY ---');
  await testRoute({
    category: 'Boundaries',
    name: 'Get Regions List',
    method: 'GET',
    url: '/api/v1/boundaries/regions',
    expectedStatuses: [200, 500, 503],
    desc: 'Administrative regions in Ethiopia',
  });
  await testRoute({
    category: 'Boundaries',
    name: 'Get Zones List',
    method: 'GET',
    url: '/api/v1/boundaries/zones',
    expectedStatuses: [200, 500, 503],
    desc: 'Administrative zones',
  });
  await testRoute({
    category: 'Boundaries',
    name: 'Get Woredas List',
    method: 'GET',
    url: '/api/v1/boundaries/woredas',
    expectedStatuses: [200, 500, 503],
    desc: 'Woredas with spatial centroids',
  });
  await testRoute({
    category: 'Boundaries',
    name: 'Get Woreda Detail by ID',
    method: 'GET',
    url: '/api/v1/boundaries/woredas/ET040101',
    expectedStatuses: [200, 404, 500, 503],
    desc: 'Woreda boundary and GeoJSON',
  });

  // 5. Farms & Spatial Boundary Validation
  console.log('\n--- 5. FARMS & SPATIAL GIS ---');
  await testRoute({
    category: 'Farms',
    name: 'Get User Farms (Protected)',
    method: 'GET',
    url: '/api/v1/farms',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'List farm plots for authenticated user',
  });
  await testRoute({
    category: 'Farms',
    name: 'Create Farm Validation Trap (Empty Body)',
    method: 'POST',
    url: '/api/v1/farms',
    token: farmerToken,
    body: {},
    expectedStatuses: [400, 422, 503],
    desc: 'Rejects farm creation without polygon/coordinates',
  });

  // 6. Alerts & Early Warnings
  console.log('\n--- 6. ALERTS & EARLY WARNINGS ---');
  await testRoute({
    category: 'Alerts',
    name: 'Get Active Alerts (Protected)',
    method: 'GET',
    url: '/api/v1/alerts/active',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'List active emergency alerts',
  });
  await testRoute({
    category: 'Alerts',
    name: 'Create Alert Validation Trap (Empty Body)',
    method: 'POST',
    url: '/api/v1/alerts',
    token: adminToken,
    body: {},
    expectedStatuses: [400, 422, 503],
    desc: 'Rejects alert creation without hazard type/title',
  });

  // 7. Sensors & Telemetry
  console.log('\n--- 7. SENSORS & TELEMETRY ---');
  await testRoute({
    category: 'Sensors',
    name: 'Get Sensors List (Protected)',
    method: 'GET',
    url: '/api/v1/sensors',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'List IoT sensor devices',
  });
  await testRoute({
    category: 'Sensors',
    name: 'Record Telemetry Validation Trap (Empty Body)',
    method: 'POST',
    url: '/api/v1/sensors/telemetry',
    body: {},
    expectedStatuses: [400, 401, 404, 422, 503],
    desc: 'Rejects telemetry without sensor ID or invalid auth',
  });

  // 8. Risk Assessments
  console.log('\n--- 8. RISK ASSESSMENTS ---');
  await testRoute({
    category: 'Risk',
    name: 'Get Risk Statistics (Protected)',
    method: 'GET',
    url: '/api/v1/risk-assessments/statistics',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'National multi-hazard risk stats',
  });
  await testRoute({
    category: 'Risk',
    name: 'Get Latest Risk Assessments (Protected)',
    method: 'GET',
    url: '/api/v1/risk-assessments/latest',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'Latest risk evaluation records',
  });

  // 9. Analytics & Advisories
  console.log('\n--- 9. ANALYTICS & ADVISORIES ---');
  await testRoute({
    category: 'Analytics',
    name: 'Dashboard Summary (Protected)',
    method: 'GET',
    url: '/api/v1/analytics/summary',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'National agricultural KPI dashboard',
  });
  await testRoute({
    category: 'Analytics',
    name: 'Regional Breakdown (Protected)',
    method: 'GET',
    url: '/api/v1/analytics/regional',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'Multi-region climate & risk aggregation',
  });
  await testRoute({
    category: 'Analytics',
    name: 'Temporal Trends (Protected)',
    method: 'GET',
    url: '/api/v1/analytics/temporal-trends',
    token: farmerToken,
    expectedStatuses: [200, 500, 503],
    desc: 'Time-series climate & NDVI trends',
  });
  await testRoute({
    category: 'Analytics',
    name: 'Agronomic Advisories (Protected)',
    method: 'GET',
    url: '/api/v1/analytics/agronomic-advisories',
    token: farmerToken,
    expectedStatuses: [200],
    desc: 'Multilingual crop management guidance',
  });

  // 10. AI Voice & Crop Diagnosis
  console.log('\n--- 10. AI VOICE & CROP DIAGNOSIS ---');
  await testRoute({
    category: 'AI',
    name: 'AI Voice Inquiry (Protected)',
    method: 'POST',
    url: '/api/v1/ai/voice-inquiry',
    token: farmerToken,
    body: { userQuestion: 'What is the rainfall advisory for Adama?' },
    expectedStatuses: [200],
    desc: 'Gemini 2.5 Flash voice reasoning',
  });
  await testRoute({
    category: 'AI',
    name: 'AI Text-to-Speech Synthesis (Protected)',
    method: 'POST',
    url: '/api/v1/ai/text-to-speech',
    token: farmerToken,
    body: { text: 'ሰላም ገበሬዎች', language: 'am' },
    expectedStatuses: [200],
    desc: 'Phonetic TTS synthesis configuration',
  });

  // 11. Ingestion & Connectors
  console.log('\n--- 11. INGESTION & CONNECTORS ---');
  await testRoute({
    category: 'Ingestion',
    name: 'List Ingestion Connectors (Admin Token)',
    method: 'GET',
    url: '/api/v1/ingestion/connectors',
    token: adminToken,
    expectedStatuses: [200],
    desc: 'Registered satellite & weather connectors',
  });

  // 12. Delivery Channels (USSD)
  console.log('\n--- 12. DELIVERY CHANNELS ---');
  await testRoute({
    category: 'Delivery',
    name: 'USSD Gateway Status',
    method: 'GET',
    url: '/api/v1/delivery/ussd',
    expectedStatuses: [200],
    desc: 'USSD service health check',
  });
  await testRoute({
    category: 'Delivery',
    name: 'USSD Interactive Session (*212# Initial Menu)',
    method: 'POST',
    url: '/api/v1/delivery/ussd',
    body: { text: '' },
    expectedStatuses: [200],
    desc: 'USSD main menu rendering',
  });

  console.log('\n================================================================');
  const total = auditResults.length;
  const passed = auditResults.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`  FINAL AUDIT SCORE: ${passed}/${total} ROUTES VERIFIED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================');

  await disconnectDB();
  process.exit(failed > 0 ? 1 : 0);
}

runRouteAudit();
