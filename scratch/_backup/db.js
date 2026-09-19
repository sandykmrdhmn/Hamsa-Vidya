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



// =========================================================================
// EXAM SCORING PATTERNS
//
// Real competitive exams deduct marks for wrong answers, which changes strategy
// completely: a blind guess has negative expected value, so "skip" and "wrong"
// must not score the same. Scoring these quizzes without negative marking
// trained the opposite instinct.
// =========================================================================
const EXAM_SCORING_PRESETS = {
  NONE: {
    id: 'NONE',
    label: 'Practice (no negative marking)',
    marksPerCorrect: 1,
    negativeMarkPerWrong: 0,
    note: 'Every correct answer scores 1. Wrong answers cost nothing.'
  },
  UPSC_PRELIMS: {
    id: 'UPSC_PRELIMS',
    label: 'UPSC Prelims GS (+2 / −1/3)',
    marksPerCorrect: 2,
    negativeMarkPerWrong: 2 / 3,
    note: 'One-third of the allotted marks is deducted for each wrong answer.'
  },
  SSC: {
    id: 'SSC',
    label: 'SSC CGL / CHSL Tier-I (+2 / −0.5)',
    marksPerCorrect: 2,
    negativeMarkPerWrong: 0.5,
    note: '0.50 marks deducted per wrong answer.'
  },
  BANKING: {
    id: 'BANKING',
    label: 'IBPS / SBI Banking (+1 / −0.25)',
    marksPerCorrect: 1,
    negativeMarkPerWrong: 0.25,
    note: 'One-fourth mark deducted per wrong answer.'
  },
  NEET: {
    id: 'NEET',
    label: 'NEET (+4 / −1)',
    marksPerCorrect: 4,
    negativeMarkPerWrong: 1,
    note: 'Four marks per correct answer, one mark deducted per wrong answer.'
  }
};

/** Resolve a preset id (or explicit overrides) into a scoring config. */
function resolveScoringConfig(meta = {}) {
  const preset = EXAM_SCORING_PRESETS[meta.scoringPreset] || EXAM_SCORING_PRESETS.NONE;
  const marksPerCorrect = Number(
    meta.marksPerCorrect ?? preset.marksPerCorrect
  ) || 1;
  const negativeMarkPerWrong = Math.max(0, Number(
    meta.negativeMarkPerWrong ?? preset.negativeMarkPerWrong
  ) || 0);

  return {
    scoringPreset: preset.id,
    marksPerCorrect,
    negativeMarkPerWrong
  };
}

/**
 * Score an attempt under the quiz's marking scheme.
 *
 * @param {Array}  questions    question records with correctAnswerIndex
 * @param {Object} userAnswers  { questionId: selectedOptionIndex }
 * @param {Object} scoring      { marksPerCorrect, negativeMarkPerWrong }
 */
