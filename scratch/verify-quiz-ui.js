/** Quiz UI cancellation, storage recovery and stale-result regressions. No provider requests. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const processing = view => {
  const panels = view.container.querySelectorAll('#quiz-processing');
  assert.equal(panels.length,1,'The processing box is present exactly once.');
  assert.equal(view.container.querySelector('#quiz-notice'),null,'There is no external notice box.');
  return panels[0];
};
const processingError = (view,pattern) => {
  const panel=processing(view), error=panel.querySelector('#quiz-process-error');
  assert.ok(error,'The error is displayed inside the processing box.');
  assert.match(error.textContent,pattern);
  assert.equal(error.getAttribute('role'),'alert');
  const outside=[...view.container.querySelectorAll('[role="alert"],.qz-notice-error,.qz-ready')].filter(node=>!panel.contains(node));
  assert.equal(outside.length,0,'No error or recovery block is repeated outside the processing box.');
  const remaining=view.container.cloneNode(true);remaining.querySelector('#quiz-processing').remove();
  assert.ok(!remaining.textContent.includes((error.querySelector('p')||error).textContent.trim()),'The failure message is not repeated elsewhere in the view.');
  assert.equal(panel.dataset.state,'error');
  assert.equal(panel.getAttribute('aria-busy'),'false');
  assert.equal(panel.querySelector('.qz-stages .active'),null,'An error does not leave a live processing stage running.');
  return panel;
};
const fixture = () => ({id:1,title:'Source quiz',difficulty:'MEDIUM',language:'AUTO',model:'gemini-2.5-flash',createdAt:new Date().toISOString(),
  source:{fileName:'study.pdf',fromPage:1,toPage:2,pageCount:2}, questions:[0,1].map(index => ({id:`q${index+1}`,question:`Question ${index+1}?`,options:['First','Second','Third','Fourth'],answerIndex:index,explanation:`Supported answer ${index+1}.`,sourcePage:index+1}))});
let passed=0, failed=0;
async function test(name, run) {
  const dom = new JSDOM('<section id="view-quiz"></section>', {url:'http://localhost/#quiz',runScripts:'outside-only'}), w = dom.window;
  const quiz=fixture(), calls={save:0,attempt:0,generate:0};
  w.UIUtils={buildViewHero:()=>'<header>PDF practice</header>'}; w.confirm=()=>true;
  w.app={_isGenerating:false,_id:0,refreshIcons(){},
    beginGeneration(){if(this._isGenerating)return false;this._isGenerating=true;this._id++;this.controller=new w.AbortController();return true;},
    getGenerationContext(){return {jobId:this._id,signal:this.controller.signal};},
    endGeneration(id){if(id===this._id)this._isGenerating=false;}};
  w.quizService={loadPdf:async()=>({fileName:'study.pdf',pageCount:2,fileSizeBytes:1000}),clear(){},
    generate:async()=>{calls.generate++;return {...quiz,id:undefined};}};
  w.quizStore={save:async value=>{calls.save++;return {...value,id:1};},get:async()=>quiz,list:async()=>[quiz],remove:async()=>{},listAttempts:async()=>[],
    saveAttempt:async(id,value)=>{calls.attempt++;return {...value,id:calls.attempt,quizId:id};}};
  w.eval(read('js/sanitizer.js')); w.eval(read('js/views/quiz.js'));
  const view=w.quizView; await view.render(); view.pdf={fileName:'study.pdf',pageCount:2,fileSizeBytes:1000}; view.form.toPage='2'; view.form.count='2';
  try { await run({w,view,quiz,calls}); passed++; console.log('PASS '+name); }
  catch(error) { failed++; console.error('FAIL '+name+': '+error.stack); }
  finally { view.onLeaveView(); w.close(); }
}
(async()=>{
  await test('Processing box stays visible across create, attempt and saved views',async({view,quiz})=>{
    assert.equal(processing(view).dataset.state,'idle');
    view.startQuiz(quiz,false);view.paint();processing(view);
    await view.showSaved();processing(view);
    view.showCreate();processing(view);
  });
  await test('PDF opening uses the processing box and leaves a stopped error there if reading fails',async({w,view})=>{
    const held=deferred();w.quizService.loadPdf=()=>held.promise;
    const pending=view.loadFile(new w.File(['PDF'],'study.pdf',{type:'application/pdf'}));
    const panel=processing(view);assert.equal(panel.dataset.state,'running');assert.equal(panel.getAttribute('aria-busy'),'true');
    assert.match(panel.textContent,/PDF/i);assert.ok(panel.querySelector('[data-action="cancel-read"],[data-action="cancel"]'));
    held.reject(Error('Page extraction failed'));await pending;
    processingError(view,/Page extraction failed/);assert.equal(view.reading,false);
  });
  await test('Cancelled PDF opening cannot install a late PDF or enable generation',async({w,view})=>{
    const held=deferred(); w.quizService.loadPdf=()=>held.promise;
    const pending=view.loadFile(new w.File(['PDF'],'study.pdf',{type:'application/pdf'})); view.cancel();
    held.resolve({fileName:'late.pdf',pageCount:10,fileSizeBytes:1}); await pending;
    assert.equal(view.pdf,null); assert.equal(view.reading,false); assert.equal(view.container.querySelector('#quiz-generate').disabled,true);
  });
  await test('Cancelled AI output never writes a quiz or replaces the form',async({w,view,quiz,calls})=>{
    const held=deferred(); w.quizService.generate=()=>held.promise; const pending=view.generate(); view.cancel(); held.resolve(quiz); await pending;
    assert.equal(calls.save,0); assert.equal(view.mode,'create'); assert.equal(view.pdf.fileName,'study.pdf'); assert.equal(w.app._isGenerating,false);
  });
  await test('Atomic save blocks duplicate retry after cancel and clears ready data on commit',async({w,view,calls})=>{
    const held=deferred(); w.quizStore.save=value=>{calls.save++;return held.promise;}; const pending=view.generate(); await tick();
    assert.equal(view.saving,true); view.cancel(); await view.saveReadyQuiz(); assert.equal(calls.save,1);
    held.resolve({...view.readyQuiz,id:1}); await pending;
    assert.equal(view.saving,false); assert.equal(view.readyQuiz,null); assert.equal(view.mode,'create'); assert.equal(calls.save,1);
  });
  await test('A failed local quiz save preserves questions and retries without AI',async({w,view,calls})=>{
    w.quizStore.save=async()=>{calls.save++;throw Error('Storage full');}; await view.generate();
    assert.equal(view.readyQuiz.questions.length,2); assert.ok(view.container.querySelector('[data-action=retry-save]')); assert.equal(view.busy,false);
    assert.ok(processingError(view,/Storage full|sav/i).querySelector('[data-action=retry-save]'));
    assert.equal(view.container.querySelectorAll('[data-action=retry-save]').length,1);
    w.quizStore.save=async quiz=>{calls.save++;return {...quiz,id:2};}; await view.saveReadyQuiz();
    assert.equal(view.mode,'attempt'); assert.equal(view.currentQuiz.id,2); assert.equal(view.readyQuiz,null); assert.equal(calls.generate,1);
  });
  await test('OCR failures identify their page and keep saved scan text visible for Resume',async({w,view,quiz,calls})=>{
    const draft={source:{type:'PDF',fileName:'study.pdf',fromPage:1,toPage:2,pageCount:2},count:20,difficulty:'MEDIUM',language:'AUTO',questions:[],pendingOcr:{pages:[{pageNumber:1,text:'Readable study facts'}]}};
    w.quizService.getDraft=()=>draft;
    w.quizService.generate=async()=>{calls.generate++;throw Object.assign(Error('Scanned PDF page 2 was unreadable.'),{code:'QUIZ_OCR_UNREADABLE'});};
    await view.generate(true);
    assert.equal(calls.generate,1); assert.equal(calls.save,0);
    assert.match(view.notice,/Scanned PDF page 2 was unreadable/);
    assert.match(view.notice,/0\/20 completed questions are kept/);
    assert.match(view.notice,/1 scanned page is saved and will be reused on Resume/);
    const panel=processingError(view,/Scanned PDF page 2 was unreadable/);
    assert.match(panel.textContent,/0\/20/);assert.match(panel.textContent,/1 scanned page is saved and will be reused on Resume/);
    quiz.source.ocrPages=[1,2]; quiz.source.excerptedPages=[2];
    assert.match(view.sourceText(quiz),/Scanned-page OCR: 2 pages/);
    assert.match(view.sourceText(quiz),/Text excerpts from 1 pages/);
  });
  await test('Late cancelled generation cannot release a newer generation lock',async({w,view,quiz,calls})=>{
    const older=deferred(),newer=deferred(); let call=0; w.quizService.generate=()=>++call===1?older.promise:newer.promise;
    const first=view.generate(); view.cancel(); const second=view.generate(); older.resolve(quiz); await first;
    assert.equal(w.app._isGenerating,true); assert.equal(view.busy,true); assert.equal(calls.save,0);
    newer.resolve(quiz); await second; assert.equal(w.app._isGenerating,false); assert.equal(calls.save,1);
  });
  await test('Progress updates preserve keyboard focus on cancellation',async({w,view,quiz})=>{
    const held=deferred(); let progress; w.quizService.generate=options=>{progress=options.onProgress;return held.promise;}; const pending=view.generate();
    view.container.querySelector('[data-action=cancel]').focus(); progress({stage:'generating',percent:40,completed:0,requested:20,batch:1,totalBatches:1,message:'Creating questions…'});
    assert.equal(w.document.activeElement.dataset.action,'cancel');assert.equal(Number(processing(view).querySelector('#quiz-progress').value),0,'Request activity cannot invent completed questions.');
    view.cancel(); held.resolve(quiz); await pending;
  });
  await test('An unsaved attempt keeps its result and retries without extra AI',async({w,view,quiz,calls})=>{
    view.startQuiz(quiz,false); view.answers=[0,1]; w.quizStore.saveAttempt=async()=>{calls.attempt++;throw Error('Storage full');}; await view.submitAttempt();
    assert.equal(view.mode,'result'); assert.equal(view.result.correct,2); assert.equal(view.resultUnsaved,true); assert.ok(view.container.querySelector('[data-action=retry-attempt]'));
    assert.ok(processingError(view,/Storage full|sav/i).querySelector('[data-action=retry-attempt]'));
    assert.equal(view.container.querySelectorAll('[data-action=retry-attempt]').length,1);
    assert.equal(JSON.parse(w.localStorage.getItem(view.draftKey)).submitted,true);
    w.quizStore.saveAttempt=async(id,value)=>{calls.attempt++;return {...value,id:2,quizId:id};}; await view.savePendingAttempt();
    assert.equal(view.resultUnsaved,false); assert.equal(w.localStorage.getItem(view.draftKey),null); assert.equal(calls.generate,0); assert.equal(calls.attempt,2);
  });
  await test('Reload restores a completed unsaved result without repeating AI or submission',async({w,view,quiz,calls})=>{
    view.startQuiz(quiz,false); view.answers=[0,1]; w.quizStore.saveAttempt=async()=>{throw Error('Storage full');}; await view.submitAttempt();
    view.onLeaveView(); const replacement=new w.QuizView(); await replacement.render();
    assert.equal(replacement.mode,'result'); assert.equal(replacement.result.correct,2); assert.equal(replacement.resultUnsaved,true); assert.equal(calls.generate,0);
    replacement.onLeaveView();
  });
  await test('Declining replacement of an unsaved result spends no AI and keeps recovery',async({w,view,quiz,calls})=>{
    view.startQuiz(quiz,false); view.answers=[0,1]; w.quizStore.saveAttempt=async()=>{throw Error('Storage full');}; await view.submitAttempt();
    view.showCreate(); const recovery=w.localStorage.getItem(view.draftKey); w.confirm=()=>false; await view.generate();
    assert.equal(calls.generate,0); assert.equal(w.localStorage.getItem(view.draftKey),recovery); assert.equal(view.mode,'create');
  });
  await test('Reset during a pending result save cannot resurrect removed quiz state',async({w,view,quiz})=>{
    const held=deferred(); view.startQuiz(quiz,false); view.answers=[0,1]; w.quizStore.saveAttempt=()=>held.promise; const pending=view.submitAttempt();
    view.resetData({clearDrafts:true}); held.resolve({answers:[0,1],correct:2,percentage:100,incorrect:0,skipped:0}); await pending;
    assert.equal(view.currentQuiz,null); assert.equal(view.mode,'create'); assert.equal(view.result,null); assert.equal(w.localStorage.getItem(view.draftKey),null); assert.equal(view.pdf.fileName,'study.pdf');
  });
  await test('AI question text and instant explanations are escaped, with solutions hidden before selection',async({view,quiz})=>{
    quiz.questions[0].question='<img src=x onerror=attack()> Which fact?'; quiz.questions[0].options[0]='<script>attack()</script>';
    quiz.questions[0].explanation='<img src=x onerror=attack()> Supported explanation.';
    view.startQuiz(quiz,false); view.paint(); assert.equal(view.container.querySelector('img,script'),null); assert.ok(view.container.textContent.includes('<img'));
    assert.ok(!view.container.textContent.includes(quiz.questions[0].explanation)); assert.equal(view.container.querySelector('.qz-review-options'),null);
    view.container.querySelector('[data-action=answer][data-index="0"]').click();
    assert.ok(view.container.querySelector('.qz-feedback').textContent.includes(quiz.questions[0].explanation));assert.equal(view.container.querySelector('img,script'),null);
  });
  await test('A restored study-text generation restores its choices and resumes explicitly',async({w,view,quiz,calls})=>{
    const job={id:'paused-job',source:{type:'TEXT',text:'Energy is conserved and work transfers energy.'},count:25,difficulty:'HARD',language:'HINDI',questions:quiz.questions,next:1,tasks:[{count:10},{count:10},{count:5}]};
    w.quizService.getDraft=()=>job;
    const restored=new w.QuizView();await restored.render();
    assert.equal(restored.form.sourceType,'TEXT');assert.equal(restored.form.count,'25');assert.equal(restored.container.querySelector('#quiz-count').matches(':disabled'),true);
    assert.equal(restored.container.querySelector('[data-action=resume-generation]').disabled,false);
    w.quizService.generate=async options=>{calls.generate++;assert.equal(options.resume,true);assert.equal(options.sourceType,'TEXT');assert.equal(options.text,job.source.text);return quiz;};
    await restored.generate(true);assert.equal(calls.generate,1);assert.equal(restored.mode,'attempt');restored.onLeaveView();
  });
  await test('Reloaded PDF drafts show saved scan text reuse before the same PDF is uploaded',async({w,quiz})=>{
    const job={source:{type:'PDF',fileName:'study.pdf',fromPage:1,toPage:2,pageCount:2},count:100,difficulty:'MEDIUM',language:'ENGLISH',questions:quiz.questions,next:4,tasks:Array.from({length:5},()=>({count:20})),pendingOcr:{pages:[{pageNumber:2,text:'Source facts'}]}};
    w.quizService.getDraft=()=>job;
    const restored=new w.QuizView(); await restored.render();
    const draft=restored.container.querySelector('#quiz-generation-draft');
    assert.match(draft.textContent,/Upload the same PDF again to resume/);
    assert.match(draft.textContent,/1 scanned page is saved and will be reused on Resume/);
    assert.equal(processing(restored).dataset.state,'paused');
    assert.equal(draft.querySelector('[data-action=resume-generation]').disabled,true);
    assert.match(restored.container.querySelector('.qz-batch-info').textContent,/1–20 questions use one question batch/);
    assert.match(restored.container.querySelector('.qz-batch-info').textContent,/Large scanned batches may need extra page reading/);
    restored.onLeaveView();
  });
  await test('Completed questions can be practised while the remaining generation stays recoverable',async({w,view,quiz,calls})=>{
    const job={id:'paused-job',title:'Energy',source:{type:'TOPIC',text:'Energy conservation'},count:25,difficulty:'MEDIUM',language:'ENGLISH',model:'gemini-2.5-flash',createdAt:new Date().toISOString(),questions:quiz.questions,next:1,tasks:[{count:10},{count:10},{count:5}]};
    w.quizService.getDraft=()=>job;await view.useCompleted();
    assert.equal(view.mode,'attempt');assert.equal(calls.generate,0);assert.equal(calls.save,1);assert.equal(w.quizService.getDraft(),job);assert.equal(view.currentQuiz.generationId,'paused-job-partial-2');
  });
  await test('Saved-question progress uses completed counts while live OCR and request messages remain truthful',async({w,view,quiz})=>{
    const held=deferred();let progress;w.quizService.generate=options=>{progress=options.onProgress;return held.promise;};const pending=view.generate();
    progress({stage:'generating',percent:99,completed:80,requested:100,batch:5,totalBatches:5,message:'Creating 20 questions · batch 5 of 5…'});
    let panel=processing(view);assert.equal(Number(panel.querySelector('#quiz-progress').value),80);assert.match(panel.textContent,/80\s*\/\s*100/);assert.match(panel.textContent,/batch 5 of 5/i);
    progress({stage:'ocr',percent:99,completed:80,requested:100,batch:5,totalBatches:5,message:'Reading scanned page 19…'});
    panel=processing(view);assert.equal(Number(panel.querySelector('#quiz-progress').value),80);assert.match(panel.textContent,/scanned page 19/);assert.equal(panel.dataset.state,'running');
    view.cancel();held.resolve(quiz);await pending;assert.equal(processing(view).getAttribute('aria-busy'),'false');
  });
  await test('Waiting and pause preserve saved counts while the activity list remains bounded',async({w,view,quiz})=>{
    const held=deferred(),job={source:{type:'PDF',fileName:'study.pdf',fromPage:1,toPage:2,pageCount:2},count:100,difficulty:'MEDIUM',language:'ENGLISH',questions:Array.from({length:80},(_,i)=>({...quiz.questions[i%2],id:`q${i+1}`})),next:4,tasks:Array.from({length:5},()=>({count:20}))};let progress;
    w.quizService.getDraft=()=>job;w.quizService.generate=options=>{progress=options.onProgress;return held.promise;};const pending=view.generate(true);
    for(let i=1;i<=12;i++)progress({stage:'reading',percent:99,completed:80,requested:100,batch:5,totalBatches:5,message:`Reading selected page ${i}…`});
    let panel=processing(view);assert.ok(panel.querySelectorAll('.qz-process-log li').length<=8);assert.ok(!panel.querySelector('.qz-process-log').textContent.includes('selected page 1…'));assert.match(panel.querySelector('.qz-process-log').textContent,/selected page 12/);
    progress({stage:'waiting',percent:99,completed:80,requested:100,batch:5,totalBatches:5,message:'Waiting for the next request slot…'});
    panel=processing(view);assert.equal(panel.dataset.state,'waiting');assert.equal(panel.getAttribute('aria-busy'),'true');assert.equal(Number(panel.querySelector('#quiz-progress').value),80);assert.match(panel.querySelector('#quiz-processing-message').textContent,/next request slot/);
    view.cancel();held.resolve(quiz);await pending;panel=processing(view);assert.equal(panel.dataset.state,'paused');assert.equal(panel.getAttribute('aria-busy'),'false');assert.equal(Number(panel.querySelector('#quiz-progress').value),80);assert.equal(panel.querySelector('.qz-stages .active'),null);
  });
  await test('Authentication and quota errors expose their action only inside processing',async({w,view})=>{
    w.quizService.generate=async()=>{throw Object.assign(Error('Invalid credentials'),{code:'AI_AUTHENTICATION_FAILED',status:401});};await view.generate();
    let panel=processingError(view,/Gemini rejected the API key/);assert.ok(panel.querySelector('[data-action=settings]'));assert.equal(view.container.querySelectorAll('[data-action=settings]').length,1);
    w.quizService.generate=async()=>{throw Object.assign(Error('Unavailable'),{code:'AI_QUOTA_UNAVAILABLE',status:429});};await view.generate();
    panel=processingError(view,/no quota/);assert.ok(panel.querySelector('[data-action=settings]'));assert.equal(view.container.querySelectorAll('[data-action=settings]').length,1);
  });
  await test('Saved-list loading failures appear only in the persistent processing box',async({w,view})=>{
    w.quizStore.list=async()=>{throw Error('Saved quizzes could not be read');};await view.showSaved();
    const panel=processingError(view,/Saved quizzes could not be read|saved quizzes/i);assert.ok(panel.querySelector('[data-action=retry-list]'));
    assert.equal(view.container.querySelectorAll('[data-action=retry-list]').length,1);
  });
  await test('Processing messages and error history escape provider-controlled HTML',async({w,view})=>{
    const text='<img src=x onerror=attack()> Request failed';w.quizService.generate=async()=>{throw Error(text);};await view.generate();
    const panel=processingError(view,/<img src=x onerror=attack\(\)> Request failed/);assert.equal(panel.querySelector('img,script'),null);assert.ok(panel.textContent.includes(text));
  });
  await test('An unreadable generation draft offers central recovery without a second error block',({w,view})=>{
    w.quizService.draftError='The saved quiz generation draft could not be read.';view.paint();
    const panel=processingError(view,/saved quiz generation draft could not be read/);assert.ok(panel.querySelector('[data-action=discard-generation]'));
    assert.equal(view.container.querySelectorAll('[data-action=discard-generation]').length,1);
  });
  await test('Finished PDF opening and attempt saving freeze elapsed time until a new operation',async({w,view,quiz})=>{
    let clock=Date.now();w.Date.now=()=>clock;const opened=deferred();w.quizService.loadPdf=()=>opened.promise;
    let pending=view.loadFile(new w.File(['PDF'],'study.pdf',{type:'application/pdf'}));clock+=2400;opened.resolve({fileName:'study.pdf',pageCount:2,fileSizeBytes:1000});await pending;
    const pdfElapsed=view.elapsedText();clock+=90000;view.paint();assert.equal(view.elapsedText(),pdfElapsed);assert.equal(processing(view).getAttribute('aria-busy'),'false');
    view.startQuiz(quiz,false);const saved=deferred();w.quizStore.saveAttempt=()=>saved.promise;pending=view.submitAttempt();
    assert.match(processing(view).querySelector('#quiz-processing-heading').textContent,/Saving your attempt/);clock+=3200;saved.resolve({...view.result,id:1,quizId:quiz.id});await pending;
    const attemptElapsed=view.elapsedText();clock+=90000;view.paint();assert.equal(view.elapsedText(),attemptElapsed);assert.equal(processing(view).getAttribute('aria-busy'),'false');
  });
  await test('Starting a new operation clears the previous activity and labels the actual operation',async({w,view,quiz})=>{
    await view.generate();assert.equal(view.mode,'attempt');const held=deferred();w.quizService.loadPdf=()=>held.promise;
    const pending=view.loadFile(new w.File(['PDF'],'replacement.pdf',{type:'application/pdf'}));const panel=processing(view);
    assert.match(panel.querySelector('#quiz-processing-heading').textContent,/Opening your PDF/);assert.match(panel.querySelector('#quiz-processing-message').textContent,/replacement.pdf/);
    assert.equal(panel.querySelectorAll('.qz-process-log li').length,1);assert.ok(!panel.querySelector('.qz-process-log').textContent.includes('quiz is ready'));
    held.resolve({fileName:'replacement.pdf',pageCount:3,fileSizeBytes:1000});await pending;assert.equal(view.pdf.fileName,'replacement.pdf');
  });
  await test('Leaving during history loading cannot leave the processing box running on return',async({w,view})=>{
    const held=deferred();w.quizStore.listAttempts=()=>held.promise;await view.showSaved();const pending=view.showHistory(1);
    assert.equal(processing(view).getAttribute('aria-busy'),'true');view.onLeaveView();held.resolve([]);await pending;await view.render();
    assert.equal(view.historyLoading,false);assert.equal(view.loadingSaved,false);assert.equal(processing(view).getAttribute('aria-busy'),'false');assert.equal(view._elapsedTimer,null);
  });
  await test('Opening a quiz while its history is loading releases the old history activity',async({w,view})=>{
    const held=deferred();w.quizStore.listAttempts=()=>held.promise;await view.showSaved();const pending=view.showHistory(1);
    await view.openQuiz(1);
    assert.equal(view.historyLoading,false);assert.equal(processing(view).getAttribute('aria-busy'),'false');assert.equal(view._elapsedTimer,null);
    held.resolve([]);await pending;
    assert.equal(view.mode,'attempt');assert.equal(view.historyLoading,false);assert.equal(processing(view).getAttribute('aria-busy'),'false');assert.equal(view._elapsedTimer,null);
    assert.ok(!processing(view).querySelector('#quiz-process-error'));
  });
  await test('Late history completion cannot stop a newer generation or its live clock',async({w,view,quiz})=>{
    const history=deferred(),generation=deferred();w.quizStore.listAttempts=()=>history.promise;w.quizService.generate=()=>generation.promise;
    await view.showSaved();const old=view.showHistory(1);view.showCreate();const pending=view.generate(),timer=view._elapsedTimer;
    assert.ok(timer);history.resolve([]);await old;
    assert.equal(view.busy,true);assert.equal(view._elapsedTimer,timer);assert.equal(processing(view).getAttribute('aria-busy'),'true');assert.match(processing(view).querySelector('#quiz-processing-heading').textContent,/Creating your quiz/);
    view.cancel();generation.resolve(quiz);await pending;
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`); process.exitCode=failed?1:0;
})();
