require('dotenv').config();
const { Client } = require('pg');

async function addEnumValues() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // In Postgres, ALTER TYPE ADD VALUE must run outside a transaction block
    const statements = [
      "ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'ZONAL_OFFICER'",
      "ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'REGIONAL_OFFICER'",
      "ALTER TYPE \"RequestableRole\" ADD VALUE IF NOT EXISTS 'ZONAL_OFFICER'",
      "ALTER TYPE \"RequestableRole\" ADD VALUE IF NOT EXISTS 'REGIONAL_OFFICER'",
    ];

    for (const sql of statements) {
      try {
        console.log(`Executing: ${sql}`);
        await client.query(sql);
        console.log('  -> Success');
      } catch (err) {
        console.error(`  -> Notice/Error: ${err.message}`);
      }
    }

    // Verify
    const roles = await client.query(`
      SELECT e.enumlabel FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'Role' ORDER BY e.enumsortorder;
    `);
    console.log('Verified Role enums:', roles.rows.map(r => r.enumlabel));

    const reqRoles = await client.query(`
      SELECT e.enumlabel FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'RequestableRole' ORDER BY e.enumsortorder;
    `);
    console.log('Verified RequestableRole enums:', reqRoles.rows.map(r => r.enumlabel));

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

addEnumValues();
