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
    this.selectedLanguage = 'ENGLISH'; // 'ENGLISH', 'HINDI', 'BILINGUAL'
    this.customTopicTitle = '';
    this.notesText = '';
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
    if (!this.container) return;

    const heroHtml = await this._buildHero();

    this.container.innerHTML = `
      <div class="create-quiz-container">
        ${heroHtml}

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
            <div id="pdf-dropzone" class="dropzone-area" onclick="document.getElementById('pdf-file-input').click()">
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
                    ${this.loadedPdfMeta.fileName}
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
                <input type="checkbox" id="all-pages-toggle" ${this.includeAllPages ? 'checked' : ''} onchange="createQuizView.toggleAllPages(event.target.checked)">
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
                  <label>From Page (Start)</label>
                  <div class="stepper-control">
                    <button class="stepper-btn" onclick="createQuizView.stepFromPage(-1)">−</button>
                    <input type="text" id="from-page-input" class="stepper-input" value="${this.fromPageInputRaw}" 
                      oninput="createQuizView.onFromPageInput(this.value)"
                      onblur="createQuizView.onFromPageBlur()"
                      onkeydown="if(event.key==='Enter') createQuizView.onFromPageBlur()">
                    <button class="stepper-btn" onclick="createQuizView.stepFromPage(1)">+</button>
                  </div>
                </div>

                <!-- To Page Stepper -->
                <div class="stepper-group">
                  <label>To Page (End)</label>
                  <div class="stepper-control">
                    <button class="stepper-btn" onclick="createQuizView.stepToPage(-1)">−</button>
                    <input type="text" id="to-page-input" class="stepper-input" value="${this.toPageInputRaw}" 
                      oninput="createQuizView.onToPageInput(this.value)"
                      onblur="createQuizView.onToPageBlur()"
                      onkeydown="if(event.key==='Enter') createQuizView.onToPageBlur()">
                    <button class="stepper-btn" onclick="createQuizView.stepToPage(1)">+</button>
                  </div>
                </div>
              </div>

              <!-- Dual Thumb Slider -->
              <div class="dual-slider-wrapper">
                <div class="slider-track"></div>
                <div id="slider-range-fill" class="slider-range"></div>
                <input type="range" id="slider-from" class="dual-slider-input" min="1" max="${this.pdfTotalPages}" value="${this.fromPage}" oninput="createQuizView.onSliderFromChange(this.value)">
                <input type="range" id="slider-to" class="dual-slider-input" min="1" max="${this.pdfTotalPages}" value="${this.toPage}" oninput="createQuizView.onSliderToChange(this.value)">
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
                value="${this.customTopicTitle}" oninput="createQuizView.onTopicTitleChange(this.value)">
              <span style="font-size:0.75rem; color:var(--text-muted);">AI will formulate questions specifically on this topic.</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label style="font-weight:700; font-size:0.96rem;">Additional Study Notes / Excerpts (Optional)</label>
              <span id="char-count-badge" style="font-size:0.8rem; color:var(--text-muted);">0 characters</span>
            </div>
            <textarea id="notes-textarea" class="study-textarea" placeholder="Paste textbook excerpts, chapter summaries, syllabus points, or handwritten notes here (or leave empty if you just specified a topic above)..." oninput="createQuizView.onNotesChange(this.value)">${this.notesText}</textarea>
            
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
            <input type="text" id="custom-subject-input" placeholder="Or enter custom subject..." value="${this.customSubject}" class="study-textarea" style="min-height:42px; padding:0.4rem 0.85rem;" oninput="createQuizView.onCustomSubjectInput(this.value)">
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
                Timed mock test environment with Question Palette drawer; answers revealed upon final submission.
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
        </div>

        <!-- 5. Language / Medium -->
        <div class="form-group-card">
          <div style="font-weight:700; font-size:1.05rem;">5. Language / Medium</div>
          <div class="chips-select-grid">
            <div class="select-chip ${this.selectedLanguage === 'ENGLISH' ? 'active' : ''}" onclick="createQuizView.setLanguage('ENGLISH')">
              English
            </div>
            <div class="select-chip ${this.selectedLanguage === 'HINDI' ? 'active' : ''}" onclick="createQuizView.setLanguage('HINDI')">
              हिंदी (Hindi)
            </div>
            <div class="select-chip ${this.selectedLanguage === 'BILINGUAL' ? 'active' : ''}" onclick="createQuizView.setLanguage('BILINGUAL')">
              Bilingual (हिन्दी + Eng)
            </div>
          </div>
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
    if (window.app) window.app.refreshIcons();
  }

  setSourceTab(source) {
    this.activeSource = source;
    this.render();
  }

  // =========================================================================
  // PDF UPLOAD & HANDLING
  // =========================================================================
  async handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      app.showToast('Please select a valid PDF document.', 'error');
      return;
    }

    try {
      app.showToast('Loading PDF metadata...', 'info');
      const meta = await window.pdfExtractor.loadPdfFile(file);
      this.loadedPdfMeta = meta;
      this.pdfTotalPages = meta.pageCount;
      this.includeAllPages = true;
      this.fromPage = 1;
      this.toPage = meta.pageCount;
      this.fromPageInputRaw = '1';
      this.toPageInputRaw = String(meta.pageCount);

      app.showToast(`Loaded ${meta.fileName} (${meta.pageCount} pages)`, 'success');
      this.render();
    } catch (err) {
      console.error(err);
      app.showToast(`Failed to parse PDF: ${err.message}`, 'error');
    }
  }

  removeLoadedPdf() {
    window.pdfExtractor.clear();
    this.loadedPdfMeta = null;
    this.pdfTotalPages = 1;
    this.includeAllPages = true;
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
    const charBadge = document.getElementById('char-count-badge');
    if (charBadge) charBadge.textContent = `${val.length} characters`;
  }

  onTopicTitleChange(val) {
    this.customTopicTitle = val;
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
    this.customSubject = '';
    this.render();
  }

  onCustomSubjectInput(val) {
    this.customSubject = val;
    if (val.trim()) this.selectedSubject = val.trim();
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

  setLanguage(lang) {
    this.selectedLanguage = lang;
    this.render();
  }

  // =========================================================================
  // GENERATE AI QUIZ
  // =========================================================================
  async generateQuiz() {
    let sourceContent = '';
    let sourceTitle = '';
    let fromPageNum = 1;
    let toPageNum = 1;

    // Validate inputs
    if (this.activeSource === 'PDF') {
      if (!this.loadedPdfMeta) {
        app.showToast('Please upload a study PDF document first.', 'error');
        return;
      }
      fromPageNum = this.includeAllPages ? 1 : this.fromPage;
      toPageNum = this.includeAllPages ? this.pdfTotalPages : this.toPage;
      sourceTitle = this.loadedPdfMeta.fileName;
    } else {
      const topic = (this.customTopicTitle || '').trim();
      const notes = (this.notesText || '').trim();
      if (!topic && !notes) {
        app.showToast('Please enter a Topic Name or paste study notes.', 'error');
        return;
      }
      sourceTitle = topic || this.selectedSubject;
      sourceContent = notes;
    }

    // Opens the overlay, resets its visuals, and refuses to start a second
    // concurrent generation (which used to be possible by double-clicking).
    if (!app.beginGeneration('Hamsa AI Ingestion in Progress...')) return;

    const updateStep = (id, active = true, completed = false) => {
      const el = document.getElementById(id);
      if (el) {
        if (completed) {
          el.className = 'step-progress-item completed';
        } else if (active) {
          el.className = 'step-progress-item active';
        }
      }
    };

    try {
      updateStep('step-reading', true);

      // Extract PDF content if PDF source
      if (this.activeSource === 'PDF') {
        const extractRes = await window.pdfExtractor.extractTextFromPageRange(fromPageNum, toPageNum);
        sourceContent = extractRes.text;
      }

      updateStep('step-reading', false, true);
      updateStep('step-extracting', true);
      await new Promise(r => setTimeout(r, 400));
      updateStep('step-extracting', false, true);

      updateStep('step-formulating', true);

      // Call Gemini AI (strictly using user API key with automatic smart batching)
      const generated = await window.geminiService.generateQuiz({
        sourceContent,
        sourceTitle,
        subject: this.selectedSubject,
        difficulty: this.selectedDifficulty,
        questionCount: this.selectedQuestionCount,
        quizMode: this.selectedQuizMode,
        language: this.selectedLanguage,
        fromPage: fromPageNum,
        toPage: toPageNum,
        allowDemoFallback: false,
        onStatusUpdate: (status) => {
          app.handleGenerationProgress(status);
        }
      });

      updateStep('step-formulating', false, true);
      updateStep('step-crafting', true);
      await new Promise(r => setTimeout(r, 400));
      updateStep('step-crafting', false, true);

      // Save into IndexedDB
      const quizId = await saveNewQuiz({
        title: generated.title || `${sourceTitle} Quiz`,
        subject: this.selectedSubject,
        difficulty: this.selectedDifficulty,
        quizMode: this.selectedQuizMode,
        language: this.selectedLanguage,
        scoringPreset: this.selectedScoringPreset,
        sourceType: this.activeSource,
        sourceTitle: sourceTitle,
        pageRangeText: this.activeSource === 'PDF' ? `Pages ${fromPageNum}–${toPageNum}` : null
      }, generated.questions);

      app.endGeneration();
      app.showToast('Quiz generated successfully!', 'success');

      // Navigate to active quiz playback
      app.startQuiz(quizId);
    } catch (err) {
      app.endGeneration();
      // Cancelling already informed the user; don't also report it as a failure.
      if (app.isGenerationCancelled() || err.name === 'AbortError') return;
      console.error(err);
      app.showToast(`Generation failed: ${err.message}`, 'error');
    }
  }
}

window.createQuizView = new CreateQuizView();
