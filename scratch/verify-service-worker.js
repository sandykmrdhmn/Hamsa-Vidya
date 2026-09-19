/**
 * Verify the service worker (L4 follow-up).
 *
 * The main risk with a service worker is shipping one that caches app code
 * aggressively and then serves stale JS forever. These checks assert the
 * strategy is the safe one, that every precached path actually exists, and that
 * API traffic is never cached.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SW = read('sw.js');
const APP = read('js/app.js');
const HTML = read('index.html');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Pull the SHELL_ASSETS array out of sw.js without executing the worker. */
function extractShellAssets() {
  const start = SW.indexOf('const SHELL_ASSETS = [');
  if (start === -1) return null;
  const end = SW.indexOf('];', start);
  const literal = SW.slice(start + 'const SHELL_ASSETS = '.length, end + 1);
  return vm.runInNewContext(literal);
}

console.log('\n=== Strategy: app code must NOT be cache-first ===');
{
  check('network-first helper exists', /async function networkFirst\(request\)/.test(SW));
  check('cache-first helper exists', /async function cacheFirst\(request\)/.test(SW));
  check('navigation handler exists', /networkFirstForNavigation/.test(SW));

  // The default branch (app code + styles) must route to networkFirst.
  check('app code/styles use network-first',
    /\/\/ App code and styles\.\s*\n\s*event\.respondWith\(networkFirst\(request\)\);/.test(SW));

  // Only vendor + icons may be cache-first.
  const lazy = SW.match(/const LAZY_CACHE_PATTERNS = \[([\s\S]*?)\];/);
  check('cache-first limited to vendor and icons',
    lazy && /assets\\\/vendor/.test(lazy[1]) && /assets\\\/icons/.test(lazy[1])
      && !/\\\/js\\\//.test(lazy[1]) && !/\\\/css\\\//.test(lazy[1]),
    lazy ? lazy[1].trim() : 'pattern list not found');
}

