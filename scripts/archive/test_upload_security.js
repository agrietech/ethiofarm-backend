const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const fs = require('fs');
const path = require('path');
const os = require('os');

const testToken = jwt.sign(
  { id: 'usr_sec_tester_01', email: 'sec_tester@agrietech.et', role: 'ADMIN' },
  env.JWT_SECRET || 'agrietech_jwt_super_secret_production_key_2026',
  { expiresIn: '15m' }
);

async function testUploadSecurity() {
  console.log('=== TEST: FILE UPLOAD MAGIC-BYTE VALIDATION & NOSNIFF HEADERS ===');
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

  const tmpDir = os.tmpdir();

  // 1. Create a genuine JPEG file (starts with 0xFF 0xD8 0xFF 0xE0)
  const realJpgPath = path.join(tmpDir, `real_${Date.now()}.jpg`);
  const realJpgBuf = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0xff, 0xd9,
  ]);
  fs.writeFileSync(realJpgPath, realJpgBuf);

  // 2. Create a spoofed JPEG file (text disguised as image/jpeg)
  const fakeJpgPath = path.join(tmpDir, `spoofed_${Date.now()}.jpg`);
  fs.writeFileSync(fakeJpgPath, '<script>alert("XSS")</script>');

  // 3. Create a spoofed PNG file (PHP code disguised as image/png)
  const fakePngPath = path.join(tmpDir, `spoofed_${Date.now()}.png`);
  fs.writeFileSync(fakePngPath, '<?php echo "evil"; ?>');

  // Test 1: Upload fake JPEG to /api/v1/media/upload/public
  const fakeJpgRes = await request(app)
    .post('/api/v1/media/upload/public')
    .set('Authorization', `Bearer ${testToken}`)
    .attach('file', fakeJpgPath, { filename: 'photo.jpg', contentType: 'image/jpeg' });

  assert(fakeJpgRes.status === 400, 'Spoofed JPEG upload was rejected with HTTP 400');
  assert(
    fakeJpgRes.body?.error?.code === 'INVALID_FILE_SIGNATURE',
    `Rejection error code is INVALID_FILE_SIGNATURE (got ${fakeJpgRes.body?.error?.code})`
  );

  // Test 2: Upload fake PNG to /api/v1/media/upload/public
  const fakePngRes = await request(app)
    .post('/api/v1/media/upload/public')
    .set('Authorization', `Bearer ${testToken}`)
    .attach('file', fakePngPath, { filename: 'avatar.png', contentType: 'image/png' });

  assert(fakePngRes.status === 400, 'Spoofed PNG upload was rejected with HTTP 400');

  // Test 3: Upload genuine JPEG
  const realJpgRes = await request(app)
    .post('/api/v1/media/upload/public')
    .set('Authorization', `Bearer ${testToken}`)
    .attach('file', realJpgPath, { filename: 'camera.jpg', contentType: 'image/jpeg' });

  assert(realJpgRes.status === 201, `Genuine JPEG was accepted with HTTP 201 (got ${realJpgRes.status})`);
  assert(realJpgRes.body?.data?.url, 'Uploaded file URL returned in response');

  // Test 4: Verify X-Content-Type-Options: nosniff on static uploads
  const staticRes = await request(app)
    .get('/uploads/nonexistent_test_file.jpg')
    .set('Authorization', `Bearer ${testToken}`);

  const nosniff = staticRes.headers['x-content-type-options'];
  assert(nosniff === 'nosniff', `Static uploads handler sets X-Content-Type-Options: nosniff (got ${nosniff})`);

  // Cleanup temp test files
  try {
    if (fs.existsSync(realJpgPath)) fs.unlinkSync(realJpgPath);
    if (fs.existsSync(fakeJpgPath)) fs.unlinkSync(fakeJpgPath);
    if (fs.existsSync(fakePngPath)) fs.unlinkSync(fakePngPath);
  } catch (_e) {}

  console.log(`\nUpload Security Verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

testUploadSecurity()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
