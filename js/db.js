/**
 * HAMSA VIDYA (हंस विद्या) — Database & Persistence Layer (Dexie.js / IndexedDB)
 */

// Initialize Dexie Database
const db = new Dexie('HamsaVidyaDB');

// Define Schema
db.version(1).stores({
  quizzes: '++id, title, subject, difficulty, quizMode, language, sourceType, totalQuestions, durationSeconds, score, correct, incorrect, skipped, percentage, createdAt, completedAt',
  questions: '++id, quizId, questionText, correctAnswerIndex, isBookmarked, userSelectedOptionIndex, sourcePage',
  attempts: '++id, quizId, attemptedAt, score, correct, incorrect, skipped, percentage, durationSeconds'
});

db.version(2).stores({
  notes: '++id, title, subject, content, summary, createdAt, updatedAt'
});

db.version(3).stores({
  notes: '++id, title, subject, isFavorite, createdAt, updatedAt, lastReadAt'
});

db.version(4).stores({
  customDecks: '++id, title, subject, description, createdAt, updatedAt',
  customCards: '++id, deckId, front, back, explanation, badge, createdAt',
  cardReviews: '++id, cardKey, deckId, deckType, interval, repetitions, easeFactor, dueDate, state, lastReviewedAt'
});

db.version(5).stores({
  exams: 'id, examName, organizingBody, applicationDeadline, examDate, source',
  savedExams: '++id, examId, savedAt'
});

db.version(6).stores({
  answers: '++id, question, exam, subject, difficulty, wordLimit, marks, answerType, studentAnswer, inputSource, score, status, createdAt, updatedAt',
  answerDrafts: '++id, question, exam, subject, difficulty, wordLimit, marks, answerType, studentAnswer, inputSource, updatedAt'
});

db.version(7).stores({
  aiTeacherExplanations: '++id, question, topic, subject, language, depth, mode, isBookmarked, createdAt, updatedAt'
});

/**
 * v8 introduced an `examDetails` store that cached AI-extracted notification
 * fields (age limits, fees, pay scales) read from detail pages and PDFs.
 *
 * v9 drops it: the exam tab now reads one table — post date, board, post name,
 * qualification, last date — and nothing else, so there is nothing to cache.
 * The version is kept in the chain rather than deleted because Dexie replays
 * upgrades for users who already have v8 on disk; `null` is how a store is
 * removed, and skipping straight from 7 to 9 would leave their table orphaned.
 */
db.version(8).stores({
  examDetails: 'examId, fetchedAt, status'
});

db.version(9).stores({
  examDetails: null
});

// Retired stores remain in the schema so upgrading never deletes browser data.
// They are available only to portable backup/restore compatibility below.
db.version(10).stores({}).upgrade(async tx => {
  await tx.table('aiTeacherExplanations').toCollection().modify(row => {
    row.isBookmarked = row.isBookmarked ? 1 : 0;
  });
});
db.version(11).stores({ quizDraftFiles: 'id, savedAt' });
db.version(12).stores({});
db.version(13).stores({
  pdfQuizzes: '++id, title, difficulty, createdAt',
  pdfQuizAttempts: '++id, quizId, completedAt'
});

function validatePdfQuizRecord(quiz) {
  const source = quiz?.source;
  const string = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  if (!quiz || !string(quiz.title, 200) || !['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(quiz.difficulty) || !string(quiz.language, 40) || !string(quiz.model, 120) || !Number.isFinite(Date.parse(quiz.createdAt))) throw new Error('The quiz has invalid metadata.');
  for (const field of ['subject', 'chapter', 'exam']) if (quiz[field] != null && (typeof quiz[field] !== 'string' || quiz[field].length > 120)) throw new Error('The quiz has invalid study context.');
  const sourceType = source?.type || 'PDF';
  if (!source || !['PDF','TOPIC','TEXT'].includes(sourceType)) throw new Error('The quiz has an invalid source.');
  if (sourceType === 'PDF' && (!string(source.fileName, 500) || !Number.isSafeInteger(source.pageCount) || source.pageCount < 1 || source.pageCount > 1000 || !Number.isSafeInteger(source.fromPage) || !Number.isSafeInteger(source.toPage) || source.fromPage < 1 || source.toPage < source.fromPage || source.toPage > source.pageCount)) throw new Error('The quiz has an invalid PDF page range.');
  if (source.excerptedPages != null && (sourceType !== 'PDF' || !Array.isArray(source.excerptedPages) || source.excerptedPages.length > 1000 || source.excerptedPages.some(page => !Number.isSafeInteger(page) || page < source.fromPage || page > source.toPage) || new Set(source.excerptedPages).size !== source.excerptedPages.length)) throw new Error('The quiz has invalid PDF excerpt references.');
  if (source.ocrPages != null && (sourceType !== 'PDF' || !Array.isArray(source.ocrPages) || source.ocrPages.length > 1000 || Array.from(source.ocrPages).some(page => !Number.isSafeInteger(page) || page < source.fromPage || page > source.toPage) || new Set(source.ocrPages).size !== source.ocrPages.length)) throw new Error('The quiz has invalid scanned PDF page references.');
  if (sourceType !== 'PDF' && !string(source.text, sourceType === 'TOPIC' ? 2000 : 20000)) throw new Error('The quiz has invalid topic or study text.');
  if (!Array.isArray(quiz.questions) || quiz.questions.length < 1 || quiz.questions.length > 200) throw new Error('The quiz must contain 1 to 200 questions.');
  if (quiz.generationId != null && !string(quiz.generationId,100)) throw new Error('The quiz generation ID is invalid.');
  const seen = new Set();
  for (const question of quiz.questions) {
    if (!question || !string(question.question, 2000) || !string(question.explanation, 3000) || !Array.isArray(question.options) || question.options.length !== 4 || Array.from(question.options).some(option => !string(option, 1000)) || !Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3 || sourceType === 'PDF' && (!Number.isSafeInteger(question.sourcePage) || question.sourcePage < source.fromPage || question.sourcePage > source.toPage) || sourceType !== 'PDF' && question.sourcePage != null) throw new Error('The quiz contains an invalid question.');
    if (question.optionExplanations != null && (!Array.isArray(question.optionExplanations) || question.optionExplanations.length !== 4 || Array.from(question.optionExplanations).some(reason => !string(reason, 1500)))) throw new Error('The quiz contains invalid option explanations.');
    if (question.difficulty != null && !['EASY', 'MEDIUM', 'HARD'].includes(question.difficulty)) throw new Error('The question difficulty is invalid.');
    if (question.topic != null && (typeof question.topic !== 'string' || question.topic.length > 120)) throw new Error('The question topic is invalid.');
    const key = question.question.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
    // In mathematics and code, signs, punctuation and case change an answer.
    const optionKeys = question.options.map(value => value.normalize('NFKC').trim().replace(/\s+/g, ' '));
    if (!key || seen.has(key) || optionKeys.some(option => !/[\p{L}\p{N}]/u.test(option)) || new Set(optionKeys).size !== 4) throw new Error('The quiz contains duplicate questions or options.');
    seen.add(key);
  }
  return quiz;
}

function scorePdfQuizAttempt(quiz, input) {
  if (!Array.isArray(input?.answers) || input.answers.length !== quiz.questions.length || Array.from(input.answers).some(answer => answer !== null && (!Number.isInteger(answer) || answer < 0 || answer > 3))) throw new Error('The answer list does not match this quiz.');
  const answers = input.answers.slice();
  const allIndices = quiz.questions.map((_, index) => index);
  const questionIndices = input.questionIndices == null ? allIndices : validateQuizQuestionIndices(input.questionIndices, quiz.questions.length);
  const questionOrder = input.questionOrder == null ? questionIndices.slice() : validateQuizQuestionIndices(input.questionOrder, quiz.questions.length);
  const active = new Set(questionIndices);
  if (answers.some((answer, index) => !active.has(index) && answer !== null)) throw new Error('Questions outside this revision must be unanswered.');
  if (questionOrder.length !== questionIndices.length || questionOrder.some(index => !active.has(index))) throw new Error('The question order does not match the selected questions.');
  const optionOrder = input.optionOrder == null ? allIndices.map(() => [0, 1, 2, 3]) : input.optionOrder;
  if (!Array.isArray(optionOrder) || optionOrder.length !== answers.length || Array.from(optionOrder).some(order => !Array.isArray(order) || order.length !== 4 || Array.from(order).some(index => !Number.isInteger(index) || index < 0 || index > 3) || new Set(order).size !== 4)) throw new Error('The option order is invalid.');
  const confidence = input.confidence == null ? answers.map(() => null) : input.confidence;
  if (!Array.isArray(confidence) || confidence.length !== answers.length || Array.from(confidence).some(value => value !== null && !['LOW', 'MEDIUM', 'HIGH'].includes(value))) throw new Error('The confidence list does not match this quiz.');
  const marked = input.marked == null ? [] : input.marked;
  if (!Array.isArray(marked) || Array.from(marked).some(index => !Number.isInteger(index) || !active.has(index)) || new Set(marked).size !== marked.length) throw new Error('The marked questions are invalid.');
  const mode = input.mode == null ? 'PRACTICE' : input.mode;
  if (!['PRACTICE', 'EXAM'].includes(mode)) throw new Error('The attempt mode is invalid.');
  const settings = validateQuizAttemptSettings(input.settings);
  if (input.attemptKey != null && (typeof input.attemptKey !== 'string' || !input.attemptKey.trim() || input.attemptKey.length > 160)) throw new Error('The attempt key is invalid.');
  if (input.parentAttemptId != null && (!Number.isSafeInteger(input.parentAttemptId) || input.parentAttemptId < 1)) throw new Error('The parent attempt is invalid.');
  if (input.expired != null && typeof input.expired !== 'boolean') throw new Error('The timer expiry flag is invalid.');
  const correct = questionIndices.filter(index => answers[index] === quiz.questions[index].answerIndex).length;
  const skipped = questionIndices.filter(index => answers[index] === null).length;
  const incorrect = questionIndices.length - correct - skipped;
  const score = Number((correct * settings.marksPerQuestion - incorrect * settings.negativeMarks).toFixed(6));
  const maxMarks = Number((questionIndices.length * settings.marksPerQuestion).toFixed(6));
  const completedAt = input.completedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(completedAt))) throw new Error('The completion date is invalid.');
  return { answers, questionIndices: questionIndices.slice(), questionOrder: questionOrder.slice(), optionOrder: optionOrder.map(order => order.slice()),
    confidence: confidence.slice(), marked: marked.slice(), mode, settings, ...(input.attemptKey ? {attemptKey:input.attemptKey} : {}),
    ...(input.parentAttemptId != null ? {parentAttemptId:input.parentAttemptId} : {}), ...(input.expired != null ? {expired:input.expired} : {}),
    correct, skipped, incorrect, score, maxMarks, marksPercentage: Math.round(score / maxMarks * 100),
    totalQuestions: questionIndices.length, percentage: Math.round(correct / questionIndices.length * 100),
    accuracy: correct + incorrect ? Math.round(correct / (correct + incorrect) * 100) : 0, completedAt,
    durationSeconds: Number.isFinite(input.durationSeconds) && input.durationSeconds >= 0 ? input.durationSeconds : 0 };
}

