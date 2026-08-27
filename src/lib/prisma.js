import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// One shared client for the whole process. Prisma manages its own connection
// pool; creating a client per request would exhaust the database.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});