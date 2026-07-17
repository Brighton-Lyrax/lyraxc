import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import type { AppConfig } from '../../config/index.js';
import type { AgentAction, ActionResult } from '../../domain/actions.js';
import type {
  BrowserProvider,
  BrowserSession,
  SafetyPolicy,
} from '../../domain/ports.js';
import type {
  InteractiveElement,
  PageObservation,
} from '../../domain/task.js';
import type { Logger } from '../logging/logger.js';
import { BrowserError, toError } from '../../shared/errors.js';
import { Humanizer } from './humanizer.js';

/** Maximum characters of visible page text passed to the planner. */
const MAX_VISIBLE_TEXT = 4_000;
/** Maximum number of interactive elements returned per observation. */
const MAX_INTERACTIVE_ELEMENTS = 60;

/**
 * A Playwright-backed browser session performing humanized actions.
 * Implements the {@link BrowserSession} port.
 */
export class PlaywrightSession implements BrowserSession {
  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly humanizer: Humanizer,
    private readonly safety: SafetyPolicy,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  async perform(action: AgentAction): Promise<ActionResult> {
    const start = Date.now();
    this.logger.debug({ action }, 'Performing action');
    try {
      await this.humanizer.thinkTime();
      const observation = await this.dispatch(action);
      return {
        action,
        success: true,
        durationMs: Date.now() - start,
        ...observation,
      };
    } catch (error) {
      const err = toError(error);
      this.logger.warn({ action, err: err.message }, 'Action failed');
      return {
        action,
        success: false,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  }

  /** Route an action to its concrete handler. */
  private async dispatch(
    action: AgentAction,
  ): Promise<Partial<ActionResult>> {
    switch (action.type) {
      case 'navigate':
        return this.navigate(action.url);
      case 'click':
        return this.click(action.selector, action.byText ?? false);
      case 'type':
        return this.type(action);
      case 'scroll':
        await this.humanizer.scroll(this.page, action.direction, action.amount);
        return {};
      case 'wait':
        return this.wait(action.ms, action.selector);
      case 'extract':
        return { observation: await this.extractText(action.selector) };
      case 'screenshot':
        return {
          screenshotBase64: await this.screenshot(action.fullPage ?? false),
        };
      case 'finish':
        return { observation: action.summary };
      default: {
        // Exhaustiveness guard.
        const _never: never = action;
        throw new BrowserError(`Unsupported action: ${JSON.stringify(_never)}`);
      }
    }
  }

  private async navigate(url: string): Promise<Partial<ActionResult>> {
    this.safety.assertNavigationAllowed(url);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.browser.timeoutMs,
    });
    return { observation: `Navigated to ${await this.page.url()}` };
  }

  private async click(
    selector: string,
    byText: boolean,
  ): Promise<Partial<ActionResult>> {
    const locator = this.resolveLocator(selector, byText).first();
    await locator.waitFor({ state: 'visible', timeout: this.config.browser.timeoutMs });
    await this.hoverHumanized(locator);
    await locator.click({ timeout: this.config.browser.timeoutMs });
    return { observation: `Clicked ${selector}` };
  }

  private async type(action: Extract<AgentAction, { type: 'type' }>): Promise<Partial<ActionResult>> {
    const locator = this.resolveLocator(action.selector, action.byText ?? false).first();
    await locator.waitFor({ state: 'visible', timeout: this.config.browser.timeoutMs });
    await this.hoverHumanized(locator);
    await locator.click();
    if (action.clear) {
      await locator.fill('');
    }
    await this.humanizer.typeText(this.page, action.text);
    if (action.submit) {
      await this.page.keyboard.press('Enter');
    }
    return { observation: `Typed into ${action.selector}` };
  }

  private async wait(
    ms?: number,
    selector?: string,
  ): Promise<Partial<ActionResult>> {
    if (selector) {
      await this.page
        .locator(selector)
        .first()
        .waitFor({ state: 'visible', timeout: this.config.browser.timeoutMs });
      return { observation: `Waited for ${selector}` };
    }
    await this.page.waitForTimeout(ms ?? 1_000);
    return { observation: `Waited ${ms ?? 1_000}ms` };
  }

  private async screenshot(fullPage: boolean): Promise<string> {
    const buffer = await this.page.screenshot({ fullPage });
    return buffer.toString('base64');
  }

