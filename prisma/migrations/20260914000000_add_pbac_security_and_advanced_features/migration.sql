-- Safe migration with constraint handling
BEGIN;

-- Temporarily disable triggers (PostgreSQL way to handle FK during ALTER)
SET session_replication_role = replica;

-- AlterEnum - Add new hazard types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EARTHQUAKE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'HazardType')) THEN
    ALTER TYPE "HazardType" ADD VALUE 'EARTHQUAKE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LANDSLIDE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'HazardType')) THEN
    ALTER TYPE "HazardType" ADD VALUE 'LANDSLIDE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VOLCANIC' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'HazardType')) THEN
    ALTER TYPE "HazardType" ADD VALUE 'VOLCANIC';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SOIL_DEGRADATION' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'HazardType')) THEN
    ALTER TYPE "HazardType" ADD VALUE 'SOIL_DEGRADATION';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ANIMAL_DISEASE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'HazardType')) THEN
    ALTER TYPE "HazardType" ADD VALUE 'ANIMAL_DISEASE';
  END IF;
END $$;

-- AlterTable User - Add security fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaMethod" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;

-- Fix isPhoneVerified if NULL
UPDATE "User" SET "isPhoneVerified" = false WHERE "isPhoneVerified" IS NULL;
ALTER TABLE "User" ALTER COLUMN "isPhoneVerified" SET NOT NULL;

-- AlterTable RiskAssessment - Add new hazard scores
ALTER TABLE "RiskAssessment" ADD COLUMN IF NOT EXISTS "animalDiseaseScore" DOUBLE PRECISION;
ALTER TABLE "RiskAssessment" ADD COLUMN IF NOT EXISTS "earthquakeScore" DOUBLE PRECISION;
ALTER TABLE "RiskAssessment" ADD COLUMN IF NOT EXISTS "landslideScore" DOUBLE PRECISION;
ALTER TABLE "RiskAssessment" ADD COLUMN IF NOT EXISTS "soilDegradationScore" DOUBLE PRECISION;
ALTER TABLE "RiskAssessment" ADD COLUMN IF NOT EXISTS "volcanicScore" DOUBLE PRECISION;

-- CreateTable Permission
CREATE TABLE IF NOT EXISTS "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'OWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable RolePermission
CREATE TABLE IF NOT EXISTS "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserPermission
CREATE TABLE IF NOT EXISTS "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable ResourceAccess
CREATE TABLE IF NOT EXISTS "ResourceAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "grantedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserSession
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "ipAddress" TEXT,
    "location" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable LoginAttempt
CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "identifier" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" JSONB,
    "failReason" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable OTPVerification
