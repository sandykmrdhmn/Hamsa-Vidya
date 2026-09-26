/**
 * Verify the Study Notes extraction scope ("only make notes of X").
 *
 * ===========================================================================
 * WHAT WAS ADDED
 * ===========================================================================
 * Uploading a PDF or photo to Study Notes produced notes on EVERYTHING in it.
 * There was no way to say "only the maths questions" or "only the computer
 * shortcut keys". A `focus` instruction now flows:
 *
 *   study-notes.js  this.focusInstruction   (typed, or a preset chip)
 *        -> generateStructuredStudyBook({ focus })
 *        -> every chunk prompt
 *        -> saveNewNote({ focusInstruction })  -> shown in the reader
 *
 * ===========================================================================
 * WHERE THE RISK IS — AND IT IS NOT WHERE IT LOOKS
 * ===========================================================================
 * The prompt already carried a very loud completeness mandate:
 *
 *   "ABSOLUTE ZERO SHORTENING ... NEVER shorten, truncate, summarize, condense,
 *    skip, or omit ANY concept ... WORD COUNT PARITY MANDATE ... If the source
 *    chunk mentions N concepts, ALL N must appear"
 *
 * Appending "only the maths questions" to THAT gives the model two contradictory
 * orders, and the completeness block is longer, louder and repeated — so the
 * model obeys it and the filter silently does nothing. The scope feature is
 * therefore not "add a line to the prompt"; it is "make the completeness mandate
 * conditional". These checks exist mostly to stop that mandate leaking back in
 * alongside a scope.
 *
 * The second risk is honesty. Three separate paths used to answer a failure by
 * substituting `generateStructuredFallbackNote()`, a deterministic splitter that
 * reproduces the WHOLE source. Reached from a scoped request, that answers
 * "only the maths questions" with notes on everything — while looking like it
 * worked. Every one of those paths is asserted here.
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
const section = (title) => console.log(`\n=== ${title} ===`);

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const GEM_SRC = read('js/gemini-service.js');
const GEM_CODE = stripComments(GEM_SRC);
const VIEW_SRC = read('js/views/study-notes.js');
const VIEW_CODE = stripComments(VIEW_SRC);
const DB_SRC = read('js/db.js');
const DB_CODE = stripComments(DB_SRC);
const APP_SRC = read('js/app.js');

/**
 * Run gemini-service.js in a sandbox and capture every prompt it would send.
 *
 * The transport is replaced with a stub, so no network call happens and the
 * prompt text is inspectable — which is the only way to prove the completeness
 * mandate is actually swapped rather than merely accompanied.
 */
function loadGemini({ respond, aiAvailable = true } = {}) {
  const prompts = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout, Date, Math, Number, String, Array, Object, JSON, Map, Set,
    Promise, isNaN, parseInt, parseFloat,
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); }
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  sandbox.aiClient = {
    isAvailable: () => aiAvailable,
    getMode: () => (aiAvailable ? 'PROXY' : 'UNCONFIGURED'),
    async fetchListModels() { return { ok: false, json: async () => ({}) }; },
    async describeError() { return 'stub error'; },
    async fetchGenerateContent(model, payload) {
      const text = payload.contents[0].parts.map(p => p.text || '').join('');
      prompts.push(text);
      return respond(text, prompts.length);
    }
  };

  vm.createContext(sandbox);
  new vm.Script(GEM_SRC, { filename: 'gemini-service.js' }).runInContext(sandbox);
  return { svc: sandbox.window.geminiService || new sandbox.GeminiService(), prompts, sandbox };
}

/** A well-formed response containing one section. */
const okResponse = (sections = 1) => ({
  ok: true,
  json: async () => ({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            sections: Array.from({ length: sections }, (_, i) => ({
              id: `sec-${i + 1}`, heading: `H${i + 1}`, content: 'Body text here.',
              keyPoints: [], definitions: [], importantFacts: [], formulas: [], examples: []
            })),
            glossaryTerms: []
          })
        }]
      }
    }]
  })
});

/** A well-formed response that honestly reports nothing in scope. */
const emptyResponse = () => ({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ sections: [], glossaryTerms: [] }) }] } }]
  })
});

