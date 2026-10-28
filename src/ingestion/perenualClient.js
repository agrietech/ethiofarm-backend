const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Perenual Botanical & Pest/Disease Knowledge Base Client
 * Provides 10,000+ plant species data, care guides, and chemical & cultural disease solutions.
 */
class PerenualClient {
  constructor() {
    this.apiKey = env.PERENUAL_API_KEY || '';
    this.baseUrl = env.PERENUAL_API_URL || 'https://perenual.com/api';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5 && !this.apiKey.includes('your_'));
  }

  /**
   * Search for plant pest & disease profiles and chemical/cultural solutions
   */
  async searchPestDisease(query = '', page = 1) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'NOT_CONFIGURED', data: [], total: 0 };
    }

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/pest-disease-list`;
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          q: query || undefined,
          page,
        },
        timeout: 2500,
      });

      const items = response.data?.data || [];
      const formatted = items.map((item) => ({
        id: item.id,
        commonName: item.common_name,
        scientificName: item.scientific_name,
        otherNames: item.other_name,
        family: item.family,
        description: item.description,
        solutions: Array.isArray(item.solution)
          ? item.solution
          : (item.solution ? [item.solution] : []),
        hosts: item.host || [],
        images: (item.images || []).map((img) => img.regular_url || img.original_url || img.thumbnail).filter(Boolean),
      }));

      return {
        success: true,
        provider: 'Perenual',
        total: response.data?.total || formatted.length,
        currentPage: response.data?.current_page || 1,
        lastPage: response.data?.last_page || 1,
        data: formatted,
        topResult: formatted[0] || null,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      logger.warn(`[PerenualClient] Pest/disease search failed: ${msg}`);
      return { success: false, error: msg, data: [], total: 0 };
    }
  }

  /**
   * Search botanical species database
   */
  async searchSpecies(query = '', page = 1) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'NOT_CONFIGURED', data: [] };
    }

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/v2/species-list`;
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          q: query || undefined,
          page,
        },
        timeout: 10000,
      });

      return {
        success: true,
        provider: 'Perenual',
        total: response.data?.total || 0,
        data: response.data?.data || [],
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      logger.warn(`[PerenualClient] Species search failed: ${msg}`);
      return { success: false, error: msg, data: [] };
    }
  }

  /**
   * Retrieve species agronomic details (watering, soil, sunlight, hardiness)
   */
  async getSpeciesDetails(speciesId) {
    if (!this.isConfigured() || !speciesId) return null;

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/v2/species/details/${speciesId}`;
      const response = await axios.get(url, {
        params: { key: this.apiKey },
        timeout: 10000,
      });
      return response.data || null;
    } catch (err) {
      logger.warn(`[PerenualClient] Species details fetch failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Retrieve structured care guide for species (watering, sunlight, pruning)
   */
  async getCareGuide(speciesId) {
    if (!this.isConfigured() || !speciesId) return [];

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/species-care-guide-list`;
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          species_id: speciesId,
        },
        timeout: 10000,
      });
      return response.data?.data || [];
    } catch (err) {
      logger.warn(`[PerenualClient] Care guide fetch failed: ${err.message}`);
      return [];
    }
  }
}

const perenualClient = new PerenualClient();
module.exports = perenualClient;
