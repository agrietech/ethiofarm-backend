/**
 * @file migrate_add_zone_region_officers.js
 * @description Idempotently adds 'ZONAL_OFFICER' and 'REGIONAL_OFFICER' to PostgreSQL Role & RequestableRole enums.
 */
require('dotenv').config();
const { pool } = require('../src/config/db');
const logger = require('../src/utils/logger');

async function migrate() {
  logger.info('[Migration] Adding ZONAL_OFFICER and REGIONAL_OFFICER to Role enums...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN;');

    // Alter Role Enum
    await client.query(`
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ZONAL_OFFICER';
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'REGIONAL_OFFICER';
    `);

    // Alter RequestableRole Enum
    await client.query(`
      ALTER TYPE "RequestableRole" ADD VALUE IF NOT EXISTS 'ZONAL_OFFICER';
      ALTER TYPE "RequestableRole" ADD VALUE IF NOT EXISTS 'REGIONAL_OFFICER';
    `);

    await client.query('COMMIT;');
    logger.info('[Migration] Successfully added ZONAL_OFFICER and REGIONAL_OFFICER to database enums.');
  } catch (error) {
    await client.query('ROLLBACK;');
    logger.error(`[Migration] Failed to add officer roles: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
