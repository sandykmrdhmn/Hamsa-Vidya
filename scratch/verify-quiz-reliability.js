/** Quiz regression tests. Isolated storage, transactional DB double and mocked AI only. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0,failed=0;
const tables=['quizzes','questions','attempts','notes','customDecks','customCards','cardReviews','exams','savedExams','answers','answerDrafts','aiTeacherExplanations'];
function database(){
  const db={};const chain={stores(){return chain;},upgrade(){return chain;}};db.version=()=>chain;
  for(const name of tables){
    const table={rows:[],next:1,fail:false};
    table.add=async row=>{if(table.fail) throw Error('Storage full');const id=row.id??table.next++;table.rows.push({...clone(row),id});return id;};
    table.bulkAdd=async rows=>{for(const row of rows) await table.add(row);};
    table.bulkPut=async rows=>{for(const row of rows){await table.delete(row.id);await table.add(row);}};
    table.get=async id=>clone(table.rows.find(row=>row.id===id)||null);
    table.update=async(id,changes)=>{if(table.fail) throw Error('Storage full');const row=table.rows.find(row=>row.id===id);if(!row) return 0;Object.assign(row,clone(changes));return 1;};
    table.delete=async id=>{table.rows=table.rows.filter(row=>row.id!==id);};
    table.clear=async()=>{table.rows=[];};
    const query=(predicate=()=>true,reverse=false)=>({toArray:async()=>{const rows=table.rows.filter(predicate).map(clone);return reverse?rows.reverse():rows;},delete:async()=>{table.rows=table.rows.filter(row=>!predicate(row));},modify:async updates=>{table.rows.filter(predicate).forEach(row=>Object.assign(row,updates));},reverse:()=>query(predicate,true),count:async()=>table.rows.filter(predicate).length});
    table.toArray=query().toArray;table.count=query().count;table.filter=predicate=>query(predicate);table.orderBy=()=>query();table.where=field=>({equals:value=>query(row=>row[field]===value)});table.toCollection=()=>query();db[name]=table;
  }
  db.transaction=async(...args)=>{const snapshot=tables.map(name=>({name,rows:clone(db[name].rows),next:db[name].next}));try{return await args.at(-1)();}catch(error){snapshot.forEach(({name,rows,next})=>Object.assign(db[name],{rows,next}));throw error;}};
  return db;
}
function fixture({db=false,app=false}={}){
  const dom=new JSDOM('<main><section id="view-create-quiz"></section><section id="view-quiz-player"></section><section id="view-quiz-result"></section><section id="view-quiz-history"></section><section id="view-library"></section></main><div id="generating-overlay"></div><div id="generating-title"></div><div id="confirmation-modal"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.console={log(){},warn(){},error(){}};w.alert=()=>{};w.scrollTo=()=>{};w.toasts=[];w.HamsaCharts={renderDonutChart(){}};
  w.app={currentView:'',endGeneration(){},refreshIcons(){},showToast(text,type){w.toasts.push({text,type});},showConfirmation(config){w.confirmation=config;},navigate(view){this.currentView=view;},startQuiz(id){w.started=id;},viewQuizResult(id,hash,attempt){w.viewed={id,attempt};},checkAndUpdateStreak(){}};
  w.UIUtils={buildViewHero:()=>'',escapeJs:String};
  for(const file of ['js/pdf-reader.js','js/sanitizer.js','js/quiz-quality.js','js/study-format.js','js/quiz-source.js','js/quiz-engine.js']) w.eval(read(file));
  if(db){w.testDb=database();w.Dexie=function(){return w.testDb;};w.eval(read('js/db.js'));}
  if(app){let src=read('js/app.js');src=src.slice(0,src.lastIndexOf("document.addEventListener('DOMContentLoaded'"));w.eval(src);w.app.showToast=(text,type)=>w.toasts.push({text,type});w.app.refreshIcons=()=>{};}
  const load=file=>w.eval(read(file));return {dom,w,load,close:()=>dom.window.close()};
}
async function test(name,run){let f;try{f=fixture();await run(f);passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}finally{f?.close();}}
const question=(n=1,extra={})=>({questionText:`What is the result of ${n} + 1?`,options:[String(n+1),String(n+2),String(n+3),String(n+4)],correctAnswerIndex:0,explanation:`Adding one to ${n} gives ${n+1}.`,optionExplanations:['Adding one gives this result.','This adds two instead of one.','This adds three instead of one.','This adds four instead of one.'],topic:'Addition',...extra});
const engineFixture=f=>{
  const {w,load}=f;load('js/gemini-service.js');const svc=w.geminiService;svc.isAiAvailable=()=>true;svc.getTransportMode=()=> 'DIRECT';svc.discoverAvailableModels=async()=>['gemini-3.6-flash'];w.QuizQuality.wait=async(ms,signal)=>w.QuizQuality.abort(signal);
  return {w,svc,options:{sourceType:'TOPIC',sourceTitle:'Addition',subject:'Mathematics',questionCount:2,language:'ENGLISH',settings:{level:'CLASS_6_8'}}};
};
const response=data=>{
  if(data.reviews) data={...data,reviews:data.reviews.map(review=>({correctAnswerIndex:0,optionExplanations:['Independent correct reasoning','Independent distractor reasoning','Independent distractor reasoning','Independent distractor reasoning'],...review}))};
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});
};
const sourceFixture=f=>{
  const ctx=engineFixture(f),{w,svc,options}=ctx;
  options.sourceType='PDF';options.questionCount=5;
  options.sourcePages=Array.from({length:20},(_,i)=>({pageNumber:i+1,text:`Addition uses arithmetic principles. Topic ${i+1}. `+'Source material. '.repeat(750)}));
  const stats={reads:0,writes:0,reviews:0,active:0,maxActive:0,discoveries:0};
  svc.discoverAvailableModels=async()=>{stats.discoveries++;return ['gemini-3.6-flash'];};
  w.aiClient={fetchGenerateContent:async(model,payload,{signal}={})=>{
    const prompt=payload.contents[0].parts[0].text;
    if(prompt.startsWith('Read this source')) {
      stats.reads++;stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);
      try {
        await new Promise(resolve=>setTimeout(resolve,2));w.QuizQuality.abort(signal);
        const page=Number(prompt.match(/\[PAGE (\d+)\]/)[1]);
        return response({facts:[{fact:'Addition uses arithmetic.',quote:'Addition uses arithmetic principles.',page,topic:'Addition'}]});
      } finally {stats.active--;}
    }
    if(prompt.startsWith('Independently solve')) {
      stats.reviews++;
      const questions=JSON.parse(prompt.split('QUESTIONS:\n')[1]);
      assert.ok(questions.every(q=>!('correctAnswerIndex' in q)&&!('explanation' in q)));
      return response({reviews:questions.map((_,index)=>({index,verdict:'ACCEPT',reason:'Independently verified arithmetic reasoning.'}))});
    }
    assert.ok(prompt.startsWith('Create exactly'));assert.equal(stats.active,0);
    assert.equal(stats.reads,0);assert.ok(prompt.length<18000);stats.writes++;
    const count=Number(prompt.match(/Create exactly (\d+)/)[1]);
    return response({questions:Array.from({length:count},(_,i)=>question(i+1,{sourcePage:1,evidenceQuote:'Addition uses arithmetic principles.'}))});
  }};
  return {...ctx,stats};
};

(async()=>{
  await test('Missing, fractional and out-of-range answer keys are rejected',({w})=>{for(const key of [undefined,null,-1,4,'4','1.5',false]){const q=question();q.correctAnswerIndex=key;assert.equal(w.QuizQuality.normalize(q),null);}});
  await test('Letter, numeric string and option-text keys normalize explicitly',({w})=>{for(const [key,index] of [['B',1],['(C)',2],['0',0],['2',2]]) assert.equal(w.QuizQuality.normalize(question(1,{correctAnswerIndex:key})).correctAnswerIndex,index);});
  await test('Object options survive normalization and malformed/placeholder options do not',({w})=>{assert.deepEqual(Array.from(w.QuizQuality.normalize(question(1,{options:{A:'2',B:'3',C:'4',D:'5'}})).options),['2','3','4','5']);for(const options of [['A','B','C'],['2','2','4','5'],['Option A','Option B','Option C','Option D'],['','','','']]) assert.equal(w.QuizQuality.normalize(question(1,{options})),null);});
  await test('True/false keeps two options and explanation is required for generated questions',({w})=>{assert.equal(w.QuizQuality.normalize(question(1,{options:['True','False']})).options.length,2);assert.equal(w.QuizQuality.normalize(question(1,{explanation:''})),null);assert.ok(w.QuizQuality.normalize(question(1,{explanation:''}),{extraction:true}));});
  await test('JSON parser preserves escapes and rejects invalid JSON without inventing keys',({w})=>{const data={questions:[question(1,{questionText:'Say "Hello" and use C:\\notes\nnext'})]};assert.equal(w.QuizQuality.result('```json\n'+JSON.stringify(data)+'\n```').questions[0].questionText,data.questions[0].questionText);assert.equal(w.QuizQuality.result('{"questions":['),null);assert.equal(w.QuizQuality.result({questions:[{questionText:'Bad',options:['a','b']}]}).invalidCount,1);});
  await test('Deduplication and question fingerprint detect edits',({w})=>{assert.equal(w.QuizQuality.unique([question(),question(1,{questionText:'  What is the result of 1 + 1? '})]).length,1);assert.notEqual(w.QuizQuality.fingerprint([question()]),w.QuizQuality.fingerprint([question(2)]));});
  await test('Source chunks retain tail content and real page numbers',({w})=>{const text='a'.repeat(45000)+'TAIL';const chunks=w.QuizQuality.chunks(text,[],10000);assert.equal(chunks.map(c=>c.text).join(''),text);const pages=[{pageNumber:9,text:'A sourced fact about cells.',fileName:'chapter.pdf'}];assert.equal(w.QuizQuality.sourcePages('',pages)[0].pageNumber,9);assert.ok(w.QuizQuality.chunks('',pages)[0].text.includes('[PAGE 9]'));});
  await test('Duplicate stems with conflicting keys are excluded instead of picking a key',({w})=>{assert.equal(w.QuizQuality.unique([question(),question(1,{correctAnswerIndex:1})]).length,0);});
  await test('PDF MCQs require both a real question quote and printed key evidence',async f=>{const {w,svc}=engineFixture(f);const pages=[{pageNumber:1,text:'1. What is the result of 1 + 1? A. 2 B. 3 C. 4 D. 5'},{pageNumber:2,text:'Answer Key\n1. A'}];const q=question(1,{sourceQuestionNumber:1,sourcePage:1,evidenceQuote:'What is the result of 1 + 1?',keySourcePage:2,keyEvidenceQuote:'1. A'});w.aiClient={fetchGenerateContent:async()=>response({found:true,questions:[q]})};const options={sourcePages:pages,sourceContent:pages.map(p=>p.text).join('\n'),sourceTitle:'Book'};const imported=await svc.detectAndExtractExistingQuiz(options);assert.equal(imported.questions.length,1);assert.equal(imported.questions[0].answerOrigin,'SOURCE_KEY');assert.equal(imported.questions[0].keySourcePage,2);q.keyEvidenceQuote='1. B';const rejected=await svc.detectAndExtractExistingQuiz(options);assert.equal(rejected.questions.length,0);assert.ok(rejected.invalidCount>0);});
  await test('Source quotes match actual pages/notes; topic-only never gets a fake citation',({w})=>{const pages=[{pageNumber:9,text:'A sourced fact about cells.'}];assert.equal(w.QuizQuality.ground(question(1,{sourcePage:1,evidenceQuote:'A sourced fact about cells.'}),pages),null);assert.ok(w.QuizQuality.ground(question(1,{sourcePage:9,evidenceQuote:'A sourced fact about cells.'}),pages).sourceMatched);assert.equal(w.QuizQuality.ground(question(1,{evidenceQuote:'Invented notes fact'}),[],'Actual notes about adding one.'),null);assert.equal(w.QuizQuality.ground(question(1,{sourcePage:1,evidenceQuote:'Invented'}),[]).sourcePage,null);});
  await test('Abortable waiting stops immediately',async({w})=>{const controller=new w.AbortController(),waiting=w.QuizQuality.wait(10000,controller.signal);controller.abort();await assert.rejects(waiting,{name:'AbortError'});});
  await test('AI generation needs an independent review and returns exact requested count',async f=>{const {w,svc,options}=engineFixture(f);const calls=[];w.aiClient={fetchGenerateContent:async(model,payload)=>{const prompt=payload.contents[0].parts[0].text;calls.push(prompt);return response(prompt.startsWith('Independently solve')?{reviews:[0,1].map(index=>({index,verdict:'ACCEPT',reason:'Independent calculation confirms the answer.'}))}:{title:'Addition',questions:[question(1),question(2)]});}};const result=await svc.generateQuiz(options);assert.equal(result.questions.length,2);assert.ok(result.questions.every(q=>q.aiReviewed&&q.answerOrigin==='AI_GENERATED'));assert.equal(calls.length,2);assert.ok(calls[0].includes('CLASS_6_8'));assert.ok(result.questions.every(q=>q.sourcePage===null));});
  await test('Rejected/duplicate questions are refilled rather than silently shortening the quiz',async f=>{const {w,svc,options}=engineFixture(f);let generation=0,reviews=0;w.aiClient={fetchGenerateContent:async(model,payload)=>{const prompt=payload.contents[0].parts[0].text;if(prompt.startsWith('Independently solve')){reviews++;return response({reviews:reviews===1?[{index:0,verdict:'ACCEPT',reason:'Correct'},{index:1,verdict:'REJECT',reason:'Ambiguous'}]:[{index:0,verdict:'ACCEPT',reason:'Correct'}]});}generation++;return response({questions:generation===1?[question(1),question(2)]:[question(1),question(3)]});}};const result=await svc.generateQuiz(options);assert.equal(result.questions.length,2);assert.equal(result.questions[1].questionText,question(3).questionText);assert.equal(generation,2);});
  await test('Failed batch exposes a checkpoint and retry reuses accepted questions',async f=>{const {w,svc,options}=engineFixture(f);let fail=false;options.questionCount=3;w.aiClient={fetchGenerateContent:async(model,payload)=>{const prompt=payload.contents[0].parts[0].text;if(fail) throw Error('Network offline');if(prompt.startsWith('Independently solve')){fail=true;return response({reviews:[{index:0,verdict:'ACCEPT',reason:'Correct'}]});}return response({questions:[question(1)]});}};let state;try{await svc.generateQuiz(options);}catch(error){state=error.retryState;}assert.equal(state.questions.length,1);w.aiClient.fetchGenerateContent=async(model,payload)=>response(payload.contents[0].parts[0].text.startsWith('Independently solve')?{reviews:[0,1].map(index=>({index,verdict:'ACCEPT',reason:'Correct'}))}:{questions:[question(2),question(3)]});const result=await svc.generateQuiz({...options,retryState:state});assert.equal(result.questions.length,3);assert.equal(result.questions[0].questionText,question(1).questionText);});
  await test('Long notes use bounded direct excerpts and disclose sampled coverage',async f=>{const {w,svc,options}=engineFixture(f);options.sourceType='TEXT';options.sourceContent=('Addition uses arithmetic principles. ').repeat(1200)+'The final topic concerns decimals.';options.questionCount=1;let calls=0;w.aiClient={fetchGenerateContent:async(model,payload)=>{calls++;const prompt=payload.contents[0].parts[0].text;assert.ok(prompt.length<18000);assert.ok(!prompt.startsWith('Read this source'));if(prompt.startsWith('Independently solve'))return response({reviews:[{index:0,verdict:'ACCEPT',reason:'Supported by notes'}]});return response({questions:[question(1,{evidenceQuote:'Addition uses arithmetic principles.'})]});}};const result=await svc.generateQuiz(options);assert.equal(calls,2);assert.equal(result.coverage.totalChunks,w.QuizQuality.chunks(options.sourceContent,[],6000).length);assert.equal(result.coverage.sampled,true);assert.ok(result.questions[0].sourceMatched);});
  await test('Cancellation interrupts model fallback and prevents a generation result',async f=>{const {w,svc,options}=engineFixture(f);const controller=new w.AbortController();let calls=0;w.aiClient={fetchGenerateContent:async()=>{calls++;controller.abort();throw new w.DOMException('Cancelled','AbortError');}};await assert.rejects(svc.generateQuiz({...options,signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);});
  await test('Blank PDF pages fail before any AI call',async f=>{const {w,svc,options}=engineFixture(f);let calls=0;w.aiClient={fetchGenerateContent:async()=>{calls++;}};await assert.rejects(svc.generateQuiz({...options,sourceType:'PDF',sourcePages:[{pageNumber:1,text:''}]}),/no readable text/);assert.equal(calls,0);});
  await test('Daily quota errors do not trigger repeated fallback requests',async f=>{const {w,svc,options}=engineFixture(f);let calls=0;w.aiClient={describeError:async()=> 'Daily quota exhausted',fetchGenerateContent:async()=>{calls++;return Response.json({error:{}},{status:429});}};await assert.rejects(svc.generateQuiz(options),/Daily quota/);assert.equal(calls,1);});
  await test('Storage validates before writing and preserves detailed learning metadata',async()=>{const f=fixture({db:true});try{const {w}=f;await assert.rejects(w.saveNewQuiz({},[question(1,{correctAnswerIndex:undefined})]));assert.equal(w.testDb.quizzes.rows.length,0);const id=await w.saveNewQuiz({title:'Test',generationModel:'test-model'},[question(1,{correctAnswerIndex:'B',optionExplanations:['one','two','three','four'],memoryCue:'Add one',aiReviewed:true})]);const quiz=await w.getQuizWithQuestions(id);assert.equal(quiz.questions[0].correctAnswerIndex,1);assert.equal(quiz.questions[0].memoryCue,'Add one');assert.equal(quiz.questions[0].optionExplanations[1],'two');assert.equal(quiz.generationModel,'test-model');}finally{f.close();}});
  await test('Failed quiz storage rolls back parent and questions together',async()=>{const f=fixture({db:true});try{f.w.testDb.questions.fail=true;await assert.rejects(f.w.saveNewQuiz({},[question()]),/Storage full/);assert.equal(f.w.testDb.quizzes.rows.length,0);}finally{f.close();}});
  await test('Attempts keep independent answer snapshots and submit retry is idempotent',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({title:'Quiz',quizMode:'EXAM'},[question()]);const q=(await w.getQuizWithQuestions(id)).questions[0];const one=await w.updateQuizCompletion(id,{attemptToken:'one',percentage:100,correct:1,incorrect:0,skipped:0},[{...q,userSelectedOptionIndex:0}]);const two=await w.updateQuizCompletion(id,{attemptToken:'two',percentage:0,correct:0,incorrect:1,skipped:0},[{...q,userSelectedOptionIndex:1}]);assert.notEqual(one,two);assert.equal((await w.getQuizAttemptResult(id,one)).questions[0].userSelectedOptionIndex,0);assert.equal((await w.getQuizAttemptResult(id,two)).questions[0].userSelectedOptionIndex,1);assert.equal(await w.updateQuizCompletion(id,{attemptToken:'one'},[]),one);assert.equal(w.testDb.attempts.rows.length,2);assert.equal((await w.getQuizAttemptResult(id)).attemptId,two);}finally{f.close();}});
  await test('Deleting one attempt preserves the quiz/bookmark and restores remaining summary',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({title:'Quiz'},[question()]);const q=(await w.getQuizWithQuestions(id)).questions[0];await w.updateQuestionBookmark(q.id,true);const one=await w.updateQuizCompletion(id,{percentage:100,correct:1,incorrect:0,skipped:0},[{...q,isBookmarked:1,userSelectedOptionIndex:0}]);const two=await w.updateQuizCompletion(id,{percentage:0,correct:0,incorrect:1,skipped:0},[{...q,isBookmarked:1,userSelectedOptionIndex:1}]);await w.deleteQuizAttempts([`attempt:${two}`]);const quiz=await w.getQuizWithQuestions(id);assert.equal(quiz.percentage,100);assert.equal(quiz.questions[0].isBookmarked,1);assert.equal(quiz.questions[0].userSelectedOptionIndex,0);assert.equal(w.testDb.attempts.rows[0].id,one);await w.deleteQuizAttempts([`attempt:${one}`]);assert.equal((await w.getQuizWithQuestions(id)).completedAt,null);assert.equal(w.testDb.questions.rows.length,1);}finally{f.close();}});
  await test('Quiz deletion removes only related flashcard reviews',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({},[question()]);const q=(await w.getQuizWithQuestions(id)).questions[0];await w.testDb.cardReviews.add({cardKey:`q:${q.id}`});await w.testDb.cardReviews.add({cardKey:'note_9:energy'});await w.deleteQuiz(id);assert.equal(w.testDb.quizzes.rows.length,0);assert.deepEqual(w.testDb.cardReviews.rows.map(r=>r.cardKey),['note_9:energy']);}finally{f.close();}});
  await test('Question corrections affect future quizzes and leave completed snapshots unchanged',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({},[question()]);const q=(await w.getQuizWithQuestions(id)).questions[0];const attempt=await w.updateQuizCompletion(id,{correct:1,percentage:100},[{...q,userSelectedOptionIndex:0}]);await w.updateQuizQuestion(q.id,{correctAnswerIndex:1,explanation:'Revised reasoning'});assert.equal((await w.getQuizWithQuestions(id)).questions[0].correctAnswerIndex,1);assert.equal((await w.getQuizAttemptResult(id,attempt)).questions[0].correctAnswerIndex,0);assert.equal((await w.getQuizWithQuestions(id)).questions[0].answerOrigin,'STUDENT_EDITED');}finally{f.close();}});
  await test('Legacy attempt without snapshots shows no fabricated per-question answers',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({},[question()]);const attempt=await w.testDb.attempts.add({quizId:id,attemptedAt:new Date().toISOString(),percentage:50});const result=await w.getQuizAttemptResult(id,attempt);assert.equal(result.legacySnapshotMissing,true);assert.equal(result.questions.length,0);}finally{f.close();}});
  await test('Player resets time-up state and ignores impossible true/false choices',({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'PRACTICE'};p.questions=[question(1,{id:1,options:['True','False']})];p._timeUpHandled=true;p._resetAttemptState();p.render=()=>{};p.selectOption(2);assert.equal(p._timeUpHandled,false);assert.equal(p.lockedQuestions.size,0);p.selectOption(0);assert.equal(p.userAnswers[1],0);assert.ok(w.localStorage.getItem('hamsa_active_quiz_attempt'));});
  await test('Exam Clear Response unlocks a selection and terminal state never re-persists',({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'EXAM',examDurationSeconds:300};p.questions=[question(1,{id:1})];p._resetAttemptState();p.render=()=>{};p.selectOption(1);p.clearResponse();assert.equal(p.userAnswers[1],undefined);p._terminal=true;p._clearSavedProgress();p.onLeaveView();assert.equal(w.localStorage.getItem('hamsa_active_quiz_attempt'),null);});
  await test('Restored progress discards invalid answers and clamps stale timer data',({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'EXAM',examDurationSeconds:300};p.questions=[question(1,{id:1})];p._applySavedProgress({userAnswers:{1:9,88:0},currentIndex:1.5,remainingSeconds:999999,elapsedSeconds:Infinity,locked:[1,88],flagged:[88]});assert.equal(Object.keys(p.userAnswers).length,0);assert.equal(p.currentIndex,0);assert.equal(p.flaggedQuestions.size,0);assert.ok(p.getRemainingSeconds()<=300);assert.equal(p.accumulatedSeconds,0);});
  await test('Submission failure preserves responses and retry records the chosen attempt',async({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'PRACTICE'};p.questions=[question(1,{id:1})];p._resetAttemptState();p.userAnswers[1]=0;p.render=()=>{};w.computeQuizScore=()=>({correct:1,marksObtained:1,maxMarks:1,marksLostToNegative:0});w.updateQuizCompletion=async()=>{throw Error('Storage full');};await p.submitQuiz();assert.equal(p._terminal,false);assert.equal(p.userAnswers[1],0);assert.ok(w.localStorage.getItem('hamsa_active_quiz_attempt'));w.updateQuizCompletion=async()=>42;await p.submitQuiz();assert.equal(p._terminal,true);assert.equal(w.localStorage.getItem('hamsa_active_quiz_attempt'),null);assert.equal(w.viewed.attempt,42);});
  await test('Focused native controls and cancelled events do not trigger quiz navigation',({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={quizMode:'PRACTICE'};p.questions=[question(1,{id:1}),question(2,{id:2})];p._resetAttemptState();p.attachKeyboard();const button=w.document.createElement('button');w.document.body.append(button);button.focus();w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(p.currentIndex,0);p._handleKey({key:'Enter',defaultPrevented:true});assert.equal(p.currentIndex,0);p.detachKeyboard();});
  await test('Result filters separate skipped/wrong and show at most ten review cards',({w,load})=>{load('js/views/quiz-result.js');const r=w.quizResultView;r.quiz={id:1,title:'Quiz',correct:1,incorrect:1,skipped:11,percentage:8};r.questions=Array.from({length:13},(_,i)=>question(i+1,{id:i+1,userSelectedOptionIndex:i===0?0:i===1?1:null}));r.render();assert.equal(r.container.querySelectorAll('.review-item-card').length,10);r.setFilter('INCORRECT');assert.equal(r.container.querySelectorAll('.review-item-card').length,1);r.setFilter('SKIPPED');assert.equal(r.container.querySelectorAll('.review-item-card').length,10);assert.ok(r.container.textContent.includes('Skipped (11)'));});
  await test('Result raw question text and model strings are escaped',({w,load})=>{load('js/views/quiz-result.js');const r=w.quizResultView;r.quiz={id:1,subject:'General',percentage:0};r.questions=[question(1,{id:1,questionText:'<img src=x onerror="alert(1)">',userSelectedOptionIndex:null})];r.render();assert.equal(r.container.querySelectorAll('img').length,0);r.activeDoubtQuestion=r.questions[0];r.doubtHistory=[{role:'model',text:'Text',model:'<img src=x onerror=alert(1)>',note:'<script>bad</script>'}];const temp=w.document.createElement('div');temp.innerHTML=r.renderDoubtDrawerContent();assert.equal(temp.querySelectorAll('img,script').length,0);});
  await test('Bookmark failure rolls back optimistic state',async({w,load})=>{load('js/views/quiz-result.js');const r=w.quizResultView;r.quiz={id:1};r.questions=[question(1,{id:1,isBookmarked:0})];r.render=()=>{};w.updateQuestionBookmark=async()=>{throw Error('Storage full');};await r.toggleReviewBookmark(1);assert.equal(r.questions[0].isBookmarked,0);assert.ok(w.toasts.some(t=>t.type==='error'));});
  await test('Doubt solver rejects concurrent requests and stale responses from another question',async({w,load})=>{load('js/views/quiz-result.js');const r=w.quizResultView;r.quiz={id:1};r.questions=[question(1,{id:1}),question(2,{id:2})];r.render();let resolve,calls=0;w.geminiService={solveQuestionDoubt:()=>{calls++;return new Promise(done=>resolve=done);}};r.openDoubtSolver(1);assert.equal(calls,0);const pending=r.askDoubt('deep-rationale');const controller=r._doubtController;await r.askDoubt('custom','Another');assert.equal(calls,1);r.closeDoubtSolver();assert.equal(controller.signal.aborted,true);r.activeDoubtQuestion=r.questions[1];r.isDoubtDrawerOpen=true;resolve({text:'Old question response'});await pending;assert.equal(r.doubtHistory.filter(turn=>turn.role==='model').length,0);});
  await test('Doubt offline fallback gives saved facts without invented reasons or claiming to answer custom queries',({w,load})=>{load('js/gemini-service.js');const svc=w.geminiService;const result=svc.generateDeterministicDoubtExplanation({...question(),promptType:'custom',studentQuery:'What is gravity?'});assert.ok(result.note.includes('cannot answer'));assert.equal(result.model,'Saved explanation');assert.ok(!result.text.includes('empirical verification'));const reasons=svc.generateDeterministicDoubtExplanation({...question(),promptType:'why-wrong',optionExplanations:['Saved correct reasoning','Saved wrong reasoning']});assert.ok(reasons.text.includes('Saved wrong reasoning'));});
  await test('Doubt labels the selected model, never hops models and respects abort',async({w,load})=>{
    load('js/gemini-service.js');const svc=w.geminiService;svc.isAiAvailable=()=>true;const calls=[];
    w.aiClient={fetchGenerateContent:async model=>{calls.push(model);return Response.json({candidates:[{content:{parts:[{text:'Actual explanation'}]},finishReason:'STOP'}]});}};
    const result=await svc.solveQuestionDoubt(question());assert.equal(result.model,'gemini-3.6-flash');assert.deepEqual(calls,['gemini-3.6-flash']);
    w.aiClient.fetchGenerateContent=async model=>{calls.push(model);return Response.json({error:{message:'Unavailable'}},{status:404});};
    const saved=await svc.solveQuestionDoubt(question());assert.equal(saved.model,'Saved explanation');assert.equal(calls.length,2);
    const controller=new w.AbortController();controller.abort();await assert.rejects(svc.solveQuestionDoubt({...question(),signal:controller.signal}),{name:'AbortError'});
  });
  await test('Clipboard errors never show success',async({w,load})=>{load('js/views/quiz-result.js');w.navigator.clipboard={writeText:async()=>{throw Error('Denied');}};w.quizResultView.doubtHistory=[{text:'Explanation'}];await w.quizResultView.copyDoubtText(0);assert.ok(w.toasts.some(t=>t.type==='error'));assert.ok(!w.toasts.some(t=>t.type==='success'));});
  await test('Create form renders safely and clearing custom subject restores the preset',async({w,load})=>{load('js/views/create-quiz.js');const c=w.createQuizView;c.customSubject='Custom';c.selectedSubject='Custom';c.onCustomSubjectInput('');assert.equal(c.selectedSubject,'Indian Polity');c.customTopicTitle='"><img src=x onerror=alert(1)>';c.notesText='</textarea><script>alert(1)</script>';c.activeSource='TEXT';await c.render();assert.equal(c.container.querySelectorAll('img,script').length,0);assert.equal(w.document.getElementById('topic-title-input').value,c.customTopicTitle);});
  await test('Creation has no manual review screen and flagged saved drafts cannot start',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;
    c.generationDraft={options:{questionCount:12,sourceTitle:'Test'},result:{title:'Test',questions:Array.from({length:12},(_,i)=>question(i+1))}};
    await c.render();assert.equal(c.container.querySelector('.quiz-preview'),null);assert.ok(!c.container.textContent.includes('Review your quiz before starting'));
    c.generationDraft.editedQuestions={[w.QuizQuality.stem(question().questionText)]:question(1,{reviewIssue:true})};c.persistDraft();
    let saved=0;w.saveNewQuiz=async()=>++saved;await assert.rejects(c.saveReadyQuiz(),/need correction/);assert.equal(saved,0);assert.ok(w.localStorage.getItem('hamsa_quiz_generation_draft'));
  });

  await test('PDF reader rejects oversized files, releases old documents, and catches blank pages',async({w,load})=>{let destroyed=0;const doc=()=>({numPages:1,destroy:async()=>destroyed++,getPage:async()=>({getTextContent:async()=>({items:[]}),cleanup(){}})});w.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(doc()),destroy:async()=>{}})};load('js/pdf-extractor.js');await assert.rejects(w.pdfExtractor.loadPdfFile({name:'BIG.PDF',type:'',size:201*1048576}),/200 MB/);const file={name:'Valid.PDF',type:'',size:100,arrayBuffer:async()=>new ArrayBuffer(1)};await w.pdfExtractor.loadPdfFile(file);await w.pdfExtractor.loadPdfFile(file);assert.equal(destroyed,1);await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,1),/no readable text/);w.pdfExtractor.clear();assert.equal(destroyed,2);});
  await test('PDF extraction honors selected pages and cancellation before the next page',async({w,load})=>{const seen=[];const controller=new w.AbortController();w.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:3,destroy:async()=>{},getPage:async n=>{seen.push(n);return{getTextContent:async()=>({items:[{str:`Page ${n} facts`,transform:[0,0,0,0,0,1],hasEOL:true}]}),cleanup(){}};}}),destroy:async()=>{}})};load('js/pdf-extractor.js');await w.pdfExtractor.loadPdfFile({name:'x.pdf',type:'application/pdf',size:1,arrayBuffer:async()=>new ArrayBuffer(1)});const result=await w.pdfExtractor.extractTextFromPageRange(2,2);assert.deepEqual(seen,[2]);assert.equal(result.extractedPages[0].pageNumber,2);controller.abort();await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,3,()=>{},{signal:controller.signal}),{name:'AbortError'});assert.deepEqual(seen,[2]);});
  await test('PDF paper escapes HTML, prints real scoring/time and separates answer exports',({w,load})=>{load('js/pdf-generator.js');w.resolveScoringConfig=()=>({marksPerCorrect:2,negativeMarkPerWrong:0.67});const quiz={title:'<script>alert(1)</script>',subject:'Science',quizMode:'EXAM',examDurationSeconds:1800};const q=question(1,{questionText:'<img src=x onerror=alert(1)>',explanation:'Rationale visible'});const full=w.pdfGenerator.buildDocumentHtml(quiz,[q]);const temp=w.document.createElement('div');temp.innerHTML=full;assert.equal(temp.querySelectorAll('script,img').length,0);assert.ok(full.includes('30m 0s'));assert.ok(full.includes('Maximum marks: 2'));assert.ok(full.includes('wrong: −0.67'));assert.ok(!full.includes('OFFICIAL'));assert.ok(!w.pdfGenerator.buildDocumentHtml(quiz,[q],{variant:'QUESTIONS'}).includes('Rationale visible'));assert.ok(!w.pdfGenerator.buildDocumentHtml(quiz,[q],{variant:'ANSWER_KEY'}).includes('<h2>Question paper</h2>'));});
  await test('History routes to attempt IDs and deletion sends only selected attempt keys',async({w,load})=>{load('js/views/quiz-history.js');w.getAttemptHistory=async()=>[{id:1,attemptId:7,title:'Test',percentage:50,totalAttempts:2,attemptNumber:1,attemptedAt:new Date().toISOString()}];const h=w.quizHistoryView;await h.render();assert.ok(h.container.innerHTML.includes('app.viewQuizResult(1,true,7)'));assert.ok(h.container.innerHTML.includes("deleteSingle('attempt:7')"));let keys;w.deleteQuizAttempts=async input=>{keys=input;};h.deleteSingle('attempt:7');await w.confirmation.onConfirm();assert.deepEqual(Array.from(keys),['attempt:7']);});
  await test('Library search maintains focus/caret and later renders win async races',async({w,load})=>{load('js/views/library.js');w.getAllQuizzes=async()=>[];w.getBookmarkedQuestions=async()=>[];w.groupBookmarksBySubject=()=>[];const library=w.libraryView;await library.render();const input=w.document.getElementById('quiz-library-search');input.value='hello';input.focus();input.setSelectionRange(2,2);library.searchQuery='hello';await library.render();assert.equal(w.document.activeElement.id,'quiz-library-search');assert.equal(w.document.activeElement.selectionStart,2);let resolve;w.getAllQuizzes=()=>new Promise(done=>resolve=done);const old=library.render();w.getAllQuizzes=async()=>[];library.searchQuery='new';await library.render();resolve([{title:'OLD',subject:'x',id:5}]);await old;assert.equal(w.document.getElementById('quiz-library-search').value,'new');});
  await test('Stale generation completion cannot close a newer job',async()=>{const f=fixture({app:true});try{const {w}=f;assert.ok(w.app.beginGeneration());const old=w.app.getGenerationContext();w.app.cancelGeneration();assert.ok(old.signal.aborted);assert.ok(w.app.beginGeneration());w.app.endGeneration(old.id);assert.equal(w.app._isGenerating,true);assert.ok(w.document.getElementById('generating-overlay').classList.contains('active'));w.app.endGeneration(w.app.getGenerationContext().id);assert.equal(w.app._isGenerating,false);}finally{f.close();}});
  await test('Printed key letter must agree with the imported answer index',({w})=>{assert.ok(w.QuizQuality.keyMatches(question(1,{keyEvidenceQuote:'1. A'})));assert.equal(w.QuizQuality.keyMatches(question(1,{keyEvidenceQuote:'1. B'})),false);assert.ok(w.QuizQuality.keyMatches(question(1,{correctAnswerIndex:1,keyEvidenceQuote:'उत्तर: (ख)'})));assert.ok(w.QuizQuality.keyMatches(question(1,{correctAnswerIndex:1,sourceQuestionNumber:2,keyEvidenceQuote:'1. A; 2. B; 3. C'})));});
  await test('Generated answers without option reasoning fail validation rather than claiming complete explanations',async f=>{const {w,svc,options}=engineFixture(f);w.aiClient={fetchGenerateContent:async()=>response({questions:[question(1,{optionExplanations:[]})]})};await assert.rejects(svc.generateQuiz(options),/incomplete or inconsistent/);});
  await test('Leaving after direct start prevents a stale background form render',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;let resolve;c._buildHero=()=>new Promise(done=>resolve=done);
    const old=c.render();c.onLeaveView();c.container.innerHTML='QUIZ STARTED';resolve('OLD HERO');await old;
    assert.equal(c.container.textContent,'QUIZ STARTED');
  });

  await test('Quiz and bookmark library pages render at most twenty entries',async({w,load})=>{load('js/views/library.js');const quizzes=Array.from({length:25},(_,i)=>({id:i+1,title:'Quiz '+i,subject:'Math',createdAt:new Date().toISOString(),totalQuestions:1}));const bookmarks=Array.from({length:25},(_,i)=>question(i+1,{id:i+1,subject:'Math',isBookmarked:1}));w.getAllQuizzes=async()=>quizzes;w.getBookmarkedQuestions=async()=>bookmarks;w.groupBookmarksBySubject=()=>[{subject:'Math',questions:bookmarks}];await w.libraryView.render();assert.equal(w.libraryView.container.querySelectorAll('.quiz-list-item').length,20);w.libraryView.page=1;await w.libraryView.render();assert.equal(w.libraryView.container.querySelectorAll('.quiz-list-item').length,5);w.libraryView.setTab('BOOKMARKS');await w.libraryView.render();assert.equal(w.libraryView.container.querySelectorAll('.review-item-card').length,20);});
  await test('Expired exam with a failed submission restores answers only for submitting again',async({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'EXAM',examDurationSeconds:300};p.questions=[question(1,{id:1})];p._resetAttemptState();p.userAnswers[1]=0;p.examDeadline=Date.now()-1;p.render=()=>{};w.computeQuizScore=()=>({correct:1,marksObtained:1,maxMarks:1});w.updateQuizCompletion=async()=>{throw Error('Storage full');};await p.submitQuiz();const saved=p._loadSavedProgress(1);assert.ok(saved.submissionPending);p._applySavedProgress(saved);assert.equal(p.userAnswers[1],0);assert.equal(p.getRemainingSeconds(),0);assert.ok(p.examDeadline);});
  await test('OCR runs only when enabled and preserves the scanned page reference',async({w,load})=>{let calls=0;const canvas=w.document.createElement('canvas');canvas.getContext=()=>({});canvas.toDataURL=()=> 'data:image/png;base64,fixture';const original=w.document.createElement.bind(w.document);w.document.createElement=tag=>tag==='canvas'?canvas:original(tag);w.geminiService={isAiAvailable:()=>true,extractTextFromImage:async()=>{calls++;return 'Scanned source text about cells.';}};w.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,destroy:async()=>{},getPage:async()=>({getTextContent:async()=>({items:[]}),getViewport:()=>({width:900,height:1200}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})}),destroy:async()=>{}})};load('js/pdf-extractor.js');await w.pdfExtractor.loadPdfFile({name:'scan.pdf',type:'application/pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(1)});await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,1),/no readable text/);assert.equal(calls,0);const result=await w.pdfExtractor.extractTextFromPageRange(1,1,()=>{},{ocr:true});assert.equal(calls,1);assert.equal(result.extractedPages[0].extractionMethod,'OCR');assert.equal(result.extractedPages[0].pageNumber,1);assert.equal(canvas.width,0);});
  await test('Malformed or orphaned attempt snapshots cannot target unrelated live questions',async()=>{const f=fixture({db:true});try{const {w}=f,id=await w.saveNewQuiz({},[question()]);const attempt=await w.testDb.attempts.add({quizId:id,attemptedAt:new Date().toISOString(),questionsSnapshot:[null,{id:1,questionText:'Bad',options:[]},question(9,{id:999})]});const result=await w.getQuizAttemptResult(id,attempt);assert.equal(result.invalidSnapshotCount,2);assert.equal(result.questions.length,1);assert.ok(result.questions[0].bookmarkUnavailable);assert.ok(result.questions[0].id<0);}finally{f.close();}});
  await test('Independent solver does not see the writer key and disagreement rejects the question',async f=>{const {w,svc,options}=engineFixture(f);options.questionCount=1;let written=0;w.aiClient={fetchGenerateContent:async(model,payload)=>{const prompt=payload.contents[0].parts[0].text;if(prompt.startsWith('Independently solve')){const questions=JSON.parse(prompt.split('QUESTIONS:\n')[1]);assert.ok(!Object.hasOwn(questions[0],'correctAnswerIndex'));assert.ok(!Object.hasOwn(questions[0],'explanation'));return response({reviews:[{index:0,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Independent worked explanation'}]});}written++;return response({questions:[question(written,{correctAnswerIndex:written===1?1:0,explanation:'Writer rationale is not shown to reviewer'})]});}};const result=await svc.generateQuiz(options);assert.equal(written,2);assert.equal(result.questions[0].questionText,question(2).questionText);assert.equal(result.questions[0].explanation,'Independent worked explanation');});
  await test('Quick drill uses student language, a real five-minute exam and saves failed batches for resume',async()=>{const f=fixture({app:true});try{const {w,load}=f;load('js/views/create-quiz.js');w.studyPreferences={get:()=>({language:'HINDI',level:'CLASS_9_10'})};w.QuizQuality.wait=async(ms,signal)=>w.QuizQuality.abort(signal);w.geminiService={generateQuiz:async options=>{assert.equal(options.language,'HINDI');assert.equal(options.quizMode,'EXAM');assert.equal(options.sourceContent,'');options.onCheckpoint({questions:[question(1,{aiReviewed:true})],title:'Drill',signature:'test'});throw Error('Daily quota reached');}};await w.app.launchQuickDrill();const draft=JSON.parse(w.localStorage.getItem('hamsa_quiz_generation_draft'));assert.equal(draft.options.examDurationSeconds,300);assert.equal(draft.options.scoringPreset,'NONE');assert.equal(draft.state.questions.length,1);assert.equal(w.app._isGenerating,false);assert.equal(draft.options.signal,undefined);}finally{f.close();}});
  await test('A stale submission cannot terminate or clear a newer quiz attempt',async({w,load})=>{load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'PRACTICE'};p.questions=[question(1,{id:1})];p._resetAttemptState();p.userAnswers[1]=0;w.computeQuizScore=()=>({correct:1,marksObtained:1,maxMarks:1});let resolve;w.updateQuizCompletion=()=>new Promise(done=>resolve=done);const old=p.submitQuiz();p.quiz={id:2,quizMode:'PRACTICE'};p.questions=[question(2,{id:2})];p._resetAttemptState();p.userAnswers[2]=0;p._persistProgress();const token=p._attemptToken;resolve(77);await old;assert.equal(p._terminal,false);assert.equal(p._attemptToken,token);assert.equal(p.userAnswers[2],0);assert.equal(JSON.parse(w.localStorage.getItem('hamsa_active_quiz_attempt')).quizId,2);assert.equal(w.viewed,undefined);});
  await test('Quiz preferences follow changed defaults while preserving a student override',({w,load})=>{load('js/study-preferences.js');load('js/views/create-quiz.js');const c=w.createQuizView;w.studyPreferences.save({level:'CLASS_9_10',exam:'Board',depth:'SIMPLE'});c.renderStudentSettings();assert.equal(c.studentSettings.level,'CLASS_9_10');w.studyPreferences.save({level:'CLASS_12_SCIENCE',exam:'NEET',depth:'DETAILED'});const html=c.renderStudentSettings();assert.equal(c.studentSettings.level,'CLASS_12_SCIENCE');assert.equal(c.studentSettings.exam,'NEET');assert.ok(html.includes('value="CLASS_12_SCIENCE" selected'));c.studentSettings.exam='My exam';w.studyPreferences.save({level:'COLLEGE',exam:'New default',depth:'SIMPLE'});c.renderStudentSettings();assert.equal(c.studentSettings.exam,'My exam');assert.equal(c.studentSettings.level,'COLLEGE');});
  await test('Mixed PDF skips unreadable pages and retains original page numbers',async({w,load})=>{
    load('js/pdf-extractor.js');let cleaned=0;
    w.pdfExtractor.currentDoc={numPages:5,getPage:async n=>{if(n===3)throw Error('Broken page');return {getTextContent:async()=>{if(n===4)throw Error('Unreadable encoding');return {items:n===2?[]:[{str:n===5?'\uFFFD':'Readable facts on page 1'}]};},cleanup(){cleaned++;}};}};
    const result=await w.pdfExtractor.extractTextFromPageRange(1,5,()=>{},{skipUnreadable:true});
    assert.deepEqual(Array.from(result.extractedPages,p=>p.pageNumber),[1]);assert.deepEqual(Array.from(result.skippedPages,p=>p.pageNumber),[2,3,4,5]);assert.equal(result.pageCountSelected,5);assert.ok(!result.text.includes('[PAGE 2'));assert.equal(cleaned,4);
  });
  await test('Incompatible OCR pages are skipped while successful OCR and later text survive',async({w,load})=>{
    load('js/pdf-extractor.js');const original=w.document.createElement.bind(w.document);let zeroed=0;
    w.document.createElement=tag=>{const element=original(tag);if(tag==='canvas'){element.getContext=()=>({});element.toDataURL=()=> 'data:image/png;base64,fixture';Object.defineProperty(element,'width',{set(value){if(value===0)zeroed++;}});}return element;};
    let calls=0;w.geminiService={isAiAvailable:()=>true,extractTextFromImage:async()=>{calls++;if(calls===1)throw Error('Unsupported image');return 'Recovered scanned educational text';}};
    w.pdfExtractor.currentDoc={numPages:4,getPage:async n=>({getTextContent:async()=>({items:n===4?[{str:'Readable final page'}]:[]}),getViewport:()=>({width:900,height:1200}),render:()=>{if(n===2)throw Error('Unsupported page render');return {promise:Promise.resolve(),cancel(){}};},cleanup(){}})};
    const result=await w.pdfExtractor.extractTextFromPageRange(1,4,()=>{},{skipUnreadable:true,ocr:true});
    assert.deepEqual(Array.from(result.skippedPages,p=>p.pageNumber),[1,2]);assert.deepEqual(Array.from(result.extractedPages,p=>p.pageNumber),[3,4]);assert.equal(result.extractedPages[0].extractionMethod,'OCR');assert.equal(calls,2);assert.equal(zeroed,3);
  });
  await test('All-unreadable PDFs report skipped pages and cancellation is never swallowed',async({w,load})=>{
    load('js/pdf-extractor.js');w.pdfExtractor.currentDoc={numPages:3,getPage:async()=>({getTextContent:async()=>({items:[]}),cleanup(){}})};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(2,3,()=>{},{skipUnreadable:true}),error=>error.skippedPages.length===2&&error.message.includes('2, 3'));
    const controller=new w.AbortController();let visited=0;w.pdfExtractor.currentDoc.getPage=async()=>{visited++;controller.abort();throw Error('Stopped');};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,3,()=>{},{skipUnreadable:true,signal:controller.signal}),{name:'AbortError'});assert.equal(visited,1);
  });
  await test('Skipping unreadable pages does not bypass the source size limit',async({w,load})=>{
    load('js/pdf-extractor.js');w.pdfExtractor.currentDoc={numPages:2,getPage:async()=>({getTextContent:async()=>({items:[{str:'x'.repeat(600000)}]}),cleanup(){}})};
    await assert.rejects(w.pdfExtractor.extractTextFromPageRange(1,2,()=>{},{skipUnreadable:true}),/1 million/);
  });
  await test('Skipped-page note is saved with the quiz and available in old results and all PDF variants',async()=>{
    const f=fixture({db:true});try{const {w,load}=f,skipped=[{pageNumber:2,reason:'No readable text'},{pageNumber:5,reason:'OCR failed'}];
      const id=await w.saveNewQuiz({skippedPdfPages:skipped},[question()]);const saved=await w.getQuizById(id);assert.equal(saved.skippedPdfPages.length,2);
      const attempt=await w.updateQuizCompletion(id,{score:1,correct:1,incorrect:0,skipped:0,percentage:100,attemptToken:'skip-note'},saved.questions);const result=await w.getQuizAttemptResult(id,attempt);assert.equal(result.skippedPdfPages[1].pageNumber,5);
      load('js/pdf-generator.js');for(const variant of ['FULL','QUESTIONS','ANSWER_KEY'])assert.ok(w.pdfGenerator.buildDocumentHtml(result,result.questions,{variant}).includes('PDF source note — skipped pages: 2'));
      load('js/views/quiz-result.js');w.quizResultView.quiz=result;w.quizResultView.questions=result.questions;w.quizResultView.triggerSuccessFanfare=()=>{};w.quizResultView.render();assert.ok(w.quizResultView.container.textContent.includes('5 (OCR failed)'));
    }finally{f.close();}
  });
  await test('PDF generation directly saves readable content and skipped-page notes',async()=>{
    const f=fixture({app:true,db:true});try{const {w,load}=f;load('js/views/create-quiz.js');w.app.handleGenerationProgress=()=>{};w.app.currentView='create-quiz';let started;w.app.startQuiz=id=>started=id;
      const c=w.createQuizView;c.activeSource='PDF';c.loadedPdfMeta={fileName:'Mixed.pdf'};c.pdfTotalPages=3;c.importSourceQuestions=false;c.selectedQuestionCount=1;
      w.pdfExtractor={extractTextFromPageRange:async(from,to,progress,options)=>{assert.equal(options.skipUnreadable,true);return {text:'Readable study facts',extractedPages:[{pageNumber:3,text:'Readable study facts'}],skippedPages:[{pageNumber:2,reason:'OCR failed'}]};}};
      w.geminiService={generateQuiz:async options=>{assert.equal(options.sourcePages[0].pageNumber,3);assert.equal(options.sourceContent,'Readable study facts');return {title:'Mixed quiz',questions:[question()]};}};
      await c.generateQuiz();assert.ok(started);const saved=await w.getQuizWithQuestions(started);assert.equal(saved.skippedPdfPages[0].pageNumber,2);
      assert.equal(saved.originalSource.pages[0].pageNumber,3);assert.equal(c.generationDraft,null);assert.equal(w.app._isGenerating,false);
    }finally{f.close();}
  });

  // Audit regressions: technical identity, recovery, corrected drills and source tools.
  const withDb=run=>async()=>{const f=fixture({db:true});try{await run(f);}finally{f.close();}};
  await test('Numbered printed keys cannot fall back to another question or conflicting entries',({w})=>{
    assert.equal(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'20. A'})),false);
    assert.equal(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'Answer: A'})),false);
    assert.ok(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'9. B; 10. A; 11. C'})));
    assert.equal(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'10. A; 10. B'})),false);
    assert.equal(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'10.A;10.B'})),false);
    assert.ok(w.QuizQuality.keyMatches(question(1,{sourceQuestionNumber:10,keyEvidenceQuote:'१०.क;10.A'})));
  });
  await test('Wrong-number source keys are excluded from the full import pipeline',async f=>{
    const {w,svc}=engineFixture(f),pages=[{pageNumber:1,text:'10. What is the result of 1 + 1? A. 2 B. 3 C. 4 D. 5'},{pageNumber:2,text:'Answer Key\n20. A'}];
    w.aiClient={fetchGenerateContent:async()=>response({found:true,questions:[question(1,{sourceQuestionNumber:10,sourcePage:1,evidenceQuote:'What is the result of 1 + 1?',keySourcePage:2,keyEvidenceQuote:'20. A'})]})};
    const result=await svc.detectAndExtractExistingQuiz({sourcePages:pages,sourceTitle:'Wrong-number fixture'});assert.equal(result.questions.length,0);assert.ok(result.invalidCount>0);
  });
  await test('Deduplication preserves operators, superscripts and case-sensitive chemistry',({w})=>{
    const plus=question(1,{questionText:'What is 5 + 2?',options:['7','3','9','1']}),minus={...plus,questionText:'What is 5 - 2?',correctAnswerIndex:1};
    assert.equal(w.QuizQuality.unique([plus,minus]).length,2);
    assert.notEqual(w.QuizQuality.stem('What is x²?'),w.QuizQuality.stem('What is x2?'));
    assert.notEqual(w.QuizQuality.stem('Define CO.'),w.QuizQuality.stem('Define Co.'));
    assert.equal(w.QuizQuality.stem('What is evaporation?'),w.QuizQuality.stem('what is evaporation?'));
  });
  await test('Source evidence preserves generic types and chemically meaningful letter case',({w})=>{
    const q=question(1,{sourcePage:1,evidenceQuote:'List<float> contains decimal numbers.'});
    assert.equal(w.QuizQuality.ground(q,[{pageNumber:1,text:'List<int> contains decimal numbers.'}]),null);
    assert.ok(w.QuizQuality.ground(q,[{pageNumber:1,text:q.evidenceQuote}]));
    assert.equal(w.QuizQuality.ground({...q,evidenceQuote:'CO contains carbon and oxygen.'},[{pageNumber:1,text:'Co contains carbon and oxygen.'}]),null);
  });
  await test('Quiz formatting renders mathematics and keeps code and unsafe markup literal',({w,load})=>{
    load('assets/vendor/marked.min.js');load('assets/vendor/katex.min.js');
    const html=w.QuizQuality.format('$$\\frac{a}{b}$$ and `List<int>` <img src=x onerror=alert(1)>');
    const holder=w.document.createElement('div');holder.innerHTML=html;assert.ok(holder.querySelector('mfrac'));
    assert.ok(holder.textContent.includes('List<int>'));assert.equal(holder.querySelectorAll('img,script').length,0);
    assert.equal(holder.querySelectorAll('[onerror],[onclick]').length,0);
  });
  await test('Technical question choices remain distinct in both player and result',withDb(async({w,load})=>{
    load('js/views/quiz-player.js');load('js/views/quiz-result.js');const q=question(1,{questionText:'Choose List<int> or List<float>.',options:['List<int>','List<float>','Map<T>','Vector<int>']});
    const id=await w.saveNewQuiz({title:'Types',quizMode:'PRACTICE'},[q]);await w.quizPlayerView.loadAndStart(id);
    const options=[...w.document.querySelectorAll('.option-label-text')].map(el=>el.textContent.trim());assert.deepEqual(options,q.options);
    w.quizPlayerView.onLeaveView();const view=w.quizResultView;view.quiz=await w.getQuizWithQuestions(id);view.questions=view.quiz.questions;view.render();assert.ok(view.container.textContent.includes('List<float>'));
  }));
  await test('Flagged questions cannot be saved as playable quizzes or started from existing storage',withDb(async({w,load})=>{
    await assert.rejects(w.saveNewQuiz({title:'Flagged'},[question(1,{reviewIssue:true})]),/review/);
    const id=await w.saveNewQuiz({title:'Later flagged'},[question()]);const q=(await w.getQuizWithQuestions(id)).questions[0];await w.updateQuizQuestion(q.id,{reviewIssue:true});
    load('js/views/quiz-player.js');await w.quizPlayerView.loadAndStart(id);assert.equal(w.quizPlayerView.questions.length,0);assert.equal(w.viewed.id,id);assert.ok(w.toasts.some(t=>/review/.test(t.text)));
  }));
  await test('Missed drill uses the latest correction even after the question stem changes',withDb(async({w,load})=>{
    const id=await w.saveNewQuiz({title:'Original'},[question()]);const data=await w.getQuizWithQuestions(id),q=data.questions[0];
    const attempt=await w.updateQuizCompletion(id,{correct:0,incorrect:1,skipped:0,percentage:0,score:0},[{...q,userSelectedOptionIndex:1}]);
    await w.updateQuizQuestion(q.id,{questionText:'Corrected technical question',correctAnswerIndex:1,explanation:'New verified explanation'});
    const historical=await w.getQuizAttemptResult(id,attempt);assert.equal(historical.questions[0].correctAnswerIndex,0);assert.ok(historical.questions[0].id<0);
    load('js/views/quiz-result.js');w.quizResultView.quiz=historical;w.quizResultView.questions=historical.questions;
    await w.quizResultView.reattemptMissed();const drill=await w.getQuizWithQuestions(w.started);assert.equal(drill.questions[0].correctAnswerIndex,1);assert.equal(drill.questions[0].explanation,'New verified explanation');assert.equal(drill.questions[0].questionText,'Corrected technical question');
    assert.equal((await w.getQuizAttemptResult(id,attempt)).questions[0].correctAnswerIndex,0);
  }));
  await test('Missed drill double clicks are deduplicated and storage failures allow retry',withDb(async({w,load})=>{
    const id=await w.saveNewQuiz({title:'Drill'},[question()]);const data=await w.getQuizWithQuestions(id);load('js/views/quiz-result.js');const v=w.quizResultView;v.quiz=data;v.questions=data.questions;
    let saves=0;w.saveNewQuiz=async()=>{saves++;throw Error('Storage full');};await Promise.all([v.reattemptMissed(),v.reattemptMissed()]);assert.equal(saves,1);assert.equal(v._drillPending,false);assert.ok(w.toasts.some(t=>/Storage full/.test(t.text)));
    w.saveNewQuiz=async()=>{saves++;return 22;};await v.reattemptMissed();assert.equal(w.started,22);
  }));
  await test('Missing or flagged missed questions are excluded with an explanation',withDb(async({w,load})=>{
    const id=await w.saveNewQuiz({title:'Drill'},[question()]);const data=await w.getQuizWithQuestions(id);load('js/views/quiz-result.js');w.quizResultView.quiz=data;w.quizResultView.questions=data.questions;await w.updateQuizQuestion(data.questions[0].id,{reviewIssue:true});
    await w.quizResultView.reattemptMissed();assert.equal(w.started,undefined);assert.equal(await w.testDb.quizzes.count(),1);assert.ok(w.toasts.some(t=>/flagged/.test(t.text)));
  }));
  await test('A late direct save preserves a newer draft and cannot navigate after leaving',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.render=()=>{};
    c.generationDraft={options:{sourceTitle:'Old',questionCount:1,sourceType:'TOPIC'},phase:'GENERATE',result:{title:'Old',questions:[question()]}};
    let resolve;w.saveNewQuiz=()=>new Promise(r=>resolve=r);const pending=c.saveReadyQuiz();await new Promise(r=>setTimeout(r,0));c.onLeaveView();w.app.currentView='settings';
    const newer=c.generationDraft={options:{sourceTitle:'New'},phase:'GENERATE'};c.persistDraft();resolve(99);await pending;
    assert.equal(c.generationDraft,newer);assert.equal(w.started,undefined);assert.equal(JSON.parse(w.localStorage.getItem('hamsa_quiz_generation_draft')).options.sourceTitle,'New');
  });

  await test('Cancellation during direct saving retains the quiz ID for duplicate-free resume',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;
    c.generationDraft={options:{sourceTitle:'Old',questionCount:1,sourceType:'TOPIC'},phase:'GENERATE',result:{title:'Old',questions:[question()]}};
    const controller=new w.AbortController();let resolve,calls=0;w.saveNewQuiz=()=>{calls++;return new Promise(r=>resolve=r);};
    const pending=c.saveReadyQuiz(1,controller.signal);await new Promise(r=>setTimeout(r,0));controller.abort();resolve(88);
    await assert.rejects(pending,{name:'AbortError'});assert.equal(c.generationDraft.savedQuizId,88);assert.equal(w.started,undefined);
    await c.saveReadyQuiz(2,new w.AbortController().signal);assert.equal(calls,1);assert.equal(w.started,88);assert.equal(c.generationDraft,null);
  });

  await test('An owned direct save retains source data and starts exactly once',withDb(async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;
    c.generationDraft={options:{questionCount:1,sourceTitle:'Notes',sourceType:'TEXT_NOTES',sourceContent:'Saved source notes.',skippedPdfPages:[{pageNumber:2,reason:'No readable text'}]},phase:'GENERATE',result:{title:'Notes',coverage:{readChunks:1,totalChunks:3,sampled:true},questions:[question()]}};
    let starts=0;w.app.startQuiz=id=>{w.started=id;starts++;};await c.saveReadyQuiz();
    assert.ok(w.started);const saved=await w.getQuizWithQuestions(w.started);assert.equal(saved.originalSource.text,'Saved source notes.');assert.equal(starts,1);
    assert.equal(c.generationDraft,null);assert.equal(w.localStorage.getItem('hamsa_quiz_generation_draft'),null);
    load('js/views/quiz-player.js');await w.quizPlayerView.loadAndStart(w.started);
    assert.ok(w.quizPlayerView.container.textContent.includes('selected parts of your study material'));assert.ok(w.quizPlayerView.container.textContent.includes('skipped pages: 2'));
    assert.ok(w.quizPlayerView.container.querySelector('[data-quiz-option]'));assert.equal(w.quizPlayerView.container.querySelector('.quiz-preview'),null);
  }));

  await test('Timer-only and flags-only progress offer resume without selected answers',({w,load})=>{
    load('js/views/quiz-player.js');const p=w.quizPlayerView;p.quiz={id:1,quizMode:'EXAM',examDurationSeconds:300};p.questions=[question(1,{id:1})];p._resetAttemptState();p.examDeadline=Date.now()+120000;p._persistProgress();assert.ok(p._loadSavedProgress(1));
    p.quiz.quizMode='PRACTICE';p._resetAttemptState();p.flaggedQuestions.add(1);p._persistProgress();assert.ok(p._loadSavedProgress(1));
  });
  await test('Switching quizzes preserves independent progress and clearing one keeps the other',withDb(async({w,load})=>{
    load('js/views/quiz-player.js');const p=w.quizPlayerView,a=await w.saveNewQuiz({title:'A'},[question()]),b=await w.saveNewQuiz({title:'B'},[question(2)]);
    await p.loadAndStart(a);p.selectOption(0);p.onLeaveView();const first=await w.getQuizWithQuestions(a);
    await p.loadAndStart(b);p.selectOption(1);p.onLeaveView();const second=await w.getQuizWithQuestions(b);
    p.quiz=first;p.questions=first.questions;assert.ok(p._loadSavedProgress(a));p._clearSavedProgress();p.quiz=second;p.questions=second.questions;assert.ok(p._loadSavedProgress(b));assert.equal(JSON.parse(w.localStorage.getItem('hamsa_active_quiz_attempt')).quizId,b);
  }));
  await test('Model-specific JSON compatibility errors stop without another model or duplicate call',async({w})=>{
    const calls=[],service={isAiAvailable:()=>true,getApiKey:()=>'',discoverAvailableModels:async()=>['old','new'],sortModelsByPreference:a=>a,getActiveModel:()=>'',setActiveModel:model=>service.active=model};
    w.aiClient={fetchGenerateContent:async model=>{calls.push(model);return {ok:false,status:400};},describeError:async()=> 'responseMimeType JSON is not supported by this model'};
    await assert.rejects(w.quizEngine.request(service,'Fixture'),/not supported/);assert.deepEqual(calls,['gemini-3.6-flash']);assert.equal(service.active,undefined);
  });
  await test('Invalid credentials do not cause compatibility fallback or extra requests',async({w})=>{
    let calls=0;const service={isAiAvailable:()=>true,getApiKey:()=>'',discoverAvailableModels:async()=>['old','new'],sortModelsByPreference:a=>a,getActiveModel:()=>''};
    w.aiClient={fetchGenerateContent:async()=>{calls++;return {ok:false,status:400};},describeError:async()=> 'API key not valid for model'};await assert.rejects(w.quizEngine.request(service,'Fixture'),/API key/);assert.equal(calls,1);
  });
  await test('Doubt loading and result re-render keep focus and keyboard controls inside the drawer',withDb(async({w,load})=>{
    load('js/views/quiz-result.js');const id=await w.saveNewQuiz({title:'Focus'},[question()]);const v=w.quizResultView;v.quiz=await w.getQuizWithQuestions(id);v.questions=v.quiz.questions;v.render();let resolve;
    w.geminiService={solveQuestionDoubt:()=>new Promise(r=>resolve=r)};v.openDoubtSolver(v.questions[0].id);v.askDoubt('deep-rationale');assert.ok(w.document.querySelector('#doubt-solver-drawer').contains(w.document.activeElement));
    v.setFilter('ALL');const drawer=w.document.querySelector('#doubt-solver-drawer');assert.ok(drawer.contains(w.document.activeElement));drawer.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(v.isDoubtDrawerOpen,false);resolve({text:'Late answer'});await new Promise(r=>setTimeout(r,0));assert.equal(v.doubtHistory.length,1);
  }));
  await test('Saved doubt notes retain model, fallback warning and source evidence without duplicate saves',withDb(async({w,load})=>{
    load('js/views/quiz-result.js');const v=w.quizResultView;v.quiz={subject:'Science',sourceTitle:'Book'};v.activeDoubtQuestion=question(1,{sourcePage:3,keySourcePage:7,evidenceQuote:'Source evidence text.'});v.questions=[v.activeDoubtQuestion];v.doubtHistory=[{role:'model',text:'Worked answer',model:'Offline fallback',note:'Live AI unavailable; verify this answer.'}];
    await Promise.all([v.saveDoubtToStudyNotes(0),v.saveDoubtToStudyNotes(0)]);const notes=await w.testDb.notes.toArray();assert.equal(notes.length,1);assert.ok(notes[0].content.includes('Live AI unavailable'));assert.ok(notes[0].content.includes('Source evidence text.'));assert.equal(notes[0].sections[0].provenance.model,'Offline fallback');
  }));
  await test('History distinguishes storage failures from an empty history and supports retry',async({w,load})=>{
    load('js/views/quiz-history.js');w.getAttemptHistory=async()=>{throw Error('Unavailable');};await w.quizHistoryView.render();assert.ok(w.quizHistoryView.container.textContent.includes('could not be loaded'));assert.equal(w.quizHistoryView.container.querySelector('button').textContent,'Retry');
    w.getAttemptHistory=async()=>[];await w.quizHistoryView.render();assert.ok(!w.quizHistoryView.container.textContent.includes('could not be loaded'));
  });
  await test('Source capture persists the original local PDF and extracted page context',async({w})=>{
    const file=new w.File(['%PDF-1.4\nfixture'],'Book.pdf',{type:'application/pdf'});const result=await w.quizSourceView.capture({_pdfFile:file,sourceType:'PDF',sourcePages:[{pageNumber:3,text:'Saved page'}]});assert.ok(result.files[0].data.startsWith('data:application/pdf;base64,'));assert.equal(result.pages[0].pageNumber,3);
  });
  await test('Source viewer selects question and key pages and never embeds arbitrary source URLs',async({w})=>{
    w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
    const quiz={sourceTitle:'Book',originalSource:{pages:[{pageNumber:2,text:'Question page text'},{pageNumber:7,text:'Printed key page text'}],files:[{data:'javascript:alert(1)'}]}};
    await w.quizSourceView.open(quiz,question(1,{sourcePage:2,keySourcePage:7}));assert.ok(w.quizSourceView.dialog.textContent.includes('Question page text'));assert.equal(w.quizSourceView.dialog.querySelector('iframe'),null);w.quizSourceView.close();
    await w.quizSourceView.open(quiz,question(1,{sourcePage:2,keySourcePage:7}),'key');assert.ok(w.quizSourceView.dialog.textContent.includes('Printed key page text'));assert.ok(!w.quizSourceView.dialog.textContent.includes('Question page text'));w.quizSourceView.close();
  });
  await test('Coverage counts real topic labels and preserves unknown imported difficulty',({w})=>{
    const qs=[question(1,{topic:'Algebra',difficulty:'HARD'}),question(2,{topic:'Algebra',difficulty:'EASY'}),question(3,{topic:'Geometry'})];
    const d=w.QuizQuality.distribution(qs);assert.equal(d.topics.Algebra,2);assert.equal(d.topics.Geometry,1);assert.equal(d.difficulties['Unspecified difficulty'],1);assert.ok(w.QuizQuality.distributionHtml(qs).includes('does not claim complete syllabus coverage'));
  });
  await test('Creation draft and result source actions have valid executable handlers',withDb(async({w,load})=>{
    load('js/views/create-quiz.js');load('js/views/quiz-result.js');const q=question(1,{sourcePage:2,evidenceQuote:'Supporting source quotation.',keySourcePage:7,keyEvidenceQuote:'1. A'});
    w.createQuizView.generationDraft={options:{sourceTitle:'Actions',questionCount:2,sourceType:'PDF'},state:{questions:[q]}};await w.createQuizView.render();
    const id=await w.saveNewQuiz({title:'Actions'},[q]);w.quizResultView.quiz=await w.getQuizWithQuestions(id);w.quizResultView.questions=w.quizResultView.quiz.questions;w.quizResultView.render();
    for(const el of w.document.querySelectorAll('[onclick]'))assert.doesNotThrow(()=>new w.Function('event',el.getAttribute('onclick')));
  }));

  await test('Source import requires a printed question identity and rejects conflicting numbered key sections',({w})=>{
    const q=question(1,{sourceQuestionNumber:1,sourcePage:1,evidenceQuote:'What is the result of 1 + 1?',keySourcePage:2,keyEvidenceQuote:'1. A'}),pages=[{pageNumber:1,text:'1. What is the result of 1 + 1? A.2 B.3 C.4 D.5'},{pageNumber:2,text:'Answer Key\n1. A'}];
    assert.ok(w.QuizQuality.sourceKeySupported(q,pages));
    assert.ok(w.QuizQuality.sourceKeySupported({...q,keyEvidenceQuote:'१. क'},[{...pages[0],text:pages[0].text.replace(/^1/, '१')},{...pages[1],text:'उत्तर कुंजी\n१. क'}]));
    assert.equal(w.QuizQuality.sourceKeySupported({...q,sourceQuestionNumber:null},pages),false);
    assert.equal(w.QuizQuality.sourceKeySupported(q,[{...pages[0],text:'What is the result of 1 + 1? A.2 B.3 C.4 D.5'},pages[1]]),false);
    assert.equal(w.QuizQuality.sourceKeySupported(q,[...pages,{pageNumber:3,text:'Answer Key\n1. B'}]),false);
  });
  await test('Historical snapshot references cannot pull a question from an unrelated quiz into a missed drill',withDb(async({w,load})=>{
    const a=await w.saveNewQuiz({title:'A'},[question()]),b=await w.saveNewQuiz({title:'B'},[question(2)]),other=(await w.getQuizWithQuestions(b)).questions[0];load('js/views/quiz-result.js');w.quizResultView.quiz=await w.getQuizWithQuestions(a);w.quizResultView.questions=[{...other,id:-1,originalQuestionId:other.id,userSelectedOptionIndex:1}];
    await w.quizResultView.reattemptMissed();assert.equal(w.started,undefined);assert.equal(await w.testDb.quizzes.count(),2);
  }));
  await test('Deleting a quiz clears only its own saved progress',withDb(async({w})=>{
    const a=await w.saveNewQuiz({title:'A'},[question()]),b=await w.saveNewQuiz({title:'B'},[question(2)]);
    w.localStorage.setItem(`hamsa_active_quiz_attempt:${a}`,'a');w.localStorage.setItem(`hamsa_active_quiz_attempt:${b}`,'b');w.localStorage.setItem('hamsa_active_quiz_attempt',JSON.stringify({quizId:b}));await w.deleteQuiz(a);
    assert.equal(w.localStorage.getItem(`hamsa_active_quiz_attempt:${a}`),null);assert.equal(w.localStorage.getItem(`hamsa_active_quiz_attempt:${b}`),'b');assert.equal(JSON.parse(w.localStorage.getItem('hamsa_active_quiz_attempt')).quizId,b);
  }));
  await test('Old source-import drafts are revalidated before direct start',({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.generationDraft={phase:'EXTRACT',options:{sourceTitle:'Old',questionCount:1,sourcePages:[{pageNumber:1,text:'10. What is the result of 1 + 1?'},{pageNumber:2,text:'Answer Key\n20. A'}]},result:{title:'Old',questions:[question(1,{answerOrigin:'SOURCE_KEY',sourceQuestionNumber:10,sourcePage:1,evidenceQuote:'What is the result of 1 + 1?',keySourcePage:2,keyEvidenceQuote:'20. A'})]}};
    assert.throws(()=>c.readyQuiz(),/No questions are ready/);assert.equal(w.started,undefined);
  });

  await test('Bookmark drills exclude flagged questions while preserving usable saved questions',withDb(async({w,load})=>{
    const id=await w.saveNewQuiz({title:'Bookmarks'},[question(),question(2)]),qs=(await w.getQuizWithQuestions(id)).questions;
    for(const q of qs)await w.updateQuestionBookmark(q.id,true);await w.updateQuizQuestion(qs[0].id,{reviewIssue:true});load('js/views/library.js');await w.libraryView.startBookmarksDrill();const drill=await w.getQuizWithQuestions(w.started);assert.equal(drill.questions.length,1);assert.equal(drill.questions[0].sourceQuizId,id);assert.ok(w.toasts.some(t=>/excluded/.test(t.text)));
  }));
  await test('Source references survive backup merge alongside their remapped quiz IDs',withDb(async({w})=>{
    await w.saveNewQuiz({title:'Existing'},[question()]);
    await w.importDatabaseBackup(JSON.stringify({tables:{quizzes:[{id:10,title:'Incoming source'}],questions:[question(1,{id:20,quizId:10,sourceQuizId:10})]}}),{mode:'MERGE'});
    const quizzes=await w.testDb.quizzes.toArray(),source=quizzes.find(q=>q.title==='Incoming source'),qs=await w.testDb.questions.toArray(),incoming=qs.find(q=>q.quizId===source.id);assert.equal(incoming.sourceQuizId,source.id);assert.notEqual(incoming.sourceQuizId,10);
  }));
  await test('Source viewer follows the real lexical database when a bookmark drill references its original quiz',withDb(async({w})=>{
    const id=await w.saveNewQuiz({title:'Source',originalSource:{pages:[{pageNumber:3,text:'Original book context'}]}},[question()]);w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
    await w.quizSourceView.open({id:99,title:'Drill'},question(1,{sourceQuizId:id,sourcePage:3}));assert.ok(w.quizSourceView.dialog.textContent.includes('Original book context'));w.quizSourceView.close();
  }));


  await test('Explicit inline answers remain importable only when all options lead directly to their own key',({w})=>{
    const q=question(1,{sourceQuestionNumber:1,sourcePage:1,keySourcePage:1,evidenceQuote:'What is the result of 1 + 1?',keyEvidenceQuote:'Answer: A'});
    const page={pageNumber:1,text:'What is the result of 1 + 1? A. 2 B. 3 C. 4 D. 5 Answer: A'};
    assert.ok(w.QuizQuality.sourceKeySupported(q,[page]));
    assert.ok(w.QuizQuality.sourceKeySupported({...q,keyEvidenceQuote:'उत्तर: क'},[{...page,text:page.text.replace('Answer: A','उत्तर: क')}]));
    assert.equal(w.QuizQuality.sourceKeySupported(q,[{...page,text:page.text.replace(' Answer: A',' Another unrelated question. Answer: A')}]),false);
    assert.equal(w.QuizQuality.sourceKeySupported(q,[{...page,text:'Answer: A '+page.text.replace(' Answer: A','')}]),false);
  });


  await test('PDF loader resolves the namespace export and configures the local worker',async({w})=>{
    const reader={getDocument(){},GlobalWorkerOptions:{}};w['pdfjs-dist/build/pdf']=reader;
    assert.equal(await w.pdfReader.ensure(),reader);assert.equal(w.pdfjsLib,reader);assert.equal(new URL(reader.GlobalWorkerOptions.workerSrc).pathname,'/assets/vendor/pdf.worker.min.js');assert.equal(new URL(reader.GlobalWorkerOptions.workerSrc).searchParams.get('v'),'20261002-pdf2');
  });
  await test('Concurrent PDF uploads recover one missing vendor load without duplicate scripts',async({w})=>{
    const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};
    const first=w.pdfReader.ensure(),second=w.pdfReader.ensure();assert.equal(scripts.length,1);assert.equal(new URL(scripts[0].src).pathname,'/assets/vendor/pdf.min.js');assert.ok(new URL(scripts[0].src).searchParams.has('pdf-refresh'));
    w.pdfjsLib={getDocument(){},GlobalWorkerOptions:{}};scripts[0].onload();assert.equal(await first,w.pdfjsLib);assert.equal(await second,w.pdfjsLib);assert.equal(w.document.head.querySelector('script'),null);
  });
  await test('Failed reader loads clean up and permit retry rather than requiring reload',async({w})=>{
    const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};
    const first=w.pdfReader.ensure(),rejected=assert.rejects(first,/retry uploading/);scripts[0].onerror();await rejected;assert.equal(scripts[0].isConnected,false);
    const retry=w.pdfReader.ensure();assert.equal(scripts.length,2);w.pdfjsLib={getDocument(){},GlobalWorkerOptions:{}};scripts[1].onload();assert.equal(await retry,w.pdfjsLib);
  });
  await test('Reader timeouts remove the script and allow a fresh attempt',async({w})=>{
    let timeout;w.setTimeout=callback=>{timeout=callback;return 1;};w.clearTimeout=()=>{};
    const first=w.pdfReader.ensure(),rejected=assert.rejects(first,/could not be loaded/);timeout();await rejected;assert.equal(w.document.head.querySelector('script'),null);
    w.pdfjsLib={getDocument(){},GlobalWorkerOptions:{}};assert.equal(await w.pdfReader.ensure(),w.pdfjsLib);
  });
  await test('An incompatible cached reader is replaced and its worker also bypasses stale caches',async({w})=>{
    const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};
    w.pdfjsLib={version:'2.0.0',getDocument(){},GlobalWorkerOptions:{}};const recovery=w.pdfReader.ensure();assert.equal(scripts.length,1);
    w.pdfjsLib={version:'3.11.174',getDocument(){},GlobalWorkerOptions:{}};scripts[0].onload();const reader=await recovery;
    assert.equal(new URL(reader.GlobalWorkerOptions.workerSrc).searchParams.get('pdf-refresh'),new URL(scripts[0].src).searchParams.get('pdf-refresh'));
  });
  await test('PDF recovery URLs retain the hosted project prefix and encoded directory names',async({w,load})=>{
    Object.defineProperty(w.document,'currentScript',{configurable:true,value:{src:'http://localhost/Hamsa%20Vidya/js/pdf-reader.js?v=20261002-pdf2'}});load('js/pdf-reader.js');
    const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};const recovery=w.pdfReader.ensure();
    assert.equal(new URL(scripts[0].src).pathname,'/Hamsa%20Vidya/assets/vendor/pdf.min.js');w.pdfjsLib={getDocument(){},GlobalWorkerOptions:{}};scripts[0].onload();const reader=await recovery;
    assert.equal(new URL(reader.GlobalWorkerOptions.workerSrc).pathname,'/Hamsa%20Vidya/assets/vendor/pdf.worker.min.js');
  });
  await test('Upload bootstraps a missing recovery helper and reader with shared pending loads',async({w,load})=>{
    delete w.pdfReader;load('js/pdf-extractor.js');const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};
    const file=name=>({name,type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)});
    const first=w.pdfExtractor.loadPdfFile(file('Old.pdf')),rejected=assert.rejects(first,{name:'AbortError'}),second=w.pdfExtractor.loadPdfFile(file('New.pdf'));
    assert.equal(scripts.length,1);assert.equal(new URL(scripts[0].src).pathname,'/js/pdf-reader.js');load('js/pdf-reader.js');scripts[0].onload();await new Promise(r=>setTimeout(r,0));assert.equal(scripts.length,2);
    w.pdfjsLib={GlobalWorkerOptions:{},getDocument:options=>{assert.equal(options.isEvalSupported,false);return {promise:Promise.resolve({numPages:2,destroy:async()=>{}}),destroy:async()=>{}};}};scripts[1].onload();await rejected;await second;assert.equal(w.pdfExtractor.metadata.fileName,'New.pdf');
  });
  await test('A failed helper bootstrap is cleaned up and can be retried with the same extractor',async({w,load})=>{
    delete w.pdfReader;load('js/pdf-extractor.js');const append=w.document.head.append.bind(w.document.head),scripts=[];w.document.head.append=script=>{scripts.push(script);append(script);};
    const file={name:'Retry.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)},first=w.pdfExtractor.loadPdfFile(file),rejected=assert.rejects(first,/PDF support could not be loaded/);scripts[0].onerror();await rejected;assert.equal(scripts[0].isConnected,false);
    const retry=w.pdfExtractor.loadPdfFile(file);assert.equal(scripts.length,2);load('js/pdf-reader.js');w.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,destroy:async()=>{}}),destroy:async()=>{}})};scripts[1].onload();await retry;assert.equal(w.pdfExtractor.metadata.fileName,'Retry.pdf');
  });
  await test('Invalid or oversized PDFs fail before loading any reader dependency',async({w,load})=>{
    load('js/pdf-extractor.js');let calls=0;w.pdfReader.ensure=async()=>{calls++;throw Error('Should not load');};
    await assert.rejects(w.pdfExtractor.loadPdfFile({name:'notes.txt',type:'text/plain',size:10}),/PDF document/);
    await assert.rejects(w.pdfExtractor.loadPdfFile({name:'large.pdf',type:'application/pdf',size:201*1048576}),/200 MB/);assert.equal(calls,0);
  });
  await test('Clearing a PDF while reader recovery is pending cancels the upload before parsing',async({w,load})=>{
    load('js/pdf-extractor.js');let resolve,calls=0;w.pdfReader.ensure=()=>new Promise(r=>resolve=r);
    const promise=w.pdfExtractor.loadPdfFile({name:'a.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)}),rejected=assert.rejects(promise,{name:'AbortError'});
    w.pdfExtractor.clear();resolve({getDocument(){calls++;}});await rejected;assert.equal(calls,0);assert.equal(w.pdfExtractor.currentDoc,null);
  });
  await test('A stale failed reader recovery is cancellation rather than a parse error',async({w,load})=>{
    load('js/pdf-extractor.js');let reject;w.pdfReader.ensure=()=>new Promise((resolve,r)=>reject=r);
    const promise=w.pdfExtractor.loadPdfFile({name:'a.pdf',type:'application/pdf',size:10}),rejected=assert.rejects(promise,{name:'AbortError'});w.pdfExtractor.clear();reject(Error('Reader unavailable'));await rejected;
  });
  await test('Loading overlapping PDFs commits only the latest file and destroys the older document',async({w,load})=>{
    load('js/pdf-extractor.js');const tasks=[];let destroyed=0;w.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>{let resolve;const promise=new Promise(r=>resolve=r);const task={promise,resolve,destroy:async()=>{}};tasks.push(task);return task;}};
    const file=name=>({name,type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)});
    const first=w.pdfExtractor.loadPdfFile(file('Old.pdf')),rejected=assert.rejects(first,{name:'AbortError'});await new Promise(r=>setTimeout(r,0));
    const second=w.pdfExtractor.loadPdfFile(file('New.pdf'));await new Promise(r=>setTimeout(r,0));tasks[1].resolve({numPages:4,destroy:async()=>{}});await second;
    tasks[0].resolve({numPages:1,destroy:async()=>destroyed++});await rejected;assert.equal(w.pdfExtractor.metadata.fileName,'New.pdf');assert.equal(w.pdfExtractor.currentDoc.numPages,4);assert.equal(destroyed,1);
  });
  await test('Upload failure permits selecting the same file and clears the busy state',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.render=()=>{};let calls=0;w.pdfExtractor={loadPdfFile:async()=>{calls++;if(calls===1)throw Object.assign(Error('Invalid PDF'),{name:'InvalidPDFException'});return{fileName:'Retry.pdf',pageCount:2};}};
    const input={files:[{name:'Retry.pdf',type:'application/pdf'}],value:'Retry.pdf'};await c.handleFileSelect({target:input});assert.equal(input.value,'');assert.equal(c._pdfUploading,false);assert.ok(w.toasts.some(t=>/damaged/.test(t.text)));
    input.value='Retry.pdf';await c.handleFileSelect({target:input});assert.equal(c.loadedPdfMeta.fileName,'Retry.pdf');assert.equal(c.pdfTotalPages,2);assert.equal(c._pdfUploading,false);
  });
  await test('A stale view upload completion cannot overwrite a newer PDF or repaint another tab',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;let paints=0;const pending=[];c.render=()=>paints++;w.pdfExtractor={loadPdfFile:()=>new Promise(r=>pending.push(r))};
    const event=name=>({target:{files:[{name,type:'application/pdf'}],value:name}});const first=c.handleFileSelect(event('Old.pdf')),second=c.handleFileSelect(event('New.pdf'));
    pending[1]({fileName:'New.pdf',pageCount:3});await second;pending[0]({fileName:'Old.pdf',pageCount:1});await first;assert.equal(c.loadedPdfMeta.fileName,'New.pdf');assert.equal(paints,1);
    const third=c.handleFileSelect(event('Background.pdf'));c.onLeaveView();w.app.currentView='settings';pending[2]({fileName:'Background.pdf',pageCount:4});await third;assert.equal(paints,1);assert.equal(c.loadedPdfMeta.fileName,'Background.pdf');
  });
  await test('Overlapping failed uploads restore the hint and preserve busy feedback across renders',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.activeSource='PDF';await c.render();
    const hint=w.document.querySelector('#pdf-dropzone p').textContent,pending=[];w.pdfExtractor={loadPdfFile:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
    const event=name=>({target:{files:[{name,type:'application/pdf'}],value:name}});
    const first=c.handleFileSelect(event('Old.pdf')),second=c.handleFileSelect(event('New.pdf'));
    assert.equal(w.document.getElementById('pdf-dropzone').getAttribute('aria-busy'),'true');
    pending[1].reject(Error('Reader unavailable'));await second;pending[0].reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));await first;
    assert.equal(c._pdfUploading,false);assert.equal(w.document.querySelector('#pdf-dropzone p').textContent,hint);assert.equal(w.document.getElementById('pdf-dropzone').hasAttribute('aria-busy'),false);
    const third=c.handleFileSelect(event('Retry.pdf'));await c.render();assert.equal(w.document.getElementById('pdf-dropzone').getAttribute('aria-busy'),'true');assert.equal(w.document.querySelector('#pdf-dropzone p').textContent,'Loading your PDF…');
    pending[2].reject(Error('Reader unavailable'));await third;assert.equal(w.document.querySelector('#pdf-dropzone p').textContent,hint);assert.equal(w.document.getElementById('pdf-dropzone').hasAttribute('aria-busy'),false);
  });
  await test('Quiz generation waits for a pending PDF upload instead of reading an old document',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.activeSource='PDF';c._pdfUploading=true;c.loadedPdfMeta={fileName:'Old.pdf',pageCount:2};let starts=0;w.app.beginGeneration=()=>{starts++;throw Error('Generation should not start');};
    await c.generateQuiz();assert.equal(starts,0);assert.ok(w.toasts.some(t=>/finish loading/.test(t.text)));
  });
  await test('Removing a PDF invalidates pending upload metadata and resets the page range',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.render=()=>{};let resolve,clears=0;w.pdfExtractor={loadPdfFile:()=>new Promise(r=>resolve=r),clear:()=>clears++};
    const pending=c.handleFileSelect({target:{files:[{name:'Old.pdf',type:'application/pdf'}]}});c.toPage=8;c.toPageInputRaw='8';c.removeLoadedPdf();resolve({fileName:'Old.pdf',pageCount:8});await pending;
    assert.equal(c.loadedPdfMeta,null);assert.equal(c.toPage,1);assert.equal(c.toPageInputRaw,'1');assert.equal(c._pdfUploading,false);assert.equal(clears,1);
  });
  await test('PDF dropzone ignores its input click instead of opening the picker twice',async({w,load})=>{
    load('js/views/create-quiz.js');w.createQuizView.activeSource='PDF';await w.createQuizView.render();const input=w.document.getElementById('pdf-file-input'),dropzone=w.document.getElementById('pdf-dropzone');let calls=0;input.click=()=>calls++;
    const handler=new w.Function('event',dropzone.getAttribute('onclick'));handler({target:input});assert.equal(calls,0);handler({target:dropzone});assert.equal(calls,1);
  });

  await test('Fresh PDF quiz defaults to generation and printed-question import remains opt-in',async({w,load})=>{
    load('js/views/create-quiz.js');const view=w.createQuizView;view.activeSource='PDF';await view.render();
    assert.equal(view.importSourceQuestions,false);
    const input=w.document.querySelector('input[onchange*="importSourceQuestions"]');assert.ok(input);assert.equal(input.checked,false);
    input.checked=true;new w.Function(input.getAttribute('onchange')).call(input);assert.equal(view.importSourceQuestions,true);
  });
  await test('Twenty PDF batches and five questions use only writer + blind review',async f=>{
    const {svc,w,options,stats}=sourceFixture(f),updates=[];
    const result=await svc.generateQuiz({...options,onStatusUpdate:status=>updates.push(status)});
    assert.equal(w.QuizQuality.chunks('',options.sourcePages).length,20);
    assert.equal(stats.reads+stats.writes+stats.reviews,2);assert.equal(stats.reads,0);assert.equal(stats.writes,1);assert.equal(stats.reviews,1);
    assert.equal(stats.maxActive,0);assert.equal(stats.discoveries,0);
    assert.equal(result.questions.length,5);assert.ok(result.questions.every(q=>q.aiReviewed&&q.sourceMatched));
    assert.ok(result.coverage.readPages.length<=2);assert.equal(result.coverage.readChunks,2);assert.equal(result.coverage.sampled,true);
    assert.ok(updates.some(s=>s.badgeText==='Checking answers'));assert.equal(updates.at(-1).percent,100);
    assert.ok(updates.every((s,i)=>!i||s.percent>=updates[i-1].percent));
  });
  await test('Unchanged PDF analysis is reused across difficulty/language changes while every new answer is reviewed',async f=>{
    const {svc,options,stats,w}=sourceFixture(f);await svc.generateQuiz(options);
    const updates=[];const result=await svc.generateQuiz({...options,difficulty:'HARD',language:'HINDI',onStatusUpdate:status=>updates.push(status)});
    assert.equal(stats.reads,0);assert.equal(stats.writes,2);assert.equal(stats.reviews,2);assert.equal(stats.discoveries,0);
    assert.ok(result.questions.every(q=>q.aiReviewed&&q.difficulty==='HARD'));
    assert.equal(w.quizEngine._sourceCache.size,0);
  });
  await test('Source analysis cache invalidates on changed text, credentials and transport and stays bounded',async f=>{
    const {svc,options,stats,w}=sourceFixture(f);await svc.generateQuiz(options);
    options.sourcePages[0].text+=' A newly added source fact.';await svc.generateQuiz(options);assert.equal(stats.reads,0);
    svc.getApiKey=()=> 'different-test-key';await svc.generateQuiz(options);assert.equal(stats.reads,0);
    svc.getTransportMode=()=> 'PROXY';await svc.generateQuiz(options);assert.equal(stats.reads,0);
    assert.equal(stats.writes,4);assert.equal(stats.reviews,4);assert.equal(w.quizEngine._sourceCache.size,0);
  });
  await test('Cached and resumed facts must match their actual source page rather than a neighbouring page',async f=>{
    const {w}=engineFixture(f),pages=[{pageNumber:1,text:'The first page is about fractions.'},{pageNumber:2,text:'The second page is about decimals.'}],chunk=w.QuizQuality.chunks('',pages)[0];
    assert.equal(w.quizEngine.validFacts(chunk,[{fact:'Fractions',quote:pages[0].text,page:2}],pages),false);
    assert.equal(w.quizEngine.validFacts(chunk,[{fact:'Fractions',quote:pages[0].text,page:1}],pages),true);
    assert.equal(w.quizEngine.validFacts(chunk,[{fact:'Unsupported',quote:'A quote invented by the model.',page:1}],pages),false);
    assert.equal(w.quizEngine.validFacts(chunk,[null],pages),false);
  });
  await test('A failed writer preserves resumable state without analysis or model hopping',async f=>{
    const {svc,w,options,stats}=sourceFixture(f),original=w.aiClient.fetchGenerateContent;
    let calls=0,failedState;
    w.aiClient.fetchGenerateContent=async(model,payload,{signal})=>{
      calls++;const error=Error('Invalid credentials');error.status=401;throw error;
    };
    await assert.rejects(svc.generateQuiz(options),error=>{failedState=clone(error.retryState);return /credentials/.test(error.message);});
    assert.equal(calls,1);assert.deepEqual(failedState.read,[]);assert.equal(w.quizEngine._sourceCache.size,0);
    w.aiClient.fetchGenerateContent=original;
    const result=await svc.generateQuiz({...options,retryState:failedState});assert.equal(stats.reads,0);assert.equal(result.questions.length,5);
  });
  await test('Cancellation stops both source readers without starting later batches or caching partial data',async f=>{
    const {svc,w,options}=sourceFixture(f),controller=new w.AbortController();let active=0,calls=0,cancelled=0;
    w.aiClient.fetchGenerateContent=async(model,payload,{signal})=>{active++;calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{active--;cancelled++;reject(new w.DOMException('Cancelled','AbortError'));},{once:true}));};
    const pending=svc.generateQuiz({...options,signal:controller.signal});while(active<1)await new Promise(r=>setTimeout(r,1));
    controller.abort();await assert.rejects(pending,{name:'AbortError'});
    assert.equal(calls,1);assert.equal(cancelled,1);assert.equal(active,0);assert.equal(w.quizEngine._sourceCache.size,0);
  });
  await test('Generation deadline aborts a stalled batch and preserves previously reviewed questions for Resume',async f=>{
    const {w,svc,options}=engineFixture(f);options.questionCount=11;w.quizEngine.MIN_JOB_MS=40;w.quizEngine.MAX_JOB_MS=40;
    let writes=0,saved;
    w.aiClient={fetchGenerateContent:async(model,payload,{signal})=>{
      const prompt=payload.contents[0].parts[0].text;
      if(prompt.startsWith('Independently solve'))return response({reviews:Array.from({length:10},(_,index)=>({index,verdict:'ACCEPT',reason:'Verified.'}))});
      if(++writes===1)return response({questions:Array.from({length:10},(_,i)=>question(i+1))});
      return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new w.DOMException('Cancelled','AbortError')),{once:true}));
    }};
    await assert.rejects(svc.generateQuiz({...options,onCheckpoint:state=>{saved=state;}}),error=>error.code==='QUIZ_TIME_LIMIT'&&/Resume generation/.test(error.message));
    assert.equal(saved.questions.length,10);assert.ok(saved.questions.every(q=>q.aiReviewed));
    w.quizEngine.MIN_JOB_MS=180000;w.quizEngine.MAX_JOB_MS=900000;
    w.aiClient.fetchGenerateContent=async(model,payload)=>response(payload.contents[0].parts[0].text.startsWith('Independently solve')?{reviews:[{index:0,verdict:'ACCEPT',reason:'Verified.'}]}:{questions:[question(11)]});
    const result=await svc.generateQuiz({...options,retryState:saved});assert.equal(result.questions.length,11);
  });
  await test('A timed-out request stops after one call, saves state and never switches models',async f=>{
    const {w,svc,options}=engineFixture(f);let calls=0,discovery=0;const requestModels=[],timeouts=[];
    svc.discoverAvailableModels=async()=>{discovery++;return ['gemini-3.6-flash','gemini-3.5-flash'];};
    w.aiClient={fetchGenerateContent:async(model,payload,request)=>{
      calls++;requestModels.push(model);timeouts.push(request.timeoutMs);
      if(calls===1){const error=Error('Timed out');error.code='AI_TIMEOUT';throw error;}
      return response(payload.contents[0].parts[0].text.startsWith('Independently solve')?{reviews:[0,1].map(index=>({index,verdict:'ACCEPT',reason:'Verified.'}))}:{questions:[question(1),question(2)]});
    }};
    await assert.rejects(svc.generateQuiz(options),error=>error.code==='AI_TIMEOUT'&&!!error.retryState);
    assert.equal(calls,1);assert.equal(discovery,0);assert.deepEqual(requestModels,['gemini-3.6-flash']);
    assert.ok(timeouts.every(ms=>ms>0&&ms<=120000));
  });
  await test('Per-step budget prevents endless model fallback and long Retry-After does not retry prematurely',async f=>{
    const {w,svc,options}=engineFixture(f);let calls=0;w.quizEngine.REQUEST_BUDGET_MS=5;
    w.aiClient={fetchGenerateContent:async()=>{calls++;await new Promise(r=>setTimeout(r,10));throw Error('Slow network');}};
    await assert.rejects(svc.generateQuiz(options),error=>error.code==='AI_STEP_TIMEOUT');assert.equal(calls,1);
    w.quizEngine.REQUEST_BUDGET_MS=150000;calls=0;w.aiClient={describeError:async()=> 'Too many requests',fetchGenerateContent:async()=>{calls++;return Response.json({error:{}},{status:429,headers:{'Retry-After':'120'}});}};
    await assert.rejects(svc.generateQuiz(options),/Too many requests/);assert.equal(calls,1);
    calls=0;w.aiClient.fetchGenerateContent=async()=>{calls++;return Response.json({error:{}},{status:429,headers:{'Retry-After':new Date(Date.now()+120000).toUTCString()}});};
    await assert.rejects(svc.generateQuiz(options),/Too many requests/);assert.equal(calls,1);
  });
  await test('Quiz generation never needs model discovery, including when that endpoint is unavailable',async f=>{
    const {svc,w,options}=engineFixture(f);let discovery=0;svc.discoverAvailableModels=async()=>{discovery++;throw Error('Model endpoint unavailable');};
    w.aiClient={fetchGenerateContent:async(model,payload)=>response(payload.contents[0].parts[0].text.startsWith('Independently solve')?{reviews:[0,1].map(index=>({index,verdict:'ACCEPT',reason:'Verified.'}))}:{questions:[question(1),question(2)]})};
    assert.equal((await svc.generateQuiz(options)).questions.length,2);assert.equal(discovery,0);
  });
  await test('PDF text cache avoids rereading unchanged pages and returns isolated copies',async({w,load})=>{
    load('js/pdf-extractor.js');const reader=w.pdfExtractor;let calls=0;
    reader.currentDoc={numPages:2,getPage:async number=>{calls++;return {getTextContent:async()=>({items:[{str:`Readable text of page ${number}.`}]}),cleanup(){}};},destroy:async()=>{}};
    const first=await reader.extractTextFromPageRange(1,2);first.extractedPages[0].text='Modified copy';const updates=[];
    const cached=await reader.extractTextFromPageRange(1,2,(_,__,message)=>updates.push(message));assert.equal(calls,2);assert.equal(cached.extractedPages[0].text,'Readable text of page 1.');assert.ok(updates.some(m=>/Reusing/.test(m)));
    await reader.extractTextFromPageRange(2,2);assert.equal(calls,2);await reader.extractTextFromPageRange(2,2,()=>{},{ocr:true});assert.equal(calls,2);
    reader.clear();assert.equal(reader._textCache,null);
  });
  await test('Cached PDF reads still respect cancellation and a replaced document',async({w,load})=>{
    load('js/pdf-extractor.js');const reader=w.pdfExtractor,makeDoc=text=>({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:text}]})}),destroy:async()=>{}});
    reader.currentDoc=makeDoc('The old document source.');await reader.extractTextFromPageRange(1,1);
    const controller=new w.AbortController();await assert.rejects(reader.extractTextFromPageRange(1,1,()=>controller.abort(),{signal:controller.signal}),{name:'AbortError'});
    reader.currentDoc=makeDoc('The new document source.');assert.equal((await reader.extractTextFromPageRange(1,1)).extractedPages[0].text,'The new document source.');
    reader._textCache=null;const finishing=new w.AbortController();
    await assert.rejects(reader.extractTextFromPageRange(1,1,(done,total)=>{if(done===total)finishing.abort();},{signal:finishing.signal}),{name:'AbortError'});assert.equal(reader._textCache,null);
  });
  await test('Skipped PDF pages are retried on the next extraction rather than cached as unreadable',async({w,load})=>{
    load('js/pdf-extractor.js');const reader=w.pdfExtractor;let readable=false,calls=0;
    reader.currentDoc={numPages:2,getPage:async number=>{calls++;return {getTextContent:async()=>({items:number===1||readable?[{str:`Page ${number} is now readable.`}]:[]})};}};
    const first=await reader.extractTextFromPageRange(1,2,()=>{},{skipUnreadable:true});assert.equal(first.skippedPages.length,1);assert.equal(reader._textCache,null);
    readable=true;const second=await reader.extractTextFromPageRange(1,2,()=>{},{skipUnreadable:true});assert.equal(second.extractedPages.length,2);assert.equal(calls,3);
  });

  await test('Legacy corrected partial drafts resume missing questions and start directly',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView,original=question(1,{aiReviewed:true}),key=w.QuizQuality.stem(original.questionText);
    c.generationDraft={options:{sourceType:'TEXT',sourceTitle:'Addition',questionCount:3},phase:'GENERATE',state:{questions:[original]},editedQuestions:{[key]:question(1,{questionText:'Student-corrected stem',explanation:'Student-corrected explanation',answerOrigin:'STUDENT_EDITED'})}};
    c.persistDraft();c.dispose();const restored=new c.constructor();w.createQuizView=restored;
    let calls=0,saved;const signal=new w.AbortController().signal;
    w.app.beginGeneration=()=>true;w.app.getGenerationContext=()=>({id:1,signal});w.app.endGeneration=()=>{};
    w.saveNewQuiz=async(meta,qs)=>{saved=qs;return 44;};
    w.geminiService={generateQuiz:async options=>{calls++;assert.equal(options.retryState.questions.length,1);assert.equal(options.retryState.questions[0].aiReviewed,true);return {title:'Ready',questions:[original,question(2),question(3)]};}};
    await restored.generateQuiz(true);assert.equal(calls,1);assert.equal(saved.length,3);assert.equal(w.started,44);
    assert.equal(saved[0].questionText,'Student-corrected stem');assert.equal(saved[0].explanation,'Student-corrected explanation');assert.equal(saved[0].answerOrigin,'STUDENT_EDITED');
  });

  await test('Invalid corrections in legacy drafts block direct saving without losing the draft',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView,key=w.QuizQuality.stem(question().questionText);
    c.generationDraft={options:{questionCount:1,sourceTitle:'Draft'},result:{questions:[question()]},editedQuestions:{[key]:question(1,{questionText:''})}};c.persistDraft();
    let saves=0;w.saveNewQuiz=async()=>++saves;await assert.rejects(c.saveReadyQuiz(),/need correction/);
    assert.equal(saves,0);assert.equal(c.generationDraft.result.questions[0].questionText,question().questionText);assert.ok(w.localStorage.getItem('hamsa_quiz_generation_draft'));
  });

  await test('Pre-generation notes, topic and settings autosave and restore without overriding explicit preferences',async({w,load})=>{
    load('js/study-preferences.js');load('js/views/create-quiz.js');const c=w.createQuizView;c.activeSource='TEXT';
    c.onNotesChange('Important unsaved notes');c.onTopicTitleChange('My topic');c.setLanguage('HINDI');c.setQuizMode('EXAM');c.setQuestionCount(20);
    c.studentSettings={level:'COLLEGE',exam:'College test',depth:'DETAILED',apiKey:'must-not-be-stored'};c.persistForm();
    const stored=w.localStorage.getItem('hamsa_quiz_form_draft');assert.ok(!stored.includes('must-not-be-stored'));c.dispose();
    const restored=new c.constructor();w.createQuizView=restored;await restored.render();
    assert.equal(restored.notesText,'Important unsaved notes');assert.equal(restored.customTopicTitle,'My topic');assert.equal(restored.selectedLanguage,'HINDI');
    assert.equal(restored.selectedQuizMode,'EXAM');assert.equal(restored.selectedQuestionCount,20);assert.equal(restored.studentSettings.level,'COLLEGE');assert.equal(restored.studentSettings.depth,'DETAILED');
    const input=w.document.getElementById('notes-textarea');restored.notesText=input.value='Changed via native input';input.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(JSON.parse(w.localStorage.getItem('hamsa_quiz_form_draft')).fields.notesText,'Changed via native input');
  });
  await test('Malformed form drafts cannot inject controller fields or invalid selections',({w,load})=>{
    w.localStorage.setItem('hamsa_quiz_form_draft',JSON.stringify({version:1,fields:{selectedQuizMode:'BROKEN',selectedQuestionCount:999,notesText:42,container:'bad',studentSettings:{level:'BAD',depth:'BAD'}}}));
    load('js/views/create-quiz.js');const c=w.createQuizView;assert.equal(c.selectedQuizMode,'PRACTICE');assert.equal(c.selectedQuestionCount,10);assert.equal(c.notesText,'');assert.ok(c.container instanceof w.HTMLElement);
  });
  await test('Form storage failure warns without losing in-tab notes or blocking render',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;w.Storage.prototype.setItem=()=>{throw Error('Quota');};
    c.onNotesChange('Keep these notes');c.onTopicTitleChange('Keep title');await c.render();assert.equal(c.notesText,'Keep these notes');
    assert.equal(w.toasts.filter(t=>/form could not be autosaved/.test(t.text)).length,1);
  });
  await test('PDF draft blob storage survives JSON recovery, capture and explicit deletion',async()=>{
    const f=fixture({db:true});try {const {w}=f,rows=new Map();w.testDb.quizDraftFiles={put:async row=>rows.set(row.id,{...row}),get:async id=>rows.get(id),delete:async id=>rows.delete(id),clear:async()=>rows.clear()};
      const file=new w.File(['Original PDF bytes'],'chapter.pdf',{type:'application/pdf'});await w.saveQuizDraftFile('draft-1',file);
      const recovered=JSON.parse(JSON.stringify({sourceType:'PDF',draftPdfId:'draft-1',sourcePages:[{pageNumber:2,text:'Chapter facts'}]}));
      const source=await w.quizSourceView.capture(recovered);assert.equal(source.files[0].name,'chapter.pdf');assert.ok(source.files[0].data.startsWith('data:application/pdf;base64,'));assert.equal(source.pages[0].pageNumber,2);
      const blob=await w.getQuizDraftFile('draft-1');assert.equal(blob.size,file.size);await w.deleteQuizDraftFile('draft-1');assert.equal(await w.getQuizDraftFile('draft-1'),null);
    } finally {f.close();}
  });
  await test('PDF generation persists recovery ID and discard removes only its own temporary file',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView,file=new w.File(['PDF'],'study.pdf',{type:'application/pdf'}),rows=new Map(),signal=new w.AbortController().signal;
    c.loadedPdfMeta={fileName:'study.pdf'};c.pdfTotalPages=1;w.pdfExtractor={currentFile:file,extractTextFromPageRange:async()=>({text:'Source facts',extractedPages:[{pageNumber:1,text:'Source facts'}],skippedPages:[]})};
    w.saveQuizDraftFile=async(id,pdf)=>rows.set(id,pdf);w.deleteQuizDraftFile=async id=>rows.delete(id);
    w.app.beginGeneration=()=>true;w.app.getGenerationContext=()=>({id:1,signal});w.app.endGeneration=()=>{};
    w.geminiService={generateQuiz:async()=>({questions:[question()]})};await c.generateQuiz();
    const saved=JSON.parse(w.localStorage.getItem('hamsa_quiz_generation_draft'));assert.ok(saved.options.draftPdfId);assert.ok(rows.has(saved.options.draftPdfId));
    rows.set('other',file);c.discardDraft();await Promise.resolve();assert.equal(rows.size,1);assert.ok(rows.has('other'));
  });
  await test('PDF draft recovery failure preserves source text and shows honest warning',async({w})=>{
    w.getQuizDraftFile=async()=>{throw Error('Storage unavailable');};const source=await w.quizSourceView.capture({sourceType:'PDF',draftPdfId:'missing',sourcePages:[{pageNumber:1,text:'Saved facts'}]});
    assert.equal(source.files.length,0);assert.equal(source.pages[0].text,'Saved facts');assert.ok(w.toasts.some(t=>/reattach/.test(t.text)));
  });
  await test('Quiz module reset clears temporary files, form drafts and in-memory recovered work',async()=>{
    const f=fixture({db:true});try{const {w,load}=f;let cleared=0;w.testDb.quizDraftFiles={clear:async()=>cleared++};load('js/views/create-quiz.js');
      w.createQuizView.onNotesChange('Sensitive notes');w.createQuizView.generationDraft={options:{sourceTitle:'Old draft'}};w.createQuizView.persistDraft();
      await w.clearModuleData('QUIZZES');assert.equal(cleared,1);assert.equal(w.localStorage.getItem('hamsa_quiz_form_draft'),null);assert.equal(w.localStorage.getItem('hamsa_quiz_generation_draft'),null);assert.equal(w.createQuizView.notesText,'');assert.equal(w.createQuizView.generationDraft,null);
    }finally{f.close();}
  });
  await test('Answer selection retains focus and announces selected/locked state in both modes',({w,load})=>{
    load('js/views/quiz-player.js');const p=w.quizPlayerView;
    for(const mode of ['EXAM','PRACTICE']){p.quiz={id:1,title:'Quiz',subject:'Math',difficulty:'EASY',quizMode:mode};p.questions=[question(1,{id:1})];p._resetAttemptState();p.render();
      const option=p.container.querySelector('[data-quiz-option="1"]');option.focus();p.selectOption(1);const selected=p.container.querySelector('[data-quiz-option="1"]');
      assert.equal(w.document.activeElement,selected);assert.equal(selected.getAttribute('aria-pressed'),'true');assert.equal(selected.getAttribute('aria-disabled'),String(mode==='PRACTICE'));assert.ok(selected.getAttribute('aria-label').includes('Option B'));
      if(mode==='EXAM')assert.ok(p.container.textContent.includes('continues in background tabs'));
    }
  });
  await test('PDF page switch, sliders and custom subject have accessible names',async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.loadedPdfMeta={fileName:'Source.pdf',pageCount:5};c.pdfTotalPages=5;c.includeAllPages=false;await c.render();
    for(const id of ['all-pages-toggle','slider-from','slider-to','custom-subject-input'])assert.ok(w.document.getElementById(id).getAttribute('aria-label'));
    for(const id of ['from-page-input','to-page-input'])assert.ok(w.document.querySelector(`label[for="${id}"]`));
  });
  await test('Clicking current Quiz module preserves active attempt and selected result without navigation',({w,load})=>{
    let src=read('js/app.js');src=src.slice(0,src.lastIndexOf("document.addEventListener('DOMContentLoaded'"));w.eval(src);let calls=0;w.app.navigate=()=>calls++;
    for(const currentView of ['quiz-player','quiz-result']){w.app.currentView=currentView;w.app.setModule('quiz');assert.equal(w.app.currentView,currentView);}
    assert.equal(calls,0);w.app.currentView='dashboard';w.app.setModule('quiz');assert.equal(calls,1);
  });

  await test('Quiz processing translates technical stages into student messages and preserves ready counts',async()=>{
    const f=fixture({app:true});try{const {w}=f;const fragment=w.document.createElement('div');
      fragment.innerHTML='<div id="batch-status-badge"></div><div id="batch-questions-count"></div><div id="batch-pills-container"></div>';w.document.body.append(fragment);
      for(const status of [
        {message:'Protecting quota: next AI step in 29s…',badgeText:'Quota cooldown'},
        {message:'Reading source batch 2/20…',badgeText:'Reading source',countText:'2/20 source batches read'},
        {message:'AI response was incomplete. Retrying this step…',badgeText:'Retrying AI step'},
        {message:'Independently checking 5 answers and explanations…',countText:'4/10 reviewed questions ready'},
        {message:'Writing 6 questions from the selected source…'},
        {message:'Opening your quiz…',completedQuestions:10,totalQuestions:10}
      ]) {
        w.app.handleGenerationProgress({...status,workflow:'quiz',batchIndex:2,totalBatches:20,percent:50});
        const text=[...['generating-title','batch-status-badge','batch-questions-count','batch-pills-container'].map(id=>w.document.getElementById(id).textContent)].join(' ');
        assert.ok(!/quota|token|batch|AI step|independent|MCQs/i.test(text),text);
        if(status.countText?.includes('questions'))assert.equal(w.document.getElementById('batch-questions-count').textContent,'4 / 10 questions ready');
      }
      assert.equal(w.document.getElementById('generating-title').textContent,'Opening your quiz…');
      assert.equal(w.document.getElementById('batch-questions-count').textContent,'10 / 10 questions ready');
    }finally{f.close();}
  });
  await test('Failed direct saving retains a completed draft and retries without regenerating',withDb(async({w,load})=>{
    load('js/views/create-quiz.js');const c=w.createQuizView;c.activeSource='TEXT';c.customTopicTitle='Addition';
    const signal=new w.AbortController().signal;w.app.beginGeneration=()=>true;w.app.getGenerationContext=()=>({id:1,signal});
    let writes=0;w.geminiService={generateQuiz:async()=>{writes++;return {title:'Addition',questions:[question()]};}};
    w.testDb.quizzes.fail=true;await c.generateQuiz();assert.equal(writes,1);assert.ok(c.generationDraft.result);assert.equal(w.started,undefined);
    w.testDb.quizzes.fail=false;await c.generateQuiz(true);assert.equal(writes,1);assert.ok(w.started);assert.equal(await w.testDb.quizzes.count(),1);assert.equal(c.generationDraft,null);
  }));

  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
