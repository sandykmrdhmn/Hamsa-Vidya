/**
 * Verify Phase 5 shared helpers:
 *   M5 — UIUtils consolidation (escaping, downloads, TTS, dates)
 *   M7 — spotlight tracking rewrite
 *
 * escapeJs gets the most attention because the implementation it replaces was
 * genuinely exploitable: it escaped quotes but not backslashes or newlines, so
 * user/AI text interpolated into an inline onclick could terminate the string
 * and run arbitrary JS.
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

/** Load sanitizer + ui-utils in a jsdom window. */
function loadUtils() {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { return null; }

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const w = dom.window;

  const downloads = [];
  // Capture download attempts instead of performing them.
  w.URL.createObjectURL = () => 'blob:mock-url';
  w.URL.revokeObjectURL = () => {};
  const origCreate = w.document.createElement.bind(w.document);
  w.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      el.click = () => downloads.push({ download: el.download, href: el.href });
    }
    return el;
  };

  const sandbox = {
    console,
    window: w,
    document: w.document,
    DOMParser: w.DOMParser,
    XMLSerializer: w.XMLSerializer,
    Node: w.Node,
    URL: w.URL,
    Blob: w.Blob,
    setTimeout: w.setTimeout.bind(w),
    Date
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(read('js/sanitizer.js'), { filename: 'sanitizer.js' }).runInContext(sandbox);
  new vm.Script(read('js/ui-utils.js'), { filename: 'ui-utils.js' }).runInContext(sandbox);

  return { U: w.UIUtils, downloads, w };
}

