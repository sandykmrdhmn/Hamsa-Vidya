/**
 * HAMSA VIDYA (हंस विद्या) — Exam Alerts & Eligibility View Controller
 * Ultra-Premium dashboard for discovering exams, checking eligibility, and tracking deadlines.
 * Features Central vs State Govt filtering, Education fast-filters, rich card specs, and live RSS sync.
 */

class ExamAlertsView {
  constructor() {
    this.container = document.getElementById('view-exam-alerts');
    this.state = {
      exams: [],
      filteredExams: [],
      savedIds: new Set(),
      searchQuery: '',
      activeFilter: 'ALL',
      sortBy: 'deadline_asc',
      orgFilter: '',
      govtTypeFilter: 'ALL',       // 'ALL' | 'CENTRAL' | 'STATE'
      stateFilter: '',             // '' or specific state name
      educationLevelFilter: 'ALL', // 'ALL' | '10TH_PASS' | '12TH_PASS' | 'GRADUATE' | 'ENGINEERING' | 'POST_GRADUATE'
      viewMode: 'cards',           // 'cards' | 'table'
      showProfileForm: false,
      summaryModal: null,
      detailsModal: null,
      summaryLoading: false,
      summaryResult: null,
      profileErrors: {},
      isSyncing: false,
      lastSynced: null
    };

    this._searchTimer = null;
  }

  async render() {
    this.container = document.getElementById('view-exam-alerts');
    if (!this.container) return;

    this.container.innerHTML = this._renderSkeleton();
    app.refreshIcons();

    try {
      const [exams, savedIds] = await Promise.all([
        window.examService.getAllExams(),
        window.examService.getSavedExamIds()
      ]);

      this.state.exams = exams;
      this.state.savedIds = savedIds;

      window.examProfileManager.loadProfile();
      this._computeEligibility();
      this._applyFiltersAndSort();
      this._renderFull();
    } catch (err) {
      console.error('ExamAlertsView render error:', err);
      this.container.innerHTML = `
        <div class="ea-error-state">
          <i data-lucide="alert-triangle" style="width:48px;height:48px;color:var(--color-error);"></i>
          <h3>Unable to load exam data</h3>
          <p>${err.message || 'An unexpected error occurred. Please try again.'}</p>
          <button class="btn btn-primary" onclick="window.examAlertsView.render()">
            <i data-lucide="refresh-cw"></i> Retry
          </button>
        </div>
      `;
      app.refreshIcons();
    }
  }

  // ==========================================================================
  // ELIGIBILITY COMPUTATION
  // ==========================================================================
  _computeEligibility() {
    const profile = window.examProfileManager.getProfile();
    this.state.exams.forEach(exam => {
      if (profile && window.examProfileManager.isProfileComplete()) {
        exam._eligibilityResult = window.eligibilityEngine.checkEligibility(profile, exam.eligibility);
      } else {
        exam._eligibilityResult = {
          status: 'INCOMPLETE',
          eligible: false,
          needsVerification: false,
          checks: {},
          reasons: ['Complete your profile to check live eligibility.'],
          warnings: []
        };
      }
    });
  }

  // ==========================================================================
  // FILTER & SORT
  // ==========================================================================
  _applyFiltersAndSort() {
    let exams = [...this.state.exams];

    // Text search
    if (this.state.searchQuery) {
      const q = this.state.searchQuery.toLowerCase();
      exams = exams.filter(e =>
        (e.examName || '').toLowerCase().includes(q) ||
        (e.shortName || '').toLowerCase().includes(q) ||
        (e.organizingBody || '').toLowerCase().includes(q) ||
        (e.state || '').toLowerCase().includes(q)
      );
    }

    const filters = {};
    if (this.state.activeFilter === 'ELIGIBLE') filters.eligibility = 'ELIGIBLE';
    else if (this.state.activeFilter === 'NOT_ELIGIBLE') filters.eligibility = 'NOT_ELIGIBLE';
    else if (this.state.activeFilter === 'CLOSING_SOON') filters.closingSoon = true;
    else if (this.state.activeFilter === 'SAVED') { filters.saved = true; filters.savedIds = this.state.savedIds; }

    if (this.state.orgFilter) filters.organization = this.state.orgFilter;
    if (this.state.govtTypeFilter && this.state.govtTypeFilter !== 'ALL') filters.govtType = this.state.govtTypeFilter;
    if (this.state.stateFilter) filters.state = this.state.stateFilter;
    if (this.state.educationLevelFilter && this.state.educationLevelFilter !== 'ALL') filters.educationLevel = this.state.educationLevelFilter;

    exams = window.examService.filterExams(exams, filters);
    exams = window.examService.sortExams(exams, this.state.sortBy);

    this.state.filteredExams = exams;
  }

