import pino, { type Logger } from 'pino';
import type { AppConfig } from '../../config/index.js';

export type { Logger };

/**
 * Create the root application logger.
 *
 * Uses `pino` for fast, structured JSON logging. In development we enable
 * `pino-pretty` for human-readable output. Secrets are redacted defensively.
 */
export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.logging.level,
    // Never leak credentials into logs.
    redact: {
      paths: [
        'apiKey',
        'api_key',
        'password',
        'token',
        'authorization',
        '*.apiKey',
        '*.password',
        'headers.authorization',
      ],
      censor: '[redacted]',
    },
    transport: config.logging.pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}
