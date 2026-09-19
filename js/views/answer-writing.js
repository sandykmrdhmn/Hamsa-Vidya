/**
 * HAMSA VIDYA (हंस विद्या) — Answer Writing View Controller (100x Pro Studio)
 * Complete AI-Powered Competitive Exam Answer Writing, OCR Ingestion,
 * UPSC Exam Countdown Timer, Multi-Dimensional Evaluation & Personalized AI Tutor Studio
 */

class AnswerWritingView {
  constructor() {
    this.container = document.getElementById('view-answer-writing');
    this.activeTab = 'new-answer'; // 'new-answer', 'practice', 'history', 'performance'
    this.inputMode = 'TYPE'; // 'TYPE' or 'UPLOAD'

    // Active Question State
    this.activeQuestion = null;
    this.studentAnswerText = '';
    this.uploadedFiles = [];
    this.extractedAnswerText = '';
    this.inputSource = 'TYPED'; // 'TYPED', 'IMAGE', 'PDF'
    this.ocrConfidence = null;
    this.inPreReview = false;

    // Exam Stopwatch / Timer State
    this.timerDuration = 7 * 60; // 7 minutes default (UPSC 10-marker standard)
    this.timerRemaining = this.timerDuration;
    this.timerIsRunning = false;
    this.timerInterval = null;

    // Fullscreen / Zen Writing Mode
    this.isFullscreenMode = false;

    // Evaluation State
    this.currentEvaluation = null;
    this.currentAttemptId = null;
    this.isEvaluating = false;
    this.evaluationProgressMessage = 'Reading question & guidelines...';
    this.evalLanguageMode = 'BILINGUAL'; // 'BILINGUAL', 'ENGLISH', 'HINDI'
    this.showVisualDiagram = true;
    this.activeView = 'AUTO'; // 'AUTO' (shows panoramic eval when evaluated) or 'STUDIO' (forces writing center)
    this.brainstormingNotes = '';

    // Tutor Chat State
    this.tutorChatHistory = [];
    this.isTutorResponding = false;

    // Filter & History State
    this.historyFilterSubject = 'ALL';
    this.historyFilterExam = 'ALL';
    this.searchHistoryQuery = '';

    // Auto-save timer
    this._autoSaveTimer = null;

    // High-Yield Quick UPSC Question Presets
    this.quickInspirationTopics = [
      {
        title: "Judicial Activism vs Restraint",
        question: "Critically examine the concept of Judicial Activism in India. Has the Supreme Court effectively safeguarded fundamental rights without transgressing parliamentary boundaries?",
        directive: "Critically Examine",
        subject: "Polity & Governance",
        exam: "UPSC",
        difficulty: "DIFFICULT",
        wordLimit: 150,
        marks: 10
      },
      {
        title: "Indian Monsoon & Agrarian Economy",
        question: "Discuss the role of the Indian monsoon in shaping India's agricultural economy and macroeconomic stability. What adaptive strategies can mitigate climate change vulnerabilities?",
        directive: "Discuss",
        subject: "Geography & Economy",
        exam: "UPSC",
        difficulty: "MODERATE",
        wordLimit: 150,
        marks: 10
      },
      {
        title: "Basic Structure Doctrine",
        question: "Examine how the Basic Structure Doctrine evolved from Kesavananda Bharati to Minerva Mills. Does it balance constitutional supremacy with parliamentary democracy?",
        directive: "Examine",
        subject: "Polity & Constitution",
        exam: "UPSC",
        difficulty: "DIFFICULT",
        wordLimit: 250,
        marks: 15
      },
      {
        title: "Federalism vs Centralization",
        question: "Analyze the emerging friction between cooperative federalism and fiscal centralization in India, particularly in the context of GST compensation and centrally sponsored schemes.",
        directive: "Analyze",
        subject: "Polity & Governance",
        exam: "UPSC",
        difficulty: "MODERATE",
        wordLimit: 150,
        marks: 10
      },
      {
        title: "Make in India & Manufacturing",
        question: "Evaluate the structural bottlenecks hindering India's manufacturing sector despite Production Linked Incentive (PLI) schemes. Suggest a roadmap for job-rich industrial growth.",
        directive: "Evaluate",
        subject: "Indian Economy",
        exam: "UPSC",
        difficulty: "MODERATE",
        wordLimit: 150,
        marks: 10
      },
      {
        title: "Indo-Pacific & Strategic Autonomy",
        question: "Elucidate the strategic significance of the Indo-Pacific construct for India. How does India balance its strategic autonomy amidst intensifying great power contestation?",
        directive: "Elucidate",
        subject: "International Relations",
        exam: "UPSC",
        difficulty: "MODERATE",
        wordLimit: 250,
        marks: 15
      },
      {
        title: "Civil Services Neutrality (Ethics)",
        question: "Discuss the ethical dilemmas faced by civil servants in upholding political neutrality while ensuring timely implementation of government policies. Illustrate with examples.",
        directive: "Discuss",
        subject: "Ethics & Integrity",
        exam: "UPSC",
        difficulty: "ADVANCED",
        wordLimit: 150,
        marks: 10
      },
      {
        title: "AI in Public Healthcare",
        question: "Examine the potential and ethical challenges of deploying Artificial Intelligence in India's primary and secondary healthcare ecosystems.",
        directive: "Examine",
        subject: "Science & Technology",
        exam: "State PSC",
        difficulty: "MODERATE",
        wordLimit: 150,
        marks: 10
      }
    ];
  }

  renderMarkdown(text) {
    if (!text) return '';
    try {
      if (window.marked && window.SecurityUtils && window.SecurityUtils.sanitizeHtml) {
        // marked.parse handles headings, lists, bold, etc.
        // We sanitize it immediately to prevent XSS
        return window.SecurityUtils.sanitizeHtml(window.marked.parse(text));
      }
      return SecurityUtils.escapeHtml(text);
    } catch(e) {
      return SecurityUtils.escapeHtml(text);
    }
  }

  toggleFlowchart() {
    const textView = document.getElementById('aw-structure-text-view');
    const flowView = document.getElementById('aw-structure-flowchart-view');
    if (textView && flowView) {
      if (textView.style.display === 'none') {
        textView.style.display = 'grid';
        flowView.style.display = 'none';
        lucide.createIcons();
      } else {
        textView.style.display = 'none';
        flowView.style.display = 'block';
        lucide.createIcons();
      }
    }
  }

  async render(params = {}) {
    this.container = document.getElementById('view-answer-writing');
    if (!this.container) return;

    if (params.tab) {
      this.activeTab = params.tab;
    }

    if (params.id) {
      const attempt = await getAnswerAttemptById(Number(params.id));
      if (attempt) {
        this.loadExistingAttempt(attempt);
        return;
      }
    }

    if (!this.activeQuestion) {
      await this.initDefaultQuestionOrDraft();
    }

    // Aggregate stats were previously only read inside the Performance tab, so
    // the landing view showed no evidence of past work. Hoisted here for the
    // hero counters; best-effort, because a banner must never block the view.
    let awStats = { totalAttempted: 0, totalEvaluated: 0, averageScore: 0, complianceRate: 0 };
    try {
      if (typeof getAnswerWritingStats === 'function') {
        awStats = await getAnswerWritingStats();
      }
    } catch (e) {
      console.warn('Answer Writing hero stats unavailable:', e);
    }

    const heroHtml = UIUtils.buildViewHero({
      accent: 'pink',
      icon: 'pen-tool',
      eyebrow: 'Mains Answer Studio',
      title: 'Write like the exam',
      titleAccent: 'demands.',
      hindi: 'उत्तर लेखन — मुख्य परीक्षा अभ्यास एवं मूल्यांकन',
      tagline: 'Practise UPSC and State PSC Mains answers under real time pressure, typed or uploaded as a photo, then get marked across content, structure, relevance, analysis, language and presentation.',
      stats: [
        { value: awStats.totalAttempted || 0, label: 'Answers written' },
        { value: awStats.totalEvaluated || 0, label: 'Evaluated' },
        { value: `${Math.round(awStats.averageScore || 0)}`, label: 'Average marks' },
        { value: `${Math.round(awStats.complianceRate || 0)}%`, label: 'Within word limit' }
      ],
      actions: [
        { label: 'Generate Question with AI', icon: 'sparkles', onclick: 'answerWritingView.openAiQuestionModal()' },
        { label: 'Enter Question Manually', icon: 'edit-3', onclick: 'answerWritingView.openManualQuestionModal()', variant: 'ghost' }
      ],
      chipsLabel: 'Marked on six dimensions',
      chips: [
        { icon: 'book-open', label: 'Content', hint: 'Facts, examples and coverage' },
        { icon: 'list-tree', label: 'Structure', hint: 'Intro, body, conclusion and flow' },
        { icon: 'target', label: 'Relevance', hint: 'Did you answer the actual directive?' },
        { icon: 'brain', label: 'Analysis', hint: 'Depth of argument, not just recall' },
        { icon: 'languages', label: 'Language', hint: 'Clarity and exam-appropriate register' },
        { icon: 'layout-template', label: 'Presentation', hint: 'Readability, diagrams and underlining' }
      ]
    });

    this.container.innerHTML = `
      <div class="aw-container">
        ${heroHtml}

        <!-- Sub-Navigation Navigation Bar -->
        <nav class="aw-subnav-bar">
          <button class="aw-subnav-pill ${this.activeTab === 'new-answer' ? 'active' : ''}" onclick="answerWritingView.switchSubTab('new-answer')">
            <i data-lucide="file-edit"></i>
            <span>New Answer / Studio</span>
          </button>
          <button class="aw-subnav-pill ${this.activeTab === 'practice' ? 'active' : ''}" onclick="answerWritingView.switchSubTab('practice')">
            <i data-lucide="compass"></i>
            <span>Syllabus Drills</span>
          </button>
          <button class="aw-subnav-pill ${this.activeTab === 'history' ? 'active' : ''}" onclick="answerWritingView.switchSubTab('history')">
            <i data-lucide="history"></i>
            <span>Answer History</span>
            <span class="aw-badge-count" id="aw-history-counter">0</span>
          </button>
          <button class="aw-subnav-pill ${this.activeTab === 'performance' ? 'active' : ''}" onclick="answerWritingView.switchSubTab('performance')">
            <i data-lucide="trending-up"></i>
            <span>Performance Analytics</span>
          </button>
        </nav>

        <!-- Dynamic Main Content Area -->
        <div id="aw-tab-content">
          ${await this.renderActiveSubTabHtml()}
        </div>

        <!-- ================================================================ -->
        <!-- MODAL 1: AI Question Generation Modal -->
        <!-- ================================================================ -->
        <div id="aw-ai-question-modal" class="modal-overlay aw-modal-overlay" onclick="if(event.target===this) answerWritingView.closeAiQuestionModal()">
          <div class="modal-content glass-panel" style="max-width:580px;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <h3 style="display:flex; align-items:center; gap:0.5rem; font-size:1.2rem; color:var(--text-main);">
                <i data-lucide="sparkles" style="color:var(--color-gold);"></i>
                <span>Generate Question with AI</span>
              </h3>
              <button class="modal-close-btn" onclick="answerWritingView.closeAiQuestionModal()" title="Close (ESC)">
                <i data-lucide="x"></i>
              </button>
            </div>

            <form onsubmit="answerWritingView.handleAiQuestionSubmit(event)">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Examination</label>
                  <select id="aw-ai-exam" class="input-field" style="width:100%;">
                    <option value="UPSC" selected>UPSC Civil Services (CSE)</option>
                    <option value="State PSC">State PSC / PCS</option>
                    <option value="SSC">SSC CGL / Descriptive</option>
                    <option value="Banking">Banking (RBI / NABARD)</option>
                    <option value="Defence">Defence (CDS / CAPF)</option>
                    <option value="Other">Other Competitive Exam</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Paper / Subject</label>
                  <select id="aw-ai-subject" class="input-field" style="width:100%;">
                    <option value="Polity & Governance" selected>Polity & Governance (GS 2)</option>
                    <option value="Indian Economy">Indian Economy (GS 3)</option>
                    <option value="Geography">Geography & Ecology (GS 1)</option>
                    <option value="Modern History">Modern History & Culture (GS 1)</option>
                    <option value="Science & Technology">Science & Technology (GS 3)</option>
                    <option value="International Relations">International Relations (GS 2)</option>
                    <option value="Ethics & Integrity">Ethics & Integrity (GS 4)</option>
                    <option value="Indian Society">Society & Social Justice (GS 1/2)</option>
                    <option value="Current Affairs">Current Affairs & National Issues</option>
                  </select>
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem; margin-bottom:1.25rem;">
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Difficulty</label>
                  <select id="aw-ai-difficulty" class="input-field" style="width:100%;">
                    <option value="EASY">Easy</option>
                    <option value="MODERATE" selected>Moderate</option>
                    <option value="DIFFICULT">Difficult</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Word Limit</label>
                  <select id="aw-ai-wordlimit" class="input-field" style="width:100%;" onchange="answerWritingView.syncMarksFromWordLimit(this.value, 'aw-ai-marks')">
                    <option value="100">100 words</option>
                    <option value="150" selected>150 words (10M)</option>
                    <option value="200">200 words</option>
                    <option value="250">250 words (15M)</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Marks</label>
                  <select id="aw-ai-marks" class="input-field" style="width:100%;">
                    <option value="10" selected>10 Marks</option>
                    <option value="15">15 Marks</option>
                    <option value="20">20 Marks</option>
                  </select>
                </div>
              </div>

              <div style="margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Answer Type</label>
                <select id="aw-ai-answertype" class="input-field" style="width:100%;">
                  <option value="Paragraph Answer" selected>Paragraph Answer (Standard UPSC format)</option>
                  <option value="Analytical Answer">Analytical & Critical Appraisal</option>
                  <option value="Descriptive Answer">Comprehensive Descriptive Overview</option>
                  <option value="Essay-style Answer">Essay Style Long-Form Answer</option>
                </select>
              </div>

              <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
                <button type="button" class="btn btn-secondary" onclick="answerWritingView.closeAiQuestionModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="aw-ai-gen-btn">
                  <i data-lucide="zap"></i>
                  <span>Generate Question</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- ================================================================ -->
        <!-- MODAL 2: Manual Question Entry Modal -->
        <!-- ================================================================ -->
        <div id="aw-manual-question-modal" class="modal-overlay aw-modal-overlay" onclick="if(event.target===this) answerWritingView.closeManualQuestionModal()">
          <div class="modal-content glass-panel" style="max-width:680px;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.15rem;">
              <h3 style="display:flex; align-items:center; gap:0.5rem; font-size:1.2rem; color:var(--text-main);">
                <i data-lucide="edit-3" style="color:var(--color-primary-light);"></i>
                <span>Enter Question Manually</span>
              </h3>
              <button class="modal-close-btn" onclick="answerWritingView.closeManualQuestionModal()" title="Close (ESC)">
                <i data-lucide="x"></i>
              </button>
            </div>

            <!-- Quick Topic Inspiration Chips -->
            <div>
              <span style="font-size:0.8rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
                ⚡ High-Yield Topic Suggestions (Click to Auto-Fill):
              </span>
              <div class="aw-topic-inspiration-chips">
                ${this.quickInspirationTopics.map((t, idx) => `
                  <button type="button" class="aw-topic-chip" onclick="answerWritingView.quickFillManualTopic(${idx})">
                    <i data-lucide="bookmark" style="width:12px;height:12px;"></i>
                    <span>${t.title}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <form onsubmit="answerWritingView.handleManualQuestionSubmit(event)">
              <div style="margin-bottom:1rem;">
                <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">
                  Question / Topic Text *
                </label>
                <textarea 
                  id="aw-manual-question" 
                  class="input-field" 
                  rows="3" 
                  style="width:100%; resize:vertical; font-size:0.95rem; line-height:1.5;" 
                  placeholder="e.g. Discuss the role of the Indian monsoon in shaping India's agricultural economy and food security." 
                  oninput="answerWritingView.handleManualQuestionInput(this.value)"
                  required></textarea>
                
                <!-- Live Directive Feedback Banner -->
                <div class="aw-live-directive-badge" id="aw-manual-directive-box">
                  <i data-lucide="compass" style="width:16px;height:16px;color:var(--color-primary-light);flex-shrink:0;"></i>
                  <div>
                    <span>Detected Directive: <strong id="aw-manual-live-directive" style="color:var(--color-primary-light);">Discuss</strong></span>
                    <span style="display:block; font-size:0.8rem; color:var(--text-muted); margin-top:2px;" id="aw-manual-directive-tip">
                      Requires exploring multiple dimensions, balanced arguments, and a visionary way forward.
                    </span>
                  </div>
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Exam Type</label>
                  <input type="text" id="aw-manual-exam" class="input-field" value="UPSC" style="width:100%;" placeholder="e.g. UPSC, UPPCS, BPSC">
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Subject / Paper</label>
                  <input type="text" id="aw-manual-subject" class="input-field" value="Indian Economy" style="width:100%;" placeholder="e.g. Geography, Polity, Ethics">
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem; margin-bottom:1.5rem;">
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Difficulty</label>
                  <select id="aw-manual-difficulty" class="input-field" style="width:100%;">
                    <option value="EASY">Easy</option>
                    <option value="MODERATE" selected>Moderate</option>
                    <option value="DIFFICULT">Difficult</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Word Limit</label>
                  <input type="number" id="aw-manual-wordlimit" class="input-field" value="150" min="30" max="1500" style="width:100%;" oninput="answerWritingView.syncMarksFromWordLimit(this.value, 'aw-manual-marks')">
                </div>
                <div>
                  <label style="display:block; font-size:0.85rem; font-weight:650; margin-bottom:0.4rem; color:var(--text-secondary);">Marks</label>
                  <input type="number" id="aw-manual-marks" class="input-field" value="10" min="1" max="100" style="width:100%;">
                </div>
              </div>

              <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
                <button type="button" class="btn btn-secondary" onclick="answerWritingView.closeManualQuestionModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                  <i data-lucide="check"></i>
                  <span>Set Question & Start Writing</span>
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.updateHistoryCountBadge();
  }

