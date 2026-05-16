import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./data/codetype.db';
const isTurso = url.startsWith('libsql://') || url.startsWith('https://') || url.startsWith('wss://');

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  ...(isTurso ? { driver: 'turso' as const } : {}),
  dbCredentials: isTurso
    ? { url, authToken: process.env.DATABASE_AUTH_TOKEN }
    : { url }
} satisfies Config;
