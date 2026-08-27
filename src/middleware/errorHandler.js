import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/response.js';
import { logger } from '../lib/logger.js';
import { isProduction } from '../config/env.js';

/** Translate anything thrown upstream into one AppError. */
function normalize(err) {
  if (err instanceof AppError) return err;

  // Body-parser failures (express.json)
  if (err?.type === 'entity.parse.failed') return AppError.badRequest('Request body is not valid JSON', 'INVALID_JSON');
  if (err?.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  // Prisma "known" errors carry a stable code
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
        return AppError.conflict(`A record with this ${target ?? 'value'} already exists`, 'DUPLICATE');
      }
      case 'P2025':
        return AppError.notFound('Resource not found');
      case 'P2003':
        return AppError.validation([{ field: String(err.meta?.field_name ?? 'reference'), message: 'Referenced record does not exist' }]);
      default:
        break;
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return AppError.badRequest('Invalid query construction', 'INVALID_QUERY');
  }

  // The process is healthy; its database is not. 503 matches what /health/db already
  // reports, and tells a proxy or uptime monitor to retry — a 500 says "stop asking".
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is not reachable');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/**
 * The only place an error becomes an HTTP response. Express 5 forwards
 * rejected promises here automatically, so route handlers need no wrappers.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const error = normalize(err);
  const requestId = req.id;

  if (error.statusCode >= 500) {
    logger.error('unhandled error', { requestId, message: err?.message, stack: err?.stack });
  } else if (error.statusCode !== 404 && error.statusCode !== 422) {
    logger.warn('request failed', { requestId, code: error.code, status: error.statusCode });
  }

  return sendError(res, error.statusCode, {
    code: error.code,
    message: error.message,
    details: error.details,
    requestId,
    // Internal detail is useful locally and dangerous in production.
    stack: !isProduction && error.statusCode >= 500 ? err?.stack : undefined,
  });
}