/**
 * HAMSA VIDYA (हंस विद्या) — AI Teacher View Controller
 * "Understand anything, step by step."
 * Material 3 Pedagogical Studio, Educational Progressive Disclosure,
 * Audio Speech Synthesis, Responsive SVG Flowcharts, Interactive Practice & PDF Export
 */

class AiTeacherView {
  constructor() {
    this.container = document.getElementById('view-ai-teacher');
    this._advancedPanelOpen = false;
    this._mentorshipIntent = 'question';
    this.activeTab = 'studio'; // 'studio', 'bookmarks', 'history'

    // Form & Controls State
    this.questionInput = '';
    this.selectedLanguage = 'BILINGUAL'; // 'BILINGUAL', 'HINDI', 'HINGLISH', 'ENGLISH'
    this.selectedDepth = 'DETAILED'; // Shared preferences can request concise or detailed teaching.
    this.selectedMode = 'STUDENT'; // 'STUDENT', 'EXAM'
    this.selectedEducationLevel = 'AUTO'; // 'AUTO','CLASS_6_8','CLASS_9_10','CLASS_11_12','CLASS_12_SCIENCE','SSC_CGL','BANKING_RAILWAY','UPSC','COLLEGE','ADVANCED'

    // Attachments
    this.attachedImage = null;
    this.attachedPdf = null;
    this.attachedPdfMeta = null;

    // Active Result State
    this.currentExplanation = null;
    this.currentRecordId = null;
    this.isBookmarked = false;
    this.isLoading = false;

    this.advancedModes = {
      socratic: false,
      teachBack: false,
      mindmap: false,
      debate: false,
      connections: false
    };
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
    this._requestVersion = 0;
    this._requestControllers = new Set();
    this._renderVersion = 0;
    this._tabRenderVersion = 0;
    this._vaultVersion = 0;
    this._attachmentVersion = 0;
    this._saveQueue = Promise.resolve();
    this._lessonQuestion = null;
    this._lessonSettings = null;
    this._recordCreatedAt = null;

  }

  /**
   * Main render entry point
   */
  async render() {
    if (!this.isLoading && !this.currentExplanation) {
      window.studyPreferences?.applyDefaults(this, window.studyPreferences.teacherDefaults(), '_studyDefaults');
    }
    const renderVersion = ++this._renderVersion;
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

    if (renderVersion !== this._renderVersion) return;
    this.container.innerHTML = `
      <div class="ai-teacher-container">
        ${this._buildHeroHTML(stats)}

        <!-- Sub-Navigation Bar -->
        <nav class="teacher-tabs-nav" role="tablist">
          <button role="tab" aria-selected="${this.activeTab === 'studio'}" class="teacher-tab-btn ${this.activeTab === 'studio' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('studio')">
            <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
            <span>Explain Studio</span>
          </button>
          <button role="tab" aria-selected="${this.activeTab === 'bookmarks'}" class="teacher-tab-btn ${this.activeTab === 'bookmarks' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('bookmarks')">
            <i data-lucide="bookmark" style="width:16px;height:16px;"></i>
            <span>Saved Lessons</span>
          </button>
          <button role="tab" aria-selected="${this.activeTab === 'history'}" class="teacher-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" onclick="window.aiTeacherView.setTab('history')">
            <i data-lucide="history" style="width:16px;height:16px;"></i>
            <span>Recent History</span>
          </button>
        </nav>

        <!-- Dynamic Main Content Area -->
        <div id="teacher-tab-content"></div>
      </div>
    `;

    await this._renderActiveTabContent();
    if (renderVersion !== this._renderVersion) return;
    if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
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
          <span class="vhero-rays"></span>
          <span class="hero-orb hero-orb-1 vhero-orb vhero-orb-1"></span>
          <span class="hero-orb hero-orb-2 vhero-orb vhero-orb-2"></span>
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
            <span class="hero-title-line hero-title-accent vhero-title-accent" data-text="step by step.">step by step.</span>
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
              <span>Learn with</span>
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
    if (!['studio', 'bookmarks', 'history'].includes(tabName)) return;
    this._vaultVersion++;
    clearTimeout(this._vaultSearchTimer);
    this.stopVoiceInput();
    this.activeTab = tabName;
    // Stop any ongoing speech
    this.stopSpeech();
    this.render();
  }

  async _renderActiveTabContent() {
    this._captureNotebookSections();
    const version = ++this._tabRenderVersion;
    this._vaultVersion++;
    const target = document.getElementById('teacher-tab-content');
    if (!target) return;
    const tab = this.activeTab;
    let html;
    try {
      html = tab === 'studio' ? this._buildStudioHTML() : await this._buildVaultHTML(tab === 'bookmarks');
    } catch (error) {
      if (version === this._tabRenderVersion) window.app?.showToast('Could not load saved lessons. Please retry.', 'error');
      return;
    }
    if (version !== this._tabRenderVersion || tab !== this.activeTab || target !== document.getElementById('teacher-tab-content')) return;
    target.innerHTML = html;
    if (tab === 'studio') this._bindStudioEvents();
    this._refreshIcons();
  }

  _refreshIcons() {
    if (window.app?.refreshIcons) window.app.refreshIcons();
    else if (window.lucide) window.lucide.createIcons();
  }

  _createRequestController() {
    const controller = new AbortController();
    this._requestControllers.add(controller);
    return controller;
  }

  _cancelRequests() {
    this._requestVersion++;
    this._renderVersion++;
    this._tabRenderVersion++;
    this._vaultVersion++;
    this._attachmentVersion++;
    for (const controller of this._requestControllers) controller.abort();
    this._requestControllers.clear();
    this.isLoading = false;
    this.isFollowUpLoading = false;
    this._simplifying = false;
    this._exampleLoading = false;
    this._stopLoadingCycle();
    this._mentorshipIntent = 'question';
    this._setStudioBusy(false);
  }

