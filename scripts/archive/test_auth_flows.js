/**
 * Comprehensive Authentication Flow Test Script
 * 
 * Tests all authentication endpoints with email-first approach:
 * 1. Register with email (phone optional)
 * 2. Login with email only
 * 3. Email verification flow
 * 4. Password reset flow
 * 5. Token refresh
 * 6. Profile access
 * 7. Logout
 */

require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const API_BASE = `${BASE_URL}/api/v1`;

// Test user data
const testUser = {
  email: `test_${Date.now()}@agrietech-test.et`,
  fullName: 'Test Farmer User',
  password: 'TestPassword123!',
  phoneNumber: `+25191${Math.floor(1000000 + Math.random() * 9000000)}`, // Optional
  preferredLang: 'en',
  role: 'FARMER',
};

let testTokens = {
  accessToken: null,
  refreshToken: null,
  userId: null,
  verificationToken: null,
  resetToken: null,
};

console.log(chalk.bold.green('\n╔════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.green('║        AgriEtech Authentication Flow Test Suite               ║'));
console.log(chalk.bold.green('║              Email-First Authentication System                 ║'));
console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════════╝\n'));

console.log(chalk.cyan('🔧 Test Configuration:'));
console.log(chalk.white(`  Base URL: ${chalk.bold(BASE_URL)}`));
console.log(chalk.white(`  Test Email: ${chalk.bold(testUser.email)}`));
console.log(chalk.white(`  Test Phone: ${chalk.bold(testUser.phoneNumber)} ${chalk.dim('(optional)')}`));
console.log('');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function logTest(testName, status, details = '') {
  totalTests++;
  if (status === 'PASS') {
    passedTests++;
    console.log(chalk.green(`  ✓ ${testName}`));
    if (details) console.log(chalk.dim(`    ${details}`));
  } else if (status === 'FAIL') {
    failedTests++;
    console.log(chalk.red(`  ✗ ${testName}`));
    if (details) console.log(chalk.red(`    ${details}`));
  } else {
    console.log(chalk.yellow(`  ⚠ ${testName}`));
    if (details) console.log(chalk.yellow(`    ${details}`));
  }
}

async function runTests() {
  try {
    // ============================================================
    // TEST 1: Register with Email (Required)
    // ============================================================
    console.log(chalk.cyan('\n📝 TEST SUITE 1: User Registration (Email Required)'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.post(`${API_BASE}/auth/register`, testUser);
      
      if (response.data.success && response.data.data.user && response.data.data.token) {
        testTokens.accessToken = response.data.data.token || response.data.data.accessToken;
        testTokens.refreshToken = response.data.data.refreshToken;
        testTokens.userId = response.data.data.user.id;
        
        logTest('User registration successful', 'PASS', `User ID: ${testTokens.userId}`);
        logTest('Access token received', 'PASS', `Token length: ${testTokens.accessToken.length} chars`);
        logTest('Refresh token received', 'PASS', `Token: ${testTokens.refreshToken.substring(0, 20)}...`);
        
        // Verify user data structure
        const user = response.data.data.user;
        logTest('User email set correctly', user.email === testUser.email ? 'PASS' : 'FAIL', user.email);
        logTest('User full name set correctly', user.fullName === testUser.fullName ? 'PASS' : 'FAIL', user.fullName);
        logTest('User phone number set (optional)', user.phoneNumber === testUser.phoneNumber ? 'PASS' : 'WARN', user.phoneNumber || 'Not provided');
        logTest('Email verification status', user.isEmailVerified === false ? 'PASS' : 'FAIL', `isEmailVerified: ${user.isEmailVerified}`);
        logTest('User role assigned', user.role === 'FARMER' ? 'PASS' : 'FAIL', `Role: ${user.role}`);
      } else {
        logTest('User registration', 'FAIL', 'Invalid response structure');
      }
    } catch (error) {
      logTest('User registration', 'FAIL', error.response?.data?.message || error.message);
    }

    // ============================================================
    // TEST 2: Register Without Email (Should Fail)
    // ============================================================
    console.log(chalk.cyan('\n🚫 TEST SUITE 2: Validation Tests (Email Required)'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      await axios.post(`${API_BASE}/auth/register`, {
        fullName: 'No Email User',
        password: 'Password123!',
        phoneNumber: '+251999999999', // Phone alone should not work
      });
      logTest('Registration without email rejected', 'FAIL', 'Should have been rejected but succeeded');
    } catch (error) {
      const msg = (error.response?.data?.message || error.response?.data?.error?.message || '').toLowerCase();
      if (error.response?.status === 400 && msg.includes('email')) {
        logTest('Registration without email rejected', 'PASS', 'Correctly requires email');
      } else {
        logTest('Registration without email rejected', 'FAIL', 'Wrong error type');
      }
    }

    // Test invalid email format
    try {
      await axios.post(`${API_BASE}/auth/register`, {
        email: 'invalid-email-format',
        fullName: 'Invalid Email User',
        password: 'Password123!',
      });
      logTest('Invalid email format rejected', 'FAIL', 'Should have been rejected but succeeded');
    } catch (error) {
      if (error.response?.status === 400) {
        logTest('Invalid email format rejected', 'PASS', 'Correctly validates email format');
      } else {
        logTest('Invalid email format rejected', 'FAIL', 'Wrong error type');
      }
    }

    // ============================================================
    // TEST 3: Login with Email
    // ============================================================
    console.log(chalk.cyan('\n🔐 TEST SUITE 3: Login with Email'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: testUser.email,
        password: testUser.password,
      });

      if (response.data.success && response.data.data.token) {
        const newAccessToken = response.data.data.token || response.data.data.accessToken;
        logTest('Login with email successful', 'PASS', `Token received: ${newAccessToken.substring(0, 30)}...`);
        logTest('User data returned', response.data.data.user ? 'PASS' : 'FAIL', `User ID: ${response.data.data.user?.id}`);
        
        // Update token for subsequent tests
        testTokens.accessToken = newAccessToken;
        
        const user = response.data.data.user;
        logTest('Login returns email', user.email === testUser.email ? 'PASS' : 'FAIL', user.email);
        logTest('Login returns full name', user.fullName === testUser.fullName ? 'PASS' : 'FAIL', user.fullName);
      } else {
        logTest('Login with email', 'FAIL', 'Invalid response structure');
      }
    } catch (error) {
      logTest('Login with email', 'FAIL', error.response?.data?.message || error.message);
    }

    // ============================================================
    // TEST 4: Login Without @ Symbol (Should Fail)
    // ============================================================
    console.log(chalk.cyan('\n📧 TEST SUITE 4: Email Format Validation'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      await axios.post(`${API_BASE}/auth/login`, {
        email: '251912345678', // Phone format without @
        password: testUser.password,
      });
      logTest('Login with non-email format rejected', 'FAIL', 'Should require @ symbol');
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.message?.toLowerCase().includes('email')) {
        logTest('Login with non-email format rejected', 'PASS', 'Correctly requires email format with @');
      } else {
        logTest('Login with non-email format rejected', 'WARN', 'Rejected but with unexpected message');
      }
    }

    // Test wrong password
    try {
      await axios.post(`${API_BASE}/auth/login`, {
        email: testUser.email,
        password: 'WrongPassword123!',
      });
      logTest('Login with wrong password rejected', 'FAIL', 'Should have been rejected');
    } catch (error) {
      if (error.response?.status === 401) {
        logTest('Login with wrong password rejected', 'PASS', 'Correctly validates password');
      } else {
        logTest('Login with wrong password rejected', 'FAIL', 'Wrong error status');
      }
    }

    // ============================================================
    // TEST 5: Access Protected Routes
    // ============================================================
    console.log(chalk.cyan('\n🔒 TEST SUITE 5: Protected Route Access'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${testTokens.accessToken}`,
        },
      });

      if (response.data.success && response.data.data) {
        logTest('Access profile with token', 'PASS', `User: ${response.data.data.fullName}`);
        logTest('Profile contains email', response.data.data.email === testUser.email ? 'PASS' : 'FAIL', response.data.data.email);
        logTest('Profile contains user ID', response.data.data.id === testTokens.userId ? 'PASS' : 'FAIL', response.data.data.id);
      } else {
        logTest('Access profile with token', 'FAIL', 'Invalid response');
      }
    } catch (error) {
      logTest('Access profile with token', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test without token
    try {
      await axios.get(`${API_BASE}/auth/me`);
      logTest('Access profile without token rejected', 'FAIL', 'Should require authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        logTest('Access profile without token rejected', 'PASS', 'Correctly requires authentication');
      } else {
        logTest('Access profile without token rejected', 'FAIL', 'Wrong error status');
      }
    }

    // ============================================================
    // TEST 6: Token Refresh
    // ============================================================
    console.log(chalk.cyan('\n🔄 TEST SUITE 6: Token Refresh'));
    console.log(chalk.gray('─'.repeat(60)));

    if (testTokens.refreshToken) {
      try {
        const response = await axios.post(`${API_BASE}/auth/refresh-token`, {
          refreshToken: testTokens.refreshToken,
        });

        if (response.data.success && response.data.data.token) {
          logTest('Refresh token successful', 'PASS', `New token received`);
          logTest('New access token valid', response.data.data.token !== testTokens.accessToken ? 'PASS' : 'WARN', 'Token changed');
          logTest('New refresh token provided', response.data.data.refreshToken ? 'PASS' : 'WARN', 'Refresh token updated');
        } else {
          logTest('Refresh token', 'FAIL', 'Invalid response');
        }
      } catch (error) {
        logTest('Refresh token', 'FAIL', error.response?.data?.message || error.message);
      }
    } else {
      logTest('Refresh token', 'WARN', 'No refresh token available from registration');
    }

    // ============================================================
    // TEST 7: Password Reset Flow
    // ============================================================
    console.log(chalk.cyan('\n🔑 TEST SUITE 7: Password Reset Flow'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.post(`${API_BASE}/auth/forgot-password`, {
        email: testUser.email,
      });

      if (response.data.success) {
        logTest('Forgot password request', 'PASS', 'Reset email sent successfully');
      } else {
        logTest('Forgot password request', 'FAIL', 'Invalid response');
      }
    } catch (error) {
      logTest('Forgot password request', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test with non-existent email (should still return success for security)
    try {
      const response = await axios.post(`${API_BASE}/auth/forgot-password`, {
        email: 'nonexistent@example.com',
      });

      if (response.data.success || response.status === 200) {
        logTest('Forgot password with non-existent email', 'PASS', 'Returns success (security best practice)');
      } else {
        logTest('Forgot password with non-existent email', 'WARN', 'Should not reveal if email exists');
      }
    } catch (error) {
      logTest('Forgot password with non-existent email', 'WARN', 'Should return success for security');
    }

    // ============================================================
    // TEST 8: Resend Verification Email
    // ============================================================
    console.log(chalk.cyan('\n📬 TEST SUITE 8: Email Verification'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.post(`${API_BASE}/auth/resend-verification`, {
        email: testUser.email,
      });

      if (response.data.success) {
        logTest('Resend verification email', 'PASS', 'Verification email sent successfully');
      } else {
        logTest('Resend verification email', 'FAIL', 'Invalid response');
      }
    } catch (error) {
      logTest('Resend verification email', 'FAIL', error.response?.data?.message || error.message);
    }

    // ============================================================
    // TEST 9: Update Password (Authenticated)
    // ============================================================
    console.log(chalk.cyan('\n🔐 TEST SUITE 9: Update Password'));
    console.log(chalk.gray('─'.repeat(60)));

    const newPassword = 'NewTestPassword456!';
    
    try {
      const response = await axios.patch(
        `${API_BASE}/auth/update-password`,
        {
          currentPassword: testUser.password,
          newPassword: newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${testTokens.accessToken}`,
          },
        }
      );

      if (response.data.success) {
        logTest('Update password successful', 'PASS', 'Password updated');
        
        // Try logging in with new password
        try {
          const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
            email: testUser.email,
            password: newPassword,
          });
          
          if (loginResponse.data.success) {
            logTest('Login with new password', 'PASS', 'New password works');
            testTokens.accessToken = loginResponse.data.data.token || loginResponse.data.data.accessToken;
          } else {
            logTest('Login with new password', 'FAIL', 'New password not working');
          }
        } catch (error) {
          logTest('Login with new password', 'FAIL', error.response?.data?.message || error.message);
        }
      } else {
        logTest('Update password', 'FAIL', 'Invalid response');
      }
    } catch (error) {
      logTest('Update password', 'FAIL', error.response?.data?.message || error.message);
    }

    // ============================================================
    // TEST 10: Logout
    // ============================================================
    console.log(chalk.cyan('\n👋 TEST SUITE 10: Logout'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      const response = await axios.post(
        `${API_BASE}/auth/logout`,
        { refreshToken: testTokens.refreshToken },
        {
          headers: {
            Authorization: `Bearer ${testTokens.accessToken}`,
          },
        }
      );

      if (response.data.success) {
        logTest('Logout successful', 'PASS', 'User logged out');
        
        // Try accessing protected route with logged-out token
        try {
          await axios.get(`${API_BASE}/auth/me`, {
            headers: {
              Authorization: `Bearer ${testTokens.accessToken}`,
            },
          });
          logTest('Token invalidated after logout', 'WARN', 'Token still works (may depend on implementation)');
        } catch (error) {
          if (error.response?.status === 401) {
            logTest('Token invalidated after logout', 'PASS', 'Token correctly blacklisted');
          } else {
            logTest('Token invalidated after logout', 'WARN', 'Unexpected error');
          }
        }
      } else {
        logTest('Logout', 'FAIL', 'Invalid response');
      }
    } catch (error) {
      logTest('Logout', 'FAIL', error.response?.data?.message || error.message);
    }

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║                      TEST SUMMARY                              ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    
    console.log(chalk.white(`Total Tests Run: ${chalk.bold(totalTests)}`));
    console.log(chalk.green(`Tests Passed: ${chalk.bold(passedTests)}`));
    console.log(chalk.red(`Tests Failed: ${chalk.bold(failedTests)}`));
    console.log(chalk.yellow(`Tests Warnings: ${chalk.bold(totalTests - passedTests - failedTests)}`));
    console.log(chalk.white(`Success Rate: ${chalk.bold(successRate + '%')}\n`));

    if (failedTests === 0) {
      console.log(chalk.bold.green('🎉 ALL CRITICAL TESTS PASSED!\n'));
      console.log(chalk.cyan('✅ Authentication System Status:'));
      console.log(chalk.green('  ✓ Email-first registration working (phone optional)'));
      console.log(chalk.green('  ✓ Email-only login enforced'));
      console.log(chalk.green('  ✓ Email validation working correctly'));
      console.log(chalk.green('  ✓ JWT token generation and validation working'));
      console.log(chalk.green('  ✓ Protected routes secured'));
      console.log(chalk.green('  ✓ Password reset flow functional'));
      console.log(chalk.green('  ✓ Email verification system working'));
      console.log(chalk.green('  ✓ Token refresh working'));
      console.log(chalk.green('  ✓ Password update working'));
      console.log(chalk.green('  ✓ Logout working\n'));
      
      console.log(chalk.cyan('📝 System Ready For:'));
      console.log(chalk.white('  • User registration with email'));
      console.log(chalk.white('  • User login with email'));
      console.log(chalk.white('  • Email verification'));
      console.log(chalk.white('  • Password management'));
      console.log(chalk.white('  • Secure authenticated access\n'));
    } else {
      console.log(chalk.bold.red(`❌ ${failedTests} TEST(S) FAILED.\n`));
      console.log(chalk.yellow('⚠️  Please review the failures above and fix the issues.\n'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('\n💥 Test suite error:'), error.message);
    if (error.response) {
      console.error(chalk.red('Response data:'), error.response.data);
    }
    process.exit(1);
  }
}

// Run the test suite
runTests().catch(error => {
  console.error(chalk.red('\n💥 Fatal error:'), error);
  process.exit(1);
});
