import type { AppConfig } from '../config/index.js';
import type { ActionResult } from '../domain/actions.js';
import type {
  BrowserProvider,
  Planner,
  TaskRepository,
} from '../domain/ports.js';
import { createTask, type Task } from '../domain/task.js';
import type { Logger } from '../infrastructure/logging/logger.js';
import { AppError, toError, ValidationError } from '../shared/errors.js';
import { Semaphore } from '../shared/semaphore.js';
import { shortId } from '../shared/utils.js';
import type { AgentEvent, AgentEventListener } from './events.js';

export interface RunTaskInput {
  instruction: string;
  startUrl?: string;
}

/**
 * Core application use case: the perceive → plan → act loop.
 *
 * The agent repeatedly:
 *   1. observes the current page,
 *   2. asks the {@link Planner} for the next action,
 *   3. executes it via the {@link BrowserProvider},
 * until the planner returns `finish`, the step budget is exhausted, or an
 * unrecoverable error occurs.
 *
 * It depends only on domain ports, keeping it fully unit-testable with fakes.
 */
export class AgentOrchestrator {
  /** Caps concurrent browser tasks across the process. */
  private readonly gate: Semaphore;

  constructor(
    private readonly browserProvider: BrowserProvider,
    private readonly planner: Planner,
    private readonly repository: TaskRepository,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.gate = new Semaphore(config.server.maxConcurrentTasks);
  }

  /**
   * Run a task to completion.
   *
   * A process-wide concurrency limit ({@link AppConfig.server.maxConcurrentTasks})
   * is enforced first: if the limit is reached this throws a 429 `AppError`
   * before any browser session is created.
   *
   * @param input       Instruction and optional start URL.
   * @param onEvent     Optional listener for streaming progress events.
   */
  async run(input: RunTaskInput, onEvent?: AgentEventListener): Promise<Task> {
    this.validate(input);

    // Reserve a concurrency slot before allocating any expensive resources.
    const release = this.gate.tryAcquire();
    try {
      return await this.execute(input, onEvent);
    } finally {
      release();
    }
  }

  /** Internal task execution (concurrency slot already held). */
  private async execute(
    input: RunTaskInput,
    onEvent?: AgentEventListener,
  ): Promise<Task> {
    const task = createTask({
      id: shortId('task_'),
      instruction: input.instruction.trim(),
      startUrl: input.startUrl?.trim(),
    });
    await this.repository.save(task);
    this.emit(onEvent, { type: 'task:started', task });

    const session = await this.browserProvider.createSession();
    const history: ActionResult[] = [];

    try {
      task.status = 'running';
      await this.persist(task, onEvent);

      // Optional explicit starting navigation.
      if (task.startUrl) {
        const result = await session.perform({
          type: 'navigate',
          url: task.startUrl,
        });
        history.push(result);
        this.recordStep(task, result, onEvent);
        if (!result.success) {
          throw new AppError(`Failed to open start URL: ${result.error}`, {
            code: 'START_URL_FAILED',
          });
        }
      }

      // Main perceive → plan → act loop.
      for (let step = task.steps.length; step < this.config.llm.maxSteps; step += 1) {
        const observation = await session.observe();
        const action = await this.planner.planNextAction({
          instruction: task.instruction,
          observation,
          history,
          stepIndex: step,
          maxSteps: this.config.llm.maxSteps,
        });
        this.emit(onEvent, {
          type: 'step:planned',
          taskId: task.id,
          stepIndex: step,
          action,
        });

        if (action.type === 'finish') {
          task.summary = action.summary;
          task.status = action.success ? 'completed' : 'failed';
          break;
        }

        const result = await session.perform(action);
        history.push(result);
        this.recordStep(task, result, onEvent);
      }

      // If the loop ended without an explicit finish, mark completed.
      if (task.status === 'running') {
        task.status = 'completed';
        task.summary ??= 'Reached the maximum number of steps.';
      }

      await this.persist(task, onEvent);
      this.emit(onEvent, { type: 'task:finished', task });
      this.logger.info({ taskId: task.id, status: task.status }, 'Task finished');
      return task;
    } catch (error) {
      const err = toError(error);
      task.status = 'failed';
      task.error = err.message;
      await this.persist(task, onEvent);
      this.emit(onEvent, { type: 'task:finished', task });
      this.logger.error({ taskId: task.id, err: err.message }, 'Task failed');
      return task;
    } finally {
      await session.close();
    }
  }

  private validate(input: RunTaskInput): void {
    if (!input.instruction || input.instruction.trim().length === 0) {
      throw new ValidationError('`instruction` is required and cannot be empty.');
    }
    if (input.instruction.length > 2_000) {
      throw new ValidationError('`instruction` must be 2000 characters or fewer.');
    }
    if (input.startUrl) {
      try {
        new URL(input.startUrl);
      } catch {
        throw new ValidationError('`startUrl` must be a valid absolute URL.');
      }
    }
  }

  /** Append an executed step to the task and emit an event. */
  private recordStep(
    task: Task,
    result: ActionResult,
    onEvent?: AgentEventListener,
  ): void {
    const index = task.steps.length;
    task.steps.push({ index, action: result.action, result });
    task.updatedAt = new Date().toISOString();
    this.emit(onEvent, {
      type: 'step:executed',
      taskId: task.id,
      stepIndex: index,
      result,
    });
  }

  /** Persist the task and emit a status event. */
  private async persist(task: Task, onEvent?: AgentEventListener): Promise<void> {
    task.updatedAt = new Date().toISOString();
    await this.repository.save(task);
    this.emit(onEvent, {
      type: 'task:status',
      taskId: task.id,
      status: task.status,
    });
  }

  private emit(listener: AgentEventListener | undefined, event: AgentEvent): void {
    try {
      listener?.(event);
    } catch (error) {
      // A faulty listener must never break the agent loop.
      this.logger.warn({ err: toError(error).message }, 'Event listener threw');
    }
  }
}
