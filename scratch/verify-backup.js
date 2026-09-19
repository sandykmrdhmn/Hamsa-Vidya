/**
 * Verify the v3 backup/restore logic in js/db.js.
 *
 * db.js is browser code built on Dexie, so this harness stubs just enough of the
 * Dexie table API (toArray / clear / bulkPut / add / count / transaction) to run
 * the real backup functions against in-memory data.
 *
 * Covers: export completeness, REPLACE restore, MERGE with foreign-key
 * remapping, validation of malformed records, and rollback on failure.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DB_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
// db.js now uses the shared helpers (UIUtils.downloadJson / toDateKey), which
// index.html loads before it.
const UI_UTILS_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui-utils.js'), 'utf8');
const SANITIZER_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'sanitizer.js'), 'utf8');

const TABLE_NAMES = [
  'quizzes', 'questions', 'attempts', 'notes',
  'customDecks', 'customCards', 'cardReviews',
  'exams', 'savedExams', 'answers', 'answerDrafts', 'aiTeacherExplanations'
];

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Minimal in-memory Dexie-compatible table. */
class MockTable {
  constructor(name, autoId = true) {
    this.name = name;
    this.autoId = autoId;
    this.rows = [];
    this._next = 1;
    this.failOnAdd = false;
    this.failOnBulkPut = false;
  }
  async toArray() { return this.rows.map(r => ({ ...r })); }
  async count() { return this.rows.length; }
  async clear() { this.rows = []; }
  async add(rec) {
    if (this.failOnAdd) throw new Error(`injected add failure on ${this.name}`);
    const id = this.autoId ? this._next++ : rec.id;
    this.rows.push({ ...rec, id });
    return id;
  }
  async bulkAdd(recs) { for (const r of recs) await this.add(r); }
  async bulkPut(recs) {
    if (this.failOnBulkPut) throw new Error(`injected bulkPut failure on ${this.name}`);
    for (const r of recs) {
      const idx = this.rows.findIndex(x => x.id === r.id);
      if (idx >= 0) this.rows[idx] = { ...r };
      else {
        this.rows.push({ ...r });
        if (this.autoId && typeof r.id === 'number' && r.id >= this._next) this._next = r.id + 1;
      }
    }
  }
  async put(rec) { return this.bulkPut([rec]); }
  async get(id) { return this.rows.find(r => r.id === id); }
  async update(id, changes) {
    const row = this.rows.find(r => r.id === id);
    if (row) Object.assign(row, changes);
    return row ? 1 : 0;
  }
  async delete(id) { this.rows = this.rows.filter(r => r.id !== id); }
  orderBy() { return this; }
  reverse() { return this; }
  where() { return this; }
  equals() { return this; }
  filter() { return this; }
  or() { return this; }
}

