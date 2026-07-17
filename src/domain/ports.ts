import type { ActionResult, AgentAction } from './actions.js';
import type { PageObservation, Task } from './task.js';

/**
 * Port: a controllable browser session.
 *
 * The application layer depends only on this interface; the concrete
 * implementation (Playwright) lives in the infrastructure layer. This keeps the
 * core testable and swappable (e.g. a different automation engine).
 */
export interface BrowserSession {
  /** Execute a single humanized action and return the outcome. */
  perform(action: AgentAction): Promise<ActionResult>;
  /** Capture a compact observation of the current page for the planner. */
  observe(): Promise<PageObservation>;
  /** Current page URL. */
  currentUrl(): Promise<string>;
  /** Close the session and release resources. */
  close(): Promise<void>;
}

/**
 * Port: factory that opens fresh, isolated browser sessions.
 */
export interface BrowserProvider {
  createSession(): Promise<BrowserSession>;
  /** Release any shared/global browser resources. */
  shutdown(): Promise<void>;
}

/**
 * Port: the "brain" that decides the next action given the goal and current
 * page observation. Implemented by an LLM adapter or a rule-based planner.
 */
export interface Planner {
  /**
   * Decide the next action to take.
   * @param context Goal, history and the latest page observation.
   */
  planNextAction(context: PlanningContext): Promise<AgentAction>;
}

export interface PlanningContext {
  /** The user's natural-language goal. */
  instruction: string;
  /** Latest page observation. */
  observation: PageObservation;
  /** Actions already executed, most recent last. */
  history: ActionResult[];
  /** Zero-based index of the step about to be planned. */
  stepIndex: number;
  /** Hard cap on total steps. */
  maxSteps: number;
}

/**
 * Port: enforces safety policy (allow/block lists) before navigation.
 */
export interface SafetyPolicy {
  /** Throws {@link import('../shared/errors.js').SafetyError} if disallowed. */
  assertNavigationAllowed(url: string): void;
}

/**
 * Port: persistence for tasks. The default implementation is in-memory, but the
 * interface allows plugging in a database without touching the core.
 */
export interface TaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  list(): Promise<Task[]>;
}
