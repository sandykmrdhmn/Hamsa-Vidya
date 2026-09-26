/**
 * Verify the custom exam time limit.
 *
 * WHAT CHANGED
 * The exam window used to be invisible and non-negotiable. `_resetAttemptState()`
 * in the player allowed 1.5 minutes per question, the Create Quiz screen never
 * mentioned a timer, and nothing was stored on the quiz row. A student building
 * an SSC mock (~0.96 min/question) or a long descriptive drill had no way to say so.
 *
 * The limit is now chosen on the Create Quiz screen and frozen onto the quiz row
 * as `examDurationSeconds`, the same lifecycle the marking scheme already had.
 *
 * WHERE THE RISK IS
 *
 *   1. AUTO must store `null`, not a computed number. The AI can return fewer
 *      questions than requested; freezing a total computed from the *requested*
 *      count would quietly hand out extra time.
 *   2. The player must fall back to the old heuristic. Every quiz created before
 *      this feature — plus the quick drill, master mock, bookmark drill and
 *      note drill paths, which do not ask — has no stored limit.
 *   3. `durationSeconds` (time SPENT, written at submit) and
 *      `examDurationSeconds` (time ALLOWED) must never be confused. They are
 *      both seconds and sit adjacent on the same row.
 *   4. Typing must not be clamped mid-keystroke, and must not trigger a
 *      re-render — `innerHTML` is rebuilt wholesale, which destroys focus.
 *
 * The form logic and the player's window resolution are pure, so they are
 * executed. The markup and the render/tick agreement are checked statically.
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

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CREATE_SRC = read('js/views/create-quiz.js');
const PLAYER_SRC = read('js/views/quiz-player.js');
const DB_SRC = read('js/db.js');

/** Instantiate CreateQuizView with a minimal browser shim. */
function loadCreateView() {
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null },
    window: {},
    Math, Date, Number, String, Array, Object, JSON, isNaN, parseInt, parseFloat
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  new vm.Script(CREATE_SRC, { filename: 'create-quiz.js' }).runInContext(sb);
  return sb.window.createQuizView;
}

/** Instantiate QuizPlayerView with a minimal browser shim. */
function loadPlayer() {
  const store = new Map();
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Number,
    String, Array, Object, JSON, isNaN, parseInt, parseFloat,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} },
    window: {},
    app: { showToast() {}, showConfirmation() {}, navigate() {} }
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  new vm.Script(PLAYER_SRC, { filename: 'quiz-player.js' }).runInContext(sb);
  return sb.window.quizPlayerView;
}

// ===========================================================================
console.log('\n=== The form resolves a limit ===');
// ===========================================================================
{
  const v = loadCreateView();

  check('a fresh form starts on AUTO', v.durationMode === 'AUTO', v.durationMode);
  check('AUTO stores nothing on the quiz row',
    v.getExamDurationSecondsForSave() === null,
    String(v.getExamDurationSecondsForSave()));

  // ---- the AUTO heuristic
  v.selectedQuestionCount = 10;
  check('AUTO is 1.5 min per question', v.getAutoDurationMinutes() === 15,
    String(v.getAutoDurationMinutes()));
  v.selectedQuestionCount = 100;
  check('AUTO scales with the question count', v.getAutoDurationMinutes() === 150);
  v.selectedQuestionCount = 1;
  check('AUTO never drops below a five-minute floor', v.getAutoDurationMinutes() === 5,
    String(v.getAutoDurationMinutes()));
  v.selectedQuestionCount = 0;
  check('a zero question count does not produce a zero window',
    v.getAutoDurationMinutes() === 5);

  // ---- presets
  v.selectedQuestionCount = 20;
  v.setDurationPreset(45);
  check('a preset switches to CUSTOM', v.durationMode === 'CUSTOM');
  check('the preset value is committed', v.customDurationMinutes === 45);
  check('the raw input text follows the preset', v.customDurationRaw === '45');
  check('CUSTOM stores exact seconds', v.getExamDurationSecondsForSave() === 45 * 60,
    String(v.getExamDurationSecondsForSave()));
  check('the effective minutes are the custom value',
    v.getEffectiveDurationMinutes() === 45);

  v.setDurationPreset(null);
  check('the Auto chip returns to AUTO', v.durationMode === 'AUTO');
  check('and AUTO again stores null', v.getExamDurationSecondsForSave() === null);
  check('effective minutes fall back to the heuristic',
    v.getEffectiveDurationMinutes() === 30, String(v.getEffectiveDurationMinutes()));
}

