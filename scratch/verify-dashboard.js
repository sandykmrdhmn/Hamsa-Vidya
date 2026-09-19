/**
 * Verify the Dashboard command-centre redesign.
 *
 * The dashboard is the first screen every student sees and it is pure
 * string-built HTML, so the failure mode is silent: a renamed class or a
 * stylesheet that never got linked produces an unstyled page with no console
 * error at all. These checks close that gap by asserting the three sides stay
 * in agreement:
 *
 *   js/views/dashboard.js   the markup and the numbers it asks for
 *   css/dashboard.css       a rule for every class that markup emits
 *   js/db.js                a field for every number the markup reads
 *
 * Plus the wiring that is easy to forget: the <link>, the service-worker
 * precache entry, and the singleton that makes onLeaveView() reachable.
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
const dashJs = read('js/views/dashboard.js');
const dashCss = read('css/dashboard.css');
const appJs = read('js/app.js');
const dbJs = read('js/db.js');
const sw = read('sw.js');

/** Stylesheet hrefs in the order the document links them. */
const linked = (() => {
  const out = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
})();

// ===========================================================================
console.log('\n=== Stylesheet wiring ===');
// ===========================================================================
{
  check('css/dashboard.css is linked', linked.includes('css/dashboard.css'));

  // The cascade matters: dashboard.css must win over the legacy dashboard
  // rules in components/, and must not outrank the a11y focus styles.
  const iDash = linked.indexOf('css/dashboard.css');
  const iComponents = linked.indexOf('css/components/10-tools.css');
  const iA11y = linked.indexOf('css/a11y.css');
  const iResponsive = linked.indexOf('css/responsive.css');

  check('linked after the components/ parts', iDash > iComponents, `${iDash} vs ${iComponents}`);
  check('linked before responsive.css', iDash < iResponsive, `${iDash} vs ${iResponsive}`);
  check('linked before a11y.css so focus rings still win', iDash < iA11y, `${iDash} vs ${iA11y}`);

  // It must NOT live inside css/components/ — verify-css-split.js asserts that
  // directory concatenates byte-for-byte back to the original components.css.
  check('not placed inside css/components/',
    !fs.existsSync(path.join(ROOT, 'css/components/11-dashboard.css')) &&
    !linked.some(h => /^css\/components\/.*dashboard/.test(h) && h !== 'css/components/02-dashboard.css'));

  check('precached by the service worker', /'css\/dashboard\.css'/.test(sw));
  check('service worker cache version was bumped past v1',
    /const CACHE_VERSION = '(?!v1')/.test(sw), 'stale clients would keep the old shell');
}

// ===========================================================================
console.log('\n=== Every class the markup emits has a rule ===');
// ===========================================================================
{
  // Classes rendered by dashboard.js but deliberately styled elsewhere.
  const EXTERNAL = new Set([
    // shloka banner + AI advisor + charts + quiz list live in components/
    'dashboard-top-shloka-banner', 'shloka-sanskrit-live-text',
    'ai-advisor-section', 'ai-advisor-card', 'ai-advisor-header-bar',
    'ai-advisor-title-wrap', 'ai-advisor-avatar-icon', 'ai-avatar-ping',
    'ai-advisor-title-group', 'ai-advisor-title-row', 'ai-advisor-main-title',
    'ai-badge-chip', 'ai-advisor-subtext', 'ai-advisor-header-actions',
    'ai-advisor-content-box',
    'charts-grid', 'chart-card', 'chart-header', 'chart-title', 'chart-container',
    'quiz-cards-list', 'quiz-list-item', 'quiz-info', 'quiz-item-title',
    'quiz-meta-row', 'quiz-item-actions', 'icon-btn',
    // button + badge systems
    'btn', 'btn-primary', 'btn-secondary', 'btn-outline', 'btn-sm',
    'badge', 'badge-muted', 'badge-primary', 'badge-success', 'badge-warning'
  ]);

  // Collect class names out of every class="..." attribute in the view.
  const used = new Set();
  const re = /class="([^"]*)"/g;
  let m;
  while ((m = re.exec(dashJs)) !== null) {
    m[1].split(/\s+/).forEach(tok => {
      // A class attribute here can contain template interpolation, so the split
      // also yields fragments of the surrounding ternary (`?`, `:`, `'up'`, ...).
      // Keep only tokens that are valid CSS identifiers.
      if (!/^[a-zA-Z][\w-]*$/.test(tok)) return;
      used.add(tok);
    });
  }

  // Classes emitted through interpolation (tone / accent / level variants).
  // These are enumerated explicitly because the regex above cannot see them.
  [
    'dash-focus-urgent', 'dash-focus-start', 'dash-focus-improve', 'dash-focus-steady',
    'dash-lp-violet', 'dash-lp-emerald', 'dash-lp-amber',
    'dash-accent-violet', 'dash-accent-pink', 'dash-accent-indigo', 'dash-accent-cyan',
    'dash-accent-amber', 'dash-accent-emerald', 'dash-accent-orange', 'dash-accent-slate',
    'lvl-0', 'lvl-1', 'lvl-2', 'lvl-3', 'lvl-4',
    'is-primary', 'is-visible'
  ].forEach(c => used.add(c));

  check('markup emits a meaningful number of classes', used.size > 50, `found ${used.size}`);

  // Search every linked stylesheet, not just dashboard.css — a class may
  // legitimately be styled by an older file.
  const allCss = linked
    .filter(h => h.startsWith('css/'))
    .map(h => read(h))
    .join('\n');

  const undefinedClasses = [...used].filter(c => {
    if (EXTERNAL.has(c)) return false;
    // Match `.name` only at a class-name boundary.
    return !new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(allCss);
  });

  check('no class is rendered without a matching CSS rule',
    undefinedClasses.length === 0,
    undefinedClasses.join(', '));

  // The reverse direction: a .dash-* rule with no markup behind it is dead
  // weight that will drift out of sync.
  // Comments are stripped first — the file documents class groups as `.dash-*`,
  // which would otherwise be read as a selector named `dash-`.
  const cssRules = dashCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = new Set();
  const declRe = /\.(dash[\w-]*|dcs-item|dg-orb[\w-]*|dm-orb[\w-]*|dm-rays|live-dot|reveal|lvl-\d)(?![\w-])/g;
  while ((m = declRe.exec(cssRules)) !== null) declared.add(m[1]);

  const orphans = [...declared].filter(c => !used.has(c));
  check('no orphan .dash-* rules', orphans.length === 0, orphans.join(', '));
}

