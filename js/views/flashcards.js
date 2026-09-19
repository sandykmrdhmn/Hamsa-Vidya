/**
 * HAMSA VIDYA (हंस विद्या) — Interactive 3D Flashcards & Spaced Repetition (SRS) Engine
 * Powered by Dexie.js persistence, active recall physics, and mobile touch ergonomics.
 */

class FlashcardsView {
  constructor() {
    this.container = document.getElementById('view-flashcards');
    this.currentDeck = null;
    this.masterDeckCards = []; // Immutable backup of the deck
    this.cards = [];           // Active study session queue
    this.currentIndex = 0;
    this.isFlipped = false;
    this.showOptions = false;  // Toggle for MCQ options on card front
    this.ratingsMap = new Map(); // Index -> rating (1=Again, 2=Hard, 3=Good, 4=Easy)
    this.activeTab = 'decks';  // 'decks' | 'study' | 'summary'

    // Filter & Search state for Decks Vault
    this.searchQuery = '';
    this.selectedFilter = 'ALL'; // 'ALL' | 'DUE' | 'QUIZZES' | 'NOTES' | 'CUSTOM'

    // Touch swipe tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchDeltaX = 0;
    this.isSwiping = false;

    // Speech Synthesis state
    this.isSpeaking = false;

    // Bound listeners
    this._handleKeydown = this.handleKeydown.bind(this);
    this._handleTouchStart = this.handleTouchStart.bind(this);
    this._handleTouchMove = this.handleTouchMove.bind(this);
    this._handleTouchEnd = this.handleTouchEnd.bind(this);
  }

  async render() {
    this.container = document.getElementById('view-flashcards');
    if (!this.container) return;

    if (this.activeTab === 'study' && this.cards.length > 0) {
      this.renderStudyCard();
    } else if (this.activeTab === 'summary') {
      this.renderDeckSummary();
    } else {
      await this.renderDecksList();
    }

    if (window.app) window.app.refreshIcons();
  }

