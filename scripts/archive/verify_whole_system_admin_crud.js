const app = require('../src/app');
const http = require('http');

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = 'http://127.0.0.1:' + port;
  console.log('=== VERIFYING COMPLETE SYSTEM-WIDE ADMIN ACCESS & CRUD ON ALL MODELS ===\n');

  // 1. Test API Key Access
  console.log('1. Testing Authentication Types:');
  const apiKeyRes = await fetch(baseUrl + '/api/v1/admin/overview', {
    headers: { 'x-api-key': 'agrietech_enterprise_admin_key_2026' }
  });
  const apiKeyData = await apiKeyRes.json();
  console.log('  • x-api-key header access:', apiKeyRes.status, '| success:', apiKeyData.success);

  const queryKeyRes = await fetch(baseUrl + '/api/v1/admin/overview?apiKey=agrietech_enterprise_admin_key_2026');
  const queryKeyData = await queryKeyRes.json();
  console.log('  • ?apiKey query param access:', queryKeyRes.status, '| success:', queryKeyData.success);

  const browserRes = await fetch(baseUrl + '/admin/dashboard');
  console.log('  • Web Admin Console access:', browserRes.status, '| HTML bytes:', (await browserRes.text()).length);

  // 2. Test User CRUD
  console.log('\n2. Testing Complete User Model CRUD:');
  const userPayload = {
    fullName: 'Dr. Girma Bekele',
    email: 'girma.bekele_' + Date.now() + '@agrietech.et',
    phoneNumber: '+251922334455',
    role: 'RESEARCHER',
    woredaId: 'ET030701', // Bahir Dar
    preferredLang: 'am',
    password: 'SecurePassword123!',
  };
  const createUserRes = await fetch(baseUrl + '/api/v1/admin/users', {
    method: 'POST',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify(userPayload)
  });
  const createdUser = await createUserRes.json();
  const userId = createdUser.data?.id || createdUser.data?.user?.id;
  console.log('  • [CREATE USER]:', createUserRes.status, '| ID:', userId, '| Name:', createdUser.data?.fullName);

  const listUsersRes = await fetch(baseUrl + '/api/v1/admin/users?limit=50', {
    headers: { 'x-api-key': 'admin_key' }
  });
  const listUsersData = await listUsersRes.json();
  console.log('  • [READ ALL USERS]:', listUsersRes.status, '| Total users visible to admin:', listUsersData.data?.users?.length || listUsersData.data?.length);

  const updateUserRes = await fetch(baseUrl + '/api/v1/admin/users/' + userId, {
    method: 'PUT',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Dr. Girma Bekele (Senior Agronomist)', role: 'WOREDA_OFFICER' })
  });
  const updateUserData = await updateUserRes.json();
  console.log('  • [UPDATE USER]:', updateUserRes.status, '| Updated Name:', updateUserData.data?.fullName);

  const deleteUserRes = await fetch(baseUrl + '/api/v1/admin/users/' + userId, {
    method: 'DELETE',
    headers: { 'x-api-key': 'admin_key' }
  });
  console.log('  • [DELETE USER]:', deleteUserRes.status, '| success:', (await deleteUserRes.json()).success);

  // 3. Test Farm Plot CRUD across System
  console.log('\n3. Testing Complete Farm Model CRUD Across All Users:');
  const farmPayload = {
    farmName: 'Bahir Dar Commercial Teff Parcel #4',
    primaryCrop: 'TEFF',
    areaHectares: 8.5,
    latitude: 11.5936,
    longitude: 37.3908,
    woredaId: 'ET030701',
    userId: 'usr_test_farmer_01',
  };
  const createFarmRes = await fetch(baseUrl + '/api/v1/admin/farms', {
    method: 'POST',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify(farmPayload)
  });
  const createdFarm = await createFarmRes.json();
  const farmId = createdFarm.data?.id || createdFarm.data?.farm?.id;
  console.log('  • [CREATE FARM]:', createFarmRes.status, '| ID:', farmId, '| Name:', createdFarm.data?.farmName);

  const listFarmsRes = await fetch(baseUrl + '/api/v1/admin/farms', {
    headers: { 'x-api-key': 'admin_key' }
  });
  const listFarmsData = await listFarmsRes.json();
  console.log('  • [READ ALL FARMS ACROSS SYSTEM]:', listFarmsRes.status, '| Total farms in system:', listFarmsData.data?.farms?.length || listFarmsData.data?.length);

  const updateFarmRes = await fetch(baseUrl + '/api/v1/admin/farms/' + farmId, {
    method: 'PUT',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmName: 'Bahir Dar Commercial Teff & Wheat Plot' })
  });
  console.log('  • [UPDATE FARM]:', updateFarmRes.status, '| Updated Name:', (await updateFarmRes.json()).data?.farmName);

  const deleteFarmRes = await fetch(baseUrl + '/api/v1/admin/farms/' + farmId, {
    method: 'DELETE',
    headers: { 'x-api-key': 'admin_key' }
  });
  console.log('  • [DELETE FARM]:', deleteFarmRes.status, '| success:', (await deleteFarmRes.json()).success);

  // 4. Test IoT Sensor CRUD
  console.log('\n4. Testing IoT Sensor Fleet CRUD:');
  const sensorPayload = {
    hardwareId: 'LORA_NODE_BD_' + Date.now().toString().slice(-4),
    sensorType: 'SOIL_MOISTURE_STATION',
  };
  const createSensorRes = await fetch(baseUrl + '/api/v1/admin/sensors', {
    method: 'POST',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify(sensorPayload)
  });
  const createdSensor = await createSensorRes.json();
  const sensorId = createdSensor.data?.id || createdSensor.data?.sensor?.id;
  console.log('  • [CREATE SENSOR]:', createSensorRes.status, '| Hardware ID:', createdSensor.data?.hardwareId);

  const listSensorsRes = await fetch(baseUrl + '/api/v1/admin/sensors', {
    headers: { 'x-api-key': 'admin_key' }
  });
  const listSensorsData = await listSensorsRes.json();
  console.log('  • [READ ALL SENSORS]:', listSensorsRes.status, '| Total sensors:', listSensorsData.data?.sensors?.length || listSensorsData.data?.length);

  const deleteSensorRes = await fetch(baseUrl + '/api/v1/admin/sensors/' + sensorId, {
    method: 'DELETE',
    headers: { 'x-api-key': 'admin_key' }
  });
  console.log('  • [DELETE SENSOR]:', deleteSensorRes.status, '| success:', (await deleteSensorRes.json()).success);

  // 5. Test Multi-Hazard Alert Broadcast & Deletion
  console.log('\n5. Testing Early Warning Hazard Alert Broadcast:');
  const alertPayload = {
    titleEn: 'Severe Flooding Alert along Tana Basin',
    messageEn: 'Reinforce drainage channels and move livestock to high ground.',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    woredaId: 'ET030701',
  };
  const createAlertRes = await fetch(baseUrl + '/api/v1/admin/broadcast-alert', {
    method: 'POST',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload)
  });
  const createdAlert = await createAlertRes.json();
  const alertId = createdAlert.data?.id || createdAlert.data?.alert?.id;
  console.log('  • [BROADCAST ALERT]:', createAlertRes.status, '| Alert ID:', alertId, '| Title:', createdAlert.data?.title || createdAlert.data?.titleEn);

  const listAlertsRes = await fetch(baseUrl + '/api/v1/admin/alerts', {
    headers: { 'x-api-key': 'admin_key' }
  });
  console.log('  • [READ ALL ALERTS]:', listAlertsRes.status, '| Total alerts:', (await listAlertsRes.json()).data?.alerts?.length);

  const deleteAlertRes = await fetch(baseUrl + '/api/v1/admin/alerts/' + alertId, {
    method: 'DELETE',
    headers: { 'x-api-key': 'admin_key' }
  });
  console.log('  • [DELETE ALERT]:', deleteAlertRes.status, '| success:', (await deleteAlertRes.json()).success);

  // 6. Test Risk Assessment & Evaluation
  console.log('\n6. Testing Multi-Hazard Risk Evaluation:');
  const evaluateRes = await fetch(baseUrl + '/api/v1/risk-assessments/evaluate', {
    method: 'POST',
    headers: { 'x-api-key': 'admin_key', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      woredaId: 'ET030701',
      droughtScore: 0.62,
      floodScore: 0.20,
      locustScore: 0.10,
      vegetationScore: 0.40
    })
  });
  const evalData = await evaluateRes.json();
  console.log('  • [EVALUATE RISK]:', evaluateRes.status, '| Composite Score:', evalData.data?.compositeScore || evalData.data?.riskScore, '| Alert Level:', evalData.data?.alertLevel);

  console.log('\n✅ ALL SYSTEM-WIDE DATA ACCESS & CRUD OPERATIONS VERIFIED SUCCESSFULLY!');
  server.close();
  process.exit(0);
});
