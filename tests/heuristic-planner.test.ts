import { describe, expect, it } from 'vitest';
import { HeuristicPlanner } from '../src/infrastructure/planner/heuristic-planner.js';
import type { PlanningContext } from '../src/domain/ports.js';
import type { PageObservation } from '../src/domain/task.js';

function context(overrides: Partial<PlanningContext> = {}): PlanningContext {
  const observation: PageObservation = {
    url: 'about:blank',
    title: 'Blank',
    visibleText: '',
    interactiveElements: [],
    ...overrides.observation,
  };
  return {
    instruction: '',
    history: [],
    stepIndex: 0,
    maxSteps: 10,
    ...overrides,
    observation,
  };
}

describe('HeuristicPlanner', () => {
  const planner = new HeuristicPlanner();

  it('navigates when an explicit URL is present', async () => {
    const action = await planner.planNextAction(
      context({ instruction: 'go to https://example.com and read it' }),
    );
    expect(action).toMatchObject({ type: 'navigate', url: 'https://example.com' });
  });

  it('navigates for bare domain phrasing', async () => {
    const action = await planner.planNextAction(
      context({ instruction: 'open duckduckgo.com' }),
    );
    expect(action).toMatchObject({ type: 'navigate' });
    if (action.type === 'navigate') {
      expect(action.url).toContain('duckduckgo.com');
    }
  });

  it('types a search query into a detected search box', async () => {
    const action = await planner.planNextAction(
      context({
        instruction: 'search for playwright',
        observation: {
          url: 'https://duckduckgo.com',
          title: 'DDG',
          visibleText: '',
          interactiveElements: [
            { selector: '#search', tag: 'input', label: 'Search', type: 'search' },
          ],
        },
      }),
    );
    expect(action).toMatchObject({
      type: 'type',
      selector: '#search',
      text: 'playwright',
      submit: true,
    });
  });

  it('emits a click-by-text action for click instructions', async () => {
    const action = await planner.planNextAction(
      context({
        instruction: 'click Sign in',
        observation: {
          url: 'https://example.com',
          title: 'x',
          visibleText: '',
          interactiveElements: [],
        },
      }),
    );
    expect(action).toMatchObject({ type: 'click', byText: true });
  });

  it('extracts content for read/extract instructions', async () => {
    const action = await planner.planNextAction(
      context({
        instruction: 'extract the article text',
        observation: {
          url: 'https://example.com',
          title: 'x',
          visibleText: '',
          interactiveElements: [],
        },
      }),
    );
    expect(action.type).toBe('extract');
  });

  it('finishes when there is nothing left to do', async () => {
    const action = await planner.planNextAction(
      context({ instruction: 'do nothing meaningful' }),
    );
    expect(action.type).toBe('finish');
  });

  it('finishes when the step budget is nearly exhausted', async () => {
    const action = await planner.planNextAction(
      context({ instruction: 'go to https://example.com', stepIndex: 9, maxSteps: 10 }),
    );
    expect(action).toMatchObject({ type: 'finish', success: false });
  });
});