  // =========================================================================
  // 1. DECKS VAULT LIST (With Search, Filter & Spaced Repetition Stats)
  // =========================================================================
  async renderDecksList() {
    this.activeTab = 'decks';
    this.detachKeyboard();
    this.stopSpeech();

    const [quizzes, bookmarkedQuestions, notes, customDecks, dueCount] = await Promise.all([
      getAllQuizzes().catch(() => []),
      getBookmarkedQuestions().catch(() => []),
      getAllNotes().catch(() => []),
      getAllCustomDecks().catch(() => []),
      getDueCardsCount().catch(() => 0)
    ]);

    const totalQuestionsCount = quizzes.reduce((acc, q) => acc + (q.totalQuestions || 0), 0);
    const totalCustomCardsCount = customDecks.reduce((acc, d) => acc + (d.cardCount || 0), 0);
    const totalAvailableCards = totalQuestionsCount + bookmarkedQuestions.length + totalCustomCardsCount;

    // Filter items based on search query and category
    const qTerm = (this.searchQuery || '').toLowerCase().trim();

    const filteredQuizzes = quizzes.filter(q => {
      if (this.selectedFilter !== 'ALL' && this.selectedFilter !== 'QUIZZES') return false;
      if (!qTerm) return true;
      return (q.title && q.title.toLowerCase().includes(qTerm)) ||
             (q.subject && q.subject.toLowerCase().includes(qTerm));
    });

    const filteredNotes = notes.filter(n => {
      if (this.selectedFilter !== 'ALL' && this.selectedFilter !== 'NOTES') return false;
      if (!qTerm) return true;
      return (n.title && n.title.toLowerCase().includes(qTerm)) ||
             (n.subject && n.subject.toLowerCase().includes(qTerm));
    });

    const filteredCustomDecks = customDecks.filter(d => {
      if (this.selectedFilter !== 'ALL' && this.selectedFilter !== 'CUSTOM') return false;
      if (!qTerm) return true;
      return (d.title && d.title.toLowerCase().includes(qTerm)) ||
             (d.subject && d.subject.toLowerCase().includes(qTerm)) ||
             (d.description && d.description.toLowerCase().includes(qTerm));
    });

    let decksHtml = '';

    // Smart Decks Row (Always shown if relevant)
    if (this.selectedFilter === 'ALL' || this.selectedFilter === 'DUE') {
      decksHtml += `
        <div style="margin-bottom: 2.25rem;">
          <h3 style="font-size: 1.25rem; font-weight: 750; margin-bottom: 1rem; display:flex; align-items:center; gap:0.55rem;">
            <i data-lucide="zap" style="color:var(--color-gold);"></i>
            <span>Smart Revision & Active Recall Decks</span>
          </h3>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
            
            <!-- 1. Due for Review Today (SRS Smart Deck) -->
            <div class="glass-panel spotlight-card" style="padding: 1.5rem; cursor: pointer; border: 1.5px solid ${dueCount > 0 ? 'rgba(245,158,11,0.5)' : 'var(--border-medium)'}; background: ${dueCount > 0 ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(14,20,36,0.6) 100%)' : 'var(--glass-card)'};"
                 onclick="flashcardsView.loadDueDeck()">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
                <div class="badge ${dueCount > 0 ? 'badge-gold' : 'badge-muted'}">
                  ${dueCount > 0 ? '🔥 Due Today' : 'All Caught Up'}
                </div>
                <div style="width:38px;height:38px;border-radius:50%;background:rgba(245,158,11,0.18);display:flex;align-items:center;justify-content:center;color:var(--color-gold);">
                  <i data-lucide="clock" style="width:20px;height:20px;"></i>
                </div>
              </div>
              <h4 style="font-size: 1.18rem; font-weight: 750; margin-bottom: 0.35rem;">Daily Spaced Repetition</h4>
              <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 1rem; line-height:1.5;">
                Cards scheduled for review based on memory retention intervals (SM-2 Algorithm).
              </p>
              <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.86rem; font-weight: 700; color: var(--color-gold);">
                <span>${dueCount} Cards due for review</span>
                <span style="display:flex; align-items:center; gap:0.3rem;">
                  ${dueCount > 0 ? 'Start Review' : 'Practice Ahead'} <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
                </span>
              </div>
            </div>

            <!-- 2. Bookmarked Questions Deck -->
            <div class="glass-panel spotlight-card" style="padding: 1.5rem; cursor: pointer;"
                 onclick="flashcardsView.loadBookmarksDeck()">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
                <div class="badge badge-gold">Starred Highlights</div>
                <div style="width:38px;height:38px;border-radius:50%;background:rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center;color:var(--color-gold);">
                  <i data-lucide="star" style="width:19px;height:19px;"></i>
                </div>
              </div>
              <h4 style="font-size: 1.18rem; font-weight: 750; margin-bottom: 0.35rem;">Bookmarked Questions</h4>
              <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 1rem; line-height:1.5;">
                High-yield exam questions you saved during quiz playback for rapid retention drills.
              </p>
              <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.86rem; font-weight: 700; color: var(--color-gold);">
                <span>${bookmarkedQuestions.length} Cards available</span>
                <span style="display:flex; align-items:center; gap:0.3rem;">Drill Deck <i data-lucide="arrow-right" style="width:14px;height:14px;"></i></span>
              </div>
            </div>

            <!-- 3. All Quizzes Combined Mega Deck -->
            <div class="glass-panel spotlight-card" style="padding: 1.5rem; cursor: pointer;"
                 onclick="flashcardsView.loadAllQuizzesDeck()">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
                <div class="badge badge-primary">Library Vault</div>
                <div style="width:38px;height:38px;border-radius:50%;background:var(--color-primary-glow);display:flex;align-items:center;justify-content:center;color:var(--color-primary-light);">
                  <i data-lucide="layers" style="width:19px;height:19px;"></i>
                </div>
              </div>
              <h4 style="font-size: 1.18rem; font-weight: 750; margin-bottom: 0.35rem;">All Library Questions</h4>
              <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 1rem; line-height:1.5;">
                Shuffle and master all questions across all generated subjects and PDF modules.
              </p>
              <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.86rem; font-weight: 700; color: var(--color-primary-light);">
                <span>${totalQuestionsCount} Cards total</span>
                <span style="display:flex; align-items:center; gap:0.3rem;">Shuffle All <i data-lucide="arrow-right" style="width:14px;height:14px;"></i></span>
              </div>
            </div>

          </div>
        </div>
      `;
    }

    // Custom Decks Section
    if (filteredCustomDecks.length > 0 || this.selectedFilter === 'CUSTOM') {
      decksHtml += `
        <div style="margin-bottom: 2.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
            <h3 style="font-size: 1.25rem; font-weight: 750; display:flex; align-items:center; gap:0.55rem;">
              <i data-lucide="folder-plus" style="color:var(--color-primary-light);"></i>
              <span>Your Custom Exam Decks</span>
            </h3>
            <button class="btn btn-secondary btn-sm" onclick="flashcardsView.openCreateDeckModal()">
              <i data-lucide="plus"></i>
              <span>New Deck</span>
            </button>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            ${filteredCustomDecks.map(deck => `
              <div class="glass-panel spotlight-card" style="padding: 1.35rem; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span class="badge badge-primary">${SecurityUtils.escapeHtml(deck.subject || 'Custom')}</span>
                    <div style="display:flex; gap:0.25rem;">
                      <button class="icon-btn icon-btn-sm" title="Add Card to Deck" onclick="event.stopPropagation(); flashcardsView.openAddCardModal(${deck.id})">
                        <i data-lucide="plus" style="width:14px;height:14px;"></i>
                      </button>
                      <button class="icon-btn icon-btn-sm icon-btn-danger" title="Delete Deck" onclick="event.stopPropagation(); flashcardsView.deleteDeckPrompt(${deck.id}, '${SecurityUtils.escapeHtml(deck.title)}')">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                      </button>
                    </div>
                  </div>
                  <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; line-height: 1.35;">
                    ${SecurityUtils.escapeHtml(deck.title)}
                  </h4>
                  <p style="font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 0.85rem; line-height:1.45;">
                    ${SecurityUtils.escapeHtml(deck.description || 'No description provided.')}
                  </p>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); font-size: 0.86rem; font-weight: 600;">
                  <span style="color:var(--text-muted);">${deck.cardCount || 0} Cards</span>
                  <button class="btn btn-primary btn-sm" onclick="flashcardsView.loadCustomDeck(${deck.id})">
                    <i data-lucide="play" style="width:13px;height:13px;"></i>
                    <span>Study</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Individual Quiz Decks Section
    if (filteredQuizzes.length > 0) {
      decksHtml += `
        <div style="margin-bottom: 2.25rem;">
          <h3 style="font-size: 1.25rem; font-weight: 750; margin-bottom: 1rem; display:flex; align-items:center; gap:0.55rem;">
            <i data-lucide="help-circle" style="color:var(--color-primary-light);"></i>
            <span>Decks from Generated Quizzes</span>
          </h3>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            ${filteredQuizzes.map(qz => `
              <div class="glass-panel spotlight-card" style="padding: 1.35rem; cursor: pointer; display:flex; flex-direction:column; justify-content:space-between;"
                   onclick="flashcardsView.loadQuizDeck(${qz.id})">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span class="badge badge-muted">${SecurityUtils.escapeHtml(qz.subject || 'General')}</span>
                    <span class="badge ${qz.difficulty === 'HARD' ? 'badge-error' : qz.difficulty === 'EASY' ? 'badge-success' : 'badge-warning'}">${qz.difficulty || 'MEDIUM'}</span>
                  </div>
                  <h4 style="font-size: 1.08rem; font-weight: 700; margin-bottom: 0.35rem; line-height: 1.35;">
                    ${SecurityUtils.escapeHtml(qz.title)}
                  </h4>
                  <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.85rem;">
                    Created on ${new Date(qz.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); font-size: 0.86rem; font-weight: 600; color: var(--color-primary-light);">
                  <span>${qz.totalQuestions || 0} Flashcards</span>
                  <span style="display:flex; align-items:center; gap:0.3rem;">Study Deck <i data-lucide="play" style="width:13px;height:13px;"></i></span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Digital Textbook Notes Decks Section
    if (filteredNotes.length > 0) {
      decksHtml += `
        <div style="margin-bottom: 2.25rem;">
          <h3 style="font-size: 1.25rem; font-weight: 750; margin-bottom: 1rem; display:flex; align-items:center; gap:0.55rem;">
            <i data-lucide="book-open" style="color:#10B981;"></i>
            <span>Decks from Digital Study Notes</span>
          </h3>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            ${filteredNotes.map(n => `
              <div class="glass-panel spotlight-card" style="padding: 1.35rem; cursor: pointer; display:flex; flex-direction:column; justify-content:space-between;"
                   onclick="flashcardsView.loadNotesDeck(${n.id})">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span class="badge badge-success">${SecurityUtils.escapeHtml(n.subject || 'Textbook')}</span>
                    ${n.isFavorite ? '<i data-lucide="star" style="width:16px;height:16px;color:var(--color-gold);fill:var(--color-gold);"></i>' : ''}
                  </div>
                  <h4 style="font-size: 1.08rem; font-weight: 700; margin-bottom: 0.35rem; line-height: 1.35;">
                    ${SecurityUtils.escapeHtml(n.title)}
                  </h4>
                  <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.85rem;">
                    Glossary Terms & Section Takeaways
                  </p>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); font-size: 0.86rem; font-weight: 600; color: #10B981;">
                  <span>Interactive Flashcards</span>
                  <span style="display:flex; align-items:center; gap:0.3rem;">Review <i data-lucide="play" style="width:13px;height:13px;"></i></span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Due-today leads the counter row and sets the accent: when anything is
    // due, reviewing it is the highest-value thing a student can do, so the
    // banner turns amber to say so rather than staying a neutral violet.
    const totalDecks = quizzes.length + customDecks.length + notes.length;

    const heroHtml = UIUtils.buildViewHero({
      accent: dueCount > 0 ? 'amber' : 'emerald',
      icon: 'zap',
      eyebrow: 'Active Recall Engine',
      title: dueCount > 0 ? `${dueCount} card${dueCount === 1 ? '' : 's'} due —` : 'Remember it',
      titleAccent: dueCount > 0 ? 'review them today.' : 'for good.',
      hindi: 'स्मृति अभ्यास — अंतराल पुनरावृत्ति प्रणाली',
      tagline: 'Flip 3D cards from any quiz, note or custom deck. Leitner boxes and SM-2 intervals decide what you see next, so effort goes to the facts that are slipping.',
      stats: [
        { value: dueCount, label: 'Due today' },
        { value: totalDecks, label: 'Decks' },
        { value: totalAvailableCards, label: 'Cards in vault' },
        { value: customDecks.length, label: 'Custom decks' }
      ],
      actions: [
        { label: 'Create Custom Deck', icon: 'plus-circle', onclick: 'flashcardsView.openCreateDeckModal()' },
        { label: 'Generate New Quiz', icon: 'sparkles', onclick: "app.navigate('create-quiz')", variant: 'ghost' }
      ]
    });

    this.container.innerHTML = `
      <div class="page-column">
        ${heroHtml}

        <!-- Filter & Search Toolbar -->
        <div class="deck-vault-filter-bar">
          <div class="deck-vault-search-wrap">
            <i data-lucide="search" style="width:16px;height:16px;color:var(--text-muted);"></i>
            <input type="text" id="deck-search-input" placeholder="Search decks by subject or title..." 
                   value="${SecurityUtils.escapeHtml(this.searchQuery)}"
                   oninput="flashcardsView.handleSearchInput(event)">
            ${this.searchQuery ? `
              <button onclick="flashcardsView.clearSearch()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">
                <i data-lucide="x" style="width:14px;height:14px;"></i>
              </button>
            ` : ''}
          </div>

          <div class="deck-vault-pills-row">
            <button class="deck-vault-pill ${this.selectedFilter === 'ALL' ? 'active' : ''}" onclick="flashcardsView.setFilter('ALL')">
              All Decks
            </button>
            <button class="deck-vault-pill ${this.selectedFilter === 'DUE' ? 'active' : ''}" onclick="flashcardsView.setFilter('DUE')">
              Due Today (${dueCount})
            </button>
            <button class="deck-vault-pill ${this.selectedFilter === 'CUSTOM' ? 'active' : ''}" onclick="flashcardsView.setFilter('CUSTOM')">
              Custom (${customDecks.length})
            </button>
            <button class="deck-vault-pill ${this.selectedFilter === 'QUIZZES' ? 'active' : ''}" onclick="flashcardsView.setFilter('QUIZZES')">
              Quizzes (${quizzes.length})
            </button>
            <button class="deck-vault-pill ${this.selectedFilter === 'NOTES' ? 'active' : ''}" onclick="flashcardsView.setFilter('NOTES')">
              Notes (${notes.length})
            </button>
          </div>
        </div>

        <!-- Render Content -->
        ${decksHtml || `
          <div class="glass-panel text-center" style="padding: 3.5rem 2rem; text-align: center;">
            <div style="width:64px;height:64px;border-radius:50%;background:var(--color-primary-glow);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem auto;color:var(--color-primary-light);">
              <i data-lucide="search-x" style="width:32px;height:32px;"></i>
            </div>
            <h3 style="font-size:1.35rem; font-weight:700; margin-bottom:0.5rem;">No matching decks found</h3>
            <p style="color:var(--text-secondary); max-width:480px; margin:0 auto 1.5rem auto;">
              Try clearing your search query or generate a new AI Quiz from study material.
            </p>
            <button class="btn btn-secondary" onclick="flashcardsView.clearSearch()">
              <span>Clear Filter</span>
            </button>
          </div>
        `}

      </div>
    `;

    if (window.app) window.app.refreshIcons();
  }

  // =========================================================================
  // 2. SEARCH & FILTER CONTROLLERS
  // =========================================================================
  handleSearchInput(e) {
    this.searchQuery = e.target.value;
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this.render();
    }, 250);
  }

