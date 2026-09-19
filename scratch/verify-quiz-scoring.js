/**
 * Verify Phase 2 quiz integrity work:
 *   H4 — negative marking / marks-based scoring (computeQuizScore in db.js)
 *   H2 — in-progress attempt persistence and resume
 *   H3 — wall-clock exam timer (no extra time from throttled tabs)
 *   H1 — timer + keyboard cleanup on leaving the view
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DB_SRC = fs.readFileSync(path.join(ROOT, 'js', 'db.js'), 'utf8');
const PLAYER_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'quiz-player.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const TABLES = ['quizzes', 'questions', 'attempts', 'notes', 'customDecks', 'customCards',
  'cardReviews', 'exams', 'savedExams', 'answers', 'answerDrafts', 'aiTeacherExplanations'];

/** Sandbox with db.js loaded (for computeQuizScore / EXAM_SCORING_PRESETS). */
function loadDb() {
  const db = { verno: 7 };
  const chain = { stores: () => chain, upgrade: () => chain };
  db.version = () => chain;
  for (const t of TABLES) {
    db[t] = {
      rows: [],
      async toArray() { return this.rows; }, async count() { return this.rows.length; },
      async clear() { this.rows = []; }, async bulkPut(r) { this.rows.push(...r); },
      async add(r) { this.rows.push(r); return this.rows.length; },
      async update() { return 1; }, async get() { return null; },
      orderBy() { return this; }, reverse() { return this; }, where() { return this; },
      equals() { return this; }, filter() { return this; }, or() { return this; }
    };
  }
  db.transaction = async (_m, _t, fn) => fn();

  const store = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Dexie: function () { return db; },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(DB_SRC, { filename: 'db.js' }).runInContext(sandbox);
  return { sandbox, store };
}

function makeQuestions(n, correctIdx = 0) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, correctAnswerIndex: correctIdx }));
}

