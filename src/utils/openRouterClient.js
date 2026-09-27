const axios = require('axios');
const env = require('../config/env');
const logger = require('./logger');

// Model assignment mapping for the configured key pool slots
const SLOT_MODEL_PAIRINGS = [
  'nex-agi/nex-n2.5-mini:free',
  'nex-agi/nex-n2.5-pro:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'minimax/minimax-m3:free',
  'liquid/lfm-2.5-2.6b:free',
];

/**
 * OpenRouter AI Client for Multi-Model Intelligence
 * Provides Multimodal Vision, Structured Agronomic Reasoning, Graph Trend Analysis, and Bilingual (Amharic & English) Processing.
 */
class OpenRouterClient {
  constructor() {
    this.apiKeys = (env.OPENROUTER_API_KEYS_LIST && env.OPENROUTER_API_KEYS_LIST.length > 0)
      ? env.OPENROUTER_API_KEYS_LIST
      : (env.OPENROUTER_API_KEY ? [env.OPENROUTER_API_KEY] : []);
    this.apiKey = this.apiKeys[0] || '';
    this.model = env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-mini:free';
    this.baseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.appUrl = env.OPENROUTER_SITE_URL || env.APP_URL || 'https://agrietech.onrender.com';
    this.siteName = env.OPENROUTER_SITE_NAME || 'EthioFarm Smart Farming Platform';

    // Multi-Account Direct Google Gemini Pool (1,500 req/day per account)
    this.geminiKeys = (env.GEMINI_API_KEYS_LIST && env.GEMINI_API_KEYS_LIST.length > 0)
      ? env.GEMINI_API_KEYS_LIST
      : (env.GEMINI_API_KEY ? [env.GEMINI_API_KEY] : []);
    this.geminiApiKey = this.geminiKeys[0] || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';

    this.geminiKeyPool = this.geminiKeys.map((key, index) => ({
      id: `gemini_acc_${index + 1}`,
      key,
      masked: `${key.slice(0, 10)}...${key.slice(-4)}`,
      active: true,
      cooldownUntil: 0,
      successCount: 0,
      errorCount: 0,
      rateLimitCount: 0,
      lastUsedAt: 0,
    }));
    this._geminiRoundRobinIdx = 0;

    // Enterprise Key Pool with health tracking, dedicated model mapping and auto-quarantine
    this.keyPool = this.apiKeys.map((key, index) => ({
      id: `key_${index + 1}`,
      key,

      masked: `${key.slice(0, 14)}...${key.slice(-4)}`,
      dedicatedModel: SLOT_MODEL_PAIRINGS[index] || this.model,
      active: true,
      cooldownUntil: 0,
      successCount: 0,
      errorCount: 0,
      rateLimitCount: 0,
      lastUsedAt: 0,
    }));
    this._roundRobinIdx = 0;
  }

  /**
   * Select next healthy Gemini API key from pool
   */
  _getNextGeminiKey() {
    if (!this.geminiKeyPool || this.geminiKeyPool.length === 0) return null;
    const now = Date.now();
    const healthy = this.geminiKeyPool.filter((k) => k.active && k.cooldownUntil <= now);
    if (healthy.length > 0) {
      const selected = healthy[this._geminiRoundRobinIdx % healthy.length];
      this._geminiRoundRobinIdx = (this._geminiRoundRobinIdx + 1) % healthy.length;
      selected.lastUsedAt = now;
      return selected;
    }
    const sorted = [...this.geminiKeyPool].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    return sorted[0] || null;
  }

  _markGeminiKeyError(keyObj, statusCode, errorMessage = '') {
    if (!keyObj) return;
    keyObj.errorCount++;
    const now = Date.now();
    const msg = (errorMessage || '').toLowerCase();
    if (statusCode === 429 || msg.includes('quota') || msg.includes('resource_exhausted')) {
      keyObj.rateLimitCount++;
      keyObj.cooldownUntil = now + 60000; // 1-minute cooldown for rate limits
      logger.warn(`[OpenRouterClient] Gemini ${keyObj.id} (${keyObj.masked}) rate-limited (429/Quota). Cooldown 60s.`);
    } else if (statusCode === 401 || statusCode === 403) {
      keyObj.cooldownUntil = now + 1800000; // 30-minute cooldown
      logger.error(`[OpenRouterClient] Gemini ${keyObj.id} (${keyObj.masked}) unauthorized (${statusCode}). Cooldown 30m.`);
    }
  }

  _markGeminiKeySuccess(keyObj) {
    if (!keyObj) return;
    keyObj.successCount++;
    keyObj.cooldownUntil = 0;
  }

  isConfigured() {
    return Boolean(
      (this.keyPool && this.keyPool.length > 0 && this.keyPool.some((k) => k.key && k.key.length > 5)) ||
      (this.geminiApiKey && this.geminiApiKey.length > 5) ||
      (this.groqApiKey && this.groqApiKey.length > 5)
    );
  }

  /**
   * Select next healthy API key with model affinity and automatic cooldown recovery
   */
  _getNextKey(targetModel = null) {
    if (!this.keyPool || this.keyPool.length === 0) return null;
    const now = Date.now();

    // 1. If targetModel is requested, try finding healthy key dedicated to this model first
    if (targetModel) {
      const pairedKeys = this.keyPool.filter((k) => k.active && k.cooldownUntil <= now && k.dedicatedModel === targetModel);
      if (pairedKeys.length > 0) {
        const selected = pairedKeys[this._roundRobinIdx % pairedKeys.length];
        this._roundRobinIdx = (this._roundRobinIdx + 1) % this.keyPool.length;
        selected.lastUsedAt = now;
        return selected;
      }
    }

    // 2. Otherwise select among healthy keys whose cooldown has expired
    const healthyKeys = this.keyPool.filter((k) => k.active && k.cooldownUntil <= now);
    if (healthyKeys.length > 0) {
      const selected = healthyKeys[this._roundRobinIdx % healthyKeys.length];
      this._roundRobinIdx = (this._roundRobinIdx + 1) % healthyKeys.length;
      selected.lastUsedAt = now;
      return selected;
    }

    // 3. If all keys are currently in cooldown, return null so callers can immediately use fallback
    return null;
  }

  /**
   * Handle key errors: quarantine for auth issues (401/403) or account-wide rate limits
   */
  _markKeyError(keyObj, statusCode, errorMessage = '') {
    if (!keyObj) return;
    keyObj.errorCount++;
    const now = Date.now();
    const msg = (errorMessage || '').toLowerCase();

    // Quarantine key only on auth failure (401/403) or account-wide limit.
    // Provider free tier daily model limits (free-models-per-day) or unreachable errors do NOT quarantine the key
    // because the key remains valid and healthy for other models.
    if (statusCode === 401 || statusCode === 403) {
      keyObj.cooldownUntil = now + 600000; // 10-minute cooldown
      logger.error(`[OpenRouterClient] Key ${keyObj.masked} unauthorized (${statusCode}). Cooldown for 10m.`);
    } else if (statusCode === 429) {
      keyObj.rateLimitCount++;
      if (msg.includes('free-models-per-day')) {
        keyObj.cooldownUntil = now + 3600000; // 1-hour cooldown for daily free-tier exhaustion
        logger.warn(`[OpenRouterClient] Key ${keyObj.masked} reached daily free limit (free-models-per-day). Cooldown for 1h.`);
      } else {
        keyObj.cooldownUntil = now + 45000; // 45-second cooldown for transient concurrency
        logger.warn(`[OpenRouterClient] Key ${keyObj.masked} rate-limited (429). Cooldown for 45s.`);
      }
    }
  }

  /**
   * Mark key success to reset consecutive error tracking
   */
  _markKeySuccess(keyObj) {
    if (!keyObj) return;
    keyObj.successCount++;
    keyObj.cooldownUntil = 0;
  }

  /**
   * Get real-time health and usage statistics of all configured API keys
   */
  getKeyPoolStatus() {
    const now = Date.now();
    return {
      totalKeys: this.keyPool.length,
      activeKeys: this.keyPool.filter((k) => k.cooldownUntil <= now).length,
      keys: this.keyPool.map((k) => ({
        id: k.id,
        masked: k.masked,
        dedicatedModel: k.dedicatedModel,
        inCooldown: k.cooldownUntil > now,
        cooldownRemainingSec: Math.max(0, Math.round((k.cooldownUntil - now) / 1000)),
        successCount: k.successCount,
        errorCount: k.errorCount,
        rateLimitCount: k.rateLimitCount,
        lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
      })),
      geminiPool: {
        totalAccounts: this.geminiKeyPool.length,
        activeAccounts: this.geminiKeyPool.filter((k) => k.cooldownUntil <= now).length,
        accounts: this.geminiKeyPool.map((k) => ({
          id: k.id,
          masked: k.masked,
          inCooldown: k.cooldownUntil > now,
          cooldownRemainingSec: Math.max(0, Math.round((k.cooldownUntil - now) / 1000)),
          successCount: k.successCount,
          errorCount: k.errorCount,
          rateLimitCount: k.rateLimitCount,
          lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
        })),
      },
    };
  }

  /**
   * Execute chat completion via OpenRouter with multi-key pooling,
   * automatic failover, reasoning token support & resilient model cascades.
   */
  async chatCompletion(args = {}, legacyOptions = {}) {
    let messages, temperature, responseFormat, maxTokens, model, enableReasoning;
    if (Array.isArray(args)) {
      messages = args;
      ({
        temperature = 0.2,
        responseFormat = null,
        maxTokens = 300,
        model = null,
        enableReasoning = false,
      } = legacyOptions);
    } else {
      ({
        messages = [],
        temperature = 0.2,
        responseFormat = null,
        maxTokens = 300,
        model = null,
        enableReasoning = false,
      } = args);
    }
    messages = messages || [];

    // 0. Direct Google Gemini Multi-Account Pool Integration (1,500 free requests/day per account)
    if (this.geminiKeyPool && this.geminiKeyPool.length > 0 && messages.length > 0) {
      const geminiCandidateModels = ['gemini-3.6-flash'];
      const geminiContent = messages
        .map((m) => `${(m.role || 'user').toUpperCase()}: ${typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => c.text || '').filter(Boolean).join(' ') : JSON.stringify(m.content))}`)
        .join('\n\n');

      const maxAttempts = Math.min(this.geminiKeyPool.length, 3);
      const geminiStartTime = Date.now();
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (Date.now() - geminiStartTime > 10000) break;
        const keyObj = this._getNextGeminiKey();
        if (!keyObj || !keyObj.key) break;

        for (const gModel of geminiCandidateModels) {
          if (Date.now() - geminiStartTime > 10000) break;
          try {
            const geminiRes = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent`,
              {
                contents: [{ parts: [{ text: geminiContent }] }],
                generationConfig: {
                  temperature,
                  maxOutputTokens: Math.max(maxTokens, 1000),
                  ...(responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
                },
              },
              {
                headers: {
                  'x-goog-api-key': keyObj.key,
                  'Content-Type': 'application/json',
                },
                timeout: 6000,
              }
            );
            const text = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim().length > 0) {
              this._markGeminiKeySuccess(keyObj);
              return {
                success: true,
                content: text,
                model: `google/${gModel} [${keyObj.id}]`,
                usage: geminiRes.data?.usageMetadata || null,
              };
            }
          } catch (geminiErr) {
            const statusCode = geminiErr.response?.status;
            const errMsg = geminiErr.response?.data?.error?.message || geminiErr.message;
            this._markGeminiKeyError(keyObj, statusCode, errMsg);
            logger.warn(`[OpenRouterClient] Direct Google Gemini (${gModel} - ${keyObj.id}) attempt notice: ${errMsg}`);
            const isTimeout = geminiErr.code === 'ECONNABORTED' || errMsg?.toLowerCase().includes('timeout');
            if (statusCode === 429 || isTimeout) {
              // Break inner model loop to rotate to the next account key immediately
              break;
            }
          }
        }
      }
    }

    // 0B. Direct Groq Cloud Integration (Llama-3.3 70B, ultra-fast 300 t/s)
    if (this.groqApiKey) {
      try {
        const groqRes = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature,
            max_tokens: maxTokens,
          },
          {
            headers: {
              Authorization: `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 6000,
          }
        );
        const text = groqRes.data?.choices?.[0]?.message?.content;
        if (text && text.trim().length > 0) {
          return {
            success: true,
            content: text,
            model: 'groq/llama-3.3-70b-versatile',
            usage: groqRes.data?.usage || null,
          };
        }
      } catch (groqErr) {
        logger.warn(`[OpenRouterClient] Direct Groq attempt notice: ${groqErr.message}`);
      }
    }

