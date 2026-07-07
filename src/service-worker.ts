/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';

// ponytail: dumb precache-and-serve shell. No Workbox, no runtime-strategy config —
// the app reads from localStorage, so the SW only needs to make the app *boot*
// offline. Excluded from coverage in vite.config.ts (nothing branchy to unit-test
// without a full SW runtime; the logic that matters lives in tested pure modules).

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `painfree-${version}`;
// Everything needed to boot: built app chunks, static files, any prerendered
// pages, plus the app shell at '/' used as the offline navigation fallback.
const ASSETS = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...ASSETS, '/'])));
});

sw.addEventListener('activate', (event) => {
  // Drop caches from previous versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(handle(event.request));
});

async function handle(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);

  // Immutable precached asset: serve straight from cache.
  if (ASSETS.includes(url.pathname)) {
    const hit = await cache.match(url.pathname);
    if (hit) return hit;
  }

  // Otherwise go to the network; when it fails, fall back to the cached shell
  // for navigations so the SPA still loads offline.
  try {
    return await fetch(request);
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    throw err;
  }
}
