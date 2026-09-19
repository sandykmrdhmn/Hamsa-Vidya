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
const CACHE_VERSION = 'v9';
const SHELL_CACHE = `hamsa-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hamsa-runtime-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

/**
 * Everything required to boot the UI. Kept deliberately lean so installation is
 * quick — the heavy PDF libraries are cached on first use instead (see
 * LAZY_CACHE_PATTERNS below).
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
  'css/components/03-create-quiz.css',
  'css/components/04-motion.css',
  'css/components/05-study-notes.css',
  'css/components/06-flashcards.css',
  'css/components/07-global-search.css',
  'css/components/08-doubt-solver.css',
  'css/components/09-reading-themes.css',
  'css/components/10-tools.css',

  'css/dashboard.css',
  'css/quiz.css',
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

  // Vendor libraries needed just to boot
  'assets/vendor/dexie.min.js',
  'assets/vendor/lucide.min.js',
  'assets/vendor/marked.min.js',

  // Application modules
  'js/sanitizer.js',
  'js/ui-utils.js',
  'js/ai-client.js',
  'js/audio-engine.js',
  'js/db.js',
  'js/pdf-extractor.js',
  'js/pdf-generator.js',
  'js/gemini-service.js',
  'js/charts.js',
  'js/gurukul-wisdom.js',
  'js/views/dashboard.js',
  'js/views/create-quiz.js',
  'js/views/study-notes.js',
  'js/views/flashcards.js',
  'js/views/quiz-player.js',
  'js/views/quiz-result.js',
  'js/views/library.js',
  'js/views/quiz-history.js',
  'js/views/tools.js',
  'js/views/settings.js',
  'js/exam-profile.js',
  'js/eligibility-engine.js',
  'js/exam-service.js',
  'js/notification-summary-service.js',
  'js/views/exam-alerts.js',
  'js/answer-writing-service.js',
  'js/views/answer-writing.js',
  'js/ai-advisor.js',
  'js/ai-teacher-service.js',
  'js/views/ai-teacher.js',
  'js/auth-gate.js',
  'js/app.js',

  // Branding
  'assets/icons/hamsa-logo.svg',
  'assets/icons/hamsa-logo-3d.png'
];

/**
 * Large, optional assets cached the first time they are actually requested.
 * Precaching these would add ~3.1 MB to install time for features many sessions
 * never touch. `pdf.worker.min.js` is included because PDF.js loads it
 * dynamically — it never appears in a <script> tag.
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
          if (!res.ok) throw new Error(`${asset} -> HTTP ${res.status}`);
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
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
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
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Offline and not cached' });
  }
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