// ===========================================================================
console.log('\n=== Brand masthead ===');
// ===========================================================================
{
  // Order inside the rendered template — the masthead has to be the first
  // thing in the document, above the verse and the command centre.
  const order = ['_buildBrandMasthead()', '_buildShlokaBanner()', '_buildCommandCentre('];
  const positions = order.map(t => dashJs.indexOf(`\${this.${t}`));
  check('masthead, then shloka, then command centre',
    positions.every(p => p !== -1) && positions[0] < positions[1] && positions[1] < positions[2],
    positions.join(' < '));

  check('site name renders in English', /HAMSA VIDYA/.test(dashJs));
  check('site name renders in Devanagari', /हंस विद्या/.test(dashJs));
  check('Devanagari line is language-tagged', /class="dash-mast-hi" lang="hi"/.test(dashJs));

  // The shine layer is a second copy drawn from data-text; if it drifts from
  // the visible text the sweep would reveal different glyphs.
  const pairs = [...dashJs.matchAll(/data-text="([^"]+)">([^<]+)</g)];
  check('every data-text matches its visible text',
    pairs.length === 2 && pairs.every(m => m[1] === m[2]),
    pairs.map(m => `${m[1]} / ${m[2]}`).join(' | '));

  // Critical: the masthead must not use the scroll-reveal class, which starts
  // at opacity 0. It is above the fold and must never wait on an observer.
  const mastBlock = dashJs.slice(dashJs.indexOf('<header class="dash-masthead"'),
                                 dashJs.indexOf('</header>'));
  check('masthead does not depend on the reveal observer',
    !/class="dash-masthead[^"]*reveal/.test(dashJs), 'opacity would start at 0');

  check('masthead decoration is aria-hidden',
    /dash-mast-aurora" aria-hidden="true"/.test(mastBlock) &&
    /dash-mast-rule" aria-hidden="true"/.test(mastBlock));

  // Document outline: the product name is the h1, so the greeting cannot be.
  const h1s = dashJs.match(/<h1\b/g) || [];
  check('exactly one h1 on the page', h1s.length === 1, `found ${h1s.length}`);
  check('the h1 is the product name', /<h1 class="dash-mast-title"/.test(dashJs));
  check('greeting is no longer an h1', /<p class="dash-greet-name">/.test(dashJs));

  // ---- size hierarchy: wordmark > greeting > section titles > shloka body
  /**
   * Upper bound of the `font-size: clamp(...)` for a selector.
   *
   * A selector can head more than one rule — `.dash-mast-hi` appears both in
   * the shared `.dash-mast-en, .dash-mast-hi` block and in its own — so every
   * matching block is scanned and the first that actually declares a size wins.
   */
  const maxClamp = (css, selector) => {
    const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'gm');
    let m0;
    while ((m0 = re.exec(css)) !== null) {
      const block = css.slice(m0.index, css.indexOf('}', m0.index));
      const m = block.match(/font-size:\s*clamp\([^,]+,[^,]+,\s*([\d.]+)rem\s*\)/);
      if (m) return parseFloat(m[1]);
    }
    return null;
  };

  const enSize = maxClamp(dashCss, '.dash-mast-en');
  const hiSize = maxClamp(dashCss, '.dash-mast-hi');
  const greetSize = maxClamp(dashCss, '.dash-greet-name');
  const shlokaSize = maxClamp(dashCss, '.dash-shloka .shloka-sanskrit-live-text');
  const sectionSize = maxClamp(dashCss, '.dash-section-title');

  check('wordmark is the largest text on the page',
    enSize && greetSize && sectionSize && enSize > greetSize && enSize > sectionSize,
    `en=${enSize} greet=${greetSize} section=${sectionSize}`);
  check('Devanagari line is sized below the Latin wordmark',
    hiSize && enSize && hiSize < enSize, `hi=${hiSize} en=${enSize}`);
  check('shloka sits between the wordmark and the section titles',
    shlokaSize && shlokaSize < hiSize && shlokaSize > sectionSize,
    `shloka=${shlokaSize} hi=${hiSize} section=${sectionSize}`);

  // The original size in the frozen components/ file was 1.68rem.
  check('shloka is larger than the original 1.68rem', shlokaSize > 1.68, `now ${shlokaSize}`);
  check('shloka keeps a fluid lower bound so it does not overflow a phone',
    /\.dash-shloka \.shloka-sanskrit-live-text \{[\s\S]{0,200}clamp\(1\.28rem, 3\.6vw/.test(dashCss));

  // ---- motion
  check('wordmark colour flows', /animation:[\s\S]{0,120}dashNameFlow/.test(dashCss));
  check('wordmark has a light sweep', /@keyframes dashNameShine/.test(dashCss));
  check('shine is a separate ::after layer, not a second clip on the same box',
    /\.dash-mast-en::after,\s*\.dash-mast-hi::after \{[\s\S]{0,160}content: attr\(data-text\)/.test(dashCss));
  check('shloka gains a sweeping sheen', /@keyframes dashShlokaSheen/.test(dashCss));
  check('shloka motion is faster than the original 10s',
    /\.dash-shloka \.shloka-sanskrit-live-text \{[\s\S]{0,320}animation-duration: 7s/.test(dashCss));
  check('conic sweep is masked so its seam cannot show',
    /\.dm-rays \{[\s\S]{0,900}mask-image: radial-gradient/.test(dashCss));

  // ---- gradient text must never render invisible
  for (const sel of ['.dash-mast-en,\n.dash-mast-hi']) {
    check('bilingual wordmark has a solid colour fallback',
      new RegExp(`${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} \\{[\\s\\S]{0,420}color: var\\(--color-primary-light\\)`).test(dashCss));
  }

  // ---- reduced motion. Every masthead animation uses `both`, so its 0-opacity
  // `from` state would stick if the animation were merely cancelled.
  const rmBlock = dashCss.slice(dashCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  check('reduced motion restores masthead opacity, not just cancels animation',
    /\.dash-mast-en,[\s\S]{0,260}opacity: 1/.test(rmBlock),
    'animation-fill-mode:both would leave the name invisible');
  check('reduced motion stops the conic sweep and the orbs',
    rmBlock.includes('.dm-rays') && rmBlock.includes('.dm-orb'));
  check('reduced motion hides the sweeping shine copy',
    /\.dash-mast-en::after,[\s\S]{0,120}display: none/.test(rmBlock));
  check('reduced motion stops the shloka sheen and halo',
    rmBlock.includes('.dash-shloka-sheen') && rmBlock.includes('.dash-shloka::after'));

  // ---- print: clipped-gradient text prints blank
  const printBlock = dashCss.slice(dashCss.indexOf('@media print'));
  check('print gives every gradient headline solid ink',
    /\.dash-mast-en,\s*\.dash-mast-hi,\s*\.dash-shloka \.shloka-sanskrit-live-text \{[\s\S]{0,220}-webkit-text-fill-color: currentColor/.test(printBlock));
  check('print hides the masthead aurora', printBlock.includes('.dash-mast-aurora'));
  check('print pins the masthead visible', /\.dash-masthead,[\s\S]{0,200}opacity: 1/.test(printBlock));

  // ---- responsive
  check('orbs shrink below the phone breakpoint',
    /@media \(max-width: 760px\)[\s\S]{0,1600}\.dm-orb-1 \{/.test(dashCss));
  check('eyebrow is allowed to wrap on narrow screens',
    /\.dash-mast-eyebrow \{[\s\S]{0,140}white-space: normal/.test(dashCss));
}

// ===========================================================================
console.log('\n=== Data contract with db.js ===');
// ===========================================================================
{
  // Every stats field the dashboard reads must actually be returned by
  // getDashboardStats(), or the tile silently shows a wrong or blank number.
  const statsReturn = (() => {
    const i = dbJs.indexOf('async function getDashboardStats()');
    const body = dbJs.slice(i);
    const r = body.indexOf('\n  return {');
    return body.slice(r, body.indexOf('\n}', r));
  })();

  const REQUIRED = [
    'totalQuizzesTaken', 'questionsCompleted', 'overallAccuracy', 'bestScore',
    'savedBookmarksCount', 'dayStreak', 'totalNotesCount', 'totalFlashcardDecks',
    'totalCustomCards', 'totalCardReviews', 'dueCardsToday',
    // added for the redesigned secondary tiles
    'answerCount', 'teacherCount', 'savedExamCount'
  ];

  for (const field of REQUIRED) {
    check(`getDashboardStats() returns ${field}`,
      new RegExp(`(^|[\\s,{])${field}[,\\s:}]`).test(statsReturn));
  }

  check('new counts come from real tables, not constants',
    /db\.answers\.count\(\)/.test(dbJs) &&
    /db\.aiTeacherExplanations\.count\(\)/.test(dbJs) &&
    /db\.savedExams\.count\(\)/.test(dbJs));

  // Heatmap + momentum helpers.
  check('getActivityHeatmap() exists', /async function getActivityHeatmap\(/.test(dbJs));
  check('getStudyMomentum() exists', /async function getStudyMomentum\(/.test(dbJs));

  check('heatmap rejects unparseable timestamps instead of bucketing NaN',
    /isNaN\(d\.getTime\(\)\)\) return null/.test(dbJs));
  check('heatmap buckets by local date, not UTC',
    /localKey[\s\S]{0,400}getFullYear\(\)/.test(dbJs),
    'a late-evening IST session would be filed under tomorrow');

  check('heatmap aggregates all five activity sources',
    /db\.attempts\.toArray/.test(dbJs) && /db\.notes\.toArray/.test(dbJs) &&
    /db\.cardReviews\.toArray/.test(dbJs) && /db\.answers\.toArray/.test(dbJs) &&
    /db\.aiTeacherExplanations\.toArray/.test(dbJs));

  check('dashboard degrades when the new helpers are absent',
    /typeof getActivityHeatmap === 'function'/.test(dashJs) &&
    /typeof getStudyMomentum === 'function'/.test(dashJs));

  check('heatmap section is skipped rather than rendered empty',
    /heatmap \? this\._buildConsistencySection/.test(dashJs));
}

// ===========================================================================
console.log('\n=== Escaping ===');
// ===========================================================================
{
  // Anything sourced from the profile, the DB or the AI must be escaped.
  check('greeting name is escaped', /esc\(firstName\)/.test(dashJs));
  check('qualification is escaped', /esc\(profile\.qualification/.test(dashJs));
  check('sadhana title and badge are escaped',
    /esc\(sadhana\.badge\)/.test(dashJs) && /esc\(sadhana\.title\)/.test(dashJs));
  check('focus copy is escaped', /esc\(focus\.title\)/.test(dashJs) && /esc\(focus\.body\)/.test(dashJs));
  check('note titles are escaped', /esc\(n\.title \|\|/.test(dashJs));
  check('quiz titles and subjects are escaped',
    /esc\(q\.title\)/.test(dashJs) && /esc\(q\.subject\)/.test(dashJs));
  check('metric labels are escaped', /esc\(m\.label\)/.test(dashJs));

  // IDs interpolated into onclick handlers must be coerced to numbers.
  const onclickIds = dashJs.match(/onclick="app\.\w+\(\$\{[^}]+\}\)/g) || [];
  const unsafeIds = onclickIds.filter(s => !s.includes('Number('));
  check('quiz ids in onclick are coerced with Number()',
    unsafeIds.length === 0, unsafeIds.join(' | '));
}

// ===========================================================================
console.log('\n=== Motion is additive, never load-bearing ===');
// ===========================================================================
{
  check('final values are already in the DOM before counters run',
    /data-count="\$\{stats\.dayStreak\}">\$\{stats\.dayStreak\}/.test(dashJs),
    'counters must not be the only source of the number');

  check('counters honour prefers-reduced-motion',
    /_animateCounters\(\)[\s\S]{0,600}_prefersReducedMotion\(\)/.test(dashJs));
  check('rings honour prefers-reduced-motion',
    /_animateProgressRings\(\)[\s\S]{0,800}_prefersReducedMotion\(\)/.test(dashJs));
  check('scroll reveal falls back to visible',
    /_prefersReducedMotion\(\) \|\| !\('IntersectionObserver' in window\)[\s\S]{0,140}add\('is-visible'\)/.test(dashJs));

  check('matchMedia is optional-chained for old engines',
    /window\.matchMedia\?\./.test(dashJs));

  check('ring circumference is computed from the real radius',
    /getAttribute\('r'\)[\s\S]{0,120}2 \* Math\.PI \* r/.test(dashJs),
    'one CSS rule serves both the 52r hero ring and the 36r stat rings');

  check('reveal observer disconnects once everything is shown',
    /--pending <= 0\) obs\.disconnect\(\)/.test(dashJs));

  check('CSS disables decoration under reduced motion',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,900}animation: none/.test(dashCss));
  check('CSS resets .reveal under reduced motion',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}\.reveal[\s\S]{0,160}opacity: 1/.test(dashCss));
  check('gradient heading has a colour fallback',
    /\.dash-greet-name \{[\s\S]{0,420}color: var\(--text-main\)/.test(dashCss));
  check('decorative orbs are aria-hidden in the markup',
    /dash-hero-glow" aria-hidden="true"/.test(dashJs));
  check('padding heatmap cells are aria-hidden',
    /is-pad" aria-hidden="true"/.test(dashJs));
  check('heatmap exposes a text summary to screen readers',
    /role="img"[\s\S]{0,200}aria-label="Activity over the last 12 weeks/.test(dashJs));
  check('print stylesheet drops the interactive furniture',
    /@media print[\s\S]{0,400}dash-launchpad/.test(dashCss));
}

// ===========================================================================
console.log('\n=== View lifecycle ===');
// ===========================================================================
{
  check('dashboard is a singleton on window',
    /window\.dashboardView = new window\.DashboardView\(\)/.test(appJs),
    'a fresh instance per navigation makes onLeaveView() unreachable');

  check('render goes through the singleton',
    /window\.dashboardView && window\.dashboardView\.render\(\)/.test(appJs));

  check('no longer constructs a throwaway instance',
    !/new window\.DashboardView\(\)\.render\(\)/.test(appJs));

  check('navigate() releases the reveal observer on leave',
    /currentView === 'dashboard' && viewName !== 'dashboard' && window\.dashboardView[\s\S]{0,120}onLeaveView\(\)/.test(appJs));

  check('onLeaveView() actually disconnects', /_revealObserver\.disconnect\(\)/.test(dashJs));
  check('onLeaveView() clears the reference', /this\._revealObserver = null/.test(dashJs));

  // app.js already referenced window.dashboardView after a profile save; that
  // path was dead until the singleton existed.
  check('profile save can now refresh the dashboard',
    /currentView === 'dashboard' && window\.dashboardView[\s\S]{0,80}render\(\)/.test(appJs));
}

// ===========================================================================
console.log('\n=== Actions all resolve ===');
// ===========================================================================
{
  // Every app.* method invoked from the dashboard must exist on the class.
  const called = new Set();
  const re = /onclick="(?:app|window\.app)\.(\w+)\(/g;
  let m;
  while ((m = re.exec(dashJs)) !== null) called.add(m[1]);

  check('dashboard wires up several app actions', called.size >= 5, `found ${called.size}`);

  const missing = [...called].filter(fn =>
    !new RegExp(`(^|\\s)(async )?${fn}\\s*\\(`, 'm').test(appJs));
  check('every app.* handler exists', missing.length === 0, missing.join(', '));

  // Views the launchpad navigates to must be real routes.
  const routes = new Set();
  const rre = /app\.navigate\('([\w-]+)'/g;
  while ((m = rre.exec(dashJs)) !== null) routes.add(m[1]);

  const badRoutes = [...routes].filter(r => !html.includes(`id="view-${r}"`));
  check('every navigate() target is a real view section',
    badRoutes.length === 0, badRoutes.join(', '));

  // The library deep link passes a lowercase tab; library.js upper-cases it.
  const libraryJs = read('js/views/library.js');
  check('library bookmark deep link is case-safe',
    !/navigate\('library', \{ tab:/.test(dashJs) || /initialTab\.toUpperCase\(\)/.test(libraryJs));
}

// ===========================================================================
console.log('\n=== Hierarchy actually exists ===');
// ===========================================================================
{
  // The whole point of the redesign was to stop presenting everything at the
  // same visual weight. These assert the structure that creates hierarchy.
  check('hero is a two-column grid', /\.dash-hero-body \{[\s\S]{0,220}grid-template-columns/.test(dashCss));
  check('exactly one focus recommendation is chosen', /_resolveFocus\(stats\)/.test(dashJs));
  check('focus picks overdue revision first',
    /_resolveFocus\(stats\) \{\s*if \(stats\.dueCardsToday > 0\)/.test(dashJs));
  check('primary metrics are a 4-up grid',
    /\.dash-primary-grid \{[\s\S]{0,200}repeat\(4/.test(dashCss));
  check('secondary metrics are visually lighter than primary',
    /\.dash-mini-value \{[\s\S]{0,260}font-size: 1\.32rem/.test(dashCss) &&
    /\.dash-stat-value \{[\s\S]{0,260}clamp\(1\.45rem/.test(dashCss));
  check('launchpad groups actions by intent',
    /label: 'Learn'/.test(dashJs) && /label: 'Practise'/.test(dashJs) && /label: 'Track'/.test(dashJs));
  check('onboarding path replaces scattered empty states',
    /_buildOnboardingPath\(\)/.test(dashJs) && /isNewUser \?/.test(dashJs));
  check('heatmap intensity scales to the student\'s own maximum',
    /Math\.max\(1, heatmap\.maxCount\)/.test(dashJs));
  check('heatmap pads the first partial week so weekdays align',
    /cell\.weekday !== 0[\s\S]{0,220}current\.push\(null\)/.test(dashJs));
  check('delta pills are hidden when there is no prior period',
    /delta === null \|\| delta === undefined \|\| delta === 0\) return ''/.test(dashJs));
}

// ===========================================================================
console.log('\n=== Responsive + layout safety ===');
// ===========================================================================
{
  check('hero collapses to one column on narrow screens',
    /@media \(max-width: 1020px\)[\s\S]{0,140}dash-hero-body[\s\S]{0,80}1fr/.test(dashCss));
  check('launchpad reflows at two breakpoints',
    /@media \(max-width: 1100px\)[\s\S]{0,160}dash-launchpad/.test(dashCss) &&
    /@media \(max-width: 700px\)[\s\S]{0,160}dash-launchpad/.test(dashCss));
  check('heatmap scrolls rather than shrinking below legibility',
    /\.dash-heatmap-scroll \{[\s\S]{0,140}overflow-x: auto/.test(dashCss));
  check('long note titles cannot push buttons off the card',
    /\.dash-note-text strong \{[\s\S]{0,260}text-overflow: ellipsis/.test(dashCss));
  check('grid children can shrink (minmax(0,...) not 1fr alone)',
    (dashCss.match(/minmax\(0, 1fr\)/g) || []).length >= 4);
  check('touch devices see the launchpad arrow without hover',
    /@media \(hover: none\)[\s\S]{0,140}dash-lp-arrow/.test(dashCss));
}

// ===========================================================================
/**
 * Everything above is static analysis. This section actually executes
 * dashboard.js against a DOM with stubbed data layers, which is the only way
 * to catch a runtime throw, a wrong property name or a heatmap that builds a
 * malformed grid. The view is string-built, so a single exception would leave
 * the student staring at a blank page.
 *
 * Wrapped in an async IIFE because render() is async and this is a CommonJS
 * script, so there is no top-level await.
 */
// ===========================================================================
(async () => {
  console.log('\n=== Live render in jsdom ===');

  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

  if (!JSDOM) {
    console.log('  SKIP  jsdom not installed — static checks above still cover the wiring');
  } else {
    const vm = require('vm');

    /**
     * Build a sandbox, render the dashboard, return the resulting document.
     *
     * `reducedMotion` defaults to true so assertions can read final values
     * straight out of the DOM. The counter animation is exercised separately
     * below, where the point is that it converges on the same numbers.
     */
    async function renderDashboard(overrides = {}) {
      const dom = new JSDOM(
        '<!doctype html><html><body><section id="view-dashboard"></section></body></html>',
        { pretendToBeVisual: true }
      );
      const win = dom.window;

      // jsdom's matchMedia always reports matches:false, so the flag has to be
      // stubbed to reach the reduced-motion branches.
      const reduced = overrides.reducedMotion !== false;
      win.matchMedia = (q) => ({
        media: q,
        matches: reduced && q.includes('prefers-reduced-motion'),
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}
      });

      const stats = Object.assign({
        totalQuizzesTaken: 12, questionsCompleted: 240, correctAnswers: 180,
        overallAccuracy: 75, averageScore: 71, bestScore: 92,
        savedInLibrary: 12, savedBookmarksCount: 31, dayStreak: 9,
        totalNotesCount: 6, totalFlashcardDecks: 3, totalCustomCards: 84,
        totalCardReviews: 310, dueCardsToday: 7,
        answerCount: 4, teacherCount: 15, savedExamCount: 2
      }, overrides.stats || {});

      // 84 contiguous days, with the first day deliberately mid-week so the
      // padding branch in the grid builder is exercised.
      const cells = [];
      const start = new Date(2026, 5, 3); // a Wednesday
      for (let i = 0; i < 84; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        cells.push({
          key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
          label: d.toDateString(),
          weekday: d.getDay(),
          count: i % 7 === 0 ? 0 : (i % 11)
        });
      }
      const heatmap = overrides.heatmap !== undefined ? overrides.heatmap : {
        cells,
        totalActive: cells.filter(c => c.count > 0).length,
        maxCount: 10,
        total: cells.reduce((a, c) => a + c.count, 0)
      };

      const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        window: win,
        document: win.document,
        Node: win.Node,
        DOMParser: win.DOMParser,
        XMLSerializer: win.XMLSerializer,
        requestAnimationFrame: win.requestAnimationFrame.bind(win),
        setTimeout: win.setTimeout.bind(win),
        Promise,
        Math, Date, JSON, Number, String, Array, Object, parseFloat, parseInt, isNaN,

        // ---- data layer stubs
        getDashboardStats: async () => stats,
        getAnalyticsData: async () => ({ donut: {}, trend: [], subjects: [] }),
        getAllQuizzes: async () => overrides.quizzes !== undefined ? overrides.quizzes : [
          { id: 1, title: 'Polity — Fundamental Rights', subject: 'Indian Polity',
            difficulty: 'Hard', quizMode: 'Exam', totalQuestions: 20,
            createdAt: '2026-09-01T10:00:00Z', completedAt: '2026-09-01T10:40:00Z', percentage: 85 },
          { id: 2, title: '<img src=x onerror=alert(1)>', subject: 'Modern History',
            difficulty: 'Medium', quizMode: 'Practice', totalQuestions: 15,
            createdAt: '2026-09-05T10:00:00Z', completedAt: null }
        ],
        getAllNotes: async () => overrides.notes !== undefined ? overrides.notes : [
          { id: 9, title: 'Fiscal policy', subject: 'Economy', updatedAt: '2026-09-10T08:00:00Z' }
        ],
        getActivityHeatmap: async () => heatmap,
        getStudyMomentum: async () => overrides.momentum !== undefined ? overrides.momentum : {
          attemptsThisWeek: 5, attemptsLastWeek: 3,
          accuracyThisWeek: 78, accuracyLastWeek: 71,
          accuracyDelta: 7, attemptsDelta: 2, minutesThisWeek: 96
        }
      };

      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);

      // Real sanitizer + helpers, so escaping is genuinely exercised.
      new vm.Script(read('js/sanitizer.js'), { filename: 'sanitizer.js' }).runInContext(sandbox);
      sandbox.SecurityUtils = win.SecurityUtils;
      sandbox.UIUtils = { formatDate: (d) => new Date(d).toDateString() };

      // Collaborators the dashboard only calls, never inspects.
      const chartCalls = [];
      sandbox.HamsaCharts = {
        renderDonutChart: (id) => chartCalls.push(id),
        renderTrendLineChart: (id) => chartCalls.push(id),
        renderSubjectMasteryChart: (id) => chartCalls.push(id)
      };
      win.examProfileManager = overrides.profile === null ? null : {
        loadProfile: () => ({ qualification: overrides.profile || 'B.A. Political Science' }),
        getProfile: () => ({ qualification: 'B.A. Political Science' }),
        getStudentFirstName: () => overrides.firstName || 'Arjun'
      };
      win.gurukulWisdomEngine = {
        getSadhanaLevel: () => ({ title: 'साधक', badge: '🪔 अभ्यासी', enTitle: 'Practitioner', level: 3 })
      };
      let iconsRefreshed = false;
      win.app = { refreshIcons: () => { iconsRefreshed = true; } };
      win.aiAdvisorEngine = { generateLiveAdvice: async () => {} };

      new vm.Script(read('js/views/dashboard.js'), { filename: 'dashboard.js' }).runInContext(sandbox);

      const view = new win.DashboardView();
      await view.render();

      return { win, doc: win.document, view, chartCalls, iconsRefreshed: () => iconsRefreshed, stats, heatmap };
    }

    try {
      const r = await renderDashboard();
      const doc = r.doc;
      const $ = (sel) => doc.querySelector(sel);
      const $$ = (sel) => [...doc.querySelectorAll(sel)];

      check('render() completes without throwing', true);
      check('root .dash element exists', !!$('.dash'));

      // ---- masthead, in the real DOM
      const dashKids = [...$('.dash').children];
      check('masthead is the very first element on the dashboard',
        dashKids[0] && dashKids[0].classList.contains('dash-masthead'),
        dashKids[0] ? dashKids[0].className : 'no children');
      check('the verse comes immediately after it',
        dashKids[1] && dashKids[1].classList.contains('dash-shloka'),
        dashKids[1] ? dashKids[1].className : '');
      check('the command centre comes after the verse',
        dashKids[2] && dashKids[2].classList.contains('dash-hero'),
        dashKids[2] ? dashKids[2].className : '');

      check('masthead is not hidden behind the reveal observer',
        !$('.dash-masthead').classList.contains('reveal'));
      check('h1 carries both scripts of the name',
        $('h1').textContent.includes('HAMSA VIDYA') && $('h1').textContent.includes('हंस विद्या'),
        $('h1').textContent.replace(/\s+/g, ' ').trim());
      check('only one h1 is emitted at runtime', $$('h1').length === 1, `${$$('h1').length}`);
      check('shine layers get their text from data-text',
        $('.dash-mast-en').getAttribute('data-text') === $('.dash-mast-en').textContent.trim() &&
        $('.dash-mast-hi').getAttribute('data-text') === $('.dash-mast-hi').textContent.trim());
      check('three aurora orbs plus the conic sweep render',
        $$('.dash-mast-aurora .dm-orb').length === 3 && !!$('.dash-mast-aurora .dm-rays'));
      check('verse keeps its original class so theme gradients still apply',
        $('.dash-shloka').classList.contains('dashboard-top-shloka-banner'));
      check('verse sheen element is present', !!$('.dash-shloka .dash-shloka-sheen'));
      check('verse text is unchanged',
        $('.shloka-sanskrit-live-text').textContent.includes('कर्मण्येवाधिकारस्ते'));

      // ---- hierarchy
      check('exactly one hero renders', $$('.dash-hero').length === 1);
      check('exactly one focus card renders', $$('.dash-focus').length === 1);
      check('focus card carries a tone class',
        /dash-focus-(urgent|start|improve|steady)/.test($('.dash-focus').className),
        $('.dash-focus').className);
      check('7 due cards makes revision the focus',
        $('.dash-focus').className.includes('dash-focus-urgent') &&
        $('.dash-focus-title').textContent.includes('7 card'),
        $('.dash-focus-title').textContent.trim());

      check('4 primary metrics render', $$('.dash-primary-grid .dash-stat').length === 4);
      check('8 secondary tiles render', $$('.dash-secondary-grid .dash-mini').length === 8);
      check('9 launchpad actions in 3 groups',
        $$('.dash-lp-group').length === 3 && $$('.dash-lp-card').length === 9);
      check('all three charts are handed a container',
        r.chartCalls.length === 3 && r.chartCalls.every(id => !!doc.getElementById(id)),
        r.chartCalls.join(','));
      check('icon refresh is requested after render', r.iconsRefreshed());

      // ---- the numbers on screen are the numbers from the data layer
      const miniText = $$('.dash-mini').map(b => b.textContent.replace(/\s+/g, ' ').trim());
      check('written-answer count is displayed',
        miniText.some(t => t.startsWith('4') && t.includes('Written answers')), miniText.join(' | '));
      check('AI-lesson count is displayed',
        miniText.some(t => t.startsWith('15') && t.includes('AI lessons')));
      check('saved-exam count is displayed',
        miniText.some(t => t.startsWith('2') && t.includes('Saved exams')));
      check('accuracy tile shows 75%',
        $$('.dash-stat-value').some(el => el.textContent.trim() === '75%'),
        $$('.dash-stat-value').map(e => e.textContent.trim()).join(','));
      check('streak ring shows 9', $('.dash-ring-value').textContent.trim() === '9');

      // ---- rings
      const rings = $$('.dash-ring-fill');
      check('every ring has a percentage', rings.length === 5 &&
        rings.every(c => c.getAttribute('data-ring-pct') !== null), `found ${rings.length}`);
      check('ring percentages are clamped to 0-100',
        rings.every(c => {
          const v = Number(c.getAttribute('data-ring-pct'));
          return v >= 0 && v <= 100;
        }), rings.map(c => c.getAttribute('data-ring-pct')).join(','));
      check('rings get a dasharray from the real radius',
        rings.every(c => {
          const expected = 2 * Math.PI * Number(c.getAttribute('r'));
          return Math.abs(parseFloat(c.style.strokeDasharray) - expected) < 0.5;
        }), rings.map(c => `r=${c.getAttribute('r')} dash=${c.style.strokeDasharray}`).join(' '));

      // ---- heatmap grid integrity
      const weeks = $$('.dash-hm-week');
      check('heatmap renders one column per week', weeks.length === 13, `found ${weeks.length}`);
      check('every heatmap column has exactly 7 rows',
        weeks.every(w => w.children.length === 7),
        weeks.map(w => w.children.length).join(','));
      check('84 real day cells render (padding excluded)',
        $$('.dash-hm-cell:not(.is-pad)').length - 5 === 84,
        `real=${$$('.dash-hm-cell:not(.is-pad)').length} (5 are legend swatches)`);
      // The series starts on a Wednesday, so the first column needs Sun/Mon/Tue
      // padded out; otherwise every square would sit one row off its weekday.
      const firstCol = [...weeks[0].children];
      check('leading partial week is padded so weekdays line up',
        firstCol.slice(0, 3).every(c => c.classList.contains('is-pad')) &&
        !firstCol[3].classList.contains('is-pad'),
        firstCol.map(c => c.className).join(' | '));

      // 3 leading + 84 days = 87, so the trailing column needs 4 pads to stay
      // a full 7-row column.
      check('trailing partial week is padded too',
        [...weeks[weeks.length - 1].children].filter(c => c.classList.contains('is-pad')).length === 4,
        `${[...weeks[weeks.length - 1].children].filter(c => c.classList.contains('is-pad')).length} pads`);
      check('every day cell has an intensity level',
        $$('.dash-hm-weeks .dash-hm-cell:not(.is-pad)').every(c => /lvl-[0-4]/.test(c.className)));
      check('zero-activity days are level 0',
        $$('.dash-hm-weeks .dash-hm-cell.lvl-0').length > 0);
      check('busiest days reach level 4',
        $$('.dash-hm-weeks .dash-hm-cell.lvl-4').length > 0);
      check('every day cell has a tooltip', 
        $$('.dash-hm-weeks .dash-hm-cell:not(.is-pad)').every(c => !!c.getAttribute('title')));

      // ---- deltas
      check('positive attempts delta renders as up',
        $$('.dash-delta.up').length >= 1);
      check('delta text carries the value',
        $$('.dash-delta').some(d => d.textContent.includes('2')));

      // ---- escaping, against a real payload in the data
      check('quiz title payload is escaped, not parsed',
        $$('img').length === 0 && doc.body.innerHTML.includes('&lt;img src=x'),
        `${$$('img').length} img elements leaked into the DOM`);

      // ---- reveal fallback (jsdom has no IntersectionObserver)
      check('sections fall back to visible without IntersectionObserver',
        $$('.reveal').length > 0 && $$('.reveal').every(s => s.classList.contains('is-visible')),
        `${$$('.reveal.is-visible').length}/${$$('.reveal').length} visible`);

      // ---- lifecycle
      r.view.onLeaveView();
      check('onLeaveView() is safe with no observer attached', true);

      // =====================================================================
      // Motion enabled: the counters must land on exactly the same numbers.
      // A count-up that overshoots, rounds badly or never finishes would show
      // the student a wrong figure, which is worse than no animation at all.
      // =====================================================================
      const moving = await renderDashboard({ reducedMotion: false });
      const mAll = (sel) => [...moving.doc.querySelectorAll(sel)];

      check('counters start from zero when motion is allowed',
        mAll('[data-count]').filter(el => Number(el.getAttribute('data-count')) > 0)
          .every(el => /^0/.test(el.textContent.trim())),
        mAll('[data-count]').map(e => e.textContent.trim()).slice(0, 6).join(','));

      // 900ms duration + up to 400ms stagger.
      await new Promise(res => setTimeout(res, 1500));

      const drifted = mAll('[data-count]').filter(el => {
        const target = el.getAttribute('data-count');
        const suffix = el.getAttribute('data-suffix') || '';
        return el.textContent.trim() !== `${target}${suffix}`;
      });
      check('every counter settles on its exact data-count value',
        drifted.length === 0,
        drifted.map(e => `${e.textContent.trim()} != ${e.getAttribute('data-count')}`).join(', '));

      check('rings animate to their target offset',
        mAll('.dash-ring-fill').every(c => {
          const pct = Number(c.getAttribute('data-ring-pct'));
          const circ = 2 * Math.PI * Number(c.getAttribute('r'));
          return Math.abs(parseFloat(c.style.strokeDashoffset) - circ * (1 - pct / 100)) < 0.5;
        }),
        mAll('.dash-ring-fill').map(c => c.style.strokeDashoffset).join(','));

      check('counter animation never mangles sibling markup',
        mAll('.dash-delta').length === $$('.dash-delta').length,
        'delta pills live next to counters and must survive textContent writes');

      // =====================================================================
      // First-run user: the onboarding path replaces the scattered empties.
      // =====================================================================
      const fresh = await renderDashboard({
        stats: {
          totalQuizzesTaken: 0, questionsCompleted: 0, correctAnswers: 0,
          overallAccuracy: 0, averageScore: 0, bestScore: 0, savedInLibrary: 0,
          savedBookmarksCount: 0, dayStreak: 1, totalNotesCount: 0,
          totalFlashcardDecks: 0, totalCustomCards: 0, totalCardReviews: 0,
          dueCardsToday: 0, answerCount: 0, teacherCount: 0, savedExamCount: 0
        },
        quizzes: [],
        notes: [],
        momentum: { attemptsThisWeek: 0, attemptsLastWeek: 0, accuracyThisWeek: 0,
                    accuracyLastWeek: 0, accuracyDelta: null, attemptsDelta: null,
                    minutesThisWeek: 0 },
        profile: null
      });
      const f = (sel) => fresh.doc.querySelector(sel);
      const fAll = (sel) => [...fresh.doc.querySelectorAll(sel)];

      check('new user gets the onboarding path', !!f('.dash-onboard'));
      check('onboarding path has 4 ordered steps', fAll('.dash-step').length === 4);
      check('new user focus is "create your first quiz"',
        f('.dash-focus').className.includes('dash-focus-start'));
      check('missing profile shows the completion nudge',
        !!f('.dash-id-chip-action'));
      check('no delta pills without a prior week', fAll('.dash-delta').length === 0);
      check('empty note vault shows one empty state, not a broken list',
        fAll('.dash-empty').length === 2 && !f('.dash-note-list'),
        `${fAll('.dash-empty').length} empty states`);
      check('nothing due shows the all-clear, not a CTA',
        !!f('.dash-allclear') && !f('.dash-due-cta'));
      check('returning user with dues shows the CTA instead',
        !!$('.dash-due-cta') && !$('.dash-allclear'));
      check('zero-value tiles still render a 0, not a blank',
        fAll('.dash-mini-value').every(el => el.textContent.trim() === '0'),
        fAll('.dash-mini-value').map(e => e.textContent.trim()).join(','));

      // =====================================================================
      // Missing heatmap helper: the section must be skipped, not half-drawn.
      // =====================================================================
      const noHeat = await renderDashboard({ heatmap: null });
      check('absent heatmap data skips the consistency section',
        !noHeat.doc.querySelector('.dash-consistency') && !!noHeat.doc.querySelector('.dash-metrics'));

    } catch (err) {
      check('render() completes without throwing', false, err && err.stack ? err.stack.split('\n')[0] : String(err));
      console.log(err && err.stack ? err.stack.split('\n').slice(0, 6).join('\n        ') : '');
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
