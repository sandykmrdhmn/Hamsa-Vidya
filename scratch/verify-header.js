/**
 * Verify the two-tier site header.
 *
 * WHAT WENT WRONG BEFORE
 * One row carried a 72px logo, a two-line brand block, nine module tabs with
 * icons and labels, a search trigger with a keyboard hint, a streak chip, two
 * icon toggles and a profile pill — roughly 1730px of content in a 1560px
 * column. Everything from "Settings" rightward ran off the page edge.
 *
 * The header is static markup in index.html, so the risks are structural: a
 * control silently duplicated or dropped while moving it between rows, a tab
 * losing the `data-module` attribute app.js navigates by, or the measured
 * `--header-h` contract breaking so every sticky bar tucks under the header
 * again.
 *
 * index.html is parsed with jsdom rather than grepped, because "is this element
 * inside row 1 or row 2" is a question about the tree, not the text.
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

const html = read('index.html');
const headerCss = read('css/header.css');
const appJs = read('js/app.js');
const sw = read('sw.js');

/** The nine primary modules, in the order the rail presents them. */
const MODULES = [
  'dashboard', 'ai-teacher', 'quiz', 'study-notes', 'flashcards',
  'answer-writing', 'exam-alerts', 'tools', 'settings'
];

/** Controls that must live in row 1, by id. */
const UTILITIES = [
  'global-search-btn', 'header-streak-badge', 'sound-toggle-btn',
  'theme-toggle-btn', 'header-user-profile'
];

// ===========================================================================
console.log('\n=== Stylesheet wiring ===');
// ===========================================================================
{
  const linked = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) linked.push(m[1]);

  check('css/header.css is linked', linked.includes('css/header.css'));
  const i = linked.indexOf('css/header.css');

  check('linked after the original header rules',
    i > linked.indexOf('css/components/01-base-and-header.css'));
  check('linked before layout.css so page width stays one authority',
    i < linked.indexOf('css/layout.css'),
    'otherwise two files would both decide --page-max alignment');
  check('linked before responsive.css so the mobile breakpoint wins',
    i < linked.indexOf('css/responsive.css'));
  check('precached by the service worker', /'css\/header\.css'/.test(sw));
}

