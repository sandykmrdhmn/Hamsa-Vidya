/**
 * HAMSA VIDYA (हंस विद्या) — AI-POWERED DIGITAL TEXTBOOK MODULE
 * Production-ready Digital Textbook & Study Workspace with multi-file PDF & Image OCR,
 * structured color-coded reading experience, Table of Contents, Smart Glossary with Hindi meanings,
 * interactive examples & analogies, grounded Ask AI tutor, Quiz configuration & multi-format PDF export.
 */
class StudyNotesView {
  /**
   * Cap on the focus instruction, mirroring GeminiService.MAX_FOCUS_CHARS.
   * Enforced here too so the textarea itself stops accepting characters that
   * the service would silently drop — a `maxlength` the user can see beats a
   * truncation they cannot.
   */
  static MAX_FOCUS_CHARS = 500;

  /**
   * One-tap scopes for the things students actually ask for. Phrased as full
   * instructions rather than keywords, because the text is inserted verbatim
   * into the prompt and "questions" alone is ambiguous where
   * "only the questions and their full solutions" is not.
   */
  static FOCUS_PRESETS = [
    { label: '🧮 Only questions + solutions', text: 'only the questions and their full step-by-step solutions' },
    { label: '⌨️ Only shortcut keys', text: 'only the computer shortcut keys, as a reference list with what each one does' },
    { label: '📐 Only formulas', text: 'only the formulas and equations, with what each symbol means' },
    { label: '📖 Only definitions', text: 'only the definitions of terms' },
    { label: '📅 Only dates & facts', text: 'only the dates, numbers and factual data points' },
    { label: '📋 Only tables & data', text: 'only the tables, lists and tabulated data' }
  ];

  _clone(value) { return JSON.parse(JSON.stringify(value)); }

  _controller() { const controller=new AbortController();this._controllers.add(controller);return controller; }

  _checkRun(controller) {
    if(controller.signal.aborted || window.app?.isGenerationCancelled()) throw new DOMException('Cancelled','AbortError');
  }

  _endNoteSession() {
    this._viewVersion++;this._renderVersion++;
    this._controllers.forEach(controller=>controller.abort());this._controllers.clear();
    this._chatPending=false;this._recallPending=false;this._masteryPending=false;this.searchInNoteQuery='';this.activeGlossaryTerm=null;this.activeExampleData=null;
    clearTimeout(this._readingTimer);window.removeEventListener('scroll',this._scrollHandler);
    window.speechSynthesis?.cancel();this.isSpeaking=false;
    document.getElementById('floating-selection-toolbar')?.remove();
    this._sourceURLs.forEach(url=>URL.revokeObjectURL(url));this._sourceURLs.clear();
  }

  async _persistReadingProgress() {
    const note=this.activeNote;if(!note)return;
    const data={recallAnswers:this._clone(this.microQuizAnswers||{})};
    if(note.readingPosition)data.readingPosition=this._clone(note.readingPosition);
    await updateNote(note.id,data);
  }

  onLeaveView() {
    this.flushAutoSave().catch(error=>window.app?.showToast(`Your notes could not be saved: ${error.message}`,'error'));
    this._persistReadingProgress().catch(error=>window.app?.showToast(`Reading progress could not be saved: ${error.message}`,'warning'));
    this._endNoteSession();document.body.classList.remove('in-textbook-focus-mode');
  }

  _rememberEdit() {
    if(!this._editBaseline && this.activeNote) this._editBaseline=this._clone({title:this.activeNote.title,sections:this.activeNote.sections,summary:this.activeNote.summary,glossaryTerms:this.activeNote.glossaryTerms});
  }

  async flushAutoSave() {
    clearTimeout(this.autoSaveTimer);
    if(!this._dirty || !this.activeNote) return await this._savePromise;
    const note=this.activeNote,id=note.id,sequence=this._editSequence||0;
    if(this._savingSequence===sequence&&this._savingNoteId===id)return await this._savePromise;
    this._savingSequence=sequence;this._savingNoteId=id;
    const baseline=this._editBaseline,history=[...(note.editHistory||[])];
    if(baseline)history.push({...this._clone(baseline),savedAt:new Date().toISOString()});
    const snapshot={title:note.title,sections:this._clone(note.sections),glossaryTerms:this._clone(note.glossaryTerms||[]),editHistory:history.slice(-20),
      summary:window.geminiService.generateFallbackComprehensiveSummary({title:note.title,subject:note.subject,sections:note.sections}),
      metadata:{...(note.metadata||{}),studentEdited:true},recallAnswers:this._clone(this.microQuizAnswers||{})};
    const task=this._savePromise.catch(()=>{}).then(()=>updateNote(id,snapshot));this._savePromise=task;
    try {
      await task;
      if(Number(this.activeNote?.id)===Number(id)) {
        note.editHistory=snapshot.editHistory;note.summary=snapshot.summary;note.metadata=snapshot.metadata;note.recallAnswers=snapshot.recallAnswers;
        if(sequence===(this._editSequence||0)){this._dirty=false;this._editBaseline=null;this.autoSaveStatus='Saved ✓';}
        else this._editBaseline={title:snapshot.title,sections:snapshot.sections,summary:snapshot.summary,glossaryTerms:note.glossaryTerms};
        const badge=document.getElementById('auto-save-status-badge');if(badge)badge.textContent=this.autoSaveStatus;
      }
    }catch(error){this.autoSaveStatus='Save failed · draft kept';const badge=document.getElementById('auto-save-status-badge');if(badge)badge.textContent=this.autoSaveStatus;throw error;}
    finally{if(this._savingSequence===sequence){this._savingSequence=null;this._savingNoteId=null;}}
  }

  async undoLastEdit() {
    try {
      await this.flushAutoSave();const note=this.activeNote,history=[...(note?.editHistory||[])];const previous=history.pop();if(!previous)return;
      const data={title:previous.title,sections:previous.sections,summary:previous.summary,glossaryTerms:previous.glossaryTerms||[],editHistory:history,recallAnswers:{}};
      await updateNote(note.id,data);Object.assign(note,data);this._cachedSectionQuizzes={};this.microQuizAnswers={};await this.render();
      window.app?.showToast('Previous saved version restored.','success');
    }catch(error){window.app?.showToast(`Undo failed: ${error.message}`,'error');}
  }

  _settingsHTML() {
    const select=(name,label,options)=>`<label>${label}<select class="vault-filter-select" onchange="studyNotesView.noteSettings.${name}=this.value">${options.map(([key,text])=>`<option value="${key}" ${this.noteSettings[name]===key?'selected':''}>${text}</option>`).join('')}</select></label>`;
    return `<div class="study-settings">${select('language','Notes & practice language',[['AUTO','Keep source language'],['ENGLISH','English'],['HINDI','हिन्दी'],['HINGLISH','Hinglish'],['BILINGUAL','English + हिन्दी']])}${select('level','Learning level',[['AUTO','Match source'],['SCHOOL','School'],['COLLEGE','College'],['COMPETITIVE','Competitive exams'],['ADVANCED','Advanced']])}<label>Target exam (optional)<input value="${this.escapeHtml(this.noteSettings.exam)}" maxlength="120" placeholder="e.g. CBSE Class 10, SSC, UPSC" oninput="studyNotesView.noteSettings.exam=this.value"></label></div>`;
  }

  _creationErrorHTML() {
    const error=this._creationError;if(!error)return '';
    return `<div class="study-error" role="alert"><strong>${this.escapeHtml(error.message)}</strong>${error.failures?.length?`<ul>${error.failures.map(failure=>`<li>Batch ${failure.batch}: ${this.escapeHtml(failure.sourceRefs.map(ref=>`${ref.fileName}${ref.page?' · page '+ref.page:''}`).join(', '))} — ${this.escapeHtml(failure.reason)}</li>`).join('')}</ul>`:''}<button class="btn btn-secondary btn-sm" onclick="studyNotesView.triggerCreateStructuredNote()">Retry unfinished work</button></div>`;
  }

  _noteStatusHTML(note) {
    const local=note.metadata?.generationSource==='LOCAL_FORMATTER'||note.metadata?.generatedByAI===false;
    const coverage=note.coverage;
    return `<div class="study-note-status"><span>${local?'Source organised locally · AI teaching not generated':note.metadata?.generationSource==='GEMINI_AI'?'AI textbook':'Saved study note'}${coverage?` · ${coverage.processedBatches}/${coverage.totalBatches} source batches processed`:''}</span>${note.metadata?.studentEdited?'<span>Edited by you · refresh teaching aids where the explanation changed</span>':''}</div>
      <div class="study-reader-tools"><button class="btn btn-secondary btn-sm" onclick="studyNotesView.toggleMobileSidebar()">Contents & highlights</button><label class="study-note-search"><span>Find in this note</span><input id="study-find-input" type="search" value="${this.escapeHtml(this.searchInNoteQuery)}" oninput="studyNotesView.findInNote(this.value)" placeholder="Concept, formula, definition…"></label><span id="study-find-status" role="status"></span><button class="btn btn-secondary btn-sm" ${note.editHistory?.length?'':'disabled'} onclick="studyNotesView.undoLastEdit()">Undo last saved edit</button></div>`;
  }

  findInNote(query) {
    this.searchInNoteQuery=query;const text=query.trim().toLocaleLowerCase();let matches=0;
    document.querySelectorAll('[data-study-section]').forEach(section=>{const match=!text||section.textContent.toLocaleLowerCase().includes(text);section.hidden=!match;if(match)matches++;});
    const status=document.getElementById('study-find-status');if(status)status.textContent=text?`${matches} matching section${matches===1?'':'s'}`:'';
  }

  toggleMobileSidebar() {
    if(this.readerActiveTab!=='TEXTBOOK'){this.readerActiveTab='TEXTBOOK';this.render().then(()=>this.toggleMobileSidebar());return;}
    const sidebar=document.querySelector('.textbook-toc-sidebar');if(!sidebar)return;
    const open=sidebar.classList.toggle('study-sidebar-open');
    if(open){sidebar.setAttribute('tabindex','-1');sidebar.focus();}
  }

  setRevisionMode(mode) {if(['QUICK','DETAILED','EXAM'].includes(mode)){this.revisionMode=mode;this.render();}}

  returnToSection(id) {this.readerActiveTab='TEXTBOOK';this.render().then(()=>this.scrollToSection(id));}

  _sourceRefsHTML(refs) {
    return refs.length?`<div class="study-source-refs">${refs.map(ref=>`<button type="button" onclick="studyNotesView.openSourceReference('${this.escapeHtml(this.escapeJs(ref.fileName))}',${Number(ref.page)||0})">${this.escapeHtml(ref.fileName)}${ref.page?` · p. ${Number(ref.page)}`:''}${ref.method==='OCR'?' · OCR':''}</button>`).join('')}</div>`:'';
  }

  openSourceReference(fileName,page) {this._sourceSelection={fileName,page};this.setReaderTab('SOURCE');}

  _sourceURL(file) {
    if(!file?.data || !/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,/.test(file.data))return null;
    const key=file.name+':'+file.data.length;
    if(!this._sourceURLs.has(key)) {
      const [header,encoded]=file.data.split(',');const raw=atob(encoded);const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
      this._sourceURLs.set(key,URL.createObjectURL(new Blob([bytes],{type:header.slice(5,header.indexOf(';'))})));
    }
    return this._sourceURLs.get(key);
  }

  _quizDialogHTML() {
    const note=this._quizNote||this.activeNote;if(!note)return '';
    const option=(name,label,values)=>`<label>${label}<select class="vault-filter-select" onchange="studyNotesView.quizConfig.${name}=${name==='questionCount'?'Number(this.value)':'this.value'}">${values.map(value=>`<option value="${value}" ${this.quizConfig[name]===value?'selected':''}>${value}</option>`).join('')}</select></label>`;
    return `<div class="modal-overlay active study-quiz-dialog" role="dialog" aria-modal="true" aria-label="Practice settings"><div class="modal-content"><h2>Practice from ${this.escapeHtml(note.title)}</h2><p>Questions use the selected sections and your note's language.</p><div class="study-settings">${option('questionCount','Questions',[5,10,15,20,25,30])}${option('difficulty','Difficulty',['EASY','MEDIUM','HARD','MIXED'])}${option('questionType','Question style',['MCQ','TRUE_FALSE','MIXED'])}</div><div class="study-chapter-picker">${(note.sections||[]).map(section=>`<label><input type="checkbox" ${this.selectedQuizSections==null||this.selectedQuizSections.includes(section.id)?'checked':''} onchange="studyNotesView.selectQuizSection('${this.escapeHtml(this.escapeJs(section.id))}',this.checked)">${this.escapeHtml(section.heading)}</label>`).join('')}</div><p class="study-muted">Short quizzes rotate across sections; question count determines how many sections can be sampled.</p><div class="study-revision-actions"><button class="btn btn-secondary" onclick="studyNotesView.closeQuizModal()">Cancel</button><button class="btn btn-primary" onclick="studyNotesView.launchGeneratedQuizForNote(${Number(note.id)})">Generate & Start</button></div></div></div>`;
  }

  _practiceSections(note) {return (note.sections||[]).filter(section=>this.selectedQuizSections==null||this.selectedQuizSections.includes(section.id));}

  selectQuizSection(id,selected) {
    const note=this.isQuizModalOpen?(this._quizNote||this.activeNote):this.activeNote;
    this.selectedQuizSections ||= (note?.sections||[]).map(section=>section.id);
    this.selectedQuizSections=this.selectedQuizSections.filter(sectionId=>sectionId!==id);if(selected)this.selectedQuizSections.push(id);
  }

  keepRecallDraft(id,draft) {this.microQuizAnswers[id]={...(this.microQuizAnswers[id]||{}),draft};}

  async checkRecall(id,useAI) {
    if(this._recallPending)return;
    const section=this.activeNote?.sections?.find(section=>section.id===id),input=document.getElementById(`recall-${id}`);if(!section||!input?.value.trim())return;
    const note=this.activeNote,version=this._viewVersion,recall=this.getOrGenerateSectionQuiz(section,0,note),draft=input.value;
    const controller=this._controller();this._recallPending=true;
    try {
      const feedback=useAI?await window.geminiService.askAiAboutNote({noteTopic:note.title,sections:[section],settings:note.settings,signal:controller.signal,userQuestion:`Assess my explanation against EACH of these expected points: ${JSON.stringify(recall.expectedPoints)}. Say what is right, correct specific misunderstandings, suggest one concrete revision and ask one focused follow-up. Do not claim mastery. Question: ${recall.question}. My explanation: ${draft}`}):`Compare your explanation with these source-supported points:\n\n${recall.expectedPoints.map(point=>`- ${point}`).join('\n')}`;
      if(version!==this._viewVersion||controller.signal.aborted)return;
      this.microQuizAnswers[id]={draft,feedback,method:useAI?'AI_FEEDBACK':'SELF_CHECK',reviewedAt:new Date().toISOString()};note.recallAnswers=this._clone(this.microQuizAnswers);
      await updateNote(note.id,{recallAnswers:note.recallAnswers});await this.render();
    }catch(error){if(error.name!=='AbortError'&&version===this._viewVersion)window.app?.showToast(`Feedback failed; your draft is kept. ${error.message}`,'error');}
    finally{this._controllers.delete(controller);if(version===this._viewVersion)this._recallPending=false;}
  }

