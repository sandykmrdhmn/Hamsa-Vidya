/**
 * Verify saved (bookmarked) questions: they must actually reach the Library,
 * and they must be grouped by subject once they do.
 *
 * ===========================================================================
 * THE BUG
 * ===========================================================================
 * Bookmarking a question during a quiz appeared to work — the icon filled in,
 * a toast confirmed it, the results screen listed it under "Bookmarked", and
 * the dashboard counted it. But the Library's Saved Questions tab was always
 * empty.
 *
 * `isBookmarked` is declared as an INDEX — on `questions` in `db.version(1)`
 * and on `aiTeacherExplanations` in `db.version(7)`:
 *
 *     questions: '++id, quizId, questionText, correctAnswerIndex,
 *                 isBookmarked, userSelectedOptionIndex, sourcePage'
 *
 * **IndexedDB cannot index boolean values.** A record whose indexed property is
 * `true` or `false` is not stored in that index at all — it is skipped. Every
 * write site stored a JavaScript boolean, so:
 *
 *     db.questions.where('isBookmarked').equals(1)        -> [] (index is empty)
 *     db.questions.where('isBookmarked').equals(true)     -> DataError
 *                                                            (not a valid key)
 *
 * The old `getBookmarkedQuestions()` used exactly that query. The dashboard
 * count kept working because it reads with an in-memory `filter()` and never
 * touches the index — which is why the data was demonstrably on disk and
 * counted in one place while being invisible in another.
 *
 * ===========================================================================
 * WHY THIS SUITE HAS ITS OWN FAKE
 * ===========================================================================
 * The shared fake in verify-data-honesty.js stubs `where()`/`equals()`/
 * `filter()` to `return this` and makes `toArray()` return every row. Under
 * that fake the ORIGINAL BROKEN CODE PASSES. A green suite there proves
 * nothing about this bug.
 *
 * So the fake below models the one IndexedDB rule that caused it: an index
 * contains only records whose value for that key path is a valid key, and
 * booleans are not valid keys. The first section proves the fake reproduces the
 * original failure before anything else is asserted — otherwise this file could
 * pass while testing nothing.
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

const DB_SRC = read('js/db.js');
const DB_CODE = stripComments(DB_SRC);
const LIB_SRC = read('js/views/library.js');
const PLAYER_SRC = read('js/views/quiz-player.js');
const RESULT_SRC = read('js/views/quiz-result.js');
const QUIZ_CSS = read('css/quiz.css');

// ===========================================================================
// A fake Dexie that honours IndexedDB's key rules
// ===========================================================================

/** IndexedDB valid key types. Notably: NOT boolean, NOT null, NOT undefined. */
function isValidIndexedDbKey(v) {
  return (typeof v === 'number' && !Number.isNaN(v))
    || typeof v === 'string'
    || v instanceof Date
    || Array.isArray(v);
}

class DataError extends Error {
  constructor(msg) { super(msg); this.name = 'DataError'; }
}

