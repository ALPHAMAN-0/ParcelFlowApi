import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env, isTest } from '../config/env.js';
import { sendError } from '../utils/response.js';

function makeLimiter({ windowMs, max, code, message, store }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,

    passOnStoreError: true,

    // req.ip and nothing else. A client-supplied header (CF-Connecting-IP,
    // X-Real-IP) can be forged, and a fresh value per request would put every
    // attempt in its own bucket — silently disabling the limit this file exists
    // to enforce. Express derives req.ip from X-Forwarded-For using the
    // `trust proxy` hop count set in app.js, which the client cannot influence.
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    skip: () => isTest, // the suite fires hundreds of requests from one IP
    store,
    handler: (req, res) => sendError(res, 429, { code, message, requestId: req.id }),
  });
}

async function createStore(prefix) {
  if (!env.REDIS_URL) return undefined;

  try {
    const [{ default: Redis }, { RedisStore }] = await Promise.all([
      import('ioredis'),
      import('rate-limit-redis'),
    ]);
    const client = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
    client.on('error', (err) => process.stderr.write(`redis error: ${err.code ?? err.message}\n`));
    return new RedisStore({ prefix, sendCommand: (...args) => client.call(...args) });
  } catch (err) {
    process.stderr.write(
      `REDIS_URL is set but the Redis limiter could not load (${err.message}). ` +
        'Falling back to the in-memory store.\n',
    );
    return undefined;
  }
}

const [loginStore, trackingStore] = await Promise.all([createStore('rl:login:'), createStore('rl:track:')]);

export const loginLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  code: 'TOO_MANY_LOGIN_ATTEMPTS',
  message: 'Too many login attempts. Please try again later.',
  store: loginStore,
});

export const trackingLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_TRACKING_WINDOW_MS,
  max: env.RATE_LIMIT_TRACKING_MAX,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many tracking requests. Please slow down.',
  store: trackingStore,
});