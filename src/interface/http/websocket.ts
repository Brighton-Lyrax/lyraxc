import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { Container } from '../../container.js';
import type { AgentEvent } from '../../application/events.js';
import { toError } from '../../shared/errors.js';
import { safeEqual } from '../../shared/utils.js';

const runMessageSchema = z.object({
  type: z.literal('run'),
  instruction: z.string().min(1).max(2_000),
  startUrl: z.string().url().optional(),
});

/**
 * Attach a WebSocket endpoint at `/ws` that streams live agent events while a
 * task runs, enabling a real-time UI.
 *
 * Protocol (client → server): `{ "type": "run", "instruction": "...", "startUrl?": "..." }`
 * Protocol (server → client): the {@link AgentEvent} objects, plus `{ type: 'error', message }`.
 */
export function attachWebSocket(server: Server, container: Container): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const { logger, config } = container;

  wss.on('connection', (socket: WebSocket, req) => {
    // Enforce API key on the WebSocket handshake when configured.
    if (config.server.apiKey) {
      const url = new URL(req.url ?? '', 'http://localhost');
      const token = url.searchParams.get('apiKey') ?? '';
      if (!safeEqual(token, config.server.apiKey)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
        socket.close();
        return;
      }
    }

    logger.debug('WebSocket client connected');
    // Guard against a single client launching many concurrent browser runs.
    let busy = false;
    const send = (payload: AgentEvent | { type: 'error'; message: string }) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    socket.on('message', async (data) => {
      const parsed = runMessageSchema.safeParse(safeJson(data.toString()));
      if (!parsed.success) {
        send({ type: 'error', message: 'Invalid message. Expected a run command.' });
        return;
      }
      if (busy) {
        send({
          type: 'error',
          message: 'A task is already running on this connection. Wait for it to finish.',
        });
        return;
      }
      busy = true;
      try {
        await container.orchestrator.run(parsed.data, send);
      } catch (error) {
        send({ type: 'error', message: toError(error).message });
      } finally {
        busy = false;
      }
    });

    socket.on('error', (err) => logger.warn({ err: err.message }, 'WebSocket error'));
  });

  return wss;
}

/** Parse JSON without throwing. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
