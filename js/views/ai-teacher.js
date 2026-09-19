/**
 * HAMSA VIDYA (हंस विद्या) — AI Teacher View Controller
 * "Understand anything, step by step."
 * Material 3 Pedagogical Studio, Educational Progressive Disclosure,
 * Audio Speech Synthesis, Responsive SVG Flowcharts, Interactive Practice & PDF Export
 */

class AiTeacherView {
  constructor() {
    this.container = document.getElementById('view-ai-teacher');
    this.activeTab = 'studio'; // 'studio', 'bookmarks', 'history'

    // Form & Controls State
    this.questionInput = '';
    this.selectedLanguage = 'BILINGUAL'; // 'BILINGUAL', 'HINDI', 'HINGLISH', 'ENGLISH'
    this.selectedDepth = 'DETAILED'; // 'QUICK', 'STANDARD', 'DETAILED', 'DEEP_DIVE'
    this.selectedMode = 'STUDENT'; // 'STUDENT', 'EXAM'
    this.selectedEducationLevel = 'AUTO'; // 'AUTO', 'CLASS_6', 'CLASS_10', 'CLASS_12_SCIENCE', 'UPSC', 'COLLEGE'

    // Attachments
    this.attachedImage = null;
    this.attachedPdf = null;
    this.attachedPdfMeta = null;

    // Active Result State
    this.currentExplanation = null;
    this.currentRecordId = null;
    this.isBookmarked = false;
    this.isLoading = false;
    this.loadingMessageIndex = 0;
    this.loadingInterval = null;

    // Follow-up Chat State
    this.followUpHistory = [];
    this.isFollowUpLoading = false;

    // Text to Speech State
    this.isSpeaking = false;
    this.isPaused = false;
    this.ttsUtterance = null;

    // Voice Input State
    this.isListeningVoice = false;
    this.recognition = null;

    // Vault Filter State
    this.vaultSearchQuery = '';
    this.vaultSubjectFilter = 'ALL';
  }

