/** Durable PDF/OCR recovery using production helpers, isolated storage and fake OCR. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
let passed=0,failed=0;
function fixture(){
  const dom=new JSDOM('<section id="view-create-quiz"></section>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window,rows=new Map();
  const chain={stores(){return chain;},upgrade(){return chain;}};
  const table={get:async id=>rows.get(id),put:async row=>rows.set(row.id,{...row}),update:async(id,changes)=>{const row=rows.get(id);if(!row)return 0;Object.assign(row,changes);return 1;},delete:async id=>rows.delete(id),clear:async()=>rows.clear()};
  w.Dexie=function(){return {version:()=>chain,quizDraftFiles:table,transaction:async(...args)=>args.at(-1)()};};
  w.console={warn(){},log(){},error(){}};w.UIUtils={buildViewHero:()=>''};
  if(!w.Blob.prototype.arrayBuffer)w.Blob.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(this);});};
  const visits=[],ocrCalls=[],timings=[],toasts=[];
  w.pdfReader={ensure:async()=>({getDocument:()=>({promise:Promise.resolve({numPages:2,destroy:async()=>{},getPage:async number=>{visits.push(number);return {getTextContent:async()=>({items:[]}),getViewport:()=>({width:100,height:100}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}};}}),destroy:async()=>{}})})};
  w.HTMLCanvasElement.prototype.getContext=()=>({});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,fixture';
  w.aiClient={probeServerKey:async()=>true,recordStageTiming:(stage,start,metadata)=>timings.push({stage,start,metadata})};
  w.geminiService={isAiAvailable:()=>true,extractTextFromImage:async()=>{ocrCalls.push(1);return `Completed OCR page ${ocrCalls.length}.`;},generateQuiz:async()=>{throw Error('Stop before AI writing in this fixture');}};
  let id=0,controller;
  w.app={currentView:'create-quiz',showToast:text=>toasts.push(text),refreshIcons(){},beginGeneration:()=>{controller=new w.AbortController();id++;return true;},getGenerationContext:()=>({id,signal:controller?.signal}),endGeneration(){},handleGenerationProgress(){},startQuiz(){}};
  for(const file of ['js/sanitizer.js','js/quiz-quality.js','js/db.js','js/pdf-extractor.js','js/views/create-quiz.js'])w.eval(read(file));
  w.createQuizView.render=async()=>{};
  const file=new w.File(['Immutable PDF bytes'],'original.pdf',{type:'application/pdf'});
  const load=async()=>{await w.pdfExtractor.loadPdfFile(file);const view=w.createQuizView;view.loadedPdfMeta=w.pdfExtractor.metadata;view.pdfTotalPages=2;view.useOcr=true;return view;};
  const reload=()=>{w.createQuizView.dispose();w.eval(read('js/pdf-extractor.js'));w.eval(read('js/views/create-quiz.js'));w.createQuizView.render=async()=>{};return w.createQuizView;};
  return {dom,w,rows,table,file,visits,ocrCalls,timings,toasts,load,reload,cancel:()=>controller.abort()};
}
async function test(name,run){const f=fixture();try{await run(f);passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}finally{f.dom.window.close();}}
(async()=>{
  await test('Quota failure and reload reuse completed OCR from the immutable saved PDF',async({w,rows,load,reload,ocrCalls})=>{
    const view=await load();let failed=false;
    w.geminiService.extractTextFromImage=async()=>{
      assert.ok(view.generationDraft?.options.draftPdfId,'draft exists before paid OCR');
      assert.ok(rows.has(view.generationDraft.options.draftPdfId),'original file is already durable');
      ocrCalls.push(1);if(ocrCalls.length===2 && !failed){failed=true;throw Object.assign(Error('Daily quota'),{status:429});}return 'Successful original-page transcription.';
    };
    await view.generateQuiz();const id=view.generationDraft.options.draftPdfId;
    assert.equal(view.generationDraft.options.sourceContent,'');assert.equal(Object.keys(rows.get(id).recoveryPages).length,1);
    const restored=reload();w.geminiService.extractTextFromImage=async()=>{ocrCalls.push(1);return 'Second original page transcription.';};
    const different=new w.File(['Unrelated bytes'],'different.pdf',{type:'application/pdf'});await w.pdfExtractor.loadPdfFile(different);
    await restored.generateQuiz(true);
    assert.equal(ocrCalls.length,3);assert.equal(w.pdfExtractor.currentFile.name,'original.pdf');
    assert.equal(restored.generationDraft.options.sourcePages.length,2);assert.equal(restored.generationDraft.options.sourcePages[0].text,'Successful original-page transcription.');
    assert.equal(Object.keys(rows.get(id).recoveryPages).length,2);
  });
  await test('Recovery IDs are immutable and deleting a draft removes its pages without resurrection',async({w,rows,file})=>{
    await w.saveQuizDraftFile('first',file);await w.saveQuizDraftFile('other',file);
    const page={pageNumber:1,text:'Saved source text',extractionMethod:'OCR'};
    assert.equal(await w.saveQuizDraftPage('first','v1',page),true);
    await assert.rejects(w.saveQuizDraftFile('first',new w.File(['Changed'],'changed.pdf',{type:'application/pdf'})),/already saved/);
    await w.deleteQuizDraftFile('first');assert.equal(await w.saveQuizDraftPage('first','v1',page),false);
    assert.equal(rows.has('first'),false);assert.equal(rows.has('other'),true);assert.equal((await w.getQuizDraftPages('first','v1')).length,0);
  });
  await test('Page range, OCR setting and transcription version do not replay incompatible pages',async({w,file,ocrCalls})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});
    const reader=w.pdfExtractor;await reader.extractTextFromPageRange(1,1,()=>{},{ocr:true,draftPdfId:'source'});
    assert.equal(ocrCalls.length,1);const second=await reader.extractTextFromPageRange(2,2,()=>{},{ocr:true,draftPdfId:'source'});
    assert.equal(second.extractedPages.length,1);assert.equal(second.extractedPages[0].pageNumber,2);assert.equal(ocrCalls.length,2);
    await assert.rejects(reader.extractTextFromPageRange(1,1,()=>{},{ocr:false,draftPdfId:'source'}),/no readable text/);assert.equal(ocrCalls.length,2);
    reader.pageCacheVersion=()=> 'pdf-text-v1|ocr-study-v2|new-model';
    await reader.extractTextFromPageRange(1,1,()=>{},{ocr:true,draftPdfId:'source'});assert.equal(ocrCalls.length,3);
    assert.equal((await w.getQuizDraftPages('source','pdf-text-v1|ocr-study-v1|gemini-3.6-flash')).length,0);
  });
  await test('Checkpoint storage failure stops before the next OCR and same-tab retry saves without re-reading',async({w,file,table,ocrCalls})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});
    const update=table.update;table.update=async()=>{throw Error('Storage full');};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,draftPdfId:'source'}),error=>error.code==='PDF_CHECKPOINT_FAILED');
    assert.equal(ocrCalls.length,1);table.update=update;
    const result=await w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,draftPdfId:'source'});
    assert.equal(ocrCalls.length,2);assert.equal(result.extractedPages.length,2);assert.equal((await w.getQuizDraftPages('source',w.pdfExtractor.pageCacheVersion())).length,2);
  });
  await test('Original source storage failure pauses before paid OCR and keeps its in-tab draft for retry',async({w,load,table,ocrCalls,toasts})=>{
    const view=await load(),put=table.put;table.put=async()=>{throw Error('Storage full');};await view.generateQuiz();
    assert.equal(ocrCalls.length,0);assert.ok(view.generationDraft);assert.equal(view.generationDraft.options._pdfFile.name,'original.pdf');
    assert.ok(toasts.some(text=>/before using OCR credits/.test(text)));table.put=put;await view.generateQuiz(true);
    assert.equal(ocrCalls.length,2);assert.ok(view.generationDraft.options.draftPdfId);
  });
  await test('Text-only PDFs keep local extraction available when source-file recovery storage is full',async({w,load,table,ocrCalls})=>{
    const view=await load();view.useOcr=false;table.put=async()=>{throw Error('Storage full');};
    w.pdfExtractor.currentDoc.getPage=async()=>({getTextContent:async()=>({items:[{str:'Readable original study text.'}]}),cleanup(){}});
    let writes=0;w.geminiService.generateQuiz=async options=>{writes++;assert.ok(options.sourceContent.includes('Readable original study text.'));throw Error('Fixture stop');};
    await view.generateQuiz();assert.equal(writes,1);assert.equal(ocrCalls.length,0);assert.equal(view.generationDraft.options.sourcePages.length,2);
  });
  await test('Incomplete or failed OCR pages never become durable checkpoints',async({w,file,rows})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});
    w.geminiService.extractTextFromImage=async()=>{throw Error('OCR response was incomplete.');};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,skipUnreadable:true,draftPdfId:'source'}),/No readable pages/);
    assert.equal(rows.get('source').recoveryPages,undefined);assert.equal(w.pdfExtractor._pageTextCache.size,0);
    w.geminiService.extractTextFromImage=async()=> ' ';await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,1,()=>{},{ocr:true,draftPdfId:'source'}),/no readable text/);
    assert.equal(rows.get('source').recoveryPages,undefined);
  });
  await test('Cancelled OCR result cannot create a successful page checkpoint',async({w,file,rows})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});
    const controller=new w.AbortController();w.geminiService.extractTextFromImage=async()=>{controller.abort();return 'Late completed text';};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,draftPdfId:'source',signal:controller.signal}),{name:'AbortError'});
    assert.equal(rows.get('source').recoveryPages,undefined);assert.equal(w.pdfExtractor._pageTextCache.size,0);
  });
  await test('Cancellation after a durable page retains it and stops before the next paid page',async({w,file,table,ocrCalls})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});
    const controller=new w.AbortController(),update=table.update;table.update=async(...args)=>{const saved=await update(...args);controller.abort();return saved;};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,draftPdfId:'source',signal:controller.signal}),{name:'AbortError'});
    assert.equal(ocrCalls.length,1);assert.equal((await w.getQuizDraftPages('source',w.pdfExtractor.pageCacheVersion())).length,1);
  });
  await test('Discard during source-file save cleans the stale file and cannot overwrite a newer draft',async({w,load,rows})=>{
    const view=await load(),save=w.saveQuizDraftFile;let began,finish;
    const started=new Promise(resolve=>began=resolve),release=new Promise(resolve=>finish=resolve);
    w.saveQuizDraftFile=async(...args)=>{began();await release;return save(...args);};
    const task=view.generateQuiz();await started;view.discardDraft();const next={options:{sourceType:'TEXT',sourceTitle:'New draft'},phase:'GENERATE'};view.generationDraft=next;finish();await task;
    assert.equal(rows.size,0);assert.equal(view.generationDraft,next);
  });
  await test('Cancellation during source-file saving leaves the owned draft recoverable before any OCR',async({w,load,rows,cancel,ocrCalls})=>{
    const view=await load(),save=w.saveQuizDraftFile;let began,finish;
    const started=new Promise(resolve=>began=resolve),release=new Promise(resolve=>finish=resolve);
    w.saveQuizDraftFile=async(...args)=>{began();await release;return save(...args);};
    const task=view.generateQuiz();await started;cancel();finish();await task;
    const id=view.generationDraft.options.draftPdfId;assert.ok(id);assert.ok(rows.has(id));assert.equal(ocrCalls.length,0);
    await view.generateQuiz(true);assert.equal(ocrCalls.length,2);
  });
  await test('Missing saved source refuses a newly uploaded file and metadata timings contain no source data',async({w,load,reload,rows,timings,ocrCalls})=>{
    const view=await load();w.geminiService.extractTextFromImage=async()=>{throw Object.assign(Error('Quota'),{status:429});};await view.generateQuiz();
    const id=view.generationDraft.options.draftPdfId;await w.deleteQuizDraftFile(id);const restored=reload();
    await w.pdfExtractor.loadPdfFile(new w.File(['Different'],'different.pdf',{type:'application/pdf'}));await restored.generateQuiz(true);
    assert.equal(ocrCalls.length,0);assert.equal(rows.size,0);assert.ok(restored.generationDraft);assert.ok(timings.some(item=>item.stage==='pdf-extraction'&&item.metadata.outcome==='failed'));
    assert.ok(timings.every(item=>!JSON.stringify(item).includes('original.pdf')&&!JSON.stringify(item).includes('Immutable PDF bytes')));
  });
  await test('Completed older PDF drafts generate from saved text without requiring a new PDF read',async({w,reload})=>{
    w.localStorage.setItem('hamsa_quiz_generation_draft',JSON.stringify({phase:'GENERATE',options:{sourceType:'PDF',sourceTitle:'Old PDF',sourceContent:'Previously read source',sourcePages:[{pageNumber:1,text:'Previously read source'}],questionCount:1},state:null}));
    const view=reload();let called=0;w.geminiService.generateQuiz=async options=>{called++;assert.equal(options.sourceContent,'Previously read source');throw Error('Fixture stop');};
    await view.generateQuiz(true);assert.equal(called,1);assert.equal(view.generationDraft.options.sourceContent,'Previously read source');
  });
  for(const failure of [{code:'AI_UPSTREAM_TIMEOUT'},{code:'AI_NETWORK_UNCERTAIN'},{code:'AI_STEP_TIMEOUT'},{status:404},{status:413},{status:502}])await test(`OCR ${failure.code || 'HTTP '+failure.status} pauses before reading another paid page`,async({w,file,rows})=>{
    await w.saveQuizDraftFile('source',file);await w.pdfExtractor.loadPdfFile(file,{draftPdfId:'source'});let calls=0;
    w.geminiService.extractTextFromImage=async()=>{calls++;throw Object.assign(Error('Terminal transport failure'),failure);};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{ocr:true,skipUnreadable:true,draftPdfId:'source'}),error=>error.code===failure.code&&error.status===failure.status);
    assert.equal(calls,1);assert.equal(rows.get('source').recoveryPages,undefined);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