function makeTable(name, { autoId = true, indexes = [] } = {}) {
  return {
    name,
    rows: [],
    _next: 1,
    indexes,

    async toArray() { return this.rows.map(r => ({ ...r })); },
    async count() { return this.rows.length; },
    async clear() { this.rows = []; this._next = 1; },
    async get(id) {
      const r = this.rows.find(x => x.id === id);
      return r ? { ...r } : undefined;
    },
    async add(row) {
      const id = autoId ? this._next++ : row.id;
      this.rows.push({ ...row, id });
      return id;
    },
    async bulkAdd(rows) {
      const ids = [];
      for (const r of rows) ids.push(await this.add(r));
      return ids;
    },
    async bulkPut(rows) {
      for (const r of rows) {
        const i = this.rows.findIndex(x => x.id === r.id);
        if (i >= 0) this.rows[i] = { ...r };
        else {
          this.rows.push({ ...r });
          if (autoId && Number(r.id) >= this._next) this._next = Number(r.id) + 1;
        }
      }
    },
    async update(id, changes) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return 0;
      Object.assign(r, changes);
      return 1;
    },
    async delete(id) {
      this.rows = this.rows.filter(r => r.id !== id);
    },

    /** A real predicate scan over the records themselves. */
    filter(fn) {
      const rows = this.rows;
      return {
        async toArray() { return rows.filter(fn).map(r => ({ ...r })); },
        async count() { return rows.filter(fn).length; }
      };
    },

    /** Walks the PRIMARY key, so it sees every row regardless of any index. */
    toCollection() {
      const rows = this.rows;
      return {
        async modify(fn) {
          for (const r of rows) fn(r);
          return rows.length;
        },
        async toArray() { return rows.map(r => ({ ...r })); }
      };
    },

    /**
     * An indexed lookup with IndexedDB's actual semantics:
     *   • querying with an invalid key throws DataError
     *   • records whose indexed value is not a valid key are ABSENT from the
     *     index, so they can never match
     */
    where(keyPath) {
      const self = this;
      if (!self.indexes.includes(keyPath)) {
        throw new Error(`KeyPath ${keyPath} on object store ${self.name} is not indexed`);
      }
      const build = (matchFn) => ({
        async toArray() {
          return self.rows
            .filter(r => isValidIndexedDbKey(r[keyPath]) && matchFn(r[keyPath]))
            .map(r => ({ ...r }));
        },
        or: (nextKeyPath) => self.where(nextKeyPath),
        async delete() {
          self.rows = self.rows.filter(
            r => !(isValidIndexedDbKey(r[keyPath]) && matchFn(r[keyPath]))
          );
        }
      });
      return {
        equals(v) {
          if (!isValidIndexedDbKey(v)) {
            throw new DataError('Failed to execute "only" on "IDBKeyRange": The parameter is not a valid key.');
          }
          return build(x => x === v);
        }
      };
    },

    orderBy() { return this; },
    reverse() { return this; }
  };
}

const TABLES = ['quizzes', 'questions', 'attempts', 'notes', 'customDecks',
  'customCards', 'cardReviews', 'exams', 'savedExams', 'answers',
  'answerDrafts', 'aiTeacherExplanations'];

/** Which key paths each table indexes, mirroring the real schema strings. */
const INDEXES = {
  questions: ['quizId', 'questionText', 'correctAnswerIndex', 'isBookmarked',
              'userSelectedOptionIndex', 'sourcePage'],
  aiTeacherExplanations: ['question', 'topic', 'subject', 'language', 'depth',
                          'mode', 'isBookmarked', 'createdAt', 'updatedAt']
};

/**
 * Load js/db.js against the strict fake.
 * @returns {{ sandbox, db, upgrades: Array<{version:number, fn:Function}> }}
 */
function loadDb() {
  const db = { verno: 10 };
  const upgrades = [];

  db.version = (n) => {
    const chain = {
      stores: () => chain,
      upgrade: (fn) => { upgrades.push({ version: n, fn }); return chain; }
    };
    return chain;
  };

  for (const t of TABLES) {
    db[t] = makeTable(t, {
      autoId: t !== 'exams',
      indexes: INDEXES[t] || ['quizId', 'id']
    });
  }

  db.transaction = async (...args) => args[args.length - 1]();

  const store = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, Number, String, Array, Object, JSON, Map, Set, Promise,
    isNaN, parseInt, parseFloat,
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

  return { sandbox, db, upgrades };
}

// ===========================================================================
async function selfTest() {
  section('Self-test: the fake reproduces the original failure');

  const t = makeTable('questions', { indexes: ['isBookmarked'] });
  t.rows = [
    { id: 1, isBookmarked: true },    // the old representation
    { id: 2, isBookmarked: false },
    { id: 3, isBookmarked: 1 },       // the new one
    { id: 4, isBookmarked: 0 }
  ];

  // This is the exact query the old getBookmarkedQuestions() used.
  const viaIndexOne = await t.where('isBookmarked').equals(1).toArray();
  check('a boolean-valued row is absent from the index (the root cause)',
    viaIndexOne.length === 1 && viaIndexOne[0].id === 3,
    `matched ids: ${viaIndexOne.map(r => r.id).join(',')} — row 1 is bookmarked but invisible`);

  let threw = null;
  try { await t.where('isBookmarked').equals(true).toArray(); }
  catch (err) { threw = err; }
  check('querying the index with a boolean throws DataError',
    threw && threw.name === 'DataError', String(threw));

  // ...while a predicate scan sees everything.
  const viaScan = await t.filter(q => !!q.isBookmarked).toArray();
  check('a predicate scan finds both representations',
    viaScan.length === 2 && viaScan.map(r => r.id).sort().join(',') === '1,3',
    viaScan.map(r => r.id).join(','));

  const t2 = makeTable('q', { indexes: ['isBookmarked'] });
  t2.rows = [{ id: 1, isBookmarked: true }];
  await t2.toCollection().modify(r => { r.isBookmarked = r.isBookmarked ? 1 : 0; });
  check('toCollection().modify walks rows the index cannot see',
    t2.rows[0].isBookmarked === 1);
}