  /**
   * Main render entry point
   */
  async render() {
    this.container = document.getElementById('view-ai-teacher');
    if (!this.container) return;

    // Real counters from the student's own history — the hero reflects actual
    // usage rather than decorative filler.
    let stats = { totalLessons: 0, savedLessons: 0, subjectsCovered: 0, lessonsToday: 0 };
    try {
      if (typeof getAiTeacherStats === 'function') stats = await getAiTeacherStats();
    } catch (e) {
      console.warn('AI Teacher stats unavailable:', e);
    }

    this.container.innerHTML = `
      <div class="ai-teacher-container">
        ${this._buildHeroHTML(stats)}

        <!-- Sub-Navigation Bar -->
        <nav class="teacher-tabs-nav" role="tablist">
          <button class="teacher-tab-btn ${this.activeTab === 'studio' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('studio')">
            <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
            <span>Explain Studio</span>
          </button>
          <button class="teacher-tab-btn ${this.activeTab === 'bookmarks' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('bookmarks')">
            <i data-lucide="bookmark" style="width:16px;height:16px;"></i>
            <span>Saved Lessons</span>
          </button>
          <button class="teacher-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('history')">
            <i data-lucide="history" style="width:16px;height:16px;"></i>
            <span>Recent History</span>
          </button>
        </nav>

        <!-- Dynamic Main Content Area -->
        <div id="teacher-tab-content"></div>
      </div>
    `;

    this._renderActiveTabContent();
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Hero banner.
   *
   * The previous version was a 96px orbital logo beside two lines of text,
   * which left most of the panel empty. This replaces it with content that
   * earns its space: live counters from the student's own history, and an
   * explicit breakdown of what every answer contains — the latter is the actual
   * value proposition and was previously undiscoverable until after asking.
   */
  _buildHeroHTML(stats = {}) {
    const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
    const hasHistory = (stats.totalLessons || 0) > 0;

    // What the explanation engine returns for every question. Each maps to a
    // real section of the generated lesson, so this is documentation, not fluff.
    const deliverables = [
      { icon: 'layers', label: 'First principles', hint: 'Starts from zero assumed knowledge' },
      { icon: 'list-ordered', label: 'Step-by-step', hint: 'Numbered progressive reasoning' },
      { icon: 'lightbulb', label: 'Real analogies', hint: 'Everyday mental models' },
      { icon: 'git-branch', label: 'Visual diagram', hint: 'Flowchart & concept diagram' },
      { icon: 'target', label: 'Exam pointers', hint: 'High-yield facts & common traps' },
      { icon: 'circle-check-big', label: 'Practice questions', hint: 'Self-test with explanations' }
    ];

    return `
      <header class="teacher-hero">
        <!-- Decorative only; hidden from assistive tech -->
        <div class="teacher-hero-aurora" aria-hidden="true">
          <span class="hero-orb hero-orb-1"></span>
          <span class="hero-orb hero-orb-2"></span>
          <span class="hero-orb hero-orb-3"></span>
        </div>
        <div class="teacher-hero-grid-overlay" aria-hidden="true"></div>

        <div class="teacher-hero-inner">
          <div class="teacher-title-badge">
            <span class="live-pulse-radar"></span>
            <i data-lucide="graduation-cap" style="width:14px;height:14px;"></i>
            <span>HAMSA AI TEACHER &nbsp;•&nbsp; हंस विद्या गुरु</span>
          </div>

          <h1 class="teacher-hero-title">
            <span class="hero-title-line">Understand anything,</span>
            <span class="hero-title-line hero-title-accent">step by step.</span>
          </h1>

          <p class="teacher-hero-subtitle">
            Ask any concept, problem or exam question and get a full lesson built from
            the ground up — in English, <span class="hero-lang-hi">हिंदी</span>, or both together.
          </p>

          <!-- Live counters -->
          <div class="teacher-hero-stats" role="list">
            <div class="hero-stat" role="listitem">
              <span class="hero-stat-value">${fmt(stats.totalLessons)}</span>
              <span class="hero-stat-label">Lessons explained</span>
            </div>
            <div class="hero-stat" role="listitem">
              <span class="hero-stat-value">${fmt(stats.savedLessons)}</span>
              <span class="hero-stat-label">Saved to revise</span>
            </div>
            <div class="hero-stat" role="listitem">
              <span class="hero-stat-value">${fmt(stats.subjectsCovered)}</span>
              <span class="hero-stat-label">Subjects covered</span>
            </div>
            <div class="hero-stat hero-stat-accent" role="listitem">
              <span class="hero-stat-value">${hasHistory ? fmt(stats.lessonsToday) : '∞'}</span>
              <span class="hero-stat-label">${hasHistory ? 'Learned today' : 'Ask freely'}</span>
            </div>
          </div>

          <!-- Value breakdown -->
          <div class="teacher-hero-deliverables">
            <div class="deliverables-heading">
              <i data-lucide="sparkles" style="width:13px;height:13px;"></i>
              <span>Every answer includes</span>
            </div>
            <div class="deliverables-grid">
              ${deliverables.map(d => `
                <div class="deliverable-pill" title="${SecurityUtils.escapeHtml(d.hint)}">
                  <i data-lucide="${d.icon}" style="width:14px;height:14px;"></i>
                  <span>${SecurityUtils.escapeHtml(d.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </header>
    `;
  }

  setTab(tabName) {
    this.activeTab = tabName;
    // Stop any ongoing speech
    this.stopSpeech();
    this.render();
  }

  async _renderActiveTabContent() {
    const target = document.getElementById('teacher-tab-content');
    if (!target) return;

    if (this.activeTab === 'studio') {
      target.innerHTML = this._buildStudioHTML();
      this._bindStudioEvents();
    } else if (this.activeTab === 'bookmarks') {
      target.innerHTML = await this._buildVaultHTML(true);
    } else if (this.activeTab === 'history') {
      target.innerHTML = await this._buildVaultHTML(false);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  // =========================================================================
  // STUDIO HTML BUILDER
  // =========================================================================

  _buildStudioHTML() {
    const activeCtx = window.aiTeacherService
      ? window.aiTeacherService._resolveStudentContext(this.selectedEducationLevel)
      : { levelLabel: 'Class 10 (Secondary School)' };

    return `
      <!-- Input Studio Card -->
      <section class="teacher-input-card spotlight-card">
        <div class="teacher-input-heading">
          <div class="teacher-input-title">
            <div class="teacher-title-icon-orb">
              <i data-lucide="help-circle" style="width:18px;height:18px;color:var(--color-primary-light);"></i>
            </div>
            <span>What do you want to understand?</span>
          </div>
          <div class="teacher-input-subtext">
            <span>Ask any concept, problem, or exam question</span>
          </div>
        </div>

        <!-- Symmetrical Pedagogical HUD Bar: Profile & Level Controls -->
        <div class="teacher-hud-bar">
          <div class="hud-profile-card">
            <div class="hud-avatar-orbit">
              <span class="hud-pulse-dot" title="Active Profile"></span>
              <i data-lucide="graduation-cap" style="width:17px;height:17px;color:var(--color-primary-light);"></i>
            </div>
            <div class="hud-info-stack">
              <div class="hud-meta-row">
                <span class="hud-sub-label">ACTIVE STUDENT PROFILE</span>
                ${activeCtx.stream ? `<span class="hud-pill-tag">🔬 ${SecurityUtils.escapeHtml(activeCtx.stream)}</span>` : ''}
              </div>
              <div class="hud-main-title">
                ${SecurityUtils.escapeHtml(activeCtx.levelLabel)}
                ${activeCtx.targetExam && !activeCtx.levelLabel.includes(activeCtx.targetExam) ? `
                  <span class="hud-exam-tag">🎯 ${SecurityUtils.escapeHtml(activeCtx.targetExam)}</span>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="hud-level-card">
            <div class="hud-level-label">
              <i data-lucide="sliders-horizontal" style="width:13px;height:13px;color:var(--color-primary-light);"></i>
              <span>TEACHING DEPTH / LEVEL</span>
            </div>
            <div class="hud-select-wrapper">
              <select id="teacher-level-select" class="hud-level-select" onchange="window.aiTeacherView.setEducationLevel(this.value)">
                <option value="AUTO" ${this.selectedEducationLevel === 'AUTO' ? 'selected' : ''}>🎯 Auto (From Student Profile)</option>
                <option value="CLASS_6" ${this.selectedEducationLevel === 'CLASS_6' ? 'selected' : ''}>🌱 Class 6 (Foundations & Story Analogies)</option>
                <option value="CLASS_10" ${this.selectedEducationLevel === 'CLASS_10' ? 'selected' : ''}>📘 Class 10 (Board Exam & Balanced Equations)</option>
                <option value="CLASS_12_SCIENCE" ${this.selectedEducationLevel === 'CLASS_12_SCIENCE' ? 'selected' : ''}>🔬 Class 12 Science (Biochemical Pathways & Derivations)</option>
                <option value="UPSC" ${this.selectedEducationLevel === 'UPSC' ? 'selected' : ''}>🏛️ UPSC Aspirant (Policy, Ecology & GS-3 Blueprint)</option>
                <option value="COLLEGE" ${this.selectedEducationLevel === 'COLLEGE' ? 'selected' : ''}>🎓 College / University (Academic Rigor & First Principles)</option>
              </select>
              <i data-lucide="chevron-down" class="hud-select-arrow"></i>
            </div>
          </div>
        </div>

        <div class="teacher-input-hint-banner">
          <i data-lucide="info" style="width:15px;height:15px;color:var(--color-primary-light);flex-shrink:0;"></i>
          <span>You can ask anything — Mathematics, Science, History, Geography, Polity, English, Hindi, or Competitive Exam Questions.</span>
        </div>

        <!-- Textarea -->
        <div class="teacher-textarea-wrapper">
          <textarea
            id="ai-teacher-input"
            class="teacher-textarea"
            placeholder="Ask a question, paste a paragraph, or enter a problem..."
            onkeydown="window.aiTeacherView.handleKeydown(event)"
          >${SecurityUtils.escapeHtml(this.questionInput)}</textarea>
        </div>

        <!-- Attached Media Preview -->
        ${this.attachedImage ? `
          <div class="attached-media-bar">
            <img src="${this.attachedImage.previewUrl}" class="attached-media-thumb" alt="Preview">
            <div class="attached-media-info">
              <span class="attached-media-name">🖼️ ${SecurityUtils.escapeHtml(this.attachedImage.file.name)}</span>
              <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Image attached for visual AI analysis</span>
            </div>
            <button class="attached-media-remove" onclick="window.aiTeacherView.removeAttachedImage()" title="Remove image">
              <i data-lucide="x" style="width:16px;height:16px;"></i>
            </button>
          </div>
        ` : ''}

        ${this.attachedPdf ? `
          <div class="attached-media-bar">
            <i data-lucide="file-text" style="width:24px;height:24px;color:var(--color-gold);"></i>
            <div class="attached-media-info">
              <span class="attached-media-name">📄 ${SecurityUtils.escapeHtml(this.attachedPdfMeta.fileName)}</span>
              <span style="font-size:0.75rem; color:var(--text-muted); display:block;">
                Extracted ${this.attachedPdfMeta.pageCountSelected} page(s) (${this.attachedPdf.length} chars)
              </span>
            </div>
            <button class="attached-media-remove" onclick="window.aiTeacherView.removeAttachedPdf()" title="Remove PDF">
              <i data-lucide="x" style="width:16px;height:16px;"></i>
            </button>
          </div>
        ` : ''}

        <!-- Controls Matrix: Symmetrical 3-Card Grid with Distinct Boxed Buttons -->
        <div class="teacher-controls-grid">
          <!-- Card 1: Language / भाषा -->
          <div class="control-box">
            <div class="control-box-header">
              <div class="control-box-title">
                <i data-lucide="languages" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                <span>Language / भाषा</span>
              </div>
              <span class="control-box-hint">Preferred Tongue</span>
            </div>
            <div class="option-boxes-grid-2x2">
              <button type="button" class="option-box-btn ${this.selectedLanguage === 'BILINGUAL' ? 'active' : ''}" onclick="window.aiTeacherView.setLanguage('BILINGUAL')" title="Bilingual (हिन्दी + English)">
                <span class="opt-icon">🌐</span>
                <span class="opt-label">Bilingual</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedLanguage === 'HINDI' ? 'active' : ''}" onclick="window.aiTeacherView.setLanguage('HINDI')" title="Pure Hindi (सरल हिन्दी)">
                <span class="opt-icon">अ</span>
                <span class="opt-label">हिन्दी</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedLanguage === 'HINGLISH' ? 'active' : ''}" onclick="window.aiTeacherView.setLanguage('HINGLISH')" title="Conversational Hinglish">
                <span class="opt-icon">💬</span>
                <span class="opt-label">Hinglish</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedLanguage === 'ENGLISH' ? 'active' : ''}" onclick="window.aiTeacherView.setLanguage('ENGLISH')" title="Direct English">
                <span class="opt-icon">🔤</span>
                <span class="opt-label">English</span>
              </button>
            </div>
          </div>

          <!-- Card 2: Explanation Depth -->
          <div class="control-box">
            <div class="control-box-header">
              <div class="control-box-title">
                <i data-lucide="sliders" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                <span>Explanation Depth</span>
              </div>
              <span class="control-box-hint">Detail Level</span>
            </div>
            <div class="option-boxes-grid-2x2">
              <button type="button" class="option-box-btn ${this.selectedDepth === 'QUICK' ? 'active' : ''}" onclick="window.aiTeacherView.setDepth('QUICK')" title="Quick: Concise summary">
                <span class="opt-icon">⚡</span>
                <span class="opt-label">Quick</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedDepth === 'STANDARD' ? 'active' : ''}" onclick="window.aiTeacherView.setDepth('STANDARD')" title="Standard: Normal student breakdown">
                <span class="opt-icon">📖</span>
                <span class="opt-label">Standard</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedDepth === 'DETAILED' ? 'active' : ''}" onclick="window.aiTeacherView.setDepth('DETAILED')" title="Detailed: Full masterclass with analogy & questions">
                <span class="opt-icon">🎯</span>
                <span class="opt-label">Detailed</span>
              </button>
              <button type="button" class="option-box-btn ${this.selectedDepth === 'DEEP_DIVE' ? 'active' : ''}" onclick="window.aiTeacherView.setDepth('DEEP_DIVE')" title="Deep Dive: Advanced nuances & prerequisites">
                <span class="opt-icon">🔬</span>
                <span class="opt-label">Deep Dive</span>
              </button>
            </div>
          </div>

          <!-- Card 3: Learning Mode -->
          <div class="control-box">
            <div class="control-box-header">
              <div class="control-box-title">
                <i data-lucide="target" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                <span>Learning Mode</span>
              </div>
              <span class="control-box-hint">Pedagogical Goal</span>
            </div>
            <div class="option-boxes-grid-mode">
              <button type="button" class="option-box-btn mode-student-box ${this.selectedMode === 'STUDENT' ? 'active' : ''}" onclick="window.aiTeacherView.setMode('STUDENT')" title="Student Mode: High conceptual clarity & analogies">
                <i data-lucide="sprout" style="width:16px;height:16px;"></i>
                <span class="mode-info">
                  <strong class="mode-title">Student Mode</strong>
                  <small class="mode-sub">Intuitive Clarity</small>
                </span>
              </button>
              <button type="button" class="option-box-btn mode-exam-box ${this.selectedMode === 'EXAM' ? 'active' : ''}" onclick="window.aiTeacherView.setMode('EXAM')" title="Exam Mode: Keywords, high-yield facts & answer blueprint">
                <i data-lucide="award" style="width:16px;height:16px;"></i>
                <span class="mode-info">
                  <strong class="mode-title">Exam Mode</strong>
                  <small class="mode-sub">Scoring Blueprint</small>
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Input Actions Toolbar -->
        <div class="teacher-input-actions">
          <div class="input-media-buttons">
            <!-- Voice Dictation Trigger -->
            <button class="media-upload-pill ${this.isListeningVoice ? 'active-recording' : ''}" id="teacher-voice-btn" onclick="window.aiTeacherView.toggleVoiceInput()" title="Speak question with mic (Voice Dictation)">
              <i data-lucide="${this.isListeningVoice ? 'mic-off' : 'mic'}" style="width:15px;height:15px;${this.isListeningVoice ? 'color:#EF4444;' : ''}"></i>
              <span>${this.isListeningVoice ? 'Listening...' : 'Voice'}</span>
            </button>

            <!-- Image Upload Trigger -->
            <label class="media-upload-pill" title="Upload question screenshot or diagram image">
              <input type="file" id="teacher-image-input" accept="image/*" style="display:none;" onchange="window.aiTeacherView.handleImageUpload(event)">
              <i data-lucide="image" style="width:15px;height:15px;"></i>
              <span>Upload Image</span>
            </label>

            <!-- PDF Upload Trigger -->
            <label class="media-upload-pill" title="Upload educational PDF document">
              <input type="file" id="teacher-pdf-input" accept="application/pdf" style="display:none;" onchange="window.aiTeacherView.handlePdfUpload(event)">
              <i data-lucide="file-up" style="width:15px;height:15px;"></i>
              <span>Upload PDF</span>
            </label>

            <!-- Clear Button -->
            <button class="media-upload-pill pill-clear" onclick="window.aiTeacherView.handleClear()" title="Clear input">
              <i data-lucide="rotate-ccw" style="width:14px;height:14px;"></i>
              <span>Clear</span>
            </button>
          </div>

          <div class="input-submit-buttons">
            <span class="submit-shortcut-hint">
              Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> ↵
            </span>
            <button class="explain-submit-btn" id="teacher-submit-btn" onclick="window.aiTeacherView.handleExplain()">
              <i data-lucide="sparkles" style="width:18px;height:18px;"></i>
              <span>Explain with AI</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Quick Inspiration Chips -->
      <div class="quick-inspiration-section">
        <span class="inspiration-label">
          <i data-lucide="lightbulb" style="width:13px;height:13px;color:var(--color-gold);"></i>
          Try asking these popular student questions:
        </span>
        <div class="inspiration-chips-row">
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('Why is 15% of 200 equal to 30?')">
            <span>📐 Why is 15% of 200 equal to 30?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('What is photosynthesis?')">
            <span>🌿 What is photosynthesis?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('Why did the French Revolution happen?')">
            <span>👑 Why did the French Revolution happen?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('What is the water cycle?')">
            <span>💧 What is the water cycle?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('What is RAM?')">
            <span>💻 What is RAM?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('भारतीय संविधान क्या है?')">
            <span>📜 भारतीय संविधान क्या है?</span>
          </button>
          <button class="inspiration-chip" onclick="window.aiTeacherView.fillAndExplain('What is inflation?')">
            <span>📈 What is inflation?</span>
          </button>
        </div>
      </div>

      <!-- Container for Loading or Results -->
      <div id="teacher-results-container" style="margin-top:2rem;">
        ${this.isLoading ? this._buildLoadingHTML() : (this.currentExplanation ? this._buildResponseHTML() : '')}
      </div>
    `;
  }

  _bindStudioEvents() {
    const ta = document.getElementById('ai-teacher-input');
    if (ta) {
      ta.addEventListener('input', (e) => {
        this.questionInput = e.target.value;
      });
    }
  }

  // =========================================================================
  // ACTIONS: EXPLAIN, CLEAR, KEYDOWN, PRESETS
  // =========================================================================

  handleKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.handleExplain();
    }
  }

  setLanguage(lang) {
    const ta = document.getElementById('ai-teacher-input');
    if (ta) this.questionInput = ta.value;
    this.selectedLanguage = lang;
    this._renderActiveTabContent();
  }

  setDepth(depth) {
    const ta = document.getElementById('ai-teacher-input');
    if (ta) this.questionInput = ta.value;
    this.selectedDepth = depth;
    this._renderActiveTabContent();
  }

  setMode(mode) {
    const ta = document.getElementById('ai-teacher-input');
    if (ta) this.questionInput = ta.value;
    this.selectedMode = mode;
    this._renderActiveTabContent();
  }

  setEducationLevel(level) {
    const ta = document.getElementById('ai-teacher-input');
    if (ta) this.questionInput = ta.value;
    this.selectedEducationLevel = level;
    this._renderActiveTabContent();
    if (window.app) {
      const labels = {
        'AUTO': '🎯 Auto (From Student Profile)',
        'CLASS_6': '🌱 Class 6 (Foundations & Story Analogies)',
        'CLASS_10': '📘 Class 10 (Board Exam & Balanced Equations)',
        'CLASS_12_SCIENCE': '🔬 Class 12 Science (Biochemical Pathways & Derivations)',
        'UPSC': '🏛️ UPSC Aspirant (Policy, Ecology & GS-3 Blueprint)',
        'COLLEGE': '🎓 College / University (Academic Rigor & First Principles)'
      };
      window.app.showToast(`AI Teacher adapted to: ${labels[level] || level}`, 'info');
    }
  }

  fillAndExplain(text) {
    this.questionInput = text;
    const ta = document.getElementById('ai-teacher-input');
    if (ta) ta.value = text;
    this.handleExplain();
  }

  handleClear() {
    this.questionInput = '';
    this.attachedImage = null;
    this.attachedPdf = null;
    this.attachedPdfMeta = null;
    this.currentExplanation = null;
    this.followUpHistory = [];
    this.stopSpeech();
    this._renderActiveTabContent();
    if (window.app) window.app.showToast('Input cleared', 'info');
  }

  async handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    this.attachedImage = { file, previewUrl };
    if (window.app) window.app.showToast(`Image "${file.name}" attached`, 'success');
    this._renderActiveTabContent();
  }

  removeAttachedImage() {
    if (this.attachedImage?.previewUrl) {
      URL.revokeObjectURL(this.attachedImage.previewUrl);
    }
    this.attachedImage = null;
    this._renderActiveTabContent();
  }

  async handlePdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.pdfExtractor) {
      if (window.app) window.app.showToast('PDF extractor not loaded', 'error');
      return;
    }

