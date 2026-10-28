const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Plant.id (Kindwise) Botanical & Plant Disease Diagnostic Client
 * Supports Plant.id API v3 and API v2 with automatic version detection and fallback.
 */
class PlantIdClient {
  constructor() {
    this.apiKey = env.PLANT_ID_API_KEY || '';
    this.apiUrl = env.PLANT_ID_API_URL || env.PLANT_ID_BASE_URL || 'https://plant.id/api/v3';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5 && !this.apiKey.includes('your_'));
  }

  /**
   * Identify crop species and disease candidates from image
   * @param {object} options
   * @param {string} [options.imageBase64]
   * @param {string} [options.imageUrl]
   * @param {string} [options.cropHint]
   * @returns {Promise<object>}
   */
  async identifyCropHealth({ imageBase64, imageUrl, cropHint }) {
    if (!this.isConfigured()) {
      logger.info('[PlantIdClient] PLANT_ID_API_KEY not configured. Skipping external Plant.id lookup.');
      return { success: false, reason: 'NOT_CONFIGURED', diseases: [] };
    }

    try {
      let base64Data = imageBase64
        ? imageBase64.replace(/^data:image\/\w+;base64,/, '')
        : null;

      // If imageUrl provided without base64, fetch buffer and encode
      if (!base64Data && imageUrl && imageUrl.startsWith('http')) {
        if (imageUrl.includes('storage.agrietech.et') || imageUrl.includes('example.com') || imageUrl.includes('test.local')) {
          logger.info(`[PlantIdClient] Placeholder/test image URL (${imageUrl}) detected; skipping external lookup.`);
          return { success: false, reason: 'PLACEHOLDER_IMAGE', diseases: [] };
        }
        try {
          const imgResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'EthioFarm-BotanicalClient/1.0' },
            timeout: 2500,
          });
          base64Data = Buffer.from(imgResponse.data).toString('base64');
        } catch (_fetchErr) {
          logger.warn(`[PlantIdClient] Failed to pre-fetch image URL: ${_fetchErr.message}`);
        }
      }

      const formattedImage = base64Data
        ? `data:image/jpeg;base64,${base64Data}`
        : imageUrl;

      if (!formattedImage) {
        logger.info('[PlantIdClient] No image provided for identification.');
        return { success: false, reason: 'NO_IMAGE', diseases: [] };
      }

      const isV3 = this.apiUrl.includes('v3') || !this.apiUrl.includes('v2');
      let targetUrl = this.apiUrl;

      if (isV3) {
        if (!targetUrl.endsWith('/identification')) {
          targetUrl = `${targetUrl.replace(/\/$/, '')}/identification`;
        }

        const payload = {
          images: formattedImage ? [formattedImage] : [],
          similar_images: true,
          health: 'all',
          classification_level: 'species',
        };

        const response = await axios.post(targetUrl, payload, {
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 2500,
        });

        return this._parsePlantIdV3Response(response.data, cropHint);
      } else {
        // v2 API
        if (!targetUrl.endsWith('/identify')) {
          targetUrl = `${targetUrl.replace(/\/$/, '')}/identify`;
        }

        const payload = {
          api_key: this.apiKey,
          images: formattedImage ? [formattedImage] : base64Data ? [base64Data] : imageUrl ? [imageUrl] : [],
          modifiers: ['crops_fast', 'health_all', 'similar_images'],
          plant_details: ['common_names', 'taxonomy', 'wiki_description'],
          disease_details: ['cause', 'common_names', 'description', 'treatment'],
        };

        const response = await axios.post(targetUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 2500,
        });

        return this._parsePlantIdV2Response(response.data, cropHint);
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.warn(`[PlantIdClient] API call notice: ${msg}`);
      return { success: false, error: msg, diseases: [] };
    }
  }

  _parsePlantIdV3Response(data, cropHint) {
    const result = data?.result || {};
    const classification = result.classification?.suggestions || [];
    const topPlant = classification[0] || {};
    const diseaseAssessment = result.disease?.suggestions || [];
    const isHealthy = result.is_healthy?.binary ?? (diseaseAssessment.length === 0);

    return {
      success: true,
      apiVersion: 'v3',
      crop: {
        scientificName: topPlant.name || cropHint || 'Unknown Crop',
        commonNames: topPlant.details?.common_names || [cropHint || 'Plant'],
        probability: topPlant.probability ?? 0.85,
      },
      isHealthy,
      isHealthyProbability: result.is_healthy?.probability ?? 0.5,
      diseases: diseaseAssessment.slice(0, 3).map((d) => ({
        name: d.name,
        probability: d.probability,
        cause: d.details?.cause || 'Pathogen/Pest',
        description: d.details?.description || '',
        treatment: d.details?.treatment || {},
      })),
      rawPayload: data,
    };
  }

  _parsePlantIdV2Response(data, cropHint) {
    const suggestions = data?.suggestions || [];
    const topSuggestion = suggestions[0] || {};
    const healthAssessment = data?.health_assessment || {};
    const diseaseCandidates = healthAssessment.diseases || [];

    return {
      success: true,
      apiVersion: 'v2',
      crop: {
        scientificName: topSuggestion.plant_name || cropHint || 'Unknown Crop',
        commonNames: topSuggestion.plant_details?.common_names || [cropHint || 'Plant'],
        probability: topSuggestion.probability ?? 0.85,
      },
      isHealthy: healthAssessment.is_healthy ?? false,
      isHealthyProbability: healthAssessment.is_healthy_probability ?? 0.05,
      diseases: diseaseCandidates.slice(0, 3).map((d) => ({
        name: d.name,
        probability: d.probability,
        cause: d.disease_details?.cause || 'Fungal/Pest pathogen',
        description: d.disease_details?.description || '',
        treatment: d.disease_details?.treatment || {},
      })),
      rawPayload: data,
    };
  }
}

const plantIdClient = new PlantIdClient();
module.exports = plantIdClient;
