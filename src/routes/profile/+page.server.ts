import { and, desc, eq, lte } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');

  const history = await db
    .select({
      id: schema.attempts.id,
      wpm: schema.attempts.wpm,
      accuracy: schema.attempts.accuracy,
      createdAt: schema.attempts.createdAt,
      title: schema.snippets.title,
      topic: schema.snippets.topic
    })
    .from(schema.attempts)
    .innerJoin(schema.snippets, eq(schema.snippets.id, schema.attempts.snippetId))
    .where(eq(schema.attempts.userId, locals.user.id))
    .orderBy(desc(schema.attempts.createdAt))
    .limit(20);

  const due = await db
    .select()
    .from(schema.topicMastery)
    .where(
      and(
        eq(schema.topicMastery.userId, locals.user.id),
        lte(schema.topicMastery.nextReviewAt, new Date())
      )
    );

  return { history, due };
};