// ===========================================================================
async function readsFindEverything() {
  section('The fix: reads find bookmarks in any representation');

  const { sandbox, db } = loadDb();

  db.quizzes.rows = [
    { id: 1, title: 'Polity Basics', subject: 'Indian Polity' },
    { id: 2, title: 'Algebra Drill', subject: 'Mathematics' },
    { id: 3, title: 'Current Affairs', subject: 'General Awareness' }
  ];

  db.questions.rows = [
    // Legacy boolean rows — what an existing user actually has on disk.
    { id: 10, quizId: 1, questionText: 'Q10', options: ['a'], correctAnswerIndex: 0, isBookmarked: true },
    { id: 11, quizId: 1, questionText: 'Q11', options: ['a'], correctAnswerIndex: 0, isBookmarked: false },
    // Post-fix numeric rows.
    { id: 12, quizId: 2, questionText: 'Q12', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 },
    { id: 13, quizId: 2, questionText: 'Q13', options: ['a'], correctAnswerIndex: 0, isBookmarked: 0 },
    { id: 14, quizId: 3, questionText: 'Q14', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 },
    // Field absent entirely (an even older build).
    { id: 15, quizId: 3, questionText: 'Q15', options: ['a'], correctAnswerIndex: 0 },
    // Orphan: parent quiz was deleted.
    { id: 16, quizId: 999, questionText: 'Q16', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 }
  ];

  const got = await sandbox.getBookmarkedQuestions();
  const ids = got.map(q => q.id).sort((a, b) => a - b);

  check('every bookmarked row is returned, boolean or numeric',
    ids.join(',') === '10,12,14,16', ids.join(','));
  check('un-bookmarked rows are excluded',
    !ids.includes(11) && !ids.includes(13) && !ids.includes(15));
  check('newest first (descending id)',
    got.map(q => q.id).join(',') === '16,14,12,10', got.map(q => q.id).join(','));

  const byId = new Map(got.map(q => [q.id, q]));
  check('subject is joined from the parent quiz',
    byId.get(10).subject === 'Indian Polity' && byId.get(12).subject === 'Mathematics',
    `${byId.get(10).subject} / ${byId.get(12).subject}`);
  check('quiz title is joined too', byId.get(10).quizTitle === 'Polity Basics');
  check('an orphaned question gets a stable bucket, not undefined',
    byId.get(16).subject === 'Uncategorised', String(byId.get(16).subject));
  check('an orphan gets a readable title fallback',
    byId.get(16).quizTitle === 'Study Quiz');

  // The read must not touch the broken index at all.
  check('getBookmarkedQuestions does not query the isBookmarked index',
    !/where\(\s*'isBookmarked'\s*\)/.test(DB_CODE),
    'the index cannot see boolean rows, so this query loses bookmarks');
  check('it uses a predicate scan instead',
    /filter\(\s*q\s*=>\s*!!q\.isBookmarked\s*\)/.test(DB_CODE));

  // The N+1 it replaced.
  check('the quizzes table is read once, not per bookmark',
    /const quizById = new Map\(/.test(DB_CODE) && !/bookmarks\.map\(async/.test(DB_CODE),
    'the Library re-renders on every keystroke; a get() per bookmark was 60 reads per character');
}

// ===========================================================================
async function writesAreNumeric() {
  section('Writes always store 1 or 0');

  const { sandbox, db } = loadDb();

  check('toBookmarkFlag is exposed', typeof sandbox.toBookmarkFlag === 'function');
  if (typeof sandbox.toBookmarkFlag === 'function') {
    const f = sandbox.toBookmarkFlag;
    check('true -> 1', f(true) === 1);
    check('false -> 0', f(false) === 0);
    check('1 -> 1', f(1) === 1);
    check('0 -> 0', f(0) === 0);
    check('undefined -> 0', f(undefined) === 0);
    check('null -> 0', f(null) === 0);
    check('the result is a number, never a boolean',
      typeof f(true) === 'number' && typeof f(false) === 'number');
  }

  db.questions.rows = [{ id: 5, quizId: 1, questionText: 'Q', isBookmarked: 0 }];
  await sandbox.updateQuestionBookmark(5, true);
  check('updateQuestionBookmark(true) stores the number 1',
    db.questions.rows[0].isBookmarked === 1 &&
    typeof db.questions.rows[0].isBookmarked === 'number',
    JSON.stringify(db.questions.rows[0].isBookmarked));

  await sandbox.updateQuestionBookmark(5, false);
  check('updateQuestionBookmark(false) stores the number 0',
    db.questions.rows[0].isBookmarked === 0 &&
    typeof db.questions.rows[0].isBookmarked === 'number');

  // saveNewQuiz initialiser.
  const { sandbox: sb2, db: db2 } = loadDb();
  await sb2.saveNewQuiz(
    { title: 'T', subject: 'Maths' },
    [{ questionText: 'A', options: ['x'], correctAnswerIndex: 0 }]
  );
  check('saveNewQuiz initialises isBookmarked to the number 0',
    db2.questions.rows[0].isBookmarked === 0 &&
    typeof db2.questions.rows[0].isBookmarked === 'number',
    JSON.stringify(db2.questions.rows[0].isBookmarked));

  // updateQuizCompletion must not un-index on submit. This is the one that made
  // the bug recur: submitting rewrites every question row, so a boolean written
  // here undid a correct save moments later.
  const { sandbox: sb3, db: db3 } = loadDb();
  db3.quizzes.rows = [{ id: 1, title: 'T', subject: 'Maths' }];
  db3.questions.rows = [
    { id: 1, quizId: 1, questionText: 'Q1', isBookmarked: 1 },
    { id: 2, quizId: 1, questionText: 'Q2', isBookmarked: 0 }
  ];
  await sb3.updateQuizCompletion(1, {
    score: 1, correct: 1, incorrect: 1, skipped: 0, percentage: 50, durationSeconds: 60
  }, [
    { id: 1, userSelectedOptionIndex: 0, isBookmarked: true },
    { id: 2, userSelectedOptionIndex: 1, isBookmarked: false }
  ]);
  check('submitting a quiz keeps bookmarks as numbers',
    db3.questions.rows[0].isBookmarked === 1 &&
    typeof db3.questions.rows[0].isBookmarked === 'number',
    JSON.stringify(db3.questions.rows[0].isBookmarked));
  check('and the bookmark survives the submit',
    (await sb3.getBookmarkedQuestions()).length === 1);

  // No write site anywhere may produce an un-indexable value.
  check('no Boolean() coercion is written to any isBookmarked field',
    !/isBookmarked:\s*Boolean\(/.test(DB_CODE),
    'Boolean() is exactly what produced the un-indexable value');
  check('no literal true/false is written to isBookmarked',
    !/isBookmarked:\s*(true|false)\b/.test(DB_CODE));
}

// ===========================================================================
async function aiTeacherTableToo() {
  section('The same trap on aiTeacherExplanations');

  // `isBookmarked` is indexed on this table as well (db.version(7)). Nothing
  // queries that index today, which is the only reason the AI Teacher library
  // was not broken in the same way — so the representation is fixed here too
  // rather than left as a landmine for the next query.
  check('the AI Teacher table does index isBookmarked',
    /aiTeacherExplanations:\s*'[^']*isBookmarked/.test(DB_SRC),
    'if this ever stops being true, the numeric requirement can be relaxed');

  const { sandbox, db } = loadDb();

  const id = await sandbox.saveAiTeacherExplanation({
    question: 'Explain osmosis', isBookmarked: true
  });
  check('saveAiTeacherExplanation stores a number',
    db.aiTeacherExplanations.rows[0].isBookmarked === 1 &&
    typeof db.aiTeacherExplanations.rows[0].isBookmarked === 'number',
    JSON.stringify(db.aiTeacherExplanations.rows[0].isBookmarked));

  const off = await sandbox.toggleBookmarkAiTeacherExplanation(id);
  check('toggling off stores 0',
    db.aiTeacherExplanations.rows[0].isBookmarked === 0 && off === 0,
    `stored=${db.aiTeacherExplanations.rows[0].isBookmarked} returned=${JSON.stringify(off)}`);

  const on = await sandbox.toggleBookmarkAiTeacherExplanation(id);
  check('toggling back on stores 1',
    db.aiTeacherExplanations.rows[0].isBookmarked === 1 && on === 1);

  check('a falsy input stores 0, not undefined',
    await (async () => {
      const { sandbox: sb, db: d } = loadDb();
      await sb.saveAiTeacherExplanation({ question: 'x' });
      return d.aiTeacherExplanations.rows[0].isBookmarked === 0;
    })());

  // Its reads are truthy filters, so both representations work — assert they
  // stay that way rather than hardening to === 1.
  check('the saved-lesson count uses a truthy filter',
    /filter\(e => e\.isBookmarked\)/.test(DB_CODE));
  check('the onlyBookmarked option uses a truthy filter',
    /filter\(item => item\.isBookmarked\)/.test(DB_CODE));
}

// ===========================================================================
async function migrationRepairsUsers() {
  section('The v10 migration repairs existing users');

  const { upgrades, db } = loadDb();
  const v10 = upgrades.find(u => u.version === 10);
  check('a version(10) upgrade is registered', !!v10,
    `registered upgrades: ${upgrades.map(u => u.version).join(',') || 'none'}`);

  if (v10) {
    db.questions.rows = [
      { id: 1, questionText: 'kept', isBookmarked: true },
      { id: 2, questionText: 'cleared', isBookmarked: false },
      { id: 3, questionText: 'already ok', isBookmarked: 1 },
      { id: 4, questionText: 'missing field' }
    ];
    db.aiTeacherExplanations.rows = [
      { id: 1, question: 'kept', isBookmarked: true },
      { id: 2, question: 'cleared', isBookmarked: false }
    ];

    await v10.fn({ table: (n) => db[n] });

    check('a bookmarked boolean row is preserved as 1',
      db.questions.rows[0].isBookmarked === 1,
      JSON.stringify(db.questions.rows[0].isBookmarked));
    check('an un-bookmarked boolean row becomes 0',
      db.questions.rows[1].isBookmarked === 0);
    check('an already-correct row is untouched',
      db.questions.rows[2].isBookmarked === 1);
    check('a missing field becomes 0 rather than undefined',
      db.questions.rows[3].isBookmarked === 0);
    check('every questions value is now a number',
      db.questions.rows.every(r => typeof r.isBookmarked === 'number'));

    // NOT LOSING DATA is the whole point.
    check('no bookmark was lost in the migration',
      db.questions.rows.filter(r => r.isBookmarked === 1).length === 2);

    check('the AI Teacher table is migrated too',
      db.aiTeacherExplanations.rows[0].isBookmarked === 1 &&
      db.aiTeacherExplanations.rows[1].isBookmarked === 0,
      JSON.stringify(db.aiTeacherExplanations.rows.map(r => r.isBookmarked)));

    // Idempotence: Dexie will not replay it, but a re-run must not corrupt.
    await v10.fn({ table: (n) => db[n] });
    check('re-running the migration is a no-op',
      db.questions.rows.filter(r => r.isBookmarked === 1).length === 2);
  }

  check('the migration uses toCollection().modify(), not an index query',
    /version\(10\)[\s\S]{0,700}toCollection\(\)\s*\.modify\(/.test(DB_CODE),
    'an index query would skip exactly the rows that need fixing');
  check('the v9 declaration is kept in the chain', /db\.version\(9\)/.test(DB_CODE),
    'Dexie replays upgrades; removing a version orphans users sitting on it');
}

// ===========================================================================
async function backupCannotReHide() {
  section('Restoring an old backup cannot re-hide bookmarks');

  const { sandbox, db } = loadDb();

  // A backup written before v10 — booleans throughout.
  const backup = JSON.stringify({
    appName: 'Hamsa Vidya',
    formatVersion: 3,
    tables: {
      quizzes: [{ id: 1, title: 'Old Quiz', subject: 'Mathematics' }],
      questions: [
        { id: 1, quizId: 1, questionText: 'Saved one', options: ['a'], correctAnswerIndex: 0, isBookmarked: true },
        { id: 2, quizId: 1, questionText: 'Not saved', options: ['a'], correctAnswerIndex: 0, isBookmarked: false }
      ]
    }
  });

  await sandbox.importDatabaseBackup(backup, { mode: 'REPLACE' });

  check('imported rows are normalised to numbers',
    db.questions.rows.every(r => typeof r.isBookmarked === 'number'),
    JSON.stringify(db.questions.rows.map(r => r.isBookmarked)));
  check('the imported bookmark is still findable',
    (await sandbox.getBookmarkedQuestions()).length === 1,
    'a verbatim restore of a boolean would hide it again');
  check('the un-bookmarked row stays un-bookmarked',
    db.questions.rows.find(r => r.questionText === 'Not saved').isBookmarked === 0);

  check('the questions backup spec carries a normalise hook',
    /key:\s*'questions'[\s\S]{0,500}normalise:/.test(DB_CODE));
  check('validation applies the hook', /typeof spec\.normalise === 'function'/.test(DB_CODE));

  // A hook that throws must not abort the whole import.
  check('a failing normalise hook is caught',
    /try \{ spec\.normalise\(row\); \}[\s\S]{0,120}catch/.test(DB_CODE));
}

// ===========================================================================
function groupingBySubject() {
  section('Grouping by subject');

  const { sandbox } = loadDb();
  const group = sandbox.groupBookmarksBySubject;

  check('groupBookmarksBySubject is exposed', typeof group === 'function');

  const rows = [
    { id: 1, subject: 'Mathematics' },
    { id: 2, subject: 'General Awareness' },
    { id: 3, subject: 'Mathematics' },
    { id: 4, subject: 'Indian Polity' },
    { id: 5, subject: 'Mathematics' },
    { id: 6, subject: 'General Awareness' }
  ];
  const groups = group(rows);

  check('one group per distinct subject', groups.length === 3, String(groups.length));
  check('the largest subject leads',
    groups[0].subject === 'Mathematics' && groups[0].questions.length === 3,
    `${groups[0].subject} (${groups[0].questions.length})`);
  check('then the next largest',
    groups[1].subject === 'General Awareness' && groups[1].questions.length === 2);
  check('every question is filed exactly once',
    groups.reduce((n, g) => n + g.questions.length, 0) === rows.length);

  // Equal counts must be deterministic, or the chips reshuffle every render.
  const tied = group([
    { id: 1, subject: 'Zoology' },
    { id: 2, subject: 'Algebra' },
    { id: 3, subject: 'Mathematics' }
  ]);
  check('ties break alphabetically, so the order is stable across renders',
    tied.map(g => g.subject).join(',') === 'Algebra,Mathematics,Zoology',
    tied.map(g => g.subject).join(','));

  // Degenerate input must not throw — the Library renders this on first load.
  check('an empty list produces no groups', group([]).length === 0);
  check('null is tolerated', group(null).length === 0);
  check('undefined is tolerated', group(undefined).length === 0);
  check('a missing subject falls into Uncategorised',
    group([{ id: 1 }])[0].subject === 'Uncategorised');
  check('an empty-string subject falls into Uncategorised',
    group([{ id: 1, subject: '' }])[0].subject === 'Uncategorised');
  check('a null entry does not throw',
    group([null, { id: 1, subject: 'Maths' }]).length === 2);
}

// ===========================================================================
function libraryMarkup() {
  section('Library markup: the subject switch');

  check('the view derives groups from the shared helper',
    /groupBookmarksBySubject\(bookmarks\)/.test(LIB_SRC),
    'deriving them twice would let a chip count disagree with its section');

  check('there is a subject switch', /class="bm-subject-switch"/.test(LIB_SRC));
  check('it is a labelled group for screen readers',
    /role="group"\s+aria-label="Filter saved questions by subject"/.test(LIB_SRC));
  check('there is an All Subjects chip',
    /setBookmarkSubject\('ALL'\)/.test(LIB_SRC) && /All Subjects/.test(LIB_SRC));
  check('each chip shows its own count', /class="bm-chip-count"/.test(LIB_SRC));
  check('chips report pressed state', /aria-pressed=/.test(LIB_SRC));

  // Real <button>s, so they are keyboard-operable without the runtime a11y
  // promotion app.js applies to clickable <div>s.
  check('chips are real <button> elements',
    /<button type="button"\s*\n?\s*class="select-chip bm-subject-chip/.test(LIB_SRC),
    'a clickable div would need promoting to be reachable by keyboard');

  check('the switch is hidden when there is nothing to filter',
    /\$\{bookmarkGroups\.length > 0 \? `/.test(LIB_SRC),
    'an empty filter row above an empty list is noise');

  // Grouped sections.
  check('questions render inside per-subject sections',
    /<section class="bm-subject-group"/.test(LIB_SRC));
  check('each section is announced with its subject',
    /class="bm-subject-group" aria-label="\$\{SecurityUtils\.escapeHtml\(group\.subject\)\}"/.test(LIB_SRC));
  check('each section has a heading', /class="bm-group-title"/.test(LIB_SRC));
  check('each section shows its count', /\$\{group\.questions\.length\} saved/.test(LIB_SRC));
  check('each section can be drilled on its own',
    /startBookmarksDrill\('\$\{SecurityUtils\.escapeHtml\(UIUtils\.escapeJs\(group\.subject\)\)\}'\)/.test(LIB_SRC));

  // Escaping. Subject is user input: the Create Quiz form has a free-text
  // custom subject field, and it reaches an inline onclick attribute.
  check('subject is escaped for JS *and* HTML before entering an onclick',
    /setBookmarkSubject\('\$\{SecurityUtils\.escapeHtml\(UIUtils\.escapeJs\(g\.subject\)\)\}'\)/.test(LIB_SRC),
    'escapeJs alone is not enough — the browser HTML-decodes the attribute first');
  check('no raw subject interpolation into an onclick remains',
    !/onclick="[^"]*\$\{(g|group)\.subject\}/.test(LIB_SRC));
  check('the visible subject text is HTML-escaped',
    /class="bm-group-title">\$\{SecurityUtils\.escapeHtml\(group\.subject\)\}/.test(LIB_SRC));

  // A stale filter must not strand the user on an empty screen.
  check('a filter for a vanished subject resets to ALL',
    /!bookmarkGroups\.some\(g => g\.subject === this\.bookmarkSubject\)/.test(LIB_SRC),
    'removing the last bookmark of a subject would otherwise show nothing');
  check('there is a narrowed-but-empty message',
    /No saved questions in this subject\./.test(LIB_SRC));

  check('setBookmarkSubject exists and defaults to ALL',
    /setBookmarkSubject\(subject\)\s*\{[\s\S]{0,140}subject \|\| 'ALL'/.test(LIB_SRC));
  check('the default state is ALL', /this\.bookmarkSubject = 'ALL';/.test(LIB_SRC));

  check('the empty state explains how to save a question',
    /Tap the bookmark icon on any question/.test(LIB_SRC));

  // Layout contract — verify-layout.js forbids inline widths in this view.
  check('no inline max-width was introduced', !/style="[^"]*max-width/.test(LIB_SRC));
  check('the view still uses the shared page column',
    /<div class="page-column">/.test(LIB_SRC));
}

// ===========================================================================
async function scopedDrill() {
  section('Subject-scoped drill');

  const { sandbox, db } = loadDb();

  db.quizzes.rows = [
    { id: 1, title: 'Maths Set', subject: 'Mathematics' },
    { id: 2, title: 'GA Set', subject: 'General Awareness' }
  ];
  db.questions.rows = [
    { id: 1, quizId: 1, questionText: 'M1', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 },
    { id: 2, quizId: 1, questionText: 'M2', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 },
    { id: 3, quizId: 2, questionText: 'G1', options: ['a'], correctAnswerIndex: 0, isBookmarked: 1 }
  ];

  const all = await sandbox.getBookmarkedQuestions();
  const maths = all.filter(q => q.subject === 'Mathematics');
  check("a subject filter selects only that subject's questions",
    maths.length === 2 && maths.every(q => q.subject === 'Mathematics'),
    String(maths.length));

  check('startBookmarksDrill accepts an optional subject',
    /async startBookmarksDrill\(subject\)/.test(LIB_SRC));
  check('it treats a missing subject or ALL as every question',
    /!subject \|\| subject === 'ALL'/.test(LIB_SRC));
  check('a scoped drill is tagged with the real subject, not "Mixed Revisions"',
    /subject: isScoped \? subject : 'Mixed Revisions'/.test(LIB_SRC),
    'a hard-coded label created a phantom bucket for questions bookmarked inside a drill');
  check('a scoped drill is titled with its subject',
    /\$\{subject\} — Bookmarks Drill/.test(LIB_SRC));
  check('an empty scoped drill reports the subject by name',
    /No saved questions in \$\{subject\} yet\./.test(LIB_SRC));
}

// ===========================================================================
function toggleSites() {
  section('Bookmark toggles in the quiz and result views');

  for (const [label, src] of [['quiz-player', PLAYER_SRC], ['quiz-result', RESULT_SRC]]) {
    const code = stripComments(src);
    check(`${label} writes bookmarks through updateQuestionBookmark`,
      /updateQuestionBookmark\(/.test(code));
    check(`${label} does not write isBookmarked to the DB itself`,
      !/db\.questions/.test(code), 'the db layer owns the representation');
  }

  // The in-memory toggle flips a boolean, which is fine for rendering — both 1
  // and true are truthy. Assert nothing hardened to a strict comparison.
  check('quiz-player renders on truthiness, not === true',
    !/isBookmarked === true/.test(PLAYER_SRC));
  check('quiz-result renders on truthiness, not === true',
    !/isBookmarked === true/.test(RESULT_SRC));
  check('the dashboard count still uses a truthy filter',
    /filter\(q => q\.isBookmarked\)/.test(DB_CODE));
}

// ===========================================================================
function styling() {
  section('Styling');

  const css = stripComments(QUIZ_CSS);

  check('the subject switch is styled', /\.bm-subject-switch\s*\{/.test(css));
  check('the switch label is styled', /\.bm-switch-label\s*\{/.test(css));
  check('chips are styled', /\.bm-subject-chip\s*\{/.test(css));
  check('count pills are styled', /\.bm-chip-count\s*\{/.test(css));
  check('the active chip restyles its count pill',
    /\.bm-subject-chip\.active \.bm-chip-count\s*\{/.test(css),
    'a primary-tinted pill on a primary-filled chip is invisible');
  check('groups are styled', /\.bm-subject-group\s*\{/.test(css));
  check('group headers are styled', /\.bm-group-header\s*\{/.test(css));
  check('the group divider is styled', /\.bm-group-rule\s*\{/.test(css));

  check('counts use tabular numerals so chips do not jitter',
    /\.bm-chip-count\s*\{[^}]*font-variant-numeric: tabular-nums/.test(css));

  // Buttons carrying .select-chip need the font reset or they inherit the UA font.
  check('chips reset the button font',
    /\.bm-subject-chip\s*\{[^}]*font: inherit/.test(css));

  check('there is a mobile breakpoint for the switch',
    /@media \(max-width: 640px\)[\s\S]{0,600}\.bm-subject-switch\s*\{/.test(css));
  check('the divider is hidden on mobile, where it would collapse',
    /@media \(max-width: 640px\)[\s\S]{0,700}\.bm-group-rule\s*\{[^}]*display: none/.test(css));

  // The byte-frozen directory must not have been touched.
  const componentsCss = fs.readdirSync(path.join(ROOT, 'css', 'components'))
    .map(f => read(path.join('css', 'components', f))).join('\n');
  check('no bm-* rule leaked into the byte-frozen css/components/',
    !/bm-subject|bm-group|bm-chip/.test(componentsCss),
    'css/components/* is byte-compared against scratch/_backup/components.css');
}

// ===========================================================================
(async () => {
  await selfTest();
  await readsFindEverything();
  await writesAreNumeric();
  await aiTeacherTableToo();
  await migrationRepairsUsers();
  await backupCannotReHide();
  groupingBySubject();
  libraryMarkup();
  await scopedDrill();
  toggleSites();
  styling();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
