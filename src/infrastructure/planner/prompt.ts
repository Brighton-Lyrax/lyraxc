import type { PlanningContext } from '../../domain/ports.js';
import type { InteractiveElement } from '../../domain/task.js';

/** Render interactive elements as a compact, numbered list for prompts. */
function renderElements(elements: InteractiveElement[]): string {
  if (elements.length === 0) return '(none detected)';
  return elements
    .map((el, i) => {
      const parts = [`[${i}] <${el.tag}>`];
      if (el.type) parts.push(`type=${el.type}`);
      if (el.role) parts.push(`role=${el.role}`);
      parts.push(`selector="${el.selector}"`);
      if (el.label) parts.push(`label="${el.label}"`);
      return parts.join(' ');
    })
    .join('\n');
}

/** System prompt describing the agent, the action schema and the contract. */
export const SYSTEM_PROMPT = `You are Lyraxc, an autonomous web agent that controls a real browser using human-like actions.
Given a goal and the current page state, respond with EXACTLY ONE next action as a single JSON object (no prose, no markdown fences).

Supported actions:
- {"type":"navigate","url":"https://..."}
- {"type":"click","selector":"CSS or text","byText":false}
- {"type":"type","selector":"CSS","text":"...","clear":true,"submit":true}
- {"type":"scroll","direction":"down","amount":3}
- {"type":"wait","ms":1000} or {"type":"wait","selector":"CSS"}
- {"type":"extract","selector":"optional CSS","description":"what to read"}
- {"type":"screenshot","fullPage":false}
- {"type":"finish","summary":"result of the task","success":true}

Rules:
- Prefer selectors from the provided interactive elements list.
- Use one concrete action at a time; observe the result before the next.
- When the goal is achieved (or clearly impossible), return a "finish" action.
- Never invent selectors that are not on the page unless navigating.
- Output must be valid minified JSON with no extra text.`;

/** Build the user prompt containing goal, history and current observation. */
export function buildUserPrompt(context: PlanningContext): string {
  const { instruction, observation, history, stepIndex, maxSteps } = context;

  const historyText =
    history.length === 0
      ? '(no actions yet)'
      : history
          .slice(-8)
          .map((r, i) => {
            const status = r.success ? 'ok' : `failed: ${r.error ?? 'unknown'}`;
            const obs = r.observation ? ` -> ${r.observation.slice(0, 200)}` : '';
            return `${i + 1}. ${JSON.stringify(r.action)} [${status}]${obs}`;
          })
          .join('\n');

  return `GOAL: ${instruction}

STEP: ${stepIndex + 1} of max ${maxSteps}

CURRENT PAGE:
- url: ${observation.url}
- title: ${observation.title}

VISIBLE TEXT (truncated):
${observation.visibleText.slice(0, 1500)}

INTERACTIVE ELEMENTS:
${renderElements(observation.interactiveElements)}

RECENT ACTIONS:
${historyText}

Respond with the single next action as minified JSON.`;
}
