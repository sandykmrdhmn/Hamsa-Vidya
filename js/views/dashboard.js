/**
 * HAMSA VIDYA (हंस विद्या) — Dashboard / Command Centre
 *
 * Aggregates analytics from the Quiz engine, Study Notes vault, Flashcard SRS,
 * Answer Writing studio and AI Teacher.
 *
 * LAYOUT RATIONALE
 * The previous version presented eight identically-weighted metric cards and
 * nine identical action chips, so nothing guided the eye and the page read as a
 * flat wall of numbers. This version establishes hierarchy:
 *
 *   1. Masthead       — the product name, bilingual, the first thing on screen
 *   2. Shloka         — the Gita verse the app opens on
 *   3. Command centre — who you are, and the single best thing to do next
 *   4. Launchpad      — actions grouped by intent (Learn / Practise / Track)
 *   5. AI advisor     — existing personalised guidance
 *   6. Consistency    — activity heatmap, which rewards showing up daily
 *   7. Analytics      — primary metrics with rings, secondary compact
 *   8. Charts         — accuracy, trend, subject mastery
 *   9. Recent activity — what you last touched
 *
 * Every number shown comes from IndexedDB. Nothing is decorative filler.
 */

class DashboardView {
  constructor() {
    this.container = document.getElementById('view-dashboard');
  }

  async render() {
    this.container = document.getElementById('view-dashboard');
    if (!this.container) return;

    // Fetch everything in parallel — these are independent reads.
    const [stats, analytics, allQuizzes, allNotes, heatmap, momentum] = await Promise.all([
      getDashboardStats(),
      getAnalyticsData(),
      getAllQuizzes().catch(() => []),
      getAllNotes().catch(() => []),
      typeof getActivityHeatmap === 'function' ? getActivityHeatmap(84).catch(() => null) : null,
      typeof getStudyMomentum === 'function' ? getStudyMomentum().catch(() => null) : null
    ]);

    const recentQuizzes = allQuizzes.slice(0, 5);
    const recentNotes = allNotes.slice(0, 3);

    const profile = window.examProfileManager
      ? (window.examProfileManager.loadProfile() || window.examProfileManager.getProfile())
      : null;
    const firstName = (window.examProfileManager && window.examProfileManager.getStudentFirstName()) || 'Scholar';
    const sadhana = window.gurukulWisdomEngine
      ? window.gurukulWisdomEngine.getSadhanaLevel(stats.totalQuizzesTaken, stats.overallAccuracy)
      : { title: 'जिज्ञासु', badge: '✨ नव प्रवेशी', enTitle: 'Curious Seeker', level: 1 };

    const isNewUser = stats.totalQuizzesTaken === 0
      && stats.totalNotesCount === 0
      && stats.totalFlashcardDecks === 0;

    this.container.innerHTML = `
      <div class="dash">
        ${this._buildBrandMasthead()}
        ${this._buildShlokaBanner()}
        ${this._buildCommandCentre({ firstName, profile, sadhana, stats, momentum })}
        ${isNewUser ? this._buildOnboardingPath() : ''}
        ${this._buildLaunchpad(stats)}
        ${this._buildAdvisorSection()}
        ${heatmap ? this._buildConsistencySection(heatmap, stats) : ''}
        ${this._buildMetricsSection(stats, momentum)}
        ${this._buildChartsSection()}
        ${this._buildModuleSection(stats, recentNotes)}
        ${this._buildRecentQuizzes(recentQuizzes)}
      </div>
    `;

    // Charts
    HamsaCharts.renderDonutChart('chart-donut-container', analytics.donut);
    HamsaCharts.renderTrendLineChart('chart-trend-container', analytics.trend);
    HamsaCharts.renderSubjectMasteryChart('chart-subject-container', analytics.subjects);

    if (window.aiAdvisorEngine) {
      window.aiAdvisorEngine.generateLiveAdvice(false)
        .catch(err => console.error('AI Advisor error:', err));
    }

    if (window.app) window.app.refreshIcons();

    // Motion runs after paint so it never blocks first render.
    this._animateCounters();
    this._animateProgressRings();
    this._revealOnScroll();
  }

  // =========================================================================
  // 1. BRAND MASTHEAD
  // =========================================================================

