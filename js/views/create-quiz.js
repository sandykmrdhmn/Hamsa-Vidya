/**
 * HAMSA VIDYA (हंस विद्या) — Create Quiz View Controller
 * Features: PDF Ingestion with Bug-Free Dual Range Selector, Study Notes, AI Generation
 */

class CreateQuizView {
  constructor() {
    this.container = document.getElementById('view-create-quiz');
    this.activeSource = 'PDF'; // 'PDF' or 'TEXT'
    this.loadedPdfMeta = null;
    this.pdfTotalPages = 1;

    // Advanced Page Range State (Crucial Bug-Free Implementation)
    this.includeAllPages = true;
    this.fromPage = 1;
    this.toPage = 1;
    this.fromPageInputRaw = '1';
    this.toPageInputRaw = '1';

    // Universal Quiz Settings
    this.selectedSubject = 'Indian Polity';
    this.customSubject = '';
    this.selectedDifficulty = 'MEDIUM';
    this.selectedQuestionCount = 10;
    this.customQuestionCount = '';
    this.selectedQuizMode = 'PRACTICE'; // 'PRACTICE' or 'EXAM'
    // Marking scheme id from EXAM_SCORING_PRESETS (db.js).
    this.selectedScoringPreset = 'NONE';
    this._scoringPresetTouched = false;

    // ---- Exam time limit --------------------------------------------------
    // 'AUTO' leaves the limit unset on the quiz row, so the player derives it
    // from the number of questions it actually received (the AI can return
    // fewer than requested). 'CUSTOM' stores an exact number of seconds.
    //
    // `customDurationRaw` is the unvalidated string the user is typing;
    // `customDurationMinutes` is the last committed value. Two fields, because
    // clamping mid-keystroke fights the user — the same split the page-range
    // steppers above use.
    this.durationMode = 'AUTO'; // 'AUTO' | 'CUSTOM'
    this.customDurationMinutes = 30;
    this.customDurationRaw = '30';
    this.selectedLanguage = 'ENGLISH'; // 'ENGLISH', 'HINDI', 'BILINGUAL'
    this.customTopicTitle = '';
    this.notesText = '';
    this.useOcr = false;
    this.importSourceQuestions = false;
    try { this.generationDraft = JSON.parse(localStorage.getItem('hamsa_quiz_generation_draft') || 'null'); } catch { this.generationDraft = null; }
    if (!this.generationDraft?.options) this.generationDraft = null;
    this.restoreForm();
    // Delegation also captures controls with inline state assignments. Never
    // store credentials/files here.
    if (this.container) {
      this._onFormChange = () => this.persistForm();
      this.container.addEventListener('input', this._onFormChange);
      this.container.addEventListener('change', this._onFormChange);
    }
    this._onFormUnload = () => this.persistForm();
    window.addEventListener?.('pagehide', this._onFormUnload);
  }

  getFormFields() {
    return ['activeSource','includeAllPages','fromPage','toPage','fromPageInputRaw','toPageInputRaw',
      'selectedSubject','customSubject','_presetSubject','selectedDifficulty','selectedQuestionCount',
      'selectedQuizMode','selectedScoringPreset','_scoringPresetTouched','durationMode',
      'customDurationMinutes','customDurationRaw','selectedLanguage','customTopicTitle','notesText',
      'useOcr','importSourceQuestions','studentSettings'];
  }
  restoreForm() {
    try {
      const saved = JSON.parse(localStorage.getItem('hamsa_quiz_form_draft') || 'null');
      if (!saved || saved.version !== 1 || !saved.fields) return;
      const enums = { activeSource:['PDF','TEXT'], selectedDifficulty:['EASY','MEDIUM','HARD','MIXED'],
        selectedQuizMode:['PRACTICE','EXAM'], durationMode:['AUTO','CUSTOM'],
        selectedLanguage:['ENGLISH','HINDI','BILINGUAL','HINGLISH'],
        selectedScoringPreset:['NONE','UPSC_PRELIMS','SSC','BANKING','NEET'] };
      for (const key of this.getFormFields()) {
        const value = saved.fields[key];
        if (key === 'studentSettings') {
          const levels=['AUTO','CLASS_6_8','CLASS_9_10','CLASS_11_12','CLASS_12_SCIENCE','COLLEGE','SSC_CGL','BANKING_RAILWAY','UPSC','ADVANCED'];
          if (value && levels.includes(value.level) && ['AUTO','SIMPLE','DETAILED'].includes(value.depth)) {
            this.studentSettings={level:value.level,depth:value.depth,exam:typeof value.exam==='string'?value.exam.slice(0,120):''};
          }
        } else if (enums[key]) {
          if (enums[key].includes(value)) this[key] = value;
        } else if (typeof this[key] === 'boolean' && typeof value === 'boolean') this[key] = value;
        else if (typeof value === 'string' && (typeof this[key] === 'string' || key === '_presetSubject') && value.length <= 1000000) this[key] = value;
        else if (typeof this[key] === 'number' && Number.isSafeInteger(value) && value > 0) {
          const max=key==='selectedQuestionCount'?200:key==='customDurationMinutes'?600:100000;
          if (value <= max) this[key] = value;
        }
      }
      this._formRestored = true;
      // Track preference defaults without reapplying them over restored choices.
      const prefs=window.studyPreferences?.get() || {};
      if (enums.selectedLanguage.includes(saved.fields.selectedLanguage)) this._studyDefaults={selectedLanguage:prefs.language==='AUTO'?'ENGLISH':prefs.language || 'ENGLISH'};
      if (this.studentSettings) this.studentSettings._quizDefaults={level:prefs.level || 'AUTO',exam:prefs.exam || '',depth:prefs.depth || 'AUTO'};
    } catch { /* A malformed/unavailable draft must not block quiz creation. */ }
  }
  persistForm() {
    try {
      const fields = {};
      for (const key of this.getFormFields()) if (this[key] !== undefined) fields[key] = this[key];
      if(this.studentSettings) fields.studentSettings={level:this.studentSettings.level,exam:this.studentSettings.exam,depth:this.studentSettings.depth};
      localStorage.setItem('hamsa_quiz_form_draft', JSON.stringify({version:1,fields}));
      this._formWarning = false;
      return true;
    } catch {
      if (!this._formWarning) {
        this._formWarning = true;
        window.app?.showToast('Quiz form could not be autosaved. Keep this tab open and free browser storage before closing it.', 'warning');
      }
      return false;
    }
  }
  dispose() {
    this._renderVersion=(this._renderVersion || 0)+1;
    this._leaveVersion=(this._leaveVersion || 0)+1;
    this.container?.removeEventListener('input', this._onFormChange);
    this.container?.removeEventListener('change', this._onFormChange);
    window.removeEventListener?.('pagehide', this._onFormUnload);
    this.stopMic();
  }

  /**
   * Hero banner for this tab.
   *
   * Counts come from the student's own library so the panel reports real work
   * rather than decorative filler. The read is best-effort: a hero must never
   * be the reason a view fails to render, so a failure degrades to zeros.
   */
  async _buildHero() {
    let counts = { quizzesCount: 0, questionsCount: 0, attemptsCount: 0 };
    try {
      if (typeof getDatabaseSummaryCounts === 'function') {
        counts = await getDatabaseSummaryCounts();
      }
    } catch (e) {
      console.warn('Create Quiz hero counts unavailable:', e);
    }

    const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

    return UIUtils.buildViewHero({
      accent: 'emerald',
      icon: 'sparkles',
      eyebrow: 'AI Quiz Forge',
      title: 'Turn any material',
      titleAccent: 'into an exam paper.',
      hindi: 'प्रश्न निर्माण — स्वयं की सामग्री से',
      tagline: 'Upload a PDF chapter, paste your notes, or name a topic. Gemini writes exam-style MCQs with explanations and page citations, then files them in your library.',
      stats: [
        { value: fmt(counts.quizzesCount), label: 'Quizzes built' },
        { value: fmt(counts.questionsCount), label: 'Questions generated' },
        { value: fmt(counts.attemptsCount), label: 'Attempts logged' }
      ],
      actions: [
        { label: 'Generate AI Quiz', icon: 'zap', onclick: 'createQuizView.generateQuiz()' }
      ],
      chipsLabel: 'Three ways to start',
      chips: [
        { icon: 'file-text', label: 'PDF chapter', hint: 'Text is extracted page by page, with citations' },
        { icon: 'clipboard-paste', label: 'Pasted notes', hint: 'Paste any study text directly' },
        { icon: 'lightbulb', label: 'Topic name', hint: 'No source needed — name the syllabus topic' }
      ]
    });
  }

