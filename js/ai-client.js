/**
 * HAMSA VIDYA (हंस विद्या) — Unified Gemini Transport Layer
 *
 * Single choke point for every Google Gemini network call in the app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Previously 17 call sites across 4 files each built their own URL of the form
 *   https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<API_KEY>
 * which meant the user's API key was read from localStorage and placed in a URL
 * query string by the browser on every request. That exposes the key in DevTools,
 * in the network log, and to anything with access to the page.
 *
 * This module routes calls through the server-side proxy (/api/gemini) whenever the
 * server has GEMINI_API_KEY configured, so the key never reaches the browser.
 *
 * TRANSPORT MODES
 *   PROXY  — server holds the key. Browser sends no key at all. Preferred.
 *   DIRECT — legacy "bring your own key" fallback using localStorage, so existing
 *            users who already saved a personal key keep working offline-of-server.
 *
 * Mode is resolved once per session by probing GET /api/gemini/status.
 */

class AIClient {
  constructor() {
    this.PROXY_BASE = '/api/gemini';
    this.DIRECT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

    // Generation with large maxOutputTokens can legitimately take a while.
    this.DEFAULT_TIMEOUT_MS = 120000;
    this.PROBE_TIMEOUT_MS = 4000;

    // null = not probed yet, true/false = known
    this._serverKeyConfigured = null;
    this._probePromise = null;

    // Every in-flight controller, so navigation can cancel outstanding work.
    this._activeControllers = new Set();

    // ---- Token accounting -------------------------------------------------
    // Gemini bills by token and the free tier has daily limits, but nothing in
    // the app reported usage, so a runaway batch loop could quietly exhaust a
    // quota with no feedback. Counts come from Google's own usageMetadata, so
    // they are exact rather than estimated.
    this.USAGE_STORAGE_KEY = 'hamsa_ai_usage';
    this.LARGE_REQUEST_TOKEN_WARNING = 25000;

    this._usage = this._loadUsage();
  }

  // =========================================================================
  // TOKEN / COST ACCOUNTING
  // =========================================================================

  /**
   * Rough token estimate for text we are about to send.
   * ~4 chars per token for Latin script; Devanagari tokenises far less
   * efficiently, so it is weighted more heavily. Used only for pre-flight
   * warnings — actuals come from the API response.
   */
  estimateTokens(text) {
    const s = String(text ?? '');
    if (!s) return 0;
    const devanagari = (s.match(/[\u0900-\u097F]/g) || []).length;
    const other = s.length - devanagari;
    return Math.ceil(other / 4 + devanagari / 1.5);
  }

  /** Estimate the input tokens for a request payload. */
  estimatePayloadTokens(payload) {
    let total = 0;
    for (const content of payload?.contents || []) {
      for (const part of content?.parts || []) {
        if (part.text) total += this.estimateTokens(part.text);
        // Inline images are billed at a flat rate per tile; 258 is Gemini's
        // documented cost for a small image and is close enough for a warning.
        if (part.inlineData) total += 258;
      }
    }
    return total;
  }

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _emptyUsage() {
    return {
      date: this._todayKey(),
      requests: 0,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      session: { requests: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0 }
    };
  }

  _loadUsage() {
    try {
      const raw = localStorage.getItem(this.USAGE_STORAGE_KEY);
      if (!raw) return this._emptyUsage();
      const saved = JSON.parse(raw);
      // Daily counters reset at midnight, matching how quotas are granted.
      if (saved.date !== this._todayKey()) return this._emptyUsage();
      return { ...this._emptyUsage(), ...saved, session: this._emptyUsage().session };
    } catch {
      return this._emptyUsage();
    }
  }

  _saveUsage() {
    try {
      const { session, ...daily } = this._usage;
      localStorage.setItem(this.USAGE_STORAGE_KEY, JSON.stringify(daily));
    } catch { /* storage full or unavailable — accounting is best-effort */ }
  }

  /**
   * Record exact usage reported by the API.
   * @param {Object} usageMetadata Gemini's `usageMetadata` block
   */
  _recordUsage(usageMetadata) {
    if (!usageMetadata) return;

    const prompt = Number(usageMetadata.promptTokenCount) || 0;
    const output = Number(usageMetadata.candidatesTokenCount) || 0;
    const total = Number(usageMetadata.totalTokenCount) || (prompt + output);

    // Roll the day over if the tab has been open past midnight.
    if (this._usage.date !== this._todayKey()) {
      const session = this._usage.session;
      this._usage = this._emptyUsage();
      this._usage.session = session;
    }

    this._usage.requests += 1;
    this._usage.promptTokens += prompt;
    this._usage.outputTokens += output;
    this._usage.totalTokens += total;

    this._usage.session.requests += 1;
    this._usage.session.promptTokens += prompt;
    this._usage.session.outputTokens += output;
    this._usage.session.totalTokens += total;

    this._saveUsage();
  }

  /**
   * Read usage totals, for display in Settings.
   * @returns {{today: Object, session: Object}}
   */
  getUsage() {
    const { session, ...today } = this._usage;
    return { today, session };
  }

  /** Reset the stored counters. */
  resetUsage() {
    this._usage = this._emptyUsage();
    this._saveUsage();
    return this.getUsage();
  }

  /**
   * Pull usageMetadata off a response without disturbing the caller's copy.
   * The caller still gets an unread body because we read a clone.
   */
  _trackResponseUsage(response) {
    if (!response?.ok) return;
    try {
      response.clone().json()
        .then(data => this._recordUsage(data?.usageMetadata))
        .catch(() => { /* non-JSON or already consumed — skip silently */ });
    } catch { /* clone unsupported — skip silently */ }
  }

  // =========================================================================
  // TRANSPORT MODE RESOLUTION
  // =========================================================================