function computeQuizScore(questions, userAnswers, scoring) {
  const { marksPerCorrect, negativeMarkPerWrong } = resolveScoringConfig(scoring);

  let correct = 0;
  let incorrect = 0;
  let skipped = 0;

  for (const q of questions) {
    const chosen = userAnswers ? userAnswers[q.id] : undefined;
    if (chosen === undefined || chosen === null || chosen === -1) skipped++;
    else if (chosen === q.correctAnswerIndex) correct++;
    else incorrect++;
  }

  const total = questions.length;
  const maxMarks = round2(total * marksPerCorrect);
  const positiveMarks = round2(correct * marksPerCorrect);
  const marksLostToNegative = round2(incorrect * negativeMarkPerWrong);
  const marksObtained = round2(positiveMarks - marksLostToNegative);

  // Accuracy over attempted questions — unaffected by the marking scheme.
  const attempted = correct + incorrect;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  // Percentage of the paper. Can legitimately be negative under heavy penalties;
  // display layers clamp it rather than hiding the real number here.
  const percentage = maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0;

  return {
    correct,
    incorrect,
    skipped,
    total,
    attempted,
    accuracy,
    marksPerCorrect,
    negativeMarkPerWrong,
    positiveMarks,
    marksLostToNegative,
    marksObtained,
    maxMarks,
    percentage,
    // `score` historically held the raw correct count; it now holds real marks,
    // which is what the result screen and analytics should reason about.
    score: marksObtained
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// Exposed explicitly so views don't depend on cross-script lexical scoping.
if (typeof window !== 'undefined') {
  window.EXAM_SCORING_PRESETS = EXAM_SCORING_PRESETS;
  window.resolveScoringConfig = resolveScoringConfig;
  window.computeQuizScore = computeQuizScore;
}

/**
 * Save a newly created quiz and its questions into IndexedDB
 */
async function saveNewQuiz(quizMeta, questionsList) {
  return await db.transaction('rw', db.quizzes, db.questions, async () => {
    const quizId = await db.quizzes.add({
      title: quizMeta.title || 'Untitled Quiz',
      subject: quizMeta.subject || 'General Knowledge',
      difficulty: quizMeta.difficulty || 'MEDIUM',
      quizMode: quizMeta.quizMode || 'PRACTICE',
      language: quizMeta.language || 'ENGLISH',
      sourceType: quizMeta.sourceType || 'TEXT_NOTES',
      sourceTitle: quizMeta.sourceTitle || 'Direct Ingestion',
      pageRangeText: quizMeta.pageRangeText || null,
      totalQuestions: questionsList.length,
      durationSeconds: 0,
      // Marking scheme chosen at creation time, so re-attempts score identically.
      ...resolveScoringConfig(quizMeta),
      score: 0,
      correct: 0,
      incorrect: 0,
      skipped: 0,
      percentage: 0,
      marksObtained: 0,
      maxMarks: round2(questionsList.length * resolveScoringConfig(quizMeta).marksPerCorrect),
      marksLostToNegative: 0,
      accuracy: 0,
      createdAt: new Date().toISOString(),
      completedAt: null
    });

    const formattedQuestions = questionsList.map((q, idx) => ({
      quizId: quizId,
      questionText: q.questionText,
      options: q.options || [],
      correctAnswerIndex: Number(q.correctAnswerIndex ?? 0),
      explanation: q.explanation || 'No explanation provided.',
      sourcePage: q.sourcePage ?? null,
      isBookmarked: false,
      userSelectedOptionIndex: null
    }));

    await db.questions.bulkAdd(formattedQuestions);
    return quizId;
  });
}

/**
 * Fetch a Quiz along with all its Questions
 */
async function getQuizWithQuestions(quizId) {
  const quiz = await db.quizzes.get(Number(quizId));
  if (!quiz) return null;
  const questions = await db.questions.where('quizId').equals(Number(quizId)).toArray();
  return { ...quiz, questions };
}

/**
 * Alias for getQuizWithQuestions - provides fail-safe compatibility across modules
 */
async function getQuizById(quizId) {
  return await getQuizWithQuestions(quizId);
}

/**
 * Fetch all quizzes ordered by creation date descending
 */
async function getAllQuizzes() {
  return await db.quizzes.orderBy('id').reverse().toArray();
}

/**
 * Fetch all completed quizzes for Quiz History view, sorted by completedAt descending
 */
async function getCompletedQuizHistory() {
  const allQuizzes = await db.quizzes.toArray();
  const completed = allQuizzes.filter(q => q.completedAt !== null && q.completedAt !== undefined);
  return completed.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

/**
 * Delete a quiz and its questions
 */
async function deleteQuiz(quizId) {
  return await db.transaction('rw', db.quizzes, db.questions, db.attempts, async () => {
    await db.questions.where('quizId').equals(Number(quizId)).delete();
    await db.attempts.where('quizId').equals(Number(quizId)).delete();
    await db.quizzes.delete(Number(quizId));
  });
}

/**
 * Toggle or update question bookmark state
 */
async function updateQuestionBookmark(questionId, isBookmarked) {
  return await db.questions.update(Number(questionId), { isBookmarked: Boolean(isBookmarked) });
}

/**
 * Fetch all bookmarked questions across all quizzes
 */
async function getBookmarkedQuestions() {
  const bookmarks = await db.questions.where('isBookmarked').equals(1).or('isBookmarked').equals(true).toArray();
  
  // Enrich with quiz title and subject
  const enriched = await Promise.all(bookmarks.map(async (q) => {
    const parentQuiz = await db.quizzes.get(q.quizId);
    return {
      ...q,
      quizTitle: parentQuiz ? parentQuiz.title : 'Study Quiz',
      subject: parentQuiz ? parentQuiz.subject : 'General'
    };
  }));

  return enriched;
}

/**
 * Update quiz completion record and save attempt history
 */
async function updateQuizCompletion(quizId, resultData, questionsState) {
  return await db.transaction('rw', db.quizzes, db.questions, db.attempts, async () => {
    const numId = Number(quizId);
    
    // 1. Update questions state (user selections)
    for (const q of questionsState) {
      if (q.id) {
        await db.questions.update(q.id, {
          userSelectedOptionIndex: q.userSelectedOptionIndex ?? null,
          isBookmarked: Boolean(q.isBookmarked)
        });
      }
    }

    // 2. Update Quiz record (reflects the most recent attempt)
    await db.quizzes.update(numId, {
      completedAt: new Date().toISOString(),
      score: resultData.score,
      correct: resultData.correct,
      incorrect: resultData.incorrect,
      skipped: resultData.skipped,
      percentage: resultData.percentage,
      durationSeconds: resultData.durationSeconds,
      marksObtained: resultData.marksObtained ?? resultData.score,
      maxMarks: resultData.maxMarks ?? null,
      marksLostToNegative: resultData.marksLostToNegative ?? 0,
      accuracy: resultData.accuracy ?? null
    });

    // 3. Log attempt — the full, immutable history lives here, so retakes never
    //    erase an earlier score even though the quiz row is overwritten.
    await db.attempts.add({
      quizId: numId,
      attemptedAt: new Date().toISOString(),
      score: resultData.score,
      correct: resultData.correct,
      incorrect: resultData.incorrect,
      skipped: resultData.skipped,
      percentage: resultData.percentage,
      durationSeconds: resultData.durationSeconds,
      marksObtained: resultData.marksObtained ?? resultData.score,
      maxMarks: resultData.maxMarks ?? null,
      marksLostToNegative: resultData.marksLostToNegative ?? 0,
      accuracy: resultData.accuracy ?? null
    });
  });
}

/**
 * Calculate the 8 learning metric statistics for Dashboard
 */
async function getDashboardStats() {
  const allQuizzes = await db.quizzes.toArray();
  const allQuestions = await db.questions.toArray();
  const bookmarkedQuestions = allQuestions.filter(q => q.isBookmarked);

  // Statistics come from the attempts log, not the quizzes table. The quiz row
  // only holds the latest attempt, so a retake used to overwrite the earlier
  // score and every metric silently under-counted the work actually done.
  const allAttempts = await db.attempts.toArray();

  // Older records predate the attempts log; fall back to the quiz row for those
  // so historical stats don't vanish.
  const quizzesWithoutAttempts = allQuizzes.filter(
    q => q.completedAt && !allAttempts.some(a => a.quizId === q.id)
  );
  const attempts = [
    ...allAttempts,
    ...quizzesWithoutAttempts.map(q => ({
      quizId: q.id,
      attemptedAt: q.completedAt,
      correct: q.correct || 0,
      incorrect: q.incorrect || 0,
      skipped: q.skipped || 0,
      percentage: q.percentage || 0,
      durationSeconds: q.durationSeconds || 0
    }))
  ];

  const totalQuizzesTaken = attempts.length;
  const questionsCompleted = attempts.reduce((acc, a) => acc + ((a.correct || 0) + (a.incorrect || 0)), 0);
  const correctAnswers = attempts.reduce((acc, a) => acc + (a.correct || 0), 0);

  const overallAccuracy = questionsCompleted > 0
    ? Math.round((correctAnswers / questionsCompleted) * 100)
    : 0;

  const totalPercentages = attempts.reduce((acc, a) => acc + (a.percentage || 0), 0);
  const averageScore = attempts.length > 0
    ? Math.round(totalPercentages / attempts.length)
    : 0;

  const bestScore = attempts.length > 0
    ? Math.max(...attempts.map(a => a.percentage || 0))
    : 0;

  const savedInLibrary = allQuizzes.length;

  // Day streak from localStorage
  const streakDays = Number(localStorage.getItem('hamsa_streak_days') || 1);

  // Cross-module stats for full dashboard
  const [totalNotesCount, totalFlashcardDecks, totalCustomCards, totalCardReviews, dueCardsToday] = await Promise.all([
    db.notes.count().catch(() => 0),
    db.customDecks.count().catch(() => 0),
    db.customCards.count().catch(() => 0),
    db.cardReviews.count().catch(() => 0),
    getDueCardsCount().catch(() => 0)
  ]);

  return {
    totalQuizzesTaken,
    questionsCompleted,
    correctAnswers,
    overallAccuracy,
    averageScore,
    bestScore,
    savedInLibrary,
    savedBookmarksCount: bookmarkedQuestions.length,
    dayStreak: streakDays,
    totalNotesCount,
    totalFlashcardDecks,
    totalCustomCards,
    totalCardReviews,
    dueCardsToday
  };
}

/**
 * Calculate chart analytics data
 */
async function getAnalyticsData() {
  const allQuizzes = await db.quizzes.toArray();
  const quizById = new Map(allQuizzes.map(q => [q.id, q]));
  const allAttempts = await db.attempts.toArray();

  // Analytics are driven by the attempts log so that re-attempting a quiz adds a
  // data point instead of replacing one. Quizzes completed before the log existed
  // are back-filled from the quiz row.
  const legacy = allQuizzes
    .filter(q => q.completedAt && !allAttempts.some(a => a.quizId === q.id))
    .map(q => ({
      quizId: q.id,
      attemptedAt: q.completedAt,
      correct: q.correct || 0,
      incorrect: q.incorrect || 0,
      skipped: q.skipped || 0,
      percentage: q.percentage || 0
    }));

  const attempts = [...allAttempts, ...legacy]
    .sort((a, b) => new Date(a.attemptedAt) - new Date(b.attemptedAt));

  // 1. Donut Chart Data (Correct vs Incorrect vs Skipped)
  const totalCorrect = attempts.reduce((sum, a) => sum + (a.correct || 0), 0);
  const totalIncorrect = attempts.reduce((sum, a) => sum + (a.incorrect || 0), 0);
  const totalSkipped = attempts.reduce((sum, a) => sum + (a.skipped || 0), 0);

  // 2. Trend Line (last 10 attempts, so improvement across retakes is visible)
  const recent10 = attempts.slice(-10);

  // Number repeat attempts of the same quiz so the tooltip distinguishes them.
  const seenCounts = new Map();
  const trendPoints = recent10.map((a, idx) => {
    const quiz = quizById.get(a.quizId);
    const n = (seenCounts.get(a.quizId) || 0) + 1;
    seenCounts.set(a.quizId, n);
    const baseTitle = quiz ? quiz.title : 'Deleted quiz';
    return {
      label: `Q${idx + 1}`,
      title: n > 1 ? `${baseTitle} (attempt ${n})` : baseTitle,
      percentage: a.percentage || 0,
      date: new Date(a.attemptedAt).toLocaleDateString()
    };
  });

  // 3. Subject Mastery — aggregated across every attempt
  const subjectMap = {};
  attempts.forEach(a => {
    const quiz = quizById.get(a.quizId);
    const subj = (quiz && quiz.subject) || 'General Knowledge';
    if (!subjectMap[subj]) {
      subjectMap[subj] = { correct: 0, total: 0 };
    }
    subjectMap[subj].correct += (a.correct || 0);
    subjectMap[subj].total += ((a.correct || 0) + (a.incorrect || 0));
  });

  const subjectMastery = Object.keys(subjectMap).map(subj => {
    const item = subjectMap[subj];
    const acc = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
    return {
      subject: subj,
      accuracy: acc,
      questionsAttempted: item.total
    };
  }).sort((a, b) => b.accuracy - a.accuracy).slice(0, 6);

  return {
    donut: {
      correct: totalCorrect,
      incorrect: totalIncorrect,
      skipped: totalSkipped,
      total: totalCorrect + totalIncorrect + totalSkipped
    },
    trend: trendPoints,
    subjects: subjectMastery
  };
}

/**
 * Get comprehensive database storage counts for Settings & Management
 */
async function getDatabaseSummaryCounts() {
  const [
    quizzesCount, questionsCount, attemptsCount, notesCount,
    deckCount, cardCount, reviewCount, answerCount, teacherCount, savedExamCount
  ] = await Promise.all([
    db.quizzes.count().catch(() => 0),
    db.questions.count().catch(() => 0),
    db.attempts.count().catch(() => 0),
    db.notes.count().catch(() => 0),
    db.customDecks.count().catch(() => 0),
    db.customCards.count().catch(() => 0),
    db.cardReviews.count().catch(() => 0),
    db.answers.count().catch(() => 0),
    db.aiTeacherExplanations.count().catch(() => 0),
    db.savedExams.count().catch(() => 0)
  ]);

  return {
    quizzesCount, questionsCount, attemptsCount, notesCount,
    deckCount, cardCount, reviewCount, answerCount, teacherCount, savedExamCount,
    totalRecords: quizzesCount + questionsCount + attemptsCount + notesCount +
      deckCount + cardCount + reviewCount + answerCount + teacherCount + savedExamCount
  };
}

/**
 * Flat, newest-first log of every attempt across all quizzes, enriched with the
 * parent quiz's metadata.
 *
 * The History view previously showed one row per quiz, so retaking a quiz
 * replaced the earlier entry and the log under-reported how much practice had
 * actually happened. `id` stays the quiz id so existing row actions (results,
 * retake, export, delete) keep working unchanged.
 */
async function getAttemptHistory() {
  const [allQuizzes, allAttempts] = await Promise.all([
    db.quizzes.toArray(),
    db.attempts.toArray()
  ]);
  const quizById = new Map(allQuizzes.map(q => [q.id, q]));

  // Back-fill quizzes completed before the attempts log existed.
  const legacy = allQuizzes
    .filter(q => q.completedAt && !allAttempts.some(a => a.quizId === q.id))
    .map(q => ({
      id: undefined,
      quizId: q.id,
      attemptedAt: q.completedAt,
      score: q.score,
      correct: q.correct || 0,
      incorrect: q.incorrect || 0,
      skipped: q.skipped || 0,
      percentage: q.percentage || 0,
      durationSeconds: q.durationSeconds || 0,
      marksObtained: q.marksObtained ?? null,
      maxMarks: q.maxMarks ?? null,
      marksLostToNegative: q.marksLostToNegative ?? 0,
      accuracy: q.accuracy ?? null
    }));

  const combined = [...allAttempts, ...legacy];

  // Number attempts per quiz in chronological order.
  const perQuiz = new Map();
  combined
    .slice()
    .sort((a, b) => new Date(a.attemptedAt) - new Date(b.attemptedAt))
    .forEach(a => {
      const list = perQuiz.get(a.quizId) || [];
      list.push(a);
      perQuiz.set(a.quizId, list);
    });

  const rows = [];
  for (const [quizId, list] of perQuiz) {
    const quiz = quizById.get(quizId);
    list.forEach((a, idx) => {
      rows.push({
        ...a,
        attemptId: a.id ?? null,
        attemptNumber: idx + 1,
        totalAttempts: list.length,
        // Row actions operate on the quiz, so expose the quiz id as `id`.
        id: quizId,
        quizId,
        title: quiz ? quiz.title : 'Deleted quiz',
        subject: quiz ? quiz.subject : 'General',
        difficulty: quiz ? quiz.difficulty : 'MEDIUM',
        totalQuestions: quiz ? quiz.totalQuestions : (a.correct + a.incorrect + a.skipped),
        quizMode: quiz ? quiz.quizMode : null,
        scoringPreset: quiz ? quiz.scoringPreset : null,
        // Kept so existing templates reading completedAt still render.
        completedAt: a.attemptedAt,
        quizExists: Boolean(quiz)
      });
    });
  }

  return rows.sort((a, b) => new Date(b.attemptedAt) - new Date(a.attemptedAt));
}

/**
 * Every attempt of a single quiz, newest first, with an attempt number.
 * Lets the result screen show "attempt 3 of 5" and compare against earlier tries.
 */
async function getAttemptsForQuiz(quizId) {
  const numId = Number(quizId);
  const rows = await db.attempts.where('quizId').equals(numId).toArray();

  const ordered = rows.sort((a, b) => new Date(a.attemptedAt) - new Date(b.attemptedAt));
  const total = ordered.length;

  return ordered
    .map((a, idx) => ({ ...a, attemptNumber: idx + 1, totalAttempts: total }))
    .reverse();
}

/**
 * Best and latest attempt for a quiz, plus the change between them.
 */
async function getQuizAttemptSummary(quizId) {
  const attempts = await getAttemptsForQuiz(quizId);
  if (attempts.length === 0) return null;

  const latest = attempts[0];
  const best = attempts.reduce(
    (acc, a) => ((a.percentage || 0) > (acc.percentage || 0) ? a : acc),
    attempts[0]
  );
  const previous = attempts[1] || null;

  return {
    totalAttempts: latest.totalAttempts,
    latest,
    best,
    previous,
    improvementFromPrevious: previous
      ? Math.round(((latest.percentage || 0) - (previous.percentage || 0)) * 10) / 10
      : null,
    isPersonalBest: (latest.percentage || 0) >= (best.percentage || 0)
  };
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
  { key: 'quizzes',               label: 'Quizzes',                autoId: true,  required: ['title'] },
  { key: 'questions',             label: 'Questions',              autoId: true,  required: ['questionText'], parentRef: { field: 'quizId', table: 'quizzes' } },
  { key: 'attempts',              label: 'Quiz Attempts',          autoId: true,  required: [],               parentRef: { field: 'quizId', table: 'quizzes' } },
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
  'hamsa_exam_profile'
];

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

  const preferences = {};
  for (const key of BACKUP_PREFERENCE_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) preferences[key] = val;
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

  const stamp = new Date().toISOString().split('T')[0];
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hamsa-vidya-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

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
    if (storageKey) preferences[storageKey] = String(v);
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

      kept.push(row);
    }

    tables[spec.key] = kept;
    report[spec.key] = { label: spec.label, imported: kept.length, skipped };
    if (!spec.isCache) totalValid += kept.length;
  }

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

  const hasAnyKnownTable = BACKUP_TABLE_SPECS.some(s => Array.isArray(tables[s.key]) && tables[s.key].length > 0);
  if (!hasAnyKnownTable) {
    throw new Error('No recognisable Hamsa Vidya data found in this file. Expected at least one of: quizzes, notes, flashcard decks, answers or AI Teacher entries.');
  }
  if (totalValid === 0) {
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
    for (const [key, val] of Object.entries(preferences)) {
      localStorage.setItem(key, val);
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
    totalImported: totalValid,
    preferencesRestored,
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
    sections: note.sections || [
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
    quizzes: note.quizzes || [],
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
    sections: sectionsList,
    glossaryTerms: Array.isArray(noteData.glossaryTerms) ? noteData.glossaryTerms : [],
    summary: noteData.summary || null,
    quizzes: Array.isArray(noteData.quizzes) ? noteData.quizzes : [],
    annotations: noteData.annotations || { highlights: [], bookmarks: [], personalNotes: [] },
    content: contentText,
    metadata: {
      wordCount: words,
      charCount: contentText.length,
      readingTimeMin: Math.max(1, Math.ceil(words / 200)),
      totalSections: sectionsList.length,
      lastReadAt: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return await db.notes.add(entity);
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
  // Update last read timestamp non-blockingly
  try {
    db.notes.update(Number(id), { lastReadAt: new Date().toISOString() });
  } catch (e) {}
  return migrated;
}

async function updateNote(id, data) {
  const current = await db.notes.get(Number(id));
  if (!current) return null;

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
    originalSource: data.originalSource || current.originalSource || null,
    metadata: updatedMetadata,
    updatedAt: new Date().toISOString()
  });
  return await getNoteById(id);
}

async function deleteNote(id) {
  return await db.notes.delete(Number(id));
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
 * Searches seamlessly across Quizzes, Individual Questions, and Study Notes.
 * =========================================================================
 */
async function searchGlobalContent(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { quizzes: [], questions: [], notes: [], totalCount: 0 };
  }

  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return { quizzes: [], questions: [], notes: [], totalCount: 0 };
  }

  try {
    const [allQuizzes, allQuestions, allNotes] = await Promise.all([
      db.quizzes.toArray().catch(() => []),
      db.questions.toArray().catch(() => []),
      getAllNotes().catch(() => [])
    ]);

    const quizMap = new Map();
    allQuizzes.forEach(q => quizMap.set(q.id, q));

    // 1. Search Quizzes (Title, Subject, Source)
    const matchedQuizzes = [];
    for (const quiz of allQuizzes) {
      const titleMatch = quiz.title && quiz.title.toLowerCase().includes(query);
      const subjectMatch = quiz.subject && quiz.subject.toLowerCase().includes(query);
      const sourceMatch = quiz.sourceTitle && quiz.sourceTitle.toLowerCase().includes(query);

      if (titleMatch || subjectMatch || sourceMatch) {
        matchedQuizzes.push({
          id: quiz.id,
          title: quiz.title,
          subject: quiz.subject || 'General Knowledge',
          difficulty: quiz.difficulty || 'MEDIUM',
          totalQuestions: quiz.totalQuestions || 0,
          percentage: quiz.percentage ?? null,
          completedAt: quiz.completedAt || null,
          matchField: titleMatch ? 'Title' : (subjectMatch ? 'Subject' : 'Source')
        });
        if (matchedQuizzes.length >= 25) break;
      }
    }

    // 2. Search Questions (Question Stem, Options, Explanation)
    const matchedQuestions = [];
    for (const q of allQuestions) {
      const qTextMatch = q.questionText && q.questionText.toLowerCase().includes(query);
      const optMatch = Array.isArray(q.options) && q.options.some(opt => opt && opt.toLowerCase().includes(query));
      const expMatch = q.explanation && q.explanation.toLowerCase().includes(query);

      if (qTextMatch || optMatch || expMatch) {
        const parentQuiz = quizMap.get(q.quizId);
        matchedQuestions.push({
          id: q.id,
          quizId: q.quizId,
          questionText: q.questionText,
          quizTitle: parentQuiz ? parentQuiz.title : 'Study Quiz',
          subject: parentQuiz ? parentQuiz.subject : 'General',
          explanation: q.explanation || '',
          matchField: qTextMatch ? 'Question' : (optMatch ? 'Options' : 'Explanation')
        });
        if (matchedQuestions.length >= 35) break;
      }
    }

    // 3. Search Study Notes (Title, Subject, Description, Sections & Content)
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
      quizzes: matchedQuizzes,
      questions: matchedQuestions,
      notes: matchedNotes,
      totalCount: matchedQuizzes.length + matchedQuestions.length + matchedNotes.length
    };
  } catch (err) {
    console.error('Error during searchGlobalContent:', err);
    return { quizzes: [], questions: [], notes: [], totalCount: 0 };
  }
}

