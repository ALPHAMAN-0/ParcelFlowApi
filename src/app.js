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

const { name, version } = createRequire(import.meta.url)('../package.json');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', isProduction ? 1 : false);

  app.use(requestId);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  app.get('/', (_req, res) =>
    sendSuccess(res, 200, { service: name, version, health: { shallow: '/health', deep: '/health/db' } }),
  );

  app.get('/health', (_req, res) =>
    sendSuccess(res, 200, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
  );

  app.get('/health/db', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return sendSuccess(res, 200, { status: 'ok', database: 'reachable' });
    } catch {
      return sendError(res, 503, { code: 'DATABASE_UNAVAILABLE', message: 'Database is not reachable', requestId: req.id });
    }
  });

  app.use('/auth', authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}