  /** Move the mouse to an element before interacting, when humanization is on. */
  private async hoverHumanized(locator: Locator): Promise<void> {
    if (!this.humanizer.enabled) return;
    try {
      const box = await locator.boundingBox();
      if (box) {
        await this.humanizer.moveMouseTo(
          this.page,
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      }
    } catch {
      // Non-fatal: fall back to Playwright's built-in pointer handling.
    }
  }

  /** Resolve a selector either by CSS or by visible text. */
  private resolveLocator(selector: string, byText: boolean): Locator {
    return byText
      ? this.page.getByText(selector, { exact: false })
      : this.page.locator(selector);
  }

  private async extractText(selector?: string): Promise<string> {
    const target = selector ? this.page.locator(selector).first() : this.page.locator('body');
    const text = (await target.innerText().catch(() => '')) || '';
    return text.slice(0, MAX_VISIBLE_TEXT);
  }

  async observe(): Promise<PageObservation> {
    const [url, title] = await Promise.all([this.page.url(), this.page.title()]);
    const visibleText = await this.extractText();
    const interactiveElements = await this.collectInteractiveElements();
    return { url, title, visibleText, interactiveElements };
  }

  /**
   * Collect a compact list of interactive elements with stable selectors.
   * Runs in the page context for performance.
   */
  private async collectInteractiveElements(): Promise<InteractiveElement[]> {
    const raw = await this.page.evaluate((limit) => {
      // esbuild/tsx may inject `__name` calls (keepNames) into functions that
      // run in the browser context, where it is undefined. Provide a no-op
      // shim so page-side helpers work under both dev (tsx) and build (tsup).
      const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
      if (typeof g.__name !== 'function') {
        g.__name = (fn: unknown) => fn;
      }

      const isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
        );
      };

      const selectorFor = (el: Element): string => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
        // Fallback: nth-of-type path (best-effort, still deterministic).
        const parent = el.parentElement;
        if (!parent) return el.tagName.toLowerCase();
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName,
        );
        const index = siblings.indexOf(el) + 1;
        return `${el.tagName.toLowerCase()}:nth-of-type(${index})`;
      };

      const nodes = Array.from(
        document.querySelectorAll(
          'a, button, input, textarea, select, [role="button"], [role="link"]',
        ),
      );

      const results: Array<{
        selector: string;
        tag: string;
        label: string;
        role?: string;
        type?: string;
      }> = [];

      for (const el of nodes) {
        if (results.length >= limit) break;
        if (!isVisible(el)) continue;
        const label =
          (el as HTMLElement).innerText?.trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('value') ||
          el.getAttribute('name') ||
          '';
        results.push({
          selector: selectorFor(el),
          tag: el.tagName.toLowerCase(),
          label: label.slice(0, 120),
          role: el.getAttribute('role') ?? undefined,
          type: el.getAttribute('type') ?? undefined,
        });
      }
      return results;
    }, MAX_INTERACTIVE_ELEMENTS);

    return raw;
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => undefined);
  }
}

/**
 * Provider that launches Chromium and mints isolated sessions.
 * Implements the {@link BrowserProvider} port.
 */
export class PlaywrightBrowserProvider implements BrowserProvider {
  private browser: Browser | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly safety: SafetyPolicy,
    private readonly logger: Logger,
  ) {}

  async createSession(): Promise<BrowserSession> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: this.config.browser.viewport,
      userAgent: this.config.browser.userAgent,
    });
    context.setDefaultTimeout(this.config.browser.timeoutMs);
    const page = await context.newPage();
    const humanizer = new Humanizer(this.config.humanize);
    return new PlaywrightSession(
      context,
      page,
      humanizer,
      this.safety,
      this.config,
      this.logger,
    );
  }

  /** Lazily launch (and reuse) a single Chromium instance. */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) return this.browser;
    try {
      this.logger.info(
        { headless: this.config.browser.headless },
        'Launching Chromium',
      );
      this.browser = await chromium.launch({
        headless: this.config.browser.headless,
        slowMo: this.config.browser.slowMo,
      });
      return this.browser;
    } catch (error) {
      throw new BrowserError(
        'Failed to launch Chromium. Did you run `npx playwright install chromium`?',
        { cause: toError(error).message },
      );
    }
  }

  async shutdown(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
