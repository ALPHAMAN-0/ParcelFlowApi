import { z } from 'zod';

export const ROLES = ['CUSTOMER', 'DELIVERY_STAFF', 'ADMIN'];

export const userIdParamsSchema = z.strictObject({
  id: z.uuid('Must be a valid user id (UUID)'),
});

export const listUsersQuerySchema = z.strictObject({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().min(1).max(100).optional(), // matches name or email
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateRoleSchema = z.strictObject({
  role: z.enum(ROLES, { message: `role must be one of: ${ROLES.join(', ')}` }),
});