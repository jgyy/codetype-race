import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { accuracyToQuality, nextReview } from '$lib/server/sm2';
import { makeLimiter, rateKey } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Cap attempts at 20/min per user-or-IP. Submitting a real attempt requires
// typing through a whole snippet, so legitimate throughput is far below this.
const attemptLimiter = makeLimiter(60_000, 20);

interface AttemptPayload {
  snippetId: number;
  wpm: number;
  accuracy: number; // 0..1
  durationMs: number;
}

function validate(raw: unknown): AttemptPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const snippetId = Number(r.snippetId);
  const wpm = Number(r.wpm);
  const accuracy = Number(r.accuracy);
  const durationMs = Number(r.durationMs);
  if (!Number.isInteger(snippetId) || snippetId <= 0) return null;
  if (!Number.isFinite(wpm) || wpm < 0 || wpm > 400) return null;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) return null;
  if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > 60 * 60 * 1000) return null;
  return { snippetId, wpm, accuracy, durationMs };
}

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  let ip = '';
  try { ip = getClientAddress(); } catch { /* not available in some adapters */ }
  if (!attemptLimiter.hit(rateKey(locals.user?.id, ip))) error(429, 'slow down');

  const body = await request.json().catch(() => null);
  if (body === null) error(400, 'attempt: body is not valid JSON');
  const payload = validate(body);
  if (!payload) error(400, 'attempt: payload failed validation (snippetId/wpm/accuracy/durationMs)');

  const snippet = await db
    .select()
    .from(schema.snippets)
    .where(eq(schema.snippets.id, payload.snippetId))
    .limit(1);
  if (!snippet[0]) error(404, `attempt: snippet ${payload.snippetId} not found`);

  const userId = locals.user?.id ?? null;
  const topic = snippet[0].topic;

  // Wrap insert + SM-2 read-modify-write in a transaction so concurrent
  // submissions for the same (userId, topic) can't lose updates.
  const attemptId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.attempts)
      .values({
        userId,
        sessionId: locals.sessionId,
        snippetId: payload.snippetId,
        wpm: payload.wpm,
        accuracy: payload.accuracy,
        durationMs: payload.durationMs
      })
      .returning({ id: schema.attempts.id });

    if (locals.user) {
      const existing = await tx
        .select()
        .from(schema.topicMastery)
        .where(
          and(
            eq(schema.topicMastery.userId, locals.user.id),
            eq(schema.topicMastery.topic, topic)
          )
        )
        .limit(1);
      const prev = existing[0] ?? { ease: 2.5, intervalDays: 0, repetitions: 0 };
      const next = nextReview(prev, accuracyToQuality(payload.accuracy));
      await tx
        .insert(schema.topicMastery)
        .values({
          userId: locals.user.id,
          topic,
          ease: next.ease,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          nextReviewAt: next.nextReviewAt
        })
        .onConflictDoUpdate({
          target: [schema.topicMastery.userId, schema.topicMastery.topic],
          set: {
            ease: next.ease,
            intervalDays: next.intervalDays,
            repetitions: next.repetitions,
            nextReviewAt: next.nextReviewAt
          }
        });
    }
    return inserted[0].id;
  });

  return json({ ok: true, attemptId });
};
