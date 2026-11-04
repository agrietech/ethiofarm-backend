const { prisma } = require('../src/config/db');

async function testRoleRequestEndpoint() {
  try {
    // 1. Find a real user with FARMER role
    const farmer = await prisma.user.findFirst({
      where: { role: 'FARMER' },
      select: { id: true, fullName: true, email: true, phoneNumber: true, role: true },
    });
    console.log('Test farmer:', farmer);

    if (!farmer) {
      console.error('No FARMER user found to test with');
      process.exit(1);
    }

    // 2. Check boundaries exist in database
    const regionCount = await prisma.region.count();
    const zoneCount = await prisma.zone.count();
    const woredaCount = await prisma.woreda.count();
    console.log(`\nBoundaries: ${regionCount} regions, ${zoneCount} zones, ${woredaCount} woredas`);

    // Get a valid region/zone/woreda combo
    const woreda = await prisma.woreda.findFirst({
      include: {
        zone: {
          include: { region: true }
        }
      }
    });
    
    if (!woreda) {
      console.error('No woreda boundary data found!');
      process.exit(1);
    }
    
    console.log(`\nTest boundary: Region=${woreda.zone.region.nameEn} (${woreda.zone.region.id}), Zone=${woreda.zone.nameEn} (${woreda.zone.id}), Woreda=${woreda.nameEn} (${woreda.id})`);

    // 3. Simulate role request creation (same as what the service does)
    console.log('\n--- Simulating role request creation ---');
    const roleRequest = await prisma.roleRequest.create({
      data: {
        userId: farmer.id,
        userName: farmer.fullName,
        userPhone: farmer.phoneNumber,
        userEmail: farmer.email,
        currentRole: farmer.role,
        requestedRole: 'DEVELOPMENT_AGENT',
        regionId: woreda.zone.region.id,
        regionName: woreda.zone.region.nameEn,
        zoneId: woreda.zone.id,
        zoneName: woreda.zone.nameEn,
        woredaId: woreda.id,
        woredaName: woreda.nameEn,
        staffIdNumber: 'TEST-001',
        organizationName: 'Test Organization',
        justification: 'Diagnostic test request',
        status: 'PENDING',
      },
    });
    console.log('SUCCESS! Created role request:', JSON.stringify(roleRequest, null, 2));

    // Clean up test record
    await prisma.roleRequest.delete({ where: { id: roleRequest.id } });
    console.log('Test record cleaned up.');

  } catch (e) {
    console.error('\nFAILED:', e.message);
    if (e.code) console.error('Prisma error code:', e.code);
    if (e.meta) console.error('Meta:', JSON.stringify(e.meta));
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testRoleRequestEndpoint();
