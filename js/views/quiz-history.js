/**
 * HAMSA VIDYA (हंस विद्या) — Quiz History View Controller
 * Chronological timeline of all completed quiz attempts with search, sort, delete, export & retake actions.
 */

class QuizHistoryView {
  constructor() {
    this.container = document.getElementById('view-quiz-history');
    this.searchQuery = '';
    this.selectedSort = 'NEWEST';
    this.selectedIds = new Set();
  }

  async render() {
    this.container = document.getElementById('view-quiz-history');
    if (!this.container) return;

    // One row per ATTEMPT, not per quiz — retaking a quiz now adds an entry
    // instead of overwriting the previous one.
    const allHistory = await getAttemptHistory().catch(() => []);

    // Filter by search
    const qTerm = (this.searchQuery || '').toLowerCase().trim();
    let filteredHistory = allHistory.filter(q => {
      if (!qTerm) return true;
      return (q.title || '').toLowerCase().includes(qTerm) ||
             (q.subject || '').toLowerCase().includes(qTerm);
    });

    // Sort
    if (this.selectedSort === 'NEWEST') {
      filteredHistory.sort((a, b) => new Date(b.attemptedAt) - new Date(a.attemptedAt));
    } else if (this.selectedSort === 'OLDEST') {
      filteredHistory.sort((a, b) => new Date(a.attemptedAt) - new Date(b.attemptedAt));
    } else if (this.selectedSort === 'HIGHEST') {
      filteredHistory.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    } else if (this.selectedSort === 'LOWEST') {
      filteredHistory.sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
    }

    const totalAttempts = allHistory.length;
    const avgScore = totalAttempts > 0
      ? Math.round(allHistory.reduce((sum, q) => sum + (q.percentage || 0), 0) / totalAttempts)
      : 0;
    const bestScore = totalAttempts > 0
      ? Math.max(...allHistory.map(q => q.percentage || 0))
      : 0;

    // The three chips that used to sit in their own glass panel below the
    // header now live inside the hero, where they are the headline.
    const subjectsAttempted = new Set(allHistory.map(a => a.subject).filter(Boolean)).size;

    const heroHtml = UIUtils.buildViewHero({
      accent: 'indigo',
      icon: 'history',
      eyebrow: 'Attempt Log',
      title: 'Every attempt,',
      titleAccent: 'permanently recorded.',
      hindi: 'अभ्यास इतिहास — प्रत्येक प्रयास सुरक्षित',
      tagline: 'One row per attempt, not per quiz — retaking something adds an entry instead of overwriting the last one, so your progress over time stays visible.',
      stats: [
        { value: totalAttempts, label: 'Total attempts' },
        { value: `${avgScore}%`, label: 'Average score' },
        { value: `${bestScore}%`, label: 'Personal best' },
        { value: subjectsAttempted, label: 'Subjects' }
      ],
      actions: [
        { label: 'Create New Quiz', icon: 'plus', onclick: "app.navigate('create-quiz')" },
        { label: 'Open Library', icon: 'library', onclick: "app.navigate('library')", variant: 'ghost' }
      ]
    });

    this.container.innerHTML = `
      <div class="page-column">
        ${heroHtml}

        <!-- Search & Sort Toolbar -->
        <div class="glass-panel" style="padding:1rem 1.25rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px; position:relative;">
            <input type="text" class="study-textarea" style="min-height:42px; padding:0.4rem 0.85rem 0.4rem 2.2rem;"
              placeholder="Search by title or subject..." value="${SecurityUtils.escapeHtml(this.searchQuery)}" oninput="quizHistoryView.onSearchChange(this.value)">
            <i data-lucide="search" style="position:absolute; left:10px; top:12px; width:16px; height:16px; color:var(--text-muted);"></i>
          </div>

          <select class="study-textarea" style="width:auto; min-height:42px; padding:0.4rem 1rem; cursor:pointer;" onchange="quizHistoryView.onSortChange(this.value)">
            <option value="NEWEST" ${this.selectedSort === 'NEWEST' ? 'selected' : ''}>Newest First</option>
            <option value="OLDEST" ${this.selectedSort === 'OLDEST' ? 'selected' : ''}>Oldest First</option>
            <option value="HIGHEST" ${this.selectedSort === 'HIGHEST' ? 'selected' : ''}>Highest Score</option>
            <option value="LOWEST" ${this.selectedSort === 'LOWEST' ? 'selected' : ''}>Lowest Score</option>
          </select>

          ${this.selectedIds.size > 0 ? `
            <button class="btn btn-danger btn-sm" onclick="quizHistoryView.deleteSelected()">
              <i data-lucide="trash-2"></i>
              <span>Delete (${this.selectedIds.size})</span>
            </button>
          ` : ''}
        </div>

        <!-- History List -->
        <div class="quiz-cards-list">
          ${filteredHistory.length === 0 ? `
            <div class="glass-panel" style="padding:3rem 2rem; text-align:center;">
              <div style="width:64px;height:64px;border-radius:50%;background:var(--color-primary-glow);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem auto;color:var(--color-primary-light);">
                <i data-lucide="history" style="width:32px;height:32px;"></i>
              </div>
              <h3 style="font-size:1.25rem; font-weight:700; margin-bottom:0.5rem;">
                ${qTerm ? 'No matching attempts found' : 'No quiz history yet'}
              </h3>
              <p style="color:var(--text-secondary); max-width:420px; margin:0 auto 1.25rem auto;">
                ${qTerm ? 'Try a different search term.' : 'Complete your first quiz to see your performance history here.'}
              </p>
              ${!qTerm ? `
                <button class="btn btn-primary" onclick="app.navigate('create-quiz')">
                  <i data-lucide="sparkles"></i>
                  <span>Generate AI Quiz</span>
                </button>
              ` : `
                <button class="btn btn-secondary" onclick="quizHistoryView.onSearchChange('')">
                  <span>Clear Search</span>
                </button>
              `}
            </div>
          ` : filteredHistory.map(q => {
            const scoreColor = (q.percentage || 0) >= 70 ? 'badge-success' : (q.percentage || 0) >= 40 ? 'badge-warning' : 'badge-error';
            const completedDate = q.attemptedAt ? new Date(q.attemptedAt) : null;
            const dateStr = completedDate ? completedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const timeStr = completedDate ? completedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
            const durationMin = q.durationSeconds ? Math.ceil(q.durationSeconds / 60) : 0;
            const isSelected = this.selectedIds.has(q.id);

            return `
              <div class="quiz-list-item" style="${isSelected ? 'border-color:var(--color-primary-light); background:var(--bg-card-hover);' : ''}">
                <div style="display:flex; align-items:flex-start; gap:0.75rem; flex:1; min-width:0;">
                  <!-- Select Checkbox -->
                  <label style="display:flex; align-items:center; cursor:pointer; margin-top:0.2rem;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="quizHistoryView.toggleSelect(${q.id})"
                      style="width:18px;height:18px;accent-color:var(--color-primary);cursor:pointer;">
                  </label>

                  <div class="quiz-info" style="min-width:0;">
                    <div class="quiz-item-title">${SecurityUtils.escapeHtml(q.title)}</div>
                    <div class="quiz-meta-row" style="flex-wrap:wrap;">
                      <span class="badge badge-primary">${SecurityUtils.escapeHtml(q.subject || 'General')}</span>
                      <span class="badge badge-muted">${SecurityUtils.escapeHtml(q.difficulty || 'MEDIUM')}</span>
                      <span class="badge ${scoreColor}">Score: ${q.percentage || 0}%</span>
                      ${q.totalAttempts > 1 ? `<span class="badge badge-muted" title="This quiz has been attempted ${q.totalAttempts} times">Attempt ${q.attemptNumber} of ${q.totalAttempts}</span>` : ''}
                      ${q.maxMarks != null ? `<span title="Marks obtained out of total">${q.marksObtained}/${q.maxMarks} marks</span>` : ''}
                      ${q.marksLostToNegative > 0 ? `<span style="color:var(--color-error);" title="Deducted by negative marking">−${q.marksLostToNegative}</span>` : ''}
                      <span>${q.correct || 0}✓ ${q.incorrect || 0}✗ ${q.skipped || 0}⊘</span>
                      <span>${q.totalQuestions || 0} Qs</span>
                      ${durationMin > 0 ? `<span>⏱ ${durationMin} min</span>` : ''}
                      <span>📅 ${dateStr} ${timeStr}</span>
                    </div>
                  </div>
                </div>

                <div class="quiz-item-actions" style="flex-shrink:0; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" onclick="app.viewQuizResult(${q.id})" title="View Detailed Results">
                    <i data-lucide="bar-chart"></i>
                    <span>Results</span>
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="app.startQuiz(${q.id})" title="Retake This Quiz">
                    <i data-lucide="refresh-cw"></i>
                    <span>Retake</span>
                  </button>
                  <button class="icon-btn" title="Export as PDF" onclick="app.exportQuizPdf(${q.id})">
                    <i data-lucide="file-down" style="width:18px;height:18px;"></i>
                  </button>
                  <button class="icon-btn" title="Delete this quiz and all ${q.totalAttempts} of its attempts" onclick="quizHistoryView.deleteSingle(${q.id})" style="color:var(--color-error);">
                    <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (window.app) window.app.refreshIcons();
  }