  _applySavedHighlight(container,highlight) {
    const text=container.textContent,quote=String(highlight.text||'');if(!quote)return;
    let start=Number.isInteger(highlight.start)&&text.slice(highlight.start,highlight.start+quote.length)===quote?highlight.start:-1;
    if(start<0){let index=text.indexOf(quote);while(index>=0){if(!highlight.prefix||text.slice(Math.max(0,index-highlight.prefix.length),index)===highlight.prefix){start=index;break;}index=text.indexOf(quote,index+1);}}
    if(start<0)return;
    const end=start+quote.length,walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),nodes=[];let offset=0;
    while(walker.nextNode()){const node=walker.currentNode,length=node.data.length;if(offset<end&&offset+length>start)nodes.push({node,from:Math.max(0,start-offset),to:Math.min(length,end-offset)});offset+=length;}
    for(const {node,from,to} of nodes){const fragment=document.createDocumentFragment();fragment.append(document.createTextNode(node.data.slice(0,from)));const mark=document.createElement('mark');mark.className=`hamsa-highlight hl-${['yellow','green','purple'].includes(highlight.color)?highlight.color:'yellow'}`;mark.dataset.highlightId=highlight.id;mark.textContent=node.data.slice(from,to);fragment.append(mark,document.createTextNode(node.data.slice(to)));node.replaceWith(fragment);}
  }

  showGlossaryByIndex(event,index) {const term=this.activeNote?.glossaryTerms?.[index];if(term)this.showGlossaryPopover(event,term.term);}

  _fileData(file) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error(`Could not read ${file.name}`));reader.readAsDataURL(file);});
  }

  async _extractSources(files,manual,controller) {
    const pages=manual.trim()?[{fileName:'Pasted text',page:null,text:manual,method:'TEXT'}]:[];
    const originals=[];
    for(const item of files) {
      this._checkRun(controller);
      const data=await this._fileData(item.file);originals.push({name:item.name,type:item.type,size:item.size,data});
      if(item.type==='PDF') {
        const bytes=new Uint8Array(await item.file.arrayBuffer());
        if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error(`${item.name} is not a valid PDF.`);
        if(!window.pdfjsLib)throw new Error('PDF reader is unavailable. Reload and retry.');
        const task=window.pdfjsLib.getDocument({data:bytes});let doc;
        const stop=()=>task.destroy();controller.signal.addEventListener('abort',stop,{once:true});
        try {
          doc=await task.promise;const from=Number(item.fromPage)||1,to=Number(item.toPage)||doc.numPages;
          if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>doc.numPages)throw new Error(`Choose pages 1–${doc.numPages} for ${item.name}.`);
          for(let pageNumber=from;pageNumber<=to;pageNumber++) {
            this._checkRun(controller);app.handleGenerationProgress({message:`Reading ${item.name} · page ${pageNumber}/${to}`,percent:10,showBatchCard:true});
            const page=await doc.getPage(pageNumber),content=await page.getTextContent();let lastY=null;
            let text=content.items.map(item=>{const newline=lastY!=null&&Math.abs(item.transform[5]-lastY)>5;lastY=item.transform[5];return `${newline?'\n':' '}${item.str}`;}).join('').trim();let method='TEXT';
            if(text.replace(/\s/g,'').length<30 || /[\u0000\ufffd]/u.test(text)) {
              if(!window.geminiService.isAiAvailable())throw new Error(`${item.name}, page ${pageNumber}, needs OCR. Configure Gemini or upload readable text.`);
              const viewport=page.getViewport({scale:Math.min(1.5,1800/page.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
              const rendering=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'});await rendering.promise;this._checkRun(controller);
              text=await window.geminiService.extractTextFromImage({base64Data:canvas.toDataURL('image/png'),mimeType:'image/png',signal:controller.signal});method='OCR';canvas.width=canvas.height=0;
            }
            if(!text.trim())throw new Error(`No readable text on ${item.name}, page ${pageNumber}.`);
            pages.push({fileName:item.name,page:pageNumber,text,method});page.cleanup();
          }
        }finally{controller.signal.removeEventListener('abort',stop);if(doc)await doc.destroy();else await task.destroy();}
      }else{
        const prefix=data.split(',')[1]?.slice(0,24)||'',magic=atob(prefix);const valid=magic.startsWith('\x89PNG')||magic.startsWith('\xff\xd8\xff')||(magic.startsWith('RIFF')&&magic.includes('WEBP'));
        if(!valid)throw new Error(`${item.name} is not a supported image.`);
        const text=await window.geminiService.extractTextFromImage({base64Data:data,mimeType:item.file.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp'}[item.name.split('.').pop().toLowerCase()]),signal:controller.signal});
        pages.push({fileName:item.name,page:1,text,method:'OCR'});
      }
    }
    return {pages,originals};
  }

  constructor() {
    this.container = document.getElementById('view-study-notes');
    this.notes = [];
    this.activeSubjectFilter = 'ALL';
    this.searchQuery = '';
    this.sortBy = 'RECENT_OPENED'; // 'RECENT_OPENED', 'RECENT_UPDATED', 'TITLE', 'READ_TIME'
    this.showOnlyFavorites = false;

    // View States: 'DASHBOARD' | 'CREATE' | 'READER'
    this.currentViewMode = 'DASHBOARD';
    this.activeNoteId = null;
    this.activeNote = null;

    // Create Note Form State
    this.newTopic = '';
    this.newSubject = 'Indian Polity';
    this.isCustomSubject = false;
    this.customSubject = '';
    this.newFiles = []; // array of { file, name, size, type }
    this.manualText = '';
    this.isCreating = false;
    this.creationProgressMsg = '';

    // What to take OUT of the uploaded material, in the student's own words —
    // "only the maths questions", "only the computer shortcut keys". Empty means
    // build full notes from everything, which is the old behaviour.
    //
    // Written on every keystroke (never via a re-render) because
    // onMultiFilesSelected() and removeAttachedFile() both call this.render(),
    // which rebuilds the textarea from state. A value living only in the DOM
    // would vanish the moment the user attached another file.
    this.focusInstruction = '';

    // Reader UI States
    this.readerActiveTab = 'TEXTBOOK'; // 'TEXTBOOK' | 'SUMMARY' | 'SOURCE'
    this.isFocusMode = false;
    this.isEditMode = false;
    this.showingOriginalSource = false;
    this.fontSizeScale = 1.0; // 0.9, 1.0, 1.15
    this.activeTOCSectionId = null;
    this.searchInNoteQuery = '';
    this.autoSaveTimer = null;
    this.autoSaveStatus = 'Saved ✓';

    // Interactive Popover / Modal States
    this.activeGlossaryTerm = null;
    this.activeGlossaryPos = null;
    this.activeExampleData = null;
    this.isAskAiOpen = false;
    this.askAiMessages = [];
    this.isSummaryModalOpen = false;
    this.isQuizModalOpen = false;
    this.quizConfig = {
      questionCount: 10,
      difficulty: 'MEDIUM',
      questionType: 'MCQ'
    };

    // Reading Ergonomics & Appearance States
    this.readingTheme = localStorage.getItem('hamsa_textbook_theme') || 'DEFAULT';
    this.readingFont = localStorage.getItem('hamsa_textbook_font') || 'SERIF';
    this.readingSize = localStorage.getItem('hamsa_textbook_size') || 'MD';
    this.isAppearanceMenuOpen = false;
    this.sidebarActiveTab = 'TOC'; // 'TOC' | 'CHEATSHEET' | 'ANNOTATIONS'
    this.isSpeaking = false;
    this.speechUtterance = null;
    this.microQuizAnswers = {};
    this.noteSettings = { language: 'AUTO', level: 'AUTO', exam: '' };
    this.revisionMode = 'QUICK';
    this._viewVersion = 0;
    this._renderVersion = 0;
    this._controllers = new Set();
    this._savePromise = Promise.resolve();
    this._dirty = false;
    this._sourceURLs = new Map();
    this.selectedQuizSections = null;
    this._savingSequence=null;this._savingNoteId=null;
    this._retryState = null;
    this._creationError = null;
    this._sourcePages = null;
    this._sourceSelection = null;

    // Bind global selection handler for floating toolbar & menu close
    this.initTextSelectionListener();
    window.addEventListener('resize',()=>{if(window.innerWidth>600){const tools=this.container?.querySelector('.study-toolbar-details');if(tools)tools.open=true;}});
  }

  // =========================================================================
  // VIEW RENDERER DISPATCHER
  // =========================================================================
  async render() {
    if (!this.activeNote && !this.isCreating) {
      window.studyPreferences?.applyDefaults(this.noteSettings, window.studyPreferences.noteDefaults(), '_studyDefaults');
    }
    this.container ||= document.getElementById('view-study-notes');
    if (!this.container) return;
    const token = ++this._renderVersion;
    const scroll = window.scrollY;
    try { this.notes = await getAllNotes(); }
    catch (error) { window.app?.showToast(`Notes could not be loaded: ${error.message}`, 'error'); return; }
    if (token !== this._renderVersion) return;
    try {
      if (this.currentViewMode === 'READER' && this.activeNoteId) await this.renderReaderView();
      else if (this.currentViewMode === 'CREATE') this.renderCreateView();
      else { this.currentViewMode = 'DASHBOARD'; this.renderDashboardView(); }
      if (this.currentViewMode === 'DASHBOARD' && this.isQuizModalOpen) this.container.insertAdjacentHTML('beforeend', this._quizDialogHTML());
      this.container.querySelectorAll('input[data-notes-search]').forEach(input => { input.value = this.searchQuery; });
      window.app?.refreshIcons();
      if(this.isQuizModalOpen) this.container.querySelector('.study-quiz-dialog select')?.focus();
      if (this.currentViewMode === 'READER') {if(this.searchInNoteQuery)this.findInNote(this.searchInNoteQuery);window.scrollTo({ top: scroll, behavior: 'instant' });}
    } catch (error) { console.error(error); window.app?.showToast(`Notes could not be displayed: ${error.message}`, 'error'); }
  }

  renderDashboardView() {
    // Filter notes
    let filtered = this.notes.filter(n => {
      const matchSubj = this.activeSubjectFilter === 'ALL' || n.subject === this.activeSubjectFilter;
      const matchFav = !this.showOnlyFavorites || n.isFavorite;
      const q = this.searchQuery.toLowerCase().trim();
      const matchQ = !q ||
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.subject && n.subject.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (n.sections || []).some(section => `${section.heading} ${section.content}`.toLocaleLowerCase().includes(q)) ||
        (n.glossaryTerms || []).some(term => `${term.term} ${term.simpleMeaning}`.toLocaleLowerCase().includes(q));
      return matchSubj && matchFav && matchQ;
    });

    // Sort notes
    filtered.sort((a, b) => {
      if (this.sortBy === 'RECENT_OPENED') {
        return new Date(b.lastReadAt || b.updatedAt || b.createdAt) - new Date(a.lastReadAt || a.updatedAt || a.createdAt);
      } else if (this.sortBy === 'RECENT_UPDATED') {
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      } else if (this.sortBy === 'TITLE') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (this.sortBy === 'READ_TIME') {
        return (b.metadata?.readingTimeMin || 1) - (a.metadata?.readingTimeMin || 1);
      }
      return 0;
    });

    const defaultSubjects = ['Indian Polity', 'History & Culture', 'Science & Tech', 'Economy', 'Geography', 'General Knowledge', 'English', 'Mathematics'];
    const noteSubjects = this.notes.map(n => n.subject).filter(Boolean);
    const subjects = ['ALL', ...new Set([...defaultSubjects, ...noteSubjects])];
    const totalWordsAll = this.notes.reduce((acc, n) => acc + (n.metadata?.wordCount || 0), 0);
    const totalReadingHours = (totalWordsAll / 12000).toFixed(1);
    const starredCount = this.notes.filter(n => n.isFavorite).length;

    // The four metric cards that used to sit in a separate ribbon below the
    // header are now the hero's live counters — same numbers, one panel.
    const heroHtml = UIUtils.buildViewHero({
      accent: 'violet',
      icon: 'book-marked',
      eyebrow: 'Digital Textbook Workspace',
      title: 'Your chapters,',
      titleAccent: 'rebuilt as textbooks.',
      hindi: 'अध्ययन कोश — पुस्तक से डिजिटल पाठ्यपुस्तक तक',
      tagline: 'Import a PDF chapter or photos of handwritten notes. Gemini restructures them into a colour-coded textbook with a glossary, worked examples and quizzes generated from the same source.',
      stats: [
        { value: this.notes.length, label: 'Textbooks' },
        { value: starredCount, label: 'Starred' },
        { value: totalWordsAll.toLocaleString('en-IN'), label: 'Words structured' },
        { value: `~${totalReadingHours}h`, label: 'Reading time' }
      ],
      actions: [
        { label: 'Create New Note', icon: 'plus-circle', onclick: 'studyNotesView.openCreateNoteModal()' }
      ],
      chipsLabel: 'Each note becomes',
      chips: [
        { icon: 'palette', label: 'Colour-coded chapters', hint: 'Headings, key terms and examples styled apart' },
        { icon: 'book-a', label: 'Smart glossary', hint: 'Term definitions extracted automatically' },
        { icon: 'highlighter', label: 'Highlights & bookmarks', hint: 'Mark passages to revisit' },
        { icon: 'volume-2', label: 'Read aloud', hint: 'Text-to-speech in English and Hindi' },
        { icon: 'sparkles', label: 'Instant quiz', hint: 'Generate MCQs from the chapter you just read' }
      ]
    });

    this.container.innerHTML = `
      <div class="study-vault-container">
        ${heroHtml}

        <!-- Controls Toolbar (Search, Filter, Sort, Favorites) -->
        <div class="vault-controls-row cascade-card">
          <!-- Search Bar -->
          <div class="vault-search-box">
            <i data-lucide="search"></i>
            <input type="text" placeholder="Search notes by topic, concept, subject..."
              data-notes-search value="${this.escapeHtml(this.searchQuery)}"
              oninput="studyNotesView.onSearchInput(this.value)">
            ${this.searchQuery ? `
              <button class="search-clear-btn" onclick="studyNotesView.clearSearch()" style="position:absolute; right:1.2rem;">
                <i data-lucide="x" style="width:16px;height:16px;"></i>
              </button>
            ` : ''}
          </div>

          <!-- Subject Dropdown Filter -->
          <select class="vault-filter-select" onchange="studyNotesView.setSubjectFilter(this.value)">
            ${subjects.map(s => `
              <option value="${this.escapeHtml(s)}" ${this.activeSubjectFilter === s ? 'selected' : ''}>
                ${s === 'ALL' ? '🌐 All Subjects' : this.escapeHtml(s)} (${s === 'ALL' ? this.notes.length : this.notes.filter(n => n.subject === s).length})
              </option>
            `).join('')}
          </select>

          <!-- Sort Selector -->
          <select class="vault-filter-select" style="min-width:180px;" onchange="studyNotesView.setSortBy(this.value)">
            <option value="RECENT_OPENED" ${this.sortBy === 'RECENT_OPENED' ? 'selected' : ''}>⏱️ Recently Opened</option>
            <option value="RECENT_UPDATED" ${this.sortBy === 'RECENT_UPDATED' ? 'selected' : ''}>🔄 Recently Updated</option>
            <option value="TITLE" ${this.sortBy === 'TITLE' ? 'selected' : ''}>🔤 Title (A - Z)</option>
            <option value="READ_TIME" ${this.sortBy === 'READ_TIME' ? 'selected' : ''}>⏳ Reading Time</option>
          </select>

          <!-- Starred Toggle Button -->
          <button class="btn ${this.showOnlyFavorites ? 'btn-primary' : 'btn-secondary'}"
            style="min-height:50px; padding:0 1.25rem; border-radius:var(--radius-xl);"
            onclick="studyNotesView.toggleFavoritesFilter()"
            title="Filter Starred Notes">
            <i data-lucide="star" style="width:18px;height:18px; color:${this.showOnlyFavorites ? '#ffffff' : '#f59e0b'};"></i>
            <span>${this.showOnlyFavorites ? 'Favorites Only' : 'All'}</span>
          </button>
        </div>

        <!-- Notes Grid or Clean Empty State -->
        ${filtered.length === 0 ? `
          <div class="empty-state-panel cascade-card" style="padding:4rem 2rem; border-radius:24px; text-align:center;">
            <div class="empty-icon-halo" style="width:72px; height:72px; margin:0 auto 1.5rem;">
              <i data-lucide="book-open" style="width:36px;height:36px;color:var(--color-primary-light);"></i>
            </div>
            <h3 style="font-size:1.5rem; font-weight:800; margin-bottom:0.75rem; color:var(--text-main);">
              ${this.searchQuery || this.activeSubjectFilter !== 'ALL' || this.showOnlyFavorites ? 'No matching textbooks found' : 'Your Digital Textbook Vault is Ready'}
            </h3>
            <p style="color:var(--text-muted); max-width:520px; margin:0 auto 2rem; line-height:1.7; font-size:1rem;">
              ${this.searchQuery || this.activeSubjectFilter !== 'ALL' || this.showOnlyFavorites
                ? 'Try clearing your search query, toggling favorites, or changing the subject filter.'
                : 'Import PDF chapters or take photos of study notes. AI will structure them into interactive digital textbooks.'}
            </p>

            <div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
              <button class="btn btn-primary" style="padding:0.9rem 1.8rem; font-weight:700;" onclick="studyNotesView.openCreateNoteModal()">
                <i data-lucide="plus-circle"></i>
                <span>Create First Note</span>
              </button>
              <button class="btn btn-secondary" style="padding:0.9rem 1.5rem;" onclick="studyNotesView.loadSamplePreset('POLITY')">
                <span>🏛️ Import Sample Polity Note</span>
              </button>
              <button class="btn btn-secondary" style="padding:0.9rem 1.5rem;" onclick="studyNotesView.loadSamplePreset('SCIENCE')">
                <span>🔬 Import Sample Biology Note</span>
              </button>
            </div>
          </div>
        ` : `
          <div class="vault-notes-grid">
            ${filtered.map(n => this.renderDashboardNoteCard(n)).join('')}
          </div>
        `}
      </div>
    `;
  }

  renderDashboardNoteCard(note) {
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));
    const totalSecs = note.sections?.length || 1;
    const isFav = note.isFavorite;
    const hasSummary = Boolean(note.summary);
    const hasQuiz = Array.isArray(note.quizzes) && note.quizzes.length > 0;

    const preview = note.sections && note.sections[0]
      ? (note.sections[0].content || '').slice(0, 240) + '...'
      : (note.content || '').slice(0, 240) + '...';

    return `
      <div class="vault-note-card cascade-card" id="note-card-${note.id}">
        <div>
          <!-- Card Header Meta -->
          <div class="vault-card-header">
            <span class="badge badge-primary" style="font-weight:700;">
              ${this.escapeHtml(note.subject || 'General Study')}
            </span>

            <div style="display:flex; align-items:center; gap:0.5rem;">
              <!-- Star / Favorite Toggle -->
              <button class="icon-btn" onclick="studyNotesView.toggleFavorite(${note.id})" title="${isFav ? 'Remove from favorites' : 'Star this note'}" style="color:${isFav ? '#f59e0b' : 'var(--text-muted)'};">
                <i data-lucide="star" style="width:18px;height:18px; ${isFav ? 'fill:#f59e0b;' : ''}"></i>
              </button>

              <!-- Card Options Dropdown -->
              <div style="position:relative; display:inline-block;">
                <button class="icon-btn" onclick="studyNotesView.toggleCardMenu(${note.id})" title="Options">
                  <i data-lucide="more-vertical" style="width:18px;height:18px;"></i>
                </button>
                <div id="card-menu-${note.id}" class="vault-card-dropdown-menu glossary-popover-box" style="display:none; width:165px; right:0; top:32px; padding:0.45rem;">
                  <button class="vault-menu-action-item" onclick="studyNotesView.renameNotePrompt(${note.id})">
                    <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                    <span>Rename</span>
                  </button>
                  <button class="vault-menu-action-item" onclick="studyNotesView.duplicateNote(${note.id})">
                    <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    <span>Duplicate</span>
                  </button>
                  <button class="vault-menu-action-item btn-danger-item" onclick="studyNotesView.deleteNoteConfirm(${note.id})">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Note Title (Click to Open) -->
          <h3 class="vault-card-title" onclick="studyNotesView.openNote(${note.id})" style="cursor:pointer;" title="Open Digital Textbook">
            ${this.escapeHtml(note.title)}
          </h3>

          <!-- Details & Status Badges -->
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem; font-size:0.78rem;">
            <span style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:6px; color:var(--text-muted);">
              📖 ${totalSecs} Sections
            </span>
            <span style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:6px; color:var(--text-muted);">
              ⏱️ ~${readTime}m read
            </span>
            ${hasSummary ? `
              <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700; padding:2px 8px; border-radius:6px;">
                ✨ Summary Ready
              </span>
            ` : ''}
            ${hasQuiz ? `
              <span style="background:rgba(99,102,241,0.15); color:var(--color-primary-light); font-weight:700; padding:2px 8px; border-radius:6px;">
                🧠 Quiz Ready
              </span>
            ` : ''}
          </div>

          <!-- Excerpt -->
          <div class="vault-card-excerpt" onclick="studyNotesView.openNote(${note.id})" style="cursor:pointer;">
            ${this.escapeHtml(preview)}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="vault-card-actions">
          <div class="vault-action-primary-row">
            <button class="btn btn-action-quiz btn-sm" onclick="studyNotesView.openNote(${note.id})">
              <i data-lucide="book-open" style="width:15px;height:15px;"></i>
              <span>Open Textbook</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="studyNotesView.openQuizModalForNote(${note.id})">
              <i data-lucide="zap" style="width:15px;height:15px;"></i>
              <span>AI Quiz</span>
            </button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:0.25rem;">
            <button class="btn btn-link btn-sm" style="color:var(--text-muted); font-size:0.8rem; padding:0;" onclick="studyNotesView.exportStudyNotesPdf(${note.id})">
              <i data-lucide="printer" style="width:13px;height:13px; margin-right:4px;"></i> Print PDF
            </button>
            <span style="font-size:0.75rem; color:var(--text-muted);">
              Updated: ${new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. CREATE NEW NOTE (STEP 1: TOPIC & STEP 2: MULTI-FILE INGESTION)
  // =========================================================================
  renderCreateView() {
    this.container.innerHTML = `
      <div class="study-vault-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
          <div>
            <div class="study-vault-badge">
              <i data-lucide="sparkles" style="width:15px;height:15px;"></i>
              <span>Create AI Digital Textbook Note</span>
            </div>
            <h1 class="study-vault-title gradient-text" style="font-size:2rem; margin-bottom:0.4rem;">
              New Study Note & Document Studio
            </h1>
            <p style="color:var(--text-secondary); font-size:0.95rem;">
              Enter your topic name and upload reference PDFs or photos. AI will read, chunk, and structure the content into an interactive study book.
            </p>
          </div>

          <button class="btn btn-secondary" onclick="studyNotesView.closeCreateView()">
            <i data-lucide="arrow-left"></i>
            <span>Back to Vault</span>
          </button>
        </div>

        <div class="study-studio-card cascade-card" style="padding:2.5rem;">
          ${this._creationErrorHTML()}
          <!-- Creation Progress Overlay -->
          ${this.isCreating ? `
            <div style="padding:3rem 2rem; text-align:center;">
              <div class="loading-spinner" style="width:48px; height:48px; border-width:4px; margin:0 auto 1.5rem;"></div>
              <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin-bottom:0.75rem;">
                ${this.escapeHtml(this.creationProgressMsg || 'Analyzing & Structuring Material...')}
              </h2>
              <p style="color:var(--text-muted); max-width:480px; margin:0 auto; line-height:1.6; font-size:0.92rem;">
                Extracting definitions, formulas, real-world analogies, and smart glossary terms in structured batches...
              </p>
            </div>
          ` : `
            <!-- Step 1: Topic & Subject -->
            <div style="margin-bottom:2rem;">
              <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
                <span style="background:var(--color-primary); color:white; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem;">1</span>
                Enter Topic & Curriculum Domain
              </h3>

              <div style="display:grid; grid-template-columns: 2fr 1fr; gap:1.25rem;">
                <div>
                  <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:0.35rem;">
                    Topic / Chapter Title *
                  </label>
                  <input type="text" id="create-input-topic" class="reading-input-title"
                    placeholder="e.g. Photosynthesis in Higher Plants or Indian Constitution — Fundamental Rights"
                    value="${this.escapeHtml(this.newTopic)}"
                    oninput="studyNotesView.newTopic = this.value">
                </div>

                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                    <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); display:block; margin:0;">
                      Subject Domain
                    </label>
                    <button type="button" class="btn btn-link btn-xs" style="padding:0; font-size:0.8rem; color:var(--color-primary-light); font-weight:700; border:none; background:none; cursor:pointer;" onclick="studyNotesView.toggleCustomSubjectMode()">
                      ${this.isCustomSubject ? '📋 Choose from List' : '✏️ Write Custom'}
                    </button>
                  </div>

                  ${this.isCustomSubject ? `
                    <div style="display:flex; flex-direction:column; gap:0.4rem; animation:fadeIn 0.2s ease;">
                      <input type="text" id="create-input-custom-subject" class="reading-input-title" style="min-height:52px; font-size:0.95rem;"
                        placeholder="Type custom subject (e.g. Sociology, Machine Learning, Law)..."
                        value="${this.escapeHtml(this.customSubject)}"
                        oninput="studyNotesView.customSubject = this.value" autofocus>
                      <span style="font-size:0.75rem; color:var(--text-muted);">Custom subject will be saved with note and added to vault filters.</span>
                    </div>
                  ` : `
                    <select id="create-input-subject" class="reading-subject-select" onchange="studyNotesView.onSubjectSelectChange(this.value)">
                      ${['Indian Polity', 'History & Culture', 'Science & Tech', 'Economy', 'Geography', 'General Knowledge', 'English', 'Mathematics'].map(s => `
                        <option value="${s}" ${this.newSubject === s ? 'selected' : ''}>${s}</option>
                      `).join('')}
                      <option value="CUSTOM">✏️ Custom Subject (Type your own)...</option>
                    </select>
                  `}
                </div>
              </div>
            </div>

            <!-- Step 2: Ingest Learning Material -->
            <div style="margin-bottom:2rem;">
              <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                <span style="background:var(--color-primary); color:white; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem;">2</span>
                Import Learning Material (PDFs / Photos / Scans)
              </h3>
              <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:1rem;">
                The uploaded files act as source material. AI reads and restructures it into a coherent digital study book.
              </p>

              <!-- Dual Drag & Drop Zone -->
              <div class="import-methods-grid">
                <!-- Dropzone: PDF -->
                <div class="import-drop-panel" id="drop-panel-create-pdf"
                  onclick="document.getElementById('multi-file-input').click()"
                  ondragover="studyNotesView.handleDragOver(event, this)"
                  ondragleave="studyNotesView.handleDragLeave(event, this)"
                  ondrop="studyNotesView.handleMultiDrop(event, this)">
                  <div class="import-drop-icon">
                    <i data-lucide="file-text" style="width:26px;height:26px;"></i>
                  </div>
                  <div class="import-drop-title">📄 Upload PDF Chapters / Handouts</div>
                  <div class="import-drop-desc">
                    Drop single or multiple PDFs. Text extracted automatically.
                  </div>
                </div>

                <!-- Dropzone: Images -->
                <div class="import-drop-panel" id="drop-panel-create-img"
                  onclick="document.getElementById('multi-file-input').click()"
                  ondragover="studyNotesView.handleDragOver(event, this)"
                  ondragleave="studyNotesView.handleDragLeave(event, this)"
                  ondrop="studyNotesView.handleMultiDrop(event, this)">
                  <div class="import-drop-icon" style="background:rgba(236, 72, 153, 0.15); color:#ec4899;">
                    <i data-lucide="camera" style="width:26px;height:26px;"></i>
                  </div>
                  <div class="import-drop-title">📷 Photos of Notes (JPG / PNG)</div>
                  <div class="import-drop-desc">
                    Upload photos of notebook or book pages. Gemini Vision OCR transcribes notes.
                  </div>
                </div>
              </div>

              <!-- Hidden Multi-file input -->
              <input type="file" id="multi-file-input" multiple accept=".pdf, .jpg, .jpeg, .png, .webp" style="display:none;" onchange="studyNotesView.onMultiFilesSelected(this.files)">

              <!-- Attached Files Queue -->
              ${this.newFiles.length > 0 ? `
                <div style="background:rgba(0,0,0,0.15); border:1px solid var(--border-subtle); border-radius:14px; padding:1rem 1.25rem; margin-top:1rem;">
                  <div style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.65rem;">
                    📎 Attached Source Files (${this.newFiles.length}):
                  </div>
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${this.newFiles.map((f, fIdx) => `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:0.5rem 0.85rem; border-radius:8px; font-size:0.88rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                          <i data-lucide="${f.name.endsWith('.pdf') ? 'file-text' : 'image'}" style="width:16px;height:16px; color:var(--color-primary-light);"></i>
                          <span style="font-weight:600; color:var(--text-main);">${this.escapeHtml(f.name)}</span>
                          <span style="font-size:0.78rem; color:var(--text-muted);">(${(f.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        ${f.type === 'PDF' ? `<div class="study-page-range"><label>From <input type="number" min="1" value="${f.fromPage || 1}" oninput="studyNotesView.newFiles[${fIdx}].fromPage=Math.max(1,Number(this.value)||1)"></label><label>To <input type="number" min="1" placeholder="Last page" value="${f.toPage || ''}" oninput="studyNotesView.newFiles[${fIdx}].toPage=Number(this.value)||null"></label></div>` : ''}
                        <button class="icon-btn" onclick="studyNotesView.removeAttachedFile(${fIdx})" title="Remove file" style="color:var(--color-danger);">
                          <i data-lucide="x" style="width:14px;height:14px;"></i>
                        </button>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Direct Paste / Extra Context Accordion -->
              <div style="margin-top:1.25rem;">
                <details style="background:rgba(0,0,0,0.1); border:1px solid var(--border-subtle); border-radius:12px; padding:0.85rem 1.25rem;">
                  <summary style="font-size:0.88rem; font-weight:700; color:var(--color-primary-light); cursor:pointer;">
                    ✍️ Or Paste Text / Coaching Notes Manually
                  </summary>
                  <div style="margin-top:0.85rem;">
                    <textarea id="create-input-manual" class="live-reading-canvas" style="min-height:160px; font-size:0.95rem; line-height:1.6;"
                      placeholder="Paste syllabus topics, lecture notes, textbook excerpts here..."
                      oninput="studyNotesView.manualText = this.value">${this.escapeHtml(this.manualText)}</textarea>
                  </div>
                </details>
              </div>
            </div>

            ${this._settingsHTML()}
            <!-- Step 3: Extraction Scope -->
            <div style="margin-bottom:2rem;">
              <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                <span style="background:var(--color-primary); color:white; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem;">3</span>
                What should AI take out of it?
                <span style="font-size:0.78rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Optional</span>
              </h3>
              <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:1rem;">
                Leave this empty to get complete notes on everything in the file.
                Or name exactly one thing, and AI makes notes on <strong>only</strong> that — the rest of the material is left out entirely.
              </p>

              <!-- Common scopes. Real <button>s so they are keyboard-operable
                   without the runtime a11y promotion in app.js. -->
              <div class="chips-select-grid" style="margin-bottom:0.85rem;">
                ${StudyNotesView.FOCUS_PRESETS.map(p => `
                  <button type="button"
                    class="select-chip ${this.focusInstruction === p.text ? 'active' : ''}"
                    style="font:inherit; font-size:0.83rem; cursor:pointer;"
                    onclick="studyNotesView.applyFocusPreset('${this.escapeHtml(this.escapeJs(p.text))}')">
                    ${p.label}
                  </button>
                `).join('')}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; gap:1rem; flex-wrap:wrap;">
                <label for="create-input-focus" style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); margin:0;">
                  Focus instruction
                </label>
                <span id="focus-scope-badge" style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">
                  ${this.describeFocusState()}
                </span>
              </div>

              <textarea id="create-input-focus" class="live-reading-canvas"
                style="min-height:92px; font-size:0.95rem; line-height:1.6;"
                maxlength="${StudyNotesView.MAX_FOCUS_CHARS}"
                placeholder="e.g. only the maths questions and their solutions&#10;e.g. only the computer shortcut keys&#10;e.g. only the definitions and formulas — skip the theory"
                oninput="studyNotesView.onFocusInput(this.value)">${this.escapeHtml(this.focusInstruction)}</textarea>

              ${this.focusInstruction.trim() ? `
                <div class="reading-status-banner" style="margin-top:0.85rem;">
                  <i data-lucide="filter" style="width:15px;height:15px;"></i>
                  <span>
                    Focused note. AI will read the whole file but write notes on
                    <strong>only</strong> &ldquo;${this.escapeHtml(this.focusInstruction.trim())}&rdquo;.
                    If the material contains none of it, nothing is saved and you will be told —
                    you will not get unrelated notes instead.
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" style="margin-left:auto; flex-shrink:0;"
                    onclick="studyNotesView.clearFocus()">
                    <i data-lucide="x" style="width:13px;height:13px;"></i>
                    <span>Clear</span>
                  </button>
                </div>
              ` : ''}
            </div>

            <!-- Submit Button -->
            <div style="display:flex; justify-content:flex-end; gap:1rem; border-top:1px solid var(--border-subtle); padding-top:1.5rem;">
              <button class="btn btn-secondary" onclick="studyNotesView.closeCreateView()">
                Cancel
              </button>
              <button class="btn btn-primary btn-hero-import" onclick="studyNotesView.triggerCreateStructuredNote()">
                <i data-lucide="sparkles"></i>
                <span>Generate Digital Textbook with AI ✨</span>
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 3. BOOK-LIKE READING EXPERIENCE (DIGITAL TEXTBOOK VIEW)
  // =========================================================================
  async renderReaderView() {
    const version = this._viewVersion;
    let note = Number(this.activeNote?.id) === Number(this.activeNoteId) ? this.activeNote : await getNoteById(this.activeNoteId);
    if (!note) {
      await new Promise(r => setTimeout(r, 100));
      note = await getNoteById(this.activeNoteId);
    }
    if (!note) {
      console.warn(`Note #${this.activeNoteId} not found in database.`);
      this.currentViewMode = 'DASHBOARD';
      this.activeNoteId = null;
      await this.render();
      return;
    }
    if (version !== this._viewVersion || this.currentViewMode !== 'READER') return;
    this.activeNote = note;

    if (!this.quizConfig) {
      this.quizConfig = { questionCount: 10, difficulty: 'MEDIUM', questionType: 'MCQ' };
    }

    const sections = note.sections || [];
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));

    // Determine active TOC highlight
    if (!this.activeTOCSectionId && sections.length > 0) {
      this.activeTOCSectionId = sections[0].id;
    }

    this.container.innerHTML = `
      <!-- Sticky Top Reading Controls Bar -->
      <div class="textbook-sticky-bar">
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.backToDashboard()" title="Back to Study Notes">
            <i data-lucide="arrow-left" style="width:14px;height:14px;"></i>
            <span>Notes</span>
          </button>
          <span class="study-toolbar-title" style="font-weight:750; font-size:0.95rem; color:var(--text-main); max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${this.escapeHtml(note.title)}
          </span>
          <span class="badge badge-primary study-toolbar-subject" style="font-size:0.75rem;">${this.escapeHtml(note.subject || 'General')}</span>

          <!-- 3-Tab Reader Navigation Pills -->
          <div class="reader-tabs-pill-bar" style="margin-left:0.5rem;">
            <button class="reader-tab-pill ${this.readerActiveTab === 'TEXTBOOK' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('TEXTBOOK')" title="Read structured digital textbook">
              <i data-lucide="book-open" style="width:14px;height:14px;"></i>
              <span>Textbook</span>
            </button>
            <button class="reader-tab-pill ${this.readerActiveTab === 'SUMMARY' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('SUMMARY')" title="View quick, detailed or exam revision notes">
              <i data-lucide="zap" style="width:14px;height:14px; color:${this.readerActiveTab === 'SUMMARY' ? '#ffffff' : '#10b981'};"></i>
              <span>Revision</span>
            </button>
            <button class="reader-tab-pill ${this.readerActiveTab === 'SOURCE' ? 'active' : ''}" onclick="studyNotesView.setReaderTab('SOURCE')" title="View original untouched source material">
              <i data-lucide="file-text" style="width:14px;height:14px;"></i>
              <span>Source</span>
            </button>
          </div>
        </div>

        <details class="study-toolbar-details" ${window.innerWidth>600?'open':''}><summary>Reading tools · Edit, Quiz, Ask AI & Export</summary>
        <div class="study-toolbar-actions" style="display:flex; align-items:center; gap:0.6rem;">
          <!-- Auto-save Status Indicator -->
          <span id="auto-save-status-badge" style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-right:0.5rem;">
            ${this.autoSaveStatus}
          </span>

          <!-- Aa Reading Appearance & Themes Popover Trigger -->
          <div style="position:relative; display:inline-block;">
            <button class="btn btn-secondary btn-sm ${this.isAppearanceMenuOpen ? 'active' : ''}" onclick="studyNotesView.toggleAppearanceMenu()" title="Appearance, Themes & Typography">
              <i data-lucide="type" style="width:14px;height:14px;"></i>
              <span>Aa</span>
            </button>
            <div id="reading-appearance-menu" class="reading-appearance-popover" style="display:${this.isAppearanceMenuOpen ? 'flex' : 'none'};">
              ${this.renderAppearanceMenuContent()}
            </div>
          </div>

          <!-- 🎧 Audio Read-Aloud / TTS -->
          <button id="tts-read-aloud-btn" class="btn btn-secondary btn-sm ${this.isSpeaking ? 'active' : ''}" onclick="studyNotesView.toggleAudioNarration()" title="${this.isSpeaking ? 'Stop Audio Read-Aloud' : 'Listen to Chapter / Section (TTS)'}">
            <i data-lucide="${this.isSpeaking ? 'volume-x' : 'volume-2'}" style="width:14px;height:14px; color:${this.isSpeaking ? '#ef4444' : '#06b6d4'};"></i>
            <span>${this.isSpeaking ? 'Stop' : 'Listen'}</span>
          </button>

          <!-- Focus / Reading Mode Toggle -->
          <button class="icon-btn" onclick="studyNotesView.toggleFocusMode()" title="${this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus / Reading Mode'}" style="color:${this.isFocusMode ? '#10b981' : 'var(--text-main)'};">
            <i data-lucide="${this.isFocusMode ? 'minimize-2' : 'maximize-2'}" style="width:17px;height:17px;"></i>
          </button>

          <!-- Edit Mode Toggle -->
          <button class="icon-btn" onclick="studyNotesView.toggleEditMode()" title="${this.isEditMode ? 'Finish Editing (Auto-saved)' : 'Edit Note Content'}" style="color:${this.isEditMode ? '#6366f1' : 'var(--text-main)'};">
            <i data-lucide="edit-3" style="width:17px;height:17px;"></i>
          </button>

          <!-- 🧠 Generate Quiz Button -->
          <button class="btn btn-primary btn-sm" onclick="studyNotesView.openQuizModal()" title="Generate Practice Quiz">
            <i data-lucide="zap" style="width:14px;height:14px;"></i>
            <span>Quiz</span>
          </button>

          <!-- 💬 Ask AI Button -->
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.toggleAskAiDrawer()" title="Ask AI about this note">
            <i data-lucide="message-square" style="width:14px;height:14px; color:#a855f7;"></i>
            <span>Ask AI</span>
          </button>

          <!-- 📥 Export & Options Menu Dropdown -->
          <div style="position:relative; display:inline-block;">
            <button class="btn btn-secondary btn-sm" onclick="studyNotesView.toggleExportMenu()" title="Export PDF / Options">
              <i data-lucide="download" style="width:14px;height:14px;"></i>
              <span>Export</span>
            </button>
            <div id="export-dropdown-menu" class="vault-card-dropdown-menu glossary-popover-box" style="display:none; width:220px; right:0; top:36px; padding:0.45rem;">
              <button class="vault-menu-action-item" onclick="studyNotesView.exportStudyNotesPdf(${note.id})">
                <i data-lucide="book" style="width:15px;height:15px;"></i>
                <span>Study Notes PDF</span>
              </button>
              <button class="vault-menu-action-item" onclick="studyNotesView.exportPrintableQuizPrompt(${note.id})">
                <i data-lucide="file-question" style="width:15px;height:15px;"></i>
                <span>Printable Quiz PDF</span>
              </button>
              <button class="vault-menu-action-item" onclick="studyNotesView.exportSummarySheetPdf(${note.id})">
                <i data-lucide="file-text" style="width:15px;height:15px;"></i>
                <span>Compact Exam Sheet PDF</span>
              </button>
              <div style="border-top:1px solid var(--border-subtle); margin:0.35rem 0;"></div>
              <button class="vault-menu-action-item btn-danger-item" onclick="studyNotesView.deleteNoteConfirm(${note.id})">
                <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                <span>Delete Note</span>
              </button>
            </div>
          </div>
        </div>
        </details>

        <!-- Real-time Reading Progress Fill Track -->
        <div class="textbook-reading-progress-track">
          <div class="textbook-reading-progress-fill" id="reading-progress-fill"></div>
        </div>
      </div>

      ${this.renderFocusScopeBanner(note)}
      ${this._noteStatusHTML(note)}

      <!-- Main Reader Content: Digital Textbook | High-Yield Summary | Original Source -->
      ${this.readerActiveTab === 'SOURCE'
        ? this.renderOriginalSourceView(note)
        : this.readerActiveTab === 'SUMMARY'
          ? this.renderSummaryTabView(note)
          : `
      <div class="textbook-reader-view ${this.isAskAiOpen && window.innerWidth >= 1100 ? 'split-active' : ''}"
           data-reading-theme="${this.readingTheme}"
           data-reading-font="${this.readingFont}"
           data-reading-size="${this.readingSize}">
        <!-- A. Table of Contents (TOC) & Workspace Sidebar -->
        <aside class="textbook-toc-sidebar"><button class="btn btn-secondary btn-sm study-sidebar-close" onclick="studyNotesView.toggleMobileSidebar()">Close contents</button>
          <!-- Multi-Tab Navigation Bar -->
          <div class="sidebar-nav-tabs-bar">
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'TOC' ? 'active' : ''}" data-tab="TOC" onclick="studyNotesView.setSidebarTab('TOC')" title="Table of Contents">
              <i data-lucide="list" style="width:13px;height:13px;"></i>
              <span>TOC</span>
            </button>
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'CHEATSHEET' ? 'active' : ''}" data-tab="CHEATSHEET" onclick="studyNotesView.setSidebarTab('CHEATSHEET')" title="Quick Cheat Sheet (Defs & Formulas)">
              <i data-lucide="file-check" style="width:13px;height:13px;"></i>
              <span>Cheat Sheet</span>
            </button>
            <button class="sidebar-tab-btn ${this.sidebarActiveTab === 'ANNOTATIONS' ? 'active' : ''}" data-tab="ANNOTATIONS" onclick="studyNotesView.setSidebarTab('ANNOTATIONS')" title="My Highlights & Notes">
              <i data-lucide="highlighter" style="width:13px;height:13px;"></i>
              <span>Highlights</span>
            </button>
          </div>

          <div id="sidebar-tab-content-area" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            ${this.renderSidebarContent(note, sections, readTime, words)}
          </div>
        </aside>

        <!-- B. Textbook Pages Reading Canvas -->
        <main class="textbook-reader-canvas" id="textbook-reading-canvas-body">
          <!-- Top Quiz Generation Request Card (At the Very Top of the Page!) -->
          <div class="top-quiz-request-card" id="top-quiz-request-box">
            <div class="top-quiz-request-header">
              <div style="display:flex; align-items:center; gap:0.85rem; min-width:240px;">
                <div class="top-quiz-icon-badge">
                  <i data-lucide="zap" style="width:22px;height:22px;color:#ffffff;"></i>
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="badge badge-primary" style="font-size:0.75rem; font-weight:700;">AI Practice Drill</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Formulate Questions directly from this Chapter</span>
                  </div>
                  <h3 style="font-size:1.12rem; font-weight:800; color:var(--text-main); margin:0.25rem 0 0 0;">
                    Generate Practice Quiz from "${this.escapeHtml(note.title)}"
                  </h3>
                </div>
              </div>

              <!-- Quick Parameters & Action Button (Right at the Top!) -->
              <div class="top-quiz-quick-actions">
                <div class="top-quiz-chips-group">
                  <span style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">Qs:</span>
                  ${[5, 10, 15, 20, 25].map(cnt => `
                    <button class="select-chip select-chip-sm ${this.quizConfig.questionCount === cnt ? 'active' : ''}"
                      style="min-width:38px; justify-content:center; padding:0.35rem 0.65rem;"
                      onclick="studyNotesView.setQuizCount(${cnt})">
                      <span>${cnt}</span>
                    </button>
                  `).join('')}
                </div>

                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <select class="vault-filter-select"
                    style="min-height:40px; padding:0.35rem 2rem 0.35rem 0.85rem; font-size:0.82rem; min-width:125px;"
                    onchange="studyNotesView.quizConfig.difficulty = this.value">
                    <option value="EASY" ${this.quizConfig.difficulty === 'EASY' ? 'selected' : ''}>🌱 Easy</option>
                    <option value="MEDIUM" ${this.quizConfig.difficulty === 'MEDIUM' ? 'selected' : ''}>⚖️ Medium</option>
                    <option value="HARD" ${this.quizConfig.difficulty === 'HARD' ? 'selected' : ''}>🔥 Hard</option>
                    <option value="MIXED" ${this.quizConfig.difficulty === 'MIXED' ? 'selected' : ''}>🎯 Mixed</option>
                  </select>

                  <button class="btn btn-primary btn-generate-top" onclick="studyNotesView.launchGeneratedQuizForNote(${note.id})" title="Formulate AI Quiz Now">
                    <i data-lucide="zap" style="width:16px;height:16px;"></i>
                    <span>Generate & Start Quiz</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <article class="textbook-book-page ${this.isEditMode ? 'editable-mode' : ''}">
            <!-- Chapter Header -->
            <header class="textbook-chapter-header">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span class="study-vault-badge" style="margin-bottom:0.5rem;">
                  ${this.escapeHtml(note.subject || 'General Study')}
                </span>
                <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">
                  Last read: ${new Date(note.lastReadAt || note.createdAt).toLocaleDateString()}
                </span>
              </div>

              ${this.isEditMode ? `
                <input type="text" class="reading-input-title" style="font-size:1.85rem; margin:0.5rem 0;"
                  value="${this.escapeHtml(note.title)}"
                  onchange="studyNotesView.updateActiveNoteTitle(this.value)">
              ` : `
                <h1 class="textbook-chapter-title">
                  ${this.escapeHtml(note.title)}
                </h1>
              `}

              <div class="textbook-meta-chips-row">
                <span>⏱️ ~${readTime} min read</span>
                <span>•</span>
                <span>📝 ~${words} words</span>
                <span>•</span>
                <span>📚 ${sections.length} Chapters/Sections</span>
                ${note.sourceFiles && note.sourceFiles.length > 0 ? `
                  <span>•</span>
                  <span>📎 ${note.sourceFiles.map(f => this.escapeHtml(f.name)).join(', ')}</span>
                ` : ''}
              </div>
            </header>

            <!-- Book Chapters / Sections -->
            <div id="textbook-sections-container">
              ${sections.map((sec, sIdx) => this.renderSectionContent(sec, sIdx, note)).join('')}
            </div>

            <!-- Bottom Navigation Bar -->
            <div class="study-bottom-navigation" style="display:flex; justify-content:space-between; align-items:center; border-top:2px solid var(--border-subtle); padding-top:1.75rem; margin-top:3rem;">
              <button class="btn btn-secondary" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">
                <i data-lucide="arrow-up"></i>
                <span>Back to Top</span>
              </button>

              <div style="display:flex; gap:0.75rem;">
                <button class="btn btn-secondary" onclick="studyNotesView.setReaderTab('SUMMARY')">
                  <i data-lucide="sparkles"></i>
                  <span>Revision Summary</span>
                </button>
                <button class="btn btn-primary" onclick="studyNotesView.openQuizModal()">
                  <i data-lucide="zap"></i>
                  <span>Practice Quiz (MCQs)</span>
                </button>
              </div>
            </div>
          </article>
        </main>

        <!-- Slide-Out / Split-screen Ask AI Chat Drawer -->
        <aside class="ask-ai-drawer ${this.isAskAiOpen ? 'active' : ''}" id="ask-ai-drawer">
          <div class="ask-ai-header">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="sparkles" style="color:#a855f7; width:20px;height:20px;"></i>
              <h3 style="font-size:1.1rem; font-weight:800; color:var(--text-main); margin:0;">Ask AI Tutor</h3>
            </div>
            <button class="icon-btn" onclick="studyNotesView.closeAskAiDrawer()" title="Close Drawer">
              <i data-lucide="x"></i>
            </button>
          </div>

          <div class="ask-ai-messages" id="ask-ai-msg-list">
            <div class="ask-ai-msg ai">
              👋 Hello! I am your AI study mentor for <strong>"${this.escapeHtml(note.title)}"</strong>. Ask me to clarify any concept, give an analogy, or explain exam-relevant questions grounded directly in this note!
            </div>
            ${this.askAiMessages.map(m => `
              <div class="ask-ai-msg ${m.role}">
                ${this.escapeHtml(m.text)}
              </div>
            `).join('')}
          </div>

          <!-- Quick Prompt Chips -->
          <div style="padding:0.5rem 1rem; display:flex; gap:0.4rem; overflow-x:auto;">
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('Explain this chapter in simple language with an intuitive real-world analogy.')">
              💡 Explain simply
            </button>
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('What are the top 3 high-yield concepts most likely to be asked in exams?')">
              📌 3 Core Exam Points
            </button>
            <button class="topic-pill" onclick="studyNotesView.sendQuickAiQuestion('What common student misconceptions or traps should I avoid in this topic?')">
              ⚠️ Common Pitfalls
            </button>
          </div>

          <div class="ask-ai-input-box">
            <input type="text" id="ask-ai-input-field" placeholder="Ask a question about this note..." onkeydown="if(event.key==='Enter') studyNotesView.sendAiMessage()">
            <button class="btn btn-primary btn-sm" onclick="studyNotesView.sendAiMessage()">
              <i data-lucide="send" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </aside>
      </div>
      `}

      <!-- Backdrop overlay for Ask AI Drawer -->
      <div class="ask-ai-backdrop ${this.isAskAiOpen ? 'active' : ''}" id="ask-ai-backdrop" onclick="studyNotesView.closeAskAiDrawer()"></div>

      <!-- Interactive Example Modal -->
      ${this.activeExampleData ? `
        <div class="modal-overlay active" onclick="studyNotesView.closeExampleModal()">
          <div class="modal-content" style="max-width:620px; padding:2.25rem; border-radius:24px; border:1.5px solid #c084fc;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
              <div>
                <span class="semantic-example-badge">
                  <i data-lucide="lightbulb" style="width:14px;height:14px;"></i> Interactive Example Breakdown
                </span>
                <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0.35rem 0 0 0;">
                  ${this.escapeHtml(this.activeExampleData.title)}
                </h3>
              </div>
              <button class="icon-btn" onclick="studyNotesView.closeExampleModal()">
                <i data-lucide="x"></i>
              </button>
            </div>

            <div style="font-size:1.02rem; line-height:1.75; color:var(--text-main); margin-bottom:1.25rem; white-space:pre-wrap;">
              ${this.escapeHtml(this.activeExampleData.content)}
            </div>

            ${this.activeExampleData.stepByStep && this.activeExampleData.stepByStep.length > 0 ? `
              <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:14px; padding:1.1rem 1.35rem; margin-bottom:1rem;">
                <div style="font-size:0.85rem; font-weight:800; color:#c084fc; text-transform:uppercase; margin-bottom:0.4rem;">
                  Step-by-Step Educational Logic:
                </div>
                <ol style="margin:0; padding-left:1.2rem; font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                  ${this.activeExampleData.stepByStep.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
                </ol>
              </div>
            ` : ''}

            ${this.activeExampleData.realWorldAnalogy ? `
              <div style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:14px; padding:1.1rem 1.35rem; margin-bottom:1.25rem;">
                <div style="font-size:0.85rem; font-weight:800; color:#38bdf8; text-transform:uppercase; margin-bottom:0.4rem;">
                  💡 Real-World Intuitive Analogy:
                </div>
                <div style="font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                  ${this.escapeHtml(this.activeExampleData.realWorldAnalogy)}
                </div>
              </div>
            ` : ''}

            <div style="display:flex; justify-content:flex-end;">
              <button class="btn btn-secondary" onclick="studyNotesView.closeExampleModal()">
                Close & Resume Reading
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- AI Summary Modal -->
      ${this.isSummaryModalOpen ? `
        <div class="modal-overlay active" onclick="studyNotesView.closeSummaryModal()">
          <div class="modal-content" style="max-width:720px; padding:2.25rem; border-radius:24px; border:1.5px solid #10b981;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <i data-lucide="sparkles" style="color:#10b981; width:22px;height:22px;"></i>
                <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">
                  High-Yield Revision Summary
                </h3>
              </div>
              <button class="icon-btn" onclick="studyNotesView.closeSummaryModal()">
                <i data-lucide="x"></i>
              </button>
            </div>

            <div style="max-height:65vh; overflow-y:auto; padding-right:0.5rem;">
              ${note.summary ? `
                <div class="semantic-definitions-card" style="margin-top:0;">
                  <div class="semantic-block-title-emerald">💡 Core Executive Summary</div>
                  <div style="font-size:1rem; line-height:1.7; color:var(--text-main);">
                    ${this.escapeHtml(note.summary.coreConcept || '')}
                  </div>
                </div>

                <div class="semantic-keypoints-box">
                  <div class="semantic-block-title-indigo">📌 Top 5 High-Yield Key Takeaways</div>
                  <ul class="semantic-keypoints-list">
                    ${(note.summary.takeaways || []).map(t => `<li>${this.escapeHtml(t)}</li>`).join('')}
                  </ul>
                </div>

                ${note.summary.examTraps && note.summary.examTraps.length > 0 ? `
                  <div class="semantic-facts-box" style="border-left-color:#ef4444; background:rgba(239,68,68,0.08);">
                    <div style="font-size:0.88rem; font-weight:800; color:#ef4444; text-transform:uppercase; margin-bottom:0.5rem;">
                      ⚠️ Critical Exam Pitfalls to Avoid
                    </div>
                    <ul style="margin:0; padding-left:1.25rem; font-size:0.95rem; line-height:1.65; color:var(--text-main);">
                      ${note.summary.examTraps.map(trap => `<li>${this.escapeHtml(trap)}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                ${note.summary.finalTakeaway ? `
                  <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); border-radius:12px; padding:0.85rem 1.25rem; font-size:0.92rem; color:var(--text-secondary); font-style:italic;">
                    🎯 ${this.escapeHtml(note.summary.finalTakeaway)}
                  </div>
                ` : ''}
              ` : `
                <div style="text-align:center; padding:2rem 1rem;">
                  <p style="color:var(--text-secondary); margin-bottom:1.5rem;">No summary generated yet for this note.</p>
                  <button class="btn btn-primary" onclick="studyNotesView.generateFreshSummary(${note.id})">
                    <i data-lucide="sparkles"></i>
                    <span>Generate AI Summary Now</span>
                  </button>
                </div>
              `}
            </div>

            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-subtle); padding-top:1.25rem; margin-top:1.25rem;">
              <button class="btn btn-secondary btn-sm" onclick="studyNotesView.exportSummarySheetPdf(${note.id})">
                <i data-lucide="printer" style="width:14px;height:14px;"></i>
                <span>Download Summary PDF</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="studyNotesView.closeSummaryModal()">
                Done
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      ${this.isQuizModalOpen ? this._quizDialogHTML() : ''}

      <!-- Interactive Smart Glossary Popover -->
      ${this.activeGlossaryTerm && this.activeGlossaryPos ? `
        <div class="glossary-popover-box" style="left:${this.activeGlossaryPos.x}px; top:${this.activeGlossaryPos.y}px;" onclick="event.stopPropagation()">
          <div class="glossary-popover-term">
            <span>${this.escapeHtml(this.activeGlossaryTerm.term)}</span>
            <button class="icon-btn" style="padding:0; width:22px; height:22px;" onclick="studyNotesView.closeGlossaryPopover()">
              <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
          </div>
          ${this.activeGlossaryTerm.hindiMeaning ? `
            <div class="glossary-popover-hindi">
              🇮🇳 ${this.escapeHtml(this.activeGlossaryTerm.hindiMeaning)}
            </div>
          ` : ''}
          <div class="glossary-popover-desc">
            ${this.escapeHtml(this.activeGlossaryTerm.simpleMeaning || this.activeGlossaryTerm.contextMeaning)}
          </div>
          ${this.activeGlossaryTerm.exampleSentence ? `
            <div class="glossary-popover-sentence">
              "${this.escapeHtml(this.activeGlossaryTerm.exampleSentence)}"
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;

    // Attach scroll listener to update TOC active item and reading progress bar
    this.initScrollspyListener();
    this.findInNote(this.searchInNoteQuery);
    this.renderAskAiMessages();
  }

  setReaderTab(tab) {
    this.readerActiveTab = tab;
    this.showingOriginalSource = (tab === 'SOURCE');
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  setSourceViewMode(showOriginal) {
    this.setReaderTab(showOriginal ? 'SOURCE' : 'TEXTBOOK');
  }

  renderOriginalSourceView(note) {
    const original=note.originalSource||{text:note.content,files:[],pages:[]};
    const files=original.files||[],pages=original.pages||[];
    const selected=this._sourceSelection||{fileName:files[0]?.name||pages[0]?.fileName,page:0};
    const file=files.find(file=>file.name===selected.fileName)||files[0],url=this._sourceURL(file);
    return `<div class="original-source-panel study-original"><h1>Source material · ${this.escapeHtml(note.title)}</h1><p>Original uploaded files are available below. Extracted text may differ from the document's layout; OCR text should be checked against the page.</p>
      <div class="study-source-refs">${files.map(file=>`<button onclick="studyNotesView.openSourceReference('${this.escapeHtml(this.escapeJs(file.name))}',0)">${this.escapeHtml(file.name)}</button>`).join('')}</div>
      ${url?`<div class="study-source-document">${file.type==='PDF'?`<iframe title="Original PDF" src="${this.escapeHtml(url)}#page=${Number(selected.page)||1}"></iframe>`:`<img src="${this.escapeHtml(url)}" alt="Original uploaded study page">`}<a class="btn btn-secondary btn-sm" href="${this.escapeHtml(url)}" download="${this.escapeHtml(file.name)}">Download original file</a></div>`:'<p class="study-muted">This older note stores extracted text only; the original file was not saved.</p>'}
      <div class="study-revision-actions"><button class="btn btn-secondary btn-sm" onclick="studyNotesView.copySourceText()">Copy extracted text</button><button class="btn btn-secondary btn-sm" onclick="studyNotesView.downloadSourceText(${Number(note.id)})">Download extracted text</button></div>
      ${pages.length?pages.filter(page=>!selected.fileName||page.fileName===selected.fileName).map(page=>`<details class="study-extra" ${Number(selected.page)===Number(page.page)&&selected.page?'open':''}><summary>${this.escapeHtml(page.fileName)}${page.page?' · page '+Number(page.page):''} · ${page.method==='OCR'?'OCR transcription':'Extracted text'}</summary><pre>${this.escapeHtml(page.text)}</pre></details>`).join(''):''}
      <details class="study-extra"><summary>All extracted source text</summary><pre id="raw-source-text-box">${this.escapeHtml(original.text||'')}</pre></details>
    </div>`;
  }

  renderSummaryTabView(note) {
    const summary = note.summary || window.geminiService.generateFallbackComprehensiveSummary({ title: note.title, subject: note.subject, sections: note.sections || [] });
    const escape = value => this.escapeHtml(value || '');
    const prose=value=>window.marked?SecurityUtils.sanitizeHtml(window.marked.parse(escape(value))):escape(value);
    const quick = this.revisionMode === 'QUICK', exam = this.revisionMode === 'EXAM';
    const breakdowns = summary.sectionBreakdowns || [];
    return `<div class="study-revision notebook-revision">
      <div class="study-revision-header"><div><h1>${escape(note.title)}</h1><p>${summary.generationSource === 'GEMINI_AI' ? 'AI revision · all sections processed' : 'Revision extracted from your notes · AI synthesis not generated'}</p></div>
      <div class="study-revision-actions"><button class="btn btn-secondary btn-sm" onclick="studyNotesView.generateFreshSummary(${Number(note.id)})">Refresh with AI</button><button class="btn btn-secondary btn-sm" onclick="studyNotesView.exportSummarySheetPdf(${Number(note.id)})">Export this revision</button></div></div>
      <div class="study-revision-tabs" role="group" aria-label="Revision length">${[['QUICK','Quick Revision'],['DETAILED','Detailed Revision'],['EXAM','Exam Sheet']].map(([key,label]) => `<button class="btn btn-sm ${this.revisionMode === key ? 'btn-primary' : 'btn-secondary'}" aria-pressed="${this.revisionMode === key}" onclick="studyNotesView.setRevisionMode('${key}')">${label}</button>`).join('')}</div>
      ${quick ? `<div class="study-revision-intro study-prose">${prose(summary.coreConcept)}</div><ol>${(summary.takeaways || []).slice(0, 8).map(point => `<li>${escape(point)}</li>`).join('')}</ol><p class="study-muted">Quick revision shows selected highlights. Open Detailed Revision for every section.</p>` : ''}
      ${!quick && !exam ? breakdowns.map(section => `<section class="study-revision-section"><h2>${escape(section.sectionTitle)}</h2><div class="study-prose">${prose(section.deepDiveSummary)}</div><ul>${(section.highYieldPointers || []).map(point => `<li>${escape(point)}</li>`).join('')}</ul>${this._sourceRefsHTML(section.sourceRefs || [])}${section.sectionId ? `<button class="btn btn-secondary btn-xs" onclick="studyNotesView.returnToSection('${this.escapeHtml(this.escapeJs(section.sectionId))}')">Read full explanation</button>` : ''}</section>`).join('') : ''}
      ${exam ? `<div class="study-exam-outline">${breakdowns.map(section => `<section><h3>${escape(section.sectionTitle)}</h3><ul>${(section.highYieldPointers || []).slice(0, 3).map(point => `<li>${escape(point)}</li>`).join('')}</ul></section>`).join('')}</div>` : ''}
      ${!quick ? `<div class="study-reference-grid">${(summary.keyDefinitions || []).map(item => `<div><strong>${escape(item.term)}</strong><p>${escape(item.definition)}</p></div>`).join('')}${(summary.formulasOrRules || []).map(item => `<div><strong>${escape(item.name)}</strong><p class="study-formula">${escape(item.rule)}</p><p>${escape(item.significance)}</p></div>`).join('')}</div>${(summary.examTraps || []).length ? `<details class="study-extra"><summary>Misconceptions to avoid</summary><ul>${summary.examTraps.map(trap => `<li>${escape(trap)}</li>`).join('')}</ul></details>` : ''}` : ''}
      <button class="btn btn-secondary" onclick="studyNotesView.setReaderTab('TEXTBOOK')">Back to textbook</button>
    </div>`;
  }

  copySourceText() {
    const el = document.getElementById('raw-source-text-box');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      app.showToast('Original source text copied to clipboard!', 'success');
      if (window.audioEngine) window.audioEngine.playClick();
    }).catch(() => {
      app.showToast('Could not copy text.', 'error');
    });
  }

  downloadSourceText(noteId) {
    const note = this.activeNote;
    if (!note) return;
    const originalText = note.originalSource?.text || note.content || '';
    // Previously revoked the object URL synchronously right after click(), which
    // can cancel the download in some browsers. downloadBlob() defers the revoke.
    UIUtils.downloadText(
      originalText,
      `${UIUtils.slugify(note.title, 'study-note')}-original-source.txt`
    );
    app.showToast('Source file downloaded.', 'info');
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // =========================================================================
  // SECTION CONTENT BUILDER (COLOR-CODED BLOCKS & INTERACTIVE GLOSSARY)
  // =========================================================================
  renderSectionContent(sec, index, note) {
    const escape = value => this.escapeHtml(value || '');
    const id = escape(sec.id), argument = escape(this.escapeJs(sec.id));
    const selected = this.selectedQuizSections == null || this.selectedQuizSections.includes(sec.id);
    const extra = (title, content) => `<details class="study-extra"><summary>${title}</summary>${content}</details>`;
    const refs = this._sourceRefsHTML(sec.sourceRefs || []);
    let body = this.injectGlossarySpans(sec.content || '', note.glossaryTerms || []);
    const wrapper = document.createElement('div'); wrapper.innerHTML = body;
    for (const highlight of note.annotations?.highlights || []) if (highlight.sectionId === sec.id) this._applySavedHighlight(wrapper, highlight);
    body = wrapper.innerHTML;
    return `<section class="textbook-section-block study-compact-section" id="${id}" data-study-section="${id}">
      <div class="study-section-heading"><h2>${escape(sec.heading || `Section ${index + 1}`)}</h2><div class="study-section-tools"><button class="btn btn-secondary btn-xs" onclick="studyNotesView.createFlashcardsFromSection('${argument}')">Flashcards</button><button class="btn btn-secondary btn-xs" onclick="studyNotesView.readSectionAloud('${argument}')">Listen</button></div></div>
      ${sec.supportingContentStale?`<div class="study-edited-notice">Explanation edited. Rebuild teaching aids to match your changes.<button class="btn btn-secondary btn-sm" onclick="studyNotesView.refreshSectionTeaching('${argument}')">Refresh teaching aids with AI</button></div>`:''}
      ${refs}${this.isEditMode ? `<textarea class="live-reading-canvas" aria-label="Edit ${escape(sec.heading)}" oninput="studyNotesView.onSectionTextEdit('${argument}',this.value)">${escape(sec.content)}</textarea>` : `<div class="textbook-body-paragraph study-prose">${body}</div>`}
      ${(sec.keyPoints || []).length ? `<div class="study-keypoints"><strong>Remember</strong><ul>${sec.keyPoints.map(point => `<li>${escape(point)}</li>`).join('')}</ul></div>` : ''}
      ${(sec.definitions || []).length ? extra('Definitions & terms', `<dl>${sec.definitions.map(item => `<dt>${escape(item.term)}</dt><dd>${escape(item.definition)}</dd>`).join('')}</dl>`) : ''}
      ${(sec.formulas || []).length ? `<div class="study-formulas">${sec.formulas.map(item => `<div><strong>${escape(item.name)}</strong><p class="study-formula">${escape(item.formula)}</p><p>${escape(item.explanation)}</p></div>`).join('')}</div>` : ''}
      ${(sec.tables || []).map(table => `<div class="study-table-scroll"><table><caption>${escape(table.title)}</caption><thead><tr>${table.headers.map(cell => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
      ${sec.flowchart?.nodes?.length ? `<figure class="study-flow"><figcaption>${escape(sec.flowchart.title)}</figcaption><ol>${sec.flowchart.nodes.map(node => `<li><strong>${escape(node.label)}</strong><span>${escape(node.description)}</span></li>`).join('')}</ol></figure>` : ''}
      ${sec.diagram?.svgContent ? `<figure class="study-diagram"><figcaption>${escape(sec.diagram.title)}</figcaption>${window.SecurityUtils.sanitizeSvg(sec.diagram.svgContent)}<p>${escape(sec.diagram.caption)}</p></figure>` : ''}
      ${(sec.examples || []).length ? extra('Worked examples & analogies', sec.examples.map(example => `<article class="study-example"><h3>${escape(example.title)}</h3><span class="study-muted">${example.origin === 'TEACHING_EXAMPLE' ? 'Additional teaching example' : 'Example from this note'}</span><p>${escape(example.content)}</p>${example.stepByStep?.length ? `<ol>${example.stepByStep.map(step => `<li>${escape(step)}</li>`).join('')}</ol>` : ''}${example.realWorldAnalogy ? `<p>${escape(example.realWorldAnalogy)}</p>` : ''}</article>`).join('')) : ''}
      ${(sec.importantFacts || []).length ? extra('Facts & exam pointers', `<ul>${sec.importantFacts.map(point => `<li>${escape(point)}</li>`).join('')}</ul>`) : ''}
      ${this.renderSectionMicroQuiz(sec,index,note)}
      <label class="study-practice-choice"><input type="checkbox" ${selected ? 'checked' : ''} onchange="studyNotesView.selectQuizSection('${argument}',this.checked)"> Include this section in practice</label>
      ${this.renderSectionMasteryFooter(sec,index,note)}
    </section>`;
  }

  injectGlossarySpans(text, glossaryTerms) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = window.marked ? SecurityUtils.sanitizeHtml(window.marked.parse(String(text || ''))) : this.escapeHtml(text);
    const terms = (glossaryTerms || []).map((term,index) => ({ ...term,index })).filter(term => typeof term.term === 'string' && term.term.trim().length >= 2).sort((a,b) => b.term.length-a.term.length);
    if (!terms.length) return wrapper.innerHTML;
    const regex = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(${terms.map(term => this.escapeRegex(term.term)).join('|')})(?![\\p{L}\\p{M}\\p{N}])`,'giu');
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);const nodes=[];
    while(walker.nextNode()) if(!walker.currentNode.parentElement.closest('code,pre,button,a')) nodes.push(walker.currentNode);
    for(const node of nodes) {
      let start=0, match;const fragment=document.createDocumentFragment();regex.lastIndex=0;
      while((match=regex.exec(node.data))) {
        fragment.append(document.createTextNode(node.data.slice(start,match.index)));
        const term=terms.find(term => term.term.toLocaleLowerCase()===match[0].toLocaleLowerCase());
        const button=document.createElement('button');button.type='button';button.className='glossary-interactive-term';button.textContent=match[0];button.setAttribute('onclick',`studyNotesView.showGlossaryByIndex(event,${term.index})`);
        fragment.append(button);start=match.index+match[0].length;
      }
      if(start) {fragment.append(document.createTextNode(node.data.slice(start)));node.replaceWith(fragment);}
    }
    return wrapper.innerHTML;
  }

  showGlossaryPopover(e, termName) {
    e.stopPropagation();
    const g = this.activeNote?.glossaryTerms?.find(t => t.term.toLowerCase() === termName.toLowerCase());
    if (g) {
      const rect = e.target.getBoundingClientRect();
      this.activeGlossaryTerm = g;
      this.activeGlossaryPos = {
        x: Math.max(8, Math.min(window.innerWidth - Math.min(320,window.innerWidth-16) - 8, Math.max(8, rect.left + window.scrollX - 40))),
        y: rect.bottom + window.scrollY + 8
      };
      this.render();
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  closeGlossaryPopover() {
    const wasOpen=!!this.activeGlossaryTerm;this.activeGlossaryTerm=null;this.activeGlossaryPos=null;
    if(wasOpen)this.render();
  }

  initTextSelectionListener() {
    const show=()=>{
      if(this.currentViewMode!=='READER'||window.app?.currentView!=='study-notes'||this.isEditMode)return;
      const selection=window.getSelection();if(!selection?.rangeCount)return;
      const range=selection.getRangeAt(0),text=selection.toString().trim();
      const body=range.startContainer.parentElement?.closest('.textbook-body-paragraph');
      if(!body||!body.contains(range.endContainer)||text.length<3||text.length>5000)return;
      this._selection={range:range.cloneRange(),body,text,sectionId:body.closest('[data-study-section]').dataset.studySection};
      const old=document.getElementById('floating-selection-toolbar');old?.remove();
      const rect=range.getBoundingClientRect?.()||{left:16,top:180,width:0};const toolbar=document.createElement('div');
      toolbar.id='floating-selection-toolbar';toolbar.className='text-selection-toolbar';
      toolbar.style.left=`${Math.max(8,Math.min(window.innerWidth-280,rect.left))}px`;toolbar.style.top=`${Math.max(8,rect.top+window.scrollY-48)}px`;
      toolbar.addEventListener('pointerdown',event=>event.preventDefault());
      toolbar.innerHTML=`<button class="hl-color-btn hl-yellow" aria-label="Highlight yellow" onclick="studyNotesView.highlightSelectedText('yellow')"></button><button class="hl-color-btn hl-green" aria-label="Highlight green" onclick="studyNotesView.highlightSelectedText('green')"></button><button class="hl-color-btn hl-purple" aria-label="Highlight purple" onclick="studyNotesView.highlightSelectedText('purple')"></button><button class="floating-btn" onclick="studyNotesView.explainSelectedText(studyNotesView._selection.text)">Explain</button><button class="floating-btn" onclick="studyNotesView.bookmarkSelectedText(studyNotesView._selection.text)">Bookmark</button>`;
      document.body.append(toolbar);
    };
    document.addEventListener('mouseup',event=>{if(!event.target.closest('#floating-selection-toolbar'))show();});
    document.addEventListener('touchend',()=>setTimeout(show,80),{passive:true});
    document.addEventListener('click',event=>{
      if(!event.target.closest('[id^="card-menu-"],button[onclick*="toggleCardMenu"]'))document.querySelectorAll('[id^="card-menu-"]').forEach(menu=>menu.style.display='none');
      if(!event.target.closest('#export-dropdown-menu,button[onclick*="toggleExportMenu"]')){const menu=document.getElementById('export-dropdown-menu');if(menu)menu.style.display='none';}
      if(!event.target.closest('#reading-appearance-menu,button[onclick*="toggleAppearanceMenu"]')){const menu=document.getElementById('reading-appearance-menu');if(menu)menu.style.display='none';this.isAppearanceMenuOpen=false;}
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){this.closeAskAiDrawer();document.querySelector('.textbook-toc-sidebar')?.classList.remove('study-sidebar-open');if(this.isQuizModalOpen)this.closeQuizModal();this.closeGlossaryPopover();}
      const dialog=document.querySelector('.study-quiz-dialog');if(event.key==='Tab'&&dialog){const controls=[...dialog.querySelectorAll('button,input,select')].filter(el=>!el.disabled),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    });
  }

  async highlightSelectedText(color) {
    if(!this.activeNote)return;
    const selection=this._selection;if(!selection||!document.contains(selection.body))return;
    const note=this.activeNote,range=selection.range,prefix=range.cloneRange();prefix.selectNodeContents(selection.body);prefix.setEnd(range.startContainer,range.startOffset);
    const text=range.toString();const start=prefix.toString().length;
    const item={id:`hl-${Date.now()}`,sectionId:selection.sectionId,text,color:['yellow','green','purple'].includes(color)?color:'yellow',start,prefix:selection.body.textContent.slice(Math.max(0,start-32),start),createdAt:new Date().toISOString()};
    const annotations=this._clone(note.annotations||{highlights:[],bookmarks:[],personalNotes:[]});annotations.highlights||=[];annotations.highlights.push(item);
    try{await updateNoteAnnotations(note.id,annotations);if(Number(this.activeNote?.id)!==Number(note.id))return;note.annotations=annotations;window.getSelection()?.removeAllRanges();document.getElementById('floating-selection-toolbar')?.remove();await this.render();}
    catch(error){window.app?.showToast(`Highlight could not be saved: ${error.message}`,'error');}
  }

  async explainSelectedText(term) {
    const note=this.activeNote;if(!note)return;const version=this._viewVersion,controller=this._controller();
    const section=note.sections.find(section=>section.id===(this._selection?.sectionId||this.activeTOCSectionId));
    document.getElementById('floating-selection-toolbar')?.remove();
    try{const explanation=await window.geminiService.explainTermContextually({term,contextSentence:section?.content||'',noteTopic:note.title,signal:controller.signal});if(version!==this._viewVersion||controller.signal.aborted)return;this.activeGlossaryTerm=explanation;this.activeGlossaryPos={x:Math.max(8,Math.min(window.innerWidth-328,window.innerWidth/2-160)),y:window.scrollY+180};await this.render();}
    catch(error){if(error.name!=='AbortError'&&version===this._viewVersion)window.app?.showToast(`Explanation failed: ${error.message}`,'error');}
    finally{this._controllers.delete(controller);}
  }

  async bookmarkSelectedText(text) {
    const note=this.activeNote;if(!note)return;
    const annotations=this._clone(note.annotations||{highlights:[],bookmarks:[],personalNotes:[]});annotations.bookmarks||=[];
    annotations.bookmarks.push({id:`bm-${Date.now()}`,sectionId:this._selection?.sectionId||this.activeTOCSectionId,note:text,createdAt:new Date().toISOString()});
    try{await updateNoteAnnotations(note.id,annotations);if(Number(this.activeNote?.id)!==Number(note.id))return;note.annotations=annotations;document.getElementById('floating-selection-toolbar')?.remove();this.refreshSidebarTab();}
    catch(error){window.app?.showToast(`Bookmark could not be saved: ${error.message}`,'error');}
  }

  openExampleModal(sectionId, exampleId) {
    const sec = this.activeNote?.sections?.find(s => s.id === sectionId);
    const ex = sec?.examples?.find(e => (e.id || 'ex-1') === exampleId) || sec?.examples?.[0];
    if (ex) {
      this.activeExampleData = ex;
      this.render();
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  closeExampleModal() {
    this.activeExampleData = null;
    this.render();
  }

  // =========================================================================
  // ASK AI ABOUT THIS NOTE (GROUNDED Q&A & SPLIT-SCREEN)
  // =========================================================================
  closeAskAiDrawer() {
    this.isAskAiOpen = false;
    const el = document.getElementById('ask-ai-drawer');
    if (el) el.classList.remove('active');
    const bd = document.getElementById('ask-ai-backdrop');
    if (bd) bd.classList.remove('active');
    const readerView = document.querySelector('.textbook-reader-view');
    if (readerView) readerView.classList.remove('split-active');
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleAskAiDrawer() {
    if(this.readerActiveTab!=='TEXTBOOK'){this.readerActiveTab='TEXTBOOK';this.isAskAiOpen=true;this.render();return;}
    this.isAskAiOpen = !this.isAskAiOpen;
    const el = document.getElementById('ask-ai-drawer');
    if (el) el.classList.toggle('active', this.isAskAiOpen);
    const bd = document.getElementById('ask-ai-backdrop');
    if (bd) bd.classList.toggle('active', this.isAskAiOpen);

    // Toggle split-screen class on desktop
    const readerView = document.querySelector('.textbook-reader-view');
    if (readerView && window.innerWidth >= 1100) {
      readerView.classList.toggle('split-active', this.isAskAiOpen);
    }

    if (window.audioEngine) window.audioEngine.playClick();

    if (this.isAskAiOpen) {
      setTimeout(() => {
        const inp = document.getElementById('ask-ai-input-field');
        if (inp) inp.focus();
      }, 150);
    }
  }

  // =========================================================================
  // READING APPEARANCE & THEMES CONTROLLER (Aa)
  // =========================================================================
  toggleAppearanceMenu() {
    this.isAppearanceMenuOpen = !this.isAppearanceMenuOpen;
    const menu = document.getElementById('reading-appearance-menu');
    if (menu) {
      menu.style.display = this.isAppearanceMenuOpen ? 'flex' : 'none';
    }
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingTheme(theme) {
    this.readingTheme = theme;
    localStorage.setItem('hamsa_textbook_theme', theme);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-theme', theme);

    document.querySelectorAll('.theme-swatch-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingFont(font) {
    this.readingFont = font;
    localStorage.setItem('hamsa_textbook_font', font);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-font', font);

    document.querySelectorAll('.font-choice-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.font === font);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setReadingSize(size) {
    this.readingSize = size;
    localStorage.setItem('hamsa_textbook_size', size);
    const el = document.querySelector('.textbook-reader-view');
    if (el) el.setAttribute('data-reading-size', size);

    document.querySelectorAll('.size-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.size === size);
    });
    if (window.audioEngine) window.audioEngine.playClick();
  }

  renderAppearanceMenuContent() {
    return `
      <div>
        <div class="appearance-group-label">Reading Theme</div>
        <div class="appearance-theme-swatches">
          <button class="theme-swatch-btn ${this.readingTheme === 'DEFAULT' ? 'active' : ''}" data-theme="DEFAULT" onclick="studyNotesView.setReadingTheme('DEFAULT')">
            <div class="swatch-circle swatch-default"></div>
            <span>Default</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'SEPIA' ? 'active' : ''}" data-theme="SEPIA" onclick="studyNotesView.setReadingTheme('SEPIA')">
            <div class="swatch-circle swatch-sepia"></div>
            <span>Warm</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'PAPER' ? 'active' : ''}" data-theme="PAPER" onclick="studyNotesView.setReadingTheme('PAPER')">
            <div class="swatch-circle swatch-paper"></div>
            <span>Paper</span>
          </button>
          <button class="theme-swatch-btn ${this.readingTheme === 'OLED' ? 'active' : ''}" data-theme="OLED" onclick="studyNotesView.setReadingTheme('OLED')">
            <div class="swatch-circle swatch-oled"></div>
            <span>OLED</span>
          </button>
        </div>
      </div>

      <div>
        <div class="appearance-group-label">Typography</div>
        <div class="appearance-font-grid">
          <button class="font-choice-btn ${this.readingFont === 'SERIF' ? 'active' : ''}" data-font="SERIF" onclick="studyNotesView.setReadingFont('SERIF')">
            📖 Book Serif
          </button>
          <button class="font-choice-btn ${this.readingFont === 'SANS' ? 'active' : ''}" data-font="SANS" onclick="studyNotesView.setReadingFont('SANS')">
            ⚡ Clean Sans
          </button>
          <button class="font-choice-btn ${this.readingFont === 'DYSLEXIC' ? 'active' : ''}" data-font="DYSLEXIC" onclick="studyNotesView.setReadingFont('DYSLEXIC')">
            🎯 Focus Font
          </button>
        </div>
      </div>

      <div>
        <div class="appearance-group-label">Text Sizing</div>
        <div class="size-stepper-row">
          <button class="size-btn ${this.readingSize === 'SM' ? 'active' : ''}" data-size="SM" onclick="studyNotesView.setReadingSize('SM')">A-</button>
          <button class="size-btn ${this.readingSize === 'MD' ? 'active' : ''}" data-size="MD" onclick="studyNotesView.setReadingSize('MD')">Normal</button>
          <button class="size-btn ${this.readingSize === 'LG' ? 'active' : ''}" data-size="LG" onclick="studyNotesView.setReadingSize('LG')">Large</button>
          <button class="size-btn ${this.readingSize === 'XL' ? 'active' : ''}" data-size="XL" onclick="studyNotesView.setReadingSize('XL')">A+</button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // AUDIO READ-ALOUD / TEXT-TO-SPEECH (WEB SPEECH API)
  // =========================================================================
  toggleAudioNarration() {
    if (!('speechSynthesis' in window)) {
      app.showToast('Text-to-Speech is not supported in this browser.', 'warning');
      return;
    }

    if (this.isSpeaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.updateTtsButtonState();
      app.showToast('Audio read-aloud stopped.', 'info');
      return;
    }

    // Read current active section or first section
    const sec = this.activeNote?.sections?.find(s => s.id === this.activeTOCSectionId) || this.activeNote?.sections?.[0];
    if (sec) {
      this.readSectionAloud(sec.id);
    } else if (this.activeNote?.content) {
      this.speakText(this.activeNote.title + '. ' + this.activeNote.content, this.activeNote.title);
    }
  }

  readSectionAloud(secId) {
    if (!('speechSynthesis' in window)) {
      app.showToast('Text-to-Speech is not supported in this browser.', 'warning');
      return;
    }

    window.speechSynthesis.cancel();

    const sec = this.activeNote?.sections?.find(s => s.id === secId);
    if (!sec) return;

    let text = `${sec.heading}. `;
    if (sec.subheading) text += `${sec.subheading}. `;
    if (sec.content) text += `${sec.content}. `;
    if (sec.definitions && sec.definitions.length > 0) {
      text += 'Definitions: ' + sec.definitions.map(d => `${d.term}, ${d.definition}`).join('. ') + '. ';
    }
    if (sec.keyPoints && sec.keyPoints.length > 0) {
      text += 'Key points: ' + sec.keyPoints.join('. ') + '. ';
    }

    this.speakText(text, sec.heading);
  }

  speakText(text, label) {
    const clean = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const lang=/[\u0900-\u097f]/.test(clean)?'hi-IN':'en-IN';utterance.lang=lang;
    const preferredVoice = voices.find(v => v.lang === lang) || voices.find(v=>v.lang.startsWith(lang.slice(0,2))) || voices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.updateTtsButtonState();
      app.showToast(`🎧 Reading aloud: "${label || 'Section'}"...`, 'info');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateTtsButtonState();
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      this.isSpeaking = false;
      this.updateTtsButtonState();
    };

    this.speechUtterance = utterance;
    window.studyPreferences?.applySpeech(utterance, clean);
    window.speechSynthesis.speak(utterance);
  }

  updateTtsButtonState() {
    const btn = document.getElementById('tts-read-aloud-btn');
    if (btn) {
      btn.className = `btn btn-secondary btn-sm ${this.isSpeaking ? 'active' : ''}`;
      btn.innerHTML = `
        <i data-lucide="${this.isSpeaking ? 'volume-x' : 'volume-2'}" style="width:14px;height:14px; color:${this.isSpeaking ? '#ef4444' : '#06b6d4'};"></i>
        <span>${this.isSpeaking ? 'Stop' : 'Listen'}</span>
      `;
      if (window.app) window.app.refreshIcons();
    }
  }

  // =========================================================================
  // SECTION MASTERY & PROGRESS CONTROLLER
  // =========================================================================
  async toggleSectionMastery(secId) {
    const note=this.activeNote,version=this._viewVersion;
    if(!note||this._masteryPending||!note.sections?.some(section=>section.id===secId))return;
    const list=[...(note.masteredSections||[])].filter(id=>note.sections.some(section=>section.id===id));
    const idx=list.indexOf(secId),isMastered=idx===-1;
    if(isMastered)list.push(secId);else list.splice(idx,1);
    this._masteryPending=true;
    try{await updateNoteMastery(note.id,list);}
    catch(error){if(version===this._viewVersion)window.app?.showToast(`Review status could not be saved: ${error.message}`,'error');return;}
    finally{if(version===this._viewVersion)this._masteryPending=false;}
    if(version!==this._viewVersion)return;
    note.masteredSections=list;
    window.app?.showToast(isMastered?'Section marked as reviewed.':'Review mark removed.','success');
    if(window.audioEngine){if(isMastered)window.audioEngine.playFanfare();else window.audioEngine.playClick();}

    // Update UI elements dynamically without full reload
    const sections = this.activeNote.sections || [];
    const pct = sections.length > 0 ? Math.round((list.length / sections.length) * 100) : 0;

    const statEl = document.getElementById('toc-mastery-stat-label');
    if (statEl) statEl.textContent = `${pct}% (${list.length}/${sections.length})`;

    const barEl = document.getElementById('toc-mastery-progress-bar-fill');
    if (barEl) barEl.style.width = `${pct}%`;

    const tocItem = [...document.querySelectorAll('.toc-link-item')].find(item=>item.dataset.secId===secId);
    if (tocItem) {
      tocItem.classList.toggle('mastered', isMastered);
      const cb = tocItem.querySelector('.toc-mastery-checkbox');
      if (cb) {
        cb.classList.toggle('mastered', isMastered);
        cb.innerHTML = isMastered ? '<i data-lucide="check" style="width:12px;height:12px; stroke-width:3;"></i>' : '';
      }
    }

    const footerBtn = [...document.querySelectorAll('.btn-toggle-mastery')].find(item=>item.dataset.secId===secId);
    if (footerBtn) {
      footerBtn.classList.toggle('mastered', isMastered);
      footerBtn.innerHTML = `
        <i data-lucide="${isMastered ? 'check-circle-2' : 'circle'}" style="width:15px;height:15px;"></i>
        <span>${isMastered ? '✓ Section Reviewed' : 'Mark Section as Reviewed'}</span>
      `;
    }

    if (window.app) window.app.refreshIcons();
  }

  renderSectionMasteryFooter(sec, sIdx, note) {
    const mastered = note.masteredSections || [];
    const isMastered = mastered.includes(sec.id);
    const sections = note.sections || [];
    const nextSec = sections[sIdx + 1];

    return `
      <div class="section-mastery-footer-row">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <button class="btn-toggle-mastery ${isMastered ? 'mastered' : ''}" data-sec-id="${this.escapeHtml(sec.id)}" onclick="studyNotesView.toggleSectionMastery('${this.escapeHtml(this.escapeJs(sec.id))}')">
            <i data-lucide="${isMastered ? 'check-circle-2' : 'circle'}" style="width:15px;height:15px;"></i>
            <span>${isMastered ? '✓ Section Reviewed' : 'Mark Section as Reviewed'}</span>
          </button>
          ${isMastered ? '<span style="font-size:0.8rem; color:var(--color-success); font-weight:700;">Section Reviewed! 🎉</span>' : ''}
        </div>

        ${nextSec ? `
          <button class="btn btn-secondary btn-sm" onclick="studyNotesView.scrollToSection('${this.escapeHtml(this.escapeJs(nextSec.id))}')" style="font-size:0.82rem;">
            <span>Next: ${this.escapeHtml(nextSec.heading || `Section ${sIdx + 2}`)}</span>
            <i data-lucide="arrow-down" style="width:13px;height:13px;"></i>
          </button>
        ` : `
          <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">🏁 End of Chapter</span>
        `}
      </div>
    `;
  }

  // =========================================================================
  // INLINE SECTION MICRO-QUIZ (RAPID ACTIVE RECALL)
  // =========================================================================
  renderSectionMicroQuiz(sec, index, note) {
    const recall = this.getOrGenerateSectionQuiz(sec,index,note);
    const saved = this.microQuizAnswers[sec.id]; const arg=this.escapeHtml(this.escapeJs(sec.id));
    return `<details class="study-extra study-recall"><summary>Check your understanding</summary><p>${this.escapeHtml(recall.question)}</p>
      <textarea id="recall-${this.escapeHtml(sec.id)}" aria-label="Your explanation" placeholder="Explain in your own words…" oninput="studyNotesView.keepRecallDraft('${arg}',this.value)">${this.escapeHtml(saved?.draft || '')}</textarea>
      <div class="study-recall-actions"><button class="btn btn-secondary btn-sm" onclick="studyNotesView.checkRecall('${arg}',false)">Compare with key points</button><button class="btn btn-primary btn-sm" onclick="studyNotesView.checkRecall('${arg}',true)">Get AI feedback</button></div>
      ${saved?.feedback ? `<div class="study-recall-feedback">${window.marked ? SecurityUtils.sanitizeHtml(window.marked.parse(saved.feedback)) : this.escapeHtml(saved.feedback)}</div>` : ''}
    </details>`;
  }

  getOrGenerateSectionQuiz(sec, index, note) {
    const key = `${note.id}:${sec.id}:${sec.content}:${JSON.stringify(sec.recall || null)}`;
    this._cachedSectionQuizzes ||= {};
    return this._cachedSectionQuizzes[key] ||= sec.recall || { question: `Explain the central idea of “${sec.heading}” and why it matters.`, expectedPoints: sec.keyPoints?.length ? sec.keyPoints : [String(sec.content || '').split(/(?<=[.!?।])\s+/)[0]].filter(Boolean) };
  }

  answerMicroQuiz(secId, selectedIdx, correctIdx, explanation) {
    const isCorrect = selectedIdx === correctIdx;
    this.microQuizAnswers[secId] = { selectedIdx, correctIdx, explanation, isCorrect };

    if (isCorrect) {
      if (window.audioEngine) window.audioEngine.playFanfare();
    } else {
      if (window.audioEngine) window.audioEngine.playClick();
    }

    const card = document.getElementById(`micro-quiz-${secId}`);
    if (card) {
      const sec = this.activeNote?.sections?.find(s => s.id === secId);
      const sIdx = this.activeNote?.sections?.findIndex(s => s.id === secId) || 0;
      if (sec) {
        card.outerHTML = this.renderSectionMicroQuiz(sec, sIdx, this.activeNote);
        if (window.app) window.app.refreshIcons();
      }
    }
  }

  // =========================================================================
  // MULTI-TAB SIDEBAR WORKSPACE (TOC, CHEAT SHEET, HIGHLIGHTS)
  // =========================================================================
  setSidebarTab(tab) {
    this.sidebarActiveTab = tab;
    this.refreshSidebarTab();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  refreshSidebarTab() {
    const container = document.getElementById('sidebar-tab-content-area');
    if (container && this.activeNote) {
      const sections = this.activeNote.sections || [];
      const words = this.activeNote.metadata?.wordCount || (this.activeNote.content ? this.activeNote.content.split(/\s+/).length : 500);
      const readTime = this.activeNote.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));
      container.innerHTML = this.renderSidebarContent(this.activeNote, sections, readTime, words);
      if (window.app) window.app.refreshIcons();
    }
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === this.sidebarActiveTab);
    });
  }

  renderSidebarContent(note, sections, readTime, words) {
    if (this.sidebarActiveTab === 'CHEATSHEET') {
      return this.renderCheatSheetSidebarContent(note, sections);
    }
    if (this.sidebarActiveTab === 'ANNOTATIONS') {
      return this.renderAnnotationsSidebarContent(note);
    }

    // Default: 'TOC'
    const mastered = note.masteredSections || [];
    const pct = sections.length > 0 ? Math.round((mastered.length / sections.length) * 100) : 0;

    return `
      <div class="toc-mastery-progress-header">
        <div class="toc-progress-label-row" style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.78rem; font-weight:750; color:var(--text-main);">Reading reviewed</span>
          <span id="toc-mastery-stat-label" style="font-size:0.78rem; font-weight:800; color:var(--color-success);">${pct}% (${mastered.length}/${sections.length})</span>
        </div>
        <div style="width:100%; height:6px; background:var(--bg-card); border-radius:var(--radius-full); overflow:hidden; border:1px solid var(--border-subtle); margin-top:0.25rem;">
          <div id="toc-mastery-progress-bar-fill" style="height:100%; width:${pct}%; background:linear-gradient(90deg, #10b981, #059669); transition:width 0.3s ease;"></div>
        </div>
      </div>

      <nav class="toc-nav-list" style="flex:1; overflow-y:auto; padding:0.75rem;">
        ${sections.map((sec, sIdx) => {
          const isDone = mastered.includes(sec.id);
          return `
            <div class="toc-link-item ${this.activeTOCSectionId === sec.id ? 'active' : ''} ${isDone ? 'mastered' : ''}"
                 data-sec-id="${this.escapeHtml(sec.id)}"
                 style="display:flex; align-items:center; gap:0.5rem; padding:0.45rem 0.6rem; border-radius:var(--radius-md); margin-bottom:0.25rem; transition:background 0.15s ease;">
              <button class="toc-mastery-checkbox ${isDone ? 'mastered' : ''}"
                      onclick="event.stopPropagation(); studyNotesView.toggleSectionMastery('${this.escapeHtml(this.escapeJs(sec.id))}')"
                      title="${isDone ? 'Mark Incomplete' : 'Mark as Reviewed'}">
                ${isDone ? '<i data-lucide="check" style="width:12px;height:12px; stroke-width:3;"></i>' : ''}
              </button>
              <a class="toc-link-text" href="javascript:void(0)" onclick="studyNotesView.scrollToSection('${this.escapeHtml(this.escapeJs(sec.id))}')"
                 style="flex:1; text-decoration:none; color:inherit; font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${this.escapeHtml(sec.heading || `Section ${sIdx + 1}`)}
              </a>
            </div>
          `;
        }).join('')}
      </nav>

      <div style="border-top:1px solid var(--border-subtle); padding:0.85rem 1rem; font-size:0.8rem; color:var(--text-muted); background:var(--bg-surface);">
        <div>📖 ~${readTime} min read (${words} words)</div>
        <div style="margin-top:0.25rem;">📌 ${note.annotations?.bookmarks?.length || 0} Bookmarks • 🟡 ${note.annotations?.highlights?.length || 0} Highlights</div>
      </div>
    `;
  }

  renderCheatSheetSidebarContent(note, sections) {
    // Consolidate all definitions, formulas and facts
    const allDefs = [];
    const allFormulas = [];
    const allFacts = [];

    sections.forEach(sec => {
      if (Array.isArray(sec.definitions)) {
        sec.definitions.forEach(d => allDefs.push({ ...d, secHeading: sec.heading }));
      }
      if (Array.isArray(sec.formulas)) {
        sec.formulas.forEach(f => allFormulas.push({ ...f, secHeading: sec.heading }));
      }
      if (Array.isArray(sec.importantFacts)) {
        sec.importantFacts.forEach(fact => allFacts.push({ fact, secHeading: sec.heading }));
      }
    });

    if (Array.isArray(note.glossaryTerms)) {
      note.glossaryTerms.forEach(g => {
        if (!allDefs.some(d => d.term.toLowerCase() === g.term.toLowerCase())) {
          allDefs.push({ term: g.term, definition: g.simpleMeaning || g.contextMeaning || g.definition || '', secHeading: 'Glossary' });
        }
      });
    }

    const hasAny = allDefs.length > 0 || allFormulas.length > 0 || allFacts.length > 0;

    return `
      <div style="padding:0.85rem 1rem 0.5rem; border-bottom:1px solid var(--border-subtle);">
        <button class="btn btn-primary btn-sm" style="width:100%; justify-content:center;" onclick="studyNotesView.createFlashcardsFromNote()">
          <i data-lucide="layers" style="width:14px;height:14px;"></i>
          <span>🎴 Flashcards for Chapter</span>
        </button>
      </div>

      <div class="cheatsheet-sidebar-scroll">
        ${!hasAny ? `
          <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem;">
            No structured formulas or definitions found yet.
          </div>
        ` : ''}

        ${allFormulas.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#38bdf8; margin-top:0.25rem;">
            📐 Key Formulas (${allFormulas.length})
          </div>
          ${allFormulas.map(f => `
            <div class="cheat-card-sm">
              <div class="cheat-card-title">${this.escapeHtml(f.name)}</div>
              <div style="font-family:var(--font-mono, monospace); font-weight:700; color:#38bdf8; font-size:0.88rem;">${this.escapeHtml(f.formula)}</div>
              ${f.explanation ? `<div class="cheat-card-content">${this.escapeHtml(f.explanation)}</div>` : ''}
            </div>
          `).join('')}
        ` : ''}

        ${allDefs.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#10b981; margin-top:0.5rem;">
            📚 Core Definitions (${allDefs.length})
          </div>
          ${allDefs.map(d => `
            <div class="cheat-card-sm">
              <div class="cheat-card-title" style="color:#10b981;">${this.escapeHtml(d.term)}</div>
              <div class="cheat-card-content">${this.escapeHtml(d.definition)}</div>
            </div>
          `).join('')}
        ` : ''}

        ${allFacts.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#f59e0b; margin-top:0.5rem;">
            ⚡ High-Yield Facts (${allFacts.length})
          </div>
          ${allFacts.map(f => `
            <div class="cheat-card-sm">
              <div class="cheat-card-content" style="color:var(--text-main);">• ${this.escapeHtml(f.fact)}</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">${this.escapeHtml(f.secHeading)}</div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  renderAnnotationsSidebarContent(note) {
    const highlights = note.annotations?.highlights || [];
    const bookmarks = note.annotations?.bookmarks || [];
    const totalCount = highlights.length + bookmarks.length;

    return `
      <div class="annotations-sidebar-scroll">
        ${totalCount === 0 ? `
          <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); font-size:0.85rem;">
            <i data-lucide="highlighter" style="width:28px;height:28px; stroke:var(--text-muted); margin-bottom:0.5rem; opacity:0.6;"></i>
            <div>No highlights or bookmarks yet.</div>
            <div style="font-size:0.78rem; margin-top:0.25rem;">Select any text while reading to highlight or bookmark!</div>
          </div>
        ` : ''}

        ${highlights.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-primary-light);">
            🟡 Saved Highlights (${highlights.length})
          </div>
          ${highlights.map(hl => `
            <div class="annotation-item-card" style="border-left-color:${hl.color === 'green' ? '#10b981' : hl.color === 'purple' ? '#a855f7' : '#f59e0b'};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                <span class="badge" style="font-size:0.7rem; padding:0.15rem 0.45rem;">${hl.color}</span>
                <button class="icon-btn-xs" onclick="studyNotesView.deleteAnnotation('${hl.id}', 'highlight')" title="Remove Highlight">
                  <i data-lucide="trash-2" style="width:12px;height:12px; color:var(--text-muted);"></i>
                </button>
              </div>
              <p style="font-size:0.84rem; color:var(--text-main); margin:0.25rem 0; font-style:italic;" onclick="studyNotesView.scrollToSection('${hl.sectionId}')">
                "${this.escapeHtml(hl.text)}"
              </p>
              <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(hl.createdAt).toLocaleDateString()}</span>
            </div>
          `).join('')}
        ` : ''}

        ${bookmarks.length > 0 ? `
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#f59e0b; margin-top:0.5rem;">
            📌 Bookmarked Excerpts (${bookmarks.length})
          </div>
          ${bookmarks.map(bm => `
            <div class="annotation-item-card" style="border-left-color:#f59e0b;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                <span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">📌 Bookmark</span>
                <button class="icon-btn-xs" onclick="studyNotesView.deleteAnnotation('${bm.id}', 'bookmark')" title="Remove Bookmark">
                  <i data-lucide="trash-2" style="width:12px;height:12px; color:var(--text-muted);"></i>
                </button>
              </div>
              <p style="font-size:0.84rem; color:var(--text-main); margin:0.25rem 0;" onclick="studyNotesView.scrollToSection('${bm.sectionId}')">
                "${this.escapeHtml(bm.note)}"
              </p>
              <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(bm.createdAt).toLocaleDateString()}</span>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  async deleteAnnotation(id,type) {
    const note=this.activeNote;if(!note?.annotations)return;
    const annotations=this._clone(note.annotations),key=type==='highlight'?'highlights':'bookmarks';annotations[key]=(annotations[key]||[]).filter(item=>item.id!==id);
    try{await updateNoteAnnotations(note.id,annotations);if(Number(this.activeNote?.id)!==Number(note.id))return;note.annotations=annotations;await this.render();}
    catch(error){window.app?.showToast(`Annotation could not be removed: ${error.message}`,'error');}
  }

  createFlashcardsFromSection(secId) {
    const sec = this.activeNote?.sections?.find(s => s.id === secId);
    if (!sec) return;

    const cards = [];

    // Definitions
    if (Array.isArray(sec.definitions) && sec.definitions.length > 0) {
      sec.definitions.forEach(d => {
        cards.push({
          front: d.term,
          back: d.definition,
          explanation: `From section: ${sec.heading}`,
          badge: 'Definition'
        });
      });
    }

    // Formulas
    if (Array.isArray(sec.formulas) && sec.formulas.length > 0) {
      sec.formulas.forEach(f => {
        cards.push({
          front: f.name,
          back: f.formula + (f.explanation ? `\n\n${f.explanation}` : ''),
          explanation: `Formula from: ${sec.heading}`,
          badge: 'Formula'
        });
      });
    }

    // Key Points
    if (Array.isArray(sec.keyPoints) && sec.keyPoints.length > 0) {
      sec.keyPoints.forEach((kp, idx) => {
        cards.push({
          front: `Core Principle #${idx + 1} (${sec.heading})`,
          back: kp,
          explanation: sec.heading,
          badge: 'Key Point'
        });
      });
    }

    if (cards.length === 0) {
      app.showToast('No definitions or key points found in this section to create flashcards.', 'info');
      return;
    }

    if (!window.flashcardsView) {
      window.flashcardsView = new FlashcardsView();
    }

    window.flashcardsView.currentDeck = {
      title: `${this.activeNote.title} — ${sec.heading}`,
      type: 'SECTION',
      subject: this.activeNote.subject || 'General'
    };
    window.flashcardsView.cards = cards.map((card,index)=>({...card,id:`note-${this.activeNote.id}-${secId}-${index}`,cardKey:`note:${this.activeNote.id}:${secId}:${card.front}`}));
    window.flashcardsView.startStudySession();

    if (window.app) {
      window.app.navigate('flashcards');
      app.showToast(`Loaded ${cards.length} 3D flashcards for "${sec.heading}"!`, 'success');
    }
  }

  async createFlashcardsFromNote() {
    if(!this.activeNote)return;
    if(!window.flashcardsView)window.flashcardsView=new FlashcardsView();
    await window.flashcardsView.loadNotesDeck(this.activeNote.id);
    if(window.flashcardsView.cards.length)window.app?.navigate('flashcards');
  }

  sendQuickAiQuestion(question) {
    const inp = document.getElementById('ask-ai-input-field');
    if (inp) inp.value = question;
    this.sendAiMessage();
  }

  async sendAiMessage() {
    if(!this.activeNote||this._chatPending)return;
    const input=document.getElementById('ask-ai-input-field'),query=input?.value.trim();if(!query)return;
    const note=this.activeNote,id=note.id,version=this._viewVersion,controller=this._controller();
    this._chatPending=true;const conversation=this.askAiMessages;
    conversation.push({role:'user',text:query});input.value='';this.renderAskAiMessages();
    try {
      const reply=await window.geminiService.askAiAboutNote({noteContent:note.content,noteTopic:note.title,sections:note.sections,settings:note.settings, userQuestion:query,chatHistory:conversation.slice(0,-1),signal:controller.signal});
      if(version!==this._viewVersion||controller.signal.aborted)return;
      conversation.push({role:'ai',text:reply});this.renderAskAiMessages();
      note.chatHistory=conversation.slice(-100);
      try{await updateNote(id,{chatHistory:note.chatHistory});}catch(error){if(version===this._viewVersion)window.app?.showToast(`Reply received, but chat history could not be saved: ${error.message}`,'warning');}
    } catch(error) {
      if(version!==this._viewVersion||controller.signal.aborted||error.name==='AbortError')return;
      if(conversation.at(-1)?.role==='user')conversation.pop();
      const current=document.getElementById('ask-ai-input-field');if(current&&!current.value)current.value=query;
      this.renderAskAiMessages();window.app?.showToast(`Tutor reply failed: ${error.message}`,'error');
    } finally {this._controllers.delete(controller);if(version===this._viewVersion){this._chatPending=false;this.renderAskAiMessages();}}
  }

  renderAskAiMessages() {
    const list=document.getElementById('ask-ai-msg-list');if(!list)return;
    list.innerHTML=`<div class="ask-ai-msg ai">Ask about ${this.escapeHtml(this.activeNote?.title)}. Answers use relevant sections from the whole note.</div>${this.askAiMessages.map(message=>`<div class="ask-ai-msg ${message.role==='user'?'user':'ai'}">${message.role==='ai'&&window.marked?SecurityUtils.sanitizeHtml(window.marked.parse(message.text)):this.escapeHtml(message.text)}</div>`).join('')}${this._chatPending?'<div class="ask-ai-msg ai" role="status">Thinking…</div>':''}`;
    const send=document.querySelector('.ask-ai-input-box button');if(send)send.disabled=!!this._chatPending;
    list.scrollTop=list.scrollHeight;
  }

  openSummaryModal() {
    this.setReaderTab('SUMMARY');
  }

  closeSummaryModal() {
    this.setReaderTab('TEXTBOOK');
  }

  async generateFreshSummary(noteId) {
    if(!app.beginGeneration('Preparing revision notes…'))return;
    const controller=this._controller(),version=this._viewVersion;
    try {
      await this.flushAutoSave();const note=await getNoteById(Number(noteId));if(!note)throw new Error('Note not found.');
      const summary=await window.geminiService.summarizeStudyNote({title:note.title,subject:note.subject,sections:note.sections,settings:note.settings,signal:controller.signal,onProgress:status=>app.handleGenerationProgress(status)});
      this._checkRun(controller);await updateNote(note.id,{summary});
      if(version===this._viewVersion&&Number(this.activeNoteId)===Number(note.id)){this.activeNote.summary=summary;this.readerActiveTab='SUMMARY';await this.render();}
      app.showToast(summary.generationSource==='GEMINI_AI'?'Revision updated for all sections.':'Revision extracted locally from source text.','success');
      app.endGeneration();
    } catch(error) {
      app.endGeneration();if(app.isGenerationCancelled()||error.name==='AbortError')return;
      app.showToast(`Revision failed: ${error.message}`,'error');
    } finally{this._controllers.delete(controller);}
  }

  openQuizModal() {
    this._quizNote=this.activeNote;
    this.isQuizModalOpen = true;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async openQuizModalForNote(noteId) {
    if(this._dirty) await this.flushAutoSave();
    this._quizNote = await getNoteById(Number(noteId));
    if(!this._quizNote) return;
    this.isQuizModalOpen=true; this.selectedQuizSections=null;
    await this.render();
  }

  closeQuizModal() {
    this.isQuizModalOpen = false;
    this._quizNote=null;
    this.render();
  }

  setQuizCount(cnt) {
    this.quizConfig.questionCount = cnt;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async launchGeneratedQuizForNote(noteId) {
    if(!app.beginGeneration('Preparing source-based practice…'))return;
    const controller=this._controller();
    try {
      await this.flushAutoSave();const note=await getNoteById(Number(noteId));if(!note)throw new Error('Note not found.');
      const sections=this._practiceSections(note);if(!sections.length)throw new Error('Select at least one section.');
      this.closeQuizModal();
      const generated=await window.geminiService.generateStudyQuiz({sections,sourceTitle:note.title,subject:note.subject,questionCount:this.quizConfig.questionCount,questionType:this.quizConfig.questionType,difficulty:this.quizConfig.difficulty,language:note.settings?.language||'AUTO',settings:note.settings,offset:(note.quizzes?.length||0)*this.quizConfig.questionCount,signal:controller.signal,onStatusUpdate:status=>app.handleGenerationProgress(status)});
      this._checkRun(controller);
      const quizId=await saveNewQuiz({title:`${note.title} · Practice`,subject:note.subject,difficulty:this.quizConfig.difficulty,quizMode:'PRACTICE',language:note.settings?.language||'AUTO',sourceType:'TEXT_NOTES',sourceTitle:note.title},generated.questions);
      await updateNote(note.id,{quizzes:[...(note.quizzes||[]),quizId]});
      app.endGeneration();app.startQuiz(quizId);
    }catch(error){app.endGeneration();if(app.isGenerationCancelled()||error.name==='AbortError')return;app.showToast(`Practice failed: ${error.message}`,'error');}
    finally{this._controllers.delete(controller);}
  }

  toggleExportMenu() {
    const menu = document.getElementById('export-dropdown-menu');
    if (menu) {
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
      if (window.audioEngine) window.audioEngine.playClick();
      if (!isVisible && window.app) window.app.refreshIcons();
    }
  }

  async _exportSavedNote(noteId,summary) {
    // Reserve the tab during the click, before asynchronous saves lose browser user activation.
    const printWindow=window.open('','_blank');
    if(!printWindow){window.app?.showToast('Allow pop-ups for this site to export your notes.','warning');return;}
    printWindow.document.body.textContent='Preparing your study notes…';
    try{
      await this.flushAutoSave();const note=await getNoteById(Number(noteId));
      if(!note)throw new Error('Note not found.');
      if(!window.pdfGenerator)throw new Error('PDF export is unavailable. Reload and retry.');
      if(summary)window.pdfGenerator.exportSummarySheetPdf(note,this.revisionMode,printWindow);
      else window.pdfGenerator.exportStudyNotesBookletPdf(note,printWindow);
    }catch(error){printWindow.close();window.app?.showToast(`Export failed: ${error.message}`,'error');}
  }

  exportStudyNotesPdf(noteId) {return this._exportSavedNote(noteId,false);}

  exportSummarySheetPdf(noteId) {return this._exportSavedNote(noteId,true);}

  async exportPrintableQuizPrompt(noteId) {
    const printWindow=window.open('','_blank');
    if(!printWindow){window.app?.showToast('Allow pop-ups for this site to export the quiz.','warning');return;}
    if(!app.beginGeneration('Preparing your printable practice paper…')){printWindow.close();return;}
    printWindow.document.body.textContent='Preparing source-based practice questions…';
    const controller=this._controller(),config={...this.quizConfig};
    try {
      await this.flushAutoSave();const note=await getNoteById(Number(noteId));if(!note)throw new Error('Note not found.');
      const generated=await window.geminiService.generateStudyQuiz({sections:this._practiceSections(note),sourceTitle:note.title,subject:note.subject,questionCount:config.questionCount,questionType:config.questionType,difficulty:config.difficulty,language:note.settings?.language||'AUTO',settings:note.settings,signal:controller.signal,onStatusUpdate:status=>app.handleGenerationProgress(status)});
      this._checkRun(controller);
      window.pdfGenerator.exportPrintableQuizPdf({title:`${note.title} · Practice Paper`},generated.questions,printWindow);
    }catch(error){printWindow.close();if(error.name!=='AbortError')app.showToast(`Printable quiz failed: ${error.message}`,'error');}
    finally{this._controllers.delete(controller);app.endGeneration();}
  }

  async toggleEditMode() {
    if(this.isEditMode) {
      try {await this.flushAutoSave();} catch(error) {window.app?.showToast(error.message,'error');return;}
    }
    this.isEditMode=!this.isEditMode;await this.render();
  }

  onSectionTextEdit(secId, newText) {
    if (!this.activeNote || !this.activeNote.sections) return;
    const sec = this.activeNote.sections.find(s => s.id === secId);
    if (sec) {
      this._rememberEdit();
      if(sec.content===newText)return;
      const oldTerms=new Set((sec.definitions||[]).map(item=>item.term.toLocaleLowerCase()));
      const oldContent=sec.content.toLocaleLowerCase();
      this.activeNote.glossaryTerms=(this.activeNote.glossaryTerms||[]).filter(term=>{const key=term.term.toLocaleLowerCase();return (!oldContent.includes(key)&&!oldTerms.has(key))||this.activeNote.sections.some(other=>other!==sec&&(other.content.toLocaleLowerCase().includes(key)||(other.definitions||[]).some(item=>item.term.toLocaleLowerCase()===key)));});
      sec.content = newText;sec.supportingContentStale=true;
      for(const key of ['keyPoints','definitions','formulas','examples','tables','importantFacts'])sec[key]=[];
      sec.flowchart=null;sec.diagram=null;sec.recall=null;
      this._cachedSectionQuizzes={};delete this.microQuizAnswers[secId];
      this.triggerAutoSave();
    }
  }

  async refreshSectionTeaching(id) {
    if(!window.geminiService.isAiAvailable()){window.app?.showToast('Configure Gemini in Settings to rebuild teaching aids.','warning');return;}
    try{await this.flushAutoSave();}catch(error){window.app?.showToast(error.message,'error');return;}
    const note=this.activeNote,section=note?.sections?.find(section=>section.id===id);if(!section)return;
    if(!window.app?.beginGeneration('Rebuilding teaching aids from your explanation…'))return;
    const version=this._viewVersion,content=section.content,controller=this._controller();
    try{
      const result=await window.geminiService.generateStructuredStudyBook({topic:section.heading,subject:note.subject,rawText:content,settings:note.settings,signal:controller.signal,onProgress:progress=>window.app?.handleGenerationProgress(progress)});
      this._checkRun(controller);if(version!==this._viewVersion)return;
      if(section.content!==content)throw new Error('The explanation changed during the refresh. Retry using your latest text.');
      this._rememberEdit();
      for(const key of ['keyPoints','definitions','formulas','examples','tables','importantFacts'])section[key]=result.sections.flatMap(item=>item[key]||[]);
      section.examples.forEach((example,index)=>example.id=`${id}-example-${index+1}`);
      section.flowchart=result.sections.find(item=>item.flowchart)?.flowchart||null;
      section.diagram=result.sections.find(item=>item.diagram)?.diagram||null;
      section.recall=result.sections.find(item=>item.recall)?.recall||null;
      const terms=[...(note.glossaryTerms||[]),...(result.glossaryTerms||[])];note.glossaryTerms=[...new Map(terms.map(term=>[term.term.toLocaleLowerCase(),term])).values()];
      section.supportingContentStale=false;this.triggerAutoSave();await this.flushAutoSave();await this.render();
      window.app?.showToast('Teaching aids rebuilt from your explanation.','success');
    }catch(error){if(error.name!=='AbortError'&&version===this._viewVersion)window.app?.showToast(`Teaching aids could not be refreshed: ${error.message}`,'error');}
    finally{this._controllers.delete(controller);window.app?.endGeneration();}
  }

  updateActiveNoteTitle(newTitle) {
    if (!this.activeNote || !newTitle.trim()) return;
    this._rememberEdit();
    this.activeNote.title = newTitle.trim();
    this.triggerAutoSave();
  }

  triggerAutoSave() {
    this._editSequence=(this._editSequence||0)+1;
    this._dirty=true;this.autoSaveStatus='Saving…';
    const badge=document.getElementById('auto-save-status-badge');if(badge)badge.textContent=this.autoSaveStatus;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer=setTimeout(()=>this.flushAutoSave().catch(error=>window.app?.showToast(`Changes could not be saved: ${error.message}`,'error')),800);
  }

  initScrollspyListener() {
    window.removeEventListener('scroll',this._scrollHandler);
    this._scrollHandler=()=>{
      if(this.currentViewMode!=='READER'||window.app?.currentView!=='study-notes')return;
      const height=document.documentElement.scrollHeight-window.innerHeight;
      const fill=document.getElementById('reading-progress-fill');if(fill)fill.style.width=`${height>0?Math.min(100,Math.max(0,window.scrollY/height*100)):0}%`;
      let current=null;const readingTop=(document.querySelector('.textbook-sticky-bar')?.getBoundingClientRect().bottom||180)+36;
      for(const section of this.activeNote?.sections||[]){const el=document.getElementById(section.id);if(el&&!el.hidden&&el.getBoundingClientRect().top<=readingTop)current=section;}
      if(current&&this.activeTOCSectionId!==current.id){
        this.activeTOCSectionId=current.id;document.querySelectorAll('.toc-link-item').forEach(link=>link.classList.toggle('active',link.dataset.secId===current.id));
        const note=this.activeNote,id=note.id,position={sectionId:current.id};note.readingPosition=position;clearTimeout(this._readingTimer);
        this._readingTimer=setTimeout(()=>updateNote(id,{readingPosition:position}).catch(error=>console.warn('Reading position not saved',error)),500);
      }
    };
    window.addEventListener('scroll',this._scrollHandler,{passive:true});
  }

  scrollToSection(secId) {
    this.activeTOCSectionId = secId;
    const el = document.getElementById(secId);
    if (el) {
      if(this.activeNote)this.activeNote.readingPosition={sectionId:secId};
      document.querySelector('.textbook-toc-sidebar')?.classList.remove('study-sidebar-open');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.audioEngine) window.audioEngine.playClick();
    }
  }

  toggleFocusMode() {
    this.isFocusMode = !this.isFocusMode;
    document.body.classList.toggle('in-textbook-focus-mode', this.isFocusMode);
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
    app.showToast(this.isFocusMode ? 'Focus Mode Activated: Distraction-free textbook reading.' : 'Focus Mode Exited.', 'info');
  }

  // =========================================================================
  // NAVIGATION & CRUD ACTIONS
  // =========================================================================
  openCreateNoteModal() {
    this.currentViewMode = 'CREATE';
    this.newTopic = '';
    this.newSubject = 'Indian Polity';
    this.isCustomSubject = false;
    this.customSubject = '';
    this.newFiles = [];
    this.manualText = '';
    this.isCreating = false;
    this._sourcePages=null;this._retryState=null;this._creationError=null;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleCustomSubjectMode() {
    this.isCustomSubject = !this.isCustomSubject;
    this.render();
    if (this.isCustomSubject) {
      setTimeout(() => {
        const inp = document.getElementById('create-input-custom-subject');
        if (inp) inp.focus();
      }, 50);
    }
  }

  onSubjectSelectChange(val) {
    if (val === 'CUSTOM') {
      this.isCustomSubject = true;
      this.render();
      setTimeout(() => {
        const inp = document.getElementById('create-input-custom-subject');
        if (inp) inp.focus();
      }, 50);
    } else {
      this.isCustomSubject = false;
      this.newSubject = val;
    }
  }

  closeCreateView() {
    this.currentViewMode = 'DASHBOARD';
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async openNote(noteId) {
    const id=Number(noteId);if(!Number.isSafeInteger(id)||id<=0)return;
    if(window.app&&window.app.currentView!=='study-notes'){window.app.navigate('study-notes',{id},true);return;}
    try {await this.flushAutoSave();await this._persistReadingProgress();}catch(error){window.app?.showToast(error.message,'error');return;}
    this._endNoteSession();const version=this._viewVersion;
    const note=await getNoteById(id);if(version!==this._viewVersion||!note)return;
    this.currentViewMode='READER';this.activeNoteId=id;this.activeNote=note;
    this.noteSettings={language:'AUTO',level:'AUTO',exam:'',...(note.settings||{})};
    this.readerActiveTab='TEXTBOOK';this.isFocusMode=false;this.isEditMode=false;this.isAskAiOpen=false;this.isQuizModalOpen=false;
    const readingSectionId=note.readingPosition?.sectionId||note.sections?.[0]?.id;this.activeTOCSectionId=readingSectionId;
    this.askAiMessages=Array.isArray(note.chatHistory)?note.chatHistory:[];this.microQuizAnswers=note.recallAnswers||{};
    this._cachedSectionQuizzes={};this.selectedQuizSections=null;this._editBaseline=null;this._savePromise=Promise.resolve();this.autoSaveStatus='Saved ✓';
    try{history.replaceState(null,'',`#study-notes?id=${id}`);}catch{}
    await this.render();
    this.activeTOCSectionId=readingSectionId;const target=document.getElementById(readingSectionId);if(target)target.scrollIntoView?.({block:'start',behavior:'instant'});this._scrollHandler?.();
  }

  async backToDashboard() {
    try{await this.flushAutoSave();await this._persistReadingProgress();}catch(error){window.app?.showToast(error.message,'error');return;}
    this._endNoteSession();this.currentViewMode='DASHBOARD';this.activeNoteId=null;this.activeNote=null;this.isAskAiOpen=false;this.isQuizModalOpen=false;
    document.body.classList.remove('in-textbook-focus-mode');await this.render();
  }

  handleDragOver(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('dragover');
  }

  handleDragLeave(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dragover');
  }

  handleMultiDrop(e, el) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) {
      this.onMultiFilesSelected(e.dataTransfer.files);
    }
  }

  onMultiFilesSelected(fileList) {
    const allowed = { pdf:'PDF',jpg:'IMAGE',jpeg:'IMAGE',png:'IMAGE',webp:'IMAGE' };
    const rejected=[]; let total=this.newFiles.reduce((sum,item)=>sum+item.size,0);
    for (const file of Array.from(fileList || [])) {
      const extension=file.name.split('.').pop().toLowerCase(),type=allowed[extension];
      if(!type || (file.type && !['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))) {rejected.push(`${file.name}: unsupported type`);continue;}
      if(!file.size || file.size>12*1024*1024 || total+file.size>30*1024*1024 || this.newFiles.length>=12) {rejected.push(`${file.name}: use up to 12 files, 12 MB each and 30 MB total`);continue;}
      if(this.newFiles.some(item=>item.name.toLocaleLowerCase()===file.name.toLocaleLowerCase())) {rejected.push(`${file.name}: already attached; rename different files with the same name`);continue;}
      this.newFiles.push({file,name:file.name,size:file.size,type,fromPage:1,toPage:null});total+=file.size;
      if(!this.newTopic) this.newTopic=file.name.replace(/\.[^/.]+$/,'').replace(/[-_]/g,' ');
    }
    this._sourcePages=null;this._retryState=null;this._creationError=null;
    if(rejected.length) window.app?.showToast(rejected.join('; '),'warning');
    this.render();
  }

  removeAttachedFile(idx) {
    this.newFiles.splice(idx, 1);
    this._sourcePages=null;this._retryState=null;this._creationError=null;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // =========================================================================
  // EXTRACTION SCOPE ("what should AI take out of this file?")
  //
  // Empty instruction = the old behaviour, full notes on everything. A non-empty
  // one is passed to generateStructuredStudyBook(), which swaps its
  // "reproduce everything at equal or greater depth" mandate for a scoped one.
  // =========================================================================

  /**
   * Typing handler. Stores the raw value and repaints only the badge.
   *
   * Deliberately does NOT call this.render(): renderCreateView() replaces the
   * whole container's innerHTML, which would destroy the textarea and the caret
   * on the first keystroke. Same rule as the manual-paste box above and the
   * page-range inputs in create-quiz.js.
   */
  onFocusInput(rawVal) {
    this.focusInstruction = String(rawVal || '').slice(0, StudyNotesView.MAX_FOCUS_CHARS);
    this.updateFocusBadge();
  }

  /** Chip tap — commits a preset. A full re-render is fine here: no caret to lose. */
  applyFocusPreset(text) {
    const next = String(text || '');
    // Tapping the active chip again clears it, so a preset is never a trap.
    this.focusInstruction = (this.focusInstruction === next) ? '' : next;
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  clearFocus() {
    this.focusInstruction = '';
    if (window.audioEngine) window.audioEngine.playClick();
    this.render();
  }

  /**
   * Banner shown at the top of the reader for a SCOPED note.
   *
   * A focused note deliberately leaves most of its source out. Without this, the
   * next time it is opened it reads as a complete set of notes with material
   * inexplicably missing — the reader has no way to tell "the AI skipped this"
   * from "I asked for only this". The Original Source tab still holds the full
   * text, so the banner points there.
   *
   * Returns '' for a normal note, so nothing changes for existing notes.
   */
  renderFocusScopeBanner(note) {
    const scope = (note && typeof note.focusInstruction === 'string')
      ? note.focusInstruction.trim()
      : '';
    if (!scope) return '';

    return `
      <div class="reading-status-banner" style="margin:0 0 1rem;">
        <i data-lucide="filter" style="width:15px;height:15px;"></i>
        <span>
          <strong>Focused note.</strong>
          Built from the uploaded material taking only &ldquo;${this.escapeHtml(scope)}&rdquo;.
          Anything outside that was intentionally left out — the untouched original is under
          <strong>📄 Original Source</strong>.
        </span>
      </div>
    `;
  }

  /** Text for the badge beside the label. Mirrors create-quiz's updateScopeBadge(). */
  describeFocusState() {
    const len = this.focusInstruction.trim().length;
    if (len === 0) return 'Full notes — everything in the file';
    return `Focused • ${len}/${StudyNotesView.MAX_FOCUS_CHARS} characters`;
  }

  /** Surgical badge repaint, so onFocusInput never has to re-render. */
  updateFocusBadge() {
    const badge = document.getElementById('focus-scope-badge');
    if (badge) badge.textContent = this.describeFocusState();
  }

  // Trigger Creation: Extract & Structure with AI
  async triggerCreateStructuredNote() {
    const topic=(this.newTopic||'').trim();
    if(!topic){app.showToast('Please enter a Topic or Chapter Title.','error');return;}
    if(!this.newFiles.length&&!this.manualText.trim()){app.showToast('Please upload a PDF / Image or paste study text.','error');return;}
    const focus=(this.focusInstruction||'').trim();
    if(!app.beginGeneration(focus?'Building your focused notes…':'Reading your study material…'))return;
    const controller=this._controller(),version=this._viewVersion;
    const files=this.newFiles.map(item=>({...item})),manual=this.manualText,settings={...this.noteSettings};
    const subject=this.isCustomSubject?(this.customSubject.trim()||'General Study'):(this.newSubject||'General Study');
    this.isCreating=true;this._creationError=null;
    try {
      const identity=JSON.stringify({manual,files:files.map(item=>[item.name,item.size,item.file.lastModified,item.fromPage,item.toPage])});
      const extracted=this._sourcePages?.identity===identity?this._sourcePages:await this._extractSources(files,manual,controller);
      this._sourcePages={...extracted,identity};this._checkRun(controller);
      const combinedSourceText=extracted.pages.map(page=>`--- [${page.fileName}${page.page?' · PAGE '+page.page:''}] ---\n${page.text}`).join('\n\n');
      const structuredBook=await window.geminiService.generateStructuredStudyBook({topic,subject,rawText:combinedSourceText,files,focus,sourcePages:extracted.pages,settings,retryState:this._retryState,signal:controller.signal,onProgress:status=>app.handleGenerationProgress(status)});
      structuredBook.focusInstruction=focus;
      structuredBook.originalSource = { text: combinedSourceText, pages:extracted.pages,files:extracted.originals,importedAt:new Date().toISOString() };
      this._checkRun(controller);const noteId=await saveNewNote(structuredBook);
      app.handleGenerationProgress({message:'All selected source batches processed · note saved',percent:100,showBatchCard:true});
      app.endGeneration();this.isCreating=false;this.newFiles=[];this.manualText='';this._retryState=null;this._sourcePages=null;
      // The focus is intentionally KEPT when building another focused note.
      app.showToast(structuredBook.metadata?.generatedByAI?'Your textbook is ready.':'Source organised locally; AI teaching has not been generated.','success');
      if(version===this._viewVersion)await this.openNote(noteId);
    }catch(err){
      app.endGeneration();this.isCreating=false;
      if(app.isGenerationCancelled()||err.name==='AbortError')return;
      this._retryState=err.retryState||null;this._creationError={message:err.message,failures:err.failures};await this.render();
      if(err.code==='SCOPE_NO_MATCH'){app.showToast(err.message,'warning');return;}
      app.showToast(`Creation error: ${err.message}`,'error');
    }finally{this._controllers.delete(controller);}
  }

  async duplicateNote(noteId) {
    const idNum = Number(noteId);
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    try {
      const newId = await duplicateNote(idNum);
      app.showToast('Textbook duplicated successfully!', 'success');
      if (window.audioEngine) window.audioEngine.playFanfare();
      await this.render();
    } catch (e) {
      app.showToast(`Could not duplicate note: ${e.message}`, 'error');
    }
  }

  async toggleFavorite(noteId) {
    const idNum = Number(noteId);
    const isFav = await toggleFavoriteNote(idNum);
    app.showToast(isFav ? '⭐ Starred for quick revision!' : 'Removed from favorites.', 'info');
    await this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  async renameNotePrompt(noteId) {
    const idNum = Number(noteId);
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    const note = (this.notes || []).find(n => Number(n.id) === idNum) || this.activeNote;
    if (!note) return;

    const newTitle = prompt('Enter new note title:', note.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== note.title) {
      await renameNote(idNum, newTitle.trim());
      app.showToast('Textbook renamed successfully.', 'success');
      if (window.audioEngine) window.audioEngine.playClick();
      await this.render();
    }
  }

  deleteNoteConfirm(noteId) {
    const idNum = Number(noteId);
    // Close card menu if open
    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) menu.style.display = 'none';

    const note = (this.notes || []).find(n => Number(n.id) === idNum) || this.activeNote;
    const title = note ? note.title : 'this note';

    app.showConfirmation({
      title: 'Delete Study Textbook',
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      confirmText: 'Delete Note',
      onConfirm: async () => {
        try {
          await deleteNote(idNum);
          app.showToast('Textbook deleted from vault.', 'info');
          if (window.audioEngine) window.audioEngine.playClick();

          // If deleting currently open note in READER mode, navigate back to Dashboard
          if (this.currentViewMode === 'READER' && Number(this.activeNoteId) === idNum) {
            this.currentViewMode = 'DASHBOARD';
            this.activeNoteId = null;
            this.activeNote = null;
          }

          await this.render();
        } catch (err) {
          console.error('Delete note failed:', err);
          app.showToast(`Failed to delete note: ${err.message}`, 'error');
        }
      }
    });
  }

  toggleCardMenu(noteId) {
    const idNum = Number(noteId);
    // Hide all other card menus first
    document.querySelectorAll('[id^="card-menu-"]').forEach(el => {
      if (el.id !== `card-menu-${idNum}`) el.style.display = 'none';
    });

    const menu = document.getElementById(`card-menu-${idNum}`);
    if (menu) {
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
      if (window.audioEngine) window.audioEngine.playClick();
      if (!isVisible && window.app) window.app.refreshIcons();
    }
  }

  // Search & Filters
  onSearchInput(query) {
    this.searchQuery = query;
    const input = this.container?.querySelector('[data-notes-search]');
    const start=input?.selectionStart,end=input?.selectionEnd;
    this.render().then(()=>{const next=this.container?.querySelector('[data-notes-search]');if(next){next.focus();next.setSelectionRange(start??query.length,end??query.length);}});
  }

  clearSearch() {
    this.searchQuery = '';
    this.render();
  }

  setSubjectFilter(subj) {
    this.activeSubjectFilter = subj;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  setSortBy(val) {
    this.sortBy = val;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  toggleFavoritesFilter() {
    this.showOnlyFavorites = !this.showOnlyFavorites;
    this.render();
    if (window.audioEngine) window.audioEngine.playClick();
  }

  // Starter Samples
  async loadSamplePreset(type) {
    if (type === 'POLITY') {
      const sample = window.geminiService.generateStructuredFallbackNote({
        topic: 'Fundamental Rights (Articles 12 to 35)',
        subject: 'Indian Polity',
        rawText: `PART III OF THE INDIAN CONSTITUTION: FUNDAMENTAL RIGHTS (ARTICLES 12 TO 35)\n\nKnown as the Magna Carta of India. Justiciable under Article 32 (Supreme Court) and Article 226 (High Courts).\n\nKey Rights: Right to Equality (Arts 14-18), Right to Freedom (Arts 19-22), Right against Exploitation (Arts 23-24), Right to Freedom of Religion (Arts 25-28), Cultural & Educational Rights (Arts 29-30), Right to Constitutional Remedies (Art 32).\n\nWrits: Habeas Corpus, Mandamus, Prohibition, Certiorari, Quo-Warranto.`
      });
      const noteId = await saveNewNote(sample);
      app.showToast('Sample Polity Textbook loaded!', 'success');
      this.openNote(noteId);
    } else if (type === 'SCIENCE') {
      const sample = window.geminiService.generateStructuredFallbackNote({
        topic: 'Cell Biology: Ultrastructure & ATP Synthesis',
        subject: 'Science & Tech',
        rawText: `CELL BIOLOGY & MITOCHONDRIAL RESPIRATION\n\nMitochondria: Powerhouse of the cell, double membrane bound with circular DNA and 70S ribosomes. Site of Krebs cycle and oxidative phosphorylation.\n\nATP Synthesis occurs via F0-F1 ATP synthases across inner mitochondrial membrane.\n\nDNA Structure: Watson & Crick double helix model. Adenine pairs with Thymine (2 H-bonds); Guanine pairs with Cytosine (3 H-bonds).`
      });
      const noteId = await saveNewNote(sample);
      app.showToast('Sample Biology Textbook loaded!', 'success');
      this.openNote(noteId);
    }
  }

  // Utilities — delegate to the shared helpers so escaping rules stay in one
  // place. The previous local escapeJs() missed backslashes and newlines, which
  // let user-selected text break out of the inline onclick string it was
  // interpolated into (see UIUtils.escapeJs for the details).
  escapeHtml(str) {
    return UIUtils.escapeHtml(str);
  }

  escapeRegex(str) {
    return UIUtils.escapeRegex(str);
  }

  escapeJs(str) {
    return UIUtils.escapeJs(str);
  }
}

window.studyNotesView = new StudyNotesView();
