import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load variables from a local .env file if present. In production the values
// are typically injected by the platform, so a missing .env is not an error.
loadDotenv();

/**
 * Coerce a comma-separated env string into a trimmed, lower-cased string array.
 */
const csvToArray = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const booleanFromString = z
  .string()
  .transform((value) => value.toLowerCase() === 'true');

/**
 * Zod schema describing every supported environment variable.
 * Defaults keep the app runnable out-of-the-box in development.
 */
const envSchema = z.object({
  // HTTP server
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  API_KEY: z.string().default(''),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_PRETTY: booleanFromString.default('true'),

  // Browser
  BROWSER_HEADLESS: booleanFromString.default('true'),
  BROWSER_SLOW_MO: z.coerce.number().int().min(0).default(0),
  BROWSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  BROWSER_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1366),
  BROWSER_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(768),
  BROWSER_USER_AGENT: z.string().default(''),
  BROWSER_USER_DATA_DIR: z.string().default(''),

  // Humanizer
  HUMANIZE_ENABLED: booleanFromString.default('true'),
  HUMANIZE_TYPING_MIN_MS: z.coerce.number().int().min(0).default(45),
  HUMANIZE_TYPING_MAX_MS: z.coerce.number().int().min(0).default(140),
  HUMANIZE_ACTION_MIN_MS: z.coerce.number().int().min(0).default(350),
  HUMANIZE_ACTION_MAX_MS: z.coerce.number().int().min(0).default(1200),

  // LLM
  LLM_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AGENT_MAX_STEPS: z.coerce.number().int().positive().max(200).default(25),

  // Safety
  ALLOWED_DOMAINS: z.string().default(''),
  BLOCKED_DOMAINS: z.string().default(''),
});

export type RawEnv = z.infer<typeof envSchema>;

/**
 * Strongly-typed, immutable application configuration.
 */
export interface AppConfig {
  server: {
    port: number;
    host: string;
    corsOrigins: string[];
    apiKey: string;
  };
  logging: {
    level: RawEnv['LOG_LEVEL'];
    pretty: boolean;
  };
  browser: {
    headless: boolean;
    slowMo: number;
    timeoutMs: number;
    viewport: { width: number; height: number };
    userAgent: string | undefined;
    userDataDir: string | undefined;
  };
  humanize: {
    enabled: boolean;
    typing: { minMs: number; maxMs: number };
    action: { minMs: number; maxMs: number };
  };
  llm: {
    provider: RawEnv['LLM_PROVIDER'];
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxSteps: number;
  };
  safety: {
    allowedDomains: string[];
    blockedDomains: string[];
  };
}

/**
 * Parse and validate `process.env` into a typed {@link AppConfig}.
 * Throws a descriptive error listing every invalid variable.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const e = parsed.data;
  return {
    server: {
      port: e.PORT,
      host: e.HOST,
      corsOrigins: csvToArray(e.CORS_ORIGINS).length
        ? e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : ['*'],
      apiKey: e.API_KEY,
    },
    logging: {
      level: e.LOG_LEVEL,
      pretty: e.LOG_PRETTY,
    },
    browser: {
      headless: e.BROWSER_HEADLESS,
      slowMo: e.BROWSER_SLOW_MO,
      timeoutMs: e.BROWSER_TIMEOUT_MS,
      viewport: {
        width: e.BROWSER_VIEWPORT_WIDTH,
        height: e.BROWSER_VIEWPORT_HEIGHT,
      },
      userAgent: e.BROWSER_USER_AGENT || undefined,
      userDataDir: e.BROWSER_USER_DATA_DIR || undefined,
    },
    humanize: {
      enabled: e.HUMANIZE_ENABLED,
      typing: { minMs: e.HUMANIZE_TYPING_MIN_MS, maxMs: e.HUMANIZE_TYPING_MAX_MS },
      action: { minMs: e.HUMANIZE_ACTION_MIN_MS, maxMs: e.HUMANIZE_ACTION_MAX_MS },
    },
    llm: {
      provider: e.LLM_PROVIDER,
      baseUrl: e.LLM_BASE_URL,
      apiKey: e.LLM_API_KEY,
      model: e.LLM_MODEL,
      temperature: e.LLM_TEMPERATURE,
      maxSteps: e.AGENT_MAX_STEPS,
    },
    safety: {
      allowedDomains: csvToArray(e.ALLOWED_DOMAINS),
      blockedDomains: csvToArray(e.BLOCKED_DOMAINS),
    },
  };
}
