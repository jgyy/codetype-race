import { sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Best WPM per user across all snippets — convention from typing-test sites.
  const rows = await db
    .select({
      handle: schema.users.handle,
      bestWpm: sql<number>`max(${schema.attempts.wpm})`.as('best_wpm'),
      avgAccuracy: sql<number>`avg(${schema.attempts.accuracy})`.as('avg_acc'),
      runs: sql<number>`count(*)`.as('runs')
    })
    .from(schema.attempts)
    .innerJoin(schema.users, sql`${schema.users.id} = ${schema.attempts.userId}`)
    .groupBy(schema.users.id)
    .orderBy(sql`best_wpm desc`)
    .limit(50);

  return { rows };
};
