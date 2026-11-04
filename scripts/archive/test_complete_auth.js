/**
 * Comprehensive End-to-End Authentication Verification Suite
 * Validates all auth workflows against the live Express application,
 * Supabase PostgreSQL database, and Upstash Redis cache.
 */

// Disable rate limiter for automated testing suite
process.env.DISABLE_RATE_LIMIT = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const redis = require('../src/config/redis');

const RUN_ID = Date.now();
const testUsers = [];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS:\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${message}`);
    failed++;
  }
}

async function runAuthTests() {
  console.log('\n======================================================');
  console.log(`🧪 STARTING COMPLETE AUTHENTICATION SUITE [Run ${RUN_ID}]`);
  console.log('======================================================\n');

  try {
    // ----------------------------------------------------
    // SECTION 1: USER REGISTRATION (EMAIL)
    // ----------------------------------------------------
    console.log('--- [1/8] Testing Farmer Registration with Email ---');
    const farmerEmail = `farmer_auth_${RUN_ID}@ethiofarm.et`;
    const farmerPassword = 'Password123!';
    testUsers.push(farmerEmail);

    const regRes1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: farmerEmail,
        fullName: 'Abebe Bikila',
        password: farmerPassword,
        role: 'FARMER',
        preferredLang: 'am',
      });

    assert(regRes1.status === 201, `Registration returned HTTP 201 (got ${regRes1.status})`);
    assert(regRes1.body.success === true, 'Response has success: true');
    assert(regRes1.body.data?.user?.email === farmerEmail, `User email matches (${farmerEmail})`);
    assert(regRes1.body.data?.user?.role === 'FARMER', 'User role is FARMER');
    assert(regRes1.body.data?.accessToken?.length > 20, 'Access token returned');
    assert(regRes1.body.data?.refreshToken?.length > 20, 'Refresh token returned');
    assert(!regRes1.body.data?.user?.passwordHash, 'Password hash is strictly sanitized and omitted');

    const farmerAccessToken = regRes1.body.data?.accessToken;
    const farmerRefreshToken = regRes1.body.data?.refreshToken;
    const farmerUserId = regRes1.body.data?.user?.id;

    // ----------------------------------------------------
    // SECTION 2: USER REGISTRATION (ETHIOPIAN PHONE)
    // ----------------------------------------------------
    console.log('\n--- [2/8] Testing Farmer Registration with Ethiopian Phone ---');
    // Standard Ethiopian mobile is 10 digits: 09 + 8 digits (e.g. 0912345678 -> +251912345678)
    const phone8Digits = String(RUN_ID).slice(-8);
    const farmerPhone = `09${phone8Digits}`;
    const canonicalPhone = `+2519${phone8Digits}`;
    testUsers.push(canonicalPhone);

    const regRes2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: farmerPhone,
        fullName: 'Chaltu Dibaba',
        password: farmerPassword,
        role: 'FARMER',
        preferredLang: 'om',
      });

    assert(regRes2.status === 201, `Phone registration returned HTTP 201 (got ${regRes2.status})`);
    assert(regRes2.body.data?.user?.phoneNumber === canonicalPhone, `Phone normalized to canonical format: ${canonicalPhone}`);
    assert(regRes2.body.data?.requiresPhoneVerification === true, 'Requires phone verification flag set');
    assert(regRes2.body.data?.accessToken?.length > 20, 'Access token returned for phone user');

    // ----------------------------------------------------
    // SECTION 3: REGISTRATION VALIDATION & REJECTIONS
    // ----------------------------------------------------
    console.log('\n--- [3/8] Testing Registration Input Validation & Error Handling ---');

    // Duplicate email
    const dupRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: farmerEmail,
        fullName: 'Duplicate User',
        password: farmerPassword,
      });
    assert(dupRes.status === 409, `Duplicate email rejected with HTTP 409 Conflict (got ${dupRes.status})`);

    // Duplicate phone number
    const dupPhoneRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: farmerPhone,
        fullName: 'Duplicate Phone User',
        password: farmerPassword,
      });
    assert(dupPhoneRes.status === 409, `Duplicate phone rejected with HTTP 409 Conflict (got ${dupPhoneRes.status})`);

    // Short password
    const shortPassRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `short_${RUN_ID}@ethiofarm.et`,
        fullName: 'Short Pass',
        password: 'pass1', // <8 chars
      });
    assert(shortPassRes.status === 400, `Short password (<8 chars) rejected with HTTP 400 (got ${shortPassRes.status})`);

    // Password with no numbers
    const noNumPassRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `nonum_${RUN_ID}@ethiofarm.et`,
        fullName: 'No Number Pass',
        password: 'PasswordOnly',
      });
    assert(noNumPassRes.status === 400, `Password without number rejected with HTTP 400 (got ${noNumPassRes.status})`);

    // Officer registration without credentials
    const officerNoCredsRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `officer_${RUN_ID}@ethiofarm.et`,
        fullName: 'DA Without Badge',
        password: farmerPassword,
        role: 'DEVELOPMENT_AGENT',
      });
    assert(officerNoCredsRes.status === 400, `Professional role without badge rejected with HTTP 400 (got ${officerNoCredsRes.status})`);

    // Officer registration WITH credentials
    const officerEmail = `da_${RUN_ID}@ethiofarm.et`;
    testUsers.push(officerEmail);
    const officerCredsRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: officerEmail,
        fullName: 'Solomon Tadesse',
        password: farmerPassword,
        role: 'DEVELOPMENT_AGENT',
        staffIdNumber: `DA-ETH-${RUN_ID}`,
        organizationName: 'Ministry of Agriculture Ethiopia',
      });
    assert(officerCredsRes.status === 201, `Professional role WITH badge accepted with HTTP 201 (got ${officerCredsRes.status})`);
    assert(officerCredsRes.body.data?.user?.role === 'DEVELOPMENT_AGENT', 'User registered as DEVELOPMENT_AGENT');

    // ----------------------------------------------------
    // SECTION 4: USER LOGIN (EMAIL & PHONE & REJECTIONS)
    // ----------------------------------------------------
    console.log('\n--- [4/8] Testing Login (Email, Phone, Bad Password, Non-Existent) ---');

    // Valid Email Login
    const loginEmailRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: farmerEmail,
        password: farmerPassword,
      });
    assert(loginEmailRes.status === 200, `Email login returned HTTP 200 OK (got ${loginEmailRes.status})`);
    assert(loginEmailRes.body.data?.accessToken?.length > 20, 'Valid JWT access token received');
    assert(loginEmailRes.body.data?.user?.email === farmerEmail, 'User profile returned on login');

    // Valid Phone Login (using local 09... format)
    const loginPhoneRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        phoneNumber: farmerPhone,
        password: farmerPassword,
      });
    assert(loginPhoneRes.status === 200, `Phone login returned HTTP 200 OK (got ${loginPhoneRes.status})`);
    assert(loginPhoneRes.body.data?.user?.phoneNumber === canonicalPhone, 'Phone user logged in successfully');

    // Wrong Password
    const badPassRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: farmerEmail,
        password: 'WrongPassword999!',
      });
    assert(badPassRes.status === 401, `Wrong password rejected with HTTP 401 Unauthorized (got ${badPassRes.status})`);

    // Non-existent user
    const nonExistRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `ghost_${RUN_ID}@ethiofarm.et`,
        password: farmerPassword,
      });
    assert(nonExistRes.status === 401, `Non-existent user rejected with HTTP 401 (got ${nonExistRes.status})`);

    // ----------------------------------------------------
    // SECTION 5: AUTHENTICATED ROUTES & PROFILE UPDATES
    // ----------------------------------------------------
    console.log('\n--- [5/8] Testing Authenticated Routes (Profile, Updates, Device Token) ---');

    // GET /api/v1/auth/me without token
    const unauthMeRes = await request(app).get('/api/v1/auth/me');
    assert(unauthMeRes.status === 401, `Unauthenticated /auth/me rejected with HTTP 401 (got ${unauthMeRes.status})`);

    // GET /api/v1/auth/me with valid Bearer token
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${farmerAccessToken}`);
    assert(meRes.status === 200, `GET /auth/me with token returned HTTP 200 OK (got ${meRes.status})`);
    assert(meRes.body.data?.id === farmerUserId, 'Profile ID matches authenticated user');
    assert(meRes.body.data?.fullName === 'Abebe Bikila', 'Profile fullName matches');

    // PATCH /api/v1/auth/me (Update profile)
    const updateProfileRes = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${farmerAccessToken}`)
      .send({
        fullName: 'Abebe Bikila OLY',
        preferredLang: 'ti',
        kebeleName: 'Kebele 04 Highland',
      });
    assert(updateProfileRes.status === 200, `Profile update returned HTTP 200 OK (got ${updateProfileRes.status})`);
    assert(updateProfileRes.body.data?.fullName === 'Abebe Bikila OLY', 'Full name updated in DB');
    assert(updateProfileRes.body.data?.preferredLang === 'ti', 'Preferred language updated in DB');
    assert(updateProfileRes.body.data?.kebeleName === 'Kebele 04 Highland', 'Kebele updated in DB');

    // POST /api/v1/auth/device-token (FCM token update)
    const fcmRes = await request(app)
      .post('/api/v1/auth/device-token')
      .set('Authorization', `Bearer ${farmerAccessToken}`)
      .send({
        deviceToken: `fcm_test_device_token_${RUN_ID}`,
      });
    assert(fcmRes.status === 200, `Device token update returned HTTP 200 OK (got ${fcmRes.status})`);

    // PATCH /api/v1/auth/update-password
    const newPassword = 'NewSecretPassword456!';
    const changePassRes = await request(app)
      .patch('/api/v1/auth/update-password')
      .set('Authorization', `Bearer ${farmerAccessToken}`)
      .send({
        currentPassword: farmerPassword,
        newPassword: newPassword,
      });
    assert(changePassRes.status === 200, `Update password returned HTTP 200 OK (got ${changePassRes.status})`);

    // Verify login with old password fails
    const oldPassLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: farmerEmail,
        password: farmerPassword,
      });
    assert(oldPassLoginRes.status === 401, `Login with old password now rejected with HTTP 401 (got ${oldPassLoginRes.status})`);

    // Verify login with new password succeeds
    const newPassLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: farmerEmail,
        password: newPassword,
      });
    assert(newPassLoginRes.status === 200, `Login with new password succeeded HTTP 200 (got ${newPassLoginRes.status})`);
    const activeAccessToken = newPassLoginRes.body.data?.accessToken;
    const activeRefreshToken = newPassLoginRes.body.data?.refreshToken;

    // ----------------------------------------------------
    // SECTION 6: TOKEN REFRESH & TOKEN ROTATION
    // ----------------------------------------------------
    console.log('\n--- [6/8] Testing Token Refresh & Token Rotation Protection ---');

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({
        refreshToken: activeRefreshToken,
      });

    assert(refreshRes.status === 200, `Refresh token endpoint returned HTTP 200 OK (got ${refreshRes.status})`);
    assert(refreshRes.body.data?.accessToken?.length > 20, 'New rotated access token generated');
    assert(refreshRes.body.data?.refreshToken?.length > 20, 'New rotated refresh token generated');
    assert(refreshRes.body.data?.refreshToken !== activeRefreshToken, 'Rotated refresh token is distinct from old one');

    const rotatedAccessToken = refreshRes.body.data?.accessToken;
    const rotatedRefreshToken = refreshRes.body.data?.refreshToken;

    // Security check: Reuse of the old refresh token MUST fail (M4 rotation violation)
    const replayRefreshRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({
        refreshToken: activeRefreshToken,
      });
    assert(replayRefreshRes.status === 401, `Replay of consumed refresh token rejected with HTTP 401 (got ${replayRefreshRes.status})`);

    // ----------------------------------------------------
    // SECTION 7: LOGOUT & DISTRIBUTED TOKEN BLACKLIST
    // ----------------------------------------------------
    console.log('\n--- [7/8] Testing Logout & Redis Token Blacklist ---');

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotatedAccessToken}`)
      .send({
        refreshToken: rotatedRefreshToken,
      });

    assert(logoutRes.status === 200, `Logout returned HTTP 200 OK (got ${logoutRes.status})`);
    assert(logoutRes.body.data?.message?.includes('Logged out'), 'Logout confirmed');

    // Verify the revoked access token is rejected on subsequent calls
    const blacklistedAccessRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotatedAccessToken}`);
    assert(
      blacklistedAccessRes.status === 401,
      `Access with blacklisted token rejected with HTTP 401 (got ${blacklistedAccessRes.status})`
    );

    // ----------------------------------------------------
    // SECTION 8: OTP WORKFLOWS (FORGOT PASSWORD & PHONE OTP)
    // ----------------------------------------------------
    console.log('\n--- [8/8] Testing Password Reset & Phone OTP Flows ---');

    // Forgot Password OTP
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({
        email: farmerEmail,
      });
    assert(forgotRes.status === 200, `Forgot password returned HTTP 200 OK (got ${forgotRes.status})`);
    assert(forgotRes.body.data?.expiresInSeconds === 300, 'OTP expires in 300 seconds');

    // Phone Verification OTP - invalid code rejection
    const invalidPhoneVerifyRes = await request(app)
      .post('/api/v1/auth/verify-phone-otp')
      .send({
        phoneNumber: farmerPhone,
        code: '000000',
      });
    assert(invalidPhoneVerifyRes.status === 400, `Invalid phone OTP correctly rejected with HTTP 400 (got ${invalidPhoneVerifyRes.status})`);

    // Passwordless Login OTP Request
    const requestOtpRes = await request(app)
      .post('/api/v1/auth/request-login-otp')
      .send({
        phoneNumber: farmerPhone,
      });
    assert(requestOtpRes.status === 200, `Request login OTP returned HTTP 200 OK (got ${requestOtpRes.status})`);

    // Invalid Login OTP rejection
    const invalidLoginOtpRes = await request(app)
      .post('/api/v1/auth/verify-login-otp')
      .send({
        phoneNumber: farmerPhone,
        code: '999999',
      });
    assert(invalidLoginOtpRes.status === 401, `Invalid login OTP rejected with HTTP 401 (got ${invalidLoginOtpRes.status})`);

    console.log('\n======================================================');
    console.log(`📊 AUTHENTICATION SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('Fatal error during auth test run:', err);
    failed++;
  } finally {
    // Clean up created test accounts
    console.log('🧹 Cleaning up test accounts from Supabase database...');
    try {
      const deleted = await prisma.user.deleteMany({
        where: {
          OR: [
            { email: { in: testUsers } },
            ...testUsers.map((u) => ({ phoneNumber: u })),
          ],
        },
      });
      console.log(`  Cleaned up ${deleted.count} temporary test users.`);
    } catch (cleanupErr) {
      console.warn('  Cleanup note:', cleanupErr.message);
    }

    if (redis && typeof redis.disconnect === 'function') {
      try {
        redis.disconnect();
      } catch (_e) {}
    }
    await prisma.$disconnect();

    process.exit(failed > 0 ? 1 : 0);
  }
}

runAuthTests();