function validateQuizQuestionIndices(indices, length) {
  if (!Array.isArray(indices) || !indices.length || indices.length > length || Array.from(indices).some(index => !Number.isInteger(index) || index < 0 || index >= length) || new Set(indices).size !== indices.length) throw new Error('The selected quiz questions are invalid.');
  return indices.slice();
}

function validateQuizAttemptSettings(input) {
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) throw new Error('The exam settings are invalid.');
  const settings = {durationMinutes:0, marksPerQuestion:1, negativeMarks:0, shuffleQuestions:false, shuffleOptions:false, presetId:'CUSTOM', ...input};
  if (!Number.isFinite(settings.durationMinutes) || settings.durationMinutes < 0 || settings.durationMinutes > 720 || !Number.isFinite(settings.marksPerQuestion) || settings.marksPerQuestion <= 0 || settings.marksPerQuestion > 100 || !Number.isFinite(settings.negativeMarks) || settings.negativeMarks < 0 || settings.negativeMarks > settings.marksPerQuestion || typeof settings.shuffleQuestions !== 'boolean' || typeof settings.shuffleOptions !== 'boolean' || typeof settings.presetId !== 'string' || settings.presetId.length > 80) throw new Error('The exam settings are invalid.');
  return {durationMinutes:settings.durationMinutes, marksPerQuestion:settings.marksPerQuestion, negativeMarks:settings.negativeMarks,
    shuffleQuestions:settings.shuffleQuestions, shuffleOptions:settings.shuffleOptions, presetId:settings.presetId};
}

let quizStorageBlocked = false;
if (typeof db.on === 'function') db.on('blocked', () => { quizStorageBlocked = true; });

async function ensureQuizStorage() {
  if (db.isOpen?.()) return;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(quizStorageBlocked
      ? 'Quiz storage is waiting for another Hamsa Vidya tab. Close the other tabs, reload this page and try again.'
      : 'Quiz storage took too long to open. Close other Hamsa Vidya tabs, reload this page and try again.'), {code: 'QUIZ_STORAGE_TIMEOUT'})), window.quizStore.STORAGE_TIMEOUT_MS);
  });
  // Only opening is raced. No write can begin after this wait has failed.
  try { await Promise.race([db.open(), timeout]); quizStorageBlocked = false; }
  finally { clearTimeout(timer); }
}

async function quizStorageTransaction(mode, tables, operation) {
  await ensureQuizStorage();
  let timer, timedOut = false;
  try {
    return await db.transaction(mode, tables, async () => {
      const transaction = Dexie.currentTransaction;
      if (typeof transaction?.abort === 'function') timer = setTimeout(() => {
        timedOut = true;
        try { transaction.abort(); } catch {}
      }, window.quizStore.STORAGE_TIMEOUT_MS);
      return await operation();
    });
  } catch (error) {
    if (timedOut) throw Object.assign(new Error('Quiz storage took too long and the transaction was cancelled. Reload the page and try again.'), {code: 'QUIZ_STORAGE_TIMEOUT'});
    throw error;
  } finally { clearTimeout(timer); }
}

window.quizStore = {
  STORAGE_TIMEOUT_MS: 15000,
  async save(quiz) {
    validatePdfQuizRecord(quiz);
    const saved = JSON.parse(JSON.stringify(quiz));
    delete saved.id;
    saved.questions = saved.questions.map((question, index) => ({...question, id: `q${index + 1}`}));
    return quizStorageTransaction('rw', [db.pdfQuizzes], async () => {
      // A checkpoint may survive a successful final save. Retrying must not duplicate the quiz.
      if (saved.generationId) {
        const existing = (await db.pdfQuizzes.toArray()).find(row => row.generationId === saved.generationId);
        if (existing) return existing;
      }
      saved.id = await db.pdfQuizzes.add(saved);
      return saved;
    });
  },
  async list() { return (await quizStorageTransaction('r', [db.pdfQuizzes], () => db.pdfQuizzes.toArray())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id); },
  async get(id) { return await quizStorageTransaction('r', [db.pdfQuizzes], () => db.pdfQuizzes.get(Number(id))) || null; },
  async remove(id) {
    const quizId = Number(id);
    return quizStorageTransaction('rw', [db.pdfQuizzes, db.pdfQuizAttempts], async () => {
      await db.pdfQuizAttempts.where('quizId').equals(quizId).delete();
      await db.pdfQuizzes.delete(quizId);
    });
  },
  async saveAttempt(id, input) {
    const quizId = Number(id);
    return quizStorageTransaction('rw', [db.pdfQuizzes, db.pdfQuizAttempts], async () => {
      const quiz = await db.pdfQuizzes.get(quizId);
      if (!quiz) throw new Error('This quiz no longer exists.');
      validatePdfQuizRecord(quiz);
      const attempt = {quizId, ...scorePdfQuizAttempt(quiz, input)};
      if (attempt.attemptKey) {
        const existing = (await db.pdfQuizAttempts.where('quizId').equals(quizId).toArray()).find(row => row.attemptKey === attempt.attemptKey);
        if (existing) return existing;
      }
      attempt.id = await db.pdfQuizAttempts.add(attempt);
      return attempt;
    });
  },
  async convertToFlashcards(quiz, questionIndices) {
    const quizId = Number(quiz?.id);
    if (!Number.isSafeInteger(quizId) || quizId < 1) throw new Error('Save this quiz before converting it into flashcards.');
    return quizStorageTransaction('rw', [db.pdfQuizzes, db.customDecks, db.customCards], async () => {
      const canonical = await db.pdfQuizzes.get(quizId);
      if (!canonical) throw new Error('This quiz no longer exists.');
      validatePdfQuizRecord(canonical);
      const indices = validateQuizQuestionIndices(questionIndices ?? canonical.questions.map((_, index) => index), canonical.questions.length).sort((a,b) => a-b);
      const conversionKey = `quiz:${quizId}:${canonical.createdAt}:${indices.join(',')}`;
      const existing = (await db.customDecks.toArray()).find(deck => deck.quizConversionKey === conversionKey);
      if (existing) return {deckId:existing.id, count:await db.customCards.where('deckId').equals(existing.id).count(), reused:true, deck:existing};
      const now = new Date().toISOString();
      const deck = {title:`${canonical.title} — Revision`.slice(0,200), subject:canonical.subject || canonical.chapter || 'General Study',
        description:`${indices.length} revision flashcards from ${canonical.title}`, createdAt:now, updatedAt:now,
        sourceQuizId:quizId, sourceQuizCreatedAt:canonical.createdAt, sourceQuestionIndices:indices, quizConversionKey:conversionKey};
      deck.id = await db.customDecks.add(deck);
      for (const index of indices) {
        const question = canonical.questions[index];
        const optionReasons = (question.optionExplanations || []).map((reason, option) => `${'ABCD'[option]}. ${question.options[option]}: ${reason}`).join('\n');
        await db.customCards.add({deckId:deck.id, front:question.question, back:question.options[question.answerIndex],
          explanation:question.explanation + (optionReasons ? `\n\nOption explanations:\n${optionReasons}` : ''),
          options:question.options.slice(), optionExplanations:(question.optionExplanations || []).slice(), correctAnswerIndex:question.answerIndex,
          sourceReferences:question.sourcePage ? [{fileName:canonical.source.fileName, page:question.sourcePage}] : [],
          sourceTitle:canonical.title, sourcePage:question.sourcePage || null, sourceQuestionIndex:index,
          topic:question.topic || canonical.chapter || '', difficulty:question.difficulty || canonical.difficulty, badge:'Quiz revision', createdAt:now});
      }
      return {deckId:deck.id, count:indices.length, reused:false, deck};
    });
  },
  async listAttempts(id) { return (await quizStorageTransaction('r', [db.pdfQuizAttempts], () => db.pdfQuizAttempts.where('quizId').equals(Number(id)).toArray())).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id - a.id); }
};

