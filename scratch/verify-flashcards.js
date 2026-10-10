/** Flashcard regressions: isolated storage and a transactional database double. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
let passed = 0,
  failed = 0;
const tables = [
  'notes',
  'customDecks',
  'customCards',
  'cardReviews',
  'exams',
  'savedExams',
  'answers',
  'answerDrafts',
  'aiTeacherExplanations',
];
function database() {
  const db = {};
  const chain = {
    stores() {
      return chain;
    },
    upgrade() {
      return chain;
    },
  };
  db.version = () => chain;
  for (const name of tables) {
    const table = { rows: [], next: 1, fail: false };
    table.add = async (row) => {
      if (table.fail) throw Error('Storage full');
      const id = row.id ?? table.next++;
      table.next = Math.max(table.next, id + 1);
      table.rows.push({ ...clone(row), id });
      return id;
    };
    table.bulkAdd = async (rows) => {
      for (const row of rows) await table.add(row);
    };
    table.bulkPut = async (rows) => {
      for (const row of rows) {
        await table.delete(row.id);
        await table.add(row);
      }
    };
    table.get = async (id) =>
      clone(table.rows.find((row) => row.id === id) || null);
    table.update = async (id, changes) => {
      if (table.fail) throw Error('Storage full');
      const row = table.rows.find((row) => row.id === id);
      if (!row) return 0;
      Object.assign(row, clone(changes));
      return 1;
    };
    table.delete = async (id) => {
      table.rows = table.rows.filter((row) => row.id !== id);
    };
    table.clear = async () => {
      table.rows = [];
    };
    const query = (predicate = () => true, reverse = false) => ({
      toArray: async () => {
        const rows = table.rows.filter(predicate).map(clone);
        return reverse ? rows.reverse() : rows;
      },
      delete: async () => {
        table.rows = table.rows.filter((row) => !predicate(row));
      },
      modify: async (updates) => {
        table.rows
          .filter(predicate)
          .forEach((row) => Object.assign(row, updates));
      },
      reverse: () => query(predicate, true),
      count: async () => table.rows.filter(predicate).length,
    });
    table.toArray = query().toArray;
    table.count = query().count;
    table.filter = (predicate) => query(predicate);
    table.orderBy = () => query();
    table.where = (field) => ({
      equals: (value) => query((row) => row[field] === value),
    });
    table.toCollection = () => query();
    db[name] = table;
  }
  db.transaction = async (...args) => {
    const snapshot = tables.map((name) => ({
      name,
      rows: clone(db[name].rows),
      next: db[name].next,
    }));
    try {
      return await args.at(-1)();
    } catch (error) {
      snapshot.forEach(({ name, rows, next }) =>
        Object.assign(db[name], { rows, next }),
      );
      throw error;
    }
  };
  return db;
}
function fixture({ db = true, app = false } = {}) {
  const dom = new JSDOM(
    '<main><section id="view-flashcards"></section><section id="view-library"></section></main><div id="generating-overlay"></div><div id="generating-title"></div><div id="confirmation-modal"></div>',
    {
      url: 'http://localhost/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new w.Event('close'));
  };
  w.console = { log() {}, warn() {}, error() {} };
  w.alert = () => {};
  w.scrollTo = () => {};
  w.toasts = [];
  w.HamsaCharts = { renderDonutChart() {} };
  w.app = {
    currentView: '',
    refreshIcons() {},
    showToast(text, type) {
      w.toasts.push({ text, type });
    },
    showConfirmation(config) {
      w.confirmation = config;
    },
    navigate(view) {
      this.currentView = view;
    },
    checkAndUpdateStreak() {},
  };
  w.UIUtils = { buildViewHero: () => '', escapeJs: String };
  for (const file of [
    'js/sanitizer.js',
  ])
    w.eval(read(file));
  if (db) {
    w.testDb = database();
    w.Dexie = function () {
      return w.testDb;
    };
    w.eval(read('js/db.js'));
    w.db = w.testDb;
  }
  if (app) {
    let src = read('js/app.js');
    src = src.slice(
      0,
      src.lastIndexOf("document.addEventListener('DOMContentLoaded'"),
    );
    w.eval(src);
    w.app.showToast = (text, type) => w.toasts.push({ text, type });
    w.app.refreshIcons = () => {};
  }
  w.eval(read('js/study-format.js'));
  w.eval(read('js/flashcard-tools.js'));
  w.eval(read('js/flashcard-store.js'));
  w.eval(read('js/views/flashcards.js'));
  w.app.currentView = 'flashcards';
  for (const name of tables) {
    w.testDb[name].put = async (row) => {
      if (w.testDb[name].fail) throw Error('Storage full');
      await w.testDb[name].delete(row.id);
      return w.testDb[name].add(row);
    };
  }
  const load = (file) => w.eval(read(file));
  return { dom, w, load, close: () => dom.window.close() };
}
async function test(name, run) {
  let f;
  try {
    f = fixture();
    await run(f);
    passed++;
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + ': ' + error.stack);
  } finally {
    f?.close();
  }
}
const seed = async (w) => {
  const id = await w.createCustomDeck({
    title: "2026 Student's Notes",
    subject: 'Science',
  });
  const card = await w.addCustomCard({
    deckId: id,
    front: 'What is energy?',
    back: 'Capacity to do work',
    explanation: 'Energy has many forms.',
  });
  return { id, card };
};

(async () => {
  await test('Deck titles preserve numbers and apostrophes without injectable event handlers', async ({
    w,
  }) => {
    await seed(w);
    await w.flashcardsView.render();
    assert.ok(
      w.flashcardsView.container.textContent.includes("2026 Student's Notes"),
    );
    assert.equal(
      w.flashcardsView.container
        .querySelector('[data-action=delete-deck]')
        .getAttribute('onclick'),
      null,
    );
  });
  await test('Custom cards require a usable prompt and answer', ({
    w,
  }) => {
    assert.equal(w.FlashcardTools.customCard({id:1,front:'Question',back:''}),null);
    assert.equal(w.FlashcardTools.customCard({id:1,front:'',back:'Answer'}),null);
    const c=w.FlashcardTools.customCard({id:1,deckId:9,front:'Question',back:'Answer',memoryCue:'Remember this'}, {title:'Book'});
    assert.equal(c.back,'Answer');assert.equal(c.memoryCue,'Remember this');
  });
  await test('Note and section views share stable identities and keep formulas/references', ({
    w,
  }) => {
    const note = {
      id: 1,
      title: 'Book',
      sections: [
        {
          id: 's1',
          heading: 'Energy',
          definitions: [{ term: 'Energy', definition: 'Capacity to work' }],
          formulas: [{ name: 'Kinetic energy', formula: 'E = mv²/2' }],
          keyPoints: ['Work transfers energy'],
          sourceReferences: [{ page: 9, fileName: 'Book.pdf' }],
        },
      ],
    };
    const all = w.FlashcardTools.noteCards(note),
      section = w.FlashcardTools.noteCards(note, 's1');
    assert.deepEqual(
      Array.from(all, (c) => c.cardKey),
      Array.from(section, (c) => c.cardKey),
    );
    note.sections[0].heading = 'New heading';
    note.sections[0].definitions[0].term = 'Energy renamed';
    assert.equal(w.FlashcardTools.noteCards(note)[0].cardKey, all[0].cardKey);
    assert.equal(all[0].sourceReferences[0].page, 9);
  });
  await test('Actual schedule labels match saved intervals and Again is due in ten minutes', ({
    w,
  }) => {
    const now = new w.Date(2026, 9, 2, 0, 30);
    for (const r of [1, 2, 3, 4]) {
      const s = w.FlashcardTools.schedule(null, r, now);
      assert.equal(s.interval, [0, 1, 1, 3][r - 1]);
      assert.equal(
        w.FlashcardTools.intervalLabel(null, r),
        r === 1 ? '10 min' : `${s.interval}d`,
      );
    }
    assert.equal(w.FlashcardTools.localDate(now), '2026-10-02');
    const again = w.FlashcardTools.schedule(null, 1, now);
    assert.equal(
      w.FlashcardTools.due(again, new w.Date(now.getTime() + 9 * 60000)),
      false,
    );
    assert.equal(
      w.FlashcardTools.due(again, new w.Date(now.getTime() + 10 * 60000)),
      true,
    );
    assert.throws(() => w.FlashcardTools.schedule(null, 9));
  });
  await test('New card limits count first learning date rather than repeated ratings', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    const first = await w.saveCardReviewProgress(
      `custom:${card}`,
      id,
      'CUSTOM',
      3,
    );
    const second = await w.saveCardReviewProgress(
      `custom:${card}`,
      id,
      'CUSTOM',
      3,
    );
    assert.equal(first.firstLearnedAt, second.firstLearnedAt);
    w.flashcardsView.newLimit = 1;
    await w.flashcardsView.smartDeck('NEW');
    assert.equal(w.flashcardsView.activeTab, 'decks');
  });
  await test('Notes due records resolve to usable cards and orphan reviews are excluded', async ({
    w,
  }) => {
    await w.testDb.notes.add({
      id: 7,
      title: 'Physics',
      sections: [
        {
          id: 's',
          heading: 'Energy',
          definitions: [{ term: 'Energy', definition: 'Ability to work' }],
        },
      ],
    });
    await w.testDb.cardReviews.add({
      cardKey: 'note_7:s:Energy',
      dueDate: '2000-01-01',
      lastReviewedAt: '2020-01-01',
    });
    await w.testDb.cardReviews.add({
      cardKey: 'custom:999',
      dueDate: '2000-01-01',
    });
    assert.equal(await w.getDueCardsCount(), 1);
    const cards = await w.getAllDueCards();
    assert.equal(cards[0].sourceDeckType, 'NOTE');
    await w.cleanupFlashcardReviews();
    assert.equal(w.testDb.cardReviews.rows.length, 1);
    assert.equal(w.testDb.cardReviews.rows[0].cardKey, cards[0].cardKey);
  });
  await test('Library counts unique Notes and Custom cards', async ({
    w,
  }) => {
    await seed(w);
    await w.testDb.notes.add({
      id: 1,
      title: 'Note',
      glossaryTerms: [{ term: 'Force', definition: 'A push' }],
    });
    const library = await w.getFlashcardLibrary();
    assert.equal(library.cards.length, 2);
    assert.equal(library.notes[0].cardCount, 1);
    assert.equal(library.customDecks[0].cardCount, 1);
    assert.deepEqual(Array.from(new Set(library.cards.map(card=>card.sourceDeckType))).sort(),['CUSTOM','NOTE']);
  });
  await test('Review save has idempotency and preserves real source deck in smart sessions', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    const a = await w.saveCardReviewProgress(
        `custom:${card}`,
        'due-today',
        'SRS_DUE',
        3,
        { token: 'one' },
      ),
      b = await w.saveCardReviewProgress(
        `custom:${card}`,
        'due-today',
        'SRS_DUE',
        3,
        { token: 'one' },
      );
    assert.equal(a.id, b.id);
    assert.equal(b.repetitions, 1);
    assert.equal(w.testDb.cardReviews.rows.length, 1);
    assert.equal(b.deckId, String(id));
    assert.equal(b.deckType, 'CUSTOM');
  });
  await test('Failed review storage leaves card and reviewed counts unchanged', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.flashcardsView.loadCustomDeck(id);
    w.flashcardsView.isFlipped = true;
    w.testDb.cardReviews.fail = true;
    await w.flashcardsView.rateCard(3);
    assert.equal(w.flashcardsView.ratingsMap.size, 0);
    assert.equal(w.flashcardsView.currentIndex, 0);
    assert.ok(w.toasts.some((t) => t.text.includes('Review not saved')));
  });
  await test('Concurrent rating clicks save once and cannot skip the next card', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({ deckId: id, front: 'Next', back: 'Next answer' });
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.isFlipped = true;
    let release,
      calls = 0;
    w.saveCardReviewProgress = () => {
      calls++;
      return new Promise((r) => (release = r));
    };
    const first = v.rateCard(3),
      second = v.rateCard(4);
    release({ id: 1, interval: 1, operationToken: 'x' });
    await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.ratingsMap.size, 1);
  });
  await test('Unrevealed cards cannot be rated and Again is repeated with a bounded queue', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    await v.rateCard(3);
    assert.equal(v.ratingsMap.size, 0);
    for (let i = 0; i < 3; i++) {
      v.isFlipped = true;
      await v.rateCard(1);
    }
    assert.equal(v.cards.length, 3);
    assert.equal(v.activeTab, 'summary');
    assert.equal(v.reviewCounts[v.cards[0].cardKey], 3);
    assert.equal(v.ratingsMap.size, 1);
  });
  await test('Undo restores the real persisted schedule and card position', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.isFlipped = true;
    await v.rateCard(3);
    assert.equal(w.testDb.cardReviews.rows.length, 1);
    await v.undoRating();
    assert.equal(w.testDb.cardReviews.rows.length, 0);
    assert.equal(v.ratingsMap.size, 0);
    assert.equal(v.activeTab, 'study');
    assert.equal(v.currentIndex, 0);
  });
  await test('Undo refuses to overwrite another newer rating', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    const first = await w.saveCardReviewProgress(
      `custom:${card}`,
      id,
      'CUSTOM',
      3,
      { token: 'old' },
    );
    await w.saveCardReviewProgress(`custom:${card}`, id, 'CUSTOM', 4, {
      token: 'new',
    });
    await assert.rejects(w.undoCardReviewProgress(first), /newer review/);
    assert.equal(w.testDb.cardReviews.rows[0].lastRating, 4);
  });
  await test('Weak practice preserves the full deck and reports its actual session size', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({ deckId: id, front: 'Another', back: 'Answer' });
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.ratingsMap.set(v.cards[0].cardKey, 2);
    v.restartWithWeakCards();
    assert.equal(v.cards.length, 1);
    assert.equal(v.masterDeckCards.length, 2);
    assert.equal(v.sessionKeys.size, 1);
    v.restartFullDeck();
    assert.equal(v.cards.length, 2);
  });
  await test('Skipped cards are not reported as reviewed or mastered', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({ deckId: id, front: 'Another', back: 'Answer' });
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.nextCard();
    v.isFlipped = true;
    await v.rateCard(3);
    assert.ok(v.container.textContent.includes('1/2 unique cards reviewed'));
    assert.ok(v.container.textContent.includes('1 not reviewed'));
    assert.ok(!v.container.textContent.includes('Session Completed'));
  });
  await test('Shuffle keeps previously reviewed progress and original full deck', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({ deckId: id, front: 'Another', back: 'Answer' });
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.isFlipped = true;
    await v.rateCard(3);
    v.shuffleCurrentDeck();
    assert.equal(v.ratingsMap.size, 1);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.masterDeckCards.length, 2);
  });
  await test('Resume retains typed drafts and omits edited or deleted cards', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    const other = await w.addCustomCard({
      deckId: id,
      front: 'Another',
      back: 'Answer',
    });
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView;
    v.currentIndex = 1;
    v.mode = 'TYPE';
    v.answerDraft = 'My recalled wording';
    v.persistSession();
    await w.deleteCustomCard(card);
    v.activeTab = 'decks';
    await v.resumeSession();
    assert.equal(v.cards.length, 1);
    assert.equal(v.cards[0].id, other);
    assert.equal(v.answerDraft, 'My recalled wording');
    assert.equal(v.mode, 'TYPE');
  });
  await test('Edited answers reset their custom schedule and changed source cards become new', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    await w.saveCardReviewProgress(`custom:${card}`, id, 'CUSTOM', 4);
    await w.updateCustomCard(card, { front: 'Updated', back: 'Corrected' });
    assert.equal(w.testDb.cardReviews.rows.length, 0);
    const noteId=await w.testDb.notes.add({title:'Energy',sections:[{id:'s',heading:'Energy',definitions:[{term:'Energy',definition:'Ability to work'}]}]});
    const noteCard=w.FlashcardTools.noteCards(await w.getNoteById(noteId))[0];
    await w.saveCardReviewProgress(noteCard.cardKey,noteId,'NOTE',4);
    const note=await w.getNoteById(noteId);note.sections[0].definitions[0].definition='Capacity to do work';await w.updateNote(noteId,{sections:note.sections});
    const l = await w.getFlashcardLibrary();
    assert.ok(l.due.some((c) => c.cardKey === noteCard.cardKey && c.changed));
  });
  await test('Card/deck/note deletion cleans related schedules only', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    await w.saveCardReviewProgress(`custom:${card}`, id, 'CUSTOM', 3);
    await w.testDb.cardReviews.add({ cardKey: 'custom:999' });
    await w.deleteCustomCard(card);
    assert.equal(w.testDb.cardReviews.rows.length, 1);
    await w.addCustomCard({ deckId: id, front: 'F', back: 'B' });
    await w.deleteCustomDeck(id);
    assert.equal(w.testDb.customCards.rows.length, 0);
    await w.testDb.notes.add({ id: 5, title: 'N' });
    await w.testDb.cardReviews.add({ cardKey: 'note:5:s:definition:0' });
    await w.testDb.cardReviews.add({ cardKey: 'note_5:Legacy' });
    await w.deleteNote(5);
    assert.deepEqual(
      Array.from(w.testDb.cardReviews.rows, (r) => r.cardKey),
      ['custom:999'],
    );
  });
  await test('Bulk import rejects invalid rows atomically and skips duplicates', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await assert.rejects(
      w.importCustomCards(id, [
        { front: 'A', back: 'B' },
        { front: 'Missing', back: '' },
      ]),
    );
    assert.equal(w.testDb.customCards.rows.length, 1);
    const result = await w.importCustomCards(id, [
      { front: 'A', back: 'B' },
      { front: 'A', back: 'B' },
    ]);
    assert.equal(result.added, 1);
    assert.equal(result.duplicates, 1);
    w.testDb.customDecks.fail = true;
    await assert.rejects(
      w.addCustomCard({ deckId: id, front: 'Rollback', back: 'B' }),
    );
    assert.equal(w.testDb.customCards.rows.length, 2);
  });
  await test('CSV handles quoted commas/newlines and cloze creates hidden prompts', ({
    w,
  }) => {
    const cards = w.FlashcardTools.csv(
      'front,back,explanation\n"What, exactly?","Answer\nsecond line",Context',
    );
    assert.equal(cards.length, 1);
    assert.equal(cards[0].front, 'What, exactly?');
    assert.ok(cards[0].back.includes('\n'));
    assert.throws(() => w.FlashcardTools.csv('"broken,answer'));
    assert.throws(() => w.FlashcardTools.csv('front,back\nMissing,'));
    const c = w.FlashcardTools.cloze('Water freezes at {{c1::0°C}}.');
    assert.equal(c.front, 'Water freezes at [ … ].');
    assert.equal(c.back, 'Water freezes at 0°C.');
  });
  await test('Plain technical text is preserved and HTML/script payloads never become elements', ({
    w,
  }) => {
    const html = w.FlashcardTools.format('List<T>\n<script>alert(1)</script>');
    const div = w.document.createElement('div');
    div.innerHTML = html;
    assert.equal(div.querySelector('script'), null);
    assert.ok(div.textContent.includes('List<T>'));
    assert.ok(
      w.FlashcardTools.answerMatches(
        '  CAPACITY TO DO WORK. ',
        'Capacity to do work',
      ),
    );
    assert.ok(!w.FlashcardTools.answerMatches('', ''));
  });
  await test('Search keeps focus/caret and pagination limits the vault', async ({
    w,
  }) => {
    for (let i = 0; i < 14; i++)
      await w.createCustomDeck({ title: 'Deck ' + i });
    const v = w.flashcardsView;
    await v.render();
    assert.equal(v.container.querySelectorAll('.fc-deck').length, 12);
    const input = v.container.querySelector('#deck-search-input');
    input.value = 'Deck';
    input.focus();
    input.setSelectionRange(2, 2);
    v.searchQuery = 'Deck';
    await v.renderDecksList();
    assert.equal(w.document.activeElement.id, 'deck-search-input');
    assert.equal(w.document.activeElement.selectionStart, 2);
    v.page = 1;
    v.paintVault();
    assert.equal(v.container.querySelectorAll('.fc-deck').length, 2);
  });
  await test('A stale vault request cannot overwrite a newly opened session', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    const original = w.getFlashcardLibrary;
    let resolve;
    v._cleaned = true;
    w.getFlashcardLibrary = () =>
      resolve ? original() : new Promise((done) => (resolve = done));
    const pending = v.renderDecksList();
    v.cards = structuredClone(v.masterDeckCards);
    v.startStudySession();
    w.getFlashcardLibrary = original;
    resolve(await original());
    await pending;
    assert.ok(v.container.querySelector('#flashcard-scene'));
    assert.equal(v.activeTab, 'study');
  });
  await test('Keyboard shortcuts respect native controls, handled events and unrevealed answers', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.flashcardsView.loadCustomDeck(id);
    const v = w.flashcardsView,
      b = w.document.createElement('button');
    v.handleKeydown({
      target: b,
      code: 'Space',
      key: ' ',
      preventDefault() {},
    });
    assert.equal(v.isFlipped, false);
    v.handleKeydown({
      target: w.document.body,
      code: 'Space',
      key: ' ',
      defaultPrevented: true,
      preventDefault() {},
    });
    assert.equal(v.isFlipped, false);
    v.handleKeydown({
      target: w.document.body,
      code: 'Space',
      key: ' ',
      preventDefault() {},
    });
    assert.equal(v.isFlipped, true);
  });
  await test('Card manager safely searches and edits user content', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.flashcardsView.openManager(id);
    const v = w.flashcardsView;
    assert.ok(v.modal.querySelector('.fc-manager-card'));
    assert.equal(
      v.modal.querySelector('[data-manager=edit]').getAttribute('onclick'),
      null,
    );
    v.managerSearch = 'missing';
    v.paintManager();
    assert.equal(v.modal.querySelectorAll('.fc-manager-card').length, 0);
    v.closeModal();
    assert.equal(w.document.querySelector('dialog'), null);
  });
  await test('Backup merge remaps Custom/Note review keys and source deck references', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    await w.testDb.notes.add({ id: 5, title: 'Existing' });
    const backup = {
      formatVersion: 3,
      tables: {
        customDecks: [{ id, title: 'Imported' }],
        customCards: [
          {
            id: card,
            deckId: id,
            front: 'Imported front',
            back: 'Imported back',
          },
        ],
        notes: [
          {
            id: 5,
            title: 'Imported note',
            sections: [
              {
                id: 's',
                heading: 'S',
                definitions: [{ term: 'T', definition: 'D' }],
              },
            ],
          },
        ],
        cardReviews: [
          {
            id: 1,
            cardKey: `custom:${card}`,
            deckId: String(id),
            deckType: 'CUSTOM',
          },
          {
            id: 2,
            cardKey: 'note:5:s:definition:0',
            deckId: '5',
            deckType: 'NOTE',
          },
        ],
      },
    };
    await w.importDatabaseBackup(JSON.stringify(backup), { mode: 'MERGE' });
    const c = w.testDb.customCards.rows.find(
        (c) => c.front === 'Imported front',
      ),
      n = w.testDb.notes.rows.find((n) => n.title === 'Imported note');
    assert.ok(
      w.testDb.cardReviews.rows.some(
        (r) => r.cardKey === `custom:${c.id}` && r.deckId === String(c.deckId),
      ),
    );
    assert.ok(
      w.testDb.cardReviews.rows.some(
        (r) =>
          r.cardKey === `note:${n.id}:s:definition:0` &&
          r.deckId === String(n.id),
      ),
    );
  });
  await test('Notes reset clears both modern and legacy keys while keeping Custom schedules', async ({
    w,
  }) => {
    await w.testDb.cardReviews.bulkAdd([
      { cardKey: 'note:1:s:definition:0' },
      { cardKey: 'note_1:Energy' },
      { cardKey: 'custom:1' },
    ]);
    await w.clearModuleData('NOTES');
    assert.deepEqual(
      Array.from(w.testDb.cardReviews.rows, (r) => r.cardKey),
      ['custom:1'],
    );
  });
  await test('Pending review completes without repainting another tab, then returns at the right card', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({
      deckId: id,
      front: 'Second',
      back: 'Second answer',
    });
    const v = w.flashcardsView;
    await v.loadCustomDeck(id);
    let release;
    w.saveCardReviewProgress = () =>
      new Promise((resolve) => (release = resolve));
    v.isFlipped = true;
    const pending = v.rateCard(3);
    v.onLeaveView();
    w.app.currentView = 'settings';
    const html = v.container.innerHTML;
    release({ id: 1, operationToken: 'saved' });
    await pending;
    assert.equal(v.container.innerHTML, html);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.ratingsMap.size, 1);
    assert.equal(v._saving, false);
    w.app.currentView = 'flashcards';
    await v.render();
    assert.ok(
      v.container.querySelector('.fc-prompt').textContent.includes('Second'),
    );
  });
  await test('Returning while a review is pending unlocks the visible study screen after completion', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({
      deckId: id,
      front: 'Second',
      back: 'Second answer',
    });
    const v = w.flashcardsView;
    await v.loadCustomDeck(id);
    let release;
    w.saveCardReviewProgress = () =>
      new Promise((resolve) => (release = resolve));
    v.isFlipped = true;
    const pending = v.rateCard(3);
    v.onLeaveView();
    await v.render();
    release({ id: 1, operationToken: 'saved' });
    await pending;
    assert.equal(v.currentIndex, 1);
    assert.ok(
      v.container.querySelector('.fc-prompt').textContent.includes('Second'),
    );
    assert.equal(
      v.container.querySelector('[data-action=next]').disabled,
      false,
    );
  });
  await test('Undo finishing after navigation saves state without reattaching keyboard or repainting', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.isFlipped = true;
    await v.rateCard(3);
    let release;
    w.undoCardReviewProgress = () =>
      new Promise((resolve) => (release = resolve));
    const pending = v.undoRating();
    v.onLeaveView();
    w.app.currentView = 'settings';
    const html = v.container.innerHTML;
    let attachments = 0;
    v.attachKeyboard = () => attachments++;
    release();
    await pending;
    assert.equal(attachments, 0);
    assert.equal(v.container.innerHTML, html);
    assert.equal(v.ratingsMap.size, 0);
    assert.equal(v.savedSession().tab, 'study');
  });
  await test('A pending modal save cannot reopen dialogs after leaving the tab', async ({
    w,
  }) => {
    const v = w.flashcardsView;
    let release;
    w.createCustomDeck = () => new Promise((resolve) => (release = resolve));
    v.openCreateDeckModal();
    v.modal.querySelector('[name=title]').value = 'Pending';
    v.modal.querySelector('[name=subject]').value = 'Science';
    const form = v.modal.querySelector('form');
    const pending = form.onsubmit({ preventDefault() {}, target: form });
    v.onLeaveView();
    w.app.currentView = 'settings';
    assert.equal(w.document.querySelector('dialog'), null);
    release(7);
    await pending;
    assert.equal(w.document.querySelector('dialog'), null);
    assert.equal(v._modalSaving, false);
  });
  await test('Delete confirmation is reachable outside the native manager dialog and Cancel restores the manager', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      v = w.flashcardsView;
    await v.openManager(id);
    v.modal.querySelector('[data-manager=delete]').click();
    assert.equal(w.document.querySelector('dialog'), null);
    assert.ok(w.confirmation);
    await w.confirmation.onCancel();
    assert.ok(v.modal?.open);
    assert.ok(await w.testDb.customCards.get(card));
  });
  await test('Changed current card drops its draft and reveal when a different card resumes', async ({
    w,
  }) => {
    const { id, card } = await seed(w);
    await w.addCustomCard({
      deckId: id,
      front: 'Second',
      back: 'Second answer',
    });
    const v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.mode = 'TYPE';
    v.answerDraft = 'Answer for first';
    v.isFlipped = true;
    v.persistSession();
    await w.deleteCustomCard(card);
    v.activeTab = 'decks';
    await v.resumeSession();
    assert.equal(v.answerDraft, '');
    assert.equal(v.isFlipped, false);
  });
  await test('Background schedule loading preserves typed input focus and selection', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.mode = 'TYPE';
    v.answerDraft = 'Remember this';
    v.renderStudyCard();
    const input = v.container.querySelector('#fc-typed-answer');
    input.focus();
    input.setSelectionRange(2, 6);
    await v.refreshSchedules(v._session);
    assert.equal(w.document.activeElement.id, 'fc-typed-answer');
    assert.equal(w.document.activeElement.selectionStart, 2);
    assert.equal(w.document.activeElement.selectionEnd, 6);
    assert.equal(w.document.activeElement.value, 'Remember this');
  });
  await test('Vertical scrolling, touch cancellation and multi-touch never rate a card', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.isFlipped = true;
    v.renderStudyCard();
    let ratings = 0;
    v.rateCard = () => ratings++;
    const el = v.container.querySelector('#flashcard-scene');
    const touch = (type, points) => {
      const event = new w.Event(type, { bubbles: true });
      Object.defineProperty(event, 'touches', {
        value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      });
      el.dispatchEvent(event);
    };
    touch('touchstart', [[0, 0]]);
    touch('touchmove', [[110, 150]]);
    touch('touchend', []);
    assert.equal(ratings, 0);
    touch('touchstart', [[0, 0]]);
    touch('touchmove', [[150, 5]]);
    touch('touchcancel', []);
    touch('touchend', []);
    assert.equal(ratings, 0);
    touch('touchstart', [[0, 0]]);
    touch('touchmove', [[150, 5]]);
    touch('touchmove', [
      [150, 5],
      [20, 20],
    ]);
    touch('touchend', []);
    assert.equal(ratings, 0);
    touch('touchstart', [[0, 0]]);
    touch('touchmove', [[150, 5]]);
    touch('touchend', []);
    assert.equal(ratings, 1);
  });
  await test('Notes sourceRefs and changed custom answers survive into the card identity', ({
    w,
  }) => {
    const card = w.FlashcardTools.noteCards({
      id: 1,
      title: 'N',
      sections: [
        {
          id: 's',
          heading: 'S',
          definitions: [{ term: 'T', definition: 'D' }],
          sourceRefs: [{ fileName: 'Book.pdf', page: 4 }],
        },
      ],
    })[0];
    assert.equal(card.sourceReferences[0].page, 4);
    const c={id:1,deckId:1,front:'What is force?',back:'A push'},old=w.FlashcardTools.customCard(c);
    c.back='A push or pull';
    assert.notEqual(
      w.FlashcardTools.customCard(c).contentFingerprint,
      old.contentFingerprint,
    );
    assert.throws(
      () => w.FlashcardTools.csv('"Prompt"garbage,Answer'),
      /closing quote/,
    );
  });
  await test('PDF sheet contains the full original deck with escaped learning context', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({
      deckId: id,
      front: 'Second <script>',
      back: 'Second answer',
    });
    const v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.ratingsMap.set(v.cards[0].cardKey, 1);
    v.restartWithWeakCards();
    let html;
    w.pdfGenerator = {
      openPrintWindow(value) {
        html = value;
        return true;
      },
    };
    v.exportCurrentDeckToPdf();
    assert.ok(html.includes('2 flashcards'));
    assert.ok(html.includes('Second &lt;script&gt;'));
    assert.ok(html.includes('Energy has many forms.'));
    assert.ok(!html.includes('Second <script>'));
  });
  await test('Relearning, full restart and Undo use the latest actual schedule for every copy', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.isFlipped = true;
    await v.rateCard(1);
    v.isFlipped = true;
    await v.rateCard(3);
    assert.equal(v.cards[0].srs.lastRating, 3);
    assert.equal(v.masterDeckCards[0].srs.lastRating, 3);
    await v.undoRating();
    assert.equal(v.masterDeckCards[0].srs.lastRating, 1);
    v.isFlipped = true;
    await v.rateCard(3);
    v.restartFullDeck();
    assert.equal(w.FlashcardTools.intervalLabel(v.cards[0].srs, 3), '4d');
  });
  await test('Module reset invalidates pending review state and removes session recovery', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    let release;
    w.saveCardReviewProgress = () =>
      new Promise((resolve) => (release = resolve));
    v.isFlipped = true;
    const pending = v.rateCard(3);
    v.resetSession();
    release({ id: 1, operationToken: 'old' });
    await pending;
    assert.equal(v.currentDeck, null);
    assert.equal(v.cards.length, 0);
    assert.equal(v.masterDeckCards.length, 0);
    assert.equal(v.ratingsMap.size, 0);
    assert.equal(v.savedSession(), null);
    assert.equal(v._saving, false);
  });
  await test('Mathematical signs, decimal points and technical types are distinct card answers', ({
    w,
  }) => {
    for (const answer of ['-5','5','1.5','15','List<int>','List<string>','Set<int>','Set<string>']) {
      const c = w.FlashcardTools.customCard({id:1,front:'Recall',back:answer});
      assert.ok(c);
      assert.equal(c.back, answer);
    }
    assert.equal(w.FlashcardTools.answerMatches('5', '-5'), false);
    assert.equal(w.FlashcardTools.answerMatches('1.5', '15'), false);
    assert.equal(
      w.FlashcardTools.answerMatches('List<int>', 'List<string>'),
      false,
    );
    assert.equal(w.FlashcardTools.answerMatches('−5', '-5'), true);
    assert.equal(
      w.FlashcardTools.answerMatches(
        'Capacity to do work.',
        'capacity to do work',
      ),
      true,
    );
  });
  await test('Resume restores the exact repeated Again occurrence and its typed draft', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.isFlipped = true;
    await v.rateCard(1);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.cards[0].cardKey, v.cards[1].cardKey);
    v.mode = 'TYPE';
    v.answerDraft = 'Second attempt';
    v.persistSession();
    v.activeTab = 'decks';
    await v.resumeSession();
    assert.equal(v.currentIndex, 1);
    assert.equal(v.answerDraft, 'Second attempt');
    assert.equal(v.cards.length, 2);
  });
  await test('Notes cannot replace a session or navigate while a rating is saving', async ({
    w,
    load,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    await w.testDb.notes.add({
      id: 7,
      title: 'Chapter',
      sections: [{ heading: 'H', keyPoints: ['Recall this'] }],
    });
    load('js/views/study-notes.js');
    w.studyNotesView.activeNote = { id: 7 };
    let navigation = 0;
    w.app.navigate = () => navigation++;
    v._saving = true;
    assert.equal(await v.loadNotesDeck(7), false);
    await w.studyNotesView.createFlashcardsFromNote();
    assert.equal(v.currentDeck.id, id);
    assert.equal(navigation, 0);
  });
  await test('CSV preserves a real Front card, accepts BOM and reports multiple invalid rows', ({
    w,
  }) => {
    const T = w.FlashcardTools;
    assert.equal(T.csv('Front,Opposite of back')[0].front, 'Front');
    assert.equal(T.csv('\uFEFF"front","back"\n"Q","A"')[0].back, 'A');
    const result = T.csv(
      'front,back\nGood,Answer\nMissing,\nToo,many,columns,here',
      { preview: true },
    );
    assert.equal(result.cards.length, 1);
    assert.deepEqual(
      Array.from(result.errors, (e) => e.row),
      [3, 4],
    );
    assert.throws(() => T.csv('front,back\nGood,Answer\nMissing,'), /row 3/);
  });
  await test('Mixed and incomplete cloze groups are rejected instead of becoming misleading cards', ({
    w,
  }) => {
    for (const input of [
      'A {{c1::one}} and {{c2::two}}',
      'A {{c1::one}} then {{c1::broken',
      'A {{c1::one}} }}',
    ])
      assert.equal(w.FlashcardTools.cloze(input), null);
    assert.ok(w.FlashcardTools.cloze('A {{c1::one}} and {{c1::two}}'));
  });
  await test('Key points preserve their original PDF source references', ({
    w,
  }) => {
    const refs = [{ fileName: 'Physics.pdf', page: 8 }],
      n = w.FlashcardTools.noteCards({
        id: 1,
        title: 'N',
        sections: [
          {
            id: 's',
            heading: 'S',
            keyPoints: ['Speed changes'],
            sourceRefs: refs,
          },
        ],
      });
    assert.equal(n[0].sourceReferences[0].page, 8);
    assert.equal(n[0].sourceReferences[0].fileName,'Physics.pdf');
  });
  await test('Unsaved Add/Edit/Import drafts survive closing and can be explicitly discarded', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      v = w.flashcardsView;
    for (const open of [
      () => v.openAddCardModal(id),
      () =>
        v.openAddCardModal(
          id,
          '',
          w.testDb.customCards.rows.find((c) => c.id === card),
        ),
      () => v.openBulkImport(id),
    ]) {
      open();
      const field = v.modal.querySelector('textarea');
      field.value = 'Unsaved work';
      v.closeModal(false, false);
      open();
      assert.equal(v.modal.querySelector('textarea').value, 'Unsaved work');
      [...v.modal.querySelectorAll('button')]
        .find((b) => b.textContent === 'Discard draft')
        .click();
      v.closeModal(false, false);
      open();
      assert.notEqual(v.modal.querySelector('textarea').value, 'Unsaved work');
      v.closeModal(false, false);
    }
  });
  await test('Successful card saves clear recovery drafts and failed saves keep them', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openAddCardModal(id);
    v.modal.querySelector('[name=front]').value = 'New prompt';
    v.modal.querySelector('[name=back]').value = 'New answer';
    const form = v.modal.querySelector('form');
    w.testDb.customCards.fail = true;
    await form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(v.readDrafts()['add:' + id].data.front, 'New prompt');
    w.testDb.customCards.fail = false;
    await form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(v.readDrafts()['add:' + id], undefined);
    assert.equal(form.querySelector('[name=front]').value, '');
  });
  await test('Pagehide flushes a pending draft and Flashcards reset clears only requested drafts', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openAddCardModal(id);
    v.modal.querySelector('[name=front]').value = 'Interrupted';
    w.dispatchEvent(new w.Event('pagehide'));
    assert.equal(v.readDrafts()['add:' + id].data.front, 'Interrupted');
    v.resetSession();
    assert.ok(v.readDrafts()['add:' + id]);
    v.resetSession({ clearDrafts: true });
    assert.equal(Object.keys(v.readDrafts()).length, 0);
  });
  await test('Note insertion and reordering preserve the correct schedules; edited answers reset them', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'N',
      sections: [
        { id: 's', heading: 'H', keyPoints: ['First fact', 'Second fact'] },
      ],
    });
    const original = (await w.getFlashcardLibrary()).cards;
    for (const card of original)
      await w.saveCardReviewProgress(card.cardKey, id, 'NOTE', 4);
    await w.updateNote(id, {
      sections: [
        {
          id: 's',
          heading: 'Renamed',
          keyPoints: ['New fact', 'Second fact', 'First fact'],
        },
      ],
    });
    const current = (await w.getFlashcardLibrary()).cards;
    for (const old of original) {
      const kept = current.find((c) => c.back === old.back);
      assert.equal(kept.cardKey, old.cardKey);
      assert.equal(kept.srs.lastRating, 4);
    }
    assert.equal(current.find((c) => c.back === 'New fact').srs, null);
    await w.updateNote(id, {
      sections: [
        {
          id: 's',
          heading: 'Renamed',
          keyPoints: ['New fact', 'Corrected second fact', 'First fact'],
        },
      ],
    });
    assert.ok(
      (await w.getFlashcardLibrary()).cards.find(
        (c) => c.back === 'Corrected second fact',
      ).changed,
    );
  });
  await test('Legacy note fingerprints migrate without resetting an unchanged review', async ({
    w,
  }) => {
    const note = {
      id: 3,
      title: 'N',
      sections: [
        {
          id: 's',
          heading: 'H',
          definitions: [{ term: 'Force', definition: 'A push' }],
        },
      ],
    };
    await w.testDb.notes.add(note);
    const old = w.FlashcardTools.noteCards(note)[0];
    await w.testDb.cardReviews.add({
      cardKey: old.cardKey,
      contentFingerprint: w.FlashcardTools.hash(
        JSON.stringify([old.front, old.back, old.explanation, []]),
      ),
      lastRating: 4,
      dueDate: '2099-01-01',
    });
    const library = await w.getFlashcardLibrary();
    assert.equal(library.cards[0].srs.lastRating, 4);
    assert.equal(library.cards[0].changed, false);
  });
  await test('Long notes become smaller recall cards without dropping any source words', ({
    w,
  }) => {
    const content = Array.from({ length: 300 }, (_, i) => 'word' + i).join(' '),
      cards = w.FlashcardTools.noteCards({
        id: 1,
        title: 'N',
        sections: [{ id: 's', heading: 'Long', content }],
      });
    assert.ok(cards.length > 1);
    assert.ok(cards.every((c) => c.back.length <= 650));
    assert.equal(cards.map((c) => c.back).join(' '), content);
  });
  await test('Due cards sort by overdue urgency and invalid dueAt falls back to a valid legacy date', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      second = await w.addCustomCard({
        deckId: id,
        front: 'Other',
        back: 'Answer',
      });
    await w.testDb.cardReviews.add({
      cardKey: 'custom:' + card,
      dueDate: '2001-01-01',
    });
    await w.testDb.cardReviews.add({
      cardKey: 'custom:' + second,
      dueAt: '2000-01-01T00:00:00Z',
    });
    assert.deepEqual(
      Array.from((await w.getFlashcardLibrary()).due, (c) => c.id),
      [second, card],
    );
    assert.equal(
      w.FlashcardTools.due({ dueAt: 'broken', dueDate: '2000-01-01' }),
      true,
    );
  });
  await test('Formula MathML renders safely while code and raw technical text stay literal', ({
    w,
    load,
  }) => {
    load('assets/vendor/marked.min.js');
    load('assets/vendor/katex.min.js');
    const html = w.FlashcardTools.format('$$\\frac{a}{b}$$ and `List<int>`');
    assert.ok(html.includes('<mfrac>'));
    assert.ok(html.includes('List&lt;int&gt;'));
    assert.ok(
      w.FlashcardTools.format('\\frac{1}{2}', { formula: true }).includes(
        '<math',
      ),
    );
    assert.ok(!w.FlashcardTools.format('`$x$`').includes('<math'));
    assert.ok(
      !w.FlashcardTools.format('$\\href{javascript:alert(1)}{x}$').includes(
        'href=',
      ),
    );
    assert.ok(
      !w.FlashcardTools.format('<img src=x onerror=alert(1)> $x$').includes(
        '<img',
      ),
    );
  });
  await test('Deck search uses the cached library and typed draft writes flush on pagehide', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.render();
    let reads = 0;
    const original = w.getFlashcardLibrary;
    w.getFlashcardLibrary = async () => {
      reads++;
      return original();
    };
    const search = v.container.querySelector('#deck-search-input');
    search.value = '2026';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(reads, 0);
    await v.loadCustomDeck(id);
    v.mode = 'TYPE';
    v.renderStudyCard();
    const input = v.container.querySelector('#fc-typed-answer');
    const before = w.localStorage.getItem(v.storageKey);
    input.value = 'Pending recall';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(w.localStorage.getItem(v.storageKey), before);
    w.dispatchEvent(new w.Event('pagehide'));
    assert.equal(v.savedSession().answer, 'Pending recall');
  });
  await test('Keyboard focus follows reveal, next question and typed answer feedback', async ({
    w,
  }) => {
    const { id } = await seed(w);
    await w.addCustomCard({ deckId: id, front: 'Second', back: 'Answer' });
    const v = w.flashcardsView;
    await v.loadCustomDeck(id);
    assert.ok(w.document.activeElement.matches('.fc-prompt'));
    v.toggleFlip();
    assert.equal(w.document.activeElement.dataset.action, 'flip');
    v.nextCard();
    assert.ok(w.document.activeElement.matches('.fc-prompt'));
    v.mode = 'TYPE';
    v.toggleFlip(true);
    assert.ok(w.document.activeElement.matches('.fc-answer'));
  });
  await test('Import preview reports existing and batch duplicates plus precise invalid-row reasons', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openBulkImport(id);
    v.modal.querySelector('[name=content]').value =
      'front,back\nWhat is energy?,Capacity to do work\nNew,Answer\nNew,Answer\nMissing,';
    await v.modal.querySelector('#fc-preview-import').onclick();
    const text = v.modal.querySelector('#fc-import-preview').textContent;
    assert.ok(text.includes('1 new cards'));
    assert.ok(text.includes('2 duplicates'));
    assert.ok(text.includes('1 invalid rows'));
    assert.ok(text.includes('Row 5'));
    assert.equal(w.testDb.customCards.rows.length, 1);
  });
  await test('Malformed backup cards and orphan deck references are skipped before restore', ({
    w,
  }) => {
    const data = Object.fromEntries(tables.map((name) => [name, []]));
    data.customDecks = [{ id: 1, title: 'Valid deck', subject: 'Science' }];
    data.customCards = [
      { id: 1, deckId: 1, front: 'F', back: 'B' },
      { id: 2, deckId: 1, front: 'Only front' },
      { id: 3, deckId: 99, front: 'Orphan', back: 'B' },
    ];
    const validation = w._validateBackupTables(data);
    assert.equal(data.customCards.length, 1);
    assert.equal(validation.report.customCards.skipped, 2);
  });
  await test('Deleting a deck or card removes only its recovery drafts', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      other = await w.createCustomDeck({ title: 'Keep', subject: 'Science' });
    const keys = [
      'deck:new',
      'deck:' + id,
      'add:' + id,
      'import:' + id,
      'card:' + card,
      'add:' + other,
    ];
    w.localStorage.setItem(
      'hamsa_flashcard_drafts',
      JSON.stringify(
        Object.fromEntries(
          keys.map((key) => [key, { data: { front: 'Draft' } }]),
        ),
      ),
    );
    await w.deleteCustomCard(card);
    assert.equal(w.flashcardsView.readDrafts()['card:' + card], undefined);
    assert.ok(w.flashcardsView.readDrafts()['add:' + id]);
    await w.deleteCustomDeck(id);
    assert.deepEqual(
      Object.keys(w.flashcardsView.readDrafts()).sort(),
      ['deck:new', 'add:' + other].sort(),
    );
  });
  await test('Large valid Again queues remain recoverable and malformed saved queues are bounded', ({
    w,
  }) => {
    const v = w.flashcardsView,
      s = {
        version: 1,
        deck: { id: 1, title: 'Large session', type:'CUSTOM' },
        keys: Array.from({ length: 6001 }, () => ['custom:1', 'fp']),
        masterKeys: [['custom:1', 'fp']],
        ratings: [],
      };
    w.localStorage.setItem(v.storageKey, JSON.stringify(s));
    assert.equal(v.savedSession().keys.length, 6001);
    s.keys = Array.from({ length: 60001 }, () => ['custom:1', 'fp']);
    w.localStorage.setItem(v.storageKey, JSON.stringify(s));
    assert.equal(v.savedSession(), null);
  });
  await test('Legacy due-date fallback displays a valid calendar date and rejects impossible dates', ({
    w,
  }) => {
    const T = w.FlashcardTools,
      review = { dueAt: 'broken', dueDate: '2000-01-01' };
    assert.ok(Number.isFinite(T.reviewTime(review)));
    assert.ok(!T.reviewLabel(review).includes('Invalid'));
    assert.equal(T.due({ dueDate: '2000-02-31' }), false);
    assert.equal(T.due({ dueDate: '' }), false);
  });
  await test('Superscripts, subscripts, chemical case and code symbols retain different identities', async ({
    w,
  }) => {
    const T = w.FlashcardTools;
    for (const [a, b] of [
      ['x²', 'x2'],
      ['CO', 'Co'],
      ['H₂O', 'H2O'],
      ['m', 'M'],
      ['NaCl', 'NACL'],
      ['m/s', 'M/s'],
    ]) {
      assert.equal(T.answerMatches(a, b), false);
      assert.notEqual(
        T.customIdentity({ front: 'Same', back: a }),
        T.customIdentity({ front: 'Same', back: b }),
      );
    }
    const { id } = await seed(w);
    const imported = await w.importCustomCards(id, [
      { front: 'Simplify', back: 'x²' },
      { front: 'Simplify', back: 'x2' },
    ]);
    assert.equal(imported.added, 2);
    assert.equal(imported.duplicates, 0);
    assert.ok(T.answerMatches('CAPACITY TO DO WORK.', 'Capacity to do work'));
    assert.ok(T.answerMatches('ENERGY', 'Energy'));
  });
  await test('Reading legacy Notes durably migrates identities and records last-read time', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Legacy',
      sections: [
        {
          id: 's',
          heading: 'Speed',
          definitions: [{ term: 'Speed', definition: 'Distance/time' }],
        },
      ],
    });
    const note = await w.getNoteById(id),
      saved = await w.testDb.notes.get(id);
    assert.ok(note.lastReadAt && Number.isFinite(Date.parse(note.lastReadAt)));
    assert.deepEqual(clone(note.flashcardIds), saved.flashcardIds);
    assert.equal(note.lastReadAt, saved.lastReadAt);
    const again = await w.getNoteById(id);
    assert.equal(again.flashcardIds[0].token, note.flashcardIds[0].token);
    const latestSaved = await w.testDb.notes.get(id);
    assert.equal(again.lastReadAt, latestSaved.lastReadAt);
    w.testDb.notes.fail = true;
    const readable = await w.getNoteById(id);
    assert.equal(readable.lastReadAt, latestSaved.lastReadAt);
    assert.deepEqual(clone(readable.flashcardIds), latestSaved.flashcardIds);
  });
  await test('Digit ratings work from the focused Reveal button and native Space stays native', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.toggleFlip();
    const button = w.document.activeElement;
    assert.equal(button.dataset.action, 'flip');
    const space = new w.KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(space);
    assert.equal(space.defaultPrevented, false);
    assert.equal(v.isFlipped, true);
    button.dispatchEvent(
      new w.KeyboardEvent('keydown', {
        key: '3',
        code: 'Digit3',
        bubbles: true,
        cancelable: true,
      }),
    );
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(v.ratingsMap.get('custom:' + card), 3);
    assert.equal(w.testDb.cardReviews.rows.length, 1);
  });
  await test('Code/math/table scrolling and disabled swipe ratings cannot save reviews', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.toggleFlip();
    let calls = 0;
    v.rateCard = () => calls++;
    const scene = w.document.getElementById('flashcard-scene');
    const swipe = (target) => {
      for (const [type, x] of [
        ['touchstart', 200],
        ['touchmove', 30],
        ['touchend', 30],
      ]) {
        const event = new w.Event(type, { bubbles: true });
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [{ clientX: x, clientY: 20 }],
        });
        target.dispatchEvent(event);
      }
    };
    for (const tag of ['pre', 'code', 'table']) {
      const node = w.document.createElement(tag);
      scene.append(node);
      swipe(node);
    }
    const math = w.document.createElement('span');
    math.className = 'fc-math';
    scene.append(math);
    swipe(math);
    const scroller = w.document.createElement('div');
    scroller.style.overflowX = 'auto';
    scene.append(scroller);
    Object.defineProperties(scroller, {
      scrollWidth: { value: 500 },
      clientWidth: { value: 100 },
    });
    swipe(scroller);
    assert.equal(calls, 0);
    v.swipeRatings = false;
    swipe(scene);
    assert.equal(calls, 0);
    v.swipeRatings = true;
    swipe(scene);
    assert.equal(calls, 1);
  });
  await test('A deferred Note load cannot replace a review even after that review completes', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    await Promise.resolve();
    let resolve;
    w.getNoteById = () => new Promise((r) => (resolve = r));
    const loading = v.loadNotesDeck(55);
    v.isFlipped = true;
    await v.rateCard(3);
    resolve({
      id: 55,
      title: 'Delayed',
      sections: [{ id: 's', heading: 'H', keyPoints: ['Late answer'] }],
    });
    assert.equal(await loading, false);
    assert.equal(v.currentDeck.id, id);
    assert.equal(v.masterDeckCards[0].sourceDeckType, 'CUSTOM');
    assert.equal(v.ratingsMap.size, 1);
  });
  await test('Deferred deck and smart/resume loads respect new dialogs and pending reviews', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    await new Promise((r) => setTimeout(r, 0));
    v.persistSession();
    const original = w.getFlashcardLibrary;
    for (const begin of [
      () => v.loadCustomDeck(id),
      () => v.smartDeck('NEW'),
      () => v.resumeSession(),
    ]) {
      let resolve;
      w.getFlashcardLibrary = () => new Promise((r) => (resolve = r));
      const loading = begin();
      v._saving = true;
      resolve(await original());
      await loading;
      assert.equal(v.currentDeck.id, id);
      assert.equal(v.currentDeck.type, 'CUSTOM');
      v._saving = false;
    }
    w.getFlashcardLibrary = original;
  });
  await test('Slow CSV reads disable import/preview and never import previously pasted text', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openBulkImport(id);
    const d = v.modal;
    d.querySelector('[name=content]').value = 'Old,Answer';
    let resolve;
    const reading = d.querySelector('#fc-csv-file').onchange({
      target: {
        files: [{ size: 20, text: () => new Promise((r) => (resolve = r)) }],
      },
    });
    assert.equal(d.querySelector('[type=submit]').disabled, true);
    assert.equal(d.querySelector('#fc-preview-import').disabled, true);
    await d
      .querySelector('form')
      .onsubmit({ preventDefault() {}, target: d.querySelector('form') });
    assert.equal(w.testDb.customCards.rows.length, 1);
    resolve('New,Answer');
    await reading;
    assert.equal(d.querySelector('[type=submit]').disabled, false);
    await d
      .querySelector('form')
      .onsubmit({ preventDefault() {}, target: d.querySelector('form') });
    assert.ok(w.testDb.customCards.rows.some((c) => c.front === 'New'));
    assert.ok(!w.testDb.customCards.rows.some((c) => c.front === 'Old'));
  });
  await test('Latest CSV selection wins; read failure and closed dialogs retain correct drafts', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openBulkImport(id);
    const d = v.modal,
      file = d.querySelector('#fc-csv-file');
    let a, b;
    const first = file.onchange({
      target: {
        files: [{ size: 10, text: () => new Promise((r) => (a = r)) }],
      },
    });
    const second = file.onchange({
      target: {
        files: [{ size: 10, text: () => new Promise((r) => (b = r)) }],
      },
    });
    b('Latest,Answer');
    await second;
    a('Old,Answer');
    await first;
    assert.equal(d.querySelector('[name=content]').value, 'Latest,Answer');
    await file.onchange({
      target: {
        files: [
          {
            size: 10,
            text: async () => {
              throw Error('Disk error');
            },
          },
        ],
      },
    });
    assert.equal(d._fileLoading, false);
    assert.equal(d.querySelector('[name=content]').value, 'Latest,Answer');
    assert.ok(w.toasts.some((t) => t.text.includes('Disk error')));
    let close;
    const pending = file.onchange({
      target: {
        files: [{ size: 10, text: () => new Promise((r) => (close = r)) }],
      },
    });
    v.closeModal(false, false);
    v.openBulkImport(id);
    close('Closed,Answer');
    await pending;
    assert.equal(
      v.modal.querySelector('[name=content]').value,
      'Latest,Answer',
    );
  });
  await test('A CSV file invalidates an older asynchronous preview and oversized files unblock controls', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    v.openBulkImport(id);
    const d = v.modal;
    d.querySelector('[name=content]').value = 'Old,Answer';
    let resolve;
    const original = w.getCustomDeckWithCards;
    w.getCustomDeckWithCards = () => new Promise((r) => (resolve = r));
    const preview = d.querySelector('#fc-preview-import').onclick();
    await d.querySelector('#fc-csv-file').onchange({
      target: { files: [{ size: 10, text: async () => 'New,Answer' }] },
    });
    resolve(await original(id));
    await preview;
    assert.equal(d.querySelector('#fc-import-preview').textContent, '');
    await d.querySelector('#fc-csv-file').onchange({
      target: {
        files: [
          {
            size: 2000001,
            text: async () => {
              throw Error('Should not read');
            },
          },
        ],
      },
    });
    assert.equal(d._fileLoading, false);
    assert.equal(d.querySelector('[type=submit]').disabled, false);
  });
  await test('Malformed optional backup metadata is repaired without losing valid cards or crashing Reveal/PDF', async ({
    w,
  }) => {
    const data = Object.fromEntries(tables.map((name) => [name, []]));
    data.customDecks = [{ id: 1, title: 'Repaired', subject: 'Science' }];
    data.customCards = [
      {
        id: 1,
        deckId: 1,
        front: 'Question',
        back: 'Answer',
        sourceReferences: { bad: true },
        options: { bad: true },
        optionExplanations: [null, {}],
        memoryCue: { bad: true },
      },
    ];
    w._validateBackupTables(data);
    assert.equal(data.customCards.length, 1);
    assert.deepEqual(clone(data.customCards[0].sourceReferences), []);
    await w.testDb.customDecks.bulkAdd(data.customDecks);
    await w.testDb.customCards.bulkAdd(data.customCards);
    const v = w.flashcardsView;
    await v.loadCustomDeck(1);
    v.toggleFlip();
    assert.ok(v.container.querySelector('.fc-answer'));
    let paper;
    w.pdfGenerator = {
      openPrintWindow: (html) => {
        paper = html;
        return true;
      },
    };
    v.masterDeckCards[0].sourceReferences = [
      null,
      { fileName: 'Good', page: 2 },
    ];
    v.masterDeckCards[0].options = { bad: true };
    v.exportCurrentDeckToPdf();
    assert.ok(paper.includes('Answer') && paper.includes('Good'));
  });
  await test('Currency stays readable while explicit equations render safe MathML', ({
    w,
    load,
  }) => {
    load('assets/vendor/marked.min.js');
    load('assets/vendor/katex.min.js');
    for (const value of [
      '$10 to $20',
      '$10, $20 and $30',
      'Price: \\$10',
      'Costs $5 each or $10 total',
      '$5+$10',
    ]) {
      const div = w.document.createElement('div');
      div.innerHTML = w.FlashcardTools.format(value);
      assert.equal(div.querySelector('math'), null);
      assert.ok(div.textContent.includes('$10'));
    }
    const div = w.document.createElement('div');
    div.innerHTML = w.FlashcardTools.format('Use $x^2$ or \\(v=d/t\\).');
    assert.equal(div.querySelectorAll('math').length, 2);
    div.innerHTML = w.FlashcardTools.format(
      '[$x^2$](https://example.test/$y^2$)',
    );
    assert.equal(div.querySelectorAll('a math').length, 1);
    assert.equal(
      div.querySelector('a').getAttribute('href'),
      'https://example.test/$y^2$',
    );
  });
  await test('Due counts and reviewed-today status follow elapsed time without rereading source tables', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      v = w.flashcardsView;
    await w.saveCardReviewProgress('custom:' + card, id, 'CUSTOM', 1);
    await v.render();
    assert.equal(v.library.due.length, 0);
    const reads = w.testDb.notes.toArray;
    w.testDb.notes.toArray = () => {
      throw Error('Unnecessary read');
    };
    const future = new Date(Date.now() + 11 * 60000);
    v.updateVaultStatus(future);
    assert.equal(v.library.due.length, 1);
    v.updateVaultStatus(new Date(Date.now() + 2 * 86400000));
    assert.equal(v.library.reviewedToday, 0);
    w.testDb.notes.toArray = reads;
    v.onLeaveView();
  });
  await test('Visible due timer refreshes counts while preserving the search field and caret', async ({
    w,
  }) => {
    const { id, card } = await seed(w),
      v = w.flashcardsView;
    await w.testDb.cardReviews.add({
      cardKey: 'custom:' + card,
      dueAt: new Date(Date.now() + 180).toISOString(),
    });
    await v.render();
    const input = v.container.querySelector('#deck-search-input');
    input.focus();
    input.value = 'Notes';
    v.searchQuery = 'Notes';
    input.setSelectionRange(2, 2);
    await new Promise((r) => setTimeout(r, 420));
    assert.equal(v.library.due.length, 1);
    assert.ok(v.container.textContent.includes('Due now · 1'));
    assert.equal(w.document.activeElement.id, 'deck-search-input');
    assert.equal(w.document.activeElement.selectionStart, 2);
    v.onLeaveView();
  });
  await test('CSV errors use physical line numbers for blank, quoted-multiline and CRLF records', ({
    w,
  }) => {
    const T = w.FlashcardTools;
    assert.equal(
      T.csv('front,back\n\nGood,Answer\nMissing,', { preview: true }).errors[0]
        .row,
      4,
    );
    assert.equal(
      T.csv('front,back\r\n\r\n"Multi\r\nline",Answer\r\nMissing,', {
        preview: true,
      }).errors[0].row,
      5,
    );
    assert.equal(
      T.csv('\nGood,Answer\n\nMissing,', { preview: true }).errors[0].row,
      4,
    );
    assert.throws(
      () => T.csv('front,back\n\n"Missing'),
      /row 3: unclosed quote/,
    );
  });
  await test('Submitted typed answers collapse without losing the student response or feedback', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.mode = 'TYPE';
    v.answerDraft = 'Capacity to do work';
    v.answerChecked = true;
    v.toggleFlip(true);
    assert.equal(v.container.querySelector('#fc-typed-answer'), null);
    assert.ok(
      v.container
        .querySelector('.fc-submitted-answer')
        .textContent.includes(v.answerDraft),
    );
    assert.ok(
      v.container.querySelector('.fc-notice').textContent.includes('matches'),
    );
    assert.equal(v.container.querySelector('[data-action=check-answer]'), null);
  });
  await test('Bulk review cleanup reads each source table once for hundreds of Note reviews', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Large',
      sections: [
        {
          id: 's',
          heading: 'Words',
          definitions: Array.from({ length: 350 }, (_, i) => ({
            term: 'Term ' + i,
            definition: 'Meaning ' + i,
          })),
        },
      ],
    });
    const note = await w.getNoteById(id),
      cards = w.FlashcardTools.noteCards(note);
    for (const card of cards)
      await w.testDb.cardReviews.add({
        cardKey: card.cardKey,
        dueDate: '2000-01-01',
      });
    let builds = 0,
      reads = 0;
    const original = w.FlashcardTools.noteCards;
    w.FlashcardTools.noteCards = (...args) => {
      builds++;
      return original.apply(w.FlashcardTools, args);
    };
    const get = w.testDb.notes.get;
    w.testDb.notes.get = (...args) => {
      reads++;
      return get(...args);
    };
    await w.cleanupFlashcardReviews();
    assert.equal(builds, 1);
    assert.equal(reads, 0);
    assert.equal(w.testDb.cardReviews.rows.length, 350);
  });
  await test('Note splitting respects sentences and preserves complete code, math and table blocks', ({
    w,
  }) => {
    const T = w.FlashcardTools,
      code = '```js\n' + 'let example = 1;\n'.repeat(80) + '```',
      formula = '$$' + 'x+'.repeat(400) + 'y$$';
    const text =
      'First sentence describes a whole idea. '.repeat(30) +
      '\n\n' +
      code +
      '\n\n' +
      formula +
      '\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nLast sentence uses 1.5 units.';
    const parts = T.recallParts(text);
    assert.ok(parts.some((p) => p.includes(code)));
    assert.ok(parts.some((p) => p.includes(formula)));
    assert.ok(parts.some((p) => p.includes('| A | B |\n|---|---|\n| 1 | 2 |')));
    assert.equal(
      parts.join(' ').replace(/\s+/g, ' ').trim(),
      text.replace(/\s+/g, ' ').trim(),
    );
    assert.ok(
      parts
        .filter((p) => !p.includes(code) && !p.includes(formula))
        .every((p) => p.length <= 650),
    );
  });
  await test('Original source opens the selected local PDF page and revokes its URL on close', async ({
    w,
  }) => {
    let revoked;
    w.URL.createObjectURL = () => 'blob:http://localhost/verified';
    w.URL.revokeObjectURL = (url) => (revoked = url);
    const id = await w.testDb.notes.add({
      title: 'Original',
      originalSource: {
        files: [
          {
            name: 'book.pdf',
            type: 'PDF',
            data: 'data:application/pdf;base64,JVBERi0xLjQ=',
          },
        ],
        pages: [
          { fileName: 'book.pdf', page: 3, text: 'Verified source text' },
        ],
      },
      sections: [
        {
          id: 's',
          heading: 'Speed',
          keyPoints: ['Distance/time'],
          sourceRefs: [{ fileName: 'book.pdf', page: 3 }],
        },
      ],
    });
    const v = w.flashcardsView;
    await v.loadNotesDeck(id);
    v.toggleFlip();
    assert.ok(v.container.querySelector('[data-action=source]'));
    await v.openCardSource(0);
    assert.ok(v.modal.querySelector('iframe').src.endsWith('#page=3'));
    assert.ok(v.modal.textContent.includes('Verified source text'));
    v.closeModal(false, false);
    assert.equal(revoked, 'blob:http://localhost/verified');
  });
  await test('Missing or unsafe original files use escaped source text without misleading iframe links', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Older note',
      originalSource: {
        files: [
          { name: 'unsafe.pdf', data: 'data:text/html;base64,PHNjcmlwdD4=' },
        ],
        text: '<script>unsafe</script>',
      },
      sections: [
        {
          id: 's',
          heading: 'Topic',
          keyPoints: ['Remember this'],
          sourceRefs: [{ fileName: 'unsafe.pdf', page: 1 }],
        },
      ],
    });
    const v = w.flashcardsView;
    await v.loadNotesDeck(id);
    v.toggleFlip();
    await v.openCardSource(0);
    assert.equal(v.modal.querySelector('iframe,script'), null);
    assert.ok(v.modal.textContent.includes('original file is unavailable'));
    assert.ok(v.modal.querySelector('pre').textContent.includes('<script>'));
  });
  await test('Recall mode and swipe preference persist together with daily limits', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    const select = v.container.querySelector('#fc-mode');
    select.value = 'TYPE';
    v.handleChange({ target: select });
    v.swipeRatings = false;
    v.newLimit = 31;
    v.savePreferences();
    const other = new v.constructor();
    assert.equal(other.mode, 'TYPE');
    assert.equal(other.swipeRatings, false);
    assert.equal(other.newLimit, 31);
    assert.equal(other.reviewLimit, 100);
    await other.loadCustomDeck(id);
    assert.ok(other.container.querySelector('#fc-typed-answer'));
  });
  await test('Vault offers only note and custom decks with active recall actions', async ({
    w,
  }) => {
    await seed(w);
    await w.testDb.notes.add({title:'Science note',sections:[{id:'s',heading:'Energy',keyPoints:['Energy is conserved']}]});
    await w.flashcardsView.render();
    const container=w.flashcardsView.container;
    assert.deepEqual(Array.from(container.querySelectorAll('[data-action=study-deck]'),button=>button.dataset.type).sort(),['CUSTOM','NOTE']);
    assert.ok(!/quiz|bookmarked questions/i.test(container.textContent));
    await w.flashcardsView.smartDeck('ALL');
    assert.equal(w.flashcardsView.cards.length,2);
    assert.ok(w.flashcardsView.cards.every(card=>['NOTE','CUSTOM'].includes(card.sourceDeckType)));
  });
  await test('Resuming a different recall mode never changes the preferred mode for a new deck', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    v.mode = 'TYPE';
    v.answerDraft = 'Draft from previous device';
    v.persistSession();
    await v.resumeSession();
    assert.equal(v.mode, 'TYPE');
    assert.equal(v.preferredMode, 'FLIP');
    await v.loadCustomDeck(id);
    assert.equal(v.mode, 'FLIP');
    assert.equal(v.preferredMode, 'FLIP');
    w.localStorage.setItem(
      v.preferencesKey,
      JSON.stringify({
        mode: 'TYPE',
        newLimit: 15,
        reviewLimit: 30,
        swipeRatings: false,
      }),
    );
    await v.loadCustomDeck(id);
    assert.equal(v.mode, 'TYPE');
    assert.equal(v.swipeRatings, false);
    assert.equal(v.newLimit, 15);
  });
  await test('Opening a dialog during an asynchronous deck load cannot replace the active session', async ({
    w,
  }) => {
    const { id } = await seed(w),
      v = w.flashcardsView;
    await v.loadCustomDeck(id);
    await new Promise((r) => setTimeout(r, 0));
    const other = await w.createCustomDeck({
      title: 'Other deck',
      subject: 'Science',
    });
    await w.addCustomCard({ deckId: other, front: 'Other?', back: 'Answer' });
    const original = w.getFlashcardLibrary;
    let resolve;
    w.getFlashcardLibrary = () => new Promise((r) => (resolve = r));
    const loading = v.loadCustomDeck(other);
    v.openCreateDeckModal();
    resolve(await original());
    await loading;
    assert.equal(v.currentDeck.id, id);
    assert.equal(v.masterDeckCards[0].sourceDeckId, id);
    assert.ok(v.modal.open);
    w.getFlashcardLibrary = original;
  });
  await test('A stale source read cannot open a viewer after the session has changed', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Source',
      sections: [{ id: 's', heading: 'Topic', keyPoints: ['Saved context'] }],
    });
    const v = w.flashcardsView;
    await v.loadNotesDeck(id);
    let resolve;
    w.getNoteById = () => new Promise((r) => (resolve = r));
    const loading = v.openCardSource(-1);
    v.onLeaveView();
    resolve({ title: 'Old source', originalSource: { text: 'Old text' } });
    await loading;
    assert.equal(w.document.querySelector('.fc-modal'), null);
  });
  await test('Flat legacy Notes remain the same usable source in reading, library and actual review storage', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Legacy flat text',
      content: 'A force is a push or pull.',
      subject: 'Science',
    });
    const note = await w.getNoteById(id),
      card = w.FlashcardTools.noteCards(note)[0];
    assert.ok(card && card.back.includes('push or pull'));
    const live = await w.getFlashcardByKey(card.cardKey);
    assert.equal(live.cardKey, card.cardKey);
    assert.equal(live.contentFingerprint, card.contentFingerprint);
    const library = await w.getFlashcardLibrary();
    assert.equal(library.notes[0].cardCount, 1);
    const record = await w.saveCardReviewProgress(card.cardKey, id, 'NOTE', 3);
    assert.equal(record.lastRating, 3);
    assert.equal((await w.getFlashcardLibrary()).cards[0].srs.id, record.id);
  });
  await test('Failed first read-metadata write leaves a legacy Note readable without claiming persistence', async ({
    w,
  }) => {
    const id = await w.testDb.notes.add({
      title: 'Readable',
      content: 'Saved source remains available.',
    });
    w.testDb.notes.fail = true;
    const note = await w.getNoteById(id);
    assert.ok(note.sections[0].content.includes('Saved source'));
    assert.equal(note.lastReadAt, undefined);
    assert.equal(note.flashcardIds, undefined);
    const raw = await w.testDb.notes.get(id);
    assert.equal(raw.lastReadAt, undefined);
    assert.equal(raw.flashcardIds, undefined);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
