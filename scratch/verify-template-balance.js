/**
 * Verify every HTML template literal in the app is tag-balanced.
 *
 * The whole UI is built by concatenating strings into innerHTML, with no build
 * step and no template compiler to catch a mistake. A stray `</div>` raises no
 * error at all: the HTML parser silently discards it and re-parents every
 * following sibling, so a panel quietly escapes its container and the layout
 * collapses somewhere unrelated. Deleting or moving a header block — which this
 * project has now done nine times — is exactly the edit that causes it.
 *
 * This suite was written after replacing nine per-view headers with a shared
 * hero; it caught nothing on that change, which is the point. It is cheap
 * insurance for every future edit to these files.
 *
 * WHY THIS NEEDS A PARSER RATHER THAN A REGEX
 *   • `//` comments quote markup ("an unstyled <h2>"), so comments must go first
 *     or their examples are counted as real tags.
 *   • `${...}` regions nest arbitrarily — object literals, arrow bodies and
 *     further template literals — so they have to be skipped with mutually
 *     recursive scanners. A lazy `\$\{[\s\S]*?\}` stops at the first `}`, which
 *     is usually the wrong one, and leaks fragments of inner markup.
 *
 * KNOWN LIMITATION
 * Markup produced inside an interpolation is skipped, not checked — including
 * the bodies of `.map()` callbacks. Those are balanced in their own right, so
 * the outer template still balances. But a template that deliberately splits a
 * tag across a conditional (`${cond ? '</div>' : ''}`) would be reported as
 * unbalanced. No file does that today; if one ever needs to, list it in
 * EXPECTED_UNBALANCED with a reason rather than weakening the check.
 */
const fs = require('fs');
const path = require('path');

/** Every file that builds markup as a string. */
const FILES = [
  'js/app.js',
  'js/ui-utils.js',
  'js/ai-advisor.js',
  'js/views/dashboard.js',
  'js/views/create-quiz.js',
  'js/views/study-notes.js',
  'js/views/flashcards.js',
  'js/views/answer-writing.js',
  'js/views/exam-alerts.js',
  'js/views/library.js',
  'js/views/quiz-history.js',
  'js/views/quiz-player.js',
  'js/views/quiz-result.js',
  'js/views/tools.js',
  'js/views/settings.js',
  'js/views/ai-teacher.js'
];

/** `'file.js:line': 'reason'` — deliberate splits, reviewed and accepted. */
const EXPECTED_UNBALANCED = {};

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source',
                      'area', 'base', 'col', 'embed', 'track', 'wbr']);

// ---------------------------------------------------------------- scanners
// Each returns the index just past the construct it consumed.

/** From the opening quote of a '...' or "..." string. */
function skipQuoted(s, i) {
  const q = s[i++];
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === q) return i + 1;
    i++;
  }
  return i;
}

/** From the `${`. Consumes the whole interpolation including its closing brace. */
function skipInterp(s, i) {
  i += 2;
  let depth = 1;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(s, i); continue; }
    if (c === '`') { i = skipTemplate(s, i).end; continue; }
    i++;
  }
  return i;
}

/**
 * From the opening backtick.
 * @returns {{end:number, literal:string}} index past the closing backtick, plus
 *          the template's literal text with interpolations blanked out.
 */
function skipTemplate(s, i) {
  i++;
  let literal = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      // Resolve the escape to the character it produces. This matters for the
      // `<\/script>` idiom used when a template embeds a full HTML document —
      // blanking the escape would hide a real closing tag.
      const next = s[i + 1];
      literal += ({ n: '\n', r: '\r', t: '\t' })[next] ?? (next === undefined ? ' ' : next);
      i += 2;
      continue;
    }
    if (c === '$' && s[i + 1] === '{') { i = skipInterp(s, i); literal += ' '; continue; }
    if (c === '`') return { end: i + 1, literal };
    literal += c;
    i++;
  }
  return { end: i, literal };
}

