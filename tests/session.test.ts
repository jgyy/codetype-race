import './setup';
import { describe, expect, it } from 'vitest';
import {
  hashPin,
  issueSession,
  SESSION_TTL_SECONDS,
  verifyPin,
  verifySession
} from '../src/lib/server/session';

describe('HMAC session cookie', () => {
  it('round-trips a valid cookie', () => {
    const tok = issueSession(42);
    const r = verifySession(tok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe(42);
  });

  it('rejects a tampered signature', () => {
    const tok = issueSession(1);
    const parts = tok.split('.');
    parts[2] = parts[2].slice(0, -2) + 'XX';
    const r = verifySession(parts.join('.'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('badsig');
  });

  it('rejects a tampered userId (signature no longer matches)', () => {
    const tok = issueSession(1);
    const parts = tok.split('.');
    parts[0] = '9999';
    const r = verifySession(parts.join('.'));
    expect(r.ok).toBe(false);
  });

  it('rejects expired cookies', () => {
    const past = Date.now() - SESSION_TTL_SECONDS * 1000 - 60_000;
    const tok = issueSession(1, past);
    const r = verifySession(tok);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('').ok).toBe(false);
    expect(verifySession('foo.bar').ok).toBe(false);
    expect(verifySession('not.a.cookie').ok).toBe(false);
  });
});

describe('PIN hashing (constant-time)', () => {
  it('verifies correct PIN', () => {
    const stored = hashPin('123456');
    expect(verifyPin('123456', stored)).toBe(true);
  });

  it('rejects wrong PIN', () => {
    const stored = hashPin('123456');
    expect(verifyPin('123457', stored)).toBe(false);
    expect(verifyPin('', stored)).toBe(false);
  });

  it('produces different hashes for the same PIN (salt is random)', () => {
    const a = hashPin('hello');
    const b = hashPin('hello');
    expect(a).not.toBe(b);
    expect(verifyPin('hello', a)).toBe(true);
    expect(verifyPin('hello', b)).toBe(true);
  });

  it('rejects malformed stored hash without throwing', () => {
    expect(verifyPin('x', 'not-a-real-hash')).toBe(false);
  });
});
