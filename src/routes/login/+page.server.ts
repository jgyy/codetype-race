import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { hashPin, issueSession, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPin } from '$lib/server/session';
import type { Actions } from './$types';

const HANDLE_RE = /^[a-z0-9_-]{2,24}$/i;
const PIN_RE = /^\d{4,8}$/;

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '').trim();
    const pin = String(form.get('pin') ?? '');
    if (!HANDLE_RE.test(handle) || !PIN_RE.test(pin)) {
      return fail(400, { error: 'invalid handle or PIN' });
    }
    const rows = await db.select().from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
    const user = rows[0];
    if (!user || !verifyPin(pin, user.pinHash)) {
      return fail(401, { error: 'wrong handle or PIN' });
    }
    cookies.set(SESSION_COOKIE, issueSession(user.id), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS
    });
    redirect(303, '/profile');
  },

  register: async ({ request, cookies }) => {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '').trim();
    const pin = String(form.get('pin') ?? '');
    if (!HANDLE_RE.test(handle) || !PIN_RE.test(pin)) {
      return fail(400, { error: 'invalid handle or PIN' });
    }
    const existing = await db.select().from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
    if (existing[0]) return fail(409, { error: 'handle taken' });
    const inserted = await db
      .insert(schema.users)
      .values({ handle, pinHash: hashPin(pin) })
      .returning();
    cookies.set(SESSION_COOKIE, issueSession(inserted[0].id), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS
    });
    redirect(303, '/profile');
  },

  logout: async ({ cookies }) => {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    redirect(303, '/');
  }
};
