import re

file_path = "f:/AI Projects/Hamsa Vidya Website/js/views/ai-teacher.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Inject the Mermaid rendering call inside the _updateResultsDOM method or whatever updates the DOM.
# The user's code previously called window.lucide.createIcons(). I should find where innerHTML is set.
# Looking for: document.getElementById('teacher-results-container').innerHTML = ...
if "window.mermaid" not in content and "mermaid.init" not in content:
    # Actually, we can just put a setTimeout inside _buildResponseHTML or call it where createIcons is called.
    # We don't have the exact method context easily. Let's see if there's a handleExplain or similar.
    # Usually in _updateResultsDOM or render(). We know togglePracticeAnswer has lucide.createIcons.
    pass

# Let's inject the HTML blocks into _buildResponseHTML
# We will inject these using re.sub
mermaid_html = """
          ${exp.mermaidMindmap ? `
            <div class="info-card">
              <h4 class="card-heading"><i data-lucide="network" style="width:16px;height:16px;color:var(--color-primary);"></i> Concept Mind Map</h4>
              <div class="mermaid" style="background: white; padding: 1rem; border-radius: var(--radius-md); text-align: center; overflow-x: auto;">
                ${exp.mermaidMindmap}
              </div>
            </div>
          ` : ''}
"""

hamsa_conn_html = """
        ${exp.hamsaConnections ? `
          <details class="collapsible-section">
            <summary class="collapse-summary">
              <span><i data-lucide="link-2" style="width:16px;height:16px;color:var(--color-primary);"></i> Hamsa Connections (Cross-Disciplinary)</span>
              <i data-lucide="chevron-down" class="collapse-chevron"></i>
            </summary>
            <div class="collapse-content">
              <div class="mistakes-trick-row" style="grid-template-columns: 1fr;">
                ${Object.entries(exp.hamsaConnections).map(([subject, detail]) => `
                  <div class="info-card">
                    <h4 class="card-heading" style="text-transform: capitalize;">${subject}</h4>
                    <p class="card-text">${detail}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </details>
        ` : ''}
"""

teach_back_html = """
        ${exp.teachBackChallenge ? `
          <div class="info-card" style="margin-top: 1.5rem; background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--color-success);">
            <h4 class="card-heading"><i data-lucide="mic" style="width:16px;height:16px;color:var(--color-success);"></i> Teach It Back To Me (Feynman Technique)</h4>
            <p class="card-text"><strong>Challenge:</strong> ${exp.teachBackChallenge}</p>
            <button class="primary-btn" style="margin-top: 1rem; width: auto; padding: 0.5rem 1rem;" onclick="alert('Teach back feature activated! In the full version, you will record your audio here.')">
              Start Teaching
            </button>
          </div>
        ` : ''}
"""

# Inject mindmap after flowchart
if "exp.mermaidMindmap" not in content:
    content = content.replace(
        "${exp.flowchart ? `",
        mermaid_html + "          ${exp.flowchart ? `"
    )

# Inject connections and teachback after sources
if "exp.hamsaConnections" not in content:
    content = content.replace(
        "        <!-- End Optional Context -->",
        hamsa_conn_html + "\n" + teach_back_html + "\n        <!-- End Optional Context -->"
    )

# Find where HTML is set to the DOM to initialize Mermaid
if "window.mermaid && mermaid.init" not in content:
    content = content.replace(
        "if (window.lucide) window.lucide.createIcons();",
        "if (window.lucide) window.lucide.createIcons();\n    if (window.mermaid) { setTimeout(() => { try { mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch(e){} }, 100); }"
    )

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Injected HTML template modifications for new features.")
