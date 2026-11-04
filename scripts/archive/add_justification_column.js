const { prisma } = require('../src/config/db');

async function migrate() {
  try {
    const result = await prisma.$executeRawUnsafe(
      'ALTER TABLE "RoleRequest" ADD COLUMN IF NOT EXISTS "justification" TEXT;'
    );
    console.log('Successfully added justification column to RoleRequest table:', result);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