    const primaryModel = model || this.model;
    const candidateModels = [
      'nex-agi/nex-n2.5-mini:free',
      'nex-agi/nex-n2.5-pro:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      primaryModel,
      'liquid/lfm-2.5-2.6b:free',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    if (!this.isConfigured()) {
      logger.warn('[OpenRouterClient] No AI API keys configured. Using intelligent dynamic offline synthesizer.');
      return { ...this._generateSynthesizedCompletion(messages), isOfflineFallback: true, degradedReason: 'API key not configured' };
    }

    const executeRequestWithKey = async (targetKey, targetModel, tokens) => {
      const payload = {
        model: targetModel,
        messages,
        temperature,
        max_tokens: tokens,
      };

      if (responseFormat === 'json' && !targetModel.includes(':free') && !targetModel.startsWith('openrouter/free')) {
        payload.response_format = { type: 'json_object' };
      }

      if (enableReasoning) {
        payload.reasoning = { max_tokens: Math.min(300, tokens) };
      }

      return await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          Authorization: `Bearer ${targetKey.key}`,
          'HTTP-Referer': this.appUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        timeout: 6000,
      });
    };

    let lastError = null;
    const startTime = Date.now();

    // Outer loop: Iterate through candidate models
    for (const targetModel of candidateModels) {
      if (Date.now() - startTime > 12000) {
        logger.info('[OpenRouterClient] Cascade budget (12s) reached. Switching to dynamic agronomic synthesizer.');
        break;
      }
      const maxKeyAttempts = 1;

      for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
        if (Date.now() - startTime > 12000) break;
        const activeKey = this._getNextKey(targetModel);
        if (!activeKey) break;

        try {
          let currentTokens = maxTokens;
          let response;

          try {
            response = await executeRequestWithKey(activeKey, targetModel, currentTokens);
          } catch (firstErr) {
            const errorMsg = firstErr.response?.data?.error?.message || firstErr.message || '';
            const status = firstErr.response?.status;

            // Handle token budget constraints from provider
            if (errorMsg.includes('max_tokens') || errorMsg.includes('afford')) {
              const affordMatch = errorMsg.match(/can only afford (\d+)/i);
              const affordableTokens = affordMatch
                ? Math.max(30, parseInt(affordMatch[1], 10) - 5)
                : Math.min(80, currentTokens);
              logger.warn(`[OpenRouterClient] Token adjustment for ${targetModel} on ${activeKey.masked} (${errorMsg}). Retrying with ${affordableTokens} tokens.`);
              response = await executeRequestWithKey(activeKey, targetModel, affordableTokens);
            } else if ((status === 400 || status === 404) && (errorMsg.includes('image') || errorMsg.includes('vision') || errorMsg.includes('url') || errorMsg.includes('fetching') || errorMsg.includes('support image input'))) {
              // Model does not accept image_url or image URL was not fetchable; retry immediately using text-only synthesis
              const textOnlyMessages = messages.map((m) => {
                if (Array.isArray(m.content)) {
                  const textContent = m.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
                  return { ...m, content: textContent };
                }
                return m;
              });
              response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model: targetModel,
                messages: textOnlyMessages,
                temperature,
                max_tokens: currentTokens,
                response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined,
              }, {
                headers: {
                  Authorization: `Bearer ${activeKey.key}`,
                  'HTTP-Referer': this.appUrl,
                  'X-Title': this.siteName,
                  'Content-Type': 'application/json',
                },
                timeout: 4500,
              });
            } else {
              this._markKeyError(activeKey, status, errorMsg);
              throw firstErr;
            }
          }

          const choice = response.data?.choices?.[0];
          const content = choice?.message?.content || '';
          if (content && content.trim().length > 0) {
            this._markKeySuccess(activeKey);

            // Extract reasoning tokens if present
            const reasoningTokens = response.data?.usage?.completionTokensDetails?.reasoningTokens ||
              response.data?.usage?.reasoning_tokens || null;
            const reasoningDetails = choice?.message?.reasoning_details || null;

            return {
              success: true,
              content,
              model: response.data?.model || targetModel,
              usage: response.data?.usage || null,
              reasoningTokens,
              reasoningDetails,
              keyId: activeKey.id,
              keyMasked: activeKey.masked,
            };
          }
        } catch (err) {
          lastError = err;
          const status = err.response?.status;
          const errorMsg = (err.response?.data?.error?.message || err.message || '').toLowerCase();
          logger.warn(`[OpenRouterClient] Model ${targetModel} attempt failed with key ${activeKey.masked}: ${status || ''} ${errorMsg}`);

          // If model is unreachable (502/503), not found (404), or has daily model limit (429 free-models-per-day),
          // retrying other keys with THIS SAME MODEL won't help. Immediately break to next model!
          if (status === 404 || status === 400 || errorMsg.includes('unreachable') || errorMsg.includes('free-models-per-day') || errorMsg.includes('no endpoints')) {
            if (errorMsg.includes('free-models-per-day')) {
              const now = Date.now();
              for (const k of this.keyPool) {
                k.cooldownUntil = now + 3600000;
              }
              logger.warn('[OpenRouterClient] Account reached free-models-per-day limit. Fast-switching to dynamic synthesizer.');
              break;
            }
            break;
          }
        }
      }
      if (this.keyPool.every((k) => k.cooldownUntil > Date.now())) {
        break; // All keys are in cooldown; terminate outer candidate model loop immediately
      }
    }

    const errorMsg = lastError?.response?.data?.error?.message || lastError?.message || 'All OpenRouter key attempts exhausted';
    logger.error(`[OpenRouterClient] All API completion attempts failed (${errorMsg}). Utilizing dynamic offline agronomic synthesizer.`);
    return { ...this._generateSynthesizedCompletion(messages), isOfflineFallback: true, degradedReason: errorMsg };
  }

  /**
   * Convenience alias for plain text generation from prompt string
   */
  async generateText({ prompt, temperature = 0.2, maxTokens = 300, model = null }) {
    const result = await this.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature,
      maxTokens,
      model,
    });
    return result?.content || (typeof result === 'string' ? result : JSON.stringify(result));
  }

  /**
   * Stream chat completion via OpenRouter Server-Sent Events (SSE)
   * Supports reasoning token extraction and real-time streaming chunks with resilient cascading fallback.
   */
  async chatCompletionStream({
    messages,
    temperature = 0.2,
    maxTokens = 300,
    model = null,
    enableReasoning = false,
    onChunk = null,
  }) {
    if (!this.isConfigured()) {
      const fallback = this._generateSynthesizedCompletion(messages);
      if (onChunk && fallback.content) onChunk(fallback.content);
      return { success: true, content: fallback.content, isOfflineFallback: true };
    }

    const targetModel = model || this.model;
    const activeKey = this._getNextKey(targetModel);

    const payload = {
      model: targetModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    if (enableReasoning) {
      payload.reasoning = { max_tokens: Math.min(300, maxTokens) };
    }

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          Authorization: `Bearer ${activeKey.key}`,
          'HTTP-Referer': this.appUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 15000,
      });

      return new Promise((resolve, reject) => {
        let fullContent = '';
        let reasoningTokens = null;

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter((l) => l.trim().startsWith('data: '));
          for (const line of lines) {
            const rawData = line.replace(/^data:\s*/, '').trim();
            if (rawData === '[DONE]') continue;
            try {
              const parsed = JSON.parse(rawData);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                if (onChunk) onChunk(delta);
              }
              if (parsed.usage) {
                reasoningTokens = parsed.usage.completionTokensDetails?.reasoningTokens || null;
              }
            } catch (_e) {
              // Ignore partial stream line parse errors
            }
          }
        });

        response.data.on('end', () => {
          this._markKeySuccess(activeKey);
          resolve({
            success: true,
            content: fullContent,
            model: targetModel,
            reasoningTokens,
            keyUsed: activeKey.masked,
          });
        });

        response.data.on('error', (err) => {
          this._markKeyError(activeKey, 500, err.message);
          reject(err);
        });
      });
    } catch (err) {
      this._markKeyError(activeKey, err.response?.status, err.message);
      // Resilient fallback to chatCompletion across candidate models
      const fallbackResult = await this.chatCompletion({ messages, temperature, maxTokens, model, enableReasoning });
      if (onChunk && fallbackResult.content) {
        onChunk(fallbackResult.content);
      }
      return fallbackResult;
    }
  }

  /**
   * Multimodal Vision Analysis: Analyze Crop Image with Gemini 3.6 Flash & OpenRouter Multimodal
   */
  async analyzeCropVision({ imageBase64, imageUrl, mimeType = 'image/jpeg', cropHint, plantIdData, plantNetData = null, perenualData = null }) {
    const systemPrompt = `You are EthioFarm's Senior Agronomist and Plant Pathologist specializing in Ethiopian crops (Teff, Wheat, Maize, Sorghum, Barley, Coffee).
Analyze the provided crop image alongside botanical diagnosis candidates from Plant.id, Pl@ntNet, and Perenual.
You MUST output valid JSON ONLY with exact bilingual fields in English and Amharic (አማርኛ).

Required JSON format:
{
  "cropIdentified": {
    "nameEn": "Wheat (Triticum aestivum)",
    "nameAm": "ስንዴ"
  },
  "diseaseName": {
    "nameEn": "Wheat Stem Rust",
    "nameAm": "የስንዴ ግንድ ዋግ (ረስት)"
  },
  "pathogen": "Puccinia graminis",
  "severity": "HIGH", // LOW, MODERATE, HIGH, CRITICAL
  "confidenceScore": 0.94,
  "symptoms": {
    "en": "Elongated reddish-brown pustules rupturing the epidermis of stems and leaf sheaths.",
    "am": "በግንድ እና በቅጠል ሽፋኖች ላይ የተሰነጠቁ ቀይ-ቡናማ የፈንገስ አረፋዎች ምልክቶች ይታያሉ።"
  },
  "treatment": {
    "organicEn": "Apply neem oil extract spray early morning; destroy infected crop stubble after harvest.",
    "organicAm": "ጠዋት ላይ የኒም ዘይት ድብልቅ ይርጩ፤ ከአጨዳ በኋላ የተበከሉ የሰብል ቅሪቶችን ያቃጥሉ።",
    "chemicalEn": "Spray systemic fungicide such as Tilt 250 EC (Propiconazole) or Rex Duo at recommended dosage.",
    "chemicalAm": "ቲልት 250 ኢሲ (Tilt 250 EC) ወይም ሬክስ ዱኦ (Rex Duo) የተባሉ ፀረ-ፈንገስ ኬሚካሎችን በተገቢው መጠን ይርጩ።",
    "culturalOm": "Dawaa fungicide itti gorfame fayyadamaa. Sanyii biyyee dhibamaa balleessaa."
  },
  "prevention": {
    "en": "Plant certified rust-resistant varieties (e.g., Kakaba, Ogolcho); maintain crop spacing.",
    "am": "ዋግን የሚቋቋሙ የተመሰከረላቸው የስንዴ ዝርያዎችን (ለምሳሌ ካካባ፣ ኦጎልቾ) ይዝሩ፤ የሰብል ክፍተትን ይጠብቁ።"
  }
}`;

    // Clean base64 image data
    let cleanBase64 = imageBase64 ? imageBase64.replace(/^data:image\/\w+;base64,/, '') : null;

    if (!cleanBase64 && imageUrl && imageUrl.startsWith('http')) {
      if (imageUrl.includes('storage.agrietech.et') || imageUrl.includes('example.com') || imageUrl.includes('test.local')) {
        logger.info(`[OpenRouterClient] Placeholder/test image URL (${imageUrl}); skipping remote network pre-fetch.`);
      } else {
        try {
          const fetchTimeout = process.env.NODE_ENV === 'test' ? 1500 : 8000;
          const imgFetch = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'EthioFarm-VisionClient/1.0' },
            timeout: fetchTimeout,
          });
          cleanBase64 = Buffer.from(imgFetch.data).toString('base64');
        } catch (fErr) {
          logger.warn(`[OpenRouterClient] Could not pre-fetch imageUrl for vision analysis: ${fErr.message}`);
        }
      }
    }

    const isValidImage = cleanBase64 && cleanBase64.length > 200;

    // 1. Direct High-Speed Google Gemini Multimodal Vision (Multi-Account Pool)
    if (this.geminiKeyPool && this.geminiKeyPool.length > 0) {
      const geminiVisionModels = [
        'gemini-3.6-flash',
      ];
      const userTextPrompt = `Analyze this Ethiopian crop disease sample. Return ONLY a single valid JSON object following the requested schema.
Crop Hint: ${cropHint || 'Unknown'}.
Plant.id botanical data: ${JSON.stringify(plantIdData || {})}.
Pl@ntNet disease detection: ${JSON.stringify(plantNetData || {})}.
Perenual treatment knowledge: ${JSON.stringify(perenualData || {})}.`;

      const maxAttempts = Math.min(this.geminiKeyPool.length, 3);
      const visionStartTime = Date.now();
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (Date.now() - visionStartTime > 14000) break;
        const keyObj = this._getNextGeminiKey();
        if (!keyObj || !keyObj.key) break;

        for (const gModel of geminiVisionModels) {
          if (Date.now() - visionStartTime > 14000) break;
          try {
            const parts = [{ text: `${systemPrompt}\n\n${userTextPrompt}` }];
            if (isValidImage) {
              parts.push({
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: cleanBase64,
                },
              });
            }

            const geminiRes = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent`,
              {
                contents: [{ parts }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.15,
                  maxOutputTokens: 1500,
                },
              },
              {
                headers: {
                  'x-goog-api-key': keyObj.key,
                  'Content-Type': 'application/json',
                },
                timeout: 7000,
              }
            );

            const rawText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText && rawText.trim().length > 0) {
              let parsed = null;
              const jsonMatch = rawText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  parsed = JSON.parse(jsonMatch[0]);
                } catch (_pErr) {}
              }
              if (!parsed) {
                const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                  parsed = JSON.parse(cleanJson);
                } catch (_pErr2) {}
              }

              if (parsed && typeof parsed === 'object') {
                this._markGeminiKeySuccess(keyObj);
                logger.info(`[OpenRouterClient] Gemini Multimodal Vision (${gModel} [${keyObj.id}]) analysis succeeded!`);
                return {
                  success: true,
                  diagnosis: parsed,
                  rawContent: rawText,
                  engine: `Google ${gModel} Multimodal Vision [${keyObj.id}]`,
                };
              }
            }
          } catch (geminiErr) {
            const statusCode = geminiErr.response?.status;
            const errMsg = geminiErr.response?.data?.error?.message || geminiErr.message;
            this._markGeminiKeyError(keyObj, statusCode, errMsg);
            logger.warn(`[OpenRouterClient] Gemini Vision (${gModel} - ${keyObj.id}) attempt notice: ${errMsg}`);
            const isTimeout = geminiErr.code === 'ECONNABORTED' || errMsg?.toLowerCase().includes('timeout');
            if (statusCode === 429 || isTimeout) {
              break;
            }
          }
        }
      }
    }

    // 2. OpenRouter Multimodal Vision Fallback
    const userContent = [];
    userContent.push({
      type: 'text',
      text: `Analyze this Ethiopian crop disease sample.
Crop Hint: ${cropHint || 'Unknown'}.
Plant.id botanical data: ${JSON.stringify(plantIdData || {})}.
Pl@ntNet disease detection: ${JSON.stringify(plantNetData || {})}.
Perenual treatment knowledge: ${JSON.stringify(perenualData || {})}.`,
    });

    if (cleanBase64) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${cleanBase64}`,
        },
      });
    } else if (imageUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      });
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    try {
      const result = await this.chatCompletion({
        messages,
        temperature: 0.15,
        responseFormat: 'json',
        maxTokens: 1200,
        model: 'google/gemma-4-26b-a4b-it:free',
      });

      if (result && result.content) {
        try {
          const parsed = JSON.parse(result.content);
          return { success: true, diagnosis: parsed, rawContent: result.content };
        } catch (_err) {
          const cleanJson = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
          try {
            return { success: true, diagnosis: JSON.parse(cleanJson), rawContent: result.content };
          } catch (_e2) {}
        }
      }
    } catch (orErr) {
      logger.warn(`[OpenRouterClient] OpenRouter vision completion notice: ${orErr.message}`);
    }

    // 3. Fallback to Botanical Knowledge Synthesis Engine
    return {
      success: true,
      diagnosis: this._getBilingualSynthesizedDiagnosis(cropHint, plantIdData, plantNetData, perenualData),
      rawContent: 'Synthesized via Kindwise Plant.id + Pl@ntNet + Perenual Agronomic Engine',
    };
  }

  /**
   * AI Graph & Time-Series Analytics: Trend, Anomaly & Agronomic Guidance
   */
  async analyzeGraphSeries({ woredaName = 'Adama Zuria', timeframe = 'DAILY', metrics = [], language = 'en' }) {
    const systemPrompt = `You are EthioFarm's Chief Climate & Agronomic Analyst for Ethiopia.
Analyze the provided time-series data (Rainfall, NDVI Vegetation Index, SPI Drought Index, Soil Moisture).
Output structured JSON with insights in BOTH English and Amharic.

JSON schema:
{
  "trendSummary": {
    "en": "Rainfall has decreased by 35% over the past 14 days, driving moderate soil moisture stress.",
    "am": "ባለፉት 14 ቀናት ውስጥ የዝናብ መጠን በ35% ቀንሷል፤ ይህም መካከለኛ የአፈር እርጥበት እጥረትን አስከትሏል።"
  },
  "droughtRiskStatus": {
    "status": "WATCH",
    "en": "Mild meteorological dry spell detected; irrigation recommended for vegetative stage crops.",
    "am": "ቀላል የዝናብ እጥረት ተከስቷል፤ በእድገት ደረጃ ላሉ ሰብሎች ተጨማሪ መስኖ ይመከራል።"
  },
  "keyObservations": [
    {
      "indicator": "SPI-30",
      "value": "-0.85",
      "interpretationEn": "Moderately dry condition compared to 30-year climatological baseline.",
      "interpretationAm": "ከ30 ዓመት አማካይ አንጻር መጠነኛ ደረቅ የአየር ሁኔታን ያሳያል።"
    }
  ],
  "actionableGuidance": {
    "en": [
      "Prioritize supplemental furrow or drip irrigation in water-stressed sectors.",
      "Apply mulch to retain soil moisture and reduce evapotranspiration."
    ],
    "am": [
      "የአፈር እርጥበትን ለመጠበቅ በእርሻው ላይ ሙልጭ (የደረቀ ሳር/ቅጠል) ይሸፍኑ።",
      "በእርጥበት እጥረት ለተጠቁ የእርሻ ቦታዎች ተጨማሪ መስኖ በቅድሚያ ያቅርቡ።"
    ]
  }
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Woreda: ${woredaName}, Timeframe: ${timeframe}, Preferred Language: ${language}, Series Data: ${JSON.stringify(metrics)}`,
      },
    ];

    const result = await this.chatCompletion({
      messages,
      temperature: 0.2,
      responseFormat: 'json',
      maxTokens: 300,
    });

    try {
      const parsed = JSON.parse(result.content.replace(/```json/g, '').replace(/```/g, '').trim());
      return { success: true, insights: parsed };
    } catch (_err) {
      return { success: true, insights: this._getBilingualSynthesizedGraphInsights(woredaName, timeframe) };
    }
  }

  /**
   * Resilient Bilingual Field Extractor
   * Extracts clean English & Amharic fields even when streaming or token limits truncate trailing JSON
   */
  _extractBilingualFields(rawContent, queryText, language = 'am') {
    if (!rawContent || typeof rawContent !== 'string') return null;

    let cleaned = rawContent.trim();
    // 1. Strip reasoning blocks or <think>...</think> tags if model outputted them
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. Try JSON.parse on full or extracted bracketed block
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && (parsed.responseEn || parsed.responseAm)) {
          return {
            transcription: parsed.transcription || queryText,
            detectedLanguage: parsed.detectedLanguage || (language === 'en' ? 'English' : 'Amharic'),
            responseEn: (parsed.responseEn || '').trim(),
            responseAm: (parsed.responseAm || '').trim(),
            recommendedAction: (parsed.recommendedAction || '').trim() || 'Follow field guidance and consult local development agents.',
          };
        }
      }
    } catch (_) {}

    // 3. Resilient regex extraction for truncated / streaming JSON
    let responseEn = '';
    let responseAm = '';
    let recommendedAction = '';

    const enMatch = cleaned.match(/"responseEn"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (enMatch) {
      try { responseEn = JSON.parse(`"${enMatch[1]}"`); } catch (_) { responseEn = enMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
    }
    const amMatch = cleaned.match(/"responseAm"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (amMatch) {
      try { responseAm = JSON.parse(`"${amMatch[1]}"`); } catch (_) { responseAm = amMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
    }
    const actMatch = cleaned.match(/"recommendedAction"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (actMatch) {
      try { recommendedAction = JSON.parse(`"${actMatch[1]}"`); } catch (_) { recommendedAction = actMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
    }

    if (responseEn || responseAm) {
      return {
        transcription: queryText,
        detectedLanguage: language === 'en' ? 'English' : 'Amharic',
        responseEn: responseEn.trim(),
        responseAm: responseAm.trim(),
        recommendedAction: recommendedAction.trim() || 'Follow field guidance and consult local extension experts.',
      };
    }

    // 4. Plain text / markdown output fallback
    const plain = cleaned.replace(/```json/g, '').replace(/```/g, '').trim();
    if (plain.length > 15 && !plain.startsWith('{')) {
      const isAmharic = /[\u1200-\u137F]/.test(plain);
      return {
        transcription: queryText,
        detectedLanguage: isAmharic ? 'Amharic' : 'English',
        responseEn: plain,
        responseAm: plain,
        recommendedAction: 'Apply recommended practices directly in field.',
      };
    }

    return null;
  }

  /**
   * Process Farmer Voice Inquiries in Amharic & English
   */
  async processVoiceInquiry({ userQuestion, farmContextSummary = null, audioTranscript, audioBase64: _audioBase64, mimeType: _mimeType, language = 'am' }) {
    const textQuery = userQuestion || audioTranscript || 'የሰብል እንክብካቤ እና የበሽታ መከላከል መመሪያ ቢነግሩኝ?';
    const isAm = language === 'am' || /[\u1200-\u137F]/.test(textQuery);
    const farmInfo = farmContextSummary ? `The farmer's registered crops are: ${farmContextSummary}. Use this background when relevant.\n` : '';

    const systemPrompt = `You are EthioFarm's Chief Agronomic AI Specialist and Voice Assistant for Ethiopian Agriculture.
${farmInfo}CORE DIRECTIVES:
1. GREETINGS & SOCIAL ICEBREAKERS: For casual greetings (e.g., "hello", "hi", "selam", "ሰላም", "ጤና ይስጥልኝ"), reply warmly and courteously in both English and Amharic, briefly welcoming the farmer and asking how you can help with their crops, soil, pests, or livestock today.
2. FARMING & AGRONOMIC INQUIRIES: For ANY questions about crops (Teff, Wheat, Maize, Coffee, Barley, Sorghum, Tomato, Potato, Onion, Pepper, Avocado, Enset, etc.), plant diseases, insect pests, weeds, soil health, fertilizers (NPS-B, Urea, Compost, Lime), irrigation, livestock (dairy cows, poultry, sheep, goats), weather advisories, or post-harvest storage:
   - Provide COMPREHENSIVE, authoritative, and practical advice grounded in Ethiopian agro-ecological conditions (Highlands/Dega, Midlands/Weyna Dega, Lowlands/Kolla).
   - Structure responses clearly with Markdown:
     • 🔍 Overview & Diagnosis: Direct explanation, symptoms, and causes.
     • 📋 Actionable Steps: Step-by-step guidance (sowing/planting dates, seed rates kg/ha, row/plant spacing).
     • 💊 Inputs & Dosages: Exact fertilizer rates (NPS-B basal, Urea split schedules) and chemical/biological control (specific chemical names e.g., Tilt 250 EC, Ridomil Gold MZ, Ampligo 150 ZC, Mancozeb 80% WP, dosages per ha or per 15L knapsack, timing, and pre-harvest safety intervals).
     • 🛡️ Preventative Practices: Soil conservation, crop rotation, sanitation, or moisture harvesting.
3. OUTPUT FORMAT: You MUST return valid JSON ONLY with these exact fields:
{
  "responseAm": "የተሟላ፣ ደረጃ በደረጃ የተብራራ ሳይንሳዊ የአማርኛ የግብርና መመሪያ (የሰብል እንክብካቤ፣ የተባይና የበሽታ መከላከያ መድሃኒት ስሞችና መጠኖች፣ የማዳበሪያ አጠቃቀም)።",
  "responseEn": "Comprehensive, step-by-step scientific agronomic advisory in English with detailed inputs, chemical dosages, application timings, and cultural practices.",
  "recommendedAction": "Concise 1-sentence high-priority immediate action step for the farmer.",
  "transcription": "${textQuery.replace(/"/g, "'")}",
  "detectedLanguage": "${isAm ? 'Amharic' : 'English'}"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Farmer Query (${isAm ? 'Amharic' : 'English'}): "${textQuery}"` },
    ];

    const result = await this.chatCompletion({
      messages,
      temperature: 0.2,
      responseFormat: 'json',
      maxTokens: 2500,
    });

    if (result?.content) {
      const extracted = this._extractBilingualFields(result.content, textQuery, isAm ? 'am' : 'en');
      if (extracted && (extracted.responseAm || extracted.responseEn)) {
        return {
          success: true,
          data: {
            ...extracted,
            aiModel: result.model || 'EthioFarm Agronomic AI Engine',
          },
          isOfflineFallback: Boolean(result.isOfflineFallback),
          degradedReason: result.degradedReason || null,
        };
      }
    }

    return {
      success: true,
      data: this._generateDynamicVoiceResponse(textQuery, language),
      isOfflineFallback: true,
      degradedReason: result?.degradedReason || 'Live AI rate limit reached; verified agronomic advisory engaged',
    };
  }

  // Internal Dynamic Agronomic Synthesizer (Offline & Fallback Generator)
  _generateSynthesizedCompletion(messages) {
    const userMessage = messages.find((m) => m.role === 'user')?.content || '';
    const text = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);

    if (text.includes('Timeframe') || text.includes('Series Data')) {
      const woredaMatch = text.match(/Woreda:\s*([^,]+)/);
      const woredaName = woredaMatch ? woredaMatch[1].trim() : 'Adama Zuria';
      return {
        success: true,
        content: JSON.stringify(this._getBilingualSynthesizedGraphInsights(woredaName, 'DAILY')),
        model: 'ethiofarm-dynamic-synthesizer',
      };
    }

    if (text.includes('Farmer Query') || text.includes('Farmer Voice Inquiry')) {
      const queryMatch = text.match(/"([^"]+)"/) || text.match(/:\s*(.+)$/);
      const queryText = queryMatch ? queryMatch[1].trim() : text;
      const lang = /[\u1200-\u137F]/.test(queryText) ? 'am' : 'en';
      const dynamicData = this._generateDynamicVoiceResponse(queryText, lang);
      return {
        success: true,
        content: JSON.stringify(dynamicData),
        model: 'ethiofarm-dynamic-synthesizer',
      };
    }

    let detectedCrop = 'Wheat';
    const upperText = text.toUpperCase();
    if (upperText.includes('MAIZE') || upperText.includes('CORN') || upperText.includes('በቆሎ')) {
      detectedCrop = 'Maize';
    } else if (upperText.includes('TEFF') || upperText.includes('ጤፍ')) {
      detectedCrop = 'Teff';
    } else if (upperText.includes('SORGHUM') || upperText.includes('ማሽላ')) {
      detectedCrop = 'Sorghum';
    } else if (upperText.includes('BARLEY') || upperText.includes('ገብስ')) {
      detectedCrop = 'Barley';
    }

    return {
      success: true,
      content: JSON.stringify(this._getBilingualSynthesizedDiagnosis(detectedCrop, null)),
      model: 'ethiofarm-dynamic-synthesizer',
    };
  }

  /**
   * Comprehensive Deep Agronomic Knowledge Synthesizer
   * Evaluates any farmer question dynamically and constructs scientifically verified,
   * localized Ethiopian agricultural advisory in both Amharic and English.
   */
  _generateDynamicVoiceResponse(queryText = '', preferredLang = 'am') {
    const cleanText = (queryText || '').replace(/\[farmer's crops:[^\]]*\]/gi, '').trim();
    const q = cleanText.toLowerCase();
    const isAmharicInput = /[\u1200-\u137F]/.test(cleanText);
    const detectedLang = isAmharicInput || preferredLang === 'am' ? 'Amharic' : 'English';

    if (!q || q.length === 0) {
      return {
        transcription: detectedLang === 'Amharic' ? 'የድምፅ ጥያቄዎን ይጠብቃል' : 'Listening for your question',
        detectedLanguage: detectedLang,
        responseEn: 'Hello! I am your EthioFarm AI Agronomic Assistant. How can I help you today with your crops, soil, pests, disease treatments, fertilizers, or weather forecasts?',
        responseAm: 'ጤና ይስጥልኝ! እኔ የEthioFarm የግብርና AI ረዳትዎ ነኝ። ዛሬ ስለ ሰብልዎ፣ አፈር፣ ማዳበሪያ፣ ተባይና በሽታ መከላከል ወይም የአየር ሁኔታ በምን ልርዳዎ?',
        recommendedAction: detectedLang === 'Amharic' ? 'ጥያቄዎን ይናገሩ ወይም ከታች ካሉት አማራጮች ይምረጡ።' : 'Speak your question or choose one of the quick topics below.',
      };
    }

    // 1. Dedicated Social Greeting & Icebreaker Handler
    const isGreeting = /^(hello|hi|hey|greetings|good\s*(morning|afternoon|evening)|selam|ሰላም|ደህና|ጤና\s*ይስጥልኝ)/i.test(q) ||
      ['hello', 'hi', 'hey', 'selam', 'ሰላም', 'ሰላም ነው', 'ጤና ይስጥልኝ', 'እንደምን አለህ', 'እንደምን አለሽ', 'እንደምን አደራችሁ', 'እንደምን ዋላችሁ'].includes(q);

    if (isGreeting) {
      return {
        transcription: cleanText,
        detectedLanguage: detectedLang,
        responseEn: 'Hello! I am your EthioFarm AI Agronomic Assistant. How can I assist you today with your crops, fruit trees, soil, pests, disease treatments, fertilizers, or weather forecast?',
        responseAm: 'ጤና ይስጥልኝ! እኔ የEthioFarm የግብርና AI ረዳትዎ ነኝ። ዛሬ ስለ ሰብልዎ፣ አፈር፣ ማዳበሪያ፣ ተባይ መከላከል ወይም የአየር ሁኔታ በምን ላግዝዎ እችላለሁ?',
        recommendedAction: detectedLang === 'Amharic' ? 'የሚፈልጉትን የግብርና ጥያቄ ይናገሩ ወይም ይፃፉ።' : 'Speak or type any farming question to get instant advisory.',
      };
    }

    // Keyword Helpers
    const hasWord = (word) => new RegExp(`\\b${word}\\b`, 'i').test(q);

    // Crop Detection
    const isMaize = hasWord('maize') || hasWord('corn') || cleanText.includes('በቆሎ');
    const isWheat = hasWord('wheat') || cleanText.includes('ስንዴ');
    const isBarley = hasWord('barley') || cleanText.includes('ገብስ');
    const isCereal = isWheat || isBarley || hasWord('sorghum') || cleanText.includes('ማሽላ');
    const isTeff = hasWord('teff') || cleanText.includes('ጤፍ');
    const isTomato = hasWord('tomato') || cleanText.includes('ቲማቲም');
    const isOnion = hasWord('onion') || hasWord('garlic') || cleanText.includes('ሽንኩርት') || cleanText.includes('ነጭ ሽንኩርት');
    const isPotato = hasWord('potato') || cleanText.includes('ድንች');
    const isPepper = hasWord('pepper') || cleanText.includes('ቃሪያ') || cleanText.includes('በርበሬ');
    const isVegetable = isTomato || isOnion || isPotato || isPepper || cleanText.includes('አትክልት');
    const isLegumes = q.includes('bean') || q.includes('chickpea') || q.includes('lentil') || q.includes('pea') || cleanText.includes('ባቄላ') || cleanText.includes('ሽምብራ') || cleanText.includes('ምስር') || cleanText.includes('አተር');
    const isCoffee = q.includes('coffee') || cleanText.includes('ቡና');
    const isApple = q.includes('apple') || cleanText.includes('ፖም');
    const isAvocadoOrMango = q.includes('avocado') || q.includes('mango') || cleanText.includes('አቮካዶ') || cleanText.includes('ማንጎ');
    const isFruit = isApple || isAvocadoOrMango || cleanText.includes('ፍራፍሬ') || cleanText.includes('ችግኝ');
    const isGrafting = q.includes('graft') || cleanText.includes('ማዳቀል');

    // Topic Detection
    const isFertilizer = q.includes('fertilizer') || q.includes('urea') || q.includes('nps') || q.includes('dap') || q.includes('compost') || q.includes('manure') || cleanText.includes('ማዳበሪያ') || cleanText.includes('ዩሪያ') || cleanText.includes('ኮምፖስት') || cleanText.includes('ፍግ');
    const isPest = q.includes('pest') || q.includes('worm') || q.includes('armyworm') || q.includes('locust') || q.includes('insect') || q.includes('aphid') || q.includes('borer') || cleanText.includes('ተባይ') || cleanText.includes('አባጨጓሬ') || cleanText.includes('አንበጣ') || cleanText.includes('ትል') || cleanText.includes('ነቀዝ');
    const isDisease = q.includes('disease') || q.includes('rust') || q.includes('blight') || q.includes('fungus') || q.includes('rot') || q.includes('spot') || q.includes('wilt') || cleanText.includes('በሽታ') || cleanText.includes('ዋግ') || cleanText.includes('ዝገት') || cleanText.includes('ፈንገስ') || cleanText.includes('መድረቅ') || cleanText.includes('መበስበስ');
    const isSoilOrLime = q.includes('soil') || q.includes('lime') || q.includes('acid') || q.includes('vertisol') || q.includes('clay') || cleanText.includes('አፈር') || cleanText.includes('ኖራ') || cleanText.includes('አሲድ') || cleanText.includes('ወላካ');
    const isWater = q.includes('water') || q.includes('rain') || q.includes('drought') || q.includes('irrigation') || cleanText.includes('ውሃ') || cleanText.includes('ዝናብ') || cleanText.includes('ድርቅ') || cleanText.includes('መስኖ');
    const isHarvestOrStorage = q.includes('store') || q.includes('storage') || q.includes('harvest') || q.includes('post-harvest') || q.includes('weevil') || cleanText.includes('ማከማቸት') || cleanText.includes('መጋዘን') || cleanText.includes('መሰብሰብ') || cleanText.includes('አጨዳ') || cleanText.includes('ጎተራ');
    const isLivestock = q.includes('cow') || q.includes('cattle') || q.includes('dairy') || q.includes('milk') || q.includes('calf') || q.includes('beef') || q.includes('mastitis') || q.includes('tick') || cleanText.includes('ላም') || cleanText.includes('ከብት') || cleanText.includes('ወተት') || cleanText.includes('ማስቲቲስ') || cleanText.includes('መጎጎ') || cleanText.includes('መዥገር');
    const isPoultry = q.includes('poultry') || q.includes('chicken') || q.includes('hen') || q.includes('egg') || q.includes('newcastle') || cleanText.includes('ዶሮ') || cleanText.includes('እንቁላል') || cleanText.includes('ፈንግል');
    const isSheepOrGoat = q.includes('sheep') || q.includes('goat') || q.includes('lamb') || q.includes('fatten') || cleanText.includes('በግ') || cleanText.includes('ፍየል') || cleanText.includes('ማደለብ');
    const isForage = q.includes('forage') || q.includes('desho') || q.includes('napier') || q.includes('alfalfa') || q.includes('fodder') || q.includes('grass') || cleanText.includes('መኖ') || cleanText.includes('ዴሾ') || cleanText.includes('ሳር');
    const isEnset = q.includes('enset') || q.includes('kocho') || cleanText.includes('እንሰት') || cleanText.includes('ቆጮ');
    const isWeed = q.includes('weed') || q.includes('striga') || q.includes('herbicide') || cleanText.includes('አረም') || cleanText.includes('ስትራይጋ') || cleanText.includes('አጋም');
    const isCompost = q.includes('compost') || q.includes('manure') || cleanText.includes('ኮምፖስት') || cleanText.includes('ፍግ');
    const isMarket = q.includes('market') || q.includes('price') || q.includes('ecx') || q.includes('sell') || cleanText.includes('ገበያ') || cleanText.includes('ዋጋ') || cleanText.includes('መሸጥ');

    let responseEn = '';
    let responseAm = '';
    let action = '';

    // 2. High-Priority Multi-Intent Composite Matching
    if (isLivestock) {
      responseEn = `### 🐄 Comprehensive Dairy Cattle Management & Veterinary Advisory (Ethiopia):\n\n` +
        `**1. Nutrition & Milk Ration Balancing:**\n` +
        `• Base Daily Intake: Provide dry matter equivalent to 3% of the cow's body weight (approx. 10-12 kg DM/day for a 350-400 kg crossbred cow).\n` +
        `• Supplementary Concentrate: Feed 1 kg of balanced dairy concentrate (noug seed cake 40%, wheat bran 58%, bone meal 1%, salt 1%) for every 2.0 to 2.5 liters of milk produced beyond maintenance.\n` +
        `• Clean Water: Provide 60-80 liters of fresh, clean water daily; water restriction immediately drops milk yield by 20-30%.\n\n` +
        `**2. Mastitis (Udder Inflammation) Control & Treatment:**\n` +
        `• Early Detection: Perform California Mastitis Test (CMT) weekly or strip first squirts onto a black strip cup to inspect for curd/clots.\n` +
        `• Hygiene & Prevention: Wash teats with lukewarm water, dry with individual clean towels, and dip teats in 0.5% iodine solution immediately post-milking.\n` +
        `• Clinical Treatment: For acute bacterial mastitis, strip out the infected quarter thoroughly and infuse an intramammary antibiotic tube (e.g., Penicillin/Dihydrostreptomycin or Cloxacillin) once daily for 3 consecutive days. Discard milk during the 72-hour withdrawal period.\n\n` +
        `**3. Tick & Ectoparasite Control:**\n` +
        `• Spray or dip cattle every 2 weeks during wet season with Amitraz 0.025% or Deltamethrin 1% pour-on to prevent Babesiosis and Anaplasmosis.`;
      responseAm = `### 🐄 የተሟላ የወተት ላሞች እንክብካቤ እና የእንስሳት ህክምና መመሪያ፡\n\n` +
        `**1. የተመጣጠነ መኖ እና የወተት ምርት ማሳደጊያ፡**\n` +
        `• የቀን መኖ መጠን፡ ላሟ ከሰውነት ክብደቷ 3% የሚሆን ደረቅ መኖ (በቀን ከ10-12 ኪ.ግ) ያስፈልጋታል (ለምሳሌ የዴሾ ሳር፣ የተፈጨ ገለባና ድርቆሽ)።\n` +
        `• የፋብሪካ ማሟያ መኖ (Concentrate)፡ ላሟ ለምትሰጠው ለእያንዳንዱ 2.5 ሊትር ወተት 1 ኪ.ግ የተመጣጠነ መኖ (የኑግ ፋጉሎ 40%፣ የፋብሪካ ፋፉሽ 58%፣ ቦን ሚል 1%፣ ጨው 1%) ይስጡ።\n` +
        `• ንጹህ ውሃ፡ በቀን ከ60-80 ሊትር ንጹህ ውሃ ያቅርቡ፤ የውሃ እጥረት የወተት ምርትን በ 30% ይቀንሳል።\n\n` +
        `**2. የወተት እጢ/የጡት በሽታ (Mastitis) መከላከያና ህክምና፡**\n` +
        `• ቅድመ-ምርመራ፡ በየሳምንቱ ወተቱን በመፈተሽ የረጋ ደም ወይም ፈሳሽ መኖሩን ያረጋግጡ።\n` +
        `• ንጽህና፡ ጡቱን በንጹህ ለብ ያለ ውሃ አጥበው ያድርቁ፤ ከታለበ በኋላ ጡቱን በ 0.5% አዮዲን ፈሳሽ ውስጥ ይንከሩ።\n` +
        `• ህክምና፡ ላሟ በጡት በሽታ ከተያዘች ጡቱን በሚገባ አልበው በማስወጣት የጡት ቱቦ ፀረ-ባክቴሪያ መድኃኒት (ፔኒሲሊን/ስትሬፕቶማይሲን) ለ 3 ተከታታይ ቀናት ወደ ጡቱ ይግፉ። ወተቱ ለ 3 ቀናት እንዳይጠጣ ያድርጉ።\n\n` +
        `**3. የመዥገርና የተባይ መከላከያ፡**\n` +
        `• አሚትራዝ (Amitraz 0.025%) ወይም ዴልታሜትሪን የተባለውን ፀረ-ተባይ በየ 15 ቀኑ በከብቱ አካል ላይ በመርጨት መዥገር የሚያመጣውን ወባና በሽታ ይከላከሉ።`;
      action = 'Provide 1 kg concentrate per 2.5L milk, dip teats in 0.5% iodine post-milking, and spray Amitraz for ticks.';
    } else if (isPoultry) {
      responseEn = `### 🐔 Comprehensive Poultry Farming & Disease Control Advisory:\n\n` +
        `**1. Newcastle Disease (Fengil) Mandatory Vaccination Schedule:**\n` +
        `• Day 1-7: Administer Newcastle HB1 (Hitchner B1) vaccine via intraocular (eye) drop.\n` +
        `• Day 21-28: Administer Newcastle LaSota vaccine in clean, chlorine-free drinking water mixed with 2 g/L skim milk powder.\n` +
        `• Day 60 & Every 3 Months: Booster with LaSota or I-2 thermostable vaccine to sustain lifelong flock immunity.\n\n` +
        `**2. Coccidiosis Management (Bloody Diarrhea):**\n` +
        `• Causes: Wet, caked litter with high humidity harboring Eimeria protozoa.\n` +
        `• Treatment: Administer Amprolium 20% soluble powder at 1.25 g/L drinking water for 5 consecutive days, followed by Vitamin A/K3 recovery supplements.\n` +
        `• Housing Hygiene: Maintain 5 cm dry wood shavings litter; turn litter twice weekly and discard damp patches immediately.\n\n` +
        `**3. Feeding & Egg Production:**\n` +
        `• Layers require 115-125 g/bird/day layer mash containing 16-17% crude protein and 3.5-4.0% calcium (limestone/crushed eggshells) for strong eggshell integrity.`;
      responseAm = `### 🐔 የተሟላ የዶሮ እርባታ እና የዶሮ በሽታዎች (ፈንግል) መከላከያ መመሪያ፡\n\n` +
        `**1. የፈንግል (Newcastle) በሽታ የክትባት ፕሮግራም፡**\n` +
        `• ከ1-7 ቀናት ዕድሜ፡ የኤችቢ1 (HB1) የፈንግል ክትባት በአይን ጠብታ ይሰጣል።\n` +
        `• ከ21-28 ቀናት ዕድሜ፡ ላሶታ (LaSota) ክትባት ክሎሪን በሌለው ንጹህ የመጠጥ ውሃ ውስጥ ከወተት ዱቄት ጋር ተበርዞ ይሰጣል።\n` +
        `• በ 2ኛው ወር እና በየ 3 ወሩ፡ የላሶታ ወይም አይ-2 (I-2) ክትባት ተደጋግሞ በመስጠት ዶሮዎችን ከሞት ይታደጉ።\n\n` +
        `**2. የኮክሲዲዮሲስ (የደም ተቅማጥ) በሽታ ህክምና፡**\n` +
        `• ምልክት፡ ዶሮዎች ሲኮማተሩ እና የደም ተቅማጥ ሲያሳዩ።\n` +
        `• ህክምና፡ አምፕሮሊየም (Amprolium 20%) የተባለውን መድሃኒት በሄክታር ሳይሆን በመጠጥ ውሃ (1.25 ግራም በአንድ ሊትር ውሃ) ለ 5 ተከታታይ ቀናት ይስጡ።\n` +
        `• የሳር/መጋዝ ንጽህና፡ የዶሮው ማረፊያ እርጥብ እንዳይሆን በደረቅ መጋዝ ይሸፍኑ፤ እርጥበት ያለበትን በየጊዜው ያስወግዱ።\n\n` +
        `**3. የተመጣጠነ መኖ፡**\n` +
        `• እንቁላል ጣይ ዶሮዎች በቀን ከ115-125 ግራም የተመጣጠነ መኖ እና የእንቁላል ቅርፊት እንዳይሰበር የኖራ ድንጋይ/የአጥንት ዱቄት (ካልሲየም) ያስፈልጋቸዋል።`;
      action = 'Administer Newcastle HB1/LaSota eye drops and treat bloody diarrhea with Amprolium 20% in drinking water.';
    } else if (isCompost) {
      responseEn = `### ♻️ Standardized Rapid Aerobic Compost Preparation Protocol (Ethiopia):\n\n` +
        `**1. Heap Sizing & Layering (1.5 m x 1.5 m x 1.5 m):**\n` +
        `• Base Layer (15 cm): Coarse twigs or dry maize stalks to ensure bottom aeration and drainage.\n` +
        `• Brown Carbon Layer (20 cm): Dry straw, teff chaff, dry leaves (provides carbon energy).\n` +
        `• Green Nitrogen Layer (15 cm): Fresh green weeds, legume leaves, vegetable scraps (provides nitrogen).\n` +
        `• Animal Manure Layer (5 cm): Fresh cattle dung or poultry droppings to inoculate active microbes.\n` +
        `• Top Dressing: Sprinkle a thin layer of topsoil and wood ash (for phosphorus and potassium).\n\n` +
        `**2. Moisture & Turning Management:**\n` +
        `• Moisture Level: Water each layer during building until moisture reaches 55-60% (moist like a squeezed damp sponge; drops should not run freely).\n` +
        `• Turning Cycle: Turn the heap entirely on **Day 21** and **Day 45** to introduce oxygen. Peak temperature should reach 55-65°C to kill weed seeds and pathogens.\n\n` +
        `**3. Field Application:**\n` +
        `• Apply 5-10 tons/ha of cured dark, crumbly compost incorporated during final plowing.`;
      responseAm = `### ♻️ ደረጃውን የጠበቀ የፍጥነት ኮምፖስት (የተፈጥሮ ማዳበሪያ) ዝግጅት መመሪያ፡\n\n` +
        `**1. የክምሩ መጠን እና አነጣጥፍ (1.5 ሜትር ስፋት x 1.5 ሜትር ቁመት)፡**\n` +
        `• የመሰረት ሽፋን (15 ሳ.ሜ)፡ አየር እንዲገባ ከስር የደረቁ የበቆሎ አገዳዎች ወይም እንጨቶችን ያንጥፉ።\n` +
        `• የደረቁ ነገሮች (20 ሳ.ሜ)፡ ገለባ፣ የደረቁ ቅጠሎችና ጭድ (ካርቦን ሰጪ)።\n` +
        `• አረንጓዴ ነገሮች (15 ሳ.ሜ)፡ ለምለም አረም፣ የባቄላ/አተር ቅጠል፣ የጓሮ አትክልት ተረፈ-ምርት (ናይትሮጂን ሰጪ)።\n` +
        `• ፍግና እበት (5 ሳ.ሜ)፡ እርጥብ የከብት ፍግ ወይም የዶሮ እዳሪ ማይክሮቦችን ለማራባት ያንጥፉ።\n` +
        `• የላይኛው ሽፋን፡ ቀጠን ያለ ለም አፈር እና የእንጨት አመድ ይበትኑበት።\n\n` +
        `**2. የእርጥበትና የመገልበጥ ጊዜ፡**\n` +
        `• እርጥበት፡ እያንዳንዱን ሽፋን ሲያነጥፉ ውሃ ይርጩበት፤ በእጅ ሲጨመቅ ውሃ የማያፈስ ነገር ግን እርጥብ ስፖንጅ መሆን አለበት።\n` +
        `• መገልበጥ፡ ክምሩን በ **21ኛው ቀን** እና በ **45ኛው ቀን** ሙሉ በሙሉ ገልብጠው አየር እንዲገባ ያድርጉ።\n\n` +
        `**3. ለአፈር አጠቃቀም፡**\n` +
        `• የደረሰ ጥቁር ኮምፖስት በመሬት ዝግጅት ወቅት በሄክታር ከ5-10 ቶን ከአፈሩ ጋር ቀላቅለው ይጠቀሙ።`;
      action = 'Build a 1.5x1.5m heap with 3:1 brown-to-green layers, maintain 60% moisture, and turn on day 21 and 45.';
    } else if (isForage || isSheepOrGoat) {
      responseEn = `### 🌿 High-Yield Livestock Forage Cultivation & Sheep/Goat Fattening:\n\n` +
        `**1. Desho Grass (Pennisetum glaucifolium) & Napier Grass Agronomy:**\n` +
        `• Planting: Establish root splits or stem cuttings at 50x50 cm spacing on soil bunds and hillsides for both soil conservation and intensive cut-and-carry fodder.\n` +
        `• Harvest Frequency: First cutting at 75-90 days; subsequent cuttings every 45-60 days. Produces up to 30-40 tons/ha fresh biomass annually under moderate rainfall.\n` +
        `• Legume Intercropping: Mix with Alfalfa (Medicago sativa) or Desmodium to boost crude protein to >16%.\n\n` +
        `**2. Sheep & Goat Fattening (90-Day Protocol):**\n` +
        `• Deworming: Administer Albendazole (7.5 mg/kg body weight) and Ivermectin injection on Day 1 to eliminate internal flukes and external parasites.\n` +
        `• Intensive Ration: Feed 300-400 g/day of mixed concentrate (60% wheat bran, 38% oilseed cake, 1% bone meal, 1% salt) alongside ad-libitum Desho grass and clean water.`;
      responseAm = `### 🌿 የዴሾ/ዝሆን ሳር መኖ አመራረት እና የበግ/ፍየል ማደለብ መመሪያ፡\n\n` +
        `**1. የዴሾ ሳር (Desho Grass) እና የዝሆን ሳር አመራረት፡**\n` +
        `• ተከላ፡ ስሮችን ወይም ግንዶችን በ 50 ሳ.ሜ ርቀት በእርከኖችና በዳገታማ መሬት ላይ ይትከሉ፤ አፈርን ከአፈር መሸርሸር ይጠብቃል፣ የተትረፈረፈ መኖ ይሰጣል።\n` +
        `• አጨዳ፡ የመጀመሪያው አጨዳ ከተተከለ ከ 2 ወር ተኩል በኋላ ሲሆን ቀጥሎ በየ 45-60 ቀኑ ይታጨዳል። በዓመት እስከ 40 ቶን ለምለም ሳር ይሰጣል።\n` +
        `• ከአልፋልፋ (Alfalfa) ጋር ማቀናጀት፡ ከፍተኛ ፕሮቲን እንዲኖረው ከአልፋልፋ ወይም ዴስሞዲየም ሳር ጋር ቀላቅለው ያምርቱ።\n\n` +
        `**2. የበግና ፍየል ማደለብ (የ90 ቀናት መርሃ-ግብር)፡**\n` +
        `• የሆድ ትል ማከም፡ በማደለቢያው የመጀመሪያ ቀን አልቤንዳዞል (Albendazole) የትል መድኃኒት ይስጡ፤ ፀረ-ውጫዊ ተባይ አይቨርሜክቲን ይውጉ።\n` +
        `• የተመጣጠነ መኖ፡ በቀን ከ300-400 ግራም የተመጣጠነ መኖ (የስንዴ ፋፉሽ 60%፣ የኑግ ፋጉሎ 38%፣ ጨውና ካልሲየም 2%) ከዴሾ ሳር ጋር አቀናጅተው ያብሉ።`;
      action = 'Plant Desho grass at 50x50 cm spacing and deworm small ruminants with Albendazole before fattening.';
    } else if (isEnset) {
      responseEn = `### 🌳 Comprehensive Enset (Ensete ventricosum) Agronomy & Disease Management:\n\n` +
        `**1. Bacterial Wilt (Xanthomonas vasicola pv. musacearum - BXW) Control:**\n` +
        `• Symptoms: Yellowing and wilting of the innermost heart leaf, followed by slimy yellow bacterial ooze oozing from cut leaf stalks.\n` +
        `• Cultural Sanitation: Disinfect all knives, sickles, and harvesting machetes by flaming over fire or soaking in 5% household bleach (Sodium hypochlorite) before moving between plants.\n` +
        `• Eradication: Immediately uproot infected plants, dig a deep burial pit in a fallow spot, cover with soil, and fence the zone to prevent livestock vectoring.\n\n` +
        `**2. Soil Fertility & Transplanting:**\n` +
        `• Apply 15-20 kg of well-cured cattle manure in transplanting holes. Practice systematic rotation across suckers.`;
      responseAm = `### 🌳 የተሟላ የእንሰት (Ensete ventricosum) እንክብካቤ እና የባክቴሪያ ዋግ በሽታ መከላከያ፡\n\n` +
        `**1. የእንሰት ባክቴሪያ ዋግ (Bacterial Wilt - Xanthomonas) መከላከያ፡**\n` +
        `• ምልክት፡ የውስጠኛው የእንሰት ልብ ቅጠል ይጫጫል፣ ይደርቃል፤ ቅጠሉ ሲቆረጥ ቢጫ ፈሳሽ (ሙጫ) ይወጣዋል።\n` +
        `• የመሳሪያዎች ንጽህና፡ እንሰት የሚቆረጡ ቢላዎችን፣ ማጭዶችን እና መቆፈሪያዎችን በእሳት በማቃጠል ወይም በበረኪና ውሃ (5% Bleach) በማጠብ በሽታው ከአንዱ ወደ ሌላው እንዳይተላለፍ ያድርጉ።\n` +
        `• የታመመውን ማስወገድ፡ የታመመውን እንሰት ወዲያውኑ ከስሩ ነቅለው ጉድጓድ ቆፍረው ቅበሩት፤ ከብቶች የበሽታውን አምጪ እንዳያሰራጩ አጥሩ።\n\n` +
        `**2. ማዳበሪያና እንክብካቤ፡**\n` +
        `• በተከላ ወቅት በእያንዳንዱ ጉድጓድ ከ15-20 ኪ.ግ የበሰበሰ ፍግ ይጨምሩ።`;
      action = 'Sterilize cutting machetes with fire or bleach and immediately uproot and bury wilt-infected enset plants.';
    } else if (isWeed || cleanText.includes('ስትራይጋ')) {
      responseEn = `### 🌾 Integrated Weed & Parasitic Striga (Witchweed) Management:\n\n` +
        `**1. Striga hermonthica on Sorghum & Maize:**\n` +
        `• Biological Trap Cropping: Intercrop or rotate cereals with 'false hosts' such as Cowpea, Faba bean, Desmodium, or Groundnut that stimulate Striga seed germination without allowing attachment.\n` +
        `• Chemical Spray: Apply 2,4-D Amine salt at 1.5-2.0 L/ha before Striga plants flower to prevent seed rain (1 plant produces 50,000+ seeds that survive 20 years in soil).\n` +
        `• Soil Fertility: High soil nitrogen drastically suppresses Striga emergence. Apply recommended 100 kg/ha Urea.\n\n` +
        `**2. General Broadleaf & Grassy Weed Control in Wheat/Teff:**\n` +
        `• Apply 2,4-D Amine (1.0 L/ha) at 30-35 days after sowing for broadleaf weeds, or Puma Super (0.75-1.0 L/ha) for wild oat (Avena fatua) control.`;
      responseAm = `### 🌾 የተቀናጀ የአረም እና የአጋም/ስትራይጋ (Striga) መከላከያ መመሪያ፡\n\n` +
        `**1. በማሽላና በቆሎ ላይ የሚከሰተውን ስትራይጋ (Striga/Witchweed) ማጥፊያ፡**\n` +
        `• ሰብል ማፈራረቅ፡ ማሽላን ከጥራጥሬ ሰብሎች (ለምሳሌ ቦሎቄ፣ አተር፣ ዴስሞዲየም) ጋር ያፈራርቁ፤ የጥራጥሬ ሰብሎች የስትራይጋውን ዘር አፈር ውስጥ አስፈልፍለው ያከስሙታል።\n` +
        `• የኬሚካል መርጫ፡ ስትራይጋው አበባ ከማውጣቱ በፊት 2,4-ዲ አሚን (2,4-D Amine - 1.5-2.0 ሊ/ሄ) ይርጩ፤ አንድ ተክል 50,000 ዘር ስለሚያፈራ አበባ ሳይይዝ ማጥፋት ወሳኝ ነው።\n` +
        `• የማዳበሪያ ጥቅም፡ ከፍተኛ ናይትሮጂን (ዩሪያ) ስትራይጋ እንዳይበቅል ያግዳል፤ በሄክታር 100 ኪ.ግ ዩሪያ ይጠቀሙ።\n\n` +
        `**2. በስንዴና ጤፍ ላይ የተለመደ አረም መቆጣጠሪያ፡**\n` +
        `• ከተዘራ ከ30-35 ቀናት በኋላ ሰፋፊ ቅጠል ላላቸው አረሞች 2,4-ዲ (1.0 ሊ/ሄ)፣ ለስንዴ አረም/ሰሌን ደግሞ ፑማ ሱፐር (Puma Super) ይርጩ።`;
      action = 'Rotate with legumes to deplete Striga seedbank and spray 2,4-D amine before Striga flowers.';
    } else if (isMarket) {
      responseEn = `### 🏪 Agricultural Marketing & Grain Quality Optimization (Ethiopia):\n\n` +
        `**1. ECX (Ethiopian Commodity Exchange) Quality Standards:**\n` +
        `• Moisture Content: Cereals and pulses must be dried to below 12.5% moisture to prevent rejection or price docking.\n` +
        `• Impurities & Foreign Matter: Screen grain through seed cleaners to reduce chaff, stones, and broken kernels below 2.0%.\n\n` +
        `**2. Cooperative Aggregation & Price Maximization:**\n` +
        `• Aggregate harvest through Primary Agricultural Cooperatives to negotiate bulk transport and secure premium contract rates instead of selling individually at low post-harvest spot prices.\n` +
        `• Use warehouse receipt financing where available to hold grain safely until supply glut subsides (3-4 months post-harvest).`;
      responseAm = `### 🏪 የሰብል ገበያ፣ የኢትዮጵያ ምርት ገበያ (ECX) እና የተሻለ ዋጋ የማግኛ መመሪያ፡\n\n` +
        `**1. የጥራት ደረጃና የውሃ መጠን፡**\n` +
        `• የእርጥበት መጠን፡ በምርት ገበያ ተቀባይነት ለማግኘት የሰብሉ እርጥበት ከ 12.5% በታች መድረቅ አለበት።\n` +
        `• ባዕድ ነገሮችን ማጥራት፡ አቧራ፣ ጠጠር፣ የተሰበረ ሰብል ከ 2% በታች እንዲሆን በወንፊት ያጽዱ፤ ይህም ከፍተኛ የጥራት ደረጃ (Grade 1/2) ያስገኛል።\n\n` +
        `**2. በህብረት ስራ ማህበራት በኩል መሸጥ፡**\n` +
        `• በአጨዳ ወቅት ገበያው በምርት ስለሚጨናነቅ ዋጋ ዝቅ ይላል፤ ምርትዎን በፒክስ ከረጢት ጠብቀው በህብረት ስራ ማህበር በኩል በጅምላ በመሸጥ ከፍተኛ ትርፍ ያግኙ።`;
      action = 'Clean and sun-dry grain to <12.5% moisture and sell collectively through local agricultural cooperatives.';
    } else if (isMaize && isFertilizer) {
      responseEn = `### 🌽 Maize Fertilizer & Nutrient Management Schedule (Ethiopia):\n\n` +
        `**1. Basal Application at Sowing:**\n` +
        `• Apply 100 kg/ha NPS-Boron (NPS-B) placed 5 cm beside and 5 cm below the seed at planting.\n\n` +
        `**2. Split Nitrogen (Urea) Schedule:**\n` +
        `• First Top-Dressing: Apply 50 kg/ha Urea at knee-high vegetative stage (30-35 days after emergence) when soil is moist.\n` +
        `• Second Top-Dressing: Apply 50 kg/ha Urea just before tasseling (55-60 days after emergence). Always cover Urea with soil to prevent nitrogen volatilization loss.\n\n` +
        `**3. Organic Integration:**\n` +
        `• Incorporate 5-8 tons/ha cured farmyard compost during field preparation to improve moisture retention.`;
      responseAm = `### 🌽 ለበቆሎ ሰብል የተመጣጠነ የማዳበሪያ አጠቃቀም መመሪያ፡\n\n` +
        `**1. በመዝሪያ ወቅት (መሰረታዊ)፡**\n` +
        `• በሄክታር 100 ኪ.ግ NPS-B ከዘሩ ጎንና ስር 5 ሳ.ሜ ርቆ እንዲቀበር ያድርጉ።\n\n` +
        `**2. የዩሪያ ክፍፍል መርሃ-ግብር፡**\n` +
        `• አንደኛ ዙር ዩሪያ፡ በቆሎው ጉልበት ሲደርስ (ከተዘራ ከ30-35 ቀናት በኋላ አፈሩ እርጥብ ሲሆን) 50 ኪ.ግ/ሄ ዩሪያ ይጨምሩ።\n` +
        `• ሁለተኛ ዙር ዩሪያ፡ በቆሎው አበባ (ዘለላ) ሊያወጣ ሲል (ከተዘራ ከ55-60 ቀናት) ተጨማሪ 50 ኪ.ግ/ሄ ዩሪያ በአፈር ሸፍነው ይጨምሩ።\n\n` +
        `**3. የተፈጥሮ ማዳበሪያ፡**\n` +
        `• በመሬት ዝግጅት ወቅት በሄክታር ከ5-8 ቶን የበሰበሰ ኮምፖስት ወይም ፍግ ማከል የአፈሩን እርጥበት የመያዝ አቅም ያሳድጋል።`;
      action = 'Apply 100 kg/ha NPS at planting and split 100 kg/ha Urea at knee-high and tasseling stages.';
    } else if ((isWheat || isBarley) && isFertilizer) {
      responseEn = `### 🌾 Wheat & Cereal Fertilizer Application Protocol (Ethiopian Highlands):\n\n` +
        `**1. Sowing Application:**\n` +
        `• Apply 100 kg/ha NPS or NPS-Zinc at planting, drilled along seed rows.\n\n` +
        `**2. Urea Split Schedule:**\n` +
        `• Apply total 100 kg/ha Urea split into two equal doses: 50 kg/ha at sowing and 50 kg/ha top-dressed at tillering (30 days after sowing) when the soil has good moisture.\n\n` +
        `**3. Acid Soil Liming:**\n` +
        `• If soil pH is below 5.5, apply agricultural lime 1 month before sowing; otherwise phosphorus in NPS will remain locked in the soil.`;
      responseAm = `### 🌾 ለስንዴ እና ለገብስ ሰብል የማዳበሪያ አጠቃቀም መመሪያ፡\n\n` +
        `**1. በመዝሪያ ወቅት፡**\n` +
        `• በሄክታር 100 ኪ.ግ NPS ወይም NPS-Zinc ከመዝሪያው መስመር ጋር አብረው ይዝሩ።\n\n` +
        `**2. የዩሪያ ክፍፍል፡**\n` +
        `• በድምሩ 100 ኪ.ግ ዩሪያ ለሁለት ከፍለው ይጠቀሙ (50 ኪ.ግ በመዝሪያ ወቅት፣ 50 ኪ.ግ በብቅለት/ማደጊያ ወቅት አፈሩ እርጥብ ሲሆን)።\n\n` +
        `**3. አሲዳማ አፈር፡**\n` +
        `• አፈሩ አሲዳማ ከሆነ ማዳበሪያው እንዳይባክን ከመዝራት 1 ወር በፊት የግብርና ኖራ ይጠቀሙ።`;
      action = 'Apply 100 kg/ha NPS at planting and split Urea (50% at sowing, 50% at tillering).';
    } else if (isTeff && isFertilizer) {
      responseEn = `### 🌾 Teff (Eragrostis tef) Fertilizer & Lodging Prevention Guide:\n\n` +
        `**1. Basal Sowing:**\n` +
        `• Apply 100 kg/ha NPS-Boron at sowing on a firm, well-pulverized seedbed.\n\n` +
        `**2. Top-Dressing Urea:**\n` +
        `• Apply 40-50 kg/ha Urea at early tillering stage (30-35 days after sowing). Avoid excessive Urea as high nitrogen causes severe lodging (falling over).\n\n` +
        `**3. Split Timing:**\n` +
        `• Apply Urea strictly when soil is moist and hand weeding has already been completed.`;
      responseAm = `### 🌾 የጤፍ ሰብል ማዳበሪያና መተኛትን (Lodging) የመከላከያ መመሪያ፡\n\n` +
        `**1. በመዝሪያ ወቅት፡**\n` +
        `• በሄክታር 100 ኪ.ግ NPS-B በሚገባ በተዘጋጀ እና በደለደለ መሬት ላይ ከዘሩ ጋር ይጨምሩ።\n\n` +
        `**2. የዩሪያ አጠቃቀም፡**\n` +
        `• በሄክታር ከ40-50 ኪ.ግ ዩሪያ ሰብሉ በበቀለ ከ30-35 ቀናት በኋላ አረም ተነቅሎ ሲያበቃ ይጨምሩ። ከመጠን በላይ ዩሪያ ሰብሉ እንዲተኛ ስለሚያደርግ መጠኑን አይጨምሩ።\n\n` +
        `**3. የእርጥበት ሁኔታ፡**\n` +
        `• ዩሪያ የሚጨመረው አፈሩ በሚገባ እርጥብ በሆነበት ወቅት ብቻ ነው።`;
      action = 'Apply 100 kg/ha NPS-B at sowing and limit Urea to 50 kg/ha at tillering to prevent lodging.';
    } else if (isVegetable && isFertilizer) {
      responseEn = `### 🍅 Horticultural & Vegetable Fertilizer Schedule (Onion, Tomato, Potato, Pepper):\n\n` +
        `**1. Basal Dressing:**\n` +
        `• Apply 150-200 kg/ha NPS at transplanting mixed into planting furrows.\n\n` +
        `**2. Urea Split Feeding:**\n` +
        `• Apply 100 kg/ha Urea in two splits: first dose at 2-3 weeks after transplanting and second dose at flowering/tuber initiation.\n\n` +
        `**3. Onion Maturity Tip:**\n` +
        `• Stop nitrogen top-dressing 4 weeks before harvesting onions to allow proper bulb curing and prevent post-harvest neck rot.`;
      responseAm = `### 🍅 ለአትክልትና ሽንኩርት ሰብሎች የማዳበሪያ አጠቃቀም መመሪያ፡\n\n` +
        `**1. በመትከያ ወቅት፡**\n` +
        `• በሄክታር ከ150-200 ኪ.ግ NPS በችግኝ መትከያው መስመር ውስጥ ቀላቅለው ይጨምሩ።\n\n` +
        `**2. የዩሪያ አጠቃቀም፡**\n` +
        `• በሄክታር 100 ኪ.ግ ዩሪያ ለሁለት ከፍለው ችግኝ በተተከለ በ 3ኛው ሳምንት እና በአበባ/ፍሬ መያዣ ወቅት ይጨምሩ።\n\n` +
        `**3. የሽንኩርት ጥንቃቄ፡**\n` +
        `• ሽንኩርት ከመሰብሰቡ 4 ሳምንታት በፊት ዩሪያ ማቆም አለበት፤ ይህ ሽንኩርቱ በመጋዘን እንዳይበሰብስ ይከላከላል።`;
      action = 'Apply basal NPS at transplanting and split Urea; cease nitrogen 4 weeks before onion harvest.';
    } else if (isHarvestOrStorage) {
      responseEn = `### 🌾 Post-Harvest Grain Management & Safe Storage Protocol:\n\n` +
        `**1. Solar Drying:**\n` +
        `• Thoroughly sun-dry grain (Teff, Wheat, Maize) on clean tarpaulins until moisture is below 12-13% (grain cracks crisply between teeth).\n\n` +
        `**2. Hermetic Storage (PICS Bags):**\n` +
        `• Use triple-layer PICS bags (Perdue Improved Crop Storage). Squeeze out excess air and tie each liner independently to kill weevils through oxygen starvation.\n\n` +
        `**3. Granary Sanitation:**\n` +
        `• Sweep, clean, and repair storage silos before bringing in new harvest. Keep bags off the floor on wooden pallets away from walls.`;
      responseAm = `### 🌾 የድህረ-ምርት ሰብል አያያዝ እና አስተማማኝ የመጋዘን/ጎተራ አጠባበቅ መመሪያ፡\n\n` +
        `**1. የፀሐይ ማድረቅ፡**\n` +
        `• ሰብሉን (ስንዴ፣ በቆሎ፣ ጤፍ) በንጹህ ሸራ ላይ የውሃ መጠኑ ከ12-13% በታች እስኪሆን ድረስ በሚገባ ያድርቁ (በጥርስ ሲነከስ የሚሰበር መሆን አለበት)።\n\n` +
        `**2. ፒክስ ከረጢት (PICS Bags)፡**\n` +
        `• አየር የማያስገቡ 3 ደራራብ የፒክስ ከረጢቶችን ይጠቀሙ፤ አየሩን አውጥተው እያንዳንዱን ከረጢት ለይተው በማሰር ነቀዝን ያለ ኬሚካል ያጥፉ።\n\n` +
        `**3. የመጋዘን ንጽህና፡**\n` +
        `• አዲሱን ምርት ከማስገባትዎ በፊት ጎተራውን ያጽዱ፤ ከረጢቶችን ከወለል ከፍ ባሉ የእንጨት ፓሌቶች ላይ ያስቀምጡ።`;
      action = 'Sun-dry grain to <13% moisture and store in hermetic triple-layer PICS bags.';
    } else if (isApple || (isFruit && isGrafting)) {
      responseEn = `### 🍏 Expert Apple Tree Propagation & Grafting Advisory (Highlands):\n\n` +
        `**1. Grafting Technique:**\n` +
        `• Use Cleft Grafting (for top-working older trees) or Whip-and-Tongue Grafting (for nursery rootstocks 1-2 cm diameter). Ensure exact cambium alignment.\n\n` +
        `**2. Timing & Season:**\n` +
        `• Best performed during tree dormancy before bud break (late January to February, or early Belg season) in highland zones (e.g., Wollo, Debre Birhan, Chencha).\n\n` +
        `**3. Scion & Rootstock Selection:**\n` +
        `• Select mature, pencil-thick, dormant scion wood from virus-free mother trees (Anna, Dorsett Golden). Use semi-dwarfing rootstocks (MM106 or M9).\n\n` +
        `**4. Sealing & Aftercare:**\n` +
        `• Wrap tightly with grafting tape and apply pruning sealant to prevent desiccation. Keep root zone moist and remove rootstock suckers below the union.`;
      responseAm = `### 🍏 የፖም ዛፍ ማዳቀል (Grafting) እና የፍራፍሬ ችግኝ እንክብካቤ ባለሙያ መመሪያ፡\n\n` +
        `**1. የማዳቀል ዘዴ፡**\n` +
        `• በችግኝ ላይ የጅራትና ምላስ (Whip & Tongue) ወይም በጎለመሱ ዛፎች ላይ የስንጥቅ (Cleft) ማዳቀል ዘዴ ይጠቀሙ፤ የዛፉ የውስጥ ህያው ሽፋን (Cambium) በትክክል እንዲገጣጠም ያድርጉ።\n\n` +
        `**2. ተስማሚ ወቅት፡**\n` +
        `• በደጋማ አካባቢዎች (ለምሳሌ ወሎ፣ ደብረ ብርሃን፣ ቼንቻ) ዛፉ ቅጠል አፍስሶ እረፍት ላይ ሲሆን ከጥር አጋማሽ እስከ የካቲት (የበልግ ዝናብ መጀመሪያ) ይተገበራል።\n\n` +
        `**3. የማዳቀያ ቅርንጫፍ (Scion) እና ስር (Rootstock)፡**\n` +
        `• ጤናማ ከሆኑ የተሻሻሉ ዝርያዎች (አና፣ ዶርሴት ጎልደን) የተወሰዱ ቅርንጫፎችን ከ MM106 ወይም M9 ስር ጋር ያዳቅሉ።\n\n` +
        `**4. ጥበቃና እንክብካቤ፡**\n` +
        `• የማዳቀያ ቦታውን በማዳቀያ ፕላስቲክ አጥብቀው ይጠቅልሉ፤ አየርና እርጥበት እንዳይገባ የዛፍ ሰም (Wax) ይቀቡ።`;
      action = 'Select disease-free scion wood, align cambium layers tightly, and seal grafting union with waterproof tape.';
    } else if (isAvocadoOrMango) {
      responseEn = `### 🥑 Highland Avocado (Hass/Fuerte) & Mango Management:\n\n` +
        `**1. Grafting & Spacing:**\n` +
        `• Plant grafted seedlings at 6x6 m or 7x7 m spacing in deep, well-draining loamy soil with 50 cm hole enriched with 20 kg cured compost.\n\n` +
        `**2. Phytophthora Root Rot Prevention:**\n` +
        `• Avoid waterlogging; plant on raised mounds and apply Ridomil Gold MZ (2.5 kg/ha) if root rot symptoms (dieback, wilting) appear.\n\n` +
        `**3. Harvesting Standards:**\n` +
        `• Harvest when fruit reaches mature size and changes luster; clip with small stem attached to avoid fungal entry.`;
      responseAm = `### 🥑 የተሻሻለ አቮካዶ (ሃስ/ፉኤርቴ) እና ማንጎ አመራረት መመሪያ፡\n\n` +
        `**1. ተከላና ክፍተት፡**\n` +
        `• የተዳቀሉ ችግኞችን ከ6x6 እስከ 7x7 ሜትር ርቀት በደንብ በተዘጋጀ 50 ሳ.ሜ ጉድጓድ ውስጥ ከ20 ኪ.ግ ኮምፖስት ጋር ቀላቅለው ይትከሉ።\n\n` +
        `**2. የስር መበስበስ (Phytophthora) መከላከል፡**\n` +
        `• ውሃ እንዳይተኛ ከፍታ ባለው አፈር ላይ ይትከሉ፤ ምልክቱ ከታየ ሪዶሚል ጎልድ ፀረ-ፈንገስ ይጠቀሙ።\n\n` +
        `**3. አሰባሰብ፡**\n` +
        `• ፍሬው በሚገባ ሲደርጅ በትንሽ ግንዱ በመቁረጥ ይሰብስቡ፤ ፍሬውን እንዳይጎዳ በጥንቃቄ ይያዙ።`;
      action = 'Plant on raised beds to avoid root waterlogging and apply mulch around tree drip-line.';
    } else if (isTomato || (isVegetable && isDisease)) {
      responseEn = `### 🍅 Tomato & Vegetable Disease Management (Late Blight & Bacterial Wilt):\n\n` +
        `**1. Late Blight (Phytophthora infestans):**\n` +
        `• Spray systemic fungicide Ridomil Gold MZ (2.5 kg/ha) or Mancozeb 80% WP (2.5-3 kg/ha) every 7-10 days during cool, humid weather.\n\n` +
        `**2. Early Blight (Alternaria solani):**\n` +
        `• Apply Bravo 500 or Score 250 EC when concentric dark rings appear on lower leaves.\n\n` +
        `**3. Cultural Sanitation:**\n` +
        `• Water exclusively at root level (drip or furrow); prune bottom leaves touching the soil and burn infected plant debris immediately.`;
      responseAm = `### 🍅 የቲማቲም እና አትክልት በሽታዎች (የቅጠል መድረቅ/Late Blight) መከላከያ መመሪያ፡\n\n` +
        `**1. የቅጠል መድረቅ (Late Blight)፡**\n` +
        `• ከፍተኛ እርጥበት በሚኖርበት ጊዜ ሪዶሚል ጎልድ (Ridomil Gold MZ - 2.5 ኪ.ግ/ሄ) ወይም ማንኮዜብ በየ 7-10 ቀኑ ይርጩ።\n\n` +
        `**2. የቅጠል ነጠብጣብ (Early Blight)፡**\n` +
        `• ብራቮ 500 ወይም ስኮር 250 ኢሲ የተባሉትን ፀረ-ፈንገሶች በቅጠሉ ላይ ጥቁር ክብ ነጠብጣብ ሲታይ ይርጩ።\n\n` +
        `**3. የባህል እንክብካቤ፡**\n` +
        `• ውሃ ከስር በአፈር ላይ ብቻ ያጠጡ፤ አፈር የነካቸውን የታችኛውን ቅጠሎች ይቁረጡ፤ የታመሙትን ቅሪቶች ያቃጥሉ።`;
      action = 'Spray Ridomil Gold MZ fungicide immediately during humid weather and irrigate only at soil base.';
    } else if (isOnion) {
      responseEn = `### 🧅 Onion Agronomy & Purple Blotch (Alternaria porri) Control:\n\n` +
        `**1. Spacing & Aeration:**\n` +
        `• Transplant seedlings at 10-15 cm spacing between plants and 20 cm between rows to allow canopy air circulation and lower humidity.\n\n` +
        `**2. Disease Control:**\n` +
        `• Spray Cabrio Duo (2 L/ha) or Mancozeb preventative spray when purplish-brown sunken lesions appear on leaves.\n\n` +
        `**3. Bulb Maturation:**\n` +
        `• Cut off irrigation and stop nitrogen top-dressing 3-4 weeks before harvest when 50% of tops fall over to ensure proper neck closure and long shelf life.`;
      responseAm = `### 🧅 የሽንኩርት እንክብካቤ እና የወይንጠጅ ነጠብጣብ (Purple Blotch) መከላከያ መመሪያ፡\n\n` +
        `**1. የችግኝ ክፍተት፡**\n` +
        `• አየር እንዲዘዋወር በችግኞች መካከል ከ10-15 ሳ.ሜ፣ በመስመሮች መካከል 20 ሳ.ሜ ርቀት ጠብቀው ይትከሉ።\n\n` +
        `**2. የበሽታ መከላከያ፡**\n` +
        `• በቅጠሎች ላይ ወይንጠጅ ነጠብጣብ ከታየ ካብሪዮ ዱኦ (Cabrio Duo - 2 ሊ/ሄ) ወይም ማንኮዜብ ፀረ-ፈንገስ ይርጩ።\n\n` +
        `**3. የውሃ ማቆም፡**\n` +
        `• 50% የሽንኩርቱ አናት ሲተኛ ውሃ ማጠጣትና ዩሪያ ያቁሙ፤ ይህም ሽንኩርቱ በመጋዘን እንዳይበሰብስ ያደርጋል።`;
      action = 'Maintain 10-15 cm plant spacing and spray Cabrio Duo at first symptom of purple blotch.';
    } else if (isWheat || isBarley || ((isCereal || cleanText.includes('ዋግ') || cleanText.includes('ዝገት')) && isDisease)) {
      responseEn = `### 🌾 Wheat & Cereal Rust Early Warning & Fungicide Protocol:\n\n` +
        `**1. Stem & Yellow Rust (Puccinia spp.):**\n` +
        `• Scout fields every 3-5 days. Cool night temperatures with high humidity trigger rapid spore multiplication.\n\n` +
        `**2. Systemic Fungicide Intervention:**\n` +
        `• Apply Tilt 250 EC (Propiconazole) or Rex Duo at 0.5 L/ha immediately upon observing orange/yellow pustules. Do not delay beyond 5% canopy infection.\n\n` +
        `**3. Drainage & Certified Seed:**\n` +
        `• Plant certified rust-tolerant varieties (Kakaba, Ogolcho, Danda'a). Use BBM furrows to prevent waterlogging on vertisols.`;
      responseAm = `### 🌾 የስንዴ እና ገብስ ሰብል የዋግ (ዝገት) መከላከያ መመሪያ፡\n\n` +
        `**1. የዋግ በሽታ (Stem/Yellow Rust)፡**\n` +
        `• በየ 3-5 ቀኑ እርሻዎን ይፈትሹ፤ ከፍተኛ እርጥበት የበሽታውን ስርጭት ያፋጥነዋል።\n\n` +
        `**2. ፀረ-ፈንገስ መድኃኒት፡**\n` +
        `• በቅጠሎች ላይ ብጫ ወይም ቀይ-ቡናማ አረፋ እንደታየ ቲልት 250 ኢሲ (Tilt 250 EC) ወይም ሬክስ ዱኦ በሄክታር 0.5 ሊትር ይርጩ።\n\n` +
        `**3. የተሻሻሉ ዝርያዎች፡**\n` +
        `• ዋግን የሚቋቋሙ የስንዴ ዝርያዎችን (ካካባ፣ ኦጎልቾ) ይጠቀሙ፤ በወላካ አፈር ላይ የውሃ ማስተላለፊያ ቦይ ያዘጋጁ።`;
      action = 'Scout lower canopy for rust pustules and apply Tilt 250 EC fungicide immediately.';
    } else if (isMaize && (isPest || cleanText.includes('አባጨጓሬ') || cleanText.includes('ትል'))) {
      responseEn = `### 🌽 Maize Fall Armyworm (FAW - Spodoptera frugiperda) Integrated Control:\n\n` +
        `**1. Scouting Protocol:**\n` +
        `• Inspect 20 plants across 5 spots in your plot weekly. Look for window-pane leaf damage and sawdust-like frass in the central whorl.\n\n` +
        `**2. Chemical Control:**\n` +
        `• Spray Ampligo 150 ZC (0.2-0.3 L/ha) or Coragen (0.15 L/ha) directly targeted into the plant whorls during early morning or late afternoon.\n\n` +
        `**3. Biological & Cultural Methods:**\n` +
        `• Place bio-pesticide neem seed cake extract or fine wood ash into whorls. Practice push-pull companion planting with Desmodium.`;
      responseAm = `### 🌽 የበቆሎ ሰብል እና የመኸር ሰራዊት አባጨጓሬ (ፎል አርሚዎርም) መከላከያ መመሪያ፡\n\n` +
        `**1. የክትትል ዘዴ፡**\n` +
        `• በየሳምንቱ በእርሻዎ ውስጥ የበቆሎውን እምብርት ይፈትሹ፤ የተቦረቦሩ ቅጠሎችና የአባጨጓሬ እዳሪ መኖሩን ያረጋግጡ።\n\n` +
        `**2. የኬሚካል መርጫ፡**\n` +
        `• አባጨጓሬው ከታየ አምፕሊጎ 150 ዜድሲ (Ampligo - 0.2-0.3 ሊ/ሄ) ወይም ኮራጅን ማለዳ ወይም ምሽት ላይ በቀጥታ ወደ እምብርቱ ይርጩ።\n\n` +
        `**3. የተፈጥሮ ዘዴ፡**\n` +
        `• የኒም ፍሬ ዱቄት ወይም የእንጨት አመድ በእምብርቱ ላይ ያድርጉ፤ ከዴስሞዲየም ሳር ጋር አሰባጥረው ይዝሩ።`;
      action = 'Scout maize whorls for armyworm frass and spray Ampligo into whorls early morning.';
    } else if (isSoilOrLime) {
      responseEn = `### 🧪 Soil Health, Acidity Remediation & Vertisol Management:\n\n` +
        `**1. Soil Acidity & Lime Application:**\n` +
        `• For acidic soils (pH < 5.5 in Gojjam, Wollega, Sidama), broadcast agricultural lime (CaCO3) at 2-4 tons/ha 1 month before sowing and plow into top 15 cm.\n\n` +
        `**2. Heavy Clay / Vertisol Drainage:**\n` +
        `• Use the Broad Bed and Furrow (BBM) system with 80 cm beds and 40 cm furrows to drain excess water and eliminate waterlogging.\n\n` +
        `**3. Integrated Fertility:**\n` +
        `• Combine mineral fertilizers (NPS + Urea) with 5 tons/ha well-rotted farmyard compost to replenish organic matter and trace minerals.`;
      responseAm = `### 🧪 የአፈር ጤና፣ የአሲድ ማከሚያ ኖራ እና የወላካ አፈር መመሪያ፡\n\n` +
        `**1. የአፈር አሲዳማነትና የኖራ አጠቃቀም፡**\n` +
        `• አሲዳማ በሆኑ አፈሮች ላይ (ለምሳሌ ጎጃም፣ ወለጋ፣ ሲዳማ) በሄክታር ከ2-4 ቶን የግብርና ኖራ ከመዝራት 1 ወር በፊት በተኑና አፈሩን እሹት።\n\n` +
        `**2. የወላካ (ደለል) አፈር የውሃ ፍሳሽ፡**\n` +
        `• ውሃ እንዳይተኛ የቦይና እርከን ማስተላለፊያ (BBM) በመጠቀም ከመጠን በላይ የሆነውን የዝናብ ውሃ ያስወግዱ።\n\n` +
        `**3. የተቀናጀ ማዳበሪያ፡**\n` +
        `• NPS እና ዩሪያን ከ 5 ቶን የበሰበሰ የተፈጥሮ ኮምፖስት ጋር አቀናጅተው በመጠቀም የአፈሩን ለምነት ያሳድጉ።`;
      action = 'Apply agricultural lime at 2-4 t/ha for acidic soils and construct BBM drainage furrows on vertisols.';
    } else if (isWater) {
      responseEn = `### 💧 Climate-Smart Soil Moisture & Irrigation Management:\n\n` +
        `**1. Moisture Conservation:**\n` +
        `• Spread 3-5 cm crop residue mulch (teff straw or dry grass) to suppress evaporation by up to 40% and regulate soil temperature.\n\n` +
        `**2. In-Situ Water Harvesting:**\n` +
        `• Implement tied ridges and contour bunds across slopes to capture runoff and enhance in-situ soil infiltration.\n\n` +
        `**3. Critical Growth Stages:**\n` +
        `• Prioritize watering during critical flowering and grain filling stages to protect against yield penalties during dry spells.`;
      responseAm = `### 💧 የአፈር እርጥበት ጥበቃ እና የመስኖ አጠቃቀም መመሪያ፡\n\n` +
        `**1. እርጥበትን ማቆየት፡**\n` +
        `• የአፈርን እርጥበት ለመጠበቅ በደረቅ ገለባ/ሳር አፈሩን ከ3-5 ሳ.ሜ ይሸፍኑ (Mulching)፤ ይህም የውሃ ትነትን በ40% ይቀንሳል።\n\n` +
        `**2. ዝናብን መያዝ፡**\n` +
        `• በዳገታማ መሬት ላይ እርከን እና የውሃ መያዣ ጉድጓዶችን (Tied ridges) በማዘጋጀት የዝናብ ውሃን አፈር ውስጥ እንዲሰርግ ያድርጉ።\n\n` +
        `**3. የመስኖ ጊዜ፡**\n` +
        `• በሰብሉ የአበባና የፍሬ መያዣ ወቅት ተጨማሪ የመስኖ ውሃ በማቅረብ ድርቅን ይከላከሉ።`;
      action = 'Apply straw mulching and maintain tied ridges to preserve root-zone soil moisture.';
    } else if (isFertilizer) {
      responseEn = `### 🧪 Balanced Fertilizer Schedule for Ethiopian Soils:\n\n` +
        `**1. Basal Application (At Sowing):**\n` +
        `• Apply 100 kg/ha NPS-Boron/Zinc based on Ethiopian Soil Information System (EthioSIS) soil fertility maps.\n\n` +
        `**2. Top-Dressing (Split Urea):**\n` +
        `• Apply 50-100 kg/ha Urea in two splits: 50% at active tillering/knee-high and 50% prior to booting/flowering.\n\n` +
        `**3. Organic Integration:**\n` +
        `• Supplement with 5-8 tons/ha well-decomposed compost or farmyard manure to enhance soil organic carbon and micro-nutrient uptake.`;
      responseAm = `### 🧪 ለኢትዮጵያ አፈር የተመጣጠነ የማዳበሪያ አጠቃቀም መመሪያ፡\n\n` +
        `**1. በመዝሪያ ወቅት (መሰረታዊ)፡**\n` +
        `• በሄክታር 100 ኪ.ግ NPS-B በማዳበሪያ ካርታ (EthioSIS) መሰረት ከዘሩ ስር ያድርጉ።\n\n` +
        `**2. ዩሪያ (ናይትሮጂን) አጠቃቀም፡**\n` +
        `• በሄክታር 100 ኪ.ግ ዩሪያ ለሁለት ከፍለው በብቅለት ወቅት እና ሰብሉ አበባ ከመያዙ በፊት አፈሩ እርጥብ ሲሆን ይጨምሩ።\n\n` +
        `**3. የተፈጥሮ ማዳበሪያ፡**\n` +
        `• በሄክታር ከ5-8 ቶን የበሰበሰ ኮምፖስት በማከል የአፈሩን ለምነትና የውሃ የመያዝ አቅም ያሳድጉ።`;
      action = 'Apply basal NPS-B fertilizer at planting and split Urea application when soil is moist.';
    } else if (isTeff) {
      responseEn = `### 🌾 Comprehensive Teff (Eragrostis tef) Agronomic Advisory:\n\n` +
        `**1. Sowing & Planting Specifications:**\n` +
        `• Sow 10-15 kg/ha with row spacing of 20 cm for lodging reduction, or broadcast on well-pulverized, firm seedbeds during late July to early August (Meher season).\n\n` +
        `**2. Nutrient Management:**\n` +
        `• Apply 100 kg/ha NPS-Boron at planting. Top-dress with 50 kg/ha Urea at first tillering (30-35 days after planting) when soil has good moisture.\n\n` +
        `**3. Weed & Rust Control:**\n` +
        `• Hand-weed at 25-30 days or apply 2,4-D amine salt. For Teff leaf rust (Uromyces eragrostidis), spray Tilt 250 EC (Propiconazole) at 0.5 L/ha if brown pustules emerge.\n\n` +
        `**4. Lodging Mitigation:**\n` +
        `• Avoid excessive nitrogen and roll seedbed firmly before and after seeding.`;
      responseAm = `### 🌾 የጤፍ (Eragrostis tef) የተሟላ የግብርናና የሰብል እንክብካቤ መመሪያ፡\n\n` +
        `**1. የመዝሪያ ወቅትና ዘዴ፡**\n` +
        `• በመኸር ወቅት ከሐምሌ አጋማሽ እስከ ነሐሴ መጀመሪያ፤ በመስመር ሲዘራ በሄክታር ከ10-15 ኪ.ግ ዘር ከ20 ሳ.ሜ ርቀት ጋር ይጠቀሙ።\n\n` +
        `**2. የማዳበሪያ አጠቃቀም፡**\n` +
        `• በመዝሪያ ወቅት 100 ኪ.ግ/ሄ NPS-B፤ በብቅለት ወቅት (ዘር ከተዘራ ከ30-35 ቀናት በኋላ አፈሩ እርጥብ ሲሆን) 50 ኪ.ግ/ሄ ዩሪያ ይጨምሩ።\n\n` +
        `**3. አረም እና በሽታ መከላከል፡**\n` +
        `• በመጀመሪያው ወር አረም ያርሙ። የጤፍ ዝገት/ዋግ ምልክት ከታየ ፀረ-ፈንገስ ቲልት 250 ኢሲ (Tilt) በሄክታር 0.5 ሊትር ይርጩ።\n\n` +
        `**4. መተኛትን (Lodging) መከላከል፡**\n` +
        `• ከመጠን በላይ ናይትሮጂን አይጠቀሙ፤ መሬቱን በሚገባ በማለስለስና በማደላደል ዘሩን ይዝሩ።`;
      action = 'Follow recommended Teff row-planting spacing (20cm) and apply top-dressing Urea at tillering.';
    } else if (isMaize) {
      responseEn = `### 🌽 Maize (Zea mays) High-Yield Cultivation Advisory:\n\n` +
        `**1. Planting Specifications:**\n` +
        `• Sow 25 kg/ha certified hybrid seed (BH661, BH540) with 75 cm row spacing and 25 cm plant spacing at onset of main rains.\n\n` +
        `**2. Fertilization:**\n` +
        `• Apply 100 kg/ha NPS at planting; top-dress 100 kg/ha Urea split equally at knee-high and tasseling stages.\n\n` +
        `**3. Weed & Pest Management:**\n` +
        `• Keep field weed-free during first 45 days. Scout weekly for Fall Armyworm and stem borers.`;
      responseAm = `### 🌽 የበቆሎ (Zea mays) የተሻሻለ የአመራረት መመሪያ፡\n\n` +
        `**1. የመዝሪያ ዝርዝር፡**\n` +
        `• በሄክታር 25 ኪ.ግ የተሻሻለ ዝርያ (BH661፣ BH540) በመስመሮች መካከል 75 ሳ.ሜ፣ በቡቃያዎች መካከል 25 ሳ.ሜ ርቀት ጠብቀው ይዝሩ።\n\n` +
        `**2. የማዳበሪያ አጠቃቀም፡**\n` +
        `• 100 ኪ.ግ NPS በመዝሪያ ወቅት፤ 100 ኪ.ግ ዩሪያ ለሁለት ከፍለው በጉልበት እና በአበባ ወቅት ይጨምሩ።\n\n` +
        `**3. አረም እና ተባይ፡**\n` +
        `• በመጀመሪያዎቹ 45 ቀናት አረም እንዳይበቅል ያድርጉ፤ የአባጨጓሬ ክትትል ያድርጉ።`;
      action = 'Plant certified hybrid maize at 75x25 cm spacing and follow split Urea schedule.';
    } else if (isLegumes) {
      responseEn = `### 🫘 Grain Legumes & Pulses (Faba Bean, Chickpea, Lentil, Field Pea):\n\n` +
        `**1. Chocolate Spot (Botrytis fabae):**\n` +
        `• On faba beans, spray Mancozeb 80% WP or Tilt 250 EC immediately upon observing reddish-brown circular spots.\n\n` +
        `**2. Inoculation & Nitrogen Fixation:**\n` +
        `• Inoculate seed with Rhizobium bio-fertilizer before sowing to enhance biological nitrogen fixation; apply 100 kg/ha NPS at planting.\n\n` +
        `**3. Crop Rotation Benefit:**\n` +
        `• Rotating cereals (Wheat/Teff) with legumes breaks root rot disease cycles and leaves up to 40 kg/ha residual nitrogen in the soil.`;
      responseAm = `### 🫘 የጥራጥሬ ሰብሎች (ባቄላ፣ ሽምብራ፣ ምስር፣ አተር) እንክብካቤ መመሪያ፡\n\n` +
        `**1. የባቄላ ቸኮሌት ነጠብጣብ (Chocolate Spot)፡**\n` +
        `• ቀይ-ቡናማ ነጠብጣብ በቅጠሎች ላይ ሲታይ ማንኮዜብ 80% ደብሊውፒ ወይም ቲልት ፀረ-ፈንገስ በአፋጣኝ ይርጩ።\n\n` +
        `**2. ባዮ-ማዳበሪያና ናይትሮጂን፡**\n` +
        `• ናይትሮጂን ከአየር እንዲስብ የራይዞቢየም (Rhizobium) ባዮ-ማዳበሪያ ከዘሩ ጋር ቀላቅለው ይዝሩ፤ 100 ኪ.ግ NPS ይጠቀሙ።\n\n` +
        `**3. ሰብል ማፈራረቅ፡**\n` +
        `• ስንዴን ወይም ጤፍን ከጥራጥሬ ጋር ማፈራረቅ የአፈር ለምነትን ይጨምራል፤ የአፈር ወለድ በሽታዎችን ያጠፋል።`;
      action = 'Inoculate legume seeds with Rhizobium and spray Mancozeb early against Chocolate Spot.';
    } else if (isCoffee) {
      responseEn = `### ☕ Coffee (Coffea arabica) Agronomy & Shade Management:\n\n` +
        `**1. Coffee Berry Disease (Colletotrichum kahawae):**\n` +
        `• Spray Copper Hydroxide (Kocide) or Cabrio Duo at pinhead berry stage with 3-4 repeat applications during main rainy season.\n\n` +
        `**2. Shade & Soil Management:**\n` +
        `• Maintain 30-40% canopy shade with leguminous trees (Cordia africana, Millettia ferruginea, Albizia gummifera). Apply 10-15 tons/ha organic mulch.\n\n` +
        `**3. Quality Harvesting:**\n` +
        `• Selectively pick only uniform, deep-red cherries (cherries at peak sucrose density) to maximize specialty cupping score.`;
      responseAm = `### ☕ የቡና (Coffea arabica) እንክብካቤ፣ ጥላና የጥራት መመሪያ፡\n\n` +
        `**1. የቡና ፍሬ በሽታ (CBD)፡**\n` +
        `• ፍሬው በሚይዝበት ወቅት የኮፐር ሃይድሮክሳይድ (Kocide) ወይም ካብሪዮ ዱኦ ፀረ-ፈንገስ በዝናብ ወቅት በየ 4 ሳምንቱ ይርጩ።\n\n` +
        `**2. የጥላ ዛፎችና አፈር፡**\n` +
        `• ከ30-40% ጥላ የሚሰጡ ዛፎችን (ዋንዛ፣ ብርብራ) በእርሻው ውስጥ ይትከሉ፤ የአፈር እርጥበትን በደረቅ ገለባ/ቅጠል ይሸፍኑ።\n\n` +
        `**3. ምርት አሰባሰብ፡**\n` +
        `• የቀይ ወርቅ (ሙሉ በሙሉ የበሰሉ ቀይ ፍሬዎችን) ብቻ ለይተው በመልቀም የቡናውን ጥራትና ዋጋ ያሳድጉ።`;
      action = 'Apply Copper Hydroxide spray at berry expansion stage and harvest only ripe red cherries.';
    } else {
      // Dynamic contextual agronomy handler
      responseEn = `### 🌾 Comprehensive Agronomic Advisory regarding "${cleanText}":\n\n` +
        `**1. 🔍 Scientific Field Diagnosis & Inspection:**\n` +
        `• Regularly inspect crops and soil every 3-5 days across all field corners. Monitor soil moisture tension, leaf color variations, and early onset of pest colonization.\n\n` +
        `**2. 📋 Step-by-Step Management Protocol:**\n` +
        `• Plant certified, disease-screened seed suited to your agro-ecological altitude (Highland/Dega, Midland/Weyna Dega, Lowland/Kolla).\n` +
        `• Follow recommended row planting spacing to ensure canopy aeration and optimize plant population density.\n\n` +
        `**3. 💊 Soil Fertility & Crop Protection:**\n` +
        `• Apply basal compound fertilizer (100 kg/ha NPS-Boron/Zinc) placed at sowing and split top-dress nitrogen (Urea) when soil has optimal moisture.\n` +
        `• For insect pests, scout early and apply targeted EPA-registered bio-pesticides or approved synthetic chemistries during early mornings to protect pollinators.\n\n` +
        `**4. 🛡️ Sustainable Farm Resilience:**\n` +
        `• Maintain Broad Bed & Furrows (BBM) on heavy clay soils to prevent waterlogging, and mulch with dry teff/wheat straw to protect soil microbes.`;
      responseAm = `### 🌾 ስለ ጥያቄዎ "${cleanText}" የተሰጠ የተሟላ የግብርና ባለሙያ መመሪያ፡\n\n` +
        `**1. 🔍 ሳይንሳዊ ምርመራና ክትትል፡**\n` +
        `• በየ 3-5 ቀኑ እርሻዎን በመፈተሽ የአፈር እርጥበትን፣ የቅጠሎችን ቀለምና የሰብል እድገት ደረጃ በንቃት ይከታተሉ።\n\n` +
        `**2. 📋 ደረጃ በደረጃ የሚተገበሩ ተግባራት፡**\n` +
        `• ለአካባቢዎ ከፍታ (ደጋ፣ ወይና ደጋ፣ ቆላ) ተስማሚ የሆኑ የተመሰከረላቸውን ምርጥ ዘሮች ይጠቀሙ።\n` +
        `• አየር እንዲዘዋወር እና ምርታማነት እንዲጨምር በመስመር የመዝራት ዘዴን ይከተሉ።\n\n` +
        `**3. 💊 የአፈር ማዳበሪያና ሰብል ጥበቃ፡**\n` +
        `• በመዝሪያ ወቅት 100 ኪ.ግ/ሄ NPS-B፤ በብቅለትና ማደጊያ ወቅት ደግሞ ዩሪያ አፈሩ እርጥብ በሆነበት ጊዜ ይጨምሩ።\n` +
        `• ተባዮች ከታዩ በጊዜ በመለየት ንቦች በማይበሩበት በማለዳ ወቅት የሚመከሩ ፀረ-ተባዮችን ይርጩ።\n\n` +
        `**4. 🛡️ ዘላቂ የአፈርና እርሻ ጥበቃ፡**\n` +
        `• ውሃ በሚተኛበት አፈር ላይ የፍሳሽ ቦይ ያዘጋጁ፤ አፈሩ እንዳይደርቅ በደረቅ ገለባ ይሸፍኑ። ከአካባቢዎ የልማት ጣቢያ ባለሙያ ጋር ይመካከሩ።`;
      action = 'Conduct field scouting, apply balanced NPS/Urea fertilizer, and maintain drainage furrows.';
    }

    return {
      transcription: cleanText,
      detectedLanguage: detectedLang,
      responseEn,
      responseAm,
      recommendedAction: action,
    };
  }

  _getBilingualSynthesizedDiagnosis(cropHint = 'Wheat', plantIdData = null, plantNetData = null, perenualData = null) {
    // If Pl@ntNet or Plant.id provided real botanical/disease classification, use it directly
    const plantNetTop = plantNetData?.topDisease || plantNetData?.diseases?.[0] || null;
    const perenualTop = perenualData?.topResult || perenualData?.data?.[0] || null;

    if (plantIdData && plantIdData.crop && plantIdData.crop.scientificName && plantIdData.crop.scientificName !== 'Crop') {
      const sciName = plantIdData.crop.scientificName;
      const commonName = plantIdData.crop.commonNames?.[0] || sciName;
      const topDisease = plantNetTop || plantIdData.diseases?.[0] || null;
      const isHealthy = Boolean((plantIdData.isHealthy === true || plantIdData.isHealthy?.binary) && !plantNetTop);

      let amharicCrop = 'ሰብል';
      const sciLower = sciName.toLowerCase();
      if (sciLower.includes('triticum') || sciLower.includes('wheat')) amharicCrop = 'ስንዴ';
      else if (sciLower.includes('eragrostis') || sciLower.includes('tef')) amharicCrop = 'ጤፍ';
      else if (sciLower.includes('zea') || sciLower.includes('mays') || sciLower.includes('maize')) amharicCrop = 'በቆሎ';
      else if (sciLower.includes('lycopersicum') || sciLower.includes('tomato')) amharicCrop = 'ቲማቲም';
      else if (sciLower.includes('tuberosum') || sciLower.includes('potato')) amharicCrop = 'ድንች';
      else if (sciLower.includes('cepa') || sciLower.includes('onion')) amharicCrop = 'ሽንኩርት';
      else if (sciLower.includes('coffea') || sciLower.includes('coffee')) amharicCrop = 'ቡና';
      else if (sciLower.includes('malus') || sciLower.includes('apple')) amharicCrop = 'ፖም';
      else if (sciLower.includes('persea') || sciLower.includes('avocado')) amharicCrop = 'አቮካዶ';
      else if (sciLower.includes('hordeum') || sciLower.includes('barley')) amharicCrop = 'ገብስ';
      else if (sciLower.includes('sorghum')) amharicCrop = 'ማሽላ';
      else if (sciLower.includes('vicia') || sciLower.includes('faba') || sciLower.includes('bean')) amharicCrop = 'ባቄላ';

      if (isHealthy) {
        return {
          cropIdentified: { nameEn: `${commonName} (${sciName})`, nameAm: amharicCrop },
          diseaseName: { nameEn: 'Healthy Plant / No Active Pathogen Detected', nameAm: 'ጤናማ ተክል / የበሽታ ምልክት አልተገኘም' },
          pathogen: 'None (Healthy)',
          severity: 'LOW',
          confidenceScore: Math.round((plantIdData.isHealthyProbability || 0.95) * 100) / 100,
          symptoms: {
            en: 'Foliage and plant tissues display normal vigor, uniform coloration, and no necrotic lesions.',
            am: 'የተክሉ ቅጠሎችና ቅርንጫፎች ጤናማ እድገትና ንጹህ ቀለም ያሳያሉ፤ የበሽታ መበስበስ ምልክት የለም።',
          },
          treatment: {
            organicEn: 'Maintain balanced irrigation schedule and apply cured compost to sustain vigor.',
            organicAm: 'መደበኛ የመስኖና የአፈር እርጥበትን ይጠብቁ፤ የበሰበሰ የተፈጥሮ ኮምፖስት ይጠቀሙ።',
            chemicalEn: 'No chemical treatment required.',
            chemicalAm: 'ምንም አይነት ኬሚካል አያስፈልግም።',
            culturalOm: 'Biqiltuun fayyaadha; eegumsa biyyee fi bishaanii itti fufaa.',
          },
          prevention: {
            en: 'Continue weekly field scouting and maintain weed-free crop borders.',
            am: 'ሳምንታዊ የእርሻ ክትትልዎን ይቀጥሉ፤ የእርሻውን ድንበር ከአረም ያጽዱ።',
          },
        };
      }

      return {
        cropIdentified: { nameEn: `${commonName} (${sciName})`, nameAm: amharicCrop },
        diseaseName: {
          nameEn: topDisease?.name || 'Botanical Pathogen Infection',
          nameAm: `የ${amharicCrop} በሽታ (${topDisease?.name || 'የፈንገስ/ተባይ ምልክት'})`,
        },
        pathogen: topDisease?.cause || 'Identified Plant Pathogen',
        severity: (topDisease?.probability || 0) > 0.7 ? 'HIGH' : 'MODERATE',
        confidenceScore: Math.round((topDisease?.probability || plantIdData.crop?.probability || 0.88) * 100) / 100,
        symptoms: {
          en: topDisease?.description || `Visible foliage lesions and stress symptoms detected on ${commonName}.`,
          am: `በ${amharicCrop} ላይ የሚታዩ የበሽታ ምልክቶችና የቅጠል ጉዳቶች ተለይተዋል።`,
        },
        treatment: {
          organicEn: 'Remove and burn severely infected leaves; apply neem oil extract or copper soap spray.',
          organicAm: 'በከፍተኛ ሁኔታ የተጎዱ ቅጠሎችን አስወግደው ያቃጥሉ፤ የኒም ዘይት ወይም የተፈጥሮ ፀረ-ተባይ ይርጩ።',
          chemicalEn: perenualTop?.solutions?.[0]
            ? (typeof perenualTop.solutions[0] === 'object'
              ? `${perenualTop.solutions[0].subtitle || 'Targeted Protocol'}: ${perenualTop.solutions[0].description || ''}`
              : String(perenualTop.solutions[0]))
            : 'Apply appropriate targeted fungicide (e.g., Mancozeb, Tilt 250 EC, or Ridomil Gold MZ) according to label rates.',
          chemicalAm: 'በመመሪያው መሰረት ተገቢውን ፀረ-ፈንገስ (ለምሳሌ ማንኮዜብ፣ ቲልት ወይም ሪዶሚል ጎልድ) ይርጩ።',
          culturalOm: 'Dawaa qoricha dhibee itti gorfame seeraan fayyadamaa.',
        },
        prevention: {
          en: 'Implement crop rotation, maintain plant spacing for air circulation, and inspect weekly.',
          am: 'ሰብል ማፈራረቅን ይተግብሩ፤ የአየር ዝውውር እንዲኖር የሰብል ክፍተትን ይጠብቁ።',
        },
      };
    }

    const hint = (cropHint || '').toUpperCase();

    if (hint.includes('TOMATO') || hint.includes('ቲማቲም')) {
      return {
        cropIdentified: { nameEn: 'Tomato (Solanum lycopersicum)', nameAm: 'ቲማቲም' },
        diseaseName: { nameEn: 'Tomato Late Blight (Phytophthora infestans)', nameAm: 'የቲማቲም አረንጓዴ/ቅጠል መድረቅ በሽታ' },
        pathogen: 'Phytophthora infestans',
        severity: 'HIGH',
        confidenceScore: 0.94,
        symptoms: {
          en: 'Water-soaked irregular dark brown lesions on leaves and stems with white mold on leaf undersides.',
          am: 'በቅጠሎችና በግንዱ ላይ ጥቁር ቡናማ የውሃ ነጠብጣቦችና በቅጠሉ ስር ነጭ የፈንገስ ሻጋታ ይታያል።',
        },
        treatment: {
          organicEn: 'Remove and destroy infected vines; apply copper hydroxide preventative spray.',
          organicAm: 'የተጎዱትን ተክሎች ቆርጠው ያቃጥሉ፤ የኮፐር ሃይድሮክሳይድ ፀረ-ፈንገስ ይርጩ።',
          chemicalEn: 'Apply systemic fungicide Ridomil Gold MZ (2.5 kg/ha) or Profiler immediately.',
          chemicalAm: 'ሪዶሚል ጎልድ (Ridomil Gold) ወይም ፕሮፋይለር ፀረ-ፈንገስ በአፋጣኝ ይርጩ።',
          culturalOm: 'Qoricha Ridomil Gold biifaa; baala dhibame balleessaa.',
        },
        prevention: {
          en: 'Avoid overhead irrigation; stake tomatoes and maintain 50 cm row spacing for ventilation.',
          am: 'ቅጠሉ ላይ ውሃ አያፍሱ፤ አየር እንዲዘዋወር ቲማቲሙን በጨራቅ ያስሩ፤ የ50 ሳ.ሜ ክፍተት ይጠብቁ።',
        },
      };
    }

    if (hint.includes('COFFEE') || hint.includes('ቡና')) {
      return {
        cropIdentified: { nameEn: 'Coffee (Coffea arabica)', nameAm: 'ቡና' },
        diseaseName: { nameEn: 'Coffee Berry Disease (CBD)', nameAm: 'የቡና ፍሬ በሽታ' },
        pathogen: 'Colletotrichum kahawae',
        severity: 'HIGH',
        confidenceScore: 0.92,
        symptoms: {
          en: 'Dark, sunken necrotic spots on green expanding coffee berries causing premature berry drop.',
          am: 'በአረንጓዴ የቡና ፍሬዎች ላይ ጥቁር የሰመጡ ጠባሳዎች ይታያሉ፤ ፍሬው ያለጊዜው እንዲረግፍ ያደርጋሉ።',
        },
        treatment: {
          organicEn: 'Prune dead coffee twigs; apply organic copper soap spray early in the rainy season.',
          organicAm: 'የደረቁ የቡና ቅርንጫፎችን ይቁረጡ፤ በዝናብ መጀመሪያ የተፈጥሮ የኮፐር ድብልቅ ይርጩ።',
          chemicalEn: 'Apply Kocide 2000 (Copper Hydroxide) or Cabrio Duo at recommended flowering and berry pinhead stages.',
          chemicalAm: 'ኮሳይድ 2000 (Kocide) ወይም ካብሪዮ ዱኦ ፀረ-ፈንገስ ፍሬው በሚያብብበት ወቅት ይርጩ።',
          culturalOm: 'Dawaa Kocide biifaa; damee goge mummuraa.',
        },
        prevention: {
          en: 'Plant CBD-resistant varieties (e.g., 741, 74110, 74112); maintain 35% canopy shade.',
          am: 'በሽታውን የሚቋቋሙ የተሻሻሉ የቡና ዝርያዎችን (741፣ 74110) ይትከሉ፤ የ35% ጥላ ዛፎችን ይጠብቁ።',
        },
      };
    }

    if (hint.includes('APPLE') || hint.includes('ፖም')) {
      return {
        cropIdentified: { nameEn: 'Apple (Malus domestica)', nameAm: 'ፖም' },
        diseaseName: { nameEn: 'Apple Scab (Venturia inaequalis)', nameAm: 'የፖም ቅርፊት (ስካብ) በሽታ' },
        pathogen: 'Venturia inaequalis',
        severity: 'MODERATE',
        confidenceScore: 0.91,
        symptoms: {
          en: 'Olive-green to black velvety spots on leaves and corky scabs on apple fruits.',
          am: 'በቅጠሎች ላይ የወይራ አረንጓዴና ጥቁር ነጠብጣቦች፣ በፍሬው ላይ ደረቅ የቅርፊት ምልክቶች ይታያሉ።',
        },
        treatment: {
          organicEn: 'Rake and compost fallen leaves; spray sulfur-based fungicide early spring.',
          organicAm: 'የረገፉ ቅጠሎችን ሰብስበው ያፅዱ፤ በበልግ ወቅት የሰልፈር ድብልቅ ይርጩ።',
          chemicalEn: 'Apply Score 250 EC (Difenoconazole) or Captan at green tip stage.',
          chemicalAm: 'ስኮር 250 ኢሲ (Score 250 EC) ፀረ-ፈንገስ ቡቃያ በሚወጣበት ወቅት ይርጩ።',
          culturalOm: 'Baala harca\'e walitti qabaa; dawaa Score biifaa.',
        },
        prevention: {
          en: 'Prune trees for maximum sunlight penetration and air circulation.',
          am: 'ለዛፉ በቂ የፀሐይ ብርሃንና አየር እንዲያገኝ ቅርንጫፎቹን ይግረዙ።',
        },
      };
    }

    if (hint.includes('MAIZE') || hint.includes('CORN') || hint.includes('በቆሎ')) {
      return {
        cropIdentified: { nameEn: 'Maize (Zea mays)', nameAm: 'በቆሎ' },
        diseaseName: { nameEn: 'Fall Armyworm Infestation', nameAm: 'የመኸር ሰራዊት አባጨጓሬ (ፎል አርሚዎርም)' },
        pathogen: 'Spodoptera frugiperda',
        severity: 'HIGH',
        confidenceScore: 0.93,
        symptoms: {
          en: 'Ragged feeding holes on whorl leaves and sawdust-like frass deposits.',
          am: 'በበቆሎው እምብርት ቅጠሎች ላይ የተቀደዱ ቀዳዳዎች እና የላሟ ቅንጣት የሚመስል የአባጨጓሬ እዳሪ ይታያል።',
        },
        treatment: {
          organicEn: 'Apply neem seed powder or wood ash directly into plant whorls.',
          organicAm: 'የኒም ፍሬ ዱቄት ወይም የእንጨት አመድ በቀጥታ ወደ በቆሎው እምብርት ውስጥ ያድርጉ።',
          chemicalEn: 'Spray Ampligo 150 ZC or Coragen at early larval stages.',
          chemicalAm: 'አምፕሊጎ 150 ዜድሲ (Ampligo) ወይም ኮራጅን ፀረ-ተባይ በወቅቱ ይርጩ።',
          culturalOm: 'Dawaa biifamaa seeraan fayyadamaa; daaraa mukaa itti naqaa.',
        },
        prevention: {
          en: 'Early planting with first Belg/Meher rains; practice crop rotation with legumes.',
          am: 'ከመጀመሪያው ዝናብ ጋር ቀድመው ይዝሩ፤ ከጥራጥሬ ሰብሎች ጋር ሰብል ማፈራረቅን ይተግብሩ።',
        },
      };
    }

    if (hint.includes('TEFF') || hint.includes('ጤፍ')) {
      return {
        cropIdentified: { nameEn: 'Teff (Eragrostis tef)', nameAm: 'ጤፍ' },
        diseaseName: { nameEn: 'Teff Rust', nameAm: 'የጤፍ ዋግ' },
        pathogen: 'Uromyces eragrostidis',
        severity: 'MODERATE',
        confidenceScore: 0.91,
        symptoms: {
          en: 'Brownish elongated pustules on leaves and stems causing premature drying.',
          am: 'በቅጠሎችና በግንዱ ላይ የሚታዩ ቡናማ አረፋዎች ሰብሉ ያለጊዜው እንዲደርቅ ያደርጋሉ።',
        },
        treatment: {
          organicEn: 'Remove volunteer plants; ensure proper soil aeration and field drainage.',
          organicAm: 'የቀድሞ ተረፈ ሰብሎችን ያስወግዱ፤ ለእርሻው በቂ የአየር ዝውውርና የውሃ ፍሳሽ ያዘጋጁ።',
          chemicalEn: 'Apply Mancozeb 80% WP early upon initial symptom detection.',
          chemicalAm: 'ምልክቱ እንደታየ ማንኮዜብ 80% ደብሊውፒ ፀረ-ፈንገስ ይርጩ።',
          culturalOm: 'Qulqullina maasii eegaa; dawaa mancozeb fayyadamaa.',
        },
        prevention: {
          en: 'Use certified clean seeds (e.g., Quncho, Magna); avoid high seeding density.',
          am: 'የተመሰከረላቸው ንጹህ የጤፍ ዝርያዎችን (ለምሳሌ ቁንጮ፣ ማግና) ይጠቀሙ፤ ዘር እንዳይበዛ ያራርቁ።',
        },
      };
    }

    return {
      cropIdentified: { nameEn: 'Wheat (Triticum aestivum)', nameAm: 'ስንዴ' },
      diseaseName: { nameEn: 'Wheat Stem Rust', nameAm: 'የስንዴ ግንድ ዋግ (ረስት)' },
      pathogen: 'Puccinia graminis',
      severity: 'HIGH',
      confidenceScore: 0.95,
      symptoms: {
        en: 'Reddish-brown elongated pustules rupturing stem epidermis; severe yield loss risk.',
        am: 'በስንዴው ግንድ ላይ የተሰነጠቁ ቀይ-ቡናማ አረፋዎች ይታያሉ፤ ይህም ከፍተኛ የምርት ኪሳራ ሊያስከትል ይችላል።',
      },
      treatment: {
        organicEn: 'Destroy infected barberry bushes (alternate hosts); harvest early if ripe.',
        organicAm: 'የፈንገስ ማስተላለፊያ የሆኑ የዱር ቁጥቋጦዎችን ያፅዱ፤ ሰብሉ ከደረሰ በፍጥነት ይሰብስቡ።',
        chemicalEn: 'Apply Tilt 250 EC (Propiconazole) or Rex Duo fungicide immediately.',
        chemicalAm: 'ቲልት 250 ኢሲ (Tilt 250 EC) ወይም ሬክስ ዱኦ ፀረ-ፈንገስ በአፋጣኝ ይርጩ።',
        culturalOm: 'Dawaa Tilt 250 EC biifaa; sanyii filatamaa fayyadamaa.',
      },
      prevention: {
        en: 'Plant certified resistant varieties (Kakaba, Ogolcho, Kingbird); inspect weekly.',
        am: 'ዋግን የሚቋቋሙ የስንዴ ዝርያዎችን (ካካባ፣ ኦጎልቾ፣ ኪንግበርድ) ይዝሩ፤ በየሳምንቱ እርሻዎን ይፈትሹ።',
      },
    };
  }

  _getBilingualSynthesizedGraphInsights(woredaName = 'Adama Zuria', _timeframe = 'DAILY') {
    return {
      trendSummary: {
        en: `Rainfall in ${woredaName} has dropped 38% below the long-term seasonal median, indicating progressive soil moisture depletion.`,
        am: `በ${woredaName} የተመዘገበው ዝናብ ከረጅም ጊዜ አማካይ በ38% ቀንሷል፤ ይህም የአፈር እርጥበት በፍጥነት እየቀነሰ መሆኑን ያሳያል።`,
      },
      droughtRiskStatus: {
        status: 'WATCH',
        en: 'Moderate vegetation stress detected on NDVI; supplemental irrigation strongly advised.',
        am: 'በኤንዲቪአይ (NDVI) ላይ መጠነኛ የሰብል እርጥበት እጥረት ታይቷል፤ ተጨማሪ መስኖ እንዲሰጥ በጥብቅ ይመከራል።',
      },
      keyObservations: [
        {
          indicator: 'Rainfall Deficit',
          value: '-38%',
          interpretationEn: 'Below normal for current agro-climatic window.',
          interpretationAm: 'ወቅታዊ ከሆነው መደበኛ የዝናብ መጠን በታች ነው።',
        },
        {
          indicator: 'NDVI Vegetation Vigor',
          value: '0.48',
          interpretationEn: 'Early leaf senescence signs observed.',
          interpretationAm: 'የቅጠል መገርጣትና የመድረቅ የመጀመሪያ ምልክቶች ታይተዋል።',
        },
      ],
      actionableGuidance: {
        en: [
          'Apply organic mulch across crop beds to reduce soil moisture evaporation.',
          'Schedule night or early morning irrigation to maximize water absorption.',
        ],
        am: [
          'የአፈር እርጥበት እንዳይተን የደረቀ ሳር ወይም ገለባ በእርሻው ላይ ይጎዝጉዙ።',
          'ውሃው በአግባቡ እንዲሰርግ መስኖን ማታ ወይም ማለዳ ላይ ያጠጡ።',
        ],
      },
    };
  }
}

const openRouterClient = new OpenRouterClient();
module.exports = openRouterClient;
