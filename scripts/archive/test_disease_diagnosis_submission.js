const diseaseService = require('../src/modules/diseaseDiagnosis/diseaseDiagnosis.service');

async function testDiseaseDiagnosisSubmission() {
  console.log('================================================================');
  console.log('      DISEASE DIAGNOSIS SUBMISSION VERIFICATION TEST');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // Sample 1x1 transparent PNG base64 for testing payload
  const sampleBase64 = 'iVBORw0KGgoAAAANSU5ErkJggg==';

  // Test 1: Submit Crop Disease Diagnosis with Base64 Image
  totalTests++;
  console.log('[Test 1] Testing Disease Diagnosis submission with Base64 payload...');
  try {
    const result = await diseaseService.diagnoseCropImage({
      cropType: 'Wheat',
      imageBase64: sampleBase64,
      language: 'am',
    });

    console.log('   Diagnosis ID:', result.id);
    console.log('   Identified Crop:', result.cropIdentified);
    console.log('   Disease Name (En):', result.diseaseName);
    console.log('   Disease Name (Am):', result.diseaseNameAm);
    console.log('   Treatment (Am):', result.treatmentAm?.substring(0, 100));

    if (result && result.id && result.diseaseName && result.treatmentAm) {
      console.log('✅ PASS: Crop disease diagnosis processed & full bilingual report generated!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Diagnosis result structure incomplete!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 2: Submit Diagnosis with Unlinked/Demo farmId (FK Safety)
  totalTests++;
  console.log('[Test 2] Testing Foreign Key safety with unlinked farmId ("farm_demo_999")...');
  try {
    const result = await diseaseService.diagnoseCropImage({
      farmId: 'farm_demo_999',
      cropType: 'Maize',
      imageBase64: sampleBase64,
      language: 'en',
    });

    console.log('   Diagnosis ID:', result.id);
    console.log('   Assigned Farm ID:', result.farmId);
    console.log('   Disease Name:', result.diseaseName);

    if (result && result.id && result.diseaseName) {
      console.log('✅ PASS: FK safety verified - submission succeeded without foreign key crash!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: FK safety test failed!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: Foreign Key crash occurred: ${err.message}\n`);
  }

  // Test 3: Retrieve Diagnosis Records List
  totalTests++;
  console.log('[Test 3] Testing retrieval of diagnosis records...');
  let latestId = null;
  try {
    const records = await diseaseService.getAllDiagnoses({});
    console.log(`   Records retrieved: ${records.length}`);
    if (records.length > 0) {
      latestId = records[0].id;
    }

    if (Array.isArray(records)) {
      console.log('✅ PASS: Diagnosis records list retrieved successfully!\n');
      passedTests++;
    } else {
      console.log('❌ FAIL: Diagnosis records retrieval failed!\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  // Test 4: Retrieve Single Diagnosis by ID
  totalTests++;
  console.log(`[Test 4] Testing retrieval of single diagnosis record by ID (${latestId})...`);
  try {
    if (latestId) {
      const singleRecord = await diseaseService.getDiagnosisById(latestId, { role: 'ADMIN' });
      console.log('   Retrieved Single ID:', singleRecord.id);
      console.log('   Retrieved Crop:', singleRecord.cropIdentified || singleRecord.cropType);
      console.log('   Retrieved Disease:', singleRecord.diseaseName);

      if (singleRecord && singleRecord.id === latestId) {
        console.log('✅ PASS: Single diagnosis record fetched cleanly by ID!\n');
        passedTests++;
      } else {
        console.log('❌ FAIL: Retrieved record does not match requested ID!\n');
      }
    } else {
      console.log('⚠️ SKIP: No records available to test single ID retrieval\n');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}\n`);
  }

  console.log('================================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  process.exit(passedTests === totalTests ? 0 : 1);
}

testDiseaseDiagnosisSubmission();
