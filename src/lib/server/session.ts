import { createHmac, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = 'ctr_session';

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars');
  }
  return Buffer.from(s, 'utf8');
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest());
}

/** Format: `<userId>.<expiryEpochMs>.<sig>` */
export function issueSession(userId: number, now = Date.now()): string {
  const expiry = now + SESSION_TTL_MS;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export type VerifyResult =
  | { ok: true; userId: number; expiresAt: number }
  | { ok: false; reason: 'malformed' | 'badsig' | 'expired' };

export function verifySession(token: string | undefined, now = Date.now()): VerifyResult {
  if (!token) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [uidStr, expStr, sig] = parts;
  const userId = Number(uidStr);
  const expiry = Number(expStr);
  if (!Number.isInteger(userId) || !Number.isFinite(expiry)) {
    return { ok: false, reason: 'malformed' };
  }
  const expected = sign(`${uidStr}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'badsig' };
  }
  if (now > expiry) return { ok: false, reason: 'expired' };
  return { ok: true, userId, expiresAt: expiry };
}

// PIN hashing: scrypt + per-user salt; compare in constant time.
export function hashPin(pin: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const derived = scryptSync(pin, salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