// ===========================================================================
async function promptSwapsTheMandate() {
  section('The completeness mandate is SWAPPED, not merely accompanied');

  const LOUD = [
    'ABSOLUTE ZERO SHORTENING',
    'WORD COUNT PARITY MANDATE',
    'PARAGRAPH-BY-PARAGRAPH COVERAGE',
    'NEVER shorten, truncate, summarize'
  ];

  // ---- unscoped: the original mandate must still be there
  {
    const { svc, prompts } = loadGemini({ respond: () => okResponse() });
    await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'Some source material.' });
    check('a prompt was captured', prompts.length > 0, String(prompts.length));
    for (const phrase of LOUD) {
      check(`unscoped prompt keeps "${phrase.slice(0, 32)}..."`,
        prompts[0].includes(phrase));
    }
    check('unscoped prompt carries no scope block',
      !prompts[0].includes('EXTRACTION SCOPE'));
  }

  // ---- scoped: the mandate must be GONE, replaced by the scoped variant
  {
    const { svc, prompts } = loadGemini({ respond: () => okResponse() });
    await svc.generateStructuredStudyBook({
      topic: 'T', rawText: 'Some source material.',
      focus: 'only the maths questions'
    });
    const p = prompts[0];

    for (const phrase of LOUD) {
      check(`scoped prompt DROPS "${phrase.slice(0, 32)}..."`,
        !p.includes(phrase),
        'leaving it in gives the model contradictory orders and the filter stops working');
    }

    check('the scope block is present', p.includes('EXTRACTION SCOPE'));
    check('the scope outranks what follows',
      /THIS OUTRANKS EVERYTHING BELOW/.test(p));
    check('the instruction appears verbatim',
      p.includes('only the maths questions'));
    check('out-of-scope material is ordered omitted entirely',
      /OMIT EVERYTHING ELSE\s*\n?\s*ENTIRELY/.test(p) || /OMIT EVERYTHING ELSE/.test(p));
    check('the model is told not to allude to omitted material',
      /Do not mention, summarise, list or allude to the out-of-scope material/.test(p));
    check('completeness is rescoped rather than abandoned',
      /EXHAUSTIVE WITHIN SCOPE/.test(p),
      'otherwise a scoped note becomes a lazy one-line list');
    check('an explicit empty result is authorised',
      /\{"sections": \[\], "glossaryTerms": \[\]\}/.test(p));
    check('padding to avoid an empty result is forbidden',
      /never\s*\n?\s*pad it with unrelated content/i.test(p));
    check('scope beats perceived importance',
      /not\s*\n?\s*by what looks academically important/.test(p) ||
      /Judge scope by what the student asked for/.test(p));
  }

  // ---- repetition: the source chunk sits between the instruction and the
  // response format, so one mention at the top gets buried.
  {
    const { svc, prompts } = loadGemini({ respond: () => okResponse() });
    await svc.generateStructuredStudyBook({
      topic: 'T', rawText: 'x'.repeat(200), focus: 'only the shortcut keys'
    });
    const occurrences = (prompts[0].match(/only the shortcut keys/g) || []).length;
    check('the instruction is repeated after the source material',
      occurrences >= 3, `appears ${occurrences} time(s) — a 4000-char chunk buries a single mention`);
    const srcIdx = prompts[0].indexOf('SOURCE MATERIAL CHUNK');
    const lastIdx = prompts[0].lastIndexOf('only the shortcut keys');
    check('at least one mention comes after the source block',
      lastIdx > srcIdx, `source@${srcIdx} lastScope@${lastIdx}`);
  }
}