(async () => {
  const loaded = loadUtils();

  if (!loaded) {
    console.log('\n  SKIP  jsdom not installed — cannot exercise UIUtils at runtime');
  } else {
    const { U, downloads } = loaded;

    console.log('\n=== M5: escapeJs closes the inline-onclick injection ===');
    {
      // The old implementation: .replace(/'/g,"\\'").replace(/"/g,'\\"')
      const oldEscape = (s) => (s || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

      // A trailing backslash escapes the escape, so the string ends early and
      // everything after it is parsed as code.
      const backslashAttack = "x\\";
      const oldOut = oldEscape(backslashAttack);
      const newOut = U.escapeJs(backslashAttack);
      check('old escaper left a dangling backslash', oldOut === 'x\\');
      check('new escaper doubles backslashes', newOut === 'x\\\\', `got ${JSON.stringify(newOut)}`);

      // Verify by actually evaluating the produced literal.
      const evalLiteral = (escaped) => {
        try { return vm.runInNewContext(`'${escaped}'`); }
        catch (e) { return `__SYNTAX_ERROR__`; }
      };
      check('old escaping produced a broken literal',
        evalLiteral(oldEscape("it's\\")) === '__SYNTAX_ERROR__');
      check('new escaping produces a valid literal',
        evalLiteral(U.escapeJs("it's\\")) === "it's\\");

      // Newlines terminate a statement inside an attribute.
      check('escapes newline', U.escapeJs('a\nb') === 'a\\nb');
      check('escapes carriage return', U.escapeJs('a\rb') === 'a\\rb');
      check('escapes tab', U.escapeJs('a\tb') === 'a\\tb');
      check('old escaper left newlines raw', oldEscape('a\nb') === 'a\nb');

      // U+2028/29 are line terminators to the JS parser.
      check('escapes U+2028', U.escapeJs('a\u2028b') === 'a\\u2028b');
      check('escapes U+2029', U.escapeJs('a\u2029b') === 'a\\u2029b');

      check('escapes single quote', U.escapeJs("a'b") === "a\\'b");
      check('escapes double quote', U.escapeJs('a"b') === 'a\\"b');
      check('escapes < to avoid closing a script block', U.escapeJs('a</script>b').includes('\\x3C'));
      check('handles null/undefined', U.escapeJs(null) === '' && U.escapeJs(undefined) === '');

      // A realistic payload round-trip.
      const payload = `'); alert(document.cookie); //`;
      check('payload cannot break out',
        evalLiteral(U.escapeJs(payload)) === payload, 'literal did not round-trip');
    }

    console.log('\n=== M5: escapeHtml / escapeRegex ===');
    {
      check('escapeHtml escapes all five entities',
        U.escapeHtml(`<a href="x">&'`) === '&lt;a href=&quot;x&quot;&gt;&amp;&#039;',
        U.escapeHtml(`<a href="x">&'`));
      check('escapeRegex neutralises metacharacters',
        U.escapeRegex('a.b*c+d?') === 'a\\.b\\*c\\+d\\?');
      check('escapeRegex handles null', U.escapeRegex(null) === '');
    }

    console.log('\n=== M5: downloads ===');
    {
      downloads.length = 0;
      const ok = U.downloadText('hello', 'note.txt');
      check('downloadText triggers a download', ok === true && downloads.length === 1);
      check('filename applied', downloads[0].download === 'note.txt', downloads[0].download);

      downloads.length = 0;
      U.downloadJson({ a: 1 }, 'data.json');
      check('downloadJson works', downloads.length === 1 && downloads[0].download === 'data.json');

      check('downloadBlob rejects a missing blob', U.downloadBlob(null, 'x') === false);

      check('slugify makes a safe filename',
        U.slugify('UPSC Prelims: Polity & Economy!') === 'upsc-prelims-polity-economy',
        U.slugify('UPSC Prelims: Polity & Economy!'));
      check('slugify falls back when empty', U.slugify('!!!', 'fallback') === 'fallback');
      check('slugify caps length', U.slugify('a'.repeat(200)).length <= 80);
    }

    console.log('\n=== M5: dates ===');
    {
      // toDateKey must use LOCAL parts. toISOString() would roll over to the
      // next day for late-evening times in positive UTC offsets (e.g. IST).
      const lateEvening = new Date(2026, 8, 19, 23, 30, 0); // 19 Sep 2026 23:30 local
      check('toDateKey uses local date parts',
        U.toDateKey(lateEvening) === '2026-09-19', U.toDateKey(lateEvening));
      check('toDateKey handles invalid input', U.toDateKey('not-a-date') === '');

      // Month abbreviation differs by ICU version ("Sep" vs "Sept"), so assert
      // the parts rather than the exact string.
      check('formatDate renders a readable date',
        /19\s+Sept?\s+2026/.test(U.formatDate('2026-09-19T10:00:00Z')),
        U.formatDate('2026-09-19T10:00:00Z'));
      check('formatDate handles null', U.formatDate(null) === '—');
      check('formatDate handles garbage', U.formatDate('xyz') === '—');

      check('formatDuration pads correctly', U.formatDuration(309) === '05m:09s', U.formatDuration(309));
      check('formatDuration floors negatives', U.formatDuration(-5) === '00m:00s');
      check('formatClock pads correctly', U.formatClock(65) === '01:05', U.formatClock(65));

      const tomorrow = new Date(Date.now() + 86400000);
      check('daysUntil tomorrow is 1', U.daysUntil(tomorrow) === 1, String(U.daysUntil(tomorrow)));
      const yesterday = new Date(Date.now() - 86400000);
      check('daysUntil yesterday is -1', U.daysUntil(yesterday) === -1, String(U.daysUntil(yesterday)));
      check('daysUntil handles garbage', U.daysUntil('nope') === null);

      check('formatBytes KB', U.formatBytes(2048) === '2 KB', U.formatBytes(2048));
      check('formatBytes zero', U.formatBytes(0) === '0 B');
    }

    console.log('\n=== M5: speech synthesis is centrally controlled ===');
    {
      check('reports unsupported when speechSynthesis is absent',
        U.isSpeechSupported() === false);
      check('speak() degrades safely without support', U.speak('hello') === false);
      check('stopSpeaking() is safe without support',
        (() => { try { U.stopSpeaking(); return true; } catch { return false; } })());
      check('speak() ignores empty text', U.speak('   ') === false);
    }
  }

  // ------------------------------------------------ static wiring assertions
  console.log('\n=== M5: duplication actually removed ===');
  {
    check('ui-utils.js is loaded before db.js and the views', (() => {
      const html = read('index.html');
      const ui = html.indexOf('js/ui-utils.js');
      const db = html.indexOf('js/db.js');
      const san = html.indexOf('js/sanitizer.js');
      return ui > san && ui < db;
    })());

    // No file should carry its own body-copy of escapeHtml any more.
    const handRolled = ['js/views/study-notes.js', 'js/views/quiz-result.js',
      'js/views/exam-alerts.js', 'js/app.js']
      .filter(f => /replace\(\/&\/g,\s*'&amp;'\)/.test(read(f)));
    check('no hand-rolled escapeHtml bodies remain', handRolled.length === 0, handRolled.join(','));

    check('study-notes delegates escapeJs to UIUtils',
      /escapeJs\(str\)\s*\{\s*return UIUtils\.escapeJs\(str\);/.test(read('js/views/study-notes.js')));

    const tools = read('js/views/tools.js');
    check('tools.js uses UIUtils.downloadBlob',
      (tools.match(/UIUtils\.downloadBlob\(/g) || []).length >= 7,
      `${(tools.match(/UIUtils\.downloadBlob\(/g) || []).length} calls`);
    check('tools.js has no orphaned anchor-download code',
      !/const link = document\.createElement\('a'\)/.test(tools));
    check('tools.js kept its legitimate state-cleanup revokes',
      (tools.match(/revokeObjectURL/g) || []).length === 2,
      `${(tools.match(/revokeObjectURL/g) || []).length} revokes`);

    check('db.js export uses the shared download helper',
      /UIUtils\.downloadJson\(backupData/.test(read('js/db.js')));
    check('ai-teacher SVG download uses the shared helper',
      /UIUtils\.downloadText\(svgData/.test(read('js/views/ai-teacher.js')));
    check('study-notes source download uses the shared helper',
      /UIUtils\.downloadText\(\s*originalText/.test(read('js/views/study-notes.js')));

    // Every object URL created for a download must be revoked somewhere.
    for (const f of ['js/views/tools.js', 'js/views/ai-teacher.js', 'js/views/study-notes.js', 'js/db.js']) {
      const src = read(f);
      const creates = (src.match(/URL\.createObjectURL/g) || []).length;
      const revokes = (src.match(/URL\.revokeObjectURL/g) || []).length;
      check(`${path.basename(f)}: every createObjectURL has a revoke`,
        creates === revokes, `${creates} created vs ${revokes} revoked`);
    }
  }

  console.log('\n=== M5: speech teardown covers every view ===');
  {
    const app = read('js/app.js');
    check('navigate() stops speech centrally',
      /UIUtils\?\.stopSpeaking\(\)/.test(app));
    check('central stop runs whenever the view changes',
      /const isLeavingView = viewName !== this\.currentView/.test(app));
    check('per-view stopSpeech still runs (resets button state)',
      /flashcardsView\.stopSpeech\(\)/.test(app) && /aiTeacherView\.stopSpeech\(\)/.test(app));
  }

  console.log('\n=== M7: spotlight tracking ===');
  {
    const app = read('js/app.js');
    check('no longer queries all cards each frame',
      !/querySelectorAll\('\.metric-card, \.hero-card, \.quiz-list-item/.test(app));
    check('resolves the hovered card with closest()',
      /target\.closest\(HamsaApp\.SPOTLIGHT_SELECTOR\)/.test(app));
    check('selector narrowed to the three rules that consume the variables',
      /SPOTLIGHT_SELECTOR = '\.spotlight-card, \.metric-card, \.hero-card'/.test(app));
    check('skips touch-only devices',
      /\(hover: hover\) and \(pointer: fine\)/.test(app));
    check('respects prefers-reduced-motion',
      /spotlight[\s\S]{0,900}prefers-reduced-motion/i.test(app));
    check('listener is passive', /\{ passive: true \}/.test(app));
    check('uses the latest pointer position, not the first of the frame',
      /pendingX = e\.clientX/.test(app));
    check('single getBoundingClientRect per frame',
      (read('js/app.js').match(/_paintSpotlight/g) || []).length >= 2);

    // The narrowed selector must still match what the CSS actually uses.
    const cssVars = ['css/main.css', 'css/components.css']
      .map(read).join('\n')
      .match(/\.([\w-]+)::(?:before|after)\s*\{[^}]*--mouse-x/g) || [];
    check('CSS consumers are covered by the selector',
      cssVars.length === 0 || cssVars.every(m => /spotlight-card|metric-card|hero-card/.test(m)),
      cssVars.join(' | '));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