  async render() {
    const preferredLanguage = window.studyPreferences?.get().language;
    if (preferredLanguage) {
      window.studyPreferences.applyDefaults(this, { selectedLanguage: preferredLanguage === 'AUTO' ? 'ENGLISH' : preferredLanguage }, '_studyDefaults');
    }
    if (!this.container) return;

    const renderVersion = this._renderVersion = (this._renderVersion || 0) + 1;
    this.stopMic();
    this.persistForm();
    const heroHtml = await this._buildHero();
    if (renderVersion !== this._renderVersion) return;

    this.container.innerHTML = `
      <div class="create-quiz-container">
        ${heroHtml}
        ${this.renderDraftBanner()}
        ${this.renderStudentSettings()}

        <!-- Source Tabs -->
        <div class="source-tabs">
          <button class="source-tab-btn ${this.activeSource === 'PDF' ? 'active' : ''}" onclick="createQuizView.setSourceTab('PDF')">
            <i data-lucide="file-text"></i>
            <span>Tab A: PDF Document Ingestion</span>
          </button>
          <button class="source-tab-btn ${this.activeSource === 'TEXT' ? 'active' : ''}" onclick="createQuizView.setSourceTab('TEXT')">
            <i data-lucide="edit-3"></i>
            <span>Tab B: Study Notes / Direct Text</span>
          </button>
        </div>

        <!-- ================================================================= -->
        <!-- TAB A: PDF INGESTION -->
        <!-- ================================================================= -->
        <div id="tab-panel-pdf" class="tab-panel ${this.activeSource === 'PDF' ? 'active' : ''}">
          ${!this.loadedPdfMeta ? `
            <!-- Dropzone -->
            <div id="pdf-dropzone" class="dropzone-area" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();document.getElementById('pdf-file-input').click();}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="event.preventDefault();this.classList.remove('drag-over');createQuizView.handleFileSelect({target:{files:event.dataTransfer.files}})" onclick="if(event.target.id!=='pdf-file-input')document.getElementById('pdf-file-input').click()">
              <input type="file" id="pdf-file-input" accept="application/pdf" style="display:none;" onchange="createQuizView.handleFileSelect(event)">
              <div class="dropzone-icon">
                <i data-lucide="upload-cloud" style="width:28px;height:28px;"></i>
              </div>
              <h3 style="font-size:1.15rem;">Drop your PDF study document here</h3>
              <p style="font-size:0.88rem; color:var(--text-muted);">
                Supports UPSC/SSC/NEET standard textbooks, NCERTs, notes up to 200MB
              </p>
              <button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" onclick="event.stopPropagation(); document.getElementById('pdf-file-input').click()">
                <i data-lucide="folder-open"></i>
                <span>Browse Files</span>
              </button>
            </div>
          ` : `
            <!-- Uploaded PDF Card -->
            <div class="pdf-loaded-card">
              <div class="pdf-loaded-meta">
                <div class="dropzone-icon" style="width:44px;height:44px;">
                  <i data-lucide="file-check" style="width:22px;height:22px;"></i>
                </div>
                <div style="min-width:0;">
                  <div style="font-weight:700; font-size:1.02rem; color:var(--text-main);" class="text-truncate">
                    ${SecurityUtils.escapeHtml(this.loadedPdfMeta.fileName)}
                  </div>
                  <div style="font-size:0.82rem; color:var(--text-muted); display:flex; gap:0.75rem; align-items:center;">
                    <span>Size: ${this.loadedPdfMeta.formattedSize}</span>
                    <span>•</span>
                    <span style="font-weight:700; color:var(--color-primary-light);">${this.loadedPdfMeta.pageCount} Pages</span>
                  </div>
                </div>
              </div>

              <button class="btn btn-secondary btn-sm" onclick="createQuizView.removeLoadedPdf()">
                <i data-lucide="trash-2"></i>
                <span>Change PDF</span>
              </button>
            </div>

            <!-- "Include All Pages" Toggle Switch -->
            <div class="page-scope-switch-card">
              <div>
                <div style="font-weight:700; font-size:0.96rem;">Include All Pages</div>
                <div style="font-size:0.82rem; color:var(--text-muted);">
                  Process entire document (${this.loadedPdfMeta.pageCount} pages)
                </div>
              </div>

              <label class="switch-label">
                <input type="checkbox" id="all-pages-toggle" aria-label="Include all PDF pages" ${this.includeAllPages ? 'checked' : ''} onchange="createQuizView.toggleAllPages(event.target.checked)">
                <span class="switch-slider"></span>
              </label>
            </div>

            <!-- Advanced Page Range Selector (CRITICAL BUG-FREE IMPLEMENTATION) -->
            <div id="page-range-selector-box" class="page-range-selector-box" style="display: ${this.includeAllPages ? 'none' : 'flex'};">
              <div class="page-range-header">
                <div>
                  <div style="font-weight:700; font-size:1rem;">Page Boundary Scope</div>
                  <div style="font-size:0.82rem; color:var(--text-muted);">Strictly generate questions from within this range</div>
                </div>
                <div class="scope-badge" id="realtime-scope-badge">
                  Scope: Page ${this.fromPage} to Page ${this.toPage} (${this.toPage - this.fromPage + 1} pages selected)
                </div>
              </div>

              <!-- Quick Presets -->
              <div class="preset-chips-row">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">Quick Presets:</span>
                <div class="preset-chip" onclick="createQuizView.applyPreset(1, 10)">First 10 Pages (1–10)</div>
                <div class="preset-chip" onclick="createQuizView.applyPreset(1, 25)">First 25 Pages (1–25)</div>
                <div class="preset-chip" onclick="createQuizView.applyPreset(10, 30)">Pages 10–30</div>
                <div class="preset-chip" onclick="createQuizView.applyPreset(1, ${this.pdfTotalPages})">All Pages (1–${this.pdfTotalPages})</div>
              </div>

              <!-- Dual Stepper Controls -->
              <div class="stepper-inputs-grid">
                <!-- From Page Stepper -->
                <div class="stepper-group">
                  <label for="from-page-input">From Page (Start)</label>
                  <div class="stepper-control">
                    <button class="stepper-btn" aria-label="Decrease start page" onclick="createQuizView.stepFromPage(-1)">−</button>
                    <input type="text" id="from-page-input" class="stepper-input" value="${SecurityUtils.escapeHtml(this.fromPageInputRaw)}"
                      oninput="createQuizView.onFromPageInput(this.value)"
                      onblur="createQuizView.onFromPageBlur()"
                      onkeydown="if(event.key==='Enter') createQuizView.onFromPageBlur()">
                    <button class="stepper-btn" aria-label="Increase start page" onclick="createQuizView.stepFromPage(1)">+</button>
                  </div>
                </div>

                <!-- To Page Stepper -->
                <div class="stepper-group">
                  <label for="to-page-input">To Page (End)</label>
                  <div class="stepper-control">
                    <button class="stepper-btn" aria-label="Decrease end page" onclick="createQuizView.stepToPage(-1)">−</button>
                    <input type="text" id="to-page-input" class="stepper-input" value="${SecurityUtils.escapeHtml(this.toPageInputRaw)}"
                      oninput="createQuizView.onToPageInput(this.value)"
                      onblur="createQuizView.onToPageBlur()"
                      onkeydown="if(event.key==='Enter') createQuizView.onToPageBlur()">
                    <button class="stepper-btn" aria-label="Increase end page" onclick="createQuizView.stepToPage(1)">+</button>
                  </div>
                </div>
              </div>

