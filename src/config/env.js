require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 5000,
  APP_NAME: process.env.APP_NAME || 'EthioFarm',
  APP_URL: process.env.APP_URL || 'http://localhost:5000',
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : '*',
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://agrietech_user:agrietech_password@localhost:5432/agrietech_db?schema=public',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_BUCKET_AUDIO: process.env.SUPABASE_BUCKET_AUDIO || 'audio',
  SUPABASE_BUCKET_DIAGNOSE: process.env.SUPABASE_BUCKET_DIAGNOSE || 'diagnose',
  SUPABASE_BUCKET_AGRETECH: process.env.SUPABASE_BUCKET_AGRETECH || 'agrEtech',
  SUPABASE_BUCKET_PRIVATE: process.env.SUPABASE_BUCKET_PRIVATE || 'private',
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT, 10) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  SUPABASE_POOLER_HOST: process.env.SUPABASE_POOLER_HOST || '',
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || '',
  DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT === 'true',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_key_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev_refresh_secret_change_in_production',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  ADMIN_API_KEYS: process.env.ADMIN_API_KEYS || '',
  ADMIN_CONSOLE_PASSWORD: process.env.ADMIN_CONSOLE_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || process.env.ADMIN_KEY || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || process.env.ADMIN_CONSOLE_PASSWORD || '',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@ethiofarm.et').trim().toLowerCase(),
  getAdminKeys: () => {
    const keys = new Set();
    const candidates = [
      process.env.ADMIN_API_KEYS,
      process.env.ADMIN_CONSOLE_PASSWORD,
      process.env.ADMIN_PASSWORD,
      process.env.ADMIN_SECRET,
      process.env.ADMIN_KEY,
      process.env.ADMIN_PASS,
      process.env.ADMIN_TOKEN,
    ];
    for (const item of candidates) {
      if (!item) continue;
      item.split(',').map((k) => k.trim()).filter(Boolean).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  },
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'smsethiopia',
  SMS_ETHIOPIA_API_KEY: process.env.SMS_ETHIOPIA_API_KEY || '',
  SMS_ETHIOPIA_BASE_URL: process.env.SMS_ETHIOPIA_BASE_URL || 'https://smsethiopia.com/api',
  SMS_ETHIOPIA_SENDER_ID: process.env.SMS_ETHIOPIA_SENDER_ID || 'EthioFarm',
  USSD_SHORT_CODE: process.env.USSD_SHORT_CODE || '*212#',
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
  OPEN_METEO_BASE_URL: process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com/v1',
  NASA_POWER_BASE_URL:
    process.env.NASA_POWER_BASE_URL || 'https://power.larc.nasa.gov/api/temporal/daily/point',
  GLOFAS_API_KEY: process.env.GLOFAS_API_KEY,
  EARTHDATA_BEARER_TOKEN: process.env.EARTHDATA_BEARER_TOKEN,
  GEE_PROJECT_ID: process.env.GEE_PROJECT_ID || 'agrietech',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  GEE_SERVICE_ACCOUNT_EMAIL: process.env.GEE_SERVICE_ACCOUNT_EMAIL || '',
  GEE_PRIVATE_KEY: process.env.GEE_PRIVATE_KEY || '',
  PLANT_ID_API_KEY: process.env.PLANT_ID_API_KEY,
  PLANT_ID_API_URL: process.env.PLANT_ID_API_URL || process.env.PLANT_ID_BASE_URL || 'https://plant.id/api/v3',
  PLANTNET_API_KEY: process.env.PLANTNET_API_KEY,
  PLANTNET_API_URL: process.env.PLANTNET_API_URL || 'https://my-api.plantnet.org/v2',
  PERENUAL_API_KEY: process.env.PERENUAL_API_KEY,
  PERENUAL_API_URL: process.env.PERENUAL_API_URL || 'https://perenual.com/api',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  OPENROUTER_API_KEY: '',
  OPENROUTER_API_KEYS: '',
  OPENROUTER_API_KEYS_LIST: [],
  OPENROUTER_MODEL: 'google/gemini-3.5-flash-lite',
  OPENROUTER_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
  OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL || process.env.APP_URL || 'https://ethiofarm.et',
  OPENROUTER_SITE_NAME: process.env.OPENROUTER_SITE_NAME || 'EthioFarm Smart Farming Platform',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_KEY || '',
  GEMINI_API_KEYS_LIST: Array.from(new Set([
    ...(process.env.GEMINI_API_KEYS || process.env.GOOGLE_API_KEYS || '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && k.length > 5),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_AI_KEY,
  ].filter((k) => k && typeof k === 'string' && k.trim().length > 5).map((k) => k.trim()))),
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@ethiofarm.et',
  CHIRPS_BASE_URL: process.env.CHIRPS_BASE_URL || 'https://data.chc.ucsb.edu/products/CHIRPS-2.0',
  FAO_LOCUST_API_URL: process.env.FAO_LOCUST_API_URL || 'https://locust-hub-hqfao.hub.arcgis.com/api/v3',
};

// Validate critical variables in production
if (env.NODE_ENV === 'production') {
  const fatal = [];
  const warnings = [];

  // Hard requirements — app cannot function without these
  if (!process.env.DATABASE_URL) fatal.push('DATABASE_URL');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret_key_change_in_production') {
    fatal.push('JWT_SECRET (must be securely generated in production)');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    fatal.push('JWT_REFRESH_SECRET (must differ from JWT_SECRET)');
  }
  if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*') {
    fatal.push('CORS_ORIGIN (must be a specific domain list in production, not "*")');
  }

  // Soft requirements — app degrades gracefully without these
  if (!process.env.REDIS_URL && (!process.env.REDIS_HOST || process.env.REDIS_HOST === 'localhost')) {
    warnings.push('REDIS_HOST/REDIS_URL not set — rate limiting will use in-memory fallback');
  }

  if (warnings.length > 0) {
    console.warn(`[WARN] Missing optional production variables:\n  - ${warnings.join('\n  - ')}`);
  }
  if (fatal.length > 0) {
    throw new Error(`[FATAL] Missing required production environment variables: ${fatal.join(', ')}`);
  }
}


module.exports = env;