// ===========================================================================
console.log('\n=== Typing is lenient, committing is strict ===');
// ===========================================================================
{
  const v = loadCreateView();
  v.selectedQuestionCount = 10;

  // Half-typed values must be tolerated, not snapped.
  v.onCustomDurationInput('4');
  check('a single digit is accepted while typing', v.customDurationRaw === '4');
  check('and committed, since 4 is in range', v.customDurationMinutes === 4);

  v.onCustomDurationInput('');
  check('an empty field is not rewritten mid-edit', v.customDurationRaw === '');
  check('the last valid value is retained behind it', v.customDurationMinutes === 4);

  v.onCustomDurationInput('9999');
  check('an out-of-range value is not committed while typing',
    v.customDurationMinutes === 4, String(v.customDurationMinutes));
  v.onCustomDurationBlur();
  check('blur clamps down to the maximum', v.customDurationMinutes === 600,
    String(v.customDurationMinutes));
  check('and normalises the visible text', v.customDurationRaw === '600');

  v.onCustomDurationInput('0');
  v.onCustomDurationBlur();
  check('zero is clamped up to the minimum', v.customDurationMinutes === 1);

  v.onCustomDurationInput('-30');
  v.onCustomDurationBlur();
  check('a negative value is clamped up', v.customDurationMinutes === 1);

  v.onCustomDurationInput('abc');
  v.onCustomDurationBlur();
  check('junk text falls back to a sane default', v.customDurationMinutes === 30,
    String(v.customDurationMinutes));

  v.onCustomDurationInput('45.9');
  v.onCustomDurationBlur();
  check('a decimal is truncated to whole minutes', v.customDurationMinutes === 45);

  // Steppers
  v.setDurationPreset(30);
  v.stepDuration(5);
  check('the + stepper adds five minutes', v.customDurationMinutes === 35);
  v.stepDuration(-5);
  check('the − stepper removes five minutes', v.customDurationMinutes === 30);
  v.setDurationPreset(1);
  v.stepDuration(-5);
  check('the − stepper cannot go below the minimum', v.customDurationMinutes === 1);
  v.setDurationPreset(600);
  v.stepDuration(5);
  check('the + stepper cannot exceed the maximum', v.customDurationMinutes === 600);

  // Typing at all must mean CUSTOM, or the value would be silently discarded.
  v.setDurationPreset(null);
  v.onCustomDurationInput('25');
  check('typing in the box switches off AUTO', v.durationMode === 'CUSTOM',
    'otherwise the typed number is saved as null');
}

// ===========================================================================
console.log('\n=== Labels read well at every scale ===');
// ===========================================================================
{
  const v = loadCreateView();
  check('minutes under an hour', v.formatDurationLabel(45) === '45 min');
  check('exactly one hour', v.formatDurationLabel(60) === '1h', v.formatDurationLabel(60));
  check('hours and minutes', v.formatDurationLabel(90) === '1h 30m');
  check('a whole number of hours drops the minutes', v.formatDurationLabel(180) === '3h');
  check('the maximum is readable', v.formatDurationLabel(600) === '10h');
  check('zero does not throw', v.formatDurationLabel(0) === '0 min');
}

// ===========================================================================
console.log('\n=== The player honours the stored limit ===');
// ===========================================================================
{
  const p = loadPlayer();
  p.questions = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

  // ---- stored limit wins
  p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: 1800 };
  check('a stored limit is used verbatim', p.getExamWindowSeconds() === 1800,
    String(p.getExamWindowSeconds()));

  // ---- fallback for quizzes that never specified one
  p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: null };
  check('null falls back to the heuristic', p.getExamWindowSeconds() === 15 * 60,
    String(p.getExamWindowSeconds()));

  p.quiz = { id: 1, quizMode: 'EXAM' };
  check('a missing field falls back too (pre-feature quizzes)',
    p.getExamWindowSeconds() === 15 * 60);

  check('the fallback matches the form\'s Auto preview',
    p.getExamWindowSeconds() === loadCreateView().getAutoDurationMinutes(10) * 60,
    'the two must agree or the form shows a number the player will not honour');

  // ---- hostile values must not produce a zero or negative window
  for (const bad of [0, -60, NaN, 'abc', Infinity, {}, []]) {
    p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: bad };
    const secs = p.getExamWindowSeconds();
    check(`examDurationSeconds = ${JSON.stringify(bad)} degrades to the heuristic`,
      secs === 15 * 60, String(secs));
  }

  // A string of digits is what a hand-edited IndexedDB row looks like.
  p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: '2400' };
  check('a numeric string is coerced rather than rejected',
    p.getExamWindowSeconds() === 2400, String(p.getExamWindowSeconds()));

  p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: 1234.7 };
  check('a fractional value is rounded to whole seconds',
    p.getExamWindowSeconds() === 1235, String(p.getExamWindowSeconds()));

  // ---- the deadline actually reflects it
  p.quiz = { id: 1, quizMode: 'EXAM', examDurationSeconds: 300 };
  p._resetAttemptState();
  const remaining = p.getRemainingSeconds();
  check('a 5-minute limit produces a ~5-minute deadline',
    Math.abs(remaining - 300) <= 2, String(remaining));

  // ---- practice mode stays untimed regardless of what is stored
  p.quiz = { id: 1, quizMode: 'PRACTICE', examDurationSeconds: 300 };
  p._resetAttemptState();
  check('practice mode ignores the limit and stays untimed',
    p.examDeadline === null && p.getRemainingSeconds() === 0);
}

