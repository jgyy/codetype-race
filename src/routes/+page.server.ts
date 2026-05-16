import { sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const snippets = await db
    .select({
      id: schema.snippets.id,
      title: schema.snippets.title,
      language: schema.snippets.language,
      topic: schema.snippets.topic,
      difficulty: schema.snippets.difficulty
    })
    .from(schema.snippets)
    .limit(50);

  // Featured snippet = the one with the most attempts (proxy for "everyone's racing this").
  // Fall back to the first snippet if no attempts exist yet.
  const [featuredRow] = await db
    .select({
      id: schema.snippets.id,
      title: schema.snippets.title,
      language: schema.snippets.language,
      topic: schema.snippets.topic,
      attemptCount: sql<number>`count(${schema.attempts.id})`.as('attempt_count')
    })
    .from(schema.snippets)
    .leftJoin(schema.attempts, sql`${schema.attempts.snippetId} = ${schema.snippets.id}`)
    .groupBy(schema.snippets.id)
    .orderBy(sql`attempt_count desc, ${schema.snippets.id} asc`)
    .limit(1);

  const featuredLeaderboard = featuredRow
    ? await db
        .select({
          handle: sql<string>`coalesce(${schema.users.handle}, '(guest)')`.as('handle'),
          isGuest: sql<number>`case when ${schema.attempts.userId} is null then 1 else 0 end`.as(
            'is_guest'
          ),
          wpm: schema.attempts.wpm,
          accuracy: schema.attempts.accuracy
        })
        .from(schema.attempts)
        .leftJoin(schema.users, sql`${schema.users.id} = ${schema.attempts.userId}`)
        .where(sql`${schema.attempts.snippetId} = ${featuredRow.id}`)
        .orderBy(sql`${schema.attempts.wpm} desc`)
        .limit(10)
    : [];

  // Distinct racer count signals "this is a multi-user product".
  const [{ racers = 0 } = {}] = await db
    .select({
      racers: sql<number>`count(distinct coalesce(${schema.attempts.userId}, ${schema.attempts.sessionId}))`.as(
        'racers'
      )
    })
    .from(schema.attempts);

  return { snippets, featured: featuredRow ?? null, featuredLeaderboard, racers };
};
