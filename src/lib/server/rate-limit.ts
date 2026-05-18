/**
 * In-memory sliding-window rate limiter, per cold-start instance.
 *
 * Caveat: on serverless adapters (Vercel) each cold start gets a fresh map,
 * so this is a soft defence — useful against scripted abuse from a single
 * instance, ineffective against attackers who can trigger cold starts.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface Limiter {
  hit(key: string): boolean;
}

export function makeLimiter(windowMs: number, max: number): Limiter {
  const hits = new Map<string, Bucket>();
  return {
    hit(key: string): boolean {
      const now = Date.now();
      if (hits.size > 1000) {
        for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
      }
      const bucket = hits.get(key);
      if (!bucket || now > bucket.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= max) return false;
      bucket.count += 1;
      return true;
    }
  };
}

/** Build a rate-limit key preferring user id, falling back to IP. */
export function rateKey(userId: number | null | undefined, ip: string | undefined): string {
  if (userId != null) return `u:${userId}`;
  return `a:${ip || 'unknown'}`;
}
