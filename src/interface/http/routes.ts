import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

/** Request body schema for creating/running a task. */
const runTaskSchema = z.object({
  instruction: z.string().min(1).max(2_000),
  startUrl: z.string().url().optional(),
});

/**
 * Build the REST API router.
 *
 * Handlers are thin: they validate input, delegate to the application layer,
 * and let the shared error middleware format failures.
 */
export function createApiRouter(container: Container): Router {
  const router = Router();

  /** Liveness/readiness probe. */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provider: container.config.llm.provider });
  });

  /** Run a task synchronously and return the final result. */
  router.post('/tasks', async (req: Request, res: Response) => {
    const parsed = runTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body.', parsed.error.issues);
    }
    const task = await container.orchestrator.run(parsed.data);
    res.status(201).json({ task });
  });

  /** List previously run tasks. */
  router.get('/tasks', async (_req: Request, res: Response) => {
    const tasks = await container.repository.list();
    res.json({ tasks });
  });

  /** Fetch a single task by id. */
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    const task = await container.repository.findById(req.params.id as string);
    if (!task) throw new NotFoundError(`Task not found: ${req.params.id}`);
    res.json({ task });
  });

  return router;
}
