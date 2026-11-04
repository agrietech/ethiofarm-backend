const { pool, prisma } = require('../src/config/db');

async function fixActionItems() {
  console.log('--- Converting Alert.actionItems to JSONB ---');

  await pool.query(`ALTER TABLE "Alert" ALTER COLUMN "actionItems" DROP DEFAULT;`);
  await pool.query(`
    ALTER TABLE "Alert" 
    ALTER COLUMN "actionItems" TYPE JSONB USING to_jsonb("actionItems");
  `);
  await pool.query(`ALTER TABLE "Alert" ALTER COLUMN "actionItems" SET DEFAULT '[]'::jsonb;`);

  console.log('✔ Alert.actionItems successfully converted to JSONB');

  // Verify Prisma query
  const res = await prisma.alert.findMany({
    take: 5,
    include: { woreda: { select: { nameEn: true, nameAm: true } } }
  });
  console.log('✔ prisma.alert.findMany with actionItems succeeded! Returned count:', res.length);
  console.log('Sample alert actionItems:', res[0]?.actionItems);

  await pool.end();
  await prisma.$disconnect();
}

fixActionItems().catch(console.error);
