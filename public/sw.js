/* Like Player service worker — caches app shell only (not video). */
const SHELL_CACHE = "like-player-shell-v3";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/apple-icon.svg"];

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(async (cache) => {
        // Cache entries independently so one transient failure does not prevent
        // the service worker from installing.
        await Promise.allSettled(
          SHELL_URLS.map(async (url) => {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) await cache.put(url, response.clone());
          }),
        );

        // Next does not expose a build manifest to this hand-written worker.
        // Discover the feed shell's hashed JS/CSS/font assets from its HTML.
        const shell = await cache.match("/");
        if (!shell) return;
        const html = await shell.text();
        const assetUrls = [
          ...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g),
        ].map((match) => new URL(match[1], self.location.origin).pathname);
        await Promise.allSettled(
          [...new Set(assetUrls)].map(async (url) => {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response.clone());
          }),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("like-player-shell-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache media or API — offline video lives in IndexedDB as blobs.
  if (url.pathname.startsWith("/api/media") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Static hashed assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations: network-first, fall back to the cached seamless feed shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, 3000)
        .then(async (res) => {
          const cache = await caches.open(SHELL_CACHE);
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ||
            (url.pathname === "/" || url.pathname === "/offline"
              ? await cache.match("/")
              : undefined) ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }),
    );
  }
});
