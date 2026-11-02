const { pool } = require('../src/config/db');

async function syncUserSchema() {
  console.log('--- Checking & Syncing regionId & zoneId on User table in Supabase ---');

  const statements = [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "regionId" TEXT;`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;`
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
      console.log('Executed:', sql);
    } catch (e) {
      console.error('Error executing:', sql, e.message);
    }
  }

  const updatedRes = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'User';
  `);
  console.log('All Synced columns on User:', updatedRes.rows.map(r => r.column_name).join(', '));

  await pool.end();
}

syncUserSchema().catch(console.error);
