const { pool, prisma } = require('../src/config/db');

async function createMissingTables() {
  console.log('=== Creating Missing Database Tables for Prisma Schema ===\n');

  const statements = [
    // 1. DataSourceSyncLog
    `CREATE TABLE IF NOT EXISTS "DataSourceSyncLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "source" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "recordsIngested" INTEGER NOT NULL DEFAULT 0,
      "recordsFailed" INTEGER NOT NULL DEFAULT 0,
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "metadata" JSONB,
      "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS "DataSourceSyncLog_source_syncedAt_idx" ON "DataSourceSyncLog"("source", "syncedAt");`,
    `CREATE INDEX IF NOT EXISTS "DataSourceSyncLog_status_idx" ON "DataSourceSyncLog"("status");`,

    // 2. Advisory
    `CREATE TABLE IF NOT EXISTS "Advisory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "alertId" TEXT REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "woredaId" TEXT NOT NULL REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "cropType" TEXT,
      "hazardType" "HazardType" NOT NULL,
      "severity" "RiskLevel" NOT NULL,
      "titleEn" TEXT NOT NULL,
      "titleAm" TEXT NOT NULL,
      "titleOm" TEXT,
      "adviceEn" TEXT NOT NULL,
      "adviceAm" TEXT NOT NULL,
      "adviceOm" TEXT,
      "actionItems" JSONB,
      "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "validUntil" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS "Advisory_woredaId_hazardType_idx" ON "Advisory"("woredaId", "hazardType");`,
    `CREATE INDEX IF NOT EXISTS "Advisory_issuedAt_idx" ON "Advisory"("issuedAt");`,
    `CREATE INDEX IF NOT EXISTS "Advisory_status_idx" ON "Advisory"("status");`,

    // 3. Notification
    `CREATE TABLE IF NOT EXISTS "Notification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "titleEn" TEXT NOT NULL,
      "titleAm" TEXT NOT NULL DEFAULT '',
      "bodyEn" TEXT NOT NULL,
      "bodyAm" TEXT NOT NULL DEFAULT '',
      "type" TEXT NOT NULL DEFAULT 'ALERT',
      "isRead" BOOLEAN NOT NULL DEFAULT false,
      "readAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");`,
    `CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");`,

    // 4. UssdSession
    `CREATE TABLE IF NOT EXISTS "UssdSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL UNIQUE,
      "phoneNumber" TEXT NOT NULL,
      "serviceCode" TEXT DEFAULT '*212#',
      "text" TEXT,
      "currentStep" TEXT NOT NULL DEFAULT 'HOME',
      "sessionData" JSONB,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "language" TEXT NOT NULL DEFAULT 'am',
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS "UssdSession_phoneNumber_idx" ON "UssdSession"("phoneNumber");`,
    `CREATE INDEX IF NOT EXISTS "UssdSession_sessionId_idx" ON "UssdSession"("sessionId");`,
    `CREATE INDEX IF NOT EXISTS "UssdSession_updatedAt_idx" ON "UssdSession"("updatedAt");`,

    // 5. AlertSubscription
    `CREATE TABLE IF NOT EXISTS "AlertSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "phoneNumber" TEXT NOT NULL,
      "woredaId" TEXT NOT NULL REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "hazardTypes" "HazardType"[],
      "channel" "DeliveryChannel" NOT NULL DEFAULT 'SMS',
      "preferredLang" TEXT NOT NULL DEFAULT 'am',
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS "AlertSubscription_woredaId_isActive_idx" ON "AlertSubscription"("woredaId", "isActive");`,
    `CREATE INDEX IF NOT EXISTS "AlertSubscription_phoneNumber_idx" ON "AlertSubscription"("phoneNumber");`
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
      const name = sql.substring(0, 40).replace(/\n/g, ' ');
      console.log(`✔ Applied: ${name}...`);
    } catch (err) {
      console.error(`❌ Error executing statement: ${err.message}`);
    }
  }

  console.log('\n=== All missing tables creation finished ===');
  await pool.end();
  await prisma.$disconnect();
}

createMissingTables().catch(console.error);
