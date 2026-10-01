const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0, failed = 0;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const section = (id='sec-1', title='Energy') => ({ id, heading:title, content:`${title} moves between objects. Trace the input and output.`, keyPoints:[`${title} is conserved.`], definitions:[{term:title,definition:`The ability to do work.`}], formulas:[{name:'Energy',formula:'E = P × t',explanation:'Power multiplied by time.'}], examples:[], tables:[], sourceRefs:[{fileName:'Chapter.pdf',page:2,method:'TEXT'}], recall:{question:'Why trace input and output?',expectedPoints:['Identify the energy source','Identify the recipient']} });
const note = (id=1,title='Energy') => ({id,title,subject:'Science',sections:[section('sec-1',title)],glossaryTerms:[{term:title,simpleMeaning:'Capacity to do work.'}],annotations:{highlights:[],bookmarks:[],personalNotes:[]},settings:{language:'HINDI',level:'SCHOOL',exam:'Class 10'},metadata:{generationSource:'GEMINI_AI'},createdAt:'2026-01-01',updatedAt:'2026-01-01',chatHistory:[],editHistory:[]});
function setup() {
  const dom = new JSDOM('<section id="view-study-notes"></section><section id="view-flashcards"></section>', { url:'http://localhost:3000', runScripts:'outside-only' });
  const w=dom.window, records=[note(),note(2,'Light')], saves=[], toasts=[], prompts=[];
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.URL.createObjectURL=()=> 'blob:http://localhost:3000/source';w.URL.revokeObjectURL=()=>{};
  w.console={...console,warn(){},error(){}};
  for(const name of ['js/sanitizer.js','js/ui-utils.js','assets/vendor/marked.min.js','js/gemini-service.js'])w.eval(read(name));
  w.UIUtils.buildViewHero=()=>'';
  w.app={currentView:'study-notes',refreshIcons(){},showToast:(...args)=>toasts.push(args),beginGeneration:()=>true,endGeneration(){},isGenerationCancelled:()=>false,handleGenerationProgress(){},navigate(view){this.currentView=view;},startQuiz(id){this.quiz=id;}};
  w.getAllNotes=async()=>clone(records);w.getNoteById=async id=>clone(records.find(item=>item.id===Number(id))||null);
  w.updateNote=async(id,data)=>{const found=records.find(item=>item.id===Number(id));if(!found)throw Error('Note not found');saves.push({id,data:clone(data)});Object.assign(found,clone(data));return clone(found);};
  w.updateNoteAnnotations=async(id,annotations)=>w.updateNote(id,{annotations});
  w.updateNoteMastery=async(id,masteredSections)=>w.updateNote(id,{masteredSections});
  w.saveNewNote=async data=>{const id=records.length+1;records.push({id,...clone(data)});return id;};
  w.saveNewQuiz=async(meta,questions)=>{w.savedQuiz={meta,questions};return 9;};
  const svc=w.geminiService;svc.candidateModels=['gemini-3.6-flash'];svc.getApiKey=()=>'';svc.isAiAvailable=()=>true;svc.discoverAvailableModels=async()=>[];
  w.aiClient={fetchGenerateContent:async(model,payload)=>{prompts.push(payload.contents[0].parts[0].text);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({sections:[section()],glossaryTerms:[]})}]}}]})};}};
  w.eval(read('js/views/study-notes.js'));w.eval(read('js/pdf-generator.js'));
  return {dom,w,svc,view:w.studyNotesView,records,saves,toasts,prompts};
}
async function test(name,callback) {
  const context=setup();
  try{await callback(context);passed++;console.log(`  PASS  ${name}`);}
  catch(error){failed++;console.log(`  FAIL  ${name}: ${error.stack}`);}
  finally{context.dom.window.close();}
}
(async()=>{
  await test('Percentage-based revision mandates and duplicate summary methods are removed',()=>{
    const service=read('js/gemini-service.js'),view=read('js/views/study-notes.js');
    assert.ok(!/40\s*%|40pct|Deep Dive/i.test(service+view));
    assert.equal((service.match(/async summarizeStudyNote\(/g)||[]).length,1);
    assert.equal((service.match(/  generateFallbackComprehensiveSummary\(/g)||[]).length,1);
  });
  await test('Semantic chunking preserves every character and short source facts',({svc})=>{
    const text='One sentence.\n\n'+('some source facts. '.repeat(600))+'\n\n2';
    assert.equal(svc._studyChunks(text).join(''),text);
    const book=svc.generateStructuredFallbackNote({topic:'Study',rawText:text});
    assert.ok(book.sections.at(-1).content.endsWith('2'));assert.equal(book.metadata.generatedByAI,false);
    assert.ok(book.sections.every(sec=>!sec.definitions.length&&!sec.examples.length));
    assert.equal(book.summary.formulasOrRules.length,0);
  });
  await test('Requested language and level reach every source batch; references are authoritative',async({svc,prompts})=>{
    const book=await svc.generateStructuredStudyBook({topic:'Energy',rawText:'Source',sourcePages:[{fileName:'Book.pdf',page:9,text:'Source',method:'TEXT'}],settings:{language:'HINDI',level:'SCHOOL',exam:'CBSE'}});
    assert.ok(prompts[0].includes('HINDI'));assert.ok(prompts[0].includes('CBSE'));assert.equal(book.sections[0].sourceRefs[0].page,9);assert.equal(book.coverage.status,'COMPLETE');
  });
  await test('Missing batches cannot silently save partial notes; retries reuse completed batches',async({svc,w})=>{
    let requests=0,fail=true;w.aiClient.fetchGenerateContent=async()=>{requests++;if(requests===2&&fail)return {ok:false,status:503,json:async()=>({error:{message:'retry'}})};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({sections:[section()],glossaryTerms:[]})}]}}]})};};
    const args={topic:'Two pages',rawText:'A source\nB source',sourcePages:[{fileName:'Book',page:1,text:'A source'},{fileName:'Book',page:2,text:'B source'}]};
    let failure;try{await svc.generateStructuredStudyBook(args);}catch(error){failure=error;}
    assert.equal(failure.code,'INCOMPLETE_BATCHES');assert.equal(failure.failures[0].sourceRefs[0].page,2);
    fail=false;const complete=await svc.generateStructuredStudyBook({...args,retryState:failure.retryState});
    assert.equal(requests,3);assert.equal(complete.sections.length,2);
  });
  await test('Invalid optional content and truncated responses retry or fail clearly',async({svc,w})=>{
    assert.equal(svc._studySectionsValid([{...section(),examples:[{title:'Example',content:null}]}]),false);
    assert.equal(svc._studySectionsValid([{...section(),tables:[{title:'Table',headers:['A'],rows:[['A','B']]}]}]),false);
    w.aiClient.fetchGenerateContent=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})});
    await assert.rejects(svc.generateStructuredStudyBook({topic:'Study',rawText:'Actual source'}),error=>error.code==='INCOMPLETE_BATCHES');
  });
  await test('Local formatting cannot pretend it translated a document',async({svc})=>{
    svc.isAiAvailable=()=>false;
    await assert.rejects(svc.generateStructuredStudyBook({topic:'Study',rawText:'English source',settings:{language:'HINDI'}}),/Changing the source language needs Gemini/);
  });
  await test('Revision covers late sections and does not swallow cancellation',async({svc,w})=>{
    const chapters=[section(),section('sec-2','LAST_SECTION_SENTINEL')];let prompts=[];
    w.aiClient.fetchGenerateContent=async(model,payload)=>{prompts.push(payload.contents[0].parts[0].text);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Accurate revision',pointers:['Source point'],traps:[]})}]}}]})};};
    const summary=await svc.summarizeStudyNote({title:'Study',sections:chapters});assert.equal(summary.sectionBreakdowns.length,2);assert.ok(prompts.some(prompt=>prompt.includes('LAST_SECTION_SENTINEL')));
    w.aiClient.fetchGenerateContent=async()=>{throw new w.DOMException('Cancelled','AbortError');};await assert.rejects(svc.summarizeStudyNote({title:'Study',sections:chapters}),error=>error.name==='AbortError');
  });
  await test('Tutor retrieves relevant sections from the entire note',async({svc,w})=>{
    const chapters=Array.from({length:20},(_,i)=>({...section(`sec-${i}`,`Topic ${i}`),content:'Common material '.repeat(600)}));chapters[19].content='The ZX_UNIQUE_LATE process changes energy.';
    let prompt;w.aiClient.fetchGenerateContent=async(model,payload)=>{prompt=payload.contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Source-based answer'}]}}]})};};
    await svc.askAiAboutNote({sections:chapters,noteTopic:'Study',userQuestion:'ZX_UNIQUE_LATE'});assert.ok(prompt.includes('ZX_UNIQUE_LATE process'));assert.ok(prompt.includes('sec-19'));
  });
  await test('Quiz types and languages are respected in efficient multi-question batches',async({svc,w})=>{
    let requests=0;w.aiClient.fetchGenerateContent=async(model,payload)=>{
      const prompt=payload.contents[0].parts[0].text;assert.ok(prompt.includes('HINDI'));const targets=JSON.parse(prompt.match(/TARGETS: (.*)\n/)[1]);requests++;
      return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({questions:targets.map(target=>({slot:target.slot,questionText:`Question ${target.slot}`,options:target.type==='TRUE_FALSE'?['सही','गलत']:['A','B','C','D'],correctAnswerIndex:0,explanation:'Source-supported reasoning'}))})}]}}]})};
    };
    const result=await svc.generateStudyQuiz({sections:[section()],questionCount:10,questionType:'MIXED',language:'HINDI'});assert.equal(requests,3);assert.equal(result.questions.length,10);assert.equal(result.questions[1].options.length,2);assert.equal(result.questions[0].options.length,4);
  });
  await test('Editing then immediately Done saves the latest text and supports Undo',async({view,w,records})=>{
    await view.openNote(1);const previous=view.activeNote.sections[0].content;view.isEditMode=true;view.onSectionTextEdit('sec-1','MY NEW EXPLANATION');await view.toggleEditMode();
    assert.equal(records[0].sections[0].content,'MY NEW EXPLANATION');assert.equal(view.autoSaveStatus,'Saved ✓');assert.equal(records[0].editHistory.length,1);
    await view.undoLastEdit();assert.equal(records[0].sections[0].content,previous);
  });
  await test('Editing invalidates dependent teaching aids; AI refresh keeps the student explanation',async({view,svc,records})=>{
    await view.openNote(1);view.onSectionTextEdit('sec-1','My revised explanation.');await view.flushAutoSave();
    assert.equal(records[0].sections[0].keyPoints.length,0);assert.equal(records[0].sections[0].recall,null);assert.equal(records[0].sections[0].supportingContentStale,true);
    svc.generateStructuredStudyBook=async()=>({sections:[section()],glossaryTerms:[{term:'Energy',simpleMeaning:'Refreshed meaning'}]});
    await view.refreshSectionTeaching('sec-1');assert.equal(records[0].sections[0].content,'My revised explanation.');assert.equal(records[0].sections[0].supportingContentStale,false);assert.equal(records[0].glossaryTerms[0].simpleMeaning,'Refreshed meaning');
  });
  await test('Immediate navigation persists reading position and unfinished recall drafts',async({view,records})=>{
    await view.openNote(1);view.activeNote.readingPosition={sectionId:'sec-1'};view.keepRecallDraft('sec-1','My unfinished explanation');await view.backToDashboard();
    assert.equal(records[0].readingPosition.sectionId,'sec-1');assert.equal(records[0].recallAnswers['sec-1'].draft,'My unfinished explanation');
    await view.openNote(1);assert.equal(view.microQuizAnswers['sec-1'].draft,'My unfinished explanation');
  });
  await test('Chat storage failure keeps a received answer and warns separately',async({view,svc,w,toasts})=>{
    await view.openNote(1);view.toggleAskAiDrawer();svc.askAiAboutNote=async()=> 'Received answer';w.updateNote=async()=>{throw Error('Storage full');};w.document.getElementById('ask-ai-input-field').value='Question';await view.sendAiMessage();
    assert.equal(view.askAiMessages.at(-1).text,'Received answer');assert.ok(toasts.some(item=>item[0].includes('Reply received, but chat history')));assert.equal(w.document.getElementById('ask-ai-input-field').value,'');
  });
  await test('PDF export reserves the tab before asynchronous saving and rejects blocked popups honestly',async({view,w,toasts})=>{
    await view.openNote(1);const calls=[],printWindow={document:{body:{textContent:''}},close(){calls.push('close');}};
    w.open=()=>{calls.push('open');return printWindow;};view.flushAutoSave=async()=>calls.push('save');w.pdfGenerator.exportStudyNotesBookletPdf=(note,reserved)=>{assert.equal(reserved,printWindow);calls.push('export');};
    await view.exportStudyNotesPdf(1);assert.deepEqual(calls,['open','save','export']);
    w.geminiService.generateStudyQuiz=async()=>({questions:[{questionText:'Source question',options:['A','B','C','D'],correctAnswerIndex:0,explanation:'Reason'}]});
    w.pdfGenerator.exportPrintableQuizPdf=(quiz,questions,reserved)=>{assert.equal(reserved,printWindow);assert.equal(questions.length,1);calls.push('quiz-export');};await view.exportPrintableQuizPrompt(1);assert.equal(calls.at(-1),'quiz-export');
    w.geminiService.generateStudyQuiz=async()=>{throw new w.DOMException('Cancelled','AbortError');};await view.exportPrintableQuizPrompt(1);assert.equal(calls.at(-1),'close');
    w.open=()=>null;await view.exportStudyNotesPdf(1);assert.ok(toasts.some(item=>item[0].includes('Allow pop-ups')));
  });
  await test('Quiz generation rejects duplicated questions within one response',async({svc})=>{
    svc._studyRequest=async(prompt,options)=>{assert.equal(options.validate({questions:[0,1].map(slot=>({slot,questionText:'Same question',options:['A','B','C','D'],correctAnswerIndex:0,explanation:'Reason'}))}),false);throw Error('Duplicate response rejected');};
    await assert.rejects(svc.generateStudyQuiz({sections:[section()],questionCount:2}),/Duplicate/);
  });
  await test('Save failures keep the editor draft and block note switching until retry',async({view,w,records})=>{
    await view.openNote(1);view.onSectionTextEdit('sec-1','KEEP_DRAFT');const update=w.updateNote;w.updateNote=async()=>{throw Error('Storage full');};
    await view.openNote(2);assert.equal(view.activeNote.id,1);assert.equal(view.activeNote.sections[0].content,'KEEP_DRAFT');
    w.updateNote=update;await view.openNote(2);assert.equal(records[0].sections[0].content,'KEEP_DRAFT');assert.equal(view.activeNote.id,2);
  });
  await test('A newer edit made during save is retained and persisted by the next save',async({view,w,records})=>{
    await view.openNote(1);view.onSectionTextEdit('sec-1','FIRST_EDIT');const hold=deferred(),update=w.updateNote;let first=true;
    w.updateNote=async(id,data)=>{if(first){first=false;await hold.promise;}return update(id,data);};const pending=view.flushAutoSave();await Promise.resolve();view.onSectionTextEdit('sec-1','SECOND_EDIT');hold.resolve();await pending;assert.equal(view._dirty,true);await view.flushAutoSave();assert.equal(records[0].sections[0].content,'SECOND_EDIT');
  });
  await test('Dashboard AI Quiz opens a real configuration dialog',async({view,w})=>{
    await view.render();await view.openQuizModalForNote(1);assert.ok(w.document.querySelector('[role=dialog]'));assert.ok(w.document.querySelector('.study-chapter-picker input'));
  });
  await test('Review marks report successful storage only and do not claim knowledge mastery',async({view,w,toasts,records})=>{
    await view.openNote(1);w.updateNoteMastery=async()=>{throw Error('Storage full');};await view.toggleSectionMastery('sec-1');assert.equal(view.activeNote.masteredSections?.length||0,0);assert.ok(toasts.some(item=>item[0].includes('Review status could not be saved')));
    w.updateNoteMastery=async(id,masteredSections)=>w.updateNote(id,{masteredSections});await view.toggleSectionMastery('sec-1');assert.deepEqual(records[0].masteredSections,['sec-1']);assert.ok(!view.container.textContent.includes('Topic Mastery'));
  });
  await test('Micro recall and saved attempts are isolated by note',async({view})=>{
    await view.openNote(1);const first=view.getOrGenerateSectionQuiz(view.activeNote.sections[0],0,view.activeNote);view.keepRecallDraft('sec-1','FIRST NOTE');await view.openNote(2);assert.equal(view.microQuizAnswers['sec-1'],undefined);
    const other={...view.activeNote.sections[0],recall:null};assert.ok(view.getOrGenerateSectionQuiz(other,0,view.activeNote).question.includes('Light'));assert.ok(first.expectedPoints.length);
  });
  await test('Hindi and overlapping glossary terms produce safe native controls',({view,w})=>{
    const html=view.injectGlossarySpans('प्रकाश संश्लेषण creates energy. Energy transfer matters.',[{term:'प्रकाश संश्लेषण'},{term:'Energy transfer'},{term:'Energy'}]);const box=w.document.createElement('div');box.innerHTML=html;
    assert.equal(box.querySelectorAll('button').length,3);assert.equal(box.querySelectorAll('button button').length,0);assert.ok(!view.injectGlossarySpans('<script>bad()</script>',[]).includes('<script>'));
  });
  await test('Highlights survive redraw, anchor the actual section, and disappear on deletion',async({view,w,records})=>{
    await view.openNote(1);const body=w.document.querySelector('.textbook-body-paragraph'),node=body.querySelector('.glossary-interactive-term').firstChild;const range=w.document.createRange();range.setStart(node,0);range.setEnd(node,6);
    view._selection={range,body,text:'Energy',sectionId:'sec-1'};await view.highlightSelectedText('yellow');assert.equal(records[0].annotations.highlights.length,1);assert.ok(w.document.querySelector('mark'));await view.render();assert.ok(w.document.querySelector('mark'));
    await view.deleteAnnotation(records[0].annotations.highlights[0].id,'highlight');assert.equal(w.document.querySelectorAll('mark').length,0);
  });
  await test('Vault search keeps focus and searches chapter content; reader find is functional',async({view,w,records})=>{
    records[0].sections[0].content+=' UNIQUE_CONCEPT';await view.render();view.onSearchInput('UNIQUE_CONCEPT');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(w.document.querySelectorAll('.vault-note-card').length,1);assert.ok(w.document.activeElement.matches('[data-notes-search]'));
    await view.openNote(1);view.findInNote('MISSING_WORD');assert.equal(w.document.querySelector('[data-study-section]').hidden,true);view.findInNote('UNIQUE_CONCEPT');assert.equal(w.document.querySelector('[data-study-section]').hidden,false);
  });
  await test('Uploads validate case, duplicates, sizes and unsupported formats',({view,w})=>{
    const pdf=new w.File(['%PDF-1.7'],'CHAPTER.PDF',{type:'application/pdf'});view.onMultiFilesSelected([pdf,pdf,new w.File(['bad'],'script.exe',{type:'application/octet-stream'})]);assert.equal(view.newFiles.length,1);assert.equal(view.newFiles[0].type,'PDF');
    view.onMultiFilesSelected([{name:'Huge.pdf',type:'application/pdf',size:20*1024*1024}]);assert.equal(view.newFiles.length,1);
  });
  await test('Late tutor answers cannot enter another note; failed answers preserve the draft',async({view,w,svc})=>{
    await view.openNote(1);const hold=deferred();svc.askAiAboutNote=()=>hold.promise;w.document.getElementById('ask-ai-input-field').value='Energy question';const pending=view.sendAiMessage();await view.openNote(2);hold.resolve('ENERGY ANSWER');await pending;assert.equal(view.askAiMessages.length,0);
    svc.askAiAboutNote=async()=>{throw Error('Unavailable');};w.document.getElementById('ask-ai-input-field').value='KEEP THIS';await view.sendAiMessage();assert.equal(w.document.getElementById('ask-ai-input-field').value,'KEEP THIS');assert.equal(view._chatPending,false);
  });
  await test('Tutor history and active recall feedback are saved and reload',async({view,w,svc,records})=>{
    await view.openNote(1);svc.askAiAboutNote=async()=> 'Specific feedback';w.document.getElementById('ask-ai-input-field').value='My doubt';await view.sendAiMessage();assert.equal(records[0].chatHistory.length,2);
    w.document.getElementById('recall-sec-1').value='My explanation';await view.checkRecall('sec-1',true);await view.openNote(2);await view.openNote(1);assert.equal(view.askAiMessages.length,2);assert.equal(view.microQuizAnswers['sec-1'].draft,'My explanation');
  });
  await test('Source references open the requested original page and OCR is labelled',async({view,w,records})=>{
    records[0].originalSource={text:'OCR text',pages:[{fileName:'Chapter.pdf',page:2,text:'OCR text',method:'OCR'}],files:[{name:'Chapter.pdf',type:'PDF',data:'data:application/pdf;base64,JVBERi0xLjc='}]};await view.openNote(1);view.openSourceReference('Chapter.pdf',2);await view.render();const iframe=w.document.querySelector('iframe');assert.ok(iframe.src.endsWith('#page=2'));assert.ok(w.document.querySelector('.study-original').textContent.includes('OCR transcription'));
  });
  await test('Every revision mode has distinct content and no hidden percentage promises',async({view,w,records,svc})=>{
    records[0].summary=svc.generateFallbackComprehensiveSummary({sections:records[0].sections});await view.openNote(1);view.readerActiveTab='SUMMARY';view.revisionMode='QUICK';await view.render();assert.equal(w.document.querySelectorAll('.study-revision-section').length,0);
    view.revisionMode='DETAILED';await view.render();assert.equal(w.document.querySelectorAll('.study-revision-section').length,1);view.revisionMode='EXAM';await view.render();assert.ok(w.document.querySelector('.study-exam-outline'));assert.ok(!w.document.body.textContent.includes('40%'));
  });
  await test('Detailed PDF retains every summary section, definition and formula and escapes source HTML',({w,svc})=>{
    const value=note();value.summary=svc.generateFallbackComprehensiveSummary({sections:value.sections});value.summary.sectionBreakdowns[0].deepDiveSummary='DETAILED_SENTINEL';let html;w.pdfGenerator.openPrintWindow=content=>html=content;
    w.pdfGenerator.exportSummarySheetPdf(value,'DETAILED');assert.ok(html.includes('DETAILED_SENTINEL'));assert.ok(html.includes('E = P × t'));assert.ok(html.includes('ability to do work'));
    value.sections[0].content='<img src=x onerror="bad()">';w.pdfGenerator.exportStudyNotesBookletPdf(value);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
    value.sections[0].content='Text';value.sections[0].tables=[{title:'Real table',headers:['A'],rows:[['TABLE_SENTINEL']]}];value.sections[0].diagram={title:'Diagram',svgContent:'<svg viewBox="0 0 100 100"><rect width="20" height="20"/><script>bad()</script></svg>',caption:'Schematic'};w.pdfGenerator.exportStudyNotesBookletPdf(value);assert.ok(html.includes('TABLE_SENTINEL'));assert.ok(html.includes('<svg'));assert.ok(!html.includes('<script>'));
  });
  await test('Notes save provenance, original files, chat, reading position and synced edited content',async({w})=>{
    const store=new Map();let id=0;w.db={notes:{add:async data=>{store.set(++id,clone(data));return id;},get:async key=>clone(store.get(key)||null),update:async(key,data)=>{if(!store.has(key))return 0;Object.assign(store.get(key),clone(data));return 1;}}};
    const source=read('js/db.js');w.eval(source.slice(source.indexOf('function migrateLegacyNote('),source.indexOf('async function clearDatabase(')));
    const data={...note(),originalSource:{text:'Original',files:[{name:'File',data:'data:application/pdf;base64,JVBERg=='}]},coverage:{status:'COMPLETE'},readingPosition:{sectionId:'sec-1'}};
    const saved=await w.saveNewNote(data);assert.equal(store.get(saved).metadata.generationSource,'GEMINI_AI');assert.equal(store.get(saved).originalSource.files[0].data,data.originalSource.files[0].data);assert.ok(store.get(saved).coverage);assert.equal(store.get(saved).settings.language,'HINDI');
    await w.updateNote(saved,{sections:[{...section(),content:'EDITED_SENTINEL'}]});assert.ok(store.get(saved).content.includes('EDITED_SENTINEL'));await assert.rejects(w.updateNote(999,{title:'Missing'}),/no longer exists/);
  });
  await test('Notes flashcards use structured glossary/definitions/formulas and valid navigation',async({view,w})=>{
    w.eval(read('js/views/flashcards.js'));w.flashcardsView.startStudySession=()=>{};await view.openNote(1);await view.createFlashcardsFromNote();assert.equal(w.app.currentView,'flashcards');assert.ok(w.flashcardsView.cards.some(card=>card.badge==='Formula'));assert.ok(w.flashcardsView.cards.some(card=>card.front==='Define: Energy'));assert.ok(w.flashcardsView.cards.every(card=>card.cardKey));
  });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