  clearSearch() {
    this.searchQuery = '';
    this.selectedFilter = 'ALL';
    this.render();
  }

  setFilter(filterName) {
    this.selectedFilter = filterName;
    this.render();
  }

  // =========================================================================
  // 3. SMART DECK LOADERS
  // =========================================================================
  
  /**
   * Load Smart "Due Today" Spaced Repetition Deck
   */
  async loadDueDeck() {
    const dueCards = await getAllDueCards().catch(() => []);
    if (dueCards.length === 0) {
      app.showToast('You are all caught up! No cards due for review right now.', 'info');
      return;
    }

    this.currentDeck = { id: 'due-today', title: 'Daily Spaced Repetition (Due Today)', type: 'SRS_DUE' };
    this.cards = dueCards;
    this.startStudySession();
  }

  /**
   * Load Bookmarked Questions into Flashcard session
   */
  async loadBookmarksDeck() {
    const questions = await getBookmarkedQuestions().catch(() => []);
    if (questions.length === 0) {
      app.showToast('No bookmarked questions found. Star questions during quiz playback to study them here!', 'info');
      return;
    }

    this.currentDeck = { id: 'bookmarks', title: 'Bookmarked Questions Vault', type: 'BOOKMARKS' };
    this.cards = questions.map((q, idx) => {
      const correctOpt = q.options && q.options[q.correctAnswerIndex] ? q.options[q.correctAnswerIndex] : 'Refer to explanation';
      return {
        id: q.id || idx,
        cardKey: `q:${q.id}`,
        front: q.questionText,
        back: correctOpt,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation || 'No explanation provided.',
        badge: 'Starred Question'
      };
    });

    this.startStudySession();
  }

  /**
   * Load All Quiz Questions into Flashcard session (Fisher-Yates Shuffled)
   */
  async loadAllQuizzesDeck() {
    const questions = await db.questions.toArray().catch(() => []);
    if (questions.length === 0) {
      app.showToast('No quiz questions in library. Create a quiz first!', 'info');
      return;
    }

    const cards = questions.map((q, idx) => {
      const correctOpt = q.options && q.options[q.correctAnswerIndex] ? q.options[q.correctAnswerIndex] : 'Refer to explanation';
      return {
        id: q.id || idx,
        cardKey: `q:${q.id}`,
        front: q.questionText,
        back: correctOpt,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation || '',
        badge: 'Quiz Question'
      };
    });

    this.currentDeck = { id: 'all-quizzes', title: 'All Library Questions (Shuffled)', type: 'ALL_QUIZZES' };
    this.cards = this.fisherYatesShuffle(cards);
    this.startStudySession();
  }

  /**
   * Load Specific Quiz into Flashcard session (Poka-Yoke Crash Fixed!)
   */
  async loadQuizDeck(quizId) {
    const quiz = await getQuizWithQuestions(quizId);
    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
      app.showToast('Quiz contains no questions.', 'error');
      return;
    }

    this.currentDeck = { id: quiz.id, title: quiz.title, type: 'QUIZ', subject: quiz.subject };
    this.cards = quiz.questions.map((q, idx) => {
      const correctOpt = q.options && q.options[q.correctAnswerIndex] ? q.options[q.correctAnswerIndex] : 'Refer to explanation';
      return {
        id: q.id || idx,
        cardKey: `q:${q.id}`,
        front: q.questionText,
        back: correctOpt,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation || '',
        badge: quiz.subject || 'MCQ'
      };
    });

