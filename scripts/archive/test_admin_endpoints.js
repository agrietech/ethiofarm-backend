const app = require('../src/app');
const http = require('http');

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = 'http://127.0.0.1:' + port;
  console.log('Testing Admin Endpoints on', baseUrl);

  const endpoints = [
    '/admin/dashboard',
    '/api/v1/admin/overview',
    '/api/v1/admin/users',
    '/api/v1/admin/farms',
    '/api/v1/admin/sensors',
    '/api/v1/admin/alerts',
    '/api/v1/admin/diagnoses',
    '/api/v1/admin/role-requests',
    '/api/v1/admin/system/health',
    '/api/v1/admin/audit-logs',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(baseUrl + ep);
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        console.log(`✅ ${ep} -> Status ${res.status} | success: ${data.success}`);
        if (!data.success) console.log('  Error:', data);
        else if (data.data) {
          const keys = Object.keys(data.data);
          console.log(`     data keys: ${keys.join(', ')}`);
        }
      } else {
        const text = await res.text();
        console.log(`✅ ${ep} -> Status ${res.status} | HTML length: ${text.length}`);
      }
    } catch (err) {
      console.log(`❌ ${ep} -> ${err.message}`);
    }
  }

  // Also test CRUD operations:
  console.log('\n--- Testing CRUD Operations ---');
  
  // 1. Create user
  let createdUserId = null;
  try {
    const createRes = await fetch(baseUrl + '/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Agri Admin User',
        email: 'test_admin_user_' + Date.now() + '@agrietech.et',
        phoneNumber: '+251988776655',
        role: 'DEVELOPMENT_AGENT',
        password: 'Password123!',
        preferredLang: 'am',
      }),
    });
    const createData = await createRes.json();
    console.log('User Create:', createRes.status, createData.success, createData.data?.id || createData.data?.user?.id);
    createdUserId = createData.data?.id || createData.data?.user?.id;
  } catch (err) {
    console.log('User Create failed:', err.message);
  }

  // 2. Update user
  if (createdUserId) {
    try {
      const updateRes = await fetch(baseUrl + '/api/v1/admin/users/' + createdUserId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Updated Agri Admin User',
          role: 'WOREDA_OFFICER',
        }),
      });
      const updateData = await updateRes.json();
      console.log('User Update:', updateRes.status, updateData.success, updateData.data?.fullName || updateData.data?.user?.fullName);
    } catch (err) {
      console.log('User Update failed:', err.message);
    }

    // 3. Delete user
    try {
      const deleteRes = await fetch(baseUrl + '/api/v1/admin/users/' + createdUserId, {
        method: 'DELETE',
      });
      const deleteData = await deleteRes.json();
      console.log('User Delete:', deleteRes.status, deleteData.success);
    } catch (err) {
      console.log('User Delete failed:', err.message);
    }
  }

  // 4. Create Farm
  let createdFarmId = null;
  try {
    const createFarmRes = await fetch(baseUrl + '/api/v1/admin/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmName: 'Bahir Dar Model Farm',
        primaryCrop: 'MAIZE',
        areaHectares: 4.5,
        latitude: 11.5936,
        longitude: 37.3908,
      }),
    });
    const createFarmData = await createFarmRes.json();
    console.log('Farm Create:', createFarmRes.status, createFarmData.success, createFarmData.data?.id || createFarmData.data?.farm?.id);
    createdFarmId = createFarmData.data?.id || createFarmData.data?.farm?.id;
  } catch (err) {
    console.log('Farm Create failed:', err.message);
  }

  // 5. Delete Farm
  if (createdFarmId) {
    try {
      const deleteFarmRes = await fetch(baseUrl + '/api/v1/admin/farms/' + createdFarmId, {
        method: 'DELETE',
      });
      const deleteFarmData = await deleteFarmRes.json();
      console.log('Farm Delete:', deleteFarmRes.status, deleteFarmData.success);
    } catch (err) {
      console.log('Farm Delete failed:', err.message);
    }
  }

  // 6. Broadcast Emergency Alert
  let createdAlertId = null;
  try {
    const alertRes = await fetch(baseUrl + '/api/v1/admin/broadcast-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleEn: 'Severe Frost Warning in Highland Zones',
        messageEn: 'Protect vulnerable seedlings and apply mulch cover immediately.',
        hazardType: 'FROST',
        severity: 'HIGH',
      }),
    });
    const alertData = await alertRes.json();
    console.log('Alert Broadcast:', alertRes.status, alertData.success, alertData.data?.id || alertData.data?.alert?.id);
    createdAlertId = alertData.data?.id || alertData.data?.alert?.id;
  } catch (err) {
    console.log('Alert Broadcast failed:', err.message);
  }

  // 7. Delete Alert
  if (createdAlertId) {
    try {
      const deleteAlertRes = await fetch(baseUrl + '/api/v1/admin/alerts/' + createdAlertId, {
        method: 'DELETE',
      });
      const deleteAlertData = await deleteAlertRes.json();
      console.log('Alert Delete:', deleteAlertRes.status, deleteAlertData.success);
    } catch (err) {
      console.log('Alert Delete failed:', err.message);
    }
  }

  server.close();
  process.exit(0);
});
