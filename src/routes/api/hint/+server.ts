import { eq } from 'drizzle-orm';
import { json, error } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import {
  buildSystemPrompt,
  checkHintRequest,
  sanitizeHint
} from '$lib/server/hint-guardrails';
import { complete } from '$lib/server/claude';
import { makeLimiter, rateKey } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const hintLimiter = makeLimiter(60_000, 6);

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  let ip = '';
  try { ip = getClientAddress(); } catch { /* not available in some adapters */ }
  if (!hintLimiter.hit(rateKey(locals.user?.id, ip))) error(429, 'slow down');

  const body = await request.json().catch(() => null);
  const check = checkHintRequest(body);
  if (!check.ok) error(400, `hint: ${check.reason}`);

  const snippet = await db
    .select()
    .from(schema.snippets)
    .where(eq(schema.snippets.id, check.sanitized.snippetId))
    .limit(1);
  if (!snippet[0]) error(404, `hint: snippet ${check.sanitized.snippetId} not found`);

  // Re-validate values read from the DB before splicing into the prompt — a
  // corrupted row (newlines, quotes) is a prompt-injection vector even though
  // the user-supplied fields are already validated.
  const language = snippet[0].language;
  if (!/^[a-z0-9+\-#.]{1,20}$/i.test(language)) {
    error(500, 'hint: snippet has invalid language code');
  }
  const topic = snippet[0].topic;
  if (!/^[a-z0-9-]{1,40}$/.test(topic)) {
    error(500, 'hint: snippet has invalid topic');
  }
  // The user-supplied topic must match the snippet's actual topic. Without this,
  // a client can request a hint about an unrelated topic at our token expense.
  if (check.sanitized.topic.toLowerCase() !== topic.toLowerCase()) {
    error(400, 'hint: topic does not match snippet');
  }

  const system = buildSystemPrompt(topic);
  const userMsg = [
    `Topic: ${topic}`,
    `Language: ${language}`,
    `User question: ${check.sanitized.question}`
  ].join('\n');

  let raw = '';
  try {
    raw = await complete(system, userMsg, 200);
  } catch (e) {
    console.error('hint: claude call failed', e);
    error(502, 'hint: upstream model unavailable');
  }

  return json({ hint: sanitizeHint(raw) });
};
