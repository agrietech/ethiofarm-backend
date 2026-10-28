const axios = require('axios');
const plantIdClient = require('../../src/ingestion/plantIdClient');

jest.mock('axios');

describe('Plant.id Botanical Client Suite', () => {
  beforeAll(() => {
    plantIdClient.apiKey = 'valid_test_plant_id_api_key_12345';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct API endpoint', () => {
    expect(plantIdClient.apiUrl).toContain('plant.id');
  });

  it('should identify botanical crop and disease candidates for Maize', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        result: {
          classification: {
            suggestions: [
              {
                name: 'Zea mays',
                details: { common_names: ['Corn', 'Maize'] },
                probability: 0.95,
              },
            ],
          },
          disease: {
            suggestions: [
              {
                name: 'Maize Northern Leaf Blight (Exserohilum turcicum)',
                probability: 0.88,
                details: {
                  cause: 'Fungus',
                  description: 'Long elliptical grayish-green or tan lesions.',
                  treatment: { chemical: ['Mancozeb', 'Azoxystrobin'] },
                },
              },
            ],
          },
          is_healthy: { binary: false, probability: 0.12 },
        },
      },
    });

    const result = await plantIdClient.identifyCropHealth({
      cropHint: 'Maize',
      imageBase64: 'mock_base64_maize_image',
    });

    expect(result.success).toBe(true);
    expect(result.crop.scientificName).toContain('Zea mays');
    expect(result.diseases.length).toBeGreaterThan(0);
    expect(result.diseases[0].probability).toBeGreaterThan(0.5);
  });

  it('should identify botanical crop and disease candidates for Wheat', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        result: {
          classification: {
            suggestions: [
              {
                name: 'Triticum aestivum',
                details: { common_names: ['Wheat', 'Common wheat'] },
                probability: 0.94,
              },
            ],
          },
          disease: {
            suggestions: [
              {
                name: 'Wheat Stem Rust (Puccinia graminis)',
                probability: 0.85,
                details: {
                  cause: 'Fungus',
                  description: 'Reddish-brown pustules on stems and leaves.',
                  treatment: { chemical: ['Tilt 250 EC'] },
                },
              },
            ],
          },
          is_healthy: { binary: false, probability: 0.15 },
        },
      },
    });

    const result = await plantIdClient.identifyCropHealth({
      cropHint: 'Wheat',
      imageBase64: 'mock_base64_wheat_image',
    });

    expect(result.success).toBe(true);
    expect(result.crop.scientificName).toContain('Triticum aestivum');
    expect(result.diseases.length).toBeGreaterThan(0);
  });
});
