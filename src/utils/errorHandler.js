/**
 * Custom error class for VAPI SDK errors
 */
class VapiError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'VapiError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error codes for VAPI SDK
 */
const ERROR_CODES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
};

/**
 * Error handler middleware for API calls
 * @param {Error} error - The error object
 * @returns {VapiError} - Formatted VapiError
 */
const handleApiError = (error) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return new VapiError(
          data.message || 'Bad Request',
          ERROR_CODES.VALIDATION_ERROR,
          data.errors
        );
      case 401:
        return new VapiError(
          'Invalid API key',
          ERROR_CODES.INVALID_API_KEY
        );
      case 403:
        return new VapiError(
          'Unauthorized access',
          ERROR_CODES.UNAUTHORIZED
        );
      case 404:
        return new VapiError(
          'Resource not found',
          ERROR_CODES.NOT_FOUND
        );
      case 429:
        return new VapiError(
          'Rate limit exceeded',
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          { retryAfter: error.response.headers['retry-after'] }
        );
      case 500:
        return new VapiError(
          'Internal server error',
          ERROR_CODES.INTERNAL_SERVER_ERROR
        );
      default:
        return new VapiError(
          data.message || `Request failed with status code ${status}`,
          `HTTP_${status}`,
          data
        );
    }
  } else if (error.request) {
    // The request was made but no response was received
    if (error.code === 'ECONNABORTED') {
      return new VapiError(
        'Request timeout',
        ERROR_CODES.TIMEOUT
      );
    }
    return new VapiError(
      'No response received from server',
      ERROR_CODES.NETWORK_ERROR
    );
  }
  
  // Something happened in setting up the request that triggered an Error
  return new VapiError(
    error.message || 'An unknown error occurred',
    error.code || 'UNKNOWN_ERROR'
  );
};

/**
 * Error handler middleware for async functions
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
const asyncHandler = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    throw handleApiError(error);
  }
};

export { VapiError, ERROR_CODES, handleApiError, asyncHandler };