// ===========================================================================
async function focusIsCapped() {
  section('The instruction is capped, and the cap is disclosed');

  check('gemini-service declares the cap',
    /static MAX_FOCUS_CHARS = 500/.test(GEM_CODE));
  check('the view declares the same cap',
    /static MAX_FOCUS_CHARS = 500/.test(VIEW_CODE),
    'the textarea maxlength and the service cap must agree');

  const { svc, prompts } = loadGemini({ respond: () => okResponse() });
  const long = 'q'.repeat(700);
  await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'src', focus: long });

  check('an over-long instruction is truncated to the cap',
    !prompts[0].includes('q'.repeat(501)) && prompts[0].includes('q'.repeat(500)),
    'the instruction is repeated per chunk, so it must be bounded');
  check('the truncation is disclosed in the prompt, not silent',
    /has been cut to that length/.test(prompts[0]),
    'the answer-writing service sets this precedent');

  // Whitespace-only must count as no focus at all, or the prompt gains an empty
  // scope block that forbids everything.
  const { svc: s2, prompts: p2 } = loadGemini({ respond: () => okResponse() });
  await s2.generateStructuredStudyBook({ topic: 'T', rawText: 'src', focus: '   \n\t  ' });
  check('a whitespace-only focus is treated as no focus',
    !p2[0].includes('EXTRACTION SCOPE'), 'an empty scope block would forbid everything');
}

// ===========================================================================
async function emptyIsAValidScopedAnswer() {
  section('"Nothing in scope" is a valid answer, not a model failure');

  // Unscoped, an empty sections array means the model failed on real material —
  // the loop should try the next model.
  {
    let calls = 0;
    const { svc } = loadGemini({ respond: () => { calls++; return emptyResponse(); } });
    await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'real material here' });
    check('unscoped: an empty response is retried across models',
      calls > 1, `only ${calls} attempt(s)`);
  }

  // Scoped, an empty array is the correct answer for an off-topic chunk.
  // Retrying every model on it burns quota and then throws the result away.
  {
    let calls = 0;
    let threw = null;
    const { svc } = loadGemini({ respond: () => { calls++; return emptyResponse(); } });
    try {
      await svc.generateStructuredStudyBook({
        topic: 'T', rawText: 'material with no maths in it',
        focus: 'only the maths questions'
      });
    } catch (err) { threw = err; }

    check('scoped: an empty response is accepted on the first model',
      calls === 1, `${calls} attempt(s) — retrying a correct answer wastes quota`);
    check('scoped: an all-empty run reports no match rather than returning a note',
      threw && threw.code === 'SCOPE_NO_MATCH', String(threw && threw.code));
    check('the message names the instruction that matched nothing',
      threw && /only the maths questions/.test(threw.message), threw && threw.message);
    check('the message states that nothing was saved',
      threw && /Nothing was saved/.test(threw.message));
  }
}

// ===========================================================================
async function neverSubstitutesUnscopedNotes() {
  section('A scoped request never falls back to unscoped notes');

  // Path 1: every chunk came back empty (covered above) — assert the guard exists
  // in source, since that is what stops the outer catch swallowing it.
  check('the no-match error is thrown with a code, not a message to match on',
    /err\.code = GeminiService\.SCOPE_NO_MATCH/.test(GEM_CODE));
  check('the outer catch re-throws SCOPE_NO_MATCH instead of falling back',
    /err\.code === GeminiService\.SCOPE_NO_MATCH/.test(GEM_CODE),
    'the fallback formatter rebuilds the ENTIRE source — the opposite of a scoped note');

  // Path 2: transport failure on a scoped request. The fallback is still used
  // for UNSCOPED runs (that behaviour is deliberate and unchanged).
  {
    const { svc } = loadGemini({ respond: () => ({ ok: false, json: async () => ({ error: { message: 'boom' } }) }) });
    const res = await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'a\n\nb\n\n' + 'x'.repeat(60) });
    check('unscoped: a transport failure still yields the offline fallback note',
      !!res && Array.isArray(res.sections),
      'this is existing behaviour and must not regress');
  }
  {
    let threw = null;
    const { svc } = loadGemini({ respond: () => ({ ok: false, json: async () => ({ error: { message: 'boom' } }) }) });
    try {
      await svc.generateStructuredStudyBook({
        topic: 'T', rawText: 'a\n\nb\n\n' + 'x'.repeat(60), focus: 'only the formulas'
      });
    } catch (err) { threw = err; }
    check('scoped: a transport failure does NOT yield an unscoped note',
      threw && threw.code === 'SCOPE_NO_MATCH',
      threw ? threw.message : 'returned a note instead of reporting the failure');
  }

  // Path 3: no API key at all. The offline generator is a paragraph splitter —
  // it cannot judge scope, so a scoped request must be refused outright.
  {
    let threw = null;
    const { svc } = loadGemini({ respond: () => okResponse(), aiAvailable: false });
    try {
      await svc.generateStructuredStudyBook({
        topic: 'T', rawText: 'source', focus: 'only the definitions'
      });
    } catch (err) { threw = err; }
    check('offline: a scoped request is refused, not silently widened',
      threw && threw.code === 'SCOPE_NO_MATCH', String(threw && threw.message));
    check('the refusal explains what to do about it',
      threw && /Add a key in Settings|clear the focus/.test(threw.message), threw && threw.message);
  }
  {
    const { svc } = loadGemini({ respond: () => okResponse(), aiAvailable: false });
    const res = await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'a\n\n' + 'y'.repeat(60) });
    check('offline: an UNSCOPED request still builds the offline note',
      !!res && Array.isArray(res.sections), 'offline full notes must keep working');
  }

  // Path 4: cancellation. Building and saving a note after the user pressed
  // Cancel is the opposite of cancelling — this was already wrong before scoping.
  {
    let threw = null;
    const { svc } = loadGemini({
      respond: () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    });
    try {
      await svc.generateStructuredStudyBook({ topic: 'T', rawText: 'x'.repeat(80) });
    } catch (err) { threw = err; }
    check('a cancelled run propagates AbortError instead of saving a note',
      threw && threw.name === 'AbortError',
      threw ? threw.message : 'returned a fallback note after the user cancelled');
  }
}

