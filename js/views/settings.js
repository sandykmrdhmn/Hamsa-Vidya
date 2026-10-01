/**
 * HAMSA VIDYA (हंस विद्या) — Settings & Customization View Controller
 */

class SettingsView {
  static MAX_BACKUP_BYTES = 100 * 1024 * 1024;
  constructor() {
    this.container = document.getElementById('view-settings');
    // 'REPLACE' (default) or 'MERGE' — how an imported backup is applied.
    this.importMode = 'REPLACE';
    this._renderVersion = 0;
    this._apiKeyDraft = null;
    this._keyVisible = false;
    this._testResult = null;
    this._testController = null;
    this._importPending = false;
    this._exportPending = false;
    this._resetPending = false;
    this._sectionState = { profile: false, ai: false, appearance: false, study: true, data: false };
    this._studyDraft = null;
    this._storageStatus = {};
    this._persistPending = false;
    this._voiceChange = () => this.updateVoiceOptions();
    window.speechSynthesis?.addEventListener('voiceschanged', this._voiceChange);
  }

  captureSections() {
    this.container?.querySelectorAll('details[data-settings-section]').forEach(section => {
      this._sectionState[section.dataset.settingsSection] = section.open;
    });
  }

  preferenceSelect(key, label, choices) {
    const p = this._studyDraft;
    return `<label class="settings-field">${label}<select id="study-pref-${key}" onchange="settingsView._studyDraft.${key}=this.value;${key === 'voiceLanguage' ? 'settingsView.updateVoiceOptions()' : ''}">${choices.map(([id, text]) => `<option value="${this.escape(id)}" ${String(p[key]) === id ? 'selected' : ''}>${this.escape(text)}</option>`).join('')}</select></label>`;
  }

  studyPreferencesHTML() {
    const store = window.studyPreferences;
    if (!store) return '<p>Reload the page to load Study Preferences.</p>';
    this._studyDraft ||= store.get();
    return `<p class="settings-help">Defaults for new lessons, notes and quizzes. Choices made inside a study tab take priority; saved lessons keep their original settings. Quizzes use bilingual text for Hinglish.</p>
      <div class="settings-fields">
      ${this.preferenceSelect('language', 'Study language', store.languages)}
      ${this.preferenceSelect('level', 'Class / learning level', store.levels)}
      <label class="settings-field">Target exam (optional)<input id="study-pref-exam" maxlength="120" value="${this.escape(this._studyDraft.exam)}" placeholder="CBSE Class 10, SSC, UPSC…" oninput="settingsView._studyDraft.exam=this.value"></label>
      ${this.preferenceSelect('depth', 'Explanation depth', store.depths)}
      ${this.preferenceSelect('voiceLanguage', 'Read-aloud language', [['AUTO', 'Match the lesson'], ['HINDI', 'Hindi'], ['ENGLISH', 'English']])}
      <label class="settings-field">Read-aloud voice<select id="study-pref-voiceURI" onchange="settingsView._studyDraft.voiceURI=this.value"><option value="">Automatic voice</option></select></label>
      <label class="settings-field">Reading speed<input id="study-pref-voiceRate" type="range" min="0.6" max="1.4" step="0.05" value="${Number(this._studyDraft.voiceRate)}" oninput="settingsView._studyDraft.voiceRate=Number(this.value);document.getElementById('study-voice-rate').textContent=Number(this.value).toFixed(2)+'×'"><output id="study-voice-rate" for="study-pref-voiceRate">${Number(this._studyDraft.voiceRate).toFixed(2)}×</output></label>
      </div><div class="settings-actions"><button class="btn btn-primary btn-sm" onclick="settingsView.saveStudyPreferences()">Save study defaults</button><button class="btn btn-secondary btn-sm" ${window.speechSynthesis ? '' : 'disabled'} onclick="settingsView.previewVoice()">Preview voice</button></div>
      <p id="study-pref-status" class="settings-help" role="status" aria-live="polite">Voice availability depends on your device. Narration starts only when you choose Read Aloud.</p>`;
  }

  updateVoiceOptions() {
    const select = this.container?.querySelector('#study-pref-voiceURI');
    if (!select || !this._studyDraft) return;
    select.replaceChildren(new Option('Automatic voice', ''));
    const voices = window.speechSynthesis?.getVoices() || [];
    const chosen = this._studyDraft.voiceURI;
    const language = this._studyDraft.voiceLanguage === 'HINDI' ? 'hi' : this._studyDraft.voiceLanguage === 'ENGLISH' ? 'en' : null;
    voices.filter(voice => !language || voice.lang.toLowerCase().startsWith(language)).forEach(voice => {
      select.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
    });
    if (chosen && ![...select.options].some(option => option.value === chosen)) select.add(new Option('Saved voice unavailable here · automatic fallback', chosen));
    select.value = chosen;
  }

  saveStudyPreferences() {
    try {
      this._studyDraft = window.studyPreferences.save(this._studyDraft);
      document.getElementById('study-pref-status').textContent = 'Study defaults saved on this device.';
      app.showToast('Study defaults saved.', 'success');
    } catch (error) { app.showToast(`Could not save study defaults: ${error.message}`, 'error'); }
  }