(async () => {
  const { sandbox } = loadDb();
  // db.js publishes these on window, so views never rely on cross-script
  // lexical scoping (top-level `const` is not a property of the global object).
  const computeQuizScore = sandbox.window.computeQuizScore;
  const EXAM_SCORING_PRESETS = sandbox.window.EXAM_SCORING_PRESETS;

  check('scoring API published on window',
    typeof computeQuizScore === 'function' && !!EXAM_SCORING_PRESETS);

  // ------------------------------------------------- H4: marking schemes
  console.log('\n=== H4: marking schemes ===');
  {
    check('5 presets defined', Object.keys(EXAM_SCORING_PRESETS).length === 5,
      Object.keys(EXAM_SCORING_PRESETS).join(','));
    check('UPSC is +2/-1/3', EXAM_SCORING_PRESETS.UPSC_PRELIMS.marksPerCorrect === 2 &&
      Math.abs(EXAM_SCORING_PRESETS.UPSC_PRELIMS.negativeMarkPerWrong - 2 / 3) < 1e-9);
    check('SSC is +2/-0.5', EXAM_SCORING_PRESETS.SSC.marksPerCorrect === 2 &&
      EXAM_SCORING_PRESETS.SSC.negativeMarkPerWrong === 0.5);
    check('Banking is +1/-0.25', EXAM_SCORING_PRESETS.BANKING.negativeMarkPerWrong === 0.25);
    check('NEET is +4/-1', EXAM_SCORING_PRESETS.NEET.marksPerCorrect === 4 &&
      EXAM_SCORING_PRESETS.NEET.negativeMarkPerWrong === 1);
  }

  console.log('\n=== H4: scoring maths ===');
  {
    const qs = makeQuestions(10);
    // 6 correct, 3 wrong, 1 skipped
    const answers = {};
    for (let i = 1; i <= 6; i++) answers[i] = 0;   // correct
    for (let i = 7; i <= 9; i++) answers[i] = 1;   // wrong
    // q10 left unanswered

    const none = computeQuizScore(qs, answers, { scoringPreset: 'NONE' });
    check('NONE: counts split correctly', none.correct === 6 && none.incorrect === 3 && none.skipped === 1);
    check('NONE: no penalty', none.marksLostToNegative === 0);
    check('NONE: 6/10 marks', none.marksObtained === 6 && none.maxMarks === 10);
    check('NONE: 60%', none.percentage === 60);

    const upsc = computeQuizScore(qs, answers, { scoringPreset: 'UPSC_PRELIMS' });
    check('UPSC: max marks 20', upsc.maxMarks === 20);
    check('UPSC: positive 12', upsc.positiveMarks === 12);
    check('UPSC: penalty 2 (3 x 2/3)', upsc.marksLostToNegative === 2, `got ${upsc.marksLostToNegative}`);
    check('UPSC: net 10 marks', upsc.marksObtained === 10, `got ${upsc.marksObtained}`);
    check('UPSC: 50% of paper', upsc.percentage === 50, `got ${upsc.percentage}`);

    const neet = computeQuizScore(qs, answers, { scoringPreset: 'NEET' });
    check('NEET: 24 - 3 = 21', neet.marksObtained === 21, `got ${neet.marksObtained}`);
    check('NEET: max 40', neet.maxMarks === 40);

    check('accuracy is over attempted only', none.accuracy === 67, `got ${none.accuracy}`);
    check('attempted excludes skipped', none.attempted === 9);
  }

  console.log('\n=== H4: skip vs wrong are no longer equivalent ===');
  {
    const qs = makeQuestions(4);
    const allSkipped = computeQuizScore(qs, {}, { scoringPreset: 'UPSC_PRELIMS' });
    const allWrong = computeQuizScore(qs, { 1: 1, 2: 1, 3: 1, 4: 1 }, { scoringPreset: 'UPSC_PRELIMS' });

    check('skipping scores 0', allSkipped.marksObtained === 0);
    check('guessing wrong scores negative', allWrong.marksObtained < 0, `got ${allWrong.marksObtained}`);
    check('wrong is strictly worse than skipping', allWrong.marksObtained < allSkipped.marksObtained);
    check('negative percentage is reported honestly', allWrong.percentage < 0, `got ${allWrong.percentage}`);
  }

  console.log('\n=== H4: edge cases ===');
  {
    check('zero questions does not divide by zero',
      computeQuizScore([], {}, { scoringPreset: 'UPSC_PRELIMS' }).percentage === 0);
    const unknown = computeQuizScore(makeQuestions(2), { 1: 0 }, { scoringPreset: 'DOES_NOT_EXIST' });
    check('unknown preset falls back to NONE', unknown.marksPerCorrect === 1 && unknown.negativeMarkPerWrong === 0);
    const override = computeQuizScore(makeQuestions(2), { 1: 1 }, { marksPerCorrect: 5, negativeMarkPerWrong: 2 });
    check('explicit overrides respected', override.marksObtained === -2, `got ${override.marksObtained}`);
    const negGuard = computeQuizScore(makeQuestions(1), { 1: 1 }, { negativeMarkPerWrong: -5 });
    check('negative penalty value clamped to 0', negGuard.marksLostToNegative === 0);
  }

  // ------------------------------- H1/H2/H3: player lifecycle (static checks)
  console.log('\n=== H3: timer is wall-clock, not tick-counted ===');
  {
    check('no remainingSeconds-- decrement', !/this\.remainingSeconds--/.test(PLAYER_SRC));
    check('uses a deadline timestamp', /this\.examDeadline\s*=\s*Date\.now\(\)/.test(PLAYER_SRC));
    check('remaining derived from Date.now()', /getRemainingSeconds\(\)\s*\{[\s\S]*Date\.now\(\)/.test(PLAYER_SRC));
    check('elapsed derived from Date.now()', /getElapsedSeconds\(\)\s*\{[\s\S]*Date\.now\(\)/.test(PLAYER_SRC));
    check('resyncs on visibilitychange', /visibilitychange/.test(PLAYER_SRC));
    check('auto-submit guarded against double fire', /_timeUpHandled/.test(PLAYER_SRC));
  }

  console.log('\n=== H1: cleanup contract ===');
  {
    check('player exposes onLeaveView()', /onLeaveView\(\)\s*\{/.test(PLAYER_SRC));
    check('onLeaveView stops the timer', /onLeaveView\(\)[\s\S]{0,300}stopExamTimer\(\)/.test(PLAYER_SRC));
    check('onLeaveView detaches keyboard', /onLeaveView\(\)[\s\S]{0,300}detachKeyboard\(\)/.test(PLAYER_SRC));
    check('onLeaveView detaches lifecycle listeners',
      /onLeaveView\(\)[\s\S]{0,300}detachLifecycleListeners\(\)/.test(PLAYER_SRC));

    const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const hookCount = (appSrc.match(/quizPlayerView\.onLeaveView\(\)/g) || []).length;
    check('app.js calls onLeaveView from navigate + startQuiz + viewQuizResult',
      hookCount === 3, `found ${hookCount}`);
  }

  console.log('\n=== H2: persistence contract ===');
  {
    check('uses a dedicated storage key', /ACTIVE_ATTEMPT_STORAGE_KEY/.test(PLAYER_SRC));
    check('stale saves expire', /ACTIVE_ATTEMPT_MAX_AGE_MS/.test(PLAYER_SRC));
    check('persists on answer select', /selectOption[\s\S]{0,700}_persistProgress\(\)/.test(PLAYER_SRC));
    check('persists on beforeunload', /beforeunload/.test(PLAYER_SRC));
    check('offers resume prompt', /_askResume/.test(PLAYER_SRC));
    check('clears saved copy after submit', /_clearSavedProgress\(\)/.test(PLAYER_SRC));
    check('guards double submission', /_isSubmitting/.test(PLAYER_SRC));
    check('stores remaining time, not absolute deadline',
      /remainingSeconds:\s*this\.examDeadline\s*\?/.test(PLAYER_SRC));
  }

  // --------------------------------- H2: round-trip the persistence payload
  console.log('\n=== H2: save/restore round trip ===');
  {
    // Exercise the real _persistProgress / _loadSavedProgress / _applySavedProgress
    // logic by instantiating the class with a minimal browser shim.
    const store = new Map();
    const sb = {
      console, setTimeout, clearTimeout, setInterval, clearInterval, Date,
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

    const view = sb.window.quizPlayerView;
    view.quiz = { id: 42, quizMode: 'EXAM' };
    view.questions = makeQuestions(10);
    view.currentIndex = 4;
    view.userAnswers = { 1: 0, 2: 1, 3: 0 };
    view.flaggedQuestions = new Set([2, 5]);
    view.lockedQuestions = new Set([1]);
    view.accumulatedSeconds = 30;
    view.sittingStartedAt = Date.now();
    view.examDeadline = Date.now() + 600 * 1000;

    view._persistProgress();
    const raw = store.get('hamsa_active_quiz_attempt');
    check('progress written to storage', !!raw);

    const saved = JSON.parse(raw);
    check('saved quizId', saved.quizId === 42);
    check('saved answers', Object.keys(saved.userAnswers).length === 3);
    check('saved flags as array', Array.isArray(saved.flagged) && saved.flagged.length === 2);
    check('saved remaining seconds ~600', Math.abs(saved.remainingSeconds - 600) <= 2, `got ${saved.remainingSeconds}`);

    // Restore into a fresh instance.
    const loaded = view._loadSavedProgress(42);
    check('load finds matching attempt', !!loaded);
    check('load rejects a different quiz', view._loadSavedProgress(99) === null);

    view.currentIndex = 0;
    view.userAnswers = {};
    view.flaggedQuestions = new Set();
    view.lockedQuestions = new Set();
    view.accumulatedSeconds = 0;
    view._applySavedProgress(loaded);

    check('restored currentIndex', view.currentIndex === 4);
    check('restored answers', view.userAnswers[2] === 1);
    check('restored flags as Set', view.flaggedQuestions.has(5));
    check('restored locked as Set', view.lockedQuestions.has(1));
    check('restored elapsed time', view.accumulatedSeconds === 30);
    check('deadline rebuilt from remaining time', view.getRemainingSeconds() > 590);

    // Expired exam must not be resumable.
    store.set('hamsa_active_quiz_attempt', JSON.stringify({
      quizId: 42, quizMode: 'EXAM', remainingSeconds: 0,
      userAnswers: { 1: 0 }, currentIndex: 3, savedAt: Date.now()
    }));
    check('expired exam is not resumable', view._loadSavedProgress(42) === null);

    // Stale save must be discarded.
    store.set('hamsa_active_quiz_attempt', JSON.stringify({
      quizId: 42, quizMode: 'PRACTICE', userAnswers: { 1: 0 }, currentIndex: 2,
      savedAt: Date.now() - 48 * 60 * 60 * 1000
    }));
    check('stale save discarded', view._loadSavedProgress(42) === null);

    // Untouched quiz is not worth resuming.
    store.set('hamsa_active_quiz_attempt', JSON.stringify({
      quizId: 42, quizMode: 'PRACTICE', userAnswers: {}, currentIndex: 0, savedAt: Date.now()
    }));
    check('no-progress save ignored', view._loadSavedProgress(42) === null);

    // Corrupt JSON must not throw.
    store.set('hamsa_active_quiz_attempt', '{broken');
    let threw = false;
    try { view._loadSavedProgress(42); } catch { threw = true; }
    check('corrupt save handled without throwing', !threw);

    check('clearSavedProgress removes the key',
      (view._clearSavedProgress(), !store.has('hamsa_active_quiz_attempt')));

    // elapsedSeconds must stay readable (it became a getter).
    view.accumulatedSeconds = 7;
    view.sittingStartedAt = Date.now();
    check('elapsedSeconds getter works', typeof view.elapsedSeconds === 'number' && view.elapsedSeconds >= 7);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
