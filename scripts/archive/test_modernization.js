const request = require('supertest');
const app = require('../src/app');
const { BUCKETS } = require('../src/utils/supabaseStorage');
const { setDiagnosisJobState, getDiagnosisJobState } = require('../src/ingestion/jobs/queue');
const { prisma, isConnected } = require('../src/config/db');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const testAdminToken = jwt.sign(
  { id: 'usr_modern_admin_01', email: 'admin@agrietech.et', role: 'ADMIN' },
  env.JWT_SECRET || 'agrietech_jwt_super_secret_production_key_2026',
  { expiresIn: '15m' }
);

async function runTests() {
  console.log('=== MODERNIZATION & SUPABASE STORAGE VERIFICATION ===');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Ensure DB is connected
  try {
    const { connectDB } = require('../src/config/db');
    await connectDB();
  } catch (_e) {}


  // 1. Verify Bucket Configuration
  assert(BUCKETS.AUDIO === 'audio', 'Audio bucket configured as "audio"');
  assert(BUCKETS.DIAGNOSE === 'diagnose', 'Diagnose bucket configured as "diagnose"');
  assert(BUCKETS.AGRETECH === 'agrEtech', 'AgrEtech public bucket configured as "agrEtech"');
  assert(BUCKETS.PRIVATE === 'private', 'Private bucket configured as "private"');

  // 2. Test CSP Headers on HTTP response
  const rootRes = await request(app).get('/health/liveness');
  assert(rootRes.status === 200, 'Liveness health endpoint responds 200 OK');
  const cspHeader = rootRes.headers['content-security-policy'] || '';
  assert(cspHeader.includes('uhktbbeqqdsfkooyrgmq.supabase.co'), 'CSP allows Supabase CDN assets');
  assert(cspHeader.includes("default-src 'self'"), 'CSP enforces default-src self');

  // 3. Test Persistent Diagnosis Job Queue State
  const testJobId = `diagjob_test_${Date.now()}`;
  const mockJobState = {
    jobId: testJobId,
    status: 'PROCESSING',
    progress: 45,
    cropType: 'TEFF',
    updatedAt: new Date().toISOString(),
  };
  await setDiagnosisJobState(testJobId, mockJobState);
  const retrievedState = await getDiagnosisJobState(testJobId);
  assert(retrievedState && retrievedState.jobId === testJobId, 'Durable job state saved and retrieved');
  assert(retrievedState && retrievedState.progress === 45, 'Job progress preserved accurately');

  // 4. Test Media Upload Endpoints
  const publicUploadRes = await request(app)
    .post('/api/v1/media/upload/public')
    .set('Authorization', `Bearer ${testAdminToken}`)
    .attach('file', Buffer.from('test sample content'), { filename: 'guide.txt', contentType: 'text/plain' });

  assert(publicUploadRes.status === 201, `Public media upload to agrEtech succeeds (HTTP ${publicUploadRes.status})`);
  assert(publicUploadRes.body?.data?.bucket === 'agrEtech', 'Public upload targeted "agrEtech" bucket');

  const privateUploadRes = await request(app)
    .post('/api/v1/media/upload/private')
    .set('Authorization', `Bearer ${testAdminToken}`)
    .attach('file', Buffer.from('%PDF-1.4 soil test data'), { filename: 'soil_report.pdf', contentType: 'application/pdf' });

  assert(privateUploadRes.status === 201, `Private document upload succeeds (HTTP ${privateUploadRes.status})`);
  assert(privateUploadRes.body?.data?.bucket === 'private', 'Private upload targeted "private" bucket');
  assert(Boolean(privateUploadRes.body?.data?.signedUrl), 'Private upload returned signed URL');

  // 5. Test Signed URL generation
  const signedUrlRes = await request(app)
    .post('/api/v1/media/signed-url')
    .set('Authorization', `Bearer ${testAdminToken}`)
    .send({ filePath: 'soil_report.pdf', expiresInSeconds: 3600 });
  assert(signedUrlRes.status === 200 || signedUrlRes.status === 400, `Signed URL endpoint responsive (HTTP ${signedUrlRes.status})`);

  // 6. Test Optimistic Concurrency Control (OCC)
  const testFarm = await prisma.farm.findFirst();
  if (testFarm) {
    // Send stale timestamp older than the record's actual updatedAt
    const staleTime = new Date(new Date(testFarm.updatedAt).getTime() - 60000).toISOString();
    const staleOccRes = await request(app)
      .patch(`/api/v1/farms/${testFarm.id}`)
      .set('Authorization', `Bearer ${testAdminToken}`)
      .send({ farmName: 'Concurrent Test Farm', clientUpdatedAt: staleTime });

    assert(staleOccRes.status === 409, `OCC correctly detected stale client timestamp and rejected with HTTP 409 Conflict`);
    assert(staleOccRes.body?.error?.code === 'CONCURRENCY_CONFLICT', 'OCC returned CONCURRENCY_CONFLICT code');

    // Re-fetch current record to get exact server updatedAt
    const freshFarm = await prisma.farm.findUnique({ where: { id: testFarm.id } });
    const validOccRes = await request(app)
      .patch(`/api/v1/farms/${testFarm.id}`)
      .set('Authorization', `Bearer ${testAdminToken}`)
      .send({ farmName: freshFarm.farmName, clientUpdatedAt: freshFarm.updatedAt.toISOString() });

    assert(validOccRes.status === 200, `OCC allowed update with matching timestamp (HTTP 200)`);
  }


  console.log(`\nVerification Summary: ${passed} PASSED | ${failed} FAILED\n`);
  process.exit(failed > 0 ? 1 : 0);
}


runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
