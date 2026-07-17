import { describe, expect, it } from 'vitest';
import { InMemoryTaskRepository } from '../src/infrastructure/persistence/in-memory-task-repository.js';
import { createTask } from '../src/domain/task.js';

describe('InMemoryTaskRepository', () => {
  it('saves and retrieves a task by id', async () => {
    const repo = new InMemoryTaskRepository();
    const task = createTask({ id: 't1', instruction: 'hello' });
    await repo.save(task);
    const found = await repo.findById('t1');
    expect(found?.instruction).toBe('hello');
  });

  it('returns null for missing tasks', async () => {
    const repo = new InMemoryTaskRepository();
    expect(await repo.findById('missing')).toBeNull();
  });

  it('stores clones so external mutation does not affect state', async () => {
    const repo = new InMemoryTaskRepository();
    const task = createTask({ id: 't2', instruction: 'x' });
    await repo.save(task);
    task.instruction = 'mutated';
    const found = await repo.findById('t2');
    expect(found?.instruction).toBe('x');
  });

  it('lists tasks newest-first', async () => {
    const repo = new InMemoryTaskRepository();
    const a = createTask({ id: 'a', instruction: 'a' });
    a.createdAt = '2020-01-01T00:00:00.000Z';
    const b = createTask({ id: 'b', instruction: 'b' });
    b.createdAt = '2024-01-01T00:00:00.000Z';
    await repo.save(a);
    await repo.save(b);
    const list = await repo.list();
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
  });
});
