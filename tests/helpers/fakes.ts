import type { ActionResult, AgentAction } from '../../src/domain/actions.js';
import type {
  BrowserProvider,
  BrowserSession,
  Planner,
  PlanningContext,
} from '../../src/domain/ports.js';
import type { PageObservation } from '../../src/domain/task.js';

/**
 * Test doubles (fakes) implementing the domain ports. These let us unit-test
 * the application layer without a real browser or network.
 */

export class FakeBrowserSession implements BrowserSession {
  public readonly performed: AgentAction[] = [];
  public closed = false;
  private currentPageUrl = 'about:blank';

  constructor(
    private readonly observation: PageObservation = {
      url: 'about:blank',
      title: 'Blank',
      visibleText: '',
      interactiveElements: [],
    },
    /** Optional map of failing action types → error message. */
    private readonly failures: Partial<Record<AgentAction['type'], string>> = {},
  ) {}

  async perform(action: AgentAction): Promise<ActionResult> {
    this.performed.push(action);
    if (action.type === 'navigate') this.currentPageUrl = action.url;
    const failure = this.failures[action.type];
    return {
      action,
      success: !failure,
      error: failure,
      observation: failure ? undefined : `did ${action.type}`,
      durationMs: 1,
    };
  }

  async observe(): Promise<PageObservation> {
    return { ...this.observation, url: this.currentPageUrl };
  }

  async currentUrl(): Promise<string> {
    return this.currentPageUrl;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class FakeBrowserProvider implements BrowserProvider {
  public readonly sessions: FakeBrowserSession[] = [];

  constructor(private readonly sessionFactory: () => FakeBrowserSession) {}

  async createSession(): Promise<BrowserSession> {
    const session = this.sessionFactory();
    this.sessions.push(session);
    return session;
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

/**
 * Planner that returns a fixed script of actions in order, then `finish`.
 */
export class ScriptedPlanner implements Planner {
  private index = 0;
  public readonly contexts: PlanningContext[] = [];

  constructor(private readonly actions: AgentAction[]) {}

  async planNextAction(context: PlanningContext): Promise<AgentAction> {
    this.contexts.push(context);
    const action = this.actions[this.index];
    this.index += 1;
    return (
      action ?? { type: 'finish', summary: 'scripted done', success: true }
    );
  }
}