function toBookmarkFlag(value) { return value ? 1 : 0; }

function isActiveCardReview(review) {
  return /^(?:custom:\d+|note(?:_|:)\d+:.+)$/.test(String(review?.cardKey || ''));
}

/** Counters for the active study modules. */
async function getDashboardStats() {
  const [totalNotesCount, totalFlashcardDecks, totalCustomCards, totalCardReviews, dueCardsToday, answerCount, teacherCount, savedExamCount] = await Promise.all([
    db.notes.count().catch(() => 0),
    db.customDecks.count().catch(() => 0),
    db.customCards.count().catch(() => 0),
    db.cardReviews.filter(isActiveCardReview).count().catch(() => 0),
    typeof getDueCardsCount === 'function' ? getDueCardsCount().catch(() => 0) : 0,
    db.answers.count().catch(() => 0),
    db.aiTeacherExplanations.count().catch(() => 0),
    db.savedExams.count().catch(() => 0)
  ]);
  return { totalNotesCount, totalFlashcardDecks, totalCustomCards, totalCardReviews, dueCardsToday,
    answerCount, teacherCount, savedExamCount, dayStreak: Number(localStorage.getItem('hamsa_streak_days') || 1),
    totalLearningActivities: totalNotesCount + totalCardReviews + answerCount + teacherCount };
}

/**
 * Daily activity counts for the dashboard heatmap.
 *
 * Aggregates notes created/edited,
 * flashcard reviews, written answers and AI Teacher lessons — so the grid
 * reflects activity in the current study modules.
 *
 * @param {number} days how far back to look (default 12 weeks)
 * @returns {Promise<{cells: Array, totalActive: number, maxCount: number, total: number}>}
 */
async function getActivityHeatmap(days = 84) {
  const buckets = new Map();

  const localKey = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    // Local date parts — toISOString() would file a late-evening session under
    // tomorrow in positive UTC offsets like IST.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const bump = (value, weight = 1) => {
    const key = localKey(value);
    if (!key) return;
    buckets.set(key, (buckets.get(key) || 0) + weight);
  };

  try {
    const [notes, reviews, answers, lessons] = await Promise.all([
      db.notes.toArray().catch(() => []),
      db.cardReviews.toArray().catch(() => []),
      db.answers.toArray().catch(() => []),
      db.aiTeacherExplanations.toArray().catch(() => [])
    ]);

    notes.forEach(n => bump(n.updatedAt || n.createdAt));
    reviews.filter(isActiveCardReview).forEach(r => bump(r.lastReviewedAt));
    answers.forEach(a => bump(a.createdAt));
    lessons.forEach(l => bump(l.createdAt));
  } catch (err) {
    console.warn('Could not build activity heatmap:', err);
  }

  // Build a contiguous day series ending today so the grid has no gaps.
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const count = buckets.get(key) || 0;
    cells.push({
      date: key,
      count,
      weekday: d.getDay(),      // 0 = Sunday
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    });
  }

  const counts = cells.map(c => c.count);
  return {
    cells,
    totalActive: counts.filter(c => c > 0).length,
    maxCount: counts.length ? Math.max(...counts) : 0,
    total: counts.reduce((a, b) => a + b, 0)
  };
}

/**
 * This week versus last week, so the dashboard can show direction of travel
 * rather than only absolute totals.
 */
async function getStudyMomentum() {
  const now = new Date(), end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const thisWeekStart = new Date(end); thisWeekStart.setDate(end.getDate() - 7);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const inRange = (value, from, to) => { const date = new Date(value); return value && Number.isFinite(date.getTime()) && date >= from && date < to; };
  const [notes, reviews, answers] = await Promise.all([
    db.notes.toArray().catch(() => []), db.cardReviews.filter(isActiveCardReview).toArray().catch(() => []), db.answers.toArray().catch(() => [])
  ]);
  const momentum = {};
  for (const [name, rows, date] of [['notes', notes, row => row.updatedAt || row.createdAt], ['reviews', reviews, row => row.lastReviewedAt], ['answers', answers, row => row.createdAt]]) {
    const current = rows.filter(row => inRange(date(row), thisWeekStart, end)).length;
    const previous = rows.filter(row => inRange(date(row), lastWeekStart, thisWeekStart)).length;
    momentum[name + 'ThisWeek'] = current;
    momentum[name + 'LastWeek'] = previous;
    momentum[name + 'Delta'] = previous ? current - previous : null;
  }
  return momentum;
}

/** Summary counts exclude archived stores. */
async function getDatabaseSummaryCounts() {
  const [notesCount, deckCount, cardCount, reviewCount, answerCount, teacherCount, savedExamCount, quizCount, quizAttemptCount] = await Promise.all([
    db.notes.count().catch(() => 0), db.customDecks.count().catch(() => 0), db.customCards.count().catch(() => 0),
    db.cardReviews.filter(isActiveCardReview).count().catch(() => 0), db.answers.count().catch(() => 0),
    db.aiTeacherExplanations.count().catch(() => 0), db.savedExams.count().catch(() => 0),
    db.pdfQuizzes.count().catch(() => 0), db.pdfQuizAttempts.count().catch(() => 0)
  ]);
  return { notesCount, deckCount, cardCount, reviewCount, answerCount, teacherCount, savedExamCount, quizCount, quizAttemptCount,
    totalRecords: notesCount + deckCount + cardCount + reviewCount + answerCount + teacherCount + savedExamCount + quizCount + quizAttemptCount };
}

// =========================================================================
// BACKUP & RESTORE (format v3)
//
// Covers every table plus the preferences and student profile that live in
// localStorage. Earlier versions exported only 4 of the 12 tables, so a user
// who restored a backup silently lost their flashcard SRS progress, answer
// writing history, AI Teacher library and academic profile.
//
// Restore is transactional and takes an in-memory snapshot first, so a failure
// part-way through cannot leave the database emptied.
// =========================================================================

/**
 * Every table we persist, with the metadata needed to validate and merge it.
 *
 *  key        — Dexie table name
 *  label      — human-readable name for the import report
 *  autoId     — primary key is auto-incremented (so merge can safely re-add)
 *  required   — fields that must be present for a record to be considered valid
 *  parentRef  — { field, table } foreign key that must be remapped on merge
 *  isCache    — regenerable data; excluded from "user data" counts
 */
const BACKUP_TABLE_SPECS = [
  { key: 'pdfQuizzes', label: 'PDF Quizzes', autoId: true, required: ['title', 'source', 'questions', 'difficulty', 'language', 'model', 'createdAt'] },
  { key: 'pdfQuizAttempts', label: 'Quiz Attempts', autoId: true, required: ['answers', 'completedAt'], parentRef: {field: 'quizId', table: 'pdfQuizzes'} },
  { key: 'quizzes', legacy: true,  label: 'Archived data',                autoId: true,  required: ['title'] },
  // `normalise` runs on every imported row before it is written. Backups taken
  // from a build older than v10 hold `isBookmarked: true/false`, and a boolean
  // in an indexed field is invisible to IndexedDB — restoring one verbatim would
  // silently hide those bookmarks all over again.
  { key: 'questions', legacy: true, label: 'Archived entries',              autoId: true,  required: ['questionText'], parentRef: { field: 'quizId', table: 'quizzes' },
    normalise: (row) => { row.isBookmarked = row.isBookmarked ? 1 : 0; } },
  { key: 'attempts', legacy: true, label: 'Archived activity',          autoId: true,  required: [],               parentRef: { field: 'quizId', table: 'quizzes' } },
  { key: 'notes',                 label: 'Study Notes',            autoId: true,  required: ['title'] },
  { key: 'customDecks',           label: 'Flashcard Decks',        autoId: true,  required: ['title'] },
  { key: 'customCards',           label: 'Flashcards',             autoId: true,  required: ['front'],        parentRef: { field: 'deckId', table: 'customDecks' } },
  { key: 'cardReviews',           label: 'Spaced Repetition Progress', autoId: true, required: ['cardKey'] },
  { key: 'answers',               label: 'Answer Writing Attempts', autoId: true, required: ['question'] },
  { key: 'answerDrafts',          label: 'Answer Drafts',          autoId: true,  required: [] },
  { key: 'aiTeacherExplanations', label: 'AI Teacher Library',     autoId: true,  required: ['question'] },
  { key: 'savedExams',            label: 'Saved Exams',            autoId: true,  required: [] },
  { key: 'exams',                 label: 'Exam Cache',             autoId: false, required: ['id'], isCache: true }
];

/** localStorage keys that are part of the user's configuration. */
const BACKUP_PREFERENCE_KEYS = [
  'hamsa_theme_mode',
  'hamsa_theme_palette',
  'hamsa_font_size',
  'hamsa_font_family',
  'hamsa_streak_days',
  'hamsa_last_active_date',
  'hamsa_sound_muted',
  'hamsa_gemini_model',
  'hamsa_study_preferences',
  'hamsa_flashcard_preferences',
  'hamsa_textbook_theme',
  'hamsa_textbook_font',
  'hamsa_textbook_size',
  'hamsa_exam_profile',
  'hamsa_saved_questions_v1'
];

