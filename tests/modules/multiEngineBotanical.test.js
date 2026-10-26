const axios = require('axios');
const plantNetClient = require('../../src/ingestion/plantNetClient');
const perenualClient = require('../../src/ingestion/perenualClient');

jest.mock('axios');

describe('Multi-Engine Botanical Clients Test Suite', () => {
  beforeAll(() => {
    plantNetClient.apiKey = 'valid_test_plantnet_key';
    perenualClient.apiKey = 'valid_test_perenual_key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Pl@ntNet Client', () => {
    it('should confirm configuration with valid API key', () => {
      expect(plantNetClient.baseUrl).toContain('plantnet.org');
      expect(typeof plantNetClient.isConfigured()).toBe('boolean');
    });

    it('should resolve base64 strings to Buffer properly', async () => {
      const mockB64 = Buffer.from('plantnet_sample_leaf').toString('base64');
      const buffer = await plantNetClient._resolveImageBuffer({ imageBase64: mockB64 });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('plantnet_sample_leaf');
    });

    it('should format diseases accurately upon successful Pl@ntNet API response', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          query: { images: ['sample.jpg'], organs: ['leaf'] },
          version: '2025-08-08 (7.4)',
          remainingIdentificationRequests: 490,
          results: [
            {
              name: 'USTINT',
              score: 0.88,
              description: 'Ustilago tritici - Loose smut of wheat',
              images: [
                {
                  url: {
                    m: 'https://bs.plantnet.org/image/m/ustint_sample.jpg',
                  },
                },
              ],
            },
          ],
        },
      });

      const result = await plantNetClient.identifyDisease({
        imageBase64: Buffer.from('mock_leaf').toString('base64'),
        organ: 'leaf',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('PlantNet');
      expect(result.diseases.length).toBe(1);
      expect(result.topDisease.eppoCode).toBe('USTINT');
      expect(result.topDisease.name).toContain('Ustilago tritici');
      expect(result.topDisease.images[0]).toContain('ustint_sample.jpg');
    });

    it('should format species accurately upon successful species identification', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          remainingIdentificationRequests: 489,
          results: [
            {
              score: 0.95,
              species: {
                scientificNameWithoutAuthor: 'Triticum aestivum',
                scientificNameAuthorship: 'L.',
                commonNames: ['Common wheat', 'Bread wheat'],
                family: { scientificNameWithoutAuthor: 'Poaceae' },
                genus: { scientificNameWithoutAuthor: 'Triticum' },
              },
            },
          ],
        },
      });

      const result = await plantNetClient.identifySpecies({
        imageBase64: Buffer.from('mock_leaf').toString('base64'),
      });

      expect(result.success).toBe(true);
      expect(result.species.length).toBe(1);
      expect(result.topSpecies.scientificName).toBe('Triticum aestivum');
      expect(result.topSpecies.family).toBe('Poaceae');
    });

    it('should handle Pl@ntNet API network errors gracefully without crashing', async () => {
      axios.post.mockRejectedValueOnce(new Error('Network timeout or CORS'));

      const result = await plantNetClient.identifyDisease({
        imageBase64: Buffer.from('mock_leaf').toString('base64'),
      });

      expect(result.success).toBe(false);
      expect(result.diseases).toEqual([]);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('Perenual Botanical & Pest/Disease Knowledge Client', () => {
    it('should confirm configuration with valid API key', () => {
      expect(perenualClient.baseUrl).toContain('perenual.com');
      expect(typeof perenualClient.isConfigured()).toBe('boolean');
    });

    it('should search pest & disease and format solutions properly', async () => {
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          total: 1,
          current_page: 1,
          last_page: 1,
          data: [
            {
              id: 42,
              common_name: 'Wheat Rust',
              scientific_name: 'Puccinia graminis',
              description: 'Fungal disease affecting cereal crops causing orange-brown pustules.',
              solution: 'Apply propiconazole (Tilt 250 EC) or tebuconazole.',
              host: ['Wheat', 'Barley'],
              images: [{ regular_url: 'https://perenual.com/sample_rust.jpg' }],
            },
          ],
        },
      });

      const result = await perenualClient.searchPestDisease('rust');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('Perenual');
      expect(result.data.length).toBe(1);
      expect(result.topResult.commonName).toBe('Wheat Rust');
      expect(result.topResult.solutions[0]).toContain('propiconazole');
      expect(result.topResult.hosts).toContain('Wheat');
    });

    it('should retrieve care guides for species', async () => {
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          data: [
            {
              id: 10,
              species_id: 1,
              section: [
                { id: 1, type: 'watering', description: 'Water deeply once a week.' },
                { id: 2, type: 'sunlight', description: 'Requires full sunlight 6-8 hours daily.' },
              ],
            },
          ],
        },
      });

      const guide = await perenualClient.getCareGuide(1);
      expect(Array.isArray(guide)).toBe(true);
      expect(guide.length).toBe(1);
      expect(guide[0].section[0].type).toBe('watering');
    });

    it('should handle Perenual API errors gracefully without throwing unhandled exceptions', async () => {
      axios.get.mockRejectedValueOnce(new Error('Rate limit exceeded (HTTP 429)'));

      const result = await perenualClient.searchPestDisease('blight');
      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toContain('Rate limit');
    });
  });
});
