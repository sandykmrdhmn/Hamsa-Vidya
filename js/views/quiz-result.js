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
    this._doubtPresetCache = new Map();
    this._doubtCacheVersion = 0;
  }

  async loadResult(quizId, attemptId=null) {
    this.closeDoubtSolver();
    const version=this._loadVersion=(this._loadVersion||0)+1;
    const [data,attempts]=await Promise.all([getQuizAttemptResult(quizId,attemptId),getAttemptsForQuiz(quizId)]);
    if(version!==this._loadVersion || (app.currentView && app.currentView!=='quiz-result')) return;
    this.attempts=attempts;this.reviewPage=0;this._celebrated=false;
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
    const scorePct = Number(qz.percentage) || 0;

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
        return q.userSelectedOptionIndex != null && q.userSelectedOptionIndex !== q.correctAnswerIndex;
      }
      if (this.activeFilter === 'SKIPPED') return q.userSelectedOptionIndex == null;
      if (this.activeFilter === 'CORRECT') return q.userSelectedOptionIndex === q.correctAnswerIndex;
      if (this.activeFilter === 'BOOKMARKED') {
        return Boolean(q.isBookmarked);
      }
      return true;
    });

    const incorrectQuestionsCount = this.questions.filter(q => q.userSelectedOptionIndex != null && q.userSelectedOptionIndex !== q.correctAnswerIndex).length;
    const missedCount=this.questions.filter(q=>q.userSelectedOptionIndex!==q.correctAnswerIndex).length;
    this.reviewPage=Math.min(this.reviewPage||0,Math.max(0,Math.ceil(filteredQuestions.length/10)-1));

    const studentName = (window.examProfileManager && window.examProfileManager.getStudentName()) || 'Scholar';

    this.container.innerHTML = `
      <div class="result-container">
        <!-- Top Summary Hero -->
        <div class="result-hero-card">
          <div class="result-hero-info">
            <div class="grade-badge ${gradeClass}">
              <i data-lucide="award"></i>
              <span>${gradeText} • ${SecurityUtils.escapeHtml(studentName)}</span>
            </div>

            <h1 style="font-size:2rem; font-weight:800; letter-spacing:-0.02em;">
              Performance Assessment
            </h1>

            <div class="result-score-large gradient-text">
              ${scorePct}%
            </div>

            ${hasMarks ? `
              <div class="result-marks-line" style="display:flex; align-items:center; justify-content:center; gap:0.5rem; flex-wrap:wrap; font-size:1.05rem; font-weight:700; margin-top:-0.35rem;">
                <span style="color:var(--text-main);">${Number(qz.marksObtained)||0} / ${Number(qz.maxMarks)||0} marks</span>
                ${penaltyApplied ? `
                  <span style="font-size:0.85rem; font-weight:600; color:var(--color-error); background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); padding:0.15rem 0.5rem; border-radius:var(--radius-full);"
                        title="${Number(qz.incorrect)||0} wrong × ${Number(qz.negativeMarkPerWrong)||0} marks deducted">
                    −${Number(qz.marksLostToNegative)||0} negative marking
                  </span>
                ` : ''}
              </div>
            ` : ''}

            <div class="result-stats-row">
              <div><strong>${Number(qz.correct)||0}</strong> Correct</div>
              <div>•</div>
              <div><strong>${Number(qz.incorrect)||0}</strong> Incorrect</div>
              <div>•</div>
              <div><strong>${Number(qz.skipped)||0}</strong> Skipped</div>
              ${qz.accuracy != null ? `
                <div>•</div>
                <div><strong>${Number(qz.accuracy)||0}%</strong> Accuracy <span style="color:var(--text-muted); font-size:0.8rem;">(of attempted)</span></div>
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
                Printable quiz & answer key
              </div>
              <div style="font-size:0.85rem; color:var(--text-secondary);">
                Choose the content, then use Save as PDF in print preview.
              </div>
            </div>
          </div>

          <button class="btn btn-primary" onclick="quizResultView.exportPaper('FULL')">
            <i data-lucide="download"></i>
            <span>Full PDF</span>
          </button>
        </div>

        <div class="quiz-button-row"><button class="btn btn-secondary btn-sm" onclick="quizResultView.exportPaper('QUESTIONS')">Questions only</button><button class="btn btn-secondary btn-sm" onclick="quizResultView.exportPaper('ANSWER_KEY')">Answer key only</button></div>
        ${this.renderLearningSummary()}
        ${QuizQuality.skippedPdfNote(qz.skippedPdfPages)?`<p class="quiz-notice">${SecurityUtils.escapeHtml(QuizQuality.skippedPdfNote(qz.skippedPdfPages))}</p>`:''}
        <!-- Result Action Bar -->
        <div class="result-actions-bar">
          ${missedCount > 0 ? `
            <button class="btn btn-primary" onclick="quizResultView.reattemptMissed()">
              <i data-lucide="refresh-cw"></i>
              <span>Re-attempt Missed Questions (${missedCount})</span>
            </button>
          ` : ''}

          <button class="btn btn-secondary" onclick="app.startQuiz(${Number(qz.id)})">
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
              <button class="review-tab-btn ${this.activeFilter==='CORRECT'?'active':''}" onclick="quizResultView.setFilter('CORRECT')">Correct</button>
              <button class="review-tab-btn ${this.activeFilter==='SKIPPED'?'active':''}" onclick="quizResultView.setFilter('SKIPPED')">Skipped (${this.questions.filter(q=>q.userSelectedOptionIndex==null).length})</button>
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
            ` : filteredQuestions.slice(this.reviewPage*10,this.reviewPage*10+10).map((q, idx) => {
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
                      ${q.sourcePage ? `<span class="badge badge-muted">Page ${Number(q.sourcePage)}</span>` : ''}
                    </div>

                    <button class="bookmark-toggle-btn ${q.isBookmarked ? 'bookmarked' : ''}" 
                      onclick="quizResultView.toggleReviewBookmark(${Number(q.id)})" ${q.bookmarkUnavailable?'disabled':''}
                      title="${q.isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}">
                      <i data-lucide="bookmark" style="width:18px;height:18px; ${q.isBookmarked ? 'fill:currentColor;' : ''}"></i>
                    </button>
                  </div>

                  <div style="font-size:1.08rem; font-weight:700; color:var(--text-main);">
                    Q${this.questions.indexOf(q) + 1}. ${QuizQuality.format(q.questionText)}
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
                          <span style="flex:1;">${QuizQuality.format(opt)}</span>
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
                      <details class="quiz-reasoning" open><summary>Reasoning & worked steps</summary>${QuizQuality.format(q.explanation)}</details>
                      ${(q.optionExplanations||[]).some(Boolean)?`<details class="quiz-option-reasons"><summary>Why each option works or fails</summary>${q.optionExplanations.map((reason,i)=>reason?`<div class="quiz-option-reason"><b>${'ABCD'[i]}:</b> ${QuizQuality.format(reason)}</div>`:'').join('')}</details>`:''}
                      ${q.memoryCue?`<div class="quiz-memory"><b>Memory cue:</b> ${QuizQuality.format(q.memoryCue)}</div>`:''}
                      ${q.evidenceQuote?`<button type="button" class="btn btn-secondary btn-sm" onclick="quizSourceView.open(quizResultView.quiz,quizResultView.questions.find(q=>q.id===${Number(q.id)}))">Open original source</button><details><summary>Source evidence${q.sourcePage?` · Page ${Number(q.sourcePage)}`:''}</summary><blockquote>${SecurityUtils.escapeHtml(q.evidenceQuote)}</blockquote></details>`:''}
                      ${q.keyEvidenceQuote?`<button type="button" class="btn btn-secondary btn-sm" onclick="quizSourceView.open(quizResultView.quiz,quizResultView.questions.find(q=>q.id===${Number(q.id)}),'key')">Open printed key page</button><details><summary>Printed source key · Page ${Number(q.keySourcePage)}</summary><blockquote>${SecurityUtils.escapeHtml(q.keyEvidenceQuote)}</blockquote></details>`:''}<small>${q.answerOrigin==='SOURCE_KEY'?'Imported source key':q.answerOrigin==='STUDENT_EDITED'?'Student edited':q.aiReviewed?'AI reviewed':'Review against your source'}${q.sourceMatched?' · Source text matched':''}</small>
                    </div>
                  </div>

                  <button class="btn btn-secondary btn-sm" onclick="quizResultView.openQuestionEditor(${Number(q.id)})" ${q.bookmarkUnavailable?'disabled':''}>Report / correct question</button>
                  <!-- AI Doubt Solver Trigger -->
                  <div class="doubt-solver-trigger-row" style="margin-top:0.75rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                    <button type="button" class="btn-doubt-solver" onclick="quizResultView.openDoubtSolver(${Number(q.id)})">
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

        <div class="quiz-pagination"><button class="btn btn-secondary btn-sm" ${this.reviewPage===0?'disabled':''} onclick="quizResultView.reviewPage--;quizResultView.render()">Previous</button><span>Review ${this.reviewPage+1} / ${Math.max(1,Math.ceil(filteredQuestions.length/10))}</span><button class="btn btn-secondary btn-sm" ${(this.reviewPage+1)*10>=filteredQuestions.length?'disabled':''} onclick="quizResultView.reviewPage++;quizResultView.render()">Next</button></div>
        <!-- AI Doubt Solver Drawer & Backdrop -->
        <div class="doubt-solver-backdrop ${this.isDoubtDrawerOpen ? 'active' : ''}" id="doubt-solver-backdrop" onclick="quizResultView.closeDoubtSolver()"></div>
        <aside class="doubt-solver-drawer ${this.isDoubtDrawerOpen ? 'active' : ''}" id="doubt-solver-drawer" role="dialog" aria-modal="true" aria-label="AI Doubt Solver" aria-hidden="${!this.isDoubtDrawerOpen}">
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

    this._bindDoubtKeyboard();
    if(this.isDoubtDrawerOpen) document.querySelector('#doubt-solver-drawer button')?.focus();
    if(this._celebrated) return;
    this._celebrated=true;
    // Trigger celebratory fanfare audio & confetti for good scores
    if (window.audioEngine) {
      if (scorePct >= 60) {
        window.audioEngine.playFanfare();
      } else {
        window.audioEngine.playTabSwitch();
      }
    }

    if (scorePct >= 60) {
      this._confettiDelay=setTimeout(() => this.triggerConfetti(), 300);
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
        this._confettiFrame=requestAnimationFrame(render);
      } else {
        canvas.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    render();
  }

  setFilter(filter) {
    this.activeFilter = filter;
    this.reviewPage=0;
    this.render();
  }

  async toggleReviewBookmark(qId) {
    const q = this.questions.find(item => item.id === qId);
    if (!q || q.bookmarkUnavailable) return;

    if(this._bookmarkPending) return;
    this._bookmarkPending=true;const previous=q.isBookmarked;q.isBookmarked=!previous;
    try {await updateQuestionBookmark(qId,q.isBookmarked);app.showToast(q.isBookmarked?'Question bookmarked':'Bookmark removed','info');}
    catch(error) {q.isBookmarked=previous;app.showToast('Bookmark could not be saved.','error');}
    finally {this._bookmarkPending=false;this.render();}
  }

  // Re-attempt only the missed questions
  async reattemptMissed() {
    if(this._drillPending) return;
    const missed = this.questions.filter(q => q.userSelectedOptionIndex !== q.correctAnswerIndex);
    if (!missed.length) return app.showToast('No missed questions in this review.', 'info');
    this._drillPending=true;
    const quiz=this.quiz, version=this._loadVersion;
    const buttons=[...this.container.querySelectorAll('button')].filter(b=>b.getAttribute('onclick')?.includes('reattemptMissed'));
    buttons.forEach(b=>b.disabled=true);
    try {
      const live = await Promise.all(missed.map(q=>getQuizQuestion(q.originalQuestionId||q.id)));
      const questions=live.filter(q=>q && Number(q.quizId)===Number(quiz.id) && !q.reviewIssue && !QuizQuality.validate(q));
      const excluded=missed.length-questions.length;
      if(!questions.length) return app.showToast('Missed questions are deleted, invalid or flagged. Correct them in the library before creating a drill.','warning');
      const newQuizId=await saveNewQuiz({title:`${quiz.title} (Missed Drill)`,subject:quiz.subject,difficulty:quiz.difficulty,quizMode:'PRACTICE',language:quiz.language,sourceType:quiz.sourceType,sourceTitle:quiz.sourceTitle,originalSource:quiz.originalSource,skippedPdfPages:quiz.skippedPdfPages},questions);
      app.showToast(`Drill saved using current corrected questions.${excluded?` ${excluded} deleted, invalid or flagged questions excluded.`:''}`,'success');
      if(version===this._loadVersion && (!app.currentView || app.currentView==='quiz-result') && this.quiz===quiz) app.startQuiz(newQuizId);
    } catch(error) {app.showToast(`Could not create drill: ${error.message}. Please retry.`,'error');}
    finally {this._drillPending=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
  }

  async shareResult() {
    const qz = this.quiz;
    const shareText = `🎯 I scored ${qz.percentage}% (${Number(qz.correct)||0}/${Number(qz.totalQuestions)||this.questions.length}) on "${qz.title}" in Hamsa Vidya (हंस विद्या) — AI Wisdom & Quiz Companion!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Hamsa Vidya Quiz Result',
          text: shareText,
          url: window.location.href
        });
        return;
      } catch (e) {
        if(e.name==='AbortError') return;
        // Fallback to clipboard
      }
    }

    try {await navigator.clipboard.writeText(shareText);app.showToast('Result summary copied.','success');} catch {app.showToast('Clipboard unavailable. Use your browser share menu.','error');}
  }

  // =========================================================================
  // AI DOUBT SOLVER & CONCEPTUAL TUTOR (हंस विद्या शंका समाधान गुरु)
  // =========================================================================
  openDoubtSolver(questionId) {
    const q = this.questions.find(item => item.id === questionId);
    if (!q) return;

    this.closeDoubtSolver();
    this._doubtReturnFocus=document.activeElement;
    this.activeDoubtQuestion = q;
    this.doubtHistory = [];
    this.isDoubtDrawerOpen = true;
    this.isDoubtLoading = false;

    const drawer = document.getElementById('doubt-solver-drawer');
    const backdrop = document.getElementById('doubt-solver-backdrop');
    if (drawer && backdrop) {
      drawer.innerHTML = this.renderDoubtDrawerContent();
      drawer.classList.add('active');
      drawer.setAttribute('aria-hidden','false');
      drawer.querySelector('button')?.focus();
      backdrop.classList.add('active');
    }

    if (window.app) window.app.refreshIcons();
    if (window.audioEngine) window.audioEngine.playTabSwitch();

    this._bindDoubtKeyboard();
    // Opening a saved review never starts a new AI request.
    // Focus after the opening transition has replaced controls.
    clearTimeout(this._doubtFocusTimer);
    this._doubtFocusTimer=setTimeout(()=>{if(this.isDoubtDrawerOpen && this.activeDoubtQuestion===q && !document.getElementById('doubt-solver-drawer')?.contains(document.activeElement))document.querySelector('#doubt-solver-drawer button:not([disabled])')?.focus();},0);
  }

  _bindDoubtKeyboard() {
    const drawer=document.getElementById('doubt-solver-drawer');if(!drawer)return;
    if(this._boundDrawer && this._drawerKeydown)this._boundDrawer.removeEventListener('keydown',this._drawerKeydown);
    this._drawerKeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();this.closeDoubtSolver();}
      if(event.key==='Tab') {
        const controls=[...drawer.querySelectorAll('button:not([disabled]),input:not([disabled])')],first=controls[0],last=controls.at(-1);
        if(!drawer.contains(document.activeElement) || (event.shiftKey && document.activeElement===first)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    drawer.addEventListener('keydown',this._drawerKeydown);this._boundDrawer=drawer;
  }
  closeDoubtSolver() {
    this.isDoubtDrawerOpen = false;
    clearTimeout(this._doubtFocusTimer);
    this._doubtVersion=(this._doubtVersion||0)+1;
    this._doubtController?.abort();this.isDoubtLoading=false;
    const drawer = document.getElementById('doubt-solver-drawer');
    const backdrop = document.getElementById('doubt-solver-backdrop');
    if (drawer) {drawer.classList.remove('active');drawer.setAttribute('aria-hidden','true');drawer.removeEventListener('keydown',this._drawerKeydown);}
    if(this._doubtReturnFocus?.isConnected) this._doubtReturnFocus.focus();
    if (backdrop) backdrop.classList.remove('active');
  }

  doubtPresetKey(question, promptType) {
    if (!['deep-rationale', 'why-wrong', 'analogy', 'mnemonic'].includes(promptType)) return null;
    const prefs = window.studyPreferences?.get() || {};
    const language = this.quiz?.language || 'AUTO';
    return JSON.stringify([this._doubtCacheVersion, this.quiz?.id, this.quiz?.attemptId, question.id,
      question.questionText, question.options, question.correctAnswerIndex, question.userSelectedOptionIndex,
      question.explanation, question.optionExplanations, question.memoryCue, question.evidenceQuote,
      question.sourcePage, question.keyEvidenceQuote, question.reviewIssue, question.answerOrigin,
      question.updatedAt, this.quiz?.subject, promptType, language === 'AUTO' ? prefs.language || 'AUTO' : language,
      prefs.level || 'AUTO', prefs.depth || 'AUTO', window.geminiService?.getActiveModel?.() || '']);
  }

  invalidateDoubtCache() {
    this._doubtCacheVersion++;
    this._doubtPresetCache.clear();
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
    const correctLetter = letters[q.correctAnswerIndex] || '?';
    const correctText = q.options ? q.options[q.correctAnswerIndex] : 'Saved key';
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
          🎯 Ask AI: More detail
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('why-wrong')">
          ❌ Ask AI: Other options
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('analogy')">
          🌍 Ask AI: Analogy
        </button>
        <button class="doubt-action-pill" onclick="quizResultView.askDoubt('mnemonic')">
          🧠 Ask AI: Memory trick
        </button>
      </div>

      <!-- Messages Stream -->
      <div class="doubt-messages-container" id="doubt-messages-list">
        <!-- Saved reasoning is immediately available without an AI request. -->
        <div class="doubt-msg-bubble ai">
          <div class="doubt-ai-header-row">
            <div class="doubt-ai-avatar-info">
              <i data-lucide="bot" style="width:16px;height:16px;"></i>
              <span>${q.aiReviewed ? 'Saved reviewed explanation' : 'Saved explanation'}</span>
            </div>
          </div>
          <div class="doubt-msg-body">
            ${q.reviewIssue ? '<p class="quiz-notice">This question is flagged for review. Verify its answer key.</p>' : ''}
            ${this.formatMarkdown(q.explanation || 'A detailed explanation was not saved for this question.')}
            ${(q.optionExplanations || []).some(Boolean) ? `<h4 class="doubt-h4">Saved option reasoning</h4>${q.optionExplanations.map((reason, i) => reason ? `<div class="quiz-option-reason"><strong>${letters[i] || i + 1}:</strong> ${this.formatMarkdown(reason)}</div>` : '').join('')}` : ''}
            ${q.memoryCue ? `<h4 class="doubt-h4">Saved memory cue</h4>${this.formatMarkdown(q.memoryCue)}` : ''}
            <p>Choose an Ask AI button or type a follow-up for an additional explanation.</p>
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
                    ${msg.model ? `<span class="badge badge-muted" style="font-size:0.68rem;padding:0.1rem 0.35rem;">${this.escapeHtml(msg.model)}</span>` : ''}
                  </div>
                  <span style="font-size:0.74rem; color:var(--text-muted);">${msg.timestamp || 'Just now'}</span>
                </div>
                <div class="doubt-msg-body">
                  ${msg.note?`<p class="quiz-notice">${this.escapeHtml(msg.note)}</p>`:''}${this.formatMarkdown(msg.text)}
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
        <input type="text" id="doubt-custom-input" value="${this.escapeHtml(this.doubtDraft||'')}" oninput="quizResultView.doubtDraft=this.value" placeholder="Ask specific doubt in English or Hindi..." autocomplete="off" onkeydown="if(event.key==='Enter') quizResultView.sendCustomDoubt()">
        <button class="doubt-send-btn" onclick="quizResultView.sendCustomDoubt()" title="Send doubt">
          <i data-lucide="send" style="width:17px;height:17px;"></i>
        </button>
      </div>
    `;
  }

  updateDoubtMessagesDom() {
    if(!this.isDoubtDrawerOpen) return;
    const input=document.getElementById('doubt-custom-input');if(input) this.doubtDraft=input.value;
    const drawerBefore=document.getElementById('doubt-solver-drawer'),active=document.activeElement;
    const hadFocus=drawerBefore?.contains(active),focusIndex=[...(drawerBefore?.querySelectorAll('button,input')||[])].indexOf(active);
    const focused=active?.id;const start=input?.selectionStart,end=input?.selectionEnd;
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

    const newInput=document.getElementById('doubt-custom-input');if(focused==='doubt-custom-input'){newInput?.focus();newInput?.setSelectionRange(start,end);}
    document.querySelectorAll('#doubt-solver-drawer .doubt-action-pill,#doubt-solver-drawer .doubt-send-btn').forEach(button=>button.disabled=this.isDoubtLoading);
    if(hadFocus && focused!=='doubt-custom-input'){const controls=[...document.querySelectorAll('#doubt-solver-drawer button,#doubt-solver-drawer input')];const target=controls[focusIndex];(target&&!target.disabled?target:controls.find(el=>!el.disabled))?.focus();}
    this._bindDoubtKeyboard();
    if(document.activeElement===document.body)document.querySelector('#doubt-solver-drawer button:not([disabled])')?.focus();
    // Scroll messages to bottom
    setTimeout(() => {
      const msgs = document.getElementById('doubt-messages-list');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  async askDoubt(promptType, customQuery = '') {
    if (!this.activeDoubtQuestion || !this.isDoubtDrawerOpen || this.isDoubtLoading) return;
    const q = this.activeDoubtQuestion;
    const version=this._doubtVersion=(this._doubtVersion||0)+1;
    this._doubtController=new AbortController();const signal=this._doubtController.signal;

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
      const cacheKey = this.doubtPresetKey(q, promptType);
      const cached = cacheKey && this._doubtPresetCache.get(cacheKey);
      // Presets are self-contained; custom follow-ups retain the conversation.
      const result = cached || await window.geminiService.solveQuestionDoubt({
        questionText: q.questionText,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex ?? -1,
        userSelectedOptionIndex: q.userSelectedOptionIndex,
        explanation: q.explanation || '',
        subject: this.quiz?.subject || 'General Knowledge',
        studentQuery: userText,
        promptType: promptType,
        conversationHistory: cacheKey ? [] : this.doubtHistory.slice(0, -1),signal,language:this.quiz.language,evidenceQuote:q.evidenceQuote,optionExplanations:q.optionExplanations,memoryCue:q.memoryCue
      });

      if(signal.aborted || version!==this._doubtVersion || this.activeDoubtQuestion!==q) return;
      if (cacheKey && cacheKey === this.doubtPresetKey(q, promptType) && result.success === true && result.isFallback === false && typeof result.text === 'string' && result.text.trim() && result.text.length <= 32768) {
        this._doubtPresetCache.delete(cacheKey);
        this._doubtPresetCache.set(cacheKey, {success:true,isFallback:false,text:result.text,model:result.model,note:result.note || ''});
        while (this._doubtPresetCache.size > 24) this._doubtPresetCache.delete(this._doubtPresetCache.keys().next().value);
      }
      this.isDoubtLoading = false;
      this.doubtHistory.push({
        role: 'model',
        text: result.text || 'Explanation formulated.',
        model: result.model || 'Hamsa AI Guru',
        note:cached ? 'Reused your earlier AI explanation.' : result.note||'',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      if(signal.aborted || version!==this._doubtVersion || err.name==='AbortError') return;
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
    if (!input || this.isDoubtLoading) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';this.doubtDraft='';
    this.askDoubt('custom', text);
  }

  async copyDoubtText(idx) {
    const msg=this.doubtHistory[idx];if(!msg?.text) return;
    try {await navigator.clipboard.writeText(msg.text);app.showToast('Explanation copied.','success');}catch{app.showToast('Clipboard unavailable. Select and copy the explanation.','error');}
  }

  async saveDoubtToStudyNotes(idx) {
    const msg = this.doubtHistory[idx];
    if (!msg || !msg.text || !this.activeDoubtQuestion || this._noteSavePending) return;
    this._noteSavePending=true;

    try {
      const q = this.activeDoubtQuestion;
      const title = `AI Explanation: ${q.questionText.substring(0, 45)}...`;
      const provenance=[`Explanation model: ${msg.model||'Unknown'}`,msg.note||'',q.reviewIssue?'Question is flagged for review; verify its key.':'',q.sourcePage?`Source: ${this.quiz.sourceTitle||'PDF'} · Page ${q.sourcePage}`:'',q.keySourcePage?`Printed key page: ${q.keySourcePage}`:'',q.evidenceQuote?`Source evidence: ${q.evidenceQuote}`:''].filter(Boolean).join('\n');
      const content=`${provenance}\n\n${msg.text}`;
      const cleanContent=content.replace(/###\s*/g,'').replace(/\*\*/g,'');

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
            content,
            provenance:{model:msg.model||null,note:msg.note||'',sourcePage:q.sourcePage||null,keySourcePage:q.keySourcePage||null,evidenceQuote:q.evidenceQuote||'',answerOrigin:q.answerOrigin||null},
            keyPoints: [
              `Saved key: (${['A','B','C','D'][q.correctAnswerIndex]}) ${q.options?.[q.correctAnswerIndex] || ''}`,
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
    } finally {this._noteSavePending=false;}
  }

  renderLearningSummary() {
    const e=SecurityUtils.escapeHtml,quiz=this.quiz,attempts=this.attempts||[];
    const current=attempts.find(a=>a.id===quiz.attemptId)||attempts[0];
    const previous=current?attempts.find(a=>a.attemptNumber<current.attemptNumber):null;
    const topics=new Map();for(const q of this.questions){const key=q.topic||quiz.subject||'General';const stat=topics.get(key)||{total:0,correct:0,skipped:0};stat.total++;if(q.userSelectedOptionIndex==null) stat.skipped++;else if(q.userSelectedOptionIndex===q.correctAnswerIndex) stat.correct++;topics.set(key,stat);}
    const list=[...topics].sort((a,b)=>a[1].correct/a[1].total-b[1].correct/b[1].total);
    return `<div class="glass-panel quiz-learning-summary">${QuizQuality.distributionHtml(this.questions)}${quiz.legacySnapshotMissing?'<p class="quiz-notice">This older attempt has no saved answer snapshot. Its score is available; question review cannot be reconstructed.</p>':''}${quiz.invalidSnapshotCount?`<p class="quiz-notice">${Number(quiz.invalidSnapshotCount)} malformed saved questions could not be reviewed.</p>`:''}${attempts.length?`<label>Attempt<select onchange="app.viewQuizResult(${Number(quiz.id)},true,Number(this.value))">${attempts.map(a=>`<option value="${Number(a.id)}" ${a.id===current?.id?'selected':''}>Attempt ${a.attemptNumber} · ${Number(a.percentage)||0}% · ${e(new Date(a.attemptedAt).toLocaleString())}</option>`).join('')}</select></label><p>Best: ${Math.max(...attempts.map(a=>Number(a.percentage)||0))}%${previous?` · Change from previous: ${(Number(quiz.percentage)-Number(previous.percentage)).toFixed(1)} percentage points`:''}</p>`:''}${list.length?`<details><summary>Topic performance & revision priorities</summary><div class="quiz-topic-list">${list.map(([topic,s])=>`<div><strong>${e(topic)}</strong><span>${s.correct}/${s.total} correct · ${s.skipped} skipped</span></div>`).join('')}</div></details>`:''}</div>`;
  }
  exportPaper(variant) {
    const printWindow=window.open('','_blank');if(!printWindow) return app.showToast('Allow pop-ups to open PDF preview.','warning');
    pdfGenerator.generateQuestionPaperPdf(this.quiz,this.questions,{variant,printWindow}).catch(error=>{printWindow.close();app.showToast(`Export failed: ${error.message}`,'error');});
  }
  async openQuestionEditor(id) {
    const original=this.questions.find(item=>item.id===id);if(!original || original.bookmarkUnavailable) return;
    if(this._editorLoading) return;
    this._editorLoading=true;const version=this._loadVersion;
    let q;
    try {q=await getQuizQuestion(id);}catch(error){app.showToast(`Could not load question: ${error.message}`,'error');return;}finally{this._editorLoading=false;}
    if(version!==this._loadVersion || (app.currentView && app.currentView!=='quiz-result')) return;
    if(!q) return app.showToast('Question no longer exists in the library.','error');
    q=window.QuizQuality?.normalize({...q,explanation:q.explanation||'No detailed explanation was saved.'}) || {...q,options:Array.isArray(q.options)?q.options:Object.values(q.options||{}),correctAnswerIndex:-1};
    const editorOptions=[2,4].includes(q.options?.length)?q.options:Array.from({length:4},(_,i)=>q.options?.[i]||'');
    const e=SecurityUtils.escapeHtml,dialog=document.createElement('dialog');dialog.className='quiz-edit-dialog';
    dialog.innerHTML=`<form><h2>Report / correct question</h2><p>Corrections apply to future attempts. This completed attempt stays unchanged.</p><label>Question<textarea name="questionText" required>${e(q.questionText)}</textarea></label>${editorOptions.map((opt,i)=>`<label>Option ${'ABCD'[i]}<input name="option${i}" value="${e(opt)}" required></label>`).join('')}<label>Correct answer<select name="answer" required>${q.correctAnswerIndex<0?'<option value="" disabled selected>Choose a verified answer</option>':''}${editorOptions.map((_,i)=>`<option value="${i}" ${i===q.correctAnswerIndex?'selected':''}>${'ABCD'[i]}</option>`).join('')}</select></label><label>Explanation<textarea name="explanation" required>${e(q.explanation)}</textarea></label><label><input type="checkbox" name="issue" ${q.reviewIssue?'checked':''}> Flag as needing further review</label><p class="quiz-edit-error" role="alert"></p><div class="quiz-button-row"><button type="submit" class="btn btn-primary">Save correction / flag</button><button type="button" class="btn btn-secondary" onclick="this.closest('dialog').close()">Cancel</button></div></form>`;
    document.body.append(dialog);const focus=document.activeElement;
    dialog.onclose=()=>{dialog.remove();focus?.focus();};dialog.showModal();
    dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,fields=new FormData(form);if(fields.get('answer')===''){dialog.querySelector('[role="alert"]').textContent='Choose a verified answer key.';return;}const changes={questionText:fields.get('questionText'),options:editorOptions.map((_,i)=>fields.get(`option${i}`)),correctAnswerIndex:Number(fields.get('answer')),explanation:fields.get('explanation'),reviewIssue:fields.get('issue')==='on',optionExplanations:[],memoryCue:''};
      const error=QuizQuality.validate(changes);if(error){dialog.querySelector('[role="alert"]').textContent=error;return;}
      const button=form.querySelector('[type="submit"]');button.disabled=true;
      try{await updateQuizQuestion(id,changes);this.invalidateDoubtCache();dialog.close();app.showToast(changes.reviewIssue?'Question flagged in your library for review.':'Correction saved for future attempts.','success');}catch(error){dialog.querySelector('[role="alert"]').textContent=error.message;button.disabled=false;}
    };
  }
  onLeaveView() {window.quizSourceView?.close();this._loadVersion=(this._loadVersion||0)+1;this.closeDoubtSolver();clearTimeout(this._confettiDelay);cancelAnimationFrame(this._confettiFrame||0);const canvas=document.getElementById('confetti-canvas');if(canvas) canvas.style.display='none';document.querySelector('.quiz-edit-dialog')?.close();}

  formatMarkdown(raw) {
    if (!raw) return '';
    let text = this.escapeHtml(raw);

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

  /** Escape all plain text before inserting it into HTML. */
  escapeHtml(str) {
    return SecurityUtils.escapeHtml(str);
  }
}

window.quizResultView = new QuizResultView();
