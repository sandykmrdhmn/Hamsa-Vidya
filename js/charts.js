/**
 * HAMSA VIDYA (हंस विद्या) — Visual Analytics Charts (Pure SVG, Responsive, Zero-Dependency)
 */

class HamsaCharts {
  /**
   * Renders the Accuracy Donut Chart (Correct vs Incorrect vs Skipped)
   */
  static renderDonutChart(containerId, { correct = 0, incorrect = 0, skipped = 0 }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const total = correct + incorrect + skipped;
    if (total === 0) {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--text-muted); font-size:0.88rem; gap:0.5rem;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span>Take a quiz to unlock accuracy analytics</span>
        </div>
      `;
      return;
    }

    const accuracyPct = Math.round((correct / (correct + incorrect || 1)) * 100);
    const radius = 64;
    const circumference = 2 * Math.PI * radius;

    const correctOffset = 0;
    const correctDash = (correct / total) * circumference;

    const incorrectOffset = -correctDash;
    const incorrectDash = (incorrect / total) * circumference;

    const skippedOffset = -(correctDash + incorrectDash);
    const skippedDash = (skipped / total) * circumference;

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:1.25rem; width:100%;">
        <div style="position:relative; width:170px; height:170px;">
          <svg width="170" height="170" viewBox="0 0 170 170" style="transform:rotate(-90deg);">
            <!-- Background circle -->
            <circle cx="85" cy="85" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="16" />

            <!-- Correct slice (Emerald) -->
            ${correct > 0 ? `
              <circle cx="85" cy="85" r="${radius}" fill="none" stroke="var(--color-success)" stroke-width="16"
                stroke-dasharray="${correctDash} ${circumference}"
                stroke-dashoffset="${correctOffset}"
                stroke-linecap="round"
                style="transition: stroke-dasharray 1s ease;" />
            ` : ''}

            <!-- Incorrect slice (Crimson) -->
            ${incorrect > 0 ? `
              <circle cx="85" cy="85" r="${radius}" fill="none" stroke="var(--color-error)" stroke-width="16"
                stroke-dasharray="${incorrectDash} ${circumference}"
                stroke-dashoffset="${incorrectOffset}"
                stroke-linecap="round"
                style="transition: stroke-dasharray 1s ease;" />
            ` : ''}

            <!-- Skipped slice (Muted Amber) -->
            ${skipped > 0 ? `
              <circle cx="85" cy="85" r="${radius}" fill="none" stroke="var(--color-warning)" stroke-width="16"
                stroke-dasharray="${skippedDash} ${circumference}"
                stroke-dashoffset="${skippedOffset}"
                stroke-linecap="round"
                style="transition: stroke-dasharray 1s ease;" />
            ` : ''}
          </svg>

          <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <span style="font-size:1.85rem; font-weight:800; font-family:var(--font-family-display); color:var(--text-main); line-height:1;">${accuracyPct}%</span>
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Accuracy</span>
          </div>
        </div>

        <div style="display:flex; justify-content:center; gap:1.25rem; font-size:0.82rem; font-weight:600;">
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span style="width:10px; height:10px; border-radius:50%; background:var(--color-success);"></span>
            <span>Correct (${correct})</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span style="width:10px; height:10px; border-radius:50%; background:var(--color-error);"></span>
            <span>Incorrect (${incorrect})</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span style="width:10px; height:10px; border-radius:50%; background:var(--color-warning);"></span>
            <span>Skipped (${skipped})</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Performance Trend Line Chart (Last 10 Quizzes)
   */
  static renderTrendLineChart(containerId, trendData = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!trendData || trendData.length === 0) {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--text-muted); font-size:0.88rem; gap:0.5rem;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span>Complete your first quiz to generate performance trends</span>
        </div>
      `;
      return;
    }

    const width = 460;
    const height = 190;
    const paddingLeft = 35;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Calculate coordinates
    const numPoints = trendData.length;
    const stepX = numPoints > 1 ? plotWidth / (numPoints - 1) : plotWidth / 2;

