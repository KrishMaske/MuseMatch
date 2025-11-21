import { createApp } from './app.js';
import { assertSafeConfig, embeddingProvider, env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';

async function start(): Promise<void> {
  assertSafeConfig();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        embeddingProvider,
        devAuthBypass: env.DEV_AUTH_BYPASS,
      },
      'MuseMatch API listening',
    );

    if (env.DEV_AUTH_BYPASS) {
      logger.warn(
        'DEV_AUTH_BYPASS is on: requests without a token are accepted as a development user.',
      );
    }
  });

  // Close the HTTP server before the database so in-flight requests can finish.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start the MuseMatch API');
  process.exit(1);
});
