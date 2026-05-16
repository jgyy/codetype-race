import '../setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { db, schema } from '../../src/lib/server/db';
import { POST } from '../../src/routes/api/attempt/+server';
import { load as loadSnippetLeaderboard } from '../../src/routes/s/[slug]/leaderboard/+page.server';

// Bootstrap schema on the shared in-memory libSQL. We use a separate client
// here only to run DDL — the route handlers go through the module-level `db`.
const bootstrap = createClient({ url: 'file::memory:?cache=shared' });

beforeAll(async () => {
  await bootstrap.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  await bootstrap.execute(`CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1
  )`);
  await bootstrap.execute(`CREATE TABLE IF NOT EXISTS attempts (
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
  await bootstrap.execute(`CREATE TABLE IF NOT EXISTS topic_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic TEXT NOT NULL,
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    next_review_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
});

// Minimal RequestEvent stub — handlers only read `request`, `locals`, `params`.
// Cast through `any` so the same helper feeds both POST and load event shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockEvent<T = any>(overrides: Record<string, unknown>): T {
  return overrides as unknown as T;
}

describe('POST /api/attempt → GET /s/[slug]/leaderboard', () => {
  it('submitted guest attempt appears on the snippet leaderboard', async () => {
    const [snip] = await db
      .insert(schema.snippets)
      .values({ language: 'ts', topic: 'promises', title: 'await demo', body: 'await x();' })
      .returning();

    const res = await POST(
      mockEvent({
        request: new Request('http://test/api/attempt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            snippetId: snip.id,
            wpm: 73.5,
            accuracy: 0.97,
            durationMs: 9000
          })
        }),
        locals: { sessionId: 'guest-session-1', user: null }
      })
    );

    expect(res.status).toBe(200);
    const submitted = await res.json();
    expect(submitted).toMatchObject({ ok: true });
    expect(typeof submitted.attemptId).toBe('number');

    const board = (await loadSnippetLeaderboard(
      mockEvent({ params: { slug: String(snip.id) } })
    )) as { snippet: { id: number }; rows: Array<{ handle: string; wpm: number; accuracy: number }> };

    expect(board.snippet.id).toBe(snip.id);
    const hit = board.rows.find((r) => r.wpm === 73.5);
    expect(hit, 'submitted attempt should appear on the leaderboard').toBeDefined();
    expect(hit!.handle).toBe('(guest)');
    expect(hit!.accuracy).toBeCloseTo(0.97, 5);
  });
});
