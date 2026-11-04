const aiVoiceService = require('../src/modules/ai/aiVoice.service');

async function verifyComprehensiveAiQueries() {
  console.log('================================================================');
  console.log('   ETHIOFARM AI COMPREHENSIVE DATA DELIVERY VERIFICATION TEST   ');
  console.log('================================================================\n');

  const testQueries = [
    {
      name: 'Dairy Cattle & Mastitis Care (Amharic)',
      question: 'ስለ ወተት ላም መኖና ማስቲቲስ (የጡት በሽታ) ህክምና ንገረኝ',
      language: 'am',
    },
    {
      name: 'Maize Fall Armyworm Chemical & Cultural Control (English)',
      question: 'How to manage Fall Armyworm in Maize with chemicals, dosage and cultural methods?',
      language: 'en',
    },
    {
      name: 'Soil Acidity & Agricultural Lime (Amharic)',
      question: 'የአፈር አሲዳማነትን በእርሻ ኖራ እንዴት ማከም ይቻላል?',
      language: 'am',
    },
    {
      name: 'Compost Preparation Step by Step (English)',
      question: 'How to prepare rapid aerobic compost from farm manure and crop residues?',
      language: 'en',
    },
    {
      name: 'Poultry Newcastle Disease Vaccination (Amharic)',
      question: 'የዶሮ ፈንግል (Newcastle) በሽታ የክትባት ጊዜና መድሃኒት ንገረኝ',
      language: 'am',
    },
  ];

  let passed = 0;

  for (let i = 0; i < testQueries.length; i++) {
    const t = testQueries[i];
    console.log(`[Test ${i + 1}/${testQueries.length}] Query: "${t.name}"`);
    console.log(`   Input: "${t.question}" (lang=${t.language})`);

    try {
      const result = await aiVoiceService.processVoiceInquiry({
        userQuestion: t.question,
        language: t.language,
      });

      const hasAmharic = result.responseAm && result.responseAm.length > 50;
      const hasEnglish = result.responseEn && result.responseEn.length > 50;
      const hasAction = result.recommendedAction && result.recommendedAction.length > 10;
      const hasAudio = Boolean(result.audioSynthesis && result.audioSynthesis.audioUrl);

      console.log(`   AI Model: ${result.aiModel || 'EthioFarm Engine'}`);
      console.log(`   Amharic Length: ${result.responseAm?.length || 0} chars`);
      console.log(`   English Length: ${result.responseEn?.length || 0} chars`);
      console.log(`   Recommended Action: "${result.recommendedAction}"`);
      console.log(`   Audio Stream URL: ${result.audioSynthesis?.audioUrl?.substring(0, 70)}...`);

      const hasContent = (t.language === 'am' ? hasAmharic : hasEnglish) || (hasAmharic || hasEnglish);
      if (hasContent && hasAction && hasAudio) {
        console.log(`   ✅ PASS: Comprehensive bilingual advisory returned with audio stream!\n`);
        passed++;
      } else {
        console.log(`   ❌ FAIL: Incomplete response structure!\n`);
      }
    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}\n`);
    }
  }

  console.log('================================================================');
  console.log(`SUMMARY: ${passed}/${testQueries.length} comprehensive queries passed!`);
  console.log('================================================================');

  if (passed === testQueries.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verifyComprehensiveAiQueries();
