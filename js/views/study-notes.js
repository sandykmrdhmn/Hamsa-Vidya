/**
 * HAMSA VIDYA (हंस विद्या) — AI-POWERED DIGITAL TEXTBOOK MODULE
 * Production-ready Digital Textbook & Study Workspace with multi-file PDF & Image OCR,
 * structured color-coded reading experience, Table of Contents, Smart Glossary with Hindi meanings,
 * interactive examples & analogies, grounded Ask AI tutor, Quiz configuration & multi-format PDF export.
 */
class StudyNotesView {
  constructor() {
    this.container = document.getElementById('view-study-notes');
    this.notes = [];
    this.activeSubjectFilter = 'ALL';
    this.searchQuery = '';
    this.sortBy = 'RECENT_OPENED'; // 'RECENT_OPENED', 'RECENT_UPDATED', 'TITLE', 'READ_TIME'
    this.showOnlyFavorites = false;

    // View States: 'DASHBOARD' | 'CREATE' | 'READER'
    this.currentViewMode = 'DASHBOARD';
    this.activeNoteId = null;
    this.activeNote = null;

    // Create Note Form State
    this.newTopic = '';
    this.newSubject = 'Indian Polity';
    this.isCustomSubject = false;
    this.customSubject = '';
    this.newFiles = []; // array of { file, name, size, type }
    this.manualText = '';
    this.isCreating = false;
    this.creationProgressMsg = '';

    // Reader UI States
    this.readerActiveTab = 'TEXTBOOK'; // 'TEXTBOOK' | 'SUMMARY' | 'SOURCE'
    this.isFocusMode = false;
    this.isEditMode = false;
    this.showingOriginalSource = false;
    this.fontSizeScale = 1.0; // 0.9, 1.0, 1.15
    this.activeTOCSectionId = null;
    this.searchInNoteQuery = '';
    this.autoSaveTimer = null;
    this.autoSaveStatus = 'Saved ✓';

    // Interactive Popover / Modal States
    this.activeGlossaryTerm = null;
    this.activeGlossaryPos = null;
    this.activeExampleData = null;
    this.isAskAiOpen = false;
    this.askAiMessages = [];
    this.isSummaryModalOpen = false;
    this.isQuizModalOpen = false;
    this.quizConfig = {
      questionCount: 10,
      difficulty: 'MEDIUM',
      questionType: 'MCQ'
    };

    // Reading Ergonomics & Appearance States
    this.readingTheme = localStorage.getItem('hamsa_textbook_theme') || 'DEFAULT';
    this.readingFont = localStorage.getItem('hamsa_textbook_font') || 'SERIF';
    this.readingSize = localStorage.getItem('hamsa_textbook_size') || 'MD';
    this.isAppearanceMenuOpen = false;
    this.sidebarActiveTab = 'TOC'; // 'TOC' | 'CHEATSHEET' | 'ANNOTATIONS'
    this.isSpeaking = false;
    this.speechUtterance = null;
    this.microQuizAnswers = {};

    // Bind global selection handler for floating toolbar & menu close
    this.initTextSelectionListener();
  }

  // =========================================================================
  // VIEW RENDERER DISPATCHER
  // =========================================================================
  async render() {
    if (!this.container) {
      this.container = document.getElementById('view-study-notes');
    }
    if (!this.container) return;

    // Fetch notes from IndexedDB
    try {
      this.notes = await getAllNotes();
    } catch (e) {
      console.warn('Failed to load study notes:', e);
      this.notes = [];
    }

    try {
      // Render corresponding view mode
      if (this.currentViewMode === 'READER' && this.activeNoteId) {
        await this.renderReaderView();
      } else if (this.currentViewMode === 'CREATE') {
        this.renderCreateView();
      } else {
        this.currentViewMode = 'DASHBOARD';
        this.renderDashboardView();
      }
    } catch (viewErr) {
      console.error('Error rendering study notes sub-view:', viewErr);
    }

    if (window.app) window.app.refreshIcons();
  }