    this.startStudySession();
  }

  /**
   * Load Study Note into Flashcard session
   */
  async loadNotesDeck(noteId) {
    const note = await getNoteById(noteId);
    if (!note) {
      app.showToast('Study note not found.', 'error');
      return;
    }

    const cards = [];

    // Extract glossary terms
    if (Array.isArray(note.glossary) && note.glossary.length > 0) {
      note.glossary.forEach(item => {
        cards.push({
          id: `glossary_${item.term}`,
          cardKey: `note_${note.id}:${item.term}`,
          front: `Define: ${item.term}`,
          back: item.definition,
          explanation: item.hindiMeaning ? `Hindi Meaning: ${item.hindiMeaning}` : '',
          badge: 'Glossary Term'
        });
      });
    }

    // Extract section key takeaways
    if (Array.isArray(note.sections) && note.sections.length > 0) {
      note.sections.forEach(sec => {
        if (sec.heading && (sec.summary || sec.content)) {
          cards.push({
            id: `sec_${sec.heading}`,
            cardKey: `note_${note.id}:${sec.heading}`,
            front: `Core Concept: What are the key points of "${sec.heading}"?`,
            back: sec.summary || (sec.content ? sec.content.slice(0, 220) + '...' : ''),
            explanation: `From note: ${note.title} • Section: ${sec.heading}`,
            badge: 'Key Concept'
          });
        }
      });
    }

    if (cards.length === 0) {
      app.showToast('Note does not contain structured glossary terms or section summaries for flashcards.', 'info');
      return;
    }

    this.currentDeck = { id: note.id, title: note.title, type: 'NOTE', subject: note.subject };
    this.cards = cards;
    this.startStudySession();
  }

  /**
   * Load Custom User Deck into Flashcard session
   */
  async loadCustomDeck(deckId) {
    const deck = await getCustomDeckWithCards(deckId);
    if (!deck || !deck.cards || deck.cards.length === 0) {
      app.showToast('Deck contains no cards. Add some cards first!', 'info');
      return;
    }

    this.currentDeck = { id: deck.id, title: deck.title, type: 'CUSTOM', subject: deck.subject };
    this.cards = deck.cards.map((c, idx) => ({
      id: c.id || idx,
      cardKey: `custom:${c.id}`,
      front: c.front,
      back: c.back,
      explanation: c.explanation || '',
      badge: c.badge || 'Custom'
    }));

    this.startStudySession();
  }

  // =========================================================================
  // 4. STUDY SESSION CONTROLLER & RENDERER
  // =========================================================================
  startStudySession() {
    this.activeTab = 'study';
    this.currentIndex = 0;
    this.isFlipped = false;
    this.showOptions = false;
    this.ratingsMap.clear();

    // Preserve master immutable copy of deck
    this.masterDeckCards = [...this.cards];

    this.attachKeyboard();
    this.render();
  }

  renderStudyCard() {
    const card = this.cards[this.currentIndex];
    if (!card) {
      this.renderDeckSummary();
      return;
    }

    const total = this.cards.length;
    const currentNum = this.currentIndex + 1;
    const progressPct = Math.round((currentNum / total) * 100);

    const hasOptions = Array.isArray(card.options) && card.options.length > 0;
    const letters = ['A', 'B', 'C', 'D', 'E'];

    this.container.innerHTML = `
      <div style="max-width: 1120px; width: 100%; margin: 0 auto; display:flex; flex-direction:column; gap: 1.25rem;">
        
        <!-- Top HUD Header -->
        <div class="glass-panel flashcard-hud-bar" style="padding: 0.95rem 1.4rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <div class="flashcard-hud-left" style="display:flex; align-items:center; gap:0.75rem;">
            <button class="btn btn-secondary btn-sm" onclick="flashcardsView.confirmExitSession()" title="Back to Decks">
              <i data-lucide="arrow-left"></i>
              <span>Decks</span>
            </button>
            <div>
              <h3 style="font-size: 1.08rem; font-weight: 800; max-width: 380px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${SecurityUtils.escapeHtml(this.currentDeck?.title || 'Flashcard Deck')}
              </h3>
              <span style="font-size: 0.8rem; color: var(--text-muted);">
                Card <strong>${currentNum}</strong> of <strong>${total}</strong> • ${this.ratingsMap.size} Reviewed
              </span>
            </div>
          </div>

          <div class="flashcard-hud-right" style="display:flex; align-items:center; gap:0.6rem;">
            <button class="btn btn-secondary btn-sm" onclick="flashcardsView.exportCurrentDeckToPdf()" title="Export Printable A4 Sheet">
              <i data-lucide="download"></i>
              <span>Export PDF</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="flashcardsView.shuffleCurrentDeck()" title="Shuffle Deck">
              <i data-lucide="shuffle"></i>
              <span>Shuffle</span>
            </button>
          </div>
        </div>

        <!-- Progress Bar Track -->
        <div style="width:100%; height:6px; background:var(--border-subtle); border-radius:var(--radius-full); overflow:hidden;">
          <div style="width:${progressPct}%; height:100%; background:var(--gradient-brand); transition:width var(--transition-normal);"></div>
        </div>

        <!-- 3D Flippable Card Canvas -->
        <div class="flashcard-3d-scene" id="flashcard-scene" onclick="flashcardsView.toggleFlip()">
          
          <!-- Mobile Swipe Feedback Badges -->
          <div class="flashcard-swipe-badge badge-right" id="swipe-badge-right">MASTERED (→)</div>
          <div class="flashcard-swipe-badge badge-left" id="swipe-badge-left">REVIEW (←)</div>

          <div class="flashcard-3d-card ${this.isFlipped ? 'flipped' : ''}" id="flashcard-interactive-card" role="button" tabindex="0" aria-label="Interactive 3D Flashcard. Tap or press Space to reveal answer.">
            
            <!-- CARD FRONT -->
            <div class="flashcard-face flashcard-front" aria-hidden="${this.isFlipped ? 'true' : 'false'}">
              <div class="flashcard-badge-row">
                <span class="badge badge-primary">${SecurityUtils.escapeHtml(card.badge || 'Concept')}</span>
                
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <!-- TTS Speaker Button -->
                  <button class="flashcard-audio-btn" id="tts-front-btn" title="Read Aloud" onclick="flashcardsView.speakCardText(event, 'front')">
                    <i data-lucide="volume-2" style="width:16px;height:16px;"></i>
                  </button>
                  <span style="font-size:0.78rem; font-weight:600; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem;">
                    <i data-lucide="rotate-cw" style="width:12px;height:12px;"></i> Tap to flip
                  </span>
                </div>
              </div>

              <div class="flashcard-body-content">
                <div class="flashcard-question-text">
                  ${SecurityUtils.sanitizeHtml(card.front)}
                </div>

                <!-- MCQ Options Accordion (If applicable) -->
                ${hasOptions ? `
                  <div style="display:flex; flex-direction:column; align-items:center; margin-top:0.5rem;" onclick="event.stopPropagation()">
                    <button class="flashcard-options-toggle-btn" onclick="flashcardsView.toggleOptions(event)">
                      <i data-lucide="${this.showOptions ? 'chevron-up' : 'list'}" style="width:14px;height:14px;"></i>
                      <span>${this.showOptions ? 'Hide Choices' : 'Show MCQ Choices (A/B/C/D)'}</span>
                    </button>

                    ${this.showOptions ? `
                      <div class="flashcard-options-list">
                        ${card.options.map((opt, oIdx) => `
                          <div class="flashcard-option-item">
                            <span class="flashcard-option-badge">${letters[oIdx] || oIdx + 1}</span>
                            <span>${SecurityUtils.sanitizeHtml(opt)}</span>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>

              <div class="flashcard-footer-row">
                <span class="flashcard-tap-hint">
                  <i data-lucide="sparkles" style="width:13px;height:13px;"></i> Active Recall Drill
                </span>
                <span style="font-size:0.78rem; color:var(--text-muted);">
                  Press <kbd style="padding:0.1rem 0.35rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:3px;">Space</kbd> or click to flip
                </span>
              </div>
            </div>

            <!-- CARD BACK -->
            <div class="flashcard-face flashcard-back" aria-hidden="${!this.isFlipped ? 'true' : 'false'}">
              <div class="flashcard-badge-row">
                <span class="badge badge-success">
                  <i data-lucide="check-circle" style="width:13px;height:13px;"></i> Target Answer & Concepts
                </span>

                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <!-- TTS Speaker Button -->
                  <button class="flashcard-audio-btn" id="tts-back-btn" title="Read Aloud" onclick="flashcardsView.speakCardText(event, 'back')">
                    <i data-lucide="volume-2" style="width:16px;height:16px;"></i>
                  </button>
                  <span style="font-size:0.78rem; font-weight:600; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem;">
                    <i data-lucide="rotate-cw" style="width:12px;height:12px;"></i> Tap to flip back
                  </span>
                </div>
              </div>

              <div class="flashcard-body-content" onclick="event.stopPropagation()">
                <div class="flashcard-answer-box">
                  <div style="font-size:0.78rem; font-weight:750; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-success); margin-bottom:0.35rem;">
                    Key Answer
                  </div>
                  <div style="font-size:1.24rem; font-weight:750; color:var(--text-main); line-height:1.45;">
                    ${SecurityUtils.sanitizeHtml(card.back)}
                  </div>
                </div>

                ${card.explanation ? `
                  <div class="flashcard-explanation-box">
                    <div style="font-size:0.78rem; font-weight:750; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-primary-light); margin-bottom:0.3rem;">
                      Detailed Understanding & Context
                    </div>
                    <div style="font-size:0.95rem; color:var(--text-secondary); line-height:1.55;">
                      ${SecurityUtils.sanitizeHtml(card.explanation)}
                    </div>
                  </div>
                ` : ''}
              </div>

              <div class="flashcard-footer-row">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">
                  Rate your recall below to schedule next review
                </span>
                <span style="font-size:0.75rem; color:var(--color-primary-light);">
                  Active Recall Physics
                </span>
              </div>
            </div>

          </div>
        </div>

        <!-- 4-Tier Spaced Repetition (SRS) Action Controls Bar -->
        <div class="glass-panel flashcard-controls-bar" style="padding: 1rem 1.4rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          
          <button class="btn btn-secondary" onclick="flashcardsView.prevCard()" ${this.currentIndex === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} title="Previous Card (←)">
            <i data-lucide="chevron-left"></i>
            <span>Prev</span>
          </button>

          <!-- 4 SRS Rating Buttons -->
          <div class="srs-ratings-group">
            <button class="btn-srs btn-srs-again" onclick="flashcardsView.rateCard(1)" title="Failed recall • Due in 1 day (Key: 1)">
              <span class="srs-label" style="color:var(--color-error);">Again</span>
              <span class="srs-interval">1d</span>
            </button>
            <button class="btn-srs btn-srs-hard" onclick="flashcardsView.rateCard(2)" title="Hard recall • Due in 2 days (Key: 2)">
              <span class="srs-label" style="color:var(--color-gold);">Hard</span>
              <span class="srs-interval">2d</span>
            </button>
            <button class="btn-srs btn-srs-good" onclick="flashcardsView.rateCard(3)" title="Good recall • Due in 4 days (Key: 3)">
              <span class="srs-label" style="color:var(--color-success);">Good</span>
              <span class="srs-interval">4d</span>
            </button>
            <button class="btn-srs btn-srs-easy" onclick="flashcardsView.rateCard(4)" title="Easy mastery • Due in 7 days (Key: 4)">
              <span class="srs-label" style="color:var(--color-primary-light);">Easy</span>
              <span class="srs-interval">7d</span>
            </button>
          </div>

          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="btn btn-primary" onclick="flashcardsView.toggleFlip()" title="Flip Card (Space)">
              <i data-lucide="repeat"></i>
              <span>Flip</span>
            </button>
            <button class="btn btn-secondary" onclick="flashcardsView.nextCard()" ${this.currentIndex === total - 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} title="Next Card (→)">
              <span>Next</span>
              <i data-lucide="chevron-right"></i>
            </button>
          </div>

        </div>

        <!-- Desktop Keyboard Shortcut Helper Bar -->
        <div class="flashcard-shortcut-bar" style="text-align:center; font-size:0.78rem; color:var(--text-muted); display:flex; justify-content:center; flex-wrap:wrap; gap:1.25rem;">
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">Space</kbd> Flip</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">←</kbd> / <kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">→</kbd> Prev / Next</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">1</kbd> Again</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">2</kbd> Hard</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">3</kbd> Good</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">4</kbd> Easy</span>
          <span><kbd style="padding:0.15rem 0.45rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:4px;">Esc</kbd> Exit</span>
        </div>

      </div>
    `;

    // Attach Mobile Touch Swipe Physics
    this.attachTouchSwipe();

    if (window.app) window.app.refreshIcons();
  }

  // =========================================================================
  // 5. INTERACTIVE 3D FLIP & OPTIONS TOGGLE
  // =========================================================================
  toggleFlip() {
    this.isFlipped = !this.isFlipped;
    const cardEl = document.getElementById('flashcard-interactive-card');
    if (cardEl) {
      cardEl.classList.toggle('flipped', this.isFlipped);
      const frontFace = cardEl.querySelector('.flashcard-front');
      const backFace = cardEl.querySelector('.flashcard-back');
      if (frontFace) frontFace.setAttribute('aria-hidden', this.isFlipped ? 'true' : 'false');
      if (backFace) backFace.setAttribute('aria-hidden', !this.isFlipped ? 'true' : 'false');
    }
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleOptions(e) {
    if (e) e.stopPropagation();
    this.showOptions = !this.showOptions;
    this.render();
  }

  // =========================================================================
  // 6. SPACED REPETITION RATING & PERSISTENCE
  // =========================================================================
  async rateCard(rating) {
    const card = this.cards[this.currentIndex];
    if (!card) return;

    this.ratingsMap.set(this.currentIndex, rating);

    // Save to IndexedDB (Permanent SRS retention)
    const cardKey = card.cardKey || `${this.currentDeck?.type || 'GEN'}:${card.id || this.currentIndex}`;
    await saveCardReviewProgress(cardKey, this.currentDeck?.id, this.currentDeck?.type, rating);

    if (rating >= 3) {
      if (window.audioEngine) window.audioEngine.playSuccess();
    } else {
      if (window.audioEngine) window.audioEngine.playClick();
    }

    this.advanceOrFinish();
  }

  advanceOrFinish() {
    this.stopSpeech();
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.isFlipped = false;
      this.showOptions = false;
      this.render();
    } else {
      this.renderDeckSummary();
    }
  }

  nextCard() {
    this.stopSpeech();
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.isFlipped = false;
      this.showOptions = false;
      this.render();
    }
  }

  prevCard() {
    this.stopSpeech();
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.isFlipped = false;
      this.showOptions = false;
      this.render();
    }
  }

  // =========================================================================
  // 7. SUMMARY SCREEN & WEAK CARDS PRACTICE
  // =========================================================================
  renderDeckSummary() {
    this.activeTab = 'summary';
    this.detachKeyboard();
    this.stopSpeech();

    const total = this.cards.length;
    let againCount = 0;
    let hardCount = 0;
    let goodCount = 0;
    let easyCount = 0;

    this.ratingsMap.forEach(rating => {
      if (rating === 1) againCount++;
      else if (rating === 2) hardCount++;
      else if (rating === 3) goodCount++;
      else if (rating === 4) easyCount++;
    });

    const masteredCount = goodCount + easyCount;
    const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
    const weakIndices = [];

    this.ratingsMap.forEach((rating, idx) => {
      if (rating === 1 || rating === 2) {
        weakIndices.push(idx);
      }
    });

    // Celebration Confetti
    if (window.app && typeof window.app.fireCelebrationConfetti === 'function') {
      window.app.fireCelebrationConfetti();
    }

    this.container.innerHTML = `
      <div style="max-width: 720px; margin: 2rem auto; text-align:center;">
        <div class="glass-panel result-hero-card" style="padding: 3rem 2.25rem; display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
          
          <div style="width:76px; height:76px; border-radius:50%; background:linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.1) 100%); border:2px solid var(--color-gold); display:flex; align-items:center; justify-content:center; color:var(--color-gold); box-shadow:0 0 28px -4px var(--color-gold-glow);">
            <i data-lucide="award" style="width:38px;height:38px;"></i>
          </div>

          <div>
            <span class="badge badge-gold" style="margin-bottom:0.75rem;">Session Completed</span>
            <h2 style="font-size: 2.25rem; font-weight: 850; letter-spacing: -0.025em; margin-bottom: 0.5rem;">
              Deck Mastery: <span class="gradient-gold-text">${masteryPct}%</span>
            </h2>
            <p style="color:var(--text-secondary); font-size:1.02rem; line-height:1.5;">
              You completed all ${total} flashcards in <strong>${SecurityUtils.escapeHtml(this.currentDeck?.title || 'this deck')}</strong>.
              Review intervals have been updated in your Spaced Repetition Vault.
            </p>
          </div>

          <!-- 4-Tier Breakdown Chips -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.85rem; width:100%; margin: 0.5rem 0;">
            
            <div style="padding:0.95rem; background:var(--bg-surface-elevated); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-lg);">
              <div style="font-size:1.6rem; font-weight:800; color:var(--color-error);">${againCount}</div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Again (1d)</div>
            </div>

            <div style="padding:0.95rem; background:var(--bg-surface-elevated); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-lg);">
              <div style="font-size:1.6rem; font-weight:800; color:var(--color-gold);">${hardCount}</div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Hard (2d)</div>
            </div>

            <div style="padding:0.95rem; background:var(--bg-surface-elevated); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-lg);">
              <div style="font-size:1.6rem; font-weight:800; color:var(--color-success);">${goodCount}</div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Good (4d)</div>
            </div>

            <div style="padding:0.95rem; background:var(--bg-surface-elevated); border:1px solid var(--border-medium); border-radius:var(--radius-lg);">
              <div style="font-size:1.6rem; font-weight:800; color:var(--color-primary-light);">${easyCount}</div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Easy (7d)</div>
            </div>

          </div>

          <!-- Actions -->
          <div style="display:flex; gap:0.85rem; flex-wrap:wrap; justify-content:center; width:100%;">
            ${weakIndices.length > 0 ? `
              <button class="btn btn-primary" onclick="flashcardsView.restartWithWeakCards()">
                <i data-lucide="rotate-ccw"></i>
                <span>Practice Weak Cards (${weakIndices.length})</span>
              </button>
            ` : ''}
            
            <button class="btn btn-secondary" onclick="flashcardsView.restartFullDeck()">
              <i data-lucide="refresh-cw"></i>
              <span>Restart Full Deck</span>
            </button>

            <button class="btn btn-secondary" onclick="flashcardsView.exportCurrentDeckToPdf()">
              <i data-lucide="download"></i>
              <span>Export Cheatsheet</span>
            </button>

            <button class="btn btn-secondary" onclick="flashcardsView.exitSession()">
              <i data-lucide="layers"></i>
              <span>All Decks</span>
            </button>
          </div>

        </div>
      </div>
    `;

    if (window.app) window.app.refreshIcons();
  }

  /**
   * Practice only cards flagged as Again or Hard, without mutating the master deck!
   */
  restartWithWeakCards() {
    const weakCards = [];
    this.ratingsMap.forEach((rating, idx) => {
      if ((rating === 1 || rating === 2) && this.cards[idx]) {
        weakCards.push(this.cards[idx]);
      }
    });

    if (weakCards.length === 0) return;
    this.cards = weakCards;
    this.startStudySession();
  }

  /**
   * Safely restart full deck using preserved masterDeckCards!
   */
  restartFullDeck() {
    this.cards = [...this.masterDeckCards];
    this.startStudySession();
  }

  confirmExitSession() {
    if (this.ratingsMap.size > 0 && this.currentIndex < this.cards.length - 1) {
      if (confirm('Leave study session? Your reviewed card progress has been saved.')) {
        this.exitSession();
      }
    } else {
      this.exitSession();
    }
  }

  exitSession() {
    this.activeTab = 'decks';
    this.detachKeyboard();
    this.stopSpeech();
    this.render();
  }

  // =========================================================================
  // 8. SHUFFLE (True Fisher-Yates Algorithm)
  // =========================================================================
  fisherYatesShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  shuffleCurrentDeck() {
    this.cards = this.fisherYatesShuffle(this.cards);
    this.currentIndex = 0;
    this.isFlipped = false;
    this.showOptions = false;
    this.ratingsMap.clear();
    app.showToast('Deck shuffled with Fisher-Yates randomness!', 'info');
    this.render();
  }

  // =========================================================================
  // 9. TEXT-TO-SPEECH (TTS Voice Readout)
  // =========================================================================
  speakCardText(e, face) {
    if (e) e.stopPropagation();

    if (!('speechSynthesis' in window)) {
      app.showToast('Speech synthesis not supported in this browser.', 'warning');
      return;
    }

    const card = this.cards[this.currentIndex];
    if (!card) return;

    const textToSpeak = face === 'front' 
      ? card.front 
      : `${card.back}. ${card.explanation || ''}`;

    if (this.isSpeaking) {
      this.stopSpeech();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;

    const btn = document.getElementById(`tts-${face}-btn`);
    if (btn) btn.classList.add('speaking');
    this.isSpeaking = true;

    utterance.onend = () => {
      if (btn) btn.classList.remove('speaking');
      this.isSpeaking = false;
    };

    utterance.onerror = () => {
      if (btn) btn.classList.remove('speaking');
      this.isSpeaking = false;
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    document.querySelectorAll('.flashcard-audio-btn').forEach(btn => btn.classList.remove('speaking'));
  }

  // =========================================================================
  // 10. TOUCH SWIPE PHYSICS (Mobile / Touch Devices)
  // =========================================================================
  attachTouchSwipe() {
    const scene = document.getElementById('flashcard-scene');
    if (!scene) return;

    scene.removeEventListener('touchstart', this._handleTouchStart);
    scene.removeEventListener('touchmove', this._handleTouchMove);
    scene.removeEventListener('touchend', this._handleTouchEnd);

    scene.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    scene.addEventListener('touchmove', this._handleTouchMove, { passive: true });
    scene.addEventListener('touchend', this._handleTouchEnd, { passive: true });
  }

  handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.touchDeltaX = 0;
    this.isSwiping = true;

    const card = document.getElementById('flashcard-interactive-card');
    if (card) card.classList.add('swiping');
  }

  handleTouchMove(e) {
    if (!this.isSwiping || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    this.touchDeltaX = currentX - this.touchStartX;
    const deltaY = currentY - this.touchStartY;

    // Only swipe if mostly horizontal
    if (Math.abs(this.touchDeltaX) > Math.abs(deltaY)) {
      const card = document.getElementById('flashcard-interactive-card');
      const badgeRight = document.getElementById('swipe-badge-right');
      const badgeLeft = document.getElementById('swipe-badge-left');

      if (card) {
        const rotZ = this.touchDeltaX * 0.05;
        card.style.transform = `translateX(${this.touchDeltaX}px) rotateZ(${rotZ}deg) ${this.isFlipped ? 'rotateY(180deg)' : ''}`;
      }

      if (this.touchDeltaX > 50) {
        if (badgeRight) {
          badgeRight.style.opacity = String(Math.min(1, (this.touchDeltaX - 50) / 60));
          badgeRight.style.transform = 'scale(1)';
        }
        if (badgeLeft) badgeLeft.style.opacity = '0';
      } else if (this.touchDeltaX < -50) {
        if (badgeLeft) {
          badgeLeft.style.opacity = String(Math.min(1, (Math.abs(this.touchDeltaX) - 50) / 60));
          badgeLeft.style.transform = 'scale(1)';
        }
        if (badgeRight) badgeRight.style.opacity = '0';
      } else {
        if (badgeRight) badgeRight.style.opacity = '0';
        if (badgeLeft) badgeLeft.style.opacity = '0';
      }
    }
  }

  handleTouchEnd() {
    if (!this.isSwiping) return;
    this.isSwiping = false;

    const card = document.getElementById('flashcard-interactive-card');
    const badgeRight = document.getElementById('swipe-badge-right');
    const badgeLeft = document.getElementById('swipe-badge-left');

    if (badgeRight) badgeRight.style.opacity = '0';
    if (badgeLeft) badgeLeft.style.opacity = '0';

    if (card) {
      card.classList.remove('swiping');
      card.style.transform = '';
    }

    // Swipe Threshold: 90px
    if (this.touchDeltaX > 90) {
      // Swiped Right -> Mastered / Good (Rating 3)
      this.rateCard(3);
    } else if (this.touchDeltaX < -90) {
      // Swiped Left -> Need Review (Rating 1)
      this.rateCard(1);
    }
  }

  // =========================================================================
  // 11. KEYBOARD SHORTCUTS
  // =========================================================================
  handleKeydown(e) {
    if (this.activeTab !== 'study') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.toggleFlip();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prevCard();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.nextCard();
    } else if (e.key === '1') {
      e.preventDefault();
      this.rateCard(1); // Again
    } else if (e.key === '2') {
      e.preventDefault();
      this.rateCard(2); // Hard
    } else if (e.key === '3') {
      e.preventDefault();
      this.rateCard(3); // Good
    } else if (e.key === '4') {
      e.preventDefault();
      this.rateCard(4); // Easy
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.confirmExitSession();
    }
  }

  attachKeyboard() {
    window.removeEventListener('keydown', this._handleKeydown);
    window.addEventListener('keydown', this._handleKeydown);
  }

  detachKeyboard() {
    window.removeEventListener('keydown', this._handleKeydown);
  }

  // =========================================================================
  // 12. PRINTABLE PDF EXPORT (2-Column Foldable A4 Cheat Sheet)
  // =========================================================================
  exportCurrentDeckToPdf() {
    const cardsToExport = this.masterDeckCards.length > 0 ? this.masterDeckCards : this.cards;
    if (cardsToExport.length === 0) {
      app.showToast('No cards to export.', 'warning');
      return;
    }

    const title = this.currentDeck?.title || 'Hamsa Vidya Flashcards';
    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${SecurityUtils.escapeHtml(title)} - Printable Flashcard Sheet</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #111827; margin: 0; padding: 0; background: #ffffff; }
          .header { border-bottom: 2px solid #4F46E5; padding-bottom: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; }
          .header h1 { font-size: 18px; margin: 0; color: #4F46E5; }
          .header span { font-size: 11px; color: #6B7280; }
          .flashcards-table { width: 100%; border-collapse: collapse; }
          .flashcards-table th { background: #F3F4F6; padding: 8px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #D1D5DB; }
          .flashcards-table td { padding: 10px 12px; font-size: 12px; border: 1px solid #E5E7EB; vertical-align: top; }
          .card-num { font-weight: 700; color: #4F46E5; margin-right: 4px; }
          .card-answer { font-weight: 700; color: #047857; margin-bottom: 4px; }
          .card-expl { color: #4B5563; font-size: 11px; line-height: 1.4; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>🪿 HAMSA VIDYA (हंस विद्या) — Flashcard Revision Sheet</h1>
            <div style="font-size: 13px; font-weight: 600; color: #1F2937; margin-top: 3px;">
              ${SecurityUtils.escapeHtml(title)} (${cardsToExport.length} Flashcards)
            </div>
          </div>
          <span>Printed on: ${todayStr}</span>
        </div>

        <table class="flashcards-table">
          <thead>
            <tr>
              <th style="width: 45%;">FRONT (Question / Term / Prompt)</th>
              <th style="width: 55%;">BACK (Key Answer & Explanation)</th>
            </tr>
          </thead>
          <tbody>
            ${cardsToExport.map((c, idx) => `
              <tr style="page-break-inside: avoid;">
                <td>
                  <span class="card-num">#${idx + 1}</span>
                  <div style="font-weight: 600; margin-top: 2px; line-height: 1.45;">
                    ${SecurityUtils.escapeHtml(c.front)}
                  </div>
                  ${c.options && c.options.length > 0 ? `
                    <div style="margin-top: 6px; font-size: 11px; color: #4B5563;">
                      ${c.options.map((opt, oIdx) => `<div>• (${['A','B','C','D'][oIdx] || oIdx+1}) ${SecurityUtils.escapeHtml(opt)}</div>`).join('')}
                    </div>
                  ` : ''}
                </td>
                <td>
                  <div class="card-answer">✓ ${SecurityUtils.escapeHtml(c.back)}</div>
                  ${c.explanation ? `<div class="card-expl">${SecurityUtils.escapeHtml(c.explanation)}</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    if (window.pdfGenerator && typeof window.pdfGenerator.openPrintWindow === 'function') {
      window.pdfGenerator.openPrintWindow(html);
    } else {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 350);
      }
    }
  }

  // =========================================================================
  // 13. ULTRA-PREMIUM CUSTOM DECK & CARD CREATOR MODALS (100x Edition)
  // =========================================================================
  openCreateDeckModal() {
    const modalId = 'custom-deck-create-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-overlay active';
      document.body.appendChild(modal);
    } else {
      modal.classList.add('active');
    }

    this.selectedDeckIcon = '🎴';
    const iconsList = ['🎴', '🏛️', '⚖️', '🌍', '🧪', '💼', '📐', '🧠', '📜', '⚡', '🎯', '💡', '🚀', '📖'];
    const quickSubjects = [
      { label: 'Indian Polity', icon: '🏛️' },
      { label: 'Modern History', icon: '📜' },
      { label: 'Geography', icon: '🌍' },
      { label: 'General Science', icon: '🔬' },
      { label: 'Economy', icon: '💼' },
      { label: 'CSAT / Aptitude', icon: '📐' },
      { label: 'Vocabulary', icon: '🧠' }
    ];

    modal.innerHTML = `
      <div class="modal-content deck-creator-modal" onclick="event.stopPropagation()">
        <div class="deck-creator-inner">
          
          <!-- Header Row -->
          <div class="deck-creator-header">
            <div style="display:flex; align-items:center; gap:0.95rem;">
              <div class="deck-creator-badge-wrap" id="deck-creator-active-avatar">
                ${this.selectedDeckIcon}
              </div>
              <div class="deck-creator-title-group">
                <h3>Create Flashcard Deck</h3>
                <p>Craft tailored drills for targeted exam topics, dates & formulas.</p>
              </div>
            </div>

            <button class="deck-creator-close-btn" onclick="flashcardsView.closeModal('${modalId}')" title="Close">
              <i data-lucide="x" style="width:18px;height:18px;"></i>
            </button>
          </div>

          <!-- Interactive Icon / Emoji Picker -->
          <div>
            <div class="deck-icon-picker-label">
              <span>Deck Avatar Icon</span>
              <span style="color:var(--color-primary-light);font-weight:600;font-size:0.75rem;">Select an icon</span>
            </div>
            <div class="deck-icon-picker-row">
              ${iconsList.map(icon => `
                <button type="button" class="deck-icon-opt ${icon === this.selectedDeckIcon ? 'active' : ''}" 
                        onclick="flashcardsView.selectDeckIcon('${icon}')">
                  ${icon}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Form Fields -->
          <form id="create-deck-form" onsubmit="flashcardsView.submitCreateDeck(event)" style="display:flex; flex-direction:column; gap:1.15rem;">
            
            <!-- Deck Title -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-deck-title">
                <span>Deck Title<span class="required-star">*</span></span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Clear & specific</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="book-bookmark" class="deck-input-icon"></i>
                <input type="text" id="custom-deck-title" class="form-input" 
                       placeholder="e.g. Modern Indian History — Major Treaties & Acts" required autocomplete="off">
              </div>
            </div>

            <!-- Subject / Tag with 1-Tap Quick-Pick Chips -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-deck-subject">
                <span>Subject / Category<span class="required-star">*</span></span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Quick-select below</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="tag" class="deck-input-icon"></i>
                <input type="text" id="custom-deck-subject" class="form-input" 
                       placeholder="e.g. History, Polity, Economy" required autocomplete="off">
              </div>

              <!-- Quick Recommendation Chips -->
              <div class="quick-subject-row">
                ${quickSubjects.map(sub => `
                  <button type="button" class="quick-subject-tag" onclick="flashcardsView.quickPickSubject('${sub.label}', '${sub.icon}')">
                    <span>${sub.icon}</span>
                    <span>${sub.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Description -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-deck-desc">
                <span>Description & Objective</span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Optional</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="file-text" class="deck-input-icon" style="top:14px;"></i>
                <textarea id="custom-deck-desc" class="form-input form-textarea" rows="2" 
                          placeholder="Key highlights, exam year, or high-yield revision focus..."></textarea>
              </div>
            </div>

            <!-- Actions Footer -->
            <div class="deck-creator-footer">
              <button type="button" class="btn-cancel-modal" onclick="flashcardsView.closeModal('${modalId}')">
                Cancel
              </button>
              <button type="submit" class="btn-create-deck-submit">
                <i data-lucide="sparkles" style="width:16px;height:16px;"></i>
                <span>Create Deck & Add Cards →</span>
              </button>
            </div>

          </form>

        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => {
      document.getElementById('custom-deck-title')?.focus();
    }, 100);
  }

  selectDeckIcon(icon) {
    this.selectedDeckIcon = icon;
    const avatarEl = document.getElementById('deck-creator-active-avatar');
    if (avatarEl) avatarEl.textContent = icon;

    document.querySelectorAll('.deck-icon-opt').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === icon);
    });

    if (window.audioEngine) window.audioEngine.playClick();
  }

  quickPickSubject(subjectText, icon) {
    const subjectInput = document.getElementById('custom-deck-subject');
    if (subjectInput) {
      subjectInput.value = subjectText;
      subjectInput.focus();
    }
    if (icon) {
      this.selectDeckIcon(icon);
    }
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async submitCreateDeck(e) {
    e.preventDefault();
    const titleRaw = document.getElementById('custom-deck-title')?.value.trim();
    const subject = document.getElementById('custom-deck-subject')?.value.trim();
    const description = document.getElementById('custom-deck-desc')?.value.trim();

    if (!titleRaw || !subject) {
      app.showToast('Please fill in title and subject.', 'warning');
      return;
    }

    const title = `${this.selectedDeckIcon || '🎴'} ${titleRaw.replace(/^[\p{Emoji}\s]+/u, '')}`;

    const deckId = await createCustomDeck({ title, subject, description });
    this.closeModal('custom-deck-create-modal');
    app.showToast(`✨ Deck "${title}" successfully created!`, 'success');
    if (window.audioEngine) window.audioEngine.playSuccess();
    await this.render();

    // Open Add Card modal directly for effortless flow!
    this.openAddCardModal(deckId, title);
  }

  openAddCardModal(deckId, deckTitle = '') {
    const modalId = 'custom-card-add-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-overlay active';
      document.body.appendChild(modal);
    } else {
      modal.classList.add('active');
    }

    modal.innerHTML = `
      <div class="modal-content deck-creator-modal" style="max-width: 580px;" onclick="event.stopPropagation()">
        <div class="deck-creator-inner">
          
          <!-- Header -->
          <div class="deck-creator-header">
            <div style="display:flex; align-items:center; gap:0.95rem;">
              <div class="deck-creator-badge-wrap" style="background:var(--color-primary-glow); border-color:var(--color-primary-light);">
                <i data-lucide="plus-circle" style="color:var(--color-primary-light); width:26px; height:26px;"></i>
              </div>
              <div class="deck-creator-title-group">
                <h3>Add New Flashcard</h3>
                <p>${deckTitle ? `Adding to <strong>${SecurityUtils.escapeHtml(deckTitle)}</strong>` : 'Enter question on front, answer on back.'}</p>
              </div>
            </div>

            <button class="deck-creator-close-btn" onclick="flashcardsView.closeModal('${modalId}')" title="Close">
              <i data-lucide="x" style="width:18px;height:18px;"></i>
            </button>
          </div>

          <!-- Form -->
          <form onsubmit="flashcardsView.submitAddCard(event, ${deckId})" style="display:flex; flex-direction:column; gap:1.15rem;">
            
            <!-- Front Prompt -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-card-front">
                <span>Front (Question / Prompt / Term)<span class="required-star">*</span></span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Active recall stimulus</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="help-circle" class="deck-input-icon" style="top:14px;"></i>
                <textarea id="custom-card-front" class="form-input form-textarea" rows="3" 
                          placeholder="e.g. Which Constitutional Amendment lowered voting age from 21 to 18?" required></textarea>
              </div>
            </div>

            <!-- Back Answer -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-card-back">
                <span>Back (Target Answer)<span class="required-star">*</span></span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Clear & memorable</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="check-circle" class="deck-input-icon"></i>
                <input type="text" id="custom-card-back" class="form-input" 
                       placeholder="e.g. 61st Constitutional Amendment Act, 1988" required autocomplete="off">
              </div>
            </div>

            <!-- Explanation & Context -->
            <div class="deck-form-group">
              <label class="deck-form-label" for="custom-card-expl">
                <span>Explanation & Memory Hook</span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">Optional deeper context</span>
              </label>
              <div class="deck-input-wrapper">
                <i data-lucide="lightbulb" class="deck-input-icon" style="top:14px;"></i>
                <textarea id="custom-card-expl" class="form-input form-textarea" rows="2" 
                          placeholder="e.g. Came into effect in 1989 under Rajiv Gandhi government; amended Article 326."></textarea>
              </div>
            </div>

            <!-- Footer Buttons -->
            <div class="deck-creator-footer">
              <button type="button" class="btn-cancel-modal" onclick="flashcardsView.closeModal('${modalId}')">
                Done
              </button>
              <button type="submit" class="btn-create-deck-submit">
                <i data-lucide="plus" style="width:16px;height:16px;"></i>
                <span>Save & Add Another Card</span>
              </button>
            </div>

          </form>

        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => {
      document.getElementById('custom-card-front')?.focus();
    }, 100);
  }

  async submitAddCard(e, deckId) {
    e.preventDefault();
    const front = document.getElementById('custom-card-front')?.value.trim();
    const back = document.getElementById('custom-card-back')?.value.trim();
    const explanation = document.getElementById('custom-card-expl')?.value.trim();

    if (!front || !back) {
      app.showToast('Please enter both Front and Back.', 'warning');
      return;
    }

    await addCustomCard({ deckId, front, back, explanation });
    app.showToast('✅ Flashcard saved!', 'success');
    if (window.audioEngine) window.audioEngine.playSuccess();

    // Clear inputs and keep focus on front for speedy card entry!
    const frontEl = document.getElementById('custom-card-front');
    const backEl = document.getElementById('custom-card-back');
    const explEl = document.getElementById('custom-card-expl');
    if (frontEl) frontEl.value = '';
    if (backEl) backEl.value = '';
    if (explEl) explEl.value = '';
    if (frontEl) frontEl.focus();

    if (this.activeTab === 'decks') this.render();
  }

  async deleteDeckPrompt(deckId, title) {
    if (confirm(`Delete custom deck "${title}" and all its cards? This cannot be undone.`)) {
      await deleteCustomDeck(deckId);
      app.showToast(`Deck "${title}" deleted.`, 'info');
      await this.render();
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }
}

window.flashcardsView = new FlashcardsView();

