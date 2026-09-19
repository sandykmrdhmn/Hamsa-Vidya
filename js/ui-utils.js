/**
 * HAMSA VIDYA (हंस विद्या) — Shared UI & Utility Helpers
 *
 * Consolidates idioms that had drifted into many independent copies:
 *   • escapeHtml       — 5 implementations (sanitizer.js + 4 hand-rolled copies)
 *   • escapeJs         — 1 buggy implementation (missed backslashes and newlines)
 *   • Blob downloads   — 16 near-identical anchor+revokeObjectURL blocks
 *   • jsPDF resolution — 3 copies of the same `window.jspdf?.jsPDF || window.jsPDF`
 *   • Speech synthesis — 6 independent controllers that couldn't stop each other
 *   • Date formatting  — 38 inline toISOString()/toLocaleDateString() calls
 *
 * Loaded after sanitizer.js so it can delegate escaping to SecurityUtils.
 */

const UIUtils = {

  // =========================================================================
  // ESCAPING
  // =========================================================================

  /**
   * Escape text for safe interpolation into HTML.
   * Single source of truth — delegates to SecurityUtils.
   */
  escapeHtml(str) {
    return window.SecurityUtils.escapeHtml(str);
  },

  /**
   * Escape text for safe interpolation into a single-quoted JavaScript string
   * literal, typically inside an inline `onclick` attribute.
   *
   * The previous implementation escaped only quotes:
   *     (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"')
   * which breaks in two ways:
   *   1. A backslash in the source (`C:\path`) survives unescaped, so a trailing
   *      `\` escapes the escape and terminates the string early.
   *   2. A newline inside an attribute value ends the JS statement.
   * Both turn user or AI text into executable code.
   *
   * Note: escaping is applied in the JS layer, but the browser HTML-decodes the
   * attribute before the JS parser sees it. Callers must therefore pass the
   * result through escapeHtml() as well, or better, use data attributes.
   */
  escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')   // must come first
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\u2028/g, '\\u2028')  // LINE SEPARATOR is a newline to JS
      .replace(/\u2029/g, '\\u2029')
      .replace(/</g, '\\x3C');        // avoid closing an enclosing </script>
  },

  /** Escape a string for literal use inside a RegExp. */
  escapeRegex(str) {
    return String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // =========================================================================
  // FILE DOWNLOADS
  // =========================================================================

  /**
   * Trigger a download for a Blob and release the object URL afterwards.
   * Replaces 16 copies that each created an anchor, clicked it, and set their
   * own revoke timeout (several leaked the URL when the click threw).
   */
  downloadBlob(blob, filename) {
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } finally {
      // Revoke on the next macrotask — immediate revocation can cancel the
      // download in some browsers, and a fixed 10s timer leaked if the tab
      // closed first.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },

  /** Download a string as a file. */
  downloadText(text, filename, mimeType = 'text/plain;charset=utf-8') {
    return this.downloadBlob(new Blob([text], { type: mimeType }), filename);
  },

  /** Download an object as pretty-printed JSON. */
  downloadJson(data, filename) {
    return this.downloadText(JSON.stringify(data, null, 2), filename, 'application/json');
  },

  /** Build a filesystem-safe filename fragment from arbitrary text. */
  slugify(text, fallback = 'hamsa-vidya') {
    const slug = String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return slug || fallback;
  },

  // =========================================================================
  // VENDOR LIBRARY RESOLUTION
  // =========================================================================

  /**
   * Resolve the jsPDF constructor across UMD build shapes.
   * @returns {Function|null}
   */
  resolveJsPDF() {
    return window.jspdf?.jsPDF || window.jsPDF || null;
  },

  /** Resolve jsPDF or show a consistent error toast. */
  requireJsPDF() {
    const ctor = this.resolveJsPDF();
    if (!ctor) {
      window.app?.showToast('PDF library (jsPDF) is not loaded. Reload the page and try again.', 'error');
      return null;
    }
    return ctor;
  },

  // =========================================================================
  // TEXT TO SPEECH
  //
  // Six views each kept their own `isSpeaking` flag and called
  // speechSynthesis.cancel() independently. Because the browser has a single
  // speech queue, starting playback in one view silently cut off another, and
  // navigating away often left audio running — app.navigate() only knew to stop
  // flashcards and ai-teacher.
  // =========================================================================

  _ttsState: {
    owner: null,
    utterance: null,
    onStateChange: null
  },

  /** Is speech synthesis usable in this browser? */
  isSpeechSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  /**
   * Speak text, cancelling whatever was playing.
   * @param {string} text
   * @param {Object} [opts]
   * @param {string} [opts.owner]   id of the view requesting playback
   * @param {string} [opts.lang]    BCP-47 tag, e.g. 'hi-IN'
   * @param {number} [opts.rate]
   * @param {Function} [opts.onEnd]
   * @param {Function} [opts.onStart]
   * @returns {boolean} whether playback started
   */
  speak(text, opts = {}) {
    if (!this.isSpeechSupported()) {
      window.app?.showToast('Text-to-speech is not supported in this browser.', 'warning');
      return false;
    }

    const clean = String(text ?? '')
      // Strip markdown/emoji decoration that would otherwise be read aloud.
      .replace(/[*#•_`>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return false;

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = opts.rate ?? 0.95;
    utterance.pitch = opts.pitch ?? 1.0;
    if (opts.lang) utterance.lang = opts.lang;

    // Devanagari content needs a Hindi voice to be intelligible.
    if (!opts.lang && /[\u0900-\u097F]/.test(clean)) {
      utterance.lang = 'hi-IN';
      const hindiVoice = this._findVoice('hi');
      if (hindiVoice) utterance.voice = hindiVoice;
    }

    utterance.onend = () => {
      this._ttsState.owner = null;
      this._ttsState.utterance = null;
      opts.onEnd?.();
    };
    utterance.onerror = () => {
      this._ttsState.owner = null;
      this._ttsState.utterance = null;
      opts.onEnd?.();
    };

    this._ttsState.owner = opts.owner || null;
    this._ttsState.utterance = utterance;

    window.speechSynthesis.speak(utterance);
    opts.onStart?.();
    return true;
  },

  /** Stop any playback, whichever view started it. */
  stopSpeaking() {
    if (!this.isSpeechSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch { /* already idle */ }
    this._ttsState.owner = null;
    this._ttsState.utterance = null;
  },

  /** True when speech is currently playing. */
  isSpeaking() {
    return this.isSpeechSupported() && window.speechSynthesis.speaking;
  },

  /** Which view (if any) owns the current playback. */
  speechOwner() {
    return this._ttsState.owner;
  },

  /**
   * Find a voice by language prefix.
   * getVoices() is frequently empty on first call, so this may return null
   * early in the page lifecycle — callers fall back to the default voice.
   * @private
   */
  _findVoice(langPrefix) {
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      return voices.find(v => (v.lang || '').toLowerCase().startsWith(langPrefix)) || null;
    } catch {
      return null;
    }
  },

  // =========================================================================
  // DATES & DURATIONS
  // =========================================================================

  /** Today (or a given date) as an `YYYY-MM-DD` key. */
  toDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    // Local date parts, so a late-evening session isn't filed under tomorrow
    // the way toISOString() would in positive UTC offsets.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /** `18 Sep 2026` style date for display. */
  formatDate(value, opts = {}) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', ...opts
    });
  },

  /** Date plus time, for attempt logs. */
  formatDateTime(value) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return `${this.formatDate(d)} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  },

  /** Seconds to `05m:09s`. */
  formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}m:${String(secs).padStart(2, '0')}s`;
  },

  /** Seconds to `MM:SS`, for countdown timers. */
  formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  },

  /**
   * Whole days from today until `value`. Negative when already past.
   * @returns {number|null} null when the date is unparseable
   */
  daysUntil(value) {
    if (!value) return null;
    const target = value instanceof Date ? new Date(value) : new Date(value);
    if (isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  },

  /** Human byte size. */
  formatBytes(bytes, decimals = 1) {
    const b = Number(bytes);
    if (!b || b <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((b / Math.pow(k, i)).toFixed(Math.max(0, decimals)))} ${sizes[i]}`;
  },

  // =========================================================================
  // VIEW HERO BANNER
  //
  // Every tab used to open differently. Dashboard and AI Teacher had large
  // branded banners; the other nine views opened with an unstyled `<h2>` in an
  // inline-styled flex div (create-quiz, library, quiz-history, settings) or a
  // one-off header class used by exactly one view (.study-vault-hero,
  // .tools-hero-header, .aw-header-row, .ea-hero). Nine bespoke headers meant
  // nine places to keep in sync and no shared visual language.
  //
  // This builder is the single source for all of them. Styling lives in
  // css/view-hero.css under the `.vhero*` namespace, so it cannot collide with
  // the per-view header rules that are still in the byte-frozen
  // css/components/* parts.
  //
  // Dashboard (.dash-masthead) and AI Teacher (.teacher-hero) intentionally
  // keep their own markup — they are the reference designs this one matches,
  // and converting them would churn their existing test coverage for no visual
  // gain.
  // =========================================================================

  /** Accents a hero may use. Anything else falls back to the brand primary. */
  VIEW_HERO_ACCENTS: ['violet', 'emerald', 'amber', 'cyan', 'pink', 'indigo', 'orange', 'slate'],

  /**
   * Build a view hero banner.
   *
   * Every section is optional, so a simple tab can pass three fields and a
   * data-heavy one can pass stats and chips as well.
   *
   * @param {object}   o
   * @param {string}  [o.accent]      one of VIEW_HERO_ACCENTS
   * @param {string}  [o.icon]        lucide icon name for the badge
   * @param {string}   o.eyebrow      small uppercase kicker above the title
   * @param {string}   o.title        first title line, rendered in solid ink
   * @param {string}  [o.titleAccent] second title line, gradient + light sweep
   * @param {string}  [o.hindi]       Devanagari line under the title
   * @param {string}  [o.tagline]     one sentence on what this tab does
   * @param {Array}   [o.stats]       [{ value, label }] live counters
   * @param {Array}   [o.actions]     [{ label, icon, onclick, variant }]
   * @param {string}  [o.chipsLabel]  heading for the chips strip
   * @param {Array}   [o.chips]       [{ icon, label, hint }] capability pills
   * @returns {string} HTML
   */
  buildViewHero(o = {}) {
    const esc = (v) => this.escapeHtml(v == null ? '' : String(v));

    // Icon names and accents are interpolated into an attribute and a class
    // name, so they are constrained rather than escaped — a stray value would
    // otherwise produce markup that silently does nothing.
    const icon = (n) => (/^[a-z0-9-]{1,40}$/.test(String(n || '')) ? String(n) : 'sparkles');
    const accent = this.VIEW_HERO_ACCENTS.includes(o.accent) ? o.accent : 'indigo';

    const stats = Array.isArray(o.stats) ? o.stats.filter(Boolean) : [];
    const actions = Array.isArray(o.actions) ? o.actions.filter(Boolean) : [];
    const chips = Array.isArray(o.chips) ? o.chips.filter(Boolean) : [];

    // Counters animate from zero, but the final value is written into the DOM
    // up front: the number must be readable even if the animation never runs.
    //
    // `data-hero-count` holds just the numeric part, so a formatted value like
    // `75%`, `~1.5h` or `1,240` still animates — the animator keeps whatever
    // prefix and suffix surround the digits.
    const statsHtml = stats.length ? `
          <div class="vhero-stats" role="list">
            ${stats.map(s => {
              const target = this._heroStatNumber(s.value);
              return `
              <div class="vhero-stat" role="listitem">
                <span class="vhero-stat-value"${
                  target === null ? '' : ` data-hero-count="${esc(target)}"`
                }>${esc(s.value)}</span>
                <span class="vhero-stat-label">${esc(s.label)}</span>
              </div>`;
            }).join('')}
          </div>` : '';

    // `onclick` is a developer-supplied literal, never user or AI text. It is
    // still attribute-escaped so a quote in a handler cannot break out.
    const actionsHtml = actions.length ? `
          <div class="vhero-actions">
            ${actions.map(a => `
              <button class="vhero-btn${a.variant === 'ghost' ? ' vhero-btn-ghost' : ''}"
                      onclick="${esc(a.onclick)}">
                <i data-lucide="${icon(a.icon)}"></i>
                <span>${esc(a.label)}</span>
              </button>
            `).join('')}
          </div>` : '';

    const chipsHtml = chips.length ? `
          <div class="vhero-chips">
            ${o.chipsLabel ? `
              <div class="vhero-chips-head">
                <i data-lucide="sparkles"></i>
                <span>${esc(o.chipsLabel)}</span>
              </div>` : ''}
            <div class="vhero-chips-grid">
              ${chips.map(c => `
                <div class="vhero-chip"${c.hint ? ` title="${esc(c.hint)}"` : ''}>
                  <i data-lucide="${icon(c.icon)}"></i>
                  <span>${esc(c.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>` : '';

    return `
      <header class="vhero vhero-accent-${accent}">
        <div class="vhero-aurora" aria-hidden="true">
          <span class="vhero-rays"></span>
          <span class="vhero-orb vhero-orb-1"></span>
          <span class="vhero-orb vhero-orb-2"></span>
        </div>
        <div class="vhero-grid-overlay" aria-hidden="true"></div>

        <div class="vhero-inner">
          <span class="vhero-badge">
            <span class="vhero-pulse" aria-hidden="true"></span>
            <i data-lucide="${icon(o.icon)}"></i>
            <span>${esc(o.eyebrow)}</span>
          </span>

          <h1 class="vhero-title">
            <span class="vhero-title-line">${esc(o.title)}</span>
            ${o.titleAccent ? `
              <span class="vhero-title-accent" data-text="${esc(o.titleAccent)}">${esc(o.titleAccent)}</span>
            ` : ''}
          </h1>

          ${o.hindi ? `<span class="vhero-hindi" lang="hi">${esc(o.hindi)}</span>` : ''}
          ${o.tagline ? `<p class="vhero-tagline">${esc(o.tagline)}</p>` : ''}
          ${statsHtml}
          ${actionsHtml}
          ${chipsHtml}
        </div>
      </header>
    `;
  },

  /**
   * Pull the numeric part out of a formatted stat value.
   *
   *   42        -> 42
   *   '1,240'   -> 1240
   *   '75%'     -> 75
   *   '~1.5h'   -> 1.5
   *   '∞'       -> null   (nothing to count)
   *
   * @returns {number|null} null when the value has no number to animate
   */
  _heroStatNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    // Thousands separators have to go before parsing, or '1,240' reads as 1.
    const m = String(value == null ? '' : value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
  },

  /**
   * Count the hero stat numbers up from zero.
   *
   * Called from app.refreshIcons(), which every view already runs after
   * injecting markup — so a view gets this for free just by rendering a hero,
   * with no second call to forget.
   *
   * Idempotent: each element is flagged once animated, so the debounced
   * refreshIcons() firing twice cannot restart a counter mid-flight.
   */
  animateHeroCounters(root = document) {
    let targets;
    try {
      targets = root.querySelectorAll('.vhero-stat-value[data-hero-count]');
    } catch {
      return;
    }
    if (!targets || targets.length === 0) return;

    // Decorative enhancement — the real values are already in the DOM.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    targets.forEach((el, idx) => {
      if (el.dataset.heroCounted === '1') return;
      el.dataset.heroCounted = '1';

      const target = parseFloat(el.getAttribute('data-hero-count'));
      if (!isFinite(target) || target === 0) return;

      // Keep whatever surrounds the digits — a `%`, a `~`, an `h` — so the
      // value never briefly loses its unit while counting.
      const finalText = el.textContent;
      const parts = finalText.match(/^(\D*)([\d.,]+)(.*)$/);
      const prefix = parts ? parts[1] : '';
      const suffix = parts ? parts[3] : '';
      const decimals = (String(target).split('.')[1] || '').length;
      const duration = 850;
      const delay = Math.min(idx * 70, 350);
      let startTime = null;

      const step = (now) => {
        if (startTime === null) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        // Exponential ease-out: fast start, gentle settle.
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        if (progress < 1) {
          el.textContent = `${prefix}${(target * eased).toFixed(decimals)}${suffix}`;
          requestAnimationFrame(step);
        } else {
          // Restore the caller's exact formatting, thousands separators included.
          el.textContent = finalText;
        }
      };

      el.textContent = `${prefix}${(0).toFixed(decimals)}${suffix}`;
      setTimeout(() => requestAnimationFrame(step), delay);
    });
  }
};

window.UIUtils = UIUtils;
