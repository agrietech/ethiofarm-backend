#!/usr/bin/env node
/**
 * Role Request System - Comprehensive Test Script
 * Tests the hierarchical role application and approval workflow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/v1';
let farmerToken = null;
let woredaOfficerToken = null;
let adminToken = null;
let farmerId = null;
let roleRequestId = null;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  log(title, 'blue');
  console.log('='.repeat(70));
}

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const statusColor = passed ? 'green' : 'red';
  log(`${status} - ${name}`, statusColor);
  if (details) {
    console.log(`   ${details}`);
  }
}

async function setup() {
  logSection('SETUP: Creating Test Users');

  try {
    // Create Farmer
    log('Creating Farmer user...', 'yellow');
    const farmerRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: `farmer_${Date.now()}@test.com`,
      password: 'TestPass123',
      fullName: 'Tadesse Bekele',
      phoneNumber: `+251911${Math.floor(Math.random() * 1000000)}`,
      role: 'FARMER',
    });
    farmerToken = farmerRes.data.data.accessToken;
    farmerId = farmerRes.data.data.user.id;
    logTest('Farmer created', true, `ID: ${farmerId}`);

    // Create Woreda Officer
    log('\nCreating Woreda Officer user...', 'yellow');
    const woredaRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: `woreda_officer_${Date.now()}@test.com`,
      password: 'TestPass123',
      fullName: 'Alemayehu Worku',
      phoneNumber: `+251912${Math.floor(Math.random() * 1000000)}`,
      role: 'FARMER',
    });
    woredaOfficerToken = woredaRes.data.data.accessToken;

    // Manually upgrade to WOREDA_OFFICER (in production, admin would do this)
    const { prisma } = require('../src/config/db');
    const woredaEmail = woredaRes.data.data.user.email;
    await prisma.user.update({
      where: { id: woredaRes.data.data.user.id },
      data: { role: 'WOREDA_OFFICER', woredaId: 'ET040101' },
    });
    // Log in to get token with WOREDA_OFFICER role
    const woredaLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: woredaEmail,
      password: 'TestPass123',
    });
    woredaOfficerToken = woredaLogin.data.data.accessToken;
    logTest('Woreda Officer created & logged in', true, `ID: ${woredaRes.data.data.user.id}`);

    // Create Admin
    log('\nCreating Admin user...', 'yellow');
    const adminEmail = `admin_${Date.now()}@test.com`;
    const adminRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: adminEmail,
      password: 'TestPass123',
      fullName: 'Admin Tesfa',
      phoneNumber: `+251913${Math.floor(Math.random() * 1000000)}`,
      role: 'FARMER',
    });

    await prisma.user.update({
      where: { id: adminRes.data.data.user.id },
      data: { role: 'ADMIN' },
    });
    // Log in to get token with ADMIN role
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: adminEmail,
      password: 'TestPass123',
    });
    adminToken = adminLogin.data.data.accessToken;
    logTest('Admin created & logged in', true, `ID: ${adminRes.data.data.user.id}`);

    return true;
  } catch (error) {
    logTest('Setup', false, error.message);
    return false;
  }
}

async function testSubmitRoleRequest() {
  logSection('TEST 1: Submit Role Upgrade Request (Farmer → Development Agent)');

  try {
    log('Submitting role request as Farmer...', 'yellow');
    const response = await axios.post(
      `${BASE_URL}/auth/role-requests`,
      {
        requestedRole: 'DEVELOPMENT_AGENT',
        regionId: 'ET04',
        regionName: 'Oromia',
        zoneId: 'ET0401',
        zoneName: 'East Shewa',
        woredaId: 'ET040101',
        woredaName: 'Adama Zuria',
        kebeleName: 'Wonji Gefersa Kebele 02',
        staffIdNumber: 'DA-ETH-2026-8812',
        organizationName: 'Adama Woreda Office of Agriculture',
      },
      {
        headers: { Authorization: `Bearer ${farmerToken}` },
      }
    );

    roleRequestId = response.data.data.id;
    const passed =
      response.status === 201 &&
      response.data.success === true &&
      response.data.data.status === 'PENDING' &&
      response.data.data.requestedRole === 'DEVELOPMENT_AGENT';

    logTest(
      'Submit role request',
      passed,
      `Request ID: ${roleRequestId}, Status: ${response.data.data.status}`
    );

    return passed;
  } catch (error) {
    logTest(
      'Submit role request',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testDuplicateRequest() {
  logSection('TEST 2: Prevent Duplicate Pending Requests');

  try {
    log('Attempting to submit duplicate request...', 'yellow');
    await axios.post(
      `${BASE_URL}/auth/role-requests`,
      {
        requestedRole: 'DEVELOPMENT_AGENT',
        regionId: 'ET04',
        regionName: 'Oromia',
        zoneId: 'ET0401',
        zoneName: 'East Shewa',
        woredaId: 'ET040101',
        woredaName: 'Adama Zuria',
        staffIdNumber: 'DA-ETH-2026-8812',
        organizationName: 'Adama Woreda Office of Agriculture',
      },
      {
        headers: { Authorization: `Bearer ${farmerToken}` },
      }
    );

    logTest('Prevent duplicate', false, 'Should have rejected duplicate request');
    return false;
  } catch (error) {
    const passed = error.response?.status === 400;
    logTest(
      'Prevent duplicate',
      passed,
      passed ? 'Correctly rejected duplicate request' : error.message
    );
    return passed;
  }
}

async function testGetMyRequests() {
  logSection('TEST 3: Get User\'s Own Role Requests');

  try {
    log('Fetching user\'s role requests...', 'yellow');
    const response = await axios.get(`${BASE_URL}/auth/role-requests/my-requests`, {
      headers: { Authorization: `Bearer ${farmerToken}` },
    });

    const passed =
      response.status === 200 &&
      response.data.success === true &&
      response.data.data.requests.length > 0 &&
      response.data.data.requests[0].id === roleRequestId;

    logTest(
      'Get my requests',
      passed,
      `Found ${response.data.data.total} request(s)`
    );

    return passed;
  } catch (error) {
    logTest(
      'Get my requests',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testGetPendingRequestsWoreda() {
  logSection('TEST 4: Get Pending Requests (Woreda Officer - Hierarchical)');

  try {
    log('Fetching pending requests as Woreda Officer...', 'yellow');
    const response = await axios.get(`${BASE_URL}/auth/role-requests/pending`, {
      headers: { Authorization: `Bearer ${woredaOfficerToken}` },
    });

    const passed =
      response.status === 200 &&
      response.data.success === true &&
      response.data.data.requests.length > 0 &&
      response.data.data.requests[0].woredaId === 'ET040101';

    logTest(
      'Get pending requests (Woreda)',
      passed,
      `Found ${response.data.data.total} request(s) for their woreda`
    );

    return passed;
  } catch (error) {
    logTest(
      'Get pending requests (Woreda)',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testGetPendingRequestsAdmin() {
  logSection('TEST 5: Get Pending Requests (Admin - All Access)');

  try {
    log('Fetching pending requests as Admin...', 'yellow');
    const response = await axios.get(`${BASE_URL}/auth/role-requests/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const passed = response.status === 200 && response.data.success === true;

    logTest(
      'Get pending requests (Admin)',
      passed,
      `Admin can view ${response.data.data.total} request(s) nationwide`
    );

    return passed;
  } catch (error) {
    logTest(
      'Get pending requests (Admin)',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testApproveRequest() {
  logSection('TEST 6: Approve Role Request (Woreda Officer)');

  try {
    log('Approving role request...', 'yellow');
    const response = await axios.post(
      `${BASE_URL}/auth/role-requests/${roleRequestId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${woredaOfficerToken}` },
      }
    );

    const passed =
      response.status === 200 &&
      response.data.success === true &&
      response.data.data.status === 'APPROVED';

    logTest('Approve request', passed, `Status: ${response.data.data.status}`);

    // Verify user role was updated
    if (passed) {
      log('\nVerifying user role was updated...', 'yellow');
      const { prisma } = require('../src/config/db');
      const user = await prisma.user.findUnique({
        where: { id: farmerId },
        select: { role: true },
      });

      const roleUpdated = user.role === 'DEVELOPMENT_AGENT';
      logTest(
        'User role updated',
        roleUpdated,
        `New role: ${user.role}`
      );

      return passed && roleUpdated;
    }

    return passed;
  } catch (error) {
    logTest(
      'Approve request',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testRejectRequest() {
  logSection('TEST 7: Reject Role Request (Admin)');

  try {
    // Create a new request for rejection test
    log('Creating new role request for rejection test...', 'yellow');
    const farmer2 = await axios.post(`${BASE_URL}/auth/register`, {
      email: `farmer2_${Date.now()}@test.com`,
      password: 'TestPass123',
      fullName: 'Researcher Candidate',
      phoneNumber: `+251914${Math.floor(Math.random() * 1000000)}`,
      role: 'FARMER',
    });
    const farmer2Token = farmer2.data.data.accessToken;

    const newRequest = await axios.post(
      `${BASE_URL}/auth/role-requests`,
      {
        requestedRole: 'RESEARCHER',
        regionId: 'ET04',
        regionName: 'Oromia',
        zoneId: 'ET0401',
        zoneName: 'East Shewa',
        woredaId: 'ET040101',
        woredaName: 'Adama Zuria',
        staffIdNumber: 'RES-ETH-2026-9912',
        organizationName: 'Agricultural Research Institute',
      },
      {
        headers: { Authorization: `Bearer ${farmer2Token}` },
      }
    );

    log('Rejecting role request...', 'yellow');
    const response = await axios.post(
      `${BASE_URL}/auth/role-requests/${newRequest.data.data.id}/reject`,
      {
        rejectionReason: 'Staff ID verification failed with Woreda HR.',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const passed =
      response.status === 200 &&
      response.data.success === true &&
      response.data.data.status === 'REJECTED' &&
      response.data.data.rejectionReason === 'Staff ID verification failed with Woreda HR.';

    logTest(
      'Reject request',
      passed,
      `Status: ${response.data.data.status}, Reason: ${response.data.data.rejectionReason}`
    );

    return passed;
  } catch (error) {
    logTest(
      'Reject request',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testHierarchicalPermissions() {
  logSection('TEST 8: Hierarchical Permission Enforcement');

  try {
    log('Testing cross-woreda approval block...', 'yellow');

    const farmer3 = await axios.post(`${BASE_URL}/auth/register`, {
      email: `farmer3_${Date.now()}@test.com`,
      password: 'TestPass123',
      fullName: 'Amhara Candidate',
      phoneNumber: `+251915${Math.floor(Math.random() * 1000000)}`,
      role: 'FARMER',
    });
    const farmer3Token = farmer3.data.data.accessToken;

    // Create a request for a different woreda
    const otherWoredaRequest = await axios.post(
      `${BASE_URL}/auth/role-requests`,
      {
        requestedRole: 'DEVELOPMENT_AGENT',
        regionId: 'ET03',
        regionName: 'Amhara',
        zoneId: 'ET0301',
        zoneName: 'North Shewa',
        woredaId: 'ET030101',
        woredaName: 'Debre Berhan',
        staffIdNumber: 'DA-ETH-2026-7711',
        organizationName: 'Debre Berhan Woreda Office',
      },
      {
        headers: { Authorization: `Bearer ${farmer3Token}` },
      }
    );

    // Try to approve with woreda officer from different woreda
    try {
      await axios.post(
        `${BASE_URL}/auth/role-requests/${otherWoredaRequest.data.data.id}/approve`,
        {},
        {
          headers: { Authorization: `Bearer ${woredaOfficerToken}` },
        }
      );

      logTest('Cross-woreda block', false, 'Should have blocked cross-woreda approval');
      return false;
    } catch (error) {
      const passed = error.response?.status === 403;
      logTest(
        'Cross-woreda block',
        passed,
        passed ? 'Correctly blocked cross-woreda approval' : error.message
      );
      return passed;
    }
  } catch (error) {
    logTest(
      'Hierarchical permissions',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function testGetStats() {
  logSection('TEST 9: Get Role Request Statistics (Admin)');

  try {
    log('Fetching role request statistics...', 'yellow');
    const response = await axios.get(`${BASE_URL}/auth/role-requests/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const passed = response.status === 200 && response.data.success === true;

    logTest(
      'Get statistics',
      passed,
      `Total: ${response.data.data.total}, Pending: ${response.data.data.pending}, Approved: ${response.data.data.approved}, Rejected: ${response.data.data.rejected}`
    );

    return passed;
  } catch (error) {
    logTest(
      'Get statistics',
      false,
      error.response?.data?.error?.message || error.message
    );
    return false;
  }
}

async function runTests() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════════╗', 'blue');
  log('║     ROLE REQUEST SYSTEM - COMPREHENSIVE TEST SUITE                   ║', 'blue');
  log('╚══════════════════════════════════════════════════════════════════════╝', 'blue');

  const results = {
    passed: 0,
    failed: 0,
  };

  // Setup
  const setupSuccess = await setup();
  if (!setupSuccess) {
    log('\n❌ Setup failed. Aborting tests.', 'red');
    process.exit(1);
  }

  // Run tests
  const tests = [
    testSubmitRoleRequest,
    testDuplicateRequest,
    testGetMyRequests,
    testGetPendingRequestsWoreda,
    testGetPendingRequestsAdmin,
    testApproveRequest,
    testRejectRequest,
    testHierarchicalPermissions,
    testGetStats,
  ];

  for (const test of tests) {
    const result = await test();
    if (result) {
      results.passed++;
    } else {
      results.failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  logSection('TEST SUMMARY');
  log(`Total Tests: ${results.passed + results.failed}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
  log(`\nSuccess Rate: ${successRate}%`, successRate === '100.0' ? 'green' : 'yellow');

  console.log('\n' + '='.repeat(70) + '\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  log('\n❌ Unexpected error:', 'red');
  console.error(error);
  process.exit(1);
});
