import { describe, expect, it } from 'vitest';
import {
  clamp,
  hostnameOf,
  randomInt,
  shortId,
} from '../src/shared/utils.js';
import { AppError, toError, isAppError, ValidationError } from '../src/shared/errors.js';

describe('utils', () => {
  it('randomInt stays within the inclusive range', () => {
    for (let i = 0; i < 200; i += 1) {
      const n = randomInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('clamp constrains values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('hostnameOf extracts the host or returns null', () => {
    expect(hostnameOf('https://Example.com/path')).toBe('example.com');
    expect(hostnameOf('garbage')).toBeNull();
  });

  it('shortId produces unique-ish prefixed ids', () => {
    const a = shortId('task_');
    const b = shortId('task_');
    expect(a.startsWith('task_')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('errors', () => {
  it('AppError carries code and status', () => {
    const err = new AppError('boom', { code: 'X', statusCode: 418 });
    expect(err.code).toBe('X');
    expect(err.statusCode).toBe(418);
    expect(isAppError(err)).toBe(true);
  });

  it('ValidationError defaults to 400', () => {
    expect(new ValidationError('bad').statusCode).toBe(400);
  });

  it('toError normalizes non-error values', () => {
    expect(toError('oops')).toBeInstanceOf(Error);
    expect(toError('oops').message).toBe('oops');
    const original = new Error('keep');
    expect(toError(original)).toBe(original);
  });
});