// ===========================================================================
console.log('\n=== --header-h contract ===');
// ===========================================================================
{
  check('app.js measures the header', /_trackHeaderHeight\(\) \{/.test(appJs));
  check('the measurement runs during init', /this\._trackHeaderHeight\(\);/.test(appJs));
  check('it publishes a CSS custom property',
    /setProperty\('--header-h', `\$\{h\}px`\)/.test(appJs));
  check('it re-measures on resize',
    /ResizeObserver/.test(appJs) && /observe\(header\)/.test(appJs),
    'font-scale, a long name and browser zoom all change the height');
  check('it has a fallback for engines without ResizeObserver',
    /addEventListener\('resize', publish\)/.test(appJs));
  check('a hidden header does not publish zero',
    /if \(h > 0\)/.test(appJs),
    'print and focus mode collapse the header; sticky bars must not jump');

  // One declared default rather than a fallback repeated at each use site.
  check('--header-h has a declared design default',
    /:root \{[\s\S]{0,900}--header-h: \d+px;/.test(headerCss),
    'without it the offsets compute to nothing before the first measurement');
  const defaults = [...headerCss.matchAll(/--header-h: (\d+)px/g)].map(m => m[1]);
  check('exactly one default value exists', defaults.length === 1, defaults.join(', '));
  check('no var() fallbacks duplicate that number',
    !/var\(--header-h,/.test(headerCss),
    'a fallback at each use site is a second place to forget to update');

  // Every sticky element that sits under the header must read the variable.
  for (const sel of ['.module-subnav-bar', '.textbook-sticky-bar', '.textbook-toc-sidebar']) {
    const at = headerCss.indexOf(`${sel} {`);
    check(`${sel} offsets from --header-h`,
      at !== -1 && /var\(--header-h\)/.test(headerCss.slice(at, at + 240)),
      'a hardcoded offset is what made these tuck under the header');
  }

  check('anchor jumps clear the header too',
    /\.textbook-section-block \{[\s\S]{0,200}scroll-margin-top: calc\(var\(--header-h\)/.test(headerCss));

  // Focus mode hides the header, so reserving space for it there would leave a
  // visible gap.
  check('focus mode reverts to its own offsets',
    /\.in-textbook-focus-mode \.textbook-sticky-bar \{\s*top: 15px;/.test(headerCss));

  // The old hardcoded values must not creep back in. `top: 15px` and
  // `top: 75px` are allowed: those are focus mode, where the header is hidden.
  const nonFocus = headerCss.replace(/\.in-textbook-focus-mode[\s\S]*?\}/g, '');
  check('no stale hardcoded header offsets remain',
    !/top: (68|72|90|96|104|112)px;/.test(nonFocus),
    'every offset below the header must come from --header-h');
}

// ===========================================================================
console.log('\n=== Rail and utilities are styled for the new size ===');
// ===========================================================================
{
  check('the header is a column of two rows',
    /\.header-inner \{[\s\S]{0,200}flex-direction: column/.test(headerCss));
  check('row 1 spreads brand and utilities',
    /\.header-top \{[\s\S]{0,220}justify-content: space-between/.test(headerCss));
  check('row 2 centres the rail',
    /\.header-nav-row \{[\s\S]{0,220}justify-content: center/.test(headerCss));
  check('the rows are separated by a fading hairline',
    /\.header-nav-row::before \{[\s\S]{0,400}linear-gradient\(90deg/.test(headerCss),
    'a hard full-width rule makes the header look like two stacked bars');

  // The brand mark is deliberately larger than the base 46px experiment: the
  // screenshot showed the small ringed logo reading as a smudge.
  check('the logo is sized up for a clear, premium mark',
    /\.logo-halo-wrapper \{[\s\S]{0,320}width: 58px/.test(headerCss),
    'a bigger coin is legible where the 46px ringed one was not');
  check('the cluttering orbital rings are switched off',
    /\.logo-3d-orbital-ring \{\s*display: none !important;/.test(headerCss),
    'the dashed + dotted orbits were obscuring the artwork');
  check('the wide blur halo is replaced by a tight rim light',
    /\.logo-halo-wrapper::after \{[\s\S]{0,200}filter: blur\(5px\)/.test(headerCss),
    'the old inset:-8px blur(9px) halo fogged the mark');
  check('the logo animation moves only the transform, keeping the art crisp',
    /@keyframes logoCleanFloat \{[\s\S]{0,160}translateY/.test(headerCss) &&
    !/@keyframes logoCleanFloat \{[\s\S]{0,200}box-shadow/.test(headerCss),
    'the old logoPranaBreath pulsed the glow, which is half of what smudged it');
  check('the logo mark respects reduced motion',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}\.hamsa-3d-logo \{ animation: none/.test(headerCss));
  check('the tagline cannot wrap and change the header height',
    /\.brand-tagline \{[\s\S]{0,220}white-space: nowrap/.test(headerCss));

  check('the tabs are presented as one inset rail',
    /\.primary-nav-links \{[\s\S]{0,400}border-radius: var\(--radius-full\)[\s\S]{0,200}background: var\(--bg-surface-elevated\)/.test(headerCss));
  check('the active tab uses the brand gradient',
    /\.nav-link\.primary-module-btn\.active \{[\s\S]{0,160}background: var\(--gradient-brand\)/.test(headerCss),
    'matches .subnav-pill.active so both navs agree');
  check('the rail can scroll as a last resort rather than overflow the column',
    /\.primary-nav-links \{[\s\S]{0,700}overflow-x: auto/.test(headerCss));
  check('that scrollbar is hidden',
    /\.primary-nav-links::-webkit-scrollbar \{\s*display: none;/.test(headerCss));

  // Space is reclaimed in stages before anything is forced to scroll.
  check('utility labels drop first at 1100px',
    /@media \(max-width: 1100px\)[\s\S]{0,300}\.search-trigger-text,[\s\S]{0,80}display: none/.test(headerCss));
  check('streak text and user name drop next at 940px',
    /@media \(max-width: 940px\)[\s\S]{0,400}\.user-name-wrapper \{\s*display: none/.test(headerCss));
  check('the whole nav row is hidden at the 820px mobile breakpoint',
    /@media \(max-width: 820px\)[\s\S]{0,200}\.header-nav-row \{\s*display: none/.test(headerCss),
    'responsive.css hides .nav-links there; the row must go too or it leaves an empty strip');
}

// ===========================================================================
// Structure. Grepping cannot answer "which row is this control in".
// ===========================================================================
(async () => {
  console.log('\n=== index.html structure ===');

  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

  if (!JSDOM) {
    console.log('  SKIP  jsdom not installed — static checks above still cover the wiring');
  } else {
    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      const $ = (s) => doc.querySelector(s);
      const $$ = (s) => [...doc.querySelectorAll(s)];

      const header = $('.site-header');
      const inner = $('.header-inner');
      const top = $('.header-top');
      const navRow = $('.header-nav-row');

      check('the header parses with exactly one .header-inner', $$('.header-inner').length === 1);
      check('it contains exactly two rows',
        $$('.header-top').length === 1 && $$('.header-nav-row').length === 1);
      check('both rows are direct children of .header-inner',
        top && navRow && top.parentElement === inner && navRow.parentElement === inner,
        `top=${top && top.parentElement.className} nav=${navRow && navRow.parentElement.className}`);
      check('row 1 comes before row 2',
        [...inner.children].indexOf(top) < [...inner.children].indexOf(navRow));
      check('.header-inner has no stray extra children',
        inner.children.length === 2,
        [...inner.children].map(c => c.className).join(' | '));

      // ---- nothing duplicated or lost while moving blocks between rows
      check('the brand block is in row 1, exactly once',
        $$('.brand-container').length === 1 && top.contains($('.brand-container')));
      check('the utilities block is in row 1, exactly once',
        $$('.header-actions').length === 1 && top.contains($('.header-actions')));
      check('the tab list is in row 2, exactly once',
        $$('.primary-nav-links').length === 1 && navRow.contains($('.primary-nav-links')));

      for (const id of UTILITIES) {
        const els = $$(`#${id}`);
        check(`#${id} exists exactly once, in row 1`,
          els.length === 1 && top.contains(els[0]),
          els.length === 0 ? 'missing' : `${els.length} copies`);
      }

      // ---- the tabs themselves
      const tabs = $$('.primary-nav-links .primary-module-btn');
      check('all nine module tabs render', tabs.length === 9, `found ${tabs.length}`);
      check('the tabs are in the expected order',
        JSON.stringify(tabs.map(b => b.getAttribute('data-module'))) === JSON.stringify(MODULES),
        tabs.map(b => b.getAttribute('data-module')).join(','));
      check('every tab keeps the data-module app.js navigates by',
        tabs.every(b => MODULES.includes(b.getAttribute('data-module'))));
      check('every tab still has an onclick handler',
        tabs.every(b => /^app\.setModule\('[\w-]+'\)$/.test(b.getAttribute('onclick') || '')),
        tabs.map(b => b.getAttribute('onclick')).filter(o => !/setModule/.test(o || '')).join(' | '));
      check('every tab has both an icon and a text label',
        tabs.every(b => b.querySelector('[data-lucide]') && b.querySelector('span')),
        'icon-only tabs would make nine unlabelled glyphs');
      check('exactly one tab starts active',
        tabs.filter(b => b.classList.contains('active')).length === 1);
      check('each tab is a real <button>',
        tabs.every(b => b.tagName === 'BUTTON'),
        'clickable divs would need the runtime a11y promotion');
      check('each tab sits in its own <li>',
        tabs.every(b => b.parentElement.tagName === 'LI'),
        'list semantics for the primary nav');

      // ---- accessibility of the new wrapper
      check('row 2 is a landmark with a label',
        navRow.tagName === 'NAV' && !!navRow.getAttribute('aria-label'),
        `${navRow.tagName} aria-label=${navRow.getAttribute('aria-label')}`);
      check('the label did not end up duplicated on the list too',
        !$('.primary-nav-links').getAttribute('aria-label'),
        'the nav already names this group');
      check('the list keeps role="list"',
        $('.primary-nav-links').getAttribute('role') === 'list');

      // ---- the sub-nav is a sibling of the header, not inside it
      check('the module sub-nav is outside the header',
        !header.contains($('#module-subnav-quiz')),
        'it is a third tier that only appears in the quiz module');

      // ---- tab order follows visual order: brand, utilities, then tabs
      const focusables = $$('.site-header button, .site-header [onclick], .site-header a');
      const firstTabIdx = focusables.indexOf(tabs[0]);
      const searchIdx = focusables.indexOf($('#global-search-btn'));
      check('utilities are reached before the tab rail in DOM order',
        searchIdx !== -1 && firstTabIdx !== -1 && searchIdx < firstTabIdx,
        `search=${searchIdx} firstTab=${firstTabIdx}`);

      // ---- the skip link still bypasses the nav
      check('the skip link still targets the main content',
        $('.skip-to-content') && $('.skip-to-content').getAttribute('href') === '#main-content');

      dom.window.close();
    } catch (err) {
      check('index.html parses and the header structure is intact', false,
        err && err.stack ? err.stack.split('\n')[0] : String(err));
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
