import { describe, expect, it } from 'vitest';
import { AgentActionSchema } from '../src/domain/actions.js';

describe('AgentActionSchema', () => {
  it('accepts a valid navigate action', () => {
    const result = AgentActionSchema.safeParse({
      type: 'navigate',
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a navigate action with a non-URL', () => {
    const result = AgentActionSchema.safeParse({ type: 'navigate', url: 'nope' });
    expect(result.success).toBe(false);
  });

  it('applies defaults for scroll', () => {
    const result = AgentActionSchema.parse({ type: 'scroll' });
    expect(result).toMatchObject({ type: 'scroll', direction: 'down', amount: 3 });
  });

  it('applies defaults for finish success', () => {
    const result = AgentActionSchema.parse({ type: 'finish', summary: 'done' });
    expect(result).toMatchObject({ type: 'finish', success: true });
  });

  it('rejects an unknown action type', () => {
    const result = AgentActionSchema.safeParse({ type: 'teleport' });
    expect(result.success).toBe(false);
  });

  it('validates a type action with all fields', () => {
    const result = AgentActionSchema.safeParse({
      type: 'type',
      selector: '#q',
      text: 'hello',
      clear: true,
      submit: true,
    });
    expect(result.success).toBe(true);
  });
});
