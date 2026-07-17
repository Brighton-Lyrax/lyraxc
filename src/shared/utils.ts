/**
 * Small, dependency-free helpers used across the codebase.
 */

/** Resolve after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Return a random integer in the inclusive range [min, max].
 * Falls back gracefully when min > max.
 */
export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** Return a random float in the range [min, max). */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Clamp a number to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Generate a short, URL-safe unique id (not cryptographically strong). */
export function shortId(prefix = ''): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${random}`;
}

/**
 * Extract the hostname from a URL string.
 * Returns null for invalid URLs.
 */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
