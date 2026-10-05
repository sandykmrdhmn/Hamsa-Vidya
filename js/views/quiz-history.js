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
    this.page=0;
  }

  async render() {
    this.container = document.getElementById('view-quiz-history');
    if (!this.container) return;

    const version=this._renderVersion=(this._renderVersion||0)+1;
    // One row per ATTEMPT, not per quiz — retaking a quiz now adds an entry
    // instead of overwriting the previous one.
    let allHistory;
    try { allHistory = await getAttemptHistory(); }
    catch (error) {
      if(version!==this._renderVersion) return;
      this.container.innerHTML='<div class="glass-panel quiz-preview-header" role="alert"><h2>Quiz history could not be loaded</h2><p>Your saved attempts have not been deleted. Retry when browser storage is available.</p><button type="button" class="btn btn-primary" onclick="quizHistoryView.render()">Retry</button></div>';
      app.refreshIcons();return;
    }
    if(version!==this._renderVersion) return;

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

    const focused=document.activeElement?.id==='quiz-history-search';const start=document.activeElement?.selectionStart,end=document.activeElement?.selectionEnd;
    this.page=Math.min(this.page,Math.max(0,Math.ceil(filteredHistory.length/20)-1));
    this.container.innerHTML = `
      <div class="page-column">
        ${heroHtml}

        <!-- Search & Sort Toolbar -->
        <div class="glass-panel" style="padding:1rem 1.25rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px; position:relative;">
            <input id="quiz-history-search" type="text" class="study-textarea" style="min-height:42px; padding:0.4rem 0.85rem 0.4rem 2.2rem;"
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

        <div class="quiz-pagination"><button class="btn btn-secondary btn-sm" ${this.page===0?'disabled':''} onclick="quizHistoryView.page--;quizHistoryView.render()">Previous</button><span>${filteredHistory.length} attempts · Page ${this.page+1}/${Math.max(1,Math.ceil(filteredHistory.length/20))}</span><button class="btn btn-secondary btn-sm" ${(this.page+1)*20>=filteredHistory.length?'disabled':''} onclick="quizHistoryView.page++;quizHistoryView.render()">Next</button></div>
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
          ` : filteredHistory.slice(this.page*20,this.page*20+20).map(q => {
            const key=q.attemptId?`attempt:${Number(q.attemptId)}`:`legacy:${Number(q.id)}`;
            const scoreColor = (q.percentage || 0) >= 70 ? 'badge-success' : (q.percentage || 0) >= 40 ? 'badge-warning' : 'badge-error';
            const completedDate = q.attemptedAt ? new Date(q.attemptedAt) : null;
            const dateStr = completedDate ? completedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const timeStr = completedDate ? completedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
            const durationMin = q.durationSeconds ? Math.ceil(q.durationSeconds / 60) : 0;
            const isSelected = this.selectedIds.has(key);

            return `
              <div class="quiz-list-item" style="${isSelected ? 'border-color:var(--color-primary-light); background:var(--bg-card-hover);' : ''}">
                <div style="display:flex; align-items:flex-start; gap:0.75rem; flex:1; min-width:0;">
                  <!-- Select Checkbox -->
                  <label style="display:flex; align-items:center; cursor:pointer; margin-top:0.2rem;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="quizHistoryView.toggleSelect('${key}')"
                      style="width:18px;height:18px;accent-color:var(--color-primary);cursor:pointer;">
                  </label>

                  <div class="quiz-info" style="min-width:0;">
                    <div class="quiz-item-title">${SecurityUtils.escapeHtml(q.title)}</div>
                    <div class="quiz-meta-row" style="flex-wrap:wrap;">
                      <span class="badge badge-primary">${SecurityUtils.escapeHtml(q.subject || 'General')}</span>
                      <span class="badge badge-muted">${SecurityUtils.escapeHtml(q.difficulty || 'MEDIUM')}</span>
                      <span class="badge ${scoreColor}">Score: ${Number(q.percentage)||0}%</span>
                      ${q.totalAttempts > 1 ? `<span class="badge badge-muted" title="This quiz has been attempted ${Number(q.totalAttempts)||0} times">Attempt ${Number(q.attemptNumber)||0} of ${Number(q.totalAttempts)||0}</span>` : ''}
                      ${q.maxMarks != null ? `<span title="Marks obtained out of total">${Number(q.marksObtained)||0}/${Number(q.maxMarks)||0} marks</span>` : ''}
                      ${q.marksLostToNegative > 0 ? `<span style="color:var(--color-error);" title="Deducted by negative marking">−${Number(q.marksLostToNegative)||0}</span>` : ''}
                      <span>${Number(q.correct)||0}✓ ${Number(q.incorrect)||0}✗ ${Number(q.skipped)||0}⊘</span>
                      <span>${Number(q.totalQuestions)||0} Qs</span>
                      ${durationMin > 0 ? `<span>⏱ ${durationMin} min</span>` : ''}
                      <span>📅 ${dateStr} ${timeStr}</span>
                    </div>
                  </div>
                </div>

                <div class="quiz-item-actions" style="flex-shrink:0; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" onclick="app.viewQuizResult(${Number(q.id)},true,${q.attemptId?Number(q.attemptId):'null'})" title="View Detailed Results">
                    <i data-lucide="bar-chart"></i>
                    <span>Results</span>
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="app.startQuiz(${Number(q.id)})" title="Retake This Quiz">
                    <i data-lucide="refresh-cw"></i>
                    <span>Retake</span>
                  </button>
                  <button class="icon-btn" title="Export as PDF" onclick="app.exportQuizPdf(${Number(q.id)},'FULL',${q.attemptId?Number(q.attemptId):'null'})">
                    <i data-lucide="file-down" style="width:18px;height:18px;"></i>
                  </button>
                  <button class="icon-btn" title="Delete only this attempt" onclick="quizHistoryView.deleteSingle('${key}')" style="color:var(--color-error);">
                    <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if(focused){const input=document.getElementById('quiz-history-search');input?.focus();input?.setSelectionRange(start,end);}
    if (window.app) window.app.refreshIcons();
  }

  // Search
  onSearchChange(val) {
    this.searchQuery = val;this.page=0;this._renderVersion=(this._renderVersion||0)+1;
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this.render(), 250);
  }

  // Sort
  onSortChange(val) {
    this.selectedSort = val;this.page=0;
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
      message: 'This removes only this attempt record. The quiz, questions and bookmarks remain in your library.',
      confirmText: 'Delete Permanently',
      onConfirm: async () => {
        try {
          await deleteQuizAttempts([quizId]);
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
      message: `Remove ${count} selected attempt records? Quizzes and bookmarks remain in your library.`,
      confirmText: `Delete ${count} attempts`,
      onConfirm: async () => {
        try {
          const idsToDelete = [...this.selectedIds];
          await deleteQuizAttempts(idsToDelete);
          this.selectedIds.clear();
          app.showToast(`${count} quiz attempt${count > 1 ? 's' : ''} deleted.`, 'success');
          this.render();
        } catch (e) {
          app.showToast(`Bulk delete failed: ${e.message}`, 'error');
        }
      }
    });
  }
  onLeaveView(){this._renderVersion=(this._renderVersion||0)+1;clearTimeout(this._debounce);}
}

window.quizHistoryView = new QuizHistoryView();
