import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('applies sensible defaults when env is empty', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.server.port).toBe(3000);
    expect(config.llm.provider).toBe('mock');
    expect(config.humanize.enabled).toBe(true);
    expect(config.browser.headless).toBe(true);
  });

  it('coerces numeric and boolean strings', () => {
    const config = loadConfig({
      PORT: '8080',
      BROWSER_HEADLESS: 'false',
      HUMANIZE_ENABLED: 'false',
      BROWSER_SLOW_MO: '50',
    } as NodeJS.ProcessEnv);
    expect(config.server.port).toBe(8080);
    expect(config.browser.headless).toBe(false);
    expect(config.humanize.enabled).toBe(false);
    expect(config.browser.slowMo).toBe(50);
  });

  it('parses comma-separated domain lists to lower-case arrays', () => {
    const config = loadConfig({
      ALLOWED_DOMAINS: 'Example.com, Foo.org',
      BLOCKED_DOMAINS: 'Evil.com',
    } as NodeJS.ProcessEnv);
    expect(config.safety.allowedDomains).toEqual(['example.com', 'foo.org']);
    expect(config.safety.blockedDomains).toEqual(['evil.com']);
  });

  it('throws a descriptive error for invalid values', () => {
    expect(() =>
      loadConfig({ PORT: 'not-a-number', LOG_LEVEL: 'nope' } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment configuration/);
  });
});
