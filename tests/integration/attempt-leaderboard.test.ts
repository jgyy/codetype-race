import '../setup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema';
import { accuracyToQuality, nextReview } from '../../src/lib/server/sm2';

/**
 * Integration test: simulates the /api/attempt → leaderboard pipeline against
 * a fresh in-memory libSQL. We exercise the SQL — not the HTTP wrapper — to
 * keep the test independent of the SvelteKit dev server.
 */

const client = createClient({ url: 'file::memory:?cache=shared' });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await client.execute(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  await client.execute(`CREATE TABLE snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1
  )`);
  await client.execute(`CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    session_id TEXT NOT NULL,
    snippet_id INTEGER NOT NULL REFERENCES snippets(id),
    wpm REAL NOT NULL,
    accuracy REAL NOT NULL,
    duration_ms INTEGER NOT NULL,
    ai_summary TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  await client.execute(`CREATE TABLE topic_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic TEXT NOT NULL,
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    next_review_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
});

afterAll(() => client.close());

describe('submit → leaderboard', () => {
  it('records two users\' attempts and ranks by best WPM', async () => {
    const [u1] = await db.insert(schema.users).values({ handle: 'alice', pinHash: 'x:y' }).returning();
    const [u2] = await db.insert(schema.users).values({ handle: 'bob', pinHash: 'x:y' }).returning();
    const [snip] = await db
      .insert(schema.snippets)
      .values({ language: 'js', topic: 'closures', title: 'demo', body: 'const x = () => 1;' })
      .returning();

    await db.insert(schema.attempts).values([
      { userId: u1.id, sessionId: 's1', snippetId: snip.id, wpm: 60, accuracy: 0.95, durationMs: 8000 },
      { userId: u1.id, sessionId: 's1', snippetId: snip.id, wpm: 80, accuracy: 0.98, durationMs: 6000 },
      { userId: u2.id, sessionId: 's2', snippetId: snip.id, wpm: 70, accuracy: 0.92, durationMs: 7000 }
    ]);

    const rows = await db
      .select({
        handle: schema.users.handle,
        bestWpm: sql<number>`max(${schema.attempts.wpm})`.as('best_wpm')
      })
      .from(schema.attempts)
      .innerJoin(schema.users, sql`${schema.users.id} = ${schema.attempts.userId}`)
      .groupBy(schema.users.id)
      .orderBy(sql`best_wpm desc`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ handle: 'alice', bestWpm: 80 });
    expect(rows[1]).toMatchObject({ handle: 'bob', bestWpm: 70 });

    // SM-2 step should produce a sane 1-day first interval for a 0.95 accuracy attempt.
    const state = nextReview({ ease: 2.5, intervalDays: 0, repetitions: 0 }, accuracyToQuality(0.95));
    expect(state.intervalDays).toBe(1);
  });
});
