/** Production PDF-to-quiz regressions; isolated storage and simulated Gemini. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const http=require('http');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
let passed=0,failed=0;
const question=n=>({questionText:`What is ${n} plus one?`,options:[`${n+1}`,`${n+2}`,`${n+3}`,`${n+4}`],correctAnswerIndex:0,explanation:'Add one.',topic:'Addition'});
const ok=data=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});
const reviews=qs=>({reviews:qs.map((q,index)=>({index,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Independently verified.',optionExplanations:['Correct addition','Adds two','Adds three','Adds four']}))});
function fixture(){
  const dom=new JSDOM('<section id="view-create-quiz"></section>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  w.console={warn(){},log(){},error(){}};w.localStorage.setItem('hamsa_gemini_api_key','fixture-only');
  w.fetch=async()=>Response.json({configured:false});
  for(const file of ['js/ai-client.js','js/quiz-quality.js','js/quiz-engine.js','js/gemini-service.js'])w.eval(read(file));
  let clock=Date.now();w.Date.now=()=>clock;w.QuizQuality.wait=async(ms,signal)=>{w.QuizQuality.abort(signal);clock+=ms;};
  return {dom,w,options:{sourceType:'TEXT',sourceTitle:'Addition',subject:'Mathematics',questionCount:5}};
}
async function test(name,fn){const f=fixture();try{await f.w.aiClient.probeServerKey();await fn(f);passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}finally{f.dom.window.close();}}
(async()=>{
  await test('One malformed MCQ keeps four good questions and refills only the missing question',async({w,options})=>{
    const sizes=[];let writes=0;
    w.fetch=async(url,init)=>{const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){sizes.push(Number(prompt.match(/Create exactly (\d+)/)[1]));return ok({questions:++writes===1?[1,2,3,4].map(question).concat({questionText:'Malformed question'}):[question(5)]});}
      return ok(reviews(JSON.parse(prompt.split('QUESTIONS:\n')[1])));
    };
    const result=await w.geminiService.generateQuiz(options);assert.equal(result.questions.length,5);assert.deepEqual(sizes,[5,1]);assert.ok(result.questions.every(q=>q.aiReviewed));
  });
  await test('Hindi questions with different evidence use bounded blind reviews instead of exceeding input quota',async({w,options})=>{
    const prose='अध्ययन सामग्री में वैज्ञानिक अवधारणाओं को स्पष्ट उदाहरणों के साथ समझाया गया है। ';
    const pages=Array.from({length:10},(_,i)=>({pageNumber:i+1,text:`विषय ${i+1}: `+prose.repeat(22)}));
    const qs=pages.map((p,i)=>({...question(i+1),questionText:`प्रश्न ${i+1}: `+prose.repeat(7),options:[0,1,2,3].map(n=>`विकल्प ${n+1}: `+prose.repeat(4)),sourcePage:p.pageNumber,evidenceQuote:prose.trim()}));
    let writers=0,reviewed=0;
    w.fetch=async(url,init)=>{const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;assert.ok(w.aiClient.estimatePayloadTokens(payload)<12000);
      if(prompt.startsWith('Create exactly')){writers++;return ok({questions:qs});}
      const items=JSON.parse(prompt.split('QUESTIONS:\n')[1]);assert.ok(items.every(q=>!('correctAnswerIndex' in q)));reviewed+=items.length;return ok(reviews(items));
    };
    const result=await w.geminiService.generateQuiz({...options,sourceType:'PDF',sourcePages:pages,language:'HINDI',questionCount:10});assert.equal(result.questions.length,10);assert.equal(writers,1);assert.equal(reviewed,10);
  });
  await test('Learned lower TPM limit sizes the writer source before sending it',async({w,options})=>{
    const scope=w.aiClient._quotaScope('gemini-3.6-flash',{});w.aiClient._saveQuota(scope,{tpm:4000,history:[]});
    const text='यह एक अध्ययन सामग्री है। '.repeat(600),pages=[{pageNumber:1,text},{pageNumber:2,text}];let calls=0;
    w.fetch=async(url,init)=>{const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;assert.ok(w.aiClient.estimatePayloadTokens(payload)<4000);calls++;
      return prompt.startsWith('Create exactly')?ok({questions:[{...question(1),sourcePage:1,evidenceQuote:'यह एक अध्ययन सामग्री है।'}]}):ok(reviews([question(1)]));};
    const result=await w.geminiService.generateQuiz({...options,sourceType:'PDF',sourcePages:pages,questionCount:1,language:'HINDI'});assert.equal(result.questions.length,1);assert.equal(calls,2);
  });
  await test('Partial reviewer output saves accepted answers and retries only unresolved candidates',async({w,options})=>{
    let writes=0;const sizes=[];
    w.fetch=async(url,init)=>{const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){writes++;return ok({questions:[question(1),question(2)]});}
      const qs=JSON.parse(prompt.split('QUESTIONS:\n')[1]);sizes.push(qs.length);const answer=reviews(qs);if(sizes.length===1)answer.reviews.pop();return ok(answer);};
    const result=await w.geminiService.generateQuiz({...options,questionCount:2});assert.equal(result.questions.length,2);assert.equal(writes,1);assert.deepEqual(sizes,[2,1]);
  });
  await test('Split review failure resumes only unreviewed questions, without rewriting or duplicating answers',async({w,options})=>{
    let writes=0,reviewCalls=0,fail=true;const sizes=[];
    w.fetch=async(url,init)=>{const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){writes++;return ok({questions:Array.from({length:10},(_,i)=>question(i+1))});}
      const qs=JSON.parse(prompt.split('QUESTIONS:\n')[1]);sizes.push(qs.length);reviewCalls++;
      if(fail && reviewCalls===2)throw Object.assign(Error('Request timed out'),{code:'AI_TIMEOUT'});
      return ok(reviews(qs));};
    const settings={depth:'DETAILED'};let state;
    await assert.rejects(w.geminiService.generateQuiz({...options,questionCount:10,settings}),error=>{state=JSON.parse(JSON.stringify(error.retryState));return error.code==='AI_TIMEOUT';});
    assert.equal(state.questions.length,5);assert.equal(state.pendingCandidates.length,5);fail=false;
    const result=await w.geminiService.generateQuiz({...options,questionCount:10,settings,retryState:state});assert.equal(result.questions.length,10);assert.equal(writes,1);assert.deepEqual(sizes,[5,5,5]);
    assert.equal(new Set(result.questions.map(q=>q.questionText)).size,10);
  });
  await test('Duplicate reviewer indices and unsupported answer changes never become ready questions',async({w})=>{
    const valid=reviews([question(1),question(2)]).reviews;
    assert.equal(w.quizEngine.validReviews({reviews:[valid[0],valid[0],valid[1]]},2).length,1);
    assert.equal(w.quizEngine.validReviews({reviews:[{...valid[0],correctAnswerIndex:4},{...valid[1],optionExplanations:[]}]},2).length,0);
  });
  await test('MIXED difficulty preserves each reviewed question and restores the form choice',async({w,options})=>{
    w.fetch=async(url,init)=>{const prompt=JSON.parse(init.body).contents[0].parts[0].text;return prompt.startsWith('Create exactly')?ok({questions:[{...question(1),difficulty:'EASY'},{...question(2),difficulty:'HARD'}]}):ok(reviews([question(1),question(2)]));};
    const result=await w.geminiService.generateQuiz({...options,questionCount:2,difficulty:'MIXED'});assert.deepEqual(Array.from(result.questions,q=>q.difficulty),['EASY','HARD']);
    w.localStorage.setItem('hamsa_quiz_form_draft',JSON.stringify({version:1,fields:{selectedDifficulty:'MIXED'}}));w.eval(read('js/views/create-quiz.js'));assert.equal(w.createQuizView.selectedDifficulty,'MIXED');
  });
  await test('One damaged glyph does not discard an otherwise readable PDF page',async({w})=>{
    w.eval(read('js/pdf-extractor.js'));w.pdfExtractor.currentDoc={numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Photosynthesis uses sunlight to make food. One symbol is \uFFFD. Plants release oxygen.'}]}),cleanup(){}})};
    const result=await w.pdfExtractor.extractTextFromPageRange(1,1,()=>{},{skipUnreadable:true});assert.equal(result.extractedPages.length,1);assert.ok(result.text.includes('Photosynthesis'));
  });
  await test('Cancelling a stalled PDF page read closes extraction immediately',async({w})=>{
    w.eval(read('js/pdf-extractor.js'));const controller=new w.AbortController();let begin;const started=new Promise(resolve=>begin=resolve);
    w.pdfExtractor.currentDoc={numPages:1,getPage:async()=>({getTextContent:()=>{begin();return new Promise(()=>{});},cleanup(){}})};
    const task=w.pdfExtractor.extractTextFromPageRange(1,1,()=>{},{signal:controller.signal});await started;controller.abort();
    let timer;try{await assert.rejects(Promise.race([task,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('PDF cancellation stalled')),150))]),{name:'AbortError'});}finally{clearTimeout(timer);}
  });
  await test('Stalled PDF reads stop at the deadline instead of silently skipping every page',async({w})=>{
    w.eval(read('js/pdf-extractor.js'));const reader=w.pdfExtractor;reader.READ_TIMEOUT_MS=10;let visits=0;
    reader.currentDoc={numPages:2,getPage:async()=>{visits++;return {getTextContent:()=>new Promise(()=>{}),cleanup(){}};}};
    await assert.rejects(reader.extractTextFromPageRange(1,2,()=>{},{skipUnreadable:true}),error=>error.code==='PDF_READ_TIMEOUT');assert.equal(visits,1);
  });
  await test('A connection-status body that never finishes cannot hold generation open',async({w})=>{
    const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{"configured":');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      w.aiClient._serverKeyConfigured=null;w.aiClient._probePromise=null;w.aiClient.PROBE_TIMEOUT_MS=30;
      w.fetch=(url,init)=>fetch(`http://127.0.0.1:${server.address().port}/status`,init);
      assert.equal(await w.aiClient.probeServerKey(),false);assert.equal(w.aiClient.inFlightCount,0);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  await test('An interrupted run keeps ready questions and offers continue or direct start',async({w})=>{
    w.eval(read('js/sanitizer.js'));w.UIUtils={buildViewHero:()=>''};const toasts=[];let active=false;
    const controller=new w.AbortController();w.app={currentView:'create-quiz',refreshIcons(){},showToast:text=>toasts.push(text),beginGeneration:()=>active=true,getGenerationContext:()=>({id:1,signal:controller.signal}),endGeneration:()=>active=false,handleGenerationProgress(){}};
    w.eval(read('js/views/create-quiz.js'));const view=w.createQuizView;view.activeSource='TEXT';view.customTopicTitle='Addition';view.selectedQuestionCount=5;
    const state={title:'Reviewed partial quiz',questions:[{...question(1),aiReviewed:true}],totalSourceChunks:0,sentChunks:[]};
    w.geminiService.generateQuiz=async()=>{throw Object.assign(Error('Temporary API failure'),{retryState:state});};
    await view.generateQuiz();assert.equal(active,false);assert.equal(view.generationDraft.state.questions.length,1);assert.equal(w.document.querySelector('.quiz-preview'),null);
    assert.ok(w.document.querySelector('.quiz-draft-banner').textContent.includes('Continue quiz'));assert.ok(w.document.querySelector('.quiz-draft-banner').textContent.includes('Start 1 ready questions'));assert.ok(toasts.at(-1).includes('Temporary API failure'));
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