/** Saved questions are portable snapshots; they remain usable after deleting their source quiz. */
function normaliseSavedQuizBookmarks(value) {
  let list;
  try { list = typeof value === 'string' && value.length <= 12 * 1024 * 1024 ? JSON.parse(value) : null; } catch { return null; }
  if (!Array.isArray(list) || list.length > 10000) return null;
  const saved = new Map();
  const text = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
  for (const item of list) {
    if (!item || !text(item.key, 100) || !text(item.question, 2000) || !Array.isArray(item.options) || item.options.length !== 4 || Array.from(item.options).some(option => !text(option, 1000) || !/[\p{L}\p{N}]/u.test(option)) || !Number.isInteger(item.answerIndex) || item.answerIndex < 0 || item.answerIndex > 3 || item.explanation != null && !text(item.explanation, 3000, true) || item.sourcePage != null && (!Number.isSafeInteger(item.sourcePage) || item.sourcePage < 1 || item.sourcePage > 1000) || item.quizTitle != null && !text(item.quizTitle, 200, true) || item.savedAt != null && !Number.isFinite(Date.parse(item.savedAt))) continue;
    const options = item.options.map(option => option.normalize('NFKC').trim().replace(/\s+/g, ' '));
    if (new Set(options).size !== 4 || item.optionExplanations != null && (!Array.isArray(item.optionExplanations) || item.optionExplanations.length !== 4 || Array.from(item.optionExplanations).some(reason => !text(reason, 1500)))) continue;
    if (item.difficulty != null && !['EASY','MEDIUM','HARD','MIXED'].includes(item.difficulty) || ['topic','subject','chapter','exam'].some(key => item[key] != null && !text(item[key],120,true))) continue;
    const bookmark = {key:item.key, question:item.question, options:item.options.slice(), answerIndex:item.answerIndex,
      explanation:item.explanation || '', sourcePage:item.sourcePage ?? null, quizTitle:item.quizTitle || '', savedAt:item.savedAt || null};
    for (const key of ['difficulty','topic','subject','chapter','exam']) if (item[key] != null) bookmark[key] = item[key];
    if (item.optionExplanations) bookmark.optionExplanations = item.optionExplanations.slice();
    if (!saved.has(bookmark.key)) saved.set(bookmark.key, bookmark);
  }
  return JSON.stringify([...saved.values()]);
}

const DATA_MODULES = {
  QUIZ: { label: 'PDF quizzes & attempts', tables: ['pdfQuizzes', 'pdfQuizAttempts'] },
  NOTES: { label: 'Study Notes', tables: ['notes'], reviewPrefix: 'note_' },
  FLASHCARDS: { label: 'Flashcards & revision progress', tables: ['customDecks', 'customCards', 'cardReviews'] },
  ANSWERS: { label: 'Answer Writing', tables: ['answers', 'answerDrafts'] },
  TEACHER: { label: 'AI Teacher lessons', tables: ['aiTeacherExplanations'] },
  EXAMS: { label: 'Saved exams & exam cache', tables: ['savedExams', 'exams'] }
};

/** Atomic module deletion; remove derived review keys without touching other modules. */
async function clearModuleData(moduleId) {
  const module = DATA_MODULES[moduleId];
  if (!module) throw new Error('Unknown data module.');
  const tables = [...module.tables, ...(module.reviewPrefix ? ['cardReviews'] : [])].map(key => db[key]);
  const removed = {};
  const savedQuestionsSnapshot = moduleId === 'QUIZ' ? localStorage.getItem('hamsa_saved_questions_v1') : null;
  let bookmarksRemoved = false;
  if (moduleId === 'QUIZ') removed.savedQuestions = JSON.parse(normaliseSavedQuizBookmarks(savedQuestionsSnapshot) || '[]').length;
  try { await db.transaction('rw', tables, async () => {
    for (const key of module.tables) {
      removed[key] = await db[key].count();
      await db[key].clear();
    }
    if (module.reviewPrefix) {
      const reviews = await db.cardReviews.toArray();
      const matching = reviews.filter(review => String(review.cardKey || '').startsWith(module.reviewPrefix)||(moduleId==='NOTES'&&String(review.cardKey||'').startsWith('note:')));
      for (const review of matching) await db.cardReviews.delete(review.id);
      removed.cardReviews = matching.length;
    }
    // A storage failure rejects the database transaction too. Restore the
    // bookmark snapshot if IndexedDB subsequently refuses the commit.
    if (moduleId === 'QUIZ') { localStorage.removeItem('hamsa_saved_questions_v1'); bookmarksRemoved = true; }
  }); } catch (error) {
    if (bookmarksRemoved && savedQuestionsSnapshot !== null) localStorage.setItem('hamsa_saved_questions_v1', savedQuestionsSnapshot);
    throw error;
  }
  return removed;
}

/**
 * Read every table into a plain object. Used both for export and for the
 * pre-import safety snapshot.
 */
async function _readAllTables() {
  const out = {};
  for (const spec of BACKUP_TABLE_SPECS) {
    try {
      out[spec.key] = db[spec.key] ? await db[spec.key].toArray() : [];
    } catch {
      out[spec.key] = [];
    }
  }
  return out;
}

/**
 * JSON Data Export / Backup — all tables, preferences and student profile.
 */
async function exportDatabaseBackup() {
  const tables = await _readAllTables();
  // JSON cannot represent Blobs. Encode only for an explicit portable backup;
  // archived records may still contain their original PDF as a Blob handle.
  for (let index=0;index<tables.quizzes.length;index++) {
    const quiz=tables.quizzes[index], source=quiz.originalSource;
    if (!Array.isArray(source?.files) || !source.files.some(file=>file?.blob instanceof Blob)) continue;
    const files=[];
    for (const file of source.files) {
      if (!(file?.blob instanceof Blob)) { files.push(file);continue; }
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error('The original PDF could not be included in the backup. Retry the backup.'));
        reader.readAsDataURL(new Blob([file.blob],{type:'application/pdf'}));
      });
      const {blob,...metadata}=file;files.push({...metadata,data});
    }
    tables.quizzes[index]={...quiz,originalSource:{...source,files}};
  }

  const preferences = {};
  for (const key of BACKUP_PREFERENCE_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      const safeValue = key === 'hamsa_saved_questions_v1' ? normaliseSavedQuizBookmarks(val) : val;
      if (safeValue !== null) preferences[key] = safeValue;
    }
  }

  const summary = {};
  for (const spec of BACKUP_TABLE_SPECS) {
    summary[spec.key] = tables[spec.key].length;
  }

  const backupData = {
    appName: 'Hamsa Vidya',
    formatVersion: 3,
    // Kept so that older builds reading `version` still recognise the file.
    version: 3,
    exportedAt: new Date().toISOString(),
    dexieVersion: db.verno ?? null,
    summary,
    tables,
    preferences
  };

  const stamp = UIUtils.toDateKey();
  UIUtils.downloadJson(backupData, `hamsa-vidya-backup-${stamp}.json`);

  return summary;
}

/**
 * Normalise a parsed backup file into { tables, preferences } regardless of
 * whether it is the v3 format or a legacy v1/v2 file with top-level arrays.
 */
function _normaliseBackupPayload(parsed) {
  const tables = {};

  if (parsed.tables && typeof parsed.tables === 'object') {
    for (const spec of BACKUP_TABLE_SPECS) {
      const val = parsed.tables[spec.key];
      tables[spec.key] = Array.isArray(val) ? val : [];
    }
  } else {
    // Legacy layout: quizzes / questions / attempts / notes at the top level.
    for (const spec of BACKUP_TABLE_SPECS) {
      const val = parsed[spec.key];
      tables[spec.key] = Array.isArray(val) ? val : [];
    }
  }

  // Legacy preference object used descriptive names rather than storage keys.
  const preferences = {};
  const rawPrefs = parsed.preferences || {};
  const legacyPrefMap = {
    themeMode: 'hamsa_theme_mode',
    themePalette: 'hamsa_theme_palette',
    fontSizeSetting: 'hamsa_font_size',
    fontFamily: 'hamsa_font_family',
    streakDays: 'hamsa_streak_days'
  };

  for (const [k, v] of Object.entries(rawPrefs)) {
    if (v === null || v === undefined) continue;
    const storageKey = BACKUP_PREFERENCE_KEYS.includes(k) ? k : legacyPrefMap[k];
    if (storageKey) {
      const safeValue = storageKey === 'hamsa_saved_questions_v1' ? normaliseSavedQuizBookmarks(typeof v === 'string' ? v : JSON.stringify(v)) : String(v);
      if (safeValue !== null) preferences[storageKey] = safeValue;
    }
  }

  return { tables, preferences };
}

/**
 * Validate a normalised payload before touching the database.
 * @returns {{ valid: string[], report: Object }} report per table
 */
