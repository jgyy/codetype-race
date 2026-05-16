import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { accuracyToQuality, nextReview } from '$lib/server/sm2';
import type { RequestHandler } from './$types';

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

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const payload = validate(body);
  if (!payload) error(400, 'invalid attempt');

  const snippet = await db
    .select()
    .from(schema.snippets)
    .where(eq(schema.snippets.id, payload.snippetId))
    .limit(1);
  if (!snippet[0]) error(404, 'snippet not found');

  const inserted = await db
    .insert(schema.attempts)
    .values({
      userId: locals.user?.id ?? null,
      sessionId: locals.sessionId,
      snippetId: payload.snippetId,
      wpm: payload.wpm,
      accuracy: payload.accuracy,
      durationMs: payload.durationMs
    })
    .returning();

  // Spaced repetition update — only for signed-in users.
  if (locals.user) {
    const existing = await db
      .select()
      .from(schema.topicMastery)
      .where(
        and(
          eq(schema.topicMastery.userId, locals.user.id),
          eq(schema.topicMastery.topic, snippet[0].topic)
        )
      )
      .limit(1);
    const prev = existing[0] ?? { ease: 2.5, intervalDays: 0, repetitions: 0 };
    const next = nextReview(prev, accuracyToQuality(payload.accuracy));
    if (existing[0]) {
      await db
        .update(schema.topicMastery)
        .set({
          ease: next.ease,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          nextReviewAt: next.nextReviewAt
        })
        .where(eq(schema.topicMastery.id, existing[0].id));
    } else {
      await db.insert(schema.topicMastery).values({
        userId: locals.user.id,
        topic: snippet[0].topic,
        ease: next.ease,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        nextReviewAt: next.nextReviewAt
      });
    }
  }

  return json({ ok: true, attemptId: inserted[0].id });
};