    try {
      if (window.app) window.app.showToast('Loading and extracting PDF...', 'info');
      await window.pdfExtractor.loadPdfFile(file);
      const extracted = await window.pdfExtractor.extractTextFromPageRange(1, Math.min(window.pdfExtractor.metadata.pageCount, 5));
      this.attachedPdf = extracted.text;
      this.attachedPdfMeta = extracted;
      if (window.app) window.app.showToast(`Extracted ${extracted.pageCountSelected} pages from "${file.name}"`, 'success');
      this._renderActiveTabContent();
    } catch (e) {
      console.error(e);
      if (window.app) window.app.showToast(`Failed to parse PDF: ${e.message}`, 'error');
    }
  }

  toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (window.app) window.app.showToast('Speech recognition is not supported in this browser.', 'warning');
      return;
    }

    if (this.isListeningVoice) {
      if (this.recognition) this.recognition.stop();
      this.isListeningVoice = false;
      const voiceBtn = document.getElementById('teacher-voice-btn');
      if (voiceBtn) {
        voiceBtn.classList.remove('active-recording');
        voiceBtn.innerHTML = `<i data-lucide="mic" style="width:15px;height:15px;"></i> <span>Voice</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.selectedLanguage === 'HINDI' ? 'hi-IN' : 'en-IN';

      this.recognition.onstart = () => {
        this.isListeningVoice = true;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.add('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic-off" style="width:15px;height:15px;color:#EF4444;"></i> <span>Listening...</span>`;
          if (window.lucide) window.lucide.createIcons();
        }
        if (window.app) window.app.showToast('🎤 Listening... Speak your question.', 'info');
      };

      this.recognition.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          const ta = document.getElementById('ai-teacher-input');
          if (ta) {
            ta.value = (ta.value ? ta.value + ' ' + transcript : transcript).trim();
            this.questionInput = ta.value;
          } else {
            this.questionInput = transcript;
          }
          if (window.app) window.app.showToast('Voice question captured!', 'success');
        }
      };

      this.recognition.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        this.isListeningVoice = false;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.remove('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic" style="width:15px;height:15px;"></i> <span>Voice</span>`;
          if (window.lucide) window.lucide.createIcons();
        }
      };

      this.recognition.onend = () => {
        this.isListeningVoice = false;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.remove('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic" style="width:15px;height:15px;"></i> <span>Voice</span>`;
          if (window.lucide) window.lucide.createIcons();
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
      this.isListeningVoice = false;
    }
  }

  removeAttachedPdf() {
    this.attachedPdf = null;
    this.attachedPdfMeta = null;
    this._renderActiveTabContent();
  }

  // =========================================================================
  // CORE EXPLANATION TRIGGER
  // =========================================================================

  async handleExplain() {
    const ta = document.getElementById('ai-teacher-input');
    const text = (ta ? ta.value : this.questionInput).trim();

    if (!text) {
      if (window.app) window.app.showToast('Please type a question or problem to explain.', 'error');
      return;
    }

    this.questionInput = text;
    this.isLoading = true;
    this.followUpHistory = [];
    this.stopSpeech();
    this._startLoadingCycle();
    this._updateResultsDOM(this._buildLoadingHTML());

    try {
      const response = await window.aiTeacherService.explain({
        question: text,
        language: this.selectedLanguage,
        depth: this.selectedDepth,
        mode: this.selectedMode,
        educationLevel: this.selectedEducationLevel,
        imageFile: this.attachedImage?.file,
        pdfContext: this.attachedPdf
      });

      this.currentExplanation = response.data;
      this.isBookmarked = false;

      // Persist to IndexedDB History
      try {
        const id = await saveAiTeacherExplanation({
          question: text,
          topic: this.currentExplanation.topic || text,
          subject: this.currentExplanation.subject || 'General',
          language: this.selectedLanguage,
          depth: this.selectedDepth,
          mode: this.selectedMode,
          educationLevel: this.selectedEducationLevel,
          structuredData: this.currentExplanation,
          isBookmarked: false
        });
        this.currentRecordId = id;
      } catch (dbErr) {
        console.warn('Could not save explanation to DB history:', dbErr);
      }

      if (response.notice && window.app) {
        window.app.showToast(response.notice, 'info');
      } else if (window.app) {
        window.app.showToast('Explanation ready! Let\'s understand.', 'success');
      }

    } catch (err) {
      console.error('Explanation error:', err);
      if (window.app) window.app.showToast(`Error: ${err.message}`, 'error');
    } finally {
      this.isLoading = false;
      this._stopLoadingCycle();
      this._updateResultsDOM(this._buildResponseHTML());
      if (window.lucide) window.lucide.createIcons();

      // Scroll smoothly to explanation
      const resEl = document.getElementById('teacher-results-container');
      if (resEl) resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  _startLoadingCycle() {
    const stages = [
      {
        step: 1,
        title: "Deconstructing First Principles",
        desc: "Analyzing question foundations, eliminating prerequisites & identifying core concepts...",
        percent: 22
      },
      {
        step: 2,
        title: "Pedagogical & Student Context Alignment",
        desc: "Calibrating explanation depth for your student profile & preferred language...",
        percent: 45
      },
      {
        step: 3,
        title: "Neural Mind & Analogy Engine",
        desc: "Synthesizing relatable real-world analogies, mental models & everyday examples...",
        percent: 68
      },
      {
        step: 4,
        title: "Step-by-Step Logic & Math Derivations",
        desc: "Structuring progressive logical reasoning, formulas, and deep-dive breakdowns...",
        percent: 86
      },
      {
        step: 5,
        title: "Generating Visual Flowchart & Practice Studio",
        desc: "Drafting visual SVG mind diagrams, common misconceptions & self-test questions...",
        percent: 96
      }
    ];

    this.loadingStageIndex = 0;
    this.loadingInterval = setInterval(() => {
      this.loadingStageIndex = (this.loadingStageIndex + 1) % stages.length;
      const cur = stages[this.loadingStageIndex];

      const titleEl = document.getElementById('teacher-loading-step-title');
      if (titleEl) titleEl.textContent = cur.title;

      const descEl = document.getElementById('teacher-loading-msg');
      if (descEl) descEl.textContent = cur.desc;

      const pctEl = document.getElementById('teacher-loading-percent');
      if (pctEl) pctEl.textContent = `${cur.percent}%`;

      const fillEl = document.getElementById('teacher-loading-bar-fill');
      if (fillEl) fillEl.style.width = `${cur.percent}%`;

      // Update active stage indicators
      for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById(`loading-stage-dot-${i}`);
        if (pill) {
          if (i <= cur.step) pill.classList.add('active');
          else pill.classList.remove('active');
        }
      }
    }, 1800);
  }

  _stopLoadingCycle() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
  }

  _updateResultsDOM(html) {
    const resEl = document.getElementById('teacher-results-container');
    if (resEl) {
      resEl.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // =========================================================================
  // RESPONSE HTML & EDUCATIONAL CARDS BUILDER
  // =========================================================================

  _buildLoadingHTML() {
    return `
      <div class="teacher-loading-card spotlight-card">
        <!-- Ambient Glowing Laser Beam & Radiant Backdrop -->
        <div class="loading-laser-glow"></div>
        <div class="loading-ambient-mesh"></div>

        <!-- Central Hologram Stage: AI Neural Mind + Hamsa Wisdom Emblem -->
        <div class="loading-hologram-stage">
          <!-- Concentric 3D Gyroscope Rings -->
          <div class="mind-gyro-ring ring-outer"></div>
          <div class="mind-gyro-ring ring-mid"></div>
          <div class="mind-gyro-ring ring-inner"></div>

          <!-- Pulsing Synaptic Core Orb with Generated AI Mind Visual -->
          <div class="mind-core-orb">
            <!-- Cybernetic Laser Scanner Sweep -->
            <div class="mind-scanner-beam"></div>
            
            <!-- AI Power Mind Image -->
            <img src="assets/icons/ai-neural-mind.jpg" 
                 alt="AI Neural Mind & Hamsa Wisdom" 
                 class="mind-core-img"
                 onerror="this.src='assets/icons/hamsa-logo-3d.png'">
                 
            <!-- Floating Hamsa Sacred Brand Badge -->
            <div class="mind-brand-badge" title="Hamsa Vidya Intellect Core">
              <img src="assets/icons/hamsa-logo-3d.png" alt="Hamsa Logo" class="badge-hamsa-img" onerror="this.src='assets/icons/hamsa-logo.svg'">
              <span class="badge-pulse-glow"></span>
            </div>
          </div>
        </div>

        <!-- High-Tech Animated Neural Energy Stream Lines ("aachi lines live motion") -->
        <div class="neural-energy-lines-container" aria-hidden="true">
          <svg class="neural-energy-svg" viewBox="0 0 700 70" preserveAspectRatio="none">
            <defs>
              <linearGradient id="neuralGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10B981" stop-opacity="0" />
                <stop offset="30%" stop-color="#10B981" stop-opacity="0.9" />
                <stop offset="50%" stop-color="#38BDF8" stop-opacity="1" />
                <stop offset="70%" stop-color="#6366F1" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="neuralGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#6366F1" stop-opacity="0" />
                <stop offset="35%" stop-color="#A855F7" stop-opacity="0.9" />
                <stop offset="65%" stop-color="#10B981" stop-opacity="1" />
                <stop offset="100%" stop-color="#10B981" stop-opacity="0" />
              </linearGradient>
            </defs>
            <!-- Moving Dynamic Sinusoidal Waves with Dash Animation -->
            <path class="synapse-stream-line stream-line-1" d="M 0 35 Q 175 5, 350 35 T 700 35" stroke="url(#neuralGrad1)" fill="none" stroke-width="2.5" />
            <path class="synapse-stream-line stream-line-2" d="M 0 35 Q 175 65, 350 35 T 700 35" stroke="url(#neuralGrad2)" fill="none" stroke-width="2" />
            <circle class="synapse-sparkle spark-1" r="3.5" fill="#38BDF8" />
            <circle class="synapse-sparkle spark-2" r="3" fill="#10B981" />
            <circle class="synapse-sparkle spark-3" r="3" fill="#A855F7" />
          </svg>
        </div>

        <!-- Loading Content Stack -->
        <div class="loading-text-stack">
          <div class="loading-active-badge">
            <span class="pulse-beacon"></span>
            <span id="teacher-loading-step-title">Deconstructing First Principles</span>
          </div>

          <h3 id="teacher-loading-msg" class="loading-step-message">
            Analyzing question foundations, eliminating prerequisites & identifying core concepts...
          </h3>

          <!-- High-Tech Animated Progress Laser Bar -->
          <div class="loading-progress-panel">
            <div class="progress-meta-row">
              <span class="progress-label">⚡ HAMSA NEURAL PEDAGOGY PIPELINE</span>
              <span id="teacher-loading-percent" class="progress-percent">22%</span>
            </div>
            <div class="loading-progress-track">
              <div id="teacher-loading-bar-fill" class="loading-bar-fill" style="width: 22%;">
                <div class="laser-spark-head"></div>
              </div>
            </div>
          </div>

          <!-- 5-Stage Live Visual Pipeline Dots -->
          <div class="loading-stages-stepper">
            <div class="stage-step-pill active" id="loading-stage-dot-1">
              <span class="step-num">1</span>
              <span class="step-name">Query Analysis</span>
            </div>
            <div class="stage-step-divider"></div>
            <div class="stage-step-pill" id="loading-stage-dot-2">
              <span class="step-num">2</span>
              <span class="step-name">Context Alignment</span>
            </div>
            <div class="stage-step-divider"></div>
            <div class="stage-step-pill" id="loading-stage-dot-3">
              <span class="step-num">3</span>
              <span class="step-name">Analogy Engine</span>
            </div>
            <div class="stage-step-divider"></div>
            <div class="stage-step-pill" id="loading-stage-dot-4">
              <span class="step-num">4</span>
              <span class="step-name">Logic Synthesis</span>
            </div>
            <div class="stage-step-divider"></div>
            <div class="stage-step-pill" id="loading-stage-dot-5">
              <span class="step-num">5</span>
              <span class="step-name">Visual Studio</span>
            </div>
          </div>

          <p class="loading-wisdom-quote">
            ✨ <em>"विद्या ददाति विनयं विनयाद्याति पात्रताम्"</em> • Building clarity from fundamentals.
          </p>
        </div>
      </div>
    `;
  }

  _buildResponseHTML() {
    const exp = this.currentExplanation;
    if (!exp) return '';

    return `
      <div class="teacher-response-view">
        <!-- Master Teacher's Book Folio -->
        <article class="teacher-book-folio">
          <div class="book-spine-ribbon"></div>

          <!-- Top Folio Header Bar -->
          <header class="book-folio-header">
            <div class="book-folio-branding">
              <div class="book-logo-halo">
                <img src="assets/icons/hamsa-logo-3d.png" class="book-hamsa-icon" alt="Hamsa" onerror="this.src='assets/icons/hamsa-logo.svg'">
              </div>
              <div class="book-folio-titles">
                <span class="book-manuscript-title">HAMSA VIDYA • अध्ययन पाण्डुलिपि</span>
                <span class="book-manuscript-subtitle">Master Pedagogical Study Notes • हंस विद्या गुरु</span>
              </div>
            </div>
            <div class="book-folio-pills">
              <span class="book-tag tag-pedagogy">🎓 For: ${SecurityUtils.escapeHtml(exp.studentContext?.levelLabel || 'Student Profile')}</span>
              <span class="book-tag tag-subject">📚 ${SecurityUtils.escapeHtml(exp.subject || 'General')}</span>
              <span class="book-tag tag-tier">⚡ ${SecurityUtils.escapeHtml(exp.difficulty || 'BEGINNER')}</span>
              <span class="book-tag tag-lang">🌐 ${SecurityUtils.escapeHtml(this.selectedLanguage)}</span>
            </div>
          </header>

          <!-- Question Banner Styled as Teacher's Slate -->
          <div class="book-query-banner">
            <div class="query-banner-label">
              <i data-lucide="help-circle" style="width:14px;height:14px;"></i>
              <span>INVESTIGATED QUESTION • मूल प्रश्न</span>
            </div>
            <h2 class="query-banner-title">“${SecurityUtils.escapeHtml(this.questionInput || exp.topic || 'Concept Breakdown')}”</h2>
            ${exp.topic ? `<div class="query-banner-subtopic">Concept Focus: <strong>${SecurityUtils.escapeHtml(exp.topic)}</strong></div>` : ''}
          </div>

          <!-- ================================================================
               CHAPTER I: Ground-Zero Foundations (मुख्य संकल्पना एवं आधार)
               ================================================================ -->
          <section class="book-chapter chapter-foundations">
            <div class="chapter-badge">
              <span class="chapter-roman">§ I</span>
              <span class="chapter-title">GROUND-ZERO FOUNDATIONS • मुख्य संकल्पना एवं आधार</span>
            </div>

            <!-- Quick Answer Callout Box -->
            ${exp.quickAnswer ? `
              <div class="teacher-takeaway-box">
                <div class="takeaway-header">
                  <div class="takeaway-badge">
                    <i data-lucide="zap" style="width:14px;height:14px;"></i>
                    <span>Teacher's Core Takeaway • मुख्य निष्कर्ष</span>
                  </div>
                  <button class="book-mini-tool-btn" onclick="window.aiTeacherView.copySectionText('${SecurityUtils.escapeHtml(exp.quickAnswer)}')">
                    <i data-lucide="copy" style="width:12px;height:12px;"></i> Copy
                  </button>
                </div>
                <div class="takeaway-body">
                  ${SecurityUtils.sanitizeHtml(marked.parse(exp.quickAnswer || ''))}
                </div>
              </div>
            ` : ''}

            <!-- Detailed Walkthrough -->
            ${exp.foundation ? `
              <div class="foundation-block">
                <div class="foundation-header">
                  <h3 class="foundation-heading">
                    <i data-lucide="book-open" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
                    <span>${SecurityUtils.escapeHtml(exp.foundation.title || "Let's Understand From Ground-Zero")}</span>
                  </h3>
                  <button class="book-mini-tool-btn" onclick="window.aiTeacherView.makeSimpler()">
                    <i data-lucide="smile" style="width:13px;height:13px;"></i> Make it Simpler
                  </button>
                </div>
                <div class="foundation-content">
                  ${SecurityUtils.sanitizeHtml(marked.parse(exp.foundation.explanation || ''))}
                </div>

                <!-- Key Terms Simplified (Glossary Grid) -->
                ${exp.foundation.technicalTerms && exp.foundation.technicalTerms.length > 0 ? `
                  <div class="glossary-container">
                    <div class="glossary-title">
                      <i data-lucide="key" style="width:13px;height:13px;"></i>
                      <span>Key Terms Simplified • पारिभाषिक शब्दावली</span>
                    </div>
                    <div class="glossary-grid">
                      ${exp.foundation.technicalTerms.map(t => `
                        <div class="glossary-card">
                          <span class="glossary-term">${SecurityUtils.escapeHtml(t.term)}</span>
                          <span class="glossary-meaning">${SecurityUtils.escapeHtml(t.simpleMeaning)}</span>
                          ${t.example ? `<span class="glossary-example">💡 <em>Eg:</em> ${SecurityUtils.escapeHtml(t.example)}</span>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </section>

          <!-- ================================================================
               CHAPTER II: Scientific Mechanism & Logic (कार्यप्रणाली एवं वैज्ञानिक तर्क)
               ================================================================ -->
          <section class="book-chapter chapter-mechanism">
            <div class="chapter-badge">
              <span class="chapter-roman">§ II</span>
              <span class="chapter-title">SCIENTIFIC MECHANISM & LOGIC • कार्यप्रणाली एवं वैज्ञानिक तर्क</span>
            </div>

            <!-- Math Teacher Mode (If applicable) -->
            ${exp.mathSolution && (exp.isMath || exp.mathSolution.formula || exp.mathSolution.calculationSteps?.length) ? `
              <div class="math-board-block">
                <div class="math-board-header">
                  <span class="math-board-badge">📐 Step-by-Step Math Solution</span>
                  <span class="math-verified-tag">✓ Verified Formula</span>
                </div>
                <div class="math-given-find-grid">
                  ${exp.mathSolution.given ? `
                    <div class="math-pill"><span class="math-pill-lbl">Given:</span> <span>${SecurityUtils.escapeHtml(exp.mathSolution.given)}</span></div>
                  ` : ''}
                  ${exp.mathSolution.toFind ? `
                    <div class="math-pill"><span class="math-pill-lbl">Find:</span> <span>${SecurityUtils.escapeHtml(exp.mathSolution.toFind)}</span></div>
                  ` : ''}
                </div>
                ${exp.mathSolution.formula ? `
                  <div class="math-formula-callout">
                    <span class="math-formula-lbl">FORMULA APPLIED:</span>
                    <div class="math-formula-display">${SecurityUtils.escapeHtml(exp.mathSolution.formula)}</div>
                    ${exp.mathSolution.formulaExplanation ? `<div class="math-formula-desc">${SecurityUtils.escapeHtml(exp.mathSolution.formulaExplanation)}</div>` : ''}
                  </div>
                ` : ''}
                ${exp.mathSolution.calculationSteps && exp.mathSolution.calculationSteps.length > 0 ? `
                  <table class="math-steps-table">
                    <tbody>
                      ${exp.mathSolution.calculationSteps.map(cs => `
                        <tr>
                          <td class="math-step-col">${SecurityUtils.escapeHtml(cs.math || cs.step)}</td>
                          <td class="math-desc-col">${SecurityUtils.escapeHtml(cs.explanation || '')}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                ` : ''}
                ${exp.mathSolution.finalAnswer ? `
                  <div class="math-final-banner">
                    <span class="math-final-lbl">FINAL ANSWER:</span>
                    <span class="math-final-val">${SecurityUtils.escapeHtml(exp.mathSolution.finalAnswer)} ${SecurityUtils.escapeHtml(exp.mathSolution.units || '')}</span>
                    ${exp.mathSolution.verification ? `<span class="math-verify-line">✓ Verification: ${SecurityUtils.escapeHtml(exp.mathSolution.verification)}</span>` : ''}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Why & How Grid -->
            ${exp.whyAndHow && (exp.whyAndHow.why || exp.whyAndHow.how) ? `
              <div class="why-how-row">
                ${exp.whyAndHow.what ? `
                  <div class="why-how-col">
                    <span class="why-how-tag">WHAT IS IT?</span>
                    <p>${SecurityUtils.escapeHtml(exp.whyAndHow.what)}</p>
                  </div>
                ` : ''}
                ${exp.whyAndHow.why ? `
                  <div class="why-how-col col-why">
                    <span class="why-how-tag tag-why">WHY DOES THIS HAPPEN?</span>
                    <p>${SecurityUtils.escapeHtml(exp.whyAndHow.why)}</p>
                  </div>
                ` : ''}
                ${exp.whyAndHow.how ? `
                  <div class="why-how-col col-how">
                    <span class="why-how-tag tag-how">HOW DOES IT WORK?</span>
                    <p>${SecurityUtils.escapeHtml(exp.whyAndHow.how)}</p>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Step-by-Step Progressive Reasoning -->
            ${exp.steps && exp.steps.length > 0 ? `
              <div class="steps-spine-container">
                <div class="steps-spine-title">
                  <i data-lucide="list-ordered" style="width:14px;height:14px;"></i>
                  <span>Logical Progression • क्रमिक विवेचना</span>
                </div>
                <div class="steps-spine-list">
                  ${exp.steps.map(s => `
                    <div class="spine-step-item">
                      <div class="spine-num">${s.stepNumber || '•'}</div>
                      <div class="spine-content">
                        <h4 class="spine-heading">${SecurityUtils.escapeHtml(s.title || '')}</h4>
                        <div class="spine-text">${SecurityUtils.sanitizeHtml(marked.parse(s.content || ''))}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </section>

          <!-- ================================================================
               CHAPTER III: Intuition, Metaphors & Visual Models (दृष्टांत एवं मॉडल)
               ================================================================ -->
          <section class="book-chapter chapter-intuition">
            <div class="chapter-badge">
              <span class="chapter-roman">§ III</span>
              <span class="chapter-title">INTUITION, METAPHORS & VISUAL MODELS • दृष्टांत एवं मानसिक मॉडल</span>
            </div>

            <!-- Analogy & Real-Life Examples Paired Grid -->
            <div class="analogy-examples-grid">
              ${exp.analogy?.analogyText ? `
                <div class="analogy-card-book">
                  <div class="analogy-header">
                    <span class="analogy-badge">💡 Teacher's Analogy • मानसिक मॉडल</span>
                    <span class="analogy-sub">${SecurityUtils.escapeHtml(exp.analogy.hook || "Think of it like this...")}</span>
                  </div>
                  <div class="analogy-body">
                    “${SecurityUtils.escapeHtml(exp.analogy.analogyText)}”
                  </div>
                  ${exp.analogy.takeaway ? `
                    <div class="analogy-takeaway-footer">
                      🎯 <strong>Key Takeaway:</strong> ${SecurityUtils.escapeHtml(exp.analogy.takeaway)}
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              ${exp.examples && exp.examples.length > 0 ? `
                <div class="examples-card-book">
                  <div class="examples-header">
                    <span class="examples-badge">🧠 Real-Life Everyday Examples</span>
                    <button class="book-mini-tool-btn" onclick="window.aiTeacherView.anotherExample()">
                      <i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> New Example
                    </button>
                  </div>
                  <div class="examples-body">
                    ${exp.examples.map(ex => `
                      <div class="example-mini-box">
                        <div class="example-top">
                          <strong>${SecurityUtils.escapeHtml(ex.title || 'Example')}</strong>
                          ${ex.type ? `<span class="example-type-pill">${SecurityUtils.escapeHtml(ex.type)}</span>` : ''}
                        </div>
                        <div class="example-text">${SecurityUtils.sanitizeHtml(marked.parse(ex.description || ''))}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Process Flowchart -->
            ${exp.flowchart && exp.flowchart.nodes && exp.flowchart.nodes.length > 0 ? `
              <div class="flowchart-book-card">
                <div class="flowchart-header">
                  <i data-lucide="workflow" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                  <span>${SecurityUtils.escapeHtml(exp.flowchart.title || "Process Flowchart")}</span>
                </div>
                <div class="flowchart-container">
                  ${exp.flowchart.nodes.map((node, idx) => `
                    <div class="flowchart-node">
                      <div class="flowchart-node-label">${SecurityUtils.escapeHtml(node.label)}</div>
                      ${node.description ? `<div class="flowchart-node-desc">${SecurityUtils.escapeHtml(node.description)}</div>` : ''}
                    </div>
                    ${idx < exp.flowchart.nodes.length - 1 ? `<div class="flowchart-arrow">➔</div>` : ''}
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Diagram Studio -->
            ${exp.diagram && exp.diagram.svgContent ? `
              <div class="diagram-book-card">
                <div class="diagram-book-header">
                  <div class="diagram-book-title">
                    <i data-lucide="image" style="width:15px;height:15px;color:var(--color-gold);"></i>
                    <span>${SecurityUtils.escapeHtml(exp.diagram.title || "Concept Diagram")}</span>
                  </div>
                  <div class="diagram-toolbar">
                    <button class="book-mini-tool-btn" onclick="window.aiTeacherView.openDiagramModal()">
                      <i data-lucide="maximize-2" style="width:12px;height:12px;"></i> Fullscreen
                    </button>
                    <button class="book-mini-tool-btn" onclick="window.aiTeacherView.downloadDiagramSvg()">
                      <i data-lucide="download" style="width:12px;height:12px;"></i> Download SVG
                    </button>
                  </div>
                </div>
                <div class="diagram-viewer-box">${SecurityUtils.sanitizeSvg(exp.diagram.svgContent)}</div>
                ${exp.diagram.caption ? `<div class="diagram-caption">${SecurityUtils.escapeHtml(exp.diagram.caption)}</div>` : ''}
              </div>
            ` : ''}

            <!-- Comparison Matrix Table -->
            ${exp.comparison && exp.comparison.headers && exp.comparison.rows && exp.comparison.rows.length > 0 ? `
              <div class="comparison-book-card">
                <div class="comparison-header">
                  <i data-lucide="table" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                  <span>${SecurityUtils.escapeHtml(exp.comparison.title || "Concept Comparison Table")}</span>
                </div>
                <div class="comparison-table-wrapper">
                  <table class="comparison-table">
                    <thead>
                      <tr>
                        ${exp.comparison.headers.map(h => `<th>${SecurityUtils.escapeHtml(h)}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${exp.comparison.rows.map(row => `
                        <tr>
                          ${row.map(cell => `<td>${SecurityUtils.escapeHtml(cell)}</td>`).join('')}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}
          </section>

          <!-- ================================================================
               CHAPTER IV: Exam Precision & Practice Studio (परीक्षा रणनीति)
               ================================================================ -->
          <section class="book-chapter chapter-exam">
            <div class="chapter-badge">
              <span class="chapter-roman">§ IV</span>
              <span class="chapter-title">EXAM PRECISION & PRACTICE STUDIO • परीक्षा रणनीति एवं अभ्यास</span>
            </div>

            <!-- Common Mistakes & Memory Trick Paired Row -->
            <div class="mistakes-trick-row">
              ${exp.commonMistakes && exp.commonMistakes.length > 0 ? `
                <div class="mistakes-book-card">
                  <div class="mistakes-header">
                    <i data-lucide="alert-triangle" style="width:14px;height:14px;color:var(--color-error);"></i>
                    <span>Common Pitfalls & Traps • अक्सर होने वाली गलतियाँ</span>
                  </div>
                  <div class="mistakes-list">
                    ${exp.commonMistakes.map(m => `
                      <div class="mistake-item">
                        <div class="mistake-wrong">❌ <span>${SecurityUtils.escapeHtml(m.mistake)}</span></div>
                        <div class="mistake-correct">✅ <span>${SecurityUtils.escapeHtml(m.correction)}</span></div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              ${exp.memoryTrick && exp.memoryTrick.mnemonic ? `
                <div class="trick-book-card">
                  <div class="trick-header">
                    <i data-lucide="key" style="width:14px;height:14px;color:var(--color-gold);"></i>
                    <span>Rapid Recall Mnemonic • याद रखने का अचूक सूत्र</span>
                  </div>
                  <div class="mnemonic-badge">${SecurityUtils.escapeHtml(exp.memoryTrick.mnemonic)}</div>
                  <div class="trick-explanation">${SecurityUtils.escapeHtml(exp.memoryTrick.explanation || '')}</div>
                </div>
              ` : ''}
            </div>

            <!-- Exam Points & Strategy -->
            ${exp.examPoints && (exp.examPoints.highYieldPoints?.length || exp.examPoints.expectedAnswerStructure) ? `
              <div class="exam-points-book-card">
                <div class="exam-points-header">
                  <i data-lucide="award" style="width:15px;height:15px;color:var(--color-gold);"></i>
                  <span>High-Yield Exam Points & Scoring Blueprint</span>
                </div>
                ${exp.examPoints.highYieldPoints && exp.examPoints.highYieldPoints.length > 0 ? `
                  <ul class="exam-points-list">
                    ${exp.examPoints.highYieldPoints.map(p => `<li><strong>${SecurityUtils.escapeHtml(p)}</strong></li>`).join('')}
                  </ul>
                ` : ''}
                ${exp.examPoints.expectedAnswerStructure ? `
                  <div class="exam-answer-structure-box">
                    <strong style="color:var(--color-primary-light);">📝 Recommended Answer Structure:</strong>
                    <span>${SecurityUtils.escapeHtml(exp.examPoints.expectedAnswerStructure)}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Final Summary -->
            ${exp.summary && exp.summary.length > 0 ? `
              <div class="summary-book-card">
                <div class="summary-header">
                  <i data-lucide="check-circle" style="width:14px;height:14px;color:var(--color-success);"></i>
                  <span>Final Summary • सारांश</span>
                </div>
                <ul class="summary-checklist">
                  ${exp.summary.map(s => `<li>${SecurityUtils.escapeHtml(s)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            <!-- Practice Questions -->
            ${exp.practiceQuestions && exp.practiceQuestions.length > 0 ? `
              <div class="practice-book-card">
                <div class="practice-header">
                  <div class="practice-title">
                    <i data-lucide="pen-tool" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                    <span>Test Your Understanding • स्व-मूल्यांकन</span>
                  </div>
                  <span class="practice-count-badge">${exp.practiceQuestions.length} Practice Questions</span>
                </div>
                <div class="practice-questions-list">
                  ${exp.practiceQuestions.map((pq, idx) => `
                    <div class="practice-question-item">
                      <div class="pq-header">
                        <span class="pq-type-tag">${SecurityUtils.escapeHtml(pq.type || 'PRACTICE')}</span>
                        <span class="pq-qnum">Question ${idx + 1}</span>
                      </div>
                      <div class="pq-question-text">${SecurityUtils.escapeHtml(pq.question)}</div>
                      ${pq.options && pq.options.length > 0 ? `
                        <div class="pq-options-grid">
                          ${pq.options.map((opt, optIdx) => `
                            <div class="pq-option-pill">
                              <span class="pq-opt-letter">${String.fromCharCode(65 + optIdx)}.</span>
                              <span>${SecurityUtils.escapeHtml(opt)}</span>
                            </div>
                          `).join('')}
                        </div>
                      ` : ''}
                      <button class="pq-show-answer-btn" onclick="window.aiTeacherView.togglePracticeAnswer(this)">
                        <i data-lucide="eye" style="width:13px;height:13px;"></i> Show Answer & Explanation
                      </button>
                      <div class="pq-answer-box">
                        <div class="pq-correct-line">Correct Answer: <strong>${SecurityUtils.escapeHtml(pq.answer)}</strong></div>
                        <div>${SecurityUtils.escapeHtml(pq.explanation || '')}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Contextual Follow-up Chat -->
            <div class="followup-book-card">
              <div class="followup-header">
                <div class="followup-title">
                  <i data-lucide="message-square" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                  <span>Ask a Follow-up Question • कोई भी संदेह पूछें</span>
                </div>
                <span class="followup-context-tag">Maintains Full Lesson Context</span>
              </div>
              ${exp.followUpSuggestions && exp.followUpSuggestions.length > 0 ? `
                <div class="followup-suggestions-row">
                  ${exp.followUpSuggestions.map(sug => `
                    <button class="followup-suggestion-chip" onclick="window.aiTeacherView.askFollowUpChip('${SecurityUtils.escapeHtml(sug)}')">
                      ${SecurityUtils.escapeHtml(sug)}
                    </button>
                  `).join('')}
                </div>
              ` : ''}
              <div class="followup-input-wrapper">
                <input
                  type="text"
                  id="followup-input-field"
                  class="followup-input"
                  placeholder="Ask anything about this explanation (e.g. 'Why?', 'Explain in Hindi', 'Make it easier')..."
                  onkeydown="if(event.key === 'Enter') window.aiTeacherView.sendFollowUp()"
                >
                <button class="followup-send-btn" onclick="window.aiTeacherView.sendFollowUp()">
                  <i data-lucide="send" style="width:14px;height:14px;"></i> Ask
                </button>
              </div>

              <!-- Follow-up Conversation Threads -->
              <div class="followup-messages-list" id="followup-messages-container">
                ${this.followUpHistory.map(item => `
                  <div class="followup-msg-bubble">
                    <div class="followup-msg-query">❓ Student: ${SecurityUtils.escapeHtml(item.query)}</div>
                    <div class="followup-msg-answer">
                      <strong>🎓 AI Teacher:</strong> ${SecurityUtils.sanitizeHtml(marked.parse(item.response.followUpAnswer || ''))}
                      ${item.response.clarifyingExample ? `
                        <div style="margin-top:0.5rem; font-style:italic; color:var(--text-primary);">
                          💡 Example: ${SecurityUtils.escapeHtml(item.response.clarifyingExample)}
                        </div>
                      ` : ''}
                      ${item.response.miniAnalogy ? `
                        <div style="margin-top:0.35rem; color:var(--color-gold);">
                          🧠 ${SecurityUtils.escapeHtml(item.response.miniAnalogy)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>

          <!-- Book Folio Footer -->
          <footer class="book-folio-footer">
            <span>📖 HAMSA VIDYA AI TEACHER • हंस विद्या गुरु नोट्स</span>
            <span>अध्ययन से स्पष्टता • From Fundamentals to Mastery</span>
          </footer>
        </article>

        <!-- STICKY BOTTOM ACTIONS TOOLBAR -->
        <div class="teacher-actions-bar">
          <!-- Text to Speech -->
          <div class="tts-controls-group">
            <button class="tts-mini-btn" id="tts-play-btn" onclick="window.aiTeacherView.toggleSpeech()" title="Listen to Explanation">
              <i data-lucide="${this.isSpeaking && !this.isPaused ? 'volume-x' : 'volume-2'}" style="width:16px;height:16px;"></i>
            </button>
            <span style="font-size:0.78rem; font-weight:600; color:var(--text-secondary);">
              ${this.isSpeaking ? (this.isPaused ? 'Paused' : 'Playing') : 'Listen'}
            </span>
          </div>

          <!-- Micro-Expansion Actions -->
          <div class="actions-group">
            <button class="teacher-action-btn" onclick="window.aiTeacherView.makeSimpler()" title="Rewrite with simpler language">
              <i data-lucide="smile" style="width:14px;height:14px;"></i>
              <span>Simpler</span>
            </button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.anotherExample()" title="Generate new example">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
              <span>Example</span>
            </button>
          </div>

          <!-- Utility Actions -->
          <div class="actions-group">
            <button class="teacher-action-btn" onclick="window.aiTeacherView.copyExplanation()" title="Copy Full Text">
              <i data-lucide="copy" style="width:14px;height:14px;"></i>
              <span>Copy</span>
            </button>
            <button class="teacher-action-btn ${this.isBookmarked ? 'active' : ''}" onclick="window.aiTeacherView.toggleBookmark()" title="Save / Bookmark">
              <i data-lucide="${this.isBookmarked ? 'bookmark-check' : 'bookmark'}" style="width:14px;height:14px;"></i>
              <span>${this.isBookmarked ? 'Saved' : 'Save'}</span>
            </button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.downloadPdf()" title="Download as A4 PDF">
              <i data-lucide="download" style="width:14px;height:14px;"></i>
              <span>PDF</span>
            </button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.printExplanation()" title="Print Lesson">
              <i data-lucide="printer" style="width:14px;height:14px;"></i>
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // INTERACTIVE ACTIONS: SIMPLER, ANOTHER EXAMPLE, FOLLOW-UP
  // =========================================================================

  togglePracticeAnswer(btn) {
    const parent = btn.closest('.practice-question-item');
    const answerBox = parent.querySelector('.pq-answer-box');
    if (!answerBox) return;

    const isOpen = answerBox.classList.contains('active');
    if (isOpen) {
      answerBox.classList.remove('active');
      btn.innerHTML = `<i data-lucide="eye" style="width:13px;height:13px;"></i> Show Answer & Explanation`;
    } else {
      answerBox.classList.add('active');
      btn.innerHTML = `<i data-lucide="eye-off" style="width:13px;height:13px;"></i> Hide Answer`;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async makeSimpler() {
    if (!this.currentExplanation) return;
    if (window.app) window.app.showToast('Re-crafting explanation in simpler language...', 'info');

    try {
      const result = await window.aiTeacherService.makeItSimpler({
        question: this.questionInput,
        currentExplanation: this.currentExplanation,
        language: this.selectedLanguage,
        educationLevel: this.selectedEducationLevel
      });

      // Update foundation text with simpler version
      if (this.currentExplanation.foundation) {
        this.currentExplanation.foundation.explanation = result.storyExplanation;
      }
      if (result.simplerQuickAnswer) {
        this.currentExplanation.quickAnswer = result.simplerQuickAnswer;
      }
      if (result.everydayAnalogy && this.currentExplanation.analogy) {
        this.currentExplanation.analogy.analogyText = result.everydayAnalogy;
      }

      this._updateResultsDOM(this._buildResponseHTML());
      if (window.app) window.app.showToast('Simplified! Easier words & story added.', 'success');
    } catch (e) {
      console.error(e);
    }
  }

  async anotherExample() {
    if (!this.currentExplanation) return;
    if (window.app) window.app.showToast('Generating a fresh, distinct example...', 'info');

    try {
      const result = await window.aiTeacherService.generateAnotherExample({
        question: this.questionInput,
        currentExplanation: this.currentExplanation,
        language: this.selectedLanguage,
        educationLevel: this.selectedEducationLevel
      });

      if (!this.currentExplanation.examples) this.currentExplanation.examples = [];
      this.currentExplanation.examples.unshift({
        type: 'Brand New Example',
        title: result.title || 'Fresh Example',
        description: `${result.scenario || ''}\n\n**Application:** ${result.howItApplies || ''}\n\n*Takeaway:* ${result.takeaway || ''}`
      });

      this._updateResultsDOM(this._buildResponseHTML());
      if (window.app) window.app.showToast('Fresh example added!', 'success');
    } catch (e) {
      console.error(e);
    }
  }

  askFollowUpChip(text) {
    const input = document.getElementById('followup-input-field');
    if (input) {
      input.value = text;
      this.sendFollowUp();
    }
  }

  async sendFollowUp() {
    const input = document.getElementById('followup-input-field');
    const query = (input ? input.value : '').trim();
    if (!query) return;

    input.value = '';
    if (window.app) window.app.showToast('AI Teacher is thinking...', 'info');

    try {
      const response = await window.aiTeacherService.askFollowUp({
        originalQuestion: this.questionInput,
        previousExplanation: this.currentExplanation,
        followUpQuery: query,
        language: this.selectedLanguage,
        educationLevel: this.selectedEducationLevel
      });

      this.followUpHistory.push({ query, response });
      this._updateResultsDOM(this._buildResponseHTML());

      const container = document.getElementById('followup-messages-container');
      if (container) container.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (e) {
      console.error(e);
      if (window.app) window.app.showToast(`Could not process follow-up: ${e.message}`, 'error');
    }
  }

  // =========================================================================
  // TEXT TO SPEECH (TTS) ENGINE
  // =========================================================================

  toggleSpeech() {
    if (!('speechSynthesis' in window)) {
      if (window.app) window.app.showToast('Text-to-speech is not supported on this device/browser.', 'warning');
      return;
    }

    if (this.isSpeaking) {
      if (this.isPaused) {
        window.speechSynthesis.resume();
        this.isPaused = false;
        this._updateResultsDOM(this._buildResponseHTML());
      } else {
        window.speechSynthesis.pause();
        this.isPaused = true;
        this._updateResultsDOM(this._buildResponseHTML());
      }
      return;
    }

    this.speak();
  }

  speak() {
    if (!this.currentExplanation || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Prepare clean text for narration
    const cleanSpeechText = `
      ${this.currentExplanation.quickAnswer || ''}.
      ${this.currentExplanation.foundation ? this.currentExplanation.foundation.explanation : ''}.
      ${(this.currentExplanation.steps || []).map(s => s.title + '. ' + s.content).join('. ')}.
      ${this.currentExplanation.analogy ? 'Think of it like this: ' + this.currentExplanation.analogy.analogyText : ''}
    `.replace(/<[^>]*>/g, '').replace(/[*#_~]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Detect language for voice matching
    if (this.selectedLanguage === 'HINDI') {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isPaused = false;
      this._updateResultsDOM(this._buildResponseHTML());
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      this._updateResultsDOM(this._buildResponseHTML());
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      this._updateResultsDOM(this._buildResponseHTML());
    };

    this.ttsUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.isPaused = false;
  }

  // =========================================================================
  // EXPORT & BOOKMARK ACTIONS
  // =========================================================================

  async toggleBookmark() {
    if (!this.currentRecordId) {
      // Save first
      this.currentRecordId = await saveAiTeacherExplanation({
        question: this.questionInput,
        topic: this.currentExplanation.topic || this.questionInput,
        subject: this.currentExplanation.subject || 'General',
        language: this.selectedLanguage,
        depth: this.selectedDepth,
        mode: this.selectedMode,
        structuredData: this.currentExplanation,
        isBookmarked: true
      });
      this.isBookmarked = true;
    } else {
      this.isBookmarked = await toggleBookmarkAiTeacherExplanation(this.currentRecordId);
    }

    if (window.app) {
      window.app.showToast(this.isBookmarked ? '🔖 Lesson saved to Bookmarks!' : 'Bookmark removed', 'success');
    }
    this._updateResultsDOM(this._buildResponseHTML());
  }

  copyExplanation() {
    if (!this.currentExplanation) return;
    const exp = this.currentExplanation;
    const md = `
# ${exp.topic || this.questionInput}
**Subject:** ${exp.subject || 'General'} | **Language:** ${this.selectedLanguage}

## Quick Answer
${exp.quickAnswer || ''}

## Foundation & Understanding
${exp.foundation?.explanation || ''}

## Step-by-Step Reasoning
${(exp.steps || []).map(s => `${s.stepNumber}. **${s.title}**: ${s.content}`).join('\n')}

${exp.analogy?.analogyText ? `## Analogy\n> ${exp.analogy.analogyText}` : ''}

## Final Summary
${(exp.summary || []).map(s => `- ${s}`).join('\n')}

---
*Generated by HAMSA VIDYA (हंस विद्या) AI Teacher*
    `.trim();

    navigator.clipboard.writeText(md).then(() => {
      if (window.app) window.app.showToast('Complete lesson copied to clipboard!', 'success');
    }).catch(() => {
      if (window.app) window.app.showToast('Could not copy to clipboard', 'error');
    });
  }

  copySectionText(text) {
    navigator.clipboard.writeText(text).then(() => {
      if (window.app) window.app.showToast('Section copied to clipboard!', 'success');
    });
  }

  downloadPdf() {
    if (!this.currentExplanation) {
      if (window.app) window.app.showToast('No active explanation to download.', 'warning');
      return;
    }
    if (window.app) window.app.showToast('Generating official study manuscript PDF...', 'info');

    const container = document.createElement('div');
    container.id = 'hamsa-printable-book-export-container';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px'; /* Exactly 210mm at 96 DPI for perfect A4 rendering */
    container.style.background = '#FFFFFF';
    container.style.zIndex = '-9999';
    container.innerHTML = this._generateBookHTMLForExport();
    document.body.appendChild(container);

    const exp = this.currentExplanation;
    const cleanFileName = ((exp.topic || this.questionInput || 'Hamsa_Lesson')
      .replace(/[^a-zA-Z0-9_\u0900-\u097F\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 45)) || 'Hamsa_Teacher_Lesson';

    const targetEl = container.querySelector('#hamsa-printable-book') || container;

    if (window.html2pdf) {
      const opt = {
        margin: [8, 10, 8, 10], // 8mm top/bottom, 10mm left/right
        filename: `${cleanFileName}_Study_Manuscript.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      window.html2pdf().set(opt).from(targetEl).save()
        .then(() => {
          if (window.app) window.app.showToast('PDF downloaded successfully!', 'success');
        })
        .catch((err) => {
          console.warn('html2pdf failed, falling back to clean print window:', err);
          this._openPrintWindow();
        })
        .finally(() => {
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        });
    } else {
      if (container.parentNode) container.parentNode.removeChild(container);
      this._openPrintWindow();
    }
  }

  printExplanation() {
    this._openPrintWindow();
  }

  _openPrintWindow() {
    if (!this.currentExplanation) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${SecurityUtils.escapeHtml(this.currentExplanation.topic || 'Hamsa_Study_Notes')} — HAMSA VIDYA</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
      </head>
      <body style="margin:0; padding:0; background:#ffffff;">
        ${this._generateBookHTMLForExport()}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 300);
          };
        <\/script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  _generateBookHTMLForExport() {
    const exp = this.currentExplanation;
    if (!exp) return '';

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const studentCtx = exp.studentContext || {};

    return `
      <div id="hamsa-printable-book" class="hamsa-book-export-root">
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .hamsa-book-export-root {
            font-family: 'Inter', 'Noto Sans Devanagari', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1A1A1A;
            background: #FFFFFF;
            font-size: 10pt;
            line-height: 1.45;
            width: 100%;
            max-width: 794px;
            margin: 0 auto;
            padding: 8px 14px 20px;
          }
          .book-export-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2.5px solid #D97706;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .book-export-brand {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .book-export-crest {
            width: 44px;
            height: 44px;
            object-fit: contain;
          }
          .book-export-title-h1 {
            font-size: 15pt;
            font-weight: 800;
            color: #0F172A;
            margin: 0 0 2px 0;
            letter-spacing: -0.01em;
          }
          .book-export-subtitle {
            font-size: 8pt;
            color: #64748B;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .book-export-meta-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            justify-content: flex-end;
          }
          .book-export-pill {
            display: inline-block;
            font-size: 7.5pt;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 4px;
            background: #F1F5F9;
            color: #334155;
            border: 1px solid #CBD5E1;
          }
          .pill-gold {
            background: #FEF3C7;
            color: #92400E;
            border-color: #FCD34D;
          }
          .pill-indigo {
            background: #EEF2FF;
            color: #4338CA;
            border-color: #C7D2FE;
          }
          .book-export-question-box {
            background: #FFFDF9;
            border: 1.5px solid #E2D9CC;
            border-left: 5px solid #D97706;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 12px;
          }
          .book-export-q-lbl {
            font-size: 7.5pt;
            font-weight: 800;
            color: #B45309;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 3px;
          }
          .book-export-q-text {
            font-family: 'Merriweather', Georgia, serif;
            font-size: 11.5pt;
            font-weight: 700;
            color: #0F172A;
            margin: 0;
          }
          .book-export-chapter {
            margin-bottom: 12px;
          }
          .book-export-ch-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 8.5pt;
            font-weight: 800;
            color: #92400E;
            background: #FFFBEB;
            border: 1px solid #FDE68A;
            border-radius: 4px;
            padding: 3px 8px;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .book-export-takeaway {
            background: #F0FDF4;
            border: 1px solid #BBF7D0;
            border-left: 4px solid #16A34A;
            border-radius: 5px;
            padding: 8px 10px;
            margin-bottom: 8px;
            page-break-inside: avoid;
          }
          .book-export-takeaway-lbl {
            font-size: 8pt;
            font-weight: 700;
            color: #15803D;
            margin-bottom: 3px;
            text-transform: uppercase;
          }
          .book-export-foundation-text {
            font-size: 9.5pt;
            line-height: 1.5;
            color: #1F2937;
            margin-bottom: 8px;
          }
          .book-export-terms-table, .book-export-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            margin-top: 6px;
            margin-bottom: 10px;
          }
          .book-export-table th, .book-export-table td,
          .book-export-terms-table th, .book-export-terms-table td {
            border: 1px solid #D1D5DB;
            padding: 5px 8px;
            text-align: left;
            vertical-align: top;
          }
          .book-export-table th, .book-export-terms-table th {
            background: #F8FAFC;
            font-weight: 700;
            color: #0F172A;
          }
          .book-export-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 10px;
          }
          .book-export-grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            margin-bottom: 10px;
          }
          .book-export-card {
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 5px;
            padding: 6px 9px;
            font-size: 8.5pt;
            page-break-inside: avoid;
          }
          .book-export-card-title {
            font-size: 7.5pt;
            font-weight: 800;
            color: #475569;
            margin-bottom: 3px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .book-export-math-box {
            background: #F8FAFC;
            border: 1.5px solid #CBD5E1;
            border-radius: 5px;
            padding: 8px 10px;
            margin-bottom: 10px;
            page-break-inside: avoid;
          }
          .book-export-math-formula {
            font-family: 'Courier New', Courier, monospace;
            font-weight: 700;
            font-size: 11pt;
            color: #0369A1;
            background: #E0F2FE;
            padding: 3px 8px;
            border-radius: 4px;
            display: inline-block;
            margin: 4px 0;
          }
          .book-export-steps-list {
            margin: 0 0 10px 0;
            padding-left: 18px;
            font-size: 9pt;
          }
          .book-export-steps-list li {
            margin-bottom: 5px;
            page-break-inside: avoid;
          }
          .book-export-analogy-box {
            background: #FFFBEB;
            border: 1px solid #FCD34D;
            border-radius: 5px;
            padding: 7px 10px;
            font-size: 9pt;
            page-break-inside: avoid;
          }
          .book-export-mistake-box {
            border-left: 3.5px solid #DC2626;
            background: #FEF2F2;
            padding: 6px 9px;
            border-radius: 4px;
            margin-bottom: 5px;
            font-size: 8.5pt;
            page-break-inside: avoid;
          }
          .book-export-mnemonic-box {
            border-left: 3.5px solid #D97706;
            background: #FFFBEB;
            padding: 6px 9px;
            border-radius: 4px;
            font-size: 8.5pt;
            page-break-inside: avoid;
          }
          .book-export-pq-item {
            border: 1px solid #E2E8F0;
            background: #F8FAFC;
            border-radius: 5px;
            padding: 6px 9px;
            margin-bottom: 6px;
            font-size: 8.5pt;
            page-break-inside: avoid;
          }
          .book-export-pq-header {
            display: flex;
            justify-content: space-between;
            font-weight: 700;
            color: #4338CA;
            font-size: 8pt;
            margin-bottom: 2px;
          }
          .book-export-pq-ans {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #CBD5E1;
            color: #15803D;
            font-weight: 600;
          }
          .book-export-flowchart-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            flex-wrap: wrap;
            page-break-inside: avoid;
          }
          .book-export-flow-node {
            background: #EFF6FF;
            border: 1px solid #BFDBFE;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 8pt;
            font-weight: 600;
            color: #1E40AF;
          }
          .book-export-flow-arrow {
            color: #94A3B8;
            font-weight: bold;
          }
          .book-export-footer {
            border-top: 1.5px solid #E2E8F0;
            padding-top: 6px;
            margin-top: 14px;
            display: flex;
            justify-content: space-between;
            font-size: 7.5pt;
            color: #94A3B8;
            font-weight: 600;
            page-break-inside: avoid;
          }
        </style>

        <!-- Folio Header -->
        <div class="book-export-header">
          <div class="book-export-brand">
            <img src="assets/icons/hamsa-logo-3d.png" class="book-export-crest" alt="Hamsa" onerror="this.src='assets/icons/hamsa-logo.svg'">
            <div>
              <div class="book-export-title-h1">HAMSA VIDYA (हंस विद्या)</div>
              <div class="book-export-subtitle">Master Pedagogical Study Notes • अध्ययन पाण्डुलिपि</div>
            </div>
          </div>
          <div class="book-export-meta-pills">
            <span class="book-export-pill pill-gold">🎓 Level: ${SecurityUtils.escapeHtml(studentCtx.levelLabel || 'Academic Standard')}</span>
            <span class="book-export-pill pill-indigo">📚 ${SecurityUtils.escapeHtml(exp.subject || 'General')}</span>
            <span class="book-export-pill">🌐 ${SecurityUtils.escapeHtml(this.selectedLanguage)}</span>
            <span class="book-export-pill">📅 ${dateStr}</span>
          </div>
        </div>

        <!-- Question Box -->
        <div class="book-export-question-box">
          <div class="book-export-q-lbl">INVESTIGATED TOPIC & QUESTION • मूल प्रश्न</div>
          <h2 class="book-export-q-text">“${SecurityUtils.escapeHtml(this.questionInput || exp.topic || 'Core Concept')}”</h2>
          ${exp.topic ? `<div style="font-size:8.5pt; color:#475569; margin-top:2px;">Focus: <strong>${SecurityUtils.escapeHtml(exp.topic)}</strong></div>` : ''}
        </div>

        <!-- CHAPTER I: GROUND-ZERO FOUNDATIONS -->
        <div class="book-export-chapter">
          <div class="book-export-ch-badge">
            <span>§ I</span> • <span>Ground-Zero Foundations & Core Concepts (मुख्य संकल्पना एवं आधार)</span>
          </div>

          ${exp.quickAnswer ? `
            <div class="book-export-takeaway">
              <div class="book-export-takeaway-lbl">Teacher's Core Takeaway • मुख्य निष्कर्ष</div>
              <div style="font-size:9.5pt; font-weight:600; color:#14532D;">
                ${SecurityUtils.sanitizeHtml(marked.parse(exp.quickAnswer || ''))}
              </div>
            </div>
          ` : ''}

          ${exp.foundation ? `
            <div class="book-export-foundation-text">
              ${SecurityUtils.sanitizeHtml(marked.parse(exp.foundation.explanation || ''))}
            </div>

            ${exp.foundation.technicalTerms && exp.foundation.technicalTerms.length > 0 ? `
              <table class="book-export-terms-table">
                <thead>
                  <tr>
                    <th style="width:28%;">Technical Term</th>
                    <th>Simplified Meaning</th>
                    <th style="width:32%;">Context Example</th>
                  </tr>
                </thead>
                <tbody>
                  ${exp.foundation.technicalTerms.map(t => `
                    <tr>
                      <td><strong>${SecurityUtils.escapeHtml(t.term)}</strong></td>
                      <td>${SecurityUtils.escapeHtml(t.simpleMeaning)}</td>
                      <td><em>${SecurityUtils.escapeHtml(t.example || '')}</em></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          ` : ''}
        </div>

        <!-- CHAPTER II: MECHANISM & STEP-BY-STEP REASONING -->
        <div class="book-export-chapter">
          <div class="book-export-ch-badge">
            <span>§ II</span> • <span>Scientific Mechanism & Logical Breakdown (कार्यप्रणाली एवं वैज्ञानिक तर्क)</span>
          </div>

          ${exp.mathSolution && (exp.isMath || exp.mathSolution.formula || exp.mathSolution.calculationSteps?.length) ? `
            <div class="book-export-math-box">
              <div style="font-size:8.5pt; font-weight:800; color:#0369A1; text-transform:uppercase;">📐 Verified Mathematical Derivation / Solution</div>
              <div style="font-size:8.5pt; margin:4px 0;">
                ${exp.mathSolution.given ? `<strong>Given:</strong> ${SecurityUtils.escapeHtml(exp.mathSolution.given)} &nbsp;|&nbsp; ` : ''}
                ${exp.mathSolution.toFind ? `<strong>To Find:</strong> ${SecurityUtils.escapeHtml(exp.mathSolution.toFind)}` : ''}
              </div>
              ${exp.mathSolution.formula ? `
                <div class="book-export-math-formula">${SecurityUtils.escapeHtml(exp.mathSolution.formula)}</div>
              ` : ''}
              ${exp.mathSolution.calculationSteps && exp.mathSolution.calculationSteps.length > 0 ? `
                <table class="book-export-table" style="margin:4px 0;">
                  <tbody>
                    ${exp.mathSolution.calculationSteps.map(cs => `
                      <tr>
                        <td style="width:35%; font-weight:600;">${SecurityUtils.escapeHtml(cs.math || cs.step)}</td>
                        <td>${SecurityUtils.escapeHtml(cs.explanation || '')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
              ${exp.mathSolution.finalAnswer ? `
                <div style="font-size:9.5pt; font-weight:800; color:#0F172A; margin-top:4px;">
                  Result: <span style="color:#0369A1;">${SecurityUtils.escapeHtml(exp.mathSolution.finalAnswer)} ${SecurityUtils.escapeHtml(exp.mathSolution.units || '')}</span>
                  ${exp.mathSolution.verification ? ` &nbsp;•&nbsp; <span style="font-size:8pt; color:#15803D;">✓ ${SecurityUtils.escapeHtml(exp.mathSolution.verification)}</span>` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${exp.whyAndHow && (exp.whyAndHow.why || exp.whyAndHow.how) ? `
            <div class="book-export-grid-3">
              ${exp.whyAndHow.what ? `
                <div class="book-export-card">
                  <div class="book-export-card-title">WHAT IS IT?</div>
                  <div>${SecurityUtils.escapeHtml(exp.whyAndHow.what)}</div>
                </div>
              ` : ''}
              ${exp.whyAndHow.why ? `
                <div class="book-export-card">
                  <div class="book-export-card-title" style="color:#B45309;">WHY DOES IT HAPPEN?</div>
                  <div>${SecurityUtils.escapeHtml(exp.whyAndHow.why)}</div>
                </div>
              ` : ''}
              ${exp.whyAndHow.how ? `
                <div class="book-export-card">
                  <div class="book-export-card-title" style="color:#15803D;">HOW DOES IT WORK?</div>
                  <div>${SecurityUtils.escapeHtml(exp.whyAndHow.how)}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${exp.steps && exp.steps.length > 0 ? `
            <div style="font-size:8.5pt; font-weight:700; color:#334155; margin-bottom:4px; text-transform:uppercase;">Logical Step Sequence</div>
            <ol class="book-export-steps-list">
              ${exp.steps.map(s => `
                <li>
                  <strong>${SecurityUtils.escapeHtml(s.title || '')}:</strong>
                  <span>${SecurityUtils.sanitizeHtml(marked.parse(s.content || ''))}</span>
                </li>
              `).join('')}
            </ol>
          ` : ''}
        </div>

        <!-- CHAPTER III: INTUITION, METAPHORS & VISUAL MODELS -->
        <div class="book-export-chapter">
          <div class="book-export-ch-badge">
            <span>§ III</span> • <span>Intuition, Metaphors & Visual Models (दृष्टांत एवं मानसिक मॉडल)</span>
          </div>

          <div class="book-export-grid-2">
            ${exp.analogy?.analogyText ? `
              <div class="book-export-analogy-box">
                <div style="font-size:8pt; font-weight:800; color:#92400E; text-transform:uppercase; margin-bottom:3px;">
                  💡 Teacher's Analogy • मानसिक मॉडल
                </div>
                <div>“${SecurityUtils.escapeHtml(exp.analogy.analogyText)}”</div>
                ${exp.analogy.takeaway ? `<div style="margin-top:4px; font-weight:700; font-size:8pt; color:#B45309;">🎯 Takeaway: ${SecurityUtils.escapeHtml(exp.analogy.takeaway)}</div>` : ''}
              </div>
            ` : ''}

            ${exp.examples && exp.examples.length > 0 ? `
              <div class="book-export-card">
                <div class="book-export-card-title">🧠 Real-Life Example</div>
                ${exp.examples.slice(0, 2).map(ex => `
                  <div style="margin-bottom:4px;">
                    <strong>${SecurityUtils.escapeHtml(ex.title || 'Practical Scenario')}:</strong>
                    <span>${SecurityUtils.sanitizeHtml(marked.parse(ex.description || ''))}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          ${exp.flowchart && exp.flowchart.nodes && exp.flowchart.nodes.length > 0 ? `
            <div style="font-size:8pt; font-weight:700; color:#475569; margin-bottom:4px; text-transform:uppercase;">
              Process Flow: ${SecurityUtils.escapeHtml(exp.flowchart.title || 'Sequence')}
            </div>
            <div class="book-export-flowchart-row">
              ${exp.flowchart.nodes.map((n, i) => `
                <div class="book-export-flow-node">${SecurityUtils.escapeHtml(n.label)}</div>
                ${i < exp.flowchart.nodes.length - 1 ? `<span class="book-export-flow-arrow">➔</span>` : ''}
              `).join('')}
            </div>
          ` : ''}

          ${exp.comparison && exp.comparison.headers && exp.comparison.rows && exp.comparison.rows.length > 0 ? `
            <table class="book-export-table">
              <thead>
                <tr>${exp.comparison.headers.map(h => `<th>${SecurityUtils.escapeHtml(h)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${exp.comparison.rows.map(r => `<tr>${r.map(c => `<td>${SecurityUtils.escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          ` : ''}
        </div>

        <!-- CHAPTER IV: EXAM PRECISION & PRACTICE -->
        <div class="book-export-chapter">
          <div class="book-export-ch-badge">
            <span>§ IV</span> • <span>Exam Precision, Pitfalls & Practice (परीक्षा रणनीति एवं अभ्यास)</span>
          </div>

          <div class="book-export-grid-2">
            ${exp.commonMistakes && exp.commonMistakes.length > 0 ? `
              <div>
                <div style="font-size:8pt; font-weight:800; color:#991B1B; text-transform:uppercase; margin-bottom:3px;">
                  ⚠️ Common Pitfalls & Traps (अक्सर होने वाली गलतियाँ)
                </div>
                ${exp.commonMistakes.map(m => `
                  <div class="book-export-mistake-box">
                    <div>❌ <strong>Mistake:</strong> ${SecurityUtils.escapeHtml(m.mistake)}</div>
                    <div>✅ <strong>Correct:</strong> ${SecurityUtils.escapeHtml(m.correction)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${exp.memoryTrick && exp.memoryTrick.mnemonic ? `
              <div>
                <div style="font-size:8pt; font-weight:800; color:#92400E; text-transform:uppercase; margin-bottom:3px;">
                  🔑 Rapid Recall Mnemonic (याद रखने का अचूक सूत्र)
                </div>
                <div class="book-export-mnemonic-box">
                  <div style="font-size:10pt; font-weight:800; color:#92400E; margin-bottom:2px;">
                    ${SecurityUtils.escapeHtml(exp.memoryTrick.mnemonic)}
                  </div>
                  <div>${SecurityUtils.escapeHtml(exp.memoryTrick.explanation || '')}</div>
                </div>
              </div>
            ` : ''}
          </div>

          ${exp.examPoints && exp.examPoints.highYieldPoints && exp.examPoints.highYieldPoints.length > 0 ? `
            <div class="book-export-card" style="margin-bottom:8px;">
              <div class="book-export-card-title" style="color:#B45309;">🎯 High-Yield Exam Facts</div>
              <ul style="margin:0; padding-left:18px; font-size:8.5pt;">
                ${exp.examPoints.highYieldPoints.map(p => `<li>${SecurityUtils.escapeHtml(p)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${exp.summary && exp.summary.length > 0 ? `
            <div style="margin-bottom:8px;">
              <div style="font-size:8pt; font-weight:800; color:#15803D; text-transform:uppercase; margin-bottom:3px;">
                ✓ Final Summary Checklist (सारांश)
              </div>
              <ul style="margin:0; padding-left:18px; font-size:8.5pt;">
                ${exp.summary.map(s => `<li>${SecurityUtils.escapeHtml(s)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${exp.practiceQuestions && exp.practiceQuestions.length > 0 ? `
            <div style="margin-top:8px;">
              <div style="font-size:8pt; font-weight:800; color:#4338CA; text-transform:uppercase; margin-bottom:3px;">
                ✍️ Practice Self-Assessment (${exp.practiceQuestions.length} Questions)
              </div>
              ${exp.practiceQuestions.map((pq, idx) => `
                <div class="book-export-pq-item">
                  <div class="book-export-pq-header">
                    <span>Q${idx + 1} • ${SecurityUtils.escapeHtml(pq.type || 'QUESTION')}</span>
                  </div>
                  <div style="font-weight:600; margin:2px 0;">${SecurityUtils.escapeHtml(pq.question)}</div>
                  ${pq.options && pq.options.length > 0 ? `
                    <div style="font-size:8pt; color:#475569; margin:2px 0;">
                      ${pq.options.map((opt, oi) => `<span>(${String.fromCharCode(65 + oi)}) ${SecurityUtils.escapeHtml(opt)} &nbsp; </span>`).join('')}
                    </div>
                  ` : ''}
                  <div class="book-export-pq-ans">
                    ✓ Answer: ${SecurityUtils.escapeHtml(pq.answer)} ${pq.explanation ? `— ${SecurityUtils.escapeHtml(pq.explanation)}` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Folio Footer -->
        <div class="book-export-footer">
          <span>📖 HAMSA VIDYA AI TEACHER • हंस विद्या अध्ययन पाण्डुलिपि</span>
          <span>From Fundamentals to Mastery • 100% Academic Integrity</span>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DIAGRAM MODAL & DOWNLOAD
  // =========================================================================

  openDiagramModal() {
    if (!this.currentExplanation?.diagram?.svgContent) return;

    let overlay = document.getElementById('diagram-fullscreen-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'diagram-fullscreen-modal';
      overlay.className = 'diagram-fullscreen-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="diagram-fullscreen-box">
        <button class="diagram-fullscreen-close" onclick="window.aiTeacherView.closeDiagramModal()">
          <i data-lucide="x" style="width:24px;height:24px;"></i>
        </button>
        <h3 style="margin-bottom:1rem; font-size:1.25rem;">
          ${SecurityUtils.escapeHtml(this.currentExplanation.diagram.title || 'Concept Diagram')}
        </h3>
        <div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:auto;">
          ${SecurityUtils.sanitizeSvg(this.currentExplanation.diagram.svgContent)}
        </div>
      </div>
    `;
    overlay.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }

  closeDiagramModal() {
    const overlay = document.getElementById('diagram-fullscreen-modal');
    if (overlay) overlay.style.display = 'none';
  }

  downloadDiagramSvg() {
    if (!this.currentExplanation?.diagram?.svgContent) return;

    // Sanitize before writing to disk too — the user may open this file directly
    // in a browser, where an unsanitized <script> would execute locally.
    const svgData = SecurityUtils.sanitizeSvg(this.currentExplanation.diagram.svgContent);
    if (!svgData) {
      if (window.app) window.app.showToast('This diagram could not be exported safely.', 'warning');
      return;
    }

    const filename = `${UIUtils.slugify(this.currentExplanation.topic, 'diagram')}.svg`;
    UIUtils.downloadText(svgData, filename, 'image/svg+xml;charset=utf-8');
    if (window.app) window.app.showToast('Diagram SVG downloaded!', 'success');
  }

  // =========================================================================
  // SAVED LESSONS & RECENT HISTORY VIEW
  // =========================================================================

  async _buildVaultHTML(onlyBookmarked = false) {
    const items = await getAllAiTeacherExplanations({
      onlyBookmarked,
      searchQuery: this.vaultSearchQuery,
      subject: this.vaultSubjectFilter
    });

    return `
      <section class="teacher-vault-view">
        <div class="vault-filter-bar">
          <input
            type="text"
            class="vault-search-input"
            placeholder="Search saved explanations by topic or question..."
            value="${SecurityUtils.escapeHtml(this.vaultSearchQuery)}"
            oninput="window.aiTeacherView.handleVaultSearch(this.value, ${onlyBookmarked})"
          >
          <div style="display:flex; gap:0.5rem;">
            <select
              style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.5rem 0.85rem; color:var(--text-primary); font-size:0.85rem;"
              onchange="window.aiTeacherView.handleVaultSubjectFilter(this.value, ${onlyBookmarked})"
            >
              <option value="ALL">All Subjects</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Science">Science</option>
              <option value="History">History</option>
              <option value="Geography">Geography</option>
              <option value="Polity">Polity</option>
              <option value="Economy">Economy</option>
              <option value="Computer Science">Computer Science</option>
            </select>
          </div>
        </div>

        ${items.length === 0 ? `
          <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-xl); border:1px dashed var(--border-color);">
            <i data-lucide="${onlyBookmarked ? 'bookmark' : 'clock'}" style="width:36px;height:36px;margin-bottom:0.75rem;opacity:0.5;"></i>
            <p style="font-size:1.05rem; font-weight:600; margin-bottom:0.35rem;">
              ${onlyBookmarked ? 'No saved lessons found.' : 'No recent explanations yet.'}
            </p>
            <span style="font-size:0.85rem;">
              Ask any question in Explain Studio and click "Save" to bookmark lessons here.
            </span>
          </div>
        ` : `
          <div class="vault-cards-grid">
            ${items.map(item => `
              <div class="vault-item-card spotlight-card" onclick="window.aiTeacherView.loadSavedLesson(${item.id})">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <span class="meta-pill meta-pill-subject" style="font-size:0.7rem;">${SecurityUtils.escapeHtml(item.subject || 'General')}</span>
                  <button
                    style="background:transparent; border:none; color:var(--color-error); cursor:pointer; padding:2px;"
                    onclick="event.stopPropagation(); window.aiTeacherView.deleteSavedLesson(${item.id}, ${onlyBookmarked})"
                    title="Delete record"
                  >
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                  </button>
                </div>
                <div class="vault-item-title">${SecurityUtils.escapeHtml(item.topic || item.question)}</div>
                <div class="vault-item-preview">
                  ${SecurityUtils.escapeHtml(item.structuredData?.quickAnswer || item.question)}
                </div>
                <div class="vault-item-footer">
                  <span>${new Date(item.createdAt).toLocaleDateString()}</span>
                  <span style="color:var(--color-primary-light); font-weight:600;">Open Lesson ➔</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>
    `;
  }

  handleVaultSearch(query, onlyBookmarked) {
    this.vaultSearchQuery = query;
    this._renderActiveTabContent();
  }

  handleVaultSubjectFilter(subject, onlyBookmarked) {
    this.vaultSubjectFilter = subject;
    this._renderActiveTabContent();
  }

  async loadSavedLesson(id) {
    const record = await getAiTeacherExplanationById(id);
    if (!record) return;

    this.currentRecordId = record.id;
    this.questionInput = record.question;
    this.selectedLanguage = record.language || 'BILINGUAL';
    this.selectedDepth = record.depth || 'DETAILED';
    this.selectedMode = record.mode || 'STUDENT';
    this.currentExplanation = record.structuredData;
    this.isBookmarked = Boolean(record.isBookmarked);
    this.followUpHistory = [];

    this.activeTab = 'studio';
    this.render();
    if (window.app) window.app.showToast('Saved lesson loaded!', 'success');
  }

  async deleteSavedLesson(id, onlyBookmarked) {
    await deleteAiTeacherExplanation(id);
    if (window.app) window.app.showToast('Lesson removed', 'info');
    this._renderActiveTabContent();
  }
}

// Singleton instance
window.aiTeacherView = new AiTeacherView();
