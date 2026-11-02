const { pool, prisma } = require('../src/config/db');

async function alignAllTables() {
  console.log('=== Checking and Aligning Database Columns with Prisma Schema ===\n');

  // Statements for known missing columns based on schema inspection
  const statements = [
    // Alert table columns
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "headline" TEXT;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "titleOm" TEXT;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "messageOm" TEXT;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN DEFAULT false;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "priority" INTEGER DEFAULT 1;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "actionItems" JSONB;`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "targetPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];`,
    `ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "affectedAreaKm2" DOUBLE PRECISION;`,

    // Sensor table columns
    `ALTER TABLE "Sensor" ADD COLUMN IF NOT EXISTS "secretToken" TEXT;`,
    `ALTER TABLE "Sensor" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;`,

    // SensorReading columns
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "soilMoisture" DOUBLE PRECISION;`,
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "soilTemp" DOUBLE PRECISION;`,
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "ambientTemp" DOUBLE PRECISION;`,
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "humidity" DOUBLE PRECISION;`,
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "rainfallMm" DOUBLE PRECISION;`,
    `ALTER TABLE "SensorReading" ADD COLUMN IF NOT EXISTS "batteryLevel" DOUBLE PRECISION;`,

    // Farm columns
    `ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "kebeleId" TEXT;`,
    `ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "soilType" TEXT;`,
    `ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "cropId" TEXT;`,
    `ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "areaHectares" DOUBLE PRECISION;`,
    `ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "polygonGeojson" JSONB;`,

    // AIInsight columns
    `ALTER TABLE "AIInsight" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;`,

    // DiseaseDiagnosis columns
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "plantIdSuggestionId" TEXT;`,
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;`,
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "treatmentAm" TEXT;`,
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "treatmentOm" TEXT;`,
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "preventionAm" TEXT;`,
    `ALTER TABLE "DiseaseDiagnosis" ADD COLUMN IF NOT EXISTS "preventionOm" TEXT;`,

    // SatelliteObservation columns
    `ALTER TABLE "SatelliteObservation" ADD COLUMN IF NOT EXISTS "soilClayPercent" DOUBLE PRECISION;`,
    `ALTER TABLE "SatelliteObservation" ADD COLUMN IF NOT EXISTS "soilSandPercent" DOUBLE PRECISION;`,
    `ALTER TABLE "SatelliteObservation" ADD COLUMN IF NOT EXISTS "soilSiltPercent" DOUBLE PRECISION;`,
    `ALTER TABLE "SatelliteObservation" ADD COLUMN IF NOT EXISTS "soilOrganicCarbon" DOUBLE PRECISION;`,
    `ALTER TABLE "SatelliteObservation" ADD COLUMN IF NOT EXISTS "soilPh" DOUBLE PRECISION;`
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
      console.log('✔ Applied:', sql.split('ADD COLUMN IF NOT EXISTS')[1].trim());
    } catch (err) {
      console.warn('Notice on:', sql, err.message);
    }
  }

  console.log('\n=== Database Column Alignment Complete ===');
  await pool.end();
  await prisma.$disconnect();
}

alignAllTables().catch(console.error);
