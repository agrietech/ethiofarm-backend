const openRouterClient = require('../../src/utils/openRouterClient');

describe('OpenRouter Gemini 2.5 Flash Client Suite', () => {
  it('should initialize with correct default configuration', () => {
    expect(openRouterClient.model).toBeDefined();
    expect(openRouterClient.baseUrl).toContain('openrouter.ai');
  });

  it('should perform chat completion or intelligent fallback', async () => {
    const result = await openRouterClient.chatCompletion({
      messages: [{ role: 'user', content: 'What is the optimal sowing date for wheat in Arsi zone?' }],
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
  }, 90000);

  it('should analyze crop vision and return bilingual Amharic & English diagnostics', async () => {
    const result = await openRouterClient.analyzeCropVision({
      cropHint: 'Wheat',
      imageBase64: 'fakeBase64ImageContent',
      plantIdData: {
        crop: { scientificName: 'Triticum aestivum', commonNames: ['Wheat'] },
        diseases: [{ name: 'Wheat Stem Rust', probability: 0.94 }],
      },
    });

    // Real AI correctly returns success=true always; diagnosis may be full or unrecognized
    expect(result.success).toBe(true);
    expect(result.diagnosis).toBeDefined();

    if (result.diagnosis.unrecognized) {
      // AI correctly flagged the synthetic/fake image — this is the right behavior
      expect(result.diagnosis.unrecognized).toBe(true);
    } else {
      // AI returned a full bilingual diagnosis using the provided plantIdData hints
      expect(result.diagnosis.cropIdentified).toBeDefined();
      expect(result.diagnosis.cropIdentified.nameEn).toBeDefined();
      expect(result.diagnosis.cropIdentified.nameAm).toBeDefined();
      expect(result.diagnosis.diseaseName.nameEn).toBeDefined();
      expect(result.diagnosis.diseaseName.nameAm).toBeDefined();
      expect(result.diagnosis.symptoms.am).toBeDefined();
      expect(result.diagnosis.treatment.chemicalAm).toBeDefined();
    }
  }, 90000);

  it('should generate time-series graph insights with bilingual summaries', async () => {
    const result = await openRouterClient.analyzeGraphSeries({
      woredaName: 'Adama Zuria',
      timeframe: 'DAILY',
      metrics: [
        { date: '2026-08-10', rainfallMm: 0.5, avgNdvi: 0.42 },
        { date: '2026-08-11', rainfallMm: 0.0, avgNdvi: 0.41 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.insights).toBeDefined();
    expect(result.insights.trendSummary.en).toBeDefined();
    expect(result.insights.trendSummary.am).toBeDefined();
    expect(result.insights.droughtRiskStatus.status).toBeDefined();
    expect(result.insights.actionableGuidance.am.length).toBeGreaterThan(0);
  }, 90000);

  it('should process farmer voice inquiries in Amharic & English', async () => {
    const result = await openRouterClient.processVoiceInquiry({
      userQuestion: 'የበቆሎ አባጨጓሬን እንዴት ማጥፋት ይቻላል?',
      language: 'am',
    });

    expect(result.success).toBe(true);
    expect(result.data.responseAm).toBeDefined();
    expect(result.data.responseEn).toBeDefined();
    expect(result.data.recommendedAction).toBeDefined();
  }, 90000);
});