  /**
   * The product name, in both scripts, as the first thing anyone sees.
   *
   * Deliberately NOT marked `.reveal` — the scroll-reveal class starts at
   * opacity 0, and the one element that must never wait for an observer is the
   * masthead. It runs its own one-shot entrance animation instead.
   *
   * `data-text` duplicates each line so CSS can paint a second, light-sweep
   * copy over it: background-clip:text can only be applied once per element,
   * so the shine needs its own layer. Both strings are literals, so there is
   * nothing to escape here.
   */
  _buildBrandMasthead() {
    return `
      <header class="dash-masthead">
        <div class="dash-mast-aurora" aria-hidden="true">
          <span class="dm-rays"></span>
          <span class="dm-orb dm-orb-1"></span>
          <span class="dm-orb dm-orb-2"></span>
          <span class="dm-orb dm-orb-3"></span>
        </div>

        <div class="dash-mast-inner">
          <span class="dash-mast-eyebrow">
            <span class="live-dot" aria-hidden="true"></span>
            AI Gurukul · UPSC · SSC · Banking
          </span>

          <h1 class="dash-mast-title">
            <span class="dash-mast-en" data-text="HAMSA VIDYA">HAMSA VIDYA</span>
            <span class="dash-mast-hi" lang="hi" data-text="हंस विद्या">हंस विद्या</span>
          </h1>

          <div class="dash-mast-rule" aria-hidden="true">
            <span class="dash-mast-rule-line"></span>
            <span class="dash-mast-rule-gem"></span>
            <span class="dash-mast-rule-line"></span>
          </div>

          <p class="dash-mast-tagline">
            विद्या ददाति विनयम् — knowledge that teaches, tests and remembers with you.
          </p>
        </div>
      </header>
    `;
  }

  // =========================================================================
  // 2. SHLOKA BANNER
  // =========================================================================

