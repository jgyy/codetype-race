import { eq } from 'drizzle-orm';
import { json, error } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import {
  buildSystemPrompt,
  checkHintRequest,
  sanitizeHint
} from '$lib/server/hint-guardrails';
import { complete } from '$lib/server/claude';
import type { RequestHandler } from './$types';

// crude in-memory rate limit per session (per cold-start instance)
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = HITS.get(key);
  if (!bucket || now > bucket.resetAt) {
    HITS.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  // Prefer authenticated user id so anonymous callers can't bypass by clearing cookies.
  // Fall back to client IP for fully anonymous requests, then sessionId as last resort.
  let ip = '';
  try { ip = getClientAddress(); } catch { /* not available in some adapters */ }
  const rateKey = locals.user?.id != null ? `u:${locals.user.id}` : `a:${ip || locals.sessionId}`;
  if (!rateLimit(rateKey)) error(429, 'slow down');

  const body = await request.json().catch(() => null);
  const check = checkHintRequest(body);
  if (!check.ok) error(400, check.reason);

  const snippet = await db
    .select()
    .from(schema.snippets)
    .where(eq(schema.snippets.id, check.sanitized.snippetId))
    .limit(1);
  if (!snippet[0]) error(404, 'snippet not found');

  const system = buildSystemPrompt(check.sanitized.topic);
  const userMsg = [
    `Topic: ${check.sanitized.topic}`,
    `Language: ${snippet[0].language}`,
    `User question: ${check.sanitized.question}`
  ].join('\n');

  let raw = '';
  try {
    raw = await complete(system, userMsg, 200);
  } catch (e) {
    console.error('claude error', e);
    error(502, 'hint service unavailable');
  }

  return json({ hint: sanitizeHint(raw) });
};
