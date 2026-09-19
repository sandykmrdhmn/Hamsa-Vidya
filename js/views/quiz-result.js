/**
 * HAMSA VIDYA (हंस विद्या) — Quiz Result & Detailed Review Controller
 */

class QuizResultView {
  constructor() {
    this.container = document.getElementById('view-quiz-result');
    this.quiz = null;
    this.questions = [];
    this.activeFilter = 'ALL'; // 'ALL', 'INCORRECT', 'BOOKMARKED'
    this.activeDoubtQuestion = null;
    this.doubtHistory = [];
    this.isDoubtDrawerOpen = false;
    this.isDoubtLoading = false;
  }

  async loadResult(quizId) {
    const data = await getQuizWithQuestions(quizId);
    if (!data) {
      app.showToast('Quiz results could not be found.', 'error');
      app.navigate('dashboard');
      return;
    }

    this.quiz = data;
    this.questions = data.questions || [];
    this.activeFilter = 'ALL';
    this.render();
  }

  render() {
    if (!this.container || !this.quiz) return;

    const qz = this.quiz;
    const total = this.questions.length;
    const scorePct = qz.percentage ?? 0;

    // Marks detail is only present on quizzes scored by the marking-scheme engine.
    const hasMarks = qz.maxMarks != null && qz.marksObtained != null;
    const penaltyApplied = Number(qz.marksLostToNegative) > 0;

    // Determine Grade Badge
    let gradeText = 'Needs Review';
    let gradeClass = 'review';
    if (scorePct >= 90) { gradeText = 'A+ Exemplary'; gradeClass = 'a-plus'; }
    else if (scorePct >= 75) { gradeText = 'A Proficient'; gradeClass = 'a'; }
    else if (scorePct >= 50) { gradeText = 'B Developing'; gradeClass = 'b'; }

    // Format Duration
    const mins = Math.floor((qz.durationSeconds || 0) / 60);
    const secs = (qz.durationSeconds || 0) % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}m:${String(secs).padStart(2, '0')}s`;

    // Filter questions
    const filteredQuestions = this.questions.filter(q => {
      if (this.activeFilter === 'INCORRECT') {
        return q.userSelectedOptionIndex !== q.correctAnswerIndex;
      }
      if (this.activeFilter === 'BOOKMARKED') {
        return Boolean(q.isBookmarked);
      }
      return true;
    });

    const incorrectQuestionsCount = this.questions.filter(q => q.userSelectedOptionIndex !== q.correctAnswerIndex).length;

    const studentName = (window.examProfileManager && window.examProfileManager.getStudentName()) || 'Scholar';

    this.container.innerHTML = `
      <div class="result-container">
        <!-- Top Summary Hero -->
        <div class="result-hero-card">
          <div class="result-hero-info">
            <div class="grade-badge ${gradeClass}">
              <i data-lucide="award"></i>
              <span>${gradeText} • ${studentName}</span>
            </div>

            <h1 style="font-size:2rem; font-weight:800; letter-spacing:-0.02em;">
              Performance Assessment
            </h1>

            <div class="result-score-large gradient-text">
              ${scorePct}%
            </div>

            ${hasMarks ? `
              <div class="result-marks-line" style="display:flex; align-items:center; justify-content:center; gap:0.5rem; flex-wrap:wrap; font-size:1.05rem; font-weight:700; margin-top:-0.35rem;">
                <span style="color:var(--text-main);">${qz.marksObtained} / ${qz.maxMarks} marks</span>
                ${penaltyApplied ? `
                  <span style="font-size:0.85rem; font-weight:600; color:var(--color-error); background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); padding:0.15rem 0.5rem; border-radius:var(--radius-full);"
                        title="${qz.incorrect} wrong × ${qz.negativeMarkPerWrong} marks deducted">
                    −${qz.marksLostToNegative} negative marking
                  </span>
                ` : ''}
              </div>
            ` : ''}

