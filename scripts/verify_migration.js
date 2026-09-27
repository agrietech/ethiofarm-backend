const { prisma } = require('../src/config/db');

async function verifyMigration() {
  console.log('🔍 Verifying database migration...\n');

  try {
    // Test new security models
    console.log('✅ Testing Permission model...');
    const permissionCount = await prisma.permission.count();
    console.log(`   Found ${permissionCount} permissions`);

    console.log('✅ Testing RolePermission model...');
    const rolePermCount = await prisma.rolePermission.count();
    console.log(`   Found ${rolePermCount} role permissions`);

    console.log('✅ Testing UserSession model...');
    const sessionCount = await prisma.userSession.count();
    console.log(`   Found ${sessionCount} active sessions`);

    console.log('✅ Testing LoginAttempt model...');
    const loginAttemptCount = await prisma.loginAttempt.count();
    console.log(`   Found ${loginAttemptCount} login attempts`);

    console.log('✅ Testing OTPVerification model...');
    const otpCount = await prisma.oTPVerification.count();
    console.log(`   Found ${otpCount} OTP records`);

    // Test alert campaign models
    console.log('✅ Testing AlertCampaign model...');
    const campaignCount = await prisma.alertCampaign.count();
    console.log(`   Found ${campaignCount} alert campaigns`);

    console.log('✅ Testing CampaignDeliveryLog model...');
    const deliveryCount = await prisma.campaignDeliveryLog.count();
    console.log(`   Found ${deliveryCount} delivery logs`);

    // Test farm planning models
    console.log('✅ Testing CropRotationPlan model...');
    const rotationCount = await prisma.cropRotationPlan.count();
    console.log(`   Found ${rotationCount} rotation plans`);

    console.log('✅ Testing FarmActivity model...');
    const activityCount = await prisma.farmActivity.count();
    console.log(`   Found ${activityCount} farm activities`);

    console.log('✅ Testing FarmYieldRecord model...');
    const yieldCount = await prisma.farmYieldRecord.count();
    console.log(`   Found ${yieldCount} yield records`);

    // Test animal health models
    console.log('✅ Testing LivestockHerd model...');
    const herdCount = await prisma.livestockHerd.count();
    console.log(`   Found ${herdCount} livestock herds`);

    console.log('✅ Testing AnimalDiseaseOutbreak model...');
    const outbreakCount = await prisma.animalDiseaseOutbreak.count();
    console.log(`   Found ${outbreakCount} disease outbreaks`);

    console.log('✅ Testing VaccinationRecord model...');
    const vaccinationCount = await prisma.vaccinationRecord.count();
    console.log(`   Found ${vaccinationCount} vaccination records`);

    // Test User model enhancements
    console.log('✅ Testing User model MFA fields...');
    const mfaEnabledCount = await prisma.user.count({
      where: { mfaEnabled: true }
    });
    console.log(`   Found ${mfaEnabledCount} users with MFA enabled`);

    const lockedAccountCount = await prisma.user.count({
      where: { accountLocked: true }
    });
    console.log(`   Found ${lockedAccountCount} locked accounts`);

    console.log('\n✅ All models verified successfully!');
    console.log('🎉 Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Security models: ✅`);
    console.log(`   - Alert campaign models: ✅`);
    console.log(`   - Farm planning models: ✅`);
    console.log(`   - Animal health models: ✅`);
    console.log(`   - User enhancements: ✅`);

  } catch (error) {
    console.error('❌ Migration verification failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();
