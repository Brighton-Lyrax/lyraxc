import { describe, expect, it } from 'vitest';
import { AgentOrchestrator } from '../src/application/agent-orchestrator.js';
import type { AgentEvent } from '../src/application/events.js';
import { InMemoryTaskRepository } from '../src/infrastructure/persistence/in-memory-task-repository.js';
import { ValidationError } from '../src/shared/errors.js';
import { testConfig, silentLogger } from './helpers/config.js';
import {
  FakeBrowserProvider,
  FakeBrowserSession,
  ScriptedPlanner,
} from './helpers/fakes.js';

function build(
  actions: Parameters<typeof ScriptedPlanner.prototype.planNextAction> extends never
    ? never
    : ConstructorParameters<typeof ScriptedPlanner>[0],
  failures: Partial<Record<string, string>> = {},
) {
  const session = new FakeBrowserSession(undefined, failures as never);
  const provider = new FakeBrowserProvider(() => session);
  const planner = new ScriptedPlanner(actions);
  const repository = new InMemoryTaskRepository();
  const orchestrator = new AgentOrchestrator(
    provider,
    planner,
    repository,
    testConfig(),
    silentLogger(),
  );
  return { orchestrator, provider, planner, repository, session };
}

describe('AgentOrchestrator', () => {
  it('runs a scripted plan and completes', async () => {
    const { orchestrator, repository } = build([
      { type: 'navigate', url: 'https://example.com' },
      { type: 'extract', description: 'text' },
      { type: 'finish', summary: 'all done', success: true },
    ]);

    const task = await orchestrator.run({ instruction: 'do the thing' });

    expect(task.status).toBe('completed');
    expect(task.summary).toBe('all done');
    expect(task.steps.map((s) => s.action.type)).toEqual(['navigate', 'extract']);
    const stored = await repository.findById(task.id);
    expect(stored?.status).toBe('completed');
  });

  it('emits lifecycle events in order', async () => {
    const { orchestrator } = build([
      { type: 'extract' },
      { type: 'finish', summary: 'ok', success: true },
    ]);

    const events: AgentEvent[] = [];
    await orchestrator.run({ instruction: 'read page' }, (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('task:started');
    expect(types).toContain('step:planned');
    expect(types).toContain('step:executed');
    expect(types.at(-1)).toBe('task:finished');
  });

  it('honours an explicit start URL as the first action', async () => {
    const { orchestrator, session } = build([
      { type: 'finish', summary: 'done', success: true },
    ]);

    await orchestrator.run({
      instruction: 'read',
      startUrl: 'https://start.example.com',
    });

    expect(session.performed[0]).toMatchObject({
      type: 'navigate',
      url: 'https://start.example.com',
    });
  });

  it('fails the task when a start URL cannot be opened', async () => {
    const { orchestrator } = build(
      [{ type: 'finish', summary: 'x', success: true }],
      { navigate: 'boom' },
    );

    const task = await orchestrator.run({
      instruction: 'read',
      startUrl: 'https://broken.example.com',
    });

    expect(task.status).toBe('failed');
    expect(task.error).toContain('Failed to open start URL');
  });

  it('marks the task failed (not completed) on an unsuccessful finish', async () => {
    const { orchestrator } = build([
      { type: 'finish', summary: 'could not', success: false },
    ]);
    const task = await orchestrator.run({ instruction: 'try' });
    expect(task.status).toBe('failed');
  });

  it('rejects empty instructions', async () => {
    const { orchestrator } = build([]);
    await expect(orchestrator.run({ instruction: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects invalid start URLs', async () => {
    const { orchestrator } = build([]);
    await expect(
      orchestrator.run({ instruction: 'go', startUrl: 'not-a-url' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('closes the browser session after running', async () => {
    const { orchestrator, session } = build([
      { type: 'finish', summary: 'done', success: true },
    ]);
    await orchestrator.run({ instruction: 'x' });
    expect(session.closed).toBe(true);
  });

  it('stops at the configured max-steps budget', async () => {
    // Planner that never finishes on its own.
    const neverFinish = Array.from({ length: 50 }, () => ({
      type: 'scroll' as const,
      direction: 'down' as const,
      amount: 1,
    }));
    const { orchestrator } = build(neverFinish);
    const task = await orchestrator.run({ instruction: 'scroll forever' });
    // maxSteps is 10 in testConfig.
    expect(task.steps.length).toBeLessThanOrEqual(10);
    expect(task.status).toBe('completed');
  });
});
