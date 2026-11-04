const { prisma, connectDB, disconnectDB } = require('../src/config/db');
const logger = require('../src/utils/logger');

async function main() {
  await connectDB();
  logger.info('[Migration] Creating VaccinationCampaign table safely (additive)...');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VaccinationCampaign" (
      "id" TEXT NOT NULL,
      "woredaId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "diseaseTarget" TEXT NOT NULL,
      "animalType" TEXT,
      "targetSpecies" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "targetCount" INTEGER NOT NULL DEFAULT 0,
      "vaccinatedCount" INTEGER NOT NULL DEFAULT 0,
      "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endDate" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      "administeredBy" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "VaccinationCampaign_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "VaccinationCampaign_woredaId_fkey" FOREIGN KEY ("woredaId") REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "VaccinationCampaign_woredaId_status_idx" ON "VaccinationCampaign"("woredaId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "VaccinationCampaign_diseaseTarget_idx" ON "VaccinationCampaign"("diseaseTarget");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "VaccinationCampaign_startDate_idx" ON "VaccinationCampaign"("startDate");
  `);

  logger.info('[Migration] VaccinationCampaign table and indexes created successfully!');
  await disconnectDB();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
