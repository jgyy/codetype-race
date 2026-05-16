import { error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

function parseSnippetId(slug: string): number | null {
  const match = slug.match(/^(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export const load: PageServerLoad = async ({ params }) => {
  const snippetId = parseSnippetId(params.slug);
  if (snippetId === null) throw error(404, 'Snippet not found');

  const [snippet] = await db
    .select()
    .from(schema.snippets)
    .where(eq(schema.snippets.id, snippetId))
    .limit(1);
  if (!snippet) throw error(404, 'Snippet not found');

  // All attempts on this snippet, anonymous attempts grouped under "(guest)".
  const rows = await db
    .select({
      handle: sql<string>`coalesce(${schema.users.handle}, '(guest)')`.as('handle'),
      isGuest: sql<number>`case when ${schema.attempts.userId} is null then 1 else 0 end`.as(
        'is_guest'
      ),
      wpm: schema.attempts.wpm,
      accuracy: schema.attempts.accuracy,
      durationMs: schema.attempts.durationMs,
      createdAt: schema.attempts.createdAt
    })
    .from(schema.attempts)
    .leftJoin(schema.users, sql`${schema.users.id} = ${schema.attempts.userId}`)
    .where(eq(schema.attempts.snippetId, snippetId))
    .orderBy(sql`${schema.attempts.wpm} desc`)
    .limit(100);

  return { snippet, rows };
};
