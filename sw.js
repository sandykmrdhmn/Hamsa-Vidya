/**
 * HAMSA VIDYA (हंस विद्या) — Service Worker
 *
 * Makes the app genuinely usable offline. Before this, the README claimed
 * "offline-capable" but the first load (and every reload) needed the network —
 * only the *data* was local, via IndexedDB.
 *
 * DESIGN NOTES — the reason a service worker was held back initially is that a
 * careless one serves stale code forever and is miserable to debug. The
 * strategies below are chosen specifically to avoid that:
 *
 *   • App code (/js/, /css/, HTML) uses NETWORK-FIRST.
 *     Edits appear on the next reload exactly like they do without a service
 *     worker. The cache is only a fallback for when the network is unavailable.
 *
 *   • Vendor bundles and icons use CACHE-FIRST.
 *     These are versioned, immutable files (dexie.min.js etc.), so serving them
 *     from cache is safe and saves 3.6 MB of transfer.
 *
 *   • /api/ is NETWORK-ONLY and never cached.
 *     Caching AI responses or live exam data would replay stale answers and
 *     could surface one request's result for another.
 *
 *   • Bumping CACHE_VERSION evicts every previous cache on activate.
 *
 * Escape hatch, if a bad worker is ever shipped:
 *   navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()))
 *   caches.keys().then(k => k.forEach(c => caches.delete(c)))
 * or call app.clearServiceWorker() from the console.
 */

