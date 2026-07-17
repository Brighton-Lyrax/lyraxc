import type { Page } from 'playwright';
import type { AppConfig } from '../../config/index.js';
import { randomFloat, randomInt, sleep } from '../../shared/utils.js';

/**
 * Adds realistic, human-like behaviour to raw browser operations:
 *
 * - Randomized "think time" pauses between actions.
 * - Curved, multi-step mouse movement toward targets (Bezier-ish easing).
 * - Per-character typing with variable delays and occasional longer pauses.
 * - Smooth, chunked scrolling rather than instant jumps.
 *
 * All behaviour is toggled via configuration so tests and CI can run
 * deterministically fast by disabling humanization.
 */
export class Humanizer {
  constructor(private readonly config: AppConfig['humanize']) {}

  /** Whether human-like behaviour is enabled. */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Pause a random, human-like amount of "think time" between actions. */
  async thinkTime(): Promise<void> {
    if (!this.config.enabled) return;
    await sleep(randomInt(this.config.action.minMs, this.config.action.maxMs));
  }

  /**
   * Move the mouse to (x, y) along a curved path with easing, mimicking the
   * imprecise, accelerating-then-decelerating motion of a human hand.
   */
  async moveMouseTo(page: Page, x: number, y: number): Promise<void> {
    if (!this.config.enabled) {
      await page.mouse.move(x, y);
      return;
    }

    // Start from a slightly random offset to avoid perfectly straight lines.
    const startX = x + randomFloat(-120, 120);
    const startY = y + randomFloat(-120, 120);
    // Control point creates a gentle arc.
    const ctrlX = (startX + x) / 2 + randomFloat(-60, 60);
    const ctrlY = (startY + y) / 2 + randomFloat(-60, 60);

    const steps = randomInt(18, 30);
    for (let i = 1; i <= steps; i += 1) {
      const t = this.easeInOut(i / steps);
      // Quadratic Bezier interpolation for a natural curve.
      const px = (1 - t) ** 2 * startX + 2 * (1 - t) * t * ctrlX + t ** 2 * x;
      const py = (1 - t) ** 2 * startY + 2 * (1 - t) * t * ctrlY + t ** 2 * y;
      await page.mouse.move(px, py);
      await sleep(randomInt(4, 12));
    }
  }

  /**
   * Type text one character at a time with variable delays, small "thinking"
   * pauses after spaces/punctuation, mimicking a real typist.
   */
  async typeText(page: Page, text: string): Promise<void> {
    if (!this.config.enabled) {
      await page.keyboard.type(text);
      return;
    }

    for (const char of text) {
      await page.keyboard.type(char);
      let delay = randomInt(this.config.typing.minMs, this.config.typing.maxMs);
      // Occasionally pause a little longer, as humans do mid-sentence.
      if (char === ' ' || '.,!?'.includes(char)) {
        delay += randomInt(40, 160);
      }
      if (Math.random() < 0.03) {
        delay += randomInt(200, 500); // rare longer hesitation
      }
      await sleep(delay);
    }
  }

  /**
   * Scroll the page smoothly in chunks rather than a single instant jump.
   */
  async scroll(page: Page, direction: 'up' | 'down', steps: number): Promise<void> {
    const sign = direction === 'down' ? 1 : -1;
    for (let i = 0; i < steps; i += 1) {
      const distance = this.config.enabled ? randomInt(220, 420) : 400;
      await page.mouse.wheel(0, sign * distance);
      if (this.config.enabled) {
        await sleep(randomInt(120, 380));
      }
    }
  }

  /** Cubic ease-in-out for smooth acceleration/deceleration. */
  private easeInOut(t: number): number {
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }
}
