const morgan = require('morgan');
const logger = require('../utils/logger');

function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = { ...obj };
  const sensitiveFields = ['password', 'passwordHash', 'token', 'apiKey', 'secret', 'authorization', 'cookie'];
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }
  
  return sanitized;
}

morgan.token('sanitized-body', (req) => {
  if (req.body && Object.keys(req.body).length > 0) {
    return JSON.stringify(sanitizeForLogging(req.body));
  }
  return '-';
});

const stream = {
  write: (message) => logger.info(message.trim()),
};

const requestLogger = morgan(':method :url :status :response-time ms - :res[content-length]', {
  stream,
  skip: (req) => {
    // Skip logging for health checks to reduce noise
    return req.url === '/health' || req.url === '/api/v1/health';
  }
});

module.exports = requestLogger;
