import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createRequire } from 'node:module';
import { isProduction } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendSuccess, sendError } from './utils/response.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { parcelsRouter } from './modules/parcels/parcels.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

const { name, version } = createRequire(import.meta.url)('../package.json');

// Builds the app without binding a port, so tests can import it and drive it
// with supertest. server.js is the only place that calls listen().
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind a proxy the real client IP is in X-Forwarded-For. Trusting exactly
  // one hop keeps rate limiting accurate without trusting arbitrary headers.
  app.set('trust proxy', isProduction ? 1 : false);

  app.use(requestId); // first, so every later failure can carry the id
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' })); // cap applied during parsing, not after
  app.use(requestLogger);

  // --- service identity and health ------------------------------------------
  app.get('/', (_req, res) =>
    sendSuccess(res, 200, {
      service: name,
      version,
      health: { shallow: '/health', deep: '/health/db' },
      endpoints: ['/auth', '/parcels', '/admin'],
    }),
  );

  // Shallow. Never touches the database, so an uptime monitor can hit it every
  // 30 seconds forever without costing a connection.
  app.get('/health', (_req, res) => sendSuccess(res, 200, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  // Deep. For deploys and manual checks.
  app.get('/health/db', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return sendSuccess(res, 200, { status: 'ok', database: 'reachable' });
    } catch {
      return sendError(res, 503, { code: 'DATABASE_UNAVAILABLE', message: 'Database is not reachable', requestId: req.id });
    }
  });

  // --- feature modules -------------------------------------------------------
  app.use('/auth', authRouter);
  app.use('/parcels', parcelsRouter);
  app.use('/admin', adminRouter);

  // --- tail ------------------------------------------------------------------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}