CREATE TABLE IF NOT EXISTS "OTPVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OTPVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable AlertCampaign
CREATE TABLE IF NOT EXISTS "AlertCampaign" (
    "id" TEXT NOT NULL,
    "woredaId" TEXT NOT NULL,
    "hazardType" "HazardType" NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAm" TEXT NOT NULL,
    "titleOm" TEXT,
    "messageEn" TEXT NOT NULL,
    "messageAm" TEXT NOT NULL,
    "messageOm" TEXT,
    "targeting" JSONB,
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "deliveryChannels" "DeliveryChannel"[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable CampaignDeliveryLog
CREATE TABLE IF NOT EXISTS "CampaignDeliveryLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable CropRotationPlan
CREATE TABLE IF NOT EXISTS "CropRotationPlan" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "years" INTEGER NOT NULL DEFAULT 3,
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CropRotationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable FarmActivity
CREATE TABLE IF NOT EXISTS "FarmActivity" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "cost" DOUBLE PRECISION,
    "laborHours" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FarmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable FarmYieldRecord
CREATE TABLE IF NOT EXISTS "FarmYieldRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropType" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "yieldQT" DOUBLE PRECISION NOT NULL,
    "yieldPerHa" DOUBLE PRECISION,
    "quality" TEXT,
    "harvestDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FarmYieldRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable LivestockHerd
CREATE TABLE IF NOT EXISTS "LivestockHerd" (
    "id" TEXT NOT NULL,
    "woredaId" TEXT NOT NULL,
    "kebeleId" TEXT,
    "userId" TEXT,
    "animalType" TEXT NOT NULL,
    "breedName" TEXT,
    "headCount" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" TEXT NOT NULL DEFAULT 'HEALTHY',
    "lastVetCheckDate" TIMESTAMP(3),
    "notes" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LivestockHerd_pkey" PRIMARY KEY ("id")
);

-- CreateTable AnimalDiseaseOutbreak
CREATE TABLE IF NOT EXISTS "AnimalDiseaseOutbreak" (
    "id" TEXT NOT NULL,
    "woredaId" TEXT NOT NULL,
    "kebeleId" TEXT,
    "diseaseName" TEXT NOT NULL,
    "diseaseId" TEXT,
    "animalType" TEXT NOT NULL,
    "confirmedCases" INTEGER NOT NULL DEFAULT 0,
    "suspectedCases" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "reportedBy" TEXT,
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnimalDiseaseOutbreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable VaccinationRecord
CREATE TABLE IF NOT EXISTS "VaccinationRecord" (
    "id" TEXT NOT NULL,
    "woredaId" TEXT NOT NULL,
    "herdId" TEXT,
    "animalType" TEXT NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "dosesAdministered" INTEGER NOT NULL DEFAULT 0,
    "targetPopulation" INTEGER NOT NULL DEFAULT 0,
    "coveragePercent" DOUBLE PRECISION,
    "campaignDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "administeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaccinationRecord_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_code_key" ON "Permission"("code");
CREATE INDEX IF NOT EXISTS "Permission_resource_action_idx" ON "Permission"("resource", "action");
CREATE INDEX IF NOT EXISTS "Permission_scope_idx" ON "Permission"("scope");

CREATE INDEX IF NOT EXISTS "RolePermission_role_idx" ON "RolePermission"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_role_permissionId_key" ON "RolePermission"("role", "permissionId");

CREATE INDEX IF NOT EXISTS "UserPermission_userId_expiresAt_idx" ON "UserPermission"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");

CREATE INDEX IF NOT EXISTS "ResourceAccess_resourceType_resourceId_idx" ON "ResourceAccess"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "ResourceAccess_userId_expiresAt_idx" ON "ResourceAccess"("userId", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ResourceAccess_userId_resourceType_resourceId_key" ON "ResourceAccess"("userId", "resourceType", "resourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionToken_key" ON "UserSession"("sessionToken");
CREATE INDEX IF NOT EXISTS "UserSession_userId_isActive_idx" ON "UserSession"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "UserSession_sessionToken_idx" ON "UserSession"("sessionToken");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

CREATE INDEX IF NOT EXISTS "LoginAttempt_identifier_attemptedAt_idx" ON "LoginAttempt"("identifier", "attemptedAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_userId_attemptedAt_idx" ON "LoginAttempt"("userId", "attemptedAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_success_idx" ON "LoginAttempt"("success");

CREATE INDEX IF NOT EXISTS "OTPVerification_phoneNumber_expiresAt_idx" ON "OTPVerification"("phoneNumber", "expiresAt");
CREATE INDEX IF NOT EXISTS "OTPVerification_email_expiresAt_idx" ON "OTPVerification"("email", "expiresAt");
CREATE INDEX IF NOT EXISTS "OTPVerification_userId_type_idx" ON "OTPVerification"("userId", "type");

CREATE INDEX IF NOT EXISTS "AlertCampaign_woredaId_status_idx" ON "AlertCampaign"("woredaId", "status");
CREATE INDEX IF NOT EXISTS "AlertCampaign_status_scheduledFor_idx" ON "AlertCampaign"("status", "scheduledFor");

CREATE INDEX IF NOT EXISTS "CampaignDeliveryLog_campaignId_status_idx" ON "CampaignDeliveryLog"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "CampaignDeliveryLog_userId_createdAt_idx" ON "CampaignDeliveryLog"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "CropRotationPlan_farmId_status_idx" ON "CropRotationPlan"("farmId", "status");

CREATE INDEX IF NOT EXISTS "FarmActivity_farmId_scheduledDate_idx" ON "FarmActivity"("farmId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "FarmActivity_status_idx" ON "FarmActivity"("status");

CREATE INDEX IF NOT EXISTS "FarmYieldRecord_farmId_year_idx" ON "FarmYieldRecord"("farmId", "year");
CREATE INDEX IF NOT EXISTS "FarmYieldRecord_cropType_season_idx" ON "FarmYieldRecord"("cropType", "season");

CREATE INDEX IF NOT EXISTS "LivestockHerd_woredaId_idx" ON "LivestockHerd"("woredaId");
CREATE INDEX IF NOT EXISTS "LivestockHerd_animalType_idx" ON "LivestockHerd"("animalType");
CREATE INDEX IF NOT EXISTS "LivestockHerd_userId_idx" ON "LivestockHerd"("userId");

CREATE INDEX IF NOT EXISTS "AnimalDiseaseOutbreak_woredaId_status_idx" ON "AnimalDiseaseOutbreak"("woredaId", "status");
CREATE INDEX IF NOT EXISTS "AnimalDiseaseOutbreak_diseaseName_idx" ON "AnimalDiseaseOutbreak"("diseaseName");
CREATE INDEX IF NOT EXISTS "AnimalDiseaseOutbreak_animalType_idx" ON "AnimalDiseaseOutbreak"("animalType");
CREATE INDEX IF NOT EXISTS "AnimalDiseaseOutbreak_reportedAt_idx" ON "AnimalDiseaseOutbreak"("reportedAt");

CREATE INDEX IF NOT EXISTS "VaccinationRecord_woredaId_idx" ON "VaccinationRecord"("woredaId");
CREATE INDEX IF NOT EXISTS "VaccinationRecord_animalType_idx" ON "VaccinationRecord"("animalType");
CREATE INDEX IF NOT EXISTS "VaccinationRecord_campaignDate_idx" ON "VaccinationRecord"("campaignDate");
CREATE INDEX IF NOT EXISTS "VaccinationRecord_vaccineName_idx" ON "VaccinationRecord"("vaccineName");

CREATE INDEX IF NOT EXISTS "User_accountLocked_idx" ON "User"("accountLocked");

-- Add foreign keys (only if not exists)
DO $$ BEGIN
    ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" 
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" 
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedById_fkey" 
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ResourceAccess" ADD CONSTRAINT "ResourceAccess_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ResourceAccess" ADD CONSTRAINT "ResourceAccess_grantedById_fkey" 
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OTPVerification" ADD CONSTRAINT "OTPVerification_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AlertCampaign" ADD CONSTRAINT "AlertCampaign_woredaId_fkey" 
    FOREIGN KEY ("woredaId") REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignDeliveryLog" ADD CONSTRAINT "CampaignDeliveryLog_campaignId_fkey" 
    FOREIGN KEY ("campaignId") REFERENCES "AlertCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CropRotationPlan" ADD CONSTRAINT "CropRotationPlan_farmId_fkey" 
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "FarmActivity" ADD CONSTRAINT "FarmActivity_farmId_fkey" 
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "FarmYieldRecord" ADD CONSTRAINT "FarmYieldRecord_farmId_fkey" 
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "LivestockHerd" ADD CONSTRAINT "LivestockHerd_woredaId_fkey" 
    FOREIGN KEY ("woredaId") REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AnimalDiseaseOutbreak" ADD CONSTRAINT "AnimalDiseaseOutbreak_woredaId_fkey" 
    FOREIGN KEY ("woredaId") REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_woredaId_fkey" 
    FOREIGN KEY ("woredaId") REFERENCES "Woreda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

COMMIT;