console.log('\n=== API traffic is never cached ===');
{
  check('network-only list defined', /const NETWORK_ONLY_PATTERNS = \[/.test(SW));
  check('/api/ is network-only', /NETWORK_ONLY_PATTERNS = \[\s*\n\s*\/\\\/api\\\/\//.test(SW),
    'pattern missing');
  check('network-only short-circuits before any caching',
    /NETWORK_ONLY_PATTERNS\.some[\s\S]{0,120}return;/.test(SW));
  check('cross-origin requests are passed through',
    /url\.origin !== self\.location\.origin/.test(SW));
  check('non-GET requests are passed through', /request\.method !== 'GET'/.test(SW));
}

console.log('\n=== Versioning and cleanup ===');
{
  check('cache name is versioned', /const CACHE_VERSION = '/.test(SW));
  check('shell and runtime caches are separate',
    /SHELL_CACHE = `hamsa-shell-/.test(SW) && /RUNTIME_CACHE = `hamsa-runtime-/.test(SW));
  check('activate deletes stale caches',
    /addEventListener\('activate'[\s\S]{0,600}caches\.delete/.test(SW));
  check('stale detection is scoped to our own caches',
    /n\.startsWith\('hamsa-'\) && !ALL_CACHES\.includes\(n\)/.test(SW));
  check('skipWaiting so updates apply promptly', /self\.skipWaiting\(\)/.test(SW));
  check('clients.claim so open tabs are controlled', /self\.clients\.claim\(\)/.test(SW));
}

console.log('\n=== Install is resilient ===');
{
  // Strip comments first — sw.js explains in prose why addAll() is avoided,
  // and that explanation should not count as usage.
  const swCode = SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('does not use cache.addAll (one 404 would fail the whole install)',
    !/cache\.addAll/.test(swCode));
  check('uses allSettled so a missing asset does not block install',
    /Promise\.allSettled/.test(SW));
  check('reports which assets failed', /Some shell assets were not cached/.test(SW));
  check('bypasses the HTTP cache while precaching', /cache: 'reload'/.test(SW));
}

console.log('\n=== Offline fallbacks ===');
{
  check('navigation falls back to the cached shell',
    /caches\.match\('index\.html'\)/.test(SW));
  check('hash routes still resolve offline (falls back to shell, not 404)',
    /networkFirstForNavigation[\s\S]{0,900}index\.html/.test(SW));
  check('uncached + offline returns a clear status', /Offline and not cached/.test(SW));
  check('navigation offline page explains what to do',
    /Reconnect once to enable offline use/.test(SW));
}

console.log('\n=== Every precached asset exists on disk ===');
{
  const assets = extractShellAssets();
  check('SHELL_ASSETS parsed', Array.isArray(assets) && assets.length > 0);

  if (Array.isArray(assets)) {
    const missing = assets
      .filter(a => a !== './')
      .filter(a => !exists(a));
    check(`all ${assets.length} precached paths exist`, missing.length === 0,
      `missing: ${missing.join(', ')}`);

    // Everything index.html loads must be precached, or the app cannot boot offline.
    const linkedCss = [...HTML.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    const linkedJs = [...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

    const missingCss = linkedCss.filter(f => !assets.includes(f));
    check(`all ${linkedCss.length} stylesheets are precached`, missingCss.length === 0,
      `missing: ${missingCss.join(', ')}`);

    // Heavy PDF vendor bundles are deliberately lazy, so only assert the boot-
    // critical scripts are precached.
    const bootCritical = linkedJs.filter(f => !/assets\/vendor\/(pdf|jspdf|html2pdf)/.test(f));
    const missingJs = bootCritical.filter(f => !assets.includes(f));
    check(`all ${bootCritical.length} boot-critical scripts are precached`, missingJs.length === 0,
      `missing: ${missingJs.join(', ')}`);

    // Confirm the heavy ones were intentionally excluded, not forgotten.
    const heavy = linkedJs.filter(f => /assets\/vendor\/(pdf|jspdf|html2pdf)/.test(f));
    check('heavy PDF bundles are left to lazy caching',
      heavy.every(f => !assets.includes(f)),
      `unexpectedly precached: ${heavy.filter(f => assets.includes(f)).join(', ')}`);

    check('pdf.worker is not precached but is covered by the vendor pattern',
      !assets.includes('assets/vendor/pdf.worker.min.js') && exists('assets/vendor/pdf.worker.min.js'));
  }
}

console.log('\n=== Registration and escape hatch ===');
{
  check('app registers the worker', /_registerServiceWorker\(\)/.test(APP));
  check('registration is called during init', /this\._registerServiceWorker\(\);/.test(APP));
  check('registration failure cannot break the app',
    /catch \(err\) \{[\s\S]{0,220}Registration failed/.test(APP));
  check('skips file:// where registration would throw', /location\.protocol === 'file:'/.test(APP));
  check('notifies the user when an update is ready',
    /A new version is ready/.test(APP));
  check('escape hatch exists', /async clearServiceWorker\(\)/.test(APP));
  check('escape hatch unregisters and clears caches',
    /clearServiceWorker[\s\S]{0,700}r\.unregister\(\)[\s\S]{0,400}caches\.delete/.test(APP));
  check('worker documents the manual escape hatch',
    /getRegistrations\(\)[\s\S]{0,200}unregister/.test(SW));
  check('worker supports CLEAR_CACHES message', /type === 'CLEAR_CACHES'/.test(SW));
}

console.log('\n=== Server can actually serve it ===');
{
  const server = read('server.js');
  const denied = server.match(/const DENIED_FILES = new Set\(\[([\s\S]*?)\]\)/);
  check('sw.js is not in the deny-list', denied && !/sw\.js/.test(denied[1]));
  check('manifest extension is servable', /'\.webmanifest'/.test(server));
  check('sw.js is served no-cache so updates are picked up',
    /\.js.*change during development|'no-cache'/.test(server));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
