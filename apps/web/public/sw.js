/**
 * Derby Streams service worker — makes the app installable and usable offline
 * (ROADMAP.md item 8.3).
 *
 * Strategy (small static site, no server):
 *   - Shell (navigation requests) is network-first so updates land, with a
 *     cache fallback to the last-good index.html for offline navigation.
 *   - Same-origin GETs (hashed JS/CSS bundles, data/*.json, icons) are
 *     cache-first with stale-while-revalidate: serve instantly from cache,
 *     fetch a fresh copy in the background and update the cache for next time.
 *     That is exactly the roadmap's "cache-first, data refreshed on each page
 *     load when online".
 *   - A versioned cache name + activate cleanup keeps old caches from piling up.
 *
 * Robots: the site stays noindex (meta + robots.txt) — a service worker and
 * manifest have no effect on indexing, so PWA installability does not conflict.
 */

const CACHE_NAME = "derby-streams-v1";

// Install: warm the cache with the shell so a brand-new install can already
// navigate offline. Best-effort — an offline first-ever install has nothing to
// fetch, so failures here are fine.
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"]))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

async function networkFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		return (await cache.match(request)) ?? Response.error();
	}
}

async function staleWhileRevalidate(request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);
	const network = fetch(request)
		.then((response) => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached);
	return cached ?? (await network);
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// Navigations: always prefer the network, fall back to cached shell offline.
	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request));
		return;
	}

	// Everything else same-origin (bundles, data/*.json, icons): cache-first,
	// refreshed in the background.
	event.respondWith(staleWhileRevalidate(request));
});