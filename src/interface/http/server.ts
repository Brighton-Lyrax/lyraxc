import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createContainer, type Container } from '../../container.js';
import {
  authMiddleware,
  errorHandler,
  notFoundHandler,
} from './middleware.js';
import { createApiRouter } from './routes.js';
import { attachWebSocket } from './websocket.js';

/**
 * Build the Express application with security middleware, static UI, the REST
 * API and error handling. Exported separately so it can be tested in isolation.
 */
export function createApp(container: Container): express.Express {
  const app = express();
  const { config, logger } = container;

  // --- Security & parsing middleware ---
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Allow the simple inline UI to load; tighten for production as needed.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.server.corsOrigins.includes('*')
        ? true
        : config.server.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // --- Static web UI ---
  // Resolve relative to the working directory so it works from both `src`
  // (tsx dev) and `dist` (built) without depending on the bundle layout.
  const webDir = path.resolve(process.cwd(), 'web');
  app.use(express.static(webDir));

  // --- API (auth-protected) ---
  app.use('/api', authMiddleware(config, logger), createApiRouter(container));

  // --- Fallbacks ---
  app.use('/api', notFoundHandler);
  app.use(errorHandler(config, logger));

  return app;
}

/** Boot the HTTP + WebSocket server. */
async function main(): Promise<void> {
  const container = createContainer();
  const { config, logger } = container;

  if (!config.server.apiKey) {
    logger.warn('API_KEY is not set — the API is unauthenticated (dev mode).');
  }

  const app = createApp(container);
  const server = createServer(app);
  attachWebSocket(server, container);

  server.listen(config.server.port, config.server.host, () => {
    logger.info(
      `Lyraxc listening on http://${config.server.host}:${config.server.port}`,
    );
  });

  // --- Graceful shutdown ---
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    await container.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Only run when executed directly (not when imported by tests). Comparing
// file URLs works cross-platform (handles Windows drive letters/backslashes).
const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error('Fatal startup error:', error);
    process.exit(1);
  });
}
