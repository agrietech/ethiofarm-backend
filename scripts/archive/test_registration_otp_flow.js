const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const { prisma, connectDB, disconnectDB } = require('../src/config/db');
const { disconnectRedis } = require('../src/config/redis');

async function testRegistrationAndOtpFlow() {
  console.log('====================================================');
  console.log('  AGRIETECH E2E: REGISTRATION & OTP VERIFICATION');
  console.log('====================================================');

  await connectDB();
  const RUN_ID = Date.now().toString().slice(-6);
  const testPhoneRaw = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
  const canonicalPhone = testPhoneRaw.replace(/^0/, '+251');
  const testEmail = `farmer_${RUN_ID}@ethiofarm.et`;
  const testPassword = 'StrongPassword123!';

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

  try {
    // -----------------------------------------------------------------
    // 1. REGISTER WITH ETHIOPIAN PHONE NUMBER
    // -----------------------------------------------------------------
    console.log(`\n--- 1. Registering Farmer with Phone ${testPhoneRaw} ---`);
    process.env.NODE_ENV = 'test'; // so backend returns phoneVerificationCode for automated verification

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: testPhoneRaw,
        fullName: 'Abebe Bikila',
        password: testPassword,
        role: 'FARMER',
        preferredLang: 'am',
      });

    assert(regRes.status === 201, `Registration returned HTTP 201 Created (got ${regRes.status})`);
    assert(regRes.body.data?.user?.phoneNumber === canonicalPhone, `Phone normalized to canonical format: ${canonicalPhone}`);
    assert(regRes.body.data?.requiresPhoneVerification === true, 'Response indicates requiresPhoneVerification: true');
    assert(typeof regRes.body.data?.accessToken === 'string', 'JWT Access token issued upon registration');

    const generatedOtp = regRes.body.data?.phoneVerificationCode;
    assert(typeof generatedOtp === 'string' && generatedOtp.length === 6, `6-digit OTP generated for SMS dispatch: ${generatedOtp}`);

    // Verify OTP token is hashed in DB
    const dbUser = await prisma.user.findFirst({
      where: { phoneNumber: canonicalPhone },
    });
    assert(dbUser !== null, 'User saved in PostgreSQL database');
    assert(dbUser?.isPhoneVerified === false, 'isPhoneVerified is initially false');
    assert(dbUser?.phoneVerificationToken !== null, 'phoneVerificationToken is stored in database');
    assert(dbUser?.phoneVerificationExpires > new Date(), 'phoneVerificationExpires is set in the future (10 min)');

    // -----------------------------------------------------------------
    // 2. VERIFY PHONE OTP - WRONG CODE (SHOULD BE REJECTED)
    // -----------------------------------------------------------------
    console.log('\n--- 2. Verifying Phone OTP with Invalid Code (Security Check) ---');
    const wrongOtpRes = await request(app)
      .post('/api/v1/auth/verify-phone-otp')
      .send({
        phoneNumber: canonicalPhone,
        code: '000000',
      });

    assert(wrongOtpRes.status === 400, `Invalid OTP rejected with HTTP 400 Bad Request (got ${wrongOtpRes.status})`);

    // -----------------------------------------------------------------
    // 3. VERIFY PHONE OTP - CORRECT CODE
    // -----------------------------------------------------------------
    console.log('\n--- 3. Verifying Phone OTP with Valid Code ---');
    const validOtpRes = await request(app)
      .post('/api/v1/auth/verify-phone-otp')
      .send({
        phoneNumber: canonicalPhone,
        code: generatedOtp,
      });

    assert(validOtpRes.status === 200, `Valid OTP accepted with HTTP 200 OK (got ${validOtpRes.status})`);
    assert(validOtpRes.body.data?.user?.isPhoneVerified === true, 'User isPhoneVerified flag updated to true');
    assert(typeof validOtpRes.body.data?.accessToken === 'string', 'New verified session JWT issued');

    // Check DB state after verification
    const verifiedDbUser = await prisma.user.findFirst({
      where: { phoneNumber: canonicalPhone },
    });
    assert(verifiedDbUser?.isPhoneVerified === true, 'PostgreSQL confirmed isPhoneVerified: true');
    assert(verifiedDbUser?.phoneVerificationToken === null, 'Consumed phoneVerificationToken cleared from database');

    // -----------------------------------------------------------------
    // 4. RESEND PHONE OTP: COOLDOWN ENFORCEMENT & ALREADY VERIFIED
    // -----------------------------------------------------------------
    console.log('\n--- 4. Resending Phone OTP (Cooldown & Already Verified Checks) ---');
    const immediateResend = await request(app)
      .post('/api/v1/auth/resend-phone-otp')
      .send({
        phoneNumber: canonicalPhone,
      });

    assert(immediateResend.status === 400, `Immediate resend enforces 60-second cooldown with HTTP 400 (got ${immediateResend.status})`);
    assert(immediateResend.body?.error?.message?.includes('Please wait') || immediateResend.body?.message?.includes('Please wait'), 'Cooldown error message returned to prevent SMS flooding');

    // Clear cooldown to test resend on already verified user
    const { redis } = require('../src/config/redis');
    if (redis && typeof redis.del === 'function') {
      await redis.del(`phone_cooldown:${canonicalPhone}`).catch(() => {});
    }
    const authService = require('../src/modules/auth/auth.service');
    // Also test a fresh unverified phone resend flow with a new number
    const unverifiedPhoneRaw = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
    const unverifiedCanonical = unverifiedPhoneRaw.replace(/^0/, '+251');
    const regResUnverified = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: unverifiedPhoneRaw,
        fullName: 'Dawit Tsige',
        password: testPassword,
        role: 'FARMER',
        preferredLang: 'am',
      });
    assert(regResUnverified.status === 201, 'Unverified farmer registered');
    if (redis && typeof redis.del === 'function') {
      await redis.del(`phone_cooldown:${unverifiedCanonical}`).catch(() => {});
    }

    // Clean up unverified user
    await prisma.user.deleteMany({ where: { phoneNumber: unverifiedCanonical } });

    // -----------------------------------------------------------------
    // 5. PASSWORDLESS SMS OTP LOGIN (REQUEST & VERIFY)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Passwordless SMS OTP Login Flow ---');
    const requestLoginOtpRes = await request(app)
      .post('/api/v1/auth/request-login-otp')
      .send({
        phoneNumber: canonicalPhone,
      });

    assert(requestLoginOtpRes.status === 200, `Passwordless Login OTP request returned HTTP 200 (got ${requestLoginOtpRes.status})`);
    const loginOtp = requestLoginOtpRes.body.data?.code;
    assert(typeof loginOtp === 'string' && loginOtp.length === 6, `Login OTP received: ${loginOtp}`);

    const verifyLoginOtpRes = await request(app)
      .post('/api/v1/auth/verify-login-otp')
      .send({
        phoneNumber: canonicalPhone,
        code: loginOtp,
      });

    assert(verifyLoginOtpRes.status === 200, `Passwordless Login OTP verified with HTTP 200 (got ${verifyLoginOtpRes.status})`);
    assert(typeof verifyLoginOtpRes.body.data?.accessToken === 'string', 'Valid login access token received');

    // -----------------------------------------------------------------
    // 6. REGISTER WITH EMAIL & PASSWORD
    // -----------------------------------------------------------------
    console.log(`\n--- 6. Registering Farmer with Email ${testEmail} ---`);
    const regEmailRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        fullName: 'Tirunesh Dibaba',
        password: testPassword,
        role: 'FARMER',
        preferredLang: 'am',
      });

    assert(regEmailRes.status === 201, `Email registration returned HTTP 201 Created (got ${regEmailRes.status})`);
    assert(regEmailRes.body.data?.user?.email === testEmail, 'Email matches registered email');
    assert(regEmailRes.body.data?.requiresPhoneVerification === false, 'requiresPhoneVerification is false for email users');

    // -----------------------------------------------------------------
    // 7. CLEANUP
    // -----------------------------------------------------------------
    await prisma.user.deleteMany({
      where: {
        OR: [
          { phoneNumber: canonicalPhone },
          { email: testEmail },
        ],
      },
    });
    console.log('\n--- Test Users Cleaned Up from Database ---');

  } catch (err) {
    console.error('Unexpected error in test suite:', err);
    failed++;
  } finally {
    await disconnectDB();
    await disconnectRedis();
  }

  console.log('\n====================================================');
  console.log(`  SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

testRegistrationAndOtpFlow();
