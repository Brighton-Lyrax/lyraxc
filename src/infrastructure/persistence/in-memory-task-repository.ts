import type { TaskRepository } from '../../domain/ports.js';
import type { Task } from '../../domain/task.js';

/**
 * Simple in-memory {@link TaskRepository}.
 *
 * Sufficient for a single-process deployment and tests. Swap for a database-
 * backed implementation (same interface) for horizontal scaling/persistence.
 */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    // Store a shallow clone to avoid external mutation of internal state.
    this.tasks.set(task.id, { ...task, steps: [...task.steps] });
  }

  async findById(id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    return task ? { ...task, steps: [...task.steps] } : null;
  }

  async list(): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .map((t) => ({ ...t, steps: [...t.steps] }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
