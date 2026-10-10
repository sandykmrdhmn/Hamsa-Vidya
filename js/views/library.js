/** Saved Study Notes library. Uses the same local notes as the textbook reader. */
class LibraryView {
  constructor() {
    this.container = document.getElementById('view-library');
    this.searchQuery = '';
    this.selectedSort = 'NEWEST';
    this.subject = 'ALL';
    this.page = 0;
    this.pageSize = 12;
    this._renderVersion = 0;
  }

  escape(value) { return SecurityUtils.escapeHtml(String(value ?? '')); }

  async render() {
    this.container = document.getElementById('view-library');
    if (!this.container) return;
    const version = ++this._renderVersion;
    let notes;
    try { notes = await getAllNotes(); }
    catch {
      if (version !== this._renderVersion) return;
      this.container.innerHTML = '<div class="glass-panel" role="alert"><h2>Library could not be loaded</h2><p>Browser storage is unavailable. Your saved notes are still on this device.</p><button class="btn btn-primary" onclick="libraryView.render()">Retry</button></div>';
      return;
    }
    if (version !== this._renderVersion) return;
    const subjects = [...new Set(notes.map(note => note.subject || 'General Study'))].sort();
    if (this.subject !== 'ALL' && !subjects.includes(this.subject)) this.subject = 'ALL';
    const term = this.searchQuery.toLocaleLowerCase().trim();
    const filtered = notes.filter(note => (this.subject === 'ALL' || (note.subject || 'General Study') === this.subject) &&
      (!term || [note.title, note.subject, note.description, note.content, ...(note.sections || []).map(section => `${section.heading || ''} ${section.content || ''}`)]
        .some(value => String(value || '').toLocaleLowerCase().includes(term))));
    filtered.sort(this.selectedSort === 'TITLE'
      ? (a, b) => String(a.title || '').localeCompare(String(b.title || ''))
      : (a, b) => {
        const difference = String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
        return this.selectedSort === 'OLDEST' ? -difference : difference;
      });
    this.page = Math.min(this.page, Math.max(0, Math.ceil(filtered.length / this.pageSize) - 1));
    const input = this.container.querySelector('#library-search');
    const focused = document.activeElement === input, start = input?.selectionStart, end = input?.selectionEnd;
    const hero = UIUtils.buildViewHero({
      accent: 'emerald', icon: 'library', eyebrow: 'Saved Study Notes', title: 'Your knowledge,', titleAccent: 'ready to revisit.',
      hindi: 'अध्ययन संग्रह — पढ़ें, समझें और दोहराएँ',
      tagline: 'Find your saved study notes, return to their textbook chapters, export a PDF or revise with flashcards.',
      stats: [{ value: notes.length, label: 'Saved notes' }, { value: subjects.length, label: 'Subjects' },
        { value: notes.filter(note => note.isFavorite).length, label: 'Favorites' }],
      actions: [{ label: 'Create Study Notes', icon: 'plus', onclick: "app.navigate('study-notes')" },
        { label: 'Flashcards', icon: 'layers', onclick: "app.navigate('flashcards')", variant: 'ghost' }]
    });
    this.container.innerHTML = `<div class="page-column">${hero}
      <div class="glass-panel" style="padding:1rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
        <input id="library-search" class="study-textarea" style="min-height:44px;flex:1;min-width:180px;" aria-label="Search saved notes" placeholder="Search notes and chapter text…" value="${this.escape(this.searchQuery)}" oninput="libraryView.onSearchChange(this.value)">
        <select class="vault-filter-select" aria-label="Subject" onchange="libraryView.setSubject(this.value)"><option value="ALL">All subjects</option>${subjects.map(subject => `<option value="${this.escape(subject)}" ${this.subject === subject ? 'selected' : ''}>${this.escape(subject)}</option>`).join('')}</select>
        <select class="vault-filter-select" aria-label="Sort notes" onchange="libraryView.onSortChange(this.value)">${[['NEWEST','Recently updated'],['OLDEST','Oldest first'],['TITLE','Title']].map(([id,label]) => `<option value="${id}" ${this.selectedSort === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>
      <p role="status">${filtered.length} saved ${filtered.length === 1 ? 'note' : 'notes'}</p>
      <div class="fc-deck-grid">${filtered.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize).map(note => {
        const excerpt = note.description || note.sections?.[0]?.content || note.content || 'Open this note to continue reading.';
        return `<article class="glass-panel" style="padding:1.25rem;"><span class="badge badge-primary">${this.escape(note.subject || 'General Study')}</span><h3>${this.escape(note.title || 'Untitled note')}</h3><p>${this.escape(String(excerpt).slice(0, 220))}</p><p>${(note.sections || []).length} sections${note.isFavorite ? ' · Favorite' : ''}</p><div style="display:flex;gap:0.5rem;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="libraryView.openNote(${Number(note.id)})">Read</button><button class="btn btn-secondary btn-sm" onclick="libraryView.openFlashcards(${Number(note.id)})">Flashcards</button><button class="btn btn-secondary btn-sm" onclick="studyNotesView.exportStudyNotesPdf(${Number(note.id)})">Print PDF</button></div></article>`;
      }).join('') || '<div class="glass-panel" style="padding:2rem;"><h3>No matching notes</h3><p>Create a study note or change the search and subject filter.</p><button class="btn btn-primary" onclick="app.navigate(\'study-notes\')">Open Study Notes</button></div>'}</div>
      ${filtered.length > this.pageSize ? `<div style="display:flex;gap:1rem;align-items:center;"><button class="btn btn-secondary" onclick="libraryView.setPage(${this.page - 1})" ${this.page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${this.page + 1} of ${Math.ceil(filtered.length / this.pageSize)}</span><button class="btn btn-secondary" onclick="libraryView.setPage(${this.page + 1})" ${(this.page + 1) * this.pageSize >= filtered.length ? 'disabled' : ''}>Next</button></div>` : ''}
    </div>`;
    if (focused) { const field = this.container.querySelector('#library-search'); field?.focus(); field?.setSelectionRange(start, end); }
    window.app?.refreshIcons();
  }

  onSearchChange(value) { this.searchQuery = value; this.page = 0; ++this._renderVersion; clearTimeout(this._debounce); this._debounce = setTimeout(() => this.render(), 200); }
  onSortChange(value) { this.selectedSort = ['NEWEST','OLDEST','TITLE'].includes(value) ? value : 'NEWEST'; this.page = 0; this.render(); }
  setSubject(value) { this.subject = value || 'ALL'; this.page = 0; this.render(); }
  setPage(value) { this.page = Math.max(0, Number(value) || 0); this.render(); }
  async openNote(id) { await app.navigate('study-notes'); await window.studyNotesView?.openNote(Number(id)); }
  async openFlashcards(id) { await app.navigate('flashcards'); await window.flashcardsView?.loadNotesDeck(Number(id)); }
  onLeaveView() { ++this._renderVersion; clearTimeout(this._debounce); }
}

window.libraryView = new LibraryView();
