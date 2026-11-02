const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { prisma } = require('../src/config/db');

async function testAll5Roles() {
  console.log('Testing submission for all 5 professional upgrade roles...\n');
  
  const farmer = await prisma.user.findFirst({
    where: { role: 'FARMER' },
    select: { id: true, fullName: true, email: true, role: true }
  });

  if (!farmer) {
    console.error('No farmer found');
    process.exit(1);
  }

  const token = jwt.sign(
    { id: farmer.id, email: farmer.email, role: farmer.role },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const roles = [
    'DEVELOPMENT_AGENT',
    'WOREDA_OFFICER',
    'ZONAL_OFFICER',
    'REGIONAL_OFFICER',
    'RESEARCHER',
  ];

  for (const role of roles) {
    // Delete any existing pending request for this role
    await prisma.roleRequest.deleteMany({
      where: { userId: farmer.id, requestedRole: role }
    });

    const payload = {
      requestedRole: role,
      regionId: 'ET14',
      regionName: 'Addis Ababa',
      zoneId: 'ET1401',
      zoneName: 'Region 14',
      woredaId: 'ET140108',
      woredaName: 'Addis Ketema Sub City',
      staffIdNumber: `EMP-${role}-001`,
      organizationName: 'Ministry of Agriculture Test',
      justification: `Test justification for ${role}`,
    };

    const res = await fetch('http://localhost:5000/api/v1/auth/role-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`Role: ${role.padEnd(20)} -> Status: ${res.status} | Success: ${data.success} | ID: ${data.data?.id || data.error?.message || data.message}`);

    // Cleanup
    if (data.data?.id) {
      await prisma.roleRequest.delete({ where: { id: data.data.id } });
    }
  }

  console.log('\nAll 5 roles tested!');
  process.exit(0);
}

testAll5Roles();