// =========================================================================
// INTERACTIVE FLASHCARDS & SPACED REPETITION (SRS) PERSISTENCE ENGINE
// =========================================================================

/**
 * Save / Update Spaced Repetition (SRS) Review Progress for a Card
 * Ratings: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
 */
async function saveCardReviewProgress(cardKey, deckId, deckType, rating) {
  try {
    const existing = await db.cardReviews.where('cardKey').equals(String(cardKey)).first();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let interval = 1;
    let repetitions = 0;
    let easeFactor = 2.5;
    let state = 'LEARNING';

    if (existing) {
      repetitions = existing.repetitions || 0;
      easeFactor = existing.easeFactor || 2.5;
      interval = existing.interval || 1;
    }

    if (rating === 1) {
      // Again (Failed active recall): reset repetition, due tomorrow
      repetitions = 0;
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      state = 'LEARNING';
    } else if (rating === 2) {
      // Hard: slight interval increase
      repetitions += 1;
      interval = Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      state = 'REVIEW';
    } else if (rating === 3) {
      // Good: standard SM-2 progression
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 4;
      else interval = Math.max(1, Math.round(interval * easeFactor));
      repetitions += 1;
      state = interval >= 7 ? 'MASTERED' : 'REVIEW';
    } else if (rating === 4) {
      // Easy: accelerated interval leap
      if (repetitions === 0) interval = 3;
      else if (repetitions === 1) interval = 7;
      else interval = Math.max(1, Math.round(interval * easeFactor * 1.3));
      repetitions += 1;
      easeFactor += 0.15;
      state = 'MASTERED';
    }

    const nextDueDate = new Date(Date.now() + interval * 86400000).toISOString().split('T')[0];

    const record = {
      cardKey: String(cardKey),
      deckId: deckId ? String(deckId) : null,
      deckType: deckType || 'GENERAL',
      interval,
      repetitions,
      easeFactor: Number(easeFactor.toFixed(2)),
      dueDate: nextDueDate,
      state,
      lastReviewedAt: now.toISOString(),
      lastRating: rating
    };

    if (existing && existing.id) {
      await db.cardReviews.update(existing.id, record);
    } else {
      await db.cardReviews.add(record);
    }

    return record;
  } catch (err) {
    console.error('Error in saveCardReviewProgress:', err);
    return null;
  }
}