function _validateBackupTables(tables) {
  const report = {};
  let totalValid = 0;

  for (const spec of BACKUP_TABLE_SPECS) {
    const rows = tables[spec.key] || [];
    const kept = [];
    let skipped = 0;

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { skipped++; continue; }

      const missing = spec.required.filter(f => row[f] === undefined || row[f] === null || row[f] === '');
      if (missing.length > 0) { skipped++; continue; }
      if (spec.key === 'pdfQuizzes') {
        try { validatePdfQuizRecord(row); } catch { skipped++; continue; }
        if (row.id !== undefined) {
          if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) < 1) { skipped++; continue; }
          row.id = Number(row.id);
        }
      }
      if (spec.key === 'pdfQuizAttempts' && (!Number.isSafeInteger(Number(row.quizId)) || Number(row.quizId) < 1 || !Array.isArray(row.answers) || !Number.isFinite(Date.parse(row.completedAt)))) { skipped++; continue; }
      if (spec.key === 'pdfQuizAttempts') {
        row.quizId = Number(row.quizId);
        if (row.id !== undefined) {
          if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) < 1) { skipped++; continue; }
          row.id = Number(row.id);
        }
      }
      if (spec.key === 'customDecks' && (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 || row.subject != null && typeof row.subject !== 'string')) { skipped++; continue; }
      if (spec.key === 'customCards' && (typeof row.front !== 'string' || !row.front.trim() || row.front.length > 12000 || typeof row.back !== 'string' || !row.back.trim() || row.back.length > 12000 || row.explanation != null && (typeof row.explanation !== 'string' || row.explanation.length > 20000) || !Number.isSafeInteger(Number(row.deckId)) || Number(row.deckId) < 1)) { skipped++; continue; }
      if (spec.key === 'cardReviews') {
        if (typeof row.cardKey !== 'string' || !/^(?:(?:q|custom):\d+|note(?:_|:)\d+:.+)$/.test(row.cardKey) || ['interval','repetitions','easeFactor'].some(key=>row[key]!=null && (!Number.isFinite(Number(row[key])) || Number(row[key])<0))) { skipped++; continue; }
        if (row.dueAt && !Number.isFinite(Date.parse(row.dueAt))) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate || '')) delete row.dueAt;
          else { skipped++; continue; }
        }
      }

      if (spec.key === 'customCards') {
        row.options = Array.isArray(row.options) ? row.options.filter(v => typeof v === 'string') : [];
        row.optionExplanations = Array.isArray(row.optionExplanations) ? row.optionExplanations.map(v => typeof v === 'string' ? v : '') : [];
        row.sourceReferences = (Array.isArray(row.sourceReferences) ? row.sourceReferences : []).filter(ref => ref && typeof ref === 'object').map(ref => ({fileName:typeof ref.fileName === 'string' ? ref.fileName : 'Source', page:Number.isSafeInteger(Number(ref.page)) && Number(ref.page)>0 ? Number(ref.page) : null}));
        for (const key of ['memoryCue','evidenceQuote','sourceTitle']) if (typeof row[key] !== 'string') row[key] = '';
      }

      // Repair representations that a newer schema requires but an older export
      // could not have written. Mutates in place — `row` is already a parsed
      // copy from the backup file, never live data.
      if (typeof spec.normalise === 'function') {
        try { spec.normalise(row); }
        catch (err) { console.warn(`Could not normalise a ${spec.key} row:`, err); }
      }

      kept.push(row);
    }

    tables[spec.key] = kept;
    report[spec.key] = { label: spec.label, imported: kept.length, skipped };
    if (!spec.isCache) totalValid += kept.length;
  }

  // A restored card must belong to a deck included in this backup.
  const deckIds=new Set((tables.customDecks||[]).map(row=>Number(row.id)));
  const cards=tables.customCards||[],validCards=cards.filter(row=>deckIds.has(Number(row.deckId)));
  const orphans=cards.length-validCards.length;
  tables.customCards=validCards;
  report.customCards.imported-=orphans;report.customCards.skipped+=orphans;totalValid-=orphans;
  const quizzes = new Map((tables.pdfQuizzes || []).map(row => [Number(row.id), row]));
  const attempts = tables.pdfQuizAttempts || [], validAttempts = [];
  for (const attempt of attempts) {
    const quiz = quizzes.get(Number(attempt.quizId));
    try {
      if (!quiz) throw new Error('Missing parent quiz.');
      validAttempts.push({...attempt, ...scorePdfQuizAttempt(quiz, attempt)});
    } catch { report.pdfQuizAttempts.imported--; report.pdfQuizAttempts.skipped++; totalValid--; }
  }
  tables.pdfQuizAttempts = validAttempts;
  return { report, totalValid };
}

/**
 * Restore every table from a snapshot produced by _readAllTables().
 * Used to undo a partially applied import.
 */
async function _restoreFromSnapshot(snapshot) {
  const failedTables = [];

  for (const spec of BACKUP_TABLE_SPECS) {
    const table = db[spec.key];
    if (!table) continue;
    try {
      await table.clear();
      const rows = snapshot[spec.key] || [];
      if (rows.length) await table.bulkPut(rows);
    } catch (err) {
      console.error(`Snapshot restore failed for ${spec.key}:`, err);
      failedTables.push(spec.label);
    }
  }

  return failedTables;
}

/**
 * JSON Data Import / Restore.
 *
 * @param {string} jsonString  raw backup file contents
 * @param {Object} [options]
 * @param {'REPLACE'|'MERGE'} [options.mode='REPLACE']
 *        REPLACE — wipe existing data and restore the backup exactly.
 *        MERGE   — keep existing data and append the backup, remapping
 *                  auto-increment ids so foreign keys stay consistent.
 * @returns {Promise<Object>} import report
 */
