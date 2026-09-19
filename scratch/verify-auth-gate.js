/**
 * Verify the pre-app login screen.
 *
 * WHAT THIS GUARDS
 * The gate is the first thing every visitor sees, and it must fail SAFE if
 * anything about it goes wrong:
 *
 *   - The Google button is a placeholder — no backend behind it. It must not
 *     grant entry, must not silently promote itself to guest mode, and must
 *     leave a clear signal that it is not wired yet.
 *   - The Guest button must actually let the visitor into the app.
 *   - A returning visitor whose `hamsa_auth_mode` is already set must NOT see
 *     the gate at all — otherwise the app is unreachable behind a screen the
 *     visitor cannot bypass.
 *   - `#app-root` starts `hidden`, so if auth-gate.js failed to load and the
 *     conditional in app.js was missing, the visitor would see nothing.
 *
 * These invariants are checked at three layers: the static markup, the
 * stylesheet's cascade position, and the controller's real behaviour executed
 * inside a jsdom document with a working `localStorage`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const HTML = read('index.html');
const CSS = read('css/auth-gate.css');
const CSS_NO_COMMENTS = stripComments(CSS);
const AUTH_JS = read('js/auth-gate.js');
const APP_JS = read('js/app.js');
const SW = read('sw.js');

// ===========================================================================
console.log('\n=== The gate is hidden by default and starts above every layer ===');
// ===========================================================================
{
  check('#auth-gate exists in the markup',
    /id="auth-gate"[^>]*class="auth-gate"/.test(HTML));
  check('it is hidden by default so a returning visitor never flashes it',
    /id="auth-gate"[^>]*\bhidden\b/.test(HTML) ||
    /class="auth-gate"[^>]*\bhidden\b/.test(HTML),
    'without `hidden` the gate would render for one paint before JS ran');
  check('it is a role="dialog"',
    /id="auth-gate"[^>]*role="dialog"/.test(HTML));
  check('and aria-modal',
    /id="auth-gate"[^>]*aria-modal="true"/.test(HTML));
  check('it labels itself against the wordmark',
    /aria-labelledby="auth-gate-title"/.test(HTML) &&
    /id="auth-gate-title"/.test(HTML));

  const rule = CSS_NO_COMMENTS.match(/\.auth-gate\s*\{([^}]+)\}/);
  check('.auth-gate has a rule', !!rule);
  check('it covers the whole viewport with position:fixed inset:0',
    /position:\s*fixed/.test(rule[1]) && /inset:\s*0/.test(rule[1]));
  check('its z-index is above the site header and every drawer',
    Number((rule[1].match(/z-index:\s*(\d+)/) || [])[1]) >= 10000);

  // `.dm-orb` and `.dm-rays` use z-index: -1 and would punch through without
  // isolation. This is the exact bug css/dashboard.css guards against on the
  // masthead — reusing those classes means we inherit the requirement.
  check('the gate is its own stacking context so the aurora cannot leak',
    /isolation:\s*isolate/.test(rule[1]));
  check('the gate clips its aurora',
    /overflow:\s*hidden/.test(rule[1]));

  check('the hidden attribute drops it out of the document',
    /\.auth-gate\[hidden\]\s*\{\s*display:\s*none/.test(CSS_NO_COMMENTS));
}

// ===========================================================================
console.log('\n=== The wordmark reuses the dashboard masthead classes ===');
// ===========================================================================
{
  // Reused classes: if any were misspelled the login screen would silently
  // fall back to unstyled text.
  for (const cls of ['dash-mast-inner', 'dash-mast-title', 'dash-mast-en',
                     'dash-mast-hi', 'dash-mast-aurora', 'dm-rays',
                     'dm-orb-1', 'dm-orb-2', 'dm-orb-3']) {
    check(`the gate uses .${cls} from the dashboard`,
      new RegExp(`class="[^"]*\\b${cls.replace(/-/g, '-')}\\b`).test(HTML.slice(HTML.indexOf('id="auth-gate"'), HTML.indexOf('id="app-root"'))));
  }

  const gateBlock = HTML.slice(HTML.indexOf('id="auth-gate"'), HTML.indexOf('id="app-root"'));
  check('the English wordmark reads HAMSA VIDYA',
    /class="dash-mast-en"[^>]*data-text="HAMSA VIDYA"[^>]*>HAMSA VIDYA/.test(gateBlock));
  check('the Hindi wordmark reads हंस विद्या',
    /class="dash-mast-hi"[^>]*data-text="हंस विद्या"[^>]*>हंस विद्या/.test(gateBlock));
  check('the Hindi wordmark is tagged lang="hi"', /class="dash-mast-hi"[^>]*lang="hi"/.test(gateBlock));

  // The wordmark inside the gate has to be visibly larger than on the
  // dashboard — this is the largest element on the visible page.
  check('the gate overrides the wordmark size larger than the dashboard',
    /\.auth-gate\s+\.dash-mast-en\s*\{[^}]*font-size:\s*clamp\([^)]*\b7[.\d]*rem/.test(CSS_NO_COMMENTS),
    'the max clamp must exceed the dashboard\'s 5.75rem');
}

// ===========================================================================
console.log('\n=== Buttons: Google is inert, Guest is the real path ===');
// ===========================================================================
{
  const gateBlock = HTML.slice(HTML.indexOf('id="auth-gate"'), HTML.indexOf('id="app-root"'));

  // ---- Guest
  check('#auth-guest-btn exists and is a real <button>',
    /<button[^>]*id="auth-guest-btn"/.test(gateBlock));
  check('it advertises itself as the primary path',
    /id="auth-guest-btn"[^>]*class="[^"]*auth-btn-guest/.test(gateBlock));
  check('its label reads "Continue as Guest"',
    /id="auth-guest-btn"[\s\S]{0,500}Continue as Guest/.test(gateBlock));

  // ---- Google
  check('#auth-google-btn exists and is a real <button>',
    /<button[^>]*id="auth-google-btn"/.test(gateBlock));
  // The Google button's opening tag can be far from the badge because the
  // brand SVG lives between them, so match with a wider window than usual.
  check('it uses the "Soon" badge to warn the user',
    /id="auth-google-btn"[\s\S]{0,4000}class="auth-btn-badge"[^>]*>\s*Soon\s*</.test(gateBlock),
    'without the badge the button looks live');
  check('its accessible name says "coming soon"',
    gateBlock.includes('id="auth-google-btn"') &&
    gateBlock.includes('aria-label="Continue with Google (coming soon)"'));

  // The Google button MUST NOT be wired to anything that grants entry. Search
  // the whole controller for the storage key being set alongside a Google
  // handler — that would silently promote inert clicks to real sign-ins.
  check('the controller never sets the storage key from a Google path',
    !/google[\s\S]{0,300}localStorage\.setItem\(/i.test(AUTH_JS),
    'a Google click must not persist an authenticated mode');

  // The Google handler is `_signalGoogleUnavailable`, and nothing else must
  // impersonate it. Its body ends at the first `\n    }` — a 4-space indent
  // close for a class method inside an IIFE-scoped class.
  const googleHandler = AUTH_JS.match(/_signalGoogleUnavailable\s*\(\)\s*\{([\s\S]*?)\n {4}\}/);
  check('the Google click handler exists', !!googleHandler);
  if (googleHandler) {
    check('the Google handler does not touch localStorage',
      !/localStorage/.test(googleHandler[1]),
      googleHandler[1].split('\n').filter(l => /localStorage/.test(l)).join(' | '));
    check('it uses a toast, or an inline fallback if the app is not ready',
      /showToast/.test(googleHandler[1]) && /_showInlineNotice/.test(googleHandler[1]),
      'a hard alert() would ruin the polish of the page');
  }

  // A common regression: adding a "sign in with Google" flow that stores the
  // provider name without a real token. Guard the storage layer directly.
  check('only continueAsGuest sets the storage key',
    (AUTH_JS.match(/localStorage\.setItem\(\s*STORAGE_KEY/g) || []).length === 1);
}

// ===========================================================================
console.log('\n=== Cascade: styles win where they need to ===');
// ===========================================================================
{
  const linked = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);

  check('css/auth-gate.css is linked',
    linked.includes('css/auth-gate.css'));
  check('it comes after css/dashboard.css, so wordmark overrides win',
    linked.indexOf('css/auth-gate.css') > linked.indexOf('css/dashboard.css'),
    `auth=${linked.indexOf('css/auth-gate.css')} dashboard=${linked.indexOf('css/dashboard.css')}`);
  check('it comes after css/onboarding.css, so the gate can outrank the onboarding modal',
    linked.indexOf('css/auth-gate.css') > linked.indexOf('css/onboarding.css'));
  check('it comes before css/responsive.css, so mobile rules still win',
    linked.indexOf('css/auth-gate.css') < linked.indexOf('css/responsive.css'));
}

// ===========================================================================
console.log('\n=== Persistent site footer ===');
// ===========================================================================
//
// jsdom-based, because "the link has href=# and data-social=instagram" is a
// question about a single element's attribute set, not the raw text — a regex
// that assumes attribute order will pass or fail on a cosmetic edit.
{
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

  if (!JSDOM) {
    console.log('  SKIP  jsdom not installed — the behavioural checks below still exercise the click paths');
  } else {
    const doc = new JSDOM(HTML).window.document;
    const footer = doc.getElementById('hv-footer');
    check('a persistent site footer exists', !!footer);
    check('the footer sits inside #app-root',
      !!footer && !!footer.closest('#app-root'));

    for (const network of ['instagram', 'x']) {
      const link = footer && footer.querySelector(`a[data-social="${network}"]`);
      check(`the footer links ${network}`, !!link);
      if (!link) continue;
      check(`the ${network} link uses a placeholder href="#" for now`,
        link.getAttribute('href') === '#');
      check(`the ${network} link routes through authGate.handleSocialClick`,
        (link.getAttribute('onclick') || '').includes(`handleSocialClick(event, '${network}')`));
      check(`the ${network} link has an accessible name`,
        !!link.getAttribute('aria-label'));
      check(`the ${network} link carries an inline SVG glyph`,
        !!link.querySelector('svg'));
    }

    // The gate has its own social row above the login card.
    const gateRow = doc.querySelector('#auth-gate .auth-social-row');
    check('the gate carries its own social row', !!gateRow);
    check('the gate row also links both networks',
      !!gateRow && !!gateRow.querySelector('a[data-social="instagram"]') &&
      !!gateRow.querySelector('a[data-social="x"]'));
  }
}

// ===========================================================================
console.log('\n=== SVG icons render inline, without an extra network request ===');
// ===========================================================================
{
  // Both icons are inline SVG — asserting that keeps the login screen able to
  // paint before any assets load.
  check('the Google button icon is inline SVG',
    /id="auth-google-btn"[\s\S]{0,900}<svg[^>]*viewBox="0 0 48 48"/.test(HTML));
  check('the guest button icon is inline SVG',
    /id="auth-guest-btn"[\s\S]{0,500}<svg[\s\S]{0,300}<\/svg>/.test(HTML));
  check('the Instagram glyph is inline SVG',
    /data-social="instagram"[\s\S]{0,400}<svg[\s\S]{0,1500}<\/svg>/.test(HTML));
  check('the X glyph is inline SVG',
    /data-social="x"[\s\S]{0,400}<svg[\s\S]{0,1500}<\/svg>/.test(HTML));
}

// ===========================================================================
console.log('\n=== app.js boots the app only after the gate resolves ===');
// ===========================================================================
{
  check('js/auth-gate.js is linked',
    /<script src="js\/auth-gate\.js"><\/script>/.test(HTML));

  const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check('it is parsed before js/app.js, so `window.authGate` exists when app.js reads it',
    scripts.indexOf('js/auth-gate.js') !== -1 &&
    scripts.indexOf('js/auth-gate.js') < scripts.indexOf('js/app.js'),
    `auth=${scripts.indexOf('js/auth-gate.js')} app=${scripts.indexOf('js/app.js')}`);

  // The boot conditional. Deleting either half of this branch is what would
  // let a hostile localStorage bypass the gate, or lock the app forever.
  check('app.js consults window.authGate on DOMContentLoaded',
    /if\s*\(\s*window\.authGate\s*&&\s*!window\.authGate\.isAuthenticated\(\)\s*\)/.test(APP_JS));
  check('boot unhides #app-root — the app is hidden in the HTML until then',
    /getElementById\('app-root'\)[\s\S]{0,120}removeAttribute\('hidden'\)/.test(APP_JS));
  check('the else branch still boots, so a missing authGate cannot brick the app',
    /}\s*else\s*\{[\s\S]{0,100}boot\(\);/.test(APP_JS),
    'if auth-gate.js fails to load, the app must still start');
  check('#app-root starts hidden so the app never flashes behind the gate',
    /<div id="app-root"[^>]*\bhidden\b/.test(HTML),
    'without this the dashboard paints for one frame before the gate covers it');
}

// ===========================================================================
console.log('\n=== Service worker precaches the new files ===');
// ===========================================================================
{
  check('css/auth-gate.css is in SHELL_ASSETS',
    /'css\/auth-gate\.css'/.test(SW));
  check('js/auth-gate.js is in SHELL_ASSETS',
    /'js\/auth-gate\.js'/.test(SW));
  check('the cache version was bumped past v8 for this change',
    /CACHE_VERSION\s*=\s*'v[9-9]|CACHE_VERSION\s*=\s*'v[1-9][0-9]+'/.test(SW),
    'a fresh CSS + JS pair without a version bump leaves clients on the old shell');
}

// ===========================================================================
// BEHAVIOURAL — run the controller inside jsdom with real localStorage
// ===========================================================================
(async () => {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

  if (!JSDOM) {
    console.log('\n  SKIP  jsdom not installed — static checks above still cover most of it');
  } else {
    console.log('\n=== The controller behaves correctly against a real DOM ===');

    // Minimal DOM: just what the controller expects to find. Loading the whole
    // index.html would drag every other script in and blur the test surface.
    const dom = new JSDOM(`
      <!doctype html><html><body>
        <div id="auth-gate" hidden>
          <button id="auth-guest-btn"></button>
          <button id="auth-google-btn"></button>
          <p id="auth-inline-notice" hidden></p>
        </div>
        <div id="app-root" hidden></div>
      </body></html>
    `, { runScripts: 'outside-only', url: 'http://localhost/' });

    const { window } = dom;
    // Give the controller a working window/document/localStorage. jsdom provides
    // all three; the file uses an IIFE, so eval-ing it once wires everything.
    window.eval(AUTH_JS);

    const gate = window.authGate;
    check('window.authGate is exposed', !!gate);
    check('required methods are present',
      ['isAuthenticated', 'currentMode', 'show', 'continueAsGuest',
       'signOut', 'handleSocialClick'].every(m => typeof gate[m] === 'function'));

    // ---- fresh visitor
    check('a fresh visitor is not authenticated', gate.isAuthenticated() === false);
    check('currentMode is null for a fresh visitor', gate.currentMode() === null);

    // ---- hostile / stale values
    window.localStorage.setItem('hamsa_auth_mode', 'HACKED');
    check('a value outside the allow-list is treated as not authed',
      gate.isAuthenticated() === false, window.localStorage.getItem('hamsa_auth_mode'));
    window.localStorage.setItem('hamsa_auth_mode', '');
    check('an empty string does not grant entry', gate.isAuthenticated() === false);
    window.localStorage.removeItem('hamsa_auth_mode');

    // ---- show / hide flow
    await new Promise((resolve) => {
      gate.show(() => resolve());
      // Simulate the guest click by calling the method directly. The button's
      // real handler is wired inside _mount and calls the same method, so the
      // behaviour under test is identical.
      setTimeout(() => gate.continueAsGuest(), 20);
    });
    check('continueAsGuest persists GUEST as the mode',
      window.localStorage.getItem('hamsa_auth_mode') === 'GUEST');
    check('isAuthenticated is true after entering as guest',
      gate.isAuthenticated() === true);
    check('#app-root is unhidden after the gate resolves',
      !window.document.getElementById('app-root').hasAttribute('hidden'));
    check('#auth-gate is set hidden after the gate resolves',
      window.document.getElementById('auth-gate').hasAttribute('hidden'));

    // ---- Google inert click
    const before = window.localStorage.getItem('hamsa_auth_mode');
    // Simulate a bad state where a previous test left GUEST; the Google path
    // must never CHANGE the mode.
    gate._signalGoogleUnavailable();
    check('the Google handler does not modify the stored mode',
      window.localStorage.getItem('hamsa_auth_mode') === before);

    // ---- sign out
    let signedOutBoot = false;
    // Detach the gate handler so show() doesn't re-fire the boot callback.
    // signOut re-shows the gate — we do not need to complete the second flow.
    gate.signOut(() => { signedOutBoot = true; });
    check('signOut clears the stored mode',
      window.localStorage.getItem('hamsa_auth_mode') === null);
    check('signOut re-shows the gate',
      !window.document.getElementById('auth-gate').hasAttribute('hidden'));

    // ---- social click intercept
    const link = window.document.createElement('a');
    link.setAttribute('href', '#');
    let prevented = false;
    const evt = {
      currentTarget: link,
      preventDefault: () => { prevented = true; }
    };
    gate.handleSocialClick(evt, 'instagram');
    check('a placeholder social click is preventDefault()-ed',
      prevented === true, 'without this, "#" would scroll the page to the top');

    // A real URL must NOT be intercepted, so a later wiring pass Just Works.
    link.setAttribute('href', 'https://instagram.com/hamsavidya');
    let prevented2 = false;
    gate.handleSocialClick({
      currentTarget: link,
      preventDefault: () => { prevented2 = true; }
    }, 'instagram');
    check('a real social URL is left alone',
      prevented2 === false, 'the browser must be free to navigate when the profile is live');

    dom.window.close();
    void signedOutBoot; // suppress unused warning
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
