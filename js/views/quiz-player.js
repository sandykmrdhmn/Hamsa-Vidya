/**
 * HAMSA VIDYA (हंस विद्या) — Active Quiz Playback Controller
 * Dual Modes: Practice Mode (Instant feedback & explanations) & Exam Mode (Timed with Question Palette)
 */

/** localStorage key holding the single in-progress attempt. */
const ACTIVE_ATTEMPT_STORAGE_KEY = 'hamsa_active_quiz_attempt';

/** Saved progress older than this is considered stale and discarded. */
const ACTIVE_ATTEMPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

class QuizPlayerView {
  constructor() {
    this.container = document.getElementById('view-quiz-player');
    this.quiz = null;
    this.questions = [];
    this.currentIndex = 0;

    // User responses state
    this.userAnswers = {}; // { questionId: selectedOptionIndex }
    this.flaggedQuestions = new Set(); // set of questionIds marked for review
    this.lockedQuestions = new Set(); // questions that have been locked in Practice mode

    // ---- Timing -----------------------------------------------------------
    // Time is derived from wall-clock timestamps rather than counting ticks.
    // Browsers throttle timers in background tabs, so a tick-based countdown
    // silently grants the candidate extra exam time.
    this.timerInterval = null;
    this.examDeadline = null;   // ms epoch when an EXAM attempt must end
    this.sittingStartedAt = null; // ms epoch this sitting began
    this.accumulatedSeconds = 0;  // elapsed time carried over from earlier sittings
    this.remainingSeconds = 0;    // derived cache, kept for render()

    this._onVisibilityChange = null;
    this._onBeforeUnload = null;
  }

  // =========================================================================
  // DERIVED TIME
  // =========================================================================

  /** Total seconds spent on this attempt across all sittings. */
  getElapsedSeconds() {
    const thisSitting = this.sittingStartedAt
      ? Math.max(0, Math.floor((Date.now() - this.sittingStartedAt) / 1000))
      : 0;
    return this.accumulatedSeconds + thisSitting;
  }

  /** Seconds left in an EXAM attempt (0 when expired, 0 for practice). */
  getRemainingSeconds() {
    if (!this.examDeadline) return 0;
    return Math.max(0, Math.ceil((this.examDeadline - Date.now()) / 1000));
  }

  /** Refresh the cached value that render() reads. */
  _syncRemaining() {
    this.remainingSeconds = this.getRemainingSeconds();
    return this.remainingSeconds;
  }

  // Kept as a property for backwards compatibility with existing callers
  // (submitQuiz stores it as durationSeconds).
  get elapsedSeconds() {
    return this.getElapsedSeconds();
  }

  async loadAndStart(quizId) {
    const data = await getQuizWithQuestions(quizId);
    if (!data || !data.questions || data.questions.length === 0) {
      app.showToast('Quiz not found or contains no questions.', 'error');
      app.navigate('dashboard');
      return;
    }

    this.quiz = data;
    this.questions = data.questions;

    // Resume a matching in-progress attempt if one survived a refresh/crash.
    const saved = this._loadSavedProgress(data.id);
    if (saved) {
      const answered = Object.keys(saved.userAnswers || {}).length;
      const resume = await this._askResume(saved, answered);
      if (resume) {
        this._applySavedProgress(saved);
        this._beginSitting();
        app.showToast(`Resumed — ${answered} of ${this.questions.length} answered.`, 'success');
        return;
      }
      this._clearSavedProgress();
    }

    this._resetAttemptState();
    this._beginSitting();
  }

  /** Fresh attempt state. */
  _resetAttemptState() {
    this.currentIndex = 0;
    this.userAnswers = {};
    this.flaggedQuestions.clear();
    this.lockedQuestions.clear();
    this.accumulatedSeconds = 0;

    if (this.quiz.quizMode === 'EXAM') {
      const totalMinutes = Math.max(5, Math.round(this.questions.length * 1.5));
      this.examDeadline = Date.now() + totalMinutes * 60 * 1000;
    } else {
      this.examDeadline = null;
    }
  }

