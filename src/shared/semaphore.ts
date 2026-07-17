import { AppError } from './errors.js';

/**
 * A minimal counting semaphore to cap concurrent operations (e.g. simultaneous
 * browser tasks) across the process, protecting against resource exhaustion.
 *
 * `tryAcquire` is non-blocking: it either reserves a slot immediately or throws
 * a 429 {@link AppError}, which the HTTP/WebSocket layers surface to the caller.
 */
export class Semaphore {
  private inUse = 0;

  constructor(private readonly max: number) {
    if (max < 1) throw new Error('Semaphore max must be >= 1');
  }

  /** Number of currently held slots. */
  get active(): number {
    return this.inUse;
  }

  /**
   * Reserve a slot or throw if the limit is reached.
   * @returns a release function that must be called exactly once.
   */
  tryAcquire(): () => void {
    if (this.inUse >= this.max) {
      throw new AppError(
        'Too many tasks are running concurrently. Please retry shortly.',
        { code: 'TOO_MANY_TASKS', statusCode: 429 },
      );
    }
    this.inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inUse = Math.max(0, this.inUse - 1);
    };
  }
}
