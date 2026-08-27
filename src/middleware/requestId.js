import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns a correlation id to every request before anything can fail, so every
 * log line and every error response can carry it. A client-supplied id is
 * honoured when it is well-formed, which lets a caller correlate across systems.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}