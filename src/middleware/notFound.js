import { AppError } from '../utils/AppError.js';

/** Anything that matched no route. Registered after every router, before the error handler. */
export function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`, 'ROUTE_NOT_FOUND'));
}