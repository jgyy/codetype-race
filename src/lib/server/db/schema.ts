import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  handle: text('handle').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
});

export const snippets = sqliteTable('snippets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  language: text('language').notNull(),
  topic: text('topic').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  difficulty: integer('difficulty').notNull().default(1)
});

export const attempts = sqliteTable(
  'attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id),
    sessionId: text('session_id').notNull(),
    snippetId: integer('snippet_id')
      .notNull()
      .references(() => snippets.id),
    wpm: real('wpm').notNull(),
    accuracy: real('accuracy').notNull(),
    durationMs: integer('duration_ms').notNull(),
    aiSummary: text('ai_summary'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`)
  },
  (t) => ({
    snippetIdIdx: index('attempts_snippet_id_idx').on(t.snippetId),
    userIdIdx: index('attempts_user_id_idx').on(t.userId),
    sessionIdIdx: index('attempts_session_id_idx').on(t.sessionId)
  })
);

export const topicMastery = sqliteTable(
  'topic_mastery',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    topic: text('topic').notNull(),
    ease: real('ease').notNull().default(2.5),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    nextReviewAt: integer('next_review_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`)
  },
  (t) => ({
    userTopicIdx: uniqueIndex('topic_mastery_user_topic_idx').on(t.userId, t.topic)
  })
);

export type User = typeof users.$inferSelect;
export type Snippet = typeof snippets.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
