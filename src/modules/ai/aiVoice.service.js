const fs = require('fs');
const path = require('path');
const axios = require('axios');
const openRouterClient = require('../../utils/openRouterClient');
const logger = require('../../utils/logger');
const env = require('../../config/env');

/**
 * Strip markdown markers so Text-To-Speech synthesizes cleanly
 */
function cleanTextForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/[*#_`~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n\s*[-•]\s*/g, '. ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * AI Voice & Speech Service
 * Supports Amharic (አማርኛ) and English farmer voice inquiries and audio synthesis.
 */
async function processVoiceInquiry({
  userQuestion,
  audioTranscript,
  audioFile,
  language = 'am',
  farmContext = null,
  userId = null,
  userRole = 'FARMER',
  userName = null,
  userJurisdiction = null,
  baseUrl = null,
}) {
  let audioBase64 = null;
  let mimeType = 'audio/wav';

  let hostedAudioInputUrl = null;
  const { uploadVoiceAudio } = require('../../utils/supabaseStorage');
  if (audioFile && audioFile.path && fs.existsSync(audioFile.path)) {
    try {
      const buffer = fs.readFileSync(audioFile.path);
      audioBase64 = buffer.toString('base64');
      mimeType = audioFile.mimetype || 'audio/wav';
      hostedAudioInputUrl = await uploadVoiceAudio({
        localFilePath: audioFile.path,
        fileName: path.basename(audioFile.path),
        mimeType,
      });
      try { fs.unlinkSync(audioFile.path); } catch (_unlinkErr) {}
    } catch (err) {
      logger.warn(`[AIVoiceService] Failed to read or upload audio file: ${err.message}`);
    }
  }

  const cleanQuery = (userQuestion || audioTranscript || '').trim();
  let farmContextSummary = null;

  if (farmContext && farmContext.length > 0) {
    farmContextSummary = farmContext
      .map((f) => `${f.cropType} (${f.areaSqMeters ? Math.round(f.areaSqMeters / 10000) + ' ha' : 'unknown size'})`)
      .join(', ');
    logger.debug(`[AIVoiceService] Farm context available for userId=${userId}: ${farmContextSummary}`);
  }

  logger.info(`[AIVoiceService] Processing voice/text inquiry (role=${userRole}) in language=${language}: "${cleanQuery.substring(0, 60)}"`);

  const aiResult = await openRouterClient.processVoiceInquiry({
    userQuestion: cleanQuery,
    farmContextSummary,
    audioTranscript,
    audioBase64,
    mimeType,
    language,
    userRole,
    userName,
    userJurisdiction,
  });


  const data = aiResult.data || {};
  const isAiOffline = Boolean(aiResult.isOfflineFallback);

  // Persist raw AI inquiry and response to AIInsight table
  try {
    const { prisma } = require('../../config/db');
    let validUserId = null;
    if (userId) {
      const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (userExists) validUserId = userExists.id;
    }
    await prisma.aIInsight.create({
      data: {
        prompt: cleanQuery || 'Voice inquiry',
        model: isAiOffline ? 'ethiofarm-offline-synthesizer' : (data.aiModel || 'EthioFarm Agronomic AI Assistant'),
        feature: 'VOICE_ASSISTANT',
        rawResponse: data,
        userId: validUserId,
      },
    });
  } catch (logErr) {
    logger.warn(`[AIVoiceService] AIInsight logging notice: ${logErr.message}`);
  }
  const isEnglish = language === 'en' || data.detectedLanguage === 'English';
  const rawSpeechText = isEnglish ? data.responseEn : data.responseAm;
  const speakableText = cleanTextForSpeech(rawSpeechText);

  const backendBaseUrl = baseUrl || env.APP_URL || 'https://agrietech.onrender.com';
  const targetLang = isEnglish ? 'en' : 'am';
  const proxyAudioUrl = `${backendBaseUrl}/api/v1/ai/tts-stream?text=${encodeURIComponent(speakableText.substring(0, 300))}&lang=${targetLang}`;
  const directTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(speakableText.substring(0, 200))}&tl=${targetLang}&client=tw-ob`;

  // Surface AI degraded mode to the client so it can show a warning banner
  return {
    success: true,
    isAiOffline,
    degradedReason: isAiOffline ? (aiResult.degradedReason || 'AI service temporarily unavailable') : null,
    offlineNotice: isAiOffline ? '⚠️ AI is offline — response uses cached agronomic advisory' : null,
    audioInputUrl: hostedAudioInputUrl,
    transcription: data.transcription || cleanQuery || (isEnglish ? 'Voice inquiry received' : 'የድምፅ ጥያቄ ተቀብለናል'),
    detectedLanguage: data.detectedLanguage || (isEnglish ? 'English' : 'Amharic'),
    responseEn: data.responseEn || '',
    responseAm: data.responseAm || '',
    recommendedAction: data.recommendedAction || 'Inspect crop field and consult your local development agent.',
    audioSynthesis: {
      format: 'audio/mp3',
      voiceAmharic: 'am-ET-Standard-A',
      voiceEnglish: 'en-US-Standard-C',
      playbackText: rawSpeechText,
      speakableText,
      audioUrl: proxyAudioUrl,
      directAudioUrl: directTtsUrl,
    },
    audioUrl: proxyAudioUrl,
    audioUrlAm: `${backendBaseUrl}/api/v1/ai/tts-stream?text=${encodeURIComponent(cleanTextForSpeech(data.responseAm).substring(0, 300))}&lang=am`,
    audioUrlEn: `${backendBaseUrl}/api/v1/ai/tts-stream?text=${encodeURIComponent(cleanTextForSpeech(data.responseEn).substring(0, 300))}&lang=en`,
    aiModel: isAiOffline ? 'ethiofarm-offline-synthesizer' : (data.aiModel || 'EthioFarm Agronomic AI Assistant'),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Text-to-Speech synthesis configuration & phonetic generator
 */
async function synthesizeSpeech({ text, language = 'am', baseUrl = null }) {
  if (!text) {
    throw new Error('Text to synthesize is required');
  }

  const cleanText = cleanTextForSpeech(text);
  const isAmharic = language === 'am' || /[\u1200-\u137F]/.test(cleanText);
  const targetLang = isAmharic ? 'am' : 'en';
  const backendBaseUrl = baseUrl || env.APP_URL || 'https://agrietech.onrender.com';
  const audioUrl = `${backendBaseUrl}/api/v1/ai/tts-stream?text=${encodeURIComponent(cleanText.substring(0, 300))}&lang=${targetLang}`;
  const directAudioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText.substring(0, 200))}&tl=${targetLang}&client=tw-ob`;

  return {
    success: true,
    text: cleanText,
    language: isAmharic ? 'am-ET' : 'en-US',
    voice: isAmharic ? 'am-ET-Standard-A' : 'en-US-Standard-C',
    audioUrl,
    directAudioUrl,
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: 0.0,
      mimeType: 'audio/mpeg',
    },
    synthesisReady: true,
  };
}

/**
 * Stream audio MP3 directly from TTS upstream proxy to bypass browser/mobile CORS blocks
 */
async function streamTtsAudio({ text, lang = 'am' }, res) {
  const clean = cleanTextForSpeech(text || 'EthioFarm').substring(0, 300);
  const targetLang = lang === 'en' ? 'en' : 'am';
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${targetLang}&client=tw-ob`;

  try {
    const upstreamRes = await axios.get(googleTtsUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://translate.google.com/',
      },
      timeout: 10000,
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstreamRes.data.on('error', (streamErr) => {
      logger.warn(`[AIVoiceService] Stream pipe error: ${streamErr.message}`);
      if (!res.headersSent) res.status(502).end();
    });
    upstreamRes.data.pipe(res);
  } catch (err) {
    logger.warn(`[AIVoiceService] TTS stream fallback notice: ${err.message}`);
    if (!res.headersSent) {
      try {
        res.redirect(googleTtsUrl);
      } catch (_redirErr) {
        res.status(502).json({ error: 'TTS stream unavailable' });
      }
    }
  }
}

module.exports = {
  processVoiceInquiry,
  synthesizeSpeech,
  streamTtsAudio,
  cleanTextForSpeech,
};
