import re

file_path = "f:/AI Projects/Hamsa Vidya Website/js/views/ai-teacher.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add advancedModes to constructor
if "this.advancedModes" not in content:
    content = re.sub(
        r"this\.isProcessingPdf = false;",
        "this.isProcessingPdf = false;\n    this.advancedModes = {\n      socratic: false,\n      teachBack: false,\n      mindmap: false,\n      debate: false,\n      connections: false\n    };",
        content
    )

# 2. Add toggleAdvancedMode function
if "toggleAdvancedMode(" not in content:
    toggle_func = """
  toggleAdvancedMode(mode, isActive) {
    if (this.advancedModes && this.advancedModes.hasOwnProperty(mode)) {
      this.advancedModes[mode] = isActive;
    }
  }
"""
    content = re.sub(
        r"setMode\(mode\) \{",
        toggle_func.lstrip() + "\n  setMode(mode) {",
        content
    )

# 3. Add UI switches HTML right after teacher-controls-grid
ui_html = """
        <!-- Advanced Mentorship Tools Switches -->
        <div class="advanced-tools-panel" style="margin-bottom: 1.5rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;">
          <div class="adv-tools-header" style="padding: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-weight: 600; color: var(--color-text-main);" onclick="document.getElementById('adv-tools-body').classList.toggle('active')">
            <div style="display:flex; align-items:center; gap: 8px;">
              <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--color-gold);"></i> 
              <span>Advanced Mentorship Modes (Optional)</span>
            </div>
            <i data-lucide="chevron-down" style="width:16px;height:16px; transition: transform 0.3s;"></i>
          </div>
          <div class="adv-tools-body" id="adv-tools-body" style="display: none; padding: 0 1rem 1rem 1rem;">
            <style>
              .adv-tools-body.active { display: flex !important; flex-wrap: wrap; gap: 1rem; }
              .adv-switch-card { display: flex; align-items: center; gap: 10px; background: var(--color-bg); border: 1px solid var(--color-border); padding: 0.75rem; border-radius: var(--radius-md); cursor: pointer; flex: 1 1 calc(50% - 1rem); min-width: 200px; transition: all 0.2s; }
              .adv-switch-card:hover { border-color: var(--color-primary-light); }
              .adv-switch-card input { display: none; }
              .adv-switch-content { flex: 1; display: flex; flex-direction: column; }
              .adv-switch-content strong { font-size: 0.9rem; color: var(--color-text-main); }
              .adv-switch-content small { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px; }
              .adv-toggle { width: 34px; height: 18px; background: var(--color-border-hover); border-radius: 10px; position: relative; transition: 0.3s; flex-shrink:0; }
              .adv-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: white; border-radius: 50%; transition: 0.3s; }
              .adv-switch-card input:checked ~ .adv-toggle { background: var(--color-primary); }
              .adv-switch-card input:checked ~ .adv-toggle::after { left: 18px; }
              .adv-switch-card input:checked ~ .adv-switch-content strong { color: var(--color-primary); }
            </style>
            
            <label class="adv-switch-card">
              <input type="checkbox" onchange="window.aiTeacherView.toggleAdvancedMode('socratic', this.checked)" ${this.advancedModes.socratic ? 'checked' : ''}>
              <div class="adv-switch-content">
                <strong>🧠 Socratic Tutor</strong>
                <small>Active recall & guiding hints</small>
              </div>
              <div class="adv-toggle"></div>
            </label>
            <label class="adv-switch-card">
              <input type="checkbox" onchange="window.aiTeacherView.toggleAdvancedMode('debate', this.checked)" ${this.advancedModes.debate ? 'checked' : ''}>
              <div class="adv-switch-content">
                <strong>⚔️ Debate AI</strong>
                <small>Challenges your perspective</small>
              </div>
              <div class="adv-toggle"></div>
            </label>
            <label class="adv-switch-card">
              <input type="checkbox" onchange="window.aiTeacherView.toggleAdvancedMode('mindmap', this.checked)" ${this.advancedModes.mindmap ? 'checked' : ''}>
              <div class="adv-switch-content">
                <strong>🕸️ Mind Maps</strong>
                <small>Interactive connection graphs</small>
              </div>
              <div class="adv-toggle"></div>
            </label>
            <label class="adv-switch-card">
              <input type="checkbox" onchange="window.aiTeacherView.toggleAdvancedMode('connections', this.checked)" ${this.advancedModes.connections ? 'checked' : ''}>
              <div class="adv-switch-content">
                <strong>🔗 Hamsa Connections</strong>
                <small>Cross-disciplinary wisdom</small>
              </div>
              <div class="adv-toggle"></div>
            </label>
            <label class="adv-switch-card">
              <input type="checkbox" onchange="window.aiTeacherView.toggleAdvancedMode('teachBack', this.checked)" ${this.advancedModes.teachBack ? 'checked' : ''}>
              <div class="adv-switch-content">
                <strong>🎙️ Teach It Back</strong>
                <small>Feynman technique testing</small>
              </div>
              <div class="adv-toggle"></div>
            </label>
          </div>
        </div>
"""
if "Advanced Mentorship Tools Switches" not in content:
    content = content.replace(
        "        </div>\n\n        <!-- Input Actions Toolbar -->",
        "        </div>\n\n" + ui_html + "\n        <!-- Input Actions Toolbar -->"
    )

# 4. Pass advancedModes to the service in handleExplain()
if "advancedModes:" not in content:
    content = re.sub(
        r"imageFile: file,",
        "imageFile: file,\n        advancedModes: this.advancedModes,",
        content
    )
    content = re.sub(
        r"pdfContext: pdfTextToInject",
        "pdfContext: pdfTextToInject,\n        advancedModes: this.advancedModes",
        content
    )

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated ai-teacher.js UI.")