// ===========================================================================
async function scopeReachesTheNote() {
  section('The instruction is persisted on the note');

  const { svc } = loadGemini({ respond: () => okResponse(2) });
  const scoped = await svc.generateStructuredStudyBook({
    topic: 'Chapter 4', rawText: 'source', focus: 'only the shortcut keys'
  });
  check('the result carries focusInstruction',
    scoped.focusInstruction === 'only the shortcut keys', String(scoped.focusInstruction));
  check('the description says the note is focused',
    /Focused note on "only the shortcut keys"/.test(scoped.description), scoped.description);

  const full = await svc.generateStructuredStudyBook({ topic: 'Chapter 4', rawText: 'source' });
  check('an unscoped note reports an empty focus, not undefined',
    full.focusInstruction === '', JSON.stringify(full.focusInstruction));
  check('an unscoped description is unchanged',
    /Comprehensive digital textbook note/.test(full.description), full.description);

  // saveNewNote writes a fixed allow-list; a field missing from it is dropped
  // silently no matter what the caller passes.
  check('saveNewNote persists focusInstruction',
    /focusInstruction: typeof noteData\.focusInstruction === 'string'/.test(DB_CODE),
    'the note entity is an allow-list — an unlisted field is dropped without warning');
  check('it defaults to an empty string rather than undefined',
    /focusInstruction:[\s\S]{0,120}:\s*''/.test(DB_CODE));
  check('the view sets it on the object saveNewNote receives',
    /structuredBook\.focusInstruction = focus/.test(VIEW_CODE));
}

