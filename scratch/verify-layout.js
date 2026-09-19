/**
 * Verify the shared page-width system.
 *
 * THE BUG THIS LOCKS DOWN
 * Zooming out made some tabs stretch edge to edge while others stayed put,
 * because every view had invented its own width: four had gutters at four
 * different widths (1200 / 1440 / 1480 / 1720), five ran full bleed, and
 * exam-alerts had no wrapper at all. Zooming out widens the viewport in CSS
 * pixels, so the uncapped views kept growing and the capped ones did not.
 *
 * css/layout.css replaces all of that with one `--page-max` applied at
 * `.main-content`. The risk now is regression by addition: a new view, or an
 * edit to an old one, introducing another wrapper with its own max-width — or
 * worse, an inline one, which no stylesheet can override.
 *
 * So the core of this suite is a per-view table of the wrappers each view is
 * allowed to render. Adding a view means adding a row, which is the moment to
 * think about its width.
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
const layoutCss = read('css/layout.css');
const sw = read('sw.js');

/** Wrappers layout.css releases to 100% so they fill the shared column. */
const RELEASED = [
  'dash', 'ai-teacher-container', 'aw-container', 'tools-studio-wrapper',
  'create-quiz-container', 'study-vault-container', 'settings-container',
  'quiz-player-container', 'page-column'
];

/**
 * What each view is allowed to render as the first element of a
 * `this.container.innerHTML = ` assignment.
 *
 *   accepted   — anything other than a RELEASED wrapper that is allowed as the
 *                first element, with the reason. Two kinds appear here:
 *                  · deliberate focused columns (a single flashcard, an empty
 *                    state) which never stretched and would read worse wide
 *                  · sub-views that render bars and panels straight into the
 *                    container and rely on `.main-content` for their width
 *                Inline widths are written as `max-width: <value>`.
 *   noWrapper  — the template opens with an interpolation, so there is no first
 *                element at all; `.main-content` is the only constraint
 */
const VIEW_WRAPPERS = {
  'js/views/dashboard.js':      {},
  'js/views/ai-teacher.js':     {},
  'js/views/create-quiz.js':    {},
  'js/views/study-notes.js':    { accepted: ['textbook-sticky-bar'] },
  'js/views/flashcards.js':     { accepted: ['max-width: 1120px', 'max-width: 720px'] },
  'js/views/answer-writing.js': {},
  'js/views/library.js':        {},
  'js/views/quiz-history.js':   {},
  'js/views/tools.js':          {},
  'js/views/settings.js':       { accepted: ['card p-6 text-center'] },
  'js/views/quiz-player.js':    {},
  'js/views/quiz-result.js':    { accepted: ['result-container'] },
  'js/views/exam-alerts.js':    { accepted: ['ea-error-state'], noWrapper: true }
};

// ===========================================================================
console.log('\n=== Stylesheet wiring ===');
// ===========================================================================
{
  const linked = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) linked.push(m[1]);

  check('css/layout.css is linked', linked.includes('css/layout.css'));
  const i = linked.indexOf('css/layout.css');

  // It has to win over every stylesheet that declares a view width.
  for (const sheet of [
    'css/main.css',
    'css/components/01-base-and-header.css',
    'css/components/03-create-quiz.css',
    'css/components/05-study-notes.css',
    'css/components/10-tools.css',
    'css/dashboard.css',
    'css/quiz.css',
    'css/answer-writing.css',
    'css/ai-teacher/01-hero-and-input.css',
    'css/view-hero.css'
  ]) {
    const j = linked.indexOf(sheet);
    check(`linked after ${sheet}`, j !== -1 && i > j, `${sheet}=${j} layout=${i}`);
  }

  // responsive.css must still be able to override the gutter on mobile.
  check('linked before responsive.css', i < linked.indexOf('css/responsive.css'));
  check('linked before a11y.css', i < linked.indexOf('css/a11y.css'));
  check('precached by the service worker', /'css\/layout\.css'/.test(sw));
}

