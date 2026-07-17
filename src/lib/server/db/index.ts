import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// $env/dynamic/private, not process.env: see session.ts for why — plain
// `vite dev` never copies .env into process.env.
const url = env.DATABASE_URL ?? 'file:./data/codetype.db';
const authToken = env.DATABASE_AUTH_TOKEN;

// Warn at module load (not throw — the build step also imports this file).
// In production with no DATABASE_URL we'd silently fall back to a local file
// that won't persist on Vercel, so surface it loudly.
if (process.env.NODE_ENV === 'production' && !env.DATABASE_URL) {
  throw new Error(
    '[db] DATABASE_URL must be set in production; a local file path would not persist on serverless hosts.'
  );
}

const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });
export { schema };
