const { prisma } = require('../src/config/db');

async function checkRoleRequest() {
  try {
    // Check columns
    // Check enum values
    const roleEnums = await prisma['$queryRawUnsafe'](`
      SELECT e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'Role';
    `);
    console.log('Role enum values in DB:', roleEnums);
    const reqEnums = await prisma['$queryRawUnsafe'](`
      SELECT e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'RequestableRole';
    `);
    console.log('RequestableRole enum values in DB:', reqEnums);

    // Try to count existing requests
    const count = await prisma.roleRequest.count();
    console.log('Total role requests in DB:', count);

    // List any existing requests
    const requests = await prisma.roleRequest.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    console.log('Recent requests:', JSON.stringify(requests, null, 2));

    // Check for any FARMER users who could make requests
    const farmers = await prisma.user.findMany({
      where: { role: 'FARMER' },
      select: { id: true, fullName: true, email: true, role: true },
      take: 3,
    });
    console.log('Sample FARMER users:', JSON.stringify(farmers, null, 2));

    // Check the User model relations
    const userRelations = await prisma.user.findFirst({
      select: { id: true, fullName: true, role: true, regionId: true, zoneId: true, woredaId: true },
    });
    console.log('Sample user with location fields:', JSON.stringify(userRelations, null, 2));

  } catch (e) {
    console.error('ERROR:', e.message);
    if (e.code) console.error('Prisma error code:', e.code);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

checkRoleRequest();