    const points = trendData.map((d, i) => {
      const x = numPoints > 1 ? paddingLeft + (i * stepX) : paddingLeft + (plotWidth / 2);
      // Clamp for plotting only. Negative marking can produce a genuinely
      // negative percentage, which would otherwise draw outside the viewBox.
      // The tooltip below still reports the true value.
      const plotted = Math.max(0, Math.min(100, Number(d.percentage) || 0));
      const y = paddingTop + plotHeight - ((plotted / 100) * plotHeight);
      return { x, y, percentage: d.percentage, label: d.label, title: d.title };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      // Smooth curve calculation
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      pathD += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    // Area fill path
    const areaD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + plotHeight} L ${points[0].x} ${paddingTop + plotHeight} Z`;

    const dotsSvg = points.map((p) => `
      <g class="chart-point" style="cursor:pointer;">
        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#FFFFFF" stroke="var(--color-primary)" stroke-width="2.5" />
        <title>${p.title}: ${p.percentage}%</title>
      </g>
    `).join('');

    const labelsSvg = points.map((p, i) => `
      <text x="${p.x}" y="${height - 8}" font-size="10" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-family-body)">${p.label}</text>
    `).join('');

    container.innerHTML = `
      <div style="width:100%; overflow-x:auto;">
        <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; min-width:320px;">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-primary-light)" stop-opacity="0.35" />
              <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.0" />
            </linearGradient>
          </defs>

          <!-- Grid Lines -->
          <line x1="${paddingLeft}" y1="${paddingTop}" x2="${width - paddingRight}" y2="${paddingTop}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3 3" />
          <line x1="${paddingLeft}" y1="${paddingTop + plotHeight / 2}" x2="${width - paddingRight}" y2="${paddingTop + plotHeight / 2}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3 3" />
          <line x1="${paddingLeft}" y1="${paddingTop + plotHeight}" x2="${width - paddingRight}" y2="${paddingTop + plotHeight}" stroke="var(--border-subtle)" stroke-width="1" />

          <!-- Y-axis labels -->
          <text x="${paddingLeft - 8}" y="${paddingTop + 4}" font-size="9" text-anchor="end" fill="var(--text-muted)">100%</text>
          <text x="${paddingLeft - 8}" y="${paddingTop + plotHeight / 2 + 3}" font-size="9" text-anchor="end" fill="var(--text-muted)">50%</text>
          <text x="${paddingLeft - 8}" y="${paddingTop + plotHeight + 3}" font-size="9" text-anchor="end" fill="var(--text-muted)">0%</text>

          <!-- Gradient Area -->
          <path d="${areaD}" fill="url(#trendGradient)" />

          <!-- Line Curve -->
          <path d="${pathD}" fill="none" stroke="var(--color-primary-light)" stroke-width="3" stroke-linecap="round" />

          <!-- Points -->
          ${dotsSvg}

          <!-- X-Axis Labels -->
          ${labelsSvg}
        </svg>
      </div>
    `;
  }

  /**
   * Renders the Subject Mastery Bar Chart
   */
  static renderSubjectMasteryChart(containerId, subjectData = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!subjectData || subjectData.length === 0) {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:180px; color:var(--text-muted); font-size:0.88rem; gap:0.5rem;">
          <span>No subject analytics recorded yet</span>
        </div>
      `;
      return;
    }

    const rowsHtml = subjectData.map(item => `
      <div style="display:flex; flex-direction:column; gap:0.35rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.86rem;">
          <span style="font-weight:600; color:var(--text-main);">${item.subject}</span>
          <span style="font-weight:700; color:var(--color-primary-light);">${item.accuracy}% (${item.questionsAttempted} Qs)</span>
        </div>
        <div style="width:100%; height:8px; background:var(--border-subtle); border-radius:var(--radius-full); overflow:hidden;">
          <div style="width:${item.accuracy}%; height:100%; background:var(--gradient-brand); border-radius:var(--radius-full); transition:width 0.8s ease;"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem; width:100%; padding:0.25rem 0;">
        ${rowsHtml}
      </div>
    `;
  }
}

window.HamsaCharts = HamsaCharts;
