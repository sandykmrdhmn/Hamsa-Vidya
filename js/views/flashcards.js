/** Flashcard vault, active recall and recoverable revision sessions. */
class FlashcardsView {
  constructor() {
    this.container = document.getElementById('view-flashcards');
    this.activeTab = 'decks';
    this.selectedFilter = 'ALL';
    this.searchQuery = '';
    this.sort = 'DUE';
    this.page = 0;
    this.currentDeck = null;
    this.masterDeckCards = [];
    this.cards = [];
    this.currentIndex = 0;
    this.isFlipped = false;
    this.showOptions = false;
    this.ratingsMap = new Map();
    this.reviewCounts = {};
    this.mode = 'FLIP';
    this.answerDraft = '';
    this.answerChecked = false;
    this._version = 0;
    this._session = 0;
    this._reviewEpoch = 0;
    this._saving = false;
    this._boundKey = this.handleKeydown.bind(this);
    this.storageKey = 'hamsa_flashcard_session';
    this.preferencesKey = 'hamsa_flashcard_preferences';
    this.readPreferences();
    window.addEventListener('pagehide', () => {
      this.persistSession();
      this.persistModalDraft();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.persistSession();
        this.persistModalDraft();
        clearTimeout(this._dueTimer);
      } else this.refreshVault();
    });
    window.addEventListener('focus', () => this.refreshVault());
  }
  readPreferences() {
    try {
      const p = JSON.parse(localStorage.getItem(this.preferencesKey) || '{}');
      this.newLimit = this.limit(p.newLimit, 20);
      this.reviewLimit = this.limit(p.reviewLimit, 100);
      this.preferredMode = p.mode === 'TYPE' ? 'TYPE' : 'FLIP';
      if (this.activeTab !== 'study') this.mode = this.preferredMode;
      this.swipeRatings = p.swipeRatings !== false;
    } catch {
      this.newLimit = 20;
      this.reviewLimit = 100;
      this.swipeRatings = true;
      this.preferredMode = 'FLIP';
      if (this.activeTab !== 'study') this.mode = this.preferredMode;
    }
  }
  limit(value, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : fallback;
  }
  escape(value) {
    return SecurityUtils.escapeHtml(value);
  }
  toast(message, type = 'info') {
    window.app?.showToast(message, type);
  }
  bind() {
    if (!this.container) return;
    this.container.onclick = (e) => this.handleAction(e);
    this.container.oninput = (e) => this.handleInput(e);
    this.container.onchange = (e) => this.handleChange(e);
    window.app?.refreshIcons();
  }
  isVisible() {
    return !window.app?.currentView || app.currentView === 'flashcards';
  }
  busy() {
    return this._saving || Boolean(document.querySelector('.fc-modal[open]'));
  }
  async render() {
    this.container = document.getElementById('view-flashcards');
    if (!this.container) return;
    if (this.activeTab === 'study' && this.cards.length) {
      this.attachKeyboard();
      this.renderStudyCard();
    } else if (this.activeTab === 'summary') this.renderDeckSummary();
    else await this.renderDecksList();
  }
  async renderDecksList() {
    const version = ++this._version;
    this.activeTab = 'decks';
    this.readPreferences();
    this.detachKeyboard();
    this.stopSpeech();
    const input = this.container?.querySelector('#deck-search-input'),
      focus = document.activeElement === input,
      caret = input?.selectionStart;
    try {
      if (!this._cleaned) {
        await cleanupFlashcardReviews();
        this._cleaned = true;
      }
      const library = await getFlashcardLibrary();
      if (version !== this._version || this.activeTab !== 'decks') return;
      this.library = library;
      this.paintVault(focus, caret);
    } catch (error) {
      if (version !== this._version) return;
      this.container.innerHTML = `<div class="page-column"><p class="fc-notice">${this.escape(error.message)}</p><button class="btn btn-secondary" data-action="reload">Retry loading decks</button></div>`;
      this.bind();
    }
  }
  paintVault(focus = false, caret = 0) {
    this.updateVaultStatus();
    this.scheduleVaultRefresh();
    const l = this.library,
      e = (v) => this.escape(v),
      dueCount = l.due.length;
    this._vaultStatus = dueCount + ':' + l.reviewedToday;
    const heroHtml = UIUtils.buildViewHero({
      accent: dueCount > 0 ? 'amber' : 'emerald',
      icon: 'layers',
      eyebrow: 'Active Recall',
      title: 'Remember it',
      titleAccent: 'one card at a time.',
      hindi: 'स्मृति अभ्यास — समझें, याद करें, दोहराएँ',
      tagline: 'Revise your quizzes, notes and custom cards.',
      stats: [
        { value: dueCount, label: 'Due now' },
        { value: l.cards.length, label: 'Unique cards' },
        { value: l.newCards.length, label: 'New / changed' },
        { value: l.reviewedToday, label: 'Reviewed today' },
      ],
      actions: [
        {
          label: 'Create Deck',
          icon: 'plus',
          onclick: 'flashcardsView.openCreateDeckModal()',
        },
        {
          label: 'Create Quiz',
          icon: 'sparkles',
          onclick: "app.navigate('create-quiz')",
          variant: 'ghost',
        },
      ],
    });
    const term = this.searchQuery.toLocaleLowerCase().trim();
    let decks = [
      ...l.quizzes.map((d) => ({ ...d, type: 'QUIZ' })),
      ...l.notes.map((d) => ({ ...d, type: 'NOTE' })),
      ...l.customDecks.map((d) => ({ ...d, type: 'CUSTOM' })),
    ];
    const dueByDeck = new Map();
    for (const card of l.due) {
      const key = card.sourceDeckType + ':' + card.sourceDeckId;
      dueByDeck.set(key, (dueByDeck.get(key) || 0) + 1);
    }
    decks = decks
      .map((d) => ({
        ...d,
        dueCount: dueByDeck.get(d.type + ':' + d.id) || 0,
      }))
      .filter(
        (d) =>
          (this.selectedFilter === 'ALL' ||
            (this.selectedFilter === 'DUE' && d.dueCount > 0) ||
            d.type === this.selectedFilter) &&
          (!term ||
            [d.title, d.subject, d.description].some((t) =>
              String(t || '')
                .toLocaleLowerCase()
                .includes(term),
            )),
      );
    decks.sort(
      this.sort === 'TITLE'
        ? (a, b) => String(a.title).localeCompare(String(b.title))
        : this.sort === 'NEWEST'
          ? (a, b) =>
              String(b.updatedAt || b.createdAt || '').localeCompare(
                String(a.updatedAt || a.createdAt || ''),
              )
          : (a, b) =>
              b.dueCount - a.dueCount ||
              String(a.title).localeCompare(String(b.title)),
    );
    this.page = Math.min(
      this.page,
      Math.max(0, Math.ceil(decks.length / 12) - 1),
    );
    const saved = this.savedSession();
    this.container.innerHTML = `<div class="page-column">${heroHtml}
      ${saved ? `<div class="glass-panel fc-resume"><div><strong>Continue saved session</strong><p>${e(saved.deck?.title)} · ${saved.ratings?.length || 0} unique cards reviewed</p></div><button class="btn btn-primary" data-action="resume">Resume</button><button class="btn btn-secondary" data-action="discard">Discard session</button></div>` : ''}
      <div class="fc-smart-grid"><button class="glass-panel fc-smart" data-action="due"><strong>Due now · ${dueCount}</strong><span>${dueCount ? 'Review scheduled cards' : 'No scheduled reviews due right now'}</span></button><button class="glass-panel fc-smart" data-action="new"><strong>Learn new cards · ${l.newCards.length}</strong><span>Use your daily new-card allowance</span></button><button class="glass-panel fc-smart" data-action="bookmarks"><strong>Bookmarked questions · ${l.cards.filter((c) => c.isBookmarked).length}</strong><span>Target saved quiz questions</span></button><button class="glass-panel fc-smart" data-action="all"><strong>All library questions</strong><span>Shuffle valid quiz cards</span></button></div>
      <details class="glass-panel fc-preferences"><summary>Study preferences & learning status</summary><div class="fc-row"><label>New cards/day<input type="number" min="1" max="1000" data-pref="newLimit" value="${this.newLimit}"></label><label>Review cards/session<input type="number" min="1" max="1000" data-pref="reviewLimit" value="${this.reviewLimit}"></label><label>Preferred recall<select data-pref="mode"><option value="FLIP" ${this.mode === 'FLIP' ? 'selected' : ''}>Flip & recall</option><option value="TYPE" ${this.mode === 'TYPE' ? 'selected' : ''}>Type your answer</option></select></label><label><input type="checkbox" data-pref="swipeRatings" ${this.swipeRatings ? 'checked' : ''}> Swipe ratings</label><span>${l.learning.length} learning cards · ${l.reviewedToday} reviewed today</span></div><p>Swipe left: Again; right: Good, after revealing. Code, tables and formula scrolling never rate. Again schedules 10 minutes and repeats the card later in this session, up to three ratings. Daily limits guide smart decks; manual decks remain available.</p></details>
      <div class="deck-vault-filter-bar fc-toolbar"><input id="deck-search-input" aria-label="Search decks" placeholder="Search decks…" value="${e(this.searchQuery)}"><select id="fc-sort" aria-label="Sort decks">${[
        ['DUE', 'Most due first'],
        ['TITLE', 'Title'],
        ['NEWEST', 'Recently updated'],
      ]
        .map(
          ([id, label]) =>
            `<option value="${id}" ${this.sort === id ? 'selected' : ''}>${label}</option>`,
        )
        .join(
          '',
        )}</select><button class="btn btn-secondary" data-action="clear-search">Clear</button></div>
      <div class="deck-vault-pills-row fc-filters">${[
        ['ALL', 'All'],
        ['DUE', 'Due'],
        ['CUSTOM', 'Custom'],
        ['QUIZ', 'Quizzes'],
        ['NOTE', 'Notes'],
      ]
        .map(
          ([id, label]) =>
            `<button class="deck-vault-pill ${this.selectedFilter === id ? 'active' : ''}" data-action="filter" data-filter="${id}" aria-pressed="${this.selectedFilter === id}">${label}</button>`,
        )
        .join('')}</div>
      <div class="fc-deck-grid">${
        decks
          .slice(this.page * 12, this.page * 12 + 12)
          .map(
            (d) =>
              `<article class="glass-panel fc-deck"><span class="badge badge-primary">${e(d.subject || 'General Study')} · ${d.type}</span><h3>${e(d.title)}</h3><p>${e(d.description || '')}</p><span>${d.cardCount} usable cards · ${d.dueCount} due</span>${
                d.excludedCount
                  ? `<details class="fc-excluded"><summary>${d.excludedCount} questions need attention</summary><ul>${Object.entries(
                      d.excludedReasons,
                    )
                      .map(
                        ([reason, count]) => `<li>${count} · ${e(reason)}</li>`,
                      )
                      .join(
                        '',
                      )}</ul><p>Review these questions in Library before using their answers for recall.</p></details>`
                  : ''
              }<div class="fc-row"><button class="btn btn-primary btn-sm" data-action="study-deck" data-id="${Number(d.id)}" data-type="${d.type}" ${d.cardCount ? '' : 'disabled title="No usable cards yet"'}>Study</button>${d.type === 'QUIZ' && d.excludedCount ? '<button class="btn btn-secondary btn-sm" data-action="library">Review in Library</button>' : ''}${d.type === 'CUSTOM' ? `<button class="btn btn-secondary btn-sm" data-action="manage" data-id="${Number(d.id)}">Manage</button><button class="btn btn-secondary btn-sm" data-action="edit-deck" data-id="${Number(d.id)}">Edit</button><button class="btn btn-secondary btn-sm" data-action="delete-deck" data-id="${Number(d.id)}">Delete</button>` : ''}</div></article>`,
          )
          .join('') ||
        '<p class="fc-notice">No matching decks. Create a deck or change filters.</p>'
      }</div>${this.pagination(decks.length, 12, this.page, 'vault-page')}<details class="glass-panel fc-topics"><summary>Subject revision priorities</summary>${this.topicSummary(l.cards)}</details></div>`;
    this.bind();
    if (focus) {
      const field = this.container.querySelector('#deck-search-input');
      field.focus();
      field.setSelectionRange(
        Math.min(caret || 0, field.value.length),
        Math.min(caret || 0, field.value.length),
      );
    }
  }
  pagination(total, size, page, action) {
    return `<nav class="fc-pagination" aria-label="Pagination"><button class="btn btn-secondary btn-sm" data-action="${action}" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button><span>${total} items · Page ${page + 1}/${Math.max(1, Math.ceil(total / size))}</span><button class="btn btn-secondary btn-sm" data-action="${action}" data-page="${page + 1}" ${(page + 1) * size >= total ? 'disabled' : ''}>Next</button></nav>`;
  }
  savePreferences() {
    try {
      localStorage.setItem(
        this.preferencesKey,
        JSON.stringify({
          newLimit: this.newLimit,
          reviewLimit: this.reviewLimit,
          mode: this.preferredMode,
          swipeRatings: this.swipeRatings,
        }),
      );
    } catch {
      this.toast('Study preferences could not be saved.', 'warning');
    }
  }
  updateVaultStatus(now = new Date()) {
    if (!this.library) return;
    const l = this.library,
      today = FlashcardTools.localDate(now);
    l.due = l.cards
      .filter((c) => c.changed || (c.srs && FlashcardTools.due(c.srs, now)))
      .sort(
        (a, b) =>
          Number(a.changed) - Number(b.changed) ||
          (FlashcardTools.reviewTime(a.srs) || 0) -
            (FlashcardTools.reviewTime(b.srs) || 0),
      );
    l.newCards = l.cards.filter((c) => !c.srs);
    l.learning = l.cards.filter((c) => c.srs?.state === 'LEARNING');
    l.reviewedToday = l.cards.filter(
      (c) =>
        c.srs?.lastReviewedAt &&
        FlashcardTools.localDate(new Date(c.srs.lastReviewedAt)) === today,
    ).length;
  }
  scheduleVaultRefresh() {
    clearTimeout(this._dueTimer);
    if (
      this.activeTab !== 'decks' ||
      !this.isVisible() ||
      document.visibilityState === 'hidden'
    )
      return;
    const now = Date.now();
    let next = new Date(new Date().setHours(24, 0, 0, 0)).getTime();
    for (const card of this.library.cards) {
      const time = FlashcardTools.reviewTime(card.srs);
      if (time > now && time < next) next = time;
    }
    this._dueTimer = setTimeout(
      () => {
        if (
          this.activeTab !== 'decks' ||
          !this.isVisible() ||
          document.visibilityState === 'hidden'
        )
          return;
        this.updateVaultStatus();
        if (
          !this.busy() &&
          !document.activeElement?.closest?.('.fc-preferences') &&
          this._vaultStatus !==
            this.library.due.length + ':' + this.library.reviewedToday
        ) {
          const input = this.container.querySelector('#deck-search-input');
          this.paintVault(
            document.activeElement === input,
            input?.selectionStart,
          );
        } else this.scheduleVaultRefresh();
      },
      Math.min(60000, Math.max(200, next - now + 50)),
    );
  }
  refreshVault() {
    if (
      this.library &&
      this.activeTab === 'decks' &&
      this.isVisible() &&
      !this.busy()
    )
      this.renderDecksList();
  }
  topicSummary(cards) {
    const groups = new Map();
    for (const c of cards) {
      const key = c.subject || 'General Study';
      if (!groups.has(key)) groups.set(key, { total: 0, due: 0, weak: 0 });
      const g = groups.get(key);
      g.total++;
      if (c.changed || (c.srs && FlashcardTools.due(c.srs))) g.due++;
      if (c.srs && c.srs.lastRating <= 2) g.weak++;
    }
    return (
      Array.from(groups)
        .sort((a, b) => b[1].due - a[1].due)
        .map(
          ([s, g]) =>
            `<p><strong>${this.escape(s)}</strong> · ${g.total} cards · ${g.due} due · ${g.weak} last rated Again/Hard</p>`,
        )
        .join('') || '<p>Add cards to see priorities.</p>'
    );
  }
  handleInput(event) {
    const t = event.target;
    if (t.id === 'deck-search-input') {
      this.searchQuery = t.value;
      this.page = 0;
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => {
        if (this.activeTab === 'decks' && this.isVisible()) {
          const input = this.container.querySelector('#deck-search-input');
          this.library
            ? this.paintVault(
                document.activeElement === input,
                input?.selectionStart,
              )
            : this.renderDecksList();
        }
      }, 150);
    } else if (t.id === 'fc-typed-answer') {
      this.answerDraft = t.value;
      this.answerChecked = false;
      clearTimeout(this._sessionDebounce);
      this._sessionDebounce = setTimeout(() => this.persistSession(), 250);
    }
  }
  handleChange(event) {
    const t = event.target;
    if (t.id === 'fc-sort') {
      this.sort = t.value;
      this.page = 0;
      this.renderDecksList();
    } else if (t.dataset.pref) {
      if (t.dataset.pref === 'mode') {
        this.mode = this.preferredMode = t.value === 'TYPE' ? 'TYPE' : 'FLIP';
        this.savePreferences();
        return;
      }
      if (t.dataset.pref === 'swipeRatings') {
        this.swipeRatings = t.checked;
        this.savePreferences();
        return;
      }
      if (!['newLimit', 'reviewLimit'].includes(t.dataset.pref)) return;
      this[t.dataset.pref] = this.limit(
        t.value,
        t.dataset.pref === 'newLimit' ? 20 : 100,
      );
      t.value = this[t.dataset.pref];
      this.savePreferences();
    } else if (t.id === 'fc-mode') {
      this.mode = t.value;
      this.preferredMode = this.mode;
      this.savePreferences();
      this.resetFace();
      this.renderStudyCard();
      this.persistSession();
    }
  }
  async handleAction(event) {
    const b = event.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const a = b.dataset.action;
    try {
      if (a === 'filter') {
        this.selectedFilter = b.dataset.filter;
        this.page = 0;
        await this.renderDecksList();
      } else if (a === 'clear-search') this.clearSearch();
      else if (a === 'reload') await this.renderDecksList();
      else if (a === 'vault-page') {
        this.page = Math.max(0, Number(b.dataset.page));
        this.paintVault();
      } else if (a === 'study-deck')
        await this.loadDeck(b.dataset.type, Number(b.dataset.id));
      else if (a === 'due') await this.loadDueDeck();
      else if (a === 'new') await this.smartDeck('NEW');
      else if (a === 'bookmarks') await this.loadBookmarksDeck();
      else if (a === 'all') await this.loadAllQuizzesDeck();
      else if (a === 'manage') await this.openManager(Number(b.dataset.id));
      else if (a === 'edit-deck') await this.openEditDeck(Number(b.dataset.id));
      else if (a === 'delete-deck')
        await this.deleteDeckPrompt(Number(b.dataset.id));
      else if (a === 'flip') this.toggleFlip();
      else if (a === 'options') {
        this.showOptions = !this.showOptions;
        this.renderStudyCard();
      } else if (a === 'rate') await this.rateCard(Number(b.dataset.rating));
      else if (a === 'next') this.nextCard();
      else if (a === 'prev') this.prevCard();
      else if (a === 'exit') this.confirmExitSession();
      else if (a === 'undo') await this.undoRating();
      else if (a === 'shuffle') this.shuffleCurrentDeck();
      else if (a === 'weak') this.restartWithWeakCards();
      else if (a === 'restart') this.restartFullDeck();
      else if (a === 'resume') await this.resumeSession();
      else if (a === 'discard') {
        localStorage.removeItem(this.storageKey);
        this.paintVault();
      } else if (a === 'pdf') this.exportCurrentDeckToPdf();
      else if (a === 'audio') this.speakCardText(event, b.dataset.face);
      else if (a === 'source') await this.openCardSource(Number(b.dataset.ref));
      else if (a === 'library') app.navigate('library');
      else if (a === 'check-answer') {
        this.answerChecked = true;
        this.toggleFlip(true);
      }
    } catch (error) {
      this.toast(error.message, 'error');
    }
  }
  clearSearch() {
    this.searchQuery = '';
    this.selectedFilter = 'ALL';
    this.page = 0;
    this.renderDecksList();
  }
  setFilter(filter) {
    this.selectedFilter = { QUIZZES: 'QUIZ', NOTES: 'NOTE' }[filter] || filter;
    this.page = 0;
    this.renderDecksList();
  }
  async loadDeck(type, id) {
    if (this.busy()) return;
    const epoch = this._reviewEpoch;
    const version = ++this._version,
      l = await getFlashcardLibrary();
    if (version !== this._version || this.busy() || epoch !== this._reviewEpoch)
      return;
    const source = (
      type === 'QUIZ' ? l.quizzes : type === 'NOTE' ? l.notes : l.customDecks
    ).find((d) => d.id === id);
    if (!source) return this.toast('Deck no longer exists.', 'warning');
    this.currentDeck = {
      id,
      title: source.title,
      type,
      subject: source.subject,
    };
    this.cards = l.cards.filter(
      (c) => c.sourceDeckType === type && c.sourceDeckId === id,
    );
    this.startStudySession();
  }
  loadQuizDeck(id) {
    return this.loadDeck('QUIZ', Number(id));
  }
  loadCustomDeck(id) {
    return this.loadDeck('CUSTOM', Number(id));
  }
  async loadNotesDeck(id) {
    if (this.busy()) return false;
    const epoch = this._reviewEpoch;
    const version = ++this._version,
      note = await getNoteById(Number(id));
    if (version !== this._version || this.busy() || epoch !== this._reviewEpoch)
      return false;
    if (!note) return this.toast('Note no longer exists.', 'warning');
    this.currentDeck = {
      id: note.id,
      title: note.title,
      type: 'NOTE',
      subject: note.subject,
    };
    this.cards = FlashcardTools.noteCards(note);
    this.startStudySession();
    return this.activeTab === 'study' && this.currentDeck?.id === note.id;
  }
  async smartDeck(type) {
    if (this.busy()) return;
    const epoch = this._reviewEpoch;
    const version = ++this._version,
      l = await getFlashcardLibrary();
    if (version !== this._version || this.busy() || epoch !== this._reviewEpoch)
      return;
    let cards, title;
    if (type === 'DUE') {
      cards = l.due.slice(0, this.reviewLimit);
      title = 'Scheduled reviews';
    } else if (type === 'NEW') {
      const today = FlashcardTools.localDate();
      const learned = l.cards.filter(
        (c) =>
          c.srs?.firstLearnedAt &&
          FlashcardTools.localDate(new Date(c.srs.firstLearnedAt)) === today,
      ).length;
      cards = l.newCards.slice(0, Math.max(0, this.newLimit - learned));
      title = 'Learn new cards';
    } else if (type === 'BOOKMARKS') {
      cards = l.cards.filter((c) => c.isBookmarked);
      title = 'Bookmarked questions';
    } else {
      cards = this.fisherYatesShuffle(
        l.cards.filter((c) => c.sourceDeckType === 'QUIZ'),
      );
      title = 'All quiz questions';
    }
    this.currentDeck = { id: type, title, type };
    this.cards = cards;
    this.startStudySession();
  }
  loadDueDeck() {
    return this.smartDeck('DUE');
  }
  loadBookmarksDeck() {
    return this.smartDeck('BOOKMARKS');
  }
  loadAllQuizzesDeck() {
    return this.smartDeck('ALL_QUIZZES');
  }
  startStudySession({ preserveMaster = false } = {}) {
    if (this._saving) return;
    if (!preserveMaster) {
      this.readPreferences();
      this.mode = this.preferredMode;
    }
    clearTimeout(this._dueTimer);
    this.stopSpeech();
    ++this._version;
    ++this._session;
    const unique = new Map();
    for (const raw of this.cards) {
      const c = FlashcardTools.normalize(raw);
      if (c && !unique.has(c.cardKey)) unique.set(c.cardKey, c);
    }
    this.cards = Array.from(unique.values());
    if (!this.cards.length) {
      this.toast('No usable cards are available for this selection.', 'info');
      this.activeTab = 'decks';
      this.render();
      return;
    }
    if (!preserveMaster) this.masterDeckCards = structuredClone(this.cards);
    this.sessionKeys = new Set(this.cards.map((c) => c.cardKey));
    this.activeTab = 'study';
    this.currentIndex = 0;
    this.resetFace();
    this.ratingsMap.clear();
    this.reviewCounts = {};
    this.undoState = null;
    this._celebrated = false;
    this._storageWarned = false;
    this.attachKeyboard();
    this.renderStudyCard();
    this.focusStudy();
    this.persistSession();
    this.refreshSchedules(this._session);
  }
  resetFace() {
    this.isFlipped = false;
    this.showOptions = false;
    this.answerDraft = '';
    this.answerChecked = false;
  }
  async refreshSchedules(session) {
    if (typeof getFlashcardLibrary !== 'function') return;
    try {
      const l = await getFlashcardLibrary();
      if (session !== this._session || this._saving || this.ratingsMap.size)
        return;
      const map = new Map(l.cards.map((c) => [c.cardKey, c]));
      for (const card of [...this.cards, ...this.masterDeckCards]) {
        const live = map.get(card.cardKey);
        if (live?.contentFingerprint === card.contentFingerprint)
          card.srs = live.srs;
      }
      if (
        this.activeTab === 'study' &&
        (!app.currentView || app.currentView === 'flashcards')
      )
        this.renderStudyCard();
    } catch (error) {
      this.toast(`Review schedule could not load: ${error.message}`, 'warning');
    }
  }
  renderStudyCard() {
    const active = document.activeElement,
      focusSelector = active?.matches?.('.fc-prompt')
        ? '.fc-prompt'
        : active?.matches?.('.fc-answer')
          ? '.fc-answer'
          : null;
    const draft = this.container?.querySelector('#fc-typed-answer'),
      focused = document.activeElement === draft,
      caret = draft?.selectionStart,
      end = draft?.selectionEnd;
    const c = this.cards[this.currentIndex];
    if (!c) return this.renderDeckSummary();
    const e = (v) => this.escape(v),
      saving = this._saving,
      reviewed = this.ratingsMap.size,
      total = this.sessionKeys?.size || this.masterDeckCards.length,
      intervals = [1, 2, 3, 4].map((r) =>
        FlashcardTools.intervalLabel(c.srs, r),
      );
    this.container.innerHTML = `<div class="page-column fc-study"><header class="glass-panel flashcard-hud-bar fc-row"><button class="btn btn-secondary btn-sm" data-action="exit" ${saving ? 'disabled' : ''}>Decks</button><div class="fc-study-title"><h3>${e(this.currentDeck?.title)}</h3><span>Queue ${this.currentIndex + 1}/${this.cards.length} · ${reviewed}/${total} unique reviewed</span></div><button class="btn btn-secondary btn-sm" data-action="pdf">PDF</button><button class="btn btn-secondary btn-sm" data-action="shuffle" ${saving ? 'disabled' : ''}>Shuffle</button></header>
      <div class="fc-progress" role="progressbar" aria-label="Unique cards reviewed" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${reviewed}"><span style="width:${total ? (reviewed / total) * 100 : 0}%"></span></div><div class="fc-row fc-study-tools"><label>Recall mode<select id="fc-mode" ${saving ? 'disabled' : ''}><option value="FLIP" ${this.mode === 'FLIP' ? 'selected' : ''}>Flip & recall</option><option value="TYPE" ${this.mode === 'TYPE' ? 'selected' : ''}>Type your answer</option></select></label><span>${c.srs ? `Next review: ${e(FlashcardTools.reviewLabel(c.srs))}` : 'New or updated card'} · ${this.origin(c)}</span><button class="btn btn-secondary btn-sm" data-action="undo" ${!this.undoState || saving ? 'disabled' : ''}>Undo last rating</button></div>
      <article class="glass-panel fc-card" id="flashcard-scene"><div class="fc-row"><span class="badge badge-primary">${e(c.badge || 'Concept')}</span><button class="btn btn-secondary btn-sm" data-action="audio" data-face="front" aria-label="Read question aloud">Listen</button></div><div class="fc-prompt" tabindex="-1">${FlashcardTools.format(c.front)}</div>${Array.isArray(c.options) && c.options.length ? `<button class="btn btn-secondary btn-sm" data-action="options" aria-expanded="${this.showOptions}">${this.showOptions ? 'Hide' : 'Show'} choices</button>${this.showOptions ? `<ol class="fc-options" type="A">${c.options.map((o) => `<li>${FlashcardTools.format(o)}</li>`).join('')}</ol>` : ''}` : ''}
      ${this.mode === 'TYPE' ? (this.isFlipped ? `<details class="fc-submitted-answer"><summary>Your submitted answer</summary><p>${e(this.answerDraft || 'No answer entered.')}</p></details>` : `<label class="fc-answer-entry">Your answer<textarea id="fc-typed-answer" maxlength="12000" ${saving ? 'disabled' : ''} placeholder="Recall before revealing…">${e(this.answerDraft)}</textarea></label><button class="btn btn-primary" data-action="check-answer" ${saving ? 'disabled' : ''}>Check & reveal</button>`) : `<button class="btn btn-primary fc-reveal" data-action="flip" ${saving ? 'disabled' : ''}>${this.isFlipped ? 'Hide answer' : 'Reveal answer'} · Space</button>`}
      ${this.isFlipped ? `<section class="fc-answer" aria-label="Answer"><div class="fc-row"><strong>Key answer</strong><button class="btn btn-secondary btn-sm" data-action="audio" data-face="back" aria-label="Read answer aloud">Listen</button></div>${this.answerChecked ? `<p class="fc-notice">${FlashcardTools.answerMatches(this.answerDraft, c.back) ? 'Your normalized wording matches the saved answer.' : 'Your wording differs. Compare meaning yourself; this is not AI grading.'}</p>` : ''}<div class="fc-answer-text">${FlashcardTools.format(c.back, { formula: c.badge === 'Formula' })}</div>${c.explanation ? `<details class="fc-explanation"><summary>Explanation & context</summary>${FlashcardTools.format(c.explanation)}</details>` : ''}${c.memoryCue ? `<p class="fc-memory"><strong>Memory cue:</strong> ${e(c.memoryCue)}</p>` : ''}${Array.isArray(c.optionExplanations) && c.optionExplanations.some(Boolean) ? `<details><summary>Why each option fits or fails</summary>${c.optionExplanations.map((text, i) => `<p><b>${'ABCD'[i]}:</b> ${e(text)}</p>`).join('')}</details>` : ''}${this.sourceNote(c)}</section>` : ''}</article>
      <div class="glass-panel fc-controls"><div class="srs-ratings-group">${['Again', 'Hard', 'Good', 'Easy'].map((label, i) => `<button class="btn-srs btn-srs-${label.toLowerCase()}" data-action="rate" data-rating="${i + 1}" ${!this.isFlipped || saving ? 'disabled' : ''}><span class="srs-label">${label}</span><span class="srs-interval">${intervals[i]}</span></button>`).join('')}</div><div class="fc-row"><button class="btn btn-secondary" data-action="prev" ${this.currentIndex === 0 || saving ? 'disabled' : ''}>Previous</button><span aria-live="polite">${saving ? 'Saving review…' : this.isFlipped ? 'Rate your recall' : 'Reveal, then rate your recall'}</span><button class="btn btn-secondary" data-action="next" ${saving ? 'disabled' : ''}>${this.currentIndex === this.cards.length - 1 ? 'Finish / skip' : 'Skip / next'}</button></div></div><p class="fc-shortcuts" id="fc-shortcuts">Space: reveal · 1–4: rate · arrows: previous/skip · Escape: save & leave. Swipe on a revealed card to rate; scrolling does not rate it.</p></div>`;
    this.bind();
    this.attachTouchSwipe();
    if (focusSelector) {
      const target = this.container.querySelector(focusSelector);
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
    if (focused) {
      const input = this.container.querySelector('#fc-typed-answer');
      if (input && !input.disabled) {
        input.focus();
        input.setSelectionRange(caret, end);
      }
    }
  }
  origin(c) {
    return c.answerOrigin === 'SOURCE_KEY'
      ? 'Printed source key'
      : c.answerOrigin === 'STUDENT_EDITED'
        ? 'Student edited'
        : c.aiReviewed
          ? 'AI reviewed; verify with source'
          : c.sourceDeckType === 'NOTE'
            ? 'Study note'
            : c.sourceDeckType === 'QUIZ'
              ? 'AI answer; check your source'
              : 'Saved card';
  }
  sourceNote(c) {
    const e = (v) => this.escape(v),
      refs = FlashcardTools.references(c.sourceReferences);
    return c.evidenceQuote || c.sourceTitle || refs.length
      ? `<details class="fc-source"><summary>Source / references</summary>${c.sourceTitle ? `<p>${e(c.sourceTitle)}${c.sourcePage ? ` · PDF page ${Number(c.sourcePage)}` : ''}</p>` : ''}${c.evidenceQuote ? `<blockquote>${e(c.evidenceQuote)}</blockquote>` : ''}${refs.map((r, i) => `<button type="button" class="btn btn-secondary btn-sm" data-action="source" data-ref="${i}">${e(r.fileName || 'Source')}${r.page ? ` · Page ${Number(r.page)}` : ''}</button>`).join('')}${!refs.length && ['NOTE', 'QUIZ'].includes(c.sourceDeckType) ? '<button type="button" class="btn btn-secondary btn-sm" data-action="source" data-ref="-1">Open source context</button>' : ''}<p>Recall ratings reflect confidence, not independently verified knowledge.</p></details>`
      : '';
  }
  toggleFlip(reveal = null) {
    if (this.busy() || this.activeTab !== 'study') return;
    this.stopSpeech();
    this.isFlipped = reveal === null ? !this.isFlipped : Boolean(reveal);
    this.renderStudyCard();
    this.focusStudy(this.mode === 'TYPE' ? 'answer' : 'flip');
    this.persistSession();
    if (this.isFlipped && window.innerWidth <= 820) {
      const version = this._version,
        key = this.cards[this.currentIndex]?.cardKey;
      requestAnimationFrame(() => {
        if (
          version === this._version &&
          this.isVisible() &&
          this.isFlipped &&
          key === this.cards[this.currentIndex]?.cardKey
        )
          this.container
            .querySelector('.fc-answer')
            ?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      });
    }
    window.audioEngine?.playClick();
  }
  async openCardSource(index = -1) {
    if (this.busy()) return;
    const card = this.cards[this.currentIndex],
      version = this._version;
    if (!card) return;
    const refs = FlashcardTools.references(card.sourceReferences),
      ref = refs[index];
    const source =
      card.sourceDeckType === 'NOTE'
        ? await getNoteById(card.sourceDeckId)
        : card.sourceDeckType === 'QUIZ'
          ? await db.quizzes.get(Number(card.sourceDeckId))
          : null;
    if (
      version !== this._version ||
      !this.isVisible() ||
      this.busy() ||
      this.cards[this.currentIndex]?.cardKey !== card.cardKey
    )
      return;
    const original = source?.originalSource || {},
      files = Array.isArray(original.files) ? original.files : [];
    const file = ref
      ? files.find((f) => f && f.name === ref.fileName)
      : files.find((f) => f && typeof f.data === 'string');
    let url = null,
      mime = null;
    // Original files are local PDF/images only. Never embed arbitrary HTML/URLs.
    const encoded =
      typeof file?.data === 'string' &&
      file.data.match(
        /^data:(application\/pdf|image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/,
      );
    if (encoded) {
      try {
        mime = encoded[1];
        const binary = atob(encoded[2]),
          bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      } catch {
        url = null;
      }
    }
    const page = ref?.page || card.sourcePage || 1;
    const pages = (Array.isArray(original.pages) ? original.pages : []).filter(
      (p) =>
        p &&
        (!ref || p.fileName === ref.fileName) &&
        (!ref?.page || Number(p.page || p.pageNumber) === ref.page),
    );
    const text =
      pages
        .map((p) => FlashcardTools.text(p.text))
        .filter(Boolean)
        .join('\n\n') ||
      FlashcardTools.text(original.text) ||
      FlashcardTools.text(source?.content) ||
      card.evidenceQuote ||
      [card.front, card.back, card.explanation].filter(Boolean).join('\n\n');
    const body = `<p>${this.escape(ref?.fileName || source?.title || card.sourceTitle || 'Saved source')}${ref?.page || card.sourcePage || url ? ' · Page ' + page : ' · Saved context'}</p>${url ? (mime === 'application/pdf' ? `<iframe class="fc-source-document" title="Original PDF source" src="${url}#page=${page}"></iframe>` : `<img class="fc-source-image" src="${url}" alt="Original uploaded study page">`) : '<p class="fc-notice">The original file is unavailable. Saved source context is shown below; it may differ from the original page layout.</p>'}<details ${url ? '' : 'open'}><summary>Saved text / context</summary><pre class="fc-source-text">${this.escape(text)}</pre></details>`;
    const dialog = this.openModal('Source reference', body);
    if (url) {
      if (dialog) dialog._sourceURL = url;
      else URL.revokeObjectURL(url);
    }
  }
  async rateCard(rating) {
    if (
      this.busy() ||
      this.activeTab !== 'study' ||
      !this.isFlipped ||
      ![1, 2, 3, 4].includes(rating)
    )
      return;
    const card = this.cards[this.currentIndex];
    if (!card) return;
    const session = this._session,
      index = this.currentIndex,
      version = this._version;
    this._saving = true;
    ++this._reviewEpoch;
    const before = {
      cards: structuredClone(this.cards),
      ratings: Array.from(this.ratingsMap),
      counts: { ...this.reviewCounts },
      index,
    };
    this.renderStudyCard();
    try {
      const record = await saveCardReviewProgress(
        card.cardKey,
        card.sourceDeckId,
        card.sourceDeckType,
        rating,
        { token: crypto.randomUUID(), fingerprint: card.contentFingerprint },
      );
      if (!record) throw Error('Review could not be saved. Try again.');
      if (session !== this._session) return;
      this.library = null;
      this.ratingsMap.set(card.cardKey, rating);
      this.reviewCounts[card.cardKey] =
        (this.reviewCounts[card.cardKey] || 0) + 1;
      for (const c of [...this.cards, ...this.masterDeckCards])
        if (c.cardKey === card.cardKey) c.srs = record;
      this.undoState = { before, record };
      this._saving = false;
      if (
        rating === 1 &&
        this.reviewCounts[card.cardKey] < 3 &&
        !this.cards.slice(index + 1).some((c) => c.cardKey === card.cardKey)
      )
        this.cards.splice(
          Math.min(this.cards.length, index + 3),
          0,
          structuredClone(card),
        );
      if (
        version === this._version &&
        (!app.currentView || app.currentView === 'flashcards')
      )
        this.advanceOrFinish();
      else {
        this.currentIndex = Math.min(index + 1, this.cards.length - 1);
        if (index + 1 >= this.cards.length) this.activeTab = 'summary';
        this.resetFace();
        this.persistSession();
      }
      if (rating >= 3) window.audioEngine?.playSuccess();
      else window.audioEngine?.playClick();
    } catch (error) {
      if (session === this._session)
        this.toast(`Review not saved: ${error.message}`, 'error');
    } finally {
      if (session === this._session) {
        this._saving = false;
        if (this.isVisible() && ['study', 'summary'].includes(this.activeTab))
          this.render();
      }
    }
  }
  async undoRating() {
    if (this.busy() || !this.undoState) return;
    const session = this._session,
      u = this.undoState;
    this._saving = true;
    ++this._reviewEpoch;
    try {
      await undoCardReviewProgress(u.record);
      if (session !== this._session) return;
      this.cards = u.before.cards;
      const schedules = new Map(this.cards.map((c) => [c.cardKey, c.srs]));
      for (const c of this.masterDeckCards)
        if (schedules.has(c.cardKey)) c.srs = schedules.get(c.cardKey);
      this.ratingsMap = new Map(u.before.ratings);
      this.reviewCounts = u.before.counts;
      this.currentIndex = u.before.index;
      this.undoState = null;
      this.activeTab = 'study';
      this.resetFace();
      this.persistSession();
    } catch (error) {
      if (session === this._session) this.toast(error.message, 'error');
    } finally {
      if (session === this._session) {
        this._saving = false;
        if (this.isVisible()) {
          this.attachKeyboard();
          this.render();
          this.focusStudy();
        }
      }
    }
  }
  advanceOrFinish() {
    this.stopSpeech();
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.resetFace();
      this.renderStudyCard();
      this.focusStudy();
      this.persistSession();
    } else this.renderDeckSummary();
  }
  nextCard() {
    if (this.busy()) return;
    this.advanceOrFinish();
  }
  prevCard() {
    if (this.busy() || this.currentIndex === 0) return;
    this.stopSpeech();
    this.currentIndex--;
    this.resetFace();
    this.renderStudyCard();
    this.focusStudy();
    this.persistSession();
  }
  renderDeckSummary() {
    this.activeTab = 'summary';
    this.detachKeyboard();
    this.stopSpeech();
    const total = this.sessionKeys?.size || this.masterDeckCards.length,
      reviewed = this.ratingsMap.size,
      confident = Array.from(this.ratingsMap.values()).filter(
        (r) => r >= 3,
      ).length,
      weak = Array.from(this.ratingsMap.values()).filter((r) => r <= 2).length;
    this.container.innerHTML = `<div class="page-column fc-summary"><div class="glass-panel" tabindex="-1" role="region" aria-label="Session summary"><span class="badge badge-primary">Session summary</span><h2>${this.escape(this.currentDeck?.title)}</h2><p>${reviewed}/${total} unique cards reviewed · ${Math.max(0, total - reviewed)} not reviewed</p><h3>Recall confidence: ${reviewed ? Math.round((confident / reviewed) * 100) : 0}%</h3><p>Based on Good/Easy ratings among reviewed cards. This is not a test of factual mastery.</p><div class="fc-summary-grid">${['Again', 'Hard', 'Good', 'Easy'].map((s, i) => `<div><strong>${Array.from(this.ratingsMap.values()).filter((r) => r === i + 1).length}</strong><span>${s}</span></div>`).join('')}</div><p>Saved cards keep their actual next-review schedules.</p><div class="fc-row"><button class="btn btn-primary" data-action="weak" ${weak ? '' : 'disabled'}>Practice weak cards (${weak})</button><button class="btn btn-secondary" data-action="restart">Restart full deck</button><button class="btn btn-secondary" data-action="undo" ${this.undoState ? '' : 'disabled'}>Undo last rating</button><button class="btn btn-secondary" data-action="pdf">Export sheet</button><button class="btn btn-secondary" data-action="exit">All decks</button></div></div></div>`;
    this.bind();
    if (this.isVisible())
      this.container
        .querySelector('.fc-summary>.glass-panel')
        ?.focus({ preventScroll: true });
    this.persistSession();
    if (!this._celebrated && reviewed === total && total) {
      this._celebrated = true;
      window.app?.fireCelebrationConfetti?.();
    }
  }
  restartWithWeakCards() {
    if (this.busy()) return;
    this.cards = this.masterDeckCards
      .filter(
        (c) =>
          this.ratingsMap.has(c.cardKey) && this.ratingsMap.get(c.cardKey) <= 2,
      )
      .map((c) => ({
        ...c,
        srs: this.cards.find((x) => x.cardKey === c.cardKey)?.srs || c.srs,
      }));
    if (this.cards.length) this.startStudySession({ preserveMaster: true });
  }
  restartFullDeck() {
    if (this.busy()) return;
    this.cards = structuredClone(this.masterDeckCards).map((c) => ({
      ...c,
      srs: this.cards.find((x) => x.cardKey === c.cardKey)?.srs || c.srs,
    }));
    this.startStudySession({ preserveMaster: true });
  }
  fisherYatesShuffle(cards) {
    const copy = [...cards];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  shuffleCurrentDeck() {
    if (this.busy()) return;
    this.stopSpeech();
    this.cards = [
      ...this.cards.slice(0, this.currentIndex),
      ...this.fisherYatesShuffle(this.cards.slice(this.currentIndex)),
    ];
    this.resetFace();
    this.renderStudyCard();
    this.focusStudy();
    this.persistSession();
    this.toast('Remaining cards shuffled; progress kept.');
  }
  confirmExitSession() {
    if (!this._saving) this.exitSession();
  }
  exitSession() {
    this.persistSession();
    ++this._version;
    this.activeTab = 'decks';
    this.detachKeyboard();
    this.stopSpeech();
    this.render();
  }
  savedSession() {
    try {
      const s = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      return s?.version === 1 &&
        s.deck &&
        Array.isArray(s.keys) &&
        s.keys.length &&
        s.keys.length <= 60000 &&
        Array.isArray(s.masterKeys) &&
        s.masterKeys.length <= 20000 &&
        Array.isArray(s.ratings) &&
        s.ratings.length <= 20000
        ? s
        : null;
    } catch {
      return null;
    }
  }
  persistSession() {
    clearTimeout(this._sessionDebounce);
    if (
      !['study', 'summary'].includes(this.activeTab) ||
      !this.currentDeck ||
      !this.cards.length
    )
      return;
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          deck: this.currentDeck,
          keys: this.cards.map((c) => [c.cardKey, c.contentFingerprint]),
          masterKeys: this.masterDeckCards.map((c) => [
            c.cardKey,
            c.contentFingerprint,
          ]),
          index: this.currentIndex,
          ratings: Array.from(this.ratingsMap),
          sessionKeys: Array.from(this.sessionKeys || []),
          counts: this.reviewCounts,
          mode: this.mode,
          answer: this.answerDraft,
          flipped: this.isFlipped,
          tab: this.activeTab,
        }),
      );
    } catch {
      if (!this._storageWarned) {
        this._storageWarned = true;
        this.toast(
          'Session could not be saved here. Saved review schedules are kept.',
          'warning',
        );
      }
    }
  }
  async resumeSession() {
    if (this.busy()) return;
    const epoch = this._reviewEpoch;
    const saved = this.savedSession();
    if (!saved) return;
    const version = ++this._version,
      l = await getFlashcardLibrary();
    if (version !== this._version || this.busy() || epoch !== this._reviewEpoch)
      return;
    const map = new Map(l.cards.map((c) => [c.cardKey, c]));
    const restore = (keys) =>
      keys
        .map((key, oldIndex) => ({
          oldIndex,
          card: Array.isArray(key) && map.get(key[0]),
        }))
        .filter(
          ({ card, oldIndex }) =>
            card &&
            (card.contentFingerprint === keys[oldIndex][1] ||
              card.migrationFingerprints?.includes(keys[oldIndex][1])),
        )
        .map(({ card, oldIndex }) => ({
          oldIndex,
          card: structuredClone(card),
        }));
    const restored = restore(saved.keys),
      queue = restored.map((row) => row.card),
      master = restore(saved.masterKeys).map((row) => row.card);
    if (!queue.length || !master.length) {
      localStorage.removeItem(this.storageKey);
      this.toast(
        'Saved cards changed or were deleted. Start a fresh session.',
        'warning',
      );
      return this.renderDecksList();
    }
    const oldIndex = Math.max(0, Math.floor(Number(saved.index) || 0)),
      exact = restored.findIndex((row) => row.oldIndex === oldIndex),
      next = restored.findIndex((row) => row.oldIndex > oldIndex),
      valid = new Set(master.map((c) => c.cardKey));
    this.sessionKeys = new Set(
      (Array.isArray(saved.sessionKeys)
        ? saved.sessionKeys
        : master.map((c) => c.cardKey)
      ).filter((key) => valid.has(key)),
    );
    this.currentDeck = saved.deck;
    this.cards = queue;
    this.masterDeckCards = master;
    this.currentIndex =
      exact >= 0 ? exact : next >= 0 ? next : queue.length - 1;
    this.ratingsMap = new Map(
      saved.ratings.filter(
        (row) =>
          Array.isArray(row) &&
          this.sessionKeys.has(row[0]) &&
          [1, 2, 3, 4].includes(row[1]),
      ),
    );
    this.reviewCounts = {};
    for (const key of valid)
      this.reviewCounts[key] = Math.max(
        0,
        Math.min(3, Number(saved.counts?.[key]) || 0),
      );
    this.mode = saved.mode === 'TYPE' ? 'TYPE' : 'FLIP';
    this.answerDraft =
      exact >= 0 && typeof saved.answer === 'string'
        ? saved.answer.slice(0, 12000)
        : '';
    this.isFlipped = exact >= 0 && Boolean(saved.flipped);
    this.answerChecked = Boolean(this.isFlipped && this.mode === 'TYPE');
    this.undoState = null;
    ++this._session;
    this.activeTab = saved.tab === 'summary' ? 'summary' : 'study';
    this.attachKeyboard();
    this.render();
    this.focusStudy(this.isFlipped ? 'answer' : 'prompt');
    this.persistSession();
    if (queue.length !== saved.keys.length)
      this.toast(
        'Changed/deleted cards were omitted from the restored session.',
        'warning',
      );
  }
  focusStudy(target = 'prompt') {
    if (!this.isVisible() || this.activeTab !== 'study') return;
    const selector =
      target === 'flip'
        ? '[data-action=flip]'
        : target === 'answer'
          ? '.fc-answer'
          : '.fc-prompt';
    const el = this.container.querySelector(selector);
    if (el) {
      if (!el.matches('button')) el.tabIndex = -1;
      el.focus({ preventScroll: true });
    }
  }
  resetSession({ clearDrafts = false } = {}) {
    this.onLeaveView();
    ++this._session;
    this._saving = false;
    this.currentDeck = null;
    this.cards = [];
    this.masterDeckCards = [];
    this.ratingsMap.clear();
    this.reviewCounts = {};
    this.sessionKeys = new Set();
    this.undoState = null;
    this.activeTab = 'decks';
    this._cleaned = false;
    try {
      localStorage.removeItem(this.storageKey);
      if (clearDrafts) localStorage.removeItem('hamsa_flashcard_drafts');
    } catch {}
  }
  onLeaveView() {
    this.persistSession();
    this.persistModalDraft();
    ++this._version;
    clearTimeout(this._searchDebounce);
    clearTimeout(this._dueTimer);
    this.detachKeyboard();
    this.stopSpeech();
    this.closeModal(true, false);
  }
  attachKeyboard() {
    window.removeEventListener('keydown', this._boundKey);
    window.addEventListener('keydown', this._boundKey);
  }
  detachKeyboard() {
    window.removeEventListener('keydown', this._boundKey);
  }
  handleKeydown(event) {
    if (
      this.activeTab !== 'study' ||
      !this.isVisible() ||
      this.busy() ||
      event.defaultPrevented ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return;
    if (
      event.target?.closest?.(
        'a,input,textarea,select,summary,[contenteditable="true"]',
      )
    )
      return;
    if (
      event.target?.closest?.('button') &&
      (event.code === 'Space' || event.key === 'Enter')
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.toggleFlip();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevCard();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextCard();
    } else if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      this.rateCard(Number(event.key));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.confirmExitSession();
    }
  }
  attachTouchSwipe() {
    const el = document.getElementById('flashcard-scene');
    if (!el) return;
    let g = null;
    el.addEventListener(
      'touchstart',
      (event) => {
        if (
          event.touches.length !== 1 ||
          !this.swipeRatings ||
          event.target.closest(
            'button,input,textarea,select,summary,a,pre,code,table,.fc-math',
          )
        ) {
          g = null;
          return;
        }
        for (
          let target = event.target;
          target && target !== el;
          target = target.parentElement
        ) {
          if (
            target.scrollWidth > target.clientWidth + 1 &&
            /auto|scroll/.test(getComputedStyle(target).overflowX)
          ) {
            g = null;
            return;
          }
        }
        g = {
          key: this.cards[this.currentIndex]?.cardKey,
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          dx: 0,
          dy: 0,
        };
      },
      { passive: true },
    );
    el.addEventListener(
      'touchmove',
      (event) => {
        if (!g) return;
        if (event.touches.length !== 1) {
          g = null;
          return;
        }
        g.dx = event.touches[0].clientX - g.x;
        g.dy = event.touches[0].clientY - g.y;
      },
      { passive: true },
    );
    el.addEventListener('touchcancel', () => (g = null), { passive: true });
    el.addEventListener(
      'touchend',
      () => {
        const last = g;
        g = null;
        if (
          last &&
          this.swipeRatings &&
          last.key === this.cards[this.currentIndex]?.cardKey &&
          Math.abs(last.dx) > 90 &&
          Math.abs(last.dx) > Math.abs(last.dy) * 1.5 &&
          this.isFlipped &&
          !this.busy()
        )
          this.rateCard(last.dx > 0 ? 3 : 1);
      },
      { passive: true },
    );
  }
  speakCardText(event, face) {
    event?.stopPropagation();
    if (!window.speechSynthesis)
      return this.toast('Read aloud is unavailable.', 'warning');
    if (this.isSpeaking) return this.stopSpeech();
    const c = this.cards[this.currentIndex];
    if (!c) return;
    this.stopSpeech();
    const text =
        face === 'front' ? c.front : `${c.back}. ${c.explanation || ''}`,
      u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
    window.studyPreferences?.applySpeech(u, text);
    this.isSpeaking = true;
    const token = this._speechToken;
    u.onend = u.onerror = () => {
      if (token === this._speechToken) this.isSpeaking = false;
    };
    speechSynthesis.speak(u);
  }
  stopSpeech() {
    this._speechToken = (this._speechToken || 0) + 1;
    window.speechSynthesis?.cancel();
    this.isSpeaking = false;
  }
  exportCurrentDeckToPdf() {
    const cards = (
      this.masterDeckCards.length ? this.masterDeckCards : this.cards
    )
      .map((c) => FlashcardTools.normalize(c))
      .filter(Boolean);
    if (!cards.length) return this.toast('No cards to export.', 'warning');
    const html = `<style>.fc-print .fc-math{display:inline-block;max-width:100%;overflow-wrap:anywhere}.fc-print math{font-size:1.1em}.fc-print{font-family:'Noto Sans Devanagari',sans-serif;color:#172033;line-height:1.5}.fc-print table{border-collapse:collapse;width:100%;table-layout:fixed}.fc-print td,.fc-print th{border:1px solid #bbb;padding:8px;vertical-align:top;font-size:11px;overflow-wrap:anywhere}.fc-print tr{break-inside:avoid}.fc-print h1{font-size:20px}.fc-print p{margin:6px 0}</style><article class="fc-print"><h1>${this.escape(this.currentDeck?.title || 'Flashcards')}</h1><p>${cards.length} flashcards · ${this.escape(new Date().toLocaleDateString())}</p><table><thead><tr><th>Front / prompt</th><th>Answer & context</th></tr></thead><tbody>${cards.map((c, i) => `<tr><td><b>${i + 1}.</b>${FlashcardTools.format(c.front)}${(c.options || []).map((o, j) => `<p>${'ABCD'[j]}. ${this.escape(o)}</p>`).join('')}</td><td>${FlashcardTools.format(c.back, { formula: c.badge === 'Formula' })}${FlashcardTools.format(c.explanation)}${(c.optionExplanations || []).map((reason, j) => (reason ? `<p><b>${'ABCD'[j]}:</b> ${this.escape(reason)}</p>` : '')).join('')}${c.memoryCue ? `<p>Memory cue: ${this.escape(c.memoryCue)}</p>` : ''}${c.evidenceQuote ? `<blockquote>${this.escape(c.evidenceQuote)}</blockquote>` : ''}${(c.sourceReferences || []).map((ref) => `<p>${this.escape(ref.fileName || 'Source')}${ref.page ? ' · Page ' + Number(ref.page) : ''}</p>`).join('')}<p>${this.escape(this.origin(c))}</p><p>${this.escape(c.sourceTitle || '')} ${c.sourcePage ? '· Page ' + Number(c.sourcePage) : ''}</p></td></tr>`).join('')}</tbody></table></article>`;
    if (window.pdfGenerator?.openPrintWindow(html))
      this.toast('Print preview opened. Choose Save as PDF.', 'success');
  }
  readDrafts() {
    try {
      const raw = JSON.parse(
          localStorage.getItem('hamsa_flashcard_drafts') || '{}',
        ),
        result = {};
      const names = new Set([
        'title',
        'subject',
        'description',
        'front',
        'back',
        'explanation',
        'content',
        'format',
      ]);
      for (const [key, draft] of Object.entries(raw).slice(-20)) {
        if (
          !/^(deck:new|(?:deck|card|add|import):\d+)$/.test(key) ||
          !draft?.data
        )
          continue;
        const data = {};
        for (const [name, value] of Object.entries(draft.data))
          if (names.has(name) && typeof value === 'string')
            data[name] = value.slice(0, name === 'content' ? 2000000 : 20000);
        result[key] = { data, updatedAt: draft.updatedAt };
      }
      return result;
    } catch {
      return {};
    }
  }
  modalValues(dialog) {
    return Object.fromEntries(
      [...dialog.querySelectorAll('[name]')]
        .filter((field) => field.type !== 'file')
        .map((field) => [field.name, field.value]),
    );
  }
  clearDraft(key, expected = null) {
    try {
      const drafts = this.readDrafts();
      if (
        expected &&
        JSON.stringify(drafts[key]?.data) !== JSON.stringify(expected)
      )
        return;
      delete drafts[key];
      localStorage.setItem('hamsa_flashcard_drafts', JSON.stringify(drafts));
    } catch {}
  }
  persistModalDraft(dialog = this.modal) {
    clearTimeout(this._draftDebounce);
    if (!dialog?._draftKey) return;
    const data = this.modalValues(dialog);
    if (JSON.stringify(data) === JSON.stringify(dialog._initialValues)) {
      this.clearDraft(dialog._draftKey);
      return;
    }
    try {
      const drafts = this.readDrafts();
      drafts[dialog._draftKey] = { data, updatedAt: new Date().toISOString() };
      localStorage.setItem('hamsa_flashcard_drafts', JSON.stringify(drafts));
    } catch {
      if (!this._draftWarned) {
        this._draftWarned = true;
        this.toast(
          'This draft could not be saved on the device. Keep this form open until you save it.',
          'warning',
        );
      }
    }
  }
  openModal(title, body, onSubmit = null, { draftKey = null } = {}) {
    this.closeModal(false, false);
    if (this.modal || !this.isVisible()) return;
    this._modalFocus = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'fc-modal';
    d.setAttribute('aria-label', title);
    d.innerHTML = `<form class="fc-modal-form"><header class="fc-row"><h2>${this.escape(title)}</h2><button type="button" class="btn btn-secondary btn-sm" data-close>Close</button></header><div class="fc-modal-body">${body}</div></form>`;
    document.body.appendChild(d);
    this.modal = d;
    d._draftKey = draftKey;
    d._initialValues = this.modalValues(d);
    const draft = this.readDrafts()[draftKey];
    if (draft?.data) {
      for (const [name, value] of Object.entries(draft.data)) {
        const field = d.querySelector('[name="' + name + '"]');
        if (field && typeof value === 'string') field.value = value;
      }
      const hint = document.createElement('p');
      hint.className = 'fc-draft-hint';
      hint.textContent = 'Draft restored on this device.';
      d.querySelector('.fc-modal-body').prepend(hint);
    }
    if (draftKey) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary btn-sm';
      button.textContent = 'Discard draft';
      button.onclick = () => {
        this.clearDraft(draftKey);
        for (const [name, value] of Object.entries(d._initialValues)) {
          const field = d.querySelector('[name="' + name + '"]');
          if (field) field.value = value;
        }
        d.querySelector('.fc-draft-hint')?.remove();
      };
      d.querySelector('.fc-modal-body').append(button);
      d.addEventListener('input', () => {
        clearTimeout(this._draftDebounce);
        this._draftDebounce = setTimeout(() => this.persistModalDraft(d), 200);
      });
      d.addEventListener('change', () => this.persistModalDraft(d));
    }
    const owned = () => this.modal === d && this.isVisible();
    d.querySelector('[data-close]').onclick = () => this.closeModal();
    d.addEventListener('cancel', (event) => {
      if (this._modalSaving) event.preventDefault();
    });
    d.addEventListener('close', () => {
      if (this.modal === d) this.closeModal(false, true);
    });
    d.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      if (!onSubmit || this._modalSaving || d._fileLoading || !owned()) return;
      const formData = new FormData(event.target);
      this.persistModalDraft(d);
      this._modalSaving = true;
      const controls = [
        ...d.querySelectorAll('button,input,textarea,select'),
      ].map((el) => [el, el.disabled]);
      controls.forEach(([el]) => (el.disabled = true));
      try {
        await onSubmit(formData, owned, d);
        if (draftKey)
          this.clearDraft(
            draftKey,
            Object.fromEntries(
              [...formData].filter(([, value]) => typeof value === 'string'),
            ),
          );
      } catch (error) {
        this.toast(error.message, 'error');
      } finally {
        if (this.modal === d) {
          this._modalSaving = false;
          controls.forEach(([el, disabled]) => (el.disabled = disabled));
        }
      }
    };
    d.showModal();
    d.querySelector('input,textarea,select')?.focus();
    return d;
  }
  closeModal(force = false, refresh = true) {
    if (this._modalSaving && !force) return;
    const d = this.modal;
    if (!d) return;
    this.persistModalDraft(d);
    this.modal = null;
    this._modalSaving = false;
    if (d.open) d.close();
    if (d._sourceURL) URL.revokeObjectURL(d._sourceURL);
    d.remove();
    this._modalFocus?.isConnected && this._modalFocus.focus();
    if (refresh && this.activeTab === 'decks' && this.isVisible())
      this.renderDecksList();
  }
  openCreateDeckModal() {
    this.openModal(
      'Create flashcard deck',
      `<label>Title<input name="title" required maxlength="200" placeholder="2026 UPSC — Polity"></label><label>Subject<input name="subject" required maxlength="120" placeholder="Polity, Science, Vocabulary…"></label><label>Description<textarea name="description" maxlength="2000"></textarea></label><button class="btn btn-primary" type="submit">Create & add cards</button>`,
      async (form, owned) => {
        const id = await createCustomDeck(Object.fromEntries(form));
        if (!owned()) return;
        this._modalSaving = false;
        this.closeModal(false, false);
        this.toast('Deck created.', 'success');
        const version = this._version + 1;
        await this.renderDecksList();
        if (
          version === this._version &&
          this.activeTab === 'decks' &&
          this.isVisible()
        )
          this.openAddCardModal(id);
      },
      { draftKey: 'deck:new' },
    );
  }
  async openEditDeck(id) {
    const version = this._version,
      d = await getCustomDeckWithCards(id);
    if (version !== this._version || !this.isVisible() || !d) return;
    this.openModal(
      'Edit deck',
      `<label>Title<input name="title" required maxlength="200" value="${this.escape(d.title)}"></label><label>Subject<input name="subject" required maxlength="120" value="${this.escape(d.subject)}"></label><label>Description<textarea name="description" maxlength="2000">${this.escape(d.description)}</textarea></label><button class="btn btn-primary" type="submit">Save deck</button>`,
      async (form, owned) => {
        await updateCustomDeck(id, Object.fromEntries(form));
        if (!owned()) return;
        this._modalSaving = false;
        this.closeModal(false, false);
        await this.renderDecksList();
        this.toast('Deck updated.', 'success');
      },
      { draftKey: 'deck:' + id },
    );
  }
  openAddCardModal(id, title = '', card = null) {
    this.openModal(
      card ? 'Edit flashcard' : 'Add flashcards',
      `<p>${this.escape(title)} · Front and answer are required.</p><label>Front<textarea name="front" required maxlength="12000">${this.escape(card?.front)}</textarea></label><label>Back / answer<textarea name="back" required maxlength="12000">${this.escape(card?.back)}</textarea></label><label>Explanation / memory hook<textarea name="explanation" maxlength="20000">${this.escape(card?.explanation)}</textarea></label><button class="btn btn-primary" type="submit">${card ? 'Save changes' : 'Save & add another'}</button>`,
      async (form, owned, dialog) => {
        const data = Object.fromEntries(form);
        if (card) {
          await updateCustomCard(card.id, data);
          if (!owned()) return;
          this._modalSaving = false;
          this.closeModal(false, false);
          await this.openManager(id);
        } else {
          await addCustomCard({ deckId: id, ...data });
          if (!owned()) return;
          const f = dialog.querySelector('form');
          f?.reset();
          f?.querySelector('[name=front]')?.focus();
          this.toast('Card saved.', 'success');
        }
        this._cleaned = false;
      },
      { draftKey: card ? 'card:' + card.id : 'add:' + id },
    );
  }
  async deleteDeckPrompt(id) {
    const version = this._version,
      d = await getCustomDeckWithCards(id);
    if (version !== this._version || !this.isVisible() || !d) return;
    app.showConfirmation({
      title: 'Delete deck?',
      message: `Delete “${d.title}” and its ${d.cards.length} cards and revision progress?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await deleteCustomDeck(id);
          this._cleaned = false;
          if (version === this._version && this.isVisible())
            await this.renderDecksList();
          this.toast('Deck and revision progress deleted.');
        } catch (error) {
          this.toast(error.message, 'error');
        }
      },
    });
  }
  async openManager(id) {
    if (this._modalSaving || !this.isVisible()) return;
    const version = ++this._version,
      d = await getCustomDeckWithCards(id);
    if (version !== this._version || !d) return;
    this.managerDeck = d;
    this.managerSearch = '';
    this.managerPage = 0;
    this.openModal('Manage cards', '<div id="fc-manager-content"></div>');
    this.paintManager();
  }
  paintManager(focus = false, caret = 0) {
    const root = this.modal?.querySelector('#fc-manager-content');
    if (!root || !this.managerDeck) return;
    const d = this.managerDeck,
      e = (v) => this.escape(v),
      cards = d.cards.filter((c) =>
        [c.front, c.back].some((t) =>
          String(t)
            .toLowerCase()
            .includes((this.managerSearch || '').toLowerCase()),
        ),
      );
    this.managerPage = Math.min(
      this.managerPage || 0,
      Math.max(0, Math.ceil(cards.length / 10) - 1),
    );
    root.innerHTML = `<h3>${e(d.title)}</h3><div class="fc-row"><button class="btn btn-primary btn-sm" type="button" data-manager="add">Add card</button><button class="btn btn-secondary btn-sm" type="button" data-manager="bulk">Import / cloze</button></div><input id="fc-manager-search" aria-label="Search cards" placeholder="Search cards…" value="${e(this.managerSearch)}">${
      cards
        .slice(this.managerPage * 10, this.managerPage * 10 + 10)
        .map(
          (c) =>
            `<article class="fc-manager-card"><strong>${e(c.front)}</strong><p>${e(c.back)}</p><div class="fc-row"><button class="btn btn-secondary btn-sm" type="button" data-manager="edit" data-id="${Number(c.id)}">Edit</button><button class="btn btn-secondary btn-sm" type="button" data-manager="delete" data-id="${Number(c.id)}">Delete</button></div></article>`,
        )
        .join('') || '<p>No matching cards.</p>'
    }${this.pagination(cards.length, 10, this.managerPage, 'manager-page')}`;
    root.oninput = (event) => {
      if (event.target.id === 'fc-manager-search') {
        this.managerSearch = event.target.value;
        this.managerPage = 0;
        this.paintManager(true, event.target.selectionStart);
      }
    };
    root.onclick = async (event) => {
      const b = event.target.closest('button');
      if (!b || b.disabled) return;
      try {
        if (b.dataset.action === 'manager-page') {
          this.managerPage = Number(b.dataset.page);
          this.paintManager();
        } else if (b.dataset.manager === 'add')
          this.openAddCardModal(d.id, d.title);
        else if (b.dataset.manager === 'bulk') this.openBulkImport(d.id);
        else if (b.dataset.manager === 'edit')
          this.openAddCardModal(
            d.id,
            d.title,
            d.cards.find((c) => c.id === Number(b.dataset.id)),
          );
        else if (b.dataset.manager === 'delete') {
          const c = d.cards.find((c) => c.id === Number(b.dataset.id));
          this.closeModal(false, false);
          const version = this._version;
          app.showConfirmation({
            title: 'Delete card?',
            message: `Delete “${c.front}” and its revision schedule?`,
            confirmText: 'Delete',
            onCancel: async () => {
              if (version === this._version && this.isVisible())
                await this.openManager(d.id);
            },
            onConfirm: async () => {
              try {
                await deleteCustomCard(c.id);
                if (version === this._version && this.isVisible())
                  await this.openManager(d.id);
              } catch (error) {
                this.toast(error.message, 'error');
                if (version === this._version && this.isVisible())
                  await this.openManager(d.id);
              }
            },
          });
        }
      } catch (error) {
        this.toast(error.message, 'error');
      }
    };
    if (focus) {
      const field = root.querySelector('#fc-manager-search');
      field.focus();
      field.setSelectionRange(
        Math.min(caret, field.value.length),
        Math.min(caret, field.value.length),
      );
    }
  }
  openBulkImport(id) {
    const d = this.openModal(
      'Import cards / fill in the blank',
      `<label>Format<select name="format"><option value="CSV">CSV: front,back,explanation</option><option value="CLOZE">Cloze: one sentence per line</option></select></label><p>CSV supports quoted commas and newlines. Cloze example: Water freezes at {{c1::0°C}}. Duplicates are skipped.</p><label>CSV file (optional)<input id="fc-csv-file" type="file" accept=".csv,text/csv"></label><label>Paste content<textarea name="content" required maxlength="2000000" rows="7"></textarea></label><div id="fc-import-preview" aria-live="polite"></div><button class="btn btn-secondary" type="button" id="fc-preview-import">Preview import</button><button class="btn btn-primary" type="submit">Import validated cards</button>`,
      async (form, owned) => {
        const result = await importCustomCards(id, this.parseImport(form));
        if (!owned()) return;
        this._modalSaving = false;
        this.closeModal(false, false);
        this.toast(
          `${result.added} imported; ${result.duplicates} duplicates skipped.`,
          'success',
        );
        await this.openManager(id);
      },
      { draftKey: 'import:' + id },
    );
    if (!d) return;
    let previewVersion = 0,
      fileVersion = 0;
    const loading = (value) => {
      d._fileLoading = value;
      d.querySelectorAll(
        '[type=submit],.fc-modal-body button,[name=content],[name=format]',
      ).forEach((el) => (el.disabled = value));
      d.querySelector('#fc-import-preview').textContent = value
        ? 'Reading CSV file…'
        : '';
    };
    d.querySelector('#fc-csv-file').onchange = async (event) => {
      if (this._modalSaving) return;
      const version = ++fileVersion;
      ++previewVersion;
      const f = event.target.files?.[0];
      if (!f) {
        loading(false);
        return;
      }
      if (f.size > 2000000) {
        loading(false);
        return this.toast('Use a CSV up to 2 MB.', 'error');
      }
      loading(true);
      try {
        const text = await f.text();
        if (this.modal === d && version === fileVersion) {
          if (text.length > 2000000) throw Error('Use a CSV up to 2 MB.');
          d.querySelector('[name=content]').value = text;
          d.querySelector('[name=format]').value = 'CSV';
          loading(false);
          this.persistModalDraft(d);
          d.querySelector('#fc-import-preview').replaceChildren();
        }
      } catch (error) {
        if (this.modal === d && version === fileVersion)
          this.toast(`CSV could not be read: ${error.message}`, 'error');
      } finally {
        if (this.modal === d && version === fileVersion) loading(false);
      }
    };
    d.addEventListener('input', () => {
      ++previewVersion;
      d.querySelector('#fc-import-preview').replaceChildren();
    });
    d.addEventListener('change', () => {
      ++previewVersion;
      if (!d._fileLoading)
        d.querySelector('#fc-import-preview').replaceChildren();
    });
    d.querySelector('#fc-preview-import').onclick = async () => {
      if (d._fileLoading || this._modalSaving) return;
      const version = ++previewVersion;
      try {
        const { cards, errors } = this.inspectImport(
          new FormData(d.querySelector('form')),
        );
        const deck = await getCustomDeckWithCards(id);
        if (this.modal !== d || version !== previewVersion || this._modalSaving)
          return;
        if (!deck) throw Error('This deck no longer exists.');
        const seen = new Set(
          deck.cards.map((card) => FlashcardTools.customIdentity(card)),
        );
        let duplicates = 0;
        for (const card of cards) {
          const key = FlashcardTools.customIdentity(card);
          if (seen.has(key)) duplicates++;
          else seen.add(key);
        }
        d.querySelector('#fc-import-preview').innerHTML =
          `<p><strong>${cards.length - duplicates} new cards</strong> · ${duplicates} duplicates · ${errors.length} invalid rows</p>${
            errors.length
              ? '<p>Fix the invalid rows before importing. No cards have been saved.</p><ul class="fc-import-errors">' +
                errors
                  .slice(0, 30)
                  .map(
                    (error) =>
                      `<li>Row ${Number(error.row)}: ${this.escape(error.reason)}</li>`,
                  )
                  .join('') +
                '</ul>'
              : ''
          }${errors.length > 30 ? '<p>Showing the first 30 errors.</p>' : ''}${cards
            .slice(0, 3)
            .map(
              (card) =>
                `<p><b>${this.escape(card.front)}</b> → ${this.escape(card.back)}</p>`,
            )
            .join('')}`;
      } catch (error) {
        if (this.modal === d && version === previewVersion) {
          d.querySelector('#fc-import-preview').textContent = error.message;
          this.toast(error.message, 'error');
        }
      }
    };
  }
  inspectImport(form) {
    const text = String(form.get('content') || '');
    if (text.length > 2000000) throw Error('Use content up to 2 MB.');
    if (form.get('format') === 'CSV')
      return FlashcardTools.csv(text, { preview: true });
    const lines = text
      .split(/\r?\n/)
      .map((text, i) => ({ text, row: i + 1 }))
      .filter((line) => line.text.trim());
    if (!lines.length || lines.length > 1000)
      throw Error('Use 1–1,000 cloze sentences.');
    const cards = [],
      errors = [];
    for (const line of lines) {
      const card = FlashcardTools.cloze(line.text);
      try {
        if (!card)
          throw Error(
            'Use only complete {{c1::…}} phrases; other cloze groups are unsupported.',
          );
        cards.push(validateCustomCard(card));
      } catch (error) {
        errors.push({ row: line.row, reason: error.message });
      }
    }
    return { cards, errors };
  }
  parseImport(form) {
    const result = this.inspectImport(form);
    if (result.errors.length)
      throw Error(`Row ${result.errors[0].row}: ${result.errors[0].reason}`);
    return result.cards;
  }
}
window.flashcardsView = new FlashcardsView();
