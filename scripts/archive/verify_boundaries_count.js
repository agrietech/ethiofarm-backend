require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const [r, z, w] = await Promise.all([
      pool.query('SELECT count(*) FROM "Region"'),
      pool.query('SELECT count(*) FROM "Zone"'),
      pool.query('SELECT count(*) FROM "Woreda"'),
    ]);

    console.log('--- DATABASE BOUNDARIES COUNT ---');
    console.log('Regions count:', parseInt(r.rows[0].count, 10));
    console.log('Zones count:  ', parseInt(z.rows[0].count, 10));
    console.log('Woredas count:', parseInt(w.rows[0].count, 10));
  } catch (err) {
    console.error('Count query error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
