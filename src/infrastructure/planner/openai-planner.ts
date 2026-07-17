import type { AppConfig } from '../../config/index.js';
import { AgentActionSchema, type AgentAction } from '../../domain/actions.js';
import type { Planner, PlanningContext } from '../../domain/ports.js';
import type { Logger } from '../logging/logger.js';
import { PlannerError, toError } from '../../shared/errors.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Planner backed by any OpenAI-compatible Chat Completions endpoint.
 *
 * The adapter is deliberately thin (uses global `fetch`, no SDK) so it works
 * with OpenAI, Azure OpenAI, Ollama, LM Studio, OpenRouter, etc. by only
 * changing `LLM_BASE_URL`/`LLM_MODEL`.
 */
export class OpenAiPlanner implements Planner {
  constructor(
    private readonly config: AppConfig['llm'],
    private readonly logger: Logger,
  ) {
    if (!config.apiKey) {
      this.logger.warn(
        'LLM_PROVIDER=openai but LLM_API_KEY is empty; requests will likely fail.',
      );
    }
    this.validateBaseUrl(config.baseUrl);
  }

  /**
   * Validate the operator-configured LLM base URL at startup.
   *
   * Rejects non-HTTP(S) schemes (SSRF hardening) and warns when the URL targets
   * a loopback/private host. Local hosts are allowed (e.g. Ollama/LM Studio) but
   * flagged so an accidental internal target is visible in the logs.
   */
  private validateBaseUrl(baseUrl: string): void {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new PlannerError(`LLM_BASE_URL is not a valid URL: ${baseUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new PlannerError(
        `LLM_BASE_URL must use http(s); got "${url.protocol}".`,
      );
    }
    const host = url.hostname.toLowerCase();
    const isPrivate =
      host === 'localhost' ||
      host === '0.0.0.0' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (isPrivate) {
      this.logger.warn(
        { host },
        'LLM_BASE_URL points at a private/loopback host; ensure this is intended.',
      );
    }
  }

  async planNextAction(context: PlanningContext): Promise<AgentAction> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(context) },
    ];

    const content = await this.chat(messages);
    return this.parseAction(content);
  }

  /** Call the chat completions endpoint and return raw assistant content. */
  private async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new PlannerError(
          `LLM request failed with status ${response.status}`,
          { status: response.status, body: body.slice(0, 500) },
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new PlannerError('LLM returned an empty response.');
      }
      return content;
    } catch (error) {
      if (error instanceof PlannerError) throw error;
      throw new PlannerError('Failed to reach the LLM provider.', {
        cause: toError(error).message,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Extract and validate a single action from the model output. */
  private parseAction(content: string): AgentAction {
    const json = this.extractJson(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new PlannerError('LLM response was not valid JSON.', { content });
    }

    const result = AgentActionSchema.safeParse(parsed);
    if (!result.success) {
      throw new PlannerError('LLM produced an invalid action.', {
        issues: result.error.issues,
        content,
      });
    }
    return result.data;
  }

  /** Strip markdown fences / surrounding prose to isolate the JSON object. */
  private extractJson(content: string): string {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const first = content.indexOf('{');
    const last = content.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return content.slice(first, last + 1);
    }
    return content.trim();
  }
}
