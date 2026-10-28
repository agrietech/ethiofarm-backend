/**
 * Custom Application Error Classes for EthioFarm Platform
 * Enables uniform error propagation, HTTP status code mapping, and observability.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.code = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', errorCode = 'BAD_REQUEST', details = null) {
    super(message, 400, errorCode, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', errorCode = 'UNAUTHORIZED', details = null) {
    super(message, 401, errorCode, details);
  }
}

class ForbiddenError extends AppError {
  constructor(
    message = 'Insufficient permissions to perform this action',
    errorCode = 'FORBIDDEN',
    details = null
  ) {
    super(message, 403, errorCode, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND', details = null) {
    super(message, 404, errorCode, details);
  }
}

class ConflictError extends AppError {
  constructor(
    message = 'Resource conflict or duplicate entry',
    errorCode = 'CONFLICT',
    details = null
  ) {
    super(message, 409, errorCode, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null, errorCode = 'VALIDATION_ERROR') {
    super(message, 422, errorCode, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', details = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServiceUnavailableError,
};
