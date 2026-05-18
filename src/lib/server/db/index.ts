import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'file:./data/codetype.db';
const authToken = process.env.DATABASE_AUTH_TOKEN;

// Warn at module load (not throw — the build step also imports this file).
// In production with no DATABASE_URL we'd silently fall back to a local file
// that won't persist on Vercel, so surface it loudly.
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error(
    '[db] DATABASE_URL must be set in production; a local file path would not persist on serverless hosts.'
  );
}

const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });
export { schema };
