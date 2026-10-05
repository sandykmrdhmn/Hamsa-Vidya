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
    this.PROBE_FAILURE_TTL_MS = 5000;
    this.PROBE_NEGATIVE_TTL_MS = 30000;

    // null = not probed yet, true/false = known
    this._serverKeyConfigured = null;
    this._probePromise = null;
    this._probeExpiresAt = 0;

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
    this._quotaQueue = Promise.resolve();
    this._quotaMemory = new Map();
    this._requestLog = [];
    this._stageLog = [];
    // Conservative application pacing, NOT a claim about Google's project quota.
    // Allow short quizzes to finish promptly while retaining the same 5/minute cap.
    this.QUIZ_REQUEST_INTERVAL_MS = 0;
    this.QUIZ_REQUESTS_PER_MINUTE = 5;
    this.QUIZ_INPUT_TOKENS_PER_MINUTE = 12000;
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
  estimatePayloadTokens(payload, model = 'gemini-3.6-flash') {
    let total = 0;
    for (const content of payload?.contents || []) {
      for (const part of content?.parts || []) {
        if (part.text) total += this.estimateTokens(part.text);
        if (part.inlineData) {
          const resolution = String(part.mediaResolution?.level || payload.generationConfig?.mediaResolution || '').toLowerCase();
          // Gemini 3's default image budget is 1120, not the older 258-token
          // small-image estimate. Do not lower OCR resolution to fit a budget.
          total += /^gemini-3[.-]/.test(model)
            ? (/ultra_high/.test(resolution) ? 2240 : /low/.test(resolution) ? 280 : /medium/.test(resolution) ? 560 : 1120)
            : 1120; // conservative image reservation for legacy callers
        }
      }
    }
    for (const part of payload?.systemInstruction?.parts || []) if (part.text) total += this.estimateTokens(part.text);
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
      // Local usage display day; Google's daily quota resets in Pacific time.
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
    const thinking = Number(usageMetadata.thoughtsTokenCount) || 0;

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
    this._usage.thinkingTokens = (this._usage.thinkingTokens || 0) + thinking;

    this._usage.session.requests += 1;
    this._usage.session.promptTokens += prompt;
    this._usage.session.outputTokens += output;
    this._usage.session.totalTokens += total;
    this._usage.session.thinkingTokens = (this._usage.session.thinkingTokens || 0) + thinking;

    this._saveUsage();
  }

  /**
   * Read usage totals, for display in Settings.
   * @returns {{today: Object, session: Object}}
   */
  getUsage() {
    if (this._usage.date !== this._todayKey()) {
      const session = this._usage.session;
      this._usage = this._emptyUsage();
      this._usage.session = session;
      this._saveUsage();
    }
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
   * Successful probes are cached; negative results expire. A transient network
   * failure remains unknown, so an offline startup cannot disable this session.
   */
  async probeServerKey() {
    if (this._probePromise) return this._probePromise;
    // An explicit personal key remains the active transport. Avoid repeated
    // capability probes during long direct-mode jobs; removing it re-enables
    // negative-cache expiry and server recovery.
    if (this.getUserKey() && this._serverKeyConfigured === false) return false;
    if (this._serverKeyConfigured !== null && (!this._probeExpiresAt || Date.now() < this._probeExpiresAt)) return this._serverKeyConfigured;
    if (Date.now() < this._probeExpiresAt) return false;

    this._probePromise = (async () => {
      try {
        const res = await this._request(`${this.PROXY_BASE}/status`, {
          cache: 'no-store'
        }, { timeoutMs: this.PROBE_TIMEOUT_MS });

        if (!res.ok) {
          this._serverKeyConfigured = null;
          this._probeExpiresAt = Date.now() + this.PROBE_FAILURE_TTL_MS;
          return false;
        }
        const data = await res.json();
        if (typeof data.configured !== 'boolean') throw new Error('Invalid connection status.');
        this._serverKeyConfigured = data.configured === true;
        this._probeExpiresAt = data.configured ? Infinity : Date.now() + this.PROBE_NEGATIVE_TTL_MS;
        return this._serverKeyConfigured;
      } catch {
        this._serverKeyConfigured = null;
        this._probeExpiresAt = Date.now() + this.PROBE_FAILURE_TTL_MS;
        return false;
      } finally {
        this._probePromise = null;
      }
    })();

    return this._probePromise;
  }

  /** True when the secure server proxy should be used. */
  useProxy() {
    // An explicitly saved personal key is the active connection. Test and
    // generation must never silently use different credentials.
    return this._serverKeyConfigured === true && !this.getUserKey();
  }

  /** Human-readable mode for Settings UI. */
  getMode() {
    if (this.getUserKey()) return 'DIRECT';
    if (this._serverKeyConfigured === true) return 'PROXY';
    return 'UNCONFIGURED';
  }

  /**
   * Can we make AI calls at all? Replaces the old `if (apiKey)` gates, which
   * would wrongly fall back to the offline engine in PROXY mode.
   */
  isAvailable() {
    return this._serverKeyConfigured === true || !!this.getUserKey();
  }

  resetQuotaState() {
    // Stored per-credential cooldowns deliberately survive re-saving a key.
    this._quotaMemory.clear();
  }

  _quotaScope(model, options) {
    const credential = (options.forceProxy || this.useProxy()) && !options.forceDirect ? 'SERVER_PROXY' : (options.apiKey || this.getUserKey());
    let hash = 2166136261;
    for (const character of credential) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return `hamsa_ai_pacing_${model}_${(hash >>> 0).toString(16)}`;
  }

  _loadQuota(scope) {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(scope) || 'null'); } catch {}
    const memory = this._quotaMemory.get(scope);
    const state = memory && (!saved || (memory.updatedAt || 0) >= (saved.updatedAt || 0)) ? memory : saved || memory || {};
    state.history = Array.isArray(state.history) ? state.history.filter(item => Number.isFinite(item.at) && Number.isFinite(item.tokens) && item.at > Date.now() - 60000) : [];
    state.nextAt = Number(state.nextAt) || 0;
    // Migrate the former default 12.1s spacing to a rolling window. Learned
    // provider cooldowns and stricter intervals remain in effect.
    if(!state.pacingVersion && Number(state.interval)===12100) state.interval=0;
    state.pacingVersion=2;
    state.interval = Math.max(this.QUIZ_REQUEST_INTERVAL_MS, Number(state.interval) || 0);
    state.tpm = Math.min(this.QUIZ_INPUT_TOKENS_PER_MINUTE, Number(state.tpm) || this.QUIZ_INPUT_TOKENS_PER_MINUTE);
    return state;
  }

  _saveQuota(scope, state) {
    state.updatedAt = Date.now();
    this._quotaMemory.set(scope, state);
    try { localStorage.setItem(scope, JSON.stringify(state)); } catch {}
  }

  getQuizInputBudget(model, options = {}) {
    return this._loadQuota(this._quotaScope(model, options)).tpm;
  }

  async _quotaWait(ms, options) {
    if (options.signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    options.onQuotaWait?.(ms);
    if (window.QuizQuality) return QuizQuality.wait(ms, options.signal);
    return new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); reject(new DOMException('Request cancelled.', 'AbortError')); };
      const timer = setTimeout(() => { options.signal?.removeEventListener('abort', cancel); resolve(); }, ms);
      options.signal?.addEventListener('abort', cancel, {once:true});
    });
  }

  _dailyResetAt() {
    const date = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
    const today = date.format(new Date(Date.now()));
    let at = Date.now() + 60000;
    while (date.format(new Date(at)) === today && at < Date.now() + 27 * 3600000) at += 60000;
    return at;
  }

  async _scheduleQuotaRequest(model, payload, options) {
    if (options.signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    await this.probeServerKey();
    const scope = this._quotaScope(model, options);
    const execute = async () => {
      const tokens = this.estimatePayloadTokens(payload, model);
      const log = options._diagnostic;
      if (log) log.queueMs = Date.now() - log.queuedAt;
      let state;
      while (true) {
        if (options.signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
        state = this._loadQuota(scope);
        if (state.blockedUntil > Date.now()) {
          const error = new Error(state.blockedMessage);
          error.code = state.blockedCode; error.status = 429; error.retryable = false;
          error.userMessage = state.blockedMessage; throw error;
        }
        if (tokens > state.tpm && (options.quotaSafe || state.learnedTpm)) {
          const error = new Error('This request exceeds the safe input budget. Choose fewer source pages.');
          error.code = 'AI_INPUT_BUDGET'; throw error;
        }
        let at = Math.max(Date.now(), state.nextAt);
        const history = state.history.slice();
        let used = history.reduce((sum, item) => sum + item.tokens, 0);
        // Larger non-quiz requests retain their existing size policy, but use
        // an otherwise empty minute. A learned provider TPM is always enforced.
        const minuteBudget = options.quotaSafe || state.learnedTpm ? state.tpm : Math.max(state.tpm, tokens);
        while ((used + tokens > minuteBudget || history.length >= this.QUIZ_REQUESTS_PER_MINUTE) && history.length) { const item = history.shift(); used -= item.tokens; at = Math.max(at, item.at + 60050); }
        const wait = at - Date.now();
        if (options.deadlineAt && at >= options.deadlineAt) {
          const error = new Error('Rate-limit wait exceeds this step’s time budget. Your draft is saved; resume after the cooldown.');
          error.code = 'AI_STEP_TIMEOUT'; throw error;
        }
        if (wait <= 0) break;
        if (log) log.quotaWaitMs += wait;
        await this._quotaWait(wait, options);
      }
      state.nextAt = Date.now() + state.interval;
      const reservation = {at:Date.now(), tokens};
      state.history.push(reservation);
      this._saveQuota(scope, state);
      const startedAt = Date.now();
      if (log) { log.startedAt = startedAt; log.transport = (options.forceProxy || this.useProxy()) && !options.forceDirect ? 'PROXY' : 'DIRECT'; }
      try {
        const response = await this.fetchGenerateContent(model, payload, {...options,_quotaScheduled:true,timeoutMs:Math.min(options.timeoutMs || this.DEFAULT_TIMEOUT_MS, options.deadlineAt ? Math.max(1,options.deadlineAt-Date.now()) : Infinity)});
        if (log) log.status = response.status;
        if (log && !response.ok) {
          try { const error=await this.createError(response.clone()); log.errorCode=error.code || `HTTP_${response.status}`; }
          catch { log.errorCode=`HTTP_${response.status}`; }
        }
        if (response.status === 429) {
          const error = await this.createError(response.clone());
          state = this._loadQuota(scope);
          state.interval = Math.max(state.interval, error.requestIntervalMs || 0);
          if (error.inputTokensPerMinute) { state.tpm = Math.min(state.tpm,error.inputTokensPerMinute); state.learnedTpm = true; }
          state.nextAt = Math.max(state.nextAt,Date.now()+(error.retryAfterMs ?? 30000)+250);
          if (!error.retryable) {
            state.blockedUntil = error.code === 'AI_DAILY_QUOTA' ? this._dailyResetAt() : Date.now()+300000;
            state.blockedCode = error.code; state.blockedMessage = error.userMessage;
          }
          this._saveQuota(scope,state);
        }
        try {
          const usage = (await response.clone().json()).usageMetadata;
          if (log) { log.usage = usage || null; log.usageKnown = Boolean(usage); }
          const actual = Number(usage?.promptTokenCount);
          if (Number.isFinite(actual)) {
            state = this._loadQuota(scope);
            const recorded = state.history.find(item => item.at === reservation.at && item.tokens === reservation.tokens);
            if (recorded) recorded.tokens = Math.max(reservation.tokens, actual);
            this._saveQuota(scope, state);
          }
        } catch {}
        return response;
      } finally { if (log) log.networkMs = Date.now()-startedAt; }
    };
    // Browser lock serializes tabs sharing credentials; the queue handles this tab.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request(scope, options.signal ? {signal:options.signal} : {}, execute);
    return execute();
  }

  getRequestDiagnostics() { return this._requestLog.map(log => ({...log, usage:log.usage ? {...log.usage} : null})); }

  recordStageTiming(stage, startedAt, metadata = {}) {
    // Only fixed metadata fields are accepted: never retain prompts, keys or
    // uploaded text in diagnostics, even when a caller passes extra fields.
    const entry = {stage, startedAt, durationMs:Math.max(0,Date.now()-startedAt)};
    for (const key of ['jobId','questions','pages','cacheHits','outcome','errorCode','accepted','rejected','unresolved']) if (metadata[key] != null) entry[key] = metadata[key];
    this._stageLog.push(entry);
    if (this._stageLog.length > 100) this._stageLog.shift();
  }

  getStageDiagnostics() { return this._stageLog.map(entry => ({...entry})); }

  _waitQueuedTask(task, options) {
    if (!options.signal && !options.deadlineAt) return task;
    return new Promise((resolve,reject) => {
      let timer;
      // Once sent, _request owns cancellation through the complete response
      // body. Let it drain its controller before returning to the caller.
      const cancel = () => { if (!options._diagnostic?.sent) finish(Object.assign(new Error('Request cancelled.'),{name:'AbortError'})); };
      const finish = (error,value) => {
        clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);
        error ? reject(error) : resolve(value);
      };
      if (options.signal?.aborted) { cancel();return; }
      options.signal?.addEventListener('abort',cancel,{once:true});
      if (options.deadlineAt) timer=setTimeout(()=>{
        if (options._diagnostic?.sent) return;
        const error=Object.assign(new Error('The AI request queue reached this step’s deadline. Completed work is saved.'),{code:'AI_STEP_TIMEOUT'});
        finish(error);
        options._queuedController?.abort(error);
      },Math.max(0,options.deadlineAt-Date.now()));
      task.then(value=>finish(null,value),error=>finish(error));
    });
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
    // Queued generation already has a registered controller that propagates
    // cancellation here; count that request once from queue through completion.
    if (!options._queuedController) this._activeControllers.add(controller);

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
      const response = await fetch(url, { ...init, signal: controller.signal });
      // Keep cancellation and the deadline active through the complete body.
      // Draining a clone preserves the native Response for existing callers.
      await response.clone().arrayBuffer();
      return response;
    } catch (err) {
      if (timedOut) {
        const error = new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s. Try a smaller batch or check your connection.`);
        error.code = 'AI_TIMEOUT';throw error;
      }
      if (init.method === 'POST' && err.name !== 'AbortError' && !err.code) {
        const error = new Error('The connection ended before the AI result was received. Completed work is saved; resume explicitly to retry.');
        error.code = 'AI_NETWORK_UNCERTAIN';
        throw error;
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
   * @param {string} model   e.g. 'gemini-3.6-flash'
   * @param {Object} payload { contents, generationConfig, ... }
   * @param {Object} options { signal, timeoutMs, apiKey }
   * @returns {Promise<Response>}
   */
  async fetchGenerateContent(model, payload, options = {}) {
    const safeModel = String(model || window.geminiService?.getActiveModel() || 'gemini-3.6-flash').replace(/^models\//, '');
    if (!options._quotaScheduled) {
      const controller = new AbortController();
      const external = options.signal;
      const cancel = () => controller.abort(external?.reason);
      if (external?.aborted) cancel();
      else external?.addEventListener('abort',cancel,{once:true});
      this._activeControllers.add(controller);
      const log = {stage:options.stage || 'generation', jobId:options.jobId ?? null, attempt:options.attempt ?? 0, model:safeModel, estimatedInputTokens:this.estimatePayloadTokens(payload,safeModel),queuedAt:Date.now(),quotaWaitMs:0,usageKnown:false,sent:false};
      this._requestLog.push(log); if (this._requestLog.length > 100) this._requestLog.shift();
      const requestOptions = {...options,signal:controller.signal,_queuedController:controller,_diagnostic:log};
      const execute = () => this._scheduleQuotaRequest(safeModel, payload, requestOptions);
      const task = this._quotaQueue.then(execute, execute);
      this._quotaQueue = task.catch(() => {});
      try { return await this._waitQueuedTask(task,requestOptions); }
      catch (error) { log.errorCode = error.code || error.name; throw error; }
      finally {
        this._activeControllers.delete(controller);
        external?.removeEventListener('abort',cancel);
        log.durationMs=Date.now()-log.queuedAt; options.onRequestComplete?.({...log});
      }
    }
    await this.probeServerKey();

    // Pre-flight size check. Warn once per oversized request rather than
    // silently sending a prompt that will be truncated or rejected upstream.
    const estimatedInput = this.estimatePayloadTokens(payload,safeModel);
    if (estimatedInput > this.LARGE_REQUEST_TOKEN_WARNING) {
      console.warn(
        `[aiClient] Large request: ~${estimatedInput.toLocaleString()} input tokens. ` +
        'Consider a narrower page range or fewer questions per batch.'
      );
    }

    let requestPayload = payload;
    if (/^gemini-3[.-]/.test(safeModel) && payload?.generationConfig) {
      // Gemini 3 migration guidance removes sampling overrides. Keep the
      // caller's payload intact so retrying with another model is safe.
      const generationConfig = { ...payload.generationConfig };
      for (const parameter of ['temperature', 'topP', 'topK', 'candidateCount']) {
        delete generationConfig[parameter];
      }
      requestPayload = { ...payload, generationConfig };
    }
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    };

    let response;
    if ((options.forceProxy || this.useProxy()) && !options.forceDirect) {
      if (options._diagnostic) options._diagnostic.sent=true;
      response = await this._request(`${this.PROXY_BASE}/${encodeURIComponent(safeModel)}`, init, options);
    } else {
      const key = (options.apiKey || this.getUserKey()).trim();
      if (!key) {
        throw new Error('Gemini API key is not configured. Open Settings to add your key, or set GEMINI_API_KEY on the server.');
      }
      const url = `${this.DIRECT_BASE}/models/${encodeURIComponent(safeModel)}:generateContent?key=${encodeURIComponent(key)}`;
      if (options._diagnostic) options._diagnostic.sent=true;
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

    if ((options.forceProxy || this.useProxy()) && !options.forceDirect) {
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
  async createError(res) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data?.error === 'string' ? data.error : data?.error?.message;
    const defaults = {
      429: 'Gemini rate limit reached (HTTP 429). Wait a moment and retry.',
      403: 'Gemini rejected the credentials (HTTP 403). Check the API key and its permissions.',
      503: 'Gemini is temporarily overloaded (HTTP 503). Please retry shortly.'
    };
    const error = new Error(msg || defaults[res.status] || `HTTP ${res.status}`);
    error.status = res.status;
    const code = data?.code || data?.error?.code;
    if (typeof code === 'string' && /^AI_[A-Z_]+$/.test(code)) error.code = code;
    if (data?.retryable === false || data?.error?.retryable === false) error.retryable = false;
    if (res.status !== 429) return error;

    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    const violations = details.flatMap(detail => Array.isArray(detail.violations) ? detail.violations : []);
    const quotaIds = violations.map(v => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
    // Google's generic "check your plan and billing details" sentence also
    // appears on minute limits. It must never classify an error as permanent.
    const daily = /per.?day|daily/i.test(quotaIds + ' ' + error.message);
    const zero = violations.some(v => v.quotaValue != null && Number(v.quotaValue) === 0) || /limit\s*[:=]\s*0\b/i.test(error.message);
    const spending = /(?:monthly|project|account)\s+(?:spend|spending)\s+(?:cap|limit)|spending cap|billing (?:is )?(?:disabled|required|not enabled)/i.test(error.message);
    error.code = zero ? 'AI_QUOTA_UNAVAILABLE' : daily ? 'AI_DAILY_QUOTA' : spending ? 'AI_SPEND_LIMIT' : 'AI_RATE_LIMIT';
    error.retryable = !zero && !daily && !spending;

    const delays = [];
    const header = res.headers?.get('Retry-After');
    if (header) {
      const seconds = Number(header);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
      if (Number.isFinite(delay) && delay >= 0) delays.push(delay);
    }
    for (const detail of details) {
      const value = detail.retryDelay;
      const seconds = typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)
        ? Number(value.slice(0, -1))
        : value && typeof value === 'object' ? Number(value.seconds || 0) + Number(value.nanos || 0) / 1e9 : NaN;
      if (Number.isFinite(seconds) && seconds >= 0) delays.push(seconds * 1000);
    }
    const textDelay = error.message.match(/(?:retry in|retry after)\s+(\d+(?:\.\d+)?)\s*s/i);
    if (textDelay) delays.push(Number(textDelay[1]) * 1000);
    error.retryAfterMs = delays.length ? Math.max(...delays) : null;
    const rpm = violations.filter(v => /requestsperminute/i.test(v.quotaId || '')).map(v => Number(v.quotaValue)).filter(n => n > 0);
    const printedLimit = error.message.match(/limit\s*[:=]\s*(\d+)\b/i);
    if (!rpm.length && /requestsperminute/i.test(quotaIds) && Number(printedLimit?.[1]) > 0) rpm.push(Number(printedLimit[1]));
    error.requestIntervalMs = rpm.length ? Math.ceil(60000 / Math.min(...rpm)) + 100 : 1000;
    const tpm = violations.filter(v => /(?:input|prompt).*tokens.*perminute|tokensperminute/i.test(`${v.quotaId || ''} ${v.quotaMetric || ''}`)).map(v => Number(v.quotaValue)).filter(n => n > 0);
    error.inputTokensPerMinute = tpm.length ? Math.min(...tpm) : null;
    error.userMessage = zero
      ? 'Gemini 3.6 Flash quota is unavailable for the active project. Check this project’s model access and quota in Google AI Studio. No other model will be used.'
      : daily ? 'Gemini daily quota is exhausted. Resume this saved draft after the quota resets, or check your project quota in Google AI Studio.'
      : spending ? 'Gemini project spending limit was reached. Check your project billing/limits in Google AI Studio before resuming.'
      : `Gemini is temporarily rate-limited.${error.retryAfterMs != null ? ` Wait at least ${Math.ceil(error.retryAfterMs / 1000)} seconds before resuming.` : ' Please wait a moment before resuming.'} Your completed work is saved.`;
    return error;
  }

  async describeError(res) {
    return (await this.createError(res)).message;
  }
}

window.aiClient = new AIClient();

window.addEventListener?.('online', () => {
  if (window.aiClient._serverKeyConfigured !== true) {
    window.aiClient._probeExpiresAt = 0;
    window.aiClient._serverKeyConfigured = null;
    window.aiClient.probeServerKey();
  }
});

// Kick off the mode probe immediately so the first real call doesn't pay for it.
window.aiClient.probeServerKey();
