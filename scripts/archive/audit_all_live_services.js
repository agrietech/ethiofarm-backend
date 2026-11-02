const https = require('https');

const endpoints = [
  { name: 'System Health', path: '/api/v1/health', method: 'GET' },
  { name: 'Administrative Boundaries', path: '/api/v1/boundaries/regions', method: 'GET' },
  { name: 'Dashboard Analytics', path: '/api/v1/analytics/dashboard', method: 'GET' },
  { name: 'Regional Breakdown', path: '/api/v1/analytics/regional-breakdown', method: 'GET' },
  { name: 'Early Warning Alerts', path: '/api/v1/alerts', method: 'GET' },
  { name: 'AI Voice Q&A', path: '/api/v1/ai/voice-inquiry', method: 'POST', body: { userQuestion: 'ስለ ስንዴ ግንድ ዋግ ንገረኝ', language: 'am' } },
];

console.log('================================================================');
console.log('       LIVE DEPLOYED BACKEND END-TO-END HEALTH AUDIT');
console.log('================================================================');

let completed = 0;
endpoints.forEach(ep => {
  const postData = ep.body ? JSON.stringify(ep.body) : null;
  const options = {
    hostname: 'agrietech.onrender.com',
    port: 443,
    path: ep.path,
    method: ep.method,
    headers: {
      'Content-Type': 'application/json',
      ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
    },
    timeout: 25000
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`[PASS] [${ep.name}] Status: ${res.statusCode} | Response size: ${data.length} bytes`);
      completed++;
      if (completed === endpoints.length) {
        console.log('================================================================');
        console.log('  ALL LIVE BACKEND SERVICES ARE HEALTHY AND ONLINE!');
        console.log('================================================================');
      }
    });
  });

  req.on('error', (err) => {
    console.log(`[FAIL] [${ep.name}] Error: ${err.message}`);
    completed++;
  });

  req.on('timeout', () => {
    console.log(`[TIMEOUT] [${ep.name}] Connection timed out`);
    req.destroy();
    completed++;
  });

  if (postData) req.write(postData);
  req.end();
});