  // =========================================================================
  // 1. STUDY NOTES HOME (DASHBOARD)
  // =========================================================================
  renderDashboardView() {
    // Filter notes
    let filtered = this.notes.filter(n => {
      const matchSubj = this.activeSubjectFilter === 'ALL' || n.subject === this.activeSubjectFilter;
      const matchFav = !this.showOnlyFavorites || n.isFavorite;
      const q = this.searchQuery.toLowerCase().trim();
      const matchQ = !q || 
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.subject && n.subject.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q));
      return matchSubj && matchFav && matchQ;
    });

    // Sort notes
    filtered.sort((a, b) => {
      if (this.sortBy === 'RECENT_OPENED') {
        return new Date(b.lastReadAt || b.updatedAt || b.createdAt) - new Date(a.lastReadAt || a.updatedAt || a.createdAt);
      } else if (this.sortBy === 'RECENT_UPDATED') {
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      } else if (this.sortBy === 'TITLE') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (this.sortBy === 'READ_TIME') {
        return (b.metadata?.readingTimeMin || 1) - (a.metadata?.readingTimeMin || 1);
      }
      return 0;
    });

    const defaultSubjects = ['Indian Polity', 'History & Culture', 'Science & Tech', 'Economy', 'Geography', 'General Knowledge', 'English', 'Mathematics'];
    const noteSubjects = this.notes.map(n => n.subject).filter(Boolean);
    const subjects = ['ALL', ...new Set([...defaultSubjects, ...noteSubjects])];
    const totalWordsAll = this.notes.reduce((acc, n) => acc + (n.metadata?.wordCount || 0), 0);
    const totalReadingHours = (totalWordsAll / 12000).toFixed(1);
    const starredCount = this.notes.filter(n => n.isFavorite).length;

    // The four metric cards that used to sit in a separate ribbon below the
    // header are now the hero's live counters — same numbers, one panel.
    const heroHtml = UIUtils.buildViewHero({
      accent: 'violet',
      icon: 'book-marked',
      eyebrow: 'Digital Textbook Workspace',
      title: 'Your chapters,',
      titleAccent: 'rebuilt as textbooks.',
      hindi: 'अध्ययन कोश — पुस्तक से डिजिटल पाठ्यपुस्तक तक',
      tagline: 'Import a PDF chapter or photos of handwritten notes. Gemini restructures them into a colour-coded textbook with a glossary, worked examples and quizzes generated from the same source.',
      stats: [
        { value: this.notes.length, label: 'Textbooks' },
        { value: starredCount, label: 'Starred' },
        { value: totalWordsAll.toLocaleString('en-IN'), label: 'Words structured' },
        { value: `~${totalReadingHours}h`, label: 'Reading time' }
      ],
      actions: [
        { label: 'Create New Note', icon: 'plus-circle', onclick: 'studyNotesView.openCreateNoteModal()' }
      ],
      chipsLabel: 'Each note becomes',
      chips: [
        { icon: 'palette', label: 'Colour-coded chapters', hint: 'Headings, key terms and examples styled apart' },
        { icon: 'book-a', label: 'Smart glossary', hint: 'Term definitions extracted automatically' },
        { icon: 'highlighter', label: 'Highlights & bookmarks', hint: 'Mark passages to revisit' },
        { icon: 'volume-2', label: 'Read aloud', hint: 'Text-to-speech in English and Hindi' },
        { icon: 'sparkles', label: 'Instant quiz', hint: 'Generate MCQs from the chapter you just read' }
      ]
    });

    this.container.innerHTML = `
      <div class="study-vault-container">
        ${heroHtml}

        <!-- Controls Toolbar (Search, Filter, Sort, Favorites) -->
        <div class="vault-controls-row cascade-card">
          <!-- Search Bar -->
          <div class="vault-search-box">
            <i data-lucide="search"></i>
            <input type="text" placeholder="Search notes by topic, concept, subject..." 
              value="${this.escapeHtml(this.searchQuery)}" 
              oninput="studyNotesView.onSearchInput(this.value)">
            ${this.searchQuery ? `
              <button class="search-clear-btn" onclick="studyNotesView.clearSearch()" style="position:absolute; right:1.2rem;">
                <i data-lucide="x" style="width:16px;height:16px;"></i>
              </button>
            ` : ''}
          </div>

          <!-- Subject Dropdown Filter -->
          <select class="vault-filter-select" onchange="studyNotesView.setSubjectFilter(this.value)">
            ${subjects.map(s => `
              <option value="${s}" ${this.activeSubjectFilter === s ? 'selected' : ''}>
                ${s === 'ALL' ? '🌐 All Subjects' : s} (${s === 'ALL' ? this.notes.length : this.notes.filter(n => n.subject === s).length})
              </option>
            `).join('')}
          </select>

          <!-- Sort Selector -->
          <select class="vault-filter-select" style="min-width:180px;" onchange="studyNotesView.setSortBy(this.value)">
            <option value="RECENT_OPENED" ${this.sortBy === 'RECENT_OPENED' ? 'selected' : ''}>⏱️ Recently Opened</option>
            <option value="RECENT_UPDATED" ${this.sortBy === 'RECENT_UPDATED' ? 'selected' : ''}>🔄 Recently Updated</option>
            <option value="TITLE" ${this.sortBy === 'TITLE' ? 'selected' : ''}>🔤 Title (A - Z)</option>
            <option value="READ_TIME" ${this.sortBy === 'READ_TIME' ? 'selected' : ''}>⏳ Reading Time</option>
          </select>

          <!-- Starred Toggle Button -->
          <button class="btn ${this.showOnlyFavorites ? 'btn-primary' : 'btn-secondary'}" 
            style="min-height:50px; padding:0 1.25rem; border-radius:var(--radius-xl);"
            onclick="studyNotesView.toggleFavoritesFilter()" 
            title="Filter Starred Notes">
            <i data-lucide="star" style="width:18px;height:18px; color:${this.showOnlyFavorites ? '#ffffff' : '#f59e0b'};"></i>
            <span>${this.showOnlyFavorites ? 'Favorites Only' : 'All'}</span>
          </button>
        </div>

        <!-- Notes Grid or Clean Empty State -->
        ${filtered.length === 0 ? `
          <div class="empty-state-panel cascade-card" style="padding:4rem 2rem; border-radius:24px; text-align:center;">
            <div class="empty-icon-halo" style="width:72px; height:72px; margin:0 auto 1.5rem;">
              <i data-lucide="book-open" style="width:36px;height:36px;color:var(--color-primary-light);"></i>
            </div>
            <h3 style="font-size:1.5rem; font-weight:800; margin-bottom:0.75rem; color:var(--text-main);">
              ${this.searchQuery || this.activeSubjectFilter !== 'ALL' || this.showOnlyFavorites ? 'No matching textbooks found' : 'Your Digital Textbook Vault is Ready'}
            </h3>
            <p style="color:var(--text-muted); max-width:520px; margin:0 auto 2rem; line-height:1.7; font-size:1rem;">
              ${this.searchQuery || this.activeSubjectFilter !== 'ALL' || this.showOnlyFavorites
                ? 'Try clearing your search query, toggling favorites, or changing the subject filter.'
                : 'Import PDF chapters or take photos of study notes. AI will structure them into interactive digital textbooks.'}
            </p>

            <div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
              <button class="btn btn-primary" style="padding:0.9rem 1.8rem; font-weight:700;" onclick="studyNotesView.openCreateNoteModal()">
                <i data-lucide="plus-circle"></i>
                <span>Create First Note</span>
              </button>
              <button class="btn btn-secondary" style="padding:0.9rem 1.5rem;" onclick="studyNotesView.loadSamplePreset('POLITY')">
                <span>🏛️ Import Sample Polity Note</span>
              </button>
              <button class="btn btn-secondary" style="padding:0.9rem 1.5rem;" onclick="studyNotesView.loadSamplePreset('SCIENCE')">
                <span>🔬 Import Sample Biology Note</span>
              </button>
            </div>
          </div>
        ` : `
          <div class="vault-notes-grid">
            ${filtered.map(n => this.renderDashboardNoteCard(n)).join('')}
          </div>
        `}
      </div>
    `;
  }

  renderDashboardNoteCard(note) {
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));
    const totalSecs = note.sections?.length || 1;
    const isFav = note.isFavorite;
    const hasSummary = Boolean(note.summary);
    const hasQuiz = Array.isArray(note.quizzes) && note.quizzes.length > 0;

    const preview = note.sections && note.sections[0] 
      ? (note.sections[0].content || '').slice(0, 240) + '...'
      : (note.content || '').slice(0, 240) + '...';

    return `
      <div class="vault-note-card cascade-card" id="note-card-${note.id}">
        <div>
          <!-- Card Header Meta -->
          <div class="vault-card-header">
            <span class="badge badge-primary" style="font-weight:700;">
              ${this.escapeHtml(note.subject || 'General Study')}
            </span>
            
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <!-- Star / Favorite Toggle -->
              <button class="icon-btn" onclick="studyNotesView.toggleFavorite(${note.id})" title="${isFav ? 'Remove from favorites' : 'Star this note'}" style="color:${isFav ? '#f59e0b' : 'var(--text-muted)'};">
                <i data-lucide="star" style="width:18px;height:18px; ${isFav ? 'fill:#f59e0b;' : ''}"></i>
              </button>

              <!-- Card Options Dropdown -->
              <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="studyNotesView.toggleCardMenu(${note.id})" title="Options">
                  <i data-lucide="more-vertical" style="width:18px;height:18px;"></i>
                </button>
                <div id="card-menu-${note.id}" class="vault-card-dropdown-menu glossary-popover-box" style="display:none; width:165px; right:0; top:32px; padding:0.45rem;">
                  <button class="vault-menu-action-item" onclick="studyNotesView.renameNotePrompt(${note.id})">
                    <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                    <span>Rename</span>
                  </button>
                  <button class="vault-menu-action-item" onclick="studyNotesView.duplicateNote(${note.id})">
                    <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    <span>Duplicate</span>
                  </button>
                  <button class="vault-menu-action-item btn-danger-item" onclick="studyNotesView.deleteNoteConfirm(${note.id})">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Note Title (Click to Open) -->
          <h3 class="vault-card-title" onclick="studyNotesView.openNote(${note.id})" style="cursor:pointer;" title="Open Digital Textbook">
            ${this.escapeHtml(note.title)}
          </h3>

          <!-- Details & Status Badges -->
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem; font-size:0.78rem;">
            <span style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:6px; color:var(--text-muted);">
              📖 ${totalSecs} Sections
            </span>
            <span style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:6px; color:var(--text-muted);">
              ⏱️ ~${readTime}m read
            </span>
            ${hasSummary ? `
              <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700; padding:2px 8px; border-radius:6px;">
                ✨ Summary Ready
              </span>
            ` : ''}
            ${hasQuiz ? `
              <span style="background:rgba(99,102,241,0.15); color:var(--color-primary-light); font-weight:700; padding:2px 8px; border-radius:6px;">
                🧠 Quiz Ready
              </span>
            ` : ''}
          </div>

          <!-- Excerpt -->
          <div class="vault-card-excerpt" onclick="studyNotesView.openNote(${note.id})" style="cursor:pointer;">
            ${this.escapeHtml(preview)}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="vault-card-actions">
          <div class="vault-action-primary-row">
            <button class="btn btn-action-quiz btn-sm" onclick="studyNotesView.openNote(${note.id})">
              <i data-lucide="book-open" style="width:15px;height:15px;"></i>
              <span>Open Textbook</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="studyNotesView.openQuizModalForNote(${note.id})">
              <i data-lucide="zap" style="width:15px;height:15px;"></i>
              <span>AI Quiz</span>
            </button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:0.25rem;">
            <button class="btn btn-link btn-sm" style="color:var(--text-muted); font-size:0.8rem; padding:0;" onclick="studyNotesView.exportStudyNotesPdf(${note.id})">
              <i data-lucide="printer" style="width:13px;height:13px; margin-right:4px;"></i> Print PDF
            </button>
            <span style="font-size:0.75rem; color:var(--text-muted);">
              Updated: ${new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. CREATE NEW NOTE (STEP 1: TOPIC & STEP 2: MULTI-FILE INGESTION)
  // =========================================================================
  renderCreateView() {
    this.container.innerHTML = `
      <div class="study-vault-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
          <div>
            <div class="study-vault-badge">
              <i data-lucide="sparkles" style="width:15px;height:15px;"></i>
              <span>Create AI Digital Textbook Note</span>
            </div>
            <h1 class="study-vault-title gradient-text" style="font-size:2rem; margin-bottom:0.4rem;">
              New Study Note & Document Studio
            </h1>
            <p style="color:var(--text-secondary); font-size:0.95rem;">
              Enter your topic name and upload reference PDFs or photos. AI will read, chunk, and structure the content into an interactive study book.
            </p>
          </div>

          <button class="btn btn-secondary" onclick="studyNotesView.closeCreateView()">
            <i data-lucide="arrow-left"></i>
            <span>Back to Vault</span>
          </button>
        </div>

        <div class="study-studio-card cascade-card" style="padding:2.5rem;">
          <!-- Creation Progress Overlay -->
          ${this.isCreating ? `
            <div style="padding:3rem 2rem; text-align:center;">
              <div class="loading-spinner" style="width:48px; height:48px; border-width:4px; margin:0 auto 1.5rem;"></div>
              <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin-bottom:0.75rem;">
                ${this.escapeHtml(this.creationProgressMsg || 'Analyzing & Structuring Material...')}
              </h2>
              <p style="color:var(--text-muted); max-width:480px; margin:0 auto; line-height:1.6; font-size:0.92rem;">
                Extracting definitions, formulas, real-world analogies, and smart glossary terms in structured batches...
              </p>
            </div>
          ` : `
            <!-- Step 1: Topic & Subject -->
            <div style="margin-bottom:2rem;">
              <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
                <span style="background:var(--color-primary); color:white; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem;">1</span>
                Enter Topic & Curriculum Domain
              </h3>

              <div style="display:grid; grid-template-columns: 2fr 1fr; gap:1.25rem;">
                <div>
                  <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:0.35rem;">
                    Topic / Chapter Title *
                  </label>
                  <input type="text" id="create-input-topic" class="reading-input-title"
                    placeholder="e.g. Photosynthesis in Higher Plants or Indian Constitution — Fundamental Rights"
                    value="${this.escapeHtml(this.newTopic)}"
                    oninput="studyNotesView.newTopic = this.value">
                </div>

                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                    <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin:0;">
                      Subject Domain
                    </label>
                    <button type="button" class="btn btn-link btn-xs" style="padding:0; font-size:0.8rem; color:var(--color-primary-light); font-weight:700; border:none; background:none; cursor:pointer;" onclick="studyNotesView.toggleCustomSubjectMode()">
                      ${this.isCustomSubject ? '📋 Choose from List' : '✏️ Write Custom'}
                    </button>
                  </div>
                  
                  ${this.isCustomSubject ? `
                    <div style="display:flex; flex-direction:column; gap:0.4rem; animation:fadeIn 0.2s ease;">
                      <input type="text" id="create-input-custom-subject" class="reading-input-title" style="min-height:52px; font-size:0.95rem;"
                        placeholder="Type custom subject (e.g. Sociology, Machine Learning, Law)..."
                        value="${this.escapeHtml(this.customSubject)}"
                        oninput="studyNotesView.customSubject = this.value" autofocus>
                      <span style="font-size:0.75rem; color:var(--text-muted);">Custom subject will be saved with note and added to vault filters.</span>
                    </div>
                  ` : `
                    <select id="create-input-subject" class="reading-subject-select" onchange="studyNotesView.onSubjectSelectChange(this.value)">
                      ${['Indian Polity', 'History & Culture', 'Science & Tech', 'Economy', 'Geography', 'General Knowledge', 'English', 'Mathematics'].map(s => `
                        <option value="${s}" ${this.newSubject === s ? 'selected' : ''}>${s}</option>
                      `).join('')}
                      <option value="CUSTOM">✏️ Custom Subject (Type your own)...</option>
                    </select>
                  `}
                </div>
              </div>
            </div>

            <!-- Step 2: Ingest Learning Material -->
            <div style="margin-bottom:2rem;">
              <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                <span style="background:var(--color-primary); color:white; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem;">2</span>
                Import Learning Material (PDFs / Photos / Scans)
              </h3>
              <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:1rem;">
                The uploaded files act as source material. AI reads and restructures it into a coherent digital study book.
              </p>

              <!-- Dual Drag & Drop Zone -->
              <div class="import-methods-grid">
                <!-- Dropzone: PDF -->
                <div class="import-drop-panel" id="drop-panel-create-pdf"
                  onclick="document.getElementById('multi-file-input').click()"
                  ondragover="studyNotesView.handleDragOver(event, this)"
                  ondragleave="studyNotesView.handleDragLeave(event, this)"
                  ondrop="studyNotesView.handleMultiDrop(event, this)">
                  <div class="import-drop-icon">
                    <i data-lucide="file-text" style="width:26px;height:26px;"></i>
                  </div>
                  <div class="import-drop-title">📄 Upload PDF Chapters / Handouts</div>
                  <div class="import-drop-desc">
                    Drop single or multiple PDFs. Text extracted automatically.
                  </div>
                </div>

                <!-- Dropzone: Images -->
                <div class="import-drop-panel" id="drop-panel-create-img"
                  onclick="document.getElementById('multi-file-input').click()"
                  ondragover="studyNotesView.handleDragOver(event, this)"
                  ondragleave="studyNotesView.handleDragLeave(event, this)"
                  ondrop="studyNotesView.handleMultiDrop(event, this)">
                  <div class="import-drop-icon" style="background:rgba(236, 72, 153, 0.15); color:#ec4899;">
                    <i data-lucide="camera" style="width:26px;height:26px;"></i>
                  </div>
                  <div class="import-drop-title">📷 Photos of Notes (JPG / PNG)</div>
                  <div class="import-drop-desc">
                    Upload photos of notebook or book pages. Gemini Vision OCR transcribes notes.
                  </div>
                </div>
              </div>

              <!-- Hidden Multi-file input -->
              <input type="file" id="multi-file-input" multiple accept=".pdf, .jpg, .jpeg, .png, .webp" style="display:none;" onchange="studyNotesView.onMultiFilesSelected(this.files)">

              <!-- Attached Files Queue -->
              ${this.newFiles.length > 0 ? `
                <div style="background:rgba(0,0,0,0.15); border:1px solid var(--border-subtle); border-radius:14px; padding:1rem 1.25rem; margin-top:1rem;">
                  <div style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.65rem;">
                    📎 Attached Source Files (${this.newFiles.length}):
                  </div>
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${this.newFiles.map((f, fIdx) => `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:0.5rem 0.85rem; border-radius:8px; font-size:0.88rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                          <i data-lucide="${f.name.endsWith('.pdf') ? 'file-text' : 'image'}" style="width:16px;height:16px; color:var(--color-primary-light);"></i>
                          <span style="font-weight:600; color:var(--text-main);">${this.escapeHtml(f.name)}</span>
                          <span style="font-size:0.78rem; color:var(--text-muted);">(${(f.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button class="icon-btn" onclick="studyNotesView.removeAttachedFile(${fIdx})" title="Remove file" style="color:var(--color-danger);">
                          <i data-lucide="x" style="width:14px;height:14px;"></i>
                        </button>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Direct Paste / Extra Context Accordion -->
              <div style="margin-top:1.25rem;">
                <details style="background:rgba(0,0,0,0.1); border:1px solid var(--border-subtle); border-radius:12px; padding:0.85rem 1.25rem;">
                  <summary style="font-size:0.88rem; font-weight:700; color:var(--color-primary-light); cursor:pointer;">
                    ✍️ Or Paste Text / Coaching Notes Manually
                  </summary>
                  <div style="margin-top:0.85rem;">
                    <textarea id="create-input-manual" class="live-reading-canvas" style="min-height:160px; font-size:0.95rem; line-height:1.6;" 
                      placeholder="Paste syllabus topics, lecture notes, textbook excerpts here..." 
                      oninput="studyNotesView.manualText = this.value">${this.escapeHtml(this.manualText)}</textarea>
                  </div>
                </details>
              </div>
            </div>

            <!-- Submit Button -->
            <div style="display:flex; justify-content:flex-end; gap:1rem; border-top:1px solid var(--border-subtle); padding-top:1.5rem;">
              <button class="btn btn-secondary" onclick="studyNotesView.closeCreateView()">
                Cancel
              </button>
              <button class="btn btn-primary btn-hero-import" onclick="studyNotesView.triggerCreateStructuredNote()">
                <i data-lucide="sparkles"></i>
                <span>Generate Digital Textbook with AI ✨</span>
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 3. BOOK-LIKE READING EXPERIENCE (DIGITAL TEXTBOOK VIEW)
  // =========================================================================
  async renderReaderView() {
    let note = await getNoteById(this.activeNoteId);
    if (!note) {
      await new Promise(r => setTimeout(r, 100));
      note = await getNoteById(this.activeNoteId);
    }
    if (!note) {
      console.warn(`Note #${this.activeNoteId} not found in database.`);
      this.currentViewMode = 'DASHBOARD';
      this.activeNoteId = null;
      await this.render();
      return;
    }
    this.activeNote = note;

    if (!this.quizConfig) {
      this.quizConfig = { questionCount: 10, difficulty: 'MEDIUM', questionType: 'MCQ' };
    }

    const sections = note.sections || [];
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));

    // Determine active TOC highlight
    if (!this.activeTOCSectionId && sections.length > 0) {
      this.activeTOCSectionId = sections[0].id;
    }

    this.container.innerHTML = `
      <!-- Sticky Top Reading Controls Bar -->
      <div class="textbook-sticky-bar">
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.backToDashboard()" title="Back to Study Notes">
            <i data-lucide="arrow-left" style="width:14px;height:14px;"></i>
            <span>Notes</span>
          </button>
          <span style="font-weight:750; font-size:0.95rem; color:var(--text-main); max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${this.escapeHtml(note.title)}
          </span>
          <span class="badge badge-primary" style="font-size:0.75rem;">${this.escapeHtml(note.subject || 'General')}</span>

          <!-- 3-Tab Reader Navigation Pills -->
          <div class="reader-tabs-pill-bar" style="margin-left:0.5rem;">
            <button class="reader-tab-pill ${this.readerActiveTab === 'TEXTBOOK' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('TEXTBOOK')" title="Read structured digital textbook">
              <i data-lucide="book-open" style="width:14px;height:14px;"></i>
              <span>📖 Digital Textbook</span>
            </button>
            <button class="reader-tab-pill ${this.readerActiveTab === 'SUMMARY' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('SUMMARY')" title="View comprehensive AI 40% deep-dive revision summary">
              <i data-lucide="zap" style="width:14px;height:14px; color:${this.readerActiveTab === 'SUMMARY' ? '#ffffff' : '#10b981'};"></i>
              <span>⚡ AI Study Summary (40% Deep Dive)</span>
            </button>
            <button class="reader-tab-pill ${this.readerActiveTab === 'SOURCE' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('SOURCE')" title="View original untouched source material">
              <i data-lucide="file-text" style="width:14px;height:14px;"></i>
              <span>📄 Original Source</span>
            </button>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:0.6rem;">
          <!-- Auto-save Status Indicator -->
          <span id="auto-save-status-badge" style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-right:0.5rem;">
            ${this.autoSaveStatus}
          </span>

          <!-- Aa Reading Appearance & Themes Popover Trigger -->
          <div style="position:relative; display:inline-block;">
            <button class="btn btn-secondary btn-sm ${this.isAppearanceMenuOpen ? 'active' : ''}" onclick="studyNotesView.toggleAppearanceMenu()" title="Appearance, Themes & Typography">
              <i data-lucide="type" style="width:14px;height:14px;"></i>
              <span>Aa</span>
            </button>
            <div id="reading-appearance-menu" class="reading-appearance-popover" style="display:${this.isAppearanceMenuOpen ? 'flex' : 'none'};">
              ${this.renderAppearanceMenuContent()}
            </div>
          </div>

          <!-- 🎧 Audio Read-Aloud / TTS -->
          <button id="tts-read-aloud-btn" class="btn btn-secondary btn-sm ${this.isSpeaking ? 'active' : ''}" onclick="studyNotesView.toggleAudioNarration()" title="${this.isSpeaking ? 'Stop Audio Read-Aloud' : 'Listen to Chapter / Section (TTS)'}">
            <i data-lucide="${this.isSpeaking ? 'volume-x' : 'volume-2'}" style="width:14px;height:14px; color:${this.isSpeaking ? '#ef4444' : '#06b6d4'};"></i>
            <span>${this.isSpeaking ? 'Stop' : 'Listen'}</span>
          </button>

          <!-- Focus / Reading Mode Toggle -->
          <button class="icon-btn" onclick="studyNotesView.toggleFocusMode()" title="${this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus / Reading Mode'}" style="color:${this.isFocusMode ? '#10b981' : 'var(--text-main)'};">
            <i data-lucide="${this.isFocusMode ? 'minimize-2' : 'maximize-2'}" style="width:17px;height:17px;"></i>
          </button>

          <!-- Edit Mode Toggle -->
          <button class="icon-btn" onclick="studyNotesView.toggleEditMode()" title="${this.isEditMode ? 'Finish Editing (Auto-saved)' : 'Edit Note Content'}" style="color:${this.isEditMode ? '#6366f1' : 'var(--text-main)'};">
            <i data-lucide="edit-3" style="width:17px;height:17px;"></i>
          </button>

          <!-- 🧠 Generate Quiz Button -->
          <button class="btn btn-primary btn-sm" onclick="studyNotesView.openQuizModal()" title="Generate Practice Quiz">
            <i data-lucide="zap" style="width:14px;height:14px;"></i>
            <span>Quiz</span>
          </button>

          <!-- 💬 Ask AI Button -->
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.toggleAskAiDrawer()" title="Ask AI about this note">
            <i data-lucide="message-square" style="width:14px;height:14px; color:#a855f7;"></i>
            <span>Ask AI</span>
          </button>

          <!-- 📥 Export & Options Menu Dropdown -->
          <div style="position:relative; display:inline-block;">
            <button class="btn btn-secondary btn-sm" onclick="studyNotesView.toggleExportMenu()" title="Export PDF / Options">
              <i data-lucide="download" style="width:14px;height:14px;"></i>
              <span>Export</span>
            </button>
            <div id="export-dropdown-menu" class="vault-card-dropdown-menu glossary-popover-box" style="display:none; width:220px; right:0; top:36px; padding:0.45rem;">
              <button class="vault-menu-action-item" onclick="studyNotesView.exportStudyNotesPdf(${note.id})">
                <i data-lucide="book" style="width:15px;height:15px;"></i>
                <span>Study Notes PDF</span>
              </button>
              <button class="vault-menu-action-item" onclick="studyNotesView.exportPrintableQuizPrompt(${note.id})">
                <i data-lucide="file-question" style="width:15px;height:15px;"></i>
                <span>Printable Quiz PDF</span>
              </button>
              <button class="vault-menu-action-item" onclick="studyNotesView.exportSummarySheetPdf(${note.id})">
                <i data-lucide="file-text" style="width:15px;height:15px;"></i>
                <span>1-Page Summary PDF</span>
              </button>
              <div style="border-top:1px solid var(--border-subtle); margin:0.35rem 0;"></div>
              <button class="vault-menu-action-item btn-danger-item" onclick="studyNotesView.deleteNoteConfirm(${note.id})">
                <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                <span>Delete Note</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Real-time Reading Progress Fill Track -->
        <div class="textbook-reading-progress-track">
          <div class="textbook-reading-progress-fill" id="reading-progress-fill"></div>
        </div>
      </div>

      <!-- Main Reader Content: Digital Textbook | High-Yield Summary | Original Source -->
      ${this.readerActiveTab === 'SOURCE' 
        ? this.renderOriginalSourceView(note)
        : this.readerActiveTab === 'SUMMARY'
          ? this.renderSummaryTabView(note)
          : `
      <div class="textbook-reader-view ${this.isAskAiOpen && window.innerWidth >= 1100 ? 'split-active' : ''}" 
           data-reading-theme="${this.readingTheme}" 
           data-reading-font="${this.readingFont}" 
           data-reading-size="${this.readingSize}">
        <!-- A. Table of Contents (TOC) & Workspace Sidebar -->
        <aside class="textbook-toc-sidebar">
          <!-- Multi-Tab Navigation Bar -->
          <div class="sidebar-nav-tabs-bar">
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'TOC' ? 'active' : ''}" data-tab="TOC" onclick="studyNotesView.setSidebarTab('TOC')" title="Table of Contents">
              <i data-lucide="list" style="width:13px;height:13px;"></i>
              <span>TOC</span>
            </button>
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'CHEATSHEET' ? 'active' : ''}" data-tab="CHEATSHEET" onclick="studyNotesView.setSidebarTab('CHEATSHEET')" title="Quick Cheat Sheet (Defs & Formulas)">
              <i data-lucide="file-check" style="width:13px;height:13px;"></i>
              <span>Cheat Sheet</span>
            </button>
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'ANNOTATIONS' ? 'active' : ''}" data-tab="ANNOTATIONS" onclick="studyNotesView.setSidebarTab('ANNOTATIONS')" title="My Highlights & Notes">
              <i data-lucide="highlighter" style="width:13px;height:13px;"></i>
              <span>Highlights</span>
            </button>
          </div>

          <div id="sidebar-tab-content-area" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            ${this.renderSidebarContent(note, sections, readTime, words)}
          </div>
        </aside>

        <!-- B. Textbook Pages Reading Canvas -->
        <main class="textbook-reader-canvas" id="textbook-reading-canvas-body">
          <!-- Top Quiz Generation Request Card (At the Very Top of the Page!) -->
          <div class="top-quiz-request-card" id="top-quiz-request-box">
            <div class="top-quiz-request-header">
              <div style="display:flex; align-items:center; gap:0.85rem; min-width:240px;">
                <div class="top-quiz-icon-badge">
                  <i data-lucide="zap" style="width:22px;height:22px;color:#ffffff;"></i>
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="badge badge-primary" style="font-size:0.75rem; font-weight:700;">AI Practice Drill</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Formulate Questions directly from this Chapter</span>
                  </div>
                  <h3 style="font-size:1.12rem; font-weight:800; color:var(--text-main); margin:0.25rem 0 0 0;">
                    Generate Practice Quiz from "${this.escapeHtml(note.title)}"
                  </h3>
                </div>
              </div>

              <!-- Quick Parameters & Action Button (Right at the Top!) -->
              <div class="top-quiz-quick-actions">
                <div class="top-quiz-chips-group">
                  <span style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">Qs:</span>
                  ${[5, 10, 15, 20, 25].map(cnt => `
                    <button class="select-chip select-chip-sm ${this.quizConfig.questionCount === cnt ? 'active' : ''}" 
                      style="min-width:38px; justify-content:center; padding:0.35rem 0.65rem;"
                      onclick="studyNotesView.setQuizCount(${cnt})">
                      <span>${cnt}</span>
                    </button>
                  `).join('')}
                </div>

                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <select class="vault-filter-select" 
                    style="min-height:40px; padding:0.35rem 2rem 0.35rem 0.85rem; font-size:0.82rem; min-width:125px;"
                    onchange="studyNotesView.quizConfig.difficulty = this.value">
                    <option value="EASY" ${this.quizConfig.difficulty === 'EASY' ? 'selected' : ''}>🌱 Easy</option>
                    <option value="MEDIUM" ${this.quizConfig.difficulty === 'MEDIUM' ? 'selected' : ''}>⚖️ Medium</option>
                    <option value="HARD" ${this.quizConfig.difficulty === 'HARD' ? 'selected' : ''}>🔥 Hard</option>
                    <option value="MIXED" ${this.quizConfig.difficulty === 'MIXED' ? 'selected' : ''}>🎯 Mixed</option>
                  </select>

                  <button class="btn btn-primary btn-generate-top" onclick="studyNotesView.launchGeneratedQuizForNote(${note.id})" title="Formulate AI Quiz Now">
                    <i data-lucide="zap" style="width:16px;height:16px;"></i>
                    <span>Generate & Start Quiz</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <article class="textbook-book-page ${this.isEditMode ? 'editable-mode' : ''}">
            <!-- Chapter Header -->
            <header class="textbook-chapter-header">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span class="study-vault-badge" style="margin-bottom:0.5rem;">
                  ${this.escapeHtml(note.subject || 'General Study')}
                </span>
                <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">
                  Last read: ${new Date(note.lastReadAt || note.createdAt).toLocaleDateString()}
                </span>
              </div>

              ${this.isEditMode ? `
                <input type="text" class="reading-input-title" style="font-size:1.85rem; margin:0.5rem 0;" 
                  value="${this.escapeHtml(note.title)}" 
                  onchange="studyNotesView.updateActiveNoteTitle(this.value)">
              ` : `
                <h1 class="textbook-chapter-title">
                  ${this.escapeHtml(note.title)}
                </h1>
              `}

              <div class="textbook-meta-chips-row">
                <span>⏱️ ~${readTime} min read</span>
                <span>•</span>
                <span>📝 ~${words} words</span>
                <span>•</span>
                <span>📚 ${sections.length} Chapters/Sections</span>
                ${note.sourceFiles && note.sourceFiles.length > 0 ? `
                  <span>•</span>
                  <span>📎 ${note.sourceFiles.map(f => f.name).join(', ')}</span>
                ` : ''}
              </div>
            </header>

            <!-- Book Chapters / Sections -->
            <div id="textbook-sections-container">
              ${sections.map((sec, sIdx) => this.renderSectionContent(sec, sIdx, note)).join('')}
            </div>

            <!-- Bottom Navigation Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:2px solid var(--border-subtle); padding-top:1.75rem; margin-top:3rem;">
              <button class="btn btn-secondary" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">
                <i data-lucide="arrow-up"></i>
                <span>Back to Top</span>
              </button>

              <div style="display:flex; gap:0.75rem;">
                <button class="btn btn-secondary" onclick="studyNotesView.setReaderTab('SUMMARY')">
                  <i data-lucide="sparkles"></i>
                  <span>Revision Summary</span>
                </button>
                <button class="btn btn-primary" onclick="studyNotesView.openQuizModal()">
                  <i data-lucide="zap"></i>
                  <span>Practice Quiz (MCQs)</span>
                </button>
              </div>
            </div>
          </article>
        </main>

        <!-- Slide-Out / Split-screen Ask AI Chat Drawer -->
        <aside class="ask-ai-drawer ${this.isAskAiOpen ? 'active' : ''}" id="ask-ai-drawer">
          <div class="ask-ai-header">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="sparkles" style="color:#a855f7; width:20px;height:20px;"></i>
              <h3 style="font-size:1.1rem; font-weight:800; color:var(--text-main); margin:0;">Ask AI Tutor</h3>
            </div>
            <button class="icon-btn" onclick="studyNotesView.closeAskAiDrawer()" title="Close Drawer">
              <i data-lucide="x"></i>
            </button>
          </div>

          <div class="ask-ai-messages" id="ask-ai-msg-list">
            <div class="ask-ai-msg ai">
              👋 Hello! I am your AI study mentor for <strong>"${this.escapeHtml(note.title)}"</strong>. Ask me to clarify any concept, give an analogy, or explain exam-relevant questions grounded directly in this note!
            </div>
            ${this.askAiMessages.map(m => `
              <div class="ask-ai-msg ${m.role}">
                ${this.escapeHtml(m.text)}
              </div>
            `).join('')}
          </div>

          <!-- Quick Prompt Chips -->
          <div style="padding:0.5rem 1rem; display:flex; gap:0.4rem; overflow-x:auto;">
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('Explain this chapter in simple language with an intuitive real-world analogy.')">
              💡 Explain simply
            </button>
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('What are the top 3 high-yield concepts most likely to be asked in exams?')">
              📌 3 Core Exam Points
            </button>
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('What common student misconceptions or traps should I avoid in this topic?')">
              ⚠️ Common Pitfalls
            </button>
          </div>

          <div class="ask-ai-input-box">
            <input type="text" id="ask-ai-input-field" placeholder="Ask a question about this note..." onkeydown="if(event.key==='Enter') studyNotesView.sendAiMessage()">
            <button class="btn btn-primary btn-sm" onclick="studyNotesView.sendAiMessage()">
              <i data-lucide="send" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </aside>
      </div>
      `}

      <!-- Backdrop overlay for Ask AI Drawer -->
      <div class="ask-ai-backdrop ${this.isAskAiOpen ? 'active' : ''}" id="ask-ai-backdrop" onclick="studyNotesView.closeAskAiDrawer()"></div>

      <!-- Interactive Example Modal -->
      ${this.activeExampleData ? `
        <div class="modal-overlay active" onclick="studyNotesView.closeExampleModal()">
          <div class="modal-content" style="max-width:620px; padding:2.25rem; border-radius:24px; border:1.5px solid #c084fc;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
              <div>
                <span class="semantic-example-badge">
                  <i data-lucide="lightbulb" style="width:14px;height:14px;"></i> Interactive Example Breakdown
                </span>
                <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0.35rem 0 0 0;">
                  ${this.escapeHtml(this.activeExampleData.title)}
                </h3>
              </div>
              <button class="icon-btn" onclick="studyNotesView.closeExampleModal()">
                <i data-lucide="x"></i>
              </button>
            </div>

            <div style="font-size:1.02rem; line-height:1.75; color:var(--text-main); margin-bottom:1.25rem; white-space:pre-wrap;">
              ${this.escapeHtml(this.activeExampleData.content)}
            </div>

            ${this.activeExampleData.stepByStep && this.activeExampleData.stepByStep.length > 0 ? `
              <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:14px; padding:1.1rem 1.35rem; margin-bottom:1rem;">
                <div style="font-size:0.85rem; font-weight:800; color:#c084fc; text-transform:uppercase; margin-bottom:0.4rem;">
                  Step-by-Step Educational Logic:
                </div>
                <ol style="margin:0; padding-left:1.2rem; font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                  ${this.activeExampleData.stepByStep.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
                </ol>
              </div>
            ` : ''}

            ${this.activeExampleData.realWorldAnalogy ? `
              <div style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:14px; padding:1.1rem 1.35rem; margin-bottom:1.25rem;">
                <div style="font-size:0.85rem; font-weight:800; color:#38bdf8; text-transform:uppercase; margin-bottom:0.4rem;">
                  💡 Real-World Intuitive Analogy:
                </div>
                <div style="font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                  ${this.escapeHtml(this.activeExampleData.realWorldAnalogy)}
                </div>
              </div>
            ` : ''}

            <div style="display:flex; justify-content:flex-end;">
              <button class="btn btn-secondary" onclick="studyNotesView.closeExampleModal()">
                Close & Resume Reading
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- AI Summary Modal -->
      ${this.isSummaryModalOpen ? `
        <div class="modal-overlay active" onclick="studyNotesView.closeSummaryModal()">
          <div class="modal-content" style="max-width:720px; padding:2.25rem; border-radius:24px; border:1.5px solid #10b981;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <i data-lucide="sparkles" style="color:#10b981; width:22px;height:22px;"></i>
                <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">
                  High-Yield Revision Summary
                </h3>
              </div>
              <button class="icon-btn" onclick="studyNotesView.closeSummaryModal()">
                <i data-lucide="x"></i>
              </button>
            </div>

            <div style="max-height:65vh; overflow-y:auto; padding-right:0.5rem;">
              ${note.summary ? `
                <div class="semantic-definitions-card" style="margin-top:0;">
                  <div class="semantic-block-title-emerald">💡 Core Executive Summary</div>
                  <div style="font-size:1rem; line-height:1.7; color:var(--text-main);">
                    ${this.escapeHtml(note.summary.coreConcept || '')}
                  </div>
                </div>

                <div class="semantic-keypoints-box">
                  <div class="semantic-block-title-indigo">📌 Top 5 High-Yield Key Takeaways</div>
                  <ul class="semantic-keypoints-list">
                    ${(note.summary.takeaways || []).map(t => `<li>${this.escapeHtml(t)}</li>`).join('')}
                  </ul>
                </div>

                ${note.summary.examTraps && note.summary.examTraps.length > 0 ? `
                  <div class="semantic-facts-box" style="border-left-color:#ef4444; background:rgba(239,68,68,0.08);">
                    <div style="font-size:0.88rem; font-weight:800; color:#ef4444; text-transform:uppercase; margin-bottom:0.5rem;">
                      ⚠️ Critical Exam Pitfalls to Avoid
                    </div>
                    <ul style="margin:0; padding-left:1.25rem; font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                      ${note.summary.examTraps.map(trap => `<li>${this.escapeHtml(trap)}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                ${note.summary.finalTakeaway ? `
                  <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); border-radius:12px; padding:0.85rem 1.25rem; font-size:0.92rem; color:var(--text-secondary); font-style:italic;">
                    🎯 ${this.escapeHtml(note.summary.finalTakeaway)}
                  </div>
                ` : ''}
              ` : `
                <div style="text-align:center; padding:2rem 1rem;">
                  <p style="color:var(--text-secondary); margin-bottom:1.5rem;">No summary generated yet for this note.</p>
                  <button class="btn btn-primary" onclick="studyNotesView.generateFreshSummary(${note.id})">
                    <i data-lucide="sparkles"></i>
                    <span>Generate AI Summary Now</span>
                  </button>
                </div>
              `}
            </div>

            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-subtle); padding-top:1.25rem; margin-top:1.25rem;">
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.exportSummarySheetPdf(${note.id})">
                <i data-lucide="printer" style="width:14px;height:14px;"></i>
                <span>Download Summary PDF</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="studyNotesView.closeSummaryModal()">
                Done
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- AI Quiz Configuration Modal -->
      ${this.isQuizModalOpen ? `
        <div class="modal-overlay modal-top-align active" onclick="studyNotesView.closeQuizModal()">
          <div class="modal-content modal-top-content" style="max-width:680px; width:92%; padding:2.25rem; border-radius:24px; border:1.5px solid var(--color-primary);" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <i data-lucide="zap" style="color:var(--color-primary-light); width:22px;height:22px;"></i>
                <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">
                  Generate Practice Quiz
                </h3>
              </div>
              <button class="icon-btn" onclick="studyNotesView.closeQuizModal()">
                <i data-lucide="x"></i>
              </button>
            </div>

            <!-- Smart AI Recommendation Banner -->
            ${(() => {
              const rec = window.geminiService.recommendQuizConfig(note);
              return `
                <div style="background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3); border-radius:14px; padding:1rem 1.25rem; margin-bottom:1.5rem;">
                  <div style="font-size:0.85rem; font-weight:800; color:var(--color-primary-light); margin-bottom:0.35rem; display:flex; align-items:center; gap:0.4rem;">
                    <i data-lucide="sparkles" style="width:14px;height:14px;"></i>
                    <span>AI Recommended: ${rec.recommendedCount} Questions</span>
                  </div>
                  <div style="font-size:0.88rem; color:var(--text-main); line-height:1.5;">
                    ${rec.rationale}
                  </div>
                </div>
              `;
            })()}

            <!-- Question Count Options -->
            <div style="margin-bottom:1.25rem;">
              <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:0.5rem;">
                Number of Questions
              </label>
              <div style="display:flex; flex-wrap:wrap; gap:0.6rem;">
                ${[5, 10, 15, 20, 25, 30].map(cnt => `
                  <button class="select-chip ${this.quizConfig.questionCount === cnt ? 'active' : ''}" 
                    style="flex:1; min-width:65px; justify-content:center; padding:0.65rem 0;"
                    onclick="studyNotesView.setQuizCount(${cnt})">
                    <span>${cnt}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Difficulty & Type Row (Responsive Grid - Never Overflowing) -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.25rem; margin-bottom:1.75rem;">
              <div style="min-width:0;">
                <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:0.35rem;">
                  Difficulty
                </label>
                <select class="vault-filter-select" style="width:100%; min-height:48px;" onchange="studyNotesView.quizConfig.difficulty = this.value">
                  <option value="EASY" ${this.quizConfig.difficulty === 'EASY' ? 'selected' : ''}>Easy (Foundational)</option>
                  <option value="MEDIUM" ${this.quizConfig.difficulty === 'MEDIUM' ? 'selected' : ''}>Medium (Standard Exam)</option>
                  <option value="HARD" ${this.quizConfig.difficulty === 'HARD' ? 'selected' : ''}>Hard (Deep Multi-Statement)</option>
                  <option value="MIXED" ${this.quizConfig.difficulty === 'MIXED' ? 'selected' : ''}>Mixed Difficulty</option>
                </select>
              </div>

              <div style="min-width:0;">
                <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:0.35rem;">
                  Question Style
                </label>
                <select class="vault-filter-select" style="width:100%; min-height:48px;" onchange="studyNotesView.quizConfig.questionType = this.value">
                  <option value="MCQ" ${this.quizConfig.questionType === 'MCQ' ? 'selected' : ''}>Multiple Choice (MCQs)</option>
                  <option value="TRUE_FALSE" ${this.quizConfig.questionType === 'TRUE_FALSE' ? 'selected' : ''}>True / False Concept Check</option>
                  <option value="MIXED" ${this.quizConfig.questionType === 'MIXED' ? 'selected' : ''}>Mixed Exam Format</option>
                </select>
              </div>
            </div>

            <!-- Start Button -->
            <div style="display:flex; justify-content:flex-end; gap:0.75rem; flex-wrap:wrap;">
              <button class="btn btn-secondary" onclick="studyNotesView.closeQuizModal()">Cancel</button>
              <button class="btn btn-primary" style="font-weight:700; box-shadow:0 6px 20px rgba(99,102,241,0.4);" onclick="studyNotesView.launchGeneratedQuizForNote(${note.id})">
                <i data-lucide="zap"></i>
                <span>Generate & Start Quiz</span>
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Interactive Smart Glossary Popover -->
      ${this.activeGlossaryTerm && this.activeGlossaryPos ? `
        <div class="glossary-popover-box" style="left:${this.activeGlossaryPos.x}px; top:${this.activeGlossaryPos.y}px;" onclick="event.stopPropagation()">
          <div class="glossary-popover-term">
            <span>${this.escapeHtml(this.activeGlossaryTerm.term)}</span>
            <button class="icon-btn" style="padding:0; width:22px; height:22px;" onclick="studyNotesView.closeGlossaryPopover()">
              <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
          </div>
          ${this.activeGlossaryTerm.hindiMeaning ? `
            <div class="glossary-popover-hindi">
              🇮🇳 ${this.escapeHtml(this.activeGlossaryTerm.hindiMeaning)}
            </div>
          ` : ''}
          <div class="glossary-popover-desc">
            ${this.escapeHtml(this.activeGlossaryTerm.simpleMeaning || this.activeGlossaryTerm.contextMeaning)}
          </div>
          ${this.activeGlossaryTerm.exampleSentence ? `
            <div class="glossary-popover-sentence">
              "${this.escapeHtml(this.activeGlossaryTerm.exampleSentence)}"
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;

    // Attach scroll listener to update TOC active item and reading progress bar
    this.initScrollspyListener();
  }

  setReaderTab(tab) {
    this.readerActiveTab = tab;
    this.showingOriginalSource = (tab === 'SOURCE');
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  setSourceViewMode(showOriginal) {
    this.setReaderTab(showOriginal ? 'SOURCE' : 'TEXTBOOK');
  }

  renderOriginalSourceView(note) {
    const original = note.originalSource || {
      text: note.content || 'No original source text recorded.',
      files: note.sourceFiles || [],
      importedAt: note.createdAt
    };

    const sourceFiles = Array.isArray(original.files) ? original.files : (note.sourceFiles || []);
    const sourceText = (original.text || note.content || '').trim();
    const wordCount = sourceText ? sourceText.split(/\s+/).length : 0;
    const charCount = sourceText.length;
    const importDate = original.importedAt ? new Date(original.importedAt).toLocaleString() : 'N/A';

    return `
      <div class="original-source-panel cascade-card">
        <!-- Source Header Information -->
        <div class="original-source-header">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(99,102,241,0.12); color:var(--color-primary-light); padding:4px 10px; border-radius:999px; font-size:0.75rem; font-weight:750; margin-bottom:0.5rem;">
                <i data-lucide="shield-check" style="width:13px;height:13px;"></i>
                <span>Original Unedited Source Material</span>
              </div>
              <h2 style="font-size:1.4rem; font-weight:800; color:var(--text-main); margin-bottom:0.35rem;">
                ${this.escapeHtml(note.title)}
              </h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">
                Imported on ${importDate} • Subject: <strong>${this.escapeHtml(note.subject || 'General Study')}</strong>
              </p>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.copySourceText()" title="Copy raw source text">
                <i data-lucide="copy" style="width:14px;height:14px;"></i>
                <span>Copy Source Text</span>
              </button>
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.downloadSourceText(${note.id})" title="Download as text file">
                <i data-lucide="download" style="width:14px;height:14px;"></i>
                <span>Download .txt</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="studyNotesView.setSourceViewMode(false)" title="Switch to AI Digital Textbook">
                <i data-lucide="book-open" style="width:14px;height:14px;"></i>
                <span>Back to AI Textbook ✨</span>
              </button>
            </div>
          </div>

          <!-- Source Files Chips & Metadata -->
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:1.1rem; padding-top:0.85rem; border-top:1px solid var(--border-subtle); align-items:center;">
            <span style="font-size:0.8rem; color:var(--text-muted); font-weight:700;">Source Files:</span>
            ${sourceFiles.length > 0 ? sourceFiles.map(f => `
              <span class="badge" style="background:rgba(255,255,255,0.06); border:1px solid var(--border-medium); padding:4px 10px; font-size:0.75rem; display:inline-flex; align-items:center; gap:5px;">
                <i data-lucide="${f.type === 'PDF' ? 'file-text' : (f.type === 'IMAGE' ? 'image' : 'file')}" style="width:13px;height:13px; color:var(--color-primary-light);"></i>
                <span>${this.escapeHtml(f.name || 'Attached File')}</span>
                ${f.size ? `<small style="opacity:0.6;">(${Math.round(f.size / 1024)} KB)</small>` : ''}
              </span>
            `).join('') : `
              <span class="badge" style="background:rgba(255,255,255,0.06); padding:4px 10px; font-size:0.75rem;">
                ✍️ Direct Text Ingestion
              </span>
            `}
            <span style="margin-left:auto; font-size:0.8rem; color:var(--text-muted);">
              <strong>${wordCount.toLocaleString()}</strong> words • <strong>${charCount.toLocaleString()}</strong> characters
            </span>
          </div>
        </div>

        <!-- Explanatory Banner -->
        <div class="original-source-banner">
          <i data-lucide="info" style="width:18px;height:18px; flex-shrink:0; color:#38bdf8;"></i>
          <span style="font-size:0.86rem; line-height:1.5; color:var(--text-main);">
            <strong>Integrity Guarantee:</strong> This is your original source material preserved intact without any AI alterations. The Hamsa AI engine read and digested this content to formulate your structured, color-coded Digital Textbook format available in the <em>AI Digital Textbook</em> tab.
          </span>
        </div>

        <!-- Raw Text Content Area -->
        <div class="original-source-content">
          <pre id="raw-source-text-box" style="margin:0; font-family:var(--font-mono, monospace); font-size:0.9rem; line-height:1.75; white-space:pre-wrap; word-break:break-word; color:var(--text-main);">${this.escapeHtml(sourceText || 'No source text available.')}</pre>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DEDICATED FULL-PAGE AI HIGH-YIELD SUMMARY TAB VIEW
  // =========================================================================
  renderSummaryTabView(note) {
    const summary = note.summary;
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));

    if (!summary) {
      return `
        <div class="textbook-summary-view">
          <div class="summary-empty-state-card">
            <div style="width:68px; height:68px; border-radius:20px; background:linear-gradient(135deg, rgba(99,102,241,0.2), rgba(16,185,129,0.2)); border:1.5px solid rgba(16,185,129,0.4); display:flex; align-items:center; justify-content:center; color:#10b981;">
              <i data-lucide="zap" style="width:34px; height:34px;"></i>
            </div>
            <h2 style="font-size:1.85rem; font-weight:850; color:var(--text-main); margin:0;">
              High-Yield AI Summary Not Yet Generated
            </h2>
            <p style="font-size:1.05rem; line-height:1.7; color:var(--text-secondary); max-width:560px; margin:0;">
              Generate a comprehensive, topic-wide revision suite for <strong>"${this.escapeHtml(note.title)}"</strong>. Hamsa AI will extract 8–10 key exam takeaways, definitions index, standard rules, and critical exam pitfalls.
            </p>
            <div style="display:flex; gap:1rem; margin-top:0.75rem; flex-wrap:wrap; justify-content:center;">
              <button class="btn btn-primary btn-hero-import" onclick="studyNotesView.generateFreshSummary(${note.id})">
                <i data-lucide="sparkles"></i>
                <span>Generate High-Yield AI Summary ✨</span>
              </button>
              <button class="btn btn-secondary" onclick="studyNotesView.setReaderTab('TEXTBOOK')">
                <i data-lucide="book-open"></i>
                <span>Read Digital Textbook</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const takeaways = Array.isArray(summary.takeaways) ? summary.takeaways : [];
    const definitions = Array.isArray(summary.keyDefinitions) ? summary.keyDefinitions : [];
    const formulas = Array.isArray(summary.formulasOrRules) ? summary.formulasOrRules : (Array.isArray(summary.formulas) ? summary.formulas : []);
    const traps = Array.isArray(summary.examTraps) ? summary.examTraps : [];

    return `
      <div class="textbook-summary-view">
        <!-- Hero Header Card -->
        <div class="summary-hero-header-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1.25rem;">
            <div>
              <div class="summary-badge-live">
                <i data-lucide="zap" style="width:14px; height:14px;"></i>
                <span>High-Yield AI Revision Suite • Topic Mastery</span>
              </div>
              <h1 class="summary-hero-title">
                ${this.escapeHtml(note.title)}
              </h1>
              <div style="display:flex; align-items:center; gap:0.75rem; font-size:0.88rem; color:var(--text-muted); margin-bottom:1.15rem; flex-wrap:wrap;">
                <span class="badge badge-primary">${this.escapeHtml(note.subject || 'General Study')}</span>
                <span>•</span>
                <span>⏱️ ~${readTime} min read (~${words} words)</span>
                <span>•</span>
                <span>📚 ${takeaways.length} Key Takeaways</span>
                <span>•</span>
                <span>⚡ Auto-saved in Vault</span>
              </div>
              <p class="summary-hero-concept">
                ${this.escapeHtml(summary.coreConcept || 'Executive conceptual synthesis')}
              </p>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:0.65rem; flex-wrap:wrap; align-self:flex-start;">
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.generateFreshSummary(${note.id})" title="Regenerate fresh summary with AI">
                <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
                <span>Regenerate Summary</span>
              </button>
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.exportSummarySheetPdf(${note.id})" title="Download 1-Page Summary PDF">
                <i data-lucide="download" style="width:14px;height:14px;"></i>
                <span>Summary PDF</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="studyNotesView.openQuizModal()" title="Practice Quiz from this Summary">
                <i data-lucide="zap" style="width:14px;height:14px;"></i>
                <span>Practice Quiz</span>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="studyNotesView.setReaderTab('TEXTBOOK')" title="Return to Textbook">
                <i data-lucide="book-open" style="width:14px;height:14px;"></i>
                <span>Textbook</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Section 1: 📚 Section-by-Section 40% Deep Dive Breakdown -->
        ${Array.isArray(summary.sectionBreakdowns) && summary.sectionBreakdowns.length > 0 ? `
          <div class="summary-deepdive-container">
            <div class="summary-section-title">
              <i data-lucide="layers" style="color:#6366f1; width:22px; height:22px;"></i>
              <span>Section-by-Section Comprehensive Deep Dive (Minimum 40% Depth)</span>
            </div>
            ${summary.sectionBreakdowns.map((sec, sIdx) => `
              <div class="summary-section-breakdown-card">
                <div class="summary-section-breakdown-header">
                  <div class="summary-section-breakdown-title">
                    <span style="background:var(--color-primary); color:#ffffff; width:26px; height:26px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:0.82rem; font-weight:800;">${sIdx + 1}</span>
                    <span>${this.escapeHtml(sec.sectionTitle || `Chapter Section ${sIdx + 1}`)}</span>
                  </div>
                  <span class="summary-depth-badge">
                    <i data-lucide="check-circle" style="width:12px; height:12px;"></i>
                    <span>40% Depth Analytical Synthesis</span>
                  </span>
                </div>
                <div class="summary-section-deepdive-text">${this.escapeHtml(sec.deepDiveSummary || '')}</div>
                ${Array.isArray(sec.highYieldPointers) && sec.highYieldPointers.length > 0 ? `
                  <div class="summary-section-subbox">
                    <div class="summary-section-subbox-title">
                      <i data-lucide="check-square" style="width:14px; height:14px;"></i>
                      <span>Critical Exam Pointers for this Section:</span>
                    </div>
                    <ul style="margin:0; padding-left:1.25rem; font-size:0.98rem; line-height:1.75; color:var(--text-main);">
                      ${sec.highYieldPointers.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Section 1: 📌 8-10 High-Yield Takeaways -->
        <div class="summary-takeaways-container">
          <div class="summary-section-title">
            <i data-lucide="check-circle-2" style="color:#10b981; width:22px; height:22px;"></i>
            <span>High-Yield Key Takeaways (${takeaways.length})</span>
          </div>
          <div class="summary-takeaways-grid">
            ${takeaways.map((t, idx) => `
              <div class="summary-takeaway-item">
                <div class="summary-takeaway-num">${idx + 1}</div>
                <div class="summary-takeaway-text">${this.escapeHtml(t)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Section 2: ⚖️ Core Definitions & Terms -->
        ${definitions.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:1.25rem;">
            <div class="summary-section-title">
              <i data-lucide="bookmark" style="color:#6366f1; width:22px; height:22px;"></i>
              <span>Core Definitions & Key Terminology</span>
            </div>
            <div class="summary-def-grid">
              ${definitions.map(d => `
                <div class="summary-def-card">
                  <div class="summary-def-title">${this.escapeHtml(typeof d === 'string' ? d : d.term)}</div>
                  <div class="summary-def-body">${this.escapeHtml(typeof d === 'string' ? 'Core concept in this chapter.' : d.definition)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Section 3: 📐 Formulas, Provisions & Standard Rules -->
        ${formulas.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:1.25rem;">
            <div class="summary-section-title">
              <i data-lucide="binary" style="color:#0284c7; width:22px; height:22px;"></i>
              <span>Formulas, Provisions & Standard Rules</span>
            </div>
            <div class="summary-takeaways-grid">
              ${formulas.map(f => `
                <div class="semantic-formula-box" style="margin:0;">
                  <div class="semantic-formula-name">${this.escapeHtml(typeof f === 'string' ? 'Key Formula' : f.name)}</div>
                  <div class="semantic-formula-math">${this.escapeHtml(typeof f === 'string' ? f : f.rule || f.formula)}</div>
                  ${f.significance || f.explanation ? `
                    <div style="font-size:0.92rem; color:var(--text-secondary); margin-top:0.45rem;">
                      ${this.escapeHtml(f.significance || f.explanation)}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Section 4: ⚠️ Critical Exam Pitfalls & Examiner Distractors -->
        ${traps.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:1.25rem;">
            <div class="summary-section-title">
              <i data-lucide="alert-triangle" style="color:#ef4444; width:22px; height:22px;"></i>
              <span>Critical Exam Pitfalls & Student Misconceptions</span>
            </div>
            <div class="summary-traps-grid">
              ${traps.map(trap => `
                <div class="summary-trap-card">
                  <div class="summary-trap-header">
                    <i data-lucide="alert-circle" style="width:16px;height:16px;"></i>
                    <span>Examiner Trap Alert</span>
                  </div>
                  <div class="summary-trap-text">${this.escapeHtml(trap)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Section 5: 🎯 Golden Memory Anchor -->
        ${summary.finalTakeaway ? `
          <div class="summary-memory-card">
            <div style="font-size:2.2rem; line-height:1;">🎯</div>
            <div>
              <div style="font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#d97706; margin-bottom:0.35rem;">
                Golden Memory Anchor for Exam Day
              </div>
              <div class="summary-memory-text">
                "${this.escapeHtml(summary.finalTakeaway)}"
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Bottom Return Actions -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1.5px solid var(--border-subtle); padding-top:2rem; margin-top:1rem; flex-wrap:wrap; gap:1rem;">
          <button class="btn btn-secondary" onclick="studyNotesView.setReaderTab('TEXTBOOK')">
            <i data-lucide="book-open"></i>
            <span>Back to Digital Textbook</span>
          </button>
          <div style="display:flex; gap:0.75rem;">
            <button class="btn btn-secondary" onclick="studyNotesView.exportSummarySheetPdf(${note.id})">
              <i data-lucide="download"></i>
              <span>Export Summary PDF</span>
            </button>
            <button class="btn btn-primary" onclick="studyNotesView.openQuizModal()">
              <i data-lucide="zap"></i>
              <span>Practice AI Quiz</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  copySourceText() {
    const el = document.getElementById('raw-source-text-box');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      app.showToast('Original source text copied to clipboard!', 'success');
      if (window.audioEngine) window.audioEngine.playClick();
    }).catch(() => {
      app.showToast('Could not copy text.', 'error');
    });
  }

  downloadSourceText(noteId) {
    const note = this.activeNote;
    if (!note) return;
    const originalText = note.originalSource?.text || note.content || '';
    // Previously revoked the object URL synchronously right after click(), which
    // can cancel the download in some browsers. downloadBlob() defers the revoke.
    UIUtils.downloadText(
      originalText,
      `${UIUtils.slugify(note.title, 'study-note')}-original-source.txt`
    );
    app.showToast('Source file downloaded.', 'info');
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // =========================================================================
  // SECTION CONTENT BUILDER (COLOR-CODED BLOCKS & INTERACTIVE GLOSSARY)
  // =========================================================================
  renderSectionContent(sec, sIdx, note) {
    // Process text paragraphs to wrap glossary terms with interactive spans
    const processedParagraphs = this.injectGlossarySpans(sec.content || '', note.glossaryTerms || []);

    return `
      <section class="textbook-section-block" id="${sec.id}">
        <!-- Section Heading & Quick Action Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.35rem;">
          <div>
            <h2 class="textbook-section-heading" style="margin-bottom:0;">
              <span>${this.escapeHtml(sec.heading || `Section ${sIdx + 1}`)}</span>
            </h2>
            ${sec.subheading ? `
              <div class="textbook-section-subheading" style="margin-top:0.25rem;">${this.escapeHtml(sec.subheading)}</div>
            ` : ''}
          </div>
          <div class="section-actions-row" style="display:flex; align-items:center; gap:0.45rem;">
            <button class="btn btn-secondary btn-xs btn-section-flashcards" onclick="studyNotesView.createFlashcardsFromSection('${sec.id}')" title="Practice 3D Flashcards for this section">
              <i data-lucide="layers" style="width:12px;height:12px;color:#ec4899;"></i>
              <span>🎴 Flashcards</span>
            </button>
            <button class="btn btn-secondary btn-xs" onclick="studyNotesView.readSectionAloud('${sec.id}')" title="Listen to this section">
              <i data-lucide="volume-2" style="width:12px;height:12px;color:#06b6d4;"></i>
              <span>Listen</span>
            </button>
          </div>
        </div>

        <!-- Body Paragraphs -->
        ${this.isEditMode ? `
          <textarea class="live-reading-canvas" style="min-height:220px; font-size:1.05rem; line-height:1.8;"
            oninput="studyNotesView.onSectionTextEdit('${sec.id}', this.value)">${this.escapeHtml(sec.content || '')}</textarea>
        ` : `
          <div class="textbook-body-paragraph">
            ${processedParagraphs}
          </div>
        `}

        <!-- A. Key Points Block (Indigo) -->
        ${sec.keyPoints && sec.keyPoints.length > 0 ? `
          <div class="semantic-keypoints-box">
            <div class="semantic-block-title-indigo">
              <i data-lucide="check-circle-2" style="width:16px;height:16px;"></i>
              <span>Core Key Points</span>
            </div>
            <ul class="semantic-keypoints-list">
              ${sec.keyPoints.map(kp => `<li>${this.escapeHtml(kp)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- B. Definitions Card (Emerald) -->
        ${sec.definitions && sec.definitions.length > 0 ? `
          <div class="semantic-definitions-card">
            <div class="semantic-block-title-emerald">
              <i data-lucide="book" style="width:16px;height:16px;"></i>
              <span>Essential Definitions</span>
            </div>
            ${sec.definitions.map(d => `
              <div class="semantic-def-item">
                <span class="semantic-def-term">${this.escapeHtml(d.term)}:</span>
                <span style="color:var(--text-secondary);">${this.escapeHtml(d.definition)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- C. Important Facts (Amber) -->
        ${sec.importantFacts && sec.importantFacts.length > 0 ? `
          <div class="semantic-facts-box">
            <div class="semantic-block-title-amber">
              <i data-lucide="alert-circle" style="width:16px;height:16px;"></i>
              <span>High-Yield Exam Facts</span>
            </div>
            <ul style="margin:0; padding-left:1.25rem; font-size:1rem; line-height:1.7; color:var(--text-main);">
              ${sec.importantFacts.map(f => `<li>${this.escapeHtml(f)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- D. Formulas (Monospace Math) -->
        ${sec.formulas && sec.formulas.length > 0 ? `
          <div class="semantic-formula-box">
            <div style="font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#38bdf8; margin-bottom:0.75rem;">
              📐 Formulas & Technical Relations
            </div>
            ${sec.formulas.map(f => `
              <div style="margin-bottom:1rem;">
                <div class="semantic-formula-name">${this.escapeHtml(f.name)}</div>
                <div class="semantic-formula-math">${this.escapeHtml(f.formula)}</div>
                <div style="font-size:0.9rem; color:var(--text-muted);">${this.escapeHtml(f.explanation)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- E. Interactive Examples (Click to explore modal) -->
        ${sec.examples && sec.examples.length > 0 ? `
          ${sec.examples.map(ex => `
            <div class="semantic-example-card" onclick="studyNotesView.openExampleModal('${sec.id}', '${ex.id || 'ex-1'}')">
              <span class="semantic-example-badge">
                <i data-lucide="lightbulb" style="width:14px;height:14px;"></i> Interactive Example — Click to Explore Analogy
              </span>
              <h4 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin:0.35rem 0 0.5rem 0;">
                ${this.escapeHtml(ex.title)}
              </h4>
              <p style="font-size:0.95rem; line-height:1.65; color:var(--text-secondary); margin:0;">
                ${this.escapeHtml(ex.content.slice(0, 180))}... <span style="color:#c084fc; font-weight:700;">[Read Step-by-Step Logic & Analogy →]</span>
              </p>
            </div>
          `).join('')}
        ` : ''}

        <!-- F. Inline Micro-Quiz (Rapid Active Recall) -->
        ${this.renderSectionMicroQuiz(sec, sIdx, note)}

        <!-- G. Section Mastery Footer & Progression -->
        ${this.renderSectionMasteryFooter(sec, sIdx, note)}
      </section>
    `;
  }

  /**
   * Injects interactive glossary spans with hover/click listeners
   */
  injectGlossarySpans(text, glossaryTerms) {
    if (!glossaryTerms || glossaryTerms.length === 0) {
      return this.escapeHtml(text);
    }

    let escaped = this.escapeHtml(text);
    for (const g of glossaryTerms) {
      const term = g.term;
      if (!term || term.length < 3) continue;
      const regex = new RegExp(`\\b(${this.escapeRegex(term)})\\b`, 'gi');
      escaped = escaped.replace(regex, (match) => {
        return `<span class="glossary-interactive-term" onclick="studyNotesView.showGlossaryPopover(event, '${this.escapeJs(term)}')">${match}</span>`;
      });
    }
    return escaped;
  }

  // =========================================================================
  // GLOSSARY & TEXT SELECTION TOOLBAR
  // =========================================================================
  showGlossaryPopover(e, termName) {
    e.stopPropagation();
    const g = this.activeNote?.glossaryTerms?.find(t => t.term.toLowerCase() === termName.toLowerCase());
    if (g) {
      const rect = e.target.getBoundingClientRect();
      this.activeGlossaryTerm = g;
      this.activeGlossaryPos = {
        x: Math.min(window.innerWidth - 340, Math.max(20, rect.left + window.scrollX - 40)),
        y: rect.bottom + window.scrollY + 8
      };
      this.render();
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  closeGlossaryPopover() {
    this.activeGlossaryTerm = null;
    this.activeGlossaryPos = null;
    this.render();
  }

  initTextSelectionListener() {
    document.addEventListener('mouseup', () => {
      if (this.currentViewMode !== 'READER') return;
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';

      // Remove existing floating selection toolbar if any
      const existing = document.getElementById('floating-selection-toolbar');
      if (existing) existing.remove();

      if (selectedText.length > 2 && selectedText.length < 90) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const toolbar = document.createElement('div');
        toolbar.id = 'floating-selection-toolbar';
        toolbar.className = 'text-selection-toolbar';
        toolbar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
        toolbar.style.top = `${Math.max(10, rect.top + window.scrollY - 44)}px`;

        toolbar.innerHTML = `
          <button class="hl-color-btn hl-yellow" onclick="studyNotesView.highlightSelectedText('yellow')" title="Highlight Yellow"></button>
          <button class="hl-color-btn hl-green" onclick="studyNotesView.highlightSelectedText('green')" title="Highlight Green"></button>
          <button class="hl-color-btn hl-purple" onclick="studyNotesView.highlightSelectedText('purple')" title="Highlight Purple"></button>
          <div style="width:1px; height:16px; background:var(--border-subtle); margin:0 2px;"></div>
          <button class="floating-btn" onclick="studyNotesView.explainSelectedText('${this.escapeJs(selectedText)}')">
            <i data-lucide="sparkles" style="width:12px;height:12px; color:#c084fc;"></i> Explain
          </button>
          <button class="floating-btn" onclick="studyNotesView.bookmarkSelectedText('${this.escapeJs(selectedText)}')">
            <i data-lucide="bookmark" style="width:12px;height:12px; color:#f59e0b;"></i> Save
          </button>
        `;

        document.body.appendChild(toolbar);
        if (window.app) window.app.refreshIcons();
      }
    });

    // Close open menus when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[id^="card-menu-"]') && !e.target.closest('button[onclick*="toggleCardMenu"]')) {
        document.querySelectorAll('[id^="card-menu-"]').forEach(el => {
          el.style.display = 'none';
        });
      }
      if (!e.target.closest('#export-dropdown-menu') && !e.target.closest('button[onclick*="toggleExportMenu"]')) {
        const expMenu = document.getElementById('export-dropdown-menu');
        if (expMenu) expMenu.style.display = 'none';
      }
      if (!e.target.closest('#reading-appearance-menu') && !e.target.closest('button[onclick*="toggleAppearanceMenu"]')) {
        const appMenu = document.getElementById('reading-appearance-menu');
        if (appMenu) appMenu.style.display = 'none';
        this.isAppearanceMenuOpen = false;
      }
    });

    // Close Ask AI drawer on Escape key press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isAskAiOpen) {
        this.closeAskAiDrawer();
      }
    });
  }

  highlightSelectedText(color) {
    const existing = document.getElementById('floating-selection-toolbar');
    if (existing) existing.remove();

    if (!this.activeNote) return;
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text) return;

    if (!this.activeNote.annotations) {
      this.activeNote.annotations = { highlights: [], bookmarks: [], personalNotes: [] };
    }
    if (!Array.isArray(this.activeNote.annotations.highlights)) {
      this.activeNote.annotations.highlights = [];
    }

    const hlItem = {
      id: `hl-${Date.now()}`,
      sectionId: this.activeTOCSectionId || (this.activeNote.sections?.[0]?.id || 'sec-1'),
      text: text,
      color: color,
      createdAt: new Date().toISOString()
    };

    this.activeNote.annotations.highlights.push(hlItem);
    updateNoteAnnotations(this.activeNote.id, this.activeNote.annotations);

    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('mark');
        span.className = `hamsa-highlight hl-${color}`;
        span.textContent = text;
        range.deleteContents();
        range.insertNode(span);
      }
    } catch (e) {
      // Range.surroundContents() throws when the selection crosses element
      // boundaries. The highlight is already persisted, so only the immediate
      // visual feedback is lost — it reappears on the next render.
      console.warn('Could not apply highlight visually; it is still saved.', e);
    }

    selection.removeAllRanges();

    if (window.audioEngine) window.audioEngine.playClick();
    app.showToast(`✨ Highlight saved in ${color}!`, 'success');

    if (this.sidebarActiveTab === 'ANNOTATIONS') {
      this.refreshSidebarTab();
    }
  }

  async explainSelectedText(term) {
    const existing = document.getElementById('floating-selection-toolbar');
    if (existing) existing.remove();

    app.showToast(`Analyzing "${term}" in context...`, 'info');
    if (window.audioEngine) window.audioEngine.playClick();

    try {
      const expl = await window.geminiService.explainTermContextually({
        term,
        noteTopic: this.activeNote?.title || 'Study Material'
      });

      this.activeGlossaryTerm = expl;
      this.activeGlossaryPos = {
        x: Math.min(window.innerWidth - 340, Math.max(20, window.innerWidth / 2 - 160)),
        y: window.scrollY + 180
      };
      this.render();
    } catch (e) {
      app.showToast(`Could not explain term: ${e.message}`, 'error');
    }
  }

  bookmarkSelectedText(text) {
    const existing = document.getElementById('floating-selection-toolbar');
    if (existing) existing.remove();

    if (!this.activeNote) return;
    if (!this.activeNote.annotations) {
      this.activeNote.annotations = { highlights: [], bookmarks: [], personalNotes: [] };
    }
    if (!Array.isArray(this.activeNote.annotations.bookmarks)) {
      this.activeNote.annotations.bookmarks = [];
    }

    this.activeNote.annotations.bookmarks.push({
      id: `bm-${Date.now()}`,
      sectionId: this.activeTOCSectionId || (this.activeNote.sections?.[0]?.id || 'sec-1'),
      note: text,
      createdAt: new Date().toISOString()
    });

    updateNoteAnnotations(this.activeNote.id, this.activeNote.annotations);
    app.showToast(`📌 Bookmarked: "${text}"`, 'success');
    if (window.audioEngine) window.audioEngine.playFanfare();

    if (this.sidebarActiveTab === 'ANNOTATIONS') {
      this.refreshSidebarTab();
    }
  }

  // =========================================================================
  // INTERACTIVE EXAMPLE MODAL
  // =========================================================================
  openExampleModal(sectionId, exampleId) {
    const sec = this.activeNote?.sections?.find(s => s.id === sectionId);
    const ex = sec?.examples?.find(e => (e.id || 'ex-1') === exampleId) || sec?.examples?.[0];
    if (ex) {
      this.activeExampleData = ex;
      this.render();
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  closeExampleModal() {
    this.activeExampleData = null;
    this.render();
  }

  // =========================================================================
  // ASK AI ABOUT THIS NOTE (GROUNDED Q&A & SPLIT-SCREEN)
  // =========================================================================
  closeAskAiDrawer() {
    this.isAskAiOpen = false;
    const el = document.getElementById('ask-ai-drawer');
    if (el) el.classList.remove('active');
    const bd = document.getElementById('ask-ai-backdrop');
    if (bd) bd.classList.remove('active');
    const readerView = document.querySelector('.textbook-reader-view');
    if (readerView) readerView.classList.remove('split-active');
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleAskAiDrawer() {
    this.isAskAiOpen = !this.isAskAiOpen;
    const el = document.getElementById('ask-ai-drawer');
    if (el) el.classList.toggle('active', this.isAskAiOpen);
    const bd = document.getElementById('ask-ai-backdrop');
    if (bd) bd.classList.toggle('active', this.isAskAiOpen);

    // Toggle split-screen class on desktop
    const readerView = document.querySelector('.textbook-reader-view');
    if (readerView && window.innerWidth >= 1100) {
      readerView.classList.toggle('split-active', this.isAskAiOpen);
    }

    if (window.audioEngine) window.audioEngine.playClick();

    if (this.isAskAiOpen) {
      setTimeout(() => {
        const inp = document.getElementById('ask-ai-input-field');
        if (inp) inp.focus();
      }, 150);
    }
  }

  // =========================================================================
  // READING APPEARANCE & THEMES CONTROLLER (Aa)
  // =========================================================================
  toggleAppearanceMenu() {
    this.isAppearanceMenuOpen = !this.isAppearanceMenuOpen;
    const menu = document.getElementById('reading-appearance-menu');
    if (menu) {
      menu.style.display = this.isAppearanceMenuOpen ? 'flex' : 'none';
    }
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingTheme(theme) {
    this.readingTheme = theme;
    localStorage.setItem('hamsa_textbook_theme', theme);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-theme', theme);

    document.querySelectorAll('.theme-swatch-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingFont(font) {
    this.readingFont = font;
    localStorage.setItem('hamsa_textbook_font', font);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-font', font);

    document.querySelectorAll('.font-choice-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.font === font);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingSize(size) {
    this.readingSize = size;
    localStorage.setItem('hamsa_textbook_size', size);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-size', size);

    document.querySelectorAll('.size-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.size === size);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  renderAppearanceMenuContent() {
    return `
      <div>
        <div class="appearance-group-label">Reading Theme</div>
        <div class="appearance-theme-swatches">
          <button class="theme-swatch-btn ${this.readingTheme === 'DEFAULT' ? 'active' : ''}" data-theme="DEFAULT" onclick="studyNotesView.setReadingTheme('DEFAULT')">
            <div class="swatch-circle swatch-default"></div>
            <span>Default</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'SEPIA' ? 'active' : ''}" data-theme="SEPIA" onclick="studyNotesView.setReadingTheme('SEPIA')">
            <div class="swatch-circle swatch-sepia"></div>
            <span>Warm</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'PAPER' ? 'active' : ''}" data-theme="PAPER" onclick="studyNotesView.setReadingTheme('PAPER')">
            <div class="swatch-circle swatch-paper"></div>
            <span>Paper</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'OLED' ? 'active' : ''}" data-theme="OLED" onclick="studyNotesView.setReadingTheme('OLED')">
            <div class="swatch-circle swatch-oled"></div>
            <span>OLED</span>
          </button>
        </div>
      </div>

      <div>
        <div class="appearance-group-label">Typography</div>
        <div class="appearance-font-grid">
          <button class="font-choice-btn ${this.readingFont === 'SERIF' ? 'active' : ''}" data-font="SERIF" onclick="studyNotesView.setReadingFont('SERIF')">
            📖 Book Serif
          </button>
          <button class="font-choice-btn ${this.readingFont === 'SANS' ? 'active' : ''}" data-font="SANS" onclick="studyNotesView.setReadingFont('SANS')">
            ⚡ Clean Sans
          </button>
          <button class="font-choice-btn ${this.readingFont === 'DYSLEXIC' ? 'active' : ''}" data-font="DYSLEXIC" onclick="studyNotesView.setReadingFont('DYSLEXIC')">
            🎯 Focus Font
          </button>
        </div>
      </div>

      <div>
        <div class="appearance-group-label">Text Sizing</div>
        <div class="size-stepper-row">
          <button class="size-btn ${this.readingSize === 'SM' ? 'active' : ''}" data-size="SM" onclick="studyNotesView.setReadingSize('SM')">A-</button>
          <button class="size-btn ${this.readingSize === 'MD' ? 'active' : ''}" data-size="MD" onclick="studyNotesView.setReadingSize('MD')">Normal</button>
          <button class="size-btn ${this.readingSize === 'LG' ? 'active' : ''}" data-size="LG" onclick="studyNotesView.setReadingSize('LG')">Large</button>
          <button class="size-btn ${this.readingSize === 'XL' ? 'active' : ''}" data-size="XL" onclick="studyNotesView.setReadingSize('XL')">A+</button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // AUDIO READ-ALOUD / TEXT-TO-SPEECH (WEB SPEECH API)
  // =========================================================================
  toggleAudioNarration() {
    if (!('speechSynthesis' in window)) {
      app.showToast('Text-to-Speech is not supported in this browser.', 'warning');
      return;
    }

    if (this.isSpeaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.updateTtsButtonState();
      app.showToast('Audio read-aloud stopped.', 'info');
      return;
    }

    // Read current active section or first section
    const sec = this.activeNote?.sections?.find(s => s.id === this.activeTOCSectionId) || this.activeNote?.sections?.[0];
    if (sec) {
      this.readSectionAloud(sec.id);
    } else if (this.activeNote?.content) {
      this.speakText(this.activeNote.title + '. ' + this.activeNote.content, this.activeNote.title);
    }
  }

  readSectionAloud(secId) {
    if (!('speechSynthesis' in window)) {
      app.showToast('Text-to-Speech is not supported in this browser.', 'warning');
      return;
    }

    window.speechSynthesis.cancel();

    const sec = this.activeNote?.sections?.find(s => s.id === secId);
    if (!sec) return;

    let text = `${sec.heading}. `;
    if (sec.subheading) text += `${sec.subheading}. `;
    if (sec.content) text += `${sec.content}. `;
    if (sec.definitions && sec.definitions.length > 0) {
      text += 'Definitions: ' + sec.definitions.map(d => `${d.term}, ${d.definition}`).join('. ') + '. ';
    }
    if (sec.keyPoints && sec.keyPoints.length > 0) {
      text += 'Key points: ' + sec.keyPoints.join('. ') + '. ';
    }

    this.speakText(text, sec.heading);
  }

  speakText(text, label) {
    const clean = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === 'en-IN' || v.lang === 'hi-IN' || v.name.includes('India')) || voices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.updateTtsButtonState();
      app.showToast(`🎧 Reading aloud: "${label || 'Section'}"...`, 'info');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateTtsButtonState();
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      this.isSpeaking = false;
      this.updateTtsButtonState();
    };

    this.speechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  updateTtsButtonState() {
    const btn = document.getElementById('tts-read-aloud-btn');
    if (btn) {
      btn.className = `btn btn-secondary btn-sm ${this.isSpeaking ? 'active' : ''}`;
      btn.innerHTML = `
        <i data-lucide="${this.isSpeaking ? 'volume-x' : 'volume-2'}" style="width:14px;height:14px; color:${this.isSpeaking ? '#ef4444' : '#06b6d4'};"></i>
        <span>${this.isSpeaking ? 'Stop' : 'Listen'}</span>
      `;
      if (window.app) window.app.refreshIcons();
    }
  }

  // =========================================================================
  // SECTION MASTERY & PROGRESS CONTROLLER
  // =========================================================================
  async toggleSectionMastery(secId) {
    if (!this.activeNote) return;
    if (!Array.isArray(this.activeNote.masteredSections)) {
      this.activeNote.masteredSections = [];
    }

    const list = this.activeNote.masteredSections;
    const idx = list.indexOf(secId);
    const isMastered = idx === -1;

    if (isMastered) {
      list.push(secId);
      if (window.audioEngine) window.audioEngine.playFanfare();
      app.showToast('🎉 Section marked as Mastered!', 'success');
    } else {
      list.splice(idx, 1);
      if (window.audioEngine) window.audioEngine.playClick();
      app.showToast('Section marked as incomplete', 'info');
    }

    await updateNoteMastery(this.activeNote.id, list);

    // Update UI elements dynamically without full reload
    const sections = this.activeNote.sections || [];
    const pct = sections.length > 0 ? Math.round((list.length / sections.length) * 100) : 0;

    const statEl = document.getElementById('toc-mastery-stat-label');
    if (statEl) statEl.textContent = `${pct}% (${list.length}/${sections.length})`;

    const barEl = document.getElementById('toc-mastery-progress-bar-fill');
    if (barEl) barEl.style.width = `${pct}%`;

    const tocItem = document.querySelector(`.toc-link-item[data-sec-id="${secId}"]`);
    if (tocItem) {
      tocItem.classList.toggle('mastered', isMastered);
      const cb = tocItem.querySelector('.toc-mastery-checkbox');
      if (cb) {
        cb.classList.toggle('mastered', isMastered);
        cb.innerHTML = isMastered ? '<i data-lucide="check" style="width:12px;height:12px; stroke-width:3;"></i>' : '';
      }
    }

    const footerBtn = document.querySelector(`.btn-toggle-mastery[data-sec-id="${secId}"]`);
    if (footerBtn) {
      footerBtn.classList.toggle('mastered', isMastered);
      footerBtn.innerHTML = `
        <i data-lucide="${isMastered ? 'check-circle-2' : 'circle'}" style="width:15px;height:15px;"></i>
        <span>${isMastered ? '✓ Section Mastered' : 'Mark Section as Mastered'}</span>
      `;
    }

    if (window.app) window.app.refreshIcons();
  }

  renderSectionMasteryFooter(sec, sIdx, note) {
    const mastered = note.masteredSections || [];
    const isMastered = mastered.includes(sec.id);
    const sections = note.sections || [];
    const nextSec = sections[sIdx + 1];

    return `
      <div class="section-mastery-footer-row">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <button class="btn-toggle-mastery ${isMastered ? 'mastered' : ''}" data-sec-id="${sec.id}" onclick="studyNotesView.toggleSectionMastery('${sec.id}')">
            <i data-lucide="${isMastered ? 'check-circle-2' : 'circle'}" style="width:15px;height:15px;"></i>
            <span>${isMastered ? '✓ Section Mastered' : 'Mark Section as Mastered'}</span>
          </button>
          ${isMastered ? '<span style="font-size:0.8rem; color:var(--color-success); font-weight:700;">Section Completed! 🎉</span>' : ''}
        </div>

        ${nextSec ? `
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.scrollToSection('${nextSec.id}')" style="font-size:0.82rem;">
            <span>Next: ${this.escapeHtml(nextSec.heading || `Section ${sIdx + 2}`)}</span>
            <i data-lucide="arrow-down" style="width:13px;height:13px;"></i>
          </button>
        ` : `
          <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">🏁 End of Chapter</span>
        `}
      </div>
    `;
  }

  // =========================================================================
  // INLINE SECTION MICRO-QUIZ (RAPID ACTIVE RECALL)
  // =========================================================================
  renderSectionMicroQuiz(sec, sIdx, note) {
    const quiz = this.getOrGenerateSectionQuiz(sec, sIdx, note);
    if (!quiz) return '';

    const answer = this.microQuizAnswers[sec.id];
    const hasAnswered = !!answer;

    return `
      <div class="section-micro-quiz-card" id="micro-quiz-${sec.id}">
        <div class="micro-quiz-header">
          <div class="micro-quiz-badge">
            <i data-lucide="help-circle" style="width:14px;height:14px;"></i>
            <span>Active Recall • Self-Check</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">1-Click Quick Question</span>
        </div>

        <div class="micro-quiz-q-text">
          ${this.escapeHtml(quiz.question)}
        </div>

        <div class="micro-quiz-options-grid">
          ${quiz.options.map((opt, oIdx) => {
            let extraClass = '';
            if (hasAnswered) {
              if (oIdx === quiz.correctIndex) extraClass = 'correct';
              else if (oIdx === answer.selectedIdx) extraClass = 'wrong';
            }
            return `
              <button class="micro-quiz-opt-btn ${extraClass}" 
                ${hasAnswered ? 'disabled' : ''} 
                onclick="studyNotesView.answerMicroQuiz('${sec.id}', ${oIdx}, ${quiz.correctIndex}, '${this.escapeJs(quiz.explanation)}')">
                <span style="font-weight:700; color:var(--text-muted); font-size:0.8rem;">${['A', 'B', 'C', 'D'][oIdx]}.</span>
                <span>${this.escapeHtml(opt)}</span>
              </button>
            `;
          }).join('')}
        </div>

        ${hasAnswered ? `
          <div class="micro-quiz-feedback-box ${answer.isCorrect ? 'correct' : 'wrong'}">
            <strong>${answer.isCorrect ? '🎉 Excellent! That is correct.' : '⚠️ Review needed:'}</strong>
            <div style="margin-top:0.25rem;">${this.escapeHtml(answer.explanation)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  getOrGenerateSectionQuiz(sec, sIdx, note) {
    if (!this._cachedSectionQuizzes) this._cachedSectionQuizzes = {};
    if (this._cachedSectionQuizzes[sec.id]) return this._cachedSectionQuizzes[sec.id];

    // 1. Check if section has definitions
    if (Array.isArray(sec.definitions) && sec.definitions.length > 0) {
      const def = sec.definitions[0];
      const otherDefs = (note.glossaryTerms || []).filter(g => g.term !== def.term);
      const distractor1 = otherDefs[0]?.definition || `A secondary condition governing this process.`;
      const distractor2 = otherDefs[1]?.definition || `An outdated procedural rule no longer in primary practice.`;
      const distractor3 = `A variable that remains constant regardless of system dynamics.`;

      const rawOptions = [
        { text: def.definition, isCorrect: true },
        { text: distractor1, isCorrect: false },
        { text: distractor2, isCorrect: false },
        { text: distractor3, isCorrect: false }
      ];

      const correctIndex = sIdx % 4;
      const item = rawOptions.shift();
      rawOptions.splice(correctIndex, 0, item);

      this._cachedSectionQuizzes[sec.id] = {
        question: `According to this section, how is "${def.term}" best defined?`,
        options: rawOptions.map(o => o.text),
        correctIndex: correctIndex,
        explanation: `${def.term}: ${def.definition}`
      };
      return this._cachedSectionQuizzes[sec.id];
    }

    // 2. Check if section has formulas
    if (Array.isArray(sec.formulas) && sec.formulas.length > 0) {
      const form = sec.formulas[0];
      const rawOptions = [
        { text: form.formula, isCorrect: true },
        { text: form.formula.replace('=', '≠').replace('+', '-'), isCorrect: false },
        { text: `Δ (${form.formula.split('=')[1] || 'k · x'}) = 0`, isCorrect: false },
        { text: `None of the standard relationships apply directly`, isCorrect: false }
      ];

      const correctIndex = (sIdx + 1) % 4;
      const item = rawOptions.shift();
      rawOptions.splice(correctIndex, 0, item);

      this._cachedSectionQuizzes[sec.id] = {
        question: `Which formula accurately captures "${form.name}"?`,
        options: rawOptions.map(o => o.text),
        correctIndex: correctIndex,
        explanation: form.explanation ? `${form.name}: ${form.formula} (${form.explanation})` : `${form.name}: ${form.formula}`
      };
      return this._cachedSectionQuizzes[sec.id];
    }

    // 3. Check if section has key points
    if (Array.isArray(sec.keyPoints) && sec.keyPoints.length > 0) {
      const kp = sec.keyPoints[0];
      const rawOptions = [
        { text: kp, isCorrect: true },
        { text: `This concept is solely applicable in non-standard scenarios and has no general utility.`, isCorrect: false },
        { text: `Historical data disproves the core assertion made in this chapter.`, isCorrect: false },
        { text: `The principle requires external verification before any real-world conclusion.`, isCorrect: false }
      ];

      const correctIndex = sIdx % 4;
      const item = rawOptions.shift();
      rawOptions.splice(correctIndex, 0, item);

      this._cachedSectionQuizzes[sec.id] = {
        question: `Which fundamental principle is highlighted in "${sec.heading || `Section ${sIdx + 1}`}"?`,
        options: rawOptions.map(o => o.text),
        correctIndex: correctIndex,
        explanation: kp
      };
      return this._cachedSectionQuizzes[sec.id];
    }

    return null;
  }

  answerMicroQuiz(secId, selectedIdx, correctIdx, explanation) {
    const isCorrect = selectedIdx === correctIdx;
    this.microQuizAnswers[secId] = { selectedIdx, correctIdx, explanation, isCorrect };

    if (isCorrect) {
      if (window.audioEngine) window.audioEngine.playFanfare();
    } else {
      if (window.audioEngine) window.audioEngine.playClick();
    }

    const card = document.getElementById(`micro-quiz-${secId}`);
    if (card) {
      const sec = this.activeNote?.sections?.find(s => s.id === secId);
      const sIdx = this.activeNote?.sections?.findIndex(s => s.id === secId) || 0;
      if (sec) {
        card.outerHTML = this.renderSectionMicroQuiz(sec, sIdx, this.activeNote);
        if (window.app) window.app.refreshIcons();
      }
    }
  }

  // =========================================================================
  // MULTI-TAB SIDEBAR WORKSPACE (TOC, CHEAT SHEET, HIGHLIGHTS)
  // =========================================================================
  setSidebarTab(tab) {
    this.sidebarActiveTab = tab;
    this.refreshSidebarTab();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  refreshSidebarTab() {
    const container = document.getElementById('sidebar-tab-content-area');
    if (container && this.activeNote) {
      const sections = this.activeNote.sections || [];
      const words = this.activeNote.metadata?.wordCount || (this.activeNote.content ? this.activeNote.content.split(/\s+/).length : 500);
      const readTime = this.activeNote.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));
      container.innerHTML = this.renderSidebarContent(this.activeNote, sections, readTime, words);
      if (window.app) window.app.refreshIcons();
    }
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === this.sidebarActiveTab);
    });
  }

  renderSidebarContent(note, sections, readTime, words) {
    if (this.sidebarActiveTab === 'CHEATSHEET') {
      return this.renderCheatSheetSidebarContent(note, sections);
    }
    if (this.sidebarActiveTab === 'ANNOTATIONS') {
      return this.renderAnnotationsSidebarContent(note);
    }

    // Default: 'TOC'
    const mastered = note.masteredSections || [];
    const pct = sections.length > 0 ? Math.round((mastered.length / sections.length) * 100) : 0;

    return `
      <div class="toc-mastery-progress-header">
        <div class="toc-progress-label-row" style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.78rem; font-weight:750; color:var(--text-main);">Chapter Mastery</span>
          <span id="toc-mastery-stat-label" style="font-size:0.78rem; font-weight:800; color:var(--color-success);">${pct}% (${mastered.length}/${sections.length})</span>
        </div>
        <div style="width:100%; height:6px; background:var(--bg-card); border-radius:var(--radius-full); overflow:hidden; border:1px solid var(--border-subtle); margin-top:0.25rem;">
          <div id="toc-mastery-progress-bar-fill" style="height:100%; width:${pct}%; background:linear-gradient(90deg, #10b981, #059669); transition:width 0.3s ease;"></div>
        </div>
      </div>

      <nav class="toc-nav-list" style="flex:1; overflow-y:auto; padding:0.75rem;">
        ${sections.map((sec, sIdx) => {
          const isDone = mastered.includes(sec.id);
          return `
            <div class="toc-link-item ${this.activeTOCSectionId === sec.id ? 'active' : ''} ${isDone ? 'mastered' : ''}" 
                 data-sec-id="${sec.id}" 
                 style="display:flex; align-items:center; gap:0.5rem; padding:0.45rem 0.6rem; border-radius:var(--radius-md); margin-bottom:0.25rem; transition:background 0.15s ease;">
              <button class="toc-mastery-checkbox ${isDone ? 'mastered' : ''}" 
                      onclick="event.stopPropagation(); studyNotesView.toggleSectionMastery('${sec.id}')" 
                      title="${isDone ? 'Mark Incomplete' : 'Mark as Mastered'}">
                ${isDone ? '<i data-lucide="check" style="width:12px;height:12px; stroke-width:3;"></i>' : ''}
              </button>
              <a class="toc-link-text" href="javascript:void(0)" onclick="studyNotesView.scrollToSection('${sec.id}')" 
                 style="flex:1; text-decoration:none; color:inherit; font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${this.escapeHtml(sec.heading || `Section ${sIdx + 1}`)}
              </a>
            </div>
          `;
        }).join('')}
      </nav>

      <div style="border-top:1px solid var(--border-subtle); padding:0.85rem 1rem; font-size:0.8rem; color:var(--text-muted); background:var(--bg-surface);">
        <div>📖 ~${readTime} min read (${words} words)</div>
        <div style="margin-top:0.25rem;">📌 ${note.annotations?.bookmarks?.length || 0} Bookmarks • 🟡 ${note.annotations?.highlights?.length || 0} Highlights</div>
      </div>
    `;
  }

  renderCheatSheetSidebarContent(note, sections) {
    // Consolidate all definitions, formulas and facts
    const allDefs = [];
    const allFormulas = [];
    const allFacts = [];

    sections.forEach(sec => {
      if (Array.isArray(sec.definitions)) {
        sec.definitions.forEach(d => allDefs.push({ ...d, secHeading: sec.heading }));
      }
      if (Array.isArray(sec.formulas)) {
        sec.formulas.forEach(f => allFormulas.push({ ...f, secHeading: sec.heading }));
      }
      if (Array.isArray(sec.importantFacts)) {
        sec.importantFacts.forEach(fact => allFacts.push({ fact, secHeading: sec.heading }));
      }
    });

    if (Array.isArray(note.glossaryTerms)) {
      note.glossaryTerms.forEach(g => {
        if (!allDefs.some(d => d.term.toLowerCase() === g.term.toLowerCase())) {
          allDefs.push({ term: g.term, definition: g.definition, secHeading: 'Glossary' });
        }
      });
    }

    const hasAny = allDefs.length > 0 || allFormulas.length > 0 || allFacts.length > 0;

    return `
      <div style="padding:0.85rem 1rem 0.5rem; border-bottom:1px solid var(--border-subtle);">
        <button class="btn btn-primary btn-sm" style="width:100%; justify-content:center;" onclick="studyNotesView.createFlashcardsFromNote()">
          <i data-lucide="layers" style="width:14px;height:14px;"></i>
          <span>🎴 Flashcards for Chapter</span>
        </button>
      </div>

      <div class="cheatsheet-sidebar-scroll">
        ${!hasAny ? `
          <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem;">
            No structured formulas or definitions found yet.
          </div>
        ` : ''}

        ${allFormulas.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#38bdf8; margin-top:0.25rem;">
            📐 Key Formulas (${allFormulas.length})
          </div>
          ${allFormulas.map(f => `
            <div class="cheat-card-sm">
              <div class="cheat-card-title">${this.escapeHtml(f.name)}</div>
              <div style="font-family:var(--font-mono, monospace); font-weight:700; color:#38bdf8; font-size:0.88rem;">${this.escapeHtml(f.formula)}</div>
              ${f.explanation ? `<div class="cheat-card-content">${this.escapeHtml(f.explanation)}</div>` : ''}
            </div>
          `).join('')}
        ` : ''}

        ${allDefs.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#10b981; margin-top:0.5rem;">
            📚 Core Definitions (${allDefs.length})
          </div>
          ${allDefs.map(d => `
            <div class="cheat-card-sm">
              <div class="cheat-card-title" style="color:#10b981;">${this.escapeHtml(d.term)}</div>
              <div class="cheat-card-content">${this.escapeHtml(d.definition)}</div>
            </div>
          `).join('')}
        ` : ''}

        ${allFacts.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#f59e0b; margin-top:0.5rem;">
            ⚡ High-Yield Facts (${allFacts.length})
          </div>
          ${allFacts.map(f => `
            <div class="cheat-card-sm">
              <div class="cheat-card-content" style="color:var(--text-main);">• ${this.escapeHtml(f.fact)}</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">${this.escapeHtml(f.secHeading)}</div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  renderAnnotationsSidebarContent(note) {
    const highlights = note.annotations?.highlights || [];
    const bookmarks = note.annotations?.bookmarks || [];
    const totalCount = highlights.length + bookmarks.length;

    return `
      <div class="annotations-sidebar-scroll">
        ${totalCount === 0 ? `
          <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); font-size:0.85rem;">
            <i data-lucide="highlighter" style="width:28px;height:28px; stroke:var(--text-muted); margin-bottom:0.5rem; opacity:0.6;"></i>
            <div>No highlights or bookmarks yet.</div>
            <div style="font-size:0.78rem; margin-top:0.25rem;">Select any text while reading to highlight or bookmark!</div>
          </div>
        ` : ''}

        ${highlights.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-primary-light);">
            🟡 Saved Highlights (${highlights.length})
          </div>
          ${highlights.map(hl => `
            <div class="annotation-item-card" style="border-left-color:${hl.color === 'green' ? '#10b981' : hl.color === 'purple' ? '#a855f7' : '#f59e0b'};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                <span class="badge" style="font-size:0.7rem; padding:0.15rem 0.45rem;">${hl.color}</span>
                <button class="icon-btn-xs" onclick="studyNotesView.deleteAnnotation('${hl.id}', 'highlight')" title="Remove Highlight">
                  <i data-lucide="trash-2" style="width:12px;height:12px; color:var(--text-muted);"></i>
                </button>
              </div>
              <p style="font-size:0.84rem; color:var(--text-main); margin:0.25rem 0; font-style:italic;" onclick="studyNotesView.scrollToSection('${hl.sectionId}')">
                "${this.escapeHtml(hl.text)}"
              </p>
              <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(hl.createdAt).toLocaleDateString()}</span>
            </div>
          `).join('')}
        ` : ''}

        ${bookmarks.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#f59e0b; margin-top:0.5rem;">
            📌 Bookmarked Excerpts (${bookmarks.length})
          </div>
          ${bookmarks.map(bm => `
            <div class="annotation-item-card" style="border-left-color:#f59e0b;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                <span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">📌 Bookmark</span>
                <button class="icon-btn-xs" onclick="studyNotesView.deleteAnnotation('${bm.id}', 'bookmark')" title="Remove Bookmark">
                  <i data-lucide="trash-2" style="width:12px;height:12px; color:var(--text-muted);"></i>
                </button>
              </div>
              <p style="font-size:0.84rem; color:var(--text-main); margin:0.25rem 0;" onclick="studyNotesView.scrollToSection('${bm.sectionId}')">
                "${this.escapeHtml(bm.note)}"
              </p>
              <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(bm.createdAt).toLocaleDateString()}</span>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  deleteAnnotation(id, type) {
    if (!this.activeNote?.annotations) return;
    if (type === 'highlight') {
      this.activeNote.annotations.highlights = (this.activeNote.annotations.highlights || []).filter(h => h.id !== id);
    } else if (type === 'bookmark') {
      this.activeNote.annotations.bookmarks = (this.activeNote.annotations.bookmarks || []).filter(b => b.id !== id);
    }
    updateNoteAnnotations(this.activeNote.id, this.activeNote.annotations);
    app.showToast('Annotation removed', 'info');
    this.refreshSidebarTab();
  }

  // =========================================================================
  // 1-CLICK 3D FLASHCARDS BRIDGE
  // =========================================================================
  createFlashcardsFromSection(secId) {
    const sec = this.activeNote?.sections?.find(s => s.id === secId);
    if (!sec) return;

    const cards = [];

    // Definitions
    if (Array.isArray(sec.definitions) && sec.definitions.length > 0) {
      sec.definitions.forEach(d => {
        cards.push({
          front: d.term,
          back: d.definition,
          explanation: `From section: ${sec.heading}`,
          badge: 'Definition'
        });
      });
    }

    // Formulas
    if (Array.isArray(sec.formulas) && sec.formulas.length > 0) {
      sec.formulas.forEach(f => {
        cards.push({
          front: f.name,
          back: f.formula + (f.explanation ? `\n\n${f.explanation}` : ''),
          explanation: `Formula from: ${sec.heading}`,
          badge: 'Formula'
        });
      });
    }

    // Key Points
    if (Array.isArray(sec.keyPoints) && sec.keyPoints.length > 0) {
      sec.keyPoints.forEach((kp, idx) => {
        cards.push({
          front: `Core Principle #${idx + 1} (${sec.heading})`,
          back: kp,
          explanation: sec.heading,
          badge: 'Key Point'
        });
      });
    }

    if (cards.length === 0) {
      app.showToast('No definitions or key points found in this section to create flashcards.', 'info');
      return;
    }

    if (!window.flashcardsView) {
      window.flashcardsView = new FlashcardsView();
    }

    window.flashcardsView.currentDeck = {
      title: `${this.activeNote.title} — ${sec.heading}`,
      type: 'SECTION',
      subject: this.activeNote.subject || 'General'
    };
    window.flashcardsView.cards = cards;
    window.flashcardsView.startStudySession();

    if (window.app) {
      window.app.navigateToView('flashcards');
      app.showToast(`Loaded ${cards.length} 3D flashcards for "${sec.heading}"!`, 'success');
    }
  }

  createFlashcardsFromNote() {
    if (!this.activeNote) return;
    if (!window.flashcardsView) {
      window.flashcardsView = new FlashcardsView();
    }
    window.flashcardsView.loadNotesDeck(this.activeNote.id);
    if (window.app) {
      window.app.navigateToView('flashcards');
    }
  }

  sendQuickAiQuestion(question) {
    const inp = document.getElementById('ask-ai-input-field');
    if (inp) inp.value = question;
    this.sendAiMessage();
  }

  async sendAiMessage() {
    const inp = document.getElementById('ask-ai-input-field');
    const msg = inp ? inp.value.trim() : '';
    if (!msg) return;

    this.askAiMessages.push({ role: 'user', text: msg });
    if (inp) inp.value = '';
    this.renderAskAiMessages();

    if (window.audioEngine) window.audioEngine.playClick();

    try {
      const fullContent = this.activeNote?.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || this.activeNote?.content || '';
      const reply = await window.geminiService.askAiAboutNote({
        noteContent: fullContent,
        noteTopic: this.activeNote?.title || 'Study Guide',
        userQuestion: msg,
        chatHistory: this.askAiMessages
      });

      this.askAiMessages.push({ role: 'ai', text: reply });
      this.renderAskAiMessages();
      if (window.audioEngine) window.audioEngine.playBatchPing();
    } catch (err) {
      this.askAiMessages.push({ role: 'ai', text: `Sorry, I could not answer that right now: ${err.message}` });
      this.renderAskAiMessages();
    }
  }

  renderAskAiMessages() {
    const list = document.getElementById('ask-ai-msg-list');
    if (!list) return;

    list.innerHTML = `
      <div class="ask-ai-msg ai">
        👋 Hello! I am your AI study mentor for <strong>"${this.escapeHtml(this.activeNote?.title)}"</strong>. Ask me to clarify any concept, give an analogy, or explain exam-relevant questions grounded directly in this note!
      </div>
      ${this.askAiMessages.map(m => `
        <div class="ask-ai-msg ${m.role}">
          ${this.escapeHtml(m.text)}
        </div>
      `).join('')}
    `;
    list.scrollTop = list.scrollHeight;
  }

  // =========================================================================
  // AI SUMMARY & QUIZ CONFIG MODALS
  // =========================================================================
  openSummaryModal() {
    this.setReaderTab('SUMMARY');
  }

  closeSummaryModal() {
    this.setReaderTab('TEXTBOOK');
  }

  async generateFreshSummary(noteId) {
    if (window.audioEngine) window.audioEngine.playClick();
    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.classList.add('active');

    // Setup waiting motion card
    const batchCard = document.getElementById('batch-progress-card');
    if (batchCard) batchCard.style.display = 'flex';
    const batchFill = document.getElementById('batch-progress-fill');
    if (batchFill) batchFill.style.width = '20%';

    app.handleGenerationProgress({
      message: 'Reading textbook chapters & concepts...',
      badgeText: 'Summary Extraction',
      countText: 'Extracting key takeaways & definitions...',
      percent: 25,
      showBatchCard: true,
      stepId: 'step-reading'
    });

    try {
      const note = await getNoteById(noteId);

      app.handleGenerationProgress({
        message: 'Synthesizing High-Yield Takeaways, Definitions & Traps...',
        badgeText: 'AI Synthesis',
        countText: 'Distilling essential exam pointers across chapter...',
        percent: 65,
        showBatchCard: true,
        stepId: 'step-formulating'
      });

      const summary = await window.geminiService.summarizeStudyNote({
        title: note.title,
        content: note.content || note.sections?.map(s => s.content).join('\n\n'),
        subject: note.subject,
        sections: note.sections || []
      });

      // Save summary permanently in IndexedDB
      await updateNote(noteId, { summary });

      app.handleGenerationProgress({
        message: 'High-Yield Summary Ready & Saved! ✨',
        badgeText: 'Complete',
        countText: '100% Complete',
        percent: 100,
        showBatchCard: true,
        stepId: 'step-crafting',
        completedStepId: 'step-crafting'
      });

      await new Promise(r => setTimeout(r, 350));
      if (overlay) overlay.classList.remove('active');

      this.activeNote = await getNoteById(noteId);
      this.readerActiveTab = 'SUMMARY';
      await this.render();
      if (window.audioEngine) window.audioEngine.playFanfare();
      app.showToast('High-yield revision summary generated and saved! ✨', 'success');
    } catch (e) {
      if (overlay) overlay.classList.remove('active');
      app.showToast(`Summary failed: ${e.message}`, 'error');
    }
  }

  openQuizModal() {
    this.isQuizModalOpen = true;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  openQuizModalForNote(noteId) {
    this.activeNoteId = noteId;
    this.isQuizModalOpen = true;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  closeQuizModal() {
    this.isQuizModalOpen = false;
    this.render();
  }

  setQuizCount(cnt) {
    this.quizConfig.questionCount = cnt;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async launchGeneratedQuizForNote(noteId) {
    const note = await getNoteById(noteId);
    if (!note) return;

    this.closeQuizModal();
    if (window.audioEngine) window.audioEngine.playClick();

    const count = this.quizConfig.questionCount || 10;
    app.showToast(`Synthesizing ${count}-Question AI Quiz from "${note.title}"...`, 'info');

    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.classList.add('active');

    try {
      const fullText = note.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || note.content || '';
      const generated = await window.geminiService.generateQuiz({
        sourceContent: fullText,
        sourceTitle: note.title,
        subject: note.subject || 'General Study',
        difficulty: this.quizConfig.difficulty || 'MEDIUM',
        questionCount: count,
        quizMode: 'PRACTICE',
        language: 'ENGLISH',
        allowDemoFallback: false,
        onStatusUpdate: (status) => app.handleGenerationProgress(status)
      });

      const quizId = await saveNewQuiz({
        title: `${note.title} AI Practice Drill`,
        subject: note.subject,
        difficulty: this.quizConfig.difficulty || 'MEDIUM',
        quizMode: 'PRACTICE',
        language: 'ENGLISH',
        sourceType: 'TEXT_NOTES',
        sourceTitle: note.title
      }, generated.questions);

      // Record quiz ID in note
      if (!note.quizzes) note.quizzes = [];
      note.quizzes.push(quizId);
      await updateNote(note.id, { quizzes: note.quizzes });

      if (overlay) overlay.classList.remove('active');
      if (window.audioEngine) window.audioEngine.playFanfare();
      app.showToast('AI Quiz formulated from your textbook!', 'success');
      app.startQuiz(quizId);
    } catch (err) {
      console.error(err);
      if (overlay) overlay.classList.remove('active');
      app.showToast(`Quiz generation failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // PDF EXPORT INTEGRATION
  // =========================================================================
  toggleExportMenu() {
    const menu = document.getElementById('export-dropdown-menu');
    if (menu) {
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
      if (window.audioEngine) window.audioEngine.playClick();
      if (!isVisible && window.app) window.app.refreshIcons();
    }
  }

  exportStudyNotesPdf(noteId) {
    const note = this.notes.find(n => n.id === noteId) || this.activeNote;
    if (note && window.pdfGenerator) {
      if (window.audioEngine) window.audioEngine.playClick();
      app.showToast('Generating professional Study Notes Booklet PDF...', 'info');
      window.pdfGenerator.exportStudyNotesBookletPdf(note);
    }
  }

  exportSummarySheetPdf(noteId) {
    const note = this.notes.find(n => n.id === noteId) || this.activeNote;
    if (note && window.pdfGenerator) {
      if (window.audioEngine) window.audioEngine.playClick();
      app.showToast('Generating 1-Page Summary Cheat-Sheet PDF...', 'info');
      window.pdfGenerator.exportSummarySheetPdf(note);
    }
  }

  async exportPrintableQuizPrompt(noteId) {
    const note = this.notes.find(n => n.id === noteId) || this.activeNote;
    if (!note) return;

    if (window.audioEngine) window.audioEngine.playClick();
    app.showToast('Synthesizing questions for printable exam paper...', 'info');

    try {
      const fullText = note.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || note.content || '';
      const generated = await window.geminiService.generateQuiz({
        sourceContent: fullText,
        sourceTitle: note.title,
        subject: note.subject,
        difficulty: 'MEDIUM',
        questionCount: 10,
        quizMode: 'EXAM',
        language: 'ENGLISH',
        allowDemoFallback: true
      });

      window.pdfGenerator.exportPrintableQuizPdf({ title: `${note.title} Examination Paper` }, generated.questions);
    } catch (e) {
      app.showToast(`Printable quiz error: ${e.message}`, 'error');
    }
  }

  // =========================================================================
  // EDIT & AUTO-SAVE LOGIC
  // =========================================================================
  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
    if (!this.isEditMode) {
      app.showToast('Changes auto-saved to your personal vault! ✓', 'success');
    }
  }

  onSectionTextEdit(secId, newText) {
    if (!this.activeNote || !this.activeNote.sections) return;
    const sec = this.activeNote.sections.find(s => s.id === secId);
    if (sec) {
      sec.content = newText;
      this.triggerAutoSave();
    }
  }

  updateActiveNoteTitle(newTitle) {
    if (!this.activeNote || !newTitle.trim()) return;
    this.activeNote.title = newTitle.trim();
    this.triggerAutoSave();
  }

  triggerAutoSave() {
    this.autoSaveStatus = 'Saving...';
    const badge = document.getElementById('auto-save-status-badge');
    if (badge) badge.textContent = this.autoSaveStatus;

    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(async () => {
      try {
        await updateNote(this.activeNote.id, {
          title: this.activeNote.title,
          sections: this.activeNote.sections
        });
        this.autoSaveStatus = 'Saved ✓';
        if (badge) badge.textContent = this.autoSaveStatus;
      } catch (e) {
        this.autoSaveStatus = 'Save failed';
        if (badge) badge.textContent = this.autoSaveStatus;
      }
    }, 800);
  }

  // =========================================================================
  // SCROLLSPY & FOCUS MODE
  // =========================================================================
  initScrollspyListener() {
    window.onscroll = () => {
      if (this.currentViewMode !== 'READER') return;

      // Update Reading Progress Fill Bar
      const winHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = winHeight > 0 ? Math.min(100, Math.max(0, (window.scrollY / winHeight) * 100)) : 0;
      const fillEl = document.getElementById('reading-progress-fill');
      if (fillEl) fillEl.style.width = `${progress}%`;

      // Update Active TOC link
      const sections = this.activeNote?.sections || [];
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180 && rect.bottom >= 180) {
            if (this.activeTOCSectionId !== s.id) {
              this.activeTOCSectionId = s.id;
              document.querySelectorAll('.toc-link-item').forEach(link => {
                link.classList.toggle('active', link.textContent.includes(s.heading));
              });
            }
            break;
          }
        }
      }
    };
  }

  scrollToSection(secId) {
    this.activeTOCSectionId = secId;
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  toggleFocusMode() {
    this.isFocusMode = !this.isFocusMode;
    document.body.classList.toggle('in-textbook-focus-mode', this.isFocusMode);
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
    app.showToast(this.isFocusMode ? 'Focus Mode Activated: Distraction-free textbook reading.' : 'Focus Mode Exited.', 'info');
  }

  // =========================================================================
  // NAVIGATION & CRUD ACTIONS
  // =========================================================================
  openCreateNoteModal() {
    this.currentViewMode = 'CREATE';
    this.newTopic = '';
    this.newSubject = 'Indian Polity';
    this.isCustomSubject = false;
    this.customSubject = '';
    this.newFiles = [];
    this.manualText = '';
    this.isCreating = false;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleCustomSubjectMode() {
    this.isCustomSubject = !this.isCustomSubject;
    this.render();
    if (this.isCustomSubject) {
      setTimeout(() => {
        const inp = document.getElementById('create-input-custom-subject');
        if (inp) inp.focus();
      }, 50);
    }
  }

  onSubjectSelectChange(val) {
    if (val === 'CUSTOM') {
      this.isCustomSubject = true;
      this.render();
      setTimeout(() => {
        const inp = document.getElementById('create-input-custom-subject');
        if (inp) inp.focus();
      }, 50);
    } else {
      this.isCustomSubject = false;
      this.newSubject = val;
    }
  }

  closeCreateView() {
    this.currentViewMode = 'DASHBOARD';
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async openNote(noteId) {
    const idNum = Number(noteId);
    if (!idNum) return;

    // Ensure the main study-notes view is active in app router
    if (window.app) {
      if (window.app.currentView !== 'study-notes') {
        window.app.navigate('study-notes', { id: idNum }, true);
        return;
      } else {
        try {
          history.replaceState(null, '', `#study-notes?id=${idNum}`);
        } catch(e) {}
      }
    }

    this.currentViewMode = 'READER';
    this.activeNoteId = idNum;
    this.isFocusMode = false;
    this.isEditMode = false;
    this.isAskAiOpen = false; // Strictly hide Ask AI drawer by default
    this.activeTOCSectionId = null;
    this.askAiMessages = [];
    await this.render();
    if (window.audioEngine) window.audioEngine.playClick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToDashboard() {
    this.currentViewMode = 'DASHBOARD';
    this.activeNoteId = null;
    this.activeNote = null;
    this.isAskAiOpen = false; // Strictly hide Ask AI drawer
    document.body.classList.remove('in-textbook-focus-mode');
    this.render();
    if (window.audioEngine) window.audioEngine.playTabSwitch();
  }

  // Multi-file selection & drag drop
  handleDragOver(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('dragover');
  }

  handleDragLeave(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dragover');
  }

  handleMultiDrop(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) {
      this.onMultiFilesSelected(e.dataTransfer.files);
    }
  }

  onMultiFilesSelected(fileList) {
    if (!fileList || fileList.length === 0) return;
    for (const f of fileList) {
      this.newFiles.push({
        file: f,
        name: f.name,
        size: f.size,
        type: f.name.endsWith('.pdf') ? 'PDF' : 'IMAGE'
      });
      if (!this.newTopic) {
        this.newTopic = f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
      }
    }
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  removeAttachedFile(idx) {
    this.newFiles.splice(idx, 1);
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // Trigger Creation: Extract & Structure with AI
  async triggerCreateStructuredNote() {
    const topic = (this.newTopic || '').trim();
    if (!topic) {
      app.showToast('Please enter a Topic or Chapter Title.', 'error');
      return;
    }

    if (this.newFiles.length === 0 && !this.manualText.trim()) {
      app.showToast('Please upload a PDF / Image or paste study text.', 'error');
      return;
    }

    if (window.audioEngine) window.audioEngine.playClick();
    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.classList.add('active');

    // Reset batch progress card
    const batchCard = document.getElementById('batch-progress-card');
    if (batchCard) batchCard.style.display = 'flex';
    const batchFill = document.getElementById('batch-progress-fill');
    if (batchFill) batchFill.style.width = '8%';
    const batchPills = document.getElementById('batch-pills-container');
    if (batchPills) batchPills.innerHTML = '';

    app.handleGenerationProgress({
      message: 'Reading & parsing uploaded study material...',
      badgeText: 'Document Ingestion',
      countText: 'Extracting source text & formulas...',
      percent: 8,
      showBatchCard: true,
      stepId: 'step-reading'
    });

    this.isCreating = true;

    try {
      let combinedSourceText = this.manualText || '';

      // Extract text from attached files
      for (let fIdx = 0; fIdx < this.newFiles.length; fIdx++) {
        const item = this.newFiles[fIdx];
        if (item.type === 'PDF') {
          app.handleGenerationProgress({
            message: `Reading PDF document: "${item.name}"...`,
            badgeText: 'PDF Parser',
            countText: `Extracting all pages for file ${fIdx + 1} of ${this.newFiles.length}...`,
            percent: Math.round(10 + (fIdx / this.newFiles.length) * 10),
            showBatchCard: true,
            stepId: 'step-reading'
          });
          const meta = await window.pdfExtractor.loadPdfFile(item.file);
          const totalPages = meta.pageCount || 1;
          const res = await window.pdfExtractor.extractTextFromPageRange(1, totalPages, (cur, tot) => {
            app.handleGenerationProgress({
              message: `Extracting pages from "${item.name}": Page ${cur} of ${tot}...`,
              badgeText: 'PDF Extraction',
              countText: `${Math.round((cur / tot) * 100)}% of document extracted`,
              percent: Math.round(10 + (cur / tot) * 15),
              showBatchCard: true,
              stepId: 'step-reading'
            });
          });
          combinedSourceText += `\n\n--- [DOCUMENT: ${item.name}] ---\n${res.text}\n`;
        } else if (item.type === 'IMAGE') {
          app.handleGenerationProgress({
            message: `Transcribing notes via Gemini Vision AI: "${item.name}"...`,
            badgeText: 'Vision AI OCR',
            countText: `Deciphering text ${fIdx + 1} of ${this.newFiles.length}...`,
            percent: Math.round(10 + (fIdx / this.newFiles.length) * 10),
            showBatchCard: true,
            stepId: 'step-reading'
          });
          const base64Data = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(item.file);
          });
          const transcribed = await window.geminiService.extractTextFromImage({
            base64Data,
            mimeType: item.file.type || 'image/jpeg'
          });
          combinedSourceText += `\n\n--- [PHOTO NOTE: ${item.name}] ---\n${transcribed}\n`;
        }
      }

      const effectiveSubject = (this.isCustomSubject ? (this.customSubject.trim() || 'General Study') : (this.newSubject.trim() || 'General Study'));

      // Call Gemini Service to structure digital textbook note
      const structuredBook = await window.geminiService.generateStructuredStudyBook({
        topic,
        subject: effectiveSubject,
        rawText: combinedSourceText,
        files: this.newFiles,
        onProgress: (status) => {
          app.handleGenerationProgress(status);
        }
      });
      structuredBook.subject = effectiveSubject;

      // Preserve original source explicitly
      structuredBook.originalSource = {
        text: combinedSourceText,
        files: this.newFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
        importedAt: new Date().toISOString()
      };

      // Guarantee authentic 40% Deep-Dive Summary is present before saving
      if (!structuredBook.summary || !structuredBook.summary.sectionBreakdowns || structuredBook.summary.sectionBreakdowns.length === 0) {
        structuredBook.summary = window.geminiService.generateFallbackComprehensiveSummary({
          title: structuredBook.title,
          subject: structuredBook.subject,
          sections: structuredBook.sections || [],
          content: combinedSourceText
        });
      }

      // Save structured note to IndexedDB
      const noteId = await saveNewNote(structuredBook);

      app.handleGenerationProgress({
        message: 'Digital Textbook Ready! ✨',
        badgeText: 'Complete',
        countText: '100% Progress • Opening your study note...',
        percent: 100,
        showBatchCard: true,
        stepId: 'step-crafting',
        completedStepId: 'step-crafting'
      });

      await new Promise(r => setTimeout(r, 400));
      if (overlay) overlay.classList.remove('active');

      this.isCreating = false;
      this.newFiles = [];
      this.manualText = '';
      if (window.audioEngine) window.audioEngine.playFanfare();
      app.showToast('Digital Textbook Study Note Ready! ✨', 'success');

      // Open directly in reading view!
      await this.openNote(noteId);

    } catch (err) {
      console.error('Note creation failed:', err);
      if (overlay) overlay.classList.remove('active');
      this.isCreating = false;
      this.render();
      app.showToast(`Creation error: ${err.message}`, 'error');
    }
  }

  // Duplicate / Star / Rename / Delete
  async duplicateNote(noteId) {
    const idNum = Number(noteId);
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    try {
      const newId = await duplicateNote(idNum);
      app.showToast('Textbook duplicated successfully!', 'success');
      if (window.audioEngine) window.audioEngine.playFanfare();
      await this.render();
    } catch (e) {
      app.showToast(`Could not duplicate note: ${e.message}`, 'error');
    }
  }

  async toggleFavorite(noteId) {
    const idNum = Number(noteId);
    const isFav = await toggleFavoriteNote(idNum);
    app.showToast(isFav ? '⭐ Starred for quick revision!' : 'Removed from favorites.', 'info');
    await this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async renameNotePrompt(noteId) {
    const idNum = Number(noteId);
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    const note = (this.notes || []).find(n => Number(n.id) === idNum) || this.activeNote;
    if (!note) return;

    const newTitle = prompt('Enter new note title:', note.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== note.title) {
      await renameNote(idNum, newTitle.trim());
      app.showToast('Textbook renamed successfully.', 'success');
      if (window.audioEngine) window.audioEngine.playClick();
      await this.render();
    }
  }

  deleteNoteConfirm(noteId) {
    const idNum = Number(noteId);
    // Close card menu if open
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    const note = (this.notes || []).find(n => Number(n.id) === idNum) || this.activeNote;
    const title = note ? note.title : 'this note';

    app.showConfirmation({
      title: 'Delete Study Textbook',
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      confirmText: 'Delete Note',
      onConfirm: async () => {
        try {
          await deleteNote(idNum);
          app.showToast('Textbook deleted from vault.', 'info');
          if (window.audioEngine) window.audioEngine.playClick();

          // If deleting currently open note in READER mode, navigate back to Dashboard
          if (this.currentViewMode === 'READER' && Number(this.activeNoteId) === idNum) {
            this.currentViewMode = 'DASHBOARD';
            this.activeNoteId = null;
            this.activeNote = null;
          }

          await this.render();
        } catch (err) {
          console.error('Delete note failed:', err);
          app.showToast(`Failed to delete note: ${err.message}`, 'error');
        }
      }
    });
  }

  toggleCardMenu(noteId) {
    const idNum = Number(noteId);
    // Hide all other card menus first
    document.querySelectorAll('[id^="card-menu-"]').forEach(el => {
      if (el.id !== `card-menu-${idNum}`) el.style.display = 'none';
    });

    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) {
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
      if (window.audioEngine) window.audioEngine.playClick();
      if (!isVisible && window.app) window.app.refreshIcons();
    }
  }

  // Search & Filters
  onSearchInput(q) {
    this.searchQuery = q;
    this.render();
  }

  clearSearch() {
    this.searchQuery = '';
    this.render();
  }

  setSubjectFilter(subj) {
    this.activeSubjectFilter = subj;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setSortBy(val) {
    this.sortBy = val;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleFavoritesFilter() {
    this.showOnlyFavorites = !this.showOnlyFavorites;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // Starter Samples
  async loadSamplePreset(type) {
    if (type === 'POLITY') {
      const sample = window.geminiService.generateStructuredFallbackNote({
        topic: 'Fundamental Rights (Articles 12 to 35)',
        subject: 'Indian Polity',
        rawText: `PART III OF THE INDIAN CONSTITUTION: FUNDAMENTAL RIGHTS (ARTICLES 12 TO 35)\n\nKnown as the Magna Carta of India. Justiciable under Article 32 (Supreme Court) and Article 226 (High Courts).\n\nKey Rights: Right to Equality (Arts 14-18), Right to Freedom (Arts 19-22), Right against Exploitation (Arts 23-24), Right to Freedom of Religion (Arts 25-28), Cultural & Educational Rights (Arts 29-30), Right to Constitutional Remedies (Art 32).\n\nWrits: Habeas Corpus, Mandamus, Prohibition, Certiorari, Quo-Warranto.`
      });
      const noteId = await saveNewNote(sample);
      app.showToast('Sample Polity Textbook loaded!', 'success');
      this.openNote(noteId);
    } else if (type === 'SCIENCE') {
      const sample = window.geminiService.generateStructuredFallbackNote({
        topic: 'Cell Biology: Ultrastructure & ATP Synthesis',
        subject: 'Science & Tech',
        rawText: `CELL BIOLOGY & MITOCHONDRIAL RESPIRATION\n\nMitochondria: Powerhouse of the cell, double membrane bound with circular DNA and 70S ribosomes. Site of Krebs cycle and oxidative phosphorylation.\n\nATP Synthesis occurs via F0-F1 ATP synthases across inner mitochondrial membrane.\n\nDNA Structure: Watson & Crick double helix model. Adenine pairs with Thymine (2 H-bonds); Guanine pairs with Cytosine (3 H-bonds).`
      });
      const noteId = await saveNewNote(sample);
      app.showToast('Sample Biology Textbook loaded!', 'success');
      this.openNote(noteId);
    }
  }

  // Utilities — delegate to the shared helpers so escaping rules stay in one
  // place. The previous local escapeJs() missed backslashes and newlines, which
  // let user-selected text break out of the inline onclick string it was
  // interpolated into (see UIUtils.escapeJs for the details).
  escapeHtml(str) {
    return UIUtils.escapeHtml(str);
  }

  escapeRegex(str) {
    return UIUtils.escapeRegex(str);
  }

  escapeJs(str) {
    return UIUtils.escapeJs(str);
  }
}

window.studyNotesView = new StudyNotesView();
