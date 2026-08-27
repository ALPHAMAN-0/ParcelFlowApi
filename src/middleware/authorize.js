import { AppError } from '../utils/AppError.js';

/**
 * Role gate: "may this kind of user call this endpoint at all?"
 * Must run after `authenticate`. Answers 403 — the caller is known, this
 * endpoint is simply not for them. Record-level visibility is a separate
 * question, answered inside the service by scoping the query (ADR-009).
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden(`This action requires one of the roles: ${allowedRoles.join(', ')}`));
    }
    return next();
  };
}