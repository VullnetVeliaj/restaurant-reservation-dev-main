const { isProduction } = require('../config/runtime');

/**
 * Centralized error handler middleware.
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;

  // Unexpected 5xx messages can carry internal details; keep them in logs only in production
  const message =
    isProduction && statusCode >= 500
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}

module.exports = errorHandler;
