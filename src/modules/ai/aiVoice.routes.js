const express = require('express');
const router = express.Router();
const controller = require('./aiVoice.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const upload = require('../../middleware/upload.middleware');

const { aiLimiter } = require('../../middleware/rate-limiter.middleware');

// Voice inquiry with audio upload or text question.
// Requires authentication — limits AI cost to registered users only.
// USSD channel accesses AI via its own authenticated session, so no functionality is lost.
router.post('/voice-inquiry', authenticate, aiLimiter, upload.single('audio'), controller.handleVoiceInquiry);
router.post('/text-inquiry', authenticate, aiLimiter, controller.handleVoiceInquiry);

// Text-to-Speech synthesis configuration — requires authentication
router.post('/text-to-speech', authenticate, aiLimiter, controller.handleTextToSpeech);
router.get('/text-to-speech', authenticate, aiLimiter, controller.handleTextToSpeech);
router.post('/speak', authenticate, aiLimiter, controller.handleTextToSpeech);

// TTS streaming endpoint — requires authentication (was fully open)
router.get('/tts-stream', authenticate, aiLimiter, controller.handleStreamTts);

module.exports = router;
