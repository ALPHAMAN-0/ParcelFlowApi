/**
 * The single error type the application throws on purpose.
 * `statusCode` drives the HTTP response, `code` is a stable machine-readable
 * identifier clients can branch on, `message` is for humans and may change,
 * `details` carries optional per-field information (validation errors).
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // expected, not a bug — safe to show the message
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(409, code, message, details);
  }

  static validation(details, message = 'Request validation failed') {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }
}