import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/codetype.db',
    authToken: process.env.DATABASE_AUTH_TOKEN
  }
} satisfies Config;
