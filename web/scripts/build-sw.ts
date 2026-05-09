import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SW_VERSION = "v1";

const sw = `
const SW_VERSION = ${JSON.stringify(SW_VERSION)};
const STATIC_CACHE = 'codetype-static-' + SW_VERSION;
const HTML_CACHE   = 'codetype-html-'   + SW_VERSION;
const API_CACHE    = 'codetype-api-'    + SW_VERSION;
const ALL_CACHES = [STATIC_CACHE, HTML_CACHE, API_CACHE];

self.addEventListener('install', (e) => {
  self.skipWaiting();
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