function buildSandbox() {
  const db = { verno: 7 };
  for (const t of TABLE_NAMES) db[t] = new MockTable(t, t !== 'exams');

  // Transaction: snapshot the tables so an injected failure can roll back the
  // way a real IndexedDB transaction would.
  db.transaction = async (_mode, _tables, fn) => {
    const backup = {};
    for (const t of TABLE_NAMES) backup[t] = db[t].rows.map(r => ({ ...r }));
    try {
      return await fn();
    } catch (err) {
      for (const t of TABLE_NAMES) db[t].rows = backup[t];
      throw err;
    }
  };

  // db.js declares its schema with db.version(n).stores({...}) at load time.
  const versionChain = { stores: () => versionChain, upgrade: () => versionChain };
  db.version = () => versionChain;
  db.open = async () => db;

  function Dexie() { return db; }
  Dexie.prototype = {};

  const store = new Map();
  const blobs = [];

  const sandbox = {
    console,
    setTimeout, clearTimeout,
    Dexie,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    Blob: class { constructor(parts) { this.parts = parts; blobs.push(parts.join('')); } },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    document: {
      createElement: () => ({ href: '', download: '', style: {}, click: () => {}, remove: () => {} }),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  // Match index.html's load order: sanitizer -> ui-utils -> db.
  new vm.Script(SANITIZER_SRC, { filename: 'sanitizer.js' }).runInContext(sandbox);
  new vm.Script(UI_UTILS_SRC, { filename: 'ui-utils.js' }).runInContext(sandbox);
  // db.js assigns the Dexie instance via `const db = new Dexie(...)`, then
  // declares the functions we want. Run it as-is.
  new vm.Script(DB_SRC, { filename: 'db.js' }).runInContext(sandbox);

  return { sandbox, db, store, blobs };
}

/** Seed a realistic dataset with cross-table foreign keys. */
function seed(db) {
  db.quizzes.rows = [
    { id: 1, title: 'Polity Quiz', subject: 'Indian Polity', percentage: 80 },
    { id: 2, title: 'History Quiz', subject: 'History', percentage: 60 }
  ];
  db.quizzes._next = 3;
  db.questions.rows = [
    { id: 1, quizId: 1, questionText: 'Article 32?', correctAnswerIndex: 2 },
    { id: 2, quizId: 1, questionText: 'Article 352?', correctAnswerIndex: 0 },
    { id: 3, quizId: 2, questionText: 'Revolt of 1857?', correctAnswerIndex: 1 }
  ];
  db.questions._next = 4;
  db.attempts.rows = [{ id: 1, quizId: 1, percentage: 80 }];
  db.attempts._next = 2;
  db.notes.rows = [{ id: 1, title: 'Fundamental Rights', subject: 'Polity' }];
  db.notes._next = 2;
  db.customDecks.rows = [{ id: 1, title: 'Treaties Deck', subject: 'History' }];
  db.customDecks._next = 2;
  db.customCards.rows = [
    { id: 1, deckId: 1, front: 'Treaty of Allahabad?', back: '1765' },
    { id: 2, deckId: 1, front: 'Treaty of Bassein?', back: '1802' }
  ];
  db.customCards._next = 3;
  db.cardReviews.rows = [{ id: 1, cardKey: 'custom:1', interval: 4, dueDate: '2026-10-01' }];
  db.cardReviews._next = 2;
  db.answers.rows = [{ id: 1, question: 'Discuss judicial activism', score: 7.5 }];
  db.answers._next = 2;
  db.answerDrafts.rows = [{ id: 1, question: 'Draft q', studentAnswer: 'partial' }];
  db.answerDrafts._next = 2;
  db.aiTeacherExplanations.rows = [{ id: 1, question: 'What is inflation?', topic: 'Inflation' }];
  db.aiTeacherExplanations._next = 2;
  db.savedExams.rows = [{ id: 1, examId: 'upsc-2026', savedAt: '2026-09-01' }];
  db.savedExams._next = 2;
  db.exams.rows = [{ id: 'upsc-2026', examName: 'UPSC CSE 2026' }];
}

(async () => {
  // ------------------------------------------------------------ 1. EXPORT
  console.log('\n=== Export completeness ===');
  let backupJson;
  {
    const { sandbox, db, store, blobs } = buildSandbox();
    seed(db);
    store.set('hamsa_theme_mode', 'MIDNIGHT_BLUE');
    store.set('hamsa_exam_profile', JSON.stringify({ fullName: 'Aditi Sharma', category: 'OBC' }));
    store.set('hamsa_streak_days', '12');

    const summary = await sandbox.exportDatabaseBackup();
    backupJson = blobs[blobs.length - 1];
    const parsed = JSON.parse(backupJson);

    check('formatVersion is 3', parsed.formatVersion === 3);
    check('all 12 tables present', TABLE_NAMES.every(t => Array.isArray(parsed.tables[t])),
      TABLE_NAMES.filter(t => !parsed.tables[t]).join(','));
    check('flashcard decks exported', parsed.tables.customDecks.length === 1);
    check('SRS progress exported', parsed.tables.cardReviews.length === 1);
    check('answer writing exported', parsed.tables.answers.length === 1);
    check('AI Teacher library exported', parsed.tables.aiTeacherExplanations.length === 1);
    check('saved exams exported', parsed.tables.savedExams.length === 1);
    check('student profile exported', parsed.preferences.hamsa_exam_profile?.includes('Aditi Sharma'));
    check('theme preference exported', parsed.preferences.hamsa_theme_mode === 'MIDNIGHT_BLUE');
    check('summary counts match', summary.questions === 3 && summary.customCards === 2);
    check('API key NOT included in backup', !backupJson.includes('hamsa_gemini_api_key'));
  }

  // ----------------------------------------------------- 2. REPLACE restore
  console.log('\n=== REPLACE restore into a different dataset ===');
  {
    const { sandbox, db, store } = buildSandbox();
    db.quizzes.rows = [{ id: 99, title: 'Pre-existing quiz' }];
    db.notes.rows = [{ id: 99, title: 'Pre-existing note' }];

    const report = await sandbox.importDatabaseBackup(backupJson, { mode: 'REPLACE' });

    check('mode reported as REPLACE', report.mode === 'REPLACE');
    check('pre-existing quiz removed', !db.quizzes.rows.some(q => q.id === 99));
    check('backup quizzes restored', db.quizzes.rows.length === 2);
    check('original ids preserved', db.quizzes.rows.map(q => q.id).sort().join(',') === '1,2');
    check('questions keep valid quizId', db.questions.rows.every(q => db.quizzes.rows.some(z => z.id === q.quizId)));
    check('flashcards restored', db.customCards.rows.length === 2);
    check('SRS progress restored', db.cardReviews.rows.length === 1);
    check('profile restored to localStorage', store.get('hamsa_exam_profile')?.includes('Aditi Sharma'));
    check('report flags profileRestored', report.profileRestored === true);
    // 2 quizzes + 3 questions + 1 attempt + 1 note + 1 deck + 2 cards
    // + 1 review + 1 answer + 1 draft + 1 teacher entry + 1 saved exam = 15.
    // The `exams` cache table is intentionally excluded from this count.
    check('totalImported counts user records', report.totalImported === 15, `got ${report.totalImported}`);
  }

  // ------------------------------------------------------- 3. MERGE restore
  console.log('\n=== MERGE restore keeps existing data and remaps IDs ===');
  {
    const { sandbox, db } = buildSandbox();
    // Existing data occupying the same ids as the backup.
    db.quizzes.rows = [{ id: 1, title: 'MY existing quiz' }];
    db.quizzes._next = 2;
    db.questions.rows = [{ id: 1, quizId: 1, questionText: 'MY existing question' }];
    db.questions._next = 2;
    db.customDecks.rows = [{ id: 1, title: 'MY existing deck' }];
    db.customDecks._next = 2;
    db.customCards.rows = [{ id: 1, deckId: 1, front: 'MY existing card' }];
    db.customCards._next = 2;

    const report = await sandbox.importDatabaseBackup(backupJson, { mode: 'MERGE' });

    check('mode reported as MERGE', report.mode === 'MERGE');
    check('existing quiz survived', db.quizzes.rows.some(q => q.title === 'MY existing quiz'));
    check('backup quizzes appended', db.quizzes.rows.length === 3, `got ${db.quizzes.rows.length}`);
    check('existing question survived', db.questions.rows.some(q => q.questionText === 'MY existing question'));
    check('all questions appended', db.questions.rows.length === 4, `got ${db.questions.rows.length}`);

    // Every question must point at a quiz that exists — the FK remap test.
    const orphans = db.questions.rows.filter(q => !db.quizzes.rows.some(z => z.id === q.quizId));
    check('no orphaned questions after remap', orphans.length === 0, JSON.stringify(orphans));

    // The imported "Article 32?" question must belong to the imported Polity quiz,
    // NOT to the pre-existing quiz that happened to have id 1.
    const art32 = db.questions.rows.find(q => q.questionText === 'Article 32?');
    const itsQuiz = db.quizzes.rows.find(z => z.id === art32.quizId);
    check('imported question linked to imported quiz', itsQuiz && itsQuiz.title === 'Polity Quiz',
      `linked to ${itsQuiz && itsQuiz.title}`);

    const orphanCards = db.customCards.rows.filter(c => !db.customDecks.rows.some(d => d.id === c.deckId));
    check('no orphaned flashcards after remap', orphanCards.length === 0, JSON.stringify(orphanCards));
    const allahabad = db.customCards.rows.find(c => c.front === 'Treaty of Allahabad?');
    const itsDeck = db.customDecks.rows.find(d => d.id === allahabad.deckId);
    check('imported card linked to imported deck', itsDeck && itsDeck.title === 'Treaties Deck',
      `linked to ${itsDeck && itsDeck.title}`);
  }

  // ---------------------------------------------------------- 4. Validation
  console.log('\n=== Validation rejects bad input without touching data ===');
  {
    const { sandbox, db } = buildSandbox();
    seed(db);
    const before = db.quizzes.rows.length;

    let err = null;
    try { await sandbox.importDatabaseBackup('this is not json'); } catch (e) { err = e.message; }
    check('non-JSON rejected', err && /not valid JSON/i.test(err), err);
    check('data untouched after bad JSON', db.quizzes.rows.length === before);

    err = null;
    try { await sandbox.importDatabaseBackup('{"unrelated":"file"}'); } catch (e) { err = e.message; }
    check('unrelated JSON rejected', err && /No recognisable/i.test(err), err);
    check('data untouched after unrelated JSON', db.quizzes.rows.length === before);

    // Malformed records inside an otherwise valid backup get skipped, not imported.
    const dirty = JSON.stringify({
      formatVersion: 3,
      tables: {
        quizzes: [
          { id: 1, title: 'Good quiz' },
          { id: 2 },                       // missing title
          null,                            // not an object
          'a string',                      // not an object
          { id: 5, title: '' }             // empty required field
        ],
        questions: [{ id: 1, quizId: 1, questionText: 'Valid Q' }]
      }
    });
    const preview = await sandbox.inspectDatabaseBackup(dirty);
    check('inspect skips 4 invalid quizzes', preview.tables.quizzes.skipped === 4, `got ${preview.tables.quizzes.skipped}`);
    check('inspect keeps 1 valid quiz', preview.tables.quizzes.imported === 1);
    check('inspect does not modify db', db.quizzes.rows.length === before);

    const rep = await sandbox.importDatabaseBackup(dirty, { mode: 'REPLACE' });
    check('only valid records imported', db.quizzes.rows.length === 1 && db.quizzes.rows[0].title === 'Good quiz');
    check('report surfaces skipped count', rep.tables.quizzes.skipped === 4);
  }

  // ------------------------------------------------------------ 5. Rollback
  console.log('\n=== Rollback restores previous data when import fails ===');
  {
    const { sandbox, db } = buildSandbox();
    seed(db);
    const quizzesBefore = JSON.stringify(db.quizzes.rows);
    const cardsBefore = JSON.stringify(db.customCards.rows);

    // Fail during the import's add() path only. Rollback uses bulkPut(), so the
    // recovery itself still works — this is the realistic clean-rollback case.
    db.aiTeacherExplanations.failOnAdd = true;

    let err = null;
    try { await sandbox.importDatabaseBackup(backupJson, { mode: 'MERGE' }); }
    catch (e) { err = e.message; }

    check('import surfaced an error', !!err, 'no error thrown');
    check('error explains data was restored', err && /previous data was restored/i.test(err), err);
    check('quizzes rolled back exactly', JSON.stringify(db.quizzes.rows) === quizzesBefore);
    check('flashcards rolled back exactly', JSON.stringify(db.customCards.rows) === cardsBefore);
    check('nothing left empty', db.quizzes.rows.length === 2 && db.notes.rows.length === 1);
  }

  // ------------------------------------- 5b. Rollback that cannot fully recover
  console.log('\n=== Partial rollback is reported honestly ===');
  {
    const { sandbox, db } = buildSandbox();
    seed(db);

    // A permanently broken table: fails during import AND during rollback.
    db.aiTeacherExplanations.failOnBulkPut = true;

    let err = null;
    try { await sandbox.importDatabaseBackup(backupJson, { mode: 'REPLACE' }); }
    catch (e) { err = e.message; }

    check('error names the unrecoverable table', err && /AI Teacher Library/.test(err), err);
    check('error does NOT falsely claim full restore', err && !/previous data was restored\.?$/i.test(err), err);
    check('recoverable tables still rolled back', db.quizzes.rows.length === 2 && db.customCards.rows.length === 2);
  }

  // ------------------------------------------------- 6. Legacy v2 backup file
  console.log('\n=== Legacy v1/v2 backup still restores ===');
  {
    const { sandbox, db, store } = buildSandbox();
    const legacy = JSON.stringify({
      appName: 'Hamsa Vidya',
      version: 2,
      quizzes: [{ id: 1, title: 'Legacy quiz' }],
      questions: [{ id: 1, quizId: 1, questionText: 'Legacy question' }],
      attempts: [{ id: 1, quizId: 1, percentage: 50 }],
      notes: [{ id: 1, title: 'Legacy note' }],
      preferences: { themeMode: 'SEPIA', themePalette: 'AMBER', streakDays: '5' }
    });

    const report = await sandbox.importDatabaseBackup(legacy, { mode: 'REPLACE' });
    check('legacy format detected', report.formatVersion === 2, `got ${report.formatVersion}`);
    check('legacy quizzes restored', db.quizzes.rows.length === 1);
    check('legacy notes restored', db.notes.rows.length === 1);
    check('legacy prefs mapped to storage keys', store.get('hamsa_theme_mode') === 'SEPIA' && store.get('hamsa_theme_palette') === 'AMBER');
  }

  // --------------------------------------------------------- 7. clearDatabase
  console.log('\n=== clearDatabase wipes every table ===');
  {
    const { sandbox, db, store } = buildSandbox();
    seed(db);
    store.set('hamsa_exam_profile', '{"fullName":"Keep Me"}');

    const removed = await sandbox.clearDatabase();
    const leftover = TABLE_NAMES.filter(t => db[t].rows.length > 0);
    check('all 12 tables emptied', leftover.length === 0, `left: ${leftover.join(',')}`);
    check('reports per-table counts', removed.customCards === 2 && removed.questions === 3);
    check('profile preserved by default', store.get('hamsa_exam_profile') === '{"fullName":"Keep Me"}');

    seed(db);
    await sandbox.clearDatabase({ includePreferences: true });
    check('includePreferences also clears profile', !store.has('hamsa_exam_profile'));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
