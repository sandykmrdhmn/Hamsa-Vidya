/** PDF quiz creation, local practice and saved attempts. No extra AI review calls. */
class QuizView {
  constructor() {
    this.container = document.getElementById('view-quiz');
    this.mode = 'create';
    this.form = { fromPage: '1', toPage: '1', count: '20', difficulty: 'MEDIUM', language: 'AUTO', sourceType:'PDF', text:'', subject:'', chapter:'', exam:'', title:'' };
    this.sessionSettings = { mode:'PRACTICE', durationMinutes:0, marksPerQuestion:1, negativeMarks:0, shuffleQuestions:false, shuffleOptions:false, presetId:'custom' };
    this.manualQuestions = [];
    this.questionOrder = [];
    this.optionOrder = [];
    this.checked = [];
    this.confidence = [];
    this.marked = [];
    this.reviewFilter = 'ALL';
    this.draftsKey = 'hamsa_quiz_attempt_drafts_v2';
    this.authoringKey = 'hamsa_quiz_authoring_v1';
    try { const authored = JSON.parse(localStorage.getItem(this.authoringKey) || 'null'); if (Array.isArray(authored?.questions) && authored.questions.length <= 200) { this.manualQuestions = authored.questions; this.form.title = String(authored.title || '').slice(0,200); } } catch { /* The editor starts empty if its draft is unreadable. */ }
    this.pdf = null;
    this.quizzes = [];
    this.currentQuiz = null;
    this.answers = [];
    this.questionIndex = 0;
    this.notice = '';
    this.noticeType = 'info';
    this.processEvents = [];
    this.processState = 'idle';
    this.processKind = 'idle';
    this.validationTouched = false;
    this.busy = false;
    this.reading = false;
    this.saving = false;
    this.readyQuiz = null;
    this._epoch = 0;
    this._renderVersion = 0;
    this._active = false;
    this._resumeChecked = false;
    this.draftKey = 'hamsa_quiz_draft_v1';
    this.savedQuestionsKey = 'hamsa_saved_questions_v1';
    this.savedQuestionAnswers = {};
    window.addEventListener('pagehide', () => { this.persistDraft(); this.stopAttemptTimer(); this.cancel(false); });
    document.addEventListener('visibilitychange', () => { if (this.mode === 'attempt') { this.persistDraft(); this.tickAttemptTimer(); } });
  }

  escape(value) { return SecurityUtils.escapeHtml(String(value ?? '')); }
  get service() { return window.quizService; }
  get store() { return window.quizStore; }
  generationDraft() { return this.service?.getDraft?.() || null; }
  restoreGenerationForm() {
    const job = this.generationDraft();
    if (!job) return;
    if (this.processState === 'idle' && !this.notice && !this.isBusy()) this.processState = 'paused';
    Object.assign(this.form,{sourceType:job.source.type,text:job.source.text || '',count:String(job.count),difficulty:job.difficulty,language:job.language,fromPage:String(job.source.fromPage || 1),toPage:String(job.source.toPage || 1),subject:job.subject || '',chapter:job.chapter || '',exam:job.exam || ''});
    if (job.sessionDefaults) this.sessionSettings = this.defaultsForQuiz(job);
  }
  message(text, type = 'info') {
    this.notice = String(text || ''); this.noticeType = type; this.noticeSettings = false;
    if (this.notice) {
      this.addProcessEvent(type,this.notice);
      if (type === 'error') this.processState = 'error';
      else if (/paused|cancelled/i.test(this.notice)) this.processState = 'paused';
      else if (!this.isBusy()) this.processState = type === 'success' ? 'complete' : 'idle';
    } else if (!this.isBusy()) {
      clearInterval(this._elapsedTimer); this._elapsedTimer = null; this.loadingSaved = false; this.historyLoading = false; this.listError = false; this.noticeIsValidation = false;
      this.processState = this.generationDraft() ? 'paused' : 'idle';
      this.progress = null; this.processEvents = []; this.processKind = 'idle'; this.processEndedAt = null; this.startedAt = null; this.validationTouched = false; this.validationIssue = '';
    }
  }
  addProcessEvent(stage, message) {
    if (!message || this.processEvents.at(-1)?.message === message) return;
    this.processEvents.push({stage,message:String(message),time:Date.now()});
    this.processEvents = this.processEvents.slice(-8);
  }
  beginProcess(kind, message, progress = {}) {
    this.notice = ''; this.noticeType = 'info'; this.noticeSettings = false;
    this.processKind = kind; this.processState = 'running'; this.processEvents = [];
    this.processLogExpanded = false;
    this.startedAt = Date.now(); this.processEndedAt = null;
    this.progress = null;
    this.recordProgress({stage:kind === 'load' ? 'reading' : kind === 'save' || kind === 'attempt' ? 'saving' : 'reading',message,...progress});
    clearInterval(this._elapsedTimer);
    this._elapsedTimer = setInterval(()=>{ const node=this.container?.querySelector('#quiz-elapsed'); if (node) node.textContent=this.elapsedText(); },1000);
  }
  recordProgress(progress) {
    if (progress.stage === 'waiting') this.waitingStage = this.progress?.stage === 'waiting' ? this.waitingStage : this.progress?.stage || 'reading';
    this.progress = {...this.progress,...progress};
    this.processState = progress.stage === 'waiting' ? 'waiting' : progress.stage === 'complete' ? 'complete' : 'running';
    this.addProcessEvent(progress.stage,progress.message);
  }
  finishProcess() {
    clearInterval(this._elapsedTimer); this._elapsedTimer = null;
    this.processEndedAt = Date.now();
    if (this.noticeType === 'error') this.processState = 'error';
    else if (/paused|cancelled/i.test(this.notice)) this.processState = 'paused';
    else if (this.noticeType === 'success' || this.progress?.stage === 'complete') this.processState = 'complete';
    else if (this.processState === 'running' || this.processState === 'waiting') this.processState = this.generationDraft() ? 'paused' : 'idle';
  }
  refreshProcessing() {
    const old = this.container?.querySelector('#quiz-processing');
    if (!old) return;
    const action = old.contains(document.activeElement) ? document.activeElement?.dataset.action : null;
    this.processLogExpanded = Boolean(old.querySelector('.qz-process-activity')?.open);
    old.outerHTML = this.processingMarkup(); window.app?.refreshIcons?.();
    if (action) this.container.querySelector(`#quiz-processing [data-action="${action}"]`)?.focus({preventScroll:true});
  }
  generationError(error) {
    const auth = error.code === 'AI_AUTHENTICATION_FAILED' || error.status === 401 || error.status === 403 || /API key is not configured/i.test(error.message || '');
    let text = error.message || 'Quiz generation did not finish. Your source is kept; try again.';
    if (auth) text = 'Gemini rejected the API key or its permissions. Open Settings, add a valid key and test the connection, then return to generate your quiz. Your source and choices are kept.';
    else if (error.code === 'AI_INVALID_ARGUMENT') text = `Gemini rejected a quiz request setting (HTTP 400). Model: ${this.generationDraft()?.model || window.geminiService?.getActiveModel?.() || 'Gemini'}.${error.invalidFields?.length ? ` Fields: ${error.invalidFields.join(', ')}.` : ''} ${error.message || ''} Completed questions are kept. Resume uses the saved compatible request format.`;
    else if (error.code === 'AI_NETWORK_UNCERTAIN') text = 'The connection ended before your quiz was received. Your source and choices are kept. Check the connection and try again.';
    else if (error.status === 503) text = 'Gemini is temporarily unavailable. Your source and choices are kept. Please try again shortly.';
    else if (error.status === 429) text = error.code === 'AI_DAILY_QUOTA' ? 'Gemini daily quota is exhausted. Try again after the quota resets. Your source and choices are kept.'
      : error.code === 'AI_QUOTA_UNAVAILABLE' ? 'This Gemini model has no quota for your API project. Open Settings and test your key to select an available model.'
      : error.code === 'AI_SPEND_LIMIT' ? 'Gemini project spending limit has been reached. Check the project limits before trying again. Your source and choices are kept.'
      : `Gemini is rate limited. ${error.retryAfterMs ? `Wait at least ${Math.ceil(error.retryAfterMs / 1000)} seconds before trying again.` : 'Wait a moment before trying again.'} Your source and choices are kept.`;
    this.message(text, 'error'); this.noticeSettings = auth || error.code === 'AI_QUOTA_UNAVAILABLE';
  }
  isCurrent(epoch) { return epoch === this._epoch && this._active; }
  isBusy() { return this.busy || this.reading || this.saving; }
  scrollTo(selector, block = 'center', instant = false) {
    const element = this.container?.querySelector(selector);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element?.scrollIntoView?.({ behavior:instant || reducedMotion ? 'instant' : 'smooth', block });
  }

  async render(params = {}) {
    this.container = document.getElementById('view-quiz');
    if (!this.container) return;
    this._active = true;
    if (this.mode === 'attempt') this.startAttemptTimer();
    if (this.mode === 'create') this.restoreGenerationForm();
    this.paint();
    if (params.id && Number.isSafeInteger(Number(params.id))) return this.openQuiz(Number(params.id));
    if (!this._resumeChecked) {
      this._resumeChecked = true;
      const draft = this.readDraft();
      if (draft && this.mode === 'create' && !this.generationDraft()) return this.openQuiz(draft.quizId, true);
    }
    if (this.mode === 'saved') await this.loadSaved();
  }

  hero() {
    return UIUtils.buildViewHero({
      accent: 'indigo', icon: 'list-checks', eyebrow: 'Quiz Practice', title: 'Understand it.', titleAccent: 'Test yourself.',
      hindi: 'प्रश्न अभ्यास — पढ़ें, परखें और सीखें',
      tagline: 'Create a bilingual quiz, practise concepts or take a timed mock test.',
      stats: [{ value: '20', label: 'Questions per batch' }]
    });
  }

  paint() {
    if (!this.container || !this._active) return;
    const inPractice = this.mode === 'attempt' || this.mode === 'result';
    this.container.innerHTML = `<div class="quiz-workspace qz-page">${inPractice ? '' : this.hero()}
      <div class="qz-tabs" role="group" aria-label="Quiz sections">
        <button class="btn ${this.mode === 'create' ? 'btn-primary' : 'btn-secondary'}" data-action="create" ${this.isBusy() ? 'disabled' : ''}><i data-lucide="plus" aria-hidden="true"></i>Create quiz</button>
        <button class="btn ${this.mode === 'saved' ? 'btn-primary' : 'btn-secondary'}" data-action="saved" ${this.isBusy() ? 'disabled' : ''}><i data-lucide="archive" aria-hidden="true"></i>Saved quizzes</button>
        <button class="btn ${this.mode === 'questions' ? 'btn-primary' : 'btn-secondary'}" data-action="saved-questions" ${this.isBusy() ? 'disabled' : ''}><i data-lucide="bookmark" aria-hidden="true"></i>Saved questions (${this.readSavedQuestions().length})</button>
      </div>
      ${this.processingMarkup()}
      ${this.mode === 'attempt' ? this.attemptMarkup() : this.mode === 'result' ? this.resultMarkup() : this.mode === 'setup' ? this.setupMarkup() : this.mode === 'saved' ? this.savedMarkup() : this.mode === 'questions' ? this.savedQuestionsMarkup() : this.createMarkup()}
    </div>`;
    this.bind();
    if (this.mode === 'create') this.syncValidation();
    window.app?.refreshIcons?.();
  }

