import { z } from 'zod';

// Normalise before validating so "Alice@Example.com " and "alice@example.com"
// resolve to the same account.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Invalid email address'))
  .pipe(z.string().max(254));

// bcrypt only hashes the first 72 bytes. Anything longer gets silently
// truncated, so two different passwords could unlock the same account.
export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(72, 'Password must be at most 72 characters');

// strictObject, not object: a client sending { role: 'ADMIN' } gets a 422
// instead of having the field quietly dropped.
export const registerSchema = z.strictObject({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});