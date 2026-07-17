import { z } from 'zod';

/**
 * The catalogue of atomic, human-like actions the agent can perform in a
 * browser. Each action is intentionally small so that both an LLM planner and
 * a rule-based planner can compose them, and so the humanizer can add realistic
 * timing/motion around every single one.
 *
 * The schemas below are the single source of truth: they validate planner
 * output, document the contract, and produce the TypeScript types.
 */

export const NavigateAction = z.object({
  type: z.literal('navigate'),
  /** Absolute URL to open. */
  url: z.string().url(),
  reason: z.string().optional(),
});

export const ClickAction = z.object({
  type: z.literal('click'),
  /** CSS selector or human-readable text of the element to click. */
  selector: z.string().min(1),
  /** Whether `selector` is element text rather than a CSS selector. */
  byText: z.boolean().optional(),
  reason: z.string().optional(),
});

export const TypeAction = z.object({
  type: z.literal('type'),
  /** CSS selector or label of the input field. */
  selector: z.string().min(1),
  /** Text to type character-by-character (humanized). */
  text: z.string(),
  byText: z.boolean().optional(),
  /** Clear the field before typing. */
  clear: z.boolean().optional(),
  /** Press Enter after typing. */
  submit: z.boolean().optional(),
  reason: z.string().optional(),
});

export const ScrollAction = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']).default('down'),
  /** Number of viewport-relative "wheel" steps. */
  amount: z.number().int().min(1).max(20).default(3),
  reason: z.string().optional(),
});

export const WaitAction = z.object({
  type: z.literal('wait'),
  /** Milliseconds to wait, or a selector to wait for. */
  ms: z.number().int().min(0).max(60_000).optional(),
  selector: z.string().optional(),
  reason: z.string().optional(),
});

export const ExtractAction = z.object({
  type: z.literal('extract'),
  /** Optional selector to scope extraction; defaults to the whole page. */
  selector: z.string().optional(),
  /** What information to capture, for logging/plan context. */
  description: z.string().optional(),
  reason: z.string().optional(),
});

export const ScreenshotAction = z.object({
  type: z.literal('screenshot'),
  fullPage: z.boolean().optional(),
  reason: z.string().optional(),
});

export const FinishAction = z.object({
  type: z.literal('finish'),
  /** Natural-language summary of the outcome. */
  summary: z.string(),
  success: z.boolean().default(true),
});

/** Discriminated union of every supported action. */
export const AgentActionSchema = z.discriminatedUnion('type', [
  NavigateAction,
  ClickAction,
  TypeAction,
  ScrollAction,
  WaitAction,
  ExtractAction,
  ScreenshotAction,
  FinishAction,
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentActionType = AgentAction['type'];

/** Result of executing a single action against the browser. */
export interface ActionResult {
  action: AgentAction;
  success: boolean;
  /** Optional extracted text / observation returned to the planner. */
  observation?: string;
  /** Base64 screenshot data (without data-uri prefix), when captured. */
  screenshotBase64?: string;
  error?: string;
  durationMs: number;
}