/**
 * Get Spaced Repetition progress record for a specific card
 */
async function getCardReviewProgress(cardKey) {
  try {
    return await db.cardReviews.where('cardKey').equals(String(cardKey)).first();
  } catch (err) {
    console.error('Error in getCardReviewProgress:', err);
    return null;
  }
}

/**
 * Get all card review records for a specific deck
 */
async function getCardReviewsForDeck(deckId, deckType) {
  try {
    return await db.cardReviews
      .filter(r => String(r.deckId) === String(deckId) && r.deckType === deckType)
      .toArray();
  } catch (err) {
    console.error('Error in getCardReviewsForDeck:', err);
    return [];
  }
}

/**
 * Get count of cards that are due for revision today or overdue
 */
async function getDueCardsCount() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    return await db.cardReviews.filter(r => r.dueDate <= todayStr).count();
  } catch (err) {
    console.error('Error in getDueCardsCount:', err);
    return 0;
  }
}

/**
 * Get all flashcards currently due for spaced repetition study
 */
async function getAllDueCards() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const dueReviews = await db.cardReviews.filter(r => r.dueDate <= todayStr).toArray();
    if (dueReviews.length === 0) return [];

    const dueCards = [];

    for (const rev of dueReviews) {
      const parts = rev.cardKey.split(':');
      const type = parts[0];
      const id = parts[1];

      if (type === 'q') {
        const q = await db.questions.get(Number(id));
        if (q) {
          const correctOpt = q.options && q.options[q.correctAnswerIndex] ? q.options[q.correctAnswerIndex] : 'Refer to explanation';
          dueCards.push({
            id: rev.cardKey,
            cardKey: rev.cardKey,
            front: q.questionText,
            back: correctOpt,
            options: q.options || [],
            correctAnswerIndex: q.correctAnswerIndex,
            explanation: q.explanation || '',
            badge: 'Due Revision',
            srs: rev
          });
        }
      } else if (type === 'custom') {
        const c = await db.customCards.get(Number(id));
        if (c) {
          dueCards.push({
            id: rev.cardKey,
            cardKey: rev.cardKey,
            front: c.front,
            back: c.back,
            explanation: c.explanation || '',
            badge: c.badge || 'Custom Due',
            srs: rev
          });
        }
      }
    }

    return dueCards;
  } catch (err) {
    console.error('Error in getAllDueCards:', err);
    return [];
  }
}

