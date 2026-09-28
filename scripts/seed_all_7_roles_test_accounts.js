/**
 * @file seed_all_7_roles_test_accounts.js
 * @description Seeds and synchronizes clean, enterprise test accounts with verified credentials
 * for all 7 roles in EthioFarm.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { prisma } = require('../src/config/db');

async function seedTestAccounts() {
  console.log('========================================================================');
  console.log('   ETHIOFARM ENTERPRISE ROLE TEST ACCOUNTS PROVISIONING SUITE          ');
  console.log('========================================================================\n');

  const defaultPassword = 'EthioFarm2026!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);

  // 1. Ensure Kebele exists for DA & Farmer
  const kebeleId = 'keb_adama_wonji_01';
  let kebele = await prisma.kebele.findUnique({ where: { id: kebeleId } });
  if (!kebele) {
    kebele = await prisma.kebele.create({
      data: {
        id: kebeleId,
        woredaId: 'ET040703',
        nameEn: 'Wonji Central Kebele',
        nameAm: 'ዎንጂ መካከለኛ ቀበሌ',
        nameOm: 'Ganda Wal-Gidduu Wonji',
        pcode: 'P_ET040703_01',
        elevationMeters: 1540,
        agroZone: 'WEINA_DEGA',
        dominantSoilType: 'Clay Loam / Vertisol',
        soilPh: 6.8,
        centerLat: 8.5412,
        centerLng: 39.2734,
        ftcName: 'Wonji Farmers Training Center',
      },
    });
    console.log('✅ Created Kebele:', kebele.nameEn);
  }

  // 2. Define test accounts for all 7 roles
  const accounts = [
    {
      role: 'FARMER',
      fullName: 'Alemayehu Tadesse',
      phoneNumber: '+251911223344',
      email: 'farmer@ethiofarm.et',
      passwordHash,
      regionId: 'ET04',
      zoneId: 'ET0407',
      woredaId: 'ET040703',
      kebeleId: kebeleId,
      kebeleName: 'Wonji Central',
    },
    {
      role: 'DEVELOPMENT_AGENT',
      fullName: 'Selamawit Bekele (DA)',
      phoneNumber: '+251922334455',
      email: 'da@ethiofarm.et',
      passwordHash,
      regionId: 'ET04',
      zoneId: 'ET0407',
      woredaId: 'ET040703',
      kebeleId: kebeleId,
      kebeleName: 'Wonji Central',
    },
    {
      role: 'WOREDA_OFFICER',
      fullName: 'Dawit Kebede (Woreda Officer)',
      phoneNumber: '+251933445566',
      email: 'woreda@ethiofarm.et',
      passwordHash,
      regionId: 'ET04',
      zoneId: 'ET0407',
      woredaId: 'ET040703',
    },
    {
      role: 'ZONAL_OFFICER',
      fullName: 'Bekele Tufa (Zonal Coordinator)',
      phoneNumber: '+251944112233',
      email: 'zonal@ethiofarm.et',
      passwordHash,
      regionId: 'ET04',
      zoneId: 'ET0407',
    },
    {
      role: 'REGIONAL_OFFICER',
      fullName: 'Chala Dejene (Regional Lead)',
      phoneNumber: '+251955667788',
      email: 'regional@ethiofarm.et',
      passwordHash,
      regionId: 'ET04',
    },
    {
      role: 'RESEARCHER',
      fullName: 'Dr. Worku Mekonnen (Agronomist)',
      phoneNumber: '+251944556677',
      email: 'researcher@ethiofarm.et',
      passwordHash,
    },
    {
      role: 'ADMIN',
      fullName: 'Platform Administrator',
      phoneNumber: '+251900000001',
      email: 'admin@ethiofarm.et',
      passwordHash: adminPasswordHash, // Supports Admin123!
    },
  ];

  console.log('────────────────────────────────────────────────────────────────────────');
  console.log('PROVISIONING / SYNCHRONIZING USER PROFILES');
  console.log('────────────────────────────────────────────────────────────────────────\n');

  for (const acc of accounts) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: acc.phoneNumber },
          { email: acc.email },
        ],
      },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: acc.fullName,
          phoneNumber: acc.phoneNumber,
          email: acc.email,
          role: acc.role,
          passwordHash: acc.passwordHash,
          isPhoneVerified: true,
          isEmailVerified: true,
          regionId: acc.regionId || null,
          zoneId: acc.zoneId || null,
          woredaId: acc.woredaId || null,
          kebeleId: acc.kebeleId || null,
          kebeleName: acc.kebeleName || null,
        },
      });
      console.log(`🔄 UPDATED: [${acc.role}] ${acc.fullName}`);
    } else {
      user = await prisma.user.create({
        data: {
          fullName: acc.fullName,
          phoneNumber: acc.phoneNumber,
          email: acc.email,
          role: acc.role,
          passwordHash: acc.passwordHash,
          isPhoneVerified: true,
          isEmailVerified: true,
          regionId: acc.regionId || null,
          zoneId: acc.zoneId || null,
          woredaId: acc.woredaId || null,
          kebeleId: acc.kebeleId || null,
          kebeleName: acc.kebeleName || null,
          preferredLang: 'en',
        },
      });
      console.log(`✨ CREATED: [${acc.role}] ${acc.fullName}`);
    }

    console.log(`   Phone: ${acc.phoneNumber} (or ${acc.phoneNumber.replace('+251', '0')})`);
    console.log(`   Email: ${acc.email}`);
    console.log(`   Password: ${acc.role === 'ADMIN' ? 'Admin123!' : 'EthioFarm2026!'}`);
    console.log('');

    // If farmer, ensure a model farm exists
    if (acc.role === 'FARMER') {
      const existingFarm = await prisma.farm.findFirst({
        where: { userId: user.id },
      });
      if (!existingFarm) {
        await prisma.farm.create({
          data: {
            userId: user.id,
            farmName: 'Wonji Wheat Model Farm',
            primaryCrop: 'Wheat',
            areaHectares: 2.5,
            latitude: 8.5412,
            longitude: 39.2734,
            woredaId: 'ET040703',
            kebeleId: kebeleId,
            soilType: 'Vertisol (Black cotton soil)',
            irrigationType: 'Furrow / River diversion',
          },
        });
        console.log('   🌾 Model Farm linked: "Wonji Wheat Model Farm" (2.5 ha)');
      }
    }
  }

  // Also sync admin@agrietech.et with Admin123!
  const legacyAdmin = await prisma.user.findFirst({
    where: { email: 'admin@agrietech.et' },
  });
  if (legacyAdmin) {
    await prisma.user.update({
      where: { id: legacyAdmin.id },
      data: {
        passwordHash: adminPasswordHash,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    });
    console.log('🔄 Synced admin@agrietech.et with Admin123!');
  }

  console.log('\n========================================================================');
  console.log('   ALL 7 ENTERPRISE ROLES FULLY SEEDED & READY FOR LOGIN               ');
  console.log('========================================================================\n');
}

seedTestAccounts()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Failed to seed test accounts:', e);
    process.exit(1);
  });
