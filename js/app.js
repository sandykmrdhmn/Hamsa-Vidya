/**
 * HAMSA VIDYA (हंस विद्या) — Master Application Controller & Router
 */

class HamsaApp {
  constructor() {
    this.currentModule = 'quiz';
    this.currentView = 'dashboard';
    this.activeQuizId = null;
    this.searchQuery = '';
    this.searchCategory = 'ALL'; // 'ALL', 'QUIZZES', 'QUESTIONS', 'NOTES'
    this.searchResults = { quizzes: [], questions: [], notes: [], totalCount: 0 };
    this.highlightedSearchIndex = 0;
    this._searchDebounceTimer = null;
  }

  async init() {
    // 1. Initialize Themes & Preferences from LocalStorage
    this.initThemeAndPreferences();

    // 2. Initialize Daily Streak
    this.checkAndUpdateStreak();

    // 3. Setup Navigation & Hash Routing
    window.addEventListener('hashchange', () => this.handleRoute());

    // 4. Handle initial route or default to dashboard
    this.handleRoute();

    // 4b. Initialize Global Student Identity & Mandatory Profile Onboarding
    this.updateGlobalStudentIdentity();
    this.checkMandatoryProfileOnboarding();

    // 5. Initialize Lucide Icons (debounced)
    this._pendingIconRefresh = null;
    this.refreshIcons();

    // 5b. Make `<div onclick>` controls reachable and operable by keyboard.
    this._setupKeyboardActivation();
    this.enhanceInteractiveElements();

    // 5c. Publish the header's real height so sticky bars can sit under it.
    this._trackHeaderHeight();



    // 6. Initialize Audio Engine Icon
    if (window.audioEngine) {
      window.audioEngine.updateSoundIcon();
    }

    // 7. Global Error Handlers — catch unhandled errors gracefully
    window.onerror = (msg, src, line, col, err) => {
      console.error('Global Error:', msg, src, line, col, err);
      this.showToast('An unexpected error occurred. Please try again.', 'error');
      // Returning true suppresses the browser's own error reporting, which
      // hides stack traces while debugging. Keep the default behaviour on
      // localhost so real errors stay visible in the console.
      return !this.isDevEnvironment();
    };
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      // Don't toast for network errors during background operations
      if (event.reason?.message?.includes('fetch')) {
        this.showToast('Network request failed. Please check your connection.', 'error');
      }
    });

    // 8. Online / Offline Detection with Visual Banner
    this._setupOfflineDetection();

    // 8b. Service worker — enables genuine offline use after the first load.
    this._registerServiceWorker();

    // 9. Global Delegated Tactile Click Audio
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, .select-chip, .topic-pill, .subnav-pill, .primary-module-btn, .option-card, .btn');
      if (target && !target.id.includes('sound-toggle-btn')) {
        if (target.classList.contains('subnav-pill') || target.classList.contains('primary-module-btn') || target.classList.contains('mobile-nav-item')) {
          // Handled by app.navigate()
        } else if (target.classList.contains('option-card')) {
          // Handled by quizPlayerView.selectOption()
        } else {
          window.audioEngine?.playClick();
        }
      }
    });

    // 10. Global Dynamic Spotlight Tracking (Linear/Stripe Luxury Card Aura)
    this._setupSpotlightTracking();

    // 11. Global Keyboard Shortcuts (Global Search Ctrl+K or /)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openGlobalSearch();
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        this.openGlobalSearch();
      }
    });
  }

  // =========================================================================
  // SPOTLIGHT CURSOR TRACKING
  //
  // Only three rules actually read --mouse-x/--mouse-y (.spotlight-card::before,
  // .metric-card::before, .hero-card::after) and all three sit at opacity:0
  // until :hover. So the only element whose spotlight is ever visible is the one
  // directly under the cursor.
  //
  // The previous implementation queried ten selectors (including .glass-panel,
  // which matches almost everything) and called getBoundingClientRect() on every
  // match, every frame — dozens of forced layouts per frame to update variables
  // on invisible elements. Resolving the hovered card with closest() produces
  // identical output from one rect read.
  // =========================================================================

  /** Selectors whose CSS actually consumes the spotlight variables. */
  static SPOTLIGHT_SELECTOR = '.spotlight-card, .metric-card, .hero-card';

  _setupSpotlightTracking() {
    // Pointer-driven decoration: skip it entirely on touch-only devices, where
    // it can never be seen but would still cost work on every touch-drag.
    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    if (!canHover) return;

    // Honour the user's motion preference for this purely decorative effect.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = null;
    let pendingX = 0;
    let pendingY = 0;
    let pendingTarget = null;

    document.addEventListener('mousemove', (e) => {
      // Always record the newest position. The old code captured the first
      // event of the frame and then discarded later ones, so the glow lagged
      // behind the cursor.
      pendingX = e.clientX;
      pendingY = e.clientY;
      pendingTarget = e.target;

      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        this._paintSpotlight(pendingTarget, pendingX, pendingY);
      });
    }, { passive: true });
  }

  /** Update the spotlight variables on the single card under the cursor. */
  _paintSpotlight(target, x, y) {
    if (!target || typeof target.closest !== 'function') return;

    const card = target.closest(HamsaApp.SPOTLIGHT_SELECTOR);
    if (!card) return;

    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const relX = ((x - rect.left) / rect.width) * 100;
    const relY = ((y - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${relX.toFixed(1)}%`);
    card.style.setProperty('--mouse-y', `${relY.toFixed(1)}%`);
  }

  // =========================================================================
  // =========================================================================
  // HEADER HEIGHT → --header-h
  //
  // Several sticky elements sit directly below the header: the module sub-nav,
  // the study-notes reading bar, the table-of-contents sidebar. They used to
  // hardcode an offset (68px, 72px, 90px) against a header that was actually
  // ~96px tall, so they already tucked underneath it — and the two-tier header
  // changed the height again.
  //
  // Measuring once and publishing it as a custom property means those offsets
  // stay correct through any future header change, and through the things that
  // silently alter its height at runtime: the font-scale setting, a long
  // student name, or the browser's own zoom.
  // =========================================================================
  _trackHeaderHeight() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const publish = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      // A zero height means the header is hidden (print, focus mode). Keeping
      // the last good value avoids sticky bars jumping to the very top for a
      // frame before it comes back.
      if (h > 0) document.documentElement.style.setProperty('--header-h', `${h}px`);
    };

    publish();

    if ('ResizeObserver' in window) {
      this._headerObserver = new ResizeObserver(publish);
      this._headerObserver.observe(header);
    } else {
      // Older engines: resize covers zoom and orientation, which is most of it.
      window.addEventListener('resize', publish);
    }

    // Web fonts land after first paint and change the brand block's height.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(publish).catch(() => {});
    }
  }

  // =========================================================================
  // DEBOUNCED LUCIDE ICON REFRESH — prevents excessive repaints
  // =========================================================================
  refreshIcons() {
    if (this._pendingIconRefresh) return;
    this._pendingIconRefresh = requestAnimationFrame(() => {
      if (window.lucide) window.lucide.createIcons();
      // Views re-render by replacing innerHTML, which drops any previously
      // applied accessibility attributes — re-apply them on the same tick.
      this.enhanceInteractiveElements();
      // Start the count-up on any view hero that was just painted. Hooked here
      // because every view already calls refreshIcons() after injecting its
      // markup, so heroes animate without each view remembering a second call.
      if (window.UIUtils && UIUtils.animateHeroCounters) UIUtils.animateHeroCounters();
      this._pendingIconRefresh = null;
    });
  }

  // =========================================================================
  // KEYBOARD ACCESSIBILITY FOR onclick ELEMENTS
  //
  // The UI is built largely from `<div onclick=...>` rather than `<button>`,
  // so ~96 controls were unreachable by keyboard and invisible to screen
  // readers. Rather than rewriting every call site, promote them at runtime:
  // give them tabindex + role="button" and let one delegated handler translate
  // Enter/Space into a click.
  // =========================================================================

  /** Tags that are already focusable and already fire click on Enter/Space. */
  static NATIVE_INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'LABEL', 'OPTION']);

  /**
   * Promote clickable non-interactive elements inside `root` to real controls.
   * Idempotent — safe to call after every render.
   */
  enhanceInteractiveElements(root = document) {
    let candidates;
    try {
      candidates = root.querySelectorAll('[onclick]');
    } catch {
      return;
    }

    for (const el of candidates) {
      if (HamsaApp.NATIVE_INTERACTIVE.has(el.tagName)) continue;
      if (el.dataset.keyboardActivatable === 'true') continue;

      // Backdrops and overlay scrims are click-to-dismiss affordances, not
      // controls. Making them focusable would add confusing empty tab stops —
      // the dialogs they belong to are closable with Escape instead.
      const cls = el.className && typeof el.className === 'string' ? el.className : '';
      if (/backdrop|overlay|scrim/i.test(cls) || /backdrop|overlay/i.test(el.id || '')) {
        el.dataset.keyboardActivatable = 'skip';
        continue;
      }

      // An element whose only job is to stop propagation isn't a control.
      const handler = el.getAttribute('onclick') || '';
      if (/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(handler)) {
        el.dataset.keyboardActivatable = 'skip';
        continue;
      }

      el.dataset.keyboardActivatable = 'true';
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');

      // Give screen readers something to announce when the element has no text
      // of its own (icon-only controls rely on title).
      if (!el.hasAttribute('aria-label')) {
        const title = el.getAttribute('title');
        const hasText = (el.textContent || '').trim().length > 0;
        if (title && !hasText) el.setAttribute('aria-label', title);
      }
    }
  }

  /** One delegated handler turns Enter/Space into a click for promoted elements. */
  _setupKeyboardActivation() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;

      const el = e.target;
      if (!el || el.dataset?.keyboardActivatable !== 'true') return;

      // Don't hijack typing.
      if (HamsaApp.NATIVE_INTERACTIVE.has(el.tagName) || el.isContentEditable) return;

      // Space would otherwise scroll the page.
      e.preventDefault();
      el.click();
    });
  }

  // =========================================================================
  // OFFLINE / ONLINE DETECTION — clear visual feedback for connectivity
  // =========================================================================
  _setupOfflineDetection() {
    const createBanner = () => {
      if (document.getElementById('offline-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.setAttribute('role', 'alert');
      banner.innerHTML = `
        <div style="position:fixed; top:0; left:0; right:0; z-index:9999; background:linear-gradient(135deg, #DC2626, #B91C1C); color:#fff; text-align:center; padding:0.6rem 1rem; font-size:0.88rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:0.5rem; box-shadow:0 2px 12px rgba(0,0,0,0.3);">
          <span>⚠️</span>
          <span>You are currently offline. Some features like AI quiz generation require an internet connection.</span>
        </div>
      `;
      document.body.prepend(banner);
    };

    const removeBanner = () => {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.remove();
      this.showToast('Connection restored! You\u2019re back online.', 'success');
    };

    window.addEventListener('offline', createBanner);
    window.addEventListener('online', removeBanner);

    // Check initial state
    if (!navigator.onLine) createBanner();
  }

  // =========================================================================
  // SERVICE WORKER
  // =========================================================================

  /**
   * Register the service worker so the app shell works offline.
   *
   * App code is served network-first by the worker, so this does not introduce
   * the usual "my edits don't show up" problem. See sw.js for the rationale.
   */
  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // Service workers require a secure context. file:// has neither, and
    // registering there throws a confusing error.
    if (location.protocol === 'file:') {
      console.info('[SW] Skipped: service workers need http(s), not file://');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });

      // Tell the user when a new version is ready rather than silently waiting
      // for every tab to close.
      registration.addEventListener('updatefound', () => {
        const incoming = registration.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            this.showToast('A new version is ready. Reload to update.', 'info', 8000);
          }
        });
      });

      console.info('[SW] Registered. The app will work offline after this load.');
    } catch (err) {
      // Never let a worker problem break the app.
      console.warn('[SW] Registration failed (the app still works normally):', err);
    }
  }

  /**
   * Escape hatch for a bad cache. Callable from the console:
   *   await app.clearServiceWorker()
   */
  async clearServiceWorker() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));

      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n.startsWith('hamsa-')).map(n => caches.delete(n)));
      }

      this.showToast('Offline cache cleared. Reload to start fresh.', 'success');
      console.info('[SW] Unregistered and caches cleared.');
      return true;
    } catch (err) {
      console.error('[SW] Could not clear:', err);
      this.showToast(`Could not clear offline cache: ${err.message}`, 'error');
      return false;
    }
  }

  /** True when running from a local dev server, so errors stay verbose. */
  isDevEnvironment() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local');
  }

  /**
   * Check if device is online before making network calls
   * @returns {boolean}
   */
  isOnline() {
    if (!navigator.onLine) {
      this.showToast('You are offline. Please check your internet connection.', 'error');
      return false;
    }
    return true;
  }

  // =========================================================================
  // MODULE SWITCHER (Scalable multi-module architecture)
  // =========================================================================
  setModule(moduleName) {
    if (moduleName === 'dashboard') {
      this.currentModule = 'dashboard';
      this.navigate('dashboard');
    } else if (moduleName === 'ai-teacher') {
      this.currentModule = 'ai-teacher';
      this.navigate('ai-teacher');
    } else if (moduleName === 'quiz') {
      this.currentModule = 'quiz';
      const validQuizViews = ['create-quiz', 'library', 'quiz-history'];
      const target = validQuizViews.includes(this.currentView) ? this.currentView : 'create-quiz';
      this.navigate(target);
    } else if (moduleName === 'study-hub' || moduleName === 'study-notes') {
      this.currentModule = 'study-notes';
      this.navigate('study-notes');
    } else if (moduleName === 'flashcards') {
      this.currentModule = 'flashcards';
      this.navigate('flashcards');
    } else if (moduleName === 'answer-writing') {
      this.currentModule = 'answer-writing';
      this.navigate('answer-writing');
    } else if (moduleName === 'tools') {
      this.currentModule = 'tools';
      this.navigate('tools');
    } else if (moduleName === 'exam-alerts') {
      this.currentModule = 'exam-alerts';
      this.navigate('exam-alerts');
    } else if (moduleName === 'settings') {
      this.currentModule = 'settings';
      this.navigate('settings');
    } else {
      const moduleTitles = {
        'mock-tests': 'Full-Length Mock Tests'
      };
      this.showToast(`✨ ${moduleTitles[moduleName] || moduleName} is under development and coming soon!`, 'info');
    }
  }

  // =========================================================================
  // THEME & PREFERENCES ORCHESTRATOR
  // =========================================================================
  initThemeAndPreferences() {
    const theme = localStorage.getItem('hamsa_theme_mode') || 'DARK';
    const palette = localStorage.getItem('hamsa_theme_palette') || 'INDIGO';
    const fontSize = localStorage.getItem('hamsa_font_size') || 'DEFAULT';
    const fontFamily = localStorage.getItem('hamsa_font_family') || 'DEFAULT';

    this.setThemeMode(theme, false);
    this.setThemePalette(palette, false);
    this.setFontSize(fontSize, false);
    this.setFontFamily(fontFamily, false);
  }

  setThemeMode(mode, save = true) {
    const LIGHT_FAMILY = ['LIGHT', 'SOFT_WHITE', 'SAGE_GREEN', 'WARM_GOLD', 'SEPIA'];
    const DARK_FAMILY = ['DARK', 'MIDNIGHT_BLUE', 'CHARCOAL'];

    let effectiveMode = mode;
    if (mode === 'SYSTEM') {
      effectiveMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT';
    }
    document.documentElement.setAttribute('data-theme', effectiveMode);
    document.documentElement.style.colorScheme = LIGHT_FAMILY.includes(effectiveMode) ? 'light' : 'dark';
    if (save) localStorage.setItem('hamsa_theme_mode', mode);

    // Update theme-matched dynamic royal logo
    this.updateBrandLogoForTheme(effectiveMode);

    // Update theme toggle icon
    const isLightFamily = LIGHT_FAMILY.includes(effectiveMode);
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = isLightFamily
        ? '<i data-lucide="moon" style="width:20px;height:20px;"></i>' 
        : '<i data-lucide="sun" style="width:20px;height:20px;"></i>';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  updateBrandLogoForTheme(effectiveMode) {
    const logoImg = document.getElementById('site-brand-logo');
    if (!logoImg) return;

    if (effectiveMode === 'SAGE_GREEN') {
      logoImg.src = 'assets/icons/logo-royal-emerald.png';
    } else if (['LIGHT', 'SOFT_WHITE', 'WARM_GOLD', 'SEPIA'].includes(effectiveMode)) {
      logoImg.src = 'assets/icons/logo-royal-ivory.png';
    } else if (effectiveMode === 'MIDNIGHT_BLUE') {
      logoImg.src = 'assets/icons/logo-royal-midnight.png';
    } else {
      // DARK, CHARCOAL or default OLED
      logoImg.src = 'assets/icons/logo-royal-oled.png';
    }
  }

  toggleTheme() {
    const current = localStorage.getItem('hamsa_theme_mode') || 'DARK';
    const LIGHT_FAMILY = ['LIGHT', 'SOFT_WHITE', 'SAGE_GREEN', 'WARM_GOLD', 'SEPIA'];
    const next = LIGHT_FAMILY.includes(current) ? 'DARK' : 'LIGHT';
    this.setThemeMode(next, true);
    if (window.audioEngine) window.audioEngine.playClick();
    this.showToast(`Switched to ${next.toLowerCase().replace('_', ' ')} mode`, 'info');
  }

  setThemePalette(palette, save = true) {
    document.documentElement.setAttribute('data-palette', palette);
    if (save) {
      localStorage.setItem('hamsa_theme_palette', palette);
      this.showToast(`Theme palette updated to ${palette}`, 'info');
    }
  }

  setFontSize(size, save = true) {
    document.documentElement.setAttribute('data-font-scale', size);
    if (save) {
      localStorage.setItem('hamsa_font_size', size);
      this.showToast(`Font scaling set to ${size.toLowerCase()}`, 'info');
    }
  }

  setFontFamily(family, save = true) {
    document.documentElement.setAttribute('data-font-family', family);
    if (save) {
      localStorage.setItem('hamsa_font_family', family);
      this.showToast(`Font family updated`, 'info');
    }
  }

  // =========================================================================
  // STREAK TRACKING
  // =========================================================================
  checkAndUpdateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const lastActive = localStorage.getItem('hamsa_last_active_date');
    let streak = parseInt(localStorage.getItem('hamsa_streak_days') || '1', 10);

    if (!lastActive) {
      localStorage.setItem('hamsa_last_active_date', today);
      localStorage.setItem('hamsa_streak_days', '1');
    } else if (lastActive !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastActive === yesterday) {
        streak += 1;
      } else {
        streak = 1; // reset streak if missed a day
      }
      localStorage.setItem('hamsa_last_active_date', today);
      localStorage.setItem('hamsa_streak_days', String(streak));
    }

    const badge = document.getElementById('header-streak-badge');
    if (badge) {
      badge.innerHTML = `<span>🔥</span><span>${streak}d Streak</span>`;
    }
  }

  // =========================================================================
  // ROUTING & VIEW SWITCHING
  // =========================================================================
  handleRoute() {
    const hash = window.location.hash.slice(1);
    const [view, paramStr] = hash.split('?');
    const params = new URLSearchParams(paramStr);

    if (view === 'dashboard' || view === 'quiz' || view === '') {
      this.navigate('dashboard', {}, false);
    } else if (view === 'ai-teacher') {
      this.navigate('ai-teacher', {}, false);
    } else if (view === 'study-notes' || view === 'study-hub') {
      const id = params.get('id');
      this.navigate('study-notes', {}, false);
      if (id && window.studyNotesView) {
        window.studyNotesView.openNote(Number(id));
      }
    } else if (view === 'create-quiz') {
      this.navigate('create-quiz', {}, false);
    } else if (view === 'quiz-player') {
      const id = params.get('id');
      if (id) this.startQuiz(id, false);
      else this.navigate('dashboard', {}, false);
    } else if (view === 'quiz-result') {
      const id = params.get('id');
      if (id) this.viewQuizResult(id, false);
      else this.navigate('dashboard', {}, false);
    } else if (view === 'library') {
      const tab = params.get('tab') || 'quizzes';
      this.navigate('library', { tab }, false);
    } else if (view === 'quiz-history') {
      this.navigate('quiz-history', {}, false);
    } else if (view === 'flashcards') {
      this.navigate('flashcards', {}, false);
    } else if (view === 'answer-writing') {
      const id = params.get('id');
      const tab = params.get('tab');
      this.navigate('answer-writing', { id, tab }, false);
    } else if (view === 'tools') {
      const tool = params.get('tool');
      this.navigate('tools', { tool }, false);
    } else if (view === 'exam-alerts') {
      this.navigate('exam-alerts', {}, false);
    } else if (view === 'settings') {
      this.navigate('settings', {}, false);
    } else {
      this.navigate('dashboard', {}, false);
    }
  }

  navigate(viewName, params = {}, updateHash = true) {
    const isLeavingView = viewName !== this.currentView;

    // Speech synthesis is a single browser-wide queue, so stop it centrally.
    // Six views start playback but only flashcards and ai-teacher had teardown
    // hooks here — reading a study note aloud and then navigating away left the
    // audio running with no way to stop it.
    if (isLeavingView) {
      window.UIUtils?.stopSpeaking();
    }

    // If leaving flashcards view, safely detach keyboard shortcuts & audio.
    // stopSpeech() also resets the view's own isSpeaking flag and button label,
    // so it still has to run in addition to the central stop above.
    if (this.currentView === 'flashcards' && viewName !== 'flashcards' && window.flashcardsView) {
      window.flashcardsView.detachKeyboard();
      window.flashcardsView.stopSpeech();
    }
    // If leaving tools view, cleanup any active timer
    if (this.currentView === 'tools' && viewName !== 'tools' && window.toolsView) {
      window.toolsView.onLeaveView();
    }
    // If leaving the dashboard, disconnect its scroll-reveal IntersectionObserver
    // so it does not stay attached to detached nodes for the life of the page.
    if (this.currentView === 'dashboard' && viewName !== 'dashboard' && window.dashboardView) {
      window.dashboardView.onLeaveView();
    }
    // If leaving AI teacher view, reset its speech button state
    if (this.currentView === 'ai-teacher' && viewName !== 'ai-teacher' && window.aiTeacherView) {
      window.aiTeacherView.stopSpeech();
    }
    // If leaving an active quiz, save progress and release the timer + key handler.
    // Without this the practice-mode interval and the window keydown listener
    // outlived the view, so A/B/C/D keys still answered the abandoned quiz.
    if (this.currentView === 'quiz-player' && viewName !== 'quiz-player' && window.quizPlayerView) {
      window.quizPlayerView.onLeaveView();
    }

    // Abandon any AI request tied to the view being left. Without this the
    // request kept running, spent quota, and resolved into a dead view.
    if (viewName !== this.currentView && window.aiClient?.inFlightCount > 0 && !this._isGenerating) {
      window.aiClient.abortAll();
    }

    this.currentView = viewName;

    // Trigger smooth tab switch audio
    if (window.audioEngine) {
      window.audioEngine.playTabSwitch();
    }

    // Toggle distraction-free mode when in active quiz play
    document.body.classList.toggle('in-active-quiz', viewName === 'quiz-player');
    document.body.classList.toggle('in-study-notes', viewName === 'study-notes');

    // Show Quiz Sub-Navigation bar ONLY when inside Quiz module tabs
    const isQuizSubnavView = ['create-quiz', 'library', 'quiz-history'].includes(viewName);
    const subnavEl = document.getElementById('module-subnav-quiz');
    if (subnavEl) {
      subnavEl.style.display = isQuizSubnavView ? 'block' : 'none';
    }

    // Update active view DOM section
    document.querySelectorAll('.view-section').forEach(el => {
      el.classList.remove('active');
    });

    const activeEl = document.getElementById(`view-${viewName}`);
    if (activeEl) {
      activeEl.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update Primary Module links active state
    document.querySelectorAll('.primary-module-btn').forEach(btn => {
      const btnModule = btn.getAttribute('data-module');
      if (viewName === 'dashboard') {
        btn.classList.toggle('active', btnModule === 'dashboard');
      } else if (viewName === 'ai-teacher') {
        btn.classList.toggle('active', btnModule === 'ai-teacher');
      } else if (viewName === 'study-notes') {
        btn.classList.toggle('active', btnModule === 'study-notes');
      } else if (viewName === 'flashcards') {
        btn.classList.toggle('active', btnModule === 'flashcards');
      } else if (viewName === 'answer-writing') {
        btn.classList.toggle('active', btnModule === 'answer-writing');
      } else if (viewName === 'tools') {
        btn.classList.toggle('active', btnModule === 'tools');
      } else if (viewName === 'exam-alerts') {
        btn.classList.toggle('active', btnModule === 'exam-alerts');
      } else if (viewName === 'settings') {
        btn.classList.toggle('active', btnModule === 'settings');
      } else {
        // create-quiz, library, quiz-history, quiz-player, quiz-result all belong to quiz module
        btn.classList.toggle('active', btnModule === 'quiz');
      }
    });

    // Update Sub-Navigation pills active state
    document.querySelectorAll('.subnav-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subview') === viewName);
    });

    // Update Mobile Nav links active state
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Update URL hash
    if (updateHash) {
      let hashStr = `#${viewName}`;
      if (Object.keys(params).length > 0) {
        hashStr += `?${new URLSearchParams(params).toString()}`;
      }
      window.location.hash = hashStr;
    }

    // Trigger View Renderers
    if (viewName === 'dashboard') {
      // Kept as a singleton on window so onLeaveView() can release the reveal
      // observer, and so openProfileManagerModal() can re-render after a save.
      if (!window.dashboardView && window.DashboardView) {
        window.dashboardView = new window.DashboardView();
      }
      window.dashboardView && window.dashboardView.render();
    } else if (viewName === 'ai-teacher') {
      window.aiTeacherView && window.aiTeacherView.render();
    } else if (viewName === 'study-notes') {
      window.studyNotesView && window.studyNotesView.render();
    } else if (viewName === 'flashcards') {
      window.flashcardsView && window.flashcardsView.render();
    } else if (viewName === 'answer-writing') {
      window.answerWritingView && window.answerWritingView.render(params);
    } else if (viewName === 'create-quiz') {
      window.createQuizView && window.createQuizView.render();
    } else if (viewName === 'library') {
      window.libraryView && window.libraryView.render(params.tab);
    } else if (viewName === 'quiz-history') {
      window.quizHistoryView && window.quizHistoryView.render();
    } else if (viewName === 'tools') {
      window.toolsView && window.toolsView.render(params.tool);
    } else if (viewName === 'exam-alerts') {
      window.examAlertsView && window.examAlertsView.render();
    } else if (viewName === 'settings') {
      window.settingsView && window.settingsView.render();
    }


    if (window.lucide) window.lucide.createIcons();
  }

  // =========================================================================
  // ACTIONS & FLOW CONTROLS
  // =========================================================================
  startQuiz(quizId, updateHash = true) {
    // startQuiz bypasses navigate(), so release any previous attempt's timer
    // and key handler here too. loadAndStart() re-attaches them cleanly.
    if (this.currentView === 'quiz-player' && window.quizPlayerView) {
      window.quizPlayerView.onLeaveView();
    }

    this.activeQuizId = Number(quizId);
    this.currentView = 'quiz-player';
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('view-quiz-player');
    if (el) el.classList.add('active');

    if (updateHash) {
      window.location.hash = `#quiz-player?id=${quizId}`;
    }

    window.quizPlayerView.loadAndStart(quizId);
  }

  viewQuizResult(quizId, updateHash = true) {
    // Also bypasses navigate() — covers jumping straight to a result via hash
    // while a quiz is still running.
    if (this.currentView === 'quiz-player' && window.quizPlayerView) {
      window.quizPlayerView.onLeaveView();
    }

    this.activeQuizId = Number(quizId);
    this.currentView = 'quiz-result';

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('view-quiz-result');
    if (el) el.classList.add('active');

    if (updateHash) {
      window.location.hash = `#quiz-result?id=${quizId}`;
    }

    window.quizResultView.loadResult(quizId);
  }

  // =========================================================================
  // GENERATION LIFECYCLE (overlay + cancellation + concurrency guard)
  // =========================================================================

  /**
   * Open the generating overlay and mark a generation as in flight.
   * @returns {boolean} false if another generation is already running.
   */
  beginGeneration(label = 'Hamsa AI Ingestion in Progress...') {
    if (this._isGenerating) {
      this.showToast('A generation is already running. Wait for it to finish or cancel it.', 'warning');
      return false;
    }
    this._isGenerating = true;
    this._generationCancelled = false;

    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.classList.add('active');

    const title = document.getElementById('generating-title');
    if (title) title.textContent = label;

    const cancelBtn = document.getElementById('generating-cancel-btn');
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.style.display = '';
    }

    // Reset batch visuals so a previous run's progress isn't shown.
    const batchCard = document.getElementById('batch-progress-card');
    if (batchCard) batchCard.style.display = 'none';
    const batchFill = document.getElementById('batch-progress-fill');
    if (batchFill) batchFill.style.width = '0%';
    const batchPills = document.getElementById('batch-pills-container');
    if (batchPills) batchPills.innerHTML = '';
    document.querySelectorAll('.step-progress-item').forEach(el => {
      el.className = 'step-progress-item';
    });

    this.lastPingedBatch = null;
    return true;
  }

  /** Close the overlay and clear the in-flight flag. */
  endGeneration() {
    this._isGenerating = false;
    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  /** True when the user pressed Cancel during the current generation. */
  isGenerationCancelled() {
    return this._generationCancelled === true;
  }

  /**
   * Abort every in-flight Gemini request and close the overlay.
   * Requests previously kept running after the overlay was dismissed, still
   * burning quota and writing results into a view the user had left.
   */
  cancelGeneration() {
    this._generationCancelled = true;

    const cancelBtn = document.getElementById('generating-cancel-btn');
    if (cancelBtn) cancelBtn.disabled = true;

    const title = document.getElementById('generating-title');
    if (title) title.textContent = 'Cancelling...';

    if (window.aiClient) window.aiClient.abortAll();

    this.endGeneration();
    this.showToast('Generation cancelled.', 'info');
  }

  // =========================================================================
  // UNIVERSAL GENERATION STATUS HANDLER
  // =========================================================================
  handleGenerationProgress(status) {
    const title = document.getElementById('generating-title');
    const bCard = document.getElementById('batch-progress-card');
    const bBadge = document.getElementById('batch-status-badge');
    const bCount = document.getElementById('batch-questions-count');
    const bFill = document.getElementById('batch-progress-fill');
    const pillsRow = document.getElementById('batch-pills-container');

    if (typeof status === 'string') {
      if (title) title.textContent = status;
    } else if (typeof status === 'object' && status !== null) {
      if (title && status.message) title.textContent = status.message;
      
      const showCard = status.totalBatches > 1 || status.showBatchCard || status.percent !== undefined;
      if (bCard && showCard) bCard.style.display = 'flex';

      if (bBadge) {
        if (status.badgeText) {
          bBadge.textContent = status.badgeText;
        } else if (status.totalBatches > 1) {
          const rem = status.totalBatches - status.batchIndex;
          bBadge.textContent = `Batch ${status.batchIndex} of ${status.totalBatches}${rem > 0 ? ` (${rem} remaining)` : ' (Final)'}`;
        }
      }

      if (bCount) {
        if (status.countText) {
          bCount.textContent = status.countText;
        } else if (status.completedQuestions !== undefined && status.totalQuestions !== undefined) {
          bCount.textContent = `${status.completedQuestions} / ${status.totalQuestions} MCQs Ready`;
        } else if (status.percent !== undefined) {
          bCount.textContent = `${Math.round(status.percent)}% Completed`;
        }
      }

      if (bFill && status.percent !== undefined) {
        bFill.style.width = `${Math.min(100, Math.max(0, status.percent))}%`;
      }

      if (status.batchIndex > 1 && status.batchIndex !== this.lastPingedBatch) {
        this.lastPingedBatch = status.batchIndex;
        if (window.audioEngine) window.audioEngine.playBatchPing();
      }

      if (pillsRow && status.totalBatches > 1) {
        // Show only the current batch to prevent UI overflow with many batches
        pillsRow.innerHTML = `
          <div class="batch-pill active" style="margin: 0 auto;">
            <span>⚡ Processing Batch ${status.batchIndex} of ${status.totalBatches}</span>
          </div>
        `;
      }


      // Step progress items update if provided
      if (status.stepId) {
        document.querySelectorAll('.step-progress-item').forEach(el => {
          if (el.id === status.stepId) el.className = 'step-progress-item active';
        });
      }
      if (status.completedStepId) {
        const el = document.getElementById(status.completedStepId);
        if (el) el.className = 'step-progress-item completed';
      }
    }
  }

  // Instant Quick Revision Drill (5 AI-Generated MCQs via Gemini AI)
  async launchQuickDrill() {
    const drillTopics = [
      { topic: 'Indian Polity: Fundamental Rights, Articles & Constitutional Remedies', subject: 'Indian Polity' },
      { topic: 'Modern Indian History: Freedom Movement, 1857 Revolt & Leaders', subject: 'History & Culture' },
      { topic: 'Science & Technology: Cell Biology, DNA & Space Missions', subject: 'Science & Tech' },
      { topic: 'Indian Economy: RBI Monetary Policy, Inflation & GDP', subject: 'Economy' },
      { topic: 'Indian Geography: Monsoons, Major Rivers & Mountain Passes', subject: 'Geography' }
    ];

    const chosen = drillTopics[Math.floor(Math.random() * drillTopics.length)];

    // Refuses if a generation is already running, and resets the overlay state.
    if (!this.beginGeneration('Generating 5-Minute AI Drill...')) return;

    const updateStep = (id, active = true, completed = false) => {
      const el = document.getElementById(id);
      if (el) {
        if (completed) el.className = 'step-progress-item completed';
        else if (active) el.className = 'step-progress-item active';
      }
    };

    try {
      updateStep('step-reading', true);
      await new Promise(r => setTimeout(r, 250));
      updateStep('step-reading', false, true);
      updateStep('step-extracting', true);
      await new Promise(r => setTimeout(r, 250));
      updateStep('step-extracting', false, true);
      updateStep('step-formulating', true);

      const generated = await window.geminiService.generateQuiz({
        sourceContent: `Competitive exam syllabus for ${chosen.topic}`,
        sourceTitle: chosen.topic,
        subject: chosen.subject,
        difficulty: 'MEDIUM',
        questionCount: 5,
        quizMode: 'PRACTICE',
        language: 'ENGLISH',
        allowDemoFallback: false,
        onStatusUpdate: (status) => this.handleGenerationProgress(status)
      });

      updateStep('step-formulating', false, true);
      updateStep('step-crafting', true);
      await new Promise(r => setTimeout(r, 300));
      updateStep('step-crafting', false, true);

      const quizId = await saveNewQuiz({
        title: `⚡ 5-Min AI Drill (${chosen.subject})`,
        subject: chosen.subject,
        difficulty: 'MEDIUM',
        quizMode: 'PRACTICE',
        language: 'ENGLISH',
        sourceType: 'TEXT_NOTES',
        sourceTitle: chosen.topic
      }, generated.questions);

      this.endGeneration();
      if (window.audioEngine) window.audioEngine.playFanfare();
      this.showToast('5-Min AI Drill generated successfully via Gemini AI!', 'success');
      this.startQuiz(quizId);
    } catch (err) {
      this.endGeneration();
      // A user-initiated cancel already showed its own toast.
      if (this.isGenerationCancelled() || err.name === 'AbortError') return;
      console.error('Quick Drill error:', err);
      this.showToast(`AI Generation failed: ${err.message}`, 'error');
    }
  }

  // Full UPSC / State PSC Master Mock Test (15 Deep MCQs via Gemini AI in 2 Batches [10, 5])
  async launchMockTest() {
    const upscTopics = [
      'UPSC CSE Prelims: Indian Constitution, Federal Structure & Landmark Judicial Pronouncements',
      'UPSC CSE Prelims: Indian Economy, Macroeconomic Indicators, Fiscal Deficit & External Sector',
      'UPSC CSE Prelims: Ecology & Environment, Biodiversity Hotspots & Climate Agreements',
      'UPSC CSE Prelims: Modern Indian History, Tribal/Peasant Movements & Freedom Milestones'
    ];

    const chosenTopic = upscTopics[Math.floor(Math.random() * upscTopics.length)];

    if (!this.beginGeneration('Building UPSC Master Mock Test...')) return;

    // Reset batch visuals
    const batchCard = document.getElementById('batch-progress-card');
    if (batchCard) batchCard.style.display = 'none';
    const batchFill = document.getElementById('batch-progress-fill');
    if (batchFill) batchFill.style.width = '0%';
    const batchPills = document.getElementById('batch-pills-container');
    if (batchPills) batchPills.innerHTML = '';

    const updateStep = (id, active = true, completed = false) => {
      const el = document.getElementById(id);
      if (el) {
        if (completed) el.className = 'step-progress-item completed';
        else if (active) el.className = 'step-progress-item active';
      }
    };

    try {
      updateStep('step-reading', true);
      await new Promise(r => setTimeout(r, 300));
      updateStep('step-reading', false, true);
      updateStep('step-extracting', true);
      await new Promise(r => setTimeout(r, 300));
      updateStep('step-extracting', false, true);
      updateStep('step-formulating', true);

      const generated = await window.geminiService.generateQuiz({
        sourceContent: `Comprehensive UPSC General Studies Prelims Syllabus on ${chosenTopic}`,
        sourceTitle: chosenTopic,
        subject: 'General Knowledge',
        difficulty: 'HARD',
        questionCount: 15,
        quizMode: 'EXAM',
        language: 'ENGLISH',
        allowDemoFallback: false,
        onStatusUpdate: (status) => this.handleGenerationProgress(status)
      });

      updateStep('step-formulating', false, true);
      updateStep('step-crafting', true);
      await new Promise(r => setTimeout(r, 300));
      updateStep('step-crafting', false, true);

      const quizId = await saveNewQuiz({
        title: '📚 UPSC / State PSC Master Mock Test',
        subject: 'General Knowledge',
        difficulty: 'HARD',
        quizMode: 'EXAM',
        language: 'ENGLISH',
        sourceType: 'TEXT_NOTES',
        sourceTitle: 'UPSC Prelims Master Mock'
      }, generated.questions);

      this.endGeneration();
      if (window.audioEngine) window.audioEngine.playFanfare();
      this.showToast('UPSC Master Mock Test formulated successfully via Gemini AI!', 'success');
      this.startQuiz(quizId);
    } catch (err) {
      this.endGeneration();
      if (this.isGenerationCancelled() || err.name === 'AbortError') return;
      console.error('UPSC Mock Test error:', err);
      this.showToast(`AI Generation failed: ${err.message}`, 'error');
    }
  }

  // PDF Export Handlers
  async exportQuizPdf(quizId) {
    try {
      this.showToast('Generating official A4 PDF Question Paper...', 'info');
      const data = await getQuizWithQuestions(quizId);
      if (!data || !data.questions) {
        this.showToast('Quiz questions could not be loaded.', 'error');
        return;
      }
      await window.pdfGenerator.generateQuestionPaperPdf(data, data.questions);
      this.showToast('A4 PDF downloaded successfully! 📄', 'success');
    } catch (err) {
      console.error(err);
      this.showToast(`PDF generation error: ${err.message}`, 'error');
    }
  }

  async exportCurrentPlayingPdf() {
    if (this.activeQuizId) {
      await this.exportQuizPdf(this.activeQuizId);
    }
  }

  // =========================================================================
  // TOAST NOTIFICATIONS & MODALS
  // =========================================================================
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    else if (type === 'error') iconName = 'alert-circle';
    else if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width:18px;height:18px;flex-shrink:0;"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 250ms ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  /**
   * Reusable confirm dialog.
   *
   * Supports an explicit cancel path so callers can offer a real either/or
   * choice (e.g. "Resume" vs "Start Over") and always learn the outcome.
   * Escape and a backdrop click both count as cancel.
   */
  showConfirmation({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm = () => {},
    onCancel = null
  }) {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;

    const titleEl = document.getElementById('modal-confirm-title');
    const msgEl = document.getElementById('modal-confirm-message');
    const actionBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    if (titleEl) titleEl.textContent = title;
    // textContent keeps \n in the source but collapses visually; preserve
    // author-intended line breaks in these messages.
    if (msgEl) {
      msgEl.textContent = message;
      msgEl.style.whiteSpace = 'pre-line';
    }

    // Guarantee the outcome fires exactly once, whichever path closes the modal.
    let settled = false;
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      this._closeConfirmation();
      if (typeof fn === 'function') fn();
    };

    if (actionBtn) {
      actionBtn.textContent = confirmText;
      actionBtn.onclick = () => settle(onConfirm);
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => settle(onCancel);
    }

    // Remember where focus came from so it can be restored on close.
    this._confirmPreviousFocus = document.activeElement;

    // Escape to cancel, and trap Tab inside the dialog so keyboard users can't
    // wander into the inert page behind it.
    this._confirmKeyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(onCancel);
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = [cancelBtn, actionBtn].filter(b => b && !b.disabled);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !modal.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', this._confirmKeyHandler);

    // Backdrop click to cancel (ignore clicks inside the dialog).
    this._confirmBackdropHandler = (e) => {
      if (e.target === modal) settle(onCancel);
    };
    modal.addEventListener('click', this._confirmBackdropHandler);

    modal.classList.add('active');

    // Move focus into the dialog for keyboard and screen-reader users.
    setTimeout(() => {
      if (actionBtn) actionBtn.focus();
    }, 50);
  }

  /** Tear down listeners registered by showConfirmation. */
  _closeConfirmation() {
    const modal = document.getElementById('confirmation-modal');
    if (this._confirmKeyHandler) {
      document.removeEventListener('keydown', this._confirmKeyHandler);
      this._confirmKeyHandler = null;
    }
    if (modal && this._confirmBackdropHandler) {
      modal.removeEventListener('click', this._confirmBackdropHandler);
      this._confirmBackdropHandler = null;
    }
    if (modal) modal.classList.remove('active');

    // Return focus to whatever opened the dialog, so keyboard users don't get
    // dumped back at the top of the document.
    const prev = this._confirmPreviousFocus;
    this._confirmPreviousFocus = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      try { prev.focus(); } catch { /* element may have been re-rendered */ }
    }
  }

  showModal(opts) {
    return this.showConfirmation(opts);
  }

  hideModal() {
    this._closeConfirmation();
  }

  // =========================================================================
  // GLOBAL SEARCH ENGINE CONTROLLER (Unified Search Across Quizzes, Qs, Notes)
  // =========================================================================
  openGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    const input = document.getElementById('global-search-input');
    if (input) {
      input.focus();
      input.select();
    }
    if (window.audioEngine) window.audioEngine.playClick();
    this.refreshIcons();

    if (this.searchQuery) {
      this.executeGlobalSearch(this.searchQuery);
    } else {
      this.renderSearchResults();
    }
  }

  closeGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';
  }

  handleSearchBackdropClick(event) {
    if (event.target && event.target.id === 'global-search-modal') {
      this.closeGlobalSearch();
    }
  }

  clearGlobalSearch() {
    const input = document.getElementById('global-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    this.searchQuery = '';
    this.searchResults = { quizzes: [], questions: [], notes: [], totalCount: 0 };
    this.renderSearchResults();
  }

  handleSearchInput(event) {
    const q = (event.target.value || '').trim();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

    this.searchQuery = q;
    clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      this.executeGlobalSearch(q);
    }, 150);
  }

  async executeGlobalSearch(query) {
    if (!query) {
      this.searchResults = { quizzes: [], questions: [], notes: [], totalCount: 0 };
      this.renderSearchResults();
      return;
    }

    if (typeof searchGlobalContent === 'function') {
      this.searchResults = await searchGlobalContent(query);
      this.highlightedSearchIndex = 0;
      this.renderSearchResults();
    }
  }

  setSearchCategoryFilter(filter) {
    this.searchCategory = filter;
    const tabs = document.querySelectorAll('.search-tab-pill');
    tabs.forEach(t => {
      if (t.getAttribute('data-filter') === filter) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    this.renderSearchResults();
  }

  handleSearchKeydown(event) {
    if (event.key === 'Escape') {
      this.closeGlobalSearch();
      return;
    }

    const items = document.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedSearchIndex = (this.highlightedSearchIndex + 1) % items.length;
      this.updateHighlightedSearchItem(items);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedSearchIndex = (this.highlightedSearchIndex - 1 + items.length) % items.length;
      this.updateHighlightedSearchItem(items);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const current = items[this.highlightedSearchIndex];
      if (current) current.click();
    }
  }

  updateHighlightedSearchItem(items) {
    items.forEach((it, idx) => {
      if (idx === this.highlightedSearchIndex) {
        it.classList.add('highlighted');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('highlighted');
      }
    });
  }

  renderSearchResults() {
    const listEl = document.getElementById('global-search-results');
    if (!listEl) return;

    const totalCount = this.searchResults.totalCount || 0;
    const countAll = document.getElementById('count-all');
    const countQuizzes = document.getElementById('count-quizzes');
    const countQuestions = document.getElementById('count-questions');
    const countNotes = document.getElementById('count-notes');

    if (countAll) countAll.textContent = totalCount;
    if (countQuizzes) countQuizzes.textContent = this.searchResults.quizzes.length;
    if (countQuestions) countQuestions.textContent = this.searchResults.questions.length;
    if (countNotes) countNotes.textContent = this.searchResults.notes.length;

    if (!this.searchQuery) {
      listEl.innerHTML = `
        <div class="search-empty-state">
          <i data-lucide="compass" style="width:36px;height:36px;color:var(--color-primary-light);opacity:0.7;"></i>
          <p style="font-weight:600;margin-top:0.5rem;color:var(--text-main);">Type to search across everything</p>
          <span style="font-size:0.85rem;color:var(--text-muted);">Quizzes, questions, options, digital textbook notes & chapters</span>
        </div>
        <div style="padding: 0.5rem 0.5rem 0.25rem;">
          <div class="search-group-header">Quick Actions</div>
          <div class="search-result-item" onclick="app.closeGlobalSearch(); app.navigate('create-quiz');">
            <div class="search-result-icon action"><i data-lucide="plus-circle" style="width:18px;height:18px;"></i></div>
            <div class="search-result-body">
              <div class="search-result-title">Create New Quiz</div>
              <div class="search-result-desc">Ingest PDF or text notes to generate AI practice MCQs</div>
            </div>
          </div>
          <div class="search-result-item" onclick="app.closeGlobalSearch(); app.setModule('study-hub');">
            <div class="search-result-icon note"><i data-lucide="book-open" style="width:18px;height:18px;"></i></div>
            <div class="search-result-body">
              <div class="search-result-title">Open Study Notes Vault</div>
              <div class="search-result-desc">Browse digital textbooks, glossaries, and chapter summaries</div>
            </div>
          </div>
          <div class="search-result-item" onclick="app.closeGlobalSearch(); app.setModule('flashcards');">
            <div class="search-result-icon quiz"><i data-lucide="zap" style="width:18px;height:18px;"></i></div>
            <div class="search-result-body">
              <div class="search-result-title">Practice 3D Flashcards</div>
              <div class="search-result-desc">Review starred questions and memory cards</div>
            </div>
          </div>
          <div class="search-result-item" onclick="app.closeGlobalSearch(); app.setModule('exam-alerts');">
            <div class="search-result-icon action"><i data-lucide="bell-ring" style="width:18px;height:18px;"></i></div>
            <div class="search-result-body">
              <div class="search-result-title">Exam Alerts & Eligibility</div>
              <div class="search-result-desc">Explore notifications, deadlines & auto-check eligibility</div>
            </div>
          </div>
        </div>
      `;
      this.refreshIcons();
      return;
    }

    if (totalCount === 0) {
      listEl.innerHTML = `
        <div class="search-empty-state">
          <i data-lucide="search-x" style="width:36px;height:36px;color:var(--color-error);opacity:0.8;"></i>
          <p style="font-weight:700;margin-top:0.5rem;color:var(--text-main);">No results found for "${this.escapeHtml(this.searchQuery)}"</p>
          <span style="font-size:0.85rem;color:var(--text-muted);max-width:340px;">Try searching for a different keyword, topic name, or check spelling.</span>
        </div>
      `;
      this.refreshIcons();
      return;
    }

    let html = '';
    const category = this.searchCategory;

    const highlight = (text) => {
      if (!text) return '';
      const safe = this.escapeHtml(text);
      if (!this.searchQuery) return safe;
      const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
      return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
    };

    // 1. Quizzes
    if ((category === 'ALL' || category === 'QUIZZES') && this.searchResults.quizzes.length > 0) {
      html += `<div class="search-group-header">Quizzes (${this.searchResults.quizzes.length})</div>`;
      html += this.searchResults.quizzes.map(quiz => `
        <div class="search-result-item" onclick="app.selectSearchResult('quiz', ${quiz.id})">
          <div class="search-result-icon quiz">
            <i data-lucide="help-circle" style="width:18px;height:18px;"></i>
          </div>
          <div class="search-result-body">
            <div class="search-result-title">${highlight(quiz.title)}</div>
            <div class="search-result-desc">
              ${quiz.percentage !== null ? `Completed with score: <strong>${quiz.percentage}%</strong> • ` : 'Not attempted yet • '}
              ${quiz.totalQuestions} Questions • ${highlight(quiz.subject)}
            </div>
            <div class="search-result-meta">
              <span class="badge badge-muted">${quiz.difficulty}</span>
              <span>Matched in ${quiz.matchField}</span>
            </div>
          </div>
        </div>
      `).join('');
    }

    // 2. Questions
    if ((category === 'ALL' || category === 'QUESTIONS') && this.searchResults.questions.length > 0) {
      html += `<div class="search-group-header">Questions (${this.searchResults.questions.length})</div>`;
      html += this.searchResults.questions.map(q => `
        <div class="search-result-item" onclick="app.selectSearchResult('question', ${q.id}, ${q.quizId})">
          <div class="search-result-icon question">
            <i data-lucide="check-square" style="width:18px;height:18px;"></i>
          </div>
          <div class="search-result-body">
            <div class="search-result-title">${highlight(q.questionText)}</div>
            <div class="search-result-desc">${highlight(q.explanation || 'Question from ' + q.quizTitle)}</div>
            <div class="search-result-meta">
              <span>From: <strong>${this.escapeHtml(q.quizTitle)}</strong></span>
              <span>•</span>
              <span>${this.escapeHtml(q.subject)}</span>
            </div>
          </div>
        </div>
      `).join('');
    }

    // 3. Study Notes
    if ((category === 'ALL' || category === 'NOTES') && this.searchResults.notes.length > 0) {
      html += `<div class="search-group-header">Digital Textbook & Study Notes (${this.searchResults.notes.length})</div>`;
      html += this.searchResults.notes.map(note => `
        <div class="search-result-item" onclick="app.selectSearchResult('note', ${note.id})">
          <div class="search-result-icon note">
            <i data-lucide="book-open" style="width:18px;height:18px;"></i>
          </div>
          <div class="search-result-body">
            <div class="search-result-title">${highlight(note.title)}</div>
            <div class="search-result-desc">${highlight(note.snippet || note.description)}</div>
            <div class="search-result-meta">
              <span>${note.wordCount} words</span>
              <span>•</span>
              <span>${this.escapeHtml(note.subject)}</span>
            </div>
          </div>
        </div>
      `).join('');
    }

    listEl.innerHTML = html;
    this.refreshIcons();

    const items = listEl.querySelectorAll('.search-result-item');
    if (items.length > 0) {
      this.highlightedSearchIndex = 0;
      items[0].classList.add('highlighted');
    }
  }

  escapeRegex(str) {
    return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * NOTE: despite the name this sanitizes rather than escapes, so safe inline
   * formatting in search snippets survives. Kept as-is to avoid changing how
   * existing results render; use UIUtils.escapeHtml() for strict escaping.
   */
  escapeHtml(str) {
    return SecurityUtils.sanitizeHtml(str);
  }

  async selectSearchResult(type, id, quizId) {
    this.closeGlobalSearch();

    if (type === 'quiz') {
      this.startQuiz(id);
    } else if (type === 'question') {
      const quiz = await db.quizzes.get(Number(quizId));
      if (quiz && quiz.completedAt) {
        this.navigate('quiz-result');
        if (window.quizResultView) {
          window.quizResultView.loadResult(quizId);
        }
      } else {
        this.startQuiz(quizId);
      }
    } else if (type === 'note') {
      this.setModule('study-hub');
      if (window.studyNotesView) {
        window.studyNotesView.openNote(id);
      }
    }
  }

  // ==========================================================================
  // MANDATORY ONBOARDING & GLOBAL STUDENT PROFILE IDENTITY
  // ==========================================================================

  updateGlobalStudentIdentity() {
    if (!window.examProfileManager) return;
    const profile = window.examProfileManager.loadProfile() || window.examProfileManager.getProfile();
    const studentName = window.examProfileManager.getStudentName();
    const studentFirst = window.examProfileManager.getStudentFirstName();
    const initials = window.examProfileManager.getStudentInitials();

    // 1. Header user pill
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const badgeEl = document.getElementById('header-user-badge');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = studentFirst;
    if (badgeEl) {
      if (profile && profile.qualification) {
        badgeEl.textContent = profile.qualification.split(' ')[0];
      } else {
        badgeEl.textContent = 'Student';
      }
    }

    // 2. Dashboard greeting if present
    const dashGreeting = document.querySelector('.hero-greeting span');
    if (dashGreeting && dashGreeting.textContent.includes(',')) {
      const hour = new Date().getHours();
      let greeting = 'Good evening';
      if (hour < 12) greeting = 'Good morning';
      else if (hour < 17) greeting = 'Good afternoon';
      dashGreeting.textContent = `${greeting}, ${studentFirst}`;
    }

    // 3. Exam alerts view greeting if present
    const eaGreeting = document.querySelector('.ea-hero-greeting span');
    if (eaGreeting) {
      const hour = new Date().getHours();
      let greeting = 'Good evening';
      if (hour < 12) greeting = 'Good morning';
      else if (hour < 17) greeting = 'Good afternoon';
      eaGreeting.textContent = `${greeting}, ${studentFirst}`;
    }
  }

  checkMandatoryProfileOnboarding() {
    if (!window.examProfileManager) return;
    window.examProfileManager.loadProfile();

    const isComplete = window.examProfileManager.isProfileComplete();
    const modal = document.getElementById('mandatory-onboarding-modal');
    if (!modal) return;

    if (!isComplete) {
      this.populateOnboardingDropdowns();
      const cancelBtn = document.getElementById('ob-cancel-btn');
      if (cancelBtn) cancelBtn.style.display = 'none';
      modal.style.display = 'flex';
      document.body.classList.add('onboarding-locked');

      // Prevent closing with Esc or clicking outside
      const trapHandler = (e) => {
        if (e.key === 'Escape' && !window.examProfileManager.isProfileComplete()) {
          e.preventDefault();
          e.stopPropagation();
          this.showToast('Please complete your profile to unlock the platform.', 'warning');
        }
      };
      window.addEventListener('keydown', trapHandler, true);
    } else {
      modal.style.display = 'none';
      document.body.classList.remove('onboarding-locked');
      this.updateGlobalStudentIdentity();
    }
  }

  // =========================================================================
  // ONBOARDING — EDUCATION LIST
  //
  // The form used to ask for exactly three things: a 10th percentage, a 12th
  // percentage and one "highest qualification". That cannot describe a real
  // candidate. Both percentages were mandatory, so somebody who has only passed
  // 10th could not complete the profile at all — and a graduate could not record
  // their ITI, diploma or B.Ed alongside the degree.
  //
  // This is a repeatable list instead. State lives in `this._educationRows`;
  // the DOM is re-rendered from it, so adding and removing rows cannot leave the
  // markup and the data disagreeing.
  // =========================================================================

  /** A blank row. `level` empty means "not chosen yet". */
  _blankEducationRow() {
    return { level: '', institution: '', passingYear: '', scoreType: 'PERCENTAGE', score: '' };
  }

  /**
   * Seed the list from a saved profile, or start with one empty row so the
   * section is never an empty box with nothing to act on.
   */
  _initEducationRows(profileData) {
    const saved = profileData && Array.isArray(profileData.education) ? profileData.education : null;
    this._educationRows = (saved && saved.length)
      ? saved.map(e => ({
        level: e.level || '',
        institution: e.institution || '',
        passingYear: e.passingYear || '',
        scoreType: e.scoreType || 'PERCENTAGE',
        score: (e.score === null || e.score === undefined) ? '' : String(e.score)
      }))
      : [this._blankEducationRow()];
    this._renderEducationRows();
  }

  /** Read every row back out of the DOM into state before a re-render. */
  _syncEducationRowsFromDom() {
    const list = document.getElementById('ob-education-list');
    if (!list || !this._educationRows) return;

    [...list.querySelectorAll('.ob-edu-row')].forEach((rowEl) => {
      const i = Number(rowEl.getAttribute('data-index'));
      if (!this._educationRows[i]) return;
      const get = (field) => rowEl.querySelector(`[data-field="${field}"]`)?.value ?? '';
      this._educationRows[i] = {
        level: get('level'),
        institution: get('institution'),
        passingYear: get('passingYear'),
        scoreType: get('scoreType') || 'PERCENTAGE',
        score: get('score')
      };
    });
  }

  _renderEducationRows() {
    const list = document.getElementById('ob-education-list');
    if (!list) return;

    const options = window.QUALIFICATION_OPTIONS || [];
    const esc = (v) => SecurityUtils.escapeHtml(v == null ? '' : String(v));
    const thisYear = new Date().getFullYear();

    // Levels already chosen, so the same qualification cannot be added twice.
    const chosen = this._educationRows.map(r => r.level).filter(Boolean);

    list.innerHTML = this._educationRows.map((row, i) => {
      const isCgpa = row.scoreType === 'CGPA';
      return `
      <div class="ob-edu-row" data-index="${i}">
        <div class="ob-edu-row-head">
          <span class="ob-edu-num">${i + 1}</span>
          <span class="ob-edu-row-title">${row.level ? esc(this._educationLabel(row.level)) : 'New qualification'}</span>
          ${this._educationRows.length > 1 ? `
            <button type="button" class="ob-edu-remove" title="Remove this qualification"
              onclick="app.removeEducationRow(${i})" aria-label="Remove qualification ${i + 1}">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          ` : ''}
        </div>

        <div class="ob-edu-grid">
          <div class="ob-edu-field ob-edu-field-level">
            <label for="ob-edu-level-${i}">Qualification <span class="ob-required">*</span></label>
            <select id="ob-edu-level-${i}" data-field="level" onchange="app.onEducationRowChange()">
              <option value="">-- Select --</option>
              ${options.map(o => `
                <option value="${esc(o.id)}"
                  ${row.level === o.id ? 'selected' : ''}
                  ${row.level !== o.id && chosen.includes(o.id) ? 'disabled' : ''}>
                  ${esc(o.label)}${row.level !== o.id && chosen.includes(o.id) ? ' (already added)' : ''}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="ob-edu-field">
            <label for="ob-edu-institution-${i}">Board / University <span class="ob-optional">(optional)</span></label>
            <input type="text" id="ob-edu-institution-${i}" data-field="institution"
              value="${esc(row.institution)}" placeholder="e.g. CBSE, Punjab University"
              maxlength="120" onchange="app.onEducationRowChange()">
          </div>

          <div class="ob-edu-field ob-edu-field-year">
            <label for="ob-edu-year-${i}">Passing year <span class="ob-optional">(optional)</span></label>
            <input type="number" id="ob-edu-year-${i}" data-field="passingYear"
              value="${esc(row.passingYear)}" placeholder="${thisYear}"
              min="1960" max="${thisYear + 6}" step="1" onchange="app.onEducationRowChange()">
          </div>

          <div class="ob-edu-field ob-edu-field-score">
            <label for="ob-edu-score-${i}">Marks <span class="ob-optional">(optional)</span></label>
            <div class="ob-edu-score-split">
              <select data-field="scoreType" aria-label="Marks type" onchange="app.onEducationRowChange()">
                <option value="PERCENTAGE" ${!isCgpa ? 'selected' : ''}>%</option>
                <option value="CGPA" ${isCgpa ? 'selected' : ''}>CGPA</option>
              </select>
              <input type="number" id="ob-edu-score-${i}" data-field="score"
                value="${esc(row.score)}" placeholder="${isCgpa ? '8.2' : '85.6'}"
                min="0" max="${isCgpa ? '10' : '100'}" step="0.01" onchange="app.onEducationRowChange()">
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    const counter = document.getElementById('ob-education-count');
    if (counter) {
      const filled = this._educationRows.filter(r => r.level).length;
      counter.textContent = `${filled} added`;
    }

    // Every level taken means there is nothing left to add.
    const addBtn = document.getElementById('ob-add-education');
    if (addBtn) {
      const allTaken = chosen.length >= options.length;
      addBtn.disabled = allTaken;
      addBtn.style.display = allTaken ? 'none' : '';
    }

    this.refreshIcons();
  }

  /** Any field changed — persist to state and re-render for the dedupe list. */
  onEducationRowChange() {
    this._syncEducationRowsFromDom();
    this._renderEducationRows();
    this.validateEducation();
  }

  addEducationRow() {
    this._syncEducationRowsFromDom();

    // Refuse a second blank row: the user has an empty one to fill already.
    const hasBlank = this._educationRows.some(r => !r.level);
    if (hasBlank) {
      this.showToast('Choose a qualification in the empty row first.', 'info');
      return;
    }

    this._educationRows.push(this._blankEducationRow());
    this._renderEducationRows();

    // Drop focus straight into the new row's selector.
    const last = this._educationRows.length - 1;
    document.getElementById(`ob-edu-level-${last}`)?.focus();
  }

  removeEducationRow(index) {
    this._syncEducationRowsFromDom();
    if (this._educationRows.length <= 1) {
      // Clear it rather than leaving the section with no row at all.
      this._educationRows = [this._blankEducationRow()];
    } else {
      this._educationRows.splice(index, 1);
    }
    this._renderEducationRows();
    this.validateEducation();
  }

  _educationLabel(levelId) {
    const entry = (window.QUALIFICATION_OPTIONS || []).find(o => o.id === levelId);
    return entry ? entry.label : levelId;
  }

  /** Rows worth saving: a level was chosen. */
  _collectEducation() {
    this._syncEducationRowsFromDom();
    return (this._educationRows || [])
      .filter(r => r.level)
      .map(r => ({
        level: r.level,
        institution: (r.institution || '').trim(),
        passingYear: r.passingYear === '' ? null : parseInt(r.passingYear, 10),
        scoreType: r.scoreType === 'CGPA' ? 'CGPA' : 'PERCENTAGE',
        score: r.score === '' ? null : parseFloat(r.score)
      }));
  }

  validateEducation() {
    const errEl = document.getElementById('ob-err-education');
    const groupEl = document.getElementById('ob-group-education');
    const rows = this._collectEducation();

    let error = '';
    if (rows.length === 0) {
      error = 'Add at least one qualification.';
    } else {
      for (const r of rows) {
        const max = r.scoreType === 'CGPA' ? 10 : 100;
        if (r.score !== null && (isNaN(r.score) || r.score < 0 || r.score > max)) {
          error = `${this._educationLabel(r.level)}: marks must be between 0 and ${max}.`;
          break;
        }
        if (r.passingYear !== null &&
            (isNaN(r.passingYear) || r.passingYear < 1960 || r.passingYear > new Date().getFullYear() + 6)) {
          error = `${this._educationLabel(r.level)}: check the passing year.`;
          break;
        }
      }
    }

    if (errEl) errEl.textContent = error;
    if (groupEl) groupEl.classList.toggle('has-error', !!error);
    return !error;
  }

  populateOnboardingDropdowns(profileData = null) {
    const domicileSelect = document.getElementById('ob-domicile');

    this._initEducationRows(profileData);

    if (domicileSelect && (domicileSelect.children.length <= 1 || profileData)) {
      domicileSelect.innerHTML = '<option value="">-- Select State for State Govt Exams & Quota --</option>' +
        (window.STATE_OPTIONS || []).filter(Boolean).map(s => `<option value="${s}">${s}</option>`).join('');
    }

    if (profileData) {
      const form = document.getElementById('onboarding-profile-form');
      if (form) {
        if (form.fullName) form.fullName.value = profileData.fullName || '';
        if (form.gender) form.gender.value = profileData.gender || 'MALE';
        if (form.dateOfBirth) form.dateOfBirth.value = profileData.dateOfBirth || '';
        if (form.category) form.category.value = profileData.category || '';
        if (form.domicile) form.domicile.value = profileData.domicile || '';
        // The old 10th / 12th / highest-qualification inputs are gone; those
        // values now live in the education list, which _initEducationRows()
        // above has already populated.
        if (form.hasBEd) form.hasBEd.checked = !!profileData.hasBEd;
        if (form.physicalFitnessReady) form.physicalFitnessReady.checked = !!profileData.physicalFitnessReady;
      }
    }
  }

  validateOnboardingField(fieldName) {
    const form = document.getElementById('onboarding-profile-form');
    if (!form) return;

    const val = form[fieldName]?.value?.trim();
    const errEl = document.getElementById(`ob-err-${fieldName}`);
    if (!errEl) return;

    let error = '';
    if (fieldName === 'fullName') {
      if (!val) error = 'Full name is required';
      else if (val.length < 2) error = 'Name must be at least 2 characters';
    } else if (fieldName === 'dateOfBirth') {
      if (!val) error = 'Date of birth is required';
      else {
        const age = window.examProfileManager.calculateAgeAtDate(val, new Date().toISOString().split('T')[0]);
        const calcSpan = document.getElementById('ob-dob-age-calc');
        if (calcSpan) calcSpan.textContent = `Calculated Age: ${age} years`;
        if (age < 14) error = 'Minimum age for registration is 14 years';
        else if (age > 65) error = 'Please verify your date of birth';
      }
    } else if (fieldName === 'category') {
      if (!val) error = 'Please select your category';
    } else if (fieldName === 'domicile') {
      if (!val) error = 'Please select your home state';
    }
    // Education is a repeatable list, not a single field — validateEducation()
    // owns it and reports into #ob-err-education.

    errEl.textContent = error;
    const groupEl = document.getElementById(`ob-group-${fieldName}`);
    if (groupEl) {
      if (error) groupEl.classList.add('has-error');
      else groupEl.classList.remove('has-error');
    }
    return !error;
  }

  handleOnboardingSubmit(event) {
    if (event) event.preventDefault();
    const form = document.getElementById('onboarding-profile-form');
    if (!form) return;

    const data = {
      fullName: form.fullName?.value?.trim() || '',
      gender: form.gender?.value || 'MALE',
      dateOfBirth: form.dateOfBirth?.value || '',
      category: form.category?.value || '',
      domicile: form.domicile?.value || '',
      // saveProfile() derives tenthPercentage, twelfthPercentage,
      // qualificationId, score and scoreType from this list, so the eligibility
      // engine keeps reading the same fields it always has.
      education: this._collectEducation(),
      hasBEd: form.hasBEd?.checked || false,
      physicalFitnessReady: form.physicalFitnessReady?.checked || false
    };

    if (!this.validateEducation()) {
      this.showToast('Please correct the education details.', 'error');
      document.getElementById('ob-group-education')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const result = window.examProfileManager.saveProfile(data);
    if (!result.valid) {
      Object.keys(result.errors).forEach(field => {
        const errEl = document.getElementById(`ob-err-${field}`);
        if (errEl) errEl.textContent = result.errors[field];
        const groupEl = document.getElementById(`ob-group-${field}`);
        if (groupEl) groupEl.classList.add('has-error');
      });
      this.showToast('Please correct the highlighted errors.', 'error');
      return;
    }

    // Success!
    const modal = document.getElementById('mandatory-onboarding-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    document.body.classList.remove('onboarding-locked');

    if (window.audioEngine) window.audioEngine.playQuizComplete();
    this.celebrateConfetti();

    this.updateGlobalStudentIdentity();

    this.showToast(`Welcome aboard, ${result.profile.fullName.split(' ')[0]}! Academic profile saved.`, 'success');

    if (this.currentView === 'dashboard' && window.dashboardView) {
      window.dashboardView.render();
    } else if (this.currentView === 'exam-alerts' && window.examAlertsView) {
      window.examAlertsView.render();
    }
  }

  openProfileManagerModal() {
    const modal = document.getElementById('mandatory-onboarding-modal');
    if (!modal) return;
    const profile = window.examProfileManager.loadProfile() || window.examProfileManager.getProfile();
    this.populateOnboardingDropdowns(profile);
    const cancelBtn = document.getElementById('ob-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    modal.style.display = 'flex';
  }

  closeProfileManagerModal() {
    const modal = document.getElementById('mandatory-onboarding-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  handleProfileLogout() {
    if (confirm('Are you sure you want to log out? Your local profile will be reset.')) {
      if (window.examProfileManager) {
        window.examProfileManager.resetProfile();
      }
      this.closeProfileManagerModal();
      if (window.authGate) {
        // Calling signOut will show the auth gate overlay and reset session
        window.authGate.signOut(() => {
          const root = document.getElementById('app-root');
          if (root) root.removeAttribute('hidden');
          window.app.init();
        });
      }
    }
  }
}

window.app = new HamsaApp();

/**
 * The app used to boot straight into the dashboard. It now waits behind
 * `window.authGate` on a first visit: the gate takes over the screen until
 * the visitor picks Guest or Google, and only then calls `boot()`.
 *
 * A visitor who has already chosen bypasses the gate entirely — the callback
 * runs immediately. If auth-gate.js failed to load (e.g. offline before the
 * service worker cached it), we fall through to booting the app rather than
 * leaving it invisible forever behind `#app-root[hidden]`.
 */
document.addEventListener('DOMContentLoaded', () => {
  const boot = () => {
    const root = document.getElementById('app-root');
    if (root) root.removeAttribute('hidden');
    window.app.init();
  };

  if (window.authGate && !window.authGate.isAuthenticated()) {
    window.authGate.show(boot);
  } else {
    boot();
  }
});
