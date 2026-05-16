/**
 * Seed snippets + a demo user. Run with `npm run db:seed` after `npm run db:push`.
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/server/db/schema';
import { hashPin } from '../src/lib/server/session';

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./data/codetype.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});
const db = drizzle(client, { schema });

const snippets = [
  {
    language: 'js',
    topic: 'closures',
    title: 'Counter factory',
    body: `function makeCounter() {\n  let n = 0;\n  return () => ++n;\n}`,
    difficulty: 1
  },
  {
    language: 'js',
    topic: 'promises',
    title: 'Sequential awaits',
    body: `async function run() {\n  const a = await fetchA();\n  const b = await fetchB(a);\n  return b;\n}`,
    difficulty: 2
  },
  {
    language: 'py',
    topic: 'list-comprehensions',
    title: 'Even squares',
    body: `squares = [n * n for n in range(20) if n % 2 == 0]`,
    difficulty: 1
  },
  {
    language: 'ts',
    topic: 'generics',
    title: 'Identity function',
    body: `function id<T>(value: T): T {\n  return value;\n}`,
    difficulty: 1
  },
  {
    language: 'rs',
    topic: 'ownership',
    title: 'Borrow vs move',
    body: `fn len(s: &String) -> usize {\n    s.len()\n}`,
    difficulty: 3
  }
];

async function main() {
  await db.insert(schema.snippets).values(snippets);
  await db.insert(schema.users).values({ handle: 'demo', pinHash: hashPin('123456') });
  console.log(`seeded ${snippets.length} snippets + demo user (pin 123456)`);
}

main().then(() => client.close());