  // Search
  onSearchChange(val) {
    this.searchQuery = val;
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this.render(), 250);
  }

  // Sort
  onSortChange(val) {
    this.selectedSort = val;
    this.render();
  }

  // Selection
  toggleSelect(quizId) {
    if (this.selectedIds.has(quizId)) {
      this.selectedIds.delete(quizId);
    } else {
      this.selectedIds.add(quizId);
    }
    this.render();
  }

  // Delete single quiz with confirmation
  deleteSingle(quizId) {
    app.showConfirmation({
      title: 'Delete Quiz Attempt?',
      message: 'This will permanently delete this quiz and all its associated questions, bookmarks, and attempt records. This cannot be undone.',
      confirmText: 'Delete Permanently',
      onConfirm: async () => {
        try {
          await deleteQuiz(quizId);
          this.selectedIds.delete(quizId);
          app.showToast('Quiz attempt deleted successfully.', 'success');
          this.render();
        } catch (e) {
          app.showToast(`Delete failed: ${e.message}`, 'error');
        }
      }
    });
  }

  // Bulk delete selected quizzes
  deleteSelected() {
    const count = this.selectedIds.size;
    if (count === 0) return;

    app.showConfirmation({
      title: `Delete ${count} Quiz Attempt${count > 1 ? 's' : ''}?`,
      message: `This will permanently delete ${count} selected quiz${count > 1 ? 'zes' : ''} and all associated data. This cannot be undone.`,
      confirmText: `Delete ${count} Quiz${count > 1 ? 'zes' : ''}`,
      onConfirm: async () => {
        try {
          const idsToDelete = [...this.selectedIds];
          for (const id of idsToDelete) {
            await deleteQuiz(id);
          }
          this.selectedIds.clear();
          app.showToast(`${count} quiz attempt${count > 1 ? 's' : ''} deleted.`, 'success');
          this.render();
        } catch (e) {
          app.showToast(`Bulk delete failed: ${e.message}`, 'error');
        }
      }
    });
  }
}

window.quizHistoryView = new QuizHistoryView();
