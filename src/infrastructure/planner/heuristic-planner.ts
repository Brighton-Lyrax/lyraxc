import type { AgentAction } from '../../domain/actions.js';
import type { Planner, PlanningContext } from '../../domain/ports.js';
import { hostnameOf } from '../../shared/utils.js';

/**
 * A deterministic, offline planner used as the default provider and in tests.
 *
 * It understands a few common intents by parsing the instruction with simple
 * heuristics, so the agent works end-to-end without any external LLM:
 *
 * - "go to <url>" / "open <url>"     -> navigate
 * - "search for <query>"            -> type into a search box + submit
 * - "click <text>"                  -> click by text
 * - "type <text> in <field>"        -> type into a field
 * - "extract" / "read" / "get text" -> extract
 * - "screenshot"                    -> screenshot
 *
 * It tracks progress via the action history to avoid loops and eventually
 * returns a `finish` action.
 */
export class HeuristicPlanner implements Planner {
  async planNextAction(context: PlanningContext): Promise<AgentAction> {
    return this.decide(context);
  }

  private decide(context: PlanningContext): AgentAction {
    const { instruction, observation, history, stepIndex, maxSteps } = context;
    const text = instruction.toLowerCase();
    const done = new Set(history.map((h) => h.action.type + JSON.stringify(h.action)));

    // Safety valve: finish before exceeding the step budget.
    if (stepIndex >= maxSteps - 1) {
      return { type: 'finish', summary: 'Reached maximum step budget.', success: false };
    }

    // 1. Navigate first if a URL is present and we have not visited it yet.
    const url = this.extractUrl(instruction);
    if (url) {
      const targetHost = hostnameOf(url);
      const currentHost = hostnameOf(observation.url);
      if (targetHost && targetHost !== currentHost) {
        return { type: 'navigate', url };
      }
    }

    // 2. Search intent.
    const query = this.extractSearchQuery(text, instruction);
    if (query) {
      const searchBox = this.findSearchBox(observation);
      const alreadySearched = history.some(
        (h) => h.action.type === 'type' && h.success,
      );
      if (searchBox && !alreadySearched) {
        return {
          type: 'type',
          selector: searchBox,
          text: query,
          clear: true,
          submit: true,
        };
      }
    }

    // 3. Explicit click intent.
    const clickTarget = this.extractClickTarget(text);
    if (clickTarget) {
      const key = 'click' + JSON.stringify({ type: 'click', selector: clickTarget, byText: true });
      if (!done.has(key)) {
        return { type: 'click', selector: clickTarget, byText: true };
      }
    }

    // 4. Extraction / reading intent.
    if (/\b(extract|read|get text|scrape|summar)/.test(text)) {
      const alreadyExtracted = history.some((h) => h.action.type === 'extract');
      if (!alreadyExtracted) {
        return { type: 'extract', description: 'page content' };
      }
    }

    // 5. Screenshot intent.
    if (/\bscreenshot|capture\b/.test(text)) {
      const shot = history.some((h) => h.action.type === 'screenshot');
      if (!shot) return { type: 'screenshot', fullPage: false };
    }

    // 6. Nothing else to do: finish with a summary.
    return {
      type: 'finish',
      summary: this.buildSummary(observation, history),
      success: true,
    };
  }

  private extractUrl(instruction: string): string | undefined {
    const explicit = instruction.match(/https?:\/\/[^\s"'<>]+/i);
    if (explicit) return explicit[0];
    // "go to example.com" style.
    const bare = instruction.match(/\b(?:go to|open|visit|navigate to)\s+([a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?)/i);
    if (bare?.[1]) return `https://${bare[1]}`;
    return undefined;
  }

  private extractSearchQuery(lowered: string, original: string): string | undefined {
    const match = original.match(/search (?:for )?["']?(.+?)["']?(?:\s+on\s+.+)?$/i);
    if (lowered.includes('search') && match?.[1]) {
      return match[1].trim();
    }
    return undefined;
  }

  private extractClickTarget(lowered: string): string | undefined {
    const match = lowered.match(/click(?:\s+on)?\s+["']?(.+?)["']?$/i);
    return match?.[1]?.trim();
  }

  private findSearchBox(observation: PlanningContext['observation']): string | undefined {
    const candidate = observation.interactiveElements.find((el) => {
      const hay = `${el.label} ${el.selector} ${el.type ?? ''}`.toLowerCase();
      return (
        el.tag === 'input' &&
        (el.type === 'search' ||
          el.type === 'text' ||
          hay.includes('search') ||
          hay.includes('query') ||
          hay.includes('q'))
      );
    });
    return candidate?.selector ?? 'input[type="search"], input[name="q"], input[type="text"]';
  }

  private buildSummary(
    observation: PlanningContext['observation'],
    history: PlanningContext['history'],
  ): string {
    const extracted = [...history]
      .reverse()
      .find((h) => h.action.type === 'extract' && h.observation);
    if (extracted?.observation) {
      return `Finished. Extracted content: ${extracted.observation.slice(0, 400)}`;
    }
    return `Finished on page "${observation.title}" (${observation.url}).`;
  }
}