  _getAvailableStates() {
    const states = new Set();
    this.state.exams.forEach(e => {
      if (e.govtType === 'STATE' && e.state && e.state !== 'All India') {
        states.add(e.state);
      }
    });
    return Array.from(states).sort();
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================
  _getStats() {
    const all = this.state.exams;
    const active = all.filter(e => window.examService.getDaysRemaining(e.applicationDeadline) >= 0);
    const central = all.filter(e => e.govtType === 'CENTRAL');
    const stateGovt = all.filter(e => e.govtType === 'STATE');
    const eligible = all.filter(e => window.isEligibilityPositive?.(e._eligibilityResult?.status));
    const closingSoon = all.filter(e => {
      const d = window.examService.getDaysRemaining(e.applicationDeadline);
      return d >= 0 && d <= 7;
    });
    return {
      total: active.length,
      central: central.length,
      stateGovt: stateGovt.length,
      eligible: eligible.length,
      closingSoon: closingSoon.length,
      saved: this.state.savedIds.size
    };
  }

  // ==========================================================================
  // FULL RENDER
  // ==========================================================================
  _renderFull() {
    const profile = window.examProfileManager.getProfile();
    const isComplete = window.examProfileManager.isProfileComplete();
    const completeness = window.examProfileManager.getProfileCompleteness();
    const stats = this._getStats();
    const syncInfo = window.examService && window.examService.getSyncInfo ? window.examService.getSyncInfo() : {};

    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const userName = window.examProfileManager.getStudentFirstName();

    this.container.innerHTML = `
      ${UIUtils.buildViewHero({
        accent: 'orange',
        icon: 'bell-ring',
        eyebrow: `${greeting}, ${userName} · Eligibility Radar`,
        title: 'Every notification,',
        titleAccent: 'checked against you.',
        hindi: 'परीक्षा सूचना — पात्रता की तत्काल जाँच',
        tagline: 'Read straight from the FreeJobAlert government jobs table — post date, board, post name, qualification and last date — then matched against the qualification in your profile. Nothing outside those columns is filled in.',
        stats: [
          { value: stats.total, label: 'Active exams' },
          { value: stats.eligible, label: 'You qualify for' },
          { value: stats.closingSoon, label: 'Closing soon' },
          { value: stats.saved, label: 'Saved' }
        ],
        actions: [
          {
            label: isComplete ? 'Edit Profile' : 'Complete Setup',
            icon: isComplete ? 'edit-3' : 'user-plus',
            onclick: 'app.openProfileManagerModal()',
            variant: isComplete ? 'ghost' : undefined
          }
        ]
      })}

      <!-- Profile completeness + live sync status. Kept as its own strip: both
           lines are state that changes without a full re-render. -->
      <section class="ea-hero glass-panel ea-hero-status-only">
        <div class="ea-profile-status">
          <span class="badge ${isComplete ? 'badge-success' : 'badge-warning'}">
            <i data-lucide="${isComplete ? 'check-circle' : 'alert-circle'}" style="width:12px;height:12px;"></i>
            Profile ${isComplete ? `${completeness}% Complete` : 'Incomplete — Complete to check eligibility'}
          </span>
          ${profile ? `
            <span class="ea-hero-academics-chip" onclick="app.openProfileManagerModal()" title="View/Edit Profile">
              🎓 ${SecurityUtils.escapeHtml(profile.qualification || 'Academic Profile')} • 10th: ${profile.tenthPercentage ? Number(profile.tenthPercentage) + '%' : '—'} | 12th: ${profile.twelfthPercentage ? Number(profile.twelfthPercentage) + '%' : '—'}
            </span>
          ` : ''}
        </div>
        <div class="ea-live-status-bar">
          <div class="ea-live-badge">
            <span class="ea-pulse-dot"></span>
            <span>Source: <strong>FreeJobAlert — Government Jobs table</strong></span>
            ${(syncInfo && syncInfo.lastSynced) ? `<span class="ea-synced-time">• Synced ${this._formatSyncTime(syncInfo.lastSynced)}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-outline ea-sync-btn" onclick="window.examAlertsView.refreshLiveExams()" title="Re-read the FreeJobAlert government jobs table" ${this.state.isSyncing ? 'disabled' : ''}>
            <i data-lucide="refresh-cw" class="${this.state.isSyncing ? 'ea-spin' : ''}" style="width:14px;height:14px;"></i>
            <span>${this.state.isSyncing ? 'Syncing...' : 'Sync Live Alerts'}</span>
          </button>
        </div>
      </section>

      <!-- What is blocking real verdicts, named -->
      ${this._renderProfileGapStrip()}

      <!-- Stats Grid -->
      ${this._renderStatsGrid(stats)}

      <!-- Toolbar with Central/State and Education filters -->
      ${this._renderToolbar(stats)}

      <!-- Exam List (Responsive Cards by default, Table optional) -->
      <div id="ea-exam-list-container">
        ${this._renderExamList()}
      </div>

      <!-- Exam Details Modal -->
      <div id="ea-details-modal" class="modal-overlay" onclick="window.examAlertsView.closeDetailsModal(event)">
        <div class="modal-content ea-details-modal-content" onclick="event.stopPropagation()">
          <div id="ea-details-modal-body"></div>
        </div>
      </div>

      <!-- PDF Summary Modal -->
      <div id="ea-summary-modal" class="modal-overlay" onclick="window.examAlertsView.closeSummaryModal(event)">
        <div class="modal-content ea-summary-modal-content" onclick="event.stopPropagation()">
          <div id="ea-summary-modal-body"></div>
        </div>
      </div>
    `;
    app.refreshIcons();
  }

  /**
   * Ask for the profile fields that are actually blocking verdicts, ranked by
   * how many exams each one unlocks.
   *
   * This replaces a generic "complete your profile" prompt. The count comes from
   * the eligibility results themselves, so it cannot drift from reality: if a
   * field blocks nothing, it is not asked for.
   */
  _renderProfileGapStrip() {
    if (!window.summariseMissingProfileFields) return '';

    const ranked = window.summariseMissingProfileFields(this.state.filteredExams || this.state.exams || []);
    if (ranked.length === 0) return '';

    const top = ranked.slice(0, 3);

    return `
      <section class="ea-profile-gap" style="display:flex; align-items:center; gap:0.9rem; flex-wrap:wrap; margin-bottom:1.25rem; padding:0.85rem 1.15rem; border-radius:var(--radius-lg); background:rgba(var(--color-primary-rgb),0.06); border:1px solid rgba(var(--color-primary-rgb),0.2);">
        <i data-lucide="user-cog" style="width:20px;height:20px;color:var(--color-primary-light);flex-shrink:0;"></i>
        <div style="flex:1; min-width:220px;">
          <div style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-bottom:0.2rem;">
            ${top.length === 1 ? 'One profile field is holding back your matches' : `${top.length} profile fields are holding back your matches`}
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.5;">
            ${top.map(f =>
              `<strong>${this._escape(f.label)}</strong> &mdash; ${this._escape(f.why)} ` +
              `<span style="color:var(--text-muted);">(blocks ${f.blockedCount} exam${f.blockedCount === 1 ? '' : 's'})</span>`
            ).join('<br>')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="app.openProfileManagerModal()" style="flex-shrink:0;">
          <i data-lucide="pencil" style="width:14px;height:14px;"></i>
          <span>Fill these in</span>
        </button>
      </section>
    `;
  }

  // ==========================================================================
  // STATS GRID
  // ==========================================================================
  _renderStatsGrid(stats) {
    return `
      <div class="ea-stats-grid">
        <div class="ea-stat-card metric-card spotlight-card ${this.state.activeFilter === 'ALL' && this.state.govtTypeFilter === 'ALL' ? 'active-stat' : ''}" onclick="window.examAlertsView.clearAllFilters()">
          <div class="ea-stat-icon" style="background:rgba(var(--color-primary-rgb), 0.12); color:var(--color-primary-light);">
            <i data-lucide="file-text" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.total}</div>
          <div class="ea-stat-label">Active Exams</div>
        </div>
        <div class="ea-stat-card metric-card spotlight-card ${this.state.govtTypeFilter === 'CENTRAL' ? 'active-stat' : ''}" onclick="window.examAlertsView.setGovtType('CENTRAL')">
          <div class="ea-stat-icon" style="background:rgba(59, 130, 246, 0.12); color:#60A5FA;">
            <i data-lucide="flag" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.central}</div>
          <div class="ea-stat-label">🇮🇳 Central Govt</div>
        </div>
        <div class="ea-stat-card metric-card spotlight-card ${this.state.govtTypeFilter === 'STATE' ? 'active-stat' : ''}" onclick="window.examAlertsView.setGovtType('STATE')">
          <div class="ea-stat-icon" style="background:rgba(16, 185, 129, 0.12); color:#34D399;">
            <i data-lucide="building" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.stateGovt}</div>
          <div class="ea-stat-label">🏛️ State Govt</div>
        </div>
        <div class="ea-stat-card metric-card spotlight-card ${this.state.activeFilter === 'ELIGIBLE' ? 'active-stat' : ''}" onclick="window.examAlertsView.setFilter('ELIGIBLE')">
          <div class="ea-stat-icon" style="background:var(--color-success-bg); color:var(--color-success);">
            <i data-lucide="check-circle" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.eligible}</div>
          <div class="ea-stat-label">Eligible For You</div>
        </div>
        <div class="ea-stat-card metric-card spotlight-card ${this.state.activeFilter === 'CLOSING_SOON' ? 'active-stat' : ''}" onclick="window.examAlertsView.setFilter('CLOSING_SOON')">
          <div class="ea-stat-icon" style="background:var(--color-warning-bg); color:var(--color-warning);">
            <i data-lucide="clock" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.closingSoon}</div>
          <div class="ea-stat-label">Closing Soon</div>
        </div>
        <div class="ea-stat-card metric-card spotlight-card ${this.state.activeFilter === 'SAVED' ? 'active-stat' : ''}" onclick="window.examAlertsView.setFilter('SAVED')">
          <div class="ea-stat-icon" style="background:rgba(245, 158, 11, 0.12); color:#FBBF24;">
            <i data-lucide="bookmark" style="width:22px;height:22px;"></i>
          </div>
          <div class="ea-stat-value">${stats.saved}</div>
          <div class="ea-stat-label">Saved Bookmarks</div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TOOLBAR (With Central vs State Govt & Education Level Filters)
  // ==========================================================================
  _renderToolbar(stats) {
    const orgs = window.examService.getOrganizations(this.state.exams);
    const availableStates = this._getAvailableStates();

    const filters = [
      { id: 'ALL', label: 'All Status', icon: 'list' },
      { id: 'ELIGIBLE', label: 'Eligible', icon: 'check-circle' },
      { id: 'NOT_ELIGIBLE', label: 'Not Eligible', icon: 'x-circle' },
      { id: 'CLOSING_SOON', label: 'Closing Soon', icon: 'clock' },
      { id: 'SAVED', label: 'Saved', icon: 'bookmark' }
    ];

    return `
      <div class="ea-toolbar glass-panel">
        <!-- Search, Sort & View Mode Switcher -->
        <div class="ea-search-row">
          <div class="ea-search-box">
            <i data-lucide="search" style="width:16px;height:16px;color:var(--text-muted);"></i>
            <input type="text" id="ea-search-input" placeholder="Search exams by title, organization, or state..." value="${this._escapeAttr(this.state.searchQuery)}" oninput="window.examAlertsView.handleSearch(event)">
            ${this.state.searchQuery ? '<button class="ea-search-clear" onclick="window.examAlertsView.clearSearch()"><i data-lucide="x" style="width:14px;height:14px;"></i></button>' : ''}
          </div>

          <div class="ea-sort-and-view">
            <div class="ea-sort-box">
              <select id="ea-sort-select" onchange="window.examAlertsView.handleSort(event)">
                <option value="deadline_asc" ${this.state.sortBy === 'deadline_asc' ? 'selected' : ''}>⏳ Deadline — Nearest</option>
                <option value="deadline_desc" ${this.state.sortBy === 'deadline_desc' ? 'selected' : ''}>⏳ Deadline — Latest</option>
                <option value="vacancies_desc" ${this.state.sortBy === 'vacancies_desc' ? 'selected' : ''}>👥 Vacancies — Most</option>
                <option value="eligibility" ${this.state.sortBy === 'eligibility' ? 'selected' : ''}>🎯 Eligibility First</option>
                <option value="name_asc" ${this.state.sortBy === 'name_asc' ? 'selected' : ''}>🔤 Name A–Z</option>
              </select>
            </div>

            <!-- View Toggle: Cards vs Table -->
            <div class="ea-view-toggle">
              <button class="ea-view-btn ${this.state.viewMode === 'cards' ? 'active' : ''}" onclick="window.examAlertsView.setViewMode('cards')" title="Rich 3D Cards View">
                <i data-lucide="layout-grid" style="width:15px;height:15px;"></i>
                <span>Cards</span>
              </button>
              <button class="ea-view-btn ${this.state.viewMode === 'table' ? 'active' : ''}" onclick="window.examAlertsView.setViewMode('table')" title="Dense Table View">
                <i data-lucide="table" style="width:15px;height:15px;"></i>
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Central vs State Government Main Switcher -->
        <div class="ea-govt-filter-bar">
          <div class="ea-govt-toggle-group">
            <button class="ea-govt-tab ${this.state.govtTypeFilter === 'ALL' ? 'active' : ''}" onclick="window.examAlertsView.setGovtType('ALL')">
              <span class="tab-icon">🌐</span>
              <span class="tab-text">All Govt Jobs</span>
              <span class="tab-count">${stats.total}</span>
            </button>
            <button class="ea-govt-tab ${this.state.govtTypeFilter === 'CENTRAL' ? 'active' : ''}" onclick="window.examAlertsView.setGovtType('CENTRAL')">
              <span class="tab-icon">🇮🇳</span>
              <span class="tab-text">Central Govt (All India)</span>
              <span class="tab-count">${stats.central}</span>
            </button>
            <button class="ea-govt-tab ${this.state.govtTypeFilter === 'STATE' ? 'active' : ''}" onclick="window.examAlertsView.setGovtType('STATE')">
              <span class="tab-icon">🏛️</span>
              <span class="tab-text">State Govt Jobs</span>
              <span class="tab-count">${stats.stateGovt}</span>
            </button>
          </div>

          <!-- State Dropdown Selector -->
          <div class="ea-state-selector-wrapper" style="${this.state.govtTypeFilter === 'STATE' ? 'display:inline-flex;' : 'display:none;'}">
            <i data-lucide="map-pin" style="width:14px;height:14px;color:var(--color-primary-light);"></i>
            <select class="ea-state-select" onchange="window.examAlertsView.handleStateFilter(event)">
              <option value="">All Indian States</option>
              ${availableStates.map(s => `<option value="${s}" ${this.state.stateFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Education Level Fast Filter Pills -->
        <div class="ea-edu-filter-row">
          <span class="ea-filter-label"><i data-lucide="graduation-cap" style="width:14px;height:14px;"></i> Qualification:</span>
          <div class="ea-edu-pills">
            <button class="ea-edu-pill ${this.state.educationLevelFilter === 'ALL' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('ALL')">All Qualifications</button>
            <button class="ea-edu-pill ${this.state.educationLevelFilter === '10TH_PASS' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('10TH_PASS')">10th Pass</button>
            <button class="ea-edu-pill ${this.state.educationLevelFilter === '12TH_PASS' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('12TH_PASS')">12th Pass</button>
            <button class="ea-edu-pill ${this.state.educationLevelFilter === 'GRADUATE' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('GRADUATE')">Graduates</button>
            <button class="ea-edu-pill ${this.state.educationLevelFilter === 'ENGINEERING' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('ENGINEERING')">B.Tech / B.E.</button>
            <button class="ea-edu-pill ${this.state.educationLevelFilter === 'POST_GRADUATE' ? 'active' : ''}" onclick="window.examAlertsView.setEducationLevel('POST_GRADUATE')">Post Graduates</button>
          </div>
        </div>

        <!-- Status & Organization Secondary Filters -->
        <div class="ea-filter-pills">
          ${filters.map(f => `
            <button class="ea-filter-pill ${this.state.activeFilter === f.id ? 'active' : ''}" onclick="window.examAlertsView.setFilter('${f.id}')">
              <i data-lucide="${f.icon}" style="width:14px;height:14px;"></i>
              <span>${f.label}</span>
            </button>
          `).join('')}
          ${orgs.length > 1 ? `
            <select class="ea-org-filter" onchange="window.examAlertsView.handleOrgFilter(event)">
              <option value="">All Organizations (${orgs.length})</option>
              ${orgs.map(o => `<option value="${o}" ${this.state.orgFilter === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // EXAM LIST (Cards or Table)
  // ==========================================================================
  _renderExamList() {
    const exams = this.state.filteredExams;
    if (exams.length === 0) {
      return this._renderEmptyState();
    }

    if (this.state.viewMode === 'table') {
      return `
        <div class="ea-table-wrapper">
          <table class="ea-table" role="table">
            <thead>
              <!-- Mirrors the source table's columns, in its order -->
              <tr>
                <th>Post Date</th>
                <th>Board</th>
                <th>Exam / Post Name</th>
                <th>Qualification</th>
                <th>Last Date</th>
                <th>Eligibility</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${exams.map(e => this._renderExamRow(e)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Default: Responsive 100x Ultra-Premium Cards Grid
    return `
      <div class="ea-cards-grid">
        ${exams.map(e => this._renderExamCard(e)).join('')}
      </div>
    `;
  }

  _renderExamCard(exam) {
    const days = window.examService.getDaysRemaining(exam.applicationDeadline);
    const urgency = window.examService.getUrgencyLevel(days);
    const result = exam._eligibilityResult || {};
    const isSaved = this.state.savedIds.has(exam.id);
    const profile = window.examProfileManager ? window.examProfileManager.getProfile() : null;

    const isCentral = exam.govtType === 'CENTRAL';
    const govtBadgeHtml = isCentral
      ? `<span class="ea-govt-tag central" title="All-India Central Government Exam"><span class="flag-circle">🇮🇳</span> Central Govt</span>`
      : `<span class="ea-govt-tag state" title="State Government Exam for ${this._escapeAttr(exam.state || 'State')}"><span class="flag-circle">🏛️</span> State: ${this._escape(exam.state || 'State')}</span>`;

    const eduBadges = (exam.educationTags || ['Graduate']).map(t => `<span class="ea-tag-pill">${this._escape(t)}</span>`).join('');

    return `
      <div class="ea-exam-card glass-panel spotlight-card ${this._isPositive(result) ? 'border-eligible' : ''}" data-exam-id="${exam.id}">
        <!-- Top Status Bar -->
        <div class="ea-card-header-bar">
          <div class="ea-header-badges">
            ${govtBadgeHtml}
            <span class="ea-urgency-pill ea-countdown-${urgency.color}">
              ${urgency.icon} ${urgency.label}
            </span>
          </div>
          <button class="ea-bookmark-btn ${isSaved ? 'saved' : ''}" onclick="window.examAlertsView.toggleBookmark(${exam.id})" aria-label="${isSaved ? 'Remove bookmark' : 'Save exam'}" title="${isSaved ? 'Saved' : 'Save to bookmarks'}">
            <i data-lucide="bookmark" style="width:18px;height:18px;${isSaved ? 'fill:var(--color-warning);color:var(--color-warning);' : ''}"></i>
          </button>
        </div>

        <!-- Title & Organizing Body -->
        <div class="ea-card-body">
          <div class="ea-card-org-name" title="${this._escapeAttr(exam.organizingBody)}">
            <i data-lucide="building-2" style="width:13px;height:13px;color:var(--color-primary-light);"></i>
            <span>${this._escape(exam.organizingBody)}</span>
          </div>
          <h3 class="ea-card-title" onclick="window.examAlertsView.openDetails(${exam.id})" title="${this._escapeAttr(exam.examName)}">
            ${this._escape(exam.examName)}
          </h3>

          <!-- The four remaining columns of the source table. The post name is
               already the card heading, so it is not repeated here.
               A blank reads as "Not stated", never as a figure. -->
          <div class="ea-specs-matrix">
            <div class="ea-spec-box">
              <span class="spec-label"><i data-lucide="calendar-plus" style="width:12px;height:12px;"></i> Post Date</span>
              ${this._specValue(exam.postDate ? this._formatDate(exam.postDate) : null)}
            </div>
            <div class="ea-spec-box">
              <span class="spec-label"><i data-lucide="landmark" style="width:12px;height:12px;"></i> Board</span>
              ${this._specValue(exam.organizingBody)}
            </div>
            <div class="ea-spec-box">
              <span class="spec-label"><i data-lucide="graduation-cap" style="width:12px;height:12px;"></i> Qualification</span>
              ${this._specValue(exam.eligibility?.qualificationText)}
            </div>
            <div class="ea-spec-box">
              <span class="spec-label"><i data-lucide="calendar-x" style="width:12px;height:12px;"></i> Last Date</span>
              ${this._specValue(exam.applicationDeadline ? this._formatDate(exam.applicationDeadline) : null)}
            </div>
          </div>

          ${this._renderDataQualityNote(exam)}

          <!-- Education Tags -->
          <div class="ea-edu-tags-row">
            <span class="edu-tags-label">Requires:</span>
            <div class="edu-tags-list">
              ${eduBadges}
            </div>
          </div>

          <!-- Eligibility Feedback Strip -->
          <div class="ea-eligibility-strip ${this._isPositive(result) ? 'strip-eligible' : result.status === 'NOT_ELIGIBLE' ? 'strip-not' : result.status === 'NEEDS_VERIFICATION' ? 'strip-verify' : 'strip-incomplete'}">
            <div class="strip-badge-wrap">
              ${this._renderEligibilityBadge(result)}
            </div>
            <div class="strip-text">${this._eligibilitySummaryLine(result, profile)}</div>
          </div>
        </div>

        <!-- Card Action Footer -->
        <div class="ea-card-footer">
          ${this._isPositive(result) && days >= 0 ? `
            <a href="${this._applyUrl(exam)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm ea-btn-apply" title="Open Official Application Portal">
              <span>Apply Online</span>
              <i data-lucide="external-link" style="width:13px;height:13px;"></i>
            </a>
          ` : ''}
          <button class="btn btn-secondary btn-sm ea-btn-details" onclick="window.examAlertsView.openDetails(${exam.id})" title="View Full Qualifications, Selection & Dates">
            <i data-lucide="eye" style="width:13px;height:13px;"></i>
            <span>Details</span>
          </button>
          <button class="btn btn-outline btn-sm ea-btn-summary" onclick="window.examAlertsView.openSummary(${exam.id})" title="Instant AI Notification Summary">
            <i data-lucide="sparkles" style="width:13px;height:13px;color:var(--color-primary-light);"></i>
            <span>AI Summary</span>
          </button>
        </div>
      </div>
    `;
  }

  _renderExamRow(exam) {
    const days = window.examService.getDaysRemaining(exam.applicationDeadline);
    const urgency = window.examService.getUrgencyLevel(days);
    const result = exam._eligibilityResult || {};
    const isSaved = this.state.savedIds.has(exam.id);
    const isCentral = exam.govtType === 'CENTRAL';

    return `
      <tr class="ea-exam-row" data-exam-id="${exam.id}">
        <td><span class="ea-deadline-date">${exam.postDate ? this._formatDate(exam.postDate) : '—'}</span></td>
        <td><span class="ea-org-text">${this._escape(exam.organizingBody || '—')}</span></td>
        <td>
          <div class="ea-exam-name-cell">
            <button class="ea-bookmark-btn ${isSaved ? 'saved' : ''}" onclick="window.examAlertsView.toggleBookmark(${exam.id})" title="${isSaved ? 'Remove bookmark' : 'Save exam'}">
              <i data-lucide="bookmark" style="width:16px;height:16px;${isSaved ? 'fill:var(--color-warning);color:var(--color-warning);' : ''}"></i>
            </button>
            <div>
              <div class="ea-table-govt-badge">
                ${isCentral ? '<span class="ea-micro-tag central">🇮🇳 Central</span>' : `<span class="ea-micro-tag state">🏛️ ${this._escape(exam.state || 'State')}</span>`}
              </div>
              <div class="ea-exam-name" role="button" tabindex="0" onclick="window.examAlertsView.openDetails(${exam.id})">${this._escape(exam.postName || exam.examName)}</div>
            </div>
          </div>
        </td>
        <td><span class="ea-org-text">${this._escape(exam.eligibility?.qualificationText || '—')}</span></td>
        <td>
          <div class="ea-countdown ea-countdown-${urgency.color}">
            <span>${urgency.icon}</span>
            <span>${urgency.label}</span>
          </div>
          <div class="ea-deadline-date">${exam.applicationDeadline ? this._formatDate(exam.applicationDeadline) : 'Not stated'}</div>
        </td>
        <td>${this._renderEligibilityBadge(result)}</td>
        <td>
          <div class="ea-actions-cell">
            ${this._isPositive(result) && days >= 0 ? `<a href="${this._applyUrl(exam)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary ea-apply-btn" title="Apply on official website"><i data-lucide="external-link" style="width:13px;height:13px;"></i></a>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="window.examAlertsView.openDetails(${exam.id})" title="View exam details"><i data-lucide="eye" style="width:13px;height:13px;"></i></button>
            <button class="btn btn-sm btn-outline" onclick="window.examAlertsView.openSummary(${exam.id})" title="AI notification summary"><i data-lucide="sparkles" style="width:13px;height:13px;"></i></button>
          </div>
        </td>
      </tr>
    `;
  }

  _renderEligibilityBadge(result) {
    if (!result || result.status === 'INCOMPLETE') {
      return '<span class="ea-elig-badge ea-elig-incomplete"><i data-lucide="user-x" style="width:13px;height:13px;"></i> Profile Needed</span>';
    }
    if (result.status === 'ELIGIBLE') {
      return '<span class="ea-elig-badge ea-elig-eligible"><i data-lucide="check-circle" style="width:13px;height:13px;"></i> Eligible to Apply</span>';
    }
    if (result.status === 'LIKELY_ELIGIBLE') {
      // Criteria matched, but they were inferred from a feed rather than the
      // official notification — say so instead of claiming certainty.
      return '<span class="ea-elig-badge ea-elig-eligible" title="Criteria were estimated from a job-alert feed. Verify in the official notification."><i data-lucide="check-circle" style="width:13px;height:13px;"></i> Likely Eligible &middot; verify</span>';
    }
    if (result.status === 'NEEDS_VERIFICATION') {
      return '<span class="ea-elig-badge ea-elig-verify"><i data-lucide="alert-circle" style="width:13px;height:13px;"></i> Verify Criteria</span>';
    }
    return '<span class="ea-elig-badge ea-elig-not"><i data-lucide="x-circle" style="width:13px;height:13px;"></i> Not Eligible</span>';
  }

  /** True when the user can act on this exam (eligible, with or without caveats). */
  _isPositive(result) {
    return window.isEligibilityPositive?.(result?.status) === true;
  }

  /**
   * One line explaining the verdict, naming the specific blocker.
   *
   * The old version fell back to "Complete your academic profile" whenever a
   * verdict could not be reached, which is unhelpful once eight of ten fields
   * are already filled. The engine now reports exactly which field it needed, so
   * the line can ask for that one thing.
   */
  _eligibilitySummaryLine(result, profile) {
    if (!result) return 'Add your academic profile to check eligibility.';

    const missing = result.missingProfileFields || [];
    if (result.status === 'INCOMPLETE' && missing.length) {
      const names = missing.slice(0, 2).map(m => m.label).join(' and ');
      return `Add your ${this._escape(names.toLowerCase())} — ${this._escape(missing[0].why)}.`;
    }

    if (result.status === 'NOT_ELIGIBLE' && result.reasons?.length) {
      return this._escape(result.reasons[0]);
    }

    if (result.status === 'NEEDS_VERIFICATION' && result.warnings?.length) {
      return this._escape(result.warnings[0]);
    }

    if (result.status === 'LIKELY_ELIGIBLE') {
      const unknown = result.unknownCriteria || [];
      if (unknown.length) {
        return `You match everything published so far. Still unread: ${this._escape(unknown.join(', '))}.`;
      }
      return 'You match every criterion published so far.';
    }

    if (result.status === 'ELIGIBLE') {
      const age = profile?.age;
      return age
        ? `Your age (${age} yrs) and qualification both meet the stated criteria.`
        : 'You meet every stated criterion.';
    }

    return 'Add your academic profile to check eligibility.';
  }

  /**
   * Render a spec value, or an explicit "not published" marker.
   *
   * The whole point of the pipeline rewrite is that a blank is a fact. This is
   * where that fact reaches the student — previously these boxes showed an
   * invented fee and pay scale with a small "approx." next to them.
   */
  _specValue(value) {
    if (value === null || value === undefined || value === '') {
      return '<span class="spec-value spec-value-unknown" ' +
        'title="Not published on the listing. Read from the official notification when available.">' +
        'Not published yet</span>';
    }
    return `<span class="spec-value" title="${this._escapeAttr(String(value))}">${this._escape(String(value))}</span>`;
  }

  /**
   * The link to open for an exam.
   *
   * The source table has one link per row ("More Information"), so there is no
   * separate apply URL. Previously these buttons read `exam.officialApplyUrl`,
   * which the listing reader does not set — every one of them rendered
   * `href="undefined"`.
   */
  _applyUrl(exam) {
    return this._escapeAttr(exam.officialNotificationUrl || exam.detailPageUrl || '#');
  }

  /**
   * Where this exam's data came from, and what the source does not publish.
   *
   * Citing the source is the difference between "we read this" and "trust us":
   * the student can open the exact row this card was built from. The note also
   * states plainly that the age limit is not in the table, because that is the
   * one field the eligibility engine most wants and cannot have.
   */
  _renderDataQualityNote(exam) {
    const source = (exam.dataQuality?.sources || [])[0];
    const link = exam.detailPageUrl || source?.url;

    return `
      <div class="ea-data-note" style="display:flex; align-items:flex-start; gap:0.4rem; margin-top:0.55rem; padding:0.45rem 0.6rem; background:rgba(100,116,139,0.1); border:1px solid rgba(100,116,139,0.25); border-radius:var(--radius-sm); font-size:0.74rem; line-height:1.45; color:var(--text-secondary);">
        <i data-lucide="table-2" style="width:13px;height:13px;color:#94A3B8;flex-shrink:0;margin-top:1px;"></i>
        <span>
          Read from the ${source ? this._escape(source.name) : 'source'} government jobs table.
          The age limit and fee are not in that table, so they are left blank rather than guessed.
          ${link ? `<a href="${this._escapeAttr(link)}" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary-light);">Open the full notification</a>.` : ''}
        </span>
      </div>`;
  }

  /** Inline "approx." marker. Retained for any caller still referencing it. */
  _approxMark() {
    return ' <span style="font-size:0.68rem;font-weight:600;color:#F59E0B;" title="Inferred from the feed, not read from the official notification">approx.</span>';
  }

  _renderEmptyState() {
    let message = 'No government exams match your current filters.';
    let icon = 'search-x';

    if (this.state.activeFilter === 'ELIGIBLE' && !window.examProfileManager.isProfileComplete()) {
      message = 'Complete your profile to check exam eligibility.';
      icon = 'user-plus';
    } else if (this.state.activeFilter === 'SAVED' && this.state.savedIds.size === 0) {
      message = 'No saved exams yet. Bookmark exams to track them here.';
      icon = 'bookmark';
    } else if (this.state.searchQuery) {
      message = `No exams found for "${this._escape(this.state.searchQuery)}".`;
    }

    return `
      <div class="ea-empty-state">
        <i data-lucide="${icon}" style="width:48px;height:48px;color:var(--text-muted);opacity:0.5;"></i>
        <p>${message}</p>
        <button class="btn btn-secondary btn-sm" onclick="window.examAlertsView.clearAllFilters()">
          <i data-lucide="rotate-ccw" style="width:14px;height:14px;"></i> Reset All Filters
        </button>
      </div>
    `;
  }

  _renderSkeleton() {
    return `
      <div class="ea-hero skeleton" style="height:200px;border-radius:var(--radius-xl);margin-bottom:1.75rem;"></div>
      <div class="ea-stats-grid">
        ${Array(6).fill('<div class="ea-stat-card skeleton" style="height:90px;border-radius:var(--radius-lg);"></div>').join('')}
      </div>
      <div class="skeleton" style="height:120px;border-radius:var(--radius-lg);margin-bottom:1.5rem;"></div>
      <div class="ea-cards-grid">
        ${Array(6).fill('<div class="skeleton" style="height:260px;border-radius:var(--radius-xl);"></div>').join('')}
      </div>
    `;
  }

  // ==========================================================================
  // DETAILS MODAL (100x Richer)
  // ==========================================================================
  openDetails(examId) {
    const exam = this.state.exams.find(e => e.id === examId);
    if (!exam) return;

    const days = window.examService.getDaysRemaining(exam.applicationDeadline);
    const urgency = window.examService.getUrgencyLevel(days);
    const result = exam._eligibilityResult || {};
    const e = exam.eligibility || {};
    const isCentral = exam.govtType === 'CENTRAL';

    const qualLabels = (e.qualifications || []).map(q => {
      const entry = (window.QUALIFICATION_HIERARCHY && window.QUALIFICATION_HIERARCHY[q]);
      return entry ? entry.label : q;
    });
    const uniqueQuals = [...new Set(qualLabels)];

    const modal = document.getElementById('ea-details-modal');
    const body = document.getElementById('ea-details-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div class="ea-details-header">
        <div>
          <div class="ea-modal-govt-badge">
            ${isCentral ? '<span class="ea-govt-tag central">🇮🇳 Central Govt (All India Posting)</span>' : `<span class="ea-govt-tag state">🏛️ State Govt • State of ${this._escape(exam.state || 'State')}</span>`}
          </div>
          <h2 class="ea-modal-title">${this._escape(exam.examName)}</h2>
          <span class="ea-modal-subtitle">${this._escape(exam.organizingBody)}</span>
        </div>
        <button class="ea-modal-close" onclick="window.examAlertsView.closeDetailsModal()" aria-label="Close"><i data-lucide="x" style="width:20px;height:20px;"></i></button>
      </div>

      <div class="ea-details-body">
        <!-- The three source columns not already in the modal heading.
             Vacancies, pay scale and fee are not in the source table, so they
             are not shown at all rather than shown with a placeholder. -->
        <div class="ea-modal-highlights">
          <div class="modal-metric">
            <span class="metric-label">Post Date</span>
            <span class="metric-val"></span>
          </div>
          <div class="modal-metric">
            <span class="metric-label">Board</span>
            <span class="metric-val"></span>
          </div>
          <div class="modal-metric">
            <span class="metric-label">Qualification</span>
            <span class="metric-val"></span>
          </div>
        </div>

        <!-- Important Dates & Countdown -->
        <div class="ea-detail-section">
          <h4><i data-lucide="calendar" style="width:16px;height:16px;color:#FBBF24;"></i> Important Dates</h4>
          <div class="ea-detail-row"><span class="ea-detail-label">Posted On</span><span>${exam.postDate ? this._formatDate(exam.postDate) : 'Not stated'}</span></div>
          <div class="ea-detail-row"><span class="ea-detail-label">Last Date to Apply</span><span class="ea-countdown-${urgency.color}">${exam.applicationDeadline ? `<strong>${this._formatDate(exam.applicationDeadline)}</strong> (${urgency.icon} ${urgency.label})` : 'Not stated'}</span></div>
        </div>

        <!-- Full Eligibility Criteria -->
        <div class="ea-detail-section">
          <h4><i data-lucide="shield-check" style="width:16px;height:16px;color:var(--color-success);"></i> Prescribed Eligibility Criteria</h4>
          ${e.qualificationText ? `<div class="ea-detail-row"><span class="ea-detail-label">Qualification (as listed)</span><span>${this._escape(e.qualificationText)}</span></div>` : ''}
          ${uniqueQuals.length ? `<div class="ea-detail-row"><span class="ea-detail-label">Matches</span><span>${uniqueQuals.join(', ')}</span></div>` : ''}
          <!-- The age limit is not one of the five source columns. It is stated
               as absent rather than defaulted to a plausible 18-32. -->
          <div class="ea-detail-row">
            <span class="ea-detail-label">Age Limit</span>
            <span style="color:var(--text-muted);font-style:italic;">Not in the source table — check the official notification</span>
          </div>
        </div>

        <!-- Student Eligibility Matching Results -->
        <div class="ea-detail-section">
          <h4><i data-lucide="${this._isPositive(result) ? 'check-circle' : result.status === 'NEEDS_VERIFICATION' ? 'alert-circle' : 'x-circle'}" style="width:16px;height:16px;"></i> Your Personalized Eligibility Match</h4>
          <div style="margin-bottom:0.75rem;">${this._renderEligibilityBadge(result)}</div>
          ${result.reasons?.length ? `<div class="ea-detail-reasons">${result.reasons.map(r => `<div class="ea-reason-item ea-reason-fail"><i data-lucide="x" style="width:14px;height:14px;"></i> ${this._escape(r)}</div>`).join('')}</div>` : ''}
          ${result.warnings?.length ? `<div class="ea-detail-reasons">${result.warnings.map(w => `<div class="ea-reason-item ea-reason-warn"><i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> ${this._escape(w)}</div>`).join('')}</div>` : ''}
          ${this._isPositive(result) && result.checks ? `
            <div class="ea-checks-grid">
              ${Object.entries(result.checks).map(([k, v]) => `
                <span class="ea-check-item ${v === true ? 'pass' : v === false ? 'fail' : 'verify'}">
                  <i data-lucide="${v === true ? 'check' : v === false ? 'x' : 'help-circle'}" style="width:13px;height:13px;"></i> ${k.charAt(0).toUpperCase() + k.slice(1)} Criteria Met
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="ea-detail-verified">
          <i data-lucide="shield-alert" style="width:13px;height:13px;"></i>
          <span>Live feed: ${this._escape(exam.source || 'Aggregator')} • Last verified: ${this._formatDate(exam.lastVerifiedAt)}</span>
        </div>
      </div>

      <div class="ea-details-footer">
        ${this._isPositive(result) && days >= 0 ? `<a href="${this._applyUrl(exam)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary"><i data-lucide="external-link" style="width:16px;height:16px;"></i> Apply Online Now</a>` : ''}
        <a href="${exam.officialNotificationUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><i data-lucide="file-text" style="width:16px;height:16px;"></i> Official Notification</a>
        <button class="btn btn-outline" onclick="window.examAlertsView.closeDetailsModal(); window.examAlertsView.openSummary(${exam.id});"><i data-lucide="sparkles" style="width:16px;height:16px;"></i> AI Summary</button>
      </div>
    `;

    modal.classList.add('active');
    app.refreshIcons();
  }

  closeDetailsModal(event) {
    if (event && event.target && event.target.id !== 'ea-details-modal') return;
    const modal = document.getElementById('ea-details-modal');
    if (modal) modal.classList.remove('active');
  }

  // ==========================================================================
  // AI NOTIFICATION SUMMARY MODAL
  // ==========================================================================
  async openSummary(examId) {
    const exam = this.state.exams.find(e => e.id === examId);
    if (!exam) return;

    const modal = document.getElementById('ea-summary-modal');
    const body = document.getElementById('ea-summary-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div class="ea-details-header">
        <h2><i data-lucide="sparkles" style="width:22px;height:22px;color:var(--color-primary-light);"></i> AI Notification Summary</h2>
        <button class="ea-modal-close" onclick="window.examAlertsView.closeSummaryModal()" aria-label="Close"><i data-lucide="x" style="width:20px;height:20px;"></i></button>
      </div>
      <div class="ea-summary-exam-title">${this._escape(exam.shortName || exam.examName)}</div>
      <div class="ea-summary-loading">
        <div class="ea-summary-spinner"></div>
        <p>Analyzing recruitment notification & syllabus with AI...</p>
      </div>
    `;
    modal.classList.add('active');
    app.refreshIcons();

    const result = await window.notificationSummaryService.summarizeNotification(exam);

    if (!result.success) {
      body.innerHTML = `
        <div class="ea-details-header">
          <h2><i data-lucide="sparkles" style="width:22px;height:22px;color:var(--color-primary-light);"></i> AI Notification Summary</h2>
          <button class="ea-modal-close" onclick="window.examAlertsView.closeSummaryModal()" aria-label="Close"><i data-lucide="x" style="width:20px;height:20px;"></i></button>
        </div>
        <div class="ea-summary-error">
          <i data-lucide="alert-circle" style="width:36px;height:36px;color:var(--color-error);"></i>
          <p>Unable to load the notification summary right now.</p>
          <p class="ea-summary-error-detail">${this._escape(result.error || 'Please try again or view the official notification.')}</p>
          <a href="${exam.officialNotificationUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><i data-lucide="file-text" style="width:14px;height:14px;"></i> View Official Notification</a>
        </div>
      `;
      app.refreshIcons();
      return;
    }

    body.innerHTML = `
      <div class="ea-details-header">
        <h2><i data-lucide="sparkles" style="width:22px;height:22px;color:var(--color-primary-light);"></i> AI Notification Summary</h2>
        <button class="ea-modal-close" onclick="window.examAlertsView.closeSummaryModal()" aria-label="Close"><i data-lucide="x" style="width:20px;height:20px;"></i></button>
      </div>
      <div class="ea-summary-exam-title">${this._escape(exam.shortName || exam.examName)}</div>
      <div class="ea-summary-provider badge ${result.provider === 'GEMINI_AI' ? 'badge-primary' : 'badge-muted'}">${result.provider === 'GEMINI_AI' ? '✨ Powered by Gemini AI' : '📋 Structured Summary'}</div>
      <ol class="ea-summary-points">
        ${result.summary.map(point => `<li>${this._escape(point)}</li>`).join('')}
      </ol>
      <div class="ea-summary-disclaimer">
        <i data-lucide="info" style="width:14px;height:14px;"></i>
        <span>${this._escape(result.disclaimer)}</span>
      </div>
      <div class="ea-summary-footer">
        <a href="${exam.officialNotificationUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><i data-lucide="file-text" style="width:14px;height:14px;"></i> View Full Official Notification</a>
      </div>
    `;
    app.refreshIcons();
  }

  closeSummaryModal(event) {
    if (event && event.target && event.target.id !== 'ea-summary-modal') return;
    const modal = document.getElementById('ea-summary-modal');
    if (modal) modal.classList.remove('active');
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  handleSearch(event) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.state.searchQuery = event.target.value.trim();
      this._applyFiltersAndSort();
      this._updateExamList();
    }, 250);
  }

  clearSearch() {
    this.state.searchQuery = '';
    const input = document.getElementById('ea-search-input');
    if (input) input.value = '';
    this._applyFiltersAndSort();
    this._updateExamList();
  }

  handleSort(event) {
    this.state.sortBy = event.target.value;
    this._applyFiltersAndSort();
    this._updateExamList();
  }

  setFilter(filterId) {
    this.state.activeFilter = filterId;
    this._applyFiltersAndSort();
    this._renderFull();
  }

  setGovtType(type) {
    this.state.govtTypeFilter = type;
    if (type !== 'STATE') this.state.stateFilter = '';
    this._applyFiltersAndSort();
    this._renderFull();
  }

  handleStateFilter(event) {
    this.state.stateFilter = event.target.value;
    this._applyFiltersAndSort();
    this._updateExamList();
  }

  setEducationLevel(level) {
    this.state.educationLevelFilter = level;
    this._applyFiltersAndSort();
    this._renderFull();
  }

  setViewMode(mode) {
    this.state.viewMode = mode;
    this._updateExamList();
  }

  handleOrgFilter(event) {
    this.state.orgFilter = event.target.value;
    this._applyFiltersAndSort();
    this._updateExamList();
  }

  clearAllFilters() {
    this.state.searchQuery = '';
    this.state.activeFilter = 'ALL';
    this.state.govtTypeFilter = 'ALL';
    this.state.stateFilter = '';
    this.state.educationLevelFilter = 'ALL';
    this.state.orgFilter = '';
    this._applyFiltersAndSort();
    this._renderFull();
  }

  _updateExamList() {
    const container = document.getElementById('ea-exam-list-container');
    if (container) {
      container.innerHTML = this._renderExamList();
      app.refreshIcons();
    }
  }

  openProfileModal() {
    if (window.app && window.app.openProfileManagerModal) {
      window.app.openProfileManagerModal();
    }
  }

  async toggleBookmark(examId) {
    const saved = await window.examService.toggleSaved(examId);
    this.state.savedIds = await window.examService.getSavedExamIds();

    if (saved) {
      app.showToast('Exam saved to bookmarks.', 'success');
    } else {
      app.showToast('Exam removed from bookmarks.', 'info');
    }

    this._applyFiltersAndSort();
    this._renderFull();
  }

  _escape(str) {
    return SecurityUtils.sanitizeHtml(str);
  }

  /** Strict escaping for values placed inside an HTML attribute. */
  _escapeAttr(str) {
    return UIUtils.escapeHtml(str);
  }

  _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  _formatSyncTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  async refreshLiveExams() {
    if (this.state.isSyncing) return;
    this.state.isSyncing = true;
    this._renderFull();

    try {
      app.showToast('Re-reading the FreeJobAlert government jobs table...', 'info');
      const result = await window.examService.syncLiveExams(true);
      this.state.exams = await window.examService.getAllExams();
      this.state.lastSynced = result.timestamp;
      this._computeEligibility();
      this._applyFiltersAndSort();
      this._renderFull();
      app.showToast(`✨ Synced ${result.count} active notifications!`, 'success');
    } catch (err) {
      console.error('Refresh live exams error:', err);
      app.showToast('Could not sync live notifications. Using cached data.', 'error');
    } finally {
      this.state.isSyncing = false;
      this._renderFull();
    }
  }
}

// Global singleton
window.examAlertsView = new ExamAlertsView();
