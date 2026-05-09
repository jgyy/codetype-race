import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SW_VERSION = "v2"; // Phase 16.13 — bump cache-key version on shell change.

// Phase 16.13 — App-shell precache list. Three routes that constitute
// "the shell users land on": home, host, practice. Their root chunks +
// the /layout chunks (every route shares them). Hashes change on any
// shell rebuild, so the precache cache-key effectively bumps with the
// content. Other routes (room, daily, leaderboard, etc.) cache lazily
// via cacheFirst on first visit — same as before this slice.
const SHELL_ROUTES = ["/", "/host/", "/practice/"];
const SHELL_PAGE_KEYS = ["/layout", "/page", "/host/page", "/practice/page"];

function readShellChunks(): string[] {
    const manifestPath = join(import.meta.dir, "..", ".next", "app-build-manifest.json");
    if (!existsSync(manifestPath)) {
        console.warn("build-sw: app-build-manifest.json not found, skipping precache list");
        return [];
    }
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        pages: Record<string, string[]>;
    };
    const seen = new Set<string>();
    for (const k of SHELL_PAGE_KEYS) {
        for (const c of m.pages[k] ?? []) {
            // Drop CSS — small, lazily fetched on first paint anyway.
            if (c.endsWith(".js")) seen.add("/_next/" + c);
        }
    }
    return [...seen];
}

const PRECACHE_URLS = [...SHELL_ROUTES, ...readShellChunks()];

const sw = `
const SW_VERSION = ${JSON.stringify(SW_VERSION)};
const STATIC_CACHE = 'codetype-static-' + SW_VERSION;
const HTML_CACHE   = 'codetype-html-'   + SW_VERSION;
const API_CACHE    = 'codetype-api-'    + SW_VERSION;
const ALL_CACHES = [STATIC_CACHE, HTML_CACHE, API_CACHE];

const PRECACHE_URLS = ${JSON.stringify(PRECACHE_URLS)};

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // Phase 16.13 — slim precache: 3 shell HTML routes + their root JS
    // chunks only. ~80-150 kB total. Other routes cache lazily on visit.
    // addAll is atomic — if any URL fails we keep the previous SW alive.
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
    } catch (err) {
      // Don't block activation on precache failure (e.g. CDN burp during
      // SW install). Lazy fetches still work on first navigation.
      console.warn('[sw] precache failed', err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => !ALL_CACHES.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isHtml(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504, statusText: 'offline' });
}

async function networkFirst(req, cacheName, opts) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith('/api/snippets/') || url.pathname === '/api/profile/me') {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }
  if (isHtml(req)) {
    event.respondWith(staleWhileRevalidate(req, HTML_CACHE));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'KILL') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
      await self.registration.unregister();
    })());
  }
});
`;

function main() {
    const outDir = join(import.meta.dir, "..", "out");
    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }
    const target = join(outDir, "sw.js");
    writeFileSync(target, sw);
    console.log(`wrote ${target} (${sw.length} bytes, ${SW_VERSION})`);
}

main();