            <div class="result-stats-row">
              <div><strong>${qz.correct}</strong> Correct</div>
              <div>•</div>
              <div><strong>${qz.incorrect}</strong> Incorrect</div>
              <div>•</div>
              <div><strong>${qz.skipped}</strong> Skipped</div>
              ${qz.accuracy != null ? `
                <div>•</div>
                <div><strong>${qz.accuracy}%</strong> Accuracy <span style="color:var(--text-muted); font-size:0.8rem;">(of attempted)</span></div>
              ` : ''}
              <div>•</div>
              <div><i data-lucide="clock" style="width:14px;height:14px;display:inline;vertical-align:middle;"></i> ${timeFormatted}</div>
            </div>

            <p style="font-size:0.92rem; color:var(--text-muted); margin-top:0.25rem;">
              Assessment completed on ${new Date(qz.completedAt || qz.createdAt).toLocaleString()}
            </p>
          </div>

          <!-- Accuracy Donut Chart -->
          <div id="result-donut-chart-box"></div>
        </div>

        <!-- Dedicated "Export Question Paper (PDF)" Card -->
        <div class="export-pdf-banner">
          <div class="export-banner-text">
            <div class="export-banner-icon">
              <i data-lucide="file-text" style="width:26px;height:26px;"></i>
            </div>
            <div>
              <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">
                Export Official A4 PDF Question Paper
              </div>
              <div style="font-size:0.85rem; color:var(--text-secondary);">
                Download standard printable examination paper with AutoTable answer key & detailed rationale.
              </div>
            </div>
          </div>

          <button class="btn btn-primary" onclick="app.exportQuizPdf(${qz.id})">
            <i data-lucide="download"></i>
            <span>Download A4 PDF</span>
          </button>
        </div>

        <!-- Result Action Bar -->
        <div class="result-actions-bar">
          ${incorrectQuestionsCount > 0 ? `
            <button class="btn btn-primary" onclick="quizResultView.reattemptMissed()">
              <i data-lucide="refresh-cw"></i>
              <span>Re-attempt Missed Questions (${incorrectQuestionsCount})</span>
            </button>
          ` : ''}

          <button class="btn btn-secondary" onclick="app.startQuiz(${qz.id})">
            <i data-lucide="rotate-ccw"></i>
            <span>Retake Full Quiz</span>
          </button>

          <button class="btn btn-secondary" onclick="quizResultView.shareResult()">
            <i data-lucide="share-2"></i>
            <span>Share Result</span>
          </button>

          <button class="btn btn-outline" onclick="app.navigate('dashboard')">
            <i data-lucide="home"></i>
            <span>Back to Dashboard</span>
          </button>
        </div>

        <!-- Question-by-Question Review Section -->
        <div class="review-section">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
            <h2>Detailed Question Review</h2>

            <!-- Filter Tabs -->
            <div class="review-filter-tabs">
              <button class="review-tab-btn ${this.activeFilter === 'ALL' ? 'active' : ''}" onclick="quizResultView.setFilter('ALL')">
                All (${total})
              </button>
              <button class="review-tab-btn ${this.activeFilter === 'INCORRECT' ? 'active' : ''}" onclick="quizResultView.setFilter('INCORRECT')">
                Incorrect (${incorrectQuestionsCount})
              </button>
              <button class="review-tab-btn ${this.activeFilter === 'BOOKMARKED' ? 'active' : ''}" onclick="quizResultView.setFilter('BOOKMARKED')">
                Bookmarked (${this.questions.filter(q => q.isBookmarked).length})
              </button>
            </div>
          </div>

