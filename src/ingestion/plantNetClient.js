const axios = require('axios');
const FormData = require('form-data');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Pl@ntNet API Client for Botanical & Plant Disease Diagnostics (INRAE / CIRAD)
 * Supports plant species identification and specialized crop pathology detection.
 */
class PlantNetClient {
  constructor() {
    this.apiKey = env.PLANTNET_API_KEY || '';
    this.baseUrl = env.PLANTNET_API_URL || 'https://my-api.plantnet.org/v2';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5 && !this.apiKey.includes('your_'));
  }

  /**
   * Convert various image input representations into a Buffer
   */
  async _resolveImageBuffer({ imageBuffer, imageBase64, imageUrl }) {
    if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
      return imageBuffer;
    }
    if (imageBase64) {
      const cleanB64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(cleanB64, 'base64');
    }
    if (imageUrl && imageUrl.startsWith('http')) {
      try {
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'EthioFarm-PlantNetClient/1.0' },
          timeout: process.env.NODE_ENV === 'test' ? 1500 : 8000,
        });
        return Buffer.from(response.data);
      } catch (fetchErr) {
        logger.warn(`[PlantNetClient] Failed to pre-fetch image URL: ${fetchErr.message}`);
      }
    }
    return null;
  }

  /**
   * Identify crop disease candidates from an image
   */
  async identifyDisease({ imageBuffer, imageBase64, imageUrl, organ = 'leaf' }) {
    if (!this.isConfigured()) {
      logger.info('[PlantNetClient] PLANTNET_API_KEY not configured. Skipping Pl@ntNet disease diagnosis.');
      return { success: false, reason: 'NOT_CONFIGURED', diseases: [] };
    }

    try {
      const buffer = await this._resolveImageBuffer({ imageBuffer, imageBase64, imageUrl });
      if (!buffer) {
        return { success: false, reason: 'NO_IMAGE_DATA', diseases: [] };
      }

      const form = new FormData();
      form.append('images', buffer, { filename: 'crop_sample.jpg', contentType: 'image/jpeg' });
      form.append('organs', organ || 'leaf');

      const targetUrl = `${this.baseUrl.replace(/\/$/, '')}/diseases/identify?include-related-images=true&api-key=${this.apiKey}`;
      const timeoutMs = 2500;

      const response = await axios.post(targetUrl, form, {
        headers: form.getHeaders(),
        timeout: timeoutMs,
      });

      const results = response.data?.results || [];
      const formattedDiseases = results.map((r) => ({
        eppoCode: r.name,
        name: r.description || r.name,
        score: r.score,
        probability: Math.round(r.score * 100) / 100,
        images: (r.images || []).map((img) => img.url?.m || img.url?.o || '').filter(Boolean),
      }));

      return {
        success: true,
        provider: 'PlantNet',
        version: response.data?.version || '2025-08-08',
        diseases: formattedDiseases,
        topDisease: formattedDiseases[0] || null,
        remainingRequests: response.data?.remainingIdentificationRequests ?? null,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.warn(`[PlantNetClient] Disease identification failed: ${msg}`);
      return { success: false, error: msg, diseases: [] };
    }
  }

  /**
   * Identify plant species from an image
   */
  async identifySpecies({ imageBuffer, imageBase64, imageUrl, organ = 'leaf', project = 'all' }) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'NOT_CONFIGURED', species: [] };
    }

    try {
      const buffer = await this._resolveImageBuffer({ imageBuffer, imageBase64, imageUrl });
      if (!buffer) {
        return { success: false, reason: 'NO_IMAGE_DATA', species: [] };
      }

      const form = new FormData();
      form.append('images', buffer, { filename: 'plant_sample.jpg', contentType: 'image/jpeg' });
      form.append('organs', organ || 'leaf');

      const targetUrl = `${this.baseUrl.replace(/\/$/, '')}/identify/${project}?api-key=${this.apiKey}`;
      const timeoutMs = process.env.NODE_ENV === 'test' ? 3000 : 15000;

      const response = await axios.post(targetUrl, form, {
        headers: form.getHeaders(),
        timeout: timeoutMs,
      });

      const results = response.data?.results || [];
      const speciesList = results.map((r) => ({
        scientificName: r.species?.scientificNameWithoutAuthor || '',
        authorship: r.species?.scientificNameAuthorship || '',
        commonNames: r.species?.commonNames || [],
        family: r.species?.family?.scientificNameWithoutAuthor || '',
        genus: r.species?.genus?.scientificNameWithoutAuthor || '',
        score: r.score,
        probability: Math.round(r.score * 100) / 100,
      }));

      return {
        success: true,
        provider: 'PlantNet',
        species: speciesList,
        topSpecies: speciesList[0] || null,
        remainingRequests: response.data?.remainingIdentificationRequests ?? null,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.warn(`[PlantNetClient] Species identification failed: ${msg}`);
      return { success: false, error: msg, species: [] };
    }
  }

  /**
   * Search identifiable diseases supported by Pl@ntNet
   */
  async getIdentifiableDiseases(prefix = '') {
    if (!this.isConfigured()) return [];
    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/diseases?prefix=${encodeURIComponent(prefix)}&api-key=${this.apiKey}`;
      const response = await axios.get(url, { timeout: 8000 });
      return response.data || [];
    } catch (err) {
      logger.warn(`[PlantNetClient] Diseases list fetch failed: ${err.message}`);
      return [];
    }
  }
}

const plantNetClient = new PlantNetClient();
module.exports = plantNetClient;
