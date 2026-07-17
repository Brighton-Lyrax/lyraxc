import type { ActionResult, AgentAction } from '../domain/actions.js';
import type { Task, TaskStatus } from '../domain/task.js';

/**
 * Events emitted by the agent as a task progresses. The HTTP layer forwards
 * these over WebSocket for a live UI; the CLI prints them to stdout.
 */
export type AgentEvent =
  | { type: 'task:started'; task: Task }
  | { type: 'step:planned'; taskId: string; stepIndex: number; action: AgentAction }
  | { type: 'step:executed'; taskId: string; stepIndex: number; result: ActionResult }
  | { type: 'task:status'; taskId: string; status: TaskStatus }
  | { type: 'task:finished'; task: Task };

/** Callback invoked for every {@link AgentEvent}. */
export type AgentEventListener = (event: AgentEvent) => void;