              <!-- Dual Thumb Slider -->
              <div class="dual-slider-wrapper">
                <div class="slider-track"></div>
                <div id="slider-range-fill" class="slider-range"></div>
                <input type="range" id="slider-from" aria-label="PDF start page" class="dual-slider-input" min="1" max="${this.pdfTotalPages}" value="${this.fromPage}" oninput="createQuizView.onSliderFromChange(this.value)">
                <input type="range" id="slider-to" aria-label="PDF end page" class="dual-slider-input" min="1" max="${this.pdfTotalPages}" value="${this.toPage}" oninput="createQuizView.onSliderToChange(this.value)">
              </div>
            </div>
          `}
        </div>

        <!-- ================================================================= -->
        <!-- TAB B: STUDY NOTES / TEXT INGESTION -->
        <!-- ================================================================= -->
        <div id="tab-panel-text" class="tab-panel ${this.activeSource === 'TEXT' ? 'active' : ''}">
          <div class="notes-textarea-box">
            <!-- Dedicated Topic / Chapter Name Input -->
            <div style="display:flex; flex-direction:column; gap:0.35rem; margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.96rem; color:var(--text-main);">
                Specific Topic / Chapter Name <span style="color:var(--color-primary-light);">*</span>
              </label>
              <input type="text" id="topic-title-input" class="study-textarea" style="min-height:44px; padding:0.5rem 0.85rem;"
                placeholder="Enter exact topic (e.g. Fundamental Rights, Mughal Empire, Photosynthesis, Thermodynamics)..."
                value="${SecurityUtils.escapeHtml(this.customTopicTitle)}" oninput="createQuizView.onTopicTitleChange(this.value)">
              <span style="font-size:0.75rem; color:var(--text-muted);">AI will formulate questions specifically on this topic.</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
              <label style="font-weight:700; font-size:0.96rem;">Additional Study Notes / Excerpts (Optional)</label>
              <div style="display:flex; gap:1rem; align-items:center;">
                <button type="button" class="btn btn-secondary btn-sm" id="mic-btn" onclick="createQuizView.toggleMic()" style="display:flex; align-items:center; gap:0.25rem;">
                  <i data-lucide="mic" id="mic-icon" style="width:14px;height:14px;"></i>
                  <span id="mic-text">Dictate</span>
                </button>
                <span id="char-count-badge" style="font-size:0.8rem; color:var(--text-muted);">${this.notesText.length} characters</span>
              </div>
            </div>
            <textarea id="notes-textarea" class="study-textarea" placeholder="Paste textbook excerpts, chapter summaries, syllabus points, or handwritten notes here (or leave empty if you just specified a topic above)..." oninput="createQuizView.onNotesChange(this.value)">${SecurityUtils.escapeHtml(this.notesText)}</textarea>

            <!-- Quick Topic Inspiration Pills -->
            <div>
              <div style="font-size:0.82rem; font-weight:600; color:var(--text-muted);">Quick Topic Inspiration:</div>
              <div class="topic-pills-row">
                <div class="topic-pill" onclick="createQuizView.populateTopic('POLITY')">
                  <span>🏛️ Polity: Fundamental Rights (Arts 12–35)</span>
                </div>
                <div class="topic-pill" onclick="createQuizView.populateTopic('HISTORY')">
                  <span>📜 History: 1857 Revolt & Leaders</span>
                </div>
                <div class="topic-pill" onclick="createQuizView.populateTopic('SCIENCE')">
                  <span>🔬 Science: Cell Biology, ATP & DNA</span>
                </div>
                <div class="topic-pill" onclick="createQuizView.populateTopic('ECONOMY')">
                  <span>📈 Economics: RBI Monetary Policy & Inflation</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- UNIVERSAL QUIZ SETTINGS -->
        <!-- ================================================================= -->
        <!-- 1. Subject Domain -->
        <div class="form-group-card">
          <div style="font-weight:700; font-size:1.05rem;">1. Subject Domain</div>
          <div class="chips-select-grid">
            ${['Indian Polity', 'Science & Tech', 'History & Culture', 'Geography', 'Economy', 'General Knowledge', 'Mathematics', 'Reasoning', 'English', 'Computer Awareness'].map(subj => `
              <div class="select-chip ${this.selectedSubject === subj ? 'active' : ''}" onclick="createQuizView.setSubject('${subj}')">
                ${subj}
              </div>
            `).join('')}
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">
            <input type="text" id="custom-subject-input" aria-label="Custom quiz subject" placeholder="Or enter custom subject..." value="${SecurityUtils.escapeHtml(this.customSubject)}" class="study-textarea" style="min-height:42px; padding:0.4rem 0.85rem;" oninput="createQuizView.onCustomSubjectInput(this.value)">
          </div>
        </div>

        <!-- 2. Difficulty Level -->
        <div class="form-group-card">
          <div style="font-weight:700; font-size:1.05rem;">2. Difficulty Level</div>
          <div class="chips-select-grid">
            ${['EASY', 'MEDIUM', 'HARD', 'MIXED'].map(diff => `
              <div class="select-chip ${this.selectedDifficulty === diff ? 'active' : ''}" onclick="createQuizView.setDifficulty('${diff}')">
                ${diff}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 3. Question Count -->
        <div class="form-group-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; font-size:1.05rem;">3. Question Count</div>
            <span class="badge badge-primary" id="active-count-badge">${this.selectedQuestionCount} Questions</span>
          </div>
          <div class="chips-select-grid">
            ${[5, 10, 15, 20, 30, 50, 100, 200].map(cnt => `
              <div class="select-chip ${this.selectedQuestionCount === cnt ? 'active' : ''}" onclick="createQuizView.setQuestionCount(${cnt})">
                ${cnt} Qs
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 4. Quiz Mode -->
        <div class="form-group-card">
          <div style="font-weight:700; font-size:1.05rem;">4. Quiz Mode</div>
          <div class="mode-cards-grid">
            <div class="mode-radio-card ${this.selectedQuizMode === 'PRACTICE' ? 'active' : ''}" onclick="createQuizView.setQuizMode('PRACTICE')">
              <div class="mode-radio-header">
                <span>Practice Mode</span>
                <i data-lucide="zap" style="color:var(--color-primary-light);"></i>
              </div>
              <div class="mode-radio-desc">
                Instant feedback, answer validation, and conceptual explanations after every question.
              </div>
            </div>

            <div class="mode-radio-card ${this.selectedQuizMode === 'EXAM' ? 'active' : ''}" onclick="createQuizView.setQuizMode('EXAM')">
              <div class="mode-radio-header">
                <span>Exam Mode</span>
                <i data-lucide="clock" style="color:var(--color-warning);"></i>
              </div>
              <div class="mode-radio-desc">
                Timed mock test with Question Palette; answers appear after submission. Leaving the quiz or closing the page pauses the saved time; background tabs continue counting down.
              </div>
            </div>
          </div>

          <!-- Marking scheme — real exams penalise wrong answers, which changes
               whether guessing is worth it. -->
          <div style="margin-top:1.1rem; padding-top:1rem; border-top:1px solid var(--border-subtle);">
            <div style="font-weight:700; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
              <i data-lucide="calculator" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
              <span>Marking Scheme</span>
            </div>
            <p style="font-size:0.83rem; color:var(--text-secondary); margin:0.35rem 0 0.7rem;">
              Match your target exam so practice scores reflect real negative marking.
            </p>

            <div class="chips-select-grid">
              ${Object.values(window.EXAM_SCORING_PRESETS || {}).map(p => `
                <div class="select-chip ${this.selectedScoringPreset === p.id ? 'active' : ''}"
                     onclick="createQuizView.setScoringPreset('${p.id}')"
                     title="${p.note}">
                  ${p.label}
                </div>
              `).join('')}
            </div>

            ${(() => {
              const presets = window.EXAM_SCORING_PRESETS || {};
              const p = presets[this.selectedScoringPreset] || presets.NONE
                || { marksPerCorrect: 1, negativeMarkPerWrong: 0 };
              const count = Number(this.selectedQuestionCount) || 0;
              const maxMarks = Math.round(count * p.marksPerCorrect * 100) / 100;
              return `
                <div style="margin-top:0.7rem; padding:0.7rem 0.9rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md); font-size:0.83rem; line-height:1.55;">
                  <div><strong style="color:var(--text-main);">+${p.marksPerCorrect}</strong> per correct answer${p.negativeMarkPerWrong > 0
                    ? `, <strong style="color:var(--color-error);">−${Math.round(p.negativeMarkPerWrong * 100) / 100}</strong> per wrong answer`
                    : ', no penalty for wrong answers'}.</div>
                  <div style="color:var(--text-muted);">Paper total: <strong style="color:var(--color-primary-light);">${maxMarks} marks</strong> for ${count} questions. Skipped questions always score 0.</div>
                </div>
              `;
            })()}
          </div>

          <!-- Time limit — previously invisible and fixed at 1.5 min/question.
               Real papers differ (SSC CGL ~0.96, UPSC Prelims ~1.2), so the
               student sets their own budget and can see the per-question rate
               it works out to. -->
          <div style="margin-top:1.1rem; padding-top:1rem; border-top:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
              <div style="font-weight:700; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="timer" style="width:16px;height:16px;color:var(--color-warning);"></i>
                <span>Time Limit</span>
              </div>
              <span class="badge badge-primary" id="duration-total-badge">${this.formatDurationLabel(this.getEffectiveDurationMinutes())}</span>
            </div>

            <p style="font-size:0.83rem; color:var(--text-secondary); margin:0.35rem 0 0.7rem;">
              ${this.selectedQuizMode === 'EXAM'
                ? 'Pick a preset or type your own total time for the whole paper.'
                : 'Practice Mode is untimed — this limit is saved with the quiz and applies whenever you run it in Exam Mode.'}
            </p>

            <div class="chips-select-grid">
              <div class="select-chip ${this.durationMode === 'AUTO' ? 'active' : ''}"
                   onclick="createQuizView.setDurationPreset(null)"
                   title="1.5 minutes per question, recalculated from the questions actually generated">
                Auto (${this.formatDurationLabel(this.getAutoDurationMinutes())})
              </div>
              ${[5, 10, 15, 20, 30, 45, 60, 90, 120, 180].map(mins => `
                <div class="select-chip ${this.durationMode === 'CUSTOM' && this.customDurationMinutes === mins ? 'active' : ''}"
                     onclick="createQuizView.setDurationPreset(${mins})">
                  ${this.formatDurationLabel(mins)}
                </div>
              `).join('')}
            </div>

            <div class="stepper-group" style="margin-top:0.9rem; max-width:320px;">
              <label for="custom-duration-input">Custom total time (minutes)</label>
              <div class="stepper-control">
                <button class="stepper-btn" type="button" onclick="createQuizView.stepDuration(-5)"
                  aria-label="Decrease time limit by 5 minutes">−</button>
                <input type="text" inputmode="numeric" id="custom-duration-input" class="stepper-input"
                  value="${SecurityUtils.escapeHtml(this.customDurationRaw)}"
                  aria-label="Custom total time in minutes"
                  oninput="createQuizView.onCustomDurationInput(this.value)"
                  onblur="createQuizView.onCustomDurationBlur()"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();createQuizView.onCustomDurationBlur();}">
                <button class="stepper-btn" type="button" onclick="createQuizView.stepDuration(5)"
                  aria-label="Increase time limit by 5 minutes">+</button>
              </div>
            </div>

            ${(() => {
              const mins = this.getEffectiveDurationMinutes();
              const count = Number(this.selectedQuestionCount) || 0;
              const perQ = count > 0 ? `${(mins / count).toFixed(2)} min per question` : '—';
              return `
                <div style="margin-top:0.7rem; padding:0.7rem 0.9rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md); font-size:0.83rem; line-height:1.55;">
                  <div>Total window: <strong style="color:var(--color-primary-light);">${this.formatDurationLabel(mins)}</strong> for ${count} questions —
                    <strong id="duration-per-question" style="color:var(--text-main);">${perQ}</strong>.</div>
                  <div style="color:var(--text-muted);">
                    Allowed range ${CreateQuizView.DURATION_MIN_MINUTES}–${CreateQuizView.DURATION_MAX_MINUTES} minutes.
                    The clock auto-submits when it reaches zero.
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>

        <!-- 5. Language / Medium -->
        <div class="form-group-card">
          <div style="font-weight:700; font-size:1.05rem;">5. Language / Medium</div>
          <div class="chips-select-grid">
            <div class="select-chip ${this.selectedLanguage === 'ENGLISH' ? 'active' : ''}" onclick="createQuizView.setLanguage('ENGLISH')">
              English
            </div>
            <div class="select-chip ${this.selectedLanguage==='HINGLISH'?'active':''}" onclick="createQuizView.setLanguage('HINGLISH')">Hinglish</div>
            <div class="select-chip ${this.selectedLanguage === 'HINDI' ? 'active' : ''}" onclick="createQuizView.setLanguage('HINDI')">
              हिंदी (Hindi)
            </div>
            <div class="select-chip ${this.selectedLanguage === 'BILINGUAL' ? 'active' : ''}" onclick="createQuizView.setLanguage('BILINGUAL')">
              Bilingual (हिन्दी + Eng)
            </div>
          </div>
        </div>

        <div class="form-group-card quiz-source-options">
          <label><input type="checkbox" ${this.useOcr ? 'checked' : ''} onchange="createQuizView.useOcr=this.checked"> Read scanned PDF pages with OCR (uses your API quota)</label>
          <p>Generate new reviewed questions in your selected language and difficulty. Enable import for a printed question paper with answer keys; it checks all selected pages. If no keyed questions are found, new questions are generated.</p><label><input type="checkbox" ${this.importSourceQuestions ? 'checked' : ''} onchange="createQuizView.importSourceQuestions=this.checked"> Import original PDF questions with printed keys (all valid questions; original language and difficulty)</label>
          <small>Only complete source questions with explicit keys are imported. Otherwise, new questions are generated and reviewed. AI review can still make mistakes.</small>
        </div>
        <!-- Bottom CTA -->
        <div style="display:flex; justify-content:flex-end; gap:1rem; margin-top:2rem; margin-bottom:3rem;">
          <button class="btn btn-secondary btn-lg" onclick="app.navigate('dashboard')">
            <span>Cancel</span>
          </button>
          <button class="btn btn-primary btn-lg" id="btn-generate-quiz" onclick="createQuizView.generateQuiz()">
            <i data-lucide="sparkles"></i>
            <span>Generate AI Quiz</span>
          </button>
        </div>
      </div>
    `;

    this.updateSliderRangeVisuals();
    this.updatePdfUploadStatus();
    if (window.app) window.app.refreshIcons();
  }

  setSourceTab(source) {
    this.activeSource = source;
    this.render();
  }

  // =========================================================================
  // PDF UPLOAD & HANDLING
  // =========================================================================
  updatePdfUploadStatus() {
    const dropzone=document.getElementById('pdf-dropzone'),status=dropzone?.querySelector('p');
    if(this._pdfUploading) {
      dropzone?.setAttribute('aria-busy','true');
      if(status) {
        if(status.dataset.uploadHint===undefined)status.dataset.uploadHint=status.textContent;
        status.textContent='Loading your PDF…';
      }
    } else {
      dropzone?.removeAttribute('aria-busy');
      if(status && status.dataset.uploadHint!==undefined) {
        status.textContent=status.dataset.uploadHint;delete status.dataset.uploadHint;
      }
    }
  }

  async handleFileSelect(event) {
    const input=event.target,file=input.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      if('value' in input)input.value='';
      app.showToast('Please select a valid PDF document.', 'error');
      return;
    }
    const version=this._pdfUploadVersion=(this._pdfUploadVersion||0)+1,viewVersion=this._leaveVersion||0;
    this._pdfUploading=true;
    this.updatePdfUploadStatus();
    try {
      app.showToast('Loading PDF metadata...', 'info');
      const meta = await window.pdfExtractor.loadPdfFile(file);
      if(version!==this._pdfUploadVersion)return;
      this.loadedPdfMeta = meta;
      this.pdfTotalPages = meta.pageCount;
      this.includeAllPages = true;
      this.fromPage = 1;this.toPage = meta.pageCount;
      this.fromPageInputRaw = '1';this.toPageInputRaw = String(meta.pageCount);
      if(viewVersion===(this._leaveVersion||0) && (!app.currentView || app.currentView==='create-quiz')) {
        app.showToast(`Loaded ${meta.fileName} (${meta.pageCount} pages)`, 'success');
        this.render();
      }
    } catch (err) {
      if (err.name === 'AbortError' || version!==this._pdfUploadVersion)return;
      console.error(err);
      if(viewVersion===(this._leaveVersion||0) && (!app.currentView || app.currentView==='create-quiz')) {
        const message=err.name==='PasswordException'?'This PDF is password-protected. Upload an unlocked copy.':err.name==='InvalidPDFException'?'This file is not a readable PDF or is damaged. Choose another PDF.':err.message;
        app.showToast(`Failed to parse PDF: ${message}`, 'error');
      }
    } finally {
      if('value' in input)input.value='';
      if(version===this._pdfUploadVersion) {
        this._pdfUploading=false;this.updatePdfUploadStatus();
      }
    }
  }

  removeLoadedPdf() {
    this._pdfUploadVersion=(this._pdfUploadVersion||0)+1;this._pdfUploading=false;
    window.pdfExtractor.clear();
    this.loadedPdfMeta = null;this.pdfTotalPages = 1;
    this.includeAllPages = true;this.fromPage=1;this.toPage=1;
    this.fromPageInputRaw='1';this.toPageInputRaw='1';
    this.render();
  }

  toggleAllPages(checked) {
    this.includeAllPages = checked;
    if (checked) {
      this.fromPage = 1;
      this.toPage = this.pdfTotalPages;
      this.fromPageInputRaw = '1';
      this.toPageInputRaw = String(this.pdfTotalPages);
    }
    const box = document.getElementById('page-range-selector-box');
    if (box) box.style.display = checked ? 'none' : 'flex';
    this.updateScopeBadge();
    this.updateSliderRangeVisuals();
  }

  // =========================================================================
  // CRITICAL BUG-FREE PAGE RANGE SELECTOR IMPLEMENTATION
  // =========================================================================
  applyPreset(from, to) {
    const validFrom = Math.max(1, Math.min(from, this.pdfTotalPages));
    const validTo = Math.max(validFrom, Math.min(to, this.pdfTotalPages));
    this.fromPage = validFrom;
    this.toPage = validTo;
    this.fromPageInputRaw = String(validFrom);
    this.toPageInputRaw = String(validTo);

    this.syncInputsAndSliders();
  }

  stepFromPage(delta) {
    const nextVal = Math.max(1, Math.min(this.fromPage + delta, this.toPage));
    this.fromPage = nextVal;
    this.fromPageInputRaw = String(nextVal);
    this.syncInputsAndSliders();
  }

  stepToPage(delta) {
    const nextVal = Math.max(this.fromPage, Math.min(this.toPage + delta, this.pdfTotalPages));
    this.toPage = nextVal;
    this.toPageInputRaw = String(nextVal);
    this.syncInputsAndSliders();
  }

  // Raw text input: DO NOT snap or clamp prematurely while the user is typing!
  onFromPageInput(rawVal) {
    this.fromPageInputRaw = rawVal;
    const num = parseInt(rawVal, 10);
    if (!isNaN(num) && num >= 1 && num <= this.toPage) {
      this.fromPage = num;
      this.updateScopeBadge();
      this.updateSliderRangeVisuals();
    }
  }

  onFromPageBlur() {
    let num = parseInt(this.fromPageInputRaw, 10);
    if (isNaN(num) || num < 1) num = 1;
    if (num > this.toPage) num = this.toPage;
    this.fromPage = num;
    this.fromPageInputRaw = String(num);
    this.syncInputsAndSliders();
  }

  onToPageInput(rawVal) {
    this.toPageInputRaw = rawVal;
    const num = parseInt(rawVal, 10);
    if (!isNaN(num) && num >= this.fromPage && num <= this.pdfTotalPages) {
      this.toPage = num;
      this.updateScopeBadge();
      this.updateSliderRangeVisuals();
    }
  }

  onToPageBlur() {
    let num = parseInt(this.toPageInputRaw, 10);
    if (isNaN(num) || num < this.fromPage) num = this.fromPage;
    if (num > this.pdfTotalPages) num = this.pdfTotalPages;
    this.toPage = num;
    this.toPageInputRaw = String(num);
    this.syncInputsAndSliders();
  }

  onSliderFromChange(val) {
    let num = parseInt(val, 10);
    if (num > this.toPage) num = this.toPage;
    this.fromPage = num;
    this.fromPageInputRaw = String(num);
    this.syncInputsAndSliders();
  }

  onSliderToChange(val) {
    let num = parseInt(val, 10);
    if (num < this.fromPage) num = this.fromPage;
    this.toPage = num;
    this.toPageInputRaw = String(num);
    this.syncInputsAndSliders();
  }

  syncInputsAndSliders() {
    const fromInput = document.getElementById('from-page-input');
    const toInput = document.getElementById('to-page-input');
    const sliderFrom = document.getElementById('slider-from');
    const sliderTo = document.getElementById('slider-to');

    if (fromInput) fromInput.value = this.fromPageInputRaw;
    if (toInput) toInput.value = this.toPageInputRaw;
    if (sliderFrom) sliderFrom.value = this.fromPage;
    if (sliderTo) sliderTo.value = this.toPage;

    this.updateScopeBadge();
    this.updateSliderRangeVisuals();
  }

  updateScopeBadge() {
    const badge = document.getElementById('realtime-scope-badge');
    if (badge) {
      const count = this.toPage - this.fromPage + 1;
      badge.textContent = `Scope: Page ${this.fromPage} to Page ${this.toPage} (${count} pages selected)`;
    }
  }

  updateSliderRangeVisuals() {
    const rangeFill = document.getElementById('slider-range-fill');
    if (!rangeFill || this.pdfTotalPages <= 1) return;

    const leftPercent = ((this.fromPage - 1) / (this.pdfTotalPages - 1)) * 100;
    const rightPercent = ((this.toPage - 1) / (this.pdfTotalPages - 1)) * 100;

    rangeFill.style.left = `${leftPercent}%`;
    rangeFill.style.width = `${rightPercent - leftPercent}%`;
  }

  // =========================================================================
  // STUDY NOTES & TOPIC PRESETS
  // =========================================================================
  onNotesChange(val) {
    this.notesText = val;
    this.persistForm();
    const charBadge = document.getElementById('char-count-badge');
    if (charBadge) charBadge.textContent = `${val.length} characters`;
  }

  toggleMic() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      if (window.app) window.app.showToast('Speech recognition is not supported in this browser.', 'error');
      return;
    }

    if (this.isRecording) {
      if (this.recognition) {
        this.recognition.stop();
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = ['HINDI', 'BILINGUAL', 'HINGLISH'].includes(this.selectedLanguage) ? 'hi-IN' : 'en-IN'; // Set to Indian English as it's an Indian education app

    const micBtn = document.getElementById('mic-btn');
    const micIcon = document.getElementById('mic-icon');
    const micText = document.getElementById('mic-text');

    this.recognition.onstart = () => {
      this.isRecording = true;
      if (micBtn) {
        micBtn.classList.add('recording-pulse');
        micBtn.style.backgroundColor = 'var(--color-danger)';
        micBtn.style.color = '#fff';
      }
      if (micText) micText.textContent = 'Recording... (Click to stop)';
      if (window.app) window.app.showToast('Mic on. Start speaking...', 'success');
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      if (finalTranscript) {
        const textarea = document.getElementById('notes-textarea');
        if (textarea) {
          const currentVal = textarea.value;
          const newVal = (currentVal + (currentVal.endsWith(' ') || currentVal === '' ? '' : ' ') + finalTranscript);
          textarea.value = newVal;
          this.onNotesChange(newVal);
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      if (window.app) window.app.showToast(`Microphone error: ${event.error}`, 'error');
      this.stopMicUI();
    };

    this.recognition.onend = () => {
      this.stopMicUI();
    };

    try { this.recognition.start(); } catch (error) { this.stopMicUI(); app.showToast('Microphone could not start. Check browser permission.', 'error'); }
  }

  stopMicUI() {
    this.isRecording = false;
    const micBtn = document.getElementById('mic-btn');
    const micText = document.getElementById('mic-text');
    if (micBtn) {
      micBtn.classList.remove('recording-pulse');
      micBtn.style.backgroundColor = '';
      micBtn.style.color = '';
    }
    if (micText) micText.textContent = 'Dictate';
  }

  onTopicTitleChange(val) {
    this.customTopicTitle = val;
    this.persistForm();
  }

  populateTopic(type) {
    const titles = {
      POLITY: 'Indian Polity: Fundamental Rights (Articles 12–35)',
      HISTORY: 'History: Revolt of 1857 & Leaders',
      SCIENCE: 'Science: Cell Biology, Mitochondria & DNA',
      ECONOMY: 'Economics: RBI Monetary Policy & Inflation'
    };

    if (titles[type]) {
      this.customTopicTitle = titles[type];
      const titleInput = document.getElementById('topic-title-input');
      if (titleInput) titleInput.value = this.customTopicTitle;
    }
    const presets = {
      POLITY: `FUNDAMENTAL RIGHTS (PART III, ARTICLES 12-35)
1. Right to Equality (Articles 14-18): Equality before law, prohibition of discrimination on grounds of religion, race, caste, sex, or place of birth, equality of opportunity in public employment, abolition of untouchability (Art 17), abolition of titles (Art 18).
2. Right to Freedom (Articles 19-22): Six fundamental freedoms (speech, assembly, association, movement, residence, profession). Protection in respect of conviction for offences (Art 20). Protection of life and personal liberty (Art 21 - includes right to privacy as per Puttaswamy judgment). Right to education (Art 21A, 86th Amendment 2002). Protection against arrest and detention (Art 22).
3. Right against Exploitation (Articles 23-24): Prohibition of human trafficking and forced labour (Art 23), prohibition of employment of children in factories (Art 24).
4. Right to Freedom of Religion (Articles 25-28): Freedom of conscience and free profession, practice, and propagation.
5. Cultural and Educational Rights (Articles 29-30): Protection of minority interests.
6. Right to Constitutional Remedies (Article 32): Heart and Soul of Constitution - Supreme Court writs: Habeas Corpus, Mandamus, Prohibition, Certiorari, Quo-Warranto.`,

      HISTORY: `THE REVOLT OF 1857 & NOTABLE LEADERS
- Outbreak: May 10, 1857 at Meerut, initiated after Mangal Pandey's defiance at Barrackpore on March 29 against greased cartridges (Enfield Rifle).
- Leaders & Centers:
  * Delhi: Bahadur Shah Zafar (Emperor) and General Bakht Khan.
  * Kanpur: Nana Saheb (Dhondu Pant) supported by Tatya Tope and Azimullah Khan.
  * Lucknow: Begum Hazrat Mahal and Birjis Qadir.
  * Jhansi: Rani Lakshmibai ('Khoob ladi mardani woh toh Jhansi wali rani thi').
  * Bihar (Jagdishpur): Kunwar Singh (80-year-old warrior) and Amar Singh.
  * Faizabad: Maulvi Ahmadullah Shah.
- Nature & Consequences: Ended East India Company rule; British Crown assumed direct sovereignty under Government of India Act 1858. Lord Canning became the first Viceroy of India. Queen Victoria's Proclamation of 1858.`,

      SCIENCE: `CELL BIOLOGY: ULTRASTRUCTURE, MITOCHONDRIA & DNA
- Cell Theory: Formulated by Schleiden and Schwann, expanded by Rudolf Virchow ('Omnis cellula e cellula').
- Mitochondria: Double membrane-bound organelle, semi-autonomous containing circular DNA and 70S ribosomes. Inner membrane folded into cristae with ATP synthases (F0-F1 particles). Site of Krebs cycle and oxidative phosphorylation.
- DNA Structure: Double helix proposed by Watson and Crick (1953) based on Rosalind Franklin's X-ray crystallography. Composed of deoxyribose sugar, phosphate backbone, and nitrogenous bases: Adenine pairs with Thymine (2 hydrogen bonds), Guanine pairs with Cytosine (3 hydrogen bonds).
- Protein Synthesis: Transcription in nucleus (DNA to mRNA), translation at ribosomes in cytoplasm using tRNA and amino acids.`,

      ECONOMY: `RBI MONETARY POLICY & INFLATION CONTROL
- Reserve Bank of India (RBI): Established on April 1, 1935 under the RBI Act 1934; nationalized in 1949 on recommendations of the Hilton Young Commission.
- Monetary Policy Committee (MPC): 6-member committee (3 from RBI including Governor with casting vote, 3 appointed by Central Government). Mandated to maintain CPI inflation at 4% with a tolerance band of +/- 2%.
- Key Policy Instruments:
  * Repo Rate: Rate at which RBI lends short-term liquidity to commercial banks against government securities.
  * Reverse Repo Rate: Rate at which RBI absorbs liquidity from commercial banks.
  * Cash Reserve Ratio (CRR): Percentage of Net Demand and Time Liabilities (NDTL) banks must hold in cash with RBI without interest.
  * Statutory Liquidity Ratio (SLR): Percentage of NDTL banks must maintain in liquid assets (gold, government bonds).`
    };

    if (presets[type]) {
      this.notesText = presets[type];
      const textarea = document.getElementById('notes-textarea');
      if (textarea) textarea.value = this.notesText;
      this.onNotesChange(this.notesText);

      if (type === 'POLITY') this.selectedSubject = 'Indian Polity';
      if (type === 'HISTORY') this.selectedSubject = 'History & Culture';
      if (type === 'SCIENCE') this.selectedSubject = 'Science & Tech';
      if (type === 'ECONOMY') this.selectedSubject = 'Economy';

      this.render();
      app.showToast('Pre-populated study notes successfully!', 'success');
    }
  }