// =========================================================================
// CUSTOM FLASHCARD DECKS CRUD
// =========================================================================

/**
 * Create a new Custom Flashcard Deck
 */
async function createCustomDeck(meta) {
  const now = new Date().toISOString();
  return await db.customDecks.add({
    title: meta.title || 'Untitled Flashcard Deck',
    subject: meta.subject || 'General Study',
    description: meta.description || '',
    createdAt: now,
    updatedAt: now
  });
}

/**
 * Fetch all Custom Decks with their card counts
 */
async function getAllCustomDecks() {
  try {
    const decks = await db.customDecks.orderBy('id').reverse().toArray();
    const result = [];
    for (const d of decks) {
      const cardCount = await db.customCards.where('deckId').equals(d.id).count();
      result.push({ ...d, cardCount });
    }
    return result;
  } catch (err) {
    console.error('Error in getAllCustomDecks:', err);
    return [];
  }
}

/**
 * Fetch a Custom Deck with all its Cards
 */
async function getCustomDeckWithCards(deckId) {
  try {
    const deck = await db.customDecks.get(Number(deckId));
    if (!deck) return null;
    const cards = await db.customCards.where('deckId').equals(Number(deckId)).toArray();
    return { ...deck, cards };
  } catch (err) {
    console.error('Error in getCustomDeckWithCards:', err);
    return null;
  }
}

