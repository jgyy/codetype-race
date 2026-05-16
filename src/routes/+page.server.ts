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
  return { snippets };
};
