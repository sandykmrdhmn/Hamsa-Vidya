/**
 * Verify the shared view hero banner.
 *
 * Nine views had nine different headers — four with no styling at all, five
 * with a class used by exactly one view. They are now all built by
 * UIUtils.buildViewHero() and styled by css/view-hero.css.
 *
 * This suite guards three things that regress silently:
 *
 *   1. WIRING — the stylesheet is linked in the right cascade position and
 *      precached; every view that should have a hero calls the builder; the two
 *      views that deliberately do NOT (quiz-player, quiz-result) still don't.
 *   2. CONTRACT — every class the builder emits has a CSS rule, every accent a
 *      view asks for exists, and the old duplicated header markup is gone so
 *      no page shows two stacked banners.
 *   3. BEHAVIOUR — the builder is executed in jsdom against real data and a
 *      real XSS payload, and the counter animation is run to completion to
 *      prove it lands on the caller's exact formatted value.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const html = read('index.html');
const heroCss = read('css/view-hero.css');
const uiUtils = read('js/ui-utils.js');
const appJs = read('js/app.js');
const sw = read('sw.js');

/** Views that must open with a shared hero, and the accent each one claims. */
const HERO_VIEWS = [
  { file: 'js/views/create-quiz.js', accent: 'emerald' },
  { file: 'js/views/study-notes.js', accent: 'violet' },
  { file: 'js/views/flashcards.js', accent: 'amber' },
  { file: 'js/views/answer-writing.js', accent: 'pink' },
  { file: 'js/views/exam-alerts.js', accent: 'orange' },
  { file: 'js/views/library.js', accent: 'amber' },
  { file: 'js/views/quiz-history.js', accent: 'indigo' },
  { file: 'js/views/tools.js', accent: 'cyan' },
  { file: 'js/views/settings.js', accent: 'slate' }
];

/**
 * Views that must NOT get a hero, and why. Asserted explicitly so that adding
 * one later is a deliberate decision rather than a reflex.
 */
const NO_HERO_VIEWS = [
  {
    file: 'js/views/quiz-player.js',
    reason: 'a timed question screen — a banner would push the question below the fold'
  },
  {
    file: 'js/views/quiz-result.js',
    reason: 'already opens with a purposeful score summary card'
  }
];

/** The two reference heroes keep their own bespoke markup. */
const REFERENCE_HEROES = [
  { file: 'js/views/dashboard.js', cls: 'dash-masthead' },
  { file: 'js/views/ai-teacher.js', cls: 'teacher-hero' }
];

// ===========================================================================
console.log('\n=== Stylesheet wiring ===');
// ===========================================================================
{
  const linked = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) linked.push(m[1]);

  check('css/view-hero.css is linked', linked.includes('css/view-hero.css'));

  const i = linked.indexOf('css/view-hero.css');

  // A hero has to win over the one-off header rules it replaces, so it must
  // come after every per-view stylesheet.
  const mustPrecede = [
    'css/components/10-tools.css',
    'css/exam-alerts.css',
    'css/answer-writing.css',
    'css/quiz.css',
    'css/dashboard.css',
    'css/ai-teacher/07-print-and-responsive.css'
  ];
  for (const sheet of mustPrecede) {
    const j = linked.indexOf(sheet);
    check(`linked after ${sheet}`, j !== -1 && i > j, `${sheet}=${j} hero=${i}`);
  }

  // But focus rings must still have the last word.
  check('linked before a11y.css', i < linked.indexOf('css/a11y.css'));

  check('precached by the service worker', /'css\/view-hero\.css'/.test(sw));
}

