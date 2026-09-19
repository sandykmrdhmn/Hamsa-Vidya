/**
 * Verify that overlays inside a view are hidden, and positioned, correctly.
 *
 * THE BUG THIS LOCKS DOWN
 * Starting a quiz showed a tall empty panel to the right of the question card.
 * It was the Question Palette drawer, which is supposed to be closed.
 *
 * Two things combined:
 *
 *   1. `css/components/04-motion.css` animates `.view-section.active` with
 *      `animation-fill-mode: both`, so the final keyframe's
 *      `transform: translateY(0) scale(1)` is retained permanently. A transform
 *      makes the element the containing block for every `position: fixed`
 *      descendant — so inside a view, `fixed` meant "this view's padding box",
 *      not "the viewport".
 *
 *   2. The drawer was parked with `right: -420px`. That is a geometric hide, and
 *      it only works against the viewport. Measured from the content column
 *      instead, "off-screen right" landed in the page gutter — visible.
 *
 * It stayed invisible for as long as `.main-content` was full-width, because
 * then the two boxes were the same. `css/layout.css` capped the column at
 * `--page-max`, and the difference became the centring margin.
 *
 * WHAT IS CHECKED
 * Neither half can be verified by rendering: jsdom has no layout engine, so it
 * would report the drawer as visible either way. The two mechanisms are checked
 * structurally instead, together with the cascade order that makes the override
 * effective, and the scanner that enforces the rule is self-tested so it cannot
 * quietly stop finding anything.
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

/** Comments describe the bug we removed, so they must never be matched. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Return the body of the first rule whose selector list matches exactly. */
function ruleBody(css, selector) {
  const src = stripComments(css);
  const needle = new RegExp(
    `(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm'
  );
  const m = src.match(needle);
  return m ? m[2] : null;
}

const HTML = read('index.html');
const QUIZ_CSS = read('css/quiz.css');
const LAYOUT_CSS = read('css/layout.css');
const MOTION_CSS = read('css/components/04-motion.css');
const PLAYER_JS = read('js/views/quiz-player.js');

// ===========================================================================
console.log('\n=== The retained transform is released ===');
// ===========================================================================
{
  // If this stops being true the override below is dead weight, and whoever
  // removed it should be told rather than left guessing.
  check('04-motion.css still retains its entrance transform with `both`',
    /\.view-section\.active\s*\{[^}]*animation:\s*viewEntranceFade[^;}]*\bboth\b/.test(stripComments(MOTION_CSS)),
    'if this is now gone, section 5 of layout.css can be deleted');

  const override = ruleBody(LAYOUT_CSS, '.view-section.active');
  check('layout.css neutralises the fill mode', override !== null &&
    /animation-fill-mode:\s*none/.test(override), String(override));

  // Same specificity (0,2,0) on both rules, so only source order decides. If the
  // override were weaker it would silently lose.
  const linked = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  check('layout.css is linked after components/04-motion.css',
    linked.indexOf('css/layout.css') > linked.indexOf('css/components/04-motion.css'),
    `layout=${linked.indexOf('css/layout.css')} motion=${linked.indexOf('css/components/04-motion.css')}`);
  check('both rules use the same selector, so order alone resolves them',
    /\.view-section\.active\s*\{/.test(stripComments(LAYOUT_CSS)) &&
    !/\.view-section\.active[^{]*!important/.test(LAYOUT_CSS),
    'no !important needed — do not add one, it would hide a cascade mistake');

  // 04-motion.css is byte-frozen (verify-css-split.js), which is why this is an
  // override and not an edit. Assert the freeze still holds for this file.
  check('04-motion.css itself was not edited',
    read('scratch/_backup/components.css').includes(
      'animation: viewEntranceFade 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;'),
    'the frozen baseline no longer matches — verify-css-split.js should be red too');

  // The end state of the animation must equal the natural state, or dropping
  // the fill mode would change how every view looks.
  check('the final keyframe is the element\'s natural state, so nothing moves',
    /@keyframes viewEntranceFade\s*\{[\s\S]*?to\s*\{[^}]*opacity:\s*1[^}]*transform:\s*translateY\(0\)\s*scale\(1\)/
      .test(stripComments(MOTION_CSS)),
    'if the "to" keyframe ever holds a real offset, fill-mode:none would visibly shift the view');
}

// ===========================================================================
console.log('\n=== The closed drawer is hidden, not merely moved ===');
// ===========================================================================
{
  const closed = ruleBody(QUIZ_CSS, '.palette-drawer');
  const open = ruleBody(QUIZ_CSS, '.palette-drawer.active');

  check('.palette-drawer has a rule', closed !== null);
  check('.palette-drawer.active has a rule', open !== null);

  check('the closed drawer is visibility:hidden',
    /visibility:\s*hidden/.test(closed), closed);
  check('the closed drawer is transparent', /opacity:\s*0\b/.test(closed));
  check('the closed drawer swallows no clicks',
    /pointer-events:\s*none/.test(closed));
  check('it is parked by its own transform',
    /transform:\s*translateX\(/.test(closed));

  check('opening restores visibility', /visibility:\s*visible/.test(open), open);
  check('opening restores opacity', /opacity:\s*1\b/.test(open));
  check('opening restores pointer events', /pointer-events:\s*auto/.test(open));
  check('opening slides it home', /transform:\s*translateX\(0\)/.test(open));

  // The specific regression: a negative offset as the hiding mechanism.
  check('the closed state does not rely on a negative offset',
    !/(right|left|top|bottom):\s*-/.test(closed), closed);
  check('the open state does not re-set a horizontal offset',
    !/(^|;)\s*(right|left):/.test(open),
    'offset and transform both animating the same axis fight each other');

  // `top` + `bottom` + `height` together is over-constrained; the browser drops
  // `bottom`, so stating it only misleads the next reader.
  check('the drawer is not over-constrained vertically',
    !(/top:/.test(closed) && /bottom:/.test(closed) && /height:/.test(closed)),
    closed);

  // Mobile turns it into a bottom sheet. It must not reintroduce the offset.
  const mobile = QUIZ_CSS.match(/@media \(max-width: 640px\)\s*\{[\s\S]*?\n\}/);
  check('the mobile bottom-sheet variant exists', !!mobile);
  if (mobile) {
    const m = stripComments(mobile[0]);
    check('the mobile sheet parks below the fold with translateY',
      /transform:\s*translateY\(100%\)/.test(m));
    check('the mobile sheet slides up when active',
      /\.palette-drawer\.active\s*\{[^}]*transform:\s*translateY\(0\)/.test(m));
    check('the mobile active state no longer sets `right`',
      !/\.palette-drawer\.active\s*\{[^}]*right:/.test(m),
      'left over from the negative-offset era; it would cancel nothing and confuse');
  }
}

// ===========================================================================
console.log('\n=== The backdrop covers the window, not just the column ===');
// ===========================================================================
{
  const bd = ruleBody(QUIZ_CSS, '.palette-backdrop');
  check('the backdrop is fixed and full-bleed',
    /position:\s*fixed/.test(bd) && /inset:\s*0/.test(bd), bd);
  check('the backdrop is hidden by visibility, so it cannot eat clicks',
    /visibility:\s*hidden/.test(bd));
  check('the backdrop sits below the drawer',
    Number((bd.match(/z-index:\s*(\d+)/) || [])[1]) <
    Number((ruleBody(QUIZ_CSS, '.palette-drawer').match(/z-index:\s*(\d+)/) || [])[1]));

  // With the view no longer a stacking context, these z-indexes finally compete
  // with the header instead of being trapped under it.
  const headerZ = Number((ruleBody(read('css/components/01-base-and-header.css'), '.site-header') || '')
    .match(/z-index:\s*(\d+)/)?.[1] || 0);
  check('the header z-index was read', headerZ > 0, String(headerZ));
  check('the drawer now outranks the sticky header',
    Number((ruleBody(QUIZ_CSS, '.palette-drawer').match(/z-index:\s*(\d+)/) || [])[1]) > headerZ,
    `drawer must paint above the header (${headerZ})`);
}

// ===========================================================================
console.log('\n=== Every drawer in the app hides the same way ===');
// ===========================================================================
{
  // The Ask-AI and Doubt-Solver drawers already used visibility + transform.
  // The palette was the only one still parked on an offset. Keep it that way.
  const SHEETS = [
    'css/main.css', 'css/quiz.css', 'css/dashboard.css', 'css/exam-alerts.css',
    'css/answer-writing.css', 'css/view-hero.css', 'css/onboarding.css',
    'css/auth-gate.css', 'css/header.css', 'css/layout.css',
    'css/responsive.css', 'css/a11y.css',
    'css/components/05-study-notes.css', 'css/components/08-doubt-solver.css',
    'css/components/09-reading-themes.css'
  ];

  /**
   * Find rules that are `position: fixed` and hide themselves with a negative
   * offset. Returns `selector` strings.
   */
  function findOffsetParking(css) {
    const src = stripComments(css);
    const hits = [];
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(src)) !== null) {
      const sel = m[1].trim().split('\n').pop().trim();
      const body = m[2];
      if (!/position:\s*fixed/.test(body)) continue;
      if (/(right|left|top|bottom):\s*-\s*\d/.test(body)) hits.push(sel);
    }
    return hits;
  }

  // Self-test: the scanner has to actually catch the pattern it is guarding.
  const bad = findOffsetParking(`
    .decoy { position: fixed; right: -420px; }
    .fine  { position: fixed; right: 1rem; transform: translateX(110%); }
    .also-fine { position: absolute; right: -420px; }
  `);
  check('self-test: the scanner flags offset parking',
    bad.length === 1 && bad[0] === '.decoy', JSON.stringify(bad));
  check('self-test: it ignores transform parking and non-fixed elements',
    !bad.includes('.fine') && !bad.includes('.also-fine'));
  check('self-test: comments are not scanned',
    findOffsetParking('/* .ghost { position: fixed; right: -420px; } */').length === 0);

  for (const sheet of SHEETS) {
    const hits = findOffsetParking(read(sheet));
    check(`${sheet} parks no fixed overlay on a negative offset`,
      hits.length === 0, hits.join(', '));
  }

  // And the two drawers that got it right stay right.
  const notes = read('css/components/05-study-notes.css');
  const doubt = read('css/components/08-doubt-solver.css');
  check('the Ask-AI drawer still hides by visibility',
    /\.ask-ai-drawer\s*\{[^}]*visibility:\s*hidden/.test(stripComments(notes)));
  check('the Doubt-Solver drawer still hides by visibility',
    /\.doubt-solver-drawer\s*\{[^}]*visibility:\s*hidden/.test(stripComments(doubt)));
}

// ===========================================================================
console.log('\n=== Markup and toggle wiring ===');
// ===========================================================================
{
  // The drawer must not be nested inside a card that also retains a transform
  // (`.question-card` animates with `cardCascadeIn ... both`), or the same bug
  // returns one level down.
  const tpl = PLAYER_JS.slice(PLAYER_JS.indexOf('this.container.innerHTML = `'));
  const drawerAt = tpl.indexOf('id="palette-drawer"');
  const containerClose = tpl.indexOf('</div>', tpl.indexOf('quiz-bottom-bar'));
  check('the drawer is emitted outside .quiz-player-container',
    drawerAt > containerClose && drawerAt > tpl.indexOf('class="question-card"'),
    'nesting it inside an animated card recreates the containing-block bug');
  check('the backdrop is emitted outside the container too',
    tpl.indexOf('id="palette-backdrop"') > containerClose);

  check('the toggle is driven purely by the `active` class',
    /classList\.add\('active'\)/.test(PLAYER_JS) &&
    /classList\.remove\('active'\)/.test(PLAYER_JS));
  check('the toggle writes no inline positioning',
    !/palette-drawer[\s\S]{0,400}?\.style\.(right|left|transform|visibility)/.test(PLAYER_JS),
    'inline styles would outrank the stylesheet and reintroduce the leak');
  check('the drawer and backdrop are closed together',
    /drawer\.classList\.remove\('active'\)[\s\S]{0,120}backdrop\.classList\.remove\('active'\)/.test(PLAYER_JS));
  check('jumping to a question closes the palette',
    /jumpToQuestion\(idx\)\s*\{[\s\S]{0,200}this\.togglePalette\(false\)/.test(PLAYER_JS));
  check('the palette opens only on an explicit click',
    (PLAYER_JS.match(/togglePalette\(true\)/g) || []).length === 1 &&
    /onclick="quizPlayerView\.togglePalette\(true\)"/.test(PLAYER_JS),
    'nothing may open it during render');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
