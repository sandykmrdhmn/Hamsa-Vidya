/**
 * HAMSA VIDYA (हंस विद्या) — Settings & Customization View Controller
 */

class SettingsView {
  constructor() {
    this.container = document.getElementById('view-settings');
    // 'REPLACE' (default) or 'MERGE' — how an imported backup is applied.
    this.importMode = 'REPLACE';
  }

  async render() {
    this.container = document.getElementById('view-settings');
    if (!this.container) return;

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
        : (localStorage.getItem('hamsa_gemini_model') || 'gemini-2.5-flash');

      const currentTheme = localStorage.getItem('hamsa_theme_mode') || 'DARK';
      const currentPalette = localStorage.getItem('hamsa_theme_palette') || 'INDIGO';
      const currentFontSize = localStorage.getItem('hamsa_font_size') || 'DEFAULT';
      const currentFontFamily = localStorage.getItem('hamsa_font_family') || 'DEFAULT';

      const dbStats = (typeof getDatabaseSummaryCounts === 'function') 
        ? await getDatabaseSummaryCounts() 
        : { quizzesCount: 0, questionsCount: 0, notesCount: 0, attemptsCount: 0 };

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
        tagline: 'Everything here stays on this device. Set up your academic profile, pick a theme and type size, choose how AI requests are routed, and export or restore a full backup.',
        stats: [
          { value: Number(totalRecords).toLocaleString('en-IN'), label: 'Records stored' },
          { value: dbStats.quizzesCount || 0, label: 'Quizzes' },
          { value: dbStats.notesCount || 0, label: 'Notes' },
          { value: '9', label: 'Themes' }
        ],
        chipsLabel: 'What you control here',
        chips: [
          { icon: 'user-check', label: 'Academic profile', hint: 'Drives exam eligibility matching' },
          { icon: 'key-round', label: 'AI transport', hint: 'Server proxy or a direct API key' },
          { icon: 'palette', label: 'Theme & palette', hint: '9 themes across 6 colour palettes' },
          { icon: 'type', label: 'Typography', hint: 'Font family and four size steps' },
          { icon: 'database-backup', label: 'Backup & restore', hint: 'Full export, merge or replace on import' }
        ]
      });

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
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; margin-top:0.75rem; padding:1rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-lg);">
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Student Name</span><div style="font-weight:750; font-size:1.05rem; color:var(--text-main);">${profile.fullName || 'Scholar'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Date of Birth & Age</span><div style="font-weight:700; color:var(--text-main);">${profile.dateOfBirth || '—'} (${profile.age || '—'} yrs)</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Category & State</span><div style="font-weight:700; color:var(--text-main);">${profile.category || 'General'} • ${profile.domicile || 'All India'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">10th Matric Score</span><div style="font-weight:700; color:var(--color-primary-light);">${profile.tenthPercentage !== null ? profile.tenthPercentage + '% (' + (profile.tenthBoard || 'CBSE') + ')' : 'Not filled'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">12th Inter Score</span><div style="font-weight:700; color:var(--color-primary-light);">${profile.twelfthPercentage !== null ? profile.twelfthPercentage + '% (' + (profile.twelfthStream || 'Science') + ')' : 'Not filled'}</div></div>
                <div><span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Highest Qualification</span><div style="font-weight:700; color:var(--text-main);">${profile.qualification || '—'}</div></div>
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
            <div style="display:flex; justify-content:space-between; align-items:center;">
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
                ? 'A personal key is optional and only used if the server proxy becomes unavailable.'
                : 'Enter your Google Gemini API key to enable cloud question formulation.'}
            </p>

            <div style="display:flex; gap:0.5rem; flex-direction:column;">
              <div style="display:flex; gap:0.5rem;">
                <input type="password" id="gemini-api-key-input" class="study-textarea" style="min-height:44px; flex:1;"
                  placeholder="AIzaSy..." value="${apiKey}">
                <button class="btn btn-secondary" onclick="settingsView.togglePasswordVisibility()">
                  <i data-lucide="eye" id="api-eye-icon"></i>
                </button>
              </div>

              <!-- Model Selection Row -->
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem; padding:0.75rem 1rem; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                <div style="display:flex; flex-direction:column; gap:0.2rem;">
                  <span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Active Gemini Model</span>
                  <span style="font-size:0.75rem; color:var(--text-muted);">Auto-detected or manually chosen</span>
                </div>

                <select id="gemini-model-select" class="study-textarea" style="width:auto; min-height:36px; padding:0.25rem 0.75rem; font-size:0.85rem; font-weight:600;" onchange="settingsView.onModelSelect(this.value)">
                  <option value="gemini-2.5-flash" ${currentModel === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash (Recommended)</option>
                  <option value="gemini-2.0-flash" ${currentModel === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash</option>
                  <option value="gemini-1.5-flash" ${currentModel === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash</option>
                  <option value="gemini-1.5-flash-latest" ${currentModel === 'gemini-1.5-flash-latest' ? 'selected' : ''}>gemini-1.5-flash-latest</option>
                  <option value="gemini-2.5-pro" ${currentModel === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro</option>
                  <option value="gemini-1.5-pro" ${currentModel === 'gemini-1.5-pro' ? 'selected' : ''}>gemini-1.5-pro</option>
                </select>
              </div>

            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem;">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem; display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="external-link" style="width:14px;height:14px;"></i>
                <span>Get a free Gemini API key from Google AI Studio</span>
              </a>

              <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="settingsView.testApiKey()">
                  <i data-lucide="activity"></i>
                  <span>Test Connection</span>
                </button>
                <button class="btn btn-primary btn-sm" onclick="settingsView.saveApiKey()">
                  <i data-lucide="save"></i>
                  <span>Save Key</span>
                </button>
              </div>
            </div>
            
            <div id="api-test-result-box" style="margin-top:0.5rem; display:none;"></div>

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
                      <button class="btn btn-secondary btn-sm" onclick="settingsView.resetAiUsage()" title="Reset the counters">
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
                      Exact counts reported by the Gemini API. Daily totals reset at midnight.
                    </p>
                  ` : `
                    <p style="font-size:0.83rem; color:var(--text-muted); margin-top:0.5rem;">
                      No AI requests yet today. Usage will appear here once you generate something.
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
            <span class="badge badge-primary">8 Backgrounds • 6 Accents</span>
          </div>
          <p style="font-size:0.88rem; color:var(--text-secondary); margin-top:0.25rem;">
            Select a tailored background tone designed for long reading or night focus, then customize with your preferred accent colors.
          </p>
          
          <div style="margin-top:0.75rem;">
            <label style="font-size:0.88rem; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem;">
              <i data-lucide="palette" style="width:16px;height:16px;color:var(--color-primary-light);"></i>
              Background Theme Mode (8 Study Themes):
            </label>
            <div class="theme-modes-grid" style="margin-top:0.6rem;">
              ${backgroundThemes.map(theme => {
                const isActive = currentTheme === theme.id;
                return `
                  <div class="theme-mode-card ${isActive ? 'active' : ''}" onclick="settingsView.setThemeMode('${theme.id}')">
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
                  </div>
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
                <div class="palette-swatch-card ${currentPalette === pal.id ? 'active' : ''}" onclick="settingsView.setThemePalette('${pal.id}')">
                  <div class="swatch-color-pill" style="background:linear-gradient(135deg, ${pal.primary}, ${pal.accent});"></div>
                  <div>
                    <div style="font-weight:700; font-size:0.92rem; color:var(--text-main);">${pal.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${pal.id}</div>
                  </div>
                </div>
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
              <div class="select-chip ${currentFontSize === 'SMALL' ? 'active' : ''}" onclick="settingsView.setFontSize('SMALL')">
                Small (90%)
              </div>
              <div class="select-chip ${currentFontSize === 'DEFAULT' ? 'active' : ''}" onclick="settingsView.setFontSize('DEFAULT')">
                Default (100%)
              </div>
              <div class="select-chip ${currentFontSize === 'LARGE' ? 'active' : ''}" onclick="settingsView.setFontSize('LARGE')">
                Large (112%)
              </div>
              <div class="select-chip ${currentFontSize === 'EXTRA_LARGE' ? 'active' : ''}" onclick="settingsView.setFontSize('EXTRA_LARGE')">
                Extra Large (125%)
              </div>
            </div>
          </div>

          <div style="margin-top:0.75rem;">
            <label style="font-size:0.88rem; font-weight:600; color:var(--text-secondary);">Font Family Style:</label>
            <div class="chips-select-grid" style="margin-top:0.5rem;">
              <div class="select-chip ${currentFontFamily === 'DEFAULT' ? 'active' : ''}" onclick="settingsView.setFontFamily('DEFAULT')">
                Outfit & Inter (Modern EdTech)
              </div>
              <div class="select-chip ${currentFontFamily === 'SANS' ? 'active' : ''}" onclick="settingsView.setFontFamily('SANS')">
                Clean System Sans
              </div>
              <div class="select-chip ${currentFontFamily === 'SERIF' ? 'active' : ''}" onclick="settingsView.setFontFamily('SERIF')">
                Editorial Serif
              </div>
              <div class="select-chip ${currentFontFamily === 'ROUNDED' ? 'active' : ''}" onclick="settingsView.setFontFamily('ROUNDED')">
                Friendly Rounded
              </div>
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
            A backup includes <strong>all ${dbStats.totalRecords} records above</strong> plus your theme preferences and
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

      if (window.app) window.app.refreshIcons();
    } catch (err) {
      console.error('Error rendering settings view:', err);
      this.container.innerHTML = `
        <div class="card p-6 text-center" style="padding: 2rem; text-align: center;">
          <p style="color:var(--color-error); font-weight: 600;">Failed to load settings: ${err.message}</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="settingsView.render()">Retry</button>
        </div>
      `;
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('gemini-api-key-input');
    const icon = document.getElementById('api-eye-icon');
    if (input) {
      if (input.type === 'password') {
        input.type = 'text';
      } else {
        input.type = 'password';
      }
    }
  }

  saveApiKey() {
    const input = document.getElementById('gemini-api-key-input');
    const val = input ? input.value : '';
    window.geminiService.setApiKey(val);
    app.showToast('Gemini API key saved!', 'success');
    this.render();
  }

  onModelSelect(model) {
    window.geminiService.setActiveModel(model);
    app.showToast(`Selected model: ${model}`, 'info');
  }

  async testApiKey() {
    const input = document.getElementById('gemini-api-key-input');
    const val = input ? input.value : '';
    const box = document.getElementById('api-test-result-box');
    if (!box) return;

    box.style.display = 'block';
    box.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">Auto-discovering supported models on Google Gemini API...</span>`;

    const res = await window.geminiService.testApiKey(val);
    if (res.success) {
      box.innerHTML = `
        <div class="badge badge-success" style="width:100%; justify-content:center; padding:0.5rem;">
          ✓ ${res.message}
        </div>
      `;
      // Update model dropdown with active model and discovered models
      const modelSelect = document.getElementById('gemini-model-select');
      if (modelSelect) {
        if (res.availableModels && res.availableModels.length > 0) {
          modelSelect.innerHTML = res.availableModels.map(m => 
            `<option value="${m}" ${m === res.model ? 'selected' : ''}>${m}${m.includes('flash') ? ' (Recommended)' : ''}</option>`
          ).join('');
        } else if (res.model) {
          modelSelect.value = res.model;
        }
      }
    } else {
      box.innerHTML = `
        <div class="badge badge-error" style="width:100%; justify-content:center; padding:0.5rem; white-space:normal; line-height:1.4;">
          ✕ ${res.message}
        </div>
      `;
    }
  }

  setThemeMode(mode) {
    app.setThemeMode(mode);
    this.render();
  }

  setThemePalette(palette) {
    app.setThemePalette(palette);
    this.render();
  }

  setFontSize(size) {
    app.setFontSize(size);
    this.render();
  }

  setFontFamily(family) {
    app.setFontFamily(family);
    this.render();
  }

  resetAiUsage() {
    window.aiClient?.resetUsage?.();
    app.showToast('AI usage counters reset.', 'info');
    this.render();
  }

  setImportMode(mode) {
    this.importMode = mode === 'MERGE' ? 'MERGE' : 'REPLACE';
  }

  async handleExportBackup() {
    try {
      const summary = await exportDatabaseBackup();
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      app.showToast(`Backup exported — ${total} records saved to your Downloads folder.`, 'success');
      if (window.audioEngine) window.audioEngine.playSuccess();
    } catch (e) {
      app.showToast(`Export failed: ${e.message}`, 'error');
    }
  }

  async handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const mode = this.importMode === 'MERGE' ? 'MERGE' : 'REPLACE';
    const resetInput = () => { event.target.value = ''; };

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

    if (preview.totalRecords === 0) {
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
        `Created: ${exportedOn} (format v${preview.formatVersion})\n\n` +
        `Will restore ${preview.totalRecords} records:\n${contents}\n` +
        (preview.hasProfile ? '  • Student academic profile\n' : '') +
        (preview.preferenceCount ? `  • ${preview.preferenceCount} preference setting(s)\n` : '') +
        (skipped > 0 ? `\n${skipped} invalid record(s) will be skipped.\n` : '') +
        `\n${modeLine}\n\n` +
        'If anything goes wrong, your current data is automatically restored.',
      confirmText: mode === 'MERGE' ? 'Merge Now' : 'Replace Now',
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
      onConfirm: async () => {
        try {
          const removed = await clearDatabase();
          const total = Object.values(removed).reduce((a, b) => a + b, 0);
          app.showToast(`All local data reset — ${total} records removed.`, 'info');
        } catch (e) {
          app.showToast(`Reset failed: ${e.message}`, 'error');
        }
        this.render();
      }
    });
  }
}

window.settingsView = new SettingsView();
