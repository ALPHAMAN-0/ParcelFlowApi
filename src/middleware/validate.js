import { AppError } from '../utils/AppError.js';

function formatIssues(issues, location) {
  return issues.map((issue) => ({
    location,
    field: issue.path.length ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/**
 * Validates `params`, `query` and `body` against Zod schemas and exposes the
 * parsed (coerced, trimmed, defaulted) values on `req.validated`. Services and
 * controllers read from there and never from the raw request, so every input
 * downstream is already trusted.
 *
 * Express 5 makes `req.query` a read-only getter, which is one more reason the
 * validated copy lives on its own property.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const errors = [];
    const validated = {};

    for (const [location, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) validated[location] = result.data;
      else errors.push(...formatIssues(result.error.issues, location));
    }

    if (errors.length) return next(AppError.validation(errors));

    req.validated = { params: {}, query: {}, body: {} , ...validated };
    return next();
  };
}