async function importDatabaseBackup(jsonString, options = {}) {
  const mode = options.mode === 'MERGE' ? 'MERGE' : 'REPLACE';

  // ---- 1. Parse -----------------------------------------------------------
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`This file is not valid JSON, so it cannot be a Hamsa Vidya backup. (${err.message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup file must contain a JSON object.');
  }

  // ---- 2. Normalise + validate before any destructive work ---------------
  const { tables, preferences } = _normaliseBackupPayload(parsed);
  const { report, totalValid } = _validateBackupTables(tables);
  let importedTotal=totalValid;
  const savedQuestionsCount = preferences.hamsa_saved_questions_v1 ? JSON.parse(preferences.hamsa_saved_questions_v1).length : 0;

  const hasAnyKnownTable = BACKUP_TABLE_SPECS.some(s => Array.isArray(tables[s.key]) && tables[s.key].length > 0);
  if (!hasAnyKnownTable && !savedQuestionsCount) {
    throw new Error('No recognisable Hamsa Vidya data found in this file. Expected notes, flashcard decks, answers, AI Teacher entries or archived backup data.');
  }
  if (totalValid === 0 && !savedQuestionsCount) {
    throw new Error('Every record in this backup failed validation, so nothing would be restored. Your existing data has been left untouched.');
  }

  // ---- 3. Snapshot current state so we can roll back ---------------------
  const snapshot = await _readAllTables();
  const prefSnapshot = {};
  for (const key of BACKUP_PREFERENCE_KEYS) prefSnapshot[key] = localStorage.getItem(key);

  // ---- 4. Apply inside a single transaction -----------------------------
  const tableHandles = BACKUP_TABLE_SPECS.map(s => db[s.key]).filter(Boolean);

  try {
    await db.transaction('rw', tableHandles, async () => {
      // oldId -> newId per table, for foreign key remapping in MERGE mode.
      const idMaps = {};

      if (mode === 'REPLACE') {
        for (const spec of BACKUP_TABLE_SPECS) {
          if (db[spec.key]) await db[spec.key].clear();
        }
      }

      for (const spec of BACKUP_TABLE_SPECS) {
        const table = db[spec.key];
        if (!table) continue;

        const rows = tables[spec.key] || [];
        if (rows.length === 0) { idMaps[spec.key] = new Map(); continue; }

        if (mode === 'REPLACE') {
          // Preserve original ids so existing foreign keys stay valid.
          await table.bulkPut(rows);
          idMaps[spec.key] = new Map(rows.map(r => [r.id, r.id]));
          continue;
        }

        // MERGE: append, remapping ids and parent references.
        const map = new Map();

        if (!spec.autoId) {
          // Natural primary key (exams) — upsert as-is.
          await table.bulkPut(rows);
          rows.forEach(r => map.set(r.id, r.id));
          idMaps[spec.key] = map;
          continue;
        }

        for (const row of rows) {
          const incoming = { ...row };
          const oldId = incoming.id;
          delete incoming.id;

          if (spec.parentRef) {
            const parentMap = idMaps[spec.parentRef.table];
            const oldParent = incoming[spec.parentRef.field];
            if (parentMap && parentMap.has(oldParent)) {
              incoming[spec.parentRef.field] = parentMap.get(oldParent);
            }
          }

          if (spec.key === 'questions' && incoming.sourceQuizId) incoming.sourceQuizId = idMaps.quizzes?.get(Number(incoming.sourceQuizId)) || incoming.quizId;
          if (spec.key === 'customDecks' && incoming.sourceQuizId && incoming.quizConversionKey) {
            const mappedQuiz = idMaps.pdfQuizzes?.get(Number(incoming.sourceQuizId));
            if (mappedQuiz) {
              incoming.sourceQuizId = mappedQuiz;
              if (Array.isArray(incoming.sourceQuestionIndices)) incoming.quizConversionKey = `quiz:${mappedQuiz}:${incoming.sourceQuizCreatedAt}:${incoming.sourceQuestionIndices.join(',')}`;
            } else { delete incoming.sourceQuizId; delete incoming.quizConversionKey; }
          }
          if (spec.key === 'attempts' && Array.isArray(incoming.questionsSnapshot)) incoming.questionsSnapshot = incoming.questionsSnapshot.map(question => ({ ...question, id: idMaps.questions?.get(Number(question?.id)) ?? null, quizId: incoming.quizId, sourceQuizId:idMaps.quizzes?.get(Number(question?.sourceQuizId)) || incoming.quizId }));
          if (spec.key === 'cardReviews') {
            const key=String(incoming.cardKey||''),match=key.match(/^(q:|custom:|note:|note_)(\d+)(.*)$/);
            const source=match&&(match[1]==='q:'?'questions':match[1]==='custom:'?'customCards':'notes');
            const mapped=match&&idMaps[source]?.get(Number(match[2]));
            if(!mapped){report[spec.key].skipped++;report[spec.key].imported--;if(!spec.isCache)importedTotal--;continue;}
            incoming.cardKey=`${match[1]}${mapped}${match[3]}`;
            const parent=await db[source].get(mapped);
            incoming.deckId=String(source==='notes'?mapped:source==='questions'?parent?.quizId:parent?.deckId);
            incoming.deckType=source==='notes'?'NOTE':source==='questions'?'QUIZ':'CUSTOM';
            delete incoming.undoSnapshot;delete incoming.operationToken;
          }
          if (spec.key === 'attempts') incoming.attemptToken = null;
          const newId = await table.add(incoming);
          if (oldId !== undefined) map.set(oldId, newId);
        }

        idMaps[spec.key] = map;
      }
    });
  } catch (err) {
    console.error('Import failed, rolling back to pre-import snapshot:', err);

    let failedTables = [];
    try {
      failedTables = await _restoreFromSnapshot(snapshot);
    } catch (restoreErr) {
      console.error('Rollback also failed:', restoreErr);
      throw new Error(`Import failed (${err.message}) AND automatic rollback failed (${restoreErr.message}). Please restore from your backup file manually.`);
    }

    if (failedTables.length > 0) {
      throw new Error(
        `Import failed (${err.message}). Most data was restored, but these tables could not be rolled back: ` +
        `${failedTables.join(', ')}. Re-import your most recent backup to be safe.`
      );
    }

    throw new Error(`Import failed and your previous data was restored. Reason: ${err.message}`);
  }

  // ---- 5. Preferences (non-fatal — data is already safely in) ------------
  let preferencesRestored = 0;
  try {
    if (mode === 'REPLACE' && !preferences.hamsa_saved_questions_v1) localStorage.removeItem('hamsa_saved_questions_v1');
    for (const [key, val] of Object.entries(preferences)) {
      let restoredValue = val;
      if (key === 'hamsa_saved_questions_v1' && mode === 'MERGE') {
        const current = JSON.parse(normaliseSavedQuizBookmarks(prefSnapshot[key]) || '[]');
        const merged = new Map(current.map(item => [item.key,item]));
        for (const item of JSON.parse(val)) if (!merged.has(item.key)) merged.set(item.key,item);
        restoredValue = JSON.stringify([...merged.values()]);
      }
      localStorage.setItem(key, restoredValue);
      preferencesRestored++;
    }
  } catch (err) {
    console.warn('Preferences could not be fully restored:', err);
    for (const [key, val] of Object.entries(prefSnapshot)) {
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    }
    preferencesRestored = 0;
  }

  // Re-read the profile into memory so the UI reflects the restored identity.
  if (preferences.hamsa_exam_profile && window.examProfileManager?.loadProfile) {
    try { window.examProfileManager.loadProfile(); } catch { /* non-fatal */ }
  }

  return {
    success: true,
    mode,
    formatVersion: parsed.formatVersion || parsed.version || 1,
    exportedAt: parsed.exportedAt || null,
    totalImported: importedTotal,
    preferencesRestored,
    savedQuestionsRestored:preferencesRestored ? savedQuestionsCount : 0,
    profileRestored: Boolean(preferences.hamsa_exam_profile),
    tables: report
  };
}

/**
 * Inspect a backup file without applying it, so the UI can show the user what
 * they are about to restore.
 */
async function inspectDatabaseBackup(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`This file is not valid JSON. (${err.message})`);
  }
  const { tables, preferences } = _normaliseBackupPayload(parsed);
  const { report, totalValid } = _validateBackupTables(tables);

  return {
    formatVersion: parsed.formatVersion || parsed.version || 1,
    exportedAt: parsed.exportedAt || null,
    totalRecords: totalValid,
    hasProfile: Boolean(preferences.hamsa_exam_profile),
    preferenceCount: Object.keys(preferences).length,
    savedQuestionsCount: preferences.hamsa_saved_questions_v1 ? JSON.parse(preferences.hamsa_saved_questions_v1).length : 0,
    tables: report
  };
}

/**
 * Study Notes Structured Entity & CRUD Operations (Digital Textbook Module)
 */

function migrateLegacyNote(note) {
  if (!note) return null;
  // If already structured with sections, return as is
  if (Array.isArray(note.sections) && note.sections.length > 0) {
    if (!note.annotations) note.annotations = { highlights: [], bookmarks: [], personalNotes: [] };
    if (!note.glossaryTerms) note.glossaryTerms = [];
    if (!note.metadata) {
      const words = (note.content || '').trim().split(/\s+/).length;
      note.metadata = {
        wordCount: words,
        charCount: (note.content || '').length,
        readingTimeMin: Math.max(1, Math.ceil(words / 200)),
        totalSections: note.sections.length,
        lastReadAt: note.lastReadAt || note.updatedAt || note.createdAt
      };
    }
    return note;
  }

  // Migrate flat legacy note into single comprehensive section
  const words = (note.content || '').trim().split(/\s+/).length;
  const migrated = {
    ...note,
    isFavorite: note.isFavorite ?? false,
    description: note.description || 'Study note ingested into digital textbook.',
    sourceFiles: note.sourceFiles || [{ name: 'Direct Ingestion', type: 'TEXT', size: (note.content || '').length }],
    originalSource: note.originalSource || {
      text: note.content || '',
      files: note.sourceFiles || [],
      importedAt: note.createdAt || new Date().toISOString()
    },
    sections: [
      {
        id: 'sec-1',
        heading: note.title || 'Core Concepts & Study Guide',
        subheading: note.subject || 'General Study',
        content: note.content || '',
        keyPoints: [],
        definitions: [],
        importantFacts: [],
        formulas: [],
        examples: [],
        tables: []
      }
    ],
    glossaryTerms: note.glossaryTerms || [],
    annotations: note.annotations || { highlights: [], bookmarks: [], personalNotes: [] },
    metadata: {
      wordCount: words,
      charCount: (note.content || '').length,
      readingTimeMin: Math.max(1, Math.ceil(words / 200)),
      totalSections: 1,
      lastReadAt: note.lastReadAt || note.updatedAt || note.createdAt
    }
  };
  return migrated;
}

async function saveNewNote(noteData) {
  const contentText = noteData.content || (noteData.sections ? noteData.sections.map(s => `${s.heading}\n${s.content}`).join('\n\n') : '');
  const words = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const sectionsList = Array.isArray(noteData.sections) && noteData.sections.length > 0
    ? noteData.sections
    : [{
        id: 'sec-1',
        heading: noteData.title || 'Main Chapter',
        subheading: noteData.subject || 'General Study',
        content: contentText,
        keyPoints: noteData.keyPoints || [],
        definitions: noteData.definitions || [],
        importantFacts: noteData.importantFacts || [],
        formulas: noteData.formulas || [],
        examples: noteData.examples || [],
        tables: []
      }];

  const entity = {
    title: noteData.title || 'Untitled Digital Textbook Note',
    subject: noteData.subject || 'General Study',
    description: noteData.description || `${sectionsList.length} sections • ${words} words study material`,
    sourceFiles: noteData.sourceFiles || [{ name: 'Document Import', type: 'TEXT', size: contentText.length }],
    originalSource: noteData.originalSource || {
      text: contentText,
      files: noteData.sourceFiles || [],
      importedAt: new Date().toISOString()
    },
    isFavorite: noteData.isFavorite ?? false,
    // The extraction scope the student typed when creating the note, e.g.
    // "only the maths questions". Empty string for a full note.
    //
    // This entity is a fixed allow-list — a field absent from it is silently
    // dropped no matter what the caller passes. It is persisted because a
    // scoped note deliberately omits most of its source, and a reader that does
    // not say so is misleading: the next time this note is opened it would look
    // like a complete set of notes with material inexplicably missing.
    focusInstruction: typeof noteData.focusInstruction === 'string'
      ? noteData.focusInstruction.trim()
      : '',
    sections: sectionsList,
    glossaryTerms: Array.isArray(noteData.glossaryTerms) ? noteData.glossaryTerms : [],
    summary: noteData.summary || null,
    settings: noteData.settings || { language: 'AUTO', level: 'AUTO', exam: '' },
    coverage: noteData.coverage || null,
    chatHistory: Array.isArray(noteData.chatHistory) ? noteData.chatHistory : [],
    editHistory: Array.isArray(noteData.editHistory) ? noteData.editHistory : [],
    recallAnswers: noteData.recallAnswers || {},
    readingPosition: noteData.readingPosition || null,
    annotations: noteData.annotations || { highlights: [], bookmarks: [], personalNotes: [] },
    content: contentText,
    metadata: {
      ...(noteData.metadata || {}),
      wordCount: words,
      charCount: contentText.length,
      readingTimeMin: Math.max(1, Math.ceil(words / 200)),
      totalSections: sectionsList.length,
      lastReadAt: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return await db.notes.add(window.FlashcardTools?FlashcardTools.prepareNote(entity):entity);
}

async function getAllNotes() {
  const rawNotes = await db.notes.toArray();
  // Sort reverse by updatedAt or createdAt
  rawNotes.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  return rawNotes.map(n => migrateLegacyNote(n));
}

async function getNoteById(id) {
  const note = await db.notes.get(Number(id));
  if (!note) return null;
  const migrated = migrateLegacyNote(note);
  const prepared = window.FlashcardTools ? FlashcardTools.prepareNote(migrated) : migrated;
  const lastReadAt = new Date().toISOString();
  // Failed read-metadata writes must not make already saved notes unreadable.
  try {
    await db.notes.update(Number(id), { lastReadAt, ...(prepared.flashcardIds ? {flashcardIds:prepared.flashcardIds} : {}) });
    return {...prepared, lastReadAt};
  } catch (error) {
    console.warn('Study note read metadata could not be saved:', error);
    return migrated; // Keep only durable metadata; never report a failed write as saved.
  }
}

async function updateNote(id, data) {
  const current = await db.notes.get(Number(id));
  if (!current) throw new Error('This study note no longer exists. Your changes could not be saved.');

  const contentText = data.content || (data.sections ? data.sections.map(s => `${s.heading}\n${s.content}`).join('\n\n') : current.content || '');
  const words = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const totalSecs = Array.isArray(data.sections) ? data.sections.length : (current.sections ? current.sections.length : 1);

  const updatedMetadata = {
    ...(current.metadata || {}),
    ...(data.metadata || {}),
    wordCount: words,
    charCount: contentText.length,
    readingTimeMin: Math.max(1, Math.ceil(words / 200)),
    totalSections: totalSecs,
    lastReadAt: new Date().toISOString()
  };

  await db.notes.update(Number(id), {
    ...data,
    ...(window.FlashcardTools ? { flashcardIds: FlashcardTools.prepareNote({ ...current, ...data }, current).flashcardIds } : {}),
    content: contentText,
    originalSource: data.originalSource || current.originalSource || null,
    metadata: updatedMetadata,
    updatedAt: new Date().toISOString()
  });
  return await getNoteById(id);
}

async function deleteNote(id) {
  return db.transaction('rw',db.notes,db.cardReviews,async()=>{
    await db.cardReviews.filter(r=>typeof r.cardKey==='string'&&(r.cardKey.startsWith(`note_${Number(id)}:`)||r.cardKey.startsWith(`note:${Number(id)}:`))).delete();
    await db.notes.delete(Number(id));
  });
}

async function duplicateNote(id) {
  const original = await getNoteById(id);
  if (!original) throw new Error('Note not found');

  const copyData = {
    ...original,
    title: `Copy of ${original.title}`,
    isFavorite: false,
    originalSource: original.originalSource ? { ...original.originalSource } : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastReadAt: new Date().toISOString()
  };
  delete copyData.id;
  return await db.notes.add(copyData);
}

async function toggleFavoriteNote(id) {
  const note = await db.notes.get(Number(id));
  if (!note) return false;
  const newVal = !note.isFavorite;
  await db.notes.update(Number(id), { isFavorite: newVal, updatedAt: new Date().toISOString() });
  return newVal;
}

async function renameNote(id, newTitle) {
  if (!newTitle || !newTitle.trim()) return;
  await db.notes.update(Number(id), { title: newTitle.trim(), updatedAt: new Date().toISOString() });
}

async function autoSaveNoteContent(id, partialData) {
  return await db.notes.update(Number(id), {
    ...partialData,
    updatedAt: new Date().toISOString()
  });
}

async function updateNoteAnnotations(id, annotations) {
  return await db.notes.update(Number(id), {
    annotations,
    updatedAt: new Date().toISOString()
  });
}

async function updateNoteMastery(id, masteredSections) {
  return await db.notes.update(Number(id), {
    masteredSections,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Danger Zone: Clear all database records.
 *
 * Previously this only cleared 4 of the 12 tables, so "Reset Everything" left
 * flashcard decks, SRS progress, answer writing history and the AI Teacher
 * library behind. It now clears every table.
 *
 * @param {Object} [options]
 * @param {boolean} [options.includePreferences=false] also reset theme/profile
 * @returns {Promise<Object>} counts removed per table
 */
async function clearDatabase(options = {}) {
  const removed = {};

  for (const spec of BACKUP_TABLE_SPECS) {
    if (spec.legacy) continue;
    const table = db[spec.key];
    if (!table) continue;
    try {
      removed[spec.key] = await table.count();
      await table.clear();
    } catch (err) {
      console.error(`Failed clearing ${spec.key}:`, err);
      removed[spec.key] = 0;
    }
  }

  // Bookmarks belong to quiz data even when display preferences are retained.
  try { localStorage.removeItem('hamsa_saved_questions_v1'); } catch { /* database removal still succeeds */ }

  if (options.includePreferences) {
    for (const key of BACKUP_PREFERENCE_KEYS) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }

  return removed;
}

/**
 * =========================================================================
 * GLOBAL SEARCH ENGINE (Cross-Module Unified Content Indexer)
 * Searches saved Study Notes.
 * =========================================================================
 */
async function searchGlobalContent(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { notes: [], totalCount: 0 };
  }

  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return { notes: [], totalCount: 0 };
  }

  try {
    const allNotes = await getAllNotes();
    const matchedNotes = [];
    for (const note of allNotes) {
      const titleMatch = note.title && note.title.toLowerCase().includes(query);
      const subjectMatch = note.subject && note.subject.toLowerCase().includes(query);
      const descMatch = note.description && note.description.toLowerCase().includes(query);

      let contentSnippet = '';
      let sectionMatch = false;

      if (Array.isArray(note.sections)) {
        for (const sec of note.sections) {
          const headingMatch = sec.heading && sec.heading.toLowerCase().includes(query);
          const bodyMatch = sec.content && sec.content.toLowerCase().includes(query);

          if (headingMatch || bodyMatch) {
            sectionMatch = true;
            if (sec.content) {
              const idx = sec.content.toLowerCase().indexOf(query);
              if (idx !== -1) {
                const start = Math.max(0, idx - 45);
                const end = Math.min(sec.content.length, idx + query.length + 55);
                contentSnippet = (start > 0 ? '...' : '') + sec.content.substring(start, end).trim() + (end < sec.content.length ? '...' : '');
              }
            }
            if (!contentSnippet && sec.heading) {
              contentSnippet = `Section: ${sec.heading}`;
            }
            break;
          }
        }
      }

      if (titleMatch || subjectMatch || descMatch || sectionMatch) {
        matchedNotes.push({
          id: note.id,
          title: note.title,
          subject: note.subject || 'General Study',
          description: note.description || '',
          snippet: contentSnippet || note.description || 'Study note content match',
          wordCount: note.metadata?.wordCount || 0,
          updatedAt: note.updatedAt || note.createdAt,
          matchField: titleMatch ? 'Title' : (sectionMatch ? 'Content' : (subjectMatch ? 'Subject' : 'Description'))
        });
        if (matchedNotes.length >= 25) break;
      }
    }

    return {
      notes: matchedNotes,
      totalCount: matchedNotes.length
    };
  } catch (err) {
    console.error('Error during searchGlobalContent:', err);
    return { notes: [], totalCount: 0 };
  }
}

// Flashcard persistence is implemented in flashcard-store.js.

// =========================================================================
// ANSWER WRITING & DESCRIPTIVE EVALUATION STORE
// =========================================================================

/**
 * Save an evaluated or submitted answer attempt
 */
async function saveAnswerAttempt(data) {
  const record = {
    question: data.question || 'Untitled Question',
    directive: data.directive || '',
    exam: data.exam || 'UPSC',
    subject: data.subject || 'General Studies',
    difficulty: data.difficulty || 'MODERATE',
    wordLimit: Number(data.wordLimit) || 150,
    marks: Number(data.marks) || 10,
    answerType: data.answerType || 'Paragraph Answer',
    studentAnswer: data.studentAnswer || '',
    inputSource: data.inputSource || 'TYPED', // 'TYPED', 'IMAGE', 'PDF'
    actualWordCount: Number(data.actualWordCount) || (data.studentAnswer ? data.studentAnswer.trim().split(/\s+/).filter(Boolean).length : 0),
    actualCharCount: Number(data.actualCharCount) || (data.studentAnswer ? data.studentAnswer.length : 0),
    evaluation: data.evaluation || null,
    score: data.evaluation?.scores?.overall != null ? Number(data.evaluation.scores.overall) : (data.score != null ? Number(data.score) : null),
    status: data.status || 'EVALUATED', // 'EVALUATED', 'SUBMITTED', 'PENDING'
    mainStrength: data.evaluation?.strengths?.[0] || 'Content Relevance',
    mainWeakness: data.evaluation?.weaknesses?.[0] || 'Analytical Depth',
    tutorChatHistory: data.tutorChatHistory || [],
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (data.id) {
    await db.answers.update(Number(data.id), record);
    return Number(data.id);
  } else {
    const id = await db.answers.add(record);
    return id;
  }
}

/**
 * Retrieve all answer attempts ordered by id descending
 */
async function getAllAnswerAttempts() {
  return await db.answers.orderBy('id').reverse().toArray();
}

/**
 * Retrieve a specific answer attempt by ID
 */
async function getAnswerAttemptById(id) {
  return await db.answers.get(Number(id));
}

/**
 * Delete an answer attempt
 */
async function deleteAnswerAttempt(id) {
  return await db.answers.delete(Number(id));
}

/**
 * Save an in-progress answer draft
 */
async function saveAnswerDraft(data) {
  const existing = await db.answerDrafts.toArray();
  const draft = {
    question: data.question || '',
    directive: data.directive || '',
    exam: data.exam || 'UPSC',
    subject: data.subject || 'General Studies',
    difficulty: data.difficulty || 'MODERATE',
    wordLimit: Number(data.wordLimit) || 150,
    marks: Number(data.marks) || 10,
    answerType: data.answerType || 'Paragraph Answer',
    studentAnswer: data.studentAnswer || '',
    inputSource: data.inputSource || 'TYPED',
    updatedAt: new Date().toISOString()
  };

  if (existing.length > 0) {
    const draftId = existing[0].id;
    await db.answerDrafts.update(draftId, draft);
    return draftId;
  } else {
    return await db.answerDrafts.add(draft);
  }
}

/**
 * Get the latest in-progress answer draft
 */
async function getLatestAnswerDraft() {
  const drafts = await db.answerDrafts.toArray();
  return drafts.length > 0 ? drafts[0] : null;
}

/**
 * Clear/delete answer drafts
 */
async function clearAnswerDrafts() {
  return await db.answerDrafts.clear();
}

/**
 * Delete a specific answer draft
 */
async function deleteAnswerDraft(id) {
  return await db.answerDrafts.delete(Number(id));
}

/**
 * Compute aggregate statistics for the Answer Writing module
 */
async function getAnswerWritingStats() {
  const allAttempts = await db.answers.toArray();
  const evaluatedAttempts = allAttempts.filter(a => a.score != null);

  const totalAttempted = allAttempts.length;
  const totalEvaluated = evaluatedAttempts.length;

  let averageScore = 0;
  let wordLimitCompliantCount = 0;

  const skillSums = {
    content: 0,
    structure: 0,
    relevance: 0,
    analysis: 0,
    language: 0,
    presentation: 0
  };
  let skillCount = 0;

  const subjectMap = {};

  evaluatedAttempts.forEach(item => {
    averageScore += (Number(item.score) || 0);

    // Check word limit compliance (+-15% tolerance)
    const limit = item.wordLimit || 150;
    const actual = item.actualWordCount || 0;
    if (actual >= Math.round(limit * 0.75) && actual <= Math.round(limit * 1.15)) {
      wordLimitCompliantCount++;
    }

    // Accumulate skill dimension scores
    if (item.evaluation && item.evaluation.scores) {
      skillSums.content += Number(item.evaluation.scores.content) || 0;
      skillSums.structure += Number(item.evaluation.scores.structure) || 0;
      skillSums.relevance += Number(item.evaluation.scores.relevance) || 0;
      skillSums.analysis += Number(item.evaluation.scores.analysis) || 0;
      skillSums.language += Number(item.evaluation.scores.language) || 0;
      skillSums.presentation += Number(item.evaluation.scores.presentation) || 0;
      skillCount++;
    }

    // Subject breakdown
    const subj = item.subject || 'General Studies';
    if (!subjectMap[subj]) {
      subjectMap[subj] = { count: 0, totalScore: 0 };
    }
    subjectMap[subj].count++;
    subjectMap[subj].totalScore += (Number(item.score) || 0);
  });

  if (totalEvaluated > 0) {
    averageScore = Number((averageScore / totalEvaluated).toFixed(1));
  }

  const complianceRate = totalAttempted > 0 ? Math.round((wordLimitCompliantCount / totalAttempted) * 100) : 100;

  const skillAverages = {
    content: skillCount > 0 ? Number((skillSums.content / skillCount).toFixed(1)) : 7.0,
    structure: skillCount > 0 ? Number((skillSums.structure / skillCount).toFixed(1)) : 7.0,
    relevance: skillCount > 0 ? Number((skillSums.relevance / skillCount).toFixed(1)) : 7.5,
    analysis: skillCount > 0 ? Number((skillSums.analysis / skillCount).toFixed(1)) : 6.5,
    language: skillCount > 0 ? Number((skillSums.language / skillCount).toFixed(1)) : 7.5,
    presentation: skillCount > 0 ? Number((skillSums.presentation / skillCount).toFixed(1)) : 7.0
  };

  // Find strongest and weakest skills
  const skillEntries = Object.entries(skillAverages);
  skillEntries.sort((a, b) => b[1] - a[1]);
  const strongestSkill = skillEntries[0] ? { name: capitalizeSkillName(skillEntries[0][0]), score: skillEntries[0][1] } : { name: 'Relevance', score: 7.5 };
  const weakestSkill = skillEntries[skillEntries.length - 1] ? { name: capitalizeSkillName(skillEntries[skillEntries.length - 1][0]), score: skillEntries[skillEntries.length - 1][1] } : { name: 'Analysis', score: 6.5 };

  const subjectStats = Object.keys(subjectMap).map(s => ({
    subject: s,
    attempts: subjectMap[s].count,
    avgScore: Number((subjectMap[s].totalScore / subjectMap[s].count).toFixed(1))
  }));

  return {
    totalAttempted,
    totalEvaluated,
    averageScore,
    complianceRate,
    skillAverages,
    strongestSkill,
    weakestSkill,
    subjectStats,
    recentAttempts: allAttempts.slice(0, 10)
  };
}

function capitalizeSkillName(k) {
  const map = {
    content: 'Content Depth',
    structure: 'Answer Structure',
    relevance: 'Context Relevance',
    analysis: 'Analytical Depth',
    language: 'Expression & Language',
    presentation: 'Presentation & Formatting'
  };
  return map[k] || k.charAt(0).toUpperCase() + k.slice(1);
}

// =========================================================================
// AI TEACHER EXPLANATIONS PERSISTENCE & HISTORY
// =========================================================================

/**
 * Save an AI Teacher explanation record
 */
async function saveAiTeacherExplanation(data) {
  const record = {
    question: data.question || '',
    topic: data.topic || 'General Concept',
    subject: data.subject || 'General Studies',
    language: data.language || 'BILINGUAL',
    depth: data.depth || 'DETAILED',
    mode: data.mode || 'STUDENT',
    educationLevel: data.educationLevel || 'AUTO',
    structuredData: data.structuredData || {},
    followUpHistory: Array.isArray(data.followUpHistory) ? data.followUpHistory : [],
    // 1/0, not a boolean: `isBookmarked` is indexed on this table too (see the
    // version(7) declaration), and IndexedDB omits boolean-valued records from
    // an index. The AI Teacher library happens to read with an in-memory
    // filter, so it works either way — but storing an un-indexable value leaves
    // inconsistent bookmark indexing in older records.
    isBookmarked: toBookmarkFlag(data.isBookmarked),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (data.id) {
    const existing = await db.aiTeacherExplanations.get(Number(data.id));
    if (!existing) throw new Error('This saved lesson no longer exists.');
    record.createdAt = existing.createdAt || record.createdAt;
    const updated = await db.aiTeacherExplanations.update(Number(data.id), record);
    if (!updated) throw new Error('The lesson could not be updated.');
    return Number(data.id);
  }
  return await db.aiTeacherExplanations.add(record);
}

/**
 * Retrieve a specific AI Teacher explanation by ID
 */
async function getAiTeacherExplanationById(id) {
  return await db.aiTeacherExplanations.get(Number(id));
}

/**
 * Retrieve all AI Teacher explanations with optional filtering and search
 */
/**
 * Headline counters for the AI Teacher hero.
 * Real numbers rather than decorative filler, so the panel reflects the
 * student's own history and grows as they use the feature.
 */
async function getAiTeacherStats() {
  try {
    const all = await db.aiTeacherExplanations.toArray();

    const subjects = new Set(
      all.map(e => (e.subject || '').trim()).filter(Boolean)
    );

    // Lessons opened today, so returning users see their own momentum.
    const todayKey = new Date().toDateString();
    const today = all.filter(e => e.createdAt && new Date(e.createdAt).toDateString() === todayKey).length;

    return {
      totalLessons: all.length,
      savedLessons: all.filter(e => e.isBookmarked).length,
      subjectsCovered: subjects.size,
      lessonsToday: today,
      lastTopic: all.length ? (all[all.length - 1].topic || all[all.length - 1].question || '') : ''
    };
  } catch (err) {
    console.warn('Could not load AI Teacher stats:', err);
    return { totalLessons: 0, savedLessons: 0, subjectsCovered: 0, lessonsToday: 0, lastTopic: '' };
  }
}

async function getAllAiTeacherExplanations(options = {}) {
  let collection = db.aiTeacherExplanations.toCollection();
  let items = await collection.reverse().sortBy('createdAt');

  if (options.onlyBookmarked) {
    items = items.filter(item => item.isBookmarked);
  }

  if (options.subject && options.subject !== 'ALL') {
    const sLower = options.subject.toLowerCase();
    const aliases = {
      mathematics: /\b(math(?:ematics)?|algebra|arithmetic|geometry|calculus|statistics)\b/i,
      science: /\b(science|biology|physics|chemistry|botany|zoology)\b/i,
      polity: /\b(polity|constitution|political science)\b/i,
      economy: /\b(economy|economics|economic)\b/i,
      'computer science': /\b(computer|computing|programming|information technology)\b/i
    };
    items = items.filter(item => {
      const subject = item.subject || '';
      if (sLower === 'science' && aliases['computer science'].test(subject)) return false;
      return aliases[sLower] ? aliases[sLower].test(subject) : subject.toLowerCase().includes(sLower);
    });
  }

  if (options.searchQuery && options.searchQuery.trim()) {
    const q = options.searchQuery.trim().toLowerCase();
    items = items.filter(item => 
      (item.question && item.question.toLowerCase().includes(q)) ||
      (item.topic && item.topic.toLowerCase().includes(q)) ||
      (item.subject && item.subject.toLowerCase().includes(q))
    );
  }

  if (options.limit && options.limit > 0) {
    items = items.slice(0, options.limit);
  }

  return items;
}

/**
 * Toggle bookmark state for an explanation
 */
async function toggleBookmarkAiTeacherExplanation(id) {
  const item = await db.aiTeacherExplanations.get(Number(id));
  if (!item) return false;
  const newState = toBookmarkFlag(!item.isBookmarked);
  await db.aiTeacherExplanations.update(Number(id), {
    isBookmarked: newState,
    updatedAt: new Date().toISOString()
  });
  // Callers use this to paint the icon, so a truthy/falsy number is fine —
  // `!!newState` is not needed and would hide the stored representation.
  return newState;
}

/**
 * Delete an AI Teacher explanation record
 */
async function deleteAiTeacherExplanation(id) {
  return await db.aiTeacherExplanations.delete(Number(id));
}