// ===========================================================================
console.log('\n=== One column, declared once ===');
// ===========================================================================
{
  check('--page-max is declared in :root',
    /:root \{[\s\S]{0,700}--page-max: \d+px;/.test(layoutCss));
  check('--page-gutter is fluid, not a fixed value',
    /--page-gutter: clamp\(/.test(layoutCss),
    'a fixed gutter is what makes zooming feel abrupt');

  // Exactly one width value for the whole app.
  const widths = [...layoutCss.matchAll(/--page-max: (\d+)px/g)].map(m => m[1]);
  check('exactly one --page-max value exists', widths.length === 1, widths.join(', '));

  const w = Number(widths[0] || 0);
  check('the column is a sane reading width', w >= 1200 && w <= 1800, `${w}px`);

  check('.main-content is capped and centred',
    /\.main-content \{[\s\S]{0,260}max-width: var\(--page-max\)[\s\S]{0,120}margin-inline: auto/.test(layoutCss),
    'this is what catches a view with no wrapper of its own');
  check('.main-content uses the fluid gutter',
    /\.main-content \{[\s\S]{0,300}padding-inline: var\(--page-gutter\)/.test(layoutCss));

  check('header and sub-nav align to the same column',
    /\.header-inner,\s*\.subnav-container \{[\s\S]{0,200}max-width: var\(--page-max\)/.test(layoutCss),
    'top chrome floating to the window edge is the other half of the problem');
}

// ===========================================================================
console.log('\n=== Every per-view width is released ===');
// ===========================================================================
{
  for (const cls of RELEASED) {
    check(`.${cls} is released to the shared column`,
      new RegExp(`\\.${cls}[,\\s]`).test(layoutCss), 'not listed in layout.css');
  }

  // The release block must set width as well as max-width: several of these are
  // flex/grid children that would otherwise shrink to fit their content.
  check('released wrappers get width:100% too',
    /\.page-column \{\s*\n?\s*width: 100%;\s*\n?\s*max-width: 100%/.test(layoutCss) ||
    /width: 100%;[\s\S]{0,60}max-width: 100%;[\s\S]{0,60}margin-inline: auto;/.test(layoutCss));

  // Long-form prose needs its own measure now that its container was released.
  check('the AI Teacher lesson keeps a reading measure',
    /\.teacher-book-folio \{[\s\S]{0,140}max-width: 1100px/.test(layoutCss),
    'released from 1200px, it would otherwise inherit the full column');
  check('the quiz report stays centred',
    /\.result-container \{[\s\S]{0,120}margin-inline: auto/.test(layoutCss));

  check('print drops the column entirely',
    /@media print \{[\s\S]{0,400}max-width: none/.test(layoutCss));
}

// ===========================================================================
console.log('\n=== No view reintroduces its own width ===');
// ===========================================================================
{
  // An inline style beats every stylesheet, so an inline max-width on a
  // top-level wrapper cannot be corrected from layout.css at all. This is the
  // exact form the bug took in library, quiz-history and flashcards.
  /**
   * First real element of every `container.innerHTML = ` template in a source.
   * Leading whitespace and HTML comments are skipped — several sub-views open
   * with a `<!-- ... -->` label, which is not the wrapper.
   */
  function findWrappers(src) {
    const openers = [];
    const re = /this\.container\.innerHTML = `/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      let rest = src.slice(m.index + m[0].length);
      for (;;) {
        const trimmed = rest.replace(/^\s+/, '');
        if (trimmed.startsWith('<!--')) {
          const end = trimmed.indexOf('-->');
          if (end === -1) { rest = ''; break; }
          rest = trimmed.slice(end + 3);
          continue;
        }
        rest = trimmed;
        break;
      }
      const tag = rest.match(/^<(\w+)((?:"[^"]*"|[^>])*)>/);
      openers.push(tag
        ? { tag: tag[1], attrs: tag[2] }
        : { tag: null, attrs: '', interpolated: rest.startsWith('${') });
    }
    return openers;
  }

  /** @returns {string[]} wrappers that would escape the shared column */
  function findOffenders(src, spec = {}) {
    const accepted = spec.accepted || [];
    const offenders = [];
    for (const o of findWrappers(src)) {
      const classes = (o.attrs.match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
      const inlineMax = (o.attrs.match(/style="[^"]*max-width:\s*([^;"]+)/) || [])[1];

      const isReleased = classes.some(c => RELEASED.includes(c));
      const isAccepted = accepted.some(a =>
        classes.includes(a) || classes.join(' ') === a ||
        (inlineMax && `max-width: ${inlineMax.trim()}` === a));
      const isInterpolated = o.tag === null && o.interpolated && spec.noWrapper;

      if (!(isReleased || isAccepted || isInterpolated)) {
        offenders.push(`<${o.tag} class="${classes.join(' ')}"${inlineMax ? ` max-width:${inlineMax}` : ''}>`);
        continue;
      }
      // A released wrapper must not also carry an inline max-width: inline wins
      // over every stylesheet, so layout.css could not correct it.
      if (isReleased && inlineMax) {
        offenders.push(`.${classes.join('.')} has inline max-width:${inlineMax}`);
      }
    }
    return offenders;
  }

  // Self-test. Without it, a bug that made findOffenders() always return []
  // would let every view below pass forever.
  {
    const ok = 'this.container.innerHTML = `\n <div class="page-column">x</div>`;';
    const newWrapper = 'this.container.innerHTML = `\n <div class="my-new-view">x</div>`;';
    const inlineOnReleased = 'this.container.innerHTML = `\n <div class="page-column" style="max-width:900px;">x</div>`;';
    const afterComment = 'this.container.innerHTML = `\n <!-- label -->\n <div class="dash">x</div>`;';
    const noWrapper = 'this.container.innerHTML = `\n ${this.buildHero()}`;';

    check('self-test: an approved wrapper passes', findOffenders(ok).length === 0);
    check('self-test: an unknown wrapper is flagged', findOffenders(newWrapper).length === 1,
      'a new view must be added to VIEW_WRAPPERS deliberately');
    check('self-test: an inline width on a released wrapper is flagged',
      findOffenders(inlineOnReleased).length === 1,
      'inline styles beat layout.css, so this must never slip through');
    check('self-test: a leading comment does not hide the wrapper',
      findOffenders(afterComment).length === 0);
    check('self-test: a wrapperless template needs the noWrapper opt-in',
      findOffenders(noWrapper).length === 1 &&
      findOffenders(noWrapper, { noWrapper: true }).length === 0);
  }

  for (const [file, spec] of Object.entries(VIEW_WRAPPERS)) {
    const src = read(file);
    const name = path.basename(file);

    check(`${name} assigns container.innerHTML at least once`, findWrappers(src).length > 0);

    const offenders = findOffenders(src, spec);
    check(`${name} uses only approved page wrappers`, offenders.length === 0, offenders.join(' | '));
  }

  // The three wrappers that had to become classes really did. Checked by class
  // presence only — flashcards legitimately keeps inline widths on its two
  // focused sub-views, so a blanket "no inline max-width" grep would be wrong.
  for (const file of ['js/views/library.js', 'js/views/quiz-history.js', 'js/views/flashcards.js']) {
    const src = read(file);
    check(`${path.basename(file)} uses .page-column instead of an inline width`,
      src.includes('class="page-column"') &&
      !src.includes('max-width:100%; width:100%; margin:0 auto'));
  }

  // `full-width-page` had no CSS rule anywhere and implied full bleed, which is
  // now wrong. It was removed rather than left as a misleading hint.
  check('the dead full-width-page class is gone',
    !read('js/views/tools.js').includes('full-width-page') &&
    !fs.readdirSync(path.join(ROOT, 'css')).some(f =>
      f.endsWith('.css') && read(`css/${f}`).includes('full-width-page')));
}

// ===========================================================================
console.log('\n=== Overflow guards ===');
// ===========================================================================
{
  // A single element wider than the column brings back a horizontal scrollbar,
  // which looks exactly like the stretching this file fixes.
  check('scrollable tables are width-capped',
    /\.ea-table-wrapper,\s*\.comparison-table-wrapper \{[\s\S]{0,120}max-width: 100%/.test(layoutCss),
    'overflow-x:auto never fires on a shrink-to-fit box');
  check('media cannot exceed the column',
    /\.main-content img,[\s\S]{0,200}max-width: 100%/.test(layoutCss));
  check('grid and flex children can shrink below their content',
    /min-width: 0;/.test(layoutCss),
    'a long unbroken filename otherwise forces the whole track wider');

  // Those guards reference real class names — a typo would be a silent no-op.
  const examAlertsCss = read('css/exam-alerts.css');
  check('.ea-table-wrapper is a real class', /\.ea-table-wrapper \{/.test(examAlertsCss));
  check('.comparison-table-wrapper is a real class',
    /\.comparison-table-wrapper \{/.test(read('css/ai-teacher/04-folio.css')));
  check('.ea-table-wrapper is actually rendered',
    read('js/views/exam-alerts.js').includes('class="ea-table-wrapper"'));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