  // =========================================================================
  // UNIVERSAL SETTINGS HANDLERS
  // =========================================================================
  setSubject(subj) {
    this.selectedSubject = subj;
    this._presetSubject = subj;
    this.customSubject = '';
    this.render();
  }

  onCustomSubjectInput(val) {
    this.customSubject = val;
    this.selectedSubject = val.trim() || this._presetSubject || 'Indian Polity';
    this.persistForm();
  }

  setDifficulty(diff) {
    this.selectedDifficulty = diff;
    this.render();
  }

  setQuestionCount(cnt) {
    this.selectedQuestionCount = cnt;
    const badge = document.getElementById('active-count-badge');
    if (badge) badge.textContent = `${cnt} Questions`;
    this.render();
  }

  setScoringPreset(presetId) {
    const presets = window.EXAM_SCORING_PRESETS || {};
    this.selectedScoringPreset = presets[presetId] ? presetId : 'NONE';
    // Remember that the user chose explicitly, so switching quiz mode later
    // does not silently overwrite their choice.
    this._scoringPresetTouched = true;
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  setQuizMode(mode) {
    this.selectedQuizMode = mode;
    // Exam mode defaults to a realistic penalty; practice stays penalty-free
    // unless the user has already picked a scheme explicitly.
    if (!this._scoringPresetTouched) {
      this.selectedScoringPreset = mode === 'EXAM' ? 'UPSC_PRELIMS' : 'NONE';
    }
    this.render();
  }

  // =========================================================================
  // EXAM TIME LIMIT
  //
  // Before this existed the exam window was invisible and non-negotiable: the
  // player allowed 1.5 minutes per question and the student was never told.
  // That is wrong for a mock — SSC CGL gives ~0.96 min/question, UPSC Prelims
  // ~1.2, and a descriptive-style drill may want 3. The limit is now chosen at
  // creation time and frozen onto the quiz row, exactly like the marking
  // scheme, so re-attempts of the same quiz are timed identically.
  // =========================================================================

  /** Bounds for a hand-typed limit. One minute is useless, ten hours is a typo. */
  static DURATION_MIN_MINUTES = 1;
  static DURATION_MAX_MINUTES = 600;

  /**
   * The fallback the player applies when no limit is stored.
   * Must stay in step with `_resetAttemptState()` in js/views/quiz-player.js,
   * which is the authority — this copy only exists so the form can *show* the
   * number before the quiz is created. scratch/verify-quiz-timer.js asserts the
   * two agree.
   */
  getAutoDurationMinutes(questionCount = this.selectedQuestionCount) {
    return Math.max(5, Math.round((Number(questionCount) || 0) * 1.5));
  }

  /** Minutes that will actually apply, whichever mode is selected. */
  getEffectiveDurationMinutes() {
    if (this.durationMode === 'CUSTOM') return this.customDurationMinutes;
    return this.getAutoDurationMinutes();
  }

  /**
   * Seconds to persist on the quiz row, or `null` for AUTO.
   *
   * AUTO deliberately stores nothing rather than storing the computed number.
   * The AI can return fewer questions than requested, and the player derives
   * AUTO from the questions it really has — so leaving it null keeps the
   * per-question budget honest instead of freezing a stale total.
   */
  getExamDurationSecondsForSave() {
    if (this.durationMode !== 'CUSTOM') return null;
    return this.customDurationMinutes * 60;
  }

  /** `null` selects AUTO; any number selects that many minutes. */
  setDurationPreset(minutes) {
    if (minutes === null) {
      this.durationMode = 'AUTO';
    } else {
      this.durationMode = 'CUSTOM';
      this.customDurationMinutes = this._clampDuration(minutes);
      this.customDurationRaw = String(this.customDurationMinutes);
    }
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  _clampDuration(value) {
    const min = CreateQuizView.DURATION_MIN_MINUTES;
    const max = CreateQuizView.DURATION_MAX_MINUTES;
    let num = parseInt(value, 10);
    if (isNaN(num)) num = 30;
    return Math.max(min, Math.min(max, num));
  }

  /**
   * Lenient while typing: store the raw string and only repaint the summary.
   * No render() — rebuilding innerHTML would blow away focus and the caret
   * after the first keystroke.
   */
  onCustomDurationInput(rawVal) {
    this.customDurationRaw = rawVal;
    this.durationMode = 'CUSTOM';

    const num = parseInt(rawVal, 10);
    const min = CreateQuizView.DURATION_MIN_MINUTES;
    const max = CreateQuizView.DURATION_MAX_MINUTES;
    if (!isNaN(num) && num >= min && num <= max) {
      this.customDurationMinutes = num;
    }
    this.updateDurationSummary();
  }

  /** Commit on blur or Enter: clamp, normalise the text, then re-render. */
  onCustomDurationBlur() {
    this.customDurationMinutes = this._clampDuration(this.customDurationRaw);
    this.customDurationRaw = String(this.customDurationMinutes);
    this.durationMode = 'CUSTOM';
    this.render();
  }

  stepDuration(delta) {
    this.durationMode = 'CUSTOM';
    this.customDurationMinutes = this._clampDuration(this.customDurationMinutes + delta);
    this.customDurationRaw = String(this.customDurationMinutes);
    this.render();
  }

  /**
   * Repaint the live summary without a re-render, so it can be called from
   * `oninput`. Mirrors `updateScopeBadge()` for the page range.
   */
  updateDurationSummary() {
    const total = document.getElementById('duration-total-badge');
    const perQ = document.getElementById('duration-per-question');

    const mins = this.getEffectiveDurationMinutes();
    const count = Number(this.selectedQuestionCount) || 0;

    if (total) total.textContent = this.formatDurationLabel(mins);
    if (perQ) {
      perQ.textContent = count > 0
        ? `${(mins / count).toFixed(2)} min per question`
        : '—';
    }
  }

  /** "45 min" / "1h 30m" — hours once past 60, so long papers stay readable. */
  formatDurationLabel(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
  }

  setLanguage(lang) {
    this.selectedLanguage = lang;
    const preferred=window.studyPreferences?.get().language;
    this._studyDefaults={selectedLanguage:preferred==='AUTO'?'ENGLISH':preferred || 'ENGLISH'};
    this.render();
  }

  // =========================================================================
  // GENERATE AI QUIZ
  // =========================================================================
  renderStudentSettings() {
    const prefs=window.studyPreferences?.get()||{};
    const defaults={level:prefs.level||'AUTO',exam:prefs.exam||'',depth:prefs.depth||'AUTO'};
    this.studentSettings ||= {...defaults};
    window.studyPreferences?.applyDefaults?.(this.studentSettings,defaults,'_quizDefaults');
    const s=this.studentSettings,e=SecurityUtils.escapeHtml;
    return `<details class="form-group-card quiz-student-settings"><summary>Student level & explanation preferences</summary><div class="quiz-settings-grid">
      <label>Level<select onchange="createQuizView.studentSettings.level=this.value">${['AUTO','CLASS_6_8','CLASS_9_10','CLASS_11_12','CLASS_12_SCIENCE','COLLEGE','SSC_CGL','BANKING_RAILWAY','UPSC','ADVANCED'].map(level=>`<option value="${level}" ${s.level===level?'selected':''}>${level.replaceAll('_',' ')}</option>`).join('')}</select></label>
      <label>Target exam<input maxlength="120" value="${e(s.exam)}" oninput="createQuizView.studentSettings.exam=this.value" placeholder="Optional exam / syllabus"></label>
      <label>Explanation depth<select onchange="createQuizView.studentSettings.depth=this.value">${['AUTO','SIMPLE','DETAILED'].map(depth=>`<option ${s.depth===depth?'selected':''}>${depth}</option>`).join('')}</select></label>
    </div></details>`;
  }
  renderDraftBanner() {
    if(!this.generationDraft) return '';
    const count=this.generationDraft.result?.questions?.length || this.generationDraft.state?.questions?.length || 0;
    return `<div class="glass-panel quiz-draft-banner"><div><strong>Saved quiz draft</strong><p>${SecurityUtils.escapeHtml(this.generationDraft.options.sourceTitle)} · ${count} questions ready</p></div><div class="quiz-button-row"><button class="btn btn-primary btn-sm" onclick="createQuizView.generateQuiz(true)">${this.generationDraft.result || this.generationDraft.savedQuizId?'Start quiz':'Continue quiz'}</button>${count && !this.generationDraft.result && !this.generationDraft.savedQuizId?`<button class="btn btn-secondary btn-sm" onclick="createQuizView.generateQuiz(true,true)">Start ${count} ready questions</button>`:''}<button class="btn btn-secondary btn-sm" onclick="createQuizView.discardDraft()">Discard draft</button></div></div>`;
  }
  persistDraft() {
    try { localStorage.setItem('hamsa_quiz_generation_draft',JSON.stringify(this.generationDraft)); }
    catch { if(!this._draftWarning) { this._draftWarning=true;app.showToast('Draft stays available in this tab; browser storage is full. Retry before closing the page.','warning'); } }
  }
  async releaseDraftFile(options) {
    try { if (options?.draftPdfId && typeof deleteQuizDraftFile === 'function') await deleteQuizDraftFile(options.draftPdfId); }
    catch { app.showToast('The temporary PDF could not be removed. Reset Quiz data in Settings to clear it.', 'warning'); }
  }
  discardDraft() {
    const options=this.generationDraft?.options;
    this.generationDraft=null;
    try {localStorage.removeItem('hamsa_quiz_generation_draft');} catch {app.showToast('Could not clear the saved draft from browser storage.', 'warning');}
    this.releaseDraftFile(options);this.render();
  }
  mergeDraftEdits(questions, draft=this.generationDraft) {
    const edits=draft?.editedQuestions || {};
    return questions.map(q=>{const key=QuizQuality.stem(q.questionText);return JSON.parse(JSON.stringify(Object.hasOwn(edits,key)?edits[key]:q));});
  }
  readyQuiz(draft=this.generationDraft) {
    if(!draft) throw new Error('Choose your study material and create a quiz first.');
    const state=draft.state;
    const coverage=Number.isInteger(state?.totalSourceChunks)?{readChunks:state.sentChunks?.length||0,totalChunks:state.totalSourceChunks,sampled:(state.sentChunks?.length||0)<state.totalSourceChunks}:undefined;
    const result=draft.result || {title:state?.title||draft.options.sourceTitle,questions:state?.questions||[],model:state?.model||'',coverage};
    const pages=QuizQuality.sourcePages(draft.options.sourceContent,draft.options.sourcePages||[]);
    const questions=(result.questions||[]).map(q=>QuizQuality.normalize(q,{extraction:draft.phase==='EXTRACT'})).filter(q=>q && (q.answerOrigin!=='SOURCE_KEY' || (!pages.length ? QuizQuality.keyMatches(q) : (QuizQuality.ground(q,pages) && QuizQuality.sourceKeySupported(q,pages)))));
    if(!questions.length) throw new Error('No questions are ready yet. Continue creating your quiz or choose new study material.');
    // Keep corrections from drafts saved by earlier versions.
    const ready=this.mergeDraftEdits(questions,draft);
    if(QuizQuality.preview(ready).length || ready.some(q=>q.reviewIssue)) throw new Error('This saved draft has questions that need correction. Discard the draft and create a fresh quiz.');
    return {...result,questions:ready,options:draft.options};
  }
  async saveReadyQuiz(jobId,signal) {
    if(this._saving) return;
    const draft=this.generationDraft,p=this.readyQuiz(draft),o=p.options,version=this._leaveVersion||0;
    this._saving=true;
    const saveStartedAt=Date.now();let saveSucceeded=false;
    try {
      const questions=JSON.parse(JSON.stringify(p.questions));
      app.handleGenerationProgress?.({workflow:'quiz',message:'Opening your quiz…',badgeText:'Almost ready',completedQuestions:questions.length,totalQuestions:o.questionCount,percent:100});
      const originalSource=draft.savedQuizId?null:await quizSourceView.capture(o);
      QuizQuality.abort(signal);
      const id=draft.savedQuizId || await saveNewQuiz({title:p.title,subject:o.subject,difficulty:o.difficulty,quizMode:o.quizMode,language:o.language,scoringPreset:o.scoringPreset,examDurationSeconds:o.examDurationSeconds,sourceType:o.sourceType,sourceTitle:o.sourceTitle,pageRangeText:o.pageRangeText,generationModel:p.model||null,coverage:p.coverage,skippedPdfPages:o.skippedPdfPages,requestedCount:o.questionCount,generationSettings:o.settings,originalSource},questions);
      const owned=this.generationDraft===draft;
      // A cancellation during the database write must not create a duplicate
      // quiz when the student continues the saved draft.
      if(owned){draft.savedQuizId=id;this.persistDraft();}
      QuizQuality.abort(signal);
      const visible=version===(this._leaveVersion||0) && (!app.currentView || app.currentView==='create-quiz');
      if(owned){this.generationDraft=null;try {localStorage.removeItem('hamsa_quiz_generation_draft');}catch {}this.releaseDraftFile(o);}
      app.endGeneration(jobId);
      if(visible && owned)app.startQuiz(id);
      else app.showToast('Your quiz is saved in My Quizzes.','success');
      saveSucceeded=true;
    } finally {this._saving=false;window.aiClient?.recordStageTiming?.('quiz-save',saveStartedAt,{jobId,outcome:saveSucceeded?'saved':'failed',questions:p.questions.length});}
  }
  stopMic() { if(this.recognition) {this.recognition.onresult=null;this.recognition.onend=null;this.recognition.onstart=null;this.recognition.onerror=null;try {this.recognition.abort();} catch {}this.recognition=null;}this.isRecording=false;this.stopMicUI(); }
  onLeaveView() {this.persistForm();window.quizSourceView?.close();this._leaveVersion=(this._leaveVersion||0)+1;this.stopMic();this._renderVersion=(this._renderVersion||0)+1;}
  async generateQuiz(resume=false,readyOnly=false) {
    if(this._saving) return;
    this.persistForm();
    if(!resume && this.activeSource==='PDF' && this._pdfUploading) return app.showToast('Wait for your PDF to finish loading, then generate the quiz.','info');
    let options;
    if(resume && this.generationDraft) {options={...this.generationDraft.options};if(this.generationDraft.options._pdfFile)Object.defineProperty(options,'_pdfFile',{value:this.generationDraft.options._pdfFile,configurable:true});}
    else {
      if(this.activeSource==='PDF' && !this.loadedPdfMeta) return app.showToast('Upload a study PDF first.','error');
      if(this.activeSource!=='PDF' && !this.customTopicTitle.trim() && !this.notesText.trim()) return app.showToast('Enter a topic or paste study notes.','error');
      options={sourceType:this.activeSource,sourceTitle:this.activeSource==='PDF'?this.loadedPdfMeta.fileName:this.customTopicTitle.trim()||this.selectedSubject,sourceContent:this.activeSource==='PDF'?'':this.notesText.trim(),subject:this.selectedSubject,difficulty:this.selectedDifficulty,questionCount:this.selectedQuestionCount,quizMode:this.selectedQuizMode,language:this.selectedLanguage,scoringPreset:this.selectedScoringPreset,examDurationSeconds:this.getExamDurationSecondsForSave(),settings:{...(this.studentSettings||window.studyPreferences?.get()||{})},fromPage:this.includeAllPages?1:this.fromPage,toPage:this.includeAllPages?this.pdfTotalPages:this.toPage,ocr:this.useOcr,importSourceQuestions:this.importSourceQuestions};
      options.pageRangeText=options.sourceType==='PDF'?`Pages ${options.fromPage}–${options.toPage}`:null;
    }
    if(!app.beginGeneration('Preparing your quiz…')) return;
    this.stopMic();const {id:jobId,signal}=app.getGenerationContext();
    let ownedDraft;
    const ownsDraft=()=>app.getGenerationContext().id===jobId && this.generationDraft===ownedDraft;
    const current=()=>!signal.aborted && app.getGenerationContext().id===jobId && (!ownedDraft || this.generationDraft===ownedDraft);
    let lastPercent=0;
    const progress=status=>{if(current()) {
      if(status && typeof status==='object' && Number.isFinite(status.percent)){lastPercent=Math.max(lastPercent,status.percent);status={...status,percent:lastPercent};}
      app.handleGenerationProgress(typeof status==='string'?{workflow:'quiz',message:status}:{...status,workflow:'quiz'});
    }};
    try {
      if(resume && this.generationDraft && (readyOnly || this.generationDraft.result || this.generationDraft.savedQuizId)) {
        await this.saveReadyQuiz(jobId,signal);return;
      }
      if(!resume) {
        const previous=this.generationDraft?.options;
        if(options.sourceType==='PDF')Object.defineProperty(options,'_pdfFile',{value:pdfExtractor.currentFile,configurable:true});
        this.generationDraft={options,phase:options.sourceType==='PDF'&&options.importSourceQuestions?'EXTRACT':'GENERATE',state:null};
        if(previous?.draftPdfId!==options.draftPdfId)this.releaseDraftFile(previous);
      }
      ownedDraft=this.generationDraft;
      ownedDraft.options=options;this.persistDraft();
      if(options.sourceType==='PDF' && !options.sourceContent && resume) {
        // Always recover this draft's immutable source, never a newly uploaded PDF.
        let file=options._pdfFile;
        if(options.draftPdfId && pdfExtractor._draftPdfId!==options.draftPdfId) {
          file=typeof getQuizDraftFile==='function'?await getQuizDraftFile(options.draftPdfId):null;
          QuizQuality.abort(signal);if(!current())return;
          if(!(file instanceof Blob))throw new Error('The saved draft PDF is unavailable. Re-upload the source and create a new quiz; this draft remains saved.');
          await pdfExtractor.loadPdfFile(file,{draftPdfId:options.draftPdfId});
        } else if(!options.draftPdfId && file && pdfExtractor.currentFile!==file) {
          await pdfExtractor.loadPdfFile(file);
        } else if(!options.draftPdfId && !file) {
          throw new Error('This older draft has no saved PDF. Re-upload the source and create a new quiz.');
        }
        QuizQuality.abort(signal);if(!current())return;
        Object.defineProperty(options,'_pdfFile',{value:file || pdfExtractor.currentFile,configurable:true});
      }
      if(options.sourceType==='PDF' && options._pdfFile && !options.draftPdfId) {
        const id=window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        const saveStartedAt=Date.now();let saved=false,saveFailed=false;
        try {
          if(typeof saveQuizDraftFile!=='function') throw new Error('Draft file storage unavailable');
          await saveQuizDraftFile(id,options._pdfFile);
          saved=true;
          if(!ownsDraft()){await this.releaseDraftFile({draftPdfId:id});return;}
          options.draftPdfId=id;
          pdfExtractor.bindDraftFile?.(id,options._pdfFile);
          this.persistDraft();
        } catch {
          saveFailed=true;
          if(current())app.showToast('Original PDF could not be saved for recovery. Keep this tab open; after reload, reattach the PDF when reviewing your source.', 'warning');
        } finally {window.aiClient?.recordStageTiming?.('pdf-draft-save',saveStartedAt,{jobId,outcome:saved?'saved':'failed'});}
        if(saveFailed && options.ocr && current())throw new Error('Scanned-page reading is paused because the original PDF could not be saved for recovery. Free browser storage and continue this draft before using OCR credits.');
      }
      QuizQuality.abort(signal);
      if(!current())return;
      if(options.sourceType==='PDF' && !options.sourceContent) {
        const extractionStartedAt=Date.now();let extracted;
        try {
          extracted=await pdfExtractor.extractTextFromPageRange(options.fromPage,options.toPage,(done,total,message)=>progress({message,percent:Math.round(done/total*15)}),{signal,ocr:options.ocr,skipUnreadable:true,draftPdfId:options.draftPdfId,isCurrent:current,jobId});
        } finally {window.aiClient?.recordStageTiming?.('pdf-extraction',extractionStartedAt,{jobId,outcome:extracted?'completed':'failed',pages:options.toPage-options.fromPage+1});}
        QuizQuality.abort(signal);if(!current())return;
        options.sourceContent=extracted.text;options.sourcePages=extracted.extractedPages;options.skippedPdfPages=extracted.skippedPages;
      }
      this.persistDraft();
      const checkpoint=state=>{if(current()) {this.generationDraft.state=state;this.persistDraft();}};
      let generated;
      if(this.generationDraft.phase==='EXTRACT') {
        generated=await geminiService.detectAndExtractExistingQuiz({...options,jobId,signal,onStatusUpdate:progress,onCheckpoint:checkpoint,retryState:this.generationDraft.state});
        QuizQuality.abort(signal);
        if(!generated.found) throw new Error('No source MCQs with a supported printed answer key were found. Turn off Import source questions and generate a new quiz explicitly; no extra AI generation was started.');
      }
      if(!generated) generated=await geminiService.generateQuiz({...options,jobId,signal,onStatusUpdate:progress,onCheckpoint:checkpoint,retryState:this.generationDraft.state});
      QuizQuality.abort(signal);if(!current()) return;
      this.generationDraft.result=generated;this.persistDraft();await this.saveReadyQuiz(jobId,signal);
    } catch(error) {
      if(current() && error.retryState) {this.generationDraft.state=error.retryState;this.persistDraft();}
      app.endGeneration(jobId);
      if(error.name==='AbortError' || signal.aborted) {if(app.currentView==='create-quiz') this.render();return;}
      app.showToast(`Generation paused: ${error.userMessage || error.message}`,'error',7000);
      if(app.currentView==='create-quiz') this.render();
    } finally {
      app.endGeneration(jobId);
      if(signal.aborted && app.currentView==='create-quiz') this.render();
    }
  }
}
window.createQuizView=new CreateQuizView();