  async updateHistoryCountBadge() {
    try {
      const attempts = await getAllAnswerAttempts();
      const countEl = document.getElementById('aw-history-counter');
      if (countEl) {
        countEl.textContent = String(attempts.length);
      }
    } catch (e) {}
  }

  async switchSubTab(tabName) {
    this.activeTab = tabName;
    const contentEl = document.getElementById('aw-tab-content');
    if (contentEl) {
      contentEl.innerHTML = await this.renderActiveSubTabHtml();
      if (window.lucide) window.lucide.createIcons();
    }

    document.querySelectorAll('.aw-subnav-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tabName));
    });

    if (window.audioEngine) window.audioEngine.playTabSwitch();
  }

  async initDefaultQuestionOrDraft() {
    const draft = await getLatestAnswerDraft();
    if (draft && draft.question) {
      this.activeQuestion = {
        question: draft.question,
        directive: draft.directive || window.answerWritingService.extractDirectiveWord(draft.question),
        exam: draft.exam || 'UPSC',
        subject: draft.subject || 'General Studies',
        difficulty: draft.difficulty || 'MODERATE',
        wordLimit: draft.wordLimit || 150,
        marks: draft.marks || 10,
        answerType: draft.answerType || 'Paragraph Answer',
        syllabusContext: 'Saved in-progress study draft'
      };
      this.studentAnswerText = draft.studentAnswer || '';
      this.timerDuration = this.activeQuestion.wordLimit <= 150 ? 7 * 60 : 11 * 60;
      this.timerRemaining = this.timerDuration;
      return;
    }

    this.activeQuestion = {
      question: "Discuss the role of the Indian monsoon in shaping India's agricultural economy and macroeconomic stability. What adaptive strategies can mitigate climate change vulnerabilities?",
      directive: "Discuss",
      exam: "UPSC",
      subject: "Geography & Economy",
      difficulty: "MODERATE",
      wordLimit: 150,
      marks: 10,
      answerType: "Paragraph Answer",
      syllabusContext: "General Studies Paper 1 (Geography) & Paper 3 (Agriculture & Food Security)"
    };
    this.timerDuration = 7 * 60;
    this.timerRemaining = this.timerDuration;
  }

  async renderActiveSubTabHtml() {
    if (this.activeTab === 'new-answer') {
      return this.renderNewAnswerStudioHtml();
    } else if (this.activeTab === 'practice') {
      return this.renderPracticeHtml();
    } else if (this.activeTab === 'history') {
      return await this.renderHistoryHtml();
    } else if (this.activeTab === 'performance') {
      return await this.renderPerformanceHtml();
    }
    return '';
  }

  // =========================================================================
  // SUB-TAB 1: NEW ANSWER / WRITING & EVALUATION STUDIO
  // =========================================================================
  renderNewAnswerStudioHtml() {
    if (this.inPreReview) {
      return this.renderPreEvaluationReviewHtml();
    }
    if (this.isEvaluating) {
      return this.renderEvaluatingLoadingHtml();
    }
    if (this.currentEvaluation && this.activeView !== 'STUDIO') {
      return this.renderPanoramicEvaluationDashboardHtml();
    }
    return this.renderWritingCommandCenterHtml();
  }

  renderWritingCommandCenterHtml() {
    const q = this.activeQuestion || {};
    const wordCount = this.getWordCount(this.studentAnswerText);
    const charCount = this.studentAnswerText.length;
    const limit = q.wordLimit || 150;
    const pct = Math.min(130, Math.round((wordCount / (limit || 1)) * 100));

    let statusClass = 'aw-status-optimal';
    let statusText = 'Target Zone';
    let progressClass = '';

    if (wordCount === 0) {
      statusClass = 'aw-status-low';
      statusText = 'Drafting';
    } else if (wordCount > limit * 1.15) {
      statusClass = 'aw-status-exceeded';
      statusText = 'Exceeded Limit';
      progressClass = 'exceeded';
    } else if (wordCount > limit) {
      statusClass = 'aw-status-warning';
      statusText = 'Near Limit';
      progressClass = 'warning';
    } else if (wordCount < limit * 0.6) {
      statusClass = 'aw-status-low';
      statusText = 'Under Limit';
    }

    // Health checks
    const hasIntro = wordCount >= 15;
    const hasBody = (this.studentAnswerText.includes('\n') || this.studentAnswerText.includes('•') || wordCount >= 60);
    const hasWayForward = /way forward|conclusion|in fine|thus|hence|reforms|roadmap/i.test(this.studentAnswerText);

    return `
      <!-- Active Question Card -->
      <div class="aw-question-card">
        <div class="aw-question-meta-row">
          <div class="aw-meta-badges">
            <span class="aw-badge aw-badge-exam">${SecurityUtils.escapeHtml(q.exam || 'UPSC')}</span>
            <span class="aw-badge aw-badge-subject">${SecurityUtils.escapeHtml(q.subject || 'General Studies')}</span>
            <span class="aw-badge aw-badge-difficulty">${SecurityUtils.escapeHtml(q.difficulty || 'MODERATE')}</span>
            <span class="aw-badge aw-badge-marks">${q.marks || 10} Marks • ${limit} Words</span>
          </div>
          <div style="font-size:0.84rem; color:var(--text-muted); display:flex; align-items:center; gap:0.5rem;">
            <span>Directive: <strong style="color:var(--color-primary-light); font-size:0.95rem;">${SecurityUtils.escapeHtml(q.directive || 'Discuss')}</strong></span>
            ${this.currentEvaluation ? `
              <button class="btn btn-secondary btn-sm" onclick="answerWritingView.viewEvaluationReport()" title="View latest evaluation report">
                <i data-lucide="award" style="color:var(--color-gold); width:13px; height:13px;"></i>
                <span>View Evaluation</span>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="aw-question-text">
          ${SecurityUtils.escapeHtml(q.question || 'No question selected')}
        </div>

        <div class="aw-directive-box">
          <i data-lucide="info" style="width:18px;height:18px;color:var(--color-primary-light);flex-shrink:0;"></i>
          <div>
            <strong>Directive Guidance (${SecurityUtils.escapeHtml(q.directive || 'Discuss')}):</strong>
            ${SecurityUtils.escapeHtml(window.answerWritingService.getDirectiveTip(q.directive))}
          </div>
        </div>

        <div class="aw-question-actions">
          <button class="btn btn-secondary btn-sm" onclick="answerWritingView.copyToClipboard('${SecurityUtils.escapeHtml(q.question || '').replace(/'/g, "\\'")}', 'Question')" title="Copy question">
            <i data-lucide="copy" style="width:14px;height:14px;"></i>
            <span>Copy</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="answerWritingView.openManualQuestionModal()">
            <i data-lucide="edit-3" style="width:14px;height:14px;"></i>
            <span>Change Question</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="answerWritingView.regenerateSimilarQuestion()">
            <i data-lucide="sparkles" style="width:14px;height:14px;color:var(--color-gold);"></i>
            <span>Similar Question</span>
          </button>
        </div>
      </div>

      <!-- Pre-Evaluation Review Screen (If active) -->
      ${this.inPreReview ? this.renderPreEvaluationReviewHtml() : ''}

      <!-- Full-Screen 100x Pro Writing Layout: Left (Studio 65%) | Right (Strategy Companion 35%) -->
      <div class="aw-writing-layout" ${this.inPreReview ? 'style="display:none;"' : ''}>
        <!-- LEFT COLUMN: FULL WRITING STUDIO -->
        <div class="aw-input-column">
          <!-- Input Mode Switcher -->
          <div class="aw-input-selector-bar">
            <button class="aw-mode-btn ${this.inputMode === 'TYPE' ? 'active' : ''}" onclick="answerWritingView.setInputMode('TYPE')">
              <i data-lucide="edit-3"></i>
              <span>Method A: Type Answer Canvas</span>
            </button>
            <button class="aw-mode-btn ${this.inputMode === 'UPLOAD' ? 'active' : ''}" onclick="answerWritingView.setInputMode('UPLOAD')">
              <i data-lucide="upload-cloud"></i>
              <span>Method B: Upload Image / PDF</span>
            </button>
          </div>

          <!-- TYPE ANSWER STUDIO -->
          <div id="aw-type-studio" class="aw-writing-card ${this.isFullscreenMode ? 'fullscreen-mode' : ''}" style="display: ${this.inputMode === 'TYPE' ? 'flex' : 'none'};">
            
            <!-- Toolbar: Timer, Word Count, Formatting -->
            <div class="aw-editor-toolbar">
              <!-- Built-in Exam Timer -->
              <div class="aw-timer-container ${this.timerIsRunning ? 'running' : ''}" id="aw-timer-container" title="UPSC Exam Countdown Timer">
                <i data-lucide="clock" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                <span class="aw-timer-display" id="aw-timer-val">${this.formatTime(this.timerRemaining)}</span>
                <button type="button" class="aw-timer-btn" id="aw-timer-toggle-btn" onclick="answerWritingView.toggleTimer()" title="Start / Pause Timer">
                  <i data-lucide="${this.timerIsRunning ? 'pause' : 'play'}" style="width:14px;height:14px;"></i>
                </button>
                <button type="button" class="aw-timer-btn" onclick="answerWritingView.resetTimer()" title="Reset Timer">
                  <i data-lucide="rotate-ccw" style="width:13px;height:13px;"></i>
                </button>
              </div>

              <!-- Word Counter Gauge -->
              <div class="aw-word-counter-pill" id="aw-word-counter-pill">
                <span>Words: <span class="aw-count-num" id="aw-word-count-num">${wordCount}</span> / ${limit}</span>
                <span style="color:var(--text-muted);font-size:0.75rem;">• ${charCount} chars</span>
                <span class="aw-word-status-tag ${statusClass}" id="aw-word-status-tag">${statusText}</span>
              </div>

              <!-- Zen Mode -->
              <button class="btn btn-secondary btn-sm" id="aw-fullscreen-btn" onclick="answerWritingView.toggleFullscreen()" title="Distraction-free Fullscreen Zen Mode">
                <i data-lucide="${this.isFullscreenMode ? 'minimize-2' : 'maximize-2'}" style="width:14px;height:14px;"></i>
                <span>${this.isFullscreenMode ? 'Exit Zen' : 'Fullscreen'}</span>
              </button>
            </div>

            <!-- Formatting Shortcut Toolbar -->
            <div class="aw-formatting-toolbar">
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('bold')" title="Bold (Ctrl+B)">
                <strong>B</strong>
              </button>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('italic')" title="Italic (Ctrl+I)">
                <em>I</em>
              </button>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('underline')" title="Underline (Ctrl+U)">
                <u>U</u>
              </button>
              <div class="aw-format-divider"></div>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('heading')" title="Add Thematic Subheading">
                <i data-lucide="heading" style="width:13px;height:13px;"></i>
                <span>Heading</span>
              </button>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('bullet')" title="Add Bullet Point">
                <i data-lucide="list" style="width:13px;height:13px;"></i>
                <span>Bullets</span>
              </button>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('numbered')" title="Add Numbered List">
                <i data-lucide="list-ordered" style="width:13px;height:13px;"></i>
                <span>1, 2, 3</span>
              </button>
              <div class="aw-format-divider"></div>
              <button type="button" class="aw-format-btn" id="aw-mic-btn" onclick="answerWritingView.startSpeechToText()" title="Dictate Answer (Speech to Text)">
                <i data-lucide="mic" style="width:13px;height:13px;color:var(--color-primary-light);"></i>
                <span>Speak</span>
              </button>
              <div class="aw-format-divider"></div>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.applyFormat('clean')" title="Clean extra spacing and newlines">
                <i data-lucide="sparkles" style="width:13px;height:13px;color:var(--color-gold);"></i>
                <span>Format Clean</span>
              </button>
              <button type="button" class="aw-format-btn" onclick="answerWritingView.clearAnswerEditor()" title="Clear textarea">
                <i data-lucide="trash-2" style="width:13px;height:13px;color:var(--color-error);"></i>
                <span>Clear</span>
              </button>
            </div>

            <!-- Word Progress Bar -->
            <div class="aw-word-progress-track">
              <div class="aw-word-progress-fill ${progressClass}" id="aw-word-progress-fill" style="width: ${Math.min(100, pct)}%;"></div>
            </div>

            <!-- Textarea Writing Canvas -->
            <div class="aw-textarea-wrapper" style="margin-top:0.75rem;">
              <textarea 
                id="aw-answer-textarea" 
                class="aw-textarea" 
                placeholder="Write your structured answer here...&#10;&#10;Introduction: Define key terms / establish constitutional or contemporary context...&#10;&#10;Body Arguments: Subheadings, multidimensional causes/implications, institutional schemes...&#10;&#10;Way Forward & Conclusion: Balanced policy recommendations..."
                oninput="answerWritingView.handleAnswerInput(event)">${SecurityUtils.escapeHtml(this.studentAnswerText)}</textarea>
            </div>

            <!-- Live Structural Health Indicators -->
            <div class="aw-structure-health-bar">
              <span style="font-weight:700;">Live Structure Health:</span>
              <span class="aw-health-chip ${hasIntro ? 'detected' : ''}" id="aw-health-intro">
                <i data-lucide="${hasIntro ? 'check-circle-2' : 'circle'}" style="width:13px;height:13px;"></i>
                <span>Intro Hook</span>
              </span>
              <span class="aw-health-chip ${hasBody ? 'detected' : ''}" id="aw-health-body">
                <i data-lucide="${hasBody ? 'check-circle-2' : 'circle'}" style="width:13px;height:13px;"></i>
                <span>Body Dimensions</span>
              </span>
              <span class="aw-health-chip ${hasWayForward ? 'detected' : ''}" id="aw-health-conclusion">
                <i data-lucide="${hasWayForward ? 'check-circle-2' : 'circle'}" style="width:13px;height:13px;"></i>
                <span>Way Forward</span>
              </span>
            </div>

            <!-- Footer Action Bar -->
            <div class="aw-editor-footer">
              <div class="aw-draft-indicator" id="aw-draft-indicator">
                <i data-lucide="cloud-check" style="width:14px;height:14px;color:var(--color-success);"></i>
                <span>Auto-saved locally</span>
              </div>

              <div class="aw-editor-actions">
                <button class="btn btn-secondary" onclick="answerWritingView.saveDraftManual()">
                  <i data-lucide="save"></i>
                  <span>Save Draft</span>
                </button>
                <button class="btn btn-primary" onclick="answerWritingView.proceedToPreReview()" style="box-shadow:0 4px 18px -2px var(--color-primary-glow);">
                  <i data-lucide="check-circle-2"></i>
                  <span>Review & Evaluate</span>
                </button>
              </div>
            </div>
          </div>

          <!-- UPLOAD ANSWER STUDIO (IMAGE / PDF & OCR) -->
          <div id="aw-upload-studio" class="aw-upload-card" style="display: ${this.inputMode === 'UPLOAD' ? 'block' : 'none'};">
            <div class="aw-upload-dropzone" id="aw-upload-dropzone" onclick="document.getElementById('aw-file-input').click()">
              <input type="file" id="aw-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style="display:none;" onchange="answerWritingView.handleFileUpload(event)">
              <div class="aw-dropzone-icon">
                <i data-lucide="upload-cloud" style="width:28px;height:28px;"></i>
              </div>
              <h3 style="font-size:1.15rem; color:var(--text-main); font-weight:700;">Drop handwritten or typed answer sheets here</h3>
              <p style="font-size:0.88rem; color:var(--text-muted); max-width:440px;">
                Upload multiple photos of handwritten UPSC answers or scanned multi-page PDF documents. Vision OCR extracts text with academic fidelity.
              </p>
              <button type="button" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">
                <i data-lucide="file-plus"></i>
                <span>Select Images or PDF</span>
              </button>
            </div>

            <!-- Uploaded Thumbnails Preview Gallery -->
            <div id="aw-thumbnails-container" style="display: ${this.uploadedFiles.length > 0 ? 'block' : 'none'}; margin-top:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <span style="font-weight:700; font-size:0.9rem; color:var(--text-main);">
                  Uploaded Pages (${this.uploadedFiles.length})
                </span>
                <button class="btn btn-secondary btn-sm" onclick="answerWritingView.clearUploadedFiles()">
                  <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                  <span>Clear All</span>
                </button>
              </div>

              <div class="aw-thumbnails-grid" id="aw-thumbnails-grid">
                ${this.renderThumbnailsHtml()}
              </div>

              <div style="margin-top:1.25rem; display:flex; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="answerWritingView.extractTextFromUploaded()" style="box-shadow:0 4px 18px -2px var(--color-primary-glow);">
                  <i data-lucide="scan-text"></i>
                  <span>Run OCR & Extract Answer Text</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: STRATEGY COMPANION PANEL (Full-Screen Utilization) -->
        <div class="aw-companion-panel">
          <!-- Card 1: Directive Mastery Strategy -->
          <div class="aw-companion-card">
            <div class="aw-companion-header">
              <span style="display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="compass" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
                <span>Directive Strategy: <strong>${SecurityUtils.escapeHtml(q.directive || 'Discuss')}</strong></span>
              </span>
              <span class="aw-badge aw-badge-exam" style="font-size:0.72rem;">UPSC Rubric</span>
            </div>
            <div class="aw-companion-content">
              <p style="margin-bottom:0.6rem;">
                ${SecurityUtils.escapeHtml(window.answerWritingService.getDirectiveTip(q.directive))}
              </p>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <span class="aw-badge aw-badge-marks">Target: ${limit} words</span>
                <span class="aw-badge aw-badge-difficulty">Time: ${Math.floor(this.timerDuration / 60)} mins</span>
              </div>
            </div>
          </div>

          <!-- Card 2: 3-Tier UPSC Architecture Framework -->
          <div class="aw-companion-card">
            <div class="aw-companion-header">
              <span style="display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="layers" style="width:16px;height:16px;color:var(--color-gold);"></i>
                <span>3-Tier Architecture Blueprint</span>
              </span>
            </div>
            <div class="aw-companion-content" style="display:flex; flex-direction:column; gap:0.6rem;">
              <div style="padding:0.5rem 0.65rem; background:var(--bg-secondary); border-radius:var(--radius-md); border-left:3px solid var(--color-primary-light);">
                <strong style="color:var(--text-main); display:block; font-size:0.84rem;">1. Introduction (~15% | ~25 words)</strong>
                <span style="font-size:0.78rem; color:var(--text-muted);">Direct definition, constitutional article, or recent statistical datum.</span>
              </div>
              <div style="padding:0.5rem 0.65rem; background:var(--bg-secondary); border-radius:var(--radius-md); border-left:3px solid var(--color-gold);">
                <strong style="color:var(--text-main); display:block; font-size:0.84rem;">2. Body Arguments (~70% | ~105 words)</strong>
                <span style="font-size:0.78rem; color:var(--text-muted);">Use 2-3 distinct thematic subheadings (PESTLE), committees & bullet points.</span>
              </div>
              <div style="padding:0.5rem 0.65rem; background:var(--bg-secondary); border-radius:var(--radius-md); border-left:3px solid var(--color-success);">
                <strong style="color:var(--text-main); display:block; font-size:0.84rem;">3. Way Forward (~15% | ~25 words)</strong>
                <span style="font-size:0.78rem; color:var(--text-muted);">Constructive roadmap, government initiative, or visionary concluding thought.</span>
              </div>
            </div>
          </div>

          <!-- Card 3: Live Brainstorming Scratchpad -->
          <div class="aw-companion-card">
            <div class="aw-companion-header">
              <span style="display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="lightbulb" style="width:16px;height:16px;color:var(--color-gold);"></i>
                <span>Brainstorming Scratchpad</span>
              </span>
              <span style="font-size:0.75rem; color:var(--text-muted);">Jot points</span>
            </div>
            <div class="aw-companion-content">
              <textarea 
                class="input-field" 
                style="width:100%; min-height:85px; font-size:0.82rem; line-height:1.4; resize:vertical; background:var(--bg-surface);" 
                placeholder="Quick keywords / citations (e.g. Art. 356, Sarkaria Commission, NITI Aayog report, GDP %). Not submitted with final answer."
                oninput="answerWritingView.handleBrainstormingInput(this.value)">${SecurityUtils.escapeHtml(this.brainstormingNotes || '')}</textarea>
            </div>
          </div>

          <!-- Card 4: Quick Pre-Submission Checklist -->
          <div class="aw-companion-card">
            <div class="aw-companion-header">
              <span style="display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="check-square" style="width:16px;height:16px;color:var(--color-success);"></i>
                <span>Senior Examiner Quick Checklist</span>
              </span>
            </div>
            <div class="aw-companion-content" style="display:flex; flex-direction:column; gap:0.4rem; font-size:0.82rem;">
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" style="accent-color:var(--color-primary-light);">
                <span>Directly answers the directive core</span>
              </label>
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" style="accent-color:var(--color-primary-light);">
                <span>Contains clear subheadings / bullets</span>
              </label>
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" style="accent-color:var(--color-primary-light);">
                <span>Cites at least 1 Committee / Article / Case</span>
              </label>
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" style="accent-color:var(--color-primary-light);">
                <span>Within ±10% word limit boundary</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderThumbnailsHtml() {
    return this.uploadedFiles.map((item, idx) => {
      const isPdf = item.file.type === 'application/pdf' || item.file.name.endsWith('.pdf');
      return `
        <div class="aw-thumbnail-item">
          ${isPdf ? `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(239,68,68,0.08);color:var(--color-error);padding:0.5rem;text-align:center;">
              <i data-lucide="file-text" style="width:32px;height:32px;"></i>
              <span style="font-size:0.75rem;font-weight:700;margin-top:0.25rem;word-break:break-all;">PDF Doc</span>
            </div>
          ` : `
            <img src="${item.previewUrl}" alt="Page ${idx + 1}" class="aw-thumbnail-img">
          `}
          <span class="aw-thumbnail-badge">P.${idx + 1}</span>
          ${!isPdf ? `
            <button class="aw-thumbnail-delete" style="right:34px; background:rgba(79,70,229,0.85);" onclick="answerWritingView.rotateImage(${idx})" title="Rotate 90°">
              <i data-lucide="rotate-cw" style="width:13px;height:13px;"></i>
            </button>
          ` : ''}
          <button class="aw-thumbnail-delete" onclick="answerWritingView.removeUploadedFile(${idx})" title="Remove page">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  renderPreEvaluationReviewHtml() {
    const q = this.activeQuestion || {};
    const textToReview = this.studentAnswerText || this.extractedAnswerText || '';
    const wordCount = this.getWordCount(textToReview);
    const limit = q.wordLimit || 150;

    return `
      <div class="aw-review-card animate-scale-up">
        <div class="aw-review-header">
          <div>
            <h3 style="font-size:1.25rem; font-weight:750; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="clipboard-check" style="color:var(--color-primary-light);"></i>
              <span>Pre-Evaluation Review</span>
            </h3>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:0.25rem;">
              Verify and polish your answer text before submitting to the AI Examiner.
            </p>
          </div>
          <div class="aw-word-counter-pill">
            <span>Words: <strong style="color:var(--color-primary-light);">${wordCount}</strong> / ${limit}</span>
            <span style="text-transform:uppercase;font-size:0.75rem;font-weight:700;color:var(--text-muted);">• Source: ${this.inputSource}</span>
          </div>
        </div>

        <div class="aw-review-notice">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Accuracy Verification:</strong> We extracted your answer from your ${this.inputSource.toLowerCase()} input. Handwritten OCR or extracted text may contain transcription nuances. Please quickly review and adjust any wording below before initiating AI evaluation.
          </div>
        </div>

        <div style="margin-bottom:1.25rem;">
          <textarea 
            id="aw-review-textarea" 
            class="aw-textarea" 
            style="min-height:260px;"
            oninput="answerWritingView.handleReviewTextChange(this.value)">${SecurityUtils.escapeHtml(textToReview)}</textarea>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <button class="btn btn-secondary" onclick="answerWritingView.cancelPreReview()">
            <i data-lucide="arrow-left"></i>
            <span>Edit in Studio</span>
          </button>
          <button class="btn btn-primary btn-lg" onclick="answerWritingView.submitFinalAnswerForEvaluation()" style="font-weight:750; box-shadow:0 6px 20px -2px var(--color-primary-glow);">
            <i data-lucide="sparkles"></i>
            <span>Analyze My Answer with AI</span>
          </button>
        </div>
      </div>
    `;
  }

  renderEmptyEvaluationPlaceholderHtml() {
    return `
      <div class="aw-section-card" style="text-align:center; padding:3.5rem 1.5rem; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:450px;">
        <div style="width:72px; height:72px; border-radius:50%; background:rgba(79,70,229,0.12); display:flex; align-items:center; justify-content:center; color:var(--color-primary-light); margin-bottom:1.25rem;">
          <i data-lucide="award" style="width:36px;height:36px;"></i>
        </div>
        <h3 style="font-size:1.3rem; font-weight:750; color:var(--text-main); margin-bottom:0.5rem;">
          UPSC Examiner Evaluation Ready
        </h3>
        <p style="color:var(--text-muted); font-size:0.92rem; max-width:400px; line-height:1.55; margin-bottom:1.5rem;">
          Type your answer on the left or upload answer sheet images, then click <strong>"Review & Evaluate"</strong> to trigger comprehensive multi-dimensional grading.
        </p>
        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:0.5rem;">
          <span class="aw-badge aw-badge-exam">Content Depth</span>
          <span class="aw-badge aw-badge-subject">Structure Analysis</span>
          <span class="aw-badge aw-badge-difficulty">Directive Relevance</span>
          <span class="aw-badge aw-badge-marks">Model Answer</span>
        </div>
      </div>
    `;
  }

  renderEvaluatingLoadingHtml() {
    return `
      <div class="aw-loading-card animate-scale-up">
        <div class="cosmic-rings-wrapper" style="width:90px;height:90px;margin:0 auto;">
          <div class="cosmic-orbital-ring cosmic-ring-1"></div>
          <div class="cosmic-orbital-ring cosmic-ring-2"></div>
          <div class="spinner-hamsa">
            <img src="assets/icons/hamsa-logo-3d.png" alt="Hamsa" onerror="this.src='assets/icons/hamsa-logo.svg'" style="width:100%;height:100%;object-fit:contain;">
          </div>
        </div>

        <div>
          <h3 style="font-size:1.35rem; font-weight:750; color:var(--text-main); margin-bottom:0.4rem;">
            Evaluating Your Answer...
          </h3>
          <p style="color:var(--text-secondary); font-size:0.92rem;" id="aw-eval-progress-text">
            ${SecurityUtils.escapeHtml(this.evaluationProgressMessage)}
          </p>
        </div>

        <div class="step-progress-list" style="width:100%; max-width:380px; text-align:left;">
          <div class="step-progress-item completed">
            <i data-lucide="check-circle-2"></i>
            <span>Understanding Question & Directive</span>
          </div>
          <div class="step-progress-item active">
            <i data-lucide="circle-dot"></i>
            <span>Evaluating Content & Dimensions</span>
          </div>
          <div class="step-progress-item">
            <i data-lucide="circle"></i>
            <span>Analyzing Structure & Language</span>
          </div>
          <div class="step-progress-item">
            <i data-lucide="circle"></i>
            <span>Generating Model Answer & Roadmap</span>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // SUB-TAB 1: EVALUATION REPORT DASHBOARD
  // =========================================================================
  renderEvaluationDashboardHtml() {
    return this.renderPanoramicEvaluationDashboardHtml();
  }

  // =========================================================================
  // SUB-TAB 1: FULL-SCREEN PANORAMIC EVALUATION & MENTOR HUB (100x PRO)
  // =========================================================================
  renderPanoramicEvaluationDashboardHtml() {
    const ev = this.currentEvaluation;
    if (!ev) return '';

    const q = this.activeQuestion || {};
    const sc = ev.scores || { overall: 7.0, content: 7.0, structure: 7.0, relevance: 7.0, analysis: 6.5, language: 7.5, presentation: 7.0 };
    const overallScore = Number(sc.overall || 7.0).toFixed(1);
    const maxMarks = q.marks || 10;
    const marksAwarded = sc.marksAwarded != null ? sc.marksAwarded : Number(((Number(overallScore) / 10) * maxMarks).toFixed(1));

    // Language Modes: 'BILINGUAL', 'ENGLISH', 'HINDI'
    const mode = this.evalLanguageMode || 'BILINGUAL';
    const isBilingual = mode === 'BILINGUAL';
    const isEnglish = mode === 'ENGLISH' || isBilingual;
    const isHindi = mode === 'HINDI' || isBilingual;

    // Qualitative assessment band
    let bandText = "Competitive Interview Zone";
    let bandColor = "var(--color-success)";
    if (sc.overall >= 8.0) {
      bandText = "Topper Benchmark (Top 5%)";
      bandColor = "var(--color-gold)";
    } else if (sc.overall < 6.0) {
      bandText = "Needs Structural Revision";
      bandColor = "var(--color-warning)";
    }

    // Concept Flowchart / Diagram Data
    const diag = ev.visualDiagram || (window.answerWritingService ? window.answerWritingService.generateVisualDiagram(q.subject, q.question, q.directive) : null);

    // Bilingual Summary Data
    const summaryEn = ev.summary || (ev.bilingualSummary?.en) || '';
    const summaryHi = ev.bilingualSummary?.hi || ev.summaryHi || '';

    // Bilingual Strengths & Weaknesses
    const strengthsList = ev.bilingualStrengths && ev.bilingualStrengths.length > 0
      ? ev.bilingualStrengths
      : (ev.strengths || []).map(s => typeof s === 'object' ? s : { en: s, hi: '' });

    const weaknessesList = ev.bilingualWeaknesses && ev.bilingualWeaknesses.length > 0
      ? ev.bilingualWeaknesses
      : (ev.weaknesses || []).map(w => typeof w === 'object' ? w : { en: w, hi: '' });

    // Bilingual Missing Dimensions
    const missingDims = ev.bilingualMissingDimensions && ev.bilingualMissingDimensions.length > 0
      ? ev.bilingualMissingDimensions
      : (ev.missingDimensions || []);

    // Bilingual Structure
    const structAnalysis = ev.bilingualStructureAnalysis || ev.structureAnalysis || {};

    // Bilingual Improvement Steps
    const improvSteps = (ev.bilingualImprovementSteps && ev.bilingualImprovementSteps.length > 0
      ? ev.bilingualImprovementSteps
      : (ev.improvementSteps || [])
    ).map((step, i) => {
      if (typeof step === 'object') {
        const en = step.stepEn || step.en || step.text || `Step ${i + 1}`;
        const hi = step.stepHi || step.hi || '';
        return { stepEn: en, stepHi: hi, en, hi };
      }
      return { stepEn: String(step), stepHi: '', en: String(step), hi: '' };
    });

    return `
      <div class="aw-panoramic-eval-view animate-scale-up">
        <!-- ================================================================ -->
        <!-- 1. PANORAMIC HERO RIBBON (Full-Width Header & Controls) -->
        <!-- ================================================================ -->
        <div class="aw-panoramic-hero-ribbon">
          <div class="aw-score-circle-wrapper">
            <div class="aw-score-donut">
              <svg width="100" height="100" viewBox="0 0 100 100" style="transform:rotate(-90deg);">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border-subtle)" stroke-width="9" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-primary-light)" stroke-width="9"
                  stroke-dasharray="251.2"
                  stroke-dashoffset="${251.2 - (251.2 * (Number(overallScore) / 10))}"
                  stroke-linecap="round" />
              </svg>
              <div class="aw-score-number">
                ${overallScore}<span class="aw-score-denom">/10</span>
              </div>
            </div>

            <div class="aw-score-hero-text">
              <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.25rem; flex-wrap:wrap;">
                <div style="width:38px; height:38px; border-radius:50%; background:var(--color-primary); display:flex; align-items:center; justify-content:center; color:white; font-size:1.15rem; box-shadow:0 4px 10px rgba(79,70,229,0.3);">
                  👨‍🏫
                </div>
                <div>
                  <h3 style="margin:0; font-size:1.35rem; color:var(--text-main);">Senior Examiner Assessment</h3>
                  <div style="font-size:0.85rem; color:var(--color-primary); font-weight:600; margin-top:2px;">Namaste! I have reviewed your answer. Here is my analysis:</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; flex-wrap:wrap; margin-top:0.75rem;">
                <span class="aw-badge aw-badge-difficulty" style="background:${bandColor}18; color:${bandColor}; border-color:${bandColor}40;">${bandText}</span>
                <span class="aw-badge aw-badge-marks" style="font-weight:750;">Score: ${marksAwarded} / ${maxMarks} Marks</span>
              </div>
              <div class="aw-markdown-content" style="margin:0; color:var(--text-secondary); font-size:0.92rem; max-width:680px; line-height:1.55;">
                ${this.renderMarkdown(isEnglish ? (summaryEn || 'Multi-dimensional evaluation completed.') : (summaryHi || summaryEn))}
              </div>
            </div>
          </div>

          <!-- Controls Cluster: Language Switcher, Flowchart Switch, PDF Export, Edit -->
          <div class="aw-eval-controls-cluster">
            <!-- 3-Way Bilingual Switcher -->
            <div class="aw-lang-switcher-pill" title="Switch Analysis Language">
              <button class="aw-lang-btn ${this.evalLanguageMode === 'BILINGUAL' ? 'active' : ''}" onclick="answerWritingView.setEvalLanguageMode('BILINGUAL')">
                🌐 Bilingual (EN + हि)
              </button>
              <button class="aw-lang-btn ${this.evalLanguageMode === 'ENGLISH' ? 'active' : ''}" onclick="answerWritingView.setEvalLanguageMode('ENGLISH')">
                English
              </button>
              <button class="aw-lang-btn ${this.evalLanguageMode === 'HINDI' ? 'active' : ''}" onclick="answerWritingView.setEvalLanguageMode('HINDI')">
                🇮🇳 हिंदी
              </button>
            </div>

            <!-- Concept Diagram & Flowchart Toggle Switch -->
            <label class="aw-switch-container" title="Toggle Exam Concept Diagram / Flowchart">
              <span class="aw-switch-title">
                <i data-lucide="git-merge" style="width:14px;height:14px;color:var(--color-gold);"></i>
                <span>Diagram / Flowchart</span>
              </span>
              <div class="aw-toggle-switch">
                <input type="checkbox" id="aw-diagram-toggle" ${this.showVisualDiagram ? 'checked' : ''} onchange="answerWritingView.toggleVisualDiagram(this.checked)">
                <span class="aw-toggle-slider"></span>
              </div>
            </label>

            <!-- Export A4 PDF Button -->
            <button class="btn btn-primary btn-sm" onclick="answerWritingView.printEvaluationReport()" title="Export official UPSC A4 evaluation sheet (NOT raw screen print)">
              <i data-lucide="file-down"></i>
              <span>Export A4 PDF</span>
            </button>

            <!-- Re-Attempt / Edit in Studio -->
            <button class="btn btn-secondary btn-sm" onclick="answerWritingView.returnToEditing()" title="Edit answer or attempt new revision">
              <i data-lucide="edit-3"></i>
              <span>Edit / Re-attempt</span>
            </button>
          </div>
        </div>

        <!-- ================================================================ -->
        <!-- 2. COLLAPSIBLE VISUAL DIAGRAM & FLOWCHART STUDIO -->
        <!-- ================================================================ -->
        ${diag ? `
          <div class="aw-diagram-panel ${this.showVisualDiagram ? '' : 'collapsed'}" id="aw-visual-diagram-panel">
            <div class="aw-diagram-header-row">
              <div class="aw-diagram-title-group">
                <h3>
                  <i data-lucide="git-merge" style="color:var(--color-gold);width:20px;height:20px;"></i>
                  <span>${SecurityUtils.escapeHtml(diag.diagramTitle || 'Answer Structural Flowchart')}</span>
                  <span class="aw-badge aw-badge-exam" style="margin-left:0.5rem; font-size:0.72rem;">${SecurityUtils.escapeHtml(diag.diagramType || 'FLOWCHART')}</span>
                </h3>
                <p>
                  ${SecurityUtils.escapeHtml(isEnglish ? diag.diagramDescription : (diag.diagramDescriptionHi || diag.diagramDescription))}
                </p>
                ${isBilingual && diag.diagramDescriptionHi ? `
                  <div class="aw-hindi-block" style="margin-top:0.35rem;">
                    🇮🇳 <strong>आरेख व्याख्या:</strong> ${SecurityUtils.escapeHtml(diag.diagramDescriptionHi)}
                  </div>
                ` : ''}
              </div>

              <div style="display:flex; align-items:center; gap:0.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="answerWritingView.copyDiagramBlueprint()" title="Copy schematic exam blueprint">
                  <i data-lucide="copy" style="width:13px;height:13px;"></i>
                  <span>Copy Exam Blueprint</span>
                </button>
              </div>
            </div>

            <!-- Flow Track Nodes -->
            <div class="aw-diagram-flow-track">
              ${(diag.flowNodes || []).map((node, i) => `
                <div class="aw-flow-node-card">
                  <div>
                    <span class="aw-flow-node-badge">
                      <i data-lucide="arrow-right-circle" style="width:12px;height:12px;"></i>
                      <span>${SecurityUtils.escapeHtml(node.step || `Node ${i + 1}`)}</span>
                    </span>
                    <div class="aw-flow-node-title">
                      ${SecurityUtils.escapeHtml(isEnglish ? node.title : (node.titleHi || node.title))}
                      ${isBilingual && node.titleHi ? `<span style="display:block; font-size:0.8rem; color:var(--text-muted); font-weight:normal; margin-top:2px;">${SecurityUtils.escapeHtml(node.titleHi)}</span>` : ''}
                    </div>
                  </div>
                  <div class="aw-flow-node-desc">
                    ${isEnglish ? `<div>${SecurityUtils.escapeHtml(node.desc || '')}</div>` : ''}
                    ${isHindi && (node.descHi) ? `
                      <div class="aw-hindi-block" style="font-size:0.78rem; padding:0.35rem 0.5rem; margin-top:0.35rem;">
                        ${SecurityUtils.escapeHtml(node.descHi)}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Drawing Blueprint Box -->
            <div class="aw-drawing-blueprint-bar">
              <div style="font-size:0.85rem; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                <span><strong>✍️ How to Sketch in UPSC Answer Sheet:</strong> ${SecurityUtils.escapeHtml(isEnglish ? (diag.drawingInstructions || 'Draw a central hub box with outward causal arrows.') : (diag.drawingInstructionsHi || diag.drawingInstructions))}</span>
                <span class="aw-badge aw-badge-marks" style="font-size:0.7rem;">Examiner Value Addition +1.5 Marks</span>
              </div>
              ${isBilingual && diag.drawingInstructionsHi ? `
                <div class="aw-hindi-block" style="margin-bottom:0.75rem;">
                  🇮🇳 <strong>उत्तर पुस्तिका में कैसे बनाएं:</strong> ${SecurityUtils.escapeHtml(diag.drawingInstructionsHi)}
                </div>
              ` : ''}
              ${diag.asciiBlueprint ? `
                <pre style="background:var(--bg-secondary); border:1px solid var(--border-medium); border-radius:var(--radius-md); padding:0.75rem; font-size:0.78rem; font-family:monospace; color:var(--text-main); overflow-x:auto; margin:0;">${SecurityUtils.escapeHtml(diag.asciiBlueprint)}</pre>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- ================================================================ -->
        <!-- 3. PANORAMIC TWO-COLUMN GRID (Full-Screen 50/50 Wide Split) -->
        <!-- ================================================================ -->
        <div class="aw-panoramic-2col">
          <!-- ============================================================== -->
          <!-- LEFT COLUMN: DIAGNOSTIC AUDIT & BILINGUAL EVALUATIONS -->
          <!-- ============================================================== -->
          <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <!-- Executive Summary Card -->
            <div class="aw-section-card">
              <div class="aw-section-header" style="color:var(--color-primary-light);">
                <i data-lucide="sparkles"></i>
                <span>${this.evalLanguageMode === 'HINDI' ? 'वरिष्ठ परीक्षक सारांश (Examiner Summary)' : 'Senior Examiner Assessment & Verdict'}</span>
              </div>
              ${isEnglish && summaryEn ? `
                <div class="aw-markdown-content" style="font-size:0.94rem; line-height:1.6; color:var(--text-main); margin-bottom:0.5rem;">
                  ${this.renderMarkdown(summaryEn)}
                </div>
              ` : ''}
              ${isHindi && summaryHi ? `
                <div class="aw-hindi-block animate-fade-in aw-markdown-content">
                  <span style="font-weight:700; color:var(--color-primary-light); font-size:0.75rem; text-transform:uppercase; display:block; margin-bottom:0.2rem;">🇮🇳 हिंदी मूल्यांकन (Hindi Assessment):</span>
                  ${this.renderMarkdown(summaryHi)}
                </div>
              ` : ''}
            </div>

            <!-- 6-Dimension Score Matrix Grid -->
            <div class="aw-section-card">
              <div class="aw-section-header">
                <i data-lucide="bar-chart-2"></i>
                <span>6-Dimensional Performance Matrix</span>
              </div>
              <div class="aw-dim-scores-grid">
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Content Depth</div>
                  <div class="aw-dim-val">${sc.content ?? 7.0}</div>
                </div>
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Structure</div>
                  <div class="aw-dim-val">${sc.structure ?? 7.0}</div>
                </div>
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Relevance</div>
                  <div class="aw-dim-val">${sc.relevance ?? 7.5}</div>
                </div>
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Analysis</div>
                  <div class="aw-dim-val">${sc.analysis ?? 6.5}</div>
                </div>
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Language</div>
                  <div class="aw-dim-val">${sc.language ?? 7.5}</div>
                </div>
                <div class="aw-dim-card">
                  <div class="aw-dim-name">Presentation</div>
                  <div class="aw-dim-val">${sc.presentation ?? 7.0}</div>
                </div>
              </div>
            </div>

            <!-- Strengths & Weaknesses Split -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.25rem;">
              <!-- Strengths -->
              <div class="aw-section-card">
                <div class="aw-section-header" style="color:var(--color-success);">
                  <i data-lucide="check-circle-2"></i>
                  <span>${this.evalLanguageMode === 'HINDI' ? 'मजबूत पक्ष (Strengths)' : 'What You Did Well (Strengths)'}</span>
                </div>
                <div class="aw-strengths-list">
                  ${strengthsList.map(s => {
                    const enText = typeof s === 'object' ? s.en : s;
                    const hiText = typeof s === 'object' ? s.hi : '';
                    return `
                      <div class="aw-strength-item">
                        <i data-lucide="check" style="width:16px;height:16px;color:var(--color-success);flex-shrink:0;margin-top:2px;"></i>
                        <div style="flex:1;">
                          ${isEnglish && enText ? `<div>${SecurityUtils.escapeHtml(enText)}</div>` : ''}
                          ${isHindi && hiText ? `
                            <div class="aw-hindi-block" style="margin-top:0.25rem;">
                              ${SecurityUtils.escapeHtml(hiText)}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Weaknesses -->
              <div class="aw-section-card">
                <div class="aw-section-header" style="color:var(--color-warning);">
                  <i data-lucide="alert-circle"></i>
                  <span>${this.evalLanguageMode === 'HINDI' ? 'सुधार के बिंदु (Weaknesses)' : 'Needs Improvement (Weaknesses)'}</span>
                </div>
                <div class="aw-weakness-list">
                  ${weaknessesList.map(w => {
                    const enText = typeof w === 'object' ? w.en : w;
                    const hiText = typeof w === 'object' ? w.hi : '';
                    return `
                      <div class="aw-weakness-item">
                        <i data-lucide="arrow-right" style="width:16px;height:16px;color:var(--color-warning);flex-shrink:0;margin-top:2px;"></i>
                        <div style="flex:1;">
                          ${isEnglish && enText ? `<div>${SecurityUtils.escapeHtml(enText)}</div>` : ''}
                          ${isHindi && hiText ? `
                            <div class="aw-hindi-block" style="margin-top:0.25rem;">
                              ${SecurityUtils.escapeHtml(hiText)}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>

            <!-- Missing Dimensions & Value Additions -->
            ${missingDims && missingDims.length > 0 ? `
              <div class="aw-section-card">
                <div class="aw-section-header" style="color:var(--color-primary-light);">
                  <i data-lucide="plus-circle"></i>
                  <span>${this.evalLanguageMode === 'HINDI' ? 'छूटे हुए आयाम एवं मूल्य संवर्धन (Missing Dimensions)' : 'Missing Dimensions & High-Yield Value Additions'}</span>
                </div>
                <div class="aw-dimensions-grid">
                  ${missingDims.map(d => `
                    <div class="aw-dim-missing-card">
                      <div class="aw-dim-missing-title">
                        <i data-lucide="bookmark" style="width:14px;height:14px;"></i>
                        <span>${SecurityUtils.escapeHtml(isEnglish ? d.dimension : (d.dimensionHi || d.dimension))}</span>
                        ${isBilingual && d.dimensionHi ? `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(${SecurityUtils.escapeHtml(d.dimensionHi)})</span>` : ''}
                      </div>
                      <div class="aw-dim-missing-details">
                        ${isEnglish && d.details ? `<div>${SecurityUtils.escapeHtml(d.details)}</div>` : ''}
                        ${isHindi && (d.detailsHi) ? `
                          <div class="aw-hindi-block">
                            ${SecurityUtils.escapeHtml(d.detailsHi)}
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Structure Review (Intro -> Body -> Conclusion) -->
            ${structAnalysis && (structAnalysis.intro || structAnalysis.body || structAnalysis.conclusion) ? `
              <div class="aw-section-card">
                <div class="aw-section-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <i data-lucide="layers"></i>
                    <span>${this.evalLanguageMode === 'HINDI' ? 'उत्तर संरचना समीक्षा (Structure Analysis)' : 'Answer Structure Analysis'}</span>
                  </div>
                  <button class="btn btn-secondary btn-sm" onclick="answerWritingView.toggleFlowchart()" style="display:flex; align-items:center; gap:0.4rem;">
                    <i data-lucide="git-merge" style="width:14px;height:14px;"></i>
                    <span>View Flowchart / Diagram</span>
                  </button>
                </div>
                
                <div id="aw-structure-text-view" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
                  <div class="aw-dim-missing-card">
                    <div class="aw-dim-missing-title" style="color:var(--text-main);">
                      <span>1. Intro / भूमिका</span>
                      <span class="aw-badge aw-badge-exam" style="margin-left:auto;font-size:0.7rem;">${SecurityUtils.escapeHtml(structAnalysis.intro?.verdict || 'Review')}</span>
                    </div>
                    <div class="aw-dim-missing-details">
                      ${isEnglish && structAnalysis.intro?.feedback ? `<div class="aw-markdown-content">${this.renderMarkdown(structAnalysis.intro.feedback)}</div>` : ''}
                      ${isHindi && structAnalysis.intro?.feedbackHi ? `
                        <div class="aw-hindi-block aw-markdown-content">
                          ${this.renderMarkdown(structAnalysis.intro.feedbackHi)}
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div class="aw-dim-missing-card">
                    <div class="aw-dim-missing-title" style="color:var(--text-main);">
                      <span>2. Body / मुख्य भाग</span>
                      <span class="aw-badge aw-badge-subject" style="margin-left:auto;font-size:0.7rem;">${SecurityUtils.escapeHtml(structAnalysis.body?.verdict || 'Review')}</span>
                    </div>
                    <div class="aw-dim-missing-details">
                      ${isEnglish && structAnalysis.body?.feedback ? `<div class="aw-markdown-content">${this.renderMarkdown(structAnalysis.body.feedback)}</div>` : ''}
                      ${isHindi && structAnalysis.body?.feedbackHi ? `
                        <div class="aw-hindi-block aw-markdown-content">
                          ${this.renderMarkdown(structAnalysis.body.feedbackHi)}
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div class="aw-dim-missing-card">
                    <div class="aw-dim-missing-title" style="color:var(--text-main);">
                      <span>3. Way Forward / निष्कर्ष</span>
                      <span class="aw-badge aw-badge-difficulty" style="margin-left:auto;font-size:0.7rem;">${SecurityUtils.escapeHtml(structAnalysis.conclusion?.verdict || 'Review')}</span>
                    </div>
                    <div class="aw-dim-missing-details">
                      ${isEnglish && structAnalysis.conclusion?.feedback ? `<div class="aw-markdown-content">${this.renderMarkdown(structAnalysis.conclusion.feedback)}</div>` : ''}
                      ${isHindi && structAnalysis.conclusion?.feedbackHi ? `
                        <div class="aw-hindi-block aw-markdown-content">
                          ${this.renderMarkdown(structAnalysis.conclusion.feedbackHi)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
                
                <div id="aw-structure-flowchart-view" style="display:none; padding: 2rem 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border-color); margin-top: 1rem;" class="animate-fade-in">
                  <h4 style="text-align:center; font-size:1rem; margin-bottom:1.5rem; color:var(--text-main);">Recommended Answer Flow</h4>
                  <div style="display:flex; flex-direction:column; align-items:center; gap: 0.75rem;">
                     <div style="padding:1rem 2rem; border:2px solid var(--color-primary); border-radius: var(--radius-md); background:var(--bg-main); width:100%; max-width:400px; text-align:center; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                        <strong style="color:var(--color-primary);">Introduction / भूमिका</strong>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${SecurityUtils.escapeHtml(structAnalysis.intro?.verdict || '')}</div>
                     </div>
                     <i data-lucide="arrow-down" style="color:var(--color-primary-light); width:24px; height:24px;"></i>
                     <div style="padding:1rem 2rem; border:2px solid var(--color-secondary); border-radius: var(--radius-md); background:var(--bg-main); width:100%; max-width:400px; text-align:center; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                        <strong style="color:var(--color-secondary);">Body / मुख्य भाग</strong>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${SecurityUtils.escapeHtml(structAnalysis.body?.verdict || '')}</div>
                     </div>
                     <i data-lucide="arrow-down" style="color:var(--color-secondary); width:24px; height:24px;"></i>
                     <div style="padding:1rem 2rem; border:2px solid var(--color-gold); border-radius: var(--radius-md); background:var(--bg-main); width:100%; max-width:400px; text-align:center; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                        <strong style="color:var(--color-gold);">Way Forward / निष्कर्ष</strong>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${SecurityUtils.escapeHtml(structAnalysis.conclusion?.verdict || '')}</div>
                     </div>
                   </div>
                   <div style="text-align:center; margin-top:2rem; font-size:0.85rem; color:var(--text-muted);">
                     <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;margin-right:0.25rem;"></i>
                     Use this flow to structure your answers logically.
                   </div>
                </div>
              </div>
            ` : ''}

            <!-- How to Improve (Interactive Checklist) -->
            ${improvSteps && improvSteps.length > 0 ? `
              <div class="aw-section-card" style="border-color:var(--color-primary-light);">
                <div class="aw-section-header" style="color:var(--color-primary-light);">
                  <i data-lucide="list-ordered"></i>
                  <span>${this.evalLanguageMode === 'HINDI' ? `सुधार के ${improvSteps.length} व्यावहारिक कदम (Actionable Roadmap)` : `Actionable ${improvSteps.length}-Step Improvement Roadmap`}</span>
                </div>
                <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:1.5rem;">
                  ${this.evalLanguageMode === 'HINDI' ? 'प्रत्येक चरण पर क्लिक करके चिह्नित करें कि आपने समीक्षा व संशोधन कर लिया है:' : 'Click each step to tick off as you review and rewrite your answer:'}
                </p>
                <div class="aw-timeline-container">
                  ${improvSteps.map((step, idx) => {
                    const enRaw = step.stepEn || step.en || step.text || (typeof step === 'string' ? step : '');
                    const hiRaw = step.stepHi || step.hi || '';
                    const cleanEn = String(enRaw || '').replace(/^\d+[\.:\)]\s*/, '').trim();
                    const cleanHi = String(hiRaw || '').replace(/^\d+[\.:\)]\s*/, '').trim();
                    const primaryText = (this.evalLanguageMode === 'HINDI' && cleanHi) ? cleanHi : (cleanEn || cleanHi || `Step ${idx + 1} recommendation`);

                    return `
                      <div class="aw-timeline-step aw-checklist-item" onclick="this.classList.toggle('completed'); this.classList.toggle('checked');">
                        <div class="aw-timeline-marker aw-checklist-num">${idx + 1}</div>
                        <div class="aw-timeline-content aw-checklist-body">
                          <div class="aw-checklist-title aw-markdown-content" style="margin:0; font-weight:500; color:var(--text-main);">
                            ${this.renderMarkdown(primaryText)}
                          </div>
                          ${(isBilingual && cleanHi && cleanHi !== cleanEn && /[\u0900-\u097F]/.test(cleanHi)) ? `
                            <div class="aw-hindi-block aw-markdown-content" style="margin-top:0.35rem; font-size:0.86rem; line-height:1.55;">
                              🇮🇳 <strong style="color:var(--color-primary-light);">सुझाव:</strong> ${this.renderMarkdown(cleanHi)}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- ============================================================== -->
          <!-- RIGHT COLUMN: BENCHMARK MODEL ANSWER & INTERACTIVE AI TUTOR -->
          <!-- ============================================================== -->
          <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <!-- Benchmark Model Answer Comparison Card -->
            <div class="aw-section-card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
                <div class="aw-section-header" style="margin-bottom:0;">
                  <i data-lucide="award" style="color:var(--color-gold);"></i>
                  <span>${this.evalLanguageMode === 'HINDI' ? 'आदर्श उत्तर तुलना (Model Answer)' : 'Topper Benchmark Model Answer'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <button class="aw-tts-btn" onclick="answerWritingView.speakText('${SecurityUtils.escapeHtml(ev.improvedAnswer || '').replace(/'/g, "\\'")}')" title="Listen to model answer read aloud">
                    <i data-lucide="volume-2" style="width:14px;height:14px;"></i>
                    <span>Listen Aloud</span>
                  </button>
                  <button class="aw-tts-btn" onclick="answerWritingView.copyToClipboard('${SecurityUtils.escapeHtml(ev.improvedAnswer || '').replace(/'/g, "\\'")}', 'Model Answer')" title="Copy model answer">
                    <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    <span>Copy</span>
                  </button>
                  <span class="aw-badge aw-badge-marks">Topper Standard</span>
                </div>
              </div>

              <div class="aw-comparison-grid">
                <div class="aw-compare-box">
                  <div class="aw-compare-header" style="color:var(--text-secondary);">
                    <i data-lucide="user"></i>
                    <span>Your Submitted Version</span>
                  </div>
                  <div style="white-space:pre-wrap; color:var(--text-main); font-size:0.92rem; line-height:1.6;">${SecurityUtils.escapeHtml(this.studentAnswerText || '')}</div>
                </div>

                <div class="aw-compare-box model-box">
                  <div class="aw-compare-header" style="color:var(--color-success);">
                    <i data-lucide="sparkles"></i>
                    <span>Topper Model Answer</span>
                  </div>
                  <div class="aw-markdown-content" style="color:var(--text-main); font-size:0.92rem; line-height:1.6;">${this.renderMarkdown(ev.improvedAnswer || '')}</div>
                </div>
              </div>

              <!-- Hindi Model Answer (If available or in bilingual mode) -->
              ${(isBilingual || isHindi) && ev.improvedAnswerHi ? `
                <div style="margin-top:1.25rem; background:rgba(79, 70, 229, 0.05); border:1px solid rgba(79, 70, 229, 0.2); border-radius:var(--radius-lg); padding:1rem 1.25rem;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
                    <strong style="color:var(--color-primary-light); font-size:0.88rem; display:flex; align-items:center; gap:0.4rem;">
                      <i data-lucide="bookmark" style="width:14px;height:14px;"></i>
                      <span>🇮🇳 आदर्श उत्तर (Hindi Model Answer Reference):</span>
                    </strong>
                    <button class="aw-tts-btn" onclick="answerWritingView.copyToClipboard('${SecurityUtils.escapeHtml(ev.improvedAnswerHi || '').replace(/'/g, "\\'")}', 'Hindi Model Answer')" title="Copy Hindi answer">
                      <i data-lucide="copy" style="width:12px;height:12px;"></i>
                      <span>Copy Hindi</span>
                    </button>
                  </div>
                  <div class="aw-markdown-content" style="color:var(--text-main); font-size:0.9rem; line-height:1.65; font-family:'Noto Sans Devanagari', inherit;">${this.renderMarkdown(ev.improvedAnswerHi)}</div>
                </div>
              ` : ''}
            </div>

            <!-- UPSC Standard 5-Point Rubric Checklist -->
            <div class="aw-section-card">
              <div class="aw-section-header">
                <i data-lucide="check-square" style="color:var(--color-success);"></i>
                <span>UPSC Official Rubric Adherence</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.88rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; background:var(--bg-secondary); border-radius:var(--radius-md);">
                  <span>1. Core Directive Addressed Directly</span>
                  <span class="aw-badge aw-badge-exam">${sc.relevance >= 7.0 ? 'Satisfied' : 'Partial'}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; background:var(--bg-secondary); border-radius:var(--radius-md);">
                  <span>2. Structural Segregation (Intro-Body-Conclusion)</span>
                  <span class="aw-badge aw-badge-subject">${sc.structure >= 7.0 ? 'Well Structured' : 'Needs Subheadings'}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; background:var(--bg-secondary); border-radius:var(--radius-md);">
                  <span>3. Multi-Dimensional Arguments (PESTLE)</span>
                  <span class="aw-badge aw-badge-difficulty">${sc.analysis >= 7.0 ? 'Comprehensive' : 'Expand Dimensions'}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; background:var(--bg-secondary); border-radius:var(--radius-md);">
                  <span>4. Word Limit & Time Adherence</span>
                  <span class="aw-badge aw-badge-marks">${this.getWordCount(this.studentAnswerText)}w / ${q.wordLimit || 150}w</span>
                </div>
              </div>
            </div>

            <!-- Before vs After Phrasing Upgrades -->
            ${ev.beforeAfter && ev.beforeAfter.length > 0 ? `
              <div class="aw-section-card">
                <div class="aw-section-header">
                  <i data-lucide="git-compare"></i>
                  <span>Before vs After: Targeted Phrasing Upgrades</span>
                </div>
                ${ev.beforeAfter.map(ba => `
                  <div class="aw-before-after-card">
                    <div class="aw-ba-row">
                      <div class="aw-ba-item aw-ba-before">
                        <strong style="display:block; margin-bottom:0.25rem; font-size:0.75rem; color:var(--color-error); text-transform:uppercase;">Original Phrase</strong>
                        "${SecurityUtils.escapeHtml(ba.before)}"
                      </div>
                      <div class="aw-ba-item aw-ba-after">
                        <strong style="display:block; margin-bottom:0.25rem; font-size:0.75rem; color:var(--color-success); text-transform:uppercase;">Topper Phrasing</strong>
                        "${SecurityUtils.escapeHtml(ba.after)}"
                      </div>
                    </div>
                    <div class="aw-ba-why">
                      <i data-lucide="lightbulb" style="width:14px;height:14px;flex-shrink:0;"></i>
                      <span><strong>Why this is better:</strong> ${SecurityUtils.escapeHtml(ba.whyBetter)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Interactive AI Tutor Follow-up Chat -->
            <div class="aw-tutor-console">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:0.65rem;">
                  <div style="width:34px; height:34px; border-radius:50%; background:var(--gradient-brand); display:flex; align-items:center; justify-content:center; color:#fff;">
                    <i data-lucide="bot" style="width:18px;height:18px;"></i>
                  </div>
                  <div>
                    <h4 style="font-size:1.05rem; font-weight:750; color:var(--text-main); margin:0;">Ask Tutor About My Answer</h4>
                    <span style="font-size:0.8rem; color:var(--text-muted);">Have questions on your evaluation or exam strategy? Ask your tutor.</span>
                  </div>
                </div>
              </div>

              <div class="aw-tutor-messages" id="aw-tutor-messages">
                <div class="aw-tutor-bubble tutor">
                  Namaste! I have evaluated your answer for <strong>"${SecurityUtils.escapeHtml(this.activeQuestion?.question || '')}"</strong>. What would you like to clarify? Ask about opening hooks, relevant committee citations, or diagrams!
                </div>
                ${this.tutorChatHistory.map(m => `
                  <div class="aw-tutor-bubble ${m.role === 'user' ? 'student' : 'tutor'}">
                    ${SecurityUtils.escapeHtml(m.text)}
                  </div>
                `).join('')}
              </div>

              <!-- Quick Suggestion Chips -->
              <div class="aw-tutor-chips">
                <button type="button" class="aw-tutor-chip" onclick="answerWritingView.sendQuickTutorPrompt('How can I make my introduction more impactful in 2 lines?')">
                  ⚡ 2-Line Intro Hook?
                </button>
                <button type="button" class="aw-tutor-chip" onclick="answerWritingView.sendQuickTutorPrompt('What committees, reports or Supreme Court cases should I cite?')">
                  📜 Relevant Committees & Cases?
                </button>
                <button type="button" class="aw-tutor-chip" onclick="answerWritingView.sendQuickTutorPrompt('What diagram or flowchart can I draw for this question?')">
                  📊 Suggest a Diagram / Flowchart
                </button>
                <button type="button" class="aw-tutor-chip" onclick="answerWritingView.sendQuickTutorPrompt('How would a topper structure this answer?')">
                  🏆 Topper Structure Advice?
                </button>
              </div>

              <form onsubmit="answerWritingView.handleTutorQuestionSubmit(event)" class="aw-tutor-input-row">
                <input 
                  type="text" 
                  id="aw-tutor-input" 
                  class="aw-tutor-input" 
                  placeholder="Ask your tutor (e.g. How can I improve my conclusion?)..."
                  autocomplete="off">
                <button type="submit" class="btn btn-primary btn-sm" id="aw-tutor-send-btn">
                  <i data-lucide="send" style="width:15px;height:15px;"></i>
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- ================================================================ -->
        <!-- 4. REINFORCE YOUR SKILL ACTION BAR -->
        <!-- ================================================================ -->
        <div class="aw-practice-bar">
          <div>
            <h4 style="font-size:1.05rem; font-weight:750; color:var(--text-main); margin-bottom:0.25rem;">
              Reinforce Your Skill with Practice
            </h4>
            <span style="font-size:0.85rem; color:var(--text-muted);">
              Progressive revision turns feedback into marks in competitive examinations.
            </span>
          </div>

          <div class="aw-practice-btns">
            <button class="btn btn-secondary btn-sm" onclick="answerWritingView.practiceSimilarQuestion()">
              <i data-lucide="refresh-cw"></i>
              <span>Practice Similar Question</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="answerWritingView.practiceHarderTopic()">
              <i data-lucide="zap" style="color:var(--color-gold);"></i>
              <span>Higher Difficulty Drill</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="answerWritingView.practiceWeakArea()">
              <i data-lucide="target"></i>
              <span>Target Weak Area</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // SUB-TAB 2: SYLLABUS PRACTICE DRILLS
  // =========================================================================
  renderPracticeHtml() {
    const practiceTopics = [
      {
        subject: "Polity & Constitution (GS 2)",
        directive: "Critically Examine",
        title: "Judicial Review vs Judicial Activism: Safeguarding fundamental rights without legislative overreach.",
        exam: "UPSC",
        limit: 150,
        marks: 10
      },
      {
        subject: "Indian Economy (GS 3)",
        directive: "Analyze",
        title: "The challenges of jobless growth in India's services sector and the policy imperative for MSME revitalization.",
        exam: "UPSC",
        limit: 250,
        marks: 15
      },
      {
        subject: "Geography & Ecology (GS 1/3)",
        directive: "Discuss",
        title: "Urban flooding in Indian metropolitan cities as an anthropogenic crisis rather than a mere natural hazard.",
        exam: "State PSC",
        limit: 150,
        marks: 10
      },
      {
        subject: "Ethics & Integrity (GS 4)",
        directive: "Evaluate",
        title: "Emotional Intelligence as a vital competency in conflict resolution during communal and law & order distress.",
        exam: "UPSC",
        limit: 150,
        marks: 10
      },
      {
        subject: "International Relations (GS 2)",
        directive: "Elucidate",
        title: "India's 'Neighborhood First' policy amidst shifting geopolitical dynamics in South Asia.",
        exam: "UPSC",
        limit: 150,
        marks: 10
      },
      {
        subject: "Science & Technology (GS 3)",
        directive: "Examine",
        title: "Ethical and regulatory dilemmas surrounding Artificial Intelligence deployment in public healthcare.",
        exam: "State PSC",
        limit: 150,
        marks: 10
      }
    ];

    return `
      <div class="aw-practice-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
          <div>
            <h3 style="font-size:1.35rem; font-weight:750; color:var(--text-main);">Curated Examination Practice Drills</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Select a high-yield question from our syllabus database or generate custom target practice.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="answerWritingView.openAiQuestionModal()">
            <i data-lucide="sparkles"></i>
            <span>Generate Custom AI Topic</span>
          </button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(350px, 1fr)); gap:1.25rem;">
          ${practiceTopics.map((pt, i) => `
            <div class="aw-history-card" onclick="answerWritingView.startPracticeTopic(${i})">
              <div>
                <div class="aw-history-card-header">
                  <span class="aw-badge aw-badge-subject">${SecurityUtils.escapeHtml(pt.subject)}</span>
                  <span class="aw-badge aw-badge-marks">${pt.marks} Marks • ${pt.limit}w</span>
                </div>
                <div class="aw-history-card-question">
                  <strong>${SecurityUtils.escapeHtml(pt.directive)}:</strong> ${SecurityUtils.escapeHtml(pt.title)}
                </div>
              </div>
              <div class="aw-history-card-footer">
                <span>Directive: ${SecurityUtils.escapeHtml(pt.directive)}</span>
                <span style="color:var(--color-primary-light); font-weight:700; display:flex; align-items:center; gap:0.25rem;">
                  <span>Write Answer</span>
                  <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // SUB-TAB 3: ANSWER HISTORY
  // =========================================================================
  async renderHistoryHtml() {
    const attempts = await getAllAnswerAttempts();

    const filtered = attempts.filter(att => {
      if (this.historyFilterSubject !== 'ALL' && att.subject !== this.historyFilterSubject) return false;
      if (this.historyFilterExam !== 'ALL' && att.exam !== this.historyFilterExam) return false;
      if (this.searchHistoryQuery) {
        const q = (att.question || '').toLowerCase();
        const s = (att.subject || '').toLowerCase();
        const query = this.searchHistoryQuery.toLowerCase();
        if (!q.includes(query) && !s.includes(query)) return false;
      }
      return true;
    });

    return `
      <div class="aw-history-container">
        <!-- Toolbar Filters -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
            <div style="position:relative; width:260px;">
              <input 
                type="text" 
                class="input-field" 
                placeholder="Search history questions..." 
                value="${SecurityUtils.escapeHtml(this.searchHistoryQuery)}" 
                oninput="answerWritingView.handleHistorySearch(this.value)"
                style="width:100%; padding-left:2rem;">
              <i data-lucide="search" style="position:absolute; left:0.7rem; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--text-muted);"></i>
            </div>

            <select class="input-field" onchange="answerWritingView.filterHistorySubject(this.value)" style="font-size:0.88rem;">
              <option value="ALL" ${this.historyFilterSubject === 'ALL' ? 'selected' : ''}>All Subjects</option>
              <option value="Polity & Governance" ${this.historyFilterSubject === 'Polity & Governance' ? 'selected' : ''}>Polity</option>
              <option value="Indian Economy" ${this.historyFilterSubject === 'Indian Economy' ? 'selected' : ''}>Economy</option>
              <option value="Geography & Economy" ${this.historyFilterSubject === 'Geography & Economy' ? 'selected' : ''}>Geography</option>
              <option value="Ethics & Integrity" ${this.historyFilterSubject === 'Ethics & Integrity' ? 'selected' : ''}>Ethics</option>
            </select>

            <select class="input-field" onchange="answerWritingView.filterHistoryExam(this.value)" style="font-size:0.88rem;">
              <option value="ALL" ${this.historyFilterExam === 'ALL' ? 'selected' : ''}>All Exams</option>
              <option value="UPSC" ${this.historyFilterExam === 'UPSC' ? 'selected' : ''}>UPSC</option>
              <option value="State PSC" ${this.historyFilterExam === 'State PSC' ? 'selected' : ''}>State PSC</option>
            </select>
          </div>

          <div style="font-size:0.88rem; color:var(--text-muted); font-weight:600;">
            Showing ${filtered.length} of ${attempts.length} attempts
          </div>
        </div>

        ${filtered.length === 0 ? `
          <div class="aw-section-card" style="text-align:center; padding:3.5rem 1.5rem;">
            <i data-lucide="book-open" style="width:40px;height:40px;color:var(--text-muted);margin-bottom:0.75rem;"></i>
            <h4 style="font-size:1.15rem; font-weight:750; color:var(--text-main);">No Answer Attempts Found</h4>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:0.25rem;">
              ${attempts.length === 0 ? "You haven't evaluated any answers yet. Start your first practice session now!" : "No attempts match the selected search or filters."}
            </p>
            ${attempts.length === 0 ? `
              <button class="btn btn-primary btn-sm" onclick="answerWritingView.switchSubTab('new-answer')" style="margin-top:1rem;">
                <i data-lucide="pen-tool"></i>
                <span>Write First Answer</span>
              </button>
            ` : ''}
          </div>
        ` : `
          <div class="aw-history-grid">
            ${filtered.map(att => `
              <div class="aw-history-card" onclick="answerWritingView.openHistoryAttempt(${att.id})">
                <div>
                  <div class="aw-history-card-header">
                    <span class="aw-badge aw-badge-exam">${SecurityUtils.escapeHtml(att.exam || 'UPSC')}</span>
                    <span class="aw-badge aw-badge-subject">${SecurityUtils.escapeHtml(att.subject || 'GS')}</span>
                    <span class="aw-badge ${att.score >= 7.5 ? 'aw-badge-difficulty' : (att.score >= 6 ? 'aw-badge-subject' : 'aw-badge-marks')}">
                      ${att.score != null ? `${Number(att.score).toFixed(1)}/10` : 'Evaluated'}
                    </span>
                  </div>

                  <div class="aw-history-card-question">
                    ${SecurityUtils.escapeHtml(att.question || '')}
                  </div>

                  <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                    <strong>Strength:</strong> ${SecurityUtils.escapeHtml(att.mainStrength || 'Good flow')}
                  </div>
                  <div style="font-size:0.82rem; color:var(--color-warning);">
                    <strong>Improvement:</strong> ${SecurityUtils.escapeHtml(att.mainWeakness || 'Needs depth')}
                  </div>
                </div>

                <div class="aw-history-card-footer">
                  <span>${new Date(att.createdAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })}</span>
                  <span style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-weight:700; color:var(--color-primary-light);">${att.actualWordCount || 0}w</span>
                    <button class="icon-btn" onclick="event.stopPropagation(); answerWritingView.deleteAttempt(${att.id})" title="Delete attempt" style="width:28px;height:28px;">
                      <i data-lucide="trash" style="width:13px;height:13px;color:var(--color-error);"></i>
                    </button>
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  // =========================================================================
  // SUB-TAB 4: PERFORMANCE & PROGRESS
  // =========================================================================
  async renderPerformanceHtml() {
    const stats = await getAnswerWritingStats();

    return `
      <div class="aw-performance-container">
        <!-- Top Metrics Cards -->
        <div class="aw-perf-metrics-grid">
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val">${stats.totalAttempted}</div>
            <div class="aw-perf-metric-lbl">Total Answers</div>
          </div>
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val">${stats.totalEvaluated}</div>
            <div class="aw-perf-metric-lbl">Evaluated by AI</div>
          </div>
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val" style="color:var(--color-gold);">${stats.averageScore}/10</div>
            <div class="aw-perf-metric-lbl">Average Score</div>
          </div>
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val" style="color:var(--color-success);">${stats.complianceRate}%</div>
            <div class="aw-perf-metric-lbl">Word Limit Compliance</div>
          </div>
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val" style="font-size:1.35rem; color:var(--color-success);">${SecurityUtils.escapeHtml(stats.strongestSkill.name)}</div>
            <div class="aw-perf-metric-lbl">Strongest Skill (${stats.strongestSkill.score}/10)</div>
          </div>
          <div class="aw-perf-metric-card">
            <div class="aw-perf-metric-val" style="font-size:1.35rem; color:var(--color-warning);">${SecurityUtils.escapeHtml(stats.weakestSkill.name)}</div>
            <div class="aw-perf-metric-lbl">Focus Weak Area (${stats.weakestSkill.score}/10)</div>
          </div>
        </div>

        <!-- 6-Dimension Skill Breakdown & Subject Analytics -->
        <div style="display:grid; grid-template-columns:1.2fr 0.8fr; gap:1.5rem;">
          <div class="aw-skill-bars-card">
            <h4 style="font-size:1.15rem; font-weight:750; color:var(--text-main); margin-bottom:1.25rem; display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="bar-chart-2" style="color:var(--color-primary-light);"></i>
              <span>6-Dimensional Examination Mastery</span>
            </h4>

            ${Object.entries(stats.skillAverages).map(([k, val]) => `
              <div class="aw-skill-bar-row">
                <div class="aw-skill-bar-labels">
                  <span>${capitalizeSkillName(k)}</span>
                  <span style="color:var(--color-primary-light);">${val} / 10</span>
                </div>
                <div class="aw-skill-bar-track">
                  <div class="aw-skill-bar-fill" style="width:${(val / 10) * 100}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="aw-skill-bars-card">
            <h4 style="font-size:1.15rem; font-weight:750; color:var(--text-main); margin-bottom:1.25rem; display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="book-open" style="color:var(--color-gold);"></i>
              <span>Subject-Wise Performance</span>
            </h4>

            ${stats.subjectStats.length === 0 ? `
              <p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:2rem 0;">
                Practice across different subjects (Polity, Economy, Geography) to view comparative scores.
              </p>
            ` : `
              <div style="display:flex; flex-direction:column; gap:0.85rem;">
                ${stats.subjectStats.map(ss => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--bg-secondary); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                    <div>
                      <strong style="display:block; font-size:0.92rem; color:var(--text-main);">${SecurityUtils.escapeHtml(ss.subject)}</strong>
                      <span style="font-size:0.78rem; color:var(--text-muted);">${ss.attempts} attempts</span>
                    </div>
                    <span class="aw-badge aw-badge-difficulty">${ss.avgScore} / 10</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // ACTIONS & HANDLERS
  // =========================================================================

  setInputMode(mode) {
    this.inputMode = mode;
    const typeStudio = document.getElementById('aw-type-studio');
    const uploadStudio = document.getElementById('aw-upload-studio');
    if (typeStudio) typeStudio.style.display = mode === 'TYPE' ? 'flex' : 'none';
    if (uploadStudio) uploadStudio.style.display = mode === 'UPLOAD' ? 'block' : 'none';

    document.querySelectorAll('.aw-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(mode));
    });

    if (window.audioEngine) window.audioEngine.playClick();
  }

  handleAnswerInput(e) {
    this.studentAnswerText = e.target.value;
    this.updateLiveWordCount();

    // Auto-save debounce
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      this.saveDraftAuto();
    }, 1200);
  }

  updateLiveWordCount() {
    const text = this.studentAnswerText || '';
    const words = this.getWordCount(text);
    const chars = text.length;
    const limit = this.activeQuestion?.wordLimit || 150;
    const pct = Math.min(130, Math.round((words / (limit || 1)) * 100));

    const numEl = document.getElementById('aw-word-count-num');
    if (numEl) numEl.textContent = String(words);

    const tagEl = document.getElementById('aw-word-status-tag');
    let statusClass = 'aw-status-optimal';
    let statusText = 'Target Zone';
    let progressClass = '';

    if (words === 0) {
      statusClass = 'aw-status-low';
      statusText = 'Drafting';
    } else if (words > limit * 1.15) {
      statusClass = 'aw-status-exceeded';
      statusText = 'Exceeded Limit';
      progressClass = 'exceeded';
    } else if (words > limit) {
      statusClass = 'aw-status-warning';
      statusText = 'Near Limit';
      progressClass = 'warning';
    } else if (words < limit * 0.6) {
      statusClass = 'aw-status-low';
      statusText = 'Under Limit';
    }

    if (tagEl) {
      tagEl.className = `aw-word-status-tag ${statusClass}`;
      tagEl.textContent = statusText;
    }

    const fillEl = document.getElementById('aw-word-progress-fill');
    if (fillEl) {
      fillEl.style.width = `${Math.min(100, pct)}%`;
      fillEl.className = `aw-word-progress-fill ${progressClass}`;
    }

    // Health badges
    const hasIntro = words >= 15;
    const hasBody = (text.includes('\n') || text.includes('•') || words >= 60);
    const hasWayForward = /way forward|conclusion|in fine|thus|hence|reforms|roadmap/i.test(text);

    const hIntro = document.getElementById('aw-health-intro');
    const hBody = document.getElementById('aw-health-body');
    const hConc = document.getElementById('aw-health-conclusion');

    if (hIntro) hIntro.className = `aw-health-chip ${hasIntro ? 'detected' : ''}`;
    if (hBody) hBody.className = `aw-health-chip ${hasBody ? 'detected' : ''}`;
    if (hConc) hConc.className = `aw-health-chip ${hasWayForward ? 'detected' : ''}`;
  }

  getWordCount(str) {
    if (!str || !str.trim()) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  clearAnswerEditor() {
    if (confirm('Clear the answer text area?')) {
      this.studentAnswerText = '';
      const ta = document.getElementById('aw-answer-textarea');
      if (ta) ta.value = '';
      this.updateLiveWordCount();
    }
  }

  applyFormat(type) {
    const textarea = document.getElementById('aw-answer-textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.substring(start, end);

    let replacement = '';
    if (type === 'bold') {
      replacement = `**${selected || 'bold text'}**`;
    } else if (type === 'italic') {
      replacement = `*${selected || 'italic text'}*`;
    } else if (type === 'underline') {
      replacement = `<u>${selected || 'underlined text'}</u>`;
    } else if (type === 'bullet') {
      replacement = selected ? selected.split('\n').map(line => line.startsWith('• ') ? line : `• ${line}`).join('\n') : '\n• Key argument: ';
    } else if (type === 'numbered') {
      replacement = selected ? selected.split('\n').map((line, idx) => `${idx + 1}. ${line.replace(/^\d+\.\s*/, '')}`).join('\n') : '\n1. Key argument: ';
    } else if (type === 'heading') {
      replacement = `\n\n### ${selected || 'Thematic Dimension'}\n`;
    } else if (type === 'clean') {
      replacement = val.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      textarea.value = replacement;
      this.studentAnswerText = replacement;
      this.updateLiveWordCount();
      return;
    }

    textarea.value = val.substring(0, start) + replacement + val.substring(end);
    textarea.selectionStart = start + replacement.length;
    textarea.selectionEnd = start + replacement.length;
    textarea.focus();
    this.studentAnswerText = textarea.value;
    this.updateLiveWordCount();
  }

  toggleFullscreen() {
    this.isFullscreenMode = !this.isFullscreenMode;
    const card = document.getElementById('aw-type-studio');
    if (card) {
      card.classList.toggle('fullscreen-mode', this.isFullscreenMode);
    }
    const btn = document.getElementById('aw-fullscreen-btn');
    if (btn) {
      btn.innerHTML = this.isFullscreenMode 
        ? '<i data-lucide="minimize-2" style="width:14px;height:14px;"></i><span>Exit Zen</span>'
        : '<i data-lucide="maximize-2" style="width:14px;height:14px;"></i><span>Fullscreen</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // =========================================================================
  // EXAM STOPWATCH / COUNTDOWN TIMER
  // =========================================================================
  toggleTimer() {
    if (this.timerIsRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  startTimer() {
    if (this.timerIsRunning) return;
    this.timerIsRunning = true;
    this.updateTimerPill();
    this.timerInterval = setInterval(() => {
      if (this.timerRemaining > 0) {
        this.timerRemaining--;
        this.updateTimerPill();
        if (this.timerRemaining === 0) {
          this.pauseTimer();
          if (window.audioEngine) window.audioEngine.playNotification?.();
          if (window.app) window.app.showToast('⏱️ Exam time limit reached! Please conclude and review.', 'warning');
        }
      }
    }, 1000);
  }

  pauseTimer() {
    this.timerIsRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.updateTimerPill();
  }

  resetTimer() {
    this.pauseTimer();
    const limit = this.activeQuestion?.wordLimit || 150;
    this.timerDuration = limit <= 150 ? 7 * 60 : (limit <= 250 ? 11 * 60 : 15 * 60);
    this.timerRemaining = this.timerDuration;
    this.updateTimerPill();
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  updateTimerPill() {
    const timeEl = document.getElementById('aw-timer-val');
    const container = document.getElementById('aw-timer-container');
    const playBtn = document.getElementById('aw-timer-toggle-btn');
    if (timeEl) timeEl.textContent = this.formatTime(this.timerRemaining);
    if (container) {
      container.className = 'aw-timer-container' + 
        (this.timerIsRunning ? ' running' : '') +
        (this.timerRemaining <= 120 && this.timerRemaining > 0 ? ' warning' : '') +
        (this.timerRemaining === 0 ? ' ended' : '');
    }
    if (playBtn) {
      playBtn.innerHTML = this.timerIsRunning 
        ? '<i data-lucide="pause" style="width:14px;height:14px;"></i>' 
        : '<i data-lucide="play" style="width:14px;height:14px;"></i>';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async saveDraftAuto() {
    if (!this.studentAnswerText || !this.studentAnswerText.trim()) return;
    try {
      await saveAnswerDraft({
        question: this.activeQuestion?.question,
        directive: this.activeQuestion?.directive,
        exam: this.activeQuestion?.exam,
        subject: this.activeQuestion?.subject,
        difficulty: this.activeQuestion?.difficulty,
        wordLimit: this.activeQuestion?.wordLimit,
        marks: this.activeQuestion?.marks,
        studentAnswer: this.studentAnswerText,
        inputSource: this.inputSource
      });
      const ind = document.getElementById('aw-draft-indicator');
      if (ind) ind.style.opacity = '1';
    } catch (e) {}
  }

  async saveDraftManual() {
    await this.saveDraftAuto();
    if (window.app) window.app.showToast('Draft successfully saved to browser local storage!', 'success');
  }

  // =========================================================================
  // FILE UPLOAD & OCR EXTRACTION
  // =========================================================================
  async handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    for (const f of files) {
      if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
        this.uploadedFiles.push({ file: f, previewUrl: null });
      } else {
        const previewUrl = URL.createObjectURL(f);
        this.uploadedFiles.push({ file: f, previewUrl });
      }
    }

    const container = document.getElementById('aw-thumbnails-container');
    const grid = document.getElementById('aw-thumbnails-grid');
    if (container) container.style.display = 'block';
    if (grid) grid.innerHTML = this.renderThumbnailsHtml();
    if (window.lucide) window.lucide.createIcons();

    if (window.app) window.app.showToast(`Loaded ${files.length} page(s). Click "Run OCR" to transcribe.`, 'info');
  }

  rotateImage(index) {
    const item = this.uploadedFiles[index];
    if (!item || !item.previewUrl) return;

    const img = new Image();
    img.src = item.previewUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      canvas.toBlob((blob) => {
        const newFile = new File([blob], item.file.name, { type: 'image/jpeg' });
        URL.revokeObjectURL(item.previewUrl);
        item.file = newFile;
        item.previewUrl = URL.createObjectURL(blob);
        const grid = document.getElementById('aw-thumbnails-grid');
        if (grid) grid.innerHTML = this.renderThumbnailsHtml();
        if (window.lucide) window.lucide.createIcons();
      }, 'image/jpeg', 0.9);
    };
  }

  removeUploadedFile(index) {
    if (this.uploadedFiles[index]?.previewUrl) {
      URL.revokeObjectURL(this.uploadedFiles[index].previewUrl);
    }
    this.uploadedFiles.splice(index, 1);
    const container = document.getElementById('aw-thumbnails-container');
    const grid = document.getElementById('aw-thumbnails-grid');
    if (this.uploadedFiles.length === 0 && container) {
      container.style.display = 'none';
    } else if (grid) {
      grid.innerHTML = this.renderThumbnailsHtml();
      if (window.lucide) window.lucide.createIcons();
    }
  }

  clearUploadedFiles() {
    this.uploadedFiles.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    this.uploadedFiles = [];
    const container = document.getElementById('aw-thumbnails-container');
    if (container) container.style.display = 'none';
  }

  async extractTextFromUploaded() {
    if (this.uploadedFiles.length === 0) {
      if (window.app) window.app.showToast('Please upload at least one image or PDF file.', 'warning');
      return;
    }

    const isPdf = this.uploadedFiles.some(f => f.file.type === 'application/pdf' || f.file.name.endsWith('.pdf'));
    this.inputSource = isPdf ? 'PDF' : 'IMAGE';

    try {
      if (window.app) window.app.showToast('Extracting answer text from uploaded documents...', 'info');

      let extracted = '';
      if (isPdf) {
        const pdfItem = this.uploadedFiles.find(f => f.file.type === 'application/pdf' || f.file.name.endsWith('.pdf'));
        const res = await window.answerWritingService.extractAnswerFromPdf(pdfItem.file, (status) => {
          if (status.message && window.app) window.app.showToast(status.message, 'info');
        });
        extracted = res.text;
      } else {
        const rawFiles = this.uploadedFiles.map(i => i.file);
        extracted = await window.answerWritingService.extractAnswerFromImages(rawFiles, (status) => {
          if (status.message && window.app) window.app.showToast(status.message, 'info');
        });
      }

      this.studentAnswerText = extracted;
      this.extractedAnswerText = extracted;
      this.inPreReview = true;
      await this.render();

      if (window.app) window.app.showToast('Text extracted successfully! Please review before AI evaluation.', 'success');
    } catch (err) {
      console.error('OCR Extraction error:', err);
      if (window.app) window.app.showToast(err.message || 'OCR extraction failed', 'error');
    }
  }

  // =========================================================================
  // PRE-EVALUATION REVIEW & SUBMISSION
  // =========================================================================
  proceedToPreReview() {
    if (!this.studentAnswerText || !this.studentAnswerText.trim()) {
      if (window.app) window.app.showToast('Please write or upload your answer before submitting for evaluation.', 'warning');
      return;
    }
    this.inputSource = 'TYPED';
    this.inPreReview = true;
    this.render();
  }

  handleReviewTextChange(val) {
    this.studentAnswerText = val;
  }

  cancelPreReview() {
    this.inPreReview = false;
    this.render();
  }

  async submitFinalAnswerForEvaluation() {
    const text = this.studentAnswerText ? this.studentAnswerText.trim() : '';
    if (!text) {
      if (window.app) window.app.showToast('Answer text cannot be empty.', 'error');
      return;
    }

    this.inPreReview = false;
    this.isEvaluating = true;
    this.currentEvaluation = null;
    this.render();

    try {
      const q = this.activeQuestion;
      const evaluation = await window.answerWritingService.evaluateAnswer({
        exam: q.exam,
        subject: q.subject,
        question: q.question,
        directive: q.directive,
        wordLimit: q.wordLimit,
        marks: q.marks,
        studentAnswer: text,
        inputSource: this.inputSource,
        ocrConfidence: this.ocrConfidence,
        onProgress: (status) => {
          this.evaluationProgressMessage = status.message || 'Analyzing...';
          const pEl = document.getElementById('aw-eval-progress-text');
          if (pEl) pEl.textContent = this.evaluationProgressMessage;
        }
      });

      this.currentEvaluation = evaluation;
      this.isEvaluating = false;
      this.activeView = 'AUTO';

      this.currentAttemptId = await saveAnswerAttempt({
        question: q.question,
        directive: q.directive,
        exam: q.exam,
        subject: q.subject,
        difficulty: q.difficulty,
        wordLimit: q.wordLimit,
        marks: q.marks,
        studentAnswer: text,
        inputSource: this.inputSource,
        evaluation: evaluation,
        tutorChatHistory: []
      });

      await clearAnswerDrafts();

      if (window.audioEngine) window.audioEngine.playSuccess();
      if (window.app) window.app.showToast('Answer successfully evaluated by AI Examiner!', 'success');

      await this.render();
    } catch (err) {
      this.isEvaluating = false;
      console.error('Evaluation error:', err);
      if (window.app) window.app.showToast(err.message || 'Evaluation failed. Please check network/key.', 'error');
      await this.render();
    }
  }

  // =========================================================================
  // TUTOR FOLLOW-UP CHAT & SPEECH SYNTHESIS
  // =========================================================================
  async handleTutorQuestionSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('aw-tutor-input');
    const msg = input ? input.value.trim() : '';
    if (!msg) return;

    input.value = '';
    this.tutorChatHistory.push({ role: 'user', text: msg });
    this.appendTutorChatMessage('student', msg);

    const btn = document.getElementById('aw-tutor-send-btn');
    if (btn) btn.disabled = true;

    try {
      const reply = await window.answerWritingService.askTutorAboutAnswer({
        question: this.activeQuestion?.question,
        studentAnswer: this.studentAnswerText,
        evaluation: this.currentEvaluation,
        chatHistory: this.tutorChatHistory,
        userMessage: msg
      });

      this.tutorChatHistory.push({ role: 'tutor', text: reply });
      this.appendTutorChatMessage('tutor', reply);

      if (this.currentAttemptId) {
        await saveAnswerAttempt({
          id: this.currentAttemptId,
          question: this.activeQuestion?.question,
          studentAnswer: this.studentAnswerText,
          evaluation: this.currentEvaluation,
          tutorChatHistory: this.tutorChatHistory
        });
      }
    } catch (err) {
      this.appendTutorChatMessage('tutor', "I am analyzing your answer structure. Focus on crafting a sharp introduction hook and incorporating at least 2 relevant committee citations.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  sendQuickTutorPrompt(promptText) {
    const input = document.getElementById('aw-tutor-input');
    if (input) {
      input.value = promptText;
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }

  appendTutorChatMessage(role, text) {
    const box = document.getElementById('aw-tutor-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `aw-tutor-bubble ${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  speakText(text) {
    if (!('speechSynthesis' in window)) {
      if (window.app) window.app.showToast('Speech synthesis not available in this browser.', 'warning');
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#•_`]/g, ' ');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    if (window.app) window.app.showToast('🔊 Reading model answer aloud...', 'info');
  }

  copyToClipboard(text, label = 'Content') {
    navigator.clipboard.writeText(text).then(() => {
      if (window.app) window.app.showToast(`📋 ${label} copied to clipboard!`, 'success');
      if (window.audioEngine) window.audioEngine.playSuccess();
    }).catch(() => {
      if (window.app) window.app.showToast('Could not copy to clipboard.', 'warning');
    });
  }

  async printEvaluationReport() {
    if (!this.currentEvaluation) {
      if (window.app) window.app.showToast('No evaluation available to export.', 'warning');
      return;
    }

    if (window.app) window.app.showToast('📄 Generating official UPSC A4 Evaluation Sheet PDF...', 'info');

    if (window.pdfGenerator && typeof window.pdfGenerator.generateAnswerWritingReportPdf === 'function') {
      try {
        await window.pdfGenerator.generateAnswerWritingReportPdf({
          evaluation: this.currentEvaluation,
          question: this.activeQuestion?.question || '',
          directive: this.activeQuestion?.directive || 'Discuss',
          studentAnswer: this.studentAnswerText || '',
          wordLimit: this.activeQuestion?.wordLimit || 150,
          marks: this.activeQuestion?.marks || 10,
          exam: this.activeQuestion?.exam || 'UPSC',
          subject: this.activeQuestion?.subject || 'General Studies',
          languageMode: this.evalLanguageMode || 'BILINGUAL'
        });
        if (window.audioEngine) window.audioEngine.playSuccess();
        if (window.app) window.app.showToast('✅ Official UPSC A4 Evaluation Sheet generated successfully!', 'success');
      } catch (err) {
        console.error('PDF generation error, falling back to print dialog:', err);
        window.print();
      }
    } else {
      window.print();
    }
  }

  setEvalLanguageMode(mode) {
    this.evalLanguageMode = mode;
    if (window.audioEngine) window.audioEngine.playClick();
    if (window.app) {
      const labels = {
        BILINGUAL: '🌐 Bilingual Mode (English + हिंदी)',
        ENGLISH: 'English Mode',
        HINDI: '🇮🇳 हिंदी माध्यम (Hindi Mode)'
      };
      window.app.showToast(`Analysis language set to ${labels[mode] || mode}`, 'info');
    }
    this.render();
  }

  toggleVisualDiagram(checked) {
    this.showVisualDiagram = checked;
    const panel = document.getElementById('aw-visual-diagram-panel');
    if (panel) {
      panel.classList.toggle('collapsed', !checked);
    }
    if (window.audioEngine) window.audioEngine.playClick();
    if (window.app) {
      window.app.showToast(checked ? '📊 Exam Flowchart / Concept Diagram displayed' : 'Flowchart panel hidden', 'info');
    }
  }

  returnToEditing() {
    this.activeView = 'STUDIO';
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
    if (window.app) window.app.showToast('Returned to Answer Writing Studio', 'info');
  }

  viewEvaluationReport() {
    this.activeView = 'AUTO';
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  copyDiagramBlueprint() {
    const diag = this.currentEvaluation?.visualDiagram;
    if (!diag) return;
    const content = diag.asciiBlueprint || diag.drawingInstructions || diag.diagramDescription || '';
    this.copyToClipboard(content, 'Exam Blueprint');
  }

  handleBrainstormingInput(val) {
    this.brainstormingNotes = val;
  }

  // =========================================================================
  // PRACTICE AGAIN FLOWS
  // =========================================================================
  async practiceSimilarQuestion() {
    if (window.app) window.app.showToast('Generating similar practice question...', 'info');
    const nextQ = await window.answerWritingService.generatePracticeQuestion({
      type: 'similar',
      previousQuestion: this.activeQuestion?.question,
      subject: this.activeQuestion?.subject,
      exam: this.activeQuestion?.exam
    });
    this.setNewActiveQuestion(nextQ);
  }

  async practiceHarderTopic() {
    if (window.app) window.app.showToast('Formulating advanced critical question...', 'info');
    const nextQ = await window.answerWritingService.generatePracticeQuestion({
      type: 'harder',
      previousQuestion: this.activeQuestion?.question,
      subject: this.activeQuestion?.subject,
      exam: this.activeQuestion?.exam
    });
    this.setNewActiveQuestion(nextQ);
  }

  async practiceWeakArea() {
    const weakness = this.currentEvaluation?.weaknesses?.[0] || 'Multi-dimensional analysis';
    if (window.app) window.app.showToast(`Targeting weak area: ${weakness}`, 'info');
    const nextQ = await window.answerWritingService.generatePracticeQuestion({
      type: 'weak_area',
      previousQuestion: this.activeQuestion?.question,
      previousWeakness: weakness,
      subject: this.activeQuestion?.subject,
      exam: this.activeQuestion?.exam
    });
    this.setNewActiveQuestion(nextQ);
  }

  async regenerateSimilarQuestion() {
    await this.practiceSimilarQuestion();
  }

  setNewActiveQuestion(q) {
    this.activeQuestion = q;
    this.studentAnswerText = '';
    this.currentEvaluation = null;
    this.currentAttemptId = null;
    this.activeView = 'STUDIO';
    this.brainstormingNotes = '';
    this.tutorChatHistory = [];
    this.inPreReview = false;
    this.clearUploadedFiles();
    this.resetTimer();
    this.render();
    if (window.app) window.app.showToast(`New Question Loaded: ${q.directive || 'Discuss'}`, 'success');
  }

  startPracticeTopic(idx) {
    const practiceTopics = [
      { subject: "Polity & Constitution", directive: "Critically Examine", question: "Critically examine Judicial Review vs Judicial Activism in India: Has the judiciary safeguarded fundamental rights without overstepping into parliamentary domain?", exam: "UPSC", limit: 150, marks: 10 },
      { subject: "Indian Economy", directive: "Analyze", question: "Analyze the challenges of jobless growth in India's services sector and the policy imperative for manufacturing and MSME revitalization.", exam: "UPSC", limit: 250, marks: 15 },
      { subject: "Geography & Ecology", directive: "Discuss", question: "Discuss urban flooding in Indian metropolitan cities as an anthropogenic and planning crisis rather than a mere meteorological hazard.", exam: "State PSC", limit: 150, marks: 10 },
      { subject: "Ethics & Integrity", directive: "Evaluate", question: "Evaluate Emotional Intelligence as a vital leadership competency in conflict resolution during administrative and communal crises.", exam: "UPSC", limit: 150, marks: 10 },
      { subject: "International Relations", directive: "Elucidate", question: "Elucidate India's 'Neighborhood First' policy amidst shifting geopolitical dynamics and China's growing footprint in South Asia.", exam: "UPSC", limit: 150, marks: 10 },
      { subject: "Science & Technology", directive: "Examine", question: "Examine the ethical and regulatory dilemmas surrounding Artificial Intelligence deployment in India's public healthcare ecosystem.", exam: "State PSC", limit: 150, marks: 10 }
    ];

    const chosen = practiceTopics[idx] || practiceTopics[0];
    this.setNewActiveQuestion({
      question: chosen.question,
      directive: chosen.directive,
      subject: chosen.subject,
      exam: chosen.exam,
      difficulty: "MODERATE",
      wordLimit: chosen.limit,
      marks: chosen.marks,
      answerType: "Paragraph Answer",
      syllabusContext: `Core thematic question for ${chosen.exam} Mains`
    });
    this.switchSubTab('new-answer');
  }

  // =========================================================================
  // MODALS: AI QUESTION GENERATION & MANUAL ENTRY (BULLETPROOF DISPLAY)
  // =========================================================================
  openAiQuestionModal() {
    const modal = document.getElementById('aw-ai-question-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  closeAiQuestionModal() {
    const modal = document.getElementById('aw-ai-question-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  async handleAiQuestionSubmit(e) {
    e.preventDefault();
    const exam = document.getElementById('aw-ai-exam')?.value || 'UPSC';
    const subject = document.getElementById('aw-ai-subject')?.value || 'Polity';
    const difficulty = document.getElementById('aw-ai-difficulty')?.value || 'MODERATE';
    const wordLimit = Number(document.getElementById('aw-ai-wordlimit')?.value) || 150;
    const marks = Number(document.getElementById('aw-ai-marks')?.value) || 10;
    const answerType = document.getElementById('aw-ai-answertype')?.value || 'Paragraph Answer';

    const btn = document.getElementById('aw-ai-gen-btn');
    if (btn) btn.disabled = true;

    try {
      if (window.app) window.app.showToast('Generating examination question with AI...', 'info');
      const generated = await window.answerWritingService.generateQuestion({
        exam,
        subject,
        difficulty,
        wordLimit,
        marks,
        answerType
      });

      this.closeAiQuestionModal();
      this.setNewActiveQuestion(generated);
      this.switchSubTab('new-answer');
    } catch (err) {
      if (window.app) window.app.showToast(err.message || 'Question generation failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  openManualQuestionModal() {
    const modal = document.getElementById('aw-manual-question-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      if (window.audioEngine) window.audioEngine.playClick();
      setTimeout(() => {
        const ta = document.getElementById('aw-manual-question');
        if (ta) ta.focus();
      }, 100);
    }
  }

  closeManualQuestionModal() {
    const modal = document.getElementById('aw-manual-question-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  handleManualQuestionInput(text) {
    const directive = window.answerWritingService.extractDirectiveWord(text);
    const directivePill = document.getElementById('aw-manual-live-directive');
    const directiveTip = document.getElementById('aw-manual-directive-tip');
    if (directivePill) directivePill.textContent = directive;
    if (directiveTip) directiveTip.textContent = window.answerWritingService.getDirectiveTip(directive);
  }

  quickFillManualTopic(index) {
    const item = this.quickInspirationTopics[index];
    if (!item) return;

    const qInput = document.getElementById('aw-manual-question');
    const examInput = document.getElementById('aw-manual-exam');
    const subjInput = document.getElementById('aw-manual-subject');
    const diffInput = document.getElementById('aw-manual-difficulty');
    const wlInput = document.getElementById('aw-manual-wordlimit');
    const marksInput = document.getElementById('aw-manual-marks');

    if (qInput) qInput.value = item.question;
    if (examInput) examInput.value = item.exam;
    if (subjInput) subjInput.value = item.subject;
    if (diffInput) diffInput.value = item.difficulty;
    if (wlInput) wlInput.value = item.wordLimit;
    if (marksInput) marksInput.value = item.marks;

    this.handleManualQuestionInput(item.question);
    if (window.audioEngine) window.audioEngine.playClick();
    if (window.app) window.app.showToast(`Selected Topic: ${item.title}`, 'info');
  }

  syncMarksFromWordLimit(val, targetMarksId) {
    const target = document.getElementById(targetMarksId);
    if (!target) return;
    const num = Number(val);
    if (num <= 100) target.value = '10';
    else if (num <= 150) target.value = '10';
    else if (num <= 250) target.value = '15';
    else target.value = '20';
  }

  handleManualQuestionSubmit(e) {
    e.preventDefault();
    const qText = document.getElementById('aw-manual-question')?.value.trim();
    if (!qText) return;

    const exam = document.getElementById('aw-manual-exam')?.value.trim() || 'UPSC';
    const subject = document.getElementById('aw-manual-subject')?.value.trim() || 'General Studies';
    const difficulty = document.getElementById('aw-manual-difficulty')?.value || 'MODERATE';
    const wordLimit = Number(document.getElementById('aw-manual-wordlimit')?.value) || 150;
    const marks = Number(document.getElementById('aw-manual-marks')?.value) || 10;
    const directive = window.answerWritingService.extractDirectiveWord(qText);

    this.closeManualQuestionModal();
    this.setNewActiveQuestion({
      question: qText,
      directive: directive,
      exam: exam,
      subject: subject,
      difficulty: difficulty,
      wordLimit: wordLimit,
      marks: marks,
      answerType: "Paragraph Answer",
      syllabusContext: `Manual question entry for ${exam}`
    });
    this.switchSubTab('new-answer');
  }

  // =========================================================================
  // HISTORY HANDLING & INSPECTION
  // =========================================================================
  handleHistorySearch(query) {
    this.searchHistoryQuery = query;
    this.switchSubTab('history');
  }

  filterHistorySubject(subj) {
    this.historyFilterSubject = subj;
    this.switchSubTab('history');
  }

  filterHistoryExam(exam) {
    this.historyFilterExam = exam;
    this.switchSubTab('history');
  }

  async openHistoryAttempt(id) {
    const att = await getAnswerAttemptById(id);
    if (!att) return;
    this.loadExistingAttempt(att);
  }

  loadExistingAttempt(att) {
    this.activeQuestion = {
      question: att.question,
      directive: att.directive || window.answerWritingService.extractDirectiveWord(att.question),
      exam: att.exam,
      subject: att.subject,
      difficulty: att.difficulty,
      wordLimit: att.wordLimit,
      marks: att.marks,
      answerType: att.answerType,
      syllabusContext: `Saved attempt from ${new Date(att.createdAt).toLocaleDateString()}`
    };

    this.studentAnswerText = att.studentAnswer || '';
    this.currentEvaluation = att.evaluation;
    this.currentAttemptId = att.id;
    this.activeView = 'AUTO';
    this.tutorChatHistory = att.tutorChatHistory || [];
    this.inPreReview = false;
    this.activeTab = 'new-answer';
    this.render();

    if (window.app) window.app.showToast('Loaded past answer attempt & evaluation report.', 'info');
  }

  async deleteAttempt(id) {
    if (confirm('Delete this answer attempt from your history?')) {
      await deleteAnswerAttempt(id);
      if (this.currentAttemptId === id) {
        this.currentAttemptId = null;
        this.currentEvaluation = null;
      }
      this.switchSubTab('history');
      this.updateHistoryCountBadge();
      if (window.app) window.app.showToast('Attempt removed from history.', 'info');
    }
  }
}

// Global Singleton
window.answerWritingView = new AnswerWritingView();
