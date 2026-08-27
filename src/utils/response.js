/**
 * One response envelope for every endpoint (see architecture.md ADR-011).
 *   success: { success: true,  data, meta? }
 *   failure: { success: false, error: { code, message, details?, requestId } }
 */
export function sendSuccess(res, statusCode, data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendError(res, statusCode, { code, message, details, requestId, stack }) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  if (requestId) error.requestId = requestId;
  if (stack) error.stack = stack; // only ever attached outside production
  return res.status(statusCode).json({ success: false, error });
}