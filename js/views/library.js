/**
 * HAMSA VIDYA (हंस विद्या) — Library & Saved Knowledge Base Controller
 * Dynamic Tabs: Tab 1 (All Quizzes with search/sort/filter) & Tab 2 (Saved Bookmarks with dynamic practice CTA)
 */

class LibraryView {
  constructor() {
    this.container = document.getElementById('view-library');
    this.activeTab = 'QUIZZES'; // 'QUIZZES' or 'BOOKMARKS'
    
    // Search & Filter State
    this.searchQuery = '';
    this.selectedDifficulty = 'ALL';
    this.selectedSort = 'NEWEST';
    this.revealedBookmarkIds = new Set();

    // Saved-questions subject switch. 'ALL' shows every subject, grouped under
    // its own heading; any other value narrows to that one subject.
    this.bookmarkSubject = 'ALL';
  }

  async render(initialTab) {
    if (initialTab) {
      this.activeTab = initialTab.toUpperCase();
    }
    if (!this.container) return;

    const allQuizzes = await getAllQuizzes();
    const bookmarks = await getBookmarkedQuestions();

    // Subject buckets for the saved-questions switch. Derived from the same
    // helper the sections render from, so a chip's count can never disagree
    // with the number of cards it reveals.
    const bookmarkGroups = groupBookmarksBySubject(bookmarks);

    // A subject the user had selected can disappear — they removed its last
    // bookmark, or deleted the parent quiz. Falling back to ALL avoids an empty
    // screen with an active filter the chips no longer offer.
    if (this.bookmarkSubject !== 'ALL' &&
        !bookmarkGroups.some(g => g.subject === this.bookmarkSubject)) {
      this.bookmarkSubject = 'ALL';
    }

    const visibleGroups = this.bookmarkSubject === 'ALL'
      ? bookmarkGroups
      : bookmarkGroups.filter(g => g.subject === this.bookmarkSubject);

    const visibleBookmarkCount = visibleGroups.reduce((n, g) => n + g.questions.length, 0);

    // Filter & sort quizzes
    let filteredQuizzes = allQuizzes.filter(q => {
      const matchSearch = (q.title || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                          (q.subject || '').toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchDiff = this.selectedDifficulty === 'ALL' || q.difficulty === this.selectedDifficulty;
      return matchSearch && matchDiff;
    });

    if (this.selectedSort === 'NEWEST') {
      filteredQuizzes.sort((a, b) => (b.id || 0) - (a.id || 0));
    } else if (this.selectedSort === 'OLDEST') {
      filteredQuizzes.sort((a, b) => (a.id || 0) - (b.id || 0));
    } else if (this.selectedSort === 'HIGHEST') {
      filteredQuizzes.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    } else if (this.selectedSort === 'LOWEST') {
      filteredQuizzes.sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
    }

    // Hero counters: what is actually in the library, and how much of it has
    // been attempted — the two things a student opens this tab to check.
    const completedCount = allQuizzes.filter(q => q.completedAt).length;
    const subjectCount = new Set(allQuizzes.map(q => q.subject).filter(Boolean)).size;

    const heroHtml = UIUtils.buildViewHero({
      accent: 'amber',
      icon: 'library',
      eyebrow: 'Knowledge Base',
      title: 'Everything you have',
      titleAccent: 'built and saved.',
      hindi: 'ज्ञान संग्रह — आपका निजी पुस्तकालय',
      tagline: 'Every generated quiz and every bookmarked question in one place. Search, re-attempt, export as a printable paper, or send a set straight to flashcards.',
      stats: [
        { value: allQuizzes.length, label: 'Quizzes saved' },
        { value: completedCount, label: 'Attempted' },
        { value: bookmarks.length, label: 'Bookmarked Qs' },
        { value: subjectCount, label: 'Subjects' }
      ],
      actions: [
        { label: 'Create New Quiz', icon: 'plus', onclick: "app.navigate('create-quiz')" },
        { label: 'View History', icon: 'history', onclick: "app.navigate('quiz-history')", variant: 'ghost' }
      ]
    });

    this.container.innerHTML = `
      <div class="page-column">
        ${heroHtml}

        <!-- Library Source Tabs -->
        <div class="source-tabs">
          <button class="source-tab-btn ${this.activeTab === 'QUIZZES' ? 'active' : ''}" onclick="libraryView.setTab('QUIZZES')">
            <i data-lucide="layers"></i>
            <span>Tab 1: All Quizzes (${allQuizzes.length})</span>
          </button>
          <button class="source-tab-btn ${this.activeTab === 'BOOKMARKS' ? 'active' : ''}" onclick="libraryView.setTab('BOOKMARKS')">
            <i data-lucide="bookmark"></i>
            <span>Tab 2: Saved Questions (${bookmarks.length})</span>
          </button>
        </div>

        <!-- ================================================================= -->
        <!-- TAB 1: ALL QUIZZES -->
        <!-- ================================================================= -->
        ${this.activeTab === 'QUIZZES' ? `
          <!-- Search & Filter Toolbar -->
          <div class="glass-panel" style="padding:1rem 1.25rem; display:flex; flex-direction:column; gap:0.85rem;">
            <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
              <div style="flex:1; min-width:240px; position:relative;">
                <input type="text" class="study-textarea" style="min-height:42px; padding:0.4rem 0.85rem 0.4rem 2.2rem;" 
                  placeholder="Search quizzes by title or subject..." value="${this.searchQuery}" oninput="libraryView.onSearchChange(this.value)">
                <i data-lucide="search" style="position:absolute; left:10px; top:12px; width:16px; height:16px; color:var(--text-muted);"></i>
              </div>

              <!-- Sort Dropdown -->
              <select class="study-textarea" style="width:auto; min-height:42px; padding:0.4rem 1rem; cursor:pointer;" onchange="libraryView.onSortChange(this.value)">
                <option value="NEWEST" ${this.selectedSort === 'NEWEST' ? 'selected' : ''}>Newest First</option>
                <option value="OLDEST" ${this.selectedSort === 'OLDEST' ? 'selected' : ''}>Oldest First</option>
                <option value="HIGHEST" ${this.selectedSort === 'HIGHEST' ? 'selected' : ''}>Highest Score</option>
                <option value="LOWEST" ${this.selectedSort === 'LOWEST' ? 'selected' : ''}>Lowest Score</option>
              </select>
            </div>

            <!-- Difficulty Filter Chips -->
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span style="font-size:0.82rem; font-weight:600; color:var(--text-muted);">Difficulty:</span>
              ${['ALL', 'EASY', 'MEDIUM', 'HARD'].map(d => `
                <div class="select-chip ${this.selectedDifficulty === d ? 'active' : ''}" style="padding:0.25rem 0.75rem; font-size:0.8rem;" onclick="libraryView.setDifficultyFilter('${d}')">
                  ${d === 'ALL' ? 'All Difficulties' : d}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Quizzes List -->
          <div class="quiz-cards-list">
            ${filteredQuizzes.length === 0 ? `
              <div class="glass-panel" style="padding:3rem 2rem; text-align:center; color:var(--text-muted);">
                <i data-lucide="folder-x" style="width:48px;height:48px;margin-bottom:0.75rem;opacity:0.5;"></i>
                <p style="font-size:1.05rem; font-weight:600;">No quizzes found</p>
                <p style="font-size:0.85rem; margin-top:0.25rem;">Try adjusting your search query or generate a new quiz.</p>
              </div>
            ` : filteredQuizzes.map(q => `
              <div class="quiz-list-item">
                <div class="quiz-info">
                  <div class="quiz-item-title">${SecurityUtils.escapeHtml(q.title)}</div>
                  <div class="quiz-meta-row">
                    <span class="badge badge-primary">${SecurityUtils.escapeHtml(q.subject)}</span>
                    <span class="badge badge-muted">${SecurityUtils.escapeHtml(q.difficulty)}</span>
                    <span class="badge badge-muted">${SecurityUtils.escapeHtml(q.quizMode)}</span>
                    <span>${q.totalQuestions} Questions</span>
                    ${q.pageRangeText ? `<span>• ${SecurityUtils.escapeHtml(q.pageRangeText)}</span>` : ''}
                    <span>• ${new Date(q.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div class="quiz-item-actions">
                  ${q.completedAt ? `
                    <span class="badge ${q.percentage >= 70 ? 'badge-success' : 'badge-warning'}">
                      Score: ${q.percentage}%
                    </span>
                    <button class="btn btn-secondary btn-sm" onclick="app.viewQuizResult(${q.id})">
                      <i data-lucide="bar-chart"></i>
                      <span>Results</span>
                    </button>
                  ` : `
                    <span class="badge badge-muted">Not Attempted</span>
                    <button class="btn btn-primary btn-sm" onclick="app.startQuiz(${q.id})">
                      <i data-lucide="play"></i>
                      <span>Take Quiz</span>
                    </button>
                  `}

                  <button class="btn btn-secondary btn-sm" title="Retake Quiz" onclick="app.startQuiz(${q.id})">
                    <i data-lucide="rotate-ccw" style="width:16px;height:16px;"></i>
                  </button>

                  <button class="icon-btn" title="Export A4 PDF" onclick="app.exportQuizPdf(${q.id})">
                    <i data-lucide="file-down" style="width:18px;height:18px;"></i>
                  </button>

                  <button class="icon-btn" style="color:var(--color-error);" title="Delete Quiz" onclick="libraryView.confirmDelete(${q.id})">
                    <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <!-- ================================================================= -->
          <!-- TAB 2: SAVED QUESTIONS (BOOKMARKS) -->
          <!-- ================================================================= -->
          <div>
            ${bookmarks.length > 0 ? `
              <!-- CTA to Launch Practice Drill from Bookmarks -->
              <div class="export-pdf-banner" style="margin-bottom:1.5rem;">
                <div class="export-banner-text">
                  <div class="export-banner-icon" style="background:#F59E0B;">
                    <i data-lucide="sparkles" style="width:26px;height:26px;"></i>
                  </div>
                  <div>
                    <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">
                      Bookmarks Mastery Practice Drill
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-secondary);">
                      Launch a custom dynamic practice session featuring all your ${bookmarks.length} saved high-yield questions.
                    </div>
                  </div>
                </div>

                <button class="btn btn-primary" onclick="libraryView.startBookmarksDrill()">
                  <i data-lucide="play"></i>
                  <span>🚀 Start Bookmarks Drill</span>
                </button>
              </div>
            ` : ''}

            <!-- Subject switch. One chip per subject that actually has saved
                 questions, so the row never offers an empty bucket. -->
            ${bookmarkGroups.length > 0 ? `
              <div class="bm-subject-switch" role="group" aria-label="Filter saved questions by subject">
                <span class="bm-switch-label">
                  <i data-lucide="folder-tree" style="width:15px;height:15px;"></i>
                  <span>Subject</span>
                </span>

                <button type="button"
                  class="select-chip bm-subject-chip ${this.bookmarkSubject === 'ALL' ? 'active' : ''}"
                  aria-pressed="${this.bookmarkSubject === 'ALL' ? 'true' : 'false'}"
                  onclick="libraryView.setBookmarkSubject('ALL')">
                  <span>All Subjects</span>
                  <span class="bm-chip-count">${bookmarks.length}</span>
                </button>

                ${bookmarkGroups.map(g => `
                  <button type="button"
                    class="select-chip bm-subject-chip ${this.bookmarkSubject === g.subject ? 'active' : ''}"
                    aria-pressed="${this.bookmarkSubject === g.subject ? 'true' : 'false'}"
                    onclick="libraryView.setBookmarkSubject('${SecurityUtils.escapeHtml(UIUtils.escapeJs(g.subject))}')">
                    <span>${SecurityUtils.escapeHtml(g.subject)}</span>
                    <span class="bm-chip-count">${g.questions.length}</span>
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <!-- Bookmarks List, grouped by subject -->
            <div style="display:flex; flex-direction:column; gap:1.75rem;">
              ${bookmarks.length === 0 ? `
                <div class="glass-panel" style="padding:3rem 2rem; text-align:center; color:var(--text-muted);">
                  <i data-lucide="bookmark" style="width:48px;height:48px;margin-bottom:0.75rem;opacity:0.5;"></i>
                  <p style="font-size:1.05rem; font-weight:600;">No saved questions yet</p>
                  <p style="font-size:0.85rem; margin-top:0.25rem;">Tap the bookmark icon on any question — during a quiz or on the results screen — and it lands here, filed under its subject.</p>
                </div>
              ` : visibleGroups.map(group => `
                <section class="bm-subject-group" aria-label="${SecurityUtils.escapeHtml(group.subject)}">
                  <header class="bm-group-header">
                    <h3 class="bm-group-title">${SecurityUtils.escapeHtml(group.subject)}</h3>
                    <span class="badge badge-primary">${group.questions.length} saved</span>
                    <span class="bm-group-rule" aria-hidden="true"></span>
                    <button type="button" class="btn btn-secondary btn-sm"
                      onclick="libraryView.startBookmarksDrill('${SecurityUtils.escapeHtml(UIUtils.escapeJs(group.subject))}')"
                      title="Practise only the ${SecurityUtils.escapeHtml(group.subject)} questions">
                      <i data-lucide="play" style="width:14px;height:14px;"></i>
                      <span>Drill this subject</span>
                    </button>
                  </header>

                  <div style="display:flex; flex-direction:column; gap:1rem;">
                    ${group.questions.map((q, idx) => {
                      const isRevealed = this.revealedBookmarkIds.has(q.id);
                      const letters = ['A', 'B', 'C', 'D'];
                      const correct = (q.options || [])[q.correctAnswerIndex];

                      return `
                        <div class="review-item-card">
                          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                              <span class="badge badge-primary">${SecurityUtils.escapeHtml(q.subject)}</span>
                              ${q.sourcePage ? `<span class="badge badge-muted">Page ${q.sourcePage}</span>` : ''}
                              <span style="font-size:0.8rem; color:var(--text-muted);">From: ${SecurityUtils.escapeHtml(q.quizTitle)}</span>
                            </div>

                            <button class="bookmark-toggle-btn bookmarked" title="Remove Bookmark" onclick="libraryView.removeBookmark(${q.id})">
                              <i data-lucide="bookmark" style="width:20px;height:20px;fill:currentColor;"></i>
                            </button>
                          </div>

                          <div style="font-size:1.08rem; font-weight:700; color:var(--text-main);">
                            ${idx + 1}. ${SecurityUtils.sanitizeHtml(q.questionText)}
                          </div>

                          <!-- Collapsible Reveal Accordion -->
                          <div>
                            <button class="btn btn-secondary btn-sm" onclick="libraryView.toggleReveal(${q.id})">
                              <i data-lucide="${isRevealed ? 'chevron-up' : 'eye'}"></i>
                              <span>${isRevealed ? 'Hide Answer & Explanation' : 'Reveal Answer & Explanation'}</span>
                            </button>

                            ${isRevealed ? `
                              <div class="explanation-card" style="margin-top:0.75rem;">
                                <div style="font-weight:700; color:var(--color-success);">
                                  Correct Answer: Option (${letters[q.correctAnswerIndex] || '?'})${correct ? ` — ${SecurityUtils.escapeHtml(correct)}` : ''}
                                </div>
                                <div class="explanation-body" style="margin-top:0.35rem;">
                                  ${SecurityUtils.sanitizeHtml(q.explanation)}
                                </div>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </section>
              `).join('')}
            </div>

            ${bookmarks.length > 0 && visibleBookmarkCount === 0 ? `
              <div class="glass-panel" style="padding:2rem; text-align:center; color:var(--text-muted);">
                No saved questions in this subject.
              </div>
            ` : ''}
          </div>
        `}
      </div>
    `;

    if (window.app) window.app.refreshIcons();
  }

  setTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  onSearchChange(val) {
    this.searchQuery = val;
    this.render();
  }

  onSortChange(val) {
    this.selectedSort = val;
    this.render();
  }

  setDifficultyFilter(diff) {
    this.selectedDifficulty = diff;
    this.render();
  }

  /** Narrow the saved-questions list to one subject, or 'ALL' for every group. */
  setBookmarkSubject(subject) {
    this.bookmarkSubject = subject || 'ALL';
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  toggleReveal(qId) {
    if (this.revealedBookmarkIds.has(qId)) {
      this.revealedBookmarkIds.delete(qId);
    } else {
      this.revealedBookmarkIds.add(qId);
    }
    this.render();
  }

  async removeBookmark(qId) {
    await updateQuestionBookmark(qId, false);
    app.showToast('Bookmark removed', 'info');
    this.render();
  }

  confirmDelete(quizId) {
    app.showConfirmation({
      title: 'Delete Quiz Permanently?',
      message: 'This will remove the quiz, its questions, and your past evaluation records from your local storage. This action cannot be undone.',
      confirmText: 'Delete Quiz',
      onConfirm: async () => {
        await deleteQuiz(quizId);
        app.showToast('Quiz deleted successfully', 'success');
        this.render();
      }
    });
  }

  /**
   * Build a practice quiz from saved questions.
   *
   * @param {string} [subject] restrict the drill to one subject. Omitted (or
   *        'ALL') drills every saved question. A subject-specific drill is
   *        titled and tagged with that subject, so it files itself back into the
   *        right bucket instead of landing in a generic "Mixed" pile.
   */
  async startBookmarksDrill(subject) {
    const all = await getBookmarkedQuestions();
    const scoped = (!subject || subject === 'ALL')
      ? all
      : all.filter(q => q.subject === subject);

    if (scoped.length === 0) {
      app.showToast(
        subject && subject !== 'ALL'
          ? `No saved questions in ${subject} yet.`
          : 'You have no bookmarked questions.',
        'error'
      );
      return;
    }

    const isScoped = !!subject && subject !== 'ALL';

    const drillId = await saveNewQuiz({
      title: isScoped
        ? `⭐ ${subject} — Bookmarks Drill`
        : '⭐ Saved Bookmarks Mastery Drill',
      // Tagging the drill with the real subject keeps it grouped correctly if
      // the student bookmarks questions from inside the drill itself. The old
      // hard-coded 'Mixed Revisions' created a phantom subject bucket.
      subject: isScoped ? subject : 'Mixed Revisions',
      difficulty: 'MIXED',
      quizMode: 'PRACTICE',
      language: 'ENGLISH',
      sourceType: 'TEXT_NOTES',
      sourceTitle: 'Saved Bookmarks'
    }, scoped);

    app.showToast(
      `Created a ${scoped.length}-question drill from your saved ${isScoped ? subject : ''} questions!`.replace('  ', ' '),
      'success'
    );
    app.startQuiz(drillId);
  }
}

window.libraryView = new LibraryView();