  createMarkup() {
    const e = value => this.escape(value), disabled = this.isBusy() ? 'disabled' : '', job = this.generationDraft();
    const sourceType = this.form.sourceType || 'PDF', locked = this.isBusy() || job ? 'disabled' : '';
    return `<div class="qz-create-grid">
      <section class="glass-panel qz-panel" aria-labelledby="quiz-source-heading">
        <div class="qz-panel-heading"><span class="qz-step">1</span><div><h2 id="quiz-source-heading">Choose your source</h2><p>Use PDF pages, a topic, study text or write your own questions.</p></div></div>
        <div class="qz-source-tabs" role="group" aria-label="Quiz source">${[['PDF','PDF document','file-text','Choose pages to study'],['TOPIC','Topic','lightbulb','Start with a subject'],['TEXT','Study text','align-left','Paste your material'],['MANUAL','Manual questions','square-pen','Write your own quiz']].map(([value,label,icon,hint])=>`<button class="btn ${value===sourceType ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="source" data-source="${value}" aria-pressed="${value===sourceType}" ${locked}><i data-lucide="${icon}" aria-hidden="true"></i><span><strong>${label}</strong><small>${hint}</small></span></button>`).join('')}</div>
        <div class="qz-upload ${this.reading ? 'qz-upload-reading' : ''}" id="quiz-drop-zone" ${sourceType === 'PDF' ? '' : 'hidden'}>
          <i data-lucide="file-up" aria-hidden="true"></i>
          <strong>${this.pdf ? e(this.pdf.fileName) : this.reading ? 'Opening your PDF…' : 'Drop your study PDF here'}</strong>
          <p>${this.pdf ? `${this.pdf.pageCount} pages · ${this.formatSize(this.pdf.fileSizeBytes)}` : 'PDF files up to 50 MB and 1,000 pages. Selected pages are read in source batches.'}</p>
          <label class="btn btn-secondary qz-file-label ${this.isBusy() ? 'qz-disabled' : ''}" for="quiz-file">${this.pdf ? 'Choose another PDF' : 'Browse PDF'}</label>
          <input id="quiz-file" class="qz-file-input" type="file" accept="application/pdf,.pdf" aria-label="Upload study PDF" ${disabled}>
          ${this.pdf ? `<button class="btn btn-ghost btn-sm" data-action="remove-file" ${disabled}>Remove PDF</button>` : ''}
          ${this.reading ? '<button class="btn btn-secondary btn-sm" data-action="cancel-read">Cancel opening PDF</button>' : ''}
        </div>
        <fieldset class="qz-fieldset" ${locked} ${sourceType === 'PDF' ? '' : 'hidden'}>
          <legend>PDF page selection</legend>
          <div class="qz-fields qz-pages"><label for="quiz-from-page">From page<input id="quiz-from-page" inputmode="numeric" type="number" min="1" max="${this.pdf?.pageCount || 1}" step="1" value="${e(this.form.fromPage)}" ${this.pdf ? '' : 'disabled'}></label>
          <label for="quiz-to-page">To page<input id="quiz-to-page" inputmode="numeric" type="number" min="1" max="${this.pdf?.pageCount || 1}" step="1" value="${e(this.form.toPage)}" ${this.pdf ? '' : 'disabled'}></label></div>
          <p class="qz-hint" id="quiz-page-summary">${this.pdf ? '' : 'Upload a PDF to select its pages.'}</p>
        </fieldset>
        <fieldset class="qz-fieldset" ${locked} ${['TEXT','TOPIC'].includes(sourceType) ? '' : 'hidden'}><label for="quiz-text">${sourceType==='TEXT' ? 'Paste study text' : 'Enter your topic'}<textarea id="quiz-text" rows="6" maxlength="${sourceType==='TOPIC' ? 2000 : 20000}" placeholder="${sourceType==='TEXT' ? 'Paste the material your questions should be based on…' : 'Example: Indian Constitution — fundamental rights, UPSC level'}">${e(this.form.text || '')}</textarea></label><p class="qz-hint">${sourceType==='TEXT' ? 'Questions are grounded in your text. Up to 20,000 characters.' : 'Questions use AI knowledge of the topic. Up to 2,000 characters.'}</p></fieldset>
        ${sourceType === 'MANUAL' ? this.manualMarkup(locked) : ''}
      </section>
      <section class="glass-panel qz-panel" aria-labelledby="quiz-options-heading">
        <div class="qz-panel-heading"><span class="qz-step">2</span><div><h2 id="quiz-options-heading">Make it your quiz</h2><p>A fresh set of questions from your selected material.</p></div></div>
        <fieldset class="qz-fieldset qz-options" ${locked}>
          <legend class="qz-sr-only">Quiz options</legend>
          <label for="quiz-count">Number of questions<input id="quiz-count" inputmode="numeric" type="number" min="1" max="200" step="1" value="${sourceType === 'MANUAL' ? this.manualQuestions.length : e(this.form.count)}" ${sourceType === 'MANUAL' ? 'disabled' : ''}><span class="qz-hint">Choose 1–200 questions.</span></label>
          <p class="qz-batch-info"><strong>20 questions per batch</strong><br>1–20 questions use one question batch. Larger quizzes use batches of 20 and a final remainder. Large scanned batches may need extra page reading. Every completed batch is saved.</p>
          <label for="quiz-difficulty">Difficulty<select id="quiz-difficulty">${[['EASY','Easy'],['MEDIUM','Medium'],['HARD','Hard'],['MIXED','Mixed — Easy, Medium & Hard']].map(([value,label]) => `<option value="${value}" ${this.form.difficulty === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label for="quiz-language">Question language<select id="quiz-language">${[['AUTO','Match the source'],['ENGLISH','English'],['HINDI','Hindi'],['BILINGUAL','Hindi + English combined']].map(([value,label]) => `<option value="${value}" ${this.form.language === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <div class="qz-advanced-settings qz-fields"><label for="quiz-subject">Subject<input id="quiz-subject" maxlength="120" value="${e(this.form.subject)}" placeholder="e.g. History"></label><label for="quiz-chapter">Chapter<input id="quiz-chapter" maxlength="120" value="${e(this.form.chapter)}" placeholder="e.g. Modern India"></label></div>
          <label for="quiz-exam">Exam / level<input id="quiz-exam" maxlength="120" value="${e(this.form.exam)}" placeholder="e.g. UPSC, SSC, Class 10"></label>
        </fieldset>
        <p id="quiz-validation" class="qz-validation" aria-live="polite"></p>
        ${this.sessionSettingsMarkup(locked)}
        <button id="quiz-generate" class="btn btn-primary qz-generate" data-action="generate" disabled><i data-lucide="sparkles" aria-hidden="true"></i>${this.busy ? 'Creating your quiz…' : sourceType === 'MANUAL' ? 'Save manual quiz' : 'Generate quiz'}</button>
        <p class="qz-hint">${sourceType === 'MANUAL' ? 'Your questions are saved locally. Add Hindi and English together in the editor for a bilingual manual quiz.' : 'Quota interruptions keep completed batches. In Practice, selecting an answer shows its explanation immediately. Exam solutions appear after submission.'}</p>
      </section>
    </div>
    ${!this.busy ? this.generationDraftMarkup() : ''}
    `;
  }

  sessionSettingsMarkup(disabled = '') {
    const s = this.sessionSettings, e = value => this.escape(value), presets = window.QuizTools?.PRESETS || [{id:'custom',label:'Custom'}];
    return `<details class="qz-session-settings qz-advanced" open><summary>Practice & exam controls</summary><fieldset class="qz-fieldset qz-options" ${disabled}>
      <div class="qz-fields"><label for="quiz-mode">Mode<select id="quiz-mode" data-session="mode">${[['PRACTICE','Practice — instant explanations'],['EXAM','Exam — answers after submission']].map(([value,label])=>`<option value="${value}" ${s.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label for="quiz-preset">Preset<select id="quiz-preset">${presets.map(p=>`<option value="${e(p.id)}" ${s.presetId === p.id ? 'selected' : ''}>${e(p.label)}</option>`).join('')}</select></label></div>
      <p class="qz-hint">Presets are editable practice defaults. Adjust them to your exam instructions.</p>
      <div class="qz-fields"><label for="quiz-duration">Timer (minutes)<input id="quiz-duration" data-session="durationMinutes" type="number" min="0" max="720" step="1" value="${e(s.durationMinutes)}"><span class="qz-hint">0 = untimed. Timed exams submit automatically.</span></label><label for="quiz-marks">Marks per correct answer<input id="quiz-marks" data-session="marksPerQuestion" type="number" min="0.1" max="100" step="0.1" value="${e(s.marksPerQuestion)}"></label></div>
      <label for="quiz-negative">Negative marking per wrong answer<input id="quiz-negative" data-session="negativeMarks" type="number" min="0" max="${e(s.marksPerQuestion)}" step="0.01" value="${e(s.negativeMarks)}"><span class="qz-hint">0 = no negative marking. Skipped questions score 0.</span></label>
      <div class="qz-actions"><label class="qz-check"><input id="quiz-shuffle-questions" data-session="shuffleQuestions" type="checkbox" ${s.shuffleQuestions ? 'checked' : ''}> Shuffle questions</label><label class="qz-check"><input id="quiz-shuffle-options" data-session="shuffleOptions" type="checkbox" ${s.shuffleOptions ? 'checked' : ''}> Shuffle options</label></div>
    </fieldset></details>`;
  }

  validateSessionSettings() {
    const s = this.sessionSettings;
    if (!['PRACTICE','EXAM'].includes(s.mode) || !Number.isInteger(Number(s.durationMinutes)) || Number(s.durationMinutes) < 0 || Number(s.durationMinutes) > 720 || !Number.isFinite(Number(s.marksPerQuestion)) || Number(s.marksPerQuestion) <= 0 || Number(s.marksPerQuestion) > 100 || !Number.isFinite(Number(s.negativeMarks)) || Number(s.negativeMarks) < 0 || Number(s.negativeMarks) > Number(s.marksPerQuestion)) return 'Choose a timer from 0–720 minutes, positive marks, and a penalty no greater than the correct-answer marks.';
    return '';
  }

  defaultsForQuiz(quiz) {
    const defaults = {mode:'PRACTICE',durationMinutes:0,marksPerQuestion:1,negativeMarks:0,shuffleQuestions:false,shuffleOptions:false,presetId:'custom'};
    const saved = quiz?.sessionDefaults;
    if (!saved || !['PRACTICE','EXAM'].includes(saved.mode)) return defaults;
    const candidate = {...defaults,...saved}, previous = this.sessionSettings;
    this.sessionSettings = candidate; const error = this.validateSessionSettings(); this.sessionSettings = previous;
    return error ? defaults : candidate;
  }

  applyPreset(id) {
    const preset = window.QuizTools?.PRESETS?.find(item => item.id === id);
    if (!preset) return;
    Object.assign(this.sessionSettings, {presetId:id,mode:preset.mode || (id === 'practice' || id === 'custom' ? 'PRACTICE' : 'EXAM'),durationMinutes:preset.durationMinutes,marksPerQuestion:preset.marksPerQuestion,negativeMarks:preset.negativeMarks});
    if (this.mode === 'create' && this.form.sourceType !== 'MANUAL' && !this.generationDraft() && preset.count) this.form.count = String(preset.count);
    if (preset.exam && !this.generationDraft()) this.form.exam = preset.exam;
    this.paint(); this.container.querySelector('#quiz-preset')?.focus({preventScroll:true});
  }

  manualMarkup(disabled = '') {
    const e = value => this.escape(value);
    return `<fieldset class="qz-fieldset qz-manual" ${disabled}><label for="quiz-title">Quiz title<input id="quiz-title" maxlength="200" value="${e(this.form.title)}" placeholder="My chapter test"></label>
      ${this.manualQuestions.map((q,index)=>`<details class="qz-manual-question" open><summary>Question ${index + 1}</summary><label>Question<textarea data-manual="question" data-question="${index}" maxlength="2000" rows="2">${e(q.question)}</textarea></label><div class="qz-fields">${q.options.map((option,n)=>`<label>Option ${'ABCD'[n]}<textarea data-manual="option" data-question="${index}" data-option="${n}" maxlength="1000" rows="2">${e(option)}</textarea></label>`).join('')}</div><label>Correct answer<select data-manual="answerIndex" data-question="${index}">${[0,1,2,3].map(n=>`<option value="${n}" ${q.answerIndex === n ? 'selected' : ''}>${'ABCD'[n]}</option>`).join('')}</select></label><label>Explanation<textarea data-manual="explanation" data-question="${index}" maxlength="3000" rows="2">${e(q.explanation)}</textarea></label><details><summary>Why each option is correct or wrong (optional)</summary>${[0,1,2,3].map(n=>`<label>Option ${'ABCD'[n]} reason<textarea data-manual="reason" data-question="${index}" data-option="${n}" maxlength="1500" rows="2">${e(q.optionExplanations?.[n] || '')}</textarea></label>`).join('')}</details><button class="btn btn-ghost btn-sm" data-action="remove-manual" data-index="${index}">Remove question ${index + 1}</button></details>`).join('')}
      <button class="btn btn-secondary" data-action="add-manual" ${this.manualQuestions.length >= 200 ? 'disabled' : ''}>Add question</button><p class="qz-hint">The editor draft is saved on this device. Each question needs four different options and one correct answer.</p></fieldset>`;
  }

  saveAuthoringDraft() {
    try { localStorage.setItem(this.authoringKey, JSON.stringify({title:this.form.title,questions:this.manualQuestions})); }
    catch { this.message('The editor draft could not be saved. Keep this tab open until your quiz is saved.', 'error'); }
  }

  addManualQuestion() { this.manualQuestions.push({question:'',options:['','','',''],answerIndex:0,explanation:'',optionExplanations:['','','','']}); this.saveAuthoringDraft(); this.paint(); this.container.querySelector(`[data-manual="question"][data-question="${this.manualQuestions.length - 1}"]`)?.focus(); }
  removeManualQuestion(index) { if (!Number.isInteger(index) || !this.manualQuestions[index]) return; this.manualQuestions.splice(index,1); this.saveAuthoringDraft(); this.paint(); this.container.querySelector('[data-action="add-manual"]')?.focus(); }

  async saveManualQuiz() {
    const valid = this.validation();
    if (!valid.valid) { this.noticeIsValidation = true; this.message(valid.message,'error'); this.paint(); this.scrollTo('#quiz-processing','center',true); return; }
    if (!this.canReplaceDraft()) return;
    const questions = this.manualQuestions.map((q,index) => ({id:`q${index + 1}`,question:q.question.trim(),options:q.options.map(o=>o.trim()),answerIndex:q.answerIndex,explanation:q.explanation.trim(),sourcePage:null,...(q.optionExplanations?.every(reason=>String(reason).trim()) ? {optionExplanations:q.optionExplanations.map(r=>r.trim())} : {}), difficulty:this.form.difficulty === 'MIXED' ? 'MEDIUM' : this.form.difficulty}));
    try { window.QuizService?.validateQuizResponse({title:this.form.title.trim(),questions},{count:questions.length,sourceType:'TEXT'}); } catch(error) { this.message(error.message,'error'); this.paint(); return; }
    this.readyQuiz = {title:this.form.title.trim(),questions,source:{type:'TEXT',text:'Manually authored study questions.'},manual:true,difficulty:this.form.difficulty,language:this.form.language,model:'MANUAL',createdAt:new Date().toISOString(),subject:this.form.subject,chapter:this.form.chapter,exam:this.form.exam,sessionDefaults:{...this.sessionSettings}};
    await this.saveReadyQuiz();
  }

  validation() {
    const sourceType = this.form.sourceType || 'PDF';
    const settingsError = this.validateSessionSettings();
    if (settingsError) return {valid:false, message:settingsError};
    if (sourceType === 'MANUAL') {
      if (!this.form.title?.trim() || this.form.title.length > 200) return {valid:false, message:'Enter a quiz title (up to 200 characters).'};
      if (!this.manualQuestions.length || this.manualQuestions.length > 200) return {valid:false, message:'Add between 1 and 200 manual questions.'};
      const incomplete = this.manualQuestions.findIndex(q => !String(q.question || '').trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !String(o).trim()) || !String(q.explanation || '').trim() || !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3);
      return incomplete >= 0 ? {valid:false, message:`Complete question ${incomplete + 1}, all four options, its correct answer and explanation.`} : {valid:true, sourceType, count:this.manualQuestions.length};
    }
    if (sourceType === 'PDF' && !this.pdf) return { valid: false, message: 'Choose a PDF to begin.' };
    const parse = value => /^\d+$/.test(String(value).trim()) ? Number(value) : NaN;
    const fromPage = parse(this.form.fromPage), toPage = parse(this.form.toPage), count = parse(this.form.count);
    if (sourceType === 'PDF' && (!Number.isSafeInteger(fromPage) || !Number.isSafeInteger(toPage) || fromPage < 1 || toPage < fromPage || toPage > this.pdf.pageCount)) {
      return { valid: false, message: `Enter a valid page range between 1 and ${this.pdf.pageCount}.` };
    }
    if (sourceType === 'PDF' && toPage - fromPage + 1 > 1000) return { valid: false, message: 'Select up to 1,000 PDF pages.' };
    if (sourceType !== 'PDF' && (!['TOPIC','TEXT'].includes(sourceType) || String(this.form.text || '').trim().length<3 || String(this.form.text).length>(sourceType==='TOPIC' ? 2000 : 20000))) return {valid:false,message:'Enter a topic (3–2,000 characters) or study text (3–20,000 characters).'};
    if (!Number.isSafeInteger(count) || count < 1 || count > 200) return { valid: false, message: 'Enter a whole number from 1 to 200 questions.' };
    if (!['EASY','MEDIUM','HARD','MIXED'].includes(this.form.difficulty) || !['AUTO','ENGLISH','HINDI','BILINGUAL'].includes(this.form.language)) return { valid: false, message: 'Choose a difficulty and question language.' };
    return { valid: true, fromPage, toPage, count, sourceType, text:this.form.text || '', subject:this.form.subject || '', chapter:this.form.chapter || '', exam:this.form.exam || '', message: '' };
  }

  syncValidation() {
    const valid = this.validation(), button = this.container?.querySelector('#quiz-generate');
    if (button) button.disabled = !valid.valid || this.isBusy() || Boolean(this.readyQuiz) || Boolean(this.generationDraft()) || Boolean(this.service?.draftError);
    const message = this.container?.querySelector('#quiz-validation');
    if (message) message.textContent = valid.valid ? `Ready to create ${valid.count} questions.` : '';
    this.validationIssue = this.mode === 'create' && this.validationTouched && !valid.valid ? valid.message : '';
    if (this.noticeIsValidation && valid.valid) { this.notice = ''; this.noticeType = 'info'; this.noticeIsValidation = false; }
    for (const input of this.container?.querySelectorAll('.qz-fieldset input,.qz-fieldset select,.qz-fieldset textarea') || []) input.setAttribute('aria-invalid',String(this.validationTouched && !input.disabled && !input.checkValidity()));
    const summary = this.container?.querySelector('#quiz-page-summary');
    if (summary && this.pdf) summary.textContent = valid.valid ? `${valid.toPage - valid.fromPage + 1} selected ${valid.toPage === valid.fromPage ? 'page' : 'pages'} · Pages ${valid.fromPage}–${valid.toPage} of ${this.pdf.pageCount}` : `This PDF has ${this.pdf.pageCount} pages.`;
    this.refreshProcessing();
  }

  generationDraftMarkup() {
    const job = this.generationDraft(), e = value=>this.escape(value);
    if (!job) return '';
    const needsPdf = job.source.type === 'PDF' && (!this.pdf || this.pdf.fingerprint !== job.source.fingerprint);
    const savedScans = job.pendingOcr?.pages?.length || 0;
    return `<section class="glass-panel qz-panel qz-paused" id="quiz-generation-draft"><span class="badge badge-primary">Saved generation</span><h2>${job.questions.length} / ${job.count} questions ready</h2><p>${job.next} / ${job.tasks?.length || Math.ceil(job.count/20)} batches complete · ${e(job.source.type==='PDF' ? `${job.source.fileName} · Pages ${job.source.fromPage}–${job.source.toPage}` : job.source.type==='TEXT' ? 'Saved study text' : job.source.text.slice(0,160))}</p>${needsPdf ? '<p>Upload the same PDF again to resume. Its completed questions are already saved on this device.</p>' : '<p>Resume sends only unfinished question batches and unread scans. A depleted daily quota must reset before more requests can succeed.</p>'}${savedScans ? `<p>Text from ${savedScans} scanned page${savedScans === 1 ? '' : 's'} is saved and will be reused on Resume.</p>` : ''}<div class="qz-actions"><button class="btn btn-primary" data-action="resume-generation" ${needsPdf || this.isBusy() || this.readyQuiz ? 'disabled' : ''}>Resume generation</button>${job.questions.length && job.questions.length<job.count ? '<button class="btn btn-secondary" data-action="use-completed">Practise completed questions</button>' : ''}<button class="btn btn-secondary" data-action="discard-generation" ${this.isBusy() ? 'disabled' : ''}>Discard generation draft</button></div></section>`;
  }

  processingMarkup() {
    const progress = this.progress || {}, job = this.generationDraft(), e = value=>this.escape(value);
    const error = this.noticeType === 'error' && this.notice ? this.notice : this.autosaveFailed ? 'Progress could not be saved. Keep this tab open and free browser storage before leaving.' : this.service?.draftError || (this.mode === 'create' ? this.validationIssue : '') || '';
    const active = Boolean(this.isBusy() || this.loadingSaved || this.converting || this.historyLoading) && !error;
    const state = error ? 'error' : active ? progress.stage === 'waiting' ? 'waiting' : 'running' : ['running','waiting'].includes(this.processState) || this.processState === 'idle' && job ? job ? 'paused' : 'idle' : this.processState;
    const stage = progress.stage || (this.saving ? 'saving' : 'reading');
    const stages = [['reading', (job?.source.type || this.form.sourceType) === 'PDF' ? 'Read selected pages' : 'Prepare source'],['generating','Create questions'],['validating','Prepare your quiz'],['saving','Save on this device']];
    const current = stages.findIndex(([id])=>id === (stage === 'waiting' ? this.waitingStage || 'reading' : stage));
    const completed = Math.max(0,Number(progress.completed ?? job?.questions.length ?? 0) || 0);
    const requested = Math.max(0,Number(progress.requested ?? job?.count ?? (this.form.sourceType === 'MANUAL' ? this.manualQuestions.length : this.form.count)) || 0);
    const percent = requested ? Math.min(100,Math.floor(completed/requested*100)) : 0;
    const labels = {idle:'Ready',running:'In progress',waiting:'Waiting for Gemini',paused:'Paused',error:'Needs attention',complete:'Complete'};
    const runningTitles = {load:'Opening your PDF',save:'Saving your quiz',attempt:'Saving your attempt',library:'Loading saved quizzes',history:'Loading attempt history',delete:'Removing the saved quiz',flashcards:'Preparing flashcards',generation:'Creating your quiz'};
    const titles = {idle:'Your quiz workspace',running:runningTitles[this.processKind] || 'Updating your workspace',waiting:'Waiting to continue',paused:'Your progress is saved',error:'Let’s resolve this',complete:this.processKind === 'load' ? 'Your PDF is ready' : 'Ready for your next step'};
    const source = job?.source.type || this.form.sourceType || 'PDF';
    const sourceLabel = source === 'PDF' ? this.pdf?.fileName || job?.source.fileName || 'PDF document' : source === 'TOPIC' ? 'Topic' : source === 'TEXT' ? 'Study text' : 'Manual questions';
    const validation = this.validation();
    const summary = error ? 'Review the issue below to continue.' : this.notice || progress.message || (job ? 'Resume your saved generation when you are ready.' : this.mode === 'create' && !validation.valid ? validation.message : 'Choose your source and controls. Your activity will appear here.');
    const batch = Number(progress.batch ?? (job?.tasks ? Math.min(job.next+1,job.tasks.length) : 0)) || 0;
    const totalBatches = Number(progress.totalBatches ?? job?.tasks?.length) || (requested ? Math.ceil(requested/20) : 0);
    const needsPdf = job?.source.type === 'PDF' && (!this.pdf || this.pdf.fingerprint !== job.source.fingerprint);
    return `<section class="glass-panel qz-panel qz-processing" id="quiz-processing" data-state="${state}" aria-labelledby="quiz-processing-heading" aria-busy="${active}">
      <div class="qz-process-header"><span class="qz-process-eyebrow"><i data-lucide="activity" aria-hidden="true"></i> Live workspace</span><div class="qz-process-meta"><span class="qz-process-status">${labels[state]}</span>${this.startedAt ? `<span id="quiz-elapsed" class="qz-elapsed">${this.elapsedText()}</span>` : ''}</div></div>
      <div class="qz-process-body"><div class="qz-process-visual" aria-hidden="true"><span class="qz-process-ring"></span><span class="qz-process-ring"></span><span class="qz-process-ring"></span><span class="qz-process-core"><i data-lucide="${state === 'error' ? 'triangle-alert' : state === 'complete' ? 'check' : state === 'paused' ? 'pause' : 'sparkles'}"></i></span></div><div><h2 id="quiz-processing-heading" class="qz-process-title">${titles[state]}</h2><p id="quiz-processing-message" role="status">${e(summary)}</p></div></div>
      ${this.processKind === 'generation' || job ? `<div class="qz-process-metrics"><div><strong>${completed} / ${requested}</strong><span>Questions validated</span></div><div><strong>${batch ? `${batch} / ${totalBatches}` : totalBatches}</strong><span>${batch ? 'Current batch' : 'Planned batches'}</span></div><div><strong>${e(sourceLabel)}</strong><span>${source === 'PDF' ? `Pages ${e(job?.source.fromPage || this.form.fromPage)}–${e(job?.source.toPage || this.form.toPage)}` : 'Selected source'}</span></div></div><div class="qz-process-meter"><span>${percent}% validated${active && stage === 'generating' ? ' · Creating the next batch' : ''}</span><progress id="quiz-progress" aria-label="Questions validated" max="100" value="${percent}"></progress></div>${this.processKind === 'generation' ? `<ol class="qz-stages">${stages.map(([id,label],index)=>`<li data-stage="${id}" class="${active && index === current ? 'active' : state === 'complete' ? 'complete' : current > index ? 'complete' : ''}" ${active && index === current ? 'aria-current="step"' : ''}><span>${index+1}</span>${label}</li>`).join('')}</ol>` : ''}` : ''}
      ${error ? `<div class="qz-process-error" id="quiz-process-error" role="alert"><i data-lucide="circle-alert" aria-hidden="true"></i><div><strong>Action needed</strong><p>${e(error)}</p></div></div>` : ''}
      ${this.processEvents.length ? `<details class="qz-process-activity" ${this.processLogExpanded || error ? 'open' : ''}><summary>Recent activity <span>${this.processEvents.length} updates</span></summary><ol class="qz-process-log">${this.processEvents.map(event=>`<li data-event="${e(event.stage)}"><time>${this.startedAt ? Math.max(0,Math.floor((event.time-this.startedAt)/1000))+'s' : new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><span>${e(event.stage === 'error' ? 'Action paused — review the issue above.' : event.message)}</span></li>`).join('')}</ol></details>` : ''}
      <div class="qz-process-actions">${active && (this.busy || this.reading) ? `<button class="btn btn-secondary" data-action="${this.reading ? 'cancel-read' : 'cancel'}" ${this.saving ? 'disabled' : ''}><i data-lucide="pause" aria-hidden="true"></i>${this.saving ? 'Saving…' : this.reading ? 'Cancel opening PDF' : 'Pause generation'}</button>` : ''}${this.noticeSettings ? '<button class="btn btn-primary btn-sm" data-action="settings">Open Settings</button>' : ''}${this.readyQuiz ? `<button class="btn btn-primary" data-action="retry-save" ${this.saving ? 'disabled' : ''}>${this.saving ? 'Saving…' : 'Retry saving quiz'}</button>` : ''}${!active && job && !this.readyQuiz ? `<button class="btn btn-primary" data-action="resume-generation" ${needsPdf ? 'disabled' : ''}><i data-lucide="play" aria-hidden="true"></i>Resume generation</button>` : ''}${this.service?.draftError ? '<button class="btn btn-secondary" data-action="discard-generation">Discard damaged draft</button>' : ''}${this.listError && !active ? '<button class="btn btn-secondary" data-action="retry-list">Retry loading quizzes</button>' : ''}${this.resultUnsaved && !active ? '<button class="btn btn-secondary" data-action="retry-attempt">Retry saving result</button>' : ''}</div>
    </section>`;
  }

  bind() {
    this.container.onclick = event => {
      const button = event.target.closest('[data-action]');
      if (!button || !this.container.contains(button) || button.disabled) return;
      const action = button.dataset.action, id = Number(button.dataset.id), index = Number(button.dataset.index);
      const operations = { create: () => this.showCreate(), saved: () => this.showSaved(), generate: () => this.form.sourceType === 'MANUAL' ? this.saveManualQuiz() : this.generate(),
        source: () => this.chooseSource(button.dataset.source), 'resume-generation':()=>this.generate(true), 'discard-generation':()=>this.discardGeneration(), 'use-completed':()=>this.useCompleted(),
        cancel: () => this.cancel(), 'cancel-read': () => this.cancel(), 'remove-file': () => this.removeFile(),
        'retry-save': () => this.saveReadyQuiz(), settings: () => window.app?.navigate?.('settings'), open: () => this.openQuiz(id), delete: () => this.deleteQuiz(id),
        answer: () => this.answer(index), 'check-answer': () => this.checkAnswer(), 'clear-answer': () => this.clearAnswer(), question: () => this.goToQuestion(index),
        'mark-review':()=>this.toggleMark(), confidence:()=>this.setConfidence(button.dataset.value),
        'configure':()=>this.openQuiz(id,false,true), 'start-attempt':()=>this.startConfiguredAttempt(), 'resume-attempt':()=>this.startConfiguredAttempt(true),
        'retry-wrong':()=>this.retrySubset('WRONG'), 'retry-skipped':()=>this.retrySubset('SKIPPED'),
        'view-attempt':()=>this.viewAttempt(id,Number(button.dataset.attempt)), 'print-quiz':()=>this.printQuiz(), 'convert-flashcards':()=>this.convertFlashcards(),
        'add-manual':()=>this.addManualQuestion(), 'remove-manual':()=>this.removeManualQuestion(index),
        prev: () => this.goToQuestion(this.questionIndex - 1), next: () => this.goToQuestion(this.questionIndex + 1),
        submit: () => this.submitAttempt(), 'retry-attempt': () => this.savePendingAttempt(), retake: () => this.retake(), history: () => this.showHistory(id),
        'saved-prev': () => { this.savedPage = Math.max(0, (this.savedPage || 0) - 1); this.paint(); },
        'saved-next': () => { this.savedPage = (this.savedPage || 0) + 1; this.paint(); }, 'retry-list': () => this.loadSaved(),
        'saved-questions': () => this.showSavedQuestions(), 'save-question': () => this.toggleSaveQuestion(this.currentQuiz?.questions?.[index], this.currentQuiz),
        'unsave-question': () => this.removeSavedQuestion(button.dataset.key), 'sq-answer': () => this.answerSavedQuestion(button.dataset.key, index),
        'sq-reset': () => { delete this.savedQuestionAnswers[button.dataset.key]; this.paint(); } };
      if (operations[action]) Promise.resolve(operations[action]()).catch(error => { this.message(error.message || 'This action could not finish. Please try again.', 'error'); this.paint(); });
    };
    this.container.onchange = event => {
      if (event.target.id === 'quiz-file') { const file = event.target.files?.[0]; if (file) this.loadFile(file); return; }
      this.updateField(event.target);
    };
    this.container.oninput = event => this.updateField(event.target);
    this.container.ondragover = event => {
      if (event.target.closest('#quiz-drop-zone')) { event.preventDefault(); if (!this.isBusy()) event.dataTransfer.dropEffect = 'copy'; }
    };
    this.container.ondrop = event => {
      if (!event.target.closest('#quiz-drop-zone')) return;
      event.preventDefault();
      if (this.isBusy()) return;
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length !== 1) { this.message('Choose one PDF at a time.', 'error'); this.paint(); return; }
      this.loadFile(files[0]);
    };
  }

  updateField(target) {
    if (this.isBusy()) return;
    if (target.id !== 'quiz-saved-search' && !target.id?.startsWith('quiz-compare') && target.id !== 'quiz-review-filter') this.validationTouched = true;
    if (target.dataset.manual) {
      const q = this.manualQuestions[Number(target.dataset.question)], n = Number(target.dataset.option);
      if (!q) return;
      if (target.dataset.manual === 'option') q.options[n] = target.value;
      else if (target.dataset.manual === 'reason') { q.optionExplanations ||= ['','','','']; q.optionExplanations[n] = target.value; }
      else q[target.dataset.manual] = target.dataset.manual === 'answerIndex' ? Number(target.value) : target.value;
      this.saveAuthoringDraft(); this.syncValidation(); return;
    }
    if (target.id === 'quiz-preset') { this.applyPreset(target.value); return; }
    if (target.dataset.session) {
      const key = target.dataset.session;
      this.sessionSettings[key] = target.type === 'checkbox' ? target.checked : ['durationMinutes','marksPerQuestion','negativeMarks'].includes(key) ? Number(target.value) : target.value;
      if (key !== 'mode') this.sessionSettings.presetId = 'custom';
      this.syncValidation();
      const start = this.container.querySelector('[data-action="start-attempt"]'); if (start) start.disabled = Boolean(this.validateSessionSettings());
      return;
    }
    if (target.id === 'quiz-review-filter') { this.reviewFilter = target.value; this.paint(); this.container.querySelector('#quiz-review-filter')?.focus(); return; }
    if (target.id === 'quiz-compare-first' || target.id === 'quiz-compare-second') { this[target.id === 'quiz-compare-first' ? 'compareFirst' : 'compareSecond'] = Number(target.value); this.paint(); this.container.querySelector(`#${target.id}`)?.focus(); return; }
    const fields = { 'quiz-from-page':'fromPage', 'quiz-to-page':'toPage', 'quiz-count':'count', 'quiz-difficulty':'difficulty', 'quiz-language':'language', 'quiz-text':'text', 'quiz-subject':'subject', 'quiz-chapter':'chapter', 'quiz-exam':'exam', 'quiz-title':'title' };
    if (this.generationDraft() && fields[target.id]) return;
    if (fields[target.id]) { this.form[fields[target.id]] = target.value; if (target.id === 'quiz-title') this.saveAuthoringDraft(); this.syncValidation(); }
    if (target.id === 'quiz-saved-search') {
      this.savedSearch = target.value; this.savedPage = 0;
      const caret = target.selectionStart; this.paint();
      const next = this.container.querySelector('#quiz-saved-search'); next?.focus(); next?.setSelectionRange(caret, caret);
    }
  }

  async loadFile(file) {
    if (this.busy || this.saving) return;
    if (this.readyQuiz && !window.confirm('Replace the PDF? The quiz waiting to be saved will be discarded.')) return;
    this.cancel(false);
    const epoch = ++this._epoch;
    const controller = this._controller = new AbortController();
    this.pdf = null; this.readyQuiz = null; this.reading = true; this.mode = 'create'; this.validationIssue = ''; this.validationTouched = false;
    this.beginProcess('load',`Opening ${file?.name || 'your PDF'} and checking its pages…`); this.paint();
    this.scrollTo('#quiz-processing','center',true);
    try {
      if (!file || !/\.pdf$/i.test(file.name || '') || (file.type && !['application/pdf','application/x-pdf'].includes(file.type))) throw new Error('Please choose a PDF file.');
      if (file.size > 50 * 1024 * 1024) throw new Error('This PDF is larger than 50 MB. Choose a smaller PDF.');
      const metadata = await this.service.loadPdf(file, { signal: controller.signal });
      if (!this.isCurrent(epoch) || controller.signal.aborted) return;
      const job = this.generationDraft();
      if (job?.source.type === 'PDF' && (job.source.fingerprint !== metadata.fingerprint || job.source.pageCount !== metadata.pageCount)) throw new Error('This is a different PDF. Upload the original PDF to resume, or discard its generation draft first.');
      this.pdf = metadata;
      if (job) this.restoreGenerationForm();
      else { this.form.fromPage = '1'; this.form.toPage = String(Math.min(20, metadata.pageCount)); }
      this.message(`${metadata.pageCount} pages loaded. Choose your pages and quiz options.`, 'success');
    } catch (error) {
      if (!this.isCurrent(epoch)) return;
      this.message(error.name === 'AbortError' ? 'Opening PDF cancelled. Choose your PDF again to continue.' : error.message || 'The PDF could not be opened. Choose another PDF.', error.name === 'AbortError' ? 'info' : 'error');
    } finally {
      if (epoch === this._epoch) { this.reading = false; this._controller = null; this.finishProcess(); this.paint(); }
    }
  }

  removeFile() {
    if (this.isBusy()) return;
    this.service?.clear(); this.pdf = null; this.form.fromPage = '1'; this.form.toPage = '1'; this.restoreGenerationForm(); this.message(''); this.paint();
  }

  chooseSource(type) {
    if (this.isBusy() || this.generationDraft() || !['PDF','TOPIC','TEXT','MANUAL'].includes(type)) return;
    this.form.sourceType = type; this.message(''); this.paint();
  }

  discardGeneration() {
    if (this.isBusy() || !window.confirm('Discard this generation draft and its completed questions? Saved quizzes and attempts stay available.')) return;
    this.service.discardDraft(); this.readyQuiz = null; this.message('Generation draft discarded. You can create another quiz.'); this.paint();
  }

  async useCompleted() {
    if (this.isBusy() || !this.canReplaceDraft()) return;
    const job = this.generationDraft();
    if (!job?.questions.length) return;
    const source = {...job.source}; delete source.fingerprint;
    const quiz = {title:`${(job.title || 'Quiz').slice(0,160)} (${job.questions.length}/${job.count})`,questions:job.questions,source,difficulty:job.difficulty,language:job.language,model:job.model,createdAt:job.createdAt,generationId:`${job.id}-partial-${job.questions.length}`,subject:job.subject || '',chapter:job.chapter || '',exam:job.exam || '',sessionDefaults:{...this.sessionSettings}};
    this.saving = true; const epoch=this._epoch; this.beginProcess('save',`Saving the ${job.questions.length} completed questions for practice…`,{stage:'saving',completed:job.questions.length,requested:job.count}); this.paint();
    try { const saved=await this.store.save(quiz); if (!this.isCurrent(epoch)) return; this.startQuiz(saved,false); this.message('Completed questions are ready to practise. Return to Create quiz to resume generation.','success'); }
    catch (error) { this.message(error.message || 'Completed questions could not be saved. The generation draft is kept.','error'); }
    finally { this.saving=false; this.finishProcess(); this.paint(); }
  }

  async generate(resume = false) {
    if (this.isBusy() || this.readyQuiz) return;
    if (resume) this.restoreGenerationForm();
    const validation = this.validation();
    if (!validation.valid) { this.noticeIsValidation = true; this.message(validation.message, 'error'); this.paint(); this.scrollTo('#quiz-processing','center',true); return; }
    if (!this.canReplaceDraft()) return;
    const app = window.app;
    if (app?._isGenerating) { this.message('Another AI task is still running. Finish or pause it before creating this quiz.','error'); this.paint(); return; }
    if (app?.beginGeneration && !app.beginGeneration('Creating your quiz…', { inline: true, owner: 'quiz' })) { this.message('Quiz generation could not start. Wait for the current task to finish, then retry.','error'); this.paint(); return; }
    const context = app?.getGenerationContext?.() || {}, jobId = context.jobId ?? context.id;
    const epoch = ++this._epoch, controller = this._controller = new AbortController();
    this._generationJobId = jobId;
    const abort = () => controller.abort();
    if (context.signal?.aborted) abort();
    context.signal?.addEventListener('abort', abort, { once: true });
    this.busy = true;
    const draft = this.generationDraft();
    this.beginProcess('generation',validation.sourceType === 'PDF' ? 'Reading your selected pages…' : 'Preparing your selected study source…',{completed:draft?.questions.length || 0,requested:draft?.count || validation.count}); this.paint();
    this.scrollTo('#quiz-processing', 'center', true);
    try {
      const quiz = await this.service.generate({ ...validation, resume, difficulty:this.form.difficulty, language:this.form.language,sessionDefaults:{...this.sessionSettings},
        signal:controller.signal, onProgress:progress => {
          if (!this.isCurrent(epoch) || controller.signal.aborted) return;
          this.recordProgress(progress); this.refreshProcessing();
        } });
      if (!this.isCurrent(epoch) || controller.signal.aborted) return;
      quiz.sessionDefaults = {...this.sessionSettings};
      this.readyQuiz = quiz;
      this.recordProgress({stage:'saving',completed:quiz.questions.length,requested:quiz.questions.length,message:`${quiz.questions.length} questions are ready. Saving your quiz…`});
      this.paint();
      let saved;
      this.saving = true; this.paint();
      try { saved = await this.store.save(quiz); }
      catch (error) { if (this.isCurrent(epoch)) this.message(`Your quiz is ready, but browser storage could not save it. ${error.message || 'Free some browser storage and retry saving.'}`, 'error'); return; }
      finally { this.saving = false; }
      this.service?.completeGeneration?.(quiz.generationId);
      if (this.readyQuiz === quiz) this.readyQuiz = null;
      if (!this.isCurrent(epoch) || controller.signal.aborted) { if (this._active) { this.message('Your quiz was saved. Open Saved quizzes to practise it.', 'success'); this.paint(); } return; }
      this.startQuiz(typeof saved === 'number' ? { ...quiz, id:saved } : saved, false);
      this.message(`${quiz.questions.length} questions saved. Your quiz is ready to practise.`, 'success');
    } catch (error) {
      if (!this.isCurrent(epoch)) return;
      if (error.name === 'AbortError' || controller.signal.aborted) this.message('Generation paused. Completed batches are saved; Resume to continue.');
      else { this.generationError(error); const draft=this.generationDraft(); if (draft) this.notice += ` ${draft.questions.length}/${draft.count} completed questions are kept. Resume continues the unfinished batch.`; }
      const savedScans = this.generationDraft()?.pendingOcr?.pages?.length || 0;
      if (savedScans) this.notice += ` Text from ${savedScans} scanned page${savedScans === 1 ? '' : 's'} is saved and will be reused on Resume.`;
    } finally {
      context.signal?.removeEventListener('abort', abort);
      if (epoch === this._epoch) {
        clearInterval(this._elapsedTimer); this._elapsedTimer = null; this.busy = false; this._controller = null; this.finishProcess();
        if (this._generationJobId === jobId) { app?.endGeneration?.(jobId); this._generationJobId = null; }
        this.paint();
        if (this.mode === 'attempt') this.scrollTo('.qz-attempt', 'start');
      }
      else if (this._active && !this.busy) this.paint();
    }
  }

  cancel(announce = true) {
    const wasReading = this.reading, wasBusy = this.busy;
    ++this._epoch;
    this._controller?.abort(); this._controller = null;
    clearInterval(this._elapsedTimer); this._elapsedTimer = null;
    this.busy = false; this.reading = false;
    if (wasReading || wasBusy) { this.processState = 'paused'; this.processEndedAt = Date.now(); }
    if (this._generationJobId != null) window.app?.endGeneration?.(this._generationJobId);
    this._generationJobId = null;
    if (wasReading) { this.pdf = null; this.service?.clear(); }
    if (announce && (wasReading || wasBusy)) {
      this.message(wasReading ? 'Opening PDF cancelled. Choose a PDF to continue.' : 'Generation paused. Completed batches are kept; Resume to continue.');
      const savedScans = !wasReading && this.generationDraft()?.pendingOcr?.pages?.length || 0;
      if (savedScans) this.notice += ` Text from ${savedScans} scanned page${savedScans === 1 ? '' : 's'} is saved and will be reused on Resume.`;
      this.paint();
    }
  }

  async saveReadyQuiz() {
    if (!this.readyQuiz || this.isBusy()) return;
    const quiz = this.readyQuiz, epoch = this._epoch; this.saving = true;
    this.beginProcess('save',`Saving ${quiz.questions.length} ready questions on this device…`,{completed:quiz.questions.length,requested:quiz.questions.length,stage:'saving'}); this.paint();
    try {
      const saved = await this.store.save(quiz);
      this.service?.completeGeneration?.(quiz.generationId);
      if (this.readyQuiz !== quiz) return;
      this.readyQuiz = null;
      if (epoch !== this._epoch || !this._active) { this.message('Your quiz was saved. Open Saved quizzes to practise it.', 'success'); return; }
      this.startQuiz(typeof saved === 'number' ? { ...quiz, id:saved } : saved, false);
      this.message('Quiz saved. You can start practising.', 'success');
    } catch (error) { this.message(`Your quiz is still ready. Saving failed: ${error.message || 'Browser storage is unavailable.'}`, 'error'); }
    finally { this.saving = false; this.finishProcess(); this.paint(); }
  }

  elapsedText() { const seconds = Math.max(0, Math.floor(((this.processEndedAt || Date.now()) - (this.startedAt || Date.now())) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} elapsed`; }
  formatSize(bytes) { return Number(bytes) >= 1024 * 1024 ? `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil((Number(bytes) || 0) / 1024))} KB`; }
  sourceText(quiz) { const source = quiz.source || {}; return quiz.manual ? 'Manually authored questions' : source.type==='TOPIC' ? `Topic · ${String(source.text).slice(0,180)}` : source.type==='TEXT' ? 'Pasted study text' : `${source.fileName || 'PDF'} · Pages ${source.fromPage || 1}–${source.toPage || source.fromPage || 1}${source.ocrPages?.length ? ` · Scanned-page OCR: ${source.ocrPages.length} pages` : ''}${source.excerptedPages?.length ? ` · Text excerpts from ${source.excerptedPages.length} pages` : ''}`; }
  dateText(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' }) : 'Saved on this device'; }

  showCreate() { if (this.isBusy()) return; ++this._renderVersion; this.persistDraft(); this.stopAttemptTimer(); this.mode = 'create'; this.restoreGenerationForm(); this.message(''); this.paint(); }
  async showSaved() { if (this.isBusy()) return; ++this._renderVersion; this.persistDraft(); this.stopAttemptTimer(); this.mode = 'saved'; this.message(''); this.historyId = null; this.history = null; this.paint(); await this.loadSaved(); }
  async loadSaved() {
    const version = ++this._renderVersion; this.loadingSaved = true; this.listError = false; this.beginProcess('library','Reading saved quizzes from this device…'); this.paint();
    try { const quizzes = await this.store.list(); if (version !== this._renderVersion || !this._active) return; this.quizzes = quizzes; this.recordProgress({stage:'complete',message:`${quizzes.length} saved quizzes loaded from this device.`}); }
    catch (error) { if (version !== this._renderVersion || !this._active) return; this.listError = true; this.message(error.message || 'Saved quizzes could not be loaded. Please retry.', 'error'); }
    finally { if (version === this._renderVersion) { this.loadingSaved = false; this.finishProcess(); this.paint(); } }
  }

  savedMarkup() {
    const e = value => this.escape(value), term = String(this.savedSearch || '').toLocaleLowerCase().trim();
    const quizzes = this.quizzes.filter(quiz => !term || [quiz.title,quiz.source?.fileName,quiz.source?.text].some(value => String(value || '').toLocaleLowerCase().includes(term)));
    const pages = Math.max(1, Math.ceil(quizzes.length / 12)); this.savedPage = Math.min(this.savedPage || 0, pages - 1);
    return `<section class="glass-panel qz-panel"><div class="qz-library-heading"><div><h2>Saved quizzes</h2><p>${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'} on this device</p></div><label class="qz-search"><span class="qz-sr-only">Search saved quizzes</span><input type="search" id="quiz-saved-search" placeholder="Search title or PDF…" value="${e(this.savedSearch || '')}"></label></div>
      ${this.loadingSaved || this.listError ? '' : `<div class="qz-saved-grid">${quizzes.slice(this.savedPage * 12, this.savedPage * 12 + 12).map(quiz => `<article class="qz-saved-card"><span class="badge badge-primary">${e(quiz.difficulty || 'MEDIUM')}</span><h3>${e(quiz.title || 'PDF Quiz')}</h3><p>${e(this.sourceText(quiz))}</p><p class="qz-hint">${quiz.questions.length} questions · ${e(this.dateText(quiz.createdAt))}</p><div class="qz-actions"><button class="btn btn-primary btn-sm" data-action="open" data-id="${Number(quiz.id)}">Open quiz</button><button class="btn btn-secondary btn-sm" data-action="configure" data-id="${Number(quiz.id)}">Controls / New attempt</button><button class="btn btn-secondary btn-sm" data-action="history" data-id="${Number(quiz.id)}">Attempts</button><button class="btn btn-ghost btn-sm qz-delete" data-action="delete" data-id="${Number(quiz.id)}" aria-label="Delete ${e(quiz.title || 'quiz')}">Delete</button></div>${this.historyId === quiz.id ? this.historyMarkup() : ''}</article>`).join('') || '<div class="qz-empty"><i data-lucide="file-question" aria-hidden="true"></i><h3>No saved quizzes yet</h3><p>Choose a PDF and create your first quiz, or change your search.</p><button class="btn btn-primary" data-action="create">Create quiz</button></div>'}</div>`}
      ${!this.loadingSaved && pages > 1 ? `<div class="qz-pagination"><button class="btn btn-secondary btn-sm" data-action="saved-prev" ${this.savedPage === 0 ? 'disabled' : ''}>Previous</button><span>${this.savedPage + 1} / ${pages}</span><button class="btn btn-secondary btn-sm" data-action="saved-next" ${this.savedPage >= pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}
    </section>`;
  }

  async showHistory(id) {
    const version = ++this._renderVersion; this.historyId = id; this.history = null; this.historyLoading = true; this._historyLoadingVersion = version; this.beginProcess('history','Reading previous attempts and their scores…'); this.paint();
    try { const attempts = await this.store.listAttempts(id); if (version !== this._renderVersion || !this._active || this.historyId !== id) return; this.history = attempts; this.recordProgress({stage:'complete',message:`${attempts.length} saved attempts loaded.`}); }
    catch (error) { if (version !== this._renderVersion || !this._active) return; this.history = []; this.message(error.message || 'Attempts could not be loaded.', 'error'); }
    finally {
      if (this._historyLoadingVersion === version) {
        this.historyLoading = false; this._historyLoadingVersion = null;
        // A stale read can release its own flag without stopping a newer task.
        if (this.processKind === 'history') this.finishProcess();
        if (version === this._renderVersion) this.paint();
        else if (this._active) this.refreshProcessing();
      }
    }
  }
  historyMarkup() { return `<div class="qz-history" aria-label="Quiz attempts">${this.history === null ? '<p role="status">Loading attempts…</p>' : this.history?.length ? `<ol>${this.history.slice(0,20).map(attempt => `<li><strong>${Number(attempt.correct ?? attempt.score)}/${Number(attempt.totalQuestions)} · ${Number(attempt.percentage)}% · ${this.escape(attempt.mode || 'PRACTICE')}</strong><span>${this.escape(this.dateText(attempt.completedAt))}</span><button class="btn btn-secondary btn-sm" data-action="view-attempt" data-id="${Number(this.historyId)}" data-attempt="${Number(attempt.id)}">Review this attempt</button></li>`).join('')}</ol>${this.history.length > 20 ? '<p class="qz-hint">Showing your 20 most recent attempts.</p>' : ''}` : '<p>No completed attempts yet.</p>'}</div>`; }

  async deleteQuiz(id) {
    if (this.isBusy() || !Number.isSafeInteger(id) || !window.confirm('Delete this saved quiz and its attempts from this device?')) return;
    this.saving = true; this.beginProcess('delete','Removing the selected quiz and its saved attempts…',{stage:'saving'}); this.paint();
    try { await this.store.remove(id); this.removeDraft(id); if (this.currentQuiz?.id === id) { this.currentQuiz = null; this.answers = []; } this.quizzes = this.quizzes.filter(quiz => quiz.id !== id); this.message('Quiz deleted.', 'success'); }
    catch (error) { this.message(error.message || 'This quiz could not be deleted. Please retry.', 'error'); }
    finally { this.saving = false; this.finishProcess(); this.paint(); }
  }

  async openQuiz(id, autoResume = false, configure = false) {
    if (this.isBusy() || !Number.isSafeInteger(id) || id < 1) return;
    if (!autoResume && !this.canReplaceDraft(id)) return;
    this.historyLoading = false; this._historyLoadingVersion = null;
    if (this.processKind === 'history') this.finishProcess();
    this.persistDraft();
    const version = ++this._renderVersion;
    try {
      const quiz = await this.store.get(id);
      if (version !== this._renderVersion || !this._active) return;
      if (!quiz) { if (autoResume) this.removeDraft(id); throw new Error('This quiz is no longer saved on this device.'); }
      this.sessionSettings = this.defaultsForQuiz(quiz);
      if (configure) {
        this.stopAttemptTimer(); this.currentQuiz = quiz; this.mode = 'setup'; this.message('Choose your controls, then start a new attempt.'); this.paint(); this.scrollTo('.qz-session-settings','start'); return;
      }
      this.startQuiz(quiz, true); this.message(this.resultUnsaved ? 'Your completed result is restored. Retry saving it to keep it in your attempt history.' : this.resumed ? 'Your unfinished answers have been restored.' : 'Choose an answer for each question, then submit your quiz.'); this.paint(); this.tickAttemptTimer(); this.scrollTo(this.mode === 'result' ? '.qz-result' : '.qz-attempt', 'start');
    } catch (error) { if (version !== this._renderVersion || !this._active) return; this.message(error.message || 'This quiz could not be opened.', 'error'); this.paint(); }
  }

  setupMarkup() {
    const e = value => this.escape(value), quiz = this.currentQuiz, draft = this.readDraft(quiz?.id);
    return `<section class="glass-panel qz-panel"><h1>${e(quiz?.title)}</h1><p>${quiz?.questions.length || 0} questions · ${e(this.sourceText(quiz || {}))}</p>${this.sessionSettingsMarkup()}<div class="qz-actions"><button class="btn btn-primary" data-action="start-attempt">Start new attempt</button>${draft ? '<button class="btn btn-secondary" data-action="resume-attempt">Resume saved attempt</button>' : ''}<button class="btn btn-secondary" data-action="saved">Back to quizzes</button><button class="btn btn-secondary" data-action="print-quiz">Print questions / Save PDF</button></div></section>`;
  }

  startConfiguredAttempt(restore = false) {
    const error = this.validateSessionSettings(); if (error) { this.message(error,'error'); this.paint(); return; }
    const quiz = this.currentQuiz;
    if (!quiz || !this.canReplaceDraft(quiz.id)) return;
    if (!restore && this.readDraft(quiz.id) && !window.confirm('Start fresh and replace this quiz’s unfinished attempt?')) return;
    if (!restore) this.removeDraft(quiz.id);
    this.startQuiz(quiz,restore); this.message(restore ? 'Saved attempt resumed.' : 'Your new attempt is ready.'); this.paint(); this.tickAttemptTimer(); this.scrollTo('.qz-attempt','start');
  }

  currentQuestionIndex() { return this.questionOrder?.[this.questionIndex] ?? this.questionIndex; }
  activeIndices() { return this.questionOrder?.length ? [...this.questionOrder] : (this.currentQuiz?.questions || []).map((_,index)=>index); }
  shuffle(items) { return window.QuizTools?.shuffle ? window.QuizTools.shuffle(items) : [...items]; }

  startQuiz(quiz, restore, indices = null) {
    this.stopAttemptTimer();
    this.currentQuiz = quiz; this.mode = 'attempt'; this.result = null; this.resultUnsaved = false; this.resumed = false;
    this.viewingHistory = false; this.reviewFilter = 'ALL'; this.comparisonAttempts = []; this.comparisonError = false; this.parentAttemptId = null;
    this.attemptSettings = {...this.sessionSettings};
    this.answers = quiz.questions.map(() => null); this.questionIndex = 0; this.attemptStartedAt = Date.now();
    this.checked = quiz.questions.map(()=>false); this.confidence = quiz.questions.map(()=>null); this.marked = [];
    this.questionOrder = indices ? [...indices] : quiz.questions.map((_,index)=>index);
    if (this.attemptSettings.shuffleQuestions) this.questionOrder = this.shuffle(this.questionOrder);
    const dependentOptions = question => /\b(?:both|only|either|neither|options?)\s+[ABCD]\b|\b[ABCD]\s+(?:and|or|&)\s+[ABCD]\b|\b(?:all|none)\s+of\s+the\s+(?:above|below)\b|उपरोक्त|उपर्युक्त|[ABCD]\s*(?:और|या)\s*[ABCD]/iu.test(question.options.join(' '));
    this.optionOrder = quiz.questions.map(q=>this.attemptSettings.shuffleOptions && !dependentOptions(q) ? this.shuffle([0,1,2,3]) : [0,1,2,3]);
    this.attemptKey = window.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.attemptDeadline = this.attemptSettings.mode === 'EXAM' && this.attemptSettings.durationMinutes > 0 ? this.attemptStartedAt + this.attemptSettings.durationMinutes * 60000 : null;
    const draft = restore ? this.readDraft(quiz.id) : null;
    if (draft?.quizId === quiz.id && Array.isArray(draft.answers) && draft.answers.length === quiz.questions.length) {
      this.answers = draft.answers.map(value => Number.isInteger(value) && value >= 0 && value < 4 ? value : null);
      if (Array.isArray(draft.questionOrder) && draft.questionOrder.length && new Set(draft.questionOrder).size === draft.questionOrder.length && draft.questionOrder.every(i=>Number.isInteger(i) && i >= 0 && i < quiz.questions.length)) this.questionOrder = [...draft.questionOrder];
      if (Array.isArray(draft.optionOrder) && draft.optionOrder.length === quiz.questions.length && draft.optionOrder.every(o=>Array.isArray(o) && o.length === 4 && new Set(o).size === 4 && o.every(i=>Number.isInteger(i) && i >= 0 && i < 4))) this.optionOrder = draft.optionOrder.map(o=>[...o]);
      this.questionIndex = Math.min(this.questionOrder.length - 1, Math.max(0, Number(draft.index) || 0));
      this.attemptStartedAt = Math.min(Date.now(), Number(draft.startedAt) || Date.now()); this.resumed = true;
      if (draft.settings) this.attemptSettings = {...this.attemptSettings,...draft.settings};
      this.attemptDeadline = this.attemptSettings.mode === 'EXAM' && this.attemptSettings.durationMinutes > 0 ? Number(draft.deadline) || this.attemptStartedAt + this.attemptSettings.durationMinutes * 60000 : null;
      this.checked = this.checked.map((_,i)=>this.attemptSettings.mode !== 'EXAM' && this.answers[i] !== null); this.confidence = this.confidence.map((_,i)=>['LOW','MEDIUM','HIGH'].includes(draft.confidence?.[i]) ? draft.confidence[i] : null);
      this.marked = Array.isArray(draft.marked) ? draft.marked.filter(i=>this.questionOrder.includes(i)) : []; this.attemptKey = draft.attemptKey || this.attemptKey;
      this.parentAttemptId = draft.parentAttemptId || null;
      if (draft.submitted && Number.isFinite(Date.parse(draft.completedAt))) {
        this.result = this.scoreAttempt(this.answers, draft.completedAt, draft.durationSeconds); this.result.expired = Boolean(draft.expired);
        this.resultUnsaved = true; this.mode = 'result';
      }
    }
    this.persistDraft();
    if (this.mode === 'attempt') this.startAttemptTimer();
  }

  attemptMarkup() {
    const quiz = this.currentQuiz, actual = this.currentQuestionIndex(), question = quiz?.questions?.[actual];
    if (!question) return '<p>No quiz is open. Choose a PDF or open a saved quiz.</p>';
    const e = value => this.escape(value), order = this.activeIndices(), answered = order.filter(i=>this.answers[i] !== null).length, selected = this.answers[actual], exam = this.attemptSettings?.mode === 'EXAM', revealed = !exam && Boolean(this.checked[actual]);
    return `<section class="glass-panel qz-panel qz-attempt" aria-labelledby="quiz-attempt-title">
      <div class="qz-attempt-header"><div><span class="badge badge-primary">${exam ? 'EXAM' : 'PRACTICE'} · ${e(question.difficulty || quiz.difficulty)}</span><h1 id="quiz-attempt-title">${e(quiz.title)}</h1><p>${e(this.sourceText(quiz))}</p></div><div><strong id="quiz-answered-count">${answered} / ${order.length} answered</strong>${this.attemptDeadline ? `<div class="qz-timer" id="quiz-attempt-timer" role="timer" aria-label="Time remaining">${this.remainingTimeText()}</div>` : '<span class="qz-hint">Untimed</span>'}</div></div>
      <p class="qz-session-summary">+${Number(this.attemptSettings.marksPerQuestion)} correct · −${Number(this.attemptSettings.negativeMarks)} wrong · ${this.marked.length} marked for review</p>
      <progress class="qz-answer-progress" value="${answered}" max="${order.length}" aria-label="Questions answered"></progress>
      <details class="qz-palette" ${order.length <= 20 ? 'open' : ''}><summary>Question palette · ${order.length - answered} unanswered · ${this.marked.length} marked</summary><nav class="qz-question-nav" aria-label="Quiz questions">${order.map((item,index) => `<button class="qz-question-number ${this.questionIndex === index ? 'current' : ''} ${this.answers[item] !== null ? 'answered' : ''} ${this.marked.includes(item) ? 'marked' : ''}" data-action="question" data-index="${index}" ${this.questionIndex === index ? 'aria-current="step"' : ''} aria-label="Question ${index + 1}${this.answers[item] !== null ? ', answered' : ', unanswered'}${this.marked.includes(item) ? ', marked for review' : ''}" ${this.saving ? 'disabled' : ''}>${index + 1}</button>`).join('')}</nav></details>
      <div class="qz-question" aria-labelledby="quiz-question-heading"><p class="qz-overline">Question ${this.questionIndex + 1} of ${order.length}${question.sourcePage ? ` · PDF page ${Number(question.sourcePage)}` : ''}${question.topic ? ` · ${e(question.topic)}` : ''}</p><h2 id="quiz-question-heading" tabindex="-1">${e(question.question)}</h2>
      <div class="qz-actions">${this.saveButtonMarkup(question, actual)}<button class="btn btn-secondary btn-sm" data-action="mark-review" aria-pressed="${this.marked.includes(actual)}">${this.marked.includes(actual) ? 'Unmark review' : 'Mark for review'}</button></div>
      ${this.optionsMarkup(question, selected, 'answer', '')}
      ${exam ? `<div class="qz-actions"><button class="btn btn-secondary btn-sm" data-action="clear-answer" ${selected === null ? 'disabled' : ''}>Clear selection</button></div>` : ''}
      ${revealed ? this.feedbackMarkup(question, selected) : `<p class="qz-hint">${exam ? 'You can change your answer until submission. Solutions stay hidden.' : 'Select an option to see the answer and explanation immediately.'}</p>`}
      <div class="qz-confidence" role="group" aria-label="Confidence rating"><span>Confidence</span>${[['LOW','Guessing'],['MEDIUM','Somewhat sure'],['HIGH','Sure']].map(([value,label])=>`<button class="btn btn-secondary btn-sm" data-action="confidence" data-value="${value}" aria-pressed="${this.confidence[actual] === value}">${label}</button>`).join('')}</div></div>
      <details class="qz-unanswered"><summary>Unanswered summary (${order.length - answered})</summary><div class="qz-actions">${order.map((item,index)=>this.answers[item] === null ? `<button class="btn btn-secondary btn-sm" data-action="question" data-index="${index}">Question ${index + 1}</button>` : '').join('') || '<p>All questions answered.</p>'}</div></details>
      <div class="qz-attempt-footer"><div class="qz-actions"><button class="btn btn-secondary" data-action="prev" ${this.questionIndex === 0 || this.saving ? 'disabled' : ''}>Previous</button><button class="btn btn-secondary" data-action="next" ${this.questionIndex === order.length - 1 || this.saving ? 'disabled' : ''}>Next</button></div><button class="btn btn-primary" data-action="submit" id="quiz-submit" ${this.saving ? 'disabled' : ''}>${this.saving ? 'Saving result…' : 'Submit quiz'}</button></div>${this.autosaveFailed ? '' : '<p class="qz-hint">Progress saved on this device.</p>'}
    </section>`;
  }

  answer(index) {
    const actual = this.currentQuestionIndex(), exam = this.attemptSettings?.mode === 'EXAM';
    if (this.mode !== 'attempt' || this.saving || (!exam && this.checked[actual]) || !Number.isInteger(index) || index < 0 || index > 3) return;
    if (this.attemptDeadline && Date.now() >= this.attemptDeadline) { this.tickAttemptTimer(); return; }
    this.answers[actual] = index;
    if (!exam) { this.checkAnswer(); return; }
    this.persistDraft(); this.paint(); this.container.querySelector(`[data-action="answer"][data-index="${index}"]`)?.focus({preventScroll:true});
  }
  checkAnswer() { const actual = this.currentQuestionIndex(); if (this.mode !== 'attempt' || this.saving || this.attemptSettings.mode === 'EXAM' || this.answers[actual] === null) return; this.checked[actual] = true; this.persistDraft(); this.paint(); this.container.querySelector('.qz-feedback')?.focus({preventScroll:true}); this.scrollTo('.qz-feedback','nearest'); }
  toggleMark() { const actual = this.currentQuestionIndex(); if (this.mode !== 'attempt') return; this.marked = this.marked.includes(actual) ? this.marked.filter(i=>i !== actual) : [...this.marked,actual]; this.persistDraft(); this.paint(); this.container.querySelector('[data-action="mark-review"]')?.focus({preventScroll:true}); }
  setConfidence(value) { if (this.mode !== 'attempt' || !['LOW','MEDIUM','HIGH'].includes(value)) return; this.confidence[this.currentQuestionIndex()] = value; this.persistDraft(); this.paint(); this.container.querySelector(`[data-action="confidence"][data-value="${value}"]`)?.focus({preventScroll:true}); }

  remainingTimeText() { const seconds = Math.max(0,Math.ceil((this.attemptDeadline - Date.now()) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} remaining`; }
  stopAttemptTimer() { clearInterval(this._attemptTimer); this._attemptTimer = null; }
  startAttemptTimer() { this.stopAttemptTimer(); if (this.mode !== 'attempt') return; this._attemptTimer = setInterval(()=>this.tickAttemptTimer(),1000); }
  tickAttemptTimer() {
    if (this.mode !== 'attempt' || !this.attemptDeadline) return;
    const node = this.container?.querySelector('#quiz-attempt-timer');
    if (node) { node.textContent = this.remainingTimeText(); node.classList.toggle('is-warning',this.attemptDeadline - Date.now() <= 60000); }
    if (Date.now() >= this.attemptDeadline) { this.stopAttemptTimer(); this.submitAttempt(true).catch(error=>{ this.message(error.message,'error'); this.paint(); }); }
  }

  /* ---- Instant feedback & saved questions (stored in localStorage) ---- */
  optionsMarkup(question, selected, action, key) {
    const e = value => this.escape(value), locked = action === 'answer' ? this.attemptSettings.mode !== 'EXAM' && Boolean(this.checked[this.currentQuestionIndex()]) : selected !== null && selected !== undefined;
    const order = action === 'answer' ? this.optionOrder[this.currentQuestionIndex()] || [0,1,2,3] : [0,1,2,3];
    return `<div class="qz-answer-options" role="group" aria-label="Answer options">${order.map((index,position) => {
      const state = !locked ? '' : index === question.answerIndex ? 'qz-correct' : index === selected ? 'qz-wrong' : 'qz-dim';
      return `<button class="qz-answer ${selected === index ? 'selected' : ''} ${state}" data-action="${action}" data-index="${index}" ${key ? `data-key="${e(key)}"` : ''} aria-pressed="${selected === index}" ${locked || this.saving ? 'disabled' : ''}><span class="qz-option-letter" aria-hidden="true">${'ABCD'[position]}</span><span>${e(question.options[index])}</span>${locked && index === question.answerIndex ? '<i data-lucide="check" aria-hidden="true"></i>' : locked && index === selected ? '<i data-lucide="x" aria-hidden="true"></i>' : ''}</button>`;
    }).join('')}</div>`;
  }
  feedbackMarkup(question, selected) {
    const correct = selected === question.answerIndex;
    const order = this.mode === 'attempt' ? this.optionOrder[this.currentQuestionIndex()] || [0,1,2,3] : [0,1,2,3];
    return `<div class="qz-feedback ${correct ? 'qz-feedback-correct' : 'qz-feedback-wrong'}" tabindex="-1" role="status"><strong>${correct ? '✓ Correct!' : `✗ Incorrect — correct answer: ${'ABCD'[order.indexOf(question.answerIndex)]}`}</strong>${question.explanation ? `<p>${this.escape(question.explanation)}</p>` : ''}${question.optionExplanations?.length === 4 ? `<details><summary>Why the other options are wrong</summary>${order.map((i,n)=>`<p class="qz-option-reason"><strong>${'ABCD'[n]}.</strong> ${this.escape(question.optionExplanations[i])}</p>`).join('')}</details>` : ''}</div>`;
  }
  questionKey(question) {
    const text = JSON.stringify([question?.question, question?.options]); let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    return `q${hash.toString(36)}${text.length.toString(36)}`;
  }
  readSavedQuestions() {
    try { const list = JSON.parse(localStorage.getItem(this.savedQuestionsKey) || '[]');
      return Array.isArray(list) ? list.filter(item => item && typeof item.question === 'string' && Array.isArray(item.options) && Number.isInteger(item.answerIndex)) : [];
    } catch { return []; }
  }
  writeSavedQuestions(list) {
    try { localStorage.setItem(this.savedQuestionsKey, JSON.stringify(list)); return true; }
    catch { this.message('This question could not be saved. Browser storage may be full or disabled.', 'error'); return false; }
  }
  isQuestionSaved(question) { const key = this.questionKey(question); return this.readSavedQuestions().some(item => item.key === key); }
  saveButtonMarkup(question, index) {
    const saved = this.isQuestionSaved(question);
    return `<button class="btn ${saved ? 'btn-primary' : 'btn-secondary'} btn-sm qz-save-question" data-action="save-question" data-index="${index}" aria-pressed="${saved}"><i data-lucide="${saved ? 'bookmark-check' : 'bookmark-plus'}" aria-hidden="true"></i>${saved ? 'Saved' : 'Save for later'}</button>`;
  }
  toggleSaveQuestion(question, quiz) {
    if (!question) return;
    const key = this.questionKey(question), list = this.readSavedQuestions(), existing = list.findIndex(item => item.key === key);
    if (existing >= 0) { list.splice(existing, 1); if (this.writeSavedQuestions(list)) this.message('Question removed from Saved questions.'); }
    else {
      list.unshift({ key, question:question.question, options:[...question.options], answerIndex:question.answerIndex, explanation:question.explanation || '', ...(question.optionExplanations ? {optionExplanations:[...question.optionExplanations]} : {}), sourcePage:question.sourcePage || null, quizTitle:quiz?.title || '', savedAt:new Date().toISOString() });
      if (this.writeSavedQuestions(list)) this.message('Question saved. Find it under Saved questions.', 'success');
    }
    this.paint();
    const index = this.currentQuiz?.questions.indexOf(question); this.container.querySelector(`[data-action="save-question"][data-index="${index}"]`)?.focus({preventScroll:true});
  }
  removeSavedQuestion(key) {
    const list = this.readSavedQuestions().filter(item => item.key !== key);
    if (this.writeSavedQuestions(list)) { delete this.savedQuestionAnswers[key]; this.message('Question removed from Saved questions.'); }
    this.paint();
  }
  answerSavedQuestion(key, index) {
    if (!key || !Number.isInteger(index) || index < 0 || index > 3 || this.savedQuestionAnswers[key] !== undefined) return;
    this.savedQuestionAnswers[key] = index; this.paint();
    this.container.querySelector(`[data-key="${key}"]`)?.closest('article')?.querySelector('.qz-feedback')?.focus({preventScroll:true});
  }
  showSavedQuestions() { if (this.isBusy()) return; ++this._renderVersion; this.persistDraft(); this.stopAttemptTimer(); this.mode = 'questions'; this.message(''); this.paint(); }
  savedQuestionsMarkup() {
    const e = value => this.escape(value), list = this.readSavedQuestions();
    return `<section class="glass-panel qz-panel" aria-labelledby="quiz-saved-questions-heading"><div class="qz-library-heading"><div><h2 id="quiz-saved-questions-heading">Saved questions</h2><p>${list.length} ${list.length === 1 ? 'question' : 'questions'} saved to attempt later on this device</p></div></div>
      ${list.length ? `<div class="qz-saved-questions">${list.map((item, n) => {
        const selected = this.savedQuestionAnswers[item.key];
        return `<article class="qz-saved-question"><div class="qz-saved-question-head"><p class="qz-overline">Question ${n + 1}${item.quizTitle ? ` · ${e(item.quizTitle)}` : ''}${item.sourcePage ? ` · PDF page ${Number(item.sourcePage)}` : ''}</p><button class="btn btn-ghost btn-sm qz-delete" data-action="unsave-question" data-key="${e(item.key)}">Remove</button></div><h3>${e(item.question)}</h3>
          ${this.optionsMarkup(item, selected === undefined ? null : selected, 'sq-answer', item.key)}
          ${selected !== undefined ? `${this.feedbackMarkup(item, selected)}<button class="btn btn-secondary btn-sm" data-action="sq-reset" data-key="${e(item.key)}">Try again</button>` : ''}</article>`;
      }).join('')}</div>` : '<div class="qz-empty"><i data-lucide="bookmark" aria-hidden="true"></i><h3>No saved questions yet</h3><p>While practising a quiz, tap “Save for later” on any question to keep it here.</p></div>'}
    </section>`;
  }
  clearAnswer() { const actual = this.currentQuestionIndex(); if (this.mode !== 'attempt' || this.saving || (this.attemptSettings.mode !== 'EXAM' && this.checked[actual])) return; this.answers[actual] = null; this.persistDraft(); this.paint(); this.container.querySelector('[data-action="answer"]')?.focus({preventScroll:true}); }
  goToQuestion(index) { if (this.mode !== 'attempt' || this.saving || !Number.isInteger(index) || index < 0 || index >= this.activeIndices().length) return; this.questionIndex = index; this.persistDraft(); this.paint(); this.container.querySelector('#quiz-question-heading')?.focus({ preventScroll:true }); this.scrollTo('#quiz-question-heading','nearest'); }

  async submitAttempt(expired = false) {
    if (this.mode !== 'attempt' || this.saving || !this.currentQuiz) return;
    expired ||= Boolean(this.attemptDeadline && Date.now() >= this.attemptDeadline);
    const skipped = this.activeIndices().filter(i => this.answers[i] === null).length;
    if (!expired && skipped && !window.confirm(`${skipped} ${skipped === 1 ? 'question is' : 'questions are'} unanswered; ${this.marked.length} marked for review. Submit and count unanswered questions as skipped?`)) return;
    const submittedAt = Date.now();
    expired ||= Boolean(this.attemptDeadline && submittedAt >= this.attemptDeadline);
    this.stopAttemptTimer();
    const completedAt = expired && this.attemptDeadline ? this.attemptDeadline : submittedAt;
    this.result = this.scoreAttempt([...this.answers], new Date(completedAt).toISOString(), Math.max(0, Math.floor((completedAt - this.attemptStartedAt) / 1000)));
    this.result.expired = expired; this.resultUnsaved = true; this.mode = 'result'; this.persistDraft();
    await this.savePendingAttempt();
  }

  scoreAttempt(answers, completedAt, durationSeconds) {
    const quiz = this.currentQuiz, indices = this.activeIndices(), settings = {...this.attemptSettings}, skipped = indices.filter(i=>answers[i] === null).length;
    const correct = indices.filter(i=>quiz.questions[i].answerIndex === answers[i]).length, incorrect = indices.length - correct - skipped, score = Number((correct * Number(settings.marksPerQuestion) - incorrect * Number(settings.negativeMarks)).toFixed(4)), maxMarks = indices.length * Number(settings.marksPerQuestion);
    return { answers:[...answers], correct, score, maxMarks, marksPercentage:Math.round(score / maxMarks * 100), incorrect, skipped, totalQuestions:indices.length,
      questionIndices:indices,questionOrder:indices,optionOrder:this.optionOrder.map(o=>[...o]),confidence:[...this.confidence],marked:[...this.marked],mode:settings.mode,settings,attemptKey:this.attemptKey,...(this.parentAttemptId ? {parentAttemptId:this.parentAttemptId} : {}),
      percentage:Math.round(correct / indices.length * 100), completedAt, durationSeconds:Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0 };
  }

  async savePendingAttempt() {
    if (this.mode !== 'result' || !this.resultUnsaved || !this.result || this.saving || !this.currentQuiz) return;
    const quiz = this.currentQuiz, result = this.result; this.saving = true; this.beginProcess('attempt','Saving your result and attempt history…',{stage:'saving'}); this.paint();
    try {
      const saved = await this.store.saveAttempt(quiz.id, result);
      if (this.currentQuiz !== quiz || this.result !== result) return;
      this.result = saved; this.resultUnsaved = false; this.removeDraft(quiz.id); this.message(result.expired ? 'Time is up. Your exam was submitted and saved.' : 'Your result has been saved on this device.', 'success'); this.loadComparison();
    } catch (error) {
      if (this.currentQuiz !== quiz || this.result !== result) return;
      this.persistDraft(); this.message(`Your result is kept below. Saving failed: ${error.message || 'Browser storage is unavailable.'} Retry saving your result when storage is available.`, 'error');
    } finally { this.saving = false; this.finishProcess(); this.paint(); }
  }

  resultMarkup() {
    const quiz = this.currentQuiz, result = this.result;
    if (!quiz || !result) return '<p>No result is available yet.</p>';
    const e = value => this.escape(value), indices = this.reviewIndices(), total = result.totalQuestions || quiz.questions.length;
    return `<section class="glass-panel qz-panel qz-result" aria-labelledby="quiz-result-title"><span class="badge badge-primary">${this.viewingHistory ? 'Saved attempt' : 'Quiz complete'} · ${e(result.mode || 'PRACTICE')}</span><h1 id="quiz-result-title">${e(quiz.title)}</h1><p>${e(this.sourceText(quiz))}</p><div class="qz-result-stats" id="quiz-result-stats"><div><strong>${Number(result.correct ?? result.score)} / ${total}</strong><span>Correct · ${Number(result.percentage)}%</span></div><div><strong>${Number(result.score)} / ${Number(result.maxMarks ?? total)}</strong><span>Marks after penalties</span></div><div><strong>${Number(result.incorrect)}</strong><span>Incorrect</span></div><div><strong>${Number(result.skipped)}</strong><span>Skipped</span></div></div><p class="qz-hint">Elapsed: ${Math.floor(Number(result.durationSeconds || 0) / 60)}m ${Number(result.durationSeconds || 0) % 60}s · ${result.marked?.length || 0} marked · Confidence saved with this attempt.</p><div class="qz-actions"><button class="btn ${this.resultUnsaved ? 'btn-secondary' : 'btn-primary'}" data-action="retake" ${this.saving ? 'disabled' : ''}>Retake quiz</button><button class="btn btn-secondary" data-action="configure" data-id="${Number(quiz.id)}" ${this.saving ? 'disabled' : ''}>Change controls</button><button class="btn btn-secondary" data-action="retry-wrong" ${!result.incorrect || this.saving ? 'disabled' : ''}>Retry wrong only</button><button class="btn btn-secondary" data-action="retry-skipped" ${!result.skipped || this.saving ? 'disabled' : ''}>Retry skipped</button><button class="btn btn-secondary" data-action="print-quiz">Print review / Save PDF</button><button class="btn btn-secondary" data-action="saved" ${this.saving ? 'disabled' : ''}>Saved quizzes</button></div></section>
      ${this.comparisonMarkup()}
      <section class="qz-review" aria-labelledby="quiz-review-heading"><div class="qz-review-toolbar"><h2 id="quiz-review-heading">Answers and explanations</h2><label for="quiz-review-filter">Show<select id="quiz-review-filter">${[['ALL','All questions'],['WRONG','Wrong only'],['SKIPPED','Skipped'],['CORRECT','Correct'],['MARKED','Marked for review'],['LOW','Low confidence']].map(([value,label])=>`<option value="${value}" ${this.reviewFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="btn btn-secondary" data-action="convert-flashcards" ${!indices.length || this.converting ? 'disabled' : ''}>${this.converting ? 'Creating flashcards…' : `Convert shown questions to flashcards (${indices.length})`}</button></div>${indices.map(index => {
        const question = quiz.questions[index], order = result.optionOrder?.[index] || [0,1,2,3];
        const chosen = result.answers[index], correct = chosen === question.answerIndex;
        return `<article class="glass-panel qz-panel qz-review-question"><p class="qz-overline">Question ${(result.questionOrder || result.questionIndices || quiz.questions.map((_,n)=>n)).indexOf(index) + 1} · ${chosen === null ? 'Skipped' : correct ? 'Correct' : 'Incorrect'}${question.sourcePage ? ` · PDF page ${Number(question.sourcePage)}` : ''} · Confidence: ${e(result.confidence?.[index] || 'Not rated')}</p><h3>${e(question.question)}</h3><ol class="qz-review-options">${order.map((optionIndex,position) => `<li class="${optionIndex === question.answerIndex ? 'correct' : chosen === optionIndex ? 'incorrect' : ''}"><span class="qz-option-letter">${'ABCD'[position]}</span><span>${e(question.options[optionIndex])}</span>${optionIndex === question.answerIndex ? '<strong>Correct answer</strong>' : chosen === optionIndex ? '<strong>Your answer</strong>' : ''}${question.optionExplanations?.[optionIndex] ? `<p class="qz-option-reason">${e(question.optionExplanations[optionIndex])}</p>` : ''}</li>`).join('')}</ol><div class="qz-explanation"><strong>Explanation</strong><p>${e(question.explanation)}</p></div>${this.saveButtonMarkup(question, index)}</article>`;
      }).join('') || '<p>No questions match this filter.</p>'}</section>`;
  }

  reviewIndices(filter = this.reviewFilter || 'ALL') {
    const result = this.result, quiz = this.currentQuiz;
    if (!result || !quiz) return [];
    const order = result.questionOrder || result.questionIndices || quiz.questions.map((_,i)=>i);
    return order.filter(i=>filter === 'ALL' || filter === 'WRONG' && result.answers[i] !== null && result.answers[i] !== quiz.questions[i].answerIndex || filter === 'SKIPPED' && result.answers[i] === null || filter === 'CORRECT' && result.answers[i] === quiz.questions[i].answerIndex || filter === 'MARKED' && result.marked?.includes(i) || filter === 'LOW' && result.confidence?.[i] === 'LOW');
  }

  retrySubset(filter) {
    if (this.saving || !this.currentQuiz) return;
    const indices = this.reviewIndices(filter); if (!indices.length) return;
    if (this.resultUnsaved && !window.confirm('This result is not yet saved to history. Start revision anyway?')) return;
    const parent = this.result.id, quiz = this.currentQuiz;
    if (this.readDraft(quiz.id) && !this.resultUnsaved && !window.confirm('Replace this quiz’s unfinished attempt with revision practice?')) return;
    this.sessionSettings = {...this.sessionSettings,mode:'PRACTICE',durationMinutes:0,negativeMarks:0};
    this.startQuiz(quiz,false,indices); this.parentAttemptId = parent; this.persistDraft(); this.message(`Revising ${indices.length} ${filter === 'WRONG' ? 'wrong' : 'skipped'} questions. This practice attempt has its own score.`); this.paint(); this.scrollTo('.qz-attempt','start');
  }

  async loadComparison() {
    const quiz = this.currentQuiz, result = this.result;
    if (!quiz || !result) return;
    try { const attempts = await this.store.listAttempts(quiz.id); if (this.currentQuiz !== quiz || this.result !== result || this.mode !== 'result') return; this.comparisonAttempts = attempts; this.comparisonError = false; this.paint(); }
    catch { if (this.currentQuiz === quiz) { this.comparisonError = true; this.message('Attempt comparison could not load. Your result is available below.','error'); this.paint(); } }
  }

  comparisonMarkup() {
    const attempts = this.comparisonAttempts || [], e = value=>this.escape(value);
    if (attempts.length < 2) return '';
    const first = attempts.find(a=>a.id === this.compareFirst) || attempts[1], second = attempts.find(a=>a.id === this.compareSecond) || attempts[0];
    const signature = a => JSON.stringify([a.mode || 'PRACTICE',[...(a.questionIndices || this.currentQuiz.questions.map((_,i)=>i))].sort((a,b)=>a-b),a.settings?.marksPerQuestion || 1,a.settings?.negativeMarks || 0]);
    const comparable = signature(first) === signature(second), delta = Number(second.percentage) - Number(first.percentage);
    const selector = (id,selected,label)=>`<label for="${id}">${label}<select id="${id}">${attempts.map(a=>`<option value="${Number(a.id)}" ${a.id === selected.id ? 'selected' : ''}>${e(this.dateText(a.completedAt))} · ${e(a.mode || 'PRACTICE')} · ${a.percentage}%</option>`).join('')}</select></label>`;
    return `<section class="glass-panel qz-panel qz-comparison"><h2>Compare attempts</h2><div class="qz-fields">${selector('quiz-compare-first',first,'Earlier / first')}${selector('quiz-compare-second',second,'Later / second')}</div><div class="qz-table-wrap"><table><thead><tr><th>Attempt</th><th>Questions</th><th>Correct</th><th>Marks</th><th>Elapsed</th></tr></thead><tbody>${[[first,'First'],[second,'Second']].map(([a,label])=>`<tr><th>${label}</th><td>${Number(a.totalQuestions)}</td><td>${Number(a.percentage)}%</td><td>${Number(a.score)} / ${Number(a.maxMarks ?? a.totalQuestions)}</td><td>${Number(a.durationSeconds || 0)}s</td></tr>`).join('')}</tbody></table></div><p>${comparable ? `Correct-answer rate changed by ${delta > 0 ? '+' : ''}${delta} percentage points.` : 'These attempts use different modes, question sets or marking rules. Compare their details separately.'}</p></section>`;
  }

  async viewAttempt(quizId,attemptId) {
    if (this.isBusy()) return;
    this.persistDraft(); this.stopAttemptTimer(); const version = ++this._renderVersion;
    try { const [quiz,attempts] = await Promise.all([this.store.get(quizId),this.store.listAttempts(quizId)]); if (version !== this._renderVersion || !this._active) return; const result = attempts.find(a=>a.id === attemptId); if (!quiz || !result) throw new Error('This saved attempt is no longer available.'); this.currentQuiz = quiz; this.result = result; this.answers = [...result.answers]; this.mode = 'result'; this.viewingHistory = true; this.resultUnsaved = false; this.reviewFilter = 'ALL'; this.comparisonAttempts = attempts; this.message('Reviewing a completed attempt.'); this.paint(); this.scrollTo('.qz-result','start'); }
    catch(error) { this.message(error.message,'error'); this.paint(); }
  }

  printQuiz() {
    if (!window.QuizTools?.printQuiz || !this.currentQuiz) { this.message('Print support is unavailable. Reload the page.','error'); this.paint(); return; }
    if (!window.QuizTools.printQuiz(this.currentQuiz,this.mode === 'result' ? this.result : null)) { this.message('Allow this site’s print popup, then try Print / Save PDF again.','error'); this.paint(); }
  }

  async convertFlashcards() {
    if (this.converting || !this.currentQuiz) return;
    const quiz = this.currentQuiz, indices = this.reviewIndices(); if (!indices.length) return;
    this.converting = true; this.beginProcess('flashcards',`Preparing flashcards from ${indices.length} reviewed questions…`); this.paint();
    try { const result = await this.store.convertToFlashcards(quiz,indices); if (this.currentQuiz !== quiz) return; this.message(`${result.count} flashcards ${result.reused ? 'already available' : 'created'} in “${result.deck?.title || quiz.title}”. Open the Flashcards tab to revise them.`,'success'); }
    catch(error) { if (this.currentQuiz === quiz) this.message(error.message || 'Flashcards could not be created.','error'); }
    finally { this.converting = false; this.finishProcess(); this.paint(); }
  }

  retake() { if (this.saving || !this.currentQuiz) return; const unsaved = this.resultUnsaved; if (unsaved && !window.confirm('This result has not been saved. Start a new attempt and discard this result?')) return; if (!unsaved && this.readDraft(this.currentQuiz.id) && !window.confirm('Replace this quiz’s unfinished attempt with a fresh attempt?')) return; this.sessionSettings = this.result ? {...this.defaultsForQuiz(this.currentQuiz),...this.result.settings,mode:this.result.mode || 'PRACTICE'} : this.defaultsForQuiz(this.currentQuiz); this.removeDraft(); this.startQuiz(this.currentQuiz, false); this.message(unsaved ? 'A fresh attempt is ready. Your previous result could not be saved.' : 'A fresh attempt is ready. Your earlier result stays in saved attempts.'); this.paint(); this.scrollTo('.qz-attempt','start'); }
  persistDraft() {
    if (!(this.mode === 'attempt' || this.mode === 'result' && this.resultUnsaved) || !Number.isSafeInteger(this.currentQuiz?.id) || this.answers.length > 200) return;
    const draft = {quizId:this.currentQuiz.id,answers:this.answers,index:this.questionIndex,startedAt:this.attemptStartedAt,updatedAt:Date.now(),questionOrder:this.questionOrder,optionOrder:this.optionOrder,checked:this.checked,confidence:this.confidence,marked:this.marked,settings:this.attemptSettings,deadline:this.attemptDeadline,attemptKey:this.attemptKey,parentAttemptId:this.parentAttemptId,...(this.mode === 'result' ? {submitted:true,completedAt:this.result.completedAt,durationSeconds:this.result.durationSeconds,expired:Boolean(this.result.expired)} : {})};
    try { const data = JSON.stringify(draft); localStorage.setItem(`${this.draftsKey}:${this.currentQuiz.id}`,data); localStorage.setItem(this.draftKey,data); this.autosaveFailed = false; }
    catch { this.autosaveFailed = true; }
  }
  readDraft(quizId = null) {
    try {
      const valid = draft => draft && Number.isSafeInteger(draft.quizId) && draft.quizId > 0 && Array.isArray(draft.answers) && draft.answers.length <= 200 && Number.isFinite(draft.updatedAt) && Date.now() - draft.updatedAt <= 7 * 24 * 60 * 60 * 1000;
      if (quizId != null) { const specific = JSON.parse(localStorage.getItem(`${this.draftsKey}:${quizId}`) || 'null'); if (valid(specific) && specific.quizId === quizId) return specific; }
      const legacy = JSON.parse(localStorage.getItem(this.draftKey) || 'null');
      if (valid(legacy) && (quizId == null || legacy.quizId === quizId)) return legacy;
      if (quizId != null) return null;
      return Object.keys(localStorage).filter(key=>key.startsWith(`${this.draftsKey}:`)).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).filter(valid).sort((a,b)=>b.updatedAt-a.updatedAt)[0] || null;
    } catch { return null; }
  }
  removeDraft(quizId = this.currentQuiz?.id) {
    try { if (quizId) localStorage.removeItem(`${this.draftsKey}:${quizId}`); const latest = JSON.parse(localStorage.getItem(this.draftKey) || 'null'); if (!quizId || latest?.quizId === quizId) localStorage.removeItem(this.draftKey); } catch { this.autosaveFailed = true; }
  }
  canReplaceDraft(quizId = null) {
    const draft = this.readDraft();
    return !draft?.submitted || draft.quizId === quizId || window.confirm('Your completed result has not been saved to attempt history. Continue with another quiz? Its recovery copy stays on this device when storage is available.');
  }
  resetData({ clearDrafts = true } = {}) {
    this.cancel(false); this.stopAttemptTimer(); ++this._renderVersion;
    if (clearDrafts) { this.removeDraft(); try { for (const key of Object.keys(localStorage)) if (key.startsWith(`${this.draftsKey}:`)) localStorage.removeItem(key); localStorage.removeItem(this.draftKey); } catch { /* Reset storage failure is reported by the settings action. */ } this.service?.discardDraft?.(); }
    this.currentQuiz = null; this.answers = []; this.questionIndex = 0; this.result = null; this.readyQuiz = null;
    this.quizzes = []; this.history = null; this.historyId = null; this.mode = 'create'; this._resumeChecked = true;
    this.message(''); this.paint();
  }
  onLeaveView() { this.persistDraft(); this.stopAttemptTimer(); this.cancel(false); this.loadingSaved = false; this.historyLoading = false; this._historyLoadingVersion = null; this._active = false; ++this._renderVersion; }
}

window.QuizView = QuizView;
window.quizView = new QuizView();