  /**
   * Base styling lives in css/components/02-dashboard.css, including per-theme
   * gradients. The extra `dash-shloka` class is the hook css/dashboard.css uses
   * to scale it up and add the sheen, without touching that frozen file.
   */
  _buildShlokaBanner() {
    return `
      <div class="dashboard-top-shloka-banner dash-shloka">
        <span class="dash-shloka-sheen" aria-hidden="true"></span>
        <div class="shloka-sanskrit-live-text">
          कर्मण्येवाधिकारस्ते मा फलेषु कदाचन । मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 3. COMMAND CENTRE
  // =========================================================================

  /**
   * Decide the single most useful next action.
   *
   * Ordered by urgency: overdue revision decays memory fastest, so it wins;
   * then protecting a live streak; then the obvious gap for a new user.
   */
  _resolveFocus(stats) {
    if (stats.dueCardsToday > 0) {
      return {
        tone: 'urgent',
        icon: 'rotate-cw',
        eyebrow: 'Spaced repetition due',
        title: `${stats.dueCardsToday} card${stats.dueCardsToday === 1 ? '' : 's'} ready for review`,
        body: 'Reviewing on schedule is what moves facts into long-term memory. This is the highest-value few minutes you can spend right now.',
        cta: 'Review now',
        action: "app.navigate('flashcards')"
      };
    }
    if (stats.totalQuizzesTaken === 0) {
      return {
        tone: 'start',
        icon: 'sparkles',
        eyebrow: 'Get started',
        title: 'Turn your first PDF or notes into a quiz',
        body: 'Upload a chapter and Hamsa will write exam-style MCQs from it, with explanations and page citations.',
        cta: 'Create first quiz',
        action: "app.navigate('create-quiz')"
      };
    }
    if (stats.overallAccuracy > 0 && stats.overallAccuracy < 60) {
      return {
        tone: 'improve',
        icon: 'target',
        eyebrow: 'Focus area',
        title: `Accuracy is ${stats.overallAccuracy}% — worth a targeted drill`,
        body: 'Re-attempt your weakest subject rather than new material. Fixing known gaps lifts scores faster than adding volume.',
        cta: 'Run a 5-min drill',
        action: 'app.launchQuickDrill()'
      };
    }
    return {
      tone: 'steady',
      icon: 'trending-up',
      eyebrow: 'Keep the momentum',
      title: `${stats.dayStreak}-day streak — protect it today`,
      body: 'A short session counts. Generate a quick drill or review a saved lesson to keep the streak alive.',
      cta: 'Quick 5-min drill',
      action: 'app.launchQuickDrill()'
    };
  }

  _buildCommandCentre({ firstName, profile, sadhana, stats, momentum }) {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const focus = this._resolveFocus(stats);
    const esc = (s) => SecurityUtils.escapeHtml(s);

    // Streak ring fills over a 30-day horizon — long enough to feel like a goal.
    const streakPct = Math.min(100, Math.round((stats.dayStreak / 30) * 100));

    return `
      <section class="dash-hero reveal">
        <div class="dash-hero-glow" aria-hidden="true">
          <span class="dg-orb dg-orb-1"></span>
          <span class="dg-orb dg-orb-2"></span>
        </div>

        <div class="dash-hero-top">
          <div class="dash-greet">
            <span class="dash-greet-eyebrow">
              <span class="live-dot" aria-hidden="true"></span>
              ${esc(greeting)}
            </span>
            <!-- Not a heading: the page's h1 is the masthead product name. -->
            <p class="dash-greet-name">${esc(firstName)}</p>
          </div>

          <div class="dash-identity">
            ${profile ? `
              <button class="dash-id-chip" onclick="app.openProfileManagerModal()" title="View or edit your academic profile">
                <i data-lucide="graduation-cap"></i>
                <span>${esc(profile.qualification || 'Student')}</span>
              </button>
            ` : `
              <button class="dash-id-chip dash-id-chip-action" onclick="app.openProfileManagerModal()">
                <i data-lucide="user-plus"></i>
                <span>Complete profile</span>
              </button>
            `}
            <button class="dash-id-chip dash-id-rank" onclick="app.openProfileManagerModal()" title="${esc(sadhana.enTitle || 'Sadhana rank')}">
              <span>${esc(sadhana.badge)}</span>
              <span>${esc(sadhana.title)}</span>
            </button>
          </div>
        </div>

        <div class="dash-hero-body">
          <!-- Today's focus: one decision, not nine -->
          <article class="dash-focus dash-focus-${focus.tone}">
            <div class="dash-focus-icon">
              <i data-lucide="${focus.icon}"></i>
            </div>
            <div class="dash-focus-text">
              <span class="dash-focus-eyebrow">${esc(focus.eyebrow)}</span>
              <h2 class="dash-focus-title">${esc(focus.title)}</h2>
              <p class="dash-focus-body">${esc(focus.body)}</p>
              <button class="dash-focus-cta" onclick="${focus.action}">
                <span>${esc(focus.cta)}</span>
                <i data-lucide="arrow-right"></i>
              </button>
            </div>
          </article>

          <!-- Streak ring + this week at a glance -->
          <aside class="dash-pulse">
            <div class="dash-ring-wrap" title="${stats.dayStreak} consecutive study days">
              <svg class="dash-ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle class="dash-ring-track" cx="60" cy="60" r="52" />
                <circle class="dash-ring-fill" cx="60" cy="60" r="52"
                        data-ring-pct="${streakPct}" />
              </svg>
              <div class="dash-ring-centre">
                <span class="dash-ring-flame">🔥</span>
                <span class="dash-ring-value" data-count="${stats.dayStreak}">${stats.dayStreak}</span>
                <span class="dash-ring-label">day streak</span>
              </div>
            </div>

            <div class="dash-week">
              <div class="dash-week-title">This week</div>
              <div class="dash-week-row">
                <span class="dash-week-label">Attempts</span>
                <span class="dash-week-value">
                  ${momentum ? momentum.attemptsThisWeek : 0}
                  ${this._deltaBadge(momentum && momentum.attemptsDelta)}
                </span>
              </div>
              <div class="dash-week-row">
                <span class="dash-week-label">Accuracy</span>
                <span class="dash-week-value">
                  ${momentum && momentum.attemptsThisWeek ? momentum.accuracyThisWeek + '%' : '—'}
                  ${this._deltaBadge(momentum && momentum.accuracyDelta, '%')}
                </span>
              </div>
              <div class="dash-week-row">
                <span class="dash-week-label">Time on quizzes</span>
                <span class="dash-week-value">${momentum ? momentum.minutesThisWeek : 0}m</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  /** Small +/- pill. Renders nothing when there is no prior period to compare. */
  _deltaBadge(delta, suffix = '') {
    if (delta === null || delta === undefined || delta === 0) return '';
    const up = delta > 0;
    return `<span class="dash-delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(delta)}${suffix}</span>`;
  }

  // =========================================================================
  // 4. ONBOARDING PATH (new users only)
  // =========================================================================

  /**
   * A first-run user previously saw several separate "no data yet" boxes
   * scattered down the page. This replaces them with one ordered path.
   */
  _buildOnboardingPath() {
    const steps = [
      { n: 1, icon: 'user-check', title: 'Set up your profile', body: 'Unlocks exam eligibility matching.', cta: 'Open profile', action: 'app.openProfileManagerModal()' },
      { n: 2, icon: 'sparkles', title: 'Generate your first quiz', body: 'Upload a PDF chapter or paste notes.', cta: 'Create quiz', action: "app.navigate('create-quiz')" },
      { n: 3, icon: 'graduation-cap', title: 'Ask the AI Teacher', body: 'Any concept, explained from scratch.', cta: 'Try it', action: "app.navigate('ai-teacher')" },
      { n: 4, icon: 'zap', title: 'Build a flashcard deck', body: 'Spaced repetition locks it in.', cta: 'Open decks', action: "app.navigate('flashcards')" }
    ];

    return `
      <section class="dash-onboard reveal">
        <div class="dash-section-head">
          <div>
            <h2 class="dash-section-title">Start here</h2>
            <p class="dash-section-sub">Four steps to get the most out of Hamsa Vidya.</p>
          </div>
        </div>
        <ol class="dash-onboard-steps">
          ${steps.map(s => `
            <li class="dash-step">
              <span class="dash-step-num">${s.n}</span>
              <div class="dash-step-icon"><i data-lucide="${s.icon}"></i></div>
              <div class="dash-step-text">
                <strong>${SecurityUtils.escapeHtml(s.title)}</strong>
                <span>${SecurityUtils.escapeHtml(s.body)}</span>
              </div>
              <button class="dash-step-cta" onclick="${s.action}">
                ${SecurityUtils.escapeHtml(s.cta)}
                <i data-lucide="arrow-right"></i>
              </button>
            </li>
          `).join('')}
        </ol>
      </section>
    `;
  }

  // =========================================================================
  // 5. LAUNCHPAD — actions grouped by intent
  // =========================================================================
  _buildLaunchpad(stats) {
    const groups = [
      {
        label: 'Learn',
        accent: 'violet',
        items: [
          { icon: 'graduation-cap', title: 'AI Teacher', sub: 'Understand any concept', action: "app.navigate('ai-teacher')" },
          { icon: 'book-open', title: 'Study Notes', sub: `${stats.totalNotesCount} in your vault`, action: "app.navigate('study-notes')" },
          { icon: 'pen-tool', title: 'Answer Writing', sub: 'Mains-style evaluation', action: "app.navigate('answer-writing')" }
        ]
      },
      {
        label: 'Practise',
        accent: 'emerald',
        items: [
          { icon: 'sparkles', title: 'Generate Quiz', sub: 'From PDF or notes', action: "app.navigate('create-quiz')", primary: true },
          { icon: 'zap', title: '5-Min Drill', sub: 'Instant AI questions', action: 'app.launchQuickDrill()' },
          { icon: 'layers', title: 'Flashcards', sub: stats.dueCardsToday > 0 ? `${stats.dueCardsToday} due today` : 'Spaced repetition', action: "app.navigate('flashcards')", badge: stats.dueCardsToday > 0 ? stats.dueCardsToday : null }
        ]
      },
      {
        label: 'Track',
        accent: 'amber',
        items: [
          { icon: 'bell-ring', title: 'Exam Alerts', sub: 'Eligibility radar', action: "app.navigate('exam-alerts')" },
          { icon: 'library', title: 'Library', sub: `${stats.savedBookmarksCount} bookmarked`, action: "app.navigate('library')" },
          { icon: 'history', title: 'History', sub: 'Every attempt logged', action: "app.navigate('quiz-history')" }
        ]
      }
    ];

    return `
      <section class="dash-launchpad reveal">
        ${groups.map(g => `
          <div class="dash-lp-group dash-lp-${g.accent}">
            <div class="dash-lp-label">${SecurityUtils.escapeHtml(g.label)}</div>
            <div class="dash-lp-items">
              ${g.items.map(it => `
                <button class="dash-lp-card ${it.primary ? 'is-primary' : ''}" onclick="${it.action}">
                  <span class="dash-lp-icon"><i data-lucide="${it.icon}"></i></span>
                  <span class="dash-lp-text">
                    <strong>${SecurityUtils.escapeHtml(it.title)}</strong>
                    <small>${SecurityUtils.escapeHtml(it.sub)}</small>
                  </span>
                  ${it.badge ? `<span class="dash-lp-badge">${it.badge}</span>` : ''}
                  <i data-lucide="arrow-up-right" class="dash-lp-arrow"></i>
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </section>
    `;
  }

  // =========================================================================
  // 6. AI ADVISOR (existing engine, restyled shell)
  // =========================================================================
  _buildAdvisorSection() {
    return `
      <section class="ai-advisor-section reveal" id="ai-advisor-section">
        <div class="ai-advisor-card">
          <div class="ai-advisor-header-bar">
            <div class="ai-advisor-title-wrap">
              <div class="ai-advisor-avatar-icon">
                <i data-lucide="sparkles"></i>
                <span class="ai-avatar-ping"></span>
              </div>
              <div class="ai-advisor-title-group">
                <div class="ai-advisor-title-row">
                  <h3 class="ai-advisor-main-title">AI सारथी — व्यक्तिगत अध्ययन व परीक्षा परामर्श</h3>
                  <span class="ai-badge-chip">AI Student Mentor</span>
                </div>
                <p class="ai-advisor-subtext">
                  आपके परीक्षा फॉर्म योग्यता (Eligibility), अध्ययन प्रगति, कमजोर विषयों और परीक्षा तिथियों का सजीव AI विश्लेषण
                </p>
              </div>
            </div>

            <div class="ai-advisor-header-actions">
              <button class="btn btn-secondary btn-sm" onclick="window.aiAdvisorEngine.generateLiveAdvice(true)" title="Re-evaluate progress, weak subjects & upcoming exam dates">
                <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
                <span>Refresh AI Advice</span>
              </button>
              <button class="btn btn-outline btn-sm" onclick="app.navigate('exam-alerts')">
                <i data-lucide="compass" style="width:13px;height:13px;"></i>
                <span>Exam Radar</span>
              </button>
            </div>
          </div>

          <div id="ai-advisor-content-box" class="ai-advisor-content-box"></div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 7. CONSISTENCY HEATMAP
  // =========================================================================
  _buildConsistencySection(heatmap, stats) {
    // Four intensity levels scaled to the student's own busiest day, so the
    // grid stays legible whether they do 2 or 50 actions a day.
    const max = Math.max(1, heatmap.maxCount);
    const level = (c) => {
      if (c === 0) return 0;
      const ratio = c / max;
      if (ratio <= 0.25) return 1;
      if (ratio <= 0.5) return 2;
      if (ratio <= 0.75) return 3;
      return 4;
    };

    // Column-major grid: each column is one week, rows are Sun..Sat.
    const weeks = [];
    let current = [];
    heatmap.cells.forEach((cell, i) => {
      if (i === 0 && cell.weekday !== 0) {
        // Pad the first week so weekdays line up with their row.
        for (let p = 0; p < cell.weekday; p++) current.push(null);
      }
      current.push(cell);
      if (cell.weekday === 6) { weeks.push(current); current = []; }
    });
    if (current.length) weeks.push(current);

    return `
      <section class="dash-consistency reveal">
        <div class="dash-section-head">
          <div>
            <h2 class="dash-section-title">Consistency</h2>
            <p class="dash-section-sub">
              Every quiz, note, flashcard review, written answer and AI lesson from the last 12 weeks.
            </p>
          </div>
          <div class="dash-consistency-stats">
            <div class="dcs-item">
              <strong data-count="${heatmap.totalActive}">${heatmap.totalActive}</strong>
              <span>active days</span>
            </div>
            <div class="dcs-item">
              <strong data-count="${heatmap.total}">${heatmap.total}</strong>
              <span>total actions</span>
            </div>
            <div class="dcs-item">
              <strong data-count="${stats.dayStreak}">${stats.dayStreak}</strong>
              <span>current streak</span>
            </div>
          </div>
        </div>

        <div class="dash-heatmap-scroll">
          <div class="dash-heatmap" role="img"
               aria-label="Activity over the last 12 weeks: ${heatmap.totalActive} active days, ${heatmap.total} total actions">
            <div class="dash-hm-daylabels" aria-hidden="true">
              <span>Mon</span><span>Wed</span><span>Fri</span>
            </div>
            <div class="dash-hm-weeks">
              ${weeks.map(week => `
                <div class="dash-hm-week">
                  ${Array.from({ length: 7 }, (_, r) => {
                    const cell = week[r];
                    if (!cell) return '<span class="dash-hm-cell is-pad" aria-hidden="true"></span>';
                    return `<span class="dash-hm-cell lvl-${level(cell.count)}"
                                  title="${cell.label}: ${cell.count} action${cell.count === 1 ? '' : 's'}"></span>`;
                  }).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="dash-hm-legend">
          <span>Less</span>
          <span class="dash-hm-cell lvl-0"></span>
          <span class="dash-hm-cell lvl-1"></span>
          <span class="dash-hm-cell lvl-2"></span>
          <span class="dash-hm-cell lvl-3"></span>
          <span class="dash-hm-cell lvl-4"></span>
          <span>More</span>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 8. METRICS — primary (with rings) + secondary (compact)
  // =========================================================================
  _buildMetricsSection(stats, momentum) {
    // Four headline numbers get rings; the rest are compact tiles. Previously
    // all eight were the same size, so nothing stood out.
    const primary = [
      {
        label: 'Accuracy', value: stats.overallAccuracy, suffix: '%',
        pct: stats.overallAccuracy, icon: 'target', accent: 'violet',
        caption: 'Correct of attempted',
        delta: momentum ? momentum.accuracyDelta : null
      },
      {
        label: 'Best score', value: stats.bestScore, suffix: '%',
        pct: stats.bestScore, icon: 'trophy', accent: 'pink',
        caption: 'Highest single attempt'
      },
      {
        label: 'Attempts', value: stats.totalQuizzesTaken, suffix: '',
        pct: Math.min(100, stats.totalQuizzesTaken * 5), icon: 'award', accent: 'indigo',
        caption: 'Quizzes completed',
        delta: momentum ? momentum.attemptsDelta : null
      },
      {
        label: 'Questions', value: stats.questionsCompleted, suffix: '',
        pct: Math.min(100, stats.questionsCompleted), icon: 'check-circle', accent: 'cyan',
        caption: 'MCQs answered'
      }
    ];

    const secondary = [
      { label: 'Study notes', value: stats.totalNotesCount, icon: 'book-open', accent: 'amber', action: "app.navigate('study-notes')" },
      { label: 'Flashcard decks', value: stats.totalFlashcardDecks, icon: 'layers', accent: 'emerald', action: "app.navigate('flashcards')" },
      { label: 'Cards reviewed', value: stats.totalCardReviews, icon: 'rotate-cw', accent: 'violet', action: "app.navigate('flashcards')" },
      { label: 'Due today', value: stats.dueCardsToday, icon: 'clock', accent: stats.dueCardsToday > 0 ? 'orange' : 'slate', action: "app.navigate('flashcards')" },
      { label: 'Written answers', value: stats.answerCount ?? 0, icon: 'pen-tool', accent: 'pink', action: "app.navigate('answer-writing')" },
      { label: 'AI lessons', value: stats.teacherCount ?? 0, icon: 'graduation-cap', accent: 'cyan', action: "app.navigate('ai-teacher')" },
      { label: 'Bookmarks', value: stats.savedBookmarksCount, icon: 'bookmark', accent: 'amber', action: "app.navigate('library', { tab: 'bookmarks' })" },
      { label: 'Saved exams', value: stats.savedExamCount ?? 0, icon: 'bell-ring', accent: 'indigo', action: "app.navigate('exam-alerts')" }
    ];

    const esc = (s) => SecurityUtils.escapeHtml(String(s));

    return `
      <section class="dash-metrics reveal">
        <div class="dash-section-head">
          <div>
            <h2 class="dash-section-title">Learning analytics</h2>
            <p class="dash-section-sub">Live across every module.</p>
          </div>
          <span class="dash-live-pill">
            <span class="live-dot" aria-hidden="true"></span> Realtime
          </span>
        </div>

        <div class="dash-primary-grid">
          ${primary.map(m => `
            <article class="dash-stat dash-accent-${m.accent}">
              <div class="dash-stat-ring-wrap">
                <svg class="dash-stat-ring" viewBox="0 0 84 84" aria-hidden="true">
                  <circle class="dash-ring-track" cx="42" cy="42" r="36" />
                  <circle class="dash-ring-fill" cx="42" cy="42" r="36" data-ring-pct="${Math.max(0, Math.min(100, m.pct))}" />
                </svg>
                <i data-lucide="${m.icon}" class="dash-stat-icon"></i>
              </div>
              <div class="dash-stat-body">
                <div class="dash-stat-value" data-count="${m.value}" data-suffix="${m.suffix}">${esc(m.value)}${m.suffix}</div>
                <div class="dash-stat-label">${esc(m.label)}</div>
                <div class="dash-stat-caption">
                  ${esc(m.caption)} ${this._deltaBadge(m.delta, m.suffix === '%' ? '%' : '')}
                </div>
              </div>
            </article>
          `).join('')}
        </div>

        <div class="dash-secondary-grid">
          ${secondary.map(m => `
            <button class="dash-mini dash-accent-${m.accent}" onclick="${m.action}">
              <span class="dash-mini-icon"><i data-lucide="${m.icon}"></i></span>
              <span class="dash-mini-value" data-count="${m.value}">${esc(m.value)}</span>
              <span class="dash-mini-label">${esc(m.label)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 9. CHARTS
  // =========================================================================
  _buildChartsSection() {
    return `
      <section class="dash-charts reveal">
        <div class="dash-section-head">
          <div>
            <h2 class="dash-section-title">Quiz performance</h2>
            <p class="dash-section-sub">Accuracy breakdown, trajectory and subject strength.</p>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <h3 class="chart-title">
                <i data-lucide="pie-chart" style="width:17px;height:17px;color:var(--color-primary-light);"></i>
                Accuracy ratio
              </h3>
              <span class="badge badge-muted">Breakdown</span>
            </div>
            <div id="chart-donut-container" class="chart-container"></div>
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <h3 class="chart-title">
                <i data-lucide="trending-up" style="width:17px;height:17px;color:var(--color-success);"></i>
                Trend — last 10 attempts
              </h3>
              <span class="badge badge-muted">Trajectory</span>
            </div>
            <div id="chart-trend-container" class="chart-container"></div>
          </div>
        </div>

        <div class="chart-card dash-subject-card">
          <div class="chart-header">
            <h3 class="chart-title">
              <i data-lucide="bar-chart-3" style="width:17px;height:17px;color:var(--color-gold);"></i>
              Subject mastery
            </h3>
            <span class="badge badge-primary">Domain analysis</span>
          </div>
          <div id="chart-subject-container"></div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 10. MODULE ACTIVITY
  // =========================================================================
  _buildModuleSection(stats, recentNotes) {
    const esc = (s) => SecurityUtils.escapeHtml(s);

    return `
      <section class="dash-modules reveal">
        <div class="charts-grid">
          <!-- Study notes -->
          <div class="chart-card">
            <div class="chart-header">
              <h3 class="chart-title">
                <i data-lucide="book-open" style="width:17px;height:17px;color:var(--color-gold);"></i>
                Study notes
              </h3>
              <button class="btn btn-outline btn-sm" onclick="app.navigate('study-notes')">
                <span>Open vault</span>
                <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
              </button>
            </div>

            ${recentNotes.length === 0 ? `
              <div class="dash-empty">
                <i data-lucide="file-plus"></i>
                <p class="dash-empty-title">No notes yet</p>
                <p class="dash-empty-body">Import a chapter and Hamsa turns it into a structured digital textbook.</p>
                <button class="btn btn-primary btn-sm" onclick="app.navigate('study-notes')">
                  <i data-lucide="plus"></i><span>Create a note</span>
                </button>
              </div>
            ` : `
              <ul class="dash-note-list">
                ${recentNotes.map(n => `
                  <li class="dash-note-row">
                    <span class="dash-note-icon"><i data-lucide="file-text"></i></span>
                    <span class="dash-note-text">
                      <strong>${esc(n.title || 'Untitled note')}</strong>
                      <small>${esc(n.subject || 'General')} · ${n.updatedAt ? UIUtils.formatDate(n.updatedAt) : 'Recent'}</small>
                    </span>
                    <button class="btn btn-outline btn-sm"
                      onclick="app.navigate('study-notes'); setTimeout(() => window.studyNotesView && window.studyNotesView.openNote(${Number(n.id)}), 300);">
                      Open
                    </button>
                  </li>
                `).join('')}
              </ul>
            `}
          </div>

          <!-- Flashcards / SRS -->
          <div class="chart-card">
            <div class="chart-header">
              <h3 class="chart-title">
                <i data-lucide="zap" style="width:17px;height:17px;color:var(--color-success);"></i>
                Spaced repetition
              </h3>
              <button class="btn btn-outline btn-sm" onclick="app.navigate('flashcards')">
                <span>Open decks</span>
                <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
              </button>
            </div>

            <ul class="dash-srs-list">
              <li class="dash-srs-row">
                <span class="dash-srs-icon dash-accent-emerald"><i data-lucide="layers"></i></span>
                <span class="dash-srs-text"><strong data-count="${stats.totalFlashcardDecks}">${stats.totalFlashcardDecks}</strong><small>Decks created</small></span>
              </li>
              <li class="dash-srs-row">
                <span class="dash-srs-icon dash-accent-indigo"><i data-lucide="credit-card"></i></span>
                <span class="dash-srs-text"><strong data-count="${stats.totalCustomCards}">${stats.totalCustomCards}</strong><small>Cards added</small></span>
              </li>
              <li class="dash-srs-row">
                <span class="dash-srs-icon dash-accent-violet"><i data-lucide="rotate-cw"></i></span>
                <span class="dash-srs-text"><strong data-count="${stats.totalCardReviews}">${stats.totalCardReviews}</strong><small>Reviews logged</small></span>
              </li>
            </ul>

            ${stats.dueCardsToday > 0 ? `
              <button class="dash-due-cta" onclick="app.navigate('flashcards')">
                <i data-lucide="clock"></i>
                <span>${stats.dueCardsToday} card${stats.dueCardsToday === 1 ? '' : 's'} due — review now</span>
                <i data-lucide="arrow-right"></i>
              </button>
            ` : `
              <div class="dash-allclear">
                <i data-lucide="check-circle"></i>
                <span>All caught up. Nothing due today.</span>
              </div>
            `}
          </div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 11. RECENT QUIZZES
  // =========================================================================
  _buildRecentQuizzes(recentQuizzes) {
    const esc = (s) => SecurityUtils.escapeHtml(s);

    return `
      <section class="dash-recent reveal">
        <div class="dash-section-head">
          <div>
            <h2 class="dash-section-title">Recent quizzes</h2>
            <p class="dash-section-sub">Pick up where you left off.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="app.navigate('library')">
            <span>View all</span>
            <i data-lucide="arrow-right" style="width:15px;height:15px;"></i>
          </button>
        </div>

        <div class="quiz-cards-list">
          ${recentQuizzes.length === 0 ? `
            <div class="dash-empty dash-empty-lg">
              <i data-lucide="clipboard-list"></i>
              <p class="dash-empty-title">No quizzes yet</p>
              <p class="dash-empty-body">Ingest a PDF or paste study notes and Hamsa will write exam-style MCQs with explanations.</p>
              <button class="btn btn-primary" onclick="app.navigate('create-quiz')">
                <i data-lucide="plus"></i><span>Create your first quiz</span>
              </button>
            </div>
          ` : recentQuizzes.map(q => `
            <div class="quiz-list-item">
              <div class="quiz-info">
                <div class="quiz-item-title">${esc(q.title)}</div>
                <div class="quiz-meta-row">
                  <span class="badge badge-primary">${esc(q.subject)}</span>
                  <span class="badge badge-muted">${esc(q.difficulty)}</span>
                  <span class="badge badge-muted">${esc(q.quizMode)}</span>
                  <span>${Number(q.totalQuestions) || 0} questions</span>
                  <span>· ${UIUtils.formatDate(q.createdAt)}</span>
                </div>
              </div>

              <div class="quiz-item-actions">
                ${q.completedAt ? `
                  <span class="badge ${q.percentage >= 70 ? 'badge-success' : 'badge-warning'}">
                    ${q.percentage}%
                  </span>
                  <button class="btn btn-secondary btn-sm" onclick="app.viewQuizResult(${Number(q.id)})">
                    <i data-lucide="bar-chart"></i><span>Results</span>
                  </button>
                ` : `
                  <button class="btn btn-primary btn-sm" onclick="app.startQuiz(${Number(q.id)})">
                    <i data-lucide="play"></i><span>Take quiz</span>
                  </button>
                `}
                <button class="icon-btn" title="Export as PDF" onclick="app.exportQuizPdf(${Number(q.id)})">
                  <i data-lucide="file-down" style="width:18px;height:18px;"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // =========================================================================
  // MOTION
  // =========================================================================

  /** Respect the OS setting — these are decorative enhancements. */
  _prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  /** Count numbers up from zero. */
  _animateCounters() {
    if (!this.container) return;

    const targets = this.container.querySelectorAll('[data-count]');
    if (this._prefersReducedMotion()) return; // values are already in the DOM

    targets.forEach((el, idx) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      const suffix = el.getAttribute('data-suffix') || '';
      if (isNaN(target) || target === 0) return;

      const duration = 900;
      // Slight stagger so the grid animates as a wave rather than all at once.
      const delay = Math.min(idx * 45, 400);
      let startTime = null;

      const step = (now) => {
        if (startTime === null) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        el.textContent = `${Math.round(target * ease)}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = `${target}${suffix}`;
      };

      el.textContent = `0${suffix}`;
      setTimeout(() => requestAnimationFrame(step), delay);
    });
  }

  /** Draw the progress rings by animating stroke-dashoffset. */
  _animateProgressRings() {
    if (!this.container) return;
    const rings = this.container.querySelectorAll('.dash-ring-fill[data-ring-pct]');

    rings.forEach((ring, idx) => {
      const pct = Math.max(0, Math.min(100, parseFloat(ring.getAttribute('data-ring-pct')) || 0));
      const r = parseFloat(ring.getAttribute('r')) || 36;
      const circumference = 2 * Math.PI * r;

      ring.style.strokeDasharray = `${circumference}`;

      if (this._prefersReducedMotion()) {
        ring.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
        return;
      }

      // Start empty, then transition — the transition only fires if the value
      // changes after the element is in the document.
      ring.style.strokeDashoffset = `${circumference}`;
      setTimeout(() => {
        ring.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
      }, 120 + idx * 90);
    });
  }

  /**
   * Fade sections in as they scroll into view.
   * The observer disconnects once everything has been revealed so it does not
   * linger for the life of the page.
   */
  _revealOnScroll() {
    if (!this.container) return;
    const sections = Array.from(this.container.querySelectorAll('.reveal'));
    if (sections.length === 0) return;

    if (this._prefersReducedMotion() || !('IntersectionObserver' in window)) {
      sections.forEach(s => s.classList.add('is-visible'));
      return;
    }

    // Anything already on screen appears immediately — no fade-in on first paint.
    let pending = sections.length;
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
        if (--pending <= 0) obs.disconnect();
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    sections.forEach(s => observer.observe(s));
    this._revealObserver = observer;
  }

  /** Called by app.navigate() when leaving, so the observer is not left alive. */
  onLeaveView() {
    if (this._revealObserver) {
      this._revealObserver.disconnect();
      this._revealObserver = null;
    }
  }
}

window.DashboardView = DashboardView;