  previewVoice() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const p = window.studyPreferences.normalize(this._studyDraft);
    const hindi = p.voiceLanguage === 'HINDI' || (p.voiceLanguage === 'AUTO' && ['HINDI', 'HINGLISH', 'BILINGUAL'].includes(p.language));
    const utterance = new SpeechSynthesisUtterance(hindi ? 'हर छोटा कदम आपकी समझ को बेहतर बनाता है। आराम से पढ़ें और सीखते रहें।' : 'Every small step improves your understanding. Read comfortably and keep learning.');
    utterance.rate = p.voiceRate; utterance.lang = hindi ? 'hi-IN' : 'en-IN';
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => voice.voiceURI === p.voiceURI && voice.lang.startsWith(utterance.lang.slice(0, 2)))
      || voices.find(voice => voice.lang.startsWith(utterance.lang.slice(0, 2))) || null;
    window.speechSynthesis.cancel(); this._previewSpeech = utterance;
    window.speechSynthesis.speak(utterance);
  }

  async readStorageStatus() {
    const storage = navigator.storage;
    const [estimate, persisted] = await Promise.allSettled([
      Promise.resolve().then(() => storage?.estimate ? storage.estimate() : null),
      Promise.resolve().then(() => storage?.persisted ? storage.persisted() : null)
    ]);
    return { estimate: estimate.status === 'fulfilled' ? estimate.value : null,
      persisted: persisted.status === 'fulfilled' ? persisted.value : null };
  }

  formatBytes(bytes) {
    if (!Number.isFinite(Number(bytes))) return 'Unavailable';
    const value = Number(bytes);
    return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  storageHTML() {
    const { estimate, persisted } = this._storageStatus;
    let last = null; try { last = JSON.parse(localStorage.getItem('hamsa_last_backup') || 'null'); } catch {}
    const date = last?.requestedAt && !Number.isNaN(Date.parse(last.requestedAt)) ? new Date(last.requestedAt).toLocaleString() : 'No export recorded on this device';
    const percent = estimate?.quota > 0 ? Math.min(100, Math.max(0, (estimate.usage || 0) / estimate.quota * 100)) : null;
    return `<div class="settings-storage-grid"><div><span>Browser storage used</span><strong>${estimate ? this.formatBytes(estimate.usage) : 'Unavailable'}</strong><small>${estimate ? `${this.formatBytes(estimate.quota)} estimated quota · ${percent == null ? 'unknown' : percent.toFixed(1) + '%'} used` : 'Your browser does not provide an estimate.'}</small></div>
      <div><span>Storage protection</span><strong>${persisted === true ? 'Persistent storage granted' : persisted === false ? 'Standard browser storage' : 'Status unavailable'}</strong><small>Protection reduces automatic cleanup; clearing site data still removes your library.</small></div>
      <div><span>Last backup export</span><strong>${this.escape(date)}</strong><small>Records the download request; confirm the JSON file was saved.</small></div></div>
      <div class="settings-actions"><button class="btn btn-secondary btn-sm" onclick="settingsView.refreshStorageStatus()">Refresh storage</button><button id="settings-persist-button" class="btn btn-secondary btn-sm" aria-busy="${this._persistPending}" ${this._persistPending || persisted === true || !navigator.storage?.persist ? 'disabled' : ''} onclick="settingsView.requestPersistentStorage()">Protect local storage</button></div>
      <p class="settings-help">Estimates cover this website’s browser storage, including offline assets. Backups up to 100 MB can be restored; large files need extra space during restore.</p>`;
  }

  async refreshStorageStatus() { this._storageStatus = await this.readStorageStatus(); return this.render(); }

  async requestPersistentStorage() {
    if (this._persistPending || !navigator.storage?.persist) return;
    this._persistPending = true;
    const button = document.getElementById('settings-persist-button'); if (button) button.disabled = true;
    try {
      const granted = await navigator.storage.persist();
      app.showToast(granted ? 'Persistent storage granted.' : 'Browser did not grant persistent storage. Keep an exported backup.', granted ? 'success' : 'info');
      await this.refreshStorageStatus();
    } catch (error) { app.showToast(`Could not request storage protection: ${error.message}`, 'error'); }
    finally { this._persistPending = false; const current = document.getElementById('settings-persist-button'); if (current) current.disabled = this._storageStatus.persisted === true; }
  }

  compactSections() {
    const root = this.container.querySelector('.settings-container');
    const cards = [...root.querySelectorAll(':scope > .form-group-card')];
    const preferences = document.createElement('div'); preferences.className = 'form-group-card'; preferences.innerHTML = this.studyPreferencesHTML();
    const preview = document.createElement('div'); preview.className = 'settings-live-preview';
    preview.innerHTML = '<span>Live reading preview · पढ़ने का नमूना</span><h3>Learn one clear idea at a time.</h3><p>प्रकाश संश्लेषण में पौधे सूर्य की ऊर्जा से भोजन बनाते हैं। Follow the reason, explore an example, then test what you understand.</p><div><span class="badge badge-primary">Key idea</span><span class="badge">Aa · हिन्दी · 123</span></div>';
    cards[2].prepend(preview);
    cards[4].insertAdjacentHTML('afterbegin', this.storageHTML());
    const resets = document.createElement('div'); resets.className = 'settings-module-resets';
    resets.innerHTML = '<h4>Reset one module</h4><p class="settings-help">Choose only the library you want to erase. Your profile, study defaults and API key are kept. Export a backup first.</p>'
      + [['QUIZZES','Quizzes & attempts'],['NOTES','Study Notes'],['FLASHCARDS','Flashcards & revision'],['ANSWERS','Answer Writing'],['TEACHER','AI Teacher lessons'],['EXAMS','Saved exams & cache']].map(([id,label]) => `<button class="btn btn-secondary btn-sm" onclick="settingsView.confirmModuleReset('${id}')">${label}</button>`).join('');
    cards[4].append(resets);
    const groups = [
      ['profile', 'user-check', 'Profile', 'Identity & academic background', [cards[0]]],
      ['ai', 'key-round', 'AI Connection', 'Gemini key, model & connection test', [cards[1]]],
      ['appearance', 'palette', 'Appearance', 'Theme, typography & live preview', [cards[2],cards[3]]],
      ['study', 'graduation-cap', 'Study Preferences', 'Language, class, exam, depth & voice', [preferences]],
      ['data', 'database-backup', 'Data & Storage', 'Storage status, backups & module resets', [cards[4]]]
    ];
    for (const [id, icon, title, hint, contents] of groups) {
      const section = document.createElement('details'); section.className = 'settings-section'; section.dataset.settingsSection = id; section.open = this._sectionState[id];
      section.innerHTML = `<summary><i data-lucide="${icon}"></i><span><strong>${title}</strong><small>${hint}</small></span><i data-lucide="chevron-down" class="settings-chevron"></i></summary>`;
      const body = document.createElement('div'); body.className = 'settings-section-body'; contents.forEach(card => body.append(card)); section.append(body);
      section.addEventListener('toggle', () => { this._sectionState[id] = section.open; }); root.append(section);
    }
    this.updateVoiceOptions();
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  captureKeyDraft() {
    const input = this.container?.querySelector('#gemini-api-key-input');
    if (input) this._apiKeyDraft = input.value;
  }

  onKeyInput(value) {
    this._apiKeyDraft = value;
    this.cancelConnectionTest();
  }

  cancelConnectionTest() {
    this._testController?.abort();
    this._testController = null;
    this._testResult = null;
    this.updateTestStatus();
  }

  onLeaveView() {
    this.captureKeyDraft();
    this.captureSections();
    if (this._previewSpeech) { window.speechSynthesis?.cancel(); this._previewSpeech = null; }
    this._keyVisible = false;
    this._renderVersion++;
    this.cancelConnectionTest();
  }

  updateTestStatus() {
    const box = this.container?.querySelector('#api-test-result-box');
    const button = this.container?.querySelector('#api-test-button');
    const pending = !!this._testController;
    if (button) {
      button.disabled = pending;
      button.setAttribute('aria-busy', String(pending));
      const label = button.querySelector('span');
      if (label) label.textContent = pending ? 'Testing…' : 'Test Connection';
    }
    if (!box) return;
    box.style.display = pending || this._testResult ? 'block' : 'none';
    box.replaceChildren();
    if (pending) {
      box.textContent = 'Checking credentials and a complete Gemini text response…';
    } else if (this._testResult) {
      const status = document.createElement('div');
      status.className = `badge ${this._testResult.success ? 'badge-success' : 'badge-error'}`;
      status.style.cssText = 'width:100%;justify-content:center;padding:0.5rem;white-space:normal;line-height:1.4;';
      status.textContent = `${this._testResult.success ? '✓' : '✕'} ${this._testResult.message}`;
      box.append(status);
    }
  }

  async render() {
    this.container = document.getElementById('view-settings');
    if (!this.container) return;
    this.captureKeyDraft();
    this.captureSections();
    const version = ++this._renderVersion;

    try {
      const apiKey = (window.geminiService && typeof window.geminiService.getApiKey === 'function') 
        ? window.geminiService.getApiKey() 
        : (localStorage.getItem('hamsa_gemini_api_key') || '');

      // Resolve how AI requests are actually travelling before rendering, so the
      // card can tell the truth about where the key lives.
      if (window.aiClient) await window.aiClient.probeServerKey();
      const transportMode = window.geminiService?.getTransportMode?.() || (apiKey ? 'DIRECT' : 'UNCONFIGURED');
      const usingProxy = transportMode === 'PROXY';

      const transportBadge = usingProxy
        ? { cls: 'badge-success', text: 'Secure Server Proxy' }
        : (apiKey ? { cls: 'badge-success', text: 'Personal Key Configured' } : { cls: 'badge-warning', text: 'Using Fallback Engine' });

      const currentModel = (window.geminiService && typeof window.geminiService.getActiveModel === 'function')
        ? window.geminiService.getActiveModel()
        : 'gemini-3.6-flash';
      const modelOptions = window.geminiService?.candidateModels || ['gemini-3.6-flash'];

      const currentTheme = localStorage.getItem('hamsa_theme_mode') || 'DARK';
      const currentPalette = localStorage.getItem('hamsa_theme_palette') || 'INDIGO';
      const currentFontSize = localStorage.getItem('hamsa_font_size') || 'DEFAULT';
      const currentFontFamily = localStorage.getItem('hamsa_font_family') || 'DEFAULT';

      const dbStats = (typeof getDatabaseSummaryCounts === 'function') 
        ? await getDatabaseSummaryCounts() 
        : { quizzesCount: 0, questionsCount: 0, notesCount: 0, attemptsCount: 0 };
      const storageStatus = await this.readStorageStatus();
      if (version !== this._renderVersion) return;
      this._storageStatus = storageStatus;
      for (const key of ['quizzesCount', 'questionsCount', 'notesCount', 'attemptsCount', 'cardCount',
        'deckCount', 'reviewCount', 'answerCount', 'teacherCount', 'savedExamCount']) {
        dbStats[key] = Number.isFinite(Number(dbStats[key])) ? Number(dbStats[key]) : 0;
      }

      const backgroundThemes = [
        { id: 'DARK', name: 'OLED Dark', emoji: '🌑', type: 'Dark', bg: '#07090E', cardBg: '#0E1424', text: '#F8FAFC', desc: 'Ultra-black obsidian & celestial glass' },
        { id: 'LIGHT', name: 'Classic Light', emoji: '☀️', type: 'Light', bg: '#F8FAFC', cardBg: '#FFFFFF', text: '#0B0F19', desc: 'Editorial silk & crisp platinum contrast' },
        { id: 'SOFT_WHITE', name: 'Soft Off-White', emoji: '🤍', type: 'Light', bg: '#FAF9F6', cardBg: '#FDFCFA', text: '#2C2417', desc: 'Warm ivory cream — restful for long reading' },
        { id: 'SAGE_GREEN', name: 'Sage Green', emoji: '🌿', type: 'Light', bg: '#F0F5F0', cardBg: '#F5FAF5', text: '#1A2E1A', desc: 'Calming sage tone to ease mental fatigue' },
        { id: 'WARM_GOLD', name: 'Warm Gold', emoji: '✨', type: 'Light', bg: '#FDF8F0', cardBg: '#FFFAF4', text: '#2E2310', desc: 'Signature Hamsa royal gold-tinted paper' },
        { id: 'MIDNIGHT_BLUE', name: 'Midnight Blue', emoji: '🌌', type: 'Dark', bg: '#0A1628', cardBg: '#0D1A30', text: '#E8F0FC', desc: 'Deep cosmic navy dark mode alternative' },
        { id: 'CHARCOAL', name: 'Charcoal Grey', emoji: '🪨', type: 'Dark', bg: '#1A1A2E', cardBg: '#1C1C32', text: '#EEEEF5', desc: 'Gentle slate-grey dark mode for softer eyes' },
        { id: 'SEPIA', name: 'Classic Sepia', emoji: '📜', type: 'Light', bg: '#F4ECD8', cardBg: '#F8F0DC', text: '#3C2E18', desc: 'Nostalgic book paper tone for focused study' }
      ];

      const palettes = [
        { id: 'INDIGO', name: 'Indigo & Violet', primary: '#4F46E5', accent: '#9333EA' },
        { id: 'TEAL', name: 'Emerald Teal', primary: '#059669', accent: '#0D9488' },
        { id: 'AMBER', name: 'Radiant Amber', primary: '#D97706', accent: '#EA580C' },
        { id: 'ROSE', name: 'Vivid Rose', primary: '#E11D48', accent: '#BE123C' },
        { id: 'CYAN', name: 'Ocean Cyan', primary: '#0891B2', accent: '#0284C7' },
        { id: 'SLATE', name: 'Executive Slate', primary: '#475569', accent: '#64748B' }
      ];

      const profile = window.examProfileManager ? (window.examProfileManager.loadProfile() || window.examProfileManager.getProfile()) : null;

      // Hero counters report what is actually stored locally, which is the
      // honest framing for a tab whose main job is managing that data.
      const totalRecords = (dbStats.totalRecords != null)
        ? dbStats.totalRecords
        : (dbStats.quizzesCount || 0) + (dbStats.questionsCount || 0)
          + (dbStats.attemptsCount || 0) + (dbStats.notesCount || 0);

      const heroHtml = UIUtils.buildViewHero({
        accent: 'slate',
        icon: 'settings',
        eyebrow: 'Preferences & Data',
        title: 'Your app,',
        titleAccent: 'on your terms.',
        hindi: 'व्यवस्था — आपका डेटा, आपके नियम',
        tagline: 'Your library and preferences are stored on this device. When you use cloud AI, your submitted content is sent to Google through the configured connection. Manage your profile, appearance and backups here.',
        stats: [
          { value: Number(totalRecords).toLocaleString('en-IN'), label: 'Records stored' },
          { value: dbStats.quizzesCount || 0, label: 'Quizzes' },
          { value: dbStats.notesCount || 0, label: 'Notes' },
          { value: backgroundThemes.length, label: 'Themes' }
        ],
        chipsLabel: 'What you control here',
        chips: [
          { icon: 'user-check', label: 'Academic profile', hint: 'Drives exam eligibility matching' },
          { icon: 'key-round', label: 'AI transport', hint: 'Server proxy or a direct API key' },
          { icon: 'palette', label: 'Theme & palette', hint: `${backgroundThemes.length} themes across ${palettes.length} colour palettes` },
          { icon: 'type', label: 'Typography', hint: 'Font family and four size steps' },
          { icon: 'database-backup', label: 'Backup & restore', hint: 'Full export, merge or replace on import' }
        ]
      });

      if (version !== this._renderVersion) return;
      this.captureKeyDraft();
      this.captureSections();
      const focused = this.container.contains(document.activeElement) ? document.activeElement : null;
      const focusId = focused?.id;
      const focusAction = focused?.getAttribute('onclick');
      this.container.innerHTML = `
        <div class="settings-container">
          ${heroHtml}

          <!-- 0. Student Identity & Academic Profile Card -->
          <div class="form-group-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div style="font-size:1.1rem; font-weight:700; display:flex; align-items:center; gap:0.45rem;">
                <i data-lucide="user-check" style="width:18px;height:18px;color:var(--color-primary-light);"></i>
                <span>Student Identity & Academic Profile</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="app.openProfileManagerModal()">
                <i data-lucide="edit-3" style="width:14px;height:14px;"></i> Edit Profile
              </button>
            </div>

            <p style="font-size:0.88rem; color:var(--text-secondary);">
              Your academic profile powers the Exam Alerts & Eligibility Radar and reflects your name across all website study reports.
            </p>

            ${profile ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap:0.75rem; margin-top:0.75rem; padding:1rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-lg);">
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Student Name</span><div style="font-weight:750; font-size:1.05rem; color:var(--text-main);">${this.escape(profile.fullName || 'Scholar')}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Date of Birth & Age</span><div style="font-weight:700; color:var(--text-main);">${this.escape(profile.dateOfBirth || '—')} (${this.escape(profile.age || '—')} yrs)</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Category & State</span><div style="font-weight:700; color:var(--text-main);">${this.escape(profile.category || 'General')} • ${this.escape(profile.domicile || 'All India')}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">10th Matric Score</span><div style="font-weight:700; color:var(--color-primary-light);">${profile.tenthPercentage != null && profile.tenthPercentage !== '' && Number.isFinite(Number(profile.tenthPercentage)) ? this.escape(profile.tenthPercentage + '% (' + (profile.tenthBoard || 'CBSE') + ')') : 'Not filled'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">12th Inter Score</span><div style="font-weight:700; color:var(--color-primary-light);">${profile.twelfthPercentage != null && profile.twelfthPercentage !== '' && Number.isFinite(Number(profile.twelfthPercentage)) ? this.escape(profile.twelfthPercentage + '% (' + (profile.twelfthStream || 'Science') + ')') : 'Not filled'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Highest Qualification</span><div style="font-weight:700; color:var(--text-main);">${this.escape(profile.qualification || '—')}</div></div>
              </div>
            ` : `
              <div style="padding:1rem; background:var(--bg-surface-elevated); border-radius:var(--radius-lg); text-align:center;">
                <p style="font-size:0.88rem; color:var(--text-muted);">No academic profile configured yet.</p>
                <button class="btn btn-primary btn-sm" onclick="app.openProfileManagerModal()" style="margin-top:0.5rem;">
                  <i data-lucide="user-plus"></i> Set Up Profile Now
                </button>
              </div>
            `}
          </div>

          <!-- 1. Google Gemini AI Configuration -->
          <div class="form-group-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div style="font-size:1.1rem; font-weight:700;">1. Google Gemini AI Configuration</div>
              <span class="badge ${transportBadge.cls}">${transportBadge.text}</span>
            </div>

            ${usingProxy ? `
              <div style="display:flex; gap:0.6rem; align-items:flex-start; padding:0.85rem 1rem; background:rgba(16,185,129,0.09); border:1px solid rgba(16,185,129,0.35); border-radius:var(--radius-md);">
                <i data-lucide="shield-check" style="width:18px;height:18px;color:#10B981;flex-shrink:0;margin-top:2px;"></i>
                <div style="font-size:0.86rem; line-height:1.5;">
                  <strong style="color:var(--text-main);">AI requests are proxied through this server.</strong><br>
                  The API key is held server-side in the <code>GEMINI_API_KEY</code> environment variable and is
                  <strong>never sent to or stored in your browser</strong>. You do not need to enter a key below.
                </div>
              </div>
            ` : `
              <div style="display:flex; gap:0.6rem; align-items:flex-start; padding:0.85rem 1rem; background:rgba(245,158,11,0.09); border:1px solid rgba(245,158,11,0.35); border-radius:var(--radius-md);">
                <i data-lucide="alert-triangle" style="width:18px;height:18px;color:#F59E0B;flex-shrink:0;margin-top:2px;"></i>
                <div style="font-size:0.86rem; line-height:1.5;">
                  <strong style="color:var(--text-main);">Direct mode — key is stored in this browser.</strong><br>
                  A key entered here is saved in <code>localStorage</code> and sent from your browser to Google on every
                  request, so anyone with access to this device or browser profile can read it.
                  For better security, stop the server and restart it with the key set:
                  <code style="display:block;margin-top:0.4rem;padding:0.35rem 0.5rem;background:var(--bg-surface-elevated);border-radius:4px;">$env:GEMINI_API_KEY="your-key"; node server.js</code>
                </div>
              </div>
            `}

            <p style="font-size:0.88rem; color:var(--text-secondary);">
              ${usingProxy
                ? 'The server connection takes priority. Entering a personal key and clicking Test Connection verifies that key directly with Google; it does not replace the server connection.'
                : 'Enter your Google Gemini API key to enable cloud question formulation.'}
            </p>

            <div style="display:flex; gap:0.5rem; flex-direction:column;">
              <div style="display:flex; gap:0.5rem;">
                <input type="${this._keyVisible ? 'text' : 'password'}" id="gemini-api-key-input" class="study-textarea" style="min-height:44px; flex:1; min-width:0;"
                  aria-label="Personal Gemini API key" autocomplete="off" spellcheck="false" oninput="settingsView.onKeyInput(this.value)"
                  placeholder="AIzaSy..." value="${this.escape(this._apiKeyDraft ?? apiKey)}">
                <button type="button" id="api-visibility-button" class="btn btn-secondary" aria-label="${this._keyVisible ? 'Hide' : 'Show'} API key" aria-pressed="${this._keyVisible}" onclick="settingsView.togglePasswordVisibility()">
                  <i data-lucide="${this._keyVisible ? 'eye-off' : 'eye'}" id="api-eye-icon"></i>
                </button>
              </div>

              <!-- Model Selection Row -->
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem; padding:0.75rem 1rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                <div style="display:flex; flex-direction:column; gap:0.2rem;">
                  <span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Active Gemini Model</span>
                  <span style="font-size:0.75rem; color:var(--text-muted);">Free-tier models · Usage limits apply</span>
                </div>

                <select id="gemini-model-select" aria-label="Active Gemini model" class="study-textarea" style="width:auto; max-width:100%; min-width:0; min-height:36px; padding:0.25rem 0.75rem; font-size:0.85rem; font-weight:600;" onchange="settingsView.onModelSelect(this.value)">
                  ${modelOptions.map(m => `<option value="${this.escape(m)}" ${currentModel === m ? 'selected' : ''}>${this.escape(m)}${m === 'gemini-3.6-flash' ? ' (Recommended)' : ''}</option>`).join('')}
                </select>
              </div>

            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem;">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem; display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="external-link" style="width:14px;height:14px;"></i>
                <span>Get a free Gemini API key from Google AI Studio</span>
              </a>

              <div style="display:flex; gap:0.5rem;">
                <button id="api-test-button" class="btn btn-secondary btn-sm" onclick="settingsView.testApiKey()">
                  <i data-lucide="activity"></i>
                  <span>Test Connection</span>
                </button>
                <button class="btn btn-primary btn-sm" onclick="settingsView.saveApiKey()">
                  <i data-lucide="save"></i>
                  <span>Save Key</span>
                </button>
              </div>
            </div>
            
            <div id="api-test-result-box" role="status" aria-live="polite" style="margin-top:0.5rem; display:none;"></div>

            <!-- Token usage. Gemini bills per token and the free tier has daily
                 limits, but nothing used to report consumption — a runaway batch
                 could exhaust a quota with no feedback. These are exact counts
                 from the API's own usageMetadata, not estimates. -->
            ${(() => {
              const usage = window.aiClient?.getUsage?.();
              if (!usage) return '';
              const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
              const hasAny = usage.today.requests > 0;

              return `
                <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border-subtle);">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <div style="font-weight:700; font-size:0.92rem; display:flex; align-items:center; gap:0.4rem;">
                      <i data-lucide="gauge" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
                      <span>AI Token Usage</span>
                    </div>
                    ${hasAny ? `
                      <button class="btn btn-secondary btn-sm" onclick="settingsView.resetAiUsage()" title="Reset local counters; Google's quota is unchanged">
                        <i data-lucide="rotate-ccw" style="width:13px;height:13px;"></i>
                        <span>Reset</span>
                      </button>
                    ` : ''}
                  </div>

                  ${hasAny ? `
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:0.6rem; margin-top:0.7rem;">
                      <div style="padding:0.6rem 0.8rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700;">Today — Requests</div>
                        <div style="font-weight:800; font-size:1.1rem; color:var(--text-main);">${fmt(usage.today.requests)}</div>
                      </div>
                      <div style="padding:0.6rem 0.8rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700;">Today — Total Tokens</div>
                        <div style="font-weight:800; font-size:1.1rem; color:var(--color-primary-light);">${fmt(usage.today.totalTokens)}</div>
                      </div>
                      <div style="padding:0.6rem 0.8rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700;">Input / Output</div>
                        <div style="font-weight:700; font-size:0.92rem; color:var(--text-secondary);">${fmt(usage.today.promptTokens)} in · ${fmt(usage.today.outputTokens)} out</div>
                      </div>
                      <div style="padding:0.6rem 0.8rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700;">This Session</div>
                        <div style="font-weight:700; font-size:0.92rem; color:var(--text-secondary);">${fmt(usage.session.requests)} req · ${fmt(usage.session.totalTokens)} tokens</div>
                      </div>
                    </div>
                    <p style="font-size:0.78rem; color:var(--text-muted); margin-top:0.55rem;">
                      Exact counts reported by the Gemini API for responses recorded in this browser.
                      Local daily totals reset at midnight; these counters do not show or reset Google's quota.
                    </p>
                  ` : `
                    <p style="font-size:0.83rem; color:var(--text-muted); margin-top:0.5rem;">
                      No AI usage recorded in this browser today. Counts appear when Google reports usage in a response.
                    </p>
                  `}
                </div>
              `;
            })()}
          </div>
        </div>

        <!-- 2. Appearance & Visual Identity -->
        <div class="form-group-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div style="font-size:1.1rem; font-weight:700;">2. Appearance & Visual Identity</div>
            <span class="badge badge-primary">${backgroundThemes.length} Backgrounds • ${palettes.length} Accents</span>
          </div>
          <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:0.25rem;">
            Select a tailored background tone designed for long reading or night focus, then customize with your preferred accent colors.
          </p>
          
          <div style="margin-top:0.75rem;">
            <label style="font-size:0.88rem; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem;">
              <i data-lucide="palette" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
            Background Theme Mode (${backgroundThemes.length} Study Themes):
            </label>
            <div class="theme-modes-grid" style="margin-top:0.6rem;">
              ${backgroundThemes.map(theme => {
                const isActive = currentTheme === theme.id;
                return `
                  <button type="button" aria-pressed="${isActive}" style="font:inherit;text-align:left;color:inherit;" class="theme-mode-card ${isActive ? 'active' : ''}" onclick="settingsView.setThemeMode('${theme.id}')">
                    <div class="theme-preview-box" style="background:${theme.bg};">
                      <div class="theme-preview-inner" style="background:${theme.cardBg}; color:${theme.text};">
                        <span>${theme.emoji} ${theme.name}</span>
                        <span style="font-size:0.65rem; opacity:0.8; text-transform:uppercase;">${theme.type}</span>
                      </div>
                    </div>
                    <div>
                      <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-weight:700; font-size:0.88rem; color:var(--text-main);">${theme.name}</span>
                        ${isActive ? '<i data-lucide="check" style="width:15px;height:15px;color:var(--color-primary-light);"></i>' : ''}
                      </div>
                      <div style="font-size:0.74rem; color:var(--text-muted); line-height:1.3; margin-top:0.2rem;">${theme.desc}</div>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div style="margin-top:1.25rem;">
            <label style="font-size:0.88rem; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem;">
              <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
              Button & Highlight Accent Palettes (6 Colors):
            </label>
            <div class="palette-swatches-grid" style="margin-top:0.6rem;">
              ${palettes.map(pal => `
                <button type="button" aria-pressed="${currentPalette === pal.id}" style="font:inherit;text-align:left;color:inherit;" class="palette-swatch-card ${currentPalette === pal.id ? 'active' : ''}" onclick="settingsView.setThemePalette('${pal.id}')">
                  <div class="swatch-color-pill" style="background:linear-gradient(135deg, ${pal.primary}, ${pal.accent});"></div>
                  <div>
                    <div style="font-weight:700; font-size:0.92rem; color:var(--text-main);">${pal.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${pal.id}</div>
                  </div>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 3. Typography Controls -->
        <div class="form-group-card">
          <div style="font-size:1.1rem; font-weight:700;">3. Typography & Accessibility</div>
          
          <div>
            <label style="font-size:0.88rem; font-weight:600; color:var(--text-secondary);">Font Scaling:</label>
            <div class="chips-select-grid" style="margin-top:0.5rem;">
              <button type="button" aria-pressed="${currentFontSize === 'SMALL'}" class="select-chip ${currentFontSize === 'SMALL' ? 'active' : ''}" onclick="settingsView.setFontSize('SMALL')">
                Small (90%)
              </button>
              <button type="button" aria-pressed="${currentFontSize === 'DEFAULT'}" class="select-chip ${currentFontSize === 'DEFAULT' ? 'active' : ''}" onclick="settingsView.setFontSize('DEFAULT')">
                Default (100%)
              </button>
              <button type="button" aria-pressed="${currentFontSize === 'LARGE'}" class="select-chip ${currentFontSize === 'LARGE' ? 'active' : ''}" onclick="settingsView.setFontSize('LARGE')">
                Large (112%)
              </button>
              <button type="button" aria-pressed="${currentFontSize === 'EXTRA_LARGE'}" class="select-chip ${currentFontSize === 'EXTRA_LARGE' ? 'active' : ''}" onclick="settingsView.setFontSize('EXTRA_LARGE')">
                Extra Large (125%)
              </button>
            </div>
          </div>

          <div style="margin-top:0.75rem;">
            <label style="font-size:0.88rem; font-weight:600; color:var(--text-secondary);">Font Family Style:</label>
            <div class="chips-select-grid" style="margin-top:0.5rem;">
              <button type="button" aria-pressed="${currentFontFamily === 'DEFAULT'}" class="select-chip ${currentFontFamily === 'DEFAULT' ? 'active' : ''}" onclick="settingsView.setFontFamily('DEFAULT')">
                Outfit & Inter (Modern EdTech)
              </button>
              <button type="button" aria-pressed="${currentFontFamily === 'SANS'}" class="select-chip ${currentFontFamily === 'SANS' ? 'active' : ''}" onclick="settingsView.setFontFamily('SANS')">
                Clean System Sans
              </button>
              <button type="button" aria-pressed="${currentFontFamily === 'SERIF'}" class="select-chip ${currentFontFamily === 'SERIF' ? 'active' : ''}" onclick="settingsView.setFontFamily('SERIF')">
                Editorial Serif
              </button>
              <button type="button" aria-pressed="${currentFontFamily === 'ROUNDED'}" class="select-chip ${currentFontFamily === 'ROUNDED' ? 'active' : ''}" onclick="settingsView.setFontFamily('ROUNDED')">
                Friendly Rounded
              </button>
            </div>
          </div>
        </div>

        <!-- 4. Data Management, Backup & Restore -->
        <div class="form-group-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div style="font-size:1.15rem; font-weight:700;">4. Data Management, Backup & Full Restore</div>
            <span class="badge badge-primary">Offline IndexedDB Storage</span>
          </div>
          <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:0.35rem;">
            Export your entire library of generated quizzes, MCQs, practice attempts, and personal study notes as a single portable JSON file. You can restore this backup anytime or transfer it between devices.
          </p>

          <!-- Storage Statistics Chips -->
          <div style="display:flex; flex-wrap:wrap; gap:1rem; margin:1rem 0; padding:0.85rem 1.15rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); box-shadow:var(--specular-highlight);">
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="help-circle" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
              <span>Quizzes: <strong style="color:var(--color-primary-light);">${dbStats.quizzesCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="list-checks" style="width:16px;height:16px;color:#10B981;"></i>
              <span>Questions: <strong style="color:#10B981;">${dbStats.questionsCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="book-open" style="width:16px;height:16px;color:#F59E0B;"></i>
              <span>Study Notes: <strong style="color:#F59E0B;">${dbStats.notesCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="award" style="width:16px;height:16px;color:#A855F7;"></i>
              <span>Attempts: <strong style="color:#A855F7;">${dbStats.attemptsCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="layers" style="width:16px;height:16px;color:#38BDF8;"></i>
              <span>Flashcards: <strong style="color:#38BDF8;">${dbStats.cardCount} in ${dbStats.deckCount} decks</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="repeat" style="width:16px;height:16px;color:#22D3EE;"></i>
              <span>Revision Progress: <strong style="color:#22D3EE;">${dbStats.reviewCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="pen-tool" style="width:16px;height:16px;color:#F472B6;"></i>
              <span>Written Answers: <strong style="color:#F472B6;">${dbStats.answerCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="graduation-cap" style="width:16px;height:16px;color:#C084FC;"></i>
              <span>AI Teacher Lessons: <strong style="color:#C084FC;">${dbStats.teacherCount}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
              <i data-lucide="bookmark" style="width:16px;height:16px;color:#FBBF24;"></i>
              <span>Saved Exams: <strong style="color:#FBBF24;">${dbStats.savedExamCount}</strong></span>
            </div>
          </div>

          <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.85rem;">
            A backup includes <strong>all ${totalRecords} records above</strong> plus your theme preferences and
            student academic profile, so nothing is lost when you move to another device or browser.
          </p>

          <!-- Restore mode selector -->
          <fieldset style="margin-top:1rem; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:0.85rem 1rem;">
            <legend style="font-size:0.8rem; font-weight:700; color:var(--text-muted); padding:0 0.4rem;">RESTORE BEHAVIOUR</legend>
            <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer; margin-bottom:0.6rem;">
              <input type="radio" name="import-mode" value="REPLACE" ${this.importMode !== 'MERGE' ? 'checked' : ''}
                onchange="settingsView.setImportMode('REPLACE')" style="margin-top:3px;">
              <span style="font-size:0.85rem;">
                <strong style="color:var(--text-main);">Replace</strong> — delete current data and restore the backup exactly.
                <span style="color:var(--text-muted);">Best when moving to a new device.</span>
              </span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;">
              <input type="radio" name="import-mode" value="MERGE" ${this.importMode === 'MERGE' ? 'checked' : ''}
                onchange="settingsView.setImportMode('MERGE')" style="margin-top:3px;">
              <span style="font-size:0.85rem;">
                <strong style="color:var(--text-main);">Merge</strong> — keep current data and add the backup alongside it.
                <span style="color:var(--text-muted);">Records get new IDs; nothing is overwritten.</span>
              </span>
            </label>
          </fieldset>

          <div style="display:flex; flex-wrap:wrap; gap:0.85rem; margin-top:0.85rem;">
            <button class="btn btn-primary" onclick="settingsView.handleExportBackup()" style="gap:0.55rem;">
              <i data-lucide="download"></i>
              <span>Export Full Backup (JSON)</span>
            </button>

            <button class="btn btn-secondary" onclick="document.getElementById('import-file-input').click()" style="gap:0.55rem;">
              <i data-lucide="upload"></i>
              <span>Import & Restore Backup</span>
            </button>
            <input type="file" id="import-file-input" accept=".json,application/json" style="display:none;" onchange="settingsView.handleImportFile(event)">
          </div>

          <div style="margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--border-subtle);">
            <div style="font-weight:700; color:var(--color-error); font-size:0.95rem;">Danger Zone</div>
            <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.75rem;">
              Permanently erase every record on this device — quizzes, attempts, study notes, flashcard decks and
              revision progress, written answers, AI Teacher lessons and saved exams.
              <strong style="color:var(--text-secondary);">Export a backup first.</strong>
            </p>

            <button class="btn btn-danger btn-sm" onclick="settingsView.confirmResetAll()">
              <i data-lucide="alert-triangle"></i>
              <span>Reset All Database Records</span>
            </button>
          </div>
        </div>
      </div>
    `;

      this.compactSections();
      this.updateTestStatus();
      if (window.app) window.app.refreshIcons();
      const focusTarget = focusId ? document.getElementById(focusId)
        : (focusAction ? [...this.container.querySelectorAll('[onclick]')].find(el => el.getAttribute('onclick') === focusAction) : null);
      focusTarget?.focus({ preventScroll: true });
    } catch (err) {
      if (version !== this._renderVersion) return;
      console.error('Error rendering settings view:', err);
      this.container.innerHTML = `
        <div class="card p-6 text-center" style="padding: 2rem; text-align: center;">
          <p style="color:var(--color-error); font-weight: 600;">Failed to load settings: ${this.escape(err.message)}</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="settingsView.render()">Retry</button>
        </div>
      `;
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('gemini-api-key-input');
    if (!input) return;
    this._keyVisible = input.type === 'password';
    input.type = this._keyVisible ? 'text' : 'password';
    const button = document.getElementById('api-visibility-button');
    button.setAttribute('aria-label', `${this._keyVisible ? 'Hide' : 'Show'} API key`);
    button.setAttribute('aria-pressed', String(this._keyVisible));
    button.innerHTML = `<i data-lucide="${this._keyVisible ? 'eye-off' : 'eye'}" id="api-eye-icon"></i>`;
    window.app?.refreshIcons();
  }

  saveApiKey() {
    const input = document.getElementById('gemini-api-key-input');
    if (!input) return;
    this.captureKeyDraft();
    const val = input.value.trim();
    try {
      window.geminiService.setApiKey(val);
      this._apiKeyDraft = val;
      this.cancelConnectionTest();
      app.showToast(val ? 'Gemini API key saved on this device.' : 'Personal Gemini API key removed.', 'success');
      this.render();
    } catch (error) {
      app.showToast(`Could not save API key: ${error.message}`, 'error');
    }
  }

  onModelSelect(model) {
    this.cancelConnectionTest();
    try {
      const service = window.geminiService;
      if (!service.candidateModels.includes(model)) throw new Error('Unsupported Gemini model.');
      service.setActiveModel(model);
      if (service.getActiveModel() !== model) throw new Error('Model selection was not saved.');
      app.showToast(`Selected model: ${model}`, 'info');
    } catch (error) {
      app.showToast(`Could not change model: ${error.message}`, 'error');
      this.render();
    }
  }

  async testApiKey() {
    if (this._testController) return;
    const input = document.getElementById('gemini-api-key-input');
    if (!input) return;
    this.captureKeyDraft();
    const val = input.value.trim();
    const controller = new AbortController();
    this._testController = controller;
    this._testResult = null;
    this.updateTestStatus();
    try {
      const service = window.geminiService;
      const res = await service.testApiKey(val, { signal: controller.signal, saveModel: false });
      if (controller.signal.aborted || this._testController !== controller) return;
      // Testing a spare personal key must not change the server's active model.
      const canSelect = res.success && (res.transport === 'PROXY' || service.getTransportMode() !== 'PROXY');
      if (canSelect && service.candidateModels.includes(res.model)) {
        service.setActiveModel(res.model);
        const select = document.getElementById('gemini-model-select');
        if (select) select.value = res.model;
      }
      this._testResult = res;
    } catch (error) {
      if (!controller.signal.aborted && this._testController === controller) {
        this._testResult = { success: false, message: error.message || 'Connection test failed. Please retry.' };
      }
    } finally {
      if (this._testController === controller) {
        this._testController = null;
        this.updateTestStatus();
      }
    }
  }

  applyPreference(method, value) {
    try {
      app[method](value);
      return this.render();
    } catch (error) {
      app.showToast(`Could not save preference: ${error.message}`, 'error');
    }
  }

  setThemeMode(mode) {
    return this.applyPreference('setThemeMode', mode);
  }

  setThemePalette(palette) {
    return this.applyPreference('setThemePalette', palette);
  }

  setFontSize(size) {
    return this.applyPreference('setFontSize', size);
  }

  setFontFamily(family) {
    return this.applyPreference('setFontFamily', family);
  }

  resetAiUsage() {
    window.aiClient?.resetUsage?.();
    app.showToast('Local AI counters reset. Google quota is unchanged.', 'info');
    this.render();
  }

  setImportMode(mode) {
    this.importMode = mode === 'MERGE' ? 'MERGE' : 'REPLACE';
  }

  async handleExportBackup() {
    if (this._exportPending || this._importPending || this._resetPending) return;
    this._exportPending = true;
    try {
      const summary = await exportDatabaseBackup();
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      try { localStorage.setItem('hamsa_last_backup', JSON.stringify({ requestedAt: new Date().toISOString(), records: total })); }
      catch { app.showToast('Backup download requested, but its date could not be saved.', 'warning'); }
      app.showToast(`Backup exported — download requested for ${total} records.`, 'success');
      await this.render();
      if (window.audioEngine) window.audioEngine.playSuccess();
    } catch (e) {
      app.showToast(`Export failed: ${e.message}`, 'error');
    } finally {
      this._exportPending = false;
    }
  }

  async handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (Number(file.size) > SettingsView.MAX_BACKUP_BYTES) {
      event.target.value = '';
      app.showToast('This backup exceeds the 100 MB restore limit. Use a smaller backup; current data was left untouched.', 'error');
      return;
    }
    if (this._importPending || this._exportPending || this._resetPending) {
      event.target.value = '';
      app.showToast('A data operation is already pending. Please finish it first.', 'info');
      return;
    }
    this._importPending = true;

    const mode = this.importMode === 'MERGE' ? 'MERGE' : 'REPLACE';
    const resetInput = () => {
      event.target.value = '';
      this._importPending = false;
    };

    let text;
    let preview;
    try {
      text = await file.text();
      // Inspect before showing the dialog so the user sees what they'd restore
      // and an unreadable file is rejected without touching the database.
      preview = await inspectDatabaseBackup(text);
    } catch (e) {
      app.showToast(`Cannot read this backup: ${e.message}`, 'error');
      resetInput();
      return;
    }

    if (preview.totalRecords === 0 && !preview.hasProfile && !preview.preferenceCount) {
      app.showToast('This backup contains no restorable records. Your data was left untouched.', 'warning');
      resetInput();
      return;
    }

    const contents = Object.values(preview.tables)
      .filter(t => t.imported > 0)
      .map(t => `  • ${t.label}: ${t.imported}`)
      .join('\n');

    const skipped = Object.values(preview.tables).reduce((sum, t) => sum + t.skipped, 0);
    const exportedOn = preview.exportedAt
      ? new Date(preview.exportedAt).toLocaleString()
      : 'unknown date';

    const modeLine = mode === 'MERGE'
      ? 'MERGE — your current data is kept and these records are added alongside it.'
      : 'REPLACE — your current data will be deleted and replaced by this backup.';

    app.showConfirmation({
      title: mode === 'MERGE' ? 'Merge Backup Into Current Data?' : 'Replace All Data With Backup?',
      message:
        `File: "${file.name}"\n` +
        (file.size ? `File size: ${this.formatBytes(file.size)}\n` : '') +
        (file.size > 20 * 1024 * 1024 ? 'Large backup: restore may take time and require extra browser storage. Keep this page open.\n' : '') +
        `Created: ${exportedOn} (format v${preview.formatVersion})\n\n` +
        `Will restore ${preview.totalRecords} records:\n${contents}\n` +
        (preview.hasProfile ? '  • Student academic profile\n' : '') +
        (preview.preferenceCount ? `  • ${preview.preferenceCount} preference setting(s)\n` : '') +
        (skipped > 0 ? `\n${skipped} invalid record(s) will be skipped.\n` : '') +
        `\n${modeLine}\n\n` +
        'If anything goes wrong, your current data is automatically restored.',
      confirmText: mode === 'MERGE' ? 'Merge Now' : 'Replace Now',
      onCancel: resetInput,
      onConfirm: async () => {
        try {
          const report = await importDatabaseBackup(text, { mode });

          const restoredLines = Object.values(report.tables)
            .filter(t => t.imported > 0)
            .map(t => `${t.label}: ${t.imported}`)
            .join(' • ');

          app.showToast(
            `Restore complete (${report.mode}). ${report.totalImported} records — ${restoredLines}`,
            'success'
          );

          // Re-apply restored theme/font preferences and refresh identity.
          app.initThemeAndPreferences();
          this._studyDraft = window.studyPreferences?.get() || null;
          if (app.updateGlobalStudentIdentity) app.updateGlobalStudentIdentity();

          await this.render();
          if (window.audioEngine) window.audioEngine.playSuccess();
        } catch (e) {
          app.showToast(`Import failed: ${e.message}`, 'error');
        } finally {
          resetInput();
        }
      }
    });
  }

  confirmResetAll() {
    if (this._resetPending || this._importPending || this._exportPending) return;
    this._resetPending = true;
    app.showConfirmation({
      title: 'Reset All Data?',
      message:
        'This irreversibly deletes EVERYTHING stored on this device:\n\n' +
        '  • Quizzes, questions and attempt history\n' +
        '  • Study notes and digital textbooks\n' +
        '  • Flashcard decks, cards and revision progress\n' +
        '  • Written answers and drafts\n' +
        '  • AI Teacher lessons and saved exams\n\n' +
        'Your theme settings and student profile are kept. This cannot be undone — export a backup first if you are unsure.',
      confirmText: 'Reset Everything',
      onCancel: () => { this._resetPending = false; },
      onConfirm: async () => {
        try {
          const removed = await clearDatabase();
          const total = Object.values(removed).reduce((a, b) => a + b, 0);
          app.showToast(`All local data reset — ${total} records removed.`, 'info');
        } catch (e) {
          app.showToast(`Reset failed: ${e.message}`, 'error');
        } finally {
          this._resetPending = false;
        }
        this.render();
      }
    });
  }

  confirmModuleReset(moduleId) {
    if (this._resetPending || this._importPending || this._exportPending) return;
    if (app._isGenerating || window.studyNotesView?.isCreating || window.aiTeacherView?.isLoading || window.answerWritingView?.isEvaluating) {
      app.showToast('Finish or cancel the active generation before resetting data.', 'info'); return;
    }
    const labels = { QUIZZES: 'Quizzes & attempts', NOTES: 'Study Notes', FLASHCARDS: 'Flashcards & revision progress', ANSWERS: 'Answer Writing', TEACHER: 'AI Teacher lessons', EXAMS: 'Saved exams & exam cache' };
    if (!labels[moduleId]) return;
    this._resetPending = true;
    app.showConfirmation({
      title: `Reset ${labels[moduleId]}?`,
      message: `Permanently erase ${labels[moduleId]} on this device? Related review progress for deleted notes or quiz questions is also removed. Other libraries, your profile, preferences and API key are kept. This cannot be undone; export a backup first.`,
      confirmText: 'Reset this module', onCancel: () => { this._resetPending = false; },
      onConfirm: async () => {
        try {
          if (moduleId === 'NOTES') await window.studyNotesView?.flushAutoSave();
          if (moduleId === 'TEACHER') await window.aiTeacherView?._saveQueue;
          if (moduleId === 'ANSWERS' && window.answerWritingView) clearTimeout(window.answerWritingView._autoSaveTimer);
          const removed = await clearModuleData(moduleId);
          if (moduleId === 'NOTES' && window.studyNotesView) {
            const view = window.studyNotesView; view._endNoteSession(); view.activeNote = null; view.activeNoteId = null; view.currentViewMode = 'DASHBOARD';
          }
          if (moduleId === 'TEACHER' && window.aiTeacherView) {
            const view = window.aiTeacherView; view._cancelRequests(); view.currentExplanation = null; view.currentRecordId = null; view.followUpHistory = []; view.isBookmarked = false;
          }
          if (moduleId === 'QUIZZES') {
            try { localStorage.removeItem('hamsa_active_quiz_attempt'); } catch {}
            if (window.quizPlayerView) { window.quizPlayerView.quiz = null; window.quizPlayerView.questions = []; }
          }
          if (moduleId === 'ANSWERS' && window.answerWritingView) {
            const view = window.answerWritingView; view.activeQuestion = null; view.studentAnswerText = ''; view.currentEvaluation = null; view.currentAttemptId = null; view.activeTab = 'new-answer';
          }
          if (['QUIZZES','NOTES','FLASHCARDS'].includes(moduleId) && window.flashcardsView) {
            window.flashcardsView.currentDeck = null; window.flashcardsView.cards = []; window.flashcardsView.activeTab = 'decks';
          }
          const total = Object.values(removed).reduce((sum, count) => sum + count, 0);
          app.showToast(`${labels[moduleId]} reset — ${total} records removed.`, 'success');
          await this.render();
        } catch (error) { app.showToast(`Module reset failed: ${error.message}`, 'error'); }
        finally { this._resetPending = false; }
      }
    });
  }
}

window.settingsView = new SettingsView();
