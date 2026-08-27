import { z } from 'zod';

// Node 22 can read .env natively — no dotenv dependency needed. Values already
// present in the real environment always win over the file, and production
// hosts inject their own variables, so the file is only loaded outside prod.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — rely on whatever the environment provides.
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  // Tests point at a separate database so `npm test` never wipes dev data.
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  REDIS_URL: z.string().optional(),
  // Rate-limit windows (milliseconds) and ceilings. Sensible defaults; tunable per environment.
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_TRACKING_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  RATE_LIMIT_TRACKING_MAX: z.coerce.number().int().positive().default(60),
  // Seed credentials — development convenience only.
  SEED_ADMIN_EMAIL: z.string().email().default('admin@parcelflow.dev'),
  // Deliberately NOT held to the 8-character registration policy: these are
  // throwaway demo logins typed by hand during a review. The real policy lives in
  // auth.schemas.js and still rejects anything shorter than 8 for /auth/register.
  SEED_ADMIN_PASSWORD: z.string().min(1).default('123'),
  SEED_STAFF_PASSWORD: z.string().min(1).default('123'),
  SEED_CUSTOMER_PASSWORD: z.string().min(1).default('123'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Refuse to start rather than run with a missing secret or a bad URL.
  console.error('✖ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

const config = parsed.data;

// In the test environment, swap in the dedicated test database when provided.
if (config.NODE_ENV === 'test' && config.TEST_DATABASE_URL) {
  config.DATABASE_URL = config.TEST_DATABASE_URL;
  config.DIRECT_URL = config.TEST_DATABASE_URL;
  // Prisma reads the datasource URL from the environment, so keep it in sync.
  process.env.DATABASE_URL = config.TEST_DATABASE_URL;
  process.env.DIRECT_URL = config.TEST_DATABASE_URL;
}

export const env = Object.freeze(config);
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';