  /** Start (or restart) the clock, listeners and render for this sitting. */
  _beginSitting() {
    this.sittingStartedAt = Date.now();
    this._syncRemaining();
    this.startExamTimer();
    this.attachKeyboard();
    this.attachLifecycleListeners();
    this.render();
    this._persistProgress();
  }

  // =========================================================================
  // IN-PROGRESS PERSISTENCE (survives refresh, crash, accidental navigation)
  // =========================================================================

  _persistProgress() {
    if (!this.quiz) return;
    try {
      const payload = {
        quizId: this.quiz.id,
        quizMode: this.quiz.quizMode,
        totalQuestions: this.questions.length,
        currentIndex: this.currentIndex,
        userAnswers: this.userAnswers,
        flagged: Array.from(this.flaggedQuestions),
        locked: Array.from(this.lockedQuestions),
        // Store time remaining rather than an absolute deadline, so closing the
        // browser overnight doesn't silently consume the whole exam window.
        remainingSeconds: this.examDeadline ? this.getRemainingSeconds() : null,
        elapsedSeconds: this.getElapsedSeconds(),
        savedAt: Date.now()
      };
      localStorage.setItem(ACTIVE_ATTEMPT_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Storage full or unavailable — progress saving is best-effort.
      console.warn('Could not persist quiz progress:', err);
    }
  }

  _loadSavedProgress(quizId) {
    try {
      const raw = localStorage.getItem(ACTIVE_ATTEMPT_STORAGE_KEY);
      if (!raw) return null;

      const saved = JSON.parse(raw);
      if (!saved || Number(saved.quizId) !== Number(quizId)) return null;
      if (Date.now() - (saved.savedAt || 0) > ACTIVE_ATTEMPT_MAX_AGE_MS) {
        this._clearSavedProgress();
        return null;
      }
      // Nothing worth resuming.
      const answered = Object.keys(saved.userAnswers || {}).length;
      if (answered === 0 && (saved.currentIndex || 0) === 0) return null;

      // An expired exam cannot be meaningfully resumed.
      if (saved.quizMode === 'EXAM' && Number(saved.remainingSeconds) <= 0) {
        this._clearSavedProgress();
        return null;
      }
      return saved;
    } catch {
      this._clearSavedProgress();
      return null;
    }
  }

  _applySavedProgress(saved) {
    this.currentIndex = Math.min(
      Math.max(0, Number(saved.currentIndex) || 0),
      this.questions.length - 1
    );
    this.userAnswers = saved.userAnswers && typeof saved.userAnswers === 'object' ? saved.userAnswers : {};
    this.flaggedQuestions = new Set(Array.isArray(saved.flagged) ? saved.flagged : []);
    this.lockedQuestions = new Set(Array.isArray(saved.locked) ? saved.locked : []);
    this.accumulatedSeconds = Math.max(0, Number(saved.elapsedSeconds) || 0);

    this.examDeadline = (this.quiz.quizMode === 'EXAM' && Number(saved.remainingSeconds) > 0)
      ? Date.now() + Number(saved.remainingSeconds) * 1000
      : null;
  }

  _clearSavedProgress() {
    try {
      localStorage.removeItem(ACTIVE_ATTEMPT_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  /** Ask the user whether to resume. Resolves true to resume. */
  _askResume(saved, answered) {
    return new Promise(resolve => {
      const timeNote = saved.quizMode === 'EXAM' && saved.remainingSeconds
        ? `\nTime remaining: ${Math.floor(saved.remainingSeconds / 60)}m ${saved.remainingSeconds % 60}s`
        : '';

      app.showConfirmation({
        title: 'Resume Unfinished Attempt?',
        message:
          `You have an unfinished attempt at this quiz.\n\n` +
          `Progress: ${answered} of ${saved.totalQuestions} answered (question ${(saved.currentIndex || 0) + 1})` +
          `${timeNote}\n\nResume where you left off, or start over?`,
        confirmText: 'Resume',
        cancelText: 'Start Over',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  // =========================================================================
  // LIFECYCLE LISTENERS
  // =========================================================================

  attachLifecycleListeners() {
    this.detachLifecycleListeners();

    // Recompute the clock when the tab regains focus — background throttling
    // means the interval may not have fired for a while.
    this._onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        this._persistProgress();
        return;
      }
      this._syncRemaining();
      this._updateTimerDisplay();
      if (this.examDeadline && this.remainingSeconds <= 0) this._handleTimeUp();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Save synchronously on refresh/close so progress survives.
    this._onBeforeUnload = () => this._persistProgress();
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  detachLifecycleListeners() {
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._onVisibilityChange = null;
    }
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload);
      this._onBeforeUnload = null;
    }
  }

  /**
   * Called by app.navigate() when the user leaves the quiz player by any route
   * (header nav, mobile nav, browser back) rather than the Quit button.
   *
   * Without this the practice-mode interval and the window keydown listener
   * stayed alive for the rest of the session, and A/B/C/D keypresses in other
   * views were still routed into the abandoned quiz.
   */
  onLeaveView() {
    this._persistProgress();
    this.stopExamTimer();
    this.detachKeyboard();
    this.detachLifecycleListeners();
  }

  attachKeyboard() {
    this.detachKeyboard();
    this._handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const key = e.key.toUpperCase();
      const q = this.questions[this.currentIndex];
      if (!q) return;

      if (key === 'A' || key === '1') {
        this.selectOption(0);
      } else if (key === 'B' || key === '2') {
        this.selectOption(1);
      } else if (key === 'C' || key === '3') {
        this.selectOption(2);
      } else if (key === 'D' || key === '4') {
        this.selectOption(3);
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (this.currentIndex < this.questions.length - 1) {
          this.nextQuestion();
        }
      } else if (e.key === 'ArrowLeft') {
        if (this.currentIndex > 0) {
          this.prevQuestion();
        }
      }
    };
    window.addEventListener('keydown', this._handleKey);
  }

  detachKeyboard() {
    if (this._handleKey) {
      window.removeEventListener('keydown', this._handleKey);
      this._handleKey = null;
    }
  }

  /**
   * Single ticking clock for both modes. Time is always read from the wall
   * clock, so a throttled background tab cannot hand out extra exam time.
   */
  startExamTimer() {
    this.stopExamTimer();

    // Autosave roughly every 5 seconds rather than on every tick.
    let tick = 0;

    this.timerInterval = setInterval(() => {
      tick++;

      if (this.examDeadline) {
        this._syncRemaining();
        this._updateTimerDisplay();
        if (this.remainingSeconds <= 0) {
          this._handleTimeUp();
          return;
        }
      }

      if (tick % 5 === 0) this._persistProgress();
    }, 1000);
  }

  stopExamTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Paint the countdown pill from the current derived value. */
  _updateTimerDisplay() {
    const timerEl = document.getElementById('exam-timer-display');
    if (!timerEl) return;

    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const badge = document.getElementById('exam-timer-badge');
    if (badge) badge.classList.toggle('warning', this.remainingSeconds <= 120);
  }

  /** Exam window elapsed — auto-submit exactly once. */
  _handleTimeUp() {
    if (this._timeUpHandled) return;
    this._timeUpHandled = true;

    this.stopExamTimer();
    app.showToast('Time is up! Submitting your exam now...', 'warning');
    this.submitQuiz();
  }

  render() {
    if (!this.container || !this.quiz || !this.questions[this.currentIndex]) return;

    const q = this.questions[this.currentIndex];
    const total = this.questions.length;
    const progressPct = Math.round(((this.currentIndex + 1) / total) * 100);
    const isPractice = this.quiz.quizMode === 'PRACTICE';
    const isExam = this.quiz.quizMode === 'EXAM';

    const selectedOption = this.userAnswers[q.id];
    const isLocked = isPractice && this.lockedQuestions.has(q.id);
    const isFlagged = this.flaggedQuestions.has(q.id);
    const letters = ['A', 'B', 'C', 'D'];

    // Exam timer text
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const timerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    this.container.innerHTML = `
      <div class="quiz-player-container">
        <!-- Top Nav Card -->
        <div class="quiz-nav-card">
          <div class="quiz-nav-top-row">
            <div class="quiz-title-box">
              <div class="quiz-active-title" title="${this.quiz.title}">${this.quiz.title}</div>
              <div class="quiz-step-text">Question ${this.currentIndex + 1} of ${total}</div>
            </div>

            <div class="quiz-header-actions">
              ${isExam ? `
                <div id="exam-timer-badge" class="exam-timer-badge ${this.remainingSeconds <= 120 ? 'warning' : ''}">
                  <i data-lucide="clock" style="width:16px;height:16px;"></i>
                  <span id="exam-timer-display">${timerText}</span>
                </div>
              ` : ''}

              <!-- Question Palette Button (Always accessible) -->
              <button class="btn btn-secondary btn-sm" onclick="quizPlayerView.togglePalette(true)" title="Question Palette">
                <i data-lucide="layout-grid" style="width:15px;height:15px;"></i>
                <span>Palette (${total})</span>
              </button>

              <!-- Instant PDF Export Button -->
              <button class="icon-btn" title="Export Question Paper PDF" onclick="app.exportCurrentPlayingPdf()">
                <i data-lucide="file-down" style="width:18px;height:18px;"></i>
              </button>

              <!-- Quit Button -->
              <button class="icon-btn" title="Quit Quiz" onclick="quizPlayerView.confirmQuit()">
                <i data-lucide="x" style="width:18px;height:18px;"></i>
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="quiz-progress-track">
            <div class="quiz-progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <!-- Question Card -->
        <div class="question-card">
          <div class="question-card-meta">
            <div class="meta-tags-left">
              <span class="badge badge-primary">${this.quiz.subject}</span>
              <span class="badge badge-muted">${this.quiz.difficulty}</span>
              ${q.sourcePage ? `<span class="badge badge-muted">Source: Page ${q.sourcePage}</span>` : ''}
              ${isFlagged ? `<span class="badge badge-warning">Marked for Review</span>` : ''}
            </div>

            <button class="bookmark-toggle-btn ${q.isBookmarked ? 'bookmarked' : ''}" 
              onclick="quizPlayerView.toggleBookmark(${q.id})" 
              title="${q.isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}">
              <i data-lucide="bookmark" style="width:20px;height:20px; ${q.isBookmarked ? 'fill:currentColor;' : ''}"></i>
            </button>
          </div>

          <!-- Question Stem -->
          <div class="question-text">
            ${SecurityUtils.sanitizeHtml(q.questionText)}
          </div>

          <!-- 4 Interactive Option Cards -->
          <div class="options-grid">
            ${(q.options || []).map((opt, optIdx) => {
              let optionClasses = 'option-card';
              let badgeContent = letters[optIdx] || (optIdx + 1);

              if (isPractice && isLocked) {
                optionClasses += ' locked';
                if (optIdx === q.correctAnswerIndex) {
                  optionClasses += ' correct';
                  badgeContent = '✓';
                } else if (optIdx === selectedOption) {
                  optionClasses += ' wrong';
                  badgeContent = '✕';
                }
              } else if (isExam) {
                if (selectedOption === optIdx) {
                  optionClasses += ' selected-exam';
                }
              }

              return `
                <div class="${optionClasses}" onclick="quizPlayerView.selectOption(${optIdx})">
                  <div class="option-badge">${badgeContent}</div>
                  <div class="option-label-text">${SecurityUtils.sanitizeHtml(opt)}</div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Instant Explanation Card (Practice Mode) -->
          ${isPractice && isLocked ? `
            <div class="explanation-card">
              <div class="explanation-header ${selectedOption === q.correctAnswerIndex ? 'correct' : 'wrong'}">
                <span>${selectedOption === q.correctAnswerIndex ? '🎉 Correct Answer!' : '❌ Incorrect Selection'}</span>
                <span>Correct Option: (${letters[q.correctAnswerIndex]})</span>
              </div>
              <div class="explanation-body">
                ${SecurityUtils.sanitizeHtml(q.explanation)}
              </div>
              ${q.sourcePage ? `
                <div class="explanation-source">
                  <i data-lucide="book-open" style="width:14px;height:14px;"></i>
                  <span>Verified Citation: Page ${q.sourcePage}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Bottom Action Navigation -->
        <div class="quiz-bottom-bar">
          <div class="quiz-left-actions">
            ${this.currentIndex > 0 ? `
              <button class="btn btn-secondary" onclick="quizPlayerView.prevQuestion()">
                <i data-lucide="chevron-left"></i>
                <span>Previous</span>
              </button>
            ` : '<div></div>'}

            ${isExam ? `
              <button class="btn btn-outline" onclick="quizPlayerView.toggleFlag(${q.id})">
                <i data-lucide="flag" style="width:16px;height:16px;"></i>
                <span>${isFlagged ? 'Unflag' : 'Mark for Review'}</span>
              </button>
            ` : ''}
          </div>

          <div class="quiz-right-actions">
            ${this.currentIndex < total - 1 ? `
              ${!isLocked && selectedOption === undefined ? `
                <button class="btn btn-secondary" onclick="quizPlayerView.skipQuestion()">
                  <span>Skip</span>
                </button>
              ` : ''}
              <button class="btn btn-primary" onclick="quizPlayerView.nextQuestion()">
                <span>Next Question</span>
                <i data-lucide="chevron-right"></i>
              </button>
            ` : `
              <button class="btn btn-primary btn-lg" onclick="quizPlayerView.confirmSubmit()">
                <i data-lucide="check-circle-2"></i>
                <span>${isExam ? 'Submit Exam' : 'Finish Quiz'}</span>
              </button>
            `}
          </div>
        </div>
      </div>

      <!-- Question Palette Backdrop Overlay -->
      <div id="palette-backdrop" class="palette-backdrop" onclick="quizPlayerView.togglePalette(false)"></div>

      <!-- Question Palette Drawer -->
      <div id="palette-drawer" class="palette-drawer">
        <div class="palette-header">
          <h3 style="font-size:1.1rem; font-weight:700;">Question Palette</h3>
          <button class="icon-btn" onclick="quizPlayerView.togglePalette(false)">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="palette-legend">
          <div class="legend-item">
            <span class="legend-dot answered"></span>
            <span>Answered</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot unanswered"></span>
            <span>Unanswered</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot flagged"></span>
            <span>Flagged</span>
          </div>
        </div>

        <div class="palette-grid">
          ${this.questions.map((quest, idx) => {
            let cellClass = 'palette-cell';
            if (idx === this.currentIndex) cellClass += ' current';
            if (this.flaggedQuestions.has(quest.id)) cellClass += ' flagged';
            else if (this.userAnswers[quest.id] !== undefined) cellClass += ' answered';

            return `
              <div class="${cellClass}" onclick="quizPlayerView.jumpToQuestion(${idx})">
                ${idx + 1}
              </div>
            `;
          }).join('')}
        </div>

        <div style="padding-top:1rem; border-top:1px solid var(--border-subtle);">
          <button class="btn btn-primary" style="width:100%;" onclick="quizPlayerView.confirmSubmit()">
            <span>Submit Exam Now</span>
          </button>
        </div>
      </div>
    `;

    if (window.app) window.app.refreshIcons();
  }

  // =========================================================================
  // OPTION SELECTION & LOCKING
  // =========================================================================
  selectOption(optIdx) {
    const q = this.questions[this.currentIndex];
    const isPractice = this.quiz.quizMode === 'PRACTICE';

    if (isPractice) {
      if (this.lockedQuestions.has(q.id)) return; // already locked
      this.lockedQuestions.add(q.id);
      this.userAnswers[q.id] = optIdx;

      // Audio feedback for correct/wrong answers
      if (window.audioEngine) {
        if (optIdx === q.correctAnswerIndex) {
          window.audioEngine.playCorrect();
        } else {
          window.audioEngine.playWrong();
        }
      }

      this.render();
      this._persistProgress();
    } else {
      // In Exam Mode, allow changing answers anytime before submit
      this.userAnswers[q.id] = optIdx;
      if (window.audioEngine) {
        window.audioEngine.playOptionSelect();
      }
      this.render();
      this._persistProgress();
    }
  }

  toggleFlag(qId) {
    if (this.flaggedQuestions.has(qId)) {
      this.flaggedQuestions.delete(qId);
    } else {
      this.flaggedQuestions.add(qId);
    }
    this.render();
    this._persistProgress();
  }

  async toggleBookmark(qId) {
    const q = this.questions.find(item => item.id === qId);
    if (!q) return;

    q.isBookmarked = !q.isBookmarked;
    await updateQuestionBookmark(qId, q.isBookmarked);
    app.showToast(q.isBookmarked ? 'Question saved to bookmarks ⭐' : 'Bookmark removed', 'info');
    this.render();
  }

  // =========================================================================
  // NAVIGATION
  // =========================================================================
  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.render();
      this._persistProgress();
    }
  }

  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.render();
      this._persistProgress();
    }
  }

  skipQuestion() {
    this.nextQuestion();
  }

  jumpToQuestion(idx) {
    if (idx >= 0 && idx < this.questions.length) {
      this.currentIndex = idx;
      this.togglePalette(false);
      this.render();
      this._persistProgress();
    }
  }

  togglePalette(show) {
    const drawer = document.getElementById('palette-drawer');
    const backdrop = document.getElementById('palette-backdrop');
    if (drawer) {
      if (show) {
        drawer.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
      } else {
        drawer.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
      }
    }
  }

  // =========================================================================
  // SUBMISSION & QUIT
  // =========================================================================
  confirmQuit() {
    const answered = Object.keys(this.userAnswers).length;

    app.showConfirmation({
      title: 'Quit Quiz?',
      message: answered > 0
        ? `You have answered ${answered} of ${this.questions.length} questions.\n\n` +
          'Quitting discards this attempt permanently. If you only want to step away, ' +
          'navigate elsewhere instead — your progress is saved and you can resume later.'
        : 'Are you sure you want to exit this quiz?',
      confirmText: 'Discard & Quit',
      onConfirm: () => {
        this.stopExamTimer();
        this.detachKeyboard();
        this.detachLifecycleListeners();
        // Explicit quit means the user does not want this attempt back.
        this._clearSavedProgress();
        app.navigate('dashboard');
      }
    });
  }

  confirmSubmit() {
    const total = this.questions.length;
    const answeredCount = Object.keys(this.userAnswers).length;
    const flaggedCount = this.flaggedQuestions.size;
    const unansweredCount = total - answeredCount;

    app.showConfirmation({
      title: 'Submit Quiz for Evaluation?',
      message: `You have answered ${answeredCount} of ${total} questions (${unansweredCount} skipped, ${flaggedCount} flagged for review). Ready to submit?`,
      confirmText: 'Submit Now',
      onConfirm: () => {
        this.submitQuiz();
      }
    });
  }

  async submitQuiz() {
    // Guard against double submission (timer expiry racing a manual submit).
    if (this._isSubmitting) return;
    this._isSubmitting = true;

    this.stopExamTimer();
    this.detachKeyboard();
    this.detachLifecycleListeners();

    const questionsState = this.questions.map(q => {
      const chosen = this.userAnswers[q.id];
      const answered = !(chosen === undefined || chosen === null || chosen === -1);
      return { ...q, userSelectedOptionIndex: answered ? chosen : null };
    });

    // Score under this quiz's marking scheme.
    const result = window.computeQuizScore(this.questions, this.userAnswers, {
      scoringPreset: this.quiz.scoringPreset,
      marksPerCorrect: this.quiz.marksPerCorrect,
      negativeMarkPerWrong: this.quiz.negativeMarkPerWrong
    });

    const resultData = { ...result, durationSeconds: this.getElapsedSeconds() };

    try {
      await updateQuizCompletion(this.quiz.id, resultData, questionsState);
    } catch (err) {
      console.error('Failed to save quiz result:', err);
      this._isSubmitting = false;
      app.showToast('Could not save your result. Your answers are still saved — please try submitting again.', 'error');
      return;
    }

    // Result is safely stored, so the in-progress copy is no longer needed.
    this._clearSavedProgress();

    app.checkAndUpdateStreak();

    const penaltyNote = result.marksLostToNegative > 0
      ? ` (−${result.marksLostToNegative} from negative marking)`
      : '';
    app.showToast(
      `Submitted — ${result.marksObtained}/${result.maxMarks} marks${penaltyNote}. Analyzing results...`,
      'success'
    );

    this._isSubmitting = false;
    app.viewQuizResult(this.quiz.id);
  }
}

window.quizPlayerView = new QuizPlayerView();
