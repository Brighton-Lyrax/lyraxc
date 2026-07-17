import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logging/logger.js';
import { AppError, isAppError } from '../../shared/errors.js';

/**
 * Optional bearer-token authentication.
 *
 * When `API_KEY` is configured, every request must include
 * `Authorization: Bearer <API_KEY>`. When empty, auth is disabled (dev only)
 * and a warning is logged once at startup by the server.
 */
export function authMiddleware(config: AppConfig, logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.server.apiKey) {
      next();
      return;
    }
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token !== config.server.apiKey) {
      logger.warn({ path: req.path }, 'Rejected unauthorized request');
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key.' } });
      return;
    }
    next();
  };
}

/** Centralized error handler translating {@link AppError} into responses. */
export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (isAppError(err)) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    const error = err instanceof Error ? err : new AppError('Unexpected error');
    logger.error({ err: error.message, stack: error.stack }, 'Unhandled error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    });
  };
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
  });
}
