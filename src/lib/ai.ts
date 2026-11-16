import Anthropic from '@anthropic-ai/sdk';

/**
 * Provider-abstracted AI helper (PRD 13.1, AI layer). Returns null when no key is configured or the call fails,
 * so every AI feature has a non-AI fallback. Callers must not send names or other personal data in the prompt.
 */
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function aiText(system: string, user: string, maxTokens = 2000): Promise<string | null> {
  if (!aiEnabled()) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
      max_tokens: Math.max(maxTokens, 2000),
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    return text || null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`AI call failed (${error.status}): ${error.message}`);
    else console.error('AI call failed', error);
    return null;
  }
}

/** Ask for JSON and parse it defensively. */
export async function aiJson<T>(system: string, user: string, maxTokens = 4000): Promise<T | null> {
  const text = await aiText(system + ' Reply with JSON only, no prose and no code fences.', user, maxTokens);
  if (!text) return null;
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T; } catch { return null; }
}
