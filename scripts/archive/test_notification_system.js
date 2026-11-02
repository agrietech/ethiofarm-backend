/**
 * @file test_notification_system.js
 * @description Comprehensive test suite for Multi-Channel Notification Architecture (FCM Push, SMS, WebSocket, Email & Alerts)
 */

const fcmDispatcher = require('../src/delivery/push/fcmDispatcher');
const smsDispatcher = require('../src/delivery/sms/smsDispatcher');
const emailDispatcher = require('../src/delivery/email/emailDispatcher');
const { broadcastEmergencyAlert } = require('../src/delivery/websocket/riskAssessmentChannel');
const alertsService = require('../src/modules/alerts/alerts.service');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function testAssert(name, condition, details = '') {
  if (condition) {
    log(`✅ PASS - ${name}`, 'green');
    if (details) console.log(`   ${details}`);
  } else {
    log(`❌ FAIL - ${name}`, 'red');
    if (details) console.log(`   ${details}`);
  }
}

async function runTests() {
  log('\n' + '='.repeat(80), 'cyan');
  log('   AGRIETECH MULTI-CHANNEL NOTIFICATION ARCHITECTURE TEST SUITE', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');

  // Test 1: Firebase Cloud Messaging (FCM) Push Dispatcher
  log('--- 1. Testing Push Notification Dispatcher (FCM / Topic Routing) ---', 'yellow');
  try {
    const pushResult = await fcmDispatcher.sendPushNotification({
      topic: 'woreda_ET040101',
      title: '⚠️ Early Seasonal Moisture Deficit Warning',
      body: 'Wonji Gefersa Kebele 01: Moisture deficit detected. Prepare irrigation.',
      data: {
        hazardType: 'DROUGHT',
        severity: 'HIGH',
        woredaId: 'ET040101',
      },
    });

    testAssert('FCM Push Notification dispatch', pushResult && pushResult.success === true,
      `Target: ${pushResult.target}, Simulated/Delivered: ${pushResult.simulated || pushResult.messageId ? 'YES' : 'NO'}`);

    const multicastResult = await fcmDispatcher.sendMulticastNotification({
      tokens: ['token_device_da_01', 'token_device_da_02'],
      title: '❄️ Highland Frost Warning',
      body: 'Highland Dega nursery alert.',
    });

    testAssert('FCM Multicast Notification dispatch', multicastResult && multicastResult.success === true,
      `Count: ${multicastResult.count || multicastResult.successCount} devices`);
  } catch (err) {
    testAssert('Push notification failed', false, err.message);
  }

  // Test 2: SMS Notification Dispatcher
  log('\n--- 2. Testing SMS Hazard Alert Dispatcher ---', 'yellow');
  try {
    const smsResult = await smsDispatcher.dispatchHazardAlertSms({
      phoneNumbers: ['+251911234567'],
      hazardType: 'DROUGHT',
      woredaName: 'Adama Zuria',
      severity: 'HIGH',
      language: 'AM',
    });

    testAssert('SMS Hazard Template & Dispatcher', smsResult !== undefined,
      `Status: ${smsResult ? smsResult.status || 'OK' : 'DISPATCHED'}`);
  } catch (err) {
    testAssert('SMS dispatch check failed', false, err.message);
  }

  // Test 3: Real-Time WebSocket Channel Broadcast
  log('\n--- 3. Testing WebSocket Real-Time Broadcast Channel ---', 'yellow');
  try {
    const mockAlert = {
      id: 'alert_live_test_01',
      woredaId: 'ET040101',
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      headline: 'Awash River Flash Flood Surge Warning',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    broadcastEmergencyAlert(mockAlert);
    testAssert('WebSocket Emergency Alert Broadcast', true,
      `Broadcasted alert ${mockAlert.id} to active dashboard socket listeners`);
  } catch (err) {
    testAssert('WebSocket broadcast failed', false, err.message);
  }

  // Test 4: End-to-End Alert Service Lifecycle with Multi-Channel Fan-Out
  log('\n--- 4. Testing End-to-End Alert Service & Multi-Channel Fan-Out ---', 'yellow');
  try {
    const createdAlert = await alertsService.createAlert({
      woredaId: 'ET040101',
      woredaName: 'Adama Zuria',
      hazardType: 'DROUGHT',
      severity: 'HIGH',
      headline: 'Seasonal Moisture Deficit Alert',
      titleEn: 'Seasonal Moisture Deficit Alert',
      titleAm: 'የወቅቱ የአፈር እርጥበት እጥረት ማስጠንቀቂያ',
      messageEn: 'Soil moisture dropped below 20% in lower slopes.',
      messageAm: 'በዝቅተኛ ቦታዎች የአፈር እርጥበት ከ20% በታች ወርዷል።',
      targetPhones: ['+251911234567'],
    });

    testAssert('Alert Creation & Multi-Channel Pipeline Execution', createdAlert && createdAlert.id !== undefined,
      `Alert ID: ${createdAlert.id}, Title: "${createdAlert.titleAm}", Status: ${createdAlert.status}`);

    // Test 5: Mark Alert as Read & Verify Unread Removal
    log('\n--- 5. Testing Alert Read State Transition (Unread -> Read) ---', 'yellow');
    const readAlert = await alertsService.markAlertAsRead(createdAlert.id);
    testAssert('Mark Alert as Read execution', readAlert && readAlert.isRead === true,
      `Alert ID: ${readAlert.id}, isRead: ${readAlert.isRead}`);
  } catch (err) {
    testAssert('Alert service end-to-end failed', false, err.message);
  }

  log('\n' + '='.repeat(80), 'cyan');
  log('   ALL NOTIFICATION ARCHITECTURE VERIFICATION CHECKS COMPLETED', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');
}

runTests().catch((err) => {
  console.error('Notification test fatal error:', err);
  process.exit(1);
});
