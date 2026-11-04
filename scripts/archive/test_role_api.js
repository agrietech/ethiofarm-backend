// Directly test the role request by simulating what the frontend does,
// bypassing login by creating a valid JWT token

const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { prisma } = require('../src/config/db');

async function testRoleRequestFlow() {
  try {
    // 1. Get a FARMER user
    const farmer = await prisma.user.findFirst({
      where: { role: 'FARMER' },
      select: { id: true, fullName: true, email: true, phoneNumber: true, role: true },
    });
    console.log('Test farmer:', JSON.stringify(farmer));

    if (!farmer) {
      console.error('No FARMER user found');
      process.exit(1);
    }

    // 2. Create a valid JWT token for this user
    const token = jwt.sign(
      { id: farmer.id, email: farmer.email, role: farmer.role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('JWT created for:', farmer.email);

    // 3. Get boundary data
    const regionsRes = await fetch('http://localhost:5000/api/v1/boundaries/regions', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const regionsData = await regionsRes.json();
    console.log('\nRegions response status:', regionsRes.status);
    const firstRegion = regionsData.data?.[0];
    console.log('First region keys:', firstRegion ? Object.keys(firstRegion) : 'no data');
    console.log('First region:', JSON.stringify({ id: firstRegion?.id, nameEn: firstRegion?.nameEn, code: firstRegion?.code }));

    if (!firstRegion) {
      console.error('No regions returned!');
      process.exit(1);
    }

    // Get zones
    const zonesRes = await fetch(`http://localhost:5000/api/v1/boundaries/zones?regionId=${firstRegion.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const zonesData = await zonesRes.json();
    const firstZone = zonesData.data?.[0];
    console.log('First zone:', JSON.stringify({ id: firstZone?.id, nameEn: firstZone?.nameEn }));

    // Get woredas
    const woredasRes = await fetch(`http://localhost:5000/api/v1/boundaries/woredas?zoneId=${firstZone?.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const woredasData = await woredasRes.json();
    const firstWoreda = woredasData.data?.[0];
    console.log('First woreda:', JSON.stringify({ id: firstWoreda?.id, nameEn: firstWoreda?.nameEn }));

    // 4. NOW submit role request - simulating what the Flutter frontend sends
    //    The frontend uses hierarchy.selectedRegion?.name which is mapped from nameEn
    const payload = {
      requestedRole: 'DEVELOPMENT_AGENT',
      regionId: firstRegion.id,
      regionName: firstRegion.nameEn,
      zoneId: firstZone?.id,
      zoneName: firstZone?.nameEn,
      woredaId: firstWoreda?.id,
      woredaName: firstWoreda?.nameEn,
      staffIdNumber: 'EMP-TEST-001',
      organizationName: 'Ministry of Agriculture Test',
      justification: 'API integration test',
    };
    console.log('\nSubmitting role request:', JSON.stringify(payload, null, 2));

    const roleRes = await fetch('http://localhost:5000/api/v1/auth/role-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const roleData = await roleRes.json();
    console.log('\n=== ROLE REQUEST RESULT ===');
    console.log('Status:', roleRes.status);
    console.log('Response:', JSON.stringify(roleData, null, 2));

    // Cleanup
    if (roleData.data?.id) {
      await prisma.roleRequest.delete({ where: { id: roleData.data.id } });
      console.log('\nTest request cleaned up successfully');
    }

  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testRoleRequestFlow();