/**
 * Add a new Card to a Custom Deck
 */
async function addCustomCard(cardData) {
  const now = new Date().toISOString();
  const cardId = await db.customCards.add({
    deckId: Number(cardData.deckId),
    front: cardData.front,
    back: cardData.back,
    explanation: cardData.explanation || '',
    badge: cardData.badge || 'Custom Card',
    createdAt: now
  });

  await db.customDecks.update(Number(cardData.deckId), { updatedAt: now });
  return cardId;
}

/**
 * Update an existing Custom Card
 */
async function updateCustomCard(cardId, cardData) {
  return await db.customCards.update(Number(cardId), {
    front: cardData.front,
    back: cardData.back,
    explanation: cardData.explanation || '',
    badge: cardData.badge || 'Custom Card'
  });
}

/**
 * Delete a Custom Card
 */
async function deleteCustomCard(cardId) {
  return await db.customCards.delete(Number(cardId));
}

/**
 * Delete a Custom Deck and all its Cards
 */
async function deleteCustomDeck(deckId) {
  return await db.transaction('rw', db.customDecks, db.customCards, db.cardReviews, async () => {
    await db.customCards.where('deckId').equals(Number(deckId)).delete();
    await db.customDecks.delete(Number(deckId));
  });
}

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
    structuredData: data.structuredData || {},
    isBookmarked: Boolean(data.isBookmarked),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (data.id) {
    await db.aiTeacherExplanations.update(Number(data.id), record);
    return data.id;
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
async function getAllAiTeacherExplanations(options = {}) {
  let collection = db.aiTeacherExplanations.toCollection();
  let items = await collection.reverse().sortBy('createdAt');

  if (options.onlyBookmarked) {
    items = items.filter(item => item.isBookmarked);
  }

  if (options.subject && options.subject !== 'ALL') {
    const sLower = options.subject.toLowerCase();
    items = items.filter(item => (item.subject || '').toLowerCase().includes(sLower));
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
  const newState = !item.isBookmarked;
  await db.aiTeacherExplanations.update(Number(id), {
    isBookmarked: newState,
    updatedAt: new Date().toISOString()
  });
  return newState;
}

/**
 * Delete an AI Teacher explanation record
 */
async function deleteAiTeacherExplanation(id) {
  return await db.aiTeacherExplanations.delete(Number(id));
}