// ===========================================================================
console.log('\n=== Countdown formatting ===');
// ===========================================================================
{
  const p = loadPlayer();
  check('under a minute', p.formatClock(45) === '00:45', p.formatClock(45));
  check('minutes and seconds', p.formatClock(125) === '02:05', p.formatClock(125));
  check('just under an hour', p.formatClock(3599) === '59:59');
  check('exactly an hour gains an hours field', p.formatClock(3600) === '1:00:00',
    p.formatClock(3600));
  check('a 3-hour paper', p.formatClock(3 * 3600 + 5 * 60 + 9) === '3:05:09');
  check('the 600-minute maximum is readable',
    p.formatClock(600 * 60) === '10:00:00', p.formatClock(600 * 60));
  check('zero renders as 00:00', p.formatClock(0) === '00:00');
  check('a negative value cannot render as a negative clock',
    p.formatClock(-5) === '00:00');
  check('junk renders as 00:00', p.formatClock('abc') === '00:00');

  // Both the first paint and the tick must use it — two copies of the same
  // arithmetic is how they drift apart.
  const src = stripComments(PLAYER_SRC);
  check('render() formats via formatClock',
    /const timerText = this\.formatClock\(/.test(src));
  check('_updateTimerDisplay() formats via formatClock',
    /_updateTimerDisplay\(\)[\s\S]{0,300}this\.formatClock\(/.test(src));
  check('no leftover inline MM:SS arithmetic remains',
    !/padStart\(2, '0'\)\}:\$\{String/.test(src),
    'a second formatter would drift from the first');
}

// ===========================================================================
console.log('\n=== Persistence contract ===');
// ===========================================================================
{
  const db = stripComments(DB_SRC);

  check('saveNewQuiz persists examDurationSeconds',
    /examDurationSeconds:\s*Number\(quizMeta\.examDurationSeconds\)/.test(db));
  check('a non-positive or absent value is stored as null, not 0',
    /examDurationSeconds:[\s\S]{0,140}:\s*null/.test(db),
    '0 would read as "no time at all" if anything ever treated it as a number');

  // The two seconds fields must stay distinguishable.
  check('durationSeconds (time spent) still initialises to 0',
    /durationSeconds:\s*0/.test(db));
  check('the two fields are separate properties',
    /examDurationSeconds/.test(db) && /[^m]durationSeconds:\s*0/.test(db));

  // Adding an unindexed property needs no Dexie migration, but adding it to the
  // index string would. Assert we did not half-do it.
  const storesLine = (DB_SRC.match(/quizzes:\s*'[^']*'/) || [''])[0];
  check('examDurationSeconds was NOT added to the Dexie index string',
    !storesLine.includes('examDurationSeconds'),
    'indexing it would require a db.version() bump to avoid a schema error');

  // The create form is the only caller that sets it today; the drill paths
  // deliberately do not, and must therefore still work.
  const callers = ['js/app.js', 'js/views/library.js', 'js/views/quiz-result.js',
                   'js/views/study-notes.js'];
  for (const f of callers) {
    check(`${f} still calls saveNewQuiz without a limit (uses the fallback)`,
      /saveNewQuiz\(/.test(read(f)) && !/examDurationSeconds/.test(read(f)));
  }
  check('create-quiz.js passes the resolved limit',
    /examDurationSeconds: this\.getExamDurationSecondsForSave\(\)/.test(CREATE_SRC));
}

// ===========================================================================
console.log('\n=== Form markup ===');
// ===========================================================================
{
  check('the time limit section is rendered', /id="duration-total-badge"/.test(CREATE_SRC));
  check('there is an Auto chip wired to the null preset',
    /onclick="createQuizView\.setDurationPreset\(null\)"/.test(CREATE_SRC));
  check('the Auto chip shows the number it will use',
    /Auto \(\$\{this\.formatDurationLabel\(this\.getAutoDurationMinutes\(\)\)\}\)/.test(CREATE_SRC));
  check('there are numeric presets', /setDurationPreset\(\$\{mins\}\)/.test(CREATE_SRC));
  check('a custom text input exists', /id="custom-duration-input"/.test(CREATE_SRC));
  check('the custom input is labelled for screen readers',
    /id="custom-duration-input"[\s\S]{0,300}aria-label="Custom total time in minutes"/.test(CREATE_SRC));
  check('its <label> points at it',
    /<label for="custom-duration-input">/.test(CREATE_SRC));
  check('both steppers have accessible names',
    /aria-label="Decrease time limit by 5 minutes"/.test(CREATE_SRC) &&
    /aria-label="Increase time limit by 5 minutes"/.test(CREATE_SRC));

  // The focus-preservation contract: oninput must not re-render.
  const inputHandler = CREATE_SRC.match(/onCustomDurationInput\(rawVal\)\s*\{([\s\S]*?)\n {2}\}/);
  check('onCustomDurationInput exists', !!inputHandler);
  if (inputHandler) {
    check('typing does NOT trigger a re-render',
      !/this\.render\(\)/.test(inputHandler[1]),
      'innerHTML is rebuilt wholesale — a render on input destroys the caret');
    check('typing repaints the summary directly instead',
      /updateDurationSummary\(\)/.test(inputHandler[1]));
  }
  check('blur does re-render, so the chips reflect the committed value',
    /onCustomDurationBlur\(\)\s*\{[\s\S]{0,300}this\.render\(\)/.test(CREATE_SRC));
  check('Enter commits the value',
    /onkeydown="if\(event\.key==='Enter'\)\{[^"]*onCustomDurationBlur\(\)/.test(CREATE_SRC));

  // Practice mode must say the limit is not applied now, rather than implying
  // a timer that never appears.
  check('practice mode explains that it is untimed',
    /Practice Mode is untimed/.test(CREATE_SRC));

  // Bounds are stated in the UI, not just enforced silently.
  check('the allowed range is shown to the user',
    /Allowed range \$\{CreateQuizView\.DURATION_MIN_MINUTES\}/.test(CREATE_SRC));
  check('the bounds are declared as constants',
    /DURATION_MIN_MINUTES\s*=\s*1/.test(CREATE_SRC) &&
    /DURATION_MAX_MINUTES\s*=\s*600/.test(CREATE_SRC));

  // No new stylesheet: the section reuses the frozen create-quiz vocabulary.
  for (const cls of ['chips-select-grid', 'select-chip', 'stepper-group',
                     'stepper-control', 'stepper-input', 'stepper-btn']) {
    check(`reuses the existing .${cls}`, CREATE_SRC.includes(cls));
  }
}

// ===========================================================================
console.log('\n=== Resume keeps the window that was in force ===');
// ===========================================================================
{
  // The resume path rebuilds the deadline from the SAVED remaining seconds, not
  // from the quiz's configured limit. That is deliberate: a sitting already
  // under way must not be extended (or cut short) by a later edit.
  const p = loadPlayer();
  p.quiz = { id: 7, quizMode: 'EXAM', examDurationSeconds: 3600 };
  p.questions = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

  p._applySavedProgress({
    currentIndex: 2, userAnswers: { 1: 0 }, flagged: [], locked: [],
    elapsedSeconds: 120, remainingSeconds: 400
  });
  const rem = p.getRemainingSeconds();
  check('a resumed sitting keeps its saved remaining time, not the full limit',
    Math.abs(rem - 400) <= 2, `${rem} (limit is 3600)`);
  check('elapsed time carries over', p.accumulatedSeconds === 120);

  // And a fresh start on the same quiz gets the full configured window.
  p._resetAttemptState();
  check('starting over uses the configured limit',
    Math.abs(p.getRemainingSeconds() - 3600) <= 2, String(p.getRemainingSeconds()));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
