const { pool, prisma } = require('../src/config/db');

async function fixCropAndAlert() {
  console.log('--- Creating Crop Table and Fixing Alert.priority ---');

  // 1. Create Enum CropCategory if needed
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "CropCategory" AS ENUM ('CEREAL', 'PULSE', 'OILSEED', 'CASH_CROP', 'VEGETABLE', 'FRUIT');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('✔ Enum CropCategory verified');

  // 2. Create Crop table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Crop" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT UNIQUE NOT NULL,
      "nameEn" TEXT NOT NULL,
      "nameAm" TEXT NOT NULL,
      "nameOm" TEXT,
      "category" "CropCategory" DEFAULT 'CEREAL',
      "growingPeriodDays" INTEGER,
      "waterRequirementMm" DOUBLE PRECISION,
      "optimalSoilPhMin" DOUBLE PRECISION,
      "optimalSoilPhMax" DOUBLE PRECISION,
      "optimalTempMin" DOUBLE PRECISION,
      "optimalTempMax" DOUBLE PRECISION,
      "optimalElevationMin" DOUBLE PRECISION,
      "optimalElevationMax" DOUBLE PRECISION,
      "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✔ Crop table created');

  // 3. Seed common Ethiopian crops if table is empty
  const cropsCount = await pool.query(`SELECT COUNT(*) FROM "Crop";`);
  if (parseInt(cropsCount.rows[0].count, 10) === 0) {
    const crops = [
      { id: 'crop_teff_01', code: 'TEFF', nameEn: 'Teff', nameAm: 'ጤፍ', nameOm: 'Xaafee', category: 'CEREAL', growingPeriodDays: 120, waterRequirementMm: 450, optimalSoilPhMin: 5.5, optimalSoilPhMax: 7.5, optimalTempMin: 15, optimalTempMax: 27 },
      { id: 'crop_wheat_02', code: 'WHEAT', nameEn: 'Wheat', nameAm: 'ስንዴ', nameOm: 'Qamadii', category: 'CEREAL', growingPeriodDays: 130, waterRequirementMm: 500, optimalSoilPhMin: 6.0, optimalSoilPhMax: 7.5, optimalTempMin: 12, optimalTempMax: 24 },
      { id: 'crop_maize_03', code: 'MAIZE', nameEn: 'Maize', nameAm: 'በቆሎ', nameOm: 'Boqqolloo', category: 'CEREAL', growingPeriodDays: 140, waterRequirementMm: 600, optimalSoilPhMin: 5.8, optimalSoilPhMax: 7.0, optimalTempMin: 18, optimalTempMax: 30 },
      { id: 'crop_coffee_04', code: 'COFFEE', nameEn: 'Coffee Arabica', nameAm: 'ቡና', nameOm: 'Buna', category: 'CASH_CROP', growingPeriodDays: 240, waterRequirementMm: 1200, optimalSoilPhMin: 5.0, optimalSoilPhMax: 6.5, optimalTempMin: 15, optimalTempMax: 25 },
      { id: 'crop_barley_05', code: 'BARLEY', nameEn: 'Barley', nameAm: 'ገብስ', nameOm: 'Garbuu', category: 'CEREAL', growingPeriodDays: 110, waterRequirementMm: 400, optimalSoilPhMin: 6.0, optimalSoilPhMax: 8.0, optimalTempMin: 10, optimalTempMax: 20 },
      { id: 'crop_sorghum_06', code: 'SORGHUM', nameEn: 'Sorghum', nameAm: 'ማሽላ', nameOm: 'Mishingaa', category: 'CEREAL', growingPeriodDays: 130, waterRequirementMm: 450, optimalSoilPhMin: 5.5, optimalSoilPhMax: 7.8, optimalTempMin: 20, optimalTempMax: 32 }
    ];

    for (const c of crops) {
      await pool.query(`
        INSERT INTO "Crop" ("id", "code", "nameEn", "nameAm", "nameOm", "category", "growingPeriodDays", "waterRequirementMm", "optimalSoilPhMin", "optimalSoilPhMax", "optimalTempMin", "optimalTempMax")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT ("code") DO NOTHING;
      `, [c.id, c.code, c.nameEn, c.nameAm, c.nameOm, c.category, c.growingPeriodDays, c.waterRequirementMm, c.optimalSoilPhMin, c.optimalSoilPhMax, c.optimalTempMin, c.optimalTempMax]);
    }
    console.log(`✔ Seeded ${crops.length} staple Ethiopian crops`);
  }

  // 4. Fix Alert.priority type to INTEGER
  try {
    await pool.query(`ALTER TABLE "Alert" ALTER COLUMN "priority" DROP DEFAULT;`);
    await pool.query(`
      UPDATE "Alert" 
      SET "priority" = CASE 
        WHEN "priority" = 'LOW' THEN '1'
        WHEN "priority" = 'MEDIUM' THEN '2'
        WHEN "priority" = 'HIGH' THEN '3'
        WHEN "priority" = 'CRITICAL' THEN '4'
        WHEN "priority" IS NULL THEN '1'
        ELSE "priority"
      END;
    `);
    await pool.query(`ALTER TABLE "Alert" ALTER COLUMN "priority" TYPE INTEGER USING "priority"::INTEGER;`);
    await pool.query(`ALTER TABLE "Alert" ALTER COLUMN "priority" SET DEFAULT 1;`);
    console.log('✔ Alert.priority successfully converted to INTEGER DEFAULT 1');
  } catch (err) {
    console.warn('Notice on Alert.priority:', err.message);
  }

  // 5. Verify through Prisma queries
  const [cropsCountPrisma, alertPriorityPrisma] = await Promise.all([
    prisma.crop.count(),
    prisma.alert.findFirst({ select: { id: true, priority: true } })
  ]);
  console.log('Prisma Crop count:', cropsCountPrisma);
  console.log('Prisma Alert priority sample:', alertPriorityPrisma);

  await pool.end();
  await prisma.$disconnect();
  console.log('--- All DB Fixes Applied Successfully ---');
}

fixCropAndAlert().catch(console.error);