// Bump this on release to invalidate every cache.
const CACHE_VERSION = 'v59';
const SHELL_CACHE = `hamsa-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hamsa-runtime-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

/**
 * Everything required to boot the UI and read local PDFs. PDF.js and its worker
 * are precached so the first upload works offline; other vendor bundles follow
 * LAZY_CACHE_PATTERNS below.
 */
const SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',

  // Design tokens and base styles
  'css/tokens.css',
  'css/main.css',

  // Component styles (numbered parts — order matters when linked, not when cached)
  'css/components/01-base-and-header.css',
  'css/components/02-dashboard.css',
  'css/components/03-study-controls.css',
  'css/components/04-motion.css',
  'css/components/05-study-notes.css',
  'css/study-notes.css',
  'assets/fonts/NotoSansDevanagari.ttf',
  'css/components/06-flashcards.css',
  'css/components/07-global-search.css',
  'css/components/08-doubt-solver.css',
  'css/components/09-reading-themes.css',
  'css/components/10-tools.css',

  'css/dashboard.css',
  'css/quiz.css',
  'css/flashcard-improvements.css',
  'css/preferences.css',
  'css/exam-alerts.css',
  'css/answer-writing.css',

  'css/ai-teacher/01-hero-and-input.css',
  'css/ai-teacher/02-controls.css',
  'css/ai-teacher/03-loading.css',
  'css/ai-teacher/04-folio.css',
  'css/ai-teacher/05-toolbar-and-chat.css',
  'css/ai-teacher/06-manuscript.css',
  'css/ai-teacher/07-print-and-responsive.css',

  'css/view-hero.css',
  'css/onboarding.css',
  'css/auth-gate.css',
  'css/header.css',
  'css/layout.css',
  'css/responsive.css',
  'css/a11y.css',
  'css/settings.css',

  // Vendor libraries needed just to boot
  'assets/vendor/dexie.min.js',
  'assets/vendor/lucide.min.js',
  'assets/vendor/marked.min.js',

  // Application modules
  'js/sanitizer.js?v=20261006-study1',
  'js/ui-utils.js?v=20261006-study1',
  'js/study-preferences.js?v=20261006-study1',
  'js/ai-client.js?v=20261009-quiz5',
  'js/audio-engine.js?v=20261006-study1',
  'assets/vendor/katex.min.js',
  'js/study-format.js?v=20261006-study1',
  'js/flashcard-tools.js?v=20261006-study1',
  'js/flashcard-store.js?v=20261006-study1',
  'js/db.js?v=20261009-quiz6',
  'js/pdf-extractor.js?v=20261006-study1',
  'js/pdf-reader.js?v=20261006-study1',
  'assets/vendor/pdf.min.js',
  'assets/vendor/pdf.worker.min.js',
  'assets/vendor/pdf.min.js?v=20261006-study1',
  'assets/vendor/pdf.worker.min.js?v=20261006-study1',
  'js/gemini-service.js?v=20261006-study1',
  'js/quiz-tools.js?v=20261009-quiz6',
  'js/quiz-service.js?v=20261009-quiz6',
  'js/pdf-generator.js?v=20261006-study1',
  'js/gurukul-wisdom.js?v=20261006-study1',
  'js/views/dashboard.js?v=20261006-study1',
  'js/views/quiz.js?v=20261010-feedback1',
  'js/views/study-notes.js?v=20261006-study1',
  'js/views/flashcards.js?v=20261006-study1',
  'js/views/library.js?v=20261006-study1',
  'js/views/tools.js?v=20261006-study1',
  'js/views/settings.js?v=20261007-quiz1',
  'js/exam-profile.js?v=20261006-study1',
  'js/eligibility-engine.js?v=20261006-study1',
  'js/exam-service.js?v=20261006-study1',
  'js/notification-summary-service.js?v=20261006-study1',
  'js/views/exam-alerts.js?v=20261006-study1',
  'js/answer-writing-service.js?v=20261006-study1',
  'js/views/answer-writing.js?v=20261006-study1',
  'js/ai-advisor.js?v=20261006-study1',
  'js/ai-teacher-service.js?v=20261006-study1',
  'js/views/ai-teacher.js?v=20261006-study1',
  'js/auth-gate.js?v=20261006-study1',
  'js/app.js?v=20261007-quiz1',

  // Branding
  'assets/icons/hamsa-logo.svg',
  'assets/icons/hamsa-logo-3d.png'
];

/**
 * Other optional vendor assets are cached when first requested. PDF.js and its
 * worker are already in SHELL_ASSETS so PDF uploads do not depend on a previous
 * online upload. The same cache-first strategy applies to both.
 */
const LAZY_CACHE_PATTERNS = [
  /\/assets\/vendor\//,
  /\/assets\/icons\//
];

/** Never cached — must always hit the network. */
const NETWORK_ONLY_PATTERNS = [
  /\/api\//
];

// =========================================================================
// INSTALL — precache the shell
// =========================================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // Add individually rather than cache.addAll(): addAll() rejects the whole
      // install if a single file 404s, which would leave the app with no worker
      // at all. A missing non-critical asset should not block installation.
      const results = await Promise.allSettled(
        SHELL_ASSETS.map(async (asset) => {
          const res = await fetch(asset, { cache: 'reload' });
          if (!isUsableAssetResponse(new URL(asset, self.location.href).href, res)) throw new Error(`${asset} -> HTTP ${res.status} or invalid content type`);
          await cache.put(asset, res);
        })
      );

      const failed = results
        .map((r, i) => (r.status === 'rejected' ? SHELL_ASSETS[i] : null))
        .filter(Boolean);

      if (failed.length) {
        console.warn('[SW] Some shell assets were not cached:', failed);
      }
      console.log(`[SW] Installed ${SHELL_ASSETS.length - failed.length}/${SHELL_ASSETS.length} shell assets (${CACHE_VERSION})`);
    })()
  );

  // Apply the new worker without waiting for every tab to close.
  self.skipWaiting();
});

// =========================================================================
// ACTIVATE — drop caches from older versions
// =========================================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const stale = names.filter(n => n.startsWith('hamsa-') && !ALL_CACHES.includes(n));
      await Promise.all(stale.map(n => caches.delete(n)));
      if (stale.length) console.log('[SW] Removed stale caches:', stale);

      // Take control of pages loaded before this worker activated.
      await self.clients.claim();
    })()
  );
});

// =========================================================================
// FETCH
// =========================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable; let everything else through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ignore cross-origin requests (Google Fonts in print windows, Gemini in
  // direct mode). The browser's own HTTP cache handles those.
  if (url.origin !== self.location.origin) return;

  if (NETWORK_ONLY_PATTERNS.some(p => p.test(url.pathname))) {
    return; // default browser behaviour, never cached
  }

  // SPA navigations: try the network so deploys land immediately, fall back to
  // the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstForNavigation(request));
    return;
  }

  if (LAZY_CACHE_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App code and styles.
  event.respondWith(networkFirst(request));
});

/**
 * Cache-first, for immutable versioned assets.
 */
async function cacheFirst(request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.has('pdf-refresh') && /\/assets\/vendor\/pdf(?:\.worker)?\.min\.js$/.test(url.pathname);
  if (refresh) url.searchParams.delete('pdf-refresh');
  const cacheKey = refresh ? url.href : request;
  const found = await caches.match(cacheKey).catch(() => null);
  const cached = isUsableAssetResponse(cacheKey, found) ? found : null;
  if (found && !cached) await evictInvalidAsset(cacheKey).catch(() => {});
  if (cached && !refresh) return cached;

  try {
    const res = await fetch(request, { cache: refresh || (found && !cached) ? 'reload' : 'default' });
    if (isUsableAssetResponse(cacheKey, res)) {
      // Cache failures (e.g. full storage) must not hide a valid network file.
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        // Strip the retry nonce so retries do not grow the cache indefinitely.
        await cache.put(cacheKey, res.clone());
      } catch {}
      return res;
    }
    return cached || res;
  } catch (err) {
    if (cached) return cached;
    // Offline and never fetched before — nothing we can do.
    return new Response('', { status: 504, statusText: 'Offline and not cached' });
  }
}

/**
 * Network-first, for anything that changes during development.
 */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (isUsableAssetResponse(request, res)) {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, res.clone());
      } catch {}
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request).catch(() => null);
    if (isUsableAssetResponse(request, cached)) return cached;
    return new Response('', { status: 504, statusText: 'Offline and not cached' });
  }
}

/** Do not install or replay a host's HTML fallback as JavaScript or CSS. */
function isUsableAssetResponse(request, response) {
  if (!response?.ok) return false;
  const pathname = new URL(typeof request === 'string' ? request : request.url, self.location.href).pathname;
  const type = response.headers.get('Content-Type') || '';
  if (/\.m?js$/i.test(pathname)) return /^(?:text|application)\/(?:x-)?(?:java|ecma)script\b/i.test(type);
  if (/\.css$/i.test(pathname)) return /^text\/css\b/i.test(type);
  return true;
}

async function evictInvalidAsset(request) {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('hamsa-')).map(async name => {
    const cache = await caches.open(name), response = await cache.match(request);
    if (response && !isUsableAssetResponse(request, response)) await cache.delete(request);
  }));
}

/**
 * Navigation handler. Falls back to the cached shell so hash routes such as
 * #flashcards still resolve while offline.
 */
async function networkFirstForNavigation(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('index.html', res.clone());
    }
    return res;
  } catch (err) {
    const cached = (await caches.match('index.html')) || (await caches.match('./'));
    if (cached) return cached;
    return new Response(
      '<h1>Offline</h1><p>Hamsa Vidya has not been cached yet. Reconnect once to enable offline use.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// =========================================================================
// MESSAGES — control channel for the page
// =========================================================================
self.addEventListener('message', (event) => {
  const type = event.data?.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Escape hatch: wipe every cache this worker owns.
  if (type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n.startsWith('hamsa-')).map(n => caches.delete(n)));
        event.ports?.[0]?.postMessage({ cleared: true });
      })()
    );
    return;
  }

  if (type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
  }
});
