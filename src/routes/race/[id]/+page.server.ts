import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) error(400, 'invalid id');
  const rows = await db.select().from(schema.snippets).where(eq(schema.snippets.id, id)).limit(1);
  if (!rows[0]) error(404, 'snippet not found');
  return { snippet: rows[0] };
};
