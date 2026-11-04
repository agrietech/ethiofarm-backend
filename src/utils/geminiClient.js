/**
 * Google Gemini AI Studio Client
 * Exclusive AI engine for EthioFarm, powered by 4-account key rotation pool
 * (Primary GEMINI_API_KEY + GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4)
 * Providing 6,000 free requests/day with zero external proxy dependencies.
 */

const geminiClient = require('./openRouterClient');

module.exports = geminiClient;
