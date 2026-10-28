const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.errorCode || err.code;
  let details = err.details || null;

  // Handle Prisma Database Errors gracefully
  if (err.name === 'PrismaClientKnownRequestError') {
    switch (err.code) {
      case 'P1000':
      case 'P1001':
      case 'P1002':
      case 'P1003':
      case 'P1008':
      case 'P1017':
      case 'P2024':
        statusCode = 503;
        code = 'SERVICE_UNAVAILABLE';
        message = 'Database connection is temporarily busy or unreachable. Please try again shortly.';
        break;
      case 'P2002':
        statusCode = 409;
        code = 'CONFLICT';
        message = `A record with this ${Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'unique field'} already exists.`;
        break;
      case 'P2025':
        statusCode = 404;
        code = 'NOT_FOUND';
        message = 'Requested resource was not found.';
        break;
      case 'P2003':
        statusCode = 400;
        code = 'FOREIGN_KEY_VIOLATION';
        message = 'Related resource record was not found.';
        break;
      case 'P2000':
        statusCode = 400;
        code = 'VALUE_TOO_LONG';
        message = 'One or more input values are too long.';
        break;
      case 'P2011':
      case 'P2012':
        statusCode = 400;
        code = 'MISSING_REQUIRED_FIELD';
        message = 'A required database field is missing or null.';
        break;
      default:
        statusCode = 500;
        code = 'DATABASE_ERROR';
        {
          const lines = (err.message || '').split('\n').filter((l) => l.trim() && !l.startsWith('Invalid `prisma'));
          const cleanMsg = lines[lines.length - 1]?.trim();
          message = cleanMsg || 'A database operation error occurred.';
          details = err.message;
        }
        break;
    }
  } else if (err.name === 'PrismaClientInitializationError') {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Database connection could not be established.';
  } else if (err.name === 'PrismaClientValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    // Extract concise message from Prisma validation error
    const lines = (err.message || '').split('\n').filter((l) => l.trim() && !l.startsWith('Invalid `prisma'));
    const cleanMsg = lines[lines.length - 1]?.trim() || 'Invalid data provided for database operation.';
    message = cleanMsg;
    details = process.env.NODE_ENV === 'development' ? err.message : cleanMsg;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    message = 'Authentication token is invalid or has expired.';
  }

  if (!code) {
    code =
      statusCode === 409
        ? 'CONFLICT'
        : statusCode === 404
          ? 'NOT_FOUND'
          : statusCode === 401
            ? 'UNAUTHORIZED'
            : statusCode === 403
              ? 'FORBIDDEN'
              : statusCode === 422
                ? 'VALIDATION_ERROR'
                : statusCode === 400
                  ? 'BAD_REQUEST'
                  : statusCode === 429
                    ? 'RATE_LIMIT_EXCEEDED'
                    : statusCode === 503
                      ? 'SERVICE_UNAVAILABLE'
                      : 'INTERNAL_ERROR';
  }

  res.status(statusCode).json({
    success: false,
    code,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    message, // for legacy flat format compatibility
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
