/**
 * HAMSA VIDYA (हंस विद्या) — Professional Education & Document Utilities Studio
 * 100% Fully Functional Client-Side Tools:
 * 1. Image Compressor (Auto-target KB binary search, quality/scale sliders, split comparison)
 * 2. Image Resizer (Exact WxH, aspect lock, 90° rotation, flip, canvas padding, exam DPI presets)
 * 3. PDF Merger (Multi-file upload, reorder, per-file page ranges, optional page numbers)
 * 4. PDF Splitter (Visual thumbnail page selector grid, syntax range parser, 1-click presets)
 * 5. PDF Compressor (B&W high-contrast scanner filter, DPI scale, multi-page rasterization)
 * 6. Images to PDF (1, 2 or 4 photos per page, orientation, margin, scan contrast booster)
 * 7. Word & Essay Counter (UPSC 150/250w limits, Flesch readability score, voice dictation, speech playback)
 * 8. Study Pomodoro (Synthesized 40Hz Gamma binaural beats, gentle rain sound, subject logging, Zen mode)
 * 9. Exam Cutoff & CGPA Calculator (UPSC/SSC negative marking, accuracy %, CBSE/VTU CGPA converter)
 * 10. Notes to A4 Formatter (Print-ready A4 PDF with watermark, headers, and clean typography)
 */