/** Blank out // and /* *​/ comments, preserving newlines so lines still align. */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = skipQuoted(src, i);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '`') {
      const end = skipTemplate(src, i).end;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** @returns {string[]} human-readable problems with one template's literal text */
function balanceProblems(literal) {
  const clean = literal.replace(/<!--[\s\S]*?-->/g, ' ');
  const stack = [];
  const problems = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (VOID.has(tag) || m[4] === '/') continue;
    if (!closing) { stack.push(tag); continue; }
    if (stack.length === 0) { problems.push(`stray </${tag}>`); continue; }
    const open = stack.pop();
    if (open !== tag) problems.push(`</${tag}> closes <${open}>`);
  }
  if (stack.length) problems.push(`unclosed: ${stack.join(', ')}`);
  return problems;
}

// ===========================================================================
console.log('\n=== The checker itself detects real faults ===');
// ===========================================================================
/*
 * Without this, a bug that made balanceProblems() always return [] would turn
 * every check below into a tautology that passes forever.
 */
{
  const cases = [
    ['<div><p>ok</p></div>', 0, 'balanced nesting'],
    ['<div><br><img src="x"></div>', 0, 'void elements need no closing tag'],
    ['<div class="a>b"><span>ok</span></div>', 0, 'a > inside an attribute value'],
    ['<input /><hr/>', 0, 'self-closing syntax'],
    ['<div><p>ok</p></div></div>', 1, 'stray closing tag'],
    ['<div><p>ok</div></p>', 2, 'crossed tags'],
    ['<div><span>ok</span>', 1, 'unclosed wrapper'],
    ['<section><div></div>', 1, 'unclosed section']
  ];
  for (const [html, expected, label] of cases) {
    const got = balanceProblems(html).length;
    check(`detects: ${label}`, got === expected, `expected ${expected} problems, got ${got}`);
  }

  // The scanners must also survive the constructs that previously broke them.
  const nested = skipTemplate('`<div>${items.map(x => `<i>${ { a: 1 }.a }</i>`).join("")}</div>`', 0);
  check('nested templates and object literals are skipped whole',
    balanceProblems(nested.literal).length === 0,
    JSON.stringify(nested.literal));

  const escaped = skipTemplate('`<body><script>x<\\/script></body>`', 0);
  check('the <\\/script> idiom resolves to a real closing tag',
    balanceProblems(escaped.literal).length === 0,
    JSON.stringify(escaped.literal));

  const commented = stripComments('const a = 1; // an unstyled `<h2>` here\nconst b = `<p>ok</p>`;');
  check('markup quoted inside a // comment is ignored',
    !commented.includes('<h2>'), JSON.stringify(commented));
}

console.log('\n=== HTML template literals are tag-balanced ===');

let scanned = 0;

for (const file of FILES) {
  const abs = path.join(__dirname, '..', file);
  if (!fs.existsSync(abs)) {
    check(`${file} exists`, false, 'listed in FILES but not on disk');
    continue;
  }
  const src = stripComments(fs.readFileSync(abs, 'utf8'));
  const problemsByTemplate = [];

  let i = 0;
  while (i < src.length) {
    if (src[i] === '"' || src[i] === "'") { i = skipQuoted(src, i); continue; }
    if (src[i] !== '`') { i++; continue; }

    const line = src.slice(0, i).split('\n').length;
    const { end, literal } = skipTemplate(src, i);
    i = end;

    if (!/<[a-z]/i.test(literal)) continue;
    scanned++;
    const clean = literal.replace(/<!--[\s\S]*?-->/g, ' ');

    const problems = balanceProblems(clean);

    const key = `${path.basename(file)}:${line}`;
    if (problems.length && !EXPECTED_UNBALANCED[key]) {
      problemsByTemplate.push(`line ${line}: ${problems.slice(0, 4).join('; ')}`);
    }
  }

  check(`${file} — every HTML template balances`,
    problemsByTemplate.length === 0,
    problemsByTemplate.slice(0, 4).join(' | '));
}

// A silent scan that found nothing because the parser broke would pass every
// check above, so assert it actually looked at a realistic number of templates.
check('a meaningful number of templates were scanned', scanned > 120, `scanned ${scanned}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
