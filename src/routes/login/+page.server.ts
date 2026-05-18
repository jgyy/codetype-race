import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { hashPin, issueSession, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPin } from '$lib/server/session';
import type { Actions } from './$types';

const HANDLE_RE = /^[a-z0-9_-]{2,24}$/i;
const PIN_RE = /^\d{4,8}$/;

// Per-handle brute-force lockout. Soft defence — wipes on cold start on
// serverless adapters; still meaningfully raises the bar against scripted
// PIN guessing on a single instance.
const MAX_FAILS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; lockUntil: number }>();

function isLockedOut(handle: string, now = Date.now()): boolean {
  const rec = failures.get(handle);
  if (!rec) return false;
  if (now >= rec.lockUntil) {
    failures.delete(handle);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

function noteFailure(handle: string, now = Date.now()): void {
  const rec = failures.get(handle);
  if (!rec || now >= rec.lockUntil) {
    failures.set(handle, { count: 1, lockUntil: now + LOCKOUT_MS });
    return;
  }
  rec.count += 1;
  rec.lockUntil = now + LOCKOUT_MS;
}

function clearFailures(handle: string): void {
  failures.delete(handle);
}

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '').trim().toLowerCase();
    const pin = String(form.get('pin') ?? '');
    if (!HANDLE_RE.test(handle) || !PIN_RE.test(pin)) {
      return fail(400, { error: 'invalid handle or PIN' });
    }
    if (isLockedOut(handle)) {
      return fail(429, { error: 'too many attempts, try again later' });
    }
    const rows = await db.select().from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
    const user = rows[0];
    let pinOk = false;
    if (user) {
      try {
        pinOk = verifyPin(pin, user.pinHash);
      } catch (e) {
        console.error('login: corrupt pin hash for user', user.id, e);
        return fail(500, { error: 'account state is corrupted, please contact support' });
      }
    }
    if (!user || !pinOk) {
      noteFailure(handle);
      return fail(401, { error: 'wrong handle or PIN' });
    }
    clearFailures(handle);
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
    const handle = String(form.get('handle') ?? '').trim().toLowerCase();
    const pin = String(form.get('pin') ?? '');
    if (!HANDLE_RE.test(handle) || !PIN_RE.test(pin)) {
      return fail(400, { error: 'invalid handle or PIN' });
    }
    const existing = await db.select().from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
    if (existing[0]) return fail(409, { error: 'handle taken' });
    let inserted;
    try {
      inserted = await db
        .insert(schema.users)
        .values({ handle, pinHash: hashPin(pin) })
        .returning();
    } catch (e: unknown) {
      // Concurrent insert lost the race on the UNIQUE(handle) constraint.
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE|constraint/i.test(msg)) return fail(409, { error: 'handle taken' });
      throw e;
    }
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
