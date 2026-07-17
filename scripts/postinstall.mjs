/**
 * Postinstall hook.
 *
 * Installs the Chromium browser required by Playwright, unless the environment
 * opts out (e.g. CI running only unit tests that use fakes). Failures are
 * non-fatal so `npm install` never breaks in restricted environments.
 */
import { execSync } from 'node:child_process';

const skip =
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' ||
  process.env.LYRAXC_SKIP_BROWSER_DOWNLOAD === '1';

if (skip) {
  console.log('[postinstall] Skipping Chromium download (opt-out set).');
  process.exit(0);
}

try {
  console.log('[postinstall] Installing Chromium for Playwright…');
  execSync('npx playwright install chromium', { stdio: 'inherit' });
} catch (error) {
  console.warn(
    '[postinstall] Chromium install failed; run `npx playwright install chromium` manually.',
    error?.message ?? error,
  );
}