  /** The user's own key, if they saved one. Only used in DIRECT mode. */
  getUserKey() {
    try {
      return (localStorage.getItem('hamsa_gemini_api_key') || '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Ask the server whether it has a key configured. Cached for the session.
   * Never throws — a failed probe simply means "no proxy available".
   */
  async probeServerKey() {
    if (this._serverKeyConfigured !== null) return this._serverKeyConfigured;
    if (this._probePromise) return this._probePromise;

    this._probePromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.PROBE_TIMEOUT_MS);
        const res = await fetch(`${this.PROXY_BASE}/status`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);

        if (!res.ok) {
          this._serverKeyConfigured = false;
          return false;
        }
        const data = await res.json().catch(() => ({}));
        this._serverKeyConfigured = data.configured === true;
        return this._serverKeyConfigured;
      } catch {
        // No server, offline, or endpoint missing — fall back to DIRECT.
        this._serverKeyConfigured = false;
        return false;
      }
    })();

    return this._probePromise;
  }

  /** True when the secure server proxy should be used. */
  useProxy() {
    return this._serverKeyConfigured === true;
  }

  /** Human-readable mode for Settings UI. */
  getMode() {
    if (this._serverKeyConfigured === true) return 'PROXY';
    if (this.getUserKey()) return 'DIRECT';
    return 'UNCONFIGURED';
  }

  /**
   * Can we make AI calls at all? Replaces the old `if (apiKey)` gates, which
   * would wrongly fall back to the offline engine in PROXY mode.
   */
  isAvailable() {
    return this._serverKeyConfigured === true || !!this.getUserKey();
  }

  // =========================================================================
  // REQUEST PLUMBING
  // =========================================================================

  /**
   * Wrap a fetch with timeout + caller-supplied abort signal, and register the
   * controller so abortAll() can cancel it.
   */
  async _request(url, init = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    this._activeControllers.add(controller);

    // Chain an externally provided signal into ours.
    const external = options.signal;
    const onExternalAbort = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) controller.abort(external.reason);
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (timedOut) {
        throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s. Try a smaller batch or check your connection.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      this._activeControllers.delete(controller);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  /** Cancel every outstanding Gemini request (used when navigating away). */
  abortAll() {
    for (const controller of this._activeControllers) {
      try { controller.abort(); } catch { /* already settled */ }
    }
    this._activeControllers.clear();
  }

  /** Number of requests currently in flight. */
  get inFlightCount() {
    return this._activeControllers.size;
  }

  // =========================================================================
  // PUBLIC API — returns a native Response so existing call sites keep working
  // with res.ok / res.status / res.json() unchanged.
  // =========================================================================

  /**
   * POST a generateContent request.
   * @param {string} model   e.g. 'gemini-2.5-flash'
   * @param {Object} payload { contents, generationConfig, ... }
   * @param {Object} options { signal, timeoutMs, apiKey }
   * @returns {Promise<Response>}
   */
  async fetchGenerateContent(model, payload, options = {}) {
    await this.probeServerKey();

    // Pre-flight size check. Warn once per oversized request rather than
    // silently sending a prompt that will be truncated or rejected upstream.
    const estimatedInput = this.estimatePayloadTokens(payload);
    if (estimatedInput > this.LARGE_REQUEST_TOKEN_WARNING) {
      console.warn(
        `[aiClient] Large request: ~${estimatedInput.toLocaleString()} input tokens. ` +
        'Consider a narrower page range or fewer questions per batch.'
      );
    }

    const safeModel = String(model || 'gemini-2.5-flash').replace(/^models\//, '');
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };

    let response;
    if (this.useProxy()) {
      response = await this._request(`${this.PROXY_BASE}/${encodeURIComponent(safeModel)}`, init, options);
    } else {
      const key = (options.apiKey || this.getUserKey()).trim();
      if (!key) {
        throw new Error('Gemini API key is not configured. Open Settings to add your key, or set GEMINI_API_KEY on the server.');
      }
      const url = `${this.DIRECT_BASE}/models/${encodeURIComponent(safeModel)}:generateContent?key=${encodeURIComponent(key)}`;
      response = await this._request(url, init, options);
    }

    // Accumulate exact token counts from the response without consuming the
    // body the caller is about to read.
    this._trackResponseUsage(response);

    return response;
  }

  /**
   * GET the list of models available for the active credentials.
   * @returns {Promise<Response>}
   */
  async fetchListModels(options = {}) {
    await this.probeServerKey();

    if (this.useProxy()) {
      return this._request(`${this.PROXY_BASE}/models`, { method: 'GET' }, options);
    }

    const key = (options.apiKey || this.getUserKey()).trim();
    if (!key) {
      throw new Error('Gemini API key is not configured. Open Settings to add your key, or set GEMINI_API_KEY on the server.');
    }
    const url = `${this.DIRECT_BASE}/models?key=${encodeURIComponent(key)}`;
    return this._request(url, { method: 'GET' }, options);
  }

  /**
   * Pull a human-readable error message out of a failed Gemini response.
   * Centralises the `errData.error?.message || HTTP <status>` pattern that was
   * duplicated at every call site.
   */
  async describeError(res) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message;
    if (msg) return msg;
    if (res.status === 429) return 'Gemini rate limit reached (HTTP 429). Wait a moment and retry.';
    if (res.status === 403) return 'Gemini rejected the credentials (HTTP 403). Check the API key and its permissions.';
    if (res.status === 503) return 'Gemini is temporarily overloaded (HTTP 503). Please retry shortly.';
    return `HTTP ${res.status}`;
  }
}

window.aiClient = new AIClient();

// Kick off the mode probe immediately so the first real call doesn't pay for it.
window.aiClient.probeServerKey();