// ===========================================================================
console.log('\n=== Builder exists and is hooked up ===');
// ===========================================================================
{
  check('UIUtils.buildViewHero() exists', /\n  buildViewHero\(o = \{\}\) \{/.test(uiUtils));
  check('UIUtils.animateHeroCounters() exists', /\n  animateHeroCounters\(root = document\) \{/.test(uiUtils));
  check('UIUtils._heroStatNumber() exists', /\n  _heroStatNumber\(value\) \{/.test(uiUtils));
  check('accent allow-list is declared', /VIEW_HERO_ACCENTS: \[/.test(uiUtils));

  // Hooked into the one post-render call every view already makes, so a view
  // cannot render a hero and forget to animate it.
  check('counters start from app.refreshIcons()',
    /refreshIcons\(\) \{[\s\S]{0,700}UIUtils\.animateHeroCounters\(\)/.test(appJs));
  check('the hook is guarded for load order',
    /window\.UIUtils && UIUtils\.animateHeroCounters/.test(appJs),
    'refreshIcons() can fire before ui-utils.js has run');
}

// ===========================================================================
console.log('\n=== Every view is accounted for ===');
// ===========================================================================
{
  for (const v of HERO_VIEWS) {
    const src = read(v.file);
    const name = path.basename(v.file);

    check(`${name} builds a shared hero`, /UIUtils\.buildViewHero\(\{/.test(src));
    check(`${name} claims accent '${v.accent}'`,
      new RegExp(`accent: (?:dueCount > 0 \\? )?'${v.accent}'`).test(src),
      (src.match(/accent: [^,\n]+/) || ['none'])[0]);

    // A hero that is built but never interpolated is the classic silent miss.
    check(`${name} interpolates the hero into its markup`,
      /\$\{heroHtml\}/.test(src) || /\$\{UIUtils\.buildViewHero\(\{/.test(src) ||
      /\$\{await this\._buildHero\(\)\}/.test(src) || /\$\{this\._buildHero/.test(src) ||
      /heroHtml = /.test(src) && /\$\{heroHtml\}/.test(src));

    // Every hero says what the tab is for, in both scripts.
    check(`${name} hero states the tab's purpose`, /tagline: '/.test(src));
    check(`${name} hero has a Devanagari line`, /hindi: '/.test(src));
  }

  for (const v of NO_HERO_VIEWS) {
    const src = read(v.file);
    check(`${path.basename(v.file)} deliberately has no hero (${v.reason})`,
      !/UIUtils\.buildViewHero/.test(src));
  }

  for (const r of REFERENCE_HEROES) {
    const src = read(r.file);
    check(`${path.basename(r.file)} keeps its own .${r.cls}`, src.includes(r.cls));
    check(`${path.basename(r.file)} was not converted to the shared hero`,
      !/UIUtils\.buildViewHero/.test(src),
      'the two reference designs are intentionally left alone');
  }
}

// ===========================================================================
console.log('\n=== Old duplicated headers are gone ===');
// ===========================================================================
{
  // If the previous header survives next to a hero, the page shows two banners.
  const removed = [
    ['js/views/study-notes.js', 'study-vault-hero', 'replaced by the shared hero'],
    ['js/views/study-notes.js', 'study-hero-actions', 'CTA moved into the hero'],
    ['js/views/flashcards.js', 'hero-greeting', 'borrowed dashboard header dropped'],
    ['js/views/answer-writing.js', 'aw-header-row', 'title block moved into the hero'],
    ['js/views/quiz-history.js', 'Quiz History & Attempt Log', 'old h2 title'],
    ['js/views/library.js', 'Study Library & Knowledge Base', 'old h2 title'],
    ['js/views/create-quiz.js', 'Create New AI Mastery Quiz', 'old h2 title'],
    ['js/views/settings.js', 'Settings & Preferences', 'old h2 title']
  ];
  for (const [file, token, why] of removed) {
    check(`${path.basename(file)}: '${token}' removed (${why})`, !read(file).includes(token));
  }

  // Two views keep their old element for the controls inside it, demoted by a
  // modifier class. Both sides of that contract must be present.
  check('tools hub demotes its old header',
    read('js/views/tools.js').includes('tools-hero-controls-only') &&
    /\.tools-hero-header\.tools-hero-controls-only \{/.test(heroCss));
  check('exam alerts demotes its old header',
    read('js/views/exam-alerts.js').includes('ea-hero-status-only') &&
    /\.ea-hero\.ea-hero-status-only \{/.test(heroCss));
  check('demoted headers drop their decorative ::before',
    /\.tools-hero-header\.tools-hero-controls-only::before[\s\S]{0,120}display: none/.test(heroCss) &&
    /\.ea-hero\.ea-hero-status-only::before[\s\S]{0,120}display: none/.test(heroCss),
    'the frozen files draw a gradient overlay we no longer want');
}

// ===========================================================================
console.log('\n=== CSS contract ===');
// ===========================================================================
{
  // Every accent any view asks for must actually be defined.
  const accentsUsed = new Set();
  for (const v of HERO_VIEWS) {
    const src = read(v.file);
    for (const m of src.matchAll(/accent: (?:dueCount > 0 \? )?'([a-z]+)'(?: : '([a-z]+)')?/g)) {
      accentsUsed.add(m[1]);
      if (m[2]) accentsUsed.add(m[2]);
    }
  }
  check('views use several distinct accents', accentsUsed.size >= 6, [...accentsUsed].join(','));

  // The declarations are space-padded for column alignment, so the selector can
  // be followed by more than one space before the brace.
  const missing = [...accentsUsed].filter(a =>
    !new RegExp(`\\.vhero-accent-${a}\\s+\\{`).test(heroCss));
  check('every accent used has a CSS rule', missing.length === 0, missing.join(', '));

  // The allow-list in the builder and the CSS tokens must agree, or a valid
  // accent silently renders with no colour.
  const listed = (uiUtils.match(/VIEW_HERO_ACCENTS: \[([^\]]+)\]/) || [, ''])[1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  const declared = [...heroCss.matchAll(/\.vhero-accent-([a-z]+)\s+\{/g)].map(m => m[1]);
  check('allow-list and CSS accents match exactly',
    JSON.stringify(listed.slice().sort()) === JSON.stringify(declared.slice().sort()),
    `js=[${listed}] css=[${declared}]`);

  // Every class the builder emits needs a rule.
  const emitted = new Set();
  for (const m of uiUtils.slice(uiUtils.indexOf('buildViewHero')).matchAll(/class="(vhero[^"$]*)"/g)) {
    m[1].split(/\s+/).forEach(c => { if (/^vhero[\w-]*$/.test(c)) emitted.add(c); });
  }
  check('builder emits the expected number of classes', emitted.size >= 15, `${emitted.size}`);
  const unstyled = [...emitted].filter(c => !new RegExp(`\\.${c}(?![\\w-])`).test(heroCss));
  check('every emitted class has a CSS rule', unstyled.length === 0, unstyled.join(', '));

  // Robustness of the visual treatment.
  check('gradient title has a solid colour fallback',
    /\.vhero-title-accent \{[\s\S]{0,260}color: var\(--vh\)/.test(heroCss),
    'background-clip:text renders invisible where unsupported');
  check('light sweep is its own ::after layer',
    /\.vhero-title-accent::after \{[\s\S]{0,120}content: attr\(data-text\)/.test(heroCss));
  check('light themes get a tinted sweep instead of white-on-white',
    /\[data-theme="LIGHT"\] \.vhero-title-accent::after/.test(heroCss));
  check('conic sweep is masked so its seam cannot show',
    /\.vhero-rays \{[\s\S]{0,900}mask-image: radial-gradient/.test(heroCss));
  check('counters use tabular figures so the row cannot jitter',
    /\.vhero-stat-value \{[\s\S]{0,300}font-variant-numeric: tabular-nums/.test(heroCss));

  // The entrance animation uses `both`; cancelling it without restoring
  // opacity would leave every banner in the app invisible.
  const rm = heroCss.slice(heroCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  check('reduced motion restores opacity, not just cancels animation',
    /\.vhero,\s*\.vhero-title-accent \{[\s\S]{0,120}opacity: 1/.test(rm));
  check('reduced motion stops the rays, orbs and pulse',
    rm.includes('.vhero-rays') && rm.includes('.vhero-orb') && rm.includes('.vhero-pulse'));
  check('reduced motion hides the sweeping shine copy',
    /\.vhero-title-accent::after \{\s*display: none;\s*\}/.test(rm));

  const pr = heroCss.slice(heroCss.indexOf('@media print'));
  check('print gives the gradient title solid ink',
    /\.vhero-title-accent \{[\s\S]{0,200}-webkit-text-fill-color: currentColor/.test(pr));
  check('print drops the aurora and the buttons',
    pr.includes('.vhero-aurora') && pr.includes('.vhero-actions'));
  check('print pins the banner visible', /\.vhero \{[\s\S]{0,140}opacity: 1/.test(pr));

  check('badge wraps on narrow screens',
    /@media \(max-width: 760px\)[\s\S]{0,400}\.vhero-badge \{[\s\S]{0,120}white-space: normal/.test(heroCss));
  check('counters reflow to two columns on small phones',
    /@media \(max-width: 420px\)[\s\S]{0,200}\.vhero-stats \{[\s\S]{0,120}grid-template-columns: 1fr 1fr/.test(heroCss));
}

// ===========================================================================
// Runtime. Everything above is static; this executes the builder.
// ===========================================================================
(async () => {
  console.log('\n=== Live render in jsdom ===');

  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

  if (!JSDOM) {
    console.log('  SKIP  jsdom not installed — static checks above still cover the wiring');
  } else {
    /** Load sanitizer.js + ui-utils.js into a real DOM and return UIUtils. */
    function loadUIUtils(reducedMotion = false) {
      const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
        { pretendToBeVisual: true });
      const win = dom.window;

      win.matchMedia = (q) => ({
        media: q,
        matches: reducedMotion && q.includes('prefers-reduced-motion'),
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}
      });

      const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        window: win,
        document: win.document,
        Node: win.Node,
        DOMParser: win.DOMParser,
        XMLSerializer: win.XMLSerializer,
        requestAnimationFrame: win.requestAnimationFrame.bind(win),
        setTimeout: win.setTimeout.bind(win),
        URL: win.URL,
        Math, Date, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      new vm.Script(read('js/sanitizer.js'), { filename: 'sanitizer.js' }).runInContext(sandbox);
      new vm.Script(read('js/ui-utils.js'), { filename: 'ui-utils.js' }).runInContext(sandbox);

      return { win, UIUtils: win.UIUtils, doc: win.document };
    }

    try {
      const { win, UIUtils, doc } = loadUIUtils();
      check('ui-utils.js loads and exports UIUtils', !!UIUtils);

      // ---- _heroStatNumber: the parsing that lets formatted values animate
      const cases = [
        [42, 42], ['42', 42], ['1,240', 1240], ['75%', 75], ['~1.5h', 1.5],
        ['0', 0], ['∞', null], ['—', null], ['', null], [null, null],
        ['9 themes', 9]
      ];
      for (const [input, expected] of cases) {
        const got = UIUtils._heroStatNumber(input);
        check(`_heroStatNumber(${JSON.stringify(input)}) -> ${expected}`, got === expected, `got ${got}`);
      }

      // ---- structure
      const root = doc.getElementById('root');
      root.innerHTML = UIUtils.buildViewHero({
        accent: 'emerald',
        icon: 'sparkles',
        eyebrow: 'AI Quiz Forge',
        title: 'Turn any material',
        titleAccent: 'into an exam paper.',
        hindi: 'प्रश्न निर्माण',
        tagline: 'Upload a PDF and get MCQs.',
        stats: [
          { value: '1,240', label: 'Questions' },
          { value: '75%', label: 'Accuracy' },
          { value: '∞', label: 'Ask freely' }
        ],
        actions: [{ label: 'Generate', icon: 'zap', onclick: 'createQuizView.generateQuiz()' }],
        chipsLabel: 'Three ways to start',
        chips: [{ icon: 'file-text', label: 'PDF chapter', hint: 'Extracted page by page' }]
      });

      const $ = (s) => root.querySelector(s);
      const $$ = (s) => [...root.querySelectorAll(s)];

      check('renders a single <header class="vhero">', $$('header.vhero').length === 1);
      check('accent class is applied', $('.vhero').classList.contains('vhero-accent-emerald'));
      check('exactly one h1', $$('h1').length === 1 && $('h1').classList.contains('vhero-title'));
      check('title has both lines',
        !!$('.vhero-title-line') && !!$('.vhero-title-accent'));
      check('accent line carries data-text for the shine layer',
        $('.vhero-title-accent').getAttribute('data-text') === $('.vhero-title-accent').textContent.trim());
      check('Devanagari line is language-tagged', $('.vhero-hindi').getAttribute('lang') === 'hi');
      check('decoration is aria-hidden',
        $('.vhero-aurora').getAttribute('aria-hidden') === 'true' &&
        $('.vhero-grid-overlay').getAttribute('aria-hidden') === 'true' &&
        $('.vhero-pulse').getAttribute('aria-hidden') === 'true');
      check('stats expose list semantics',
        $('.vhero-stats').getAttribute('role') === 'list' &&
        $$('.vhero-stat').every(s => s.getAttribute('role') === 'listitem'));
      check('three counters render', $$('.vhero-stat').length === 3);
      check('action button and chip render',
        $$('.vhero-btn').length === 1 && $$('.vhero-chip').length === 1);
      check('chip hint becomes a tooltip',
        $('.vhero-chip').getAttribute('title') === 'Extracted page by page');

      // Formatted values must survive into the DOM verbatim.
      const values = $$('.vhero-stat-value').map(e => e.textContent);
      check('formatted values are preserved verbatim',
        values[0] === '1,240' && values[1] === '75%' && values[2] === '∞', values.join(' | '));
      check('numeric values get a count target',
        $$('.vhero-stat-value')[0].getAttribute('data-hero-count') === '1240' &&
        $$('.vhero-stat-value')[1].getAttribute('data-hero-count') === '75');
      check('non-numeric values get no count target',
        $$('.vhero-stat-value')[2].getAttribute('data-hero-count') === null,
        'there is nothing to count up to');

      // ---- optional sections really are optional
      root.innerHTML = UIUtils.buildViewHero({ eyebrow: 'Bare', title: 'Minimal' });
      check('minimal config renders without stats, actions or chips',
        !!$('.vhero-title-line') && !$('.vhero-stats') && !$('.vhero-actions') &&
        !$('.vhero-chips') && !$('.vhero-hindi') && !$('.vhero-tagline'));
      check('minimal config still renders the badge and title',
        $('.vhero-badge').textContent.includes('Bare') &&
        $('.vhero-title-line').textContent.trim() === 'Minimal');
      check('an omitted accent falls back to a real token',
        $('.vhero').classList.contains('vhero-accent-indigo'));

      // ---- hostile input
      const payload = '"><img src=x onerror=alert(1)>';
      root.innerHTML = UIUtils.buildViewHero({
        accent: 'javascript:alert(1)',
        icon: '"><script>bad()</script>',
        eyebrow: payload,
        title: payload,
        titleAccent: payload,
        hindi: payload,
        tagline: payload,
        stats: [{ value: payload, label: payload }],
        actions: [{ label: payload, icon: payload, onclick: payload }],
        chipsLabel: payload,
        chips: [{ icon: payload, label: payload, hint: payload }]
      });

      check('payload cannot inject an element',
        $$('img').length === 0 && $$('script').length === 0,
        `${$$('img').length} img, ${$$('script').length} script`);
      check('payload survives as visible text',
        $('.vhero-title-line').textContent.includes('<img src=x'));
      check('a bogus accent cannot reach the class attribute',
        !$('.vhero').className.includes('javascript') &&
        $('.vhero').classList.contains('vhero-accent-indigo'),
        $('.vhero').className);
      check('a bogus icon name is replaced, not escaped into the attribute',
        $$('[data-lucide]').every(el => /^[a-z0-9-]+$/.test(el.getAttribute('data-lucide'))),
        $$('[data-lucide]').map(e => e.getAttribute('data-lucide')).join(' | '));
      // getAttribute() returns the DECODED value, so it always looks unescaped.
      // What matters is the serialised source: the quote must be an entity, or
      // the payload would have closed the attribute and become real markup.
      const btnSource = $('.vhero-btn').outerHTML;
      check('the onclick payload is entity-escaped in the source',
        /onclick="[^"]*&quot;/.test(btnSource) && !/onclick="[^"]*"[^>]*src=x/.test(btnSource),
        btnSource.slice(0, 160));
      check('escaping onclick prevented attribute break-out',
        $('.vhero-actions').querySelectorAll('img, script').length === 0);

      // ---- counter animation, run to completion
      const moving = loadUIUtils(false);
      const mRoot = moving.doc.getElementById('root');
      mRoot.innerHTML = moving.UIUtils.buildViewHero({
        eyebrow: 'Counters', title: 'Counting',
        stats: [
          { value: '1,240', label: 'Questions' },
          { value: '75%', label: 'Accuracy' },
          { value: '~1.5h', label: 'Reading' },
          { value: '0', label: 'Uploads' },
          { value: '∞', label: 'Freeform' }
        ]
      });

      const expected = ['1,240', '75%', '~1.5h', '0', '∞'];
      moving.UIUtils.animateHeroCounters(mRoot);

      const started = [...mRoot.querySelectorAll('.vhero-stat-value')].map(e => e.textContent);
      check('counters start from zero but keep their units',
        started[0] === '0' && started[1] === '0%' && started[2] === '~0.0h',
        started.join(' | '));
      check('a zero value is left alone', started[3] === '0');
      check('a non-numeric value is left alone', started[4] === '∞');

      await new Promise(res => setTimeout(res, 1400));

      const settled = [...mRoot.querySelectorAll('.vhero-stat-value')].map(e => e.textContent);
      check('every counter settles on the caller\'s exact formatting',
        JSON.stringify(settled) === JSON.stringify(expected),
        `${settled.join(' | ')} != ${expected.join(' | ')}`);

      // Idempotence: refreshIcons() is debounced but can still fire twice.
      moving.UIUtils.animateHeroCounters(mRoot);
      moving.UIUtils.animateHeroCounters(mRoot);
      const afterReruns = [...mRoot.querySelectorAll('.vhero-stat-value')].map(e => e.textContent);
      check('re-running the animator cannot restart settled counters',
        JSON.stringify(afterReruns) === JSON.stringify(expected),
        afterReruns.join(' | '));

      // ---- reduced motion leaves the real numbers in place
      const still = loadUIUtils(true);
      const sRoot = still.doc.getElementById('root');
      sRoot.innerHTML = still.UIUtils.buildViewHero({
        eyebrow: 'Still', title: 'Static',
        stats: [{ value: '1,240', label: 'Questions' }]
      });
      still.UIUtils.animateHeroCounters(sRoot);
      check('reduced motion shows the final value immediately',
        sRoot.querySelector('.vhero-stat-value').textContent === '1,240',
        sRoot.querySelector('.vhero-stat-value').textContent);

      // ---- a missing root must not throw
      let threw = false;
      try { still.UIUtils.animateHeroCounters(null); } catch { threw = true; }
      check('animateHeroCounters(null) is safe', !threw);

      if (win) win.close();
    } catch (err) {
      check('runtime section completes', false, err && err.stack ? err.stack.split('\n')[0] : String(err));
      console.log(err && err.stack ? err.stack.split('\n').slice(0, 6).join('\n        ') : '');
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
