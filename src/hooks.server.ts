import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { SESSION_COOKIE, verifySession } from '$lib/server/session';

const ANON_COOKIE = 'ctr_anon';

export const handle: Handle = async ({ event, resolve }) => {
  let anon = event.cookies.get(ANON_COOKIE);
  if (!anon) {
    anon = randomUUID();
    event.cookies.set(ANON_COOKIE, anon, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365
    });
  }
  event.locals.sessionId = anon;
  event.locals.user = null;

  const token = event.cookies.get(SESSION_COOKIE);
  const result = verifySession(token);
  if (result.ok) {
    const rows = await db
      .select({ id: schema.users.id, handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.id, result.userId))
      .limit(1);
    if (rows[0]) event.locals.user = rows[0];
  } else if (token) {
    // bad/expired — clear it so the client stops sending
    event.cookies.delete(SESSION_COOKIE, { path: '/' });
  }

  return resolve(event);
};
