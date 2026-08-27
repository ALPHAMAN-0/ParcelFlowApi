import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// bcryptjs is pure JavaScript: no native build step to fail on a free-tier
// build machine (ADR-012). Cost factor comes from configuration so tests can
// lower it and production can raise it without a code change.
export function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}