class ToolsView {
  constructor() {
    this.viewMode = 'hub'; // 'hub' (all tools grid) or 'tool' (workbench)
    this.activeTool = 'image-compressor';
    this.activeCategory = 'all'; // 'all', 'image', 'pdf', 'writing', 'productivity'
    this.searchQuery = '';
    this.container = document.getElementById('view-tools');

    // Web Audio Synthesizer State for Pomodoro Ambient Focus Sounds
    this.audioCtx = null;
    this.binauralNodes = null;
    this.rainNodes = null;
    this.activeSoundscape = 'none'; // 'none', 'binaural', 'rain'
    this.soundVolume = 0.35;

    // Speech Recognition State for Word Counter
    this.recognition = null;
    this.isDictating = false;

    // Pomodoro Timer State
    this.pomodoroInterval = null;
    this.pomodoroState = {
      mode: 'focus', // 'focus' (25m), 'short-break' (5m), 'long-break' (15m)
      timeLeft: 25 * 60,
      totalTime: 25 * 60,
      isRunning: false,
      completedSessions: parseInt(localStorage.getItem('hamsa_pomo_completed') || '0', 10),
      currentSubject: 'General Studies'
    };

    // Tool State Caches
    this.imgCompressState = {
      file: null, img: null, origSize: 0, origW: 0, origH: 0,
      resultBlob: null, resultUrl: null, targetKb: 0
    };

    this.imgResizeState = {
      file: null, img: null, origW: 0, origH: 0, targetW: 0, targetH: 0,
      lockRatio: true, rotation: 0, flipH: false, flipV: false,
      bgColor: '#FFFFFF', resultBlob: null, resultUrl: null
    };

    this.pdfMergeState = { items: [] };
    this.pdfSplitState = {
      file: null, pdfDoc: null, totalPages: 0, arrayBuffer: null,
      selectedPages: new Set()
    };
    this.pdfCompressState = { file: null, totalPages: 0, isCompressing: false };
    this.imgToPdfState = { items: [], layout: '1-per-page', filter: 'none' };
    this.wordCounterState = { text: '', targetWordGoal: 150 };

    this.examCalcState = {
      totalQ: 100, attempted: 85, correct: 72,
      markPerCorrect: 2.0, penaltyPerWrong: 0.66
    };

    this.cgpaState = {
      cgpa: 8.5, formula: 'cbse' // 'cbse', 'vtu', 'mumbai', 'direct'
    };

    this.notesDocState = {
      title: 'UPSC Civil Services — Modern History Quick Notes',
      watermark: 'HAMSA VIDYA • STUDY USE ONLY',
      content: ''
    };

    // 10 Curated Educational Utilities Catalog
    this.toolsCatalog = [
      {
        id: 'image-compressor',
        category: 'image',
        icon: 'minimize-2',
        title: 'Smart Image Compressor',
        badge: 'Exact KB Target',
        badgeType: 'emerald',
        desc: 'Compress photos & signatures to under 50KB or 100KB with automatic binary-search target KB optimization and before/after comparison.',
        gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
      },
      {
        id: 'image-resizer',
        category: 'image',
        icon: 'scaling',
        title: 'Image Resizer & Exam Photo Prep',
        badge: 'Rotate & DPI Presets',
        badgeType: 'blue',
        desc: 'Exact pixel dimensions, 90° rotation, canvas padding, aspect ratio lock, and official UPSC/SSC passport photo presets.',
        gradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
      },
      {
        id: 'pdf-merger',
        category: 'pdf',
        icon: 'combine',
        title: 'Vector PDF Merger',
        badge: 'Page Range & Numbering',
        badgeType: 'purple',
        desc: 'Combine multiple PDFs with drag-and-drop reordering, selective page ranges per file, and optional bottom page numbering.',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
      },
      {
        id: 'pdf-splitter',
        category: 'pdf',
        icon: 'scissors',
        title: 'Visual PDF Splitter & Extractor',
        badge: 'Visual Page Grid',
        badgeType: 'rose',
        desc: 'Extract chapters or pages with a visual thumbnail grid (click pages to select) and 1-click odd/even/half split presets.',
        gradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
      },
      {
        id: 'pdf-compressor',
        category: 'pdf',
        icon: 'archive',
        title: 'Smart PDF Document Compressor',
        badge: 'B&W Scan Filter',
        badgeType: 'amber',
        desc: 'Shrink textbook scans and heavy PDF notes up to 80% with DPI controls and a high-contrast black & white scan enhancer.',
        gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
      },
      {
        id: 'images-to-pdf',
        category: 'pdf',
        icon: 'file-image',
        title: 'Photos & Scans to A4 PDF',
        badge: '1, 2, 4 Per Page',
        badgeType: 'teal',
        desc: 'Compile photos of handwritten lecture notes into clean A4 PDFs with multi-photo grid layouts and paper shadow removal.',
        gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
      },
      {
        id: 'word-counter',
        category: 'writing',
        icon: 'file-text',
        title: 'UPSC Essay & Word Limit Tracker',
        badge: 'Speech-to-Text & NLP',
        badgeType: 'indigo',
        desc: 'Live word limits for UPSC 150/250w answers, Flesch readability grade, keyword repetition detector, and voice dictation.',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)'
      },
      {
        id: 'pomodoro-timer',
        category: 'productivity',
        icon: 'clock',
        title: 'Deep Study Pomodoro & Soundscapes',
        badge: 'Binaural & Rain Audio',
        badgeType: 'emerald',
        desc: '25m focus timer with synthesized 40Hz Gamma binaural beats, gentle rain soundscape, subject tagging & Zen mode.',
        gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)'
      },
      {
        id: 'exam-calculator',
        category: 'productivity',
        icon: 'calculator',
        title: 'Exam Cutoff & CGPA Calculator',
        badge: 'Negative Marking',
        badgeType: 'cyan',
        desc: 'Calculate UPSC/SSC negative marking deductions, net marks, accuracy %, and instant University CGPA to Percentage conversions.',
        gradient: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)'
      },
      {
        id: 'notes-to-pdf',
        category: 'writing',
        icon: 'printer',
        title: 'Notes & Markdown A4 Formatter',
        badge: 'Print-Ready A4',
        badgeType: 'purple',
        desc: 'Paste study summaries or formula cheat-sheets and export formatted A4 PDFs with watermarks, custom headers & clean margins.',
        gradient: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
      }
    ];
  }

  // Format bytes to human readable
  formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatTimerTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  onLeaveView() {
    this.stopAmbientSound();
    if (this.recognition && this.isDictating) {
      this.recognition.stop();
      this.isDictating = false;
    }
  }

  render(requestedTool = null) {
    this.container = document.getElementById('view-tools');
    if (!this.container) return;

    if (requestedTool) {
      this.viewMode = 'tool';
      this.activeTool = requestedTool;
    }

    if (this.viewMode === 'hub') {
      this.renderToolsHub();
    } else {
      this.renderToolWorkbench();
    }
  }

  // =========================================================================
  // VIEW 1: TOOLS HUB (Master Catalog Dashboard)
  // =========================================================================
  renderToolsHub() {
    this.viewMode = 'hub';

    const filteredTools = this.toolsCatalog.filter(t => {
      const matchCat = this.activeCategory === 'all' || t.category === this.activeCategory;
      const q = this.searchQuery.toLowerCase().trim();
      const matchQuery = !q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.badge.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    // Counts come from the catalogue itself, so they can never drift from the
    // tools actually shipped — the category labels used to hard-code them.
    const categoryCount = new Set(this.toolsCatalog.map(t => t.category).filter(Boolean)).size;

    const heroHtml = UIUtils.buildViewHero({
      accent: 'cyan',
      icon: 'wrench',
      eyebrow: '100% client-side · nothing uploaded',
      title: 'Exam paperwork,',
      titleAccent: 'handled offline.',
      hindi: 'उपकरण — फ़ाइलें आपके ब्राउज़र में ही रहती हैं',
      tagline: 'Image, PDF, writing and focus utilities built for form-filling and revision. Every file is processed in this browser tab and never leaves your device.',
      stats: [
        { value: this.toolsCatalog.length, label: 'Utilities' },
        { value: categoryCount, label: 'Categories' },
        { value: '0', label: 'Files uploaded' }
      ],
      chipsLabel: 'Built for',
      chips: [
        { icon: 'image', label: 'Photo & signature specs', hint: 'Resize and compress to exact form limits' },
        { icon: 'file-text', label: 'PDF merge, split, compress', hint: 'Assemble application documents' },
        { icon: 'timer', label: 'Focus & timing', hint: 'Pomodoro and exam-pace timers' },
        { icon: 'calculator', label: 'Quick calculators', hint: 'Percentage, age and marks maths' }
      ]
    });

    this.container.innerHTML = `
      <div class="tools-studio-wrapper">
        ${heroHtml}
        <header class="tools-hero-header tools-hero-controls-only">
          <div class="tools-hero-inner">
            <!-- Search Bar & Category Filters -->
            <div class="tools-hub-controls">
              <div class="tools-search-box">
                <i data-lucide="search"></i>
                <input type="text" id="tools-search-input" placeholder="Search utilities (e.g. compress, merge, upsc, resize, audio)..." value="${this.searchQuery}">
                ${this.searchQuery ? '<button class="tools-search-clear" onclick="toolsView.clearSearch()">&times;</button>' : ''}
              </div>

              <div class="tools-category-filters" role="tablist">
                <button class="cat-filter-btn ${this.activeCategory === 'all' ? 'active' : ''}" onclick="toolsView.setCategory('all')">
                  <i data-lucide="sparkles"></i> All Tools (${this.toolsCatalog.length})
                </button>
                <button class="cat-filter-btn ${this.activeCategory === 'image' ? 'active' : ''}" onclick="toolsView.setCategory('image')">
                  <i data-lucide="image"></i> Image Studio (2)
                </button>
                <button class="cat-filter-btn ${this.activeCategory === 'pdf' ? 'active' : ''}" onclick="toolsView.setCategory('pdf')">
                  <i data-lucide="file-text"></i> PDF Suite (4)
                </button>
                <button class="cat-filter-btn ${this.activeCategory === 'writing' ? 'active' : ''}" onclick="toolsView.setCategory('writing')">
                  <i data-lucide="pen-tool"></i> Writing & Notes (2)
                </button>
                <button class="cat-filter-btn ${this.activeCategory === 'productivity' ? 'active' : ''}" onclick="toolsView.setCategory('productivity')">
                  <i data-lucide="clock"></i> Focus & Calc (2)
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- Tools Bento Cards Grid -->
        <div class="tools-bento-grid">
          ${filteredTools.length > 0 ? filteredTools.map(tool => `
            <div class="tool-bento-card" onclick="toolsView.openTool('${tool.id}')">
              <div class="bento-card-top">
                <div class="bento-icon-badge" style="background:${tool.gradient};">
                  <i data-lucide="${tool.icon}"></i>
                </div>
                <span class="bento-badge ${tool.badgeType}">${tool.badge}</span>
              </div>
              <h3 class="bento-card-title">${tool.title}</h3>
              <p class="bento-card-desc">${tool.desc}</p>
              <div class="bento-card-footer">
                <span class="launch-link">
                  <span>Open Tool</span>
                  <i data-lucide="arrow-right"></i>
                </span>
              </div>
            </div>
          `).join('') : `
            <div class="tools-empty-state">
              <i data-lucide="search-x" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:1rem;"></i>
              <h3>No matching tools found for "${this.searchQuery}"</h3>
              <p>Try clearing your search query or selecting "All Tools".</p>
              <button class="btn btn-secondary btn-sm" onclick="toolsView.clearSearch()" style="margin-top:1rem;">Clear Search</button>
            </div>
          `}
        </div>
      </div>
    `;

    const searchInput = document.getElementById('tools-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.renderToolsHub();
      };
    }

    if (window.lucide) window.lucide.createIcons();
  }

  setCategory(cat) {
    if (window.audioEngine) window.audioEngine.playClick();
    this.activeCategory = cat;
    this.renderToolsHub();
  }

  clearSearch() {
    this.searchQuery = '';
    this.renderToolsHub();
  }

  openTool(toolId) {
    if (window.audioEngine) window.audioEngine.playClick();
    this.activeTool = toolId;
    this.viewMode = 'tool';
    this.renderToolWorkbench();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToHub() {
    if (window.audioEngine) window.audioEngine.playClick();
    this.stopAmbientSound();
    this.viewMode = 'hub';
    this.renderToolsHub();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // VIEW 2: ACTIVE TOOL WORKBENCH (Studio Mode)
  // =========================================================================
  renderToolWorkbench() {
    this.viewMode = 'tool';
    const currentToolMeta = this.toolsCatalog.find(t => t.id === this.activeTool) || this.toolsCatalog[0];

    this.container.innerHTML = `
      <div class="tools-studio-wrapper">
        <!-- Sticky Studio Navigation Bar -->
        <div class="tool-studio-topbar">
          <div class="studio-topbar-left">
            <button type="button" class="studio-back-btn" onclick="toolsView.backToHub()" title="Back to All Tools Hub">
              <i data-lucide="arrow-left"></i>
              <span>All Tools Hub</span>
            </button>
            <div class="studio-breadcrumbs">
              <span class="crumb-separator">/</span>
              <span class="crumb-active">${currentToolMeta.title}</span>
            </div>
          </div>

          <!-- Quick Jump Dropdown / Micro Switcher -->
          <div class="studio-topbar-right">
            <div class="tool-quick-dropdown-wrap">
              <label for="tool-quick-select"><i data-lucide="shuffle"></i> Switch Tool:</label>
              <select id="tool-quick-select" class="tool-quick-select" onchange="toolsView.openTool(this.value)">
                ${this.toolsCatalog.map(t => `
                  <option value="${t.id}" ${t.id === this.activeTool ? 'selected' : ''}>${t.title}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Tool Content Container -->
        <main id="tool-workspace-content">
          ${this.getActiveToolTemplate()}
        </main>
      </div>
    `;

    this.initActiveToolEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  getActiveToolTemplate() {
    switch (this.activeTool) {
      case 'image-compressor': return this.templateImageCompressor();
      case 'image-resizer': return this.templateImageResizer();
      case 'pdf-merger': return this.templatePdfMerger();
      case 'pdf-splitter': return this.templatePdfSplitter();
      case 'pdf-compressor': return this.templatePdfCompressor();
      case 'images-to-pdf': return this.templateImagesToPdf();
      case 'word-counter': return this.templateWordCounter();
      case 'pomodoro-timer': return this.templatePomodoro();
      case 'exam-calculator': return this.templateExamCalculator();
      case 'notes-to-pdf': return this.templateNotesToPdf();
      default: return `<div class="tool-card-container"><p>Tool under construction</p></div>`;
    }
  }

  initActiveToolEvents() {
    switch (this.activeTool) {
      case 'image-compressor': this.initImageCompressorEvents(); break;
      case 'image-resizer': this.initImageResizerEvents(); break;
      case 'pdf-merger': this.initPdfMergerEvents(); break;
      case 'pdf-splitter': this.initPdfSplitterEvents(); break;
      case 'pdf-compressor': this.initPdfCompressorEvents(); break;
      case 'images-to-pdf': this.initImagesToPdfEvents(); break;
      case 'word-counter': this.initWordCounterEvents(); break;
      case 'pomodoro-timer': this.initPomodoroEvents(); break;
      case 'exam-calculator': this.initExamCalcEvents(); break;
      case 'notes-to-pdf': this.initNotesToPdfEvents(); break;
    }
  }

  // =========================================================================
  // TOOL 1: SMART IMAGE COMPRESSOR (Auto-Target KB & Split Compare)
  // =========================================================================
  templateImageCompressor() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);">
              <i data-lucide="minimize-2"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Smart Image Compressor</h2>
              <p class="tool-card-subheading">Compress photos, signatures & certificates down to under 50KB or 100KB for UPSC, SSC & exam portals with exact KB auto-optimization.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="img-compress-dropzone">
          <input type="file" id="img-compress-file-input" accept="image/jpeg,image/png,image/webp,image/avif" style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="upload-cloud" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to browse or drop your image here</h3>
            <p class="dropzone-hint">Supports JPG, PNG, WEBP & AVIF (Up to 25MB)</p>
          </div>
        </div>

        <div id="img-compress-workbench" class="tool-workbench" style="display:none;">
          <div class="tool-two-col-grid">
            <!-- Controls Column -->
            <div class="tool-control-panel">
              <h3 class="panel-section-title"><i data-lucide="sliders"></i> Compression Controls</h3>
              
              <!-- Exact Target KB Auto-Mode -->
              <div class="target-kb-card">
                <div class="target-kb-header">
                  <span class="target-kb-title"><i data-lucide="target"></i> Auto-Optimize to Exact File Size</span>
                </div>
                <div class="target-kb-inputs-row">
                  <input type="number" id="img-compress-target-input" class="tool-input-num" placeholder="e.g. 45" min="5" max="10000">
                  <span class="kb-label">KB</span>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="toolsView.runAutoCompressToKb()">
                    <i data-lucide="wand-2"></i> Auto Compress
                  </button>
                </div>
                <div class="quick-preset-chips" style="margin-top:0.6rem;">
                  <button type="button" class="preset-chip" onclick="toolsView.setTargetKbAndRun(20)">Under 20 KB (Signature)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.setTargetKbAndRun(50)">Under 50 KB (UPSC Photo)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.setTargetKbAndRun(100)">Under 100 KB (SSC Photo)</button>
                </div>
              </div>

              <!-- Manual Quality Slider -->
              <div class="control-group" style="margin-top:1.25rem;">
                <div class="control-label-row">
                  <label for="img-compress-quality">Quality Compression</label>
                  <span class="control-value-badge" id="img-compress-quality-val">75%</span>
                </div>
                <input type="range" id="img-compress-quality" min="10" max="100" value="75" class="tool-slider">
                <div class="slider-ticks-row">
                  <span>Maximum Compression (10%)</span>
                  <span>Balanced (75%)</span>
                  <span>Ultra High (100%)</span>
                </div>
              </div>

              <!-- Max Dimension Scale Slider -->
              <div class="control-group" style="margin-top:1.25rem;">
                <div class="control-label-row">
                  <label for="img-compress-scale">Dimension Scale</label>
                  <span class="control-value-badge" id="img-compress-scale-val">100%</span>
                </div>
                <input type="range" id="img-compress-scale" min="20" max="100" value="100" step="5" class="tool-slider">
                <div class="slider-ticks-row">
                  <span>20% (Small)</span>
                  <span>50% (Half Size)</span>
                  <span>100% (Original)</span>
                </div>
              </div>

              <!-- Output Format -->
              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">Output Format</label>
                <div class="pill-radio-group" id="img-compress-format-group">
                  <button type="button" class="format-btn active" data-fmt="image/jpeg">JPEG (Universal)</button>
                  <button type="button" class="format-btn" data-fmt="image/webp">WEBP (Smallest)</button>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="workbench-action-row">
                <button id="img-compress-download-btn" class="btn btn-primary btn-lg" style="width:100%; display:flex; align-items:center; justify-content:center; gap:0.6rem;">
                  <i data-lucide="download"></i>
                  <span>Download Compressed Image</span>
                </button>
              </div>
            </div>

            <!-- Preview & Stats Comparison Column -->
            <div class="tool-preview-panel">
              <div class="stats-comparison-card">
                <div class="stat-box">
                  <span class="stat-label">Original Size</span>
                  <span class="stat-val original" id="img-compress-orig-size">0 KB</span>
                  <span class="stat-dim" id="img-compress-orig-dim">0 x 0</span>
                </div>
                <div class="stat-arrow"><i data-lucide="arrow-right"></i></div>
                <div class="stat-box">
                  <span class="stat-label">Compressed Size</span>
                  <span class="stat-val compressed" id="img-compress-new-size">0 KB</span>
                  <span class="stat-dim" id="img-compress-new-dim">0 x 0</span>
                </div>
                <div class="savings-badge-pill" id="img-compress-savings-badge">
                  -0% Saved
                </div>
              </div>

              <div class="image-preview-stage">
                <div class="preview-tag">Live Output Preview</div>
                <img id="img-compress-preview" class="preview-img-tag" alt="Compressed Preview">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initImageCompressorEvents() {
    const dropzone = document.getElementById('img-compress-dropzone');
    const fileInput = document.getElementById('img-compress-file-input');
    const qualitySlider = document.getElementById('img-compress-quality');
    const scaleSlider = document.getElementById('img-compress-scale');
    const downloadBtn = document.getElementById('img-compress-download-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleCompressImageFile(e.dataTransfer.files[0]);
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleCompressImageFile(e.target.files[0]);
    };

    if (qualitySlider) {
      qualitySlider.oninput = () => {
        document.getElementById('img-compress-quality-val').textContent = qualitySlider.value + '%';
        this.executeImageCompression();
      };
    }

    if (scaleSlider) {
      scaleSlider.oninput = () => {
        document.getElementById('img-compress-scale-val').textContent = scaleSlider.value + '%';
        this.executeImageCompression();
      };
    }

    document.querySelectorAll('#img-compress-format-group .format-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#img-compress-format-group .format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.executeImageCompression();
      };
    });

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        if (!this.imgCompressState.resultBlob) return;
        const activeFmt = document.querySelector('#img-compress-format-group .format-btn.active')?.getAttribute('data-fmt') || 'image/jpeg';
        const ext = activeFmt === 'image/webp' ? 'webp' : 'jpg';
        const rawName = this.imgCompressState.file ? this.imgCompressState.file.name.replace(/\.[^/.]+$/, "") : 'hamsa-compressed';
        UIUtils.downloadBlob(this.imgCompressState.resultBlob, `${rawName}-compressed.${ext}`);
        if (window.audioEngine) window.audioEngine.playCelebration();
        window.app && window.app.showToast('Compressed image downloaded successfully!', 'success');
      };
    }
  }

  handleCompressImageFile(file) {
    if (!file.type.startsWith('image/')) {
      window.app && window.app.showToast('Please upload a valid image file (JPG, PNG, WEBP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.imgCompressState = {
          file: file,
          img: img,
          origSize: file.size,
          origW: img.naturalWidth,
          origH: img.naturalHeight,
          resultBlob: null,
          resultUrl: null,
          targetKb: 0
        };

        const workbench = document.getElementById('img-compress-workbench');
        if (workbench) workbench.style.display = 'block';

        document.getElementById('img-compress-orig-size').textContent = this.formatBytes(file.size);
        document.getElementById('img-compress-orig-dim').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;

        this.executeImageCompression();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  executeImageCompression() {
    const { img, origW, origH, origSize } = this.imgCompressState;
    if (!img) return;

    const qualityVal = parseInt(document.getElementById('img-compress-quality')?.value || '75', 10) / 100;
    const scaleVal = parseInt(document.getElementById('img-compress-scale')?.value || '100', 10) / 100;
    const activeFmt = document.querySelector('#img-compress-format-group .format-btn.active')?.getAttribute('data-fmt') || 'image/jpeg';

    const targetW = Math.max(1, Math.round(origW * scaleVal));
    const targetH = Math.max(1, Math.round(origH * scaleVal));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    if (activeFmt === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.imgCompressState.resultBlob = blob;

      if (this.imgCompressState.resultUrl) {
        URL.revokeObjectURL(this.imgCompressState.resultUrl);
      }
      this.imgCompressState.resultUrl = URL.createObjectURL(blob);

      const previewEl = document.getElementById('img-compress-preview');
      if (previewEl) previewEl.src = this.imgCompressState.resultUrl;

      document.getElementById('img-compress-new-size').textContent = this.formatBytes(blob.size);
      document.getElementById('img-compress-new-dim').textContent = `${targetW} × ${targetH}`;

      const savingsPct = Math.round(((origSize - blob.size) / origSize) * 100);
      const badge = document.getElementById('img-compress-savings-badge');
      if (badge) {
        if (savingsPct >= 0) {
          badge.textContent = `-${savingsPct}% Saved`;
          badge.className = 'savings-badge-pill good';
        } else {
          badge.textContent = `+${Math.abs(savingsPct)}% Larger`;
          badge.className = 'savings-badge-pill warning';
        }
      }
    }, activeFmt, qualityVal);
  }

  setTargetKbAndRun(kb) {
    const input = document.getElementById('img-compress-target-input');
    if (input) input.value = kb;
    this.runAutoCompressToKb();
  }

  async runAutoCompressToKb() {
    const input = document.getElementById('img-compress-target-input');
    const targetKb = parseFloat(input?.value || '0');
    if (targetKb <= 0) {
      window.app && window.app.showToast('Please specify a target size in KB (e.g. 50)', 'warning');
      return;
    }

    const { img, origW, origH } = this.imgCompressState;
    if (!img) return;

    window.app && window.app.showToast(`Auto-optimizing to under ${targetKb} KB...`, 'info');

    const targetBytes = targetKb * 1024;
    const activeFmt = 'image/jpeg';
    let lowQ = 0.1, highQ = 0.95;
    let bestQuality = 0.75;
    let bestScale = 1.0;

    // Iterative binary search for optimal quality
    for (let iter = 0; iter < 6; iter++) {
      const testQ = (lowQ + highQ) / 2;
      const blob = await this.testCanvasBlob(img, origW * bestScale, origH * bestScale, testQ, activeFmt);
      if (blob.size <= targetBytes) {
        bestQuality = testQ;
        lowQ = testQ; // try higher quality
      } else {
        highQ = testQ; // reduce quality
      }
    }

    // Check if even lowest quality exceeds target -> scale dimensions down
    let testBlob = await this.testCanvasBlob(img, origW, origH, bestQuality, activeFmt);
    if (testBlob.size > targetBytes) {
      const scaleRatio = Math.sqrt(targetBytes / testBlob.size) * 0.92;
      bestScale = Math.max(0.2, Math.min(1.0, scaleRatio));
      bestQuality = 0.65;
    }

    const qSlider = document.getElementById('img-compress-quality');
    const sSlider = document.getElementById('img-compress-scale');
    if (qSlider) {
      qSlider.value = Math.round(bestQuality * 100);
      document.getElementById('img-compress-quality-val').textContent = qSlider.value + '%';
    }
    if (sSlider) {
      sSlider.value = Math.round(bestScale * 100);
      document.getElementById('img-compress-scale-val').textContent = sSlider.value + '%';
    }

    this.executeImageCompression();
    window.app && window.app.showToast(`Auto-optimized! Image compressed to fit within ${targetKb} KB.`, 'success');
  }

  testCanvasBlob(img, w, h, quality, fmt) {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, fmt, quality);
    });
  }

  // =========================================================================
  // TOOL 2: IMAGE RESIZER (Rotation, Flip, Exam Presets, Canvas Padding)
  // =========================================================================
  templateImageResizer() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
              <i data-lucide="scaling"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Image Dimension Resizer & Exam Prep</h2>
              <p class="tool-card-subheading">Resize photos, certificates & documents to exact pixel dimensions with 90° rotation, flip, canvas padding, and official exam presets.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="img-resize-dropzone">
          <input type="file" id="img-resize-file-input" accept="image/jpeg,image/png,image/webp,image/avif" style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="upload-cloud" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to browse or drop an image to resize</h3>
            <p class="dropzone-hint">Supports JPG, PNG, WEBP (Instant bicubic resampling)</p>
          </div>
        </div>

        <div id="img-resize-workbench" class="tool-workbench" style="display:none;">
          <div class="tool-two-col-grid">
            <!-- Resize Controls -->
            <div class="tool-control-panel">
              <h3 class="panel-section-title"><i data-lucide="crop"></i> Exact Dimensions (Pixels)</h3>

              <!-- Width & Height inputs -->
              <div class="dimension-inputs-row">
                <div class="input-field-group">
                  <label for="img-resize-w">Width (px)</label>
                  <input type="number" id="img-resize-w" min="10" max="10000" class="tool-input-num">
                </div>
                
                <button type="button" id="img-resize-lock-btn" class="aspect-lock-btn active" title="Toggle Aspect Ratio Lock">
                  <i data-lucide="link"></i>
                </button>

                <div class="input-field-group">
                  <label for="img-resize-h">Height (px)</label>
                  <input type="number" id="img-resize-h" min="10" max="10000" class="tool-input-num">
                </div>
              </div>

              <!-- Orientation, Rotation & Flip Controls -->
              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">Transform & Orientation</label>
                <div class="transform-actions-row">
                  <button type="button" class="tool-btn-sm" onclick="toolsView.rotateImage(-90)">
                    <i data-lucide="rotate-ccw"></i> Rotate 90° Left
                  </button>
                  <button type="button" class="tool-btn-sm" onclick="toolsView.rotateImage(90)">
                    <i data-lucide="rotate-cw"></i> Rotate 90° Right
                  </button>
                  <button type="button" class="tool-btn-sm" onclick="toolsView.toggleFlip('H')">
                    <i data-lucide="flip-horizontal"></i> Flip H
                  </button>
                  <button type="button" class="tool-btn-sm" onclick="toolsView.toggleFlip('V')">
                    <i data-lucide="flip-vertical"></i> Flip V
                  </button>
                </div>
              </div>

              <!-- Official Exam & Standard Presets -->
              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">Official Exam & Standard Presets</label>
                <div class="quick-preset-chips">
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(350, 450, false)">Passport Photo (350×450)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(300, 100, false)">Exam Signature (300×100)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(350, 350, false)">UPSC / SSC Photo (350×350)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(413, 531, false)">3.5 × 4.5 cm @ 300 DPI</button>
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(1920, 1080, false)">Full HD 1080p</button>
                  <button type="button" class="preset-chip" onclick="toolsView.applyDimensionPreset(500, 500, false)">Square Avatar (500×500)</button>
                </div>
              </div>

              <!-- Output Format -->
              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">Output Format</label>
                <div class="pill-radio-group" id="img-resize-format-group">
                  <button type="button" class="format-btn active" data-fmt="image/jpeg">JPEG</button>
                  <button type="button" class="format-btn" data-fmt="image/png">PNG</button>
                  <button type="button" class="format-btn" data-fmt="image/webp">WEBP</button>
                </div>
              </div>

              <!-- Download Button -->
              <div class="workbench-action-row">
                <button id="img-resize-download-btn" class="btn btn-primary btn-lg" style="width:100%; display:flex; align-items:center; justify-content:center; gap:0.6rem;">
                  <i data-lucide="download"></i>
                  <span>Download Resized Image</span>
                </button>
              </div>
            </div>

            <!-- Preview Column -->
            <div class="tool-preview-panel">
              <div class="stats-comparison-card">
                <div class="stat-box">
                  <span class="stat-label">Original</span>
                  <span class="stat-val original" id="img-resize-orig-dim">0 × 0</span>
                  <span class="stat-dim" id="img-resize-orig-bytes">0 KB</span>
                </div>
                <div class="stat-arrow"><i data-lucide="arrow-right"></i></div>
                <div class="stat-box">
                  <span class="stat-label">Resized</span>
                  <span class="stat-val compressed" id="img-resize-new-dim">0 × 0</span>
                  <span class="stat-dim" id="img-resize-new-bytes">0 KB</span>
                </div>
              </div>

              <div class="image-preview-stage">
                <div class="preview-tag">Live Resized Output</div>
                <img id="img-resize-preview" class="preview-img-tag" alt="Resized Preview">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initImageResizerEvents() {
    const dropzone = document.getElementById('img-resize-dropzone');
    const fileInput = document.getElementById('img-resize-file-input');
    const widthInput = document.getElementById('img-resize-w');
    const heightInput = document.getElementById('img-resize-h');
    const lockBtn = document.getElementById('img-resize-lock-btn');
    const downloadBtn = document.getElementById('img-resize-download-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleResizeImageFile(e.dataTransfer.files[0]);
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleResizeImageFile(e.target.files[0]);
    };

    if (lockBtn) {
      lockBtn.onclick = () => {
        this.imgResizeState.lockRatio = !this.imgResizeState.lockRatio;
        lockBtn.classList.toggle('active', this.imgResizeState.lockRatio);
        lockBtn.innerHTML = this.imgResizeState.lockRatio ? '<i data-lucide="link"></i>' : '<i data-lucide="unlink"></i>';
        if (window.lucide) window.lucide.createIcons();
      };
    }

    if (widthInput && heightInput) {
      widthInput.oninput = () => {
        const w = parseInt(widthInput.value, 10);
        if (w > 0) {
          this.imgResizeState.targetW = w;
          if (this.imgResizeState.lockRatio && this.imgResizeState.origW > 0) {
            const ratio = this.imgResizeState.origH / this.imgResizeState.origW;
            const h = Math.round(w * ratio);
            this.imgResizeState.targetH = h;
            heightInput.value = h;
          }
          this.executeImageResizing();
        }
      };

      heightInput.oninput = () => {
        const h = parseInt(heightInput.value, 10);
        if (h > 0) {
          this.imgResizeState.targetH = h;
          if (this.imgResizeState.lockRatio && this.imgResizeState.origH > 0) {
            const ratio = this.imgResizeState.origW / this.imgResizeState.origH;
            const w = Math.round(h * ratio);
            this.imgResizeState.targetW = w;
            widthInput.value = w;
          }
          this.executeImageResizing();
        }
      };
    }

    document.querySelectorAll('#img-resize-format-group .format-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#img-resize-format-group .format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.executeImageResizing();
      };
    });

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        if (!this.imgResizeState.resultBlob) return;
        const activeFmt = document.querySelector('#img-resize-format-group .format-btn.active')?.getAttribute('data-fmt') || 'image/jpeg';
        let ext = 'jpg';
        if (activeFmt === 'image/png') ext = 'png';
        if (activeFmt === 'image/webp') ext = 'webp';

        const rawName = this.imgResizeState.file ? this.imgResizeState.file.name.replace(/\.[^/.]+$/, "") : 'hamsa-resized';
        UIUtils.downloadBlob(this.imgResizeState.resultBlob, `${rawName}-${this.imgResizeState.targetW}x${this.imgResizeState.targetH}.${ext}`);
        if (window.audioEngine) window.audioEngine.playCelebration();
        window.app && window.app.showToast('Resized image downloaded successfully!', 'success');
      };
    }
  }

  handleResizeImageFile(file) {
    if (!file.type.startsWith('image/')) {
      window.app && window.app.showToast('Please upload a valid image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.imgResizeState = {
          file: file,
          img: img,
          origW: img.naturalWidth,
          origH: img.naturalHeight,
          targetW: img.naturalWidth,
          targetH: img.naturalHeight,
          lockRatio: true,
          rotation: 0,
          flipH: false,
          flipV: false,
          bgColor: '#FFFFFF',
          resultBlob: null,
          resultUrl: null
        };

        const workbench = document.getElementById('img-resize-workbench');
        if (workbench) workbench.style.display = 'block';

        const widthInput = document.getElementById('img-resize-w');
        const heightInput = document.getElementById('img-resize-h');
        if (widthInput) widthInput.value = img.naturalWidth;
        if (heightInput) heightInput.value = img.naturalHeight;

        document.getElementById('img-resize-orig-dim').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
        document.getElementById('img-resize-orig-bytes').textContent = this.formatBytes(file.size);

        this.executeImageResizing();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  rotateImage(deltaDeg) {
    this.imgResizeState.rotation = (this.imgResizeState.rotation + deltaDeg) % 360;
    if (this.imgResizeState.rotation < 0) this.imgResizeState.rotation += 360;

    // If rotated 90 or 270, swap target width & height
    if (Math.abs(deltaDeg) === 90) {
      const temp = this.imgResizeState.targetW;
      this.imgResizeState.targetW = this.imgResizeState.targetH;
      this.imgResizeState.targetH = temp;

      const widthInput = document.getElementById('img-resize-w');
      const heightInput = document.getElementById('img-resize-h');
      if (widthInput) widthInput.value = this.imgResizeState.targetW;
      if (heightInput) heightInput.value = this.imgResizeState.targetH;
    }

    this.executeImageResizing();
  }

  toggleFlip(axis) {
    if (axis === 'H') this.imgResizeState.flipH = !this.imgResizeState.flipH;
    if (axis === 'V') this.imgResizeState.flipV = !this.imgResizeState.flipV;
    this.executeImageResizing();
  }

  applyDimensionPreset(w, h, lockRatio = false) {
    if (!this.imgResizeState.img) return;
    this.imgResizeState.lockRatio = lockRatio;
    this.imgResizeState.targetW = w;
    this.imgResizeState.targetH = h;

    const lockBtn = document.getElementById('img-resize-lock-btn');
    if (lockBtn) {
      lockBtn.classList.toggle('active', lockRatio);
      lockBtn.innerHTML = lockRatio ? '<i data-lucide="link"></i>' : '<i data-lucide="unlink"></i>';
      if (window.lucide) window.lucide.createIcons();
    }

    const widthInput = document.getElementById('img-resize-w');
    const heightInput = document.getElementById('img-resize-h');
    if (widthInput) widthInput.value = w;
    if (heightInput) heightInput.value = h;

    this.executeImageResizing();
    window.app && window.app.showToast(`Applied preset ${w} × ${h} px`, 'info');
  }

  executeImageResizing() {
    const { img, targetW, targetH, rotation, flipH, flipV } = this.imgResizeState;
    if (!img || targetW <= 0 || targetH <= 0) return;

    const activeFmt = document.querySelector('#img-resize-format-group .format-btn.active')?.getAttribute('data-fmt') || 'image/jpeg';
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    if (activeFmt === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const is90or270 = rotation === 90 || rotation === 270;
    const drawW = is90or270 ? targetH : targetW;
    const drawH = is90or270 ? targetW : targetH;

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.imgResizeState.resultBlob = blob;

      if (this.imgResizeState.resultUrl) {
        URL.revokeObjectURL(this.imgResizeState.resultUrl);
      }
      this.imgResizeState.resultUrl = URL.createObjectURL(blob);

      const previewEl = document.getElementById('img-resize-preview');
      if (previewEl) previewEl.src = this.imgResizeState.resultUrl;

      document.getElementById('img-resize-new-dim').textContent = `${targetW} × ${targetH}`;
      document.getElementById('img-resize-new-bytes').textContent = this.formatBytes(blob.size);
    }, activeFmt, 0.92);
  }

  // =========================================================================
  // TOOL 3: PDF MERGER (With Page Ranges & Numbering)
  // =========================================================================
  templatePdfMerger() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
              <i data-lucide="combine"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Instant Vector PDF Merger</h2>
              <p class="tool-card-subheading">Combine multiple PDFs with drag-and-drop ordering, selective page ranges per file, and optional bottom page numbering.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="pdf-merge-dropzone">
          <input type="file" id="pdf-merge-file-input" accept="application/pdf" multiple style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="file-plus-2" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to select or drop multiple PDF files</h3>
            <p class="dropzone-hint">Upload 2 or more PDF documents to merge into one</p>
          </div>
        </div>

        <div id="pdf-merge-workbench" class="tool-workbench" style="display:none;">
          <div class="merge-list-header-row">
            <div>
              <h3 class="panel-section-title" style="margin-bottom:0.25rem;"><i data-lucide="list-ordered"></i> Reorder Files & Page Ranges</h3>
              <p style="font-size:0.85rem; color:var(--text-secondary);">Arrange order with Up/Down arrows and specify page ranges (e.g. 1-5) per document.</p>
            </div>
            <div class="merge-summary-badges">
              <span class="badge-tag" id="pdf-merge-total-files">0 Files</span>
              <span class="badge-tag" id="pdf-merge-total-pages">0 Total Pages</span>
              <span class="badge-tag" id="pdf-merge-total-size">0 MB</span>
            </div>
          </div>

          <div class="pdf-file-cards-list" id="pdf-merge-list"></div>

          <!-- Extra Options -->
          <div class="merge-options-panel">
            <label class="checkbox-label">
              <input type="checkbox" id="pdf-merge-add-page-nums" checked>
              <span>Stamp bottom page numbers (e.g. "Page 1 of 24") on merged document</span>
            </label>
          </div>

          <div class="merge-actions-bar">
            <div class="merge-filename-wrap">
              <label for="pdf-merge-output-name">Output Document Name:</label>
              <input type="text" id="pdf-merge-output-name" value="hamsa-merged-notes.pdf" class="tool-text-input">
            </div>
            <div class="merge-buttons-wrap">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('pdf-merge-file-input').click()">
                <i data-lucide="plus"></i> Add More PDFs
              </button>
              <button type="button" id="pdf-merge-execute-btn" class="btn btn-primary btn-lg">
                <i data-lucide="combine"></i> Merge PDFs Now
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initPdfMergerEvents() {
    const dropzone = document.getElementById('pdf-merge-dropzone');
    const fileInput = document.getElementById('pdf-merge-file-input');
    const mergeBtn = document.getElementById('pdf-merge-execute-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleMergePdfFiles(Array.from(e.dataTransfer.files));
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleMergePdfFiles(Array.from(e.target.files));
    };

    if (mergeBtn) {
      mergeBtn.onclick = () => this.executePdfMerge();
    }
  }

  async handleMergePdfFiles(files) {
    const validFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (validFiles.length === 0) {
      window.app && window.app.showToast('Please select valid PDF files.', 'error');
      return;
    }

    if (!window.PDFLib) {
      window.app && window.app.showToast('PDF-Lib engine is loading. Please retry in 1 second.', 'warning');
      return;
    }

    window.app && window.app.showToast(`Loading ${validFiles.length} PDF file(s)...`, 'info');

    for (const file of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        this.pdfMergeState.items.push({
          id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          file: file,
          name: file.name,
          size: file.size,
          pageCount: pageCount,
          arrayBuffer: arrayBuffer,
          range: `1-${pageCount}` // Default all pages
        });
      } catch (err) {
        console.error('Failed to load PDF file for merge:', err);
        window.app && window.app.showToast(`Could not read ${file.name}. It might be password-protected.`, 'error');
      }
    }

    this.renderPdfMergeList();
  }

  renderPdfMergeList() {
    const listEl = document.getElementById('pdf-merge-list');
    const workbench = document.getElementById('pdf-merge-workbench');
    if (!listEl) return;

    if (this.pdfMergeState.items.length === 0) {
      if (workbench) workbench.style.display = 'none';
      return;
    }

    if (workbench) workbench.style.display = 'block';

    let totalPages = 0;
    let totalBytes = 0;

    listEl.innerHTML = this.pdfMergeState.items.map((item, idx) => {
      totalPages += item.pageCount;
      totalBytes += item.size;
      return `
        <div class="pdf-merge-item-card" data-id="${item.id}">
          <div class="item-left-col">
            <span class="item-index-badge">#${idx + 1}</span>
            <i data-lucide="file-text" class="item-pdf-icon"></i>
            <div class="item-meta-wrap">
              <span class="item-filename" title="${item.name}">${item.name}</span>
              <span class="item-submeta">${item.pageCount} Pages • ${this.formatBytes(item.size)}</span>
            </div>
          </div>
          <div class="item-range-col">
            <label>Pages:</label>
            <input type="text" class="item-range-input" value="${item.range}" onchange="toolsView.updateMergeItemRange(${idx}, this.value)">
          </div>
          <div class="item-actions-col">
            <button type="button" class="btn-icon-sm" onclick="toolsView.moveMergeItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move Up">
              <i data-lucide="arrow-up"></i>
            </button>
            <button type="button" class="btn-icon-sm" onclick="toolsView.moveMergeItem(${idx}, 1)" ${idx === this.pdfMergeState.items.length - 1 ? 'disabled' : ''} title="Move Down">
              <i data-lucide="arrow-down"></i>
            </button>
            <button type="button" class="btn-icon-sm danger" onclick="toolsView.removeMergeItem(${idx})" title="Remove">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('pdf-merge-total-files').textContent = `${this.pdfMergeState.items.length} Files`;
    document.getElementById('pdf-merge-total-pages').textContent = `${totalPages} Total Pages`;
    document.getElementById('pdf-merge-total-size').textContent = this.formatBytes(totalBytes);

    if (window.lucide) window.lucide.createIcons();
  }

  updateMergeItemRange(index, rangeStr) {
    if (this.pdfMergeState.items[index]) {
      this.pdfMergeState.items[index].range = rangeStr;
    }
  }

  moveMergeItem(index, dir) {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= this.pdfMergeState.items.length) return;
    const item = this.pdfMergeState.items.splice(index, 1)[0];
    this.pdfMergeState.items.splice(targetIdx, 0, item);
    this.renderPdfMergeList();
  }

  removeMergeItem(index) {
    this.pdfMergeState.items.splice(index, 1);
    this.renderPdfMergeList();
  }

  async executePdfMerge() {
    if (this.pdfMergeState.items.length < 2) {
      window.app && window.app.showToast('Please add at least 2 PDF files to merge.', 'warning');
      return;
    }

    const mergeBtn = document.getElementById('pdf-merge-execute-btn');
    if (mergeBtn) {
      mergeBtn.disabled = true;
      mergeBtn.innerHTML = '<i data-lucide="loader" class="spin-icon"></i> Merging Documents...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const mergedPdf = await window.PDFLib.PDFDocument.create();
      const addPageNums = document.getElementById('pdf-merge-add-page-nums')?.checked;

      for (const item of this.pdfMergeState.items) {
        const srcDoc = await window.PDFLib.PDFDocument.load(item.arrayBuffer, { ignoreEncryption: true });
        const selectedPages = this.parseRangeString(item.range, item.pageCount);
        const zeroIndexedPages = selectedPages.length > 0 ? selectedPages.map(p => p - 1) : srcDoc.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcDoc, zeroIndexedPages);
        copiedPages.forEach(p => mergedPdf.addPage(p));
      }

      // Optional bottom page numbers stamping
      if (addPageNums) {
        const totalPages = mergedPdf.getPageCount();
        const pages = mergedPdf.getPages();
        for (let i = 0; i < totalPages; i++) {
          const page = pages[i];
          const { width } = page.getSize();
          page.drawText(`Page ${i + 1} of ${totalPages}`, {
            x: width / 2 - 35,
            y: 18,
            size: 9,
            color: window.PDFLib.rgb(0.4, 0.4, 0.4)
          });
        }
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });

      let outName = document.getElementById('pdf-merge-output-name')?.value.trim() || 'hamsa-merged-notes.pdf';
      if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

      UIUtils.downloadBlob(blob, outName);

      if (window.audioEngine) window.audioEngine.playCelebration();
      window.app && window.app.showToast('All PDFs merged successfully!', 'success');
    } catch (err) {
      console.error('PDF merge error:', err);
      window.app && window.app.showToast('Failed to merge PDFs: ' + err.message, 'error');
    } finally {
      if (mergeBtn) {
        mergeBtn.disabled = false;
        mergeBtn.innerHTML = '<i data-lucide="combine"></i> Merge PDFs Now';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // =========================================================================
  // TOOL 4: PDF SPLITTER (Visual Thumbnail Grid & Range Selector)
  // =========================================================================
  templatePdfSplitter() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);">
              <i data-lucide="scissors"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Visual PDF Page Splitter & Extractor</h2>
              <p class="tool-card-subheading">Select pages visually using the thumbnail grid or enter custom ranges (e.g. 1-3, 5) to export individual chapters and syllabus notes.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="pdf-split-dropzone">
          <input type="file" id="pdf-split-file-input" accept="application/pdf" style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="file-search" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to select or drop a PDF file to split</h3>
            <p class="dropzone-hint">Upload a single PDF document to extract pages</p>
          </div>
        </div>

        <div id="pdf-split-workbench" class="tool-workbench" style="display:none;">
          <div class="split-info-banner">
            <div class="split-file-details">
              <i data-lucide="file-text" style="width:28px;height:28px;color:var(--color-primary-light);"></i>
              <div>
                <span class="split-filename" id="pdf-split-file-name">document.pdf</span>
                <span class="split-pagemeta" id="pdf-split-total-badge">Total 0 Pages • 0 MB</span>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('pdf-split-file-input').click()">
              Change PDF
            </button>
          </div>

          <!-- Page Range Presets Toolbar -->
          <div class="visual-page-toolbar" style="margin-top:1.25rem;">
            <div class="toolbar-left">
              <span class="toolbar-title"><i data-lucide="layers"></i> Quick Page Selection:</span>
              <button type="button" class="preset-chip" onclick="toolsView.selectAllSplitPages()">Select All</button>
              <button type="button" class="preset-chip" onclick="toolsView.deselectAllSplitPages()">Deselect All</button>
              <button type="button" class="preset-chip" onclick="toolsView.setSplitRange('first-half')">First Half</button>
              <button type="button" class="preset-chip" onclick="toolsView.setSplitRange('second-half')">Second Half</button>
              <button type="button" class="preset-chip" onclick="toolsView.setSplitRange('odd')">Odd Pages</button>
              <button type="button" class="preset-chip" onclick="toolsView.setSplitRange('even')">Even Pages</button>
            </div>
            <div class="toolbar-right">
              <div class="range-inline-input">
                <label for="pdf-split-ranges">Range:</label>
                <input type="text" id="pdf-split-ranges" placeholder="e.g. 1-3, 5, 7-10">
              </div>
            </div>
          </div>

          <!-- Visual Page Selector Grid -->
          <div class="visual-page-grid" id="pdf-split-page-grid">
            <!-- Dynamically populated page cards with thumbnails -->
          </div>

          <!-- Validation & Action Bar -->
          <div class="split-actions-bar">
            <div class="split-summary-info">
              <strong id="pdf-split-validated-count">0 pages selected</strong>
            </div>
            <button id="pdf-split-execute-btn" class="btn btn-primary btn-lg">
              <i data-lucide="scissors"></i>
              <span>Split & Download Extracted PDF</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  initPdfSplitterEvents() {
    const dropzone = document.getElementById('pdf-split-dropzone');
    const fileInput = document.getElementById('pdf-split-file-input');
    const rangeInput = document.getElementById('pdf-split-ranges');
    const splitBtn = document.getElementById('pdf-split-execute-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleSplitPdfFile(e.dataTransfer.files[0]);
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleSplitPdfFile(e.target.files[0]);
    };

    if (rangeInput) {
      rangeInput.oninput = () => {
        const pages = this.parseRangeString(rangeInput.value, this.pdfSplitState.totalPages);
        this.pdfSplitState.selectedPages = new Set(pages);
        this.syncSplitGridSelections();
      };
    }

    if (splitBtn) {
      splitBtn.onclick = () => this.executePdfSplit();
    }
  }

  async handleSplitPdfFile(file) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      window.app && window.app.showToast('Please upload a valid PDF file.', 'error');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();

      this.pdfSplitState = {
        file: file,
        pdfDoc: pdfDoc,
        totalPages: totalPages,
        arrayBuffer: arrayBuffer,
        selectedPages: new Set([1]) // default page 1 selected
      };

      const workbench = document.getElementById('pdf-split-workbench');
      if (workbench) workbench.style.display = 'block';

      document.getElementById('pdf-split-file-name').textContent = file.name;
      document.getElementById('pdf-split-total-badge').textContent = `Total ${totalPages} Pages • ${this.formatBytes(file.size)}`;

      const rangeInput = document.getElementById('pdf-split-ranges');
      if (rangeInput) rangeInput.value = '1';

      this.renderSplitThumbnailGrid();
      window.app && window.app.showToast(`Loaded "${file.name}" (${totalPages} pages).`, 'success');
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('Split PDF load error:', err);
      window.app && window.app.showToast('Failed to parse PDF: ' + err.message, 'error');
    }
  }

  async renderSplitThumbnailGrid() {
    const grid = document.getElementById('pdf-split-page-grid');
    if (!grid || !this.pdfSplitState.totalPages) return;

    const total = this.pdfSplitState.totalPages;
    grid.innerHTML = '';

    for (let p = 1; p <= total; p++) {
      const isSelected = this.pdfSplitState.selectedPages.has(p);
      const card = document.createElement('div');
      card.className = `page-tile-card ${isSelected ? 'selected' : ''}`;
      card.setAttribute('data-page', p);
      card.innerHTML = `
        <div class="page-tile-header">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toolsView.toggleSplitPage(${p})">
          <span class="page-num-tag">P. ${p}</span>
        </div>
        <div class="page-tile-canvas-wrap" onclick="toolsView.toggleSplitPage(${p})">
          <div class="page-skeleton-lines">
            <div class="line" style="width:70%;"></div>
            <div class="line" style="width:90%;"></div>
            <div class="line" style="width:80%;"></div>
            <div class="line" style="width:60%;"></div>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }

    this.updateSplitSelectionBadge();
  }

  toggleSplitPage(pageNum) {
    if (this.pdfSplitState.selectedPages.has(pageNum)) {
      this.pdfSplitState.selectedPages.delete(pageNum);
    } else {
      this.pdfSplitState.selectedPages.add(pageNum);
    }
    this.syncSplitGridSelections();
  }

  selectAllSplitPages() {
    for (let i = 1; i <= this.pdfSplitState.totalPages; i++) {
      this.pdfSplitState.selectedPages.add(i);
    }
    this.syncSplitGridSelections();
  }

  deselectAllSplitPages() {
    this.pdfSplitState.selectedPages.clear();
    this.syncSplitGridSelections();
  }

  syncSplitGridSelections() {
    const sorted = Array.from(this.pdfSplitState.selectedPages).sort((a, b) => a - b);
    const rangeInput = document.getElementById('pdf-split-ranges');
    if (rangeInput && document.activeElement !== rangeInput) {
      rangeInput.value = this.buildRangeString(sorted);
    }

    document.querySelectorAll('.page-tile-card').forEach(card => {
      const p = parseInt(card.getAttribute('data-page'), 10);
      const isSel = this.pdfSplitState.selectedPages.has(p);
      card.classList.toggle('selected', isSel);
      const chk = card.querySelector('input[type="checkbox"]');
      if (chk) chk.checked = isSel;
    });

    this.updateSplitSelectionBadge();
  }

  updateSplitSelectionBadge() {
    const countEl = document.getElementById('pdf-split-validated-count');
    if (countEl) {
      const count = this.pdfSplitState.selectedPages.size;
      countEl.textContent = `${count} of ${this.pdfSplitState.totalPages} pages selected for extraction`;
    }
  }

  buildRangeString(pagesArray) {
    if (pagesArray.length === 0) return '';
    const ranges = [];
    let start = pagesArray[0];
    let prev = pagesArray[0];

    for (let i = 1; i < pagesArray.length; i++) {
      const cur = pagesArray[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = cur;
        prev = cur;
      }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    return ranges.join(', ');
  }

  parseRangeString(str, maxPages) {
    if (!str || !str.trim()) return [];
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const pages = new Set();

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) pages.add(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) pages.add(p);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  setSplitRange(type) {
    const total = this.pdfSplitState.totalPages;
    if (!total) return;
    this.pdfSplitState.selectedPages.clear();

    if (type === 'first-half') {
      const half = Math.ceil(total / 2);
      for (let i = 1; i <= half; i++) this.pdfSplitState.selectedPages.add(i);
    } else if (type === 'second-half') {
      const half = Math.ceil(total / 2) + 1;
      for (let i = half; i <= total; i++) this.pdfSplitState.selectedPages.add(i);
    } else if (type === 'odd') {
      for (let i = 1; i <= total; i += 2) this.pdfSplitState.selectedPages.add(i);
    } else if (type === 'even') {
      for (let i = 2; i <= total; i += 2) this.pdfSplitState.selectedPages.add(i);
    }
    this.syncSplitGridSelections();
  }

  async executePdfSplit() {
    if (!this.pdfSplitState.pdfDoc) {
      window.app && window.app.showToast('Please upload a PDF first.', 'warning');
      return;
    }

    const pages = Array.from(this.pdfSplitState.selectedPages).sort((a, b) => a - b);
    if (pages.length === 0) {
      window.app && window.app.showToast('Please select at least 1 page to extract.', 'warning');
      return;
    }

    const splitBtn = document.getElementById('pdf-split-execute-btn');
    if (splitBtn) {
      splitBtn.disabled = true;
      splitBtn.innerHTML = '<i data-lucide="loader" class="spin-icon"></i> Extracting Pages...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const newDoc = await window.PDFLib.PDFDocument.create();
      const zeroIndexedPages = pages.map(p => p - 1);
      const copiedPages = await newDoc.copyPages(this.pdfSplitState.pdfDoc, zeroIndexedPages);
      copiedPages.forEach(p => newDoc.addPage(p));

      const newBytes = await newDoc.save();
      const blob = new Blob([newBytes], { type: 'application/pdf' });

      const rawName = this.pdfSplitState.file ? this.pdfSplitState.file.name.replace(/\.[^/.]+$/, "") : 'document';
      const rangeTag = pages.length === 1 ? `page-${pages[0]}` : `pages-${pages[0]}-to-${pages[pages.length - 1]}`;

      UIUtils.downloadBlob(blob, `${rawName}-extracted-${rangeTag}.pdf`);

      if (window.audioEngine) window.audioEngine.playCelebration();
      window.app && window.app.showToast(`Extracted ${pages.length} pages successfully!`, 'success');
    } catch (err) {
      console.error('PDF Split error:', err);
      window.app && window.app.showToast('Extraction failed: ' + err.message, 'error');
    } finally {
      if (splitBtn) {
        splitBtn.disabled = false;
        splitBtn.innerHTML = '<i data-lucide="scissors"></i> Split & Download Extracted PDF';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // =========================================================================
  // TOOL 5: PDF COMPRESSOR (With Grayscale Scan Filter & DPI Scale)
  // =========================================================================
  templatePdfCompressor() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #d97706 0%, #b45309 100%);">
              <i data-lucide="archive"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Smart PDF Document Compressor</h2>
              <p class="tool-card-subheading">Reduce scanned notes and bulky PDF sizes for email or upload portals with DPI controls and high-contrast black & white scan enhancement.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="pdf-compress-dropzone">
          <input type="file" id="pdf-compress-file-input" accept="application/pdf" style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="file-archive" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to select or drop a PDF to compress</h3>
            <p class="dropzone-hint">Multi-page compression running 100% offline in your browser</p>
          </div>
        </div>

        <div id="pdf-compress-workbench" class="tool-workbench" style="display:none;">
          <div class="split-info-banner">
            <div class="split-file-details">
              <i data-lucide="file-text" style="width:28px;height:28px;color:var(--color-primary-light);"></i>
              <div>
                <span class="split-filename" id="pdf-compress-file-name">document.pdf</span>
                <span class="split-pagemeta" id="pdf-compress-file-meta">0 Pages • 0 MB</span>
              </div>
            </div>
          </div>

          <div class="tool-control-panel" style="margin-top:1.5rem;">
            <h3 class="panel-section-title"><i data-lucide="gauge"></i> Select Compression Level & Mode</h3>

            <div class="compression-modes-grid">
              <label class="comp-mode-card active" data-mode="balanced">
                <input type="radio" name="comp-mode" value="balanced" checked style="display:none;">
                <div class="mode-icon"><i data-lucide="check"></i></div>
                <div class="mode-text">
                  <strong>Recommended (Balanced)</strong>
                  <span>Standard 96 DPI, clean text & ~60% size reduction</span>
                </div>
              </label>

              <label class="comp-mode-card" data-mode="extreme">
                <input type="radio" name="comp-mode" value="extreme" style="display:none;">
                <div class="mode-icon"><i data-lucide="zap"></i></div>
                <div class="mode-text">
                  <strong>Extreme (Strict Portals)</strong>
                  <span>Maximum shrinkage for strict < 2MB or < 1MB limits</span>
                </div>
              </label>

              <label class="comp-mode-card" data-mode="grayscale">
                <input type="radio" name="comp-mode" value="grayscale" style="display:none;">
                <div class="mode-icon"><i data-lucide="contrast"></i></div>
                <div class="mode-text">
                  <strong>B&W Document Enhancer</strong>
                  <span>Converts color scans to crisp B&W (up to 80% reduction)</span>
                </div>
              </label>
            </div>

            <!-- Live Progress Bar -->
            <div id="pdf-compress-progress-wrap" class="compress-progress-wrap" style="display:none;">
              <div class="progress-status-row">
                <span id="pdf-compress-progress-text">Rendering & Compressing page 1...</span>
                <span id="pdf-compress-progress-pct">0%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" id="pdf-compress-progress-bar" style="width:0%;"></div>
              </div>
            </div>

            <div class="workbench-action-row" style="margin-top:1.5rem;">
              <button id="pdf-compress-execute-btn" class="btn btn-primary btn-lg" style="width:100%; display:flex; align-items:center; justify-content:center; gap:0.6rem;">
                <i data-lucide="archive"></i>
                <span>Compress & Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initPdfCompressorEvents() {
    const dropzone = document.getElementById('pdf-compress-dropzone');
    const fileInput = document.getElementById('pdf-compress-file-input');
    const compressBtn = document.getElementById('pdf-compress-execute-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleCompressPdfFile(e.dataTransfer.files[0]);
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleCompressPdfFile(e.target.files[0]);
    };

    document.querySelectorAll('.comp-mode-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.comp-mode-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      };
    });

    if (compressBtn) {
      compressBtn.onclick = () => this.executePdfCompression();
    }
  }

  async handleCompressPdfFile(file) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      window.app && window.app.showToast('Please upload a valid PDF document.', 'error');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;

      this.pdfCompressState = {
        file: file,
        pdfDoc: pdfDoc,
        totalPages: totalPages,
        arrayBuffer: arrayBuffer
      };

      const workbench = document.getElementById('pdf-compress-workbench');
      if (workbench) workbench.style.display = 'block';

      document.getElementById('pdf-compress-file-name').textContent = file.name;
      document.getElementById('pdf-compress-file-meta').textContent = `${totalPages} Pages • ${this.formatBytes(file.size)}`;

      window.app && window.app.showToast(`Ready to compress ${file.name} (${totalPages} pages).`, 'info');
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('PDF compress load error:', err);
      window.app && window.app.showToast('Could not parse PDF: ' + err.message, 'error');
    }
  }

  async executePdfCompression() {
    const { file, pdfDoc, totalPages } = this.pdfCompressState;
    if (!pdfDoc) {
      window.app && window.app.showToast('Please select a PDF document first.', 'warning');
      return;
    }

    const selectedMode = document.querySelector('input[name="comp-mode"]:checked')?.value || 'balanced';
    let scale = 1.0;
    let quality = 0.70;
    let isGrayscale = false;

    if (selectedMode === 'extreme') {
      scale = 0.75;
      quality = 0.48;
    } else if (selectedMode === 'grayscale') {
      scale = 1.0;
      quality = 0.60;
      isGrayscale = true;
    }

    const progressWrap = document.getElementById('pdf-compress-progress-wrap');
    const progressText = document.getElementById('pdf-compress-progress-text');
    const progressPct = document.getElementById('pdf-compress-progress-pct');
    const progressBar = document.getElementById('pdf-compress-progress-bar');
    const compressBtn = document.getElementById('pdf-compress-execute-btn');

    if (progressWrap) progressWrap.style.display = 'block';
    if (compressBtn) compressBtn.disabled = true;

    try {
      const jsPdfConstructor = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPdfConstructor) throw new Error('jsPDF library is not loaded');

      let targetDoc = null;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pct = Math.round(((pageNum - 1) / totalPages) * 100);
        if (progressText) progressText.textContent = `Optimizing page ${pageNum} of ${totalPages}...`;
        if (progressPct) progressPct.textContent = `${pct}%`;
        if (progressBar) progressBar.style.width = `${pct}%`;

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Apply Grayscale contrast filter if selected
        if (isGrayscale) {
          const imgDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgDataObj.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
            // Boost contrast: push light grays to pure white and dark to black
            const boosted = gray > 180 ? 255 : (gray < 70 ? 0 : gray);
            d[i] = boosted;
            d[i + 1] = boosted;
            d[i + 2] = boosted;
          }
          ctx.putImageData(imgDataObj, 0, 0);
        }

        const imgData = canvas.toDataURL('image/jpeg', quality);
        const isLandscape = viewport.width > viewport.height;
        const orientation = isLandscape ? 'landscape' : 'portrait';

        if (pageNum === 1) {
          targetDoc = new jsPdfConstructor({
            orientation: orientation,
            unit: 'pt',
            format: [viewport.width, viewport.height]
          });
          targetDoc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
        } else {
          targetDoc.addPage([viewport.width, viewport.height], orientation);
          targetDoc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
        }
      }

      if (progressText) progressText.textContent = 'Finalizing compressed document...';
      if (progressPct) progressPct.textContent = '100%';
      if (progressBar) progressBar.style.width = '100%';

      const compressedBlob = targetDoc.output('blob');
      const rawName = file ? file.name.replace(/\.[^/.]+$/, "") : 'document';

      UIUtils.downloadBlob(compressedBlob, `${rawName}-compressed.pdf`);

      const savedBytes = file.size - compressedBlob.size;
      const savingsPct = Math.round((savedBytes / file.size) * 100);

      if (window.audioEngine) window.audioEngine.playCelebration();
      window.app && window.app.showToast(
        savingsPct > 0 
          ? `PDF compressed successfully! Reduced from ${this.formatBytes(file.size)} to ${this.formatBytes(compressedBlob.size)} (-${savingsPct}%)` 
          : `PDF saved successfully at ${this.formatBytes(compressedBlob.size)}`, 
        'success'
      );
    } catch (err) {
      console.error('PDF compression failed:', err);
      window.app && window.app.showToast('Compression failed: ' + err.message, 'error');
    } finally {
      if (compressBtn) compressBtn.disabled = false;
      if (progressWrap) progressWrap.style.display = 'none';
    }
  }

  // =========================================================================
  // TOOL 6: IMAGES TO PDF (1, 2 or 4 Photos Per Page & Scan Booster)
  // =========================================================================
  templateImagesToPdf() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%);">
              <i data-lucide="file-image"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Photos & Scans to A4 PDF</h2>
              <p class="tool-card-subheading">Compile photos of handwritten notes into clean A4 PDFs with 1, 2 or 4 photos per page and scan contrast boosting.</p>
            </div>
          </div>
        </div>

        <div class="tool-dropzone" id="img-to-pdf-dropzone">
          <input type="file" id="img-to-pdf-file-input" accept="image/jpeg,image/png,image/webp,image/avif" multiple style="display:none;">
          <div class="dropzone-content">
            <i data-lucide="images" class="dropzone-icon"></i>
            <h3 class="dropzone-title">Click to select or drop images to compile into PDF</h3>
            <p class="dropzone-hint">Upload JPG, PNG or WEBP photos (Reorderable before export)</p>
          </div>
        </div>

        <div id="img-to-pdf-workbench" class="tool-workbench" style="display:none;">
          <div class="merge-list-header-row">
            <div>
              <h3 class="panel-section-title"><i data-lucide="layout-grid"></i> Reorder Pages (<span id="img-to-pdf-count">0</span> Images)</h3>
              <p style="font-size:0.85rem; color:var(--text-secondary);">Move cards to arrange pages in your preferred study order.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('img-to-pdf-file-input').click()">
              <i data-lucide="plus"></i> Add More Photos
            </button>
          </div>

          <!-- Thumbnails Grid -->
          <div class="img-to-pdf-grid" id="img-to-pdf-grid"></div>

          <!-- Layout & Filter Settings -->
          <div class="tool-control-panel" style="margin-top:1.5rem;">
            <div class="settings-three-col">
              <div class="control-group">
                <label class="control-label">Layout (Photos Per Page)</label>
                <select id="img-to-pdf-layout" class="tool-select">
                  <option value="1" selected>1 Photo per Page (Full A4)</option>
                  <option value="2">2 Photos per Page (Split)</option>
                  <option value="4">4 Photos per Page (Handout Grid)</option>
                </select>
              </div>

              <div class="control-group">
                <label class="control-label">Scan Enhancement Filter</label>
                <select id="img-to-pdf-filter" class="tool-select">
                  <option value="none" selected>Original Colors</option>
                  <option value="contrast">High-Contrast Scan Booster</option>
                  <option value="grayscale">Clean Grayscale Notes</option>
                </select>
              </div>

              <div class="control-group">
                <label class="control-label">Page Margins</label>
                <select id="img-to-pdf-margin" class="tool-select">
                  <option value="0">No Margin (Full Page)</option>
                  <option value="6" selected>Compact (6 mm)</option>
                  <option value="14">Standard (14 mm)</option>
                </select>
              </div>
            </div>

            <div class="workbench-action-row" style="margin-top:1.5rem;">
              <button id="img-to-pdf-execute-btn" class="btn btn-primary btn-lg" style="width:100%; display:flex; align-items:center; justify-content:center; gap:0.6rem;">
                <i data-lucide="download"></i>
                <span>Generate & Download A4 PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initImagesToPdfEvents() {
    const dropzone = document.getElementById('img-to-pdf-dropzone');
    const fileInput = document.getElementById('img-to-pdf-file-input');
    const generateBtn = document.getElementById('img-to-pdf-execute-btn');

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleImgToPdfFiles(Array.from(e.dataTransfer.files));
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) this.handleImgToPdfFiles(Array.from(e.target.files));
    };

    if (generateBtn) {
      generateBtn.onclick = () => this.executeImagesToPdf();
    }
  }

  async handleImgToPdfFiles(files) {
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      window.app && window.app.showToast('Please select valid image files.', 'error');
      return;
    }

    for (const file of validFiles) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });

      const { w, h } = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = dataUrl;
      });

      this.imgToPdfState.items.push({
        id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        file: file,
        name: file.name,
        dataUrl: dataUrl,
        w: w,
        h: h
      });
    }

    this.renderImgToPdfGrid();
  }

  renderImgToPdfGrid() {
    const gridEl = document.getElementById('img-to-pdf-grid');
    const workbench = document.getElementById('img-to-pdf-workbench');
    if (!gridEl) return;

    if (this.imgToPdfState.items.length === 0) {
      if (workbench) workbench.style.display = 'none';
      return;
    }

    if (workbench) workbench.style.display = 'block';
    document.getElementById('img-to-pdf-count').textContent = this.imgToPdfState.items.length;

    gridEl.innerHTML = this.imgToPdfState.items.map((item, idx) => `
      <div class="img-to-pdf-card" data-id="${item.id}">
        <span class="img-card-page-badge">#${idx + 1}</span>
        <div class="img-card-thumb-wrap">
          <img src="${item.dataUrl}" alt="Thumb ${idx + 1}" class="img-card-thumb">
        </div>
        <div class="img-card-footer">
          <span class="img-card-name" title="${item.name}">${item.name}</span>
          <div class="img-card-actions">
            <button type="button" class="btn-icon-xs" onclick="toolsView.moveImgToPdfItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move Left">
              <i data-lucide="chevron-left"></i>
            </button>
            <button type="button" class="btn-icon-xs" onclick="toolsView.moveImgToPdfItem(${idx}, 1)" ${idx === this.imgToPdfState.items.length - 1 ? 'disabled' : ''} title="Move Right">
              <i data-lucide="chevron-right"></i>
            </button>
            <button type="button" class="btn-icon-xs danger" onclick="toolsView.removeImgToPdfItem(${idx})" title="Remove">
              <i data-lucide="trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  moveImgToPdfItem(index, dir) {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= this.imgToPdfState.items.length) return;
    const item = this.imgToPdfState.items.splice(index, 1)[0];
    this.imgToPdfState.items.splice(targetIdx, 0, item);
    this.renderImgToPdfGrid();
  }

  removeImgToPdfItem(index) {
    this.imgToPdfState.items.splice(index, 1);
    this.renderImgToPdfGrid();
  }

  async executeImagesToPdf() {
    if (this.imgToPdfState.items.length === 0) {
      window.app && window.app.showToast('Please add at least one image.', 'warning');
      return;
    }

    const generateBtn = document.getElementById('img-to-pdf-execute-btn');
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<i data-lucide="loader" class="spin-icon"></i> Compiling A4 PDF...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const jsPdfConstructor = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPdfConstructor) throw new Error('jsPDF is not loaded');

      const layout = parseInt(document.getElementById('img-to-pdf-layout')?.value || '1', 10);
      const marginMm = parseInt(document.getElementById('img-to-pdf-margin')?.value || '6', 10);
      const filter = document.getElementById('img-to-pdf-filter')?.value || 'none';

      // A4 portrait: 210 x 297 mm
      const pageW = 210;
      const pageH = 297;
      const doc = new jsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const printableW = pageW - (marginMm * 2);
      const printableH = pageH - (marginMm * 2);

      const items = this.imgToPdfState.items;
      const totalPhotos = items.length;
      let photoIdx = 0;
      let pageCount = 0;

      while (photoIdx < totalPhotos) {
        if (pageCount > 0) doc.addPage('a4', 'portrait');
        pageCount++;

        if (layout === 1) {
          const item = items[photoIdx];
          const imgRatio = item.w / item.h;
          const pageRatio = printableW / printableH;
          let renderW = printableW, renderH = printableW / imgRatio;
          if (imgRatio < pageRatio) {
            renderH = printableH;
            renderW = printableH * imgRatio;
          }
          const posX = marginMm + (printableW - renderW) / 2;
          const posY = marginMm + (printableH - renderH) / 2;
          doc.addImage(item.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
          photoIdx++;
        } else if (layout === 2) {
          // 2 photos stacked vertically
          const slotH = (printableH - 4) / 2;
          for (let slot = 0; slot < 2 && photoIdx < totalPhotos; slot++) {
            const item = items[photoIdx];
            const imgRatio = item.w / item.h;
            let renderW = printableW, renderH = printableW / imgRatio;
            if (renderH > slotH) {
              renderH = slotH;
              renderW = slotH * imgRatio;
            }
            const posX = marginMm + (printableW - renderW) / 2;
            const posY = marginMm + (slot * (slotH + 4)) + (slotH - renderH) / 2;
            doc.addImage(item.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
            photoIdx++;
          }
        } else if (layout === 4) {
          // 4 photos in 2x2 grid
          const slotW = (printableW - 4) / 2;
          const slotH = (printableH - 4) / 2;
          for (let row = 0; row < 2 && photoIdx < totalPhotos; row++) {
            for (let col = 0; col < 2 && photoIdx < totalPhotos; col++) {
              const item = items[photoIdx];
              const imgRatio = item.w / item.h;
              let renderW = slotW, renderH = slotW / imgRatio;
              if (renderH > slotH) {
                renderH = slotH;
                renderW = slotH * imgRatio;
              }
              const posX = marginMm + col * (slotW + 4) + (slotW - renderW) / 2;
              const posY = marginMm + row * (slotH + 4) + (slotH - renderH) / 2;
              doc.addImage(item.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
              photoIdx++;
            }
          }
        }
      }

      const blob = doc.output('blob');
      UIUtils.downloadBlob(blob, `hamsa-compiled-notes.pdf`);

      if (window.audioEngine) window.audioEngine.playCelebration();
      window.app && window.app.showToast(`A4 PDF generated (${pageCount} pages)!`, 'success');
    } catch (err) {
      console.error('Images to PDF error:', err);
      window.app && window.app.showToast('Failed to create PDF: ' + err.message, 'error');
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i data-lucide="download"></i> Generate & Download A4 PDF';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // =========================================================================
  // TOOL 7: UPSC ESSAY & WORD LIMIT TRACKER (Speech-to-Text & Readability)
  // =========================================================================
  templateWordCounter() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #6366f1 0%, #4338ca 100%);">
              <i data-lucide="file-text"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">UPSC Exam Essay & Word Limit Tracker</h2>
              <p class="tool-card-subheading">Live word and character tracker with UPSC 150w (10 Marks) & 250w (15 Marks) answer targets, Flesch readability grade, and voice dictation.</p>
            </div>
          </div>
        </div>

        <div class="tool-workbench" style="display:block;">
          <!-- Metrics Scorecards Grid -->
          <div class="word-counter-stats-grid">
            <div class="counter-stat-card highlight">
              <span class="c-stat-label">Words</span>
              <span class="c-stat-val" id="word-c-words">0</span>
            </div>
            <div class="counter-stat-card">
              <span class="c-stat-label">Characters</span>
              <span class="c-stat-val" id="word-c-chars">0</span>
              <span class="c-stat-sub" id="word-c-chars-nospace">0 without spaces</span>
            </div>
            <div class="counter-stat-card">
              <span class="c-stat-label">Sentences / Paras</span>
              <span class="c-stat-val" id="word-c-sentences">0 / 0</span>
            </div>
            <div class="counter-stat-card">
              <span class="c-stat-label">Readability Grade</span>
              <span class="c-stat-val" id="word-c-readability">0</span>
              <span class="c-stat-sub" id="word-c-read-desc">Standard</span>
            </div>
            <div class="counter-stat-card">
              <span class="c-stat-label">Reading / Speaking</span>
              <span class="c-stat-val" id="word-c-reading">0m / 0m</span>
            </div>
          </div>

          <!-- UPSC Exam Limit Progress Bar -->
          <div class="upsc-goal-tracker-card">
            <div class="goal-header-row">
              <div class="goal-label-wrap">
                <span class="goal-title"><i data-lucide="target"></i> Exam Word Limit Target</span>
                <span class="goal-subtitle" id="word-c-goal-badge">Target: 150 Words (UPSC 10 Marks)</span>
              </div>
              <div class="goal-preset-pills">
                <button type="button" class="goal-pill active" onclick="toolsView.setWordGoal(150)">150 Words (10M)</button>
                <button type="button" class="goal-pill" onclick="toolsView.setWordGoal(250)">250 Words (15M)</button>
                <button type="button" class="goal-pill" onclick="toolsView.setWordGoal(1000)">1,000 Words (Essay)</button>
                <button type="button" class="goal-pill" onclick="toolsView.setWordGoal(0)">No Limit</button>
              </div>
            </div>

            <div class="goal-progress-wrap" id="word-c-progress-container">
              <div class="goal-track">
                <div class="goal-fill" id="word-c-progress-fill" style="width:0%;"></div>
              </div>
              <div class="goal-metrics-row">
                <span id="word-c-progress-pct">0% Reached</span>
                <span id="word-c-progress-remaining">150 words remaining</span>
              </div>
            </div>
          </div>

          <!-- Repeated Keywords & Vocab Alert -->
          <div id="word-c-keywords-bar" class="keywords-analysis-bar" style="display:none;">
            <span class="kw-title"><i data-lucide="repeat"></i> Frequently Repeated Words:</span>
            <div id="word-c-keywords-chips" class="kw-chips-list"></div>
          </div>

          <!-- Text Area & Actions Toolbar -->
          <div class="counter-editor-wrapper">
            <div class="editor-toolbar">
              <div class="toolbar-left">
                <button type="button" class="toolbar-btn" onclick="toolsView.convertTextCase('upper')">UPPERCASE</button>
                <button type="button" class="toolbar-btn" onclick="toolsView.convertTextCase('lower')">lowercase</button>
                <button type="button" class="toolbar-btn" onclick="toolsView.convertTextCase('title')">Title Case</button>
                <button type="button" class="toolbar-btn" onclick="toolsView.loadSampleAnswer()">Load UPSC Sample</button>
                <button type="button" id="dictate-btn" class="toolbar-btn" onclick="toolsView.toggleVoiceDictation()">
                  <i data-lucide="mic"></i> <span>Dictate (Voice)</span>
                </button>
              </div>
              <div class="toolbar-right">
                <button type="button" class="toolbar-btn" onclick="toolsView.speakTextAloud()" title="Listen to your answer">
                  <i data-lucide="volume-2"></i> Listen
                </button>
                <button type="button" class="toolbar-btn" onclick="toolsView.copyEditorText()">
                  <i data-lucide="copy"></i> Copy
                </button>
                <button type="button" class="toolbar-btn danger" onclick="toolsView.clearEditorText()">
                  <i data-lucide="trash"></i> Clear
                </button>
              </div>
            </div>

            <textarea id="word-counter-textarea" class="word-counter-textarea" placeholder="Start typing or dictating your essay answer here... Word count, readability grade, and UPSC limits will update in real-time." rows="14"></textarea>
          </div>
        </div>
      </div>
    `;
  }

  initWordCounterEvents() {
    const textarea = document.getElementById('word-counter-textarea');
    if (!textarea) return;

    textarea.value = this.wordCounterState.text || '';
    this.updateWordCounterStats(textarea.value);

    textarea.oninput = () => {
      this.wordCounterState.text = textarea.value;
      this.updateWordCounterStats(textarea.value);
    };
  }

  setWordGoal(goal) {
    this.wordCounterState.targetWordGoal = goal;
    document.querySelectorAll('.goal-pill').forEach(p => {
      p.classList.toggle('active', p.getAttribute('onclick').includes(String(goal)));
    });

    const badge = document.getElementById('word-c-goal-badge');
    const container = document.getElementById('word-c-progress-container');

    if (goal === 0) {
      if (badge) badge.textContent = 'No Word Target Active';
      if (container) container.style.display = 'none';
    } else {
      if (container) container.style.display = 'block';
      const label = goal === 150 ? '150 Words (UPSC 10 Marks)' : goal === 250 ? '250 Words (UPSC 15 Marks)' : `${goal} Words`;
      if (badge) badge.textContent = `Target: ${label}`;
    }

    const textarea = document.getElementById('word-counter-textarea');
    if (textarea) this.updateWordCounterStats(textarea.value);
  }

  updateWordCounterStats(text) {
    const trimmed = text.trim();
    const wordsArray = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    const words = wordsArray.length;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const sentences = trimmed ? (text.match(/[^.!?]+[.!?]+(\s|$)/g) || [1]).length : 0;
    const paragraphs = trimmed ? text.split(/\n+/).filter(p => p.trim().length > 0).length : 0;

    const readMin = Math.ceil(words / 200);
    const speakMin = Math.ceil(words / 130);

    // Flesch Reading Ease approximation
    let syllables = 0;
    wordsArray.forEach(w => {
      const m = w.toLowerCase().match(/[aeiouy]{1,2}/g);
      syllables += m ? m.length : 1;
    });
    const avgWordsPerSent = sentences > 0 ? (words / sentences) : 0;
    const avgSyllPerWord = words > 0 ? (syllables / words) : 0;
    let fleschScore = Math.round(206.835 - (1.015 * avgWordsPerSent) - (84.6 * avgSyllPerWord));
    if (words < 5) fleschScore = 100;
    fleschScore = Math.max(0, Math.min(100, fleschScore));

    let fleschLabel = 'Standard';
    if (fleschScore >= 70) fleschLabel = 'Easy / Plain';
    else if (fleschScore >= 50) fleschLabel = 'Competitive Exam';
    else fleschLabel = 'Advanced College';

    document.getElementById('word-c-words').textContent = words.toLocaleString();
    document.getElementById('word-c-chars').textContent = chars.toLocaleString();
    document.getElementById('word-c-chars-nospace').textContent = `${charsNoSpace.toLocaleString()} without spaces`;
    document.getElementById('word-c-sentences').textContent = `${sentences} / ${paragraphs}`;
    document.getElementById('word-c-readability').textContent = `${fleschScore}/100`;
    document.getElementById('word-c-read-desc').textContent = fleschLabel;
    document.getElementById('word-c-reading').textContent = `${readMin}m / ${speakMin}m`;

    // Goal progress
    const goal = this.wordCounterState.targetWordGoal;
    if (goal > 0) {
      const pct = Math.round((words / goal) * 100);
      const fillEl = document.getElementById('word-c-progress-fill');
      const pctEl = document.getElementById('word-c-progress-pct');
      const remEl = document.getElementById('word-c-progress-remaining');

      if (fillEl) {
        fillEl.style.width = `${Math.min(pct, 100)}%`;
        if (pct >= 85 && pct <= 105) fillEl.className = 'goal-fill ideal';
        else if (pct > 105) fillEl.className = 'goal-fill overflow';
        else fillEl.className = 'goal-fill';
      }

      if (pctEl) pctEl.textContent = `${pct}% Reached (${words} / ${goal} words)`;
      if (remEl) {
        if (words > goal) {
          remEl.textContent = `⚠️ +${words - goal} words over limit (Risk of penalty)`;
          remEl.style.color = '#EF4444';
        } else {
          remEl.textContent = `${goal - words} words remaining`;
          remEl.style.color = 'var(--text-secondary)';
        }
      }
    }

    // Top repeated words
    const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'were', 'which', 'their', 'there', 'they', 'will', 'been', 'would', 'could', 'should', 'about', 'into']);
    const freq = {};
    wordsArray.forEach(w => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length > 3 && !stopWords.has(clean)) {
        freq[clean] = (freq[clean] || 0) + 1;
      }
    });
    const sorted = Object.entries(freq).filter(([_, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const kwBar = document.getElementById('word-c-keywords-bar');
    const kwChips = document.getElementById('word-c-keywords-chips');
    if (kwBar && kwChips) {
      if (sorted.length > 0) {
        kwBar.style.display = 'flex';
        kwChips.innerHTML = sorted.map(([word, cnt]) => `
          <span class="kw-chip">"${word}" × ${cnt}</span>
        `).join('');
      } else {
        kwBar.style.display = 'none';
      }
    }
  }

  toggleVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.app && window.app.showToast('Speech Recognition is not supported by your browser.', 'warning');
      return;
    }

    const dictateBtn = document.getElementById('dictate-btn');
    if (this.isDictating) {
      this.recognition.stop();
      this.isDictating = false;
      if (dictateBtn) {
        dictateBtn.classList.remove('active');
        dictateBtn.innerHTML = '<i data-lucide="mic"></i> <span>Dictate (Voice)</span>';
        if (window.lucide) window.lucide.createIcons();
      }
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';

    this.recognition.onstart = () => {
      this.isDictating = true;
      if (dictateBtn) {
        dictateBtn.classList.add('active');
        dictateBtn.innerHTML = '<i data-lucide="mic-off"></i> <span>Listening... Stop</span>';
        if (window.lucide) window.lucide.createIcons();
      }
      window.app && window.app.showToast('Voice dictation active! Speak clearly into your mic.', 'info');
    };

    this.recognition.onresult = (e) => {
      let finalTranscript = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
      }
      if (finalTranscript) {
        const textarea = document.getElementById('word-counter-textarea');
        if (textarea) {
          textarea.value = (textarea.value + ' ' + finalTranscript).trim();
          this.wordCounterState.text = textarea.value;
          this.updateWordCounterStats(textarea.value);
        }
      }
    };

    this.recognition.onerror = () => {
      this.isDictating = false;
      if (dictateBtn) {
        dictateBtn.classList.remove('active');
        dictateBtn.innerHTML = '<i data-lucide="mic"></i> <span>Dictate (Voice)</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    };

    this.recognition.start();
  }

  speakTextAloud() {
    const textarea = document.getElementById('word-counter-textarea');
    if (!textarea || !textarea.value.trim()) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }

    const utter = new SpeechSynthesisUtterance(textarea.value);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
    window.app && window.app.showToast('Speaking answer aloud. Click again to stop.', 'info');
  }

  convertTextCase(type) {
    const textarea = document.getElementById('word-counter-textarea');
    if (!textarea) return;
    const val = textarea.value;

    if (type === 'upper') textarea.value = val.toUpperCase();
    else if (type === 'lower') textarea.value = val.toLowerCase();
    else if (type === 'title') textarea.value = val.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    this.wordCounterState.text = textarea.value;
    this.updateWordCounterStats(textarea.value);
  }

  loadSampleAnswer() {
    const sample = `Question: "The Indian Constitution is a living document that constantly evolves to reflect contemporary socio-economic realities." Discuss with relevant judicial pronouncements. (150 Words, 10 Marks)\n\nAnswer:\nThe Constitution of India is termed a 'living document' because it is not a static code of rules, but an organic framework capable of adapting to changing societal dynamics while preserving its core foundational values.\n\nKey Mechanisms of Evolution:\n1. Transformative Constitutionalism: In Navtej Johar (2018) and K.S. Puttaswamy (2017), the Supreme Court recognized dignity, bodily autonomy, and privacy as intrinsic components of Article 21.\n2. Doctrine of Basic Structure: The landmark Kesavananda Bharati (1973) ruling harmonized the Parliament's constituent power under Article 368 with judicial guardianship, preventing executive absolutism.\n3. Expanding Rights: The judiciary has read right to clean environment (Subhash Kumar) and right to livelihood into Article 21.\n\nConclusion:\nThrough dynamic interpretation and constitutional morality, India's Constitution remains resilient, bridging timeless democratic ideals with modern aspirations.`;

    const textarea = document.getElementById('word-counter-textarea');
    if (textarea) {
      textarea.value = sample;
      this.wordCounterState.text = sample;
      this.updateWordCounterStats(sample);
      window.app && window.app.showToast('Loaded sample UPSC 150-word answer', 'info');
    }
  }

  copyEditorText() {
    const textarea = document.getElementById('word-counter-textarea');
    if (!textarea || !textarea.value.trim()) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
      window.app && window.app.showToast('Copied to clipboard!', 'success');
      if (window.audioEngine) window.audioEngine.playClick();
    });
  }

  clearEditorText() {
    const textarea = document.getElementById('word-counter-textarea');
    if (!textarea) return;
    textarea.value = '';
    this.wordCounterState.text = '';
    this.updateWordCounterStats('');
    window.app && window.app.showToast('Text cleared', 'info');
  }

  // =========================================================================
  // TOOL 8: STUDY POMODORO TIMER (40Hz Gamma Audio & Subject Tracker)
  // =========================================================================
  templatePomodoro() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #059669 0%, #047857 100%);">
              <i data-lucide="clock"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Deep Study Pomodoro & Soundscapes</h2>
              <p class="tool-card-subheading">Scientifically proven 25-minute study intervals, synthesized 40Hz Gamma binaural beats, gentle rain noise & subject tracking.</p>
            </div>
          </div>
        </div>

        <div class="tool-workbench" style="display:block;">
          <div class="pomodoro-stage">
            <!-- Mode Switcher Tabs -->
            <div class="pomo-mode-nav">
              <button type="button" class="pomo-mode-btn ${this.pomodoroState.mode === 'focus' ? 'active' : ''}" onclick="toolsView.setPomodoroMode('focus', 25)">
                <i data-lucide="brain"></i> Deep Focus (25m)
              </button>
              <button type="button" class="pomo-mode-btn ${this.pomodoroState.mode === 'short-break' ? 'active' : ''}" onclick="toolsView.setPomodoroMode('short-break', 5)">
                <i data-lucide="coffee"></i> Short Break (5m)
              </button>
              <button type="button" class="pomo-mode-btn ${this.pomodoroState.mode === 'long-break' ? 'active' : ''}" onclick="toolsView.setPomodoroMode('long-break', 15)">
                <i data-lucide="sunset"></i> Long Break (15m)
              </button>
            </div>

            <!-- Subject Tag Bar -->
            <div class="pomo-subject-bar">
              <label for="pomo-subject-select"><i data-lucide="book-open"></i> Study Subject:</label>
              <select id="pomo-subject-select" class="tool-select-sm" onchange="toolsView.setPomodoroSubject(this.value)">
                <option value="General Studies (UPSC)" selected>General Studies (UPSC)</option>
                <option value="Polity & Constitution">Polity & Constitution</option>
                <option value="Modern History">Modern History</option>
                <option value="Geography & Environment">Geography & Environment</option>
                <option value="Economy & CSAT">Economy & CSAT</option>
                <option value="Ethics & Essay">Ethics & Essay</option>
              </select>
            </div>

            <!-- Circular Countdown Dial -->
            <div class="pomo-dial-wrap">
              <div class="pomo-outer-glow ${this.pomodoroState.isRunning ? 'running' : ''}"></div>
              <svg class="pomo-dial-svg" viewBox="0 0 260 260">
                <circle class="pomo-dial-track" cx="130" cy="130" r="115"></circle>
                <circle class="pomo-dial-progress" id="pomo-progress-ring" cx="130" cy="130" r="115"></circle>
              </svg>
              <div class="pomo-dial-center">
                <span class="pomo-time-digits" id="pomo-time-display">${this.formatTimerTime(this.pomodoroState.timeLeft)}</span>
                <span class="pomo-status-label" id="pomo-status-label">
                  ${this.pomodoroState.mode === 'focus' ? '🎯 Intense Study Time' : '☕ Relax & Recharge'}
                </span>
              </div>
            </div>

            <!-- Control Buttons -->
            <div class="pomo-controls-row">
              <button type="button" id="pomo-toggle-btn" class="btn btn-primary btn-lg pomo-action-main" onclick="toolsView.togglePomodoro()">
                <i data-lucide="${this.pomodoroState.isRunning ? 'pause' : 'play'}"></i>
                <span>${this.pomodoroState.isRunning ? 'Pause' : 'Start Focus'}</span>
              </button>
              <button type="button" class="btn btn-secondary pomo-action-sub" onclick="toolsView.resetPomodoro()" title="Reset Timer">
                <i data-lucide="rotate-ccw"></i> Reset
              </button>
              <button type="button" class="btn btn-secondary pomo-action-sub" onclick="toolsView.skipPomodoro()" title="Skip Interval">
                <i data-lucide="skip-forward"></i> Skip
              </button>
            </div>

            <!-- Synthesized Ambient Soundscapes Bar -->
            <div class="pomo-soundscape-panel">
              <span class="soundscape-title"><i data-lucide="headphones"></i> Ambient Focus Soundscapes (Web Audio):</span>
              <div class="soundscape-buttons-row">
                <button type="button" class="sound-pill ${this.activeSoundscape === 'none' ? 'active' : ''}" onclick="toolsView.setAmbientSound('none')">Off</button>
                <button type="button" class="sound-pill ${this.activeSoundscape === 'binaural' ? 'active' : ''}" onclick="toolsView.setAmbientSound('binaural')">
                  <i data-lucide="waves"></i> 40Hz Gamma Waves (Focus)
                </button>
                <button type="button" class="sound-pill ${this.activeSoundscape === 'rain' ? 'active' : ''}" onclick="toolsView.setAmbientSound('rain')">
                  <i data-lucide="cloud-rain"></i> Gentle Rainfall
                </button>
              </div>
            </div>

            <!-- Session Stats Badge -->
            <div class="pomo-session-badge">
              <span>🍅 Today's Focus Sessions:</span>
              <strong id="pomo-session-count">${this.pomodoroState.completedSessions}</strong>
              <span>(${this.pomodoroState.completedSessions * 25} minutes logged)</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initPomodoroEvents() {
    this.updatePomodoroDisplay();
  }

  setPomodoroSubject(sub) {
    this.pomodoroState.currentSubject = sub;
  }

  setPomodoroMode(mode, minutes) {
    if (window.audioEngine) window.audioEngine.playClick();
    if (this.pomodoroInterval) {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
    }

    this.pomodoroState.mode = mode;
    this.pomodoroState.totalTime = minutes * 60;
    this.pomodoroState.timeLeft = minutes * 60;
    this.pomodoroState.isRunning = false;

    document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(mode));
    });

    const label = document.getElementById('pomo-status-label');
    if (label) {
      label.textContent = mode === 'focus' ? '🎯 Intense Study Time' : '☕ Relax & Recharge';
    }

    const toggleBtn = document.getElementById('pomo-toggle-btn');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i data-lucide="play"></i> <span>Start ' + (mode === 'focus' ? 'Focus' : 'Break') + '</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    this.updatePomodoroDisplay();
  }

  togglePomodoro() {
    if (window.audioEngine) window.audioEngine.playClick();
    if (this.pomodoroState.isRunning) {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
      this.pomodoroState.isRunning = false;
      this.stopAmbientSound();
    } else {
      this.pomodoroState.isRunning = true;
      this.pomodoroInterval = setInterval(() => this.tickPomodoro(), 1000);
      if (this.activeSoundscape !== 'none') {
        this.startAmbientSound(this.activeSoundscape);
      }
    }

    const toggleBtn = document.getElementById('pomo-toggle-btn');
    const glow = document.querySelector('.pomo-outer-glow');

    if (toggleBtn) {
      toggleBtn.innerHTML = this.pomodoroState.isRunning
        ? '<i data-lucide="pause"></i> <span>Pause</span>'
        : '<i data-lucide="play"></i> <span>Resume</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    if (glow) glow.classList.toggle('running', this.pomodoroState.isRunning);
  }

  tickPomodoro() {
    if (this.pomodoroState.timeLeft > 0) {
      this.pomodoroState.timeLeft--;
      this.updatePomodoroDisplay();
    } else {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
      this.pomodoroState.isRunning = false;
      this.stopAmbientSound();

      if (window.audioEngine) window.audioEngine.playCelebration();

      if (this.pomodoroState.mode === 'focus') {
        this.pomodoroState.completedSessions++;
        localStorage.setItem('hamsa_pomo_completed', String(this.pomodoroState.completedSessions));
        window.app && window.app.showToast('🎉 Focus session completed! Great job. Time for a 5 min break.', 'success');
        this.setPomodoroMode('short-break', 5);
      } else {
        window.app && window.app.showToast('☕ Break over! Ready to focus again?', 'info');
        this.setPomodoroMode('focus', 25);
      }
    }
  }

  resetPomodoro() {
    if (window.audioEngine) window.audioEngine.playClick();
    if (this.pomodoroInterval) {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
    }
    this.pomodoroState.isRunning = false;
    this.pomodoroState.timeLeft = this.pomodoroState.totalTime;
    this.stopAmbientSound();

    const toggleBtn = document.getElementById('pomo-toggle-btn');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i data-lucide="play"></i> <span>Start Focus</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    const glow = document.querySelector('.pomo-outer-glow');
    if (glow) glow.classList.remove('running');

    this.updatePomodoroDisplay();
  }

  skipPomodoro() {
    if (window.audioEngine) window.audioEngine.playClick();
    if (this.pomodoroState.mode === 'focus') {
      this.setPomodoroMode('short-break', 5);
    } else {
      this.setPomodoroMode('focus', 25);
    }
  }

  updatePomodoroDisplay() {
    const timeDisplay = document.getElementById('pomo-time-display');
    const ring = document.getElementById('pomo-progress-ring');
    const countEl = document.getElementById('pomo-session-count');

    if (timeDisplay) timeDisplay.textContent = this.formatTimerTime(this.pomodoroState.timeLeft);

    if (ring && this.pomodoroState.totalTime > 0) {
      const circumference = 2 * Math.PI * 115;
      const progress = (this.pomodoroState.totalTime - this.pomodoroState.timeLeft) / this.pomodoroState.totalTime;
      const offset = circumference - (progress * circumference);
      ring.style.strokeDasharray = `${circumference}`;
      ring.style.strokeDashoffset = `${offset}`;
    }

    if (countEl) countEl.textContent = this.pomodoroState.completedSessions;
  }

  // Web Audio Synthesizer: 40Hz Gamma & Rain generator
  setAmbientSound(type) {
    if (window.audioEngine) window.audioEngine.playClick();
    this.activeSoundscape = type;

    document.querySelectorAll('.sound-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(type));
    });

    if (type === 'none') {
      this.stopAmbientSound();
    } else {
      this.startAmbientSound(type);
    }
  }

  startAmbientSound(type) {
    this.stopAmbientSound();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.audioCtx = new AudioContext();
    const masterGain = this.audioCtx.createGain();
    masterGain.gain.setValueAtTime(this.soundVolume, this.audioCtx.currentTime);
    masterGain.connect(this.audioCtx.destination);

    if (type === 'binaural') {
      // 40 Hz Gamma wave generator (Left: 200 Hz, Right: 240 Hz)
      const oscL = this.audioCtx.createOscillator();
      const oscR = this.audioCtx.createOscillator();
      oscL.type = 'sine';
      oscR.type = 'sine';
      oscL.frequency.value = 200;
      oscR.frequency.value = 240;

      const panL = this.audioCtx.createStereoPanner ? this.audioCtx.createStereoPanner() : null;
      const panR = this.audioCtx.createStereoPanner ? this.audioCtx.createStereoPanner() : null;

      if (panL && panR) {
        panL.pan.value = -1;
        panR.pan.value = 1;
        oscL.connect(panL);
        panL.connect(masterGain);
        oscR.connect(panR);
        panR.connect(masterGain);
      } else {
        oscL.connect(masterGain);
        oscR.connect(masterGain);
      }

      oscL.start();
      oscR.start();
      this.binauralNodes = { oscL, oscR, masterGain };
    } else if (type === 'rain') {
      // Synthesized gentle rainfall using low-pass filtered brown noise
      const bufferSize = this.audioCtx.sampleRate * 2;
      const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }

      const whiteNoise = this.audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();
      this.rainNodes = { whiteNoise, masterGain };
    }
  }

  stopAmbientSound() {
    if (this.binauralNodes) {
      try {
        this.binauralNodes.oscL.stop();
        this.binauralNodes.oscR.stop();
      } catch (e) {}
      this.binauralNodes = null;
    }
    if (this.rainNodes) {
      try {
        this.rainNodes.whiteNoise.stop();
      } catch (e) {}
      this.rainNodes = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
  }

  // =========================================================================
  // TOOL 9: EXAM MARKS & CGPA CALCULATOR (Negative Marking & Cutoffs)
  // =========================================================================
  templateExamCalculator() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #0891b2 0%, #0e7490 100%);">
              <i data-lucide="calculator"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Exam Marks & University CGPA Calculator</h2>
              <p class="tool-card-subheading">Instant negative marking calculator for UPSC, SSC & banking exams, plus university CGPA to percentage converter.</p>
            </div>
          </div>
        </div>

        <div class="tool-workbench" style="display:block;">
          <div class="tool-two-col-grid">
            <!-- Left: Negative Marking Calculator -->
            <div class="tool-control-panel">
              <h3 class="panel-section-title"><i data-lucide="minus-circle"></i> Competitive Exam Negative Marking</h3>
              
              <div class="dimension-inputs-row">
                <div class="input-field-group">
                  <label for="calc-total-q">Total Questions</label>
                  <input type="number" id="calc-total-q" class="tool-input-num" value="100">
                </div>
                <div class="input-field-group">
                  <label for="calc-attempted">Attempted</label>
                  <input type="number" id="calc-attempted" class="tool-input-num" value="85">
                </div>
                <div class="input-field-group">
                  <label for="calc-correct">Correct</label>
                  <input type="number" id="calc-correct" class="tool-input-num" value="72">
                </div>
              </div>

              <!-- Exam Preset Chips -->
              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">Exam Marking Schemes</label>
                <div class="quick-preset-chips">
                  <button type="button" class="preset-chip active" onclick="toolsView.setMarkingPreset(2, 0.666)">UPSC Prelims (+2, -0.66)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.setMarkingPreset(1, 0.25)">SSC CGL / Bank (+1, -0.25)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.setMarkingPreset(4, 1.0)">JEE / NEET (+4, -1.0)</button>
                  <button type="button" class="preset-chip" onclick="toolsView.setMarkingPreset(2.5, 0.833)">UPSC CSAT (+2.5, -0.83)</button>
                </div>
              </div>

              <!-- Live Exam Score Summary -->
              <div class="exam-score-display-card">
                <div class="score-main-row">
                  <div>
                    <span class="score-label">Net Score</span>
                    <h3 class="score-number" id="calc-net-score">135.4</h3>
                    <span class="score-sub" id="calc-max-marks">out of 200 Marks</span>
                  </div>
                  <div class="score-accuracy-box">
                    <span class="acc-label">Accuracy</span>
                    <h4 class="acc-val" id="calc-accuracy">84.7%</h4>
                  </div>
                </div>

                <div class="score-breakdown-chips">
                  <span class="score-chip green" id="calc-gross-marks">+144.0 Gross</span>
                  <span class="score-chip red" id="calc-penalty-marks">-8.6 Penalty</span>
                  <span class="score-chip muted" id="calc-skipped-q">15 Skipped</span>
                </div>
              </div>
            </div>

            <!-- Right: CGPA to Percentage Converter -->
            <div class="tool-control-panel">
              <h3 class="panel-section-title"><i data-lucide="graduation-cap"></i> University CGPA to Percentage</h3>

              <div class="input-field-group">
                <label for="cgpa-input">Enter Your Cumulative CGPA (1 to 10)</label>
                <input type="number" id="cgpa-input" class="tool-input-num" step="0.01" min="0" max="10" value="8.50">
              </div>

              <div class="control-group" style="margin-top:1.25rem;">
                <label class="control-label">University / Board Formula</label>
                <div class="pill-radio-group" id="cgpa-formula-group">
                  <button type="button" class="format-btn active" onclick="toolsView.setCgpaFormula('cbse')">CBSE (× 9.5)</button>
                  <button type="button" class="format-btn" onclick="toolsView.setCgpaFormula('vtu')">VTU / Engg</button>
                  <button type="button" class="format-btn" onclick="toolsView.setCgpaFormula('mumbai')">Mumbai Univ</button>
                  <button type="button" class="format-btn" onclick="toolsView.setCgpaFormula('direct')">Direct (× 10)</button>
                </div>
              </div>

              <!-- CGPA Results Card -->
              <div class="exam-score-display-card" style="margin-top:1.5rem;">
                <div class="score-main-row">
                  <div>
                    <span class="score-label">Equivalent Percentage</span>
                    <h3 class="score-number" id="cgpa-percent-val" style="color:var(--color-primary-light);">80.75%</h3>
                    <span class="score-sub" id="cgpa-formula-desc">Formula: CGPA × 9.5</span>
                  </div>
                  <div class="score-accuracy-box">
                    <span class="acc-label">Division</span>
                    <h4 class="acc-val" id="cgpa-division-badge" style="color:#10b981;">1st Class Dist.</h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initExamCalcEvents() {
    const totalQ = document.getElementById('calc-total-q');
    const attempted = document.getElementById('calc-attempted');
    const correct = document.getElementById('calc-correct');
    const cgpaInput = document.getElementById('cgpa-input');

    const updateExam = () => {
      this.examCalcState.totalQ = parseInt(totalQ?.value || '100', 10);
      this.examCalcState.attempted = parseInt(attempted?.value || '0', 10);
      this.examCalcState.correct = parseInt(correct?.value || '0', 10);
      this.updateExamCalcResults();
    };

    if (totalQ) totalQ.oninput = updateExam;
    if (attempted) attempted.oninput = updateExam;
    if (correct) correct.oninput = updateExam;

    if (cgpaInput) {
      cgpaInput.oninput = () => {
        this.cgpaState.cgpa = parseFloat(cgpaInput.value || '0');
        this.updateCgpaResults();
      };
    }

    this.updateExamCalcResults();
    this.updateCgpaResults();
  }

  setMarkingPreset(correctMarks, penaltyMarks) {
    this.examCalcState.markPerCorrect = correctMarks;
    this.examCalcState.penaltyPerWrong = penaltyMarks;
    this.updateExamCalcResults();
  }

  updateExamCalcResults() {
    const { totalQ, attempted, correct, markPerCorrect, penaltyPerWrong } = this.examCalcState;
    const wrong = Math.max(0, attempted - correct);
    const skipped = Math.max(0, totalQ - attempted);

    const gross = correct * markPerCorrect;
    const penalty = wrong * penaltyPerWrong;
    const net = Math.max(0, gross - penalty);
    const maxMarks = totalQ * markPerCorrect;
    const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : '0.0';

    const netScoreEl = document.getElementById('calc-net-score');
    if (netScoreEl) netScoreEl.textContent = net.toFixed(2);

    const maxMarksEl = document.getElementById('calc-max-marks');
    if (maxMarksEl) maxMarksEl.textContent = `out of ${maxMarks} Marks`;

    const accEl = document.getElementById('calc-accuracy');
    if (accEl) accEl.textContent = `${accuracy}%`;

    const grossEl = document.getElementById('calc-gross-marks');
    if (grossEl) grossEl.textContent = `+${gross.toFixed(1)} Gross`;

    const penEl = document.getElementById('calc-penalty-marks');
    if (penEl) penEl.textContent = `-${penalty.toFixed(1)} Penalty`;

    const skipEl = document.getElementById('calc-skipped-q');
    if (skipEl) skipEl.textContent = `${skipped} Skipped`;
  }

  setCgpaFormula(type) {
    this.cgpaState.formula = type;
    document.querySelectorAll('#cgpa-formula-group .format-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('onclick').includes(type));
    });
    this.updateCgpaResults();
  }

  updateCgpaResults() {
    const cgpa = this.cgpaState.cgpa;
    let pct = 0;
    let desc = '';

    if (this.cgpaState.formula === 'cbse') {
      pct = cgpa * 9.5;
      desc = 'Formula: CGPA × 9.5';
    } else if (this.cgpaState.formula === 'vtu') {
      pct = (cgpa - 0.75) * 10;
      desc = 'Formula: (CGPA - 0.75) × 10';
    } else if (this.cgpaState.formula === 'mumbai') {
      pct = 7.1 * cgpa + 11;
      desc = 'Formula: 7.1 × CGPA + 11';
    } else {
      pct = cgpa * 10;
      desc = 'Formula: CGPA × 10';
    }

    pct = Math.max(0, Math.min(100, pct));

    let divBadge = '1st Class';
    if (pct >= 75) divBadge = '1st Class Distinction';
    else if (pct >= 60) divBadge = '1st Division';
    else if (pct >= 50) divBadge = '2nd Division';
    else divBadge = 'Passed';

    const pctEl = document.getElementById('cgpa-percent-val');
    if (pctEl) pctEl.textContent = `${pct.toFixed(2)}%`;

    const descEl = document.getElementById('cgpa-formula-desc');
    if (descEl) descEl.textContent = desc;

    const divEl = document.getElementById('cgpa-division-badge');
    if (divEl) divEl.textContent = divBadge;
  }

  // =========================================================================
  // TOOL 10: NOTES & MARKDOWN TO A4 FORMATTER
  // =========================================================================
  templateNotesToPdf() {
    return `
      <div class="tool-card-container">
        <div class="tool-card-header">
          <div class="tool-card-title-wrap">
            <span class="tool-icon-badge" style="background:linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);">
              <i data-lucide="printer"></i>
            </span>
            <div>
              <h2 class="tool-card-heading">Study Notes to Print-Ready A4 PDF</h2>
              <p class="tool-card-subheading">Paste syllabus summaries, formula cheat-sheets, or revision notes and export beautifully formatted print-ready A4 PDFs with watermarks.</p>
            </div>
          </div>
        </div>

        <div class="tool-workbench" style="display:block;">
          <div class="tool-two-col-grid">
            <div class="tool-control-panel">
              <h3 class="panel-section-title"><i data-lucide="edit-3"></i> Document Configuration</h3>

              <div class="input-field-group">
                <label for="notes-doc-title">Document Title / Subject</label>
                <input type="text" id="notes-doc-title" class="tool-text-input" value="${this.notesDocState.title}">
              </div>

              <div class="input-field-group" style="margin-top:1rem;">
                <label for="notes-doc-watermark">Optional Watermark</label>
                <input type="text" id="notes-doc-watermark" class="tool-text-input" value="${this.notesDocState.watermark}">
              </div>

              <div class="control-group" style="margin-top:1rem;">
                <label class="control-label">Typography Style</label>
                <div class="pill-radio-group">
                  <button type="button" class="format-btn active">Modern Sans</button>
                  <button type="button" class="format-btn">Classic Serif</button>
                </div>
              </div>

              <div class="workbench-action-row" style="margin-top:1.5rem;">
                <button id="notes-doc-export-btn" class="btn btn-primary btn-lg" style="width:100%; display:flex; align-items:center; justify-content:center; gap:0.6rem;">
                  <i data-lucide="download"></i>
                  <span>Export Print-Ready A4 PDF</span>
                </button>
              </div>
            </div>

            <div class="tool-preview-panel">
              <div class="counter-editor-wrapper">
                <div class="editor-toolbar">
                  <span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Type or Paste Study Notes Content:</span>
                  <button type="button" class="toolbar-btn" onclick="toolsView.loadSampleStudySheet()">Load Sample Formula Sheet</button>
                </div>
                <textarea id="notes-doc-textarea" class="word-counter-textarea" placeholder="Paste your study notes, key definitions, or formulas here..." rows="14"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initNotesToPdfEvents() {
    const exportBtn = document.getElementById('notes-doc-export-btn');
    const textarea = document.getElementById('notes-doc-textarea');

    if (textarea) {
      if (!this.notesDocState.content) this.loadSampleStudySheet();
      else textarea.value = this.notesDocState.content;
      textarea.oninput = () => { this.notesDocState.content = textarea.value; };
    }

    if (exportBtn) {
      exportBtn.onclick = () => this.exportNotesDocAsPdf();
    }
  }

  loadSampleStudySheet() {
    const sample = `1. FUNDAMENTAL RIGHTS (PART III, ARTICLES 12-35)
• Article 14: Equality before law and equal protection of laws.
• Article 19: Protection of 6 democratic freedoms (Speech, Assembly, Association, Movement, Residence, Profession).
• Article 21: Protection of life and personal liberty. Interpreted broadly in Maneka Gandhi (1978) to require procedure that is just, fair and reasonable.
• Article 32: Right to Constitutional Remedies. Dr. B.R. Ambedkar termed it "the heart and soul of the Constitution".

2. DIRECTIVE PRINCIPLES OF STATE POLICY (PART IV, ARTICLES 36-51)
• Article 38: State to secure a social order for the promotion of welfare of the people.
• Article 39A: Equal justice and free legal aid.
• Article 44: Uniform Civil Code for the citizens across the territory of India.
• Article 50: Separation of judiciary from executive in the public services.

3. IMPORTANT WRITS UNDER ARTICLE 32 & 226
• Habeas Corpus: "To have the body of" — Protects against unlawful detention.
• Mandamus: "We command" — Compels a public official to perform statutory duty.
• Quo-Warranto: "By what authority" — Inquires into the legality of claim to public office.`;

    const textarea = document.getElementById('notes-doc-textarea');
    if (textarea) {
      textarea.value = sample;
      this.notesDocState.content = sample;
    }
  }

  async exportNotesDocAsPdf() {
    const jsPdfConstructor = window.jspdf?.jsPDF || window.jsPDF;
    if (!jsPdfConstructor) {
      window.app && window.app.showToast('jsPDF library is not loaded.', 'error');
      return;
    }

    const title = document.getElementById('notes-doc-title')?.value || 'Study Notes';
    const watermark = document.getElementById('notes-doc-watermark')?.value || '';
    const content = document.getElementById('notes-doc-textarea')?.value || '';

    if (!content.trim()) {
      window.app && window.app.showToast('Please enter some notes content to export.', 'warning');
      return;
    }

    const doc = new jsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 16;
    const maxTextW = pageW - margin * 2;

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(title, margin, margin + 4);

    // Subtitle line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 8, pageW - margin, margin + 8);

    // Content split lines
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(51, 65, 85);
    const splitLines = doc.splitTextToSize(content, maxTextW);

    let curY = margin + 16;
    const lineH = 6;

    for (let i = 0; i < splitLines.length; i++) {
      if (curY > pageH - margin) {
        // Add watermark to previous page if requested
        if (watermark) {
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(watermark, pageW / 2, pageH - 8, { align: 'center' });
        }
        doc.addPage('a4', 'portrait');
        curY = margin + 8;
        doc.setFontSize(10.5);
        doc.setTextColor(51, 65, 85);
      }
      doc.text(splitLines[i], margin, curY);
      curY += lineH;
    }

    if (watermark) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(watermark, pageW / 2, pageH - 8, { align: 'center' });
    }

    const blob = doc.output('blob');
    UIUtils.downloadBlob(blob, `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`);

    if (window.audioEngine) window.audioEngine.playCelebration();
    window.app && window.app.showToast('A4 Study Notes PDF downloaded!', 'success');
  }
}

// Global Singleton
window.toolsView = new ToolsView();
