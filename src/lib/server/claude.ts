import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  client = new Anthropic({ apiKey });
  return client;
}

function getModel(): string {
  return env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
}

export async function complete(system: string, user: string, maxTokens = 256): Promise<string> {
  const resp = await getClient().messages.create({
    model: getModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  const part = resp.content[0];
  if (!part || part.type !== 'text' || !part.text) {
    throw new Error('empty completion from model');
  }
  return part.text;
}
