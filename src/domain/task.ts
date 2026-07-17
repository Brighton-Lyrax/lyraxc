import type { ActionResult, AgentAction } from './actions.js';

/** Lifecycle states of an agent task. */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * A single unit of automation work: a natural-language instruction plus the
 * evolving execution state (steps, status, result).
 */
export interface Task {
  id: string;
  /** Natural-language instruction from the user. */
  instruction: string;
  /** Optional starting URL. */
  startUrl?: string;
  status: TaskStatus;
  steps: TaskStep[];
  /** Final summary once the task finishes. */
  summary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** One planned-and-executed step within a task. */
export interface TaskStep {
  index: number;
  action: AgentAction;
  result?: ActionResult;
}

/**
 * Snapshot of the browser page state passed to the planner so it can decide the
 * next action. Kept compact to fit within LLM context windows.
 */
export interface PageObservation {
  url: string;
  title: string;
  /** Trimmed, visible text of the page. */
  visibleText: string;
  /** Interactive elements (links, buttons, inputs) with stable selectors. */
  interactiveElements: InteractiveElement[];
}

export interface InteractiveElement {
  /** A CSS selector that uniquely targets the element. */
  selector: string;
  tag: string;
  /** Visible label/text or accessible name. */
  label: string;
  role?: string;
  type?: string;
}

/** Factory for a fresh task with sensible defaults. */
export function createTask(params: {
  id: string;
  instruction: string;
  startUrl?: string;
}): Task {
  const now = new Date().toISOString();
  return {
    id: params.id,
    instruction: params.instruction,
    startUrl: params.startUrl,
    status: 'pending',
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}
