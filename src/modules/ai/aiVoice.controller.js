const aiVoiceService = require('./aiVoice.service');
const logger = require('../../utils/logger');

// Lazy-load farm service to avoid circular dependency
function getFarmService() {
  try { return require('../farms/farms.service'); } catch (_) { return null; }
}

async function handleVoiceInquiry(req, res, next) {
  try {
    const { audioTranscript, language } = req.body || {};
    const userQuestion = req.body?.userQuestion || req.body?.textQuestion || req.body?.question || req.body?.prompt || req.body?.text || req.query?.question || req.query?.textQuestion || null;
    const audioFile = req.file || null;
    const lang = language || req.query.lang || req.user?.preferredLang || 'am';

    // Fetch farmer context for personalized advisory (non-blocking)
    let farmContext = null;
    if (req.user?.id) {
      try {
        const farmService = getFarmService();
        if (farmService && typeof farmService.getFarmsByUser === 'function') {
          const farms = await farmService.getFarmsByUser(req.user.id, { limit: 3 });
          if (farms && farms.length > 0) {
            farmContext = farms.map((f) => ({
              cropType: f.cropType || f.primaryCrop || 'unknown',
              areaSqMeters: f.areaSqMeters || null,
              woredaId: f.woredaId || null,
            }));
          }
        }
      } catch (farmErr) {
        logger.debug(`[AIVoice] Farm context fetch failed (non-fatal): ${farmErr.message}`);
      }
    }

    const host = req.get('host');
    const baseUrl = host ? `${req.protocol}://${host}` : null;

    const result = await aiVoiceService.processVoiceInquiry({
      userQuestion,
      audioTranscript,
      audioFile,
      language: lang,
      farmContext,
      userId: req.user?.id || null,
      baseUrl,
    });

    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function handleTextToSpeech(req, res, next) {
  try {
    const { text, language } = req.body || {};
    const lang = language || req.query.lang || 'am';
    const host = req.get('host');
    const baseUrl = host ? `${req.protocol}://${host}` : null;

    const result = await aiVoiceService.synthesizeSpeech({
      text: text || req.query.text,
      language: lang,
      baseUrl,
    });

    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function handleStreamTts(req, res, next) {
  try {
    const text = req.query.text || req.body?.text || 'EthioFarm';
    const lang = req.query.lang || req.body?.lang || req.query.language || 'am';
    await aiVoiceService.streamTtsAudio({ text, lang }, res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleVoiceInquiry,
  handleTextToSpeech,
  handleStreamTts,
};