          <!-- Review List Cards -->
          <div style="display:flex; flex-direction:column; gap:1rem;">
            ${filteredQuestions.length === 0 ? `
              <div class="glass-panel" style="padding:2rem; text-align:center; color:var(--text-muted);">
                No questions match this review filter.
              </div>
            ` : filteredQuestions.map((q, idx) => {
              const isCorrect = q.userSelectedOptionIndex === q.correctAnswerIndex;
              const isSkipped = q.userSelectedOptionIndex === null || q.userSelectedOptionIndex === undefined;
              const letters = ['A', 'B', 'C', 'D'];

              return `
                <div class="review-item-card">
                  <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                      <span class="badge ${isCorrect ? 'badge-success' : isSkipped ? 'badge-warning' : 'badge-error'}">
                        ${isCorrect ? '✓ Correct' : isSkipped ? '⚪ Skipped' : '✕ Incorrect'}
                      </span>
                      ${q.sourcePage ? `<span class="badge badge-muted">Page ${q.sourcePage}</span>` : ''}
                    </div>

                    <button class="bookmark-toggle-btn ${q.isBookmarked ? 'bookmarked' : ''}" 
                      onclick="quizResultView.toggleReviewBookmark(${q.id})" 
                      title="${q.isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}">
                      <i data-lucide="bookmark" style="width:18px;height:18px; ${q.isBookmarked ? 'fill:currentColor;' : ''}"></i>
                    </button>
                  </div>

                  <div style="font-size:1.08rem; font-weight:700; color:var(--text-main);">
                    Q${this.questions.indexOf(q) + 1}. ${q.questionText}
                  </div>

                  <!-- Options Review -->
                  <div class="review-options-list">
                    ${(q.options || []).map((opt, optIdx) => {
                      const isOptionCorrect = optIdx === q.correctAnswerIndex;
                      const isOptionSelected = optIdx === q.userSelectedOptionIndex;

                      let rowClass = 'review-option-row';
                      if (isOptionCorrect) rowClass += ' correct-target';
                      else if (isOptionSelected && !isOptionCorrect) rowClass += ' user-selected-wrong';

                      return `
                        <div class="${rowClass}">
                          <span style="font-weight:700;">(${letters[optIdx]})</span>
                          <span style="flex:1;">${SecurityUtils.sanitizeHtml(opt)}</span>
                          ${isOptionCorrect ? '<span style="font-weight:700; color:var(--color-success);">Official Key</span>' : ''}
                          ${isOptionSelected && !isOptionCorrect ? '<span style="color:var(--color-error); font-weight:600;">Your Choice</span>' : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <!-- Explanation Box -->
                  <div class="explanation-card" style="margin-top:0.25rem;">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--color-primary-light);">
                      Conceptual Explanation & Rationale:
                    </div>
                    <div class="explanation-body">
                      ${SecurityUtils.sanitizeHtml(q.explanation)}
                    </div>
                  </div>

                  <!-- AI Doubt Solver Trigger -->
                  <div class="doubt-solver-trigger-row" style="margin-top:0.75rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                    <button type="button" class="btn-doubt-solver" onclick="quizResultView.openDoubtSolver(${q.id})">
                      <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--color-gold);"></i>
                      <span>AI Doubt Solver • Explain More</span>
                      <span class="doubt-tag">AI Guru</span>
                    </button>
                    <span style="font-size:0.82rem; color:var(--text-muted);">
                      Deep rationale, analogies & option breakdowns
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- AI Doubt Solver Drawer & Backdrop -->
        <div class="doubt-solver-backdrop ${this.isDoubtDrawerOpen ? 'active' : ''}" id="doubt-solver-backdrop" onclick="quizResultView.closeDoubtSolver()"></div>
        <aside class="doubt-solver-drawer ${this.isDoubtDrawerOpen ? 'active' : ''}" id="doubt-solver-drawer" role="dialog" aria-label="AI Doubt Solver">
          ${this.renderDoubtDrawerContent()}
        </aside>
      </div>
    `;

    // Render Donut Chart in Result Hero
    HamsaCharts.renderDonutChart('result-donut-chart-box', {
      correct: qz.correct,
      incorrect: qz.incorrect,
      skipped: qz.skipped
    });

    if (window.app) window.app.refreshIcons();

    // Trigger celebratory fanfare audio & confetti for good scores
    if (window.audioEngine) {
      if (scorePct >= 60) {
        window.audioEngine.playFanfare();
      } else {
        window.audioEngine.playTabSwitch();
      }
    }

    if (scorePct >= 60) {
      setTimeout(() => this.triggerConfetti(), 300);
    }
  }

  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#F59E0B', '#6366F1', '#EC4899', '#10B981', '#0EA5E9', '#A855F7', '#FCD34D'];
    const particles = [];
    const particleCount = 90;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() * 260 - 130),
        y: canvas.height * 0.35 + (Math.random() * 80 - 40),
        vx: (Math.random() - 0.5) * 16,
        vy: Math.random() * -14 - 5,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 12,
        gravity: 0.42,
        opacity: 1
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let aliveCount = 0;

      for (const p of particles) {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rSpeed;
        p.opacity -= 0.0085;

        if (p.opacity > 0 && p.y < canvas.height + 20) {
          aliveCount++;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      }

      if (aliveCount > 0) {
        requestAnimationFrame(render);
      } else {
        canvas.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    render();
  }

  setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  }

  async toggleReviewBookmark(qId) {
    const q = this.questions.find(item => item.id === qId);
    if (!q) return;

    q.isBookmarked = !q.isBookmarked;
    await updateQuestionBookmark(qId, q.isBookmarked);
    app.showToast(q.isBookmarked ? 'Question bookmarked ⭐' : 'Bookmark removed', 'info');
    this.render();
  }

  // Re-attempt only the missed questions
  async reattemptMissed() {
    const missed = this.questions.filter(q => q.userSelectedOptionIndex !== q.correctAnswerIndex);
    if (missed.length === 0) {
      app.showToast('No missed questions! You got 100% correct.', 'success');
      return;
    }

    // Create a new practice drill with missed questions
    const newQuizId = await saveNewQuiz({
      title: `${this.quiz.title} (Missed Drill)`,
      subject: this.quiz.subject,
      difficulty: this.quiz.difficulty,
      quizMode: 'PRACTICE',
      language: this.quiz.language,
      sourceType: this.quiz.sourceType,
      sourceTitle: this.quiz.sourceTitle
    }, missed);

    app.showToast('Created practice drill for missed questions!', 'success');
    app.startQuiz(newQuizId);
  }

  async shareResult() {
    const qz = this.quiz;
    const shareText = `🎯 I scored ${qz.percentage}% (${qz.correct}/${this.questions.length}) on "${qz.title}" in Hamsa Vidya (हंस विद्या) — AI Wisdom & Quiz Companion!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Hamsa Vidya Quiz Result',
          text: shareText,
          url: window.location.href
        });
        return;
      } catch (e) {
        // Fallback to clipboard
      }
    }

    navigator.clipboard.writeText(shareText);
    app.showToast('Result summary copied to clipboard! 📋', 'success');
  }

  // =========================================================================
  // AI DOUBT SOLVER & CONCEPTUAL TUTOR (हंस विद्या शंका समाधान गुरु)
  // =========================================================================
  openDoubtSolver(questionId) {
    const q = this.questions.find(item => item.id === questionId);
    if (!q) return;

    this.activeDoubtQuestion = q;
    this.doubtHistory = [];
    this.isDoubtDrawerOpen = true;
    this.isDoubtLoading = false;

    const drawer = document.getElementById('doubt-solver-drawer');
    const backdrop = document.getElementById('doubt-solver-backdrop');
    if (drawer && backdrop) {
      drawer.innerHTML = this.renderDoubtDrawerContent();
      drawer.classList.add('active');
      backdrop.classList.add('active');
    }

    if (window.app) window.app.refreshIcons();
    if (window.audioEngine) window.audioEngine.playTabSwitch();

    // Automatically trigger initial deep rationale
    this.askDoubt('deep-rationale');
  }

  closeDoubtSolver() {
    this.isDoubtDrawerOpen = false;
    const drawer = document.getElementById('doubt-solver-drawer');
    const backdrop = document.getElementById('doubt-solver-backdrop');
    if (drawer) drawer.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
  }

  renderDoubtDrawerContent() {
    if (!this.activeDoubtQuestion) {
      return `
        <div class="doubt-drawer-header">
          <div class="doubt-drawer-title-box">
            <i data-lucide="sparkles" style="color:var(--color-gold);"></i>
            <span class="doubt-drawer-title">Hamsa AI Doubt Solver</span>
          </div>
          <button class="icon-btn" onclick="quizResultView.closeDoubtSolver()"><i data-lucide="x"></i></button>
        </div>
        <div class="doubt-messages-container" style="align-items:center; justify-content:center; text-align:center;">
          <p style="color:var(--text-muted);">Please select a question to consult Hamsa AI Guru.</p>
        </div>
      `;
    }

    const q = this.activeDoubtQuestion;
    const qIndex = this.questions.findIndex(item => item.id === q.id) + 1;
    const letters = ['A', 'B', 'C', 'D'];
    const correctLetter = letters[q.correctAnswerIndex] || 'A';
    const correctText = q.options ? q.options[q.correctAnswerIndex] : 'Official Key';
    const isCorrect = q.userSelectedOptionIndex === q.correctAnswerIndex;
    const isSkipped = q.userSelectedOptionIndex === null || q.userSelectedOptionIndex === undefined;
    const userSelectedLetter = !isSkipped ? letters[q.userSelectedOptionIndex] : null;

    return `
      <!-- Drawer Header -->
      <div class="doubt-drawer-header">
        <div class="doubt-drawer-title-box">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--color-primary),var(--color-accent-pink));display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.3);">
            <i data-lucide="sparkles" style="width:18px;height:18px;"></i>
          </div>
          <div>
            <div class="doubt-drawer-title">Hamsa AI Doubt Solver</div>
            <div style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">
              Question #${qIndex} Review • ${this.escapeHtml(this.quiz.subject || 'General Study')}
            </div>
          </div>
        </div>
        <button class="icon-btn" onclick="quizResultView.closeDoubtSolver()" title="Close drawer (ESC)">
          <i data-lucide="x" style="width:20px;height:20px;"></i>
        </button>
      </div>

      <!-- Question Context Banner -->
      <div class="doubt-question-summary-banner">
        <div class="doubt-q-text">
          <strong>Q${qIndex}.</strong> ${this.escapeHtml(q.questionText)}
        </div>
        <div class="doubt-pills-row">
          <span class="badge badge-success">Key: (${correctLetter}) ${this.escapeHtml(correctText)}</span>
          ${isCorrect 
            ? '<span class="badge badge-success">✓ You answered Correctly</span>' 
            : (isSkipped 
                ? '<span class="badge badge-warning">⚪ Skipped in quiz</span>' 
                : `<span class="badge badge-error">✕ Your choice: (${userSelectedLetter}) ${this.escapeHtml(q.options[q.userSelectedOptionIndex])}</span>`)}
        </div>
      </div>

      <!-- Quick Action Prompt Pills -->
      <div class="doubt-action-pills-bar">
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('deep-rationale')">
          🎯 Deep Rationale
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('why-wrong')">
          ❌ Why Others Wrong?
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('analogy')">
          🌍 Real Analogy
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('mnemonic')">
          🧠 Memory Trick
        </button>
      </div>

      <!-- Messages Stream -->
      <div class="doubt-messages-container" id="doubt-messages-list">
        <!-- Initial Welcoming Message -->
        <div class="doubt-msg-bubble ai">
          <div class="doubt-ai-header-row">
            <div class="doubt-ai-avatar-info">
              <i data-lucide="bot" style="width:16px;height:16px;"></i>
              <span>Hamsa AI Guru</span>
            </div>
            <span style="font-size:0.74rem; color:var(--text-muted);">Just now</span>
          </div>
          <div class="doubt-msg-body">
            Namaste! I am here to clarify any doubt regarding <strong>Question #${qIndex}</strong>. 
            Tap any quick button above or type your question below!
          </div>
        </div>

        ${this.doubtHistory.map((msg, idx) => {
          if (msg.role === 'user') {
            return `
              <div class="doubt-msg-bubble user">
                ${this.escapeHtml(msg.text)}
              </div>
            `;
          } else {
            return `
              <div class="doubt-msg-bubble ai">
                <div class="doubt-ai-header-row">
                  <div class="doubt-ai-avatar-info">
                    <i data-lucide="bot" style="width:16px;height:16px;"></i>
                    <span>Hamsa AI Guru</span>
                    ${msg.model ? `<span class="badge badge-muted" style="font-size:0.68rem;padding:0.1rem 0.35rem;">${msg.model}</span>` : ''}
                  </div>
                  <span style="font-size:0.74rem; color:var(--text-muted);">${msg.timestamp || 'Just now'}</span>
                </div>
                <div class="doubt-msg-body">
                  ${this.formatMarkdown(msg.text)}
                </div>
                <div class="doubt-msg-actions">
                  <button class="doubt-action-btn" onclick="quizResultView.copyDoubtText(${idx})" title="Copy explanation text">
                    <i data-lucide="copy" style="width:13px;height:13px;"></i>
                    <span>Copy</span>
                  </button>
                  <button class="doubt-action-btn" onclick="quizResultView.saveDoubtToStudyNotes(${idx})" title="Save to Study Notes digital textbook">
                    <i data-lucide="book-open" style="width:13px;height:13px;color:var(--color-gold);"></i>
                    <span>Save to Study Notes</span>
                  </button>
                </div>
              </div>
            `;
          }
        }).join('')}

        ${this.isDoubtLoading ? `
          <div class="doubt-msg-bubble ai" style="width:fit-content;">
            <div class="doubt-ai-header-row">
              <div class="doubt-ai-avatar-info">
                <i data-lucide="bot" style="width:16px;height:16px;"></i>
                <span>Hamsa AI Guru thinking...</span>
              </div>
            </div>
            <div class="doubt-typing-indicator">
              <div class="doubt-dot"></div>
              <div class="doubt-dot"></div>
              <div class="doubt-dot"></div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Input Bar -->
      <div class="doubt-input-bar">
        <input type="text" id="doubt-custom-input" placeholder="Ask specific doubt in English or Hindi..." autocomplete="off" onkeydown="if(event.key==='Enter') quizResultView.sendCustomDoubt()">
        <button class="doubt-send-btn" onclick="quizResultView.sendCustomDoubt()" title="Send doubt">
          <i data-lucide="send" style="width:17px;height:17px;"></i>
        </button>
      </div>
    `;
  }

  updateDoubtMessagesDom() {
    const listEl = document.getElementById('doubt-messages-list');
    if (!listEl) {
      const drawer = document.getElementById('doubt-solver-drawer');
      if (drawer) drawer.innerHTML = this.renderDoubtDrawerContent();
    } else {
      // Re-render full drawer to maintain prompt pills and header
      const drawer = document.getElementById('doubt-solver-drawer');
      if (drawer) drawer.innerHTML = this.renderDoubtDrawerContent();
    }

    if (window.app) window.app.refreshIcons();

    // Scroll messages to bottom
    setTimeout(() => {
      const msgs = document.getElementById('doubt-messages-list');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  async askDoubt(promptType, customQuery = '') {
    if (!this.activeDoubtQuestion) return;
    const q = this.activeDoubtQuestion;

    let userText = '';
    if (promptType === 'deep-rationale') {
      userText = '🎯 Can you explain the deep concept and step-by-step rationale for this question?';
    } else if (promptType === 'why-wrong') {
      userText = '❌ Why are the other options incorrect or misleading?';
    } else if (promptType === 'analogy') {
      userText = '🌍 Can you explain this concept with an intuitive real-world analogy?';
    } else if (promptType === 'mnemonic') {
      userText = '🧠 What is a memorable trick or mnemonic to never forget this in an exam?';
    } else {
      userText = customQuery || 'Please explain this question.';
    }

    // Add user message
    this.doubtHistory.push({
      role: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    this.isDoubtLoading = true;
    this.updateDoubtMessagesDom();

    try {
      const result = await window.geminiService.solveQuestionDoubt({
        questionText: q.questionText,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex ?? 0,
        userSelectedOptionIndex: q.userSelectedOptionIndex,
        explanation: q.explanation || '',
        subject: this.quiz?.subject || 'General Knowledge',
        studentQuery: userText,
        promptType: promptType,
        conversationHistory: this.doubtHistory.slice(0, -1)
      });

      this.isDoubtLoading = false;
      this.doubtHistory.push({
        role: 'model',
        text: result.text || 'Explanation formulated.',
        model: result.model || 'Hamsa AI Guru',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      console.error('Error solving doubt:', err);
      this.isDoubtLoading = false;
      this.doubtHistory.push({
        role: 'model',
        text: `### ⚠️ Notice\n\nCould not fetch response from live AI: ${err.message}. Please verify your network or Gemini API key in Settings.`,
        model: 'Diagnostic Alert',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }

    this.updateDoubtMessagesDom();
    if (window.audioEngine) window.audioEngine.playTabSwitch();
  }

  sendCustomDoubt() {
    const input = document.getElementById('doubt-custom-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.askDoubt('custom', text);
  }

  copyDoubtText(idx) {
    const msg = this.doubtHistory[idx];
    if (!msg || !msg.text) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg.text);
      app.showToast('Explanation copied to clipboard! 📋', 'success');
    }
  }

  async saveDoubtToStudyNotes(idx) {
    const msg = this.doubtHistory[idx];
    if (!msg || !msg.text || !this.activeDoubtQuestion) return;

    try {
      const q = this.activeDoubtQuestion;
      const title = `AI Explanation: ${q.questionText.substring(0, 45)}...`;
      const cleanContent = msg.text.replace(/###\s*/g, '').replace(/\*\*/g, '');

      await saveNewNote({
        title,
        subject: this.quiz?.subject || 'Exam Concepts',
        description: `Conceptual clarification & deep rationale for Question #${this.questions.indexOf(q) + 1}`,
        content: cleanContent,
        sections: [
          {
            id: 'sec-1',
            heading: 'AI Conceptual Rationale & Analysis',
            subheading: this.quiz?.subject || 'General Study',
            content: msg.text,
            keyPoints: [
              `Official Key: (${['A','B','C','D'][q.correctAnswerIndex]}) ${q.options?.[q.correctAnswerIndex] || ''}`,
              `Core Subject: ${this.quiz?.subject || 'General Study'}`
            ],
            definitions: [],
            importantFacts: [],
            formulas: [],
            examples: [],
            tables: []
          }
        ]
      });

      app.showToast('Saved to Study Notes vault! 📖 You can review it anytime.', 'success');
      if (window.audioEngine) window.audioEngine.playFanfare();
    } catch (err) {
      console.error('Failed to save to notes:', err);
      app.showToast('Failed to save note. Please try again.', 'error');
    }
  }

  formatMarkdown(raw) {
    if (!raw) return '';
    let text = raw;

    // Convert headings ### Title
    text = text.replace(/^###\s+(.+)$/gm, '<h4 class="doubt-h4">$1</h4>');
    text = text.replace(/^##\s+(.+)$/gm, '<h3 class="doubt-h3">$1</h3>');

    // Convert blockquotes > quote
    text = text.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // Convert bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Convert italic *text* or _text_
    text = text.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');

    // Convert list items * item or - item
    text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.+<\/li>\s*)+/g, '<ul>$&</ul>');

    // Convert double newlines to paragraphs
    const paragraphs = text.split(/\n\n+/).map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<block')) return p;
      return `<p>${p}</p>`;
    }).join('');

    return SecurityUtils.sanitizeHtml(paragraphs);
  }

  /** Sanitizes (not strictly escapes) — see the note in app.escapeHtml(). */
  escapeHtml(str) {
    return SecurityUtils.sanitizeHtml(str);
  }
}

window.quizResultView = new QuizResultView();
