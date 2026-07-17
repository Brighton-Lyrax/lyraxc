import { loadConfig, type AppConfig } from '../../src/config/index.js';

/**
 * Build an AppConfig for tests with humanization disabled (fast, deterministic)
 * and a small step budget. Callers may override any slice.
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = loadConfig({
    LLM_PROVIDER: 'mock',
    HUMANIZE_ENABLED: 'false',
    AGENT_MAX_STEPS: '10',
    LOG_LEVEL: 'error',
    LOG_PRETTY: 'false',
  } as NodeJS.ProcessEnv);
  return { ...base, ...overrides };
}

/** A no-op logger that satisfies the pino Logger surface used in the app. */
export function silentLogger() {
  const noop = () => undefined;
  const logger: Record<string, unknown> = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
  };
  logger.child = () => logger;
  // Cast through unknown because we only use a subset of the interface.
  return logger as unknown as import('../../src/infrastructure/logging/logger.js').Logger;
}