  stopVoiceInput() {
    this.isListeningVoice = false;
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onstart = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      try { this.recognition.abort(); } catch { /* already stopped */ }
      this.recognition = null;
    }
  }

  onLeaveView() {
    this._cancelRequests();
    clearTimeout(this._vaultSearchTimer);
    this.stopVoiceInput();
    this.stopSpeech();
    this.closeDiagramModal();
  }

  _setStudioBusy(busy) {
    const content = document.getElementById('teacher-tab-content');
    content?.querySelectorAll('textarea, select, input, button').forEach(control => {
      if (control.classList.contains('pill-clear')) return;
      if (busy && !control.disabled) {
        control.dataset.teacherBusy = 'true';
        control.disabled = true;
      } else if (!busy && control.dataset.teacherBusy) {
        control.disabled = false;
        delete control.dataset.teacherBusy;
      }
    });
  }

  async _refreshStats() {
    if (typeof getAiTeacherStats !== 'function') return;
    const version = this._renderVersion;
    try {
      const stats = await getAiTeacherStats();
      const hero = this.container?.querySelector('.teacher-hero');
      if (hero && version === this._renderVersion) hero.outerHTML = this._buildHeroHTML(stats);
    } catch (error) { console.warn('AI Teacher stats unavailable:', error); }
  }

  _lessonRecord() {
    const settings = this._lessonSettings || {
      language: this.selectedLanguage, depth: this.selectedDepth,
      mode: this.selectedMode, educationLevel: this.selectedEducationLevel,
      advancedModes: { ...this.advancedModes }
    };
    return {
      question: this._lessonQuestion || this.questionInput,
      topic: this.currentExplanation.topic || this._lessonQuestion || this.questionInput,
      subject: this.currentExplanation.subject || 'General', ...settings,
      structuredData: this.currentExplanation, followUpHistory: this.followUpHistory,
      isBookmarked: this.isBookmarked, createdAt: this._recordCreatedAt || new Date().toISOString()
    };
  }

  _sourceLabel() {
    const source = this.currentExplanation?.generation?.source;
    if (source === 'BUILTIN_PEDAGOGICAL_ENGINE') return 'Built-in lesson';
    if (source === 'GEMINI_AI') return 'AI generated • check course sources';
    return 'Source unavailable • check course sources';
  }

  _persistCurrentLesson() {
    if (!this.currentExplanation) return Promise.resolve();
    const version = this._requestVersion;
    const snapshot = JSON.parse(JSON.stringify(this._lessonRecord()));
    const save = this._saveQueue.then(async () => {
      if (version !== this._requestVersion) return;
      const id = await saveAiTeacherExplanation({ ...snapshot, id: this.currentRecordId });
      if (version === this._requestVersion) {
        this.currentRecordId = id;
        this._recordCreatedAt = snapshot.createdAt;
      }
    });
    this._saveQueue = save.catch(() => {});
    return save;
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
                <option value="CLASS_6_8" ${this.selectedEducationLevel === 'CLASS_6_8' ? 'selected' : ''}>🌱 Class 6–8 (Middle School)</option>
                <option value="CLASS_9_10" ${this.selectedEducationLevel === 'CLASS_9_10' ? 'selected' : ''}>📘 Class 9–10 (Board Exam)</option>
                <option value="CLASS_11_12" ${this.selectedEducationLevel === 'CLASS_11_12' ? 'selected' : ''}>📗 Class 11–12 (Senior Secondary)</option>
                <option value="CLASS_12_SCIENCE" ${this.selectedEducationLevel === 'CLASS_12_SCIENCE' ? 'selected' : ''}>🔬 Class 12 Science (PCM/PCB)</option>
                <option value="SSC_CGL" ${this.selectedEducationLevel === 'SSC_CGL' ? 'selected' : ''}>📋 SSC / CGL / CHSL</option>
                <option value="BANKING_RAILWAY" ${this.selectedEducationLevel === 'BANKING_RAILWAY' ? 'selected' : ''}>🏦 Banking / Railway / Other Competitive</option>
                <option value="UPSC" ${this.selectedEducationLevel === 'UPSC' ? 'selected' : ''}>🏛️ UPSC / State PSC</option>
                <option value="COLLEGE" ${this.selectedEducationLevel === 'COLLEGE' ? 'selected' : ''}>🎓 College / University</option>
                <option value="ADVANCED" ${this.selectedEducationLevel === 'ADVANCED' ? 'selected' : ''}>🧪 Advanced / Professional</option>
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
            id="ai-teacher-input" aria-label="Question or topic to explain"
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
                Pages ${this.attachedPdfMeta.fromPage}–${this.attachedPdfMeta.toPage} of ${this.attachedPdfMeta.totalPages} (${this.attachedPdf.length} chars)${this.attachedPdfMeta.totalPages > this.attachedPdfMeta.pageCountSelected ? ' • Only these pages are included' : ''}
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

          <!-- Card 2: Learning Mode -->
          <div class="control-box">
            <div class="control-box-header">
              <div class="control-box-title">
                <i data-lucide="target" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                <span>Learning Mode</span>
              </div>
              <span class="control-box-hint">Teaching Style</span>
            </div>
            <div class="option-boxes-grid-mode">
              <button type="button" class="option-box-btn mode-student-box ${this.selectedMode === 'STUDENT' ? 'active' : ''}" onclick="window.aiTeacherView.setMode('STUDENT')" title="Student Mode: Conceptual clarity & analogies">
                <i data-lucide="sprout" style="width:16px;height:16px;"></i>
                <span class="mode-info">
                  <strong class="mode-title">Student</strong>
                  <small class="mode-sub">Clarity + Analogies</small>
                </span>
              </button>
              <button type="button" class="option-box-btn mode-exam-box ${this.selectedMode === 'EXAM' ? 'active' : ''}" onclick="window.aiTeacherView.setMode('EXAM')" title="Exam Mode: Keywords, facts & blueprint">
                <i data-lucide="award" style="width:16px;height:16px;"></i>
                <span class="mode-info">
                  <strong class="mode-title">Exam</strong>
                  <small class="mode-sub">Score + Strategy</small>
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Native disclosure and labelled, keyboard-operable switches. -->
        <details class="advanced-tools-panel" ${this._advancedPanelOpen || Object.values(this.advancedModes).some(Boolean) ? 'open' : ''} ontoggle="window.aiTeacherView._advancedPanelOpen=this.open">
          <summary class="adv-tools-header">
            <span><i data-lucide="sparkles" aria-hidden="true"></i> Advanced Mentorship Modes (Optional)</span>
            <i data-lucide="chevron-down" class="adv-chevron-icon" aria-hidden="true"></i>
          </summary>
          <div class="adv-tools-body" id="adv-tools-body">
            ${[
              ['socratic', '🧠 Socratic Tutor', 'Think through guiding questions & hints'],
              ['debate', '⚔️ Debate AI', 'Build arguments with evidence & counterpoints'],
              ['mindmap', '🕸️ Mind Maps', 'Visual connections between the key ideas'],
              ['connections', '🔗 Hamsa Connections', 'Useful links to other subjects'],
              ['teachBack', '🎙️ Teach It Back', 'Explain in your words & get feedback']
            ].map(([key, title, description]) => `<label class="adv-switch-card">
              <input type="checkbox" id="teacher-mode-${key}" onchange="window.aiTeacherView.toggleAdvancedMode('${key}', this.checked)" ${this.advancedModes[key] ? 'checked' : ''}>
              <span class="adv-switch-content"><strong>${title}</strong><small>${description}</small></span>
              <span class="adv-toggle" aria-hidden="true"></span>
            </label>`).join('')}
          </div>
        </details>

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
    this._setStudioBusy(this.isLoading);
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

  toggleAdvancedMode(mode, isActive) {
    if (this.advancedModes && Object.hasOwn(this.advancedModes, mode)) {
      this.advancedModes[mode] = isActive === true;
    }
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
        'CLASS_6_8': '🌱 Class 6–8 (Middle School)',
        'CLASS_9_10': '📘 Class 9–10 (Board Exam)',
        'CLASS_11_12': '📗 Class 11–12 (Senior Secondary)',
        'CLASS_12_SCIENCE': '🔬 Class 12 Science (PCM/PCB)',
        'SSC_CGL': '📋 SSC / CGL / CHSL',
        'BANKING_RAILWAY': '🏦 Banking / Railway / Other',
        'UPSC': '🏛️ UPSC / State PSC',
        'COLLEGE': '🎓 College / University',
        'ADVANCED': '🧪 Advanced / Professional'
      };
      window.app.showToast(`AI Teacher adapted to: ${labels[level] || level}`, 'info');
    }
  }

  fillAndExplain(text) {
    if (this.isLoading) return;
    this.questionInput = text;
    const ta = document.getElementById('ai-teacher-input');
    if (ta) ta.value = text;
    this.handleExplain();
  }

  handleClear() {
    this._cancelRequests();
    this.stopVoiceInput();
    this.closeDiagramModal();
    this._releaseImagePreview();
    this._lessonQuestion = null;
    this._lessonSettings = null;
    this.currentRecordId = null;
    this._recordCreatedAt = null;
    this.isBookmarked = false;
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

    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1024 * 1024) {
      window.app?.showToast('Use a PNG, JPEG or WebP image under 1 MB.', 'error');
      event.target.value = '';
      return;
    }
    this._releaseImagePreview();
    const previewUrl = URL.createObjectURL(file);
    this.attachedImage = { file, previewUrl };
    if (window.app) window.app.showToast(`Image "${file.name}" attached`, 'success');
    this._renderActiveTabContent();
  }

  _releaseImagePreview() {
    if (this.attachedImage?.previewUrl) URL.revokeObjectURL(this.attachedImage.previewUrl);
  }

  removeAttachedImage() {
    this._releaseImagePreview();
    this.attachedImage = null;
    this._renderActiveTabContent();
  }

  async handlePdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.pdfExtractor || typeof PdfExtractorService === 'undefined') {
      if (window.app) window.app.showToast('PDF extractor not loaded', 'error');
      return;
    }

    const version = ++this._attachmentVersion;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      window.app?.showToast('Please choose a PDF document.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      window.app?.showToast('Use a PDF under 20 MB.', 'error');
      return;
    }
    try {
      if (window.app) window.app.showToast('Loading and extracting PDF...', 'info');
      // Use a separate extractor so Teacher uploads cannot replace the Quiz document.
      const extractor = new PdfExtractorService();
      await extractor.loadPdfFile(file);
      const extracted = await extractor.extractTextFromPageRange(1, Math.min(extractor.metadata.pageCount, 5));
      if (version !== this._attachmentVersion) return;
      if (!extracted.extractedPages.some(page => page.text.trim())) throw new Error('No readable text found. Scanned PDFs are not supported.');
      if (extracted.text.length > 100000) throw new Error('The extracted text is too large. Use a smaller PDF.');
      this.attachedPdf = extracted.text;
      this.attachedPdfMeta = extracted;
      if (window.app) window.app.showToast(`Attached pages 1–${extracted.toPage} of ${extracted.totalPages} from "${file.name}"${extracted.totalPages > 5 ? "; only the first 5 pages are included" : ""}`, 'success');
      this._renderActiveTabContent();
    } catch (e) {
      if (version !== this._attachmentVersion) return;
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
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
      }
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = (this.selectedLanguage === 'HINDI' || this.selectedLanguage === 'BILINGUAL' || this.selectedLanguage === 'HINGLISH') ? 'hi-IN' : 'en-IN';

      this.recognition.onstart = () => {
        this.isListeningVoice = true;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.add('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic-off" style="width:15px;height:15px;color:#EF4444;"></i> <span>Listening...</span>`;
          if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
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
        window.app?.showToast(err.error === 'not-allowed' ? 'Microphone access was denied. Check browser permissions.' : 'Voice input failed. Please retry or type your question.', 'error');
        this.isListeningVoice = false;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.remove('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic" style="width:15px;height:15px;"></i> <span>Voice</span>`;
          if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
        }
      };

      this.recognition.onend = () => {
        this.isListeningVoice = false;
        const voiceBtn = document.getElementById('teacher-voice-btn');
        if (voiceBtn) {
          voiceBtn.classList.remove('active-recording');
          voiceBtn.innerHTML = `<i data-lucide="mic" style="width:15px;height:15px;"></i> <span>Voice</span>`;
          if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
      window.app?.showToast('Voice input could not start. Please check microphone permissions.', 'error');
      this.isListeningVoice = false;
    }
  }

  removeAttachedPdf() {
    this._attachmentVersion++;
    this.attachedPdf = null;
    this.attachedPdfMeta = null;
    this._renderActiveTabContent();
  }

  // =========================================================================
  // CORE EXPLANATION TRIGGER
  // =========================================================================

  async handleExplain() {
    if (this.isLoading) return;
    const ta = document.getElementById('ai-teacher-input');
    const typed = (ta ? ta.value : this.questionInput).trim();
    const text = typed || (this.attachedImage ? 'Explain the question or diagram in the attached image.'
      : this.attachedPdf ? 'Explain the key concepts in the attached PDF pages.' : '');
    if (!text) {
      window.app?.showToast('Please type a question or problem to explain.', 'error');
      return;
    }
    this._cancelRequests();
    const version = this._requestVersion;
    const controller = this._createRequestController();
    const settings = {
      language: this.selectedLanguage, depth: this.selectedDepth,
      mode: this.selectedMode, educationLevel: this.selectedEducationLevel,
      advancedModes: { ...this.advancedModes }
    };
    const request = {
      question: text, ...settings, imageFile: this.attachedImage?.file,
      pdfContext: this.attachedPdf, signal: controller.signal
    };
    this.questionInput = text;
    this._lessonQuestion = text;
    this._lessonSettings = settings;
    this.currentExplanation = null;
    this.currentRecordId = null;
    this._recordCreatedAt = null;
    this.isBookmarked = false;
    this.followUpHistory = [];
    this.isLoading = true;
    this.stopVoiceInput();
    this.stopSpeech();
    this._setStudioBusy(true);
    this._startLoadingCycle();
    this._updateResultsDOM(this._buildLoadingHTML());
    try {
      const response = await window.aiTeacherService.explain(request);
      if (version !== this._requestVersion || controller.signal.aborted) return;
      const lesson = window.aiTeacherService.normalizeExplanation(response.data);
      if (!lesson) throw new Error('AI returned an invalid lesson. Please retry.');
      this.currentExplanation = lesson;
      let saved = true;
      try {
        await this._persistCurrentLesson();
      } catch (error) {
        saved = false;
        console.warn('Could not save explanation to history:', error);
        if (version === this._requestVersion) window.app?.showToast('Lesson ready, but history could not be saved. Please try Save again.', 'warning');
      }
      if (version !== this._requestVersion || controller.signal.aborted) return;
      if (saved) window.app?.showToast(response.notice || 'Explanation ready!', response.notice ? 'info' : 'success');
      await this._refreshStats();
    } catch (error) {
      if (version !== this._requestVersion || controller.signal.aborted || error.name === 'AbortError') return;
      console.error('Explanation error:', error);
      window.app?.showToast(error.message, 'error');
    } finally {
      this._requestControllers.delete(controller);
      if (version === this._requestVersion) {
        this.isLoading = false;
        this._stopLoadingCycle();
        this._setStudioBusy(false);
        this._updateResultsDOM(this._buildResponseHTML());
        document.getElementById('teacher-results-container')?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
      }
    }
  }

  _startLoadingCycle() {
    this._stopLoadingCycle();
    const stages = [
      {
        step: 1,
        title: "Understanding your question",
        desc: "Finding the key ideas and what needs explaining...",
        percent: 22
      },
      {
        step: 2,
        title: "Matching your learning style",
        desc: "Adapting the depth and language for you...",
        percent: 45
      },
      {
        step: 3,
        title: "Finding helpful examples",
        desc: "Choosing relatable examples and simple analogies...",
        percent: 68
      },
      {
        step: 4,
        title: "Building a clear explanation",
        desc: "Connecting each step, formula and reasoning...",
        percent: 86
      },
      {
        step: 5,
        title: "Preparing visuals & practice",
        desc: "Adding helpful diagrams and practice questions...",
        percent: 96
      }
    ];

    this.loadingStageIndex = 0;
    this.loadingInterval = setInterval(() => {
      this.loadingStageIndex = Math.min(this.loadingStageIndex + 1, stages.length - 1);
      const cur = stages[this.loadingStageIndex];

      const titleEl = document.getElementById('teacher-loading-step-title');
      if (titleEl) titleEl.textContent = cur.title;

      const descEl = document.getElementById('teacher-loading-msg');
      if (descEl) descEl.textContent = cur.desc;

      const pctEl = document.getElementById('teacher-loading-percent');
      if (pctEl) pctEl.textContent = `Estimated ${cur.percent}%`;

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

  _captureNotebookSections() {
    if (this._notebookSectionsVersion !== this._requestVersion) return;
    const result = document.getElementById('teacher-results-container');
    if (!result || result.querySelector('.notebook-folio')?.dataset.notebookVersion !== String(this._requestVersion)) return;
    this._notebookOpenSections = new Set([...result.querySelectorAll('details[data-notebook-section]')]
      .filter(section => section.open).map(section => section.dataset.notebookSection));
  }

  _notebookSectionHTML(key, title, icon, content, count = '') {
    if (this._notebookSectionsVersion !== this._requestVersion) {
      this._notebookSectionsVersion = this._requestVersion;
      this._notebookOpenSections = new Set(['flow', 'diagram']);
    }
    const escape = value => SecurityUtils.escapeHtml(String(value));
    return `<details class="collapsible-section notebook-section" data-notebook-section="${escape(key)}" ${this._notebookOpenSections.has(key) ? 'open' : ''}>
      <summary class="collapsible-header">
        <i data-lucide="${escape(icon)}" style="width:15px;height:15px;"></i>
        <span>${escape(title)}</span>
        ${count ? `<span class="notebook-section-count">${escape(count)}</span>` : ''}
        <i data-lucide="chevron-down" class="collapse-chevron" style="width:14px;height:14px;"></i>
      </summary>
      <div class="collapsible-body">${content}</div>
    </details>`;
  }

  _updateResultsDOM(html) {
    const resEl = document.getElementById('teacher-results-container');
    if (resEl) {
      const sameLesson = resEl.querySelector('.notebook-folio')?.dataset.notebookVersion === String(this._requestVersion);
      const composer = sameLesson ? resEl.querySelector('#followup-input-field') : null;
      const draft = composer?.value || '';
      this._captureNotebookSections();
      resEl.innerHTML = html;
      const nextComposer = resEl.querySelector('#followup-input-field');
      if (composer && nextComposer) nextComposer.value = draft;
      resEl.querySelectorAll('details[data-notebook-section]').forEach(section => {
        section.open = this._notebookOpenSections?.has(section.dataset.notebookSection) || false;
      });
      if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
    }
  }

  // =========================================================================
  // RESPONSE HTML & EDUCATIONAL CARDS BUILDER
  // =========================================================================

  _buildLoadingHTML() {
    return `
      <div class="teacher-loading-card spotlight-card">
        <div class="loading-ambient-mesh" aria-hidden="true"></div>

        <div class="teacher-loading-header">
          <div class="loading-hologram-stage">
            <div class="mind-core-orb">
              <div class="mind-scanner-beam"></div>
              <img src="assets/icons/hamsa-logo-3d.png" alt="Hamsa" class="mind-core-img" onerror="this.src='assets/icons/hamsa-logo.svg'">
            </div>
          </div>
          <div class="loading-text-stack">
            <div class="loading-active-badge">
              <span class="pulse-beacon"></span>
              <span id="teacher-loading-step-title">Understanding your question</span>
            </div>
            <h3 id="teacher-loading-msg" class="loading-step-message">
              Preparing a clear, step-by-step explanation for you...
            </h3>
          </div>
        </div>

        <div class="loading-progress-panel">
          <div class="progress-meta-row">
            <span class="progress-label">Preparing your explanation</span>
            <span id="teacher-loading-percent" class="progress-percent">22%</span>
          </div>
          <div class="loading-progress-track">
            <div id="teacher-loading-bar-fill" class="loading-bar-fill" style="width: 22%;">
              <div class="laser-spark-head"></div>
            </div>
          </div>
        </div>

        <!-- Five compact processing stages -->
        <div class="loading-stages-stepper">
          <div class="stage-step-pill active" id="loading-stage-dot-1">
            <span class="step-num">1</span>
            <span class="step-name">Understand</span>
          </div>
          <div class="stage-step-divider"></div>
          <div class="stage-step-pill" id="loading-stage-dot-2">
            <span class="step-num">2</span>
            <span class="step-name">Context</span>
          </div>
          <div class="stage-step-divider"></div>
          <div class="stage-step-pill" id="loading-stage-dot-3">
            <span class="step-num">3</span>
            <span class="step-name">Teach</span>
          </div>
          <div class="stage-step-divider"></div>
          <div class="stage-step-pill" id="loading-stage-dot-4">
            <span class="step-num">4</span>
            <span class="step-name">Derive</span>
          </div>
          <div class="stage-step-divider"></div>
          <div class="stage-step-pill" id="loading-stage-dot-5">
            <span class="step-num">5</span>
            <span class="step-name">Verify</span>
          </div>
        </div>

        <p class="loading-wisdom-quote">
          ✨ <em>"विद्या ददाति विनयं"</em> • Building clarity from fundamentals.
        </p>
      </div>
    `;
  }

  _mindMapHTML(map) {
    if (!map?.centralTopic || !Array.isArray(map.branches)) return '';
    const escape = value => SecurityUtils.escapeHtml(value || '');
    return `<div class="mentor-mindmap" role="group" aria-label="Mind map">
      <div class="mentor-map-centre">${escape(map.centralTopic)}</div>
      <ul class="mentor-map-branches">${map.branches.map(branch => `<li class="mentor-map-branch">
        <strong>${escape(branch.title)}</strong><p>${escape(branch.detail)}</p>
        ${(branch.children || []).length ? `<ul>${branch.children.map(child => `<li>${escape(child)}</li>`).join('')}</ul>` : ''}
      </li>`).join('')}</ul>
    </div>`;
  }

  _buildMentorshipHTML(exp) {
    const escape = value => SecurityUtils.escapeHtml(value || '');
    const paragraph = value => value ? `<p>${escape(value)}</p>` : '';
    const list = values => `<ul>${(values || []).map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
    const reply = (mode, label) => `<button type="button" class="mentor-reply-btn" ${this.isFollowUpLoading ? 'disabled' : ''} onclick="window.aiTeacherView.beginMentorshipReply('${mode}')">${label}</button>`;
    let html = '';
    if (exp.socraticTutor) {
      const tutor = exp.socraticTutor;
      html += this._notebookSectionHTML('socratic', 'Socratic Tutor · Think it through', 'brain', `<div class="mentor-card">
        ${paragraph(tutor.learningGoal)}<p class="mentor-question">${escape(tutor.guidingQuestion)}</p>
        <div class="mentor-hints">${(tutor.hints || []).map((hint, index) => `<details><summary>Hint ${index + 1}</summary>${paragraph(hint)}</details>`).join('')}</div>
        ${reply('socratic', 'Share your reasoning')}
      </div>`);
    }
    if (exp.debateCoach) {
      const debate = exp.debateCoach;
      html += this._notebookSectionHTML('debate', 'Debate AI · Reason with evidence', 'messages-square', `<div class="mentor-card">
        <p class="mentor-question">${escape(debate.claim)}</p>
        <div class="mentor-debate-grid"><div><h4>Supporting evidence</h4>${list(debate.supportingPoints)}</div>
          <div><h4>Counterpoints & limitations</h4>${list(debate.counterPoints)}</div></div>
        ${paragraph(debate.boundary)}<p class="mentor-question">${escape(debate.reflectionQuestion)}</p>
        ${reply('debate', 'Present your argument')}
      </div>`);
    }
    if (exp.mindMap || exp.mermaidMindmap) {
      html += this._notebookSectionHTML('mindmap', 'Mind Map · Connect the ideas', 'network', exp.mindMap
        ? this._mindMapHTML(exp.mindMap)
        : `<div class="mentor-card"><p>Saved mind-map outline</p><pre class="mentor-map-outline">${escape(exp.mermaidMindmap)}</pre></div>`);
    }
    if (exp.hamsaConnections && Object.keys(exp.hamsaConnections).length) {
      html += this._notebookSectionHTML('connections', 'Hamsa Connections · Across subjects', 'link', `<div class="mentor-connections">${Object.entries(exp.hamsaConnections).map(([subject, detail]) => `<div class="mentor-card"><h4>${escape(subject)}</h4>${paragraph(detail)}</div>`).join('')}</div>`);
    }
    if (exp.teachBackChallenge) {
      html += this._notebookSectionHTML('teachback', 'Teach It Back · Explain in your words', 'mic', `<div class="mentor-card">
        <p class="mentor-question">${escape(exp.teachBackChallenge)}</p>
        ${(exp.teachBackCriteria || []).length ? `<h4>Your explanation should cover</h4>${list(exp.teachBackCriteria)}` : ''}
        ${reply('teachBack', 'Explain it & get feedback')}
      </div>`);
    }
    return html;
  }

  _replyComposer() {
    return {
      socratic: { label: 'Your Socratic reasoning', placeholder: 'Share your next step or tell me where you are stuck...' },
      debate: { label: 'Your argument', placeholder: 'State your position and the evidence supporting it...' },
      teachBack: { label: 'Your teach-back explanation', placeholder: 'Explain the idea in your own words, including the points above...' },
      question: { label: 'Follow-up question', placeholder: 'Ask a doubt · Shift + Enter for a new line' }
    }[this._mentorshipIntent] || { label: 'Follow-up question', placeholder: 'Ask a doubt about this topic...' };
  }

  beginMentorshipReply(mode) {
    if (!this.currentExplanation || this.isLoading || this.isFollowUpLoading) return;
    if (!['question', 'socratic', 'debate', 'teachBack'].includes(mode)) return;
    if (mode !== 'question' && !window.aiTeacherService.lessonAdvancedModes(this.currentExplanation)[mode]) return;
    const draft = document.getElementById('followup-input-field')?.value || '';
    this._mentorshipIntent = mode;
    this._updateResultsDOM(this._buildResponseHTML());
    const input = document.getElementById('followup-input-field');
    if (input) {
      input.value = draft;
      input.focus();
      input.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }

  _buildResponseHTML() {
    const exp = this.currentExplanation;
    if (!exp) return '';
    if (this._notebookSectionsVersion !== this._requestVersion) {
      this._notebookSectionsVersion = this._requestVersion;
      this._notebookOpenSections = new Set(['flow', 'diagram']);
      const modes = window.aiTeacherService.lessonAdvancedModes(exp);
      for (const [mode, section] of [['socratic', 'socratic'], ['debate', 'debate'], ['mindmap', 'mindmap'], ['connections', 'connections'], ['teachBack', 'teachback']]) {
        if (modes[mode]) this._notebookOpenSections.add(section);
      }
    }

    // Extract questionAnalysis if available (from new AI schema)
    const qa = exp.questionAnalysis || {};
    const analysisSubject = qa.subject || exp.subject || 'General';
    const analysisTopic = qa.topic || exp.topic || '';
    const analysisType = qa.questionType || '';
    const analysisDiff = qa.difficulty || exp.difficulty || '';
    const analysisExamRel = qa.examRelevance || '';
    const analysisSubtopic = qa.subtopic || '';

    // Helper: determine if a section has meaningful content
    const hasMath = exp.mathSolution && (exp.isMath || exp.mathSolution.formula || exp.mathSolution.calculationSteps?.length || exp.mathSolution.finalAnswer);
    const hasWhyHow = exp.whyAndHow && (exp.whyAndHow.why || exp.whyAndHow.how);
    const hasSteps = exp.steps && exp.steps.length > 0;
    const hasAnalogy = exp.analogy?.analogyText;
    const hasExamples = exp.examples && exp.examples.length > 0;
    const hasFlowchart = exp.flowchart && exp.flowchart.nodes && exp.flowchart.nodes.length > 0;
    const hasDiagram = exp.diagram && exp.diagram.svgContent;
    const hasComparison = exp.comparison && exp.comparison.headers && exp.comparison.rows && exp.comparison.rows.length > 0;
    const hasMistakes = exp.commonMistakes && exp.commonMistakes.length > 0;
    const hasMemoryTrick = exp.memoryTrick && exp.memoryTrick.mnemonic;
    const hasExamPoints = exp.examPoints && (exp.examPoints.highYieldPoints?.length || exp.examPoints.expectedAnswerStructure);
    const hasSummary = exp.summary && exp.summary.length > 0;
    const hasPractice = exp.practiceQuestions && exp.practiceQuestions.length > 0;
    const hasSources = exp.sources && exp.sources.length > 0;
    const hasFollowUp = exp.followUpSuggestions && exp.followUpSuggestions.length > 0;
    const mathHTML = hasMath ? `
            <div class="math-board-block">
              <div class="math-board-header">
                <span class="math-board-badge">📐 Math Solution</span>
                <span class="math-verified-tag">Solution steps</span>
              </div>
              <div class="math-given-find-grid">
                ${exp.mathSolution.given ? `<div class="math-pill"><span class="math-pill-lbl">Given:</span> <span>${SecurityUtils.escapeHtml(exp.mathSolution.given)}</span></div>` : ''}
                ${exp.mathSolution.toFind ? `<div class="math-pill"><span class="math-pill-lbl">Find:</span> <span>${SecurityUtils.escapeHtml(exp.mathSolution.toFind)}</span></div>` : ''}
              </div>
              ${exp.mathSolution.formula ? `
                <div class="math-formula-callout"><span class="math-formula-lbl">FORMULA:</span>
                  <div class="math-formula-display">${SecurityUtils.escapeHtml(exp.mathSolution.formula)}</div>
                  ${exp.mathSolution.formulaExplanation ? `<div class="math-formula-desc">${SecurityUtils.escapeHtml(exp.mathSolution.formulaExplanation)}</div>` : ''}
                </div>
              ` : ''}
              ${exp.mathSolution.calculationSteps?.length ? this._notebookSectionHTML('calculation', 'Worked solution — every step explained', 'list-ordered', `
                <table class="math-steps-table"><tbody>
                  ${exp.mathSolution.calculationSteps.map(cs => `<tr><td class="math-step-col">${SecurityUtils.escapeHtml(cs.math || cs.step)}</td><td class="math-desc-col">${SecurityUtils.escapeHtml(cs.explanation || '')}</td></tr>`).join('')}
                </tbody></table>
              `, exp.mathSolution.calculationSteps.length + ' steps') : ''}
              ${exp.mathSolution.finalAnswer ? `
                <div class="math-final-banner">
                  <span class="math-final-lbl">ANSWER:</span>
                  <span class="math-final-val">${SecurityUtils.escapeHtml(exp.mathSolution.finalAnswer)} ${SecurityUtils.escapeHtml(exp.mathSolution.units || '')}</span>
                  ${exp.mathSolution.verification ? `<span class="math-verify-line">✓ ${SecurityUtils.escapeHtml(exp.mathSolution.verification)}</span>` : ''}
                </div>
              ` : ''}
            </div>
    ` : '';

    return `
      <div class="teacher-response-view">
        <!-- Compact Response Card -->
        <article class="teacher-book-folio notebook-folio" data-notebook-version="${this._requestVersion}">
          <div class="book-spine-ribbon"></div>

          <div class="notebook-caption"><span>Your study notebook</span><span>समझें • याद रखें</span></div>

          <!-- Question Analysis Metadata Bar -->
          <div class="response-analysis-bar">
            <div class="analysis-pills">
              <span class="analysis-pill pill-subject">📚 ${SecurityUtils.escapeHtml(analysisSubject)}</span>
              ${analysisType ? `<span class="analysis-pill pill-type">${SecurityUtils.escapeHtml(analysisType)}</span>` : ''}
              <span class="analysis-pill pill-level">🎓 ${SecurityUtils.escapeHtml(exp.studentContext?.levelLabel || analysisDiff || 'Student')}</span>
              <span class="analysis-pill pill-lang">🌐 ${SecurityUtils.escapeHtml(this._lessonSettings?.language || this.selectedLanguage)}</span>
            </div>
            ${analysisExamRel ? `<div class="analysis-exam-relevance"><i data-lucide="target" style="width:12px;height:12px;"></i> ${SecurityUtils.escapeHtml(analysisExamRel)}</div>` : ''}
          </div>

          <!-- Question -->
          <div class="book-query-banner compact">
            <h2 class="query-banner-title compact">${SecurityUtils.escapeHtml(this._lessonQuestion || this.questionInput || exp.topic || 'Concept')}</h2>
          </div>

          <!-- ===== CORE EXPLANATION (Always Visible) ===== -->

          <!-- Quick Answer -->
          ${exp.quickAnswer ? `
            <div class="teacher-takeaway-box compact">
              <div class="takeaway-header">
                <div class="takeaway-badge">
                  <i data-lucide="zap" style="width:14px;height:14px;"></i>
                  <span>${exp.socraticTutor ? 'Your starting hint • शुरुआती संकेत' : 'The key idea • मुख्य बात'}</span>
                </div>
                <button class="book-mini-tool-btn" aria-label="Copy quick answer" data-copy-section="quickAnswer" onclick="window.aiTeacherView.copySectionFromData('quickAnswer')"><i data-lucide="copy" style="width:12px;height:12px;"></i></button>
              </div>
              <div class="takeaway-body">${SecurityUtils.sanitizeHtml(marked.parse(exp.quickAnswer || ''))}</div>
            </div>
          ` : ''}

          <!-- Foundation / Detailed Explanation -->
          ${exp.foundation ? `
            <div class="foundation-block compact">
              <div class="foundation-header">
                <h3 class="foundation-heading">
                  <i data-lucide="book-open" style="width:15px;height:15px;color:var(--color-primary-light);"></i>
                  <span>${SecurityUtils.escapeHtml(exp.foundation.title || 'Explanation')}</span>
                </h3>
                <button class="book-mini-tool-btn" onclick="window.aiTeacherView.makeSimpler()">
                  <i data-lucide="smile" style="width:13px;height:13px;"></i> Simpler
                </button>
              </div>
              <div class="foundation-content">${SecurityUtils.sanitizeHtml(marked.parse(exp.foundation.explanation || ''))}</div>
              ${exp.foundation.technicalTerms?.length ? this._notebookSectionHTML('terms', 'Key terms, made simple', 'key', `
                <div class="glossary-container compact">

                  <div class="glossary-grid">
                    ${exp.foundation.technicalTerms.map(t => `
                      <div class="glossary-card compact">
                        <span class="glossary-term">${SecurityUtils.escapeHtml(t.term)}</span>
                        <span class="glossary-meaning">${SecurityUtils.escapeHtml(t.simpleMeaning)}</span>
                        ${t.example ? `<span class="glossary-example">💡 ${SecurityUtils.escapeHtml(t.example)}</span>` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
              `, exp.foundation.technicalTerms.length) : ''}
            </div>
          ` : ''}

          <!-- Math Solution (If applicable — always visible for math) -->
          ${hasMath ? (exp.isMath ? mathHTML : this._notebookSectionHTML('formula', 'Formula & worked example', 'calculator', mathHTML)) : ''}

          ${hasFlowchart || hasDiagram ? `<div class="notebook-visuals-grid">
          <!-- Flowchart (Always visible if present) -->
          ${hasFlowchart ? this._notebookSectionHTML('flow', 'See the process', 'workflow', `
            <div class="flowchart-book-card">
              <div class="flowchart-header"><i data-lucide="workflow" style="width:14px;height:14px;color:var(--color-primary-light);"></i> <span>${SecurityUtils.escapeHtml(exp.flowchart.title || 'Process Flow')}</span></div>
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
          `, exp.flowchart.nodes.length + ' stages') : ''}

          <!-- Diagram (Always visible if present) -->
          ${hasDiagram ? this._notebookSectionHTML('diagram', 'Picture the concept', 'image', `
            <div class="diagram-book-card">
              <div class="diagram-book-header">
                <div class="diagram-book-title"><i data-lucide="image" style="width:14px;height:14px;color:var(--color-gold);"></i> <span>${SecurityUtils.escapeHtml(exp.diagram.title || 'Diagram')}</span></div>
                <div class="diagram-toolbar">
                  <button class="book-mini-tool-btn" onclick="window.aiTeacherView.openDiagramModal()"><i data-lucide="maximize-2" style="width:12px;height:12px;"></i> Fullscreen</button>
                  <button class="book-mini-tool-btn" onclick="window.aiTeacherView.downloadDiagramSvg()"><i data-lucide="download" style="width:12px;height:12px;"></i> SVG</button>
                </div>
              </div>
              <div class="diagram-viewer-box">${SecurityUtils.sanitizeSvg(exp.diagram.svgContent)}</div>
              ${exp.diagram.caption ? `<div class="diagram-caption">${SecurityUtils.escapeHtml(exp.diagram.caption)}</div>` : ''}
            </div>
          `, '') : ''}

          </div>` : ''}

          <div class="notebook-sections-grid">
          <!-- Deeper explanation, available on demand -->
          ${hasWhyHow ? this._notebookSectionHTML('mechanism', 'Why & how it works', 'help-circle', `
            <div class="why-how-row">
              ${exp.whyAndHow.what ? `<div class="why-how-col"><span class="why-how-tag">WHAT</span><p>${SecurityUtils.escapeHtml(exp.whyAndHow.what)}</p></div>` : ''}
              ${exp.whyAndHow.why ? `<div class="why-how-col col-why"><span class="why-how-tag tag-why">WHY</span><p>${SecurityUtils.escapeHtml(exp.whyAndHow.why)}</p></div>` : ''}
              ${exp.whyAndHow.how ? `<div class="why-how-col col-how"><span class="why-how-tag tag-how">HOW</span><p>${SecurityUtils.escapeHtml(exp.whyAndHow.how)}</p></div>` : ''}
            </div>
          `, '') : ''}

          <!-- Steps (Always visible if present) -->
          ${hasSteps ? this._notebookSectionHTML('reasoning', 'Follow the reasoning', 'list-ordered', `
            <div class="steps-spine-container">

              <div class="steps-spine-list">
                ${exp.steps.map(s => `
                  <div class="spine-step-item">
                    <div class="spine-num">${SecurityUtils.escapeHtml(String(s.stepNumber || '•'))}</div>
                    <div class="spine-content">
                      <h4 class="spine-heading">${SecurityUtils.escapeHtml(s.title || '')}</h4>
                      <div class="spine-text">${SecurityUtils.sanitizeHtml(marked.parse(s.content || ''))}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `, exp.steps.length + ' steps') : ''}

          <!-- Comparison Table (Always visible if present) -->
          ${hasComparison ? this._notebookSectionHTML('comparison', 'Compare & understand', 'table', `
            <div class="comparison-book-card">
              <div class="comparison-header"><i data-lucide="table" style="width:14px;height:14px;color:var(--color-primary-light);"></i> <span>${SecurityUtils.escapeHtml(exp.comparison.title || 'Comparison')}</span></div>
              <div class="comparison-table-wrapper">
                <table class="comparison-table">
                  <thead><tr>${exp.comparison.headers.map(h => `<th>${SecurityUtils.escapeHtml(h)}</th>`).join('')}</tr></thead>
                  <tbody>${exp.comparison.rows.map(row => `<tr>${row.map(cell => `<td>${SecurityUtils.escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
              </div>
            </div>
          `, '') : ''}

          <!-- ===== COLLAPSIBLE SECTIONS (Progressive Disclosure) ===== -->

          ${hasAnalogy || hasExamples ? `
            <details class="collapsible-section notebook-section" data-notebook-section="examples" ${this._notebookOpenSections.has('examples') ? 'open' : ''}>
              <summary class="collapsible-header">
                <i data-lucide="lightbulb" style="width:14px;height:14px;"></i>
                <span>Make it click: examples</span>
                <i data-lucide="chevron-down" class="collapse-chevron" style="width:14px;height:14px;"></i>
              </summary>
              <div class="collapsible-body">
                <div class="analogy-examples-grid">
                  ${hasAnalogy ? `
                    <div class="analogy-card-book">
                      <div class="analogy-header"><span class="analogy-badge">💡 Analogy</span></div>
                      <div class="analogy-body">"${SecurityUtils.escapeHtml(exp.analogy.analogyText)}"</div>
                      ${exp.analogy.takeaway ? `<div class="analogy-takeaway-footer">🎯 <strong>Takeaway:</strong> ${SecurityUtils.escapeHtml(exp.analogy.takeaway)}</div>` : ''}
                    </div>
                  ` : ''}
                  ${hasExamples ? `
                    <div class="examples-card-book">
                      <div class="examples-header">
                        <span class="examples-badge">🧠 Examples</span>
                        <button class="book-mini-tool-btn" onclick="window.aiTeacherView.anotherExample()"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> New</button>
                      </div>
                      <div class="examples-body">
                        ${exp.examples.map(ex => `
                          <div class="example-mini-box">
                            <div class="example-top"><strong>${SecurityUtils.escapeHtml(ex.title || 'Example')}</strong> ${ex.type ? `<span class="example-type-pill">${SecurityUtils.escapeHtml(ex.type)}</span>` : ''}</div>
                            <div class="example-text">${SecurityUtils.sanitizeHtml(marked.parse(ex.description || ''))}</div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </details>
          ` : ''}

          ${hasMistakes || hasMemoryTrick || hasExamPoints || hasSummary ? `
            <details class="collapsible-section notebook-section" data-notebook-section="revision" ${this._notebookOpenSections.has('revision') ? 'open' : ''}>
              <summary class="collapsible-header">
                <i data-lucide="shield" style="width:14px;height:14px;"></i>
                <span>Remember & revise</span>
                <i data-lucide="chevron-down" class="collapse-chevron" style="width:14px;height:14px;"></i>
              </summary>
              <div class="collapsible-body">
                <div class="mistakes-trick-row">
                  ${hasMistakes ? `
                    <div class="mistakes-book-card">
                      <div class="mistakes-header"><i data-lucide="alert-triangle" style="width:13px;height:13px;color:var(--color-error);"></i> <span>Common Mistakes</span></div>
                      <div class="mistakes-list">
                        ${exp.commonMistakes.map(m => `
                          <div class="mistake-item"><div class="mistake-wrong">❌ ${SecurityUtils.escapeHtml(m.mistake)}</div><div class="mistake-correct">✅ ${SecurityUtils.escapeHtml(m.correction)}</div></div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                  ${hasMemoryTrick ? `
                    <div class="trick-book-card">
                      <div class="trick-header"><i data-lucide="key" style="width:13px;height:13px;color:var(--color-gold);"></i> <span>Memory Trick</span></div>
                      <div class="mnemonic-badge">${SecurityUtils.escapeHtml(exp.memoryTrick.mnemonic)}</div>
                      <div class="trick-explanation">${SecurityUtils.escapeHtml(exp.memoryTrick.explanation || '')}</div>
                    </div>
                  ` : ''}
                </div>
                ${hasExamPoints ? `
                  <div class="exam-points-book-card">
                    <div class="exam-points-header"><i data-lucide="award" style="width:14px;height:14px;color:var(--color-gold);"></i> <span>High-Yield Exam Points</span></div>
                    ${exp.examPoints.highYieldPoints && exp.examPoints.highYieldPoints.length > 0 ? `<ul class="exam-points-list">${exp.examPoints.highYieldPoints.map(p => `<li><strong>${SecurityUtils.escapeHtml(p)}</strong></li>`).join('')}</ul>` : ''}
                    ${exp.examPoints.expectedAnswerStructure ? `<div class="exam-answer-structure-box"><strong style="color:var(--color-primary-light);">📝 Answer Structure:</strong> <span>${SecurityUtils.escapeHtml(exp.examPoints.expectedAnswerStructure)}</span></div>` : ''}
                  </div>
                ` : ''}
                ${hasSummary ? `
                  <div class="summary-book-card">
                    <div class="summary-header"><i data-lucide="check-circle" style="width:13px;height:13px;color:var(--color-success);"></i> <span>Summary</span></div>
                    <ul class="summary-checklist">${exp.summary.map(s => `<li>${SecurityUtils.escapeHtml(s)}</li>`).join('')}</ul>
                  </div>
                ` : ''}
              </div>
            </details>
          ` : ''}

          ${hasPractice ? `
            <details class="collapsible-section notebook-section" data-notebook-section="practice" ${this._notebookOpenSections.has('practice') ? 'open' : ''}>
              <summary class="collapsible-header">
                <i data-lucide="pen-tool" style="width:14px;height:14px;"></i>
                <span>Practice (${exp.practiceQuestions.length})</span>
                <i data-lucide="chevron-down" class="collapse-chevron" style="width:14px;height:14px;"></i>
              </summary>
              <div class="collapsible-body">
                <div class="practice-questions-list">
                  ${exp.practiceQuestions.map((pq, idx) => `
                    <div class="practice-question-item">
                      <div class="pq-header">
                        <span class="pq-type-tag">${SecurityUtils.escapeHtml(pq.type || 'PRACTICE')}</span>
                        <span class="pq-qnum">Q${idx + 1}</span>
                      </div>
                      <div class="pq-question-text">${SecurityUtils.escapeHtml(pq.question)}</div>
                      ${pq.options && pq.options.length > 0 ? `
                        <div class="pq-options-grid">
                          ${pq.options.map((opt, oi) => `<div class="pq-option-pill"><span class="pq-opt-letter">${String.fromCharCode(65 + oi)}.</span> <span>${SecurityUtils.escapeHtml(opt)}</span></div>`).join('')}
                        </div>
                      ` : ''}
                      <button class="pq-show-answer-btn" onclick="window.aiTeacherView.togglePracticeAnswer(this)">
                        <i data-lucide="eye" style="width:13px;height:13px;"></i> Show Answer
                      </button>
                      <div class="pq-answer-box">
                        <div class="pq-correct-line">✓ <strong>${SecurityUtils.escapeHtml(pq.answer)}</strong></div>
                        <div>${SecurityUtils.escapeHtml(pq.explanation || '')}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </details>
          ` : ''}

          ${hasSources ? `
            <details class="collapsible-section notebook-section" data-notebook-section="sources" ${this._notebookOpenSections.has('sources') ? 'open' : ''}>
              <summary class="collapsible-header">
                <i data-lucide="book-marked" style="width:14px;height:14px;"></i>
                <span>Sources (${exp.sources.length})</span>
                <i data-lucide="chevron-down" class="collapse-chevron" style="width:14px;height:14px;"></i>
              </summary>
              <div class="collapsible-body">
                <div class="sources-list">
                  ${exp.sources.map(src => `
                    <div class="source-item">
                      <span class="source-name">${SecurityUtils.escapeHtml(src.name || 'Source')}</span>
                      ${src.detail ? `<span class="source-detail">${SecurityUtils.escapeHtml(src.detail)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </details>
          ` : ''}

          ${this._buildMentorshipHTML(exp)}

          </div>

          <!-- Follow-up Chat -->
          <div class="followup-book-card">
            <div class="followup-header">
              <div class="followup-title"><i data-lucide="message-square" style="width:14px;height:14px;color:var(--color-primary-light);"></i> <span>Still curious? Ask your doubt</span></div>
            </div>
            ${hasFollowUp ? this._notebookSectionHTML('suggestions', 'Suggested next questions', 'message-circle', `
              <div class="followup-suggestions-row">
                ${exp.followUpSuggestions.map((sug, idx) => `<button class="followup-suggestion-chip" data-followup-idx="${idx}" onclick="window.aiTeacherView.askFollowUpChipByIndex(${idx})">${SecurityUtils.escapeHtml(sug)}</button>`).join('')}
              </div>
            `, exp.followUpSuggestions.length) : ''}
            ${this._mentorshipIntent !== 'question' ? `<div class="mentorship-reply-context"><span>${SecurityUtils.escapeHtml(this._replyComposer().label)}</span><button type="button" onclick="window.aiTeacherView.beginMentorshipReply('question')">Ask a different question</button></div>` : ''}
            <div class="followup-input-wrapper">
              <textarea id="followup-input-field" aria-label="${SecurityUtils.escapeHtml(this._replyComposer().label)}" class="followup-input" rows="2" placeholder="${SecurityUtils.escapeHtml(this._replyComposer().placeholder)}" onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.aiTeacherView.sendFollowUp(); }"></textarea>
              <button class="followup-send-btn" onclick="window.aiTeacherView.sendFollowUp()"><i data-lucide="send" style="width:14px;height:14px;"></i> ${this._mentorshipIntent === 'question' ? 'Ask' : 'Send'}</button>
            </div>
            <div class="followup-messages-list" id="followup-messages-container">
              ${this.followUpHistory.map(item => `
                <div class="followup-msg-bubble">
                  <div class="followup-msg-query">❓ ${SecurityUtils.escapeHtml(item.query)}</div>
                  <div class="followup-msg-answer">
                    <strong>🎓 AI Teacher:</strong> ${SecurityUtils.sanitizeHtml(marked.parse(item.response.followUpAnswer || ''))}
                    ${item.response.clarifyingExample ? `<div style="margin-top:0.4rem;font-style:italic;color:var(--text-primary);">💡 ${SecurityUtils.escapeHtml(item.response.clarifyingExample)}</div>` : ''}
                    ${item.response.checkQuestion ? `<p class="mentorship-next-question">${SecurityUtils.escapeHtml(item.response.checkQuestion)}</p>` : ''}
                    ${item.response.miniAnalogy ? `<div style="margin-top:0.3rem;color:var(--color-gold);">🧠 ${SecurityUtils.escapeHtml(item.response.miniAnalogy)}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Compact Footer -->
          <footer class="book-folio-footer">
            <span>📖 HAMSA VIDYA AI TEACHER</span>
            <span>${SecurityUtils.escapeHtml(this._sourceLabel())}</span>
          </footer>
        </article>

        <!-- ACTIONS TOOLBAR -->
        <div class="teacher-actions-bar">
          <div class="tts-controls-group">
            <button class="tts-mini-btn" id="tts-play-btn" onclick="window.aiTeacherView.toggleSpeech()" title="Listen">
              <i data-lucide="${this.isSpeaking && !this.isPaused ? 'volume-x' : 'volume-2'}" style="width:16px;height:16px;"></i>
            </button>
            <span style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);">${this.isSpeaking ? (this.isPaused ? 'Paused' : 'Playing') : 'Listen'}</span>
          </div>
          <div class="actions-group">
            <button class="teacher-action-btn" onclick="window.aiTeacherView.makeSimpler()" title="Simpler"><i data-lucide="smile" style="width:14px;height:14px;"></i> <span>Simpler</span></button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.anotherExample()" title="New Example"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> <span>Example</span></button>
          </div>
          <div class="actions-group">
            <button class="teacher-action-btn" onclick="window.aiTeacherView.copyExplanation()" title="Copy"><i data-lucide="copy" style="width:14px;height:14px;"></i> <span>Copy</span></button>
            <button class="teacher-action-btn ${this.isBookmarked ? 'active' : ''}" onclick="window.aiTeacherView.toggleBookmark()" title="Save">
              <i data-lucide="${this.isBookmarked ? 'bookmark-check' : 'bookmark'}" style="width:14px;height:14px;"></i> <span>${this.isBookmarked ? 'Saved' : 'Save'}</span>
            </button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.downloadPdf()" title="PDF"><i data-lucide="download" style="width:14px;height:14px;"></i> <span>PDF</span></button>
            <button class="teacher-action-btn" onclick="window.aiTeacherView.printExplanation()" title="Print"><i data-lucide="printer" style="width:14px;height:14px;"></i> <span>Print</span></button>
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
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
  }

  async makeSimpler() {
    if (!this.currentExplanation || this.isLoading || this._simplifying) return;
    this._simplifying = true;
    const version = this._requestVersion;
    const controller = this._createRequestController();
    if (window.app) window.app.showToast('Re-crafting explanation in simpler language...', 'info');

    // Show loading state on the Simpler button
    const simplerBtns = document.querySelectorAll('.teacher-action-btn, .book-mini-tool-btn');
    simplerBtns.forEach(b => { if (b.textContent.includes('Simpler')) b.setAttribute('disabled', 'true'); });

    try {
      const result = await window.aiTeacherService.makeItSimpler({
        question: this._lessonQuestion || this.questionInput,
        currentExplanation: this.currentExplanation,
        language: this._lessonSettings?.language || this.selectedLanguage,
        educationLevel: this._lessonSettings?.educationLevel || this.selectedEducationLevel,
        signal: controller.signal
      });
      if (version !== this._requestVersion || controller.signal.aborted) return;

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

      await this._persistCurrentLesson();
      if (version !== this._requestVersion) return;
      this._updateResultsDOM(this._buildResponseHTML());
      if (window.app) window.app.showToast('Simplified! Easier words & story added.', 'success');
    } catch (e) {
      if (version !== this._requestVersion || controller.signal.aborted || e.name === 'AbortError') return;
      this._updateResultsDOM(this._buildResponseHTML());
      console.error(e);
      if (window.app) window.app.showToast(`Could not simplify: ${e.message}`, 'error');
    } finally {
      this._requestControllers.delete(controller);
      if (version === this._requestVersion) this._simplifying = false;
      simplerBtns.forEach(b => b.removeAttribute('disabled'));
    }
  }

  async anotherExample() {
    if (!this.currentExplanation || this.isLoading || this._exampleLoading) return;
    this._exampleLoading = true;
    const version = this._requestVersion;
    const controller = this._createRequestController();
    if (window.app) window.app.showToast('Generating a fresh, distinct example...', 'info');

    // Show loading state on the Example button
    const exBtns = document.querySelectorAll('.teacher-action-btn, .book-mini-tool-btn');
    exBtns.forEach(b => { if (b.textContent.includes('Example') || b.textContent.includes('New')) b.setAttribute('disabled', 'true'); });

    try {
      const result = await window.aiTeacherService.generateAnotherExample({
        question: this._lessonQuestion || this.questionInput,
        currentExplanation: this.currentExplanation,
        language: this._lessonSettings?.language || this.selectedLanguage,
        educationLevel: this._lessonSettings?.educationLevel || this.selectedEducationLevel,
        signal: controller.signal
      });
      if (version !== this._requestVersion || controller.signal.aborted) return;

      if (!this.currentExplanation.examples) this.currentExplanation.examples = [];
      this.currentExplanation.examples.unshift({
        type: 'Brand New Example',
        title: result.title || 'Fresh Example',
        description: `${result.scenario || ''}\n\n**Application:** ${result.howItApplies || ''}\n\n*Takeaway:* ${result.takeaway || ''}`
      });

      await this._persistCurrentLesson();
      if (version !== this._requestVersion) return;
      this._updateResultsDOM(this._buildResponseHTML());
      if (window.app) window.app.showToast('Fresh example added!', 'success');
    } catch (e) {
      if (version !== this._requestVersion || controller.signal.aborted || e.name === 'AbortError') return;
      this._updateResultsDOM(this._buildResponseHTML());
      console.error(e);
      if (window.app) window.app.showToast(`Could not generate example: ${e.message}`, 'error');
    } finally {
      this._requestControllers.delete(controller);
      if (version === this._requestVersion) this._exampleLoading = false;
      exBtns.forEach(b => b.removeAttribute('disabled'));
    }
  }

  askFollowUpChip(text) {
    this._mentorshipIntent = 'question';
    const input = document.getElementById('followup-input-field');
    if (input) {
      input.value = text;
      this.sendFollowUp();
    }
  }

  /** Safe alternative: look up the suggestion text by index from current explanation data */
  askFollowUpChipByIndex(idx) {
    const suggestions = this.currentExplanation?.followUpSuggestions;
    if (!suggestions || idx < 0 || idx >= suggestions.length) return;
    this.askFollowUpChip(suggestions[idx]);
  }

  async sendFollowUp() {
    if (!this.currentExplanation || this.isLoading || this.isFollowUpLoading) return;
    const input = document.getElementById('followup-input-field');
    const query = (input ? input.value : '').trim();
    if (!query) return;

    const replyIntent = this._mentorshipIntent;
    this.isFollowUpLoading = true;
    const version = this._requestVersion;
    const controller = this._createRequestController();
    input.value = '';
    if (window.app) window.app.showToast('AI Teacher is thinking...', 'info');

    // Disable the send button during loading
    const sendBtn = input?.parentElement?.querySelector('.followup-send-btn');
    if (sendBtn) { sendBtn.setAttribute('disabled', 'true'); sendBtn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;" class="spin-icon"></i> Thinking...'; }

    try {
      const response = await window.aiTeacherService.askFollowUp({
        originalQuestion: this._lessonQuestion || this.questionInput,
        previousExplanation: this.currentExplanation,
        followUpQuery: query,
        language: this._lessonSettings?.language || this.selectedLanguage,
        educationLevel: this._lessonSettings?.educationLevel || this.selectedEducationLevel,
        studentContext: this.currentExplanation.studentContext,
        history: this.followUpHistory, replyIntent, pdfContext: this.attachedPdf, signal: controller.signal
      });

      if (version !== this._requestVersion || controller.signal.aborted) return;
      this.followUpHistory.push({ query, response, replyIntent });
      try { await this._persistCurrentLesson(); }
      catch (saveError) {
        if (version === this._requestVersion) window.app?.showToast('Reply ready, but history could not be saved. Please try Save again.', 'warning');
      }
      if (version !== this._requestVersion) return;
      this._updateResultsDOM(this._buildResponseHTML());

      const container = document.getElementById('followup-messages-container');
      if (container) container.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (e) {
      if (version !== this._requestVersion || controller.signal.aborted || e.name === 'AbortError') return;
      this._updateResultsDOM(this._buildResponseHTML());
      const retryInput = document.getElementById('followup-input-field');
      if (retryInput && !retryInput.value) retryInput.value = query;
      console.error(e);
      if (window.app) window.app.showToast(`Could not process follow-up: ${e.message}`, 'error');
      // Restore the send button on error
      if (sendBtn) { sendBtn.removeAttribute('disabled'); sendBtn.innerHTML = '<i data-lucide="send" style="width:14px;height:14px;"></i> Ask'; if (window.lucide) window.lucide.createIcons(); }
    } finally {
      this._requestControllers.delete(controller);
      if (version === this._requestVersion) {
        this.isFollowUpLoading = false;
        document.querySelectorAll('#teacher-results-container .mentor-reply-btn').forEach(button => button.removeAttribute('disabled'));
        const currentSendButton = document.querySelector('#teacher-results-container .followup-send-btn');
        if (currentSendButton) {
          currentSendButton.removeAttribute('disabled');
          currentSendButton.innerHTML = `<i data-lucide="send" style="width:14px;height:14px;"></i> ${this._mentorshipIntent === 'question' ? 'Ask' : 'Send'}`;
          window.app?.refreshIcons();
        }
      }
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
        this._updateTtsButtonUI();
      } else {
        window.speechSynthesis.pause();
        this.isPaused = true;
        this._updateTtsButtonUI();
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
      ${(this.currentExplanation.mathSolution?.calculationSteps || []).map(step => step.math + '. ' + step.explanation).join('. ')}.
      ${this.currentExplanation.mathSolution?.finalAnswer || ''}
    `.replace(/<[^>]*>/g, '').replace(/[*#_~]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Detect language for voice matching
    if (['HINDI', 'HINGLISH'].includes(this._lessonSettings?.language || this.selectedLanguage) || /[\u0900-\u097f]/.test(cleanSpeechText)) {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-IN';
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isPaused = false;
      this._updateTtsButtonUI();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      this._updateTtsButtonUI();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      this._updateTtsButtonUI();
    };

    this.ttsUtterance = utterance;
    window.studyPreferences?.applySpeech(utterance, cleanSpeechText);
    window.speechSynthesis.speak(utterance);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.isPaused = false;
  }

  /** Update only the TTS play/pause button without rebuilding the entire DOM */
  _updateTtsButtonUI() {
    const playBtn = document.getElementById('tts-play-btn');
    if (!playBtn) return;
    const iconName = this.isSpeaking && !this.isPaused ? 'volume-x' : 'volume-2';
    playBtn.innerHTML = `<i data-lucide="${iconName}" style="width:16px;height:16px;"></i>`;
    const label = playBtn.nextElementSibling;
    if (label) label.textContent = this.isSpeaking ? (this.isPaused ? 'Paused' : 'Playing') : 'Listen';
    if (window.lucide) window.lucide.createIcons();
  }

  // =========================================================================
  // EXPORT & BOOKMARK ACTIONS
  // =========================================================================

  async toggleBookmark() {
    if (!this.currentExplanation || this.isLoading || this._bookmarkLoading) return;
    this._bookmarkLoading = true;
    const version = this._requestVersion;
    const previous = this.isBookmarked;
    this.isBookmarked = !previous;
    try {
      await this._persistCurrentLesson();
      if (version !== this._requestVersion) return;
      window.app?.showToast(this.isBookmarked ? 'Lesson saved to Bookmarks!' : 'Bookmark removed', 'success');
      this._updateResultsDOM(this._buildResponseHTML());
      await this._refreshStats();
    } catch (error) {
      if (version !== this._requestVersion) return;
      this.isBookmarked = previous;
      window.app?.showToast('Could not save the bookmark. Please retry.', 'error');
    } finally { this._bookmarkLoading = false; }
  }

  _lessonMarkdown() {
    const exp = this.currentExplanation;
    if (!exp) return '';
    const parts = [`# ${exp.topic || this._lessonQuestion || this.questionInput}`,
      `Question: ${this._lessonQuestion || this.questionInput}`,
      `Subject: ${exp.subject || 'General'} | Language: ${this._lessonSettings?.language || this.selectedLanguage}`,
      this._sourceLabel()];
    const section = (title, text) => { if (text) parts.push(`## ${title}\n${text}`); };
    const lines = values => (values || []).filter(Boolean).map(value => `- ${value}`).join('\n');
    section('Quick Answer', exp.quickAnswer);
    section('Foundation', exp.foundation?.explanation);
    section('Key Terms', (exp.foundation?.technicalTerms || []).map(term => `- ${term.term}: ${term.simpleMeaning}${term.example ? ` — ${term.example}` : ''}`).join('\n'));
    section('Step-by-Step Reasoning', (exp.steps || []).map((step, index) => `${index + 1}. ${step.title || ''}: ${step.content || ''}`).join('\n'));
    const math = exp.mathSolution;
    if (math) section('Math Solution', [math.given && `Given: ${math.given}`, math.toFind && `Find: ${math.toFind}`,
      math.formula && `Formula: ${math.formula}`, math.formulaExplanation,
      ...(math.calculationSteps || []).map(step => `${step.step}: ${step.math} — ${step.explanation}`),
      math.finalAnswer && `Final answer: ${math.finalAnswer}`, math.verification && `Check: ${math.verification}`,
      math.alternateMethod && `Alternate method: ${math.alternateMethod}`].filter(Boolean).join('\n'));
    section('Why and How', exp.whyAndHow && Object.entries(exp.whyAndHow).filter(([,value]) => value).map(([key,value]) => `${key}: ${value}`).join('\n'));
    section('Analogy', [exp.analogy?.analogyText, exp.analogy?.takeaway].filter(Boolean).join('\n'));
    section('Examples', (exp.examples || []).map(example => `### ${example.title || example.type || 'Example'}\n${example.description || ''}`).join('\n\n'));
    section('Flowchart', (exp.flowchart?.nodes || []).map(node => `${node.label}: ${node.description || ''}`).join('\n → '));
    if (exp.diagram?.svgContent) section('Diagram', [exp.diagram.title, exp.diagram.caption, SecurityUtils.sanitizeSvg(exp.diagram.svgContent)].filter(Boolean).join('\n'));
    if (exp.comparison) section(exp.comparison.title || 'Comparison', [exp.comparison.headers || [], ...(exp.comparison.rows || [])].map(row => row.join(' | ')).join('\n'));
    section('Common Mistakes', (exp.commonMistakes || []).map(item => `- ${item.mistake} → ${item.correction}`).join('\n'));
    section('Memory Trick', [exp.memoryTrick?.mnemonic, exp.memoryTrick?.explanation].filter(Boolean).join('\n'));
    if (exp.examPoints) section('Exam Points', [lines(exp.examPoints.highYieldPoints), lines(exp.examPoints.keyTerms),
      exp.examPoints.expectedAnswerStructure, lines(exp.examPoints.potentialMcqFacts)].filter(Boolean).join('\n'));
    section('Summary', lines(exp.summary));
    section('Practice Questions', (exp.practiceQuestions || []).map((question,index) => `${index + 1}. ${question.question}\n${lines(question.options)}\nAnswer: ${question.answer || ''}\n${question.explanation || ''}`).join('\n\n'));
    section('Sources', (exp.sources || []).map(source => `- ${source.name}${source.detail ? `: ${source.detail}` : ''}`).join('\n'));
    section('Socratic Tutor', exp.socraticTutor && [exp.socraticTutor.learningGoal, exp.socraticTutor.guidingQuestion, lines(exp.socraticTutor.hints)].filter(Boolean).join('\n'));
    section('Debate AI', exp.debateCoach && [exp.debateCoach.claim, lines(exp.debateCoach.supportingPoints), lines(exp.debateCoach.counterPoints), exp.debateCoach.boundary, exp.debateCoach.reflectionQuestion].filter(Boolean).join('\n'));
    section('Mind Map', exp.mindMap ? [exp.mindMap.centralTopic, ...(exp.mindMap.branches || []).map(branch => `${branch.title}: ${branch.detail}\n${lines(branch.children)}`)].join('\n') : exp.mermaidMindmap);
    section('Connections', exp.hamsaConnections && Object.entries(exp.hamsaConnections).map(([subject,detail]) => `${subject}: ${detail}`).join('\n'));
    section('Teach Back Challenge', [exp.teachBackChallenge, lines(exp.teachBackCriteria)].filter(Boolean).join('\n'));
    section('Follow-up Suggestions', lines(exp.followUpSuggestions));
    section('Follow-up Conversation', this.followUpHistory.map(item => `Q: ${item.query}\n${[item.response.followUpAnswer, item.response.clarifyingExample, item.response.miniAnalogy, item.response.checkQuestion].filter(Boolean).join('\n')}`).join('\n\n'));
    return parts.join('\n\n');
  }

  async copyExplanation() {
    if (!this.currentExplanation) return;
    try {
      await navigator.clipboard.writeText(this._lessonMarkdown());
      window.app?.showToast('Complete lesson copied to clipboard!', 'success');
    } catch (error) { window.app?.showToast('Could not copy to clipboard', 'error'); }
  }

  _supplementalExportHTML() {
    const exp = this.currentExplanation;
    const escape = value => SecurityUtils.escapeHtml(value || '');
    const section = (title, content) => content ? `<section class="book-export-chapter"><h3>${escape(title)}</h3>${content}</section>` : '';
    const paragraph = value => value ? `<p>${escape(value)}</p>` : '';
    let html = paragraph(this._sourceLabel());
    if (exp.diagram?.svgContent) html += section(exp.diagram.title || 'Concept Diagram',
      this._diagramSvgForExport(exp.diagram.svgContent) + paragraph(exp.diagram.caption));
    html += section('Sources', (exp.sources || []).map(source => paragraph(`${source.name}${source.detail ? ': ' + source.detail : ''}`)).join(''));
    html += section('Socratic Tutor', exp.socraticTutor ? [exp.socraticTutor.learningGoal, exp.socraticTutor.guidingQuestion, ...(exp.socraticTutor.hints || [])].map(paragraph).join('') : '');
    html += section('Debate AI', exp.debateCoach ? [exp.debateCoach.claim, ...(exp.debateCoach.supportingPoints || []), ...(exp.debateCoach.counterPoints || []), exp.debateCoach.boundary, exp.debateCoach.reflectionQuestion].map(paragraph).join('') : '');
    html += section('Mind Map', exp.mindMap ? this._mindMapHTML(exp.mindMap) : exp.mermaidMindmap ? `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;">${escape(exp.mermaidMindmap)}</pre>` : '');
    html += section('Connections', exp.hamsaConnections ? Object.entries(exp.hamsaConnections).map(([subject,detail]) => paragraph(`${subject}: ${detail}`)).join('') : '');
    html += section('Teach Back Challenge', paragraph(exp.teachBackChallenge) + (exp.teachBackCriteria || []).map(paragraph).join(''));
    html += section('Additional Explanation', exp.whyAndHow ? Object.entries(exp.whyAndHow).filter(([key]) => ['when', 'where'].includes(key)).map(([key,value]) => paragraph(value && `${key}: ${value}`)).join('') : '');
    html += section('Alternate Method', paragraph(exp.mathSolution?.alternateMethod));
    html += section('Exam Answer Structure', paragraph(exp.examPoints?.expectedAnswerStructure)
      + paragraph((exp.examPoints?.keyTerms || []).join(', ')) + paragraph((exp.examPoints?.potentialMcqFacts || []).join('; ')));
    html += section('Follow-up Suggestions', (exp.followUpSuggestions || []).map(paragraph).join(''));
    html += section('Follow-up Conversation', this.followUpHistory.map(item => `<div><strong>${escape(item.query)}</strong>${[item.response.followUpAnswer, item.response.clarifyingExample, item.response.miniAnalogy, item.response.checkQuestion].map(paragraph).join('')}</div>`).join(''));
    return html;
  }

  _diagramSvgForExport(content) {
    const holder = document.createElement('div');
    holder.innerHTML = SecurityUtils.sanitizeSvg(content);
    const svg = holder.querySelector('svg');
    if (!svg) return '';
    const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) {
      // Canvas image loading needs intrinsic dimensions, not viewport percentages.
      svg.setAttribute('width', String(box[2]));
      svg.setAttribute('height', String(box[3]));
    }
    return svg.outerHTML;
  }

  copySectionText(text) {
    navigator.clipboard.writeText(text).then(() => {
      if (window.app) window.app.showToast('Section copied to clipboard!', 'success');
    });
  }

  /** Safe copy from data field — avoids inline quote injection */
  copySectionFromData(field) {
    if (!this.currentExplanation) return;
    const text = this.currentExplanation[field] || '';
    navigator.clipboard.writeText(text).then(() => {
      if (window.app) window.app.showToast('Section copied to clipboard!', 'success');
    }).catch(() => {
      if (window.app) window.app.showToast('Could not copy to clipboard', 'error');
    });
  }

  async downloadPdf() {
    if (!this.currentExplanation || this._pdfExporting) return;
    this._pdfExporting = true;
    const exp = this.currentExplanation;
    const question = this._lessonQuestion || this.questionInput;
    const exportHTML = this._generateBookHTMLForExport();
    const container = document.createElement('div');
    container.id = 'hamsa-printable-book-export-container';
    Object.assign(container.style, { position: 'absolute', left: '-9999px', top: '0', width: '794px', background: '#FFFFFF', zIndex: '-9999' });
    try {
      window.app?.showToast('Generating study manuscript PDF...', 'info');
      container.innerHTML = exportHTML;
      document.body.appendChild(container);
      container.querySelectorAll('.book-export-chapter').forEach(chapter => {
        if (chapter.querySelector('.book-export-ch-badge') && chapter.children.length === 1) chapter.remove();
      });
      if (document.fonts?.ready) await document.fonts.ready;
      const filename = (exp.topic || question || 'Hamsa_Lesson').replace(/[^a-zA-Z0-9_\u0900-\u097F\s-]/g, '')
        .replace(/\s+/g, '_').substring(0, 45) || 'Hamsa_Teacher_Lesson';
      if (!window.html2pdf) {
        this._openPrintWindow(container.innerHTML, exp.topic);
        return;
      }
      const opt = {
        margin: [8, 10, 8, 10], filename: `${filename}_Study_Manuscript.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, useCORS: true, letterRendering: true, logging: false,
          scrollX: 0, scrollY: 0, backgroundColor: '#FFFFFF',
          onclone: clonedDocument => {
            // Theme selectors must also use light paper in the capture document.
            clonedDocument.documentElement.dataset.theme = 'LIGHT';
          }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      await window.html2pdf().set(opt).from(container.querySelector('#hamsa-printable-book') || container).save();
      window.app?.showToast('PDF downloaded successfully!', 'success');
    } catch (error) {
      console.warn('PDF generation failed:', error);
      this._openPrintWindow(container.innerHTML || exportHTML, exp.topic);
    } finally {
      container.remove();
      this._pdfExporting = false;
    }
  }

  printExplanation() {
    this._openPrintWindow();
  }

  _openPrintWindow(exportHTML = null, topic = null) {
    if (!exportHTML && !this.currentExplanation) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.app?.showToast('Allow pop-ups in your browser to print this lesson.', 'warning');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${SecurityUtils.escapeHtml(topic || this.currentExplanation?.topic || 'Hamsa_Study_Notes')} — HAMSA VIDYA</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
      </head>
      <body style="margin:0; padding:0; background:#ffffff;">
        ${exportHTML || this._generateBookHTMLForExport()}
        <script>
          window.onload = async function() {
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            window.focus();
            window.print();
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
          .hamsa-book-export-root, .hamsa-book-export-root * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .hamsa-book-export-root {
            /* Exports are light paper even when the app uses a dark theme. */
            --text-main: #1A1A1A;
            --text-primary: #1A1A1A;
            --text-secondary: #475569;
            --text-muted: #64748B;
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
          .hamsa-book-export-root :is(p, li, strong, em, b, i, blockquote, pre, code, h1, h2, h3, h4, h5, h6) {
            color: inherit;
            -webkit-text-fill-color: currentColor;
          }
          .hamsa-book-export-root svg {
            display: block;
            width: 100%;
            height: auto;
            max-width: 100%;
            max-height: 280px;
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
            <span class="book-export-pill">🌐 ${SecurityUtils.escapeHtml(this._lessonSettings?.language || this.selectedLanguage)}</span>
            <span class="book-export-pill">📅 ${dateStr}</span>
          </div>
        </div>

        <!-- Question Box -->
        <div class="book-export-question-box">
          <div class="book-export-q-lbl">INVESTIGATED TOPIC & QUESTION • मूल प्रश्न</div>
          <h2 class="book-export-q-text">“${SecurityUtils.escapeHtml(this._lessonQuestion || this.questionInput || exp.topic || 'Core Concept')}”</h2>
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

          ${exp.mathSolution && (exp.isMath || exp.mathSolution.formula || exp.mathSolution.calculationSteps?.length || exp.mathSolution.finalAnswer) ? `
            <div class="book-export-math-box">
              <div style="font-size:8.5pt; font-weight:800; color:#0369A1; text-transform:uppercase;">📐 Mathematical Derivation / Solution</div>
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
                ${exp.examples.map(ex => `
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

        ${this._supplementalExportHTML()}

        <!-- Folio Footer -->
        <div class="book-export-footer">
          <span>📖 HAMSA VIDYA AI TEACHER • हंस विद्या अध्ययन पाण्डुलिपि</span>
          <span>From Fundamentals to Mastery • Review answers against your course sources</span>
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

    overlay.removeEventListener('keydown', this._diagramKeyHandler);
    this._diagramReturnFocus = document.activeElement;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Concept diagram');
    overlay.innerHTML = `
      <div class="diagram-fullscreen-box">
        <button class="diagram-fullscreen-close" aria-label="Close diagram" onclick="window.aiTeacherView.closeDiagramModal()">
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
    this._diagramKeyHandler = event => { if (event.key === 'Escape') this.closeDiagramModal(); if (event.key === 'Tab') { event.preventDefault(); overlay.querySelector('button')?.focus(); } };
    overlay.addEventListener('keydown', this._diagramKeyHandler);
    overlay.querySelector('button')?.focus();
    if (window.lucide) window.lucide.createIcons();
    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }
  }

  closeDiagramModal() {
    const overlay = document.getElementById('diagram-fullscreen-modal');
    if (overlay) { overlay.style.display = 'none'; overlay.removeEventListener('keydown', this._diagramKeyHandler); }
    this._diagramReturnFocus?.focus?.();
    this._diagramReturnFocus = null;
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
              <option value="ALL" ${this.vaultSubjectFilter === 'ALL' ? 'selected' : ''}>All Subjects</option>
              <option value="Mathematics" ${this.vaultSubjectFilter === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
              <option value="Science" ${this.vaultSubjectFilter === 'Science' ? 'selected' : ''}>Science</option>
              <option value="History" ${this.vaultSubjectFilter === 'History' ? 'selected' : ''}>History</option>
              <option value="Geography" ${this.vaultSubjectFilter === 'Geography' ? 'selected' : ''}>Geography</option>
              <option value="Polity" ${this.vaultSubjectFilter === 'Polity' ? 'selected' : ''}>Polity</option>
              <option value="Economy" ${this.vaultSubjectFilter === 'Economy' ? 'selected' : ''}>Economy</option>
              <option value="Computer Science" ${this.vaultSubjectFilter === 'Computer Science' ? 'selected' : ''}>Computer Science</option>
            </select>
          </div>
        </div>

        <div class="vault-results">
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
              <div class="vault-item-card spotlight-card" onclick="window.aiTeacherView.loadSavedLesson(${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0})">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <span class="meta-pill meta-pill-subject" style="font-size:0.7rem;">${SecurityUtils.escapeHtml(item.subject || 'General')}</span>
                  <button
                    style="background:transparent; border:none; color:var(--color-error); cursor:pointer; padding:2px;"
                    onclick="event.stopPropagation(); window.aiTeacherView.deleteSavedLesson(${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}, ${onlyBookmarked})"
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
        </div>
      </section>
    `;
  }

  handleVaultSearch(query, onlyBookmarked) {
    this._vaultVersion++;
    this.vaultSearchQuery = query;
    // Debounce search to avoid excessive re-renders on each keystroke
    if (this._vaultSearchTimer) clearTimeout(this._vaultSearchTimer);
    this._vaultSearchTimer = setTimeout(() => {
      this._renderVaultCardsOnly(onlyBookmarked);
    }, 300);
  }

  handleVaultSubjectFilter(subject, onlyBookmarked) {
    this.vaultSubjectFilter = subject;
    this._renderVaultCardsOnly(onlyBookmarked);
  }

  async _renderVaultCardsOnly(onlyBookmarked) {
    const version = ++this._vaultVersion;
    const tab = this.activeTab;
    try {
      const html = await this._buildVaultHTML(onlyBookmarked);
      if (version !== this._vaultVersion || tab !== this.activeTab || tab === 'studio') return;
      const target = this.container?.querySelector('.vault-results');
      if (!target) return;
      const template = document.createElement('template');
      template.innerHTML = html;
      target.innerHTML = template.content.querySelector('.vault-results').innerHTML;
      this._refreshIcons();
    } catch (error) {
      if (version === this._vaultVersion) window.app?.showToast('Could not load saved lessons. Please retry.', 'error');
    }
  }

  async loadSavedLesson(id) {
    this._cancelRequests();
    const version = this._requestVersion;
    const record = await getAiTeacherExplanationById(id);
    if (!record || version !== this._requestVersion) return;
    const lesson = window.aiTeacherService.normalizeExplanation(record.structuredData);
    if (!lesson) { window.app?.showToast('This saved lesson is invalid and cannot be opened.', 'error'); return; }
    if (lesson.advancedModes && !window.aiTeacherService.validateAdvancedOutputs(lesson, lesson.advancedModes)) {
      window.app?.showToast('This saved lesson has incomplete mentorship content and cannot be opened.', 'error'); return;
    }
    this.stopVoiceInput();
    this.stopSpeech();
    this.closeDiagramModal();
    this._releaseImagePreview();
    this.attachedImage = null;
    this.attachedPdf = null;
    this.attachedPdfMeta = null;
    this._recordCreatedAt = record.createdAt;
    this._lessonQuestion = record.question;
    this.advancedModes = window.aiTeacherService.lessonAdvancedModes(lesson);
    this._lessonSettings = { language: record.language, depth: record.depth, mode: record.mode, educationLevel: record.educationLevel, advancedModes: { ...this.advancedModes } };

    this.currentRecordId = record.id;
    this.questionInput = record.question;
    this.selectedLanguage = record.language || 'BILINGUAL';
    this.selectedDepth = record.depth || 'DETAILED';
    this.selectedMode = record.mode || 'STUDENT';
    this.selectedEducationLevel = record.educationLevel || 'AUTO';
    this.currentExplanation = lesson;
    this.isBookmarked = Boolean(record.isBookmarked);
    this.followUpHistory = (Array.isArray(record.followUpHistory) ? record.followUpHistory : []).filter(item =>
      item && typeof item.query === 'string' && item.response && typeof item.response.followUpAnswer === 'string');

    this.activeTab = 'studio';
    this.render();
    if (window.app) window.app.showToast('Saved lesson loaded!', 'success');
  }

  async deleteSavedLesson(id, onlyBookmarked) {
    if (!window.confirm('Delete this lesson from history and saved lessons?')) return;
    try { await deleteAiTeacherExplanation(id); } catch (error) { window.app?.showToast('Could not delete lesson. Please retry.', 'error'); return; }
    if (Number(id) === Number(this.currentRecordId)) { this._cancelRequests(); this.currentRecordId = null; this.currentExplanation = null; this.followUpHistory = []; this.isBookmarked = false; }
    await this._refreshStats();
    if (window.app) window.app.showToast('Lesson removed', 'info');
    this._renderActiveTabContent();
  }
}

// Singleton instance
window.aiTeacherView = new AiTeacherView();
