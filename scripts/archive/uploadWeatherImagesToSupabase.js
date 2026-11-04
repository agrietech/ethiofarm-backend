require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || 'https://uhktbbeqqdsfkooyrgmq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);
const bucket = 'diagnose';

const files = [
  'weather_sunny.jpg',
  'weather_partly_cloudy.jpg',
  'weather_cloudy.jpg',
  'weather_rainy.jpg',
  'weather_thunderstorm.jpg',
  'weather_fog.jpg',
  'weather_frost.jpg',
];

async function uploadAll() {
  console.log(`[Supabase Weather Sync] Uploading to bucket '${bucket}' at ${supabaseUrl}...`);
  const results = [];

  for (const f of files) {
    const filePath = path.resolve(__dirname, '../../agriEtech-frontend/assets/images/weather', f);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const destinationPath = `weather/${f}`;

    const { data, error } = await sb.storage.from(bucket).upload(destinationPath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    if (error) {
      console.error(`❌ Failed ${f}:`, error.message);
    } else {
      const { data: pub } = sb.storage.from(bucket).getPublicUrl(destinationPath);
      console.log(`✅ Uploaded ${f} -> ${pub?.publicUrl}`);
      results.push({ file: f, url: pub?.publicUrl });
    }
  }

  console.log('\n[Summary] All weather assets successfully synchronized with Supabase Storage:');
  console.table(results);
}

uploadAll().catch(console.error);
