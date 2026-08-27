import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'parcelflow-api';
const ALGORITHM = 'HS256';

/**
 * The token carries only what the API needs to identify the caller. The role
 * is included for convenience but the authenticate middleware re-reads the
 * user from the database, so a role change takes effect immediately.
 */
export function signToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    issuer: ISSUER,
    algorithm: ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/** Throws a jsonwebtoken error (TokenExpiredError / JsonWebTokenError) on failure. */
export function verifyToken(token) {
  // Pinning the algorithm list closes the "alg: none" / algorithm-confusion class of attacks.
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: [ALGORITHM] });
}