import { describe, expect, it } from 'vitest';
import { DomainSafetyPolicy } from '../src/infrastructure/safety/domain-safety-policy.js';
import { SafetyError } from '../src/shared/errors.js';

describe('DomainSafetyPolicy', () => {
  it('allows any domain when no lists are configured', () => {
    const policy = new DomainSafetyPolicy([], []);
    expect(() => policy.assertNavigationAllowed('https://anything.com')).not.toThrow();
  });

  it('blocks a domain on the block-list, including subdomains', () => {
    const policy = new DomainSafetyPolicy([], ['evil.com']);
    expect(() => policy.assertNavigationAllowed('https://evil.com')).toThrow(SafetyError);
    expect(() => policy.assertNavigationAllowed('https://x.evil.com')).toThrow(SafetyError);
  });

  it('permits only allow-listed domains when an allow-list is set', () => {
    const policy = new DomainSafetyPolicy(['example.com'], []);
    expect(() => policy.assertNavigationAllowed('https://www.example.com')).not.toThrow();
    expect(() => policy.assertNavigationAllowed('https://other.com')).toThrow(SafetyError);
  });

  it('prioritizes the block-list over the allow-list', () => {
    const policy = new DomainSafetyPolicy(['example.com'], ['bad.example.com']);
    expect(() => policy.assertNavigationAllowed('https://bad.example.com')).toThrow(SafetyError);
  });

  it('rejects invalid URLs', () => {
    const policy = new DomainSafetyPolicy([], []);
    expect(() => policy.assertNavigationAllowed('not a url')).toThrow(SafetyError);
  });
});
