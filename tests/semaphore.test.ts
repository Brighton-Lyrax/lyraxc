import { describe, expect, it } from 'vitest';
import { Semaphore } from '../src/shared/semaphore.js';
import { AppError } from '../src/shared/errors.js';

describe('Semaphore', () => {
  it('allows up to max concurrent slots', () => {
    const sem = new Semaphore(2);
    const r1 = sem.tryAcquire();
    const r2 = sem.tryAcquire();
    expect(sem.active).toBe(2);
    r1();
    r2();
    expect(sem.active).toBe(0);
  });

  it('throws a 429 AppError when the limit is exceeded', () => {
    const sem = new Semaphore(1);
    sem.tryAcquire();
    try {
      sem.tryAcquire();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(429);
      expect((err as AppError).code).toBe('TOO_MANY_TASKS');
    }
  });

  it('release is idempotent', () => {
    const sem = new Semaphore(1);
    const release = sem.tryAcquire();
    release();
    release(); // second call must not underflow
    expect(sem.active).toBe(0);
    // A slot is available again.
    expect(() => sem.tryAcquire()).not.toThrow();
  });

  it('rejects an invalid max', () => {
    expect(() => new Semaphore(0)).toThrow();
  });
});