// ===========================================================================
function viewMarkupAndHandlers() {
  section('The form: input, presets, and no re-render while typing');

  check('a Step 3 scope section exists', /What should AI take out of it\?/.test(VIEW_SRC));
  check('it is marked optional', /Optional<\/span>/.test(VIEW_SRC));
  check('the empty-state behaviour is stated',
    /Leave this empty to get complete notes/.test(VIEW_SRC));

  check('a focus textarea exists', /id="create-input-focus"/.test(VIEW_SRC));
  check('it is labelled', /<label for="create-input-focus"/.test(VIEW_SRC));
  check('its maxlength comes from the shared constant',
    /maxlength="\$\{StudyNotesView\.MAX_FOCUS_CHARS\}"/.test(VIEW_SRC),
    'a visible maxlength beats a truncation the user cannot see');
  check('the value is re-emitted from state, escaped',
    /oninput="studyNotesView\.onFocusInput\(this\.value\)">\$\{this\.escapeHtml\(this\.focusInstruction\)\}<\/textarea>/.test(VIEW_SRC),
    'attaching a file re-renders the form; a DOM-only value would be lost');

  // The focus-preservation contract.
  const inputHandler = VIEW_SRC.match(/onFocusInput\(rawVal\)\s*\{([\s\S]*?)\n {2}\}/);
  check('onFocusInput exists', !!inputHandler);
  if (inputHandler) {
    check('typing does NOT re-render',
      !/this\.render\(\)/.test(inputHandler[1]),
      'renderCreateView() replaces innerHTML — a render on input destroys the caret');
    check('typing repaints only the badge',
      /updateFocusBadge\(\)/.test(inputHandler[1]));
    check('typing is capped at the shared constant',
      /slice\(0, StudyNotesView\.MAX_FOCUS_CHARS\)/.test(inputHandler[1]));
  }
  check('the badge is repainted by a targeted textContent write',
    /updateFocusBadge\(\)\s*\{[\s\S]{0,220}badge\.textContent/.test(VIEW_SRC));

  // Presets.
  check('preset scopes are declared as a static list',
    /static FOCUS_PRESETS = \[/.test(VIEW_SRC));
  check('the presets cover the cases the user asked for',
    /only the questions and their full step-by-step solutions/.test(VIEW_SRC) &&
    /only the computer shortcut keys/.test(VIEW_SRC),
    '"only maths questions" and "only shortcut keys" were the two examples given');
  check('presets are full instructions, not bare keywords',
    StudyNotesView_presetsAreSentences(), 'a keyword is ambiguous inside a prompt');
  check('preset chips are real <button> elements',
    /<button type="button"\s*\n?\s*class="select-chip/.test(VIEW_SRC),
    'a clickable div would need the runtime a11y promotion');
  check('preset text is escaped for JS and HTML before the onclick',
    /applyFocusPreset\('\$\{this\.escapeHtml\(this\.escapeJs\(p\.text\)\)\}'\)/.test(VIEW_SRC));
  check('tapping the active preset again clears it',
    /this\.focusInstruction = \(this\.focusInstruction === next\) \? '' : next/.test(VIEW_SRC),
    'a preset that cannot be undone is a trap');
  check('there is an explicit Clear control', /clearFocus\(\)/.test(VIEW_SRC));

  // The honest promise made in the UI must match what the service does.
  check('the UI states that nothing is saved when nothing matches',
    /If the material contains none of it, nothing is saved/.test(VIEW_SRC));
  check('the UI promises no unrelated notes as a substitute',
    /you will not get unrelated notes instead/.test(VIEW_SRC));

  // The focus survives a successful run, since building several scoped notes
  // from different files is the common case.
  check('the focus is not cleared after a successful run',
    /The focus is intentionally KEPT/.test(VIEW_SRC) &&
    !/this\.focusInstruction = '';\s*\n\s*if \(window\.audioEngine\) window\.audioEngine\.playFanfare/.test(VIEW_SRC));

  // Reuses existing classes — css/components/* is byte-frozen.
  for (const cls of ['live-reading-canvas', 'chips-select-grid', 'select-chip', 'reading-status-banner']) {
    check(`reuses the existing .${cls}`, VIEW_SRC.includes(cls));
  }
}

/** Presets must read as instructions ("only the …"), not single keywords. */
function StudyNotesView_presetsAreSentences() {
  const block = VIEW_SRC.slice(VIEW_SRC.indexOf('static FOCUS_PRESETS'));
  const texts = [...block.slice(0, block.indexOf('];')).matchAll(/text: '([^']+)'/g)].map(m => m[1]);
  return texts.length >= 4 && texts.every(t => /^only /.test(t) && t.split(/\s+/).length >= 4);
}

// ===========================================================================
function readerDisclosesScope() {
  section('The reader says the note is scoped');

  check('a scope banner renderer exists',
    /renderFocusScopeBanner\(note\)\s*\{/.test(VIEW_SRC));
  check('it is rendered in the reader',
    /\$\{this\.renderFocusScopeBanner\(note\)\}/.test(VIEW_SRC));
  check('it returns nothing for a normal note',
    /if \(!scope\) return '';/.test(VIEW_SRC),
    'existing notes must look exactly as before');
  check('it reads the persisted field defensively',
    /typeof note\.focusInstruction === 'string'/.test(VIEW_SRC));
  check('it names the scope', /Built from the uploaded material taking only/.test(VIEW_SRC));
  check('it states that omission was intentional',
    /intentionally left out/.test(VIEW_SRC),
    'otherwise a scoped note reads as a full note with content mysteriously missing');
  check('it points at the untouched original',
    /Original Source/.test(VIEW_SRC.slice(VIEW_SRC.indexOf('renderFocusScopeBanner'),
                                          VIEW_SRC.indexOf('renderFocusScopeBanner') + 1400)));
  check('the banner escapes the stored instruction',
    /\$\{this\.escapeHtml\(scope\)\}/.test(VIEW_SRC));
}

// ===========================================================================
function generationLifecycle() {
  section('Study Notes now uses the shared generation lifecycle');

  // It used to toggle #generating-overlay by hand in three places, so Cancel
  // only hid the overlay: the request kept running, then reported a failure.
  check('no direct overlay toggling remains in the view',
    !/overlay\.classList\.(add|remove)\('active'\)/.test(VIEW_CODE),
    'app.beginGeneration()/endGeneration() own the overlay');
  check('no stale getElementById(\'generating-overlay\') lookups remain',
    !/getElementById\('generating-overlay'\)/.test(VIEW_CODE));

  const begins = (VIEW_CODE.match(/app\.beginGeneration\(/g) || []).length;
  const ends = (VIEW_CODE.match(/app\.endGeneration\(\)/g) || []).length;
  check('all three AI entry points call beginGeneration', begins === 3, `found ${begins}`);
  check('each has matching endGeneration calls on both paths',
    ends >= begins * 2, `${ends} endGeneration for ${begins} beginGeneration`);

  check('beginGeneration\'s refusal is respected',
    /if \(!app\.beginGeneration\([\s\S]{0,140}\)\) return;/.test(VIEW_CODE),
    'it returns false when a generation is already running');

  const cancelChecks = (VIEW_CODE.match(/app\.isGenerationCancelled\(\)/g) || []).length;
  check('every entry point suppresses the cancel "error" toast',
    cancelChecks === 3, `found ${cancelChecks}`);
  check('AbortError is also treated as a cancel',
    (VIEW_CODE.match(/err\.name === 'AbortError'|e\.name === 'AbortError'/g) || []).length >= 3);

  // The lifecycle itself must still be the one hardening asserts.
  check('the app still exposes the contract',
    /beginGeneration\(label/.test(APP_SRC) && /endGeneration\(\)\s*\{/.test(APP_SRC) &&
    /isGenerationCancelled\(\)\s*\{/.test(APP_SRC));

  // The scoped no-match is reported as a warning, not an error — it is a real
  // answer about the material, not a malfunction.
  check('SCOPE_NO_MATCH is surfaced to the user',
    /err\.code === 'SCOPE_NO_MATCH'/.test(VIEW_CODE));
  check('it is shown as a warning rather than an error',
    /showToast\(err\.message, 'warning'\)/.test(VIEW_CODE));
}

// ===========================================================================
function ocrStaysUnscoped() {
  section('Vision OCR keeps full fidelity');

  // The scope is applied once, at the structuring step. Filtering during OCR
  // would corrupt `originalSource`, which the reader's "Original Source" tab
  // shows and which the scope banner points the user at.
  const ocr = GEM_SRC.slice(GEM_SRC.indexOf('async extractTextFromImage'),
                            GEM_SRC.indexOf('async generateStructuredStudyBook'));
  check('extractTextFromImage takes no focus parameter',
    !/focus/.test(ocr),
    'OCR must transcribe everything so the saved original source stays complete');
  check('OCR still asks for ALL text', /Extract ALL text/.test(ocr));
  check('the full transcription is what gets stored as the original source',
    /originalSource = \{[\s\S]{0,120}text: combinedSourceText/.test(VIEW_CODE));
}

// ===========================================================================
(async () => {
  await promptSwapsTheMandate();
  await focusIsCapped();
  await emptyIsAValidScopedAnswer();
  await neverSubstitutesUnscopedNotes();
  await scopeReachesTheNote();
  viewMarkupAndHandlers();
  readerDisclosesScope();
  generationLifecycle();
  ocrStaysUnscoped();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
