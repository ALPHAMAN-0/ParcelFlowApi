import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';

const app = createApp();

// Bind to the platform-provided port (Render sets PORT) with a local fallback from config.
const server = app.listen(env.PORT, () => {
  logger.info('server listening', { port: env.PORT, env: env.NODE_ENV });
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish,
// release the database pool, then exit. A hard deadline guards against hanging.
async function shutdown(signal) {
  logger.info('shutting down', { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));