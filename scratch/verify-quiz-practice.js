/** Quiz player integration regressions. Uses isolated storage and mocked providers only. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve=>setImmediate(resolve));
function processingError(view,pattern) {
  const panel=view.container.querySelector('#quiz-processing');assert.ok(panel,'The processing box persists in this view.');
  assert.equal(view.container.querySelectorAll('#quiz-processing').length,1);
  const error=panel.querySelector('#quiz-process-error');assert.ok(error);assert.match(error.textContent,pattern);
  assert.equal(error.getAttribute('role'),'alert');assert.equal(panel.dataset.state,'error');
  assert.equal(view.container.querySelector('#quiz-notice'),null);
  assert.equal([...view.container.querySelectorAll('[role="alert"],.qz-notice-error')].filter(node=>!panel.contains(node)).length,0,'Failures stay inside processing.');
  return panel;
}
let passed = 0, failed = 0;
function quiz(id = 1, length = 4) {
  return {id,title:'Energy / ऊर्जा',source:{type:'TOPIC',text:'Energy conservation'},difficulty:'MIXED',language:'BILINGUAL',model:'fixture',createdAt:'2026-10-09T10:00:00Z',
    questions:Array.from({length},(_,i)=>({id:`q${i+1}`,question:`Energy question ${i+1}\nऊर्जा प्रश्न ${i+1}`,options:['First / पहला','Second / दूसरा','Third / तीसरा','Fourth / चौथा'],answerIndex:i%4,explanation:`Explanation ${i+1} / व्याख्या`,optionExplanations:['Reason A / कारण','Reason B / कारण','Reason C / कारण','Reason D / कारण'],sourcePage:null,difficulty:'MEDIUM'}))};
}
async function test(label, run) {
  const dom = new JSDOM('<section id="view-quiz"></section>',{url:'http://localhost/#quiz',runScripts:'outside-only'}), w = dom.window, rows = [quiz(),quiz(2)], attempts = [], calls = {generation:0,save:0,attempt:0,flashcards:0};
  w.confirm = ()=>true; w.UIUtils = {buildViewHero:()=>'<header class="vhero">Quiz</header>'}; w.app = {refreshIcons(){}};
  w.eval(read('js/sanitizer.js')); w.eval(read('js/quiz-tools.js')); w.eval(read('js/quiz-service.js'));
  const dbSource = read('js/db.js'); w.eval(dbSource.slice(dbSource.indexOf('function validatePdfQuizRecord'),dbSource.indexOf('let quizStorageBlocked')));
  w.quizService = {getDraft:()=>null,clear(){},discardDraft(){},generate:async options=>{calls.generation++; return {...quiz(),id:undefined,subject:options.subject,chapter:options.chapter,exam:options.exam};}};
  w.quizStore = {get:async id=>rows.find(q=>q.id===id),list:async()=>rows,listAttempts:async id=>attempts.filter(a=>a.quizId===id).slice().reverse(),
    save:async q=>{w.validatePdfQuizRecord(q); calls.save++; const saved={...clone(q),id:rows.length+1}; rows.push(saved); return saved;},
    remove:async id=>{const n=rows.findIndex(q=>q.id===id); if(n>=0)rows.splice(n,1);},
    saveAttempt:async(id,input)=>{calls.attempt++; const existing=attempts.find(a=>a.attemptKey===input.attemptKey); if(existing)return clone(existing); const result={...clone(w.scorePdfQuizAttempt(rows.find(q=>q.id===id),input)),id:attempts.length+1,quizId:id}; attempts.push(result); return clone(result);},
    convertToFlashcards:async(q,indices)=>{calls.flashcards++;return {count:indices.length,deck:{title:q.title}};}};
  w.eval(read('js/views/quiz.js')); const view=w.quizView; await view.render();
  try {await run({w,view,rows,attempts,calls});passed++;console.log('PASS '+label);}
  catch(error){failed++;console.error('FAIL '+label+': '+error.stack);}
  finally {view.onLeaveView();w.close();}
}
async function main() {
  await test('Creation exposes combined languages, mixed difficulty and plain batch information',({view})=>{
    assert.ok(view.container.querySelector('#quiz-language option[value=BILINGUAL]'));
    assert.ok(view.container.querySelector('#quiz-difficulty option[value=MIXED]'));
    assert.equal(view.container.querySelector('#quiz-batch-size'),null);
    assert.ok(view.container.textContent.includes('20 questions per batch'));
    assert.equal(view.form.count,'20');
  });
  await test('Practice clicks immediately show wrong and correct explanations without a second action or AI request',({w,view,rows,calls})=>{
    view.startQuiz(rows[0],false); view.paint();
    assert.equal(view.container.querySelector('.qz-feedback'),null);
    assert.equal(view.container.querySelector('[data-action=check-answer]'),null);
    view.container.querySelector('[data-action=answer][data-index="1"]').click();
    let feedback=view.container.querySelector('.qz-feedback');
    assert.match(feedback.textContent,/Incorrect — correct answer: A/);
    assert.ok(feedback.textContent.includes('Explanation 1 / व्याख्या'));
    assert.ok(view.container.querySelector('.qz-option-reason'));
    assert.equal(w.document.activeElement,feedback);
    assert.equal(view.readDraft(1).checked[0],true);
    view.answer(0);view.clearAnswer();assert.equal(view.answers[0],1);
    assert.equal(view.container.querySelectorAll('[data-action=answer]:disabled').length,4);
    view.goToQuestion(1);assert.equal(view.container.querySelector('.qz-feedback'),null);
    view.container.querySelector('[data-action=answer][data-index="1"]').click();
    feedback=view.container.querySelector('.qz-feedback');assert.match(feedback.textContent,/Correct!/);assert.ok(feedback.textContent.includes('Explanation 2'));
    view.goToQuestion(0);assert.match(view.container.querySelector('.qz-feedback').textContent,/Explanation 1/);
    assert.equal(calls.generation,0);
  });
  await test('Older unchecked Practice selections reveal their explanation after reload while unanswered questions stay hidden',async({w,view,rows})=>{
    view.startQuiz(rows[0],false);view.answers[0]=1;view.checked[0]=false;view.persistDraft();
    const restored=new w.QuizView();await restored.render();
    assert.equal(restored.answers[0],1);assert.equal(restored.checked[0],true);
    assert.match(restored.container.querySelector('.qz-feedback').textContent,/Explanation 1/);
    assert.equal(restored.container.querySelectorAll('[data-action=answer]:disabled').length,4);
    restored.goToQuestion(1);assert.equal(restored.checked[1],false);assert.equal(restored.container.querySelector('.qz-feedback'),null);
    assert.equal(restored.container.querySelectorAll('[data-action=answer]:disabled').length,0);restored.onLeaveView();
  });
  await test('Shuffled Practice options immediately show the canonical explanation and displayed correct letter',async({view,rows})=>{
    view.shuffle=items=>[...items].reverse();view.sessionSettings.shuffleOptions=true;view.startQuiz(rows[0],false);view.paint();
    view.container.querySelector('[data-action=answer][data-index="1"]').click();
    assert.match(view.container.querySelector('.qz-feedback').textContent,/Incorrect — correct answer: D/);
    assert.equal(view.container.querySelector('.qz-correct .qz-option-letter').textContent,'D');
    assert.match(view.container.querySelector('.qz-feedback').textContent,/Explanation 1/);
    await view.submitAttempt();assert.equal(view.result.incorrect,1);assert.equal(view.result.correct,0);
  });
  await test('Restored Exam selections ignore stale checked flags and keep solutions hidden and answers editable',async({w,view,rows})=>{
    view.sessionSettings.mode='EXAM';view.startQuiz(rows[0],false);view.answers[0]=1;view.checked[0]=true;view.persistDraft();
    const restored=new w.QuizView();await restored.render();
    assert.equal(restored.attemptSettings.mode,'EXAM');assert.equal(restored.checked[0],false);
    assert.equal(restored.container.querySelector('.qz-feedback'),null);assert.ok(!restored.container.textContent.includes('Explanation 1'));
    restored.answer(0);assert.equal(restored.answers[0],0);restored.clearAnswer();assert.equal(restored.answers[0],null);restored.onLeaveView();
  });
  await test('Exam permits answer changes and never reveals solutions before submit',async({view,rows})=>{
    view.sessionSettings.mode='EXAM';view.startQuiz(rows[0],false);view.paint();view.answer(1);view.checkAnswer();
    assert.equal(view.container.querySelector('.qz-feedback'),null);assert.ok(!view.container.textContent.includes('Explanation 1'));
    view.answer(0);view.clearAnswer();assert.equal(view.answers[0],null);view.answer(0);await view.submitAttempt();
    assert.ok(view.container.querySelector('.qz-review'));assert.equal(view.result.mode,'EXAM');
  });
  await test('Question and option shuffle preserve canonical answers through scoring and reload',async({w,view,rows})=>{
    view.shuffle=items=>[...items].reverse();view.sessionSettings.shuffleQuestions=true;view.sessionSettings.shuffleOptions=true;
    view.startQuiz(rows[0],false);view.paint();assert.deepEqual(clone(view.questionOrder),[3,2,1,0]);
    const first=view.container.querySelector('[data-action=answer]');assert.equal(first.dataset.index,'3');first.click();
    assert.equal(view.answers[3],3);view.setConfidence('HIGH');view.toggleMark();
    const replacement=new w.QuizView();await replacement.render();assert.equal(replacement.currentQuestionIndex(),3);
    assert.deepEqual(clone(replacement.optionOrder[3]),[3,2,1,0]);assert.equal(replacement.answers[3],3);
    assert.equal(replacement.confidence[3],'HIGH');assert.ok(replacement.marked.includes(3));
    await replacement.submitAttempt();assert.equal(replacement.result.correct,1);assert.equal(replacement.result.totalQuestions,4);replacement.onLeaveView();
  });
  await test('Position-dependent options keep their order when shuffle is enabled',({view,rows})=>{
    rows[0].questions[0].options=['First fact','Second fact','Both A and B','All of the above'];
    view.shuffle=items=>[...items].reverse();view.sessionSettings.shuffleOptions=true;view.startQuiz(rows[0],false);
    assert.deepEqual(clone(view.optionOrder[0]),[0,1,2,3]);assert.deepEqual(clone(view.optionOrder[1]),[3,2,1,0]);
  });
  await test('Quiz-specific drafts survive switching between quizzes',async({view,rows})=>{
    view.startQuiz(rows[0],false);view.answer(0);await view.openQuiz(2);view.answer(1);await view.openQuiz(1);
    assert.equal(view.answers[0],0);assert.equal(view.readDraft(2).answers[0],1);
  });
  await test('Autosave failure shows persistent warning and retries on the next change',({w,view,rows})=>{
    view.startQuiz(rows[0],false);const original=w.Storage.prototype.setItem;
    w.Storage.prototype.setItem=function(){throw Error('full');};view.answer(0);assert.equal(view.autosaveFailed,true);
    processingError(view,/Progress could not be saved/);
    w.Storage.prototype.setItem=original;view.toggleMark();assert.equal(view.autosaveFailed,false);
    assert.equal(view.container.querySelector('#quiz-process-error'),null);
  });
  await test('Timer deadline survives reload and auto-submit is idempotent with capped duration',async({w,view,rows,calls})=>{
    view.sessionSettings.mode='EXAM';view.sessionSettings.durationMinutes=1;view.startQuiz(rows[0],false);
    const deadline=Date.now()-10000;view.attemptStartedAt=deadline-60000;view.attemptDeadline=deadline;view.persistDraft();
    let confirms=0;w.confirm=()=>{confirms++;return false;};const replacement=new w.QuizView();await replacement.render();
    await tick();assert.equal(replacement.mode,'result');assert.equal(replacement.result.durationSeconds,60);
    assert.equal(Date.parse(replacement.result.completedAt),deadline);assert.equal(replacement.result.expired,true);
    replacement.tickAttemptTimer();await tick();assert.equal(calls.attempt,1);assert.equal(confirms,0);replacement.onLeaveView();
  });
  await test('Confirmation crossing the exam deadline caps completion and marks the result expired',async({w,view,rows,calls})=>{
    let clock=Date.now(),confirms=0;w.Date.now=()=>clock;
    view.sessionSettings.mode='EXAM';view.sessionSettings.durationMinutes=1;view.startQuiz(rows[0],false);
    const deadline=view.attemptDeadline;
    w.confirm=()=>{confirms++;clock=deadline+10000;return true;};await view.submitAttempt();
    assert.equal(confirms,1);assert.equal(calls.attempt,1);assert.equal(view.result.expired,true);
    assert.equal(Date.parse(view.result.completedAt),deadline);assert.equal(view.result.durationSeconds,60);
  });
  await test('Saved quizzes restore their own controls rather than another quiz’s settings',async({view,rows})=>{
    rows[0].sessionDefaults={mode:'EXAM',durationMinutes:20,marksPerQuestion:2,negativeMarks:0.5,shuffleQuestions:true,shuffleOptions:true,presetId:'mock'};
    await view.openQuiz(1);assert.equal(view.attemptSettings.mode,'EXAM');assert.equal(view.attemptSettings.negativeMarks,0.5);
    await view.openQuiz(2);assert.equal(view.attemptSettings.mode,'PRACTICE');assert.equal(view.attemptSettings.negativeMarks,0);
  });
  await test('Negative marks, confidence and review marks survive saved result review',async({view,rows})=>{
    view.sessionSettings={...view.sessionSettings,mode:'EXAM',marksPerQuestion:2,negativeMarks:0.5};view.startQuiz(rows[0],false);
    view.answers=[0,0,null,3];view.confidence=['HIGH','LOW',null,'HIGH'];view.marked=[1,2];await view.submitAttempt();
    assert.equal(view.result.score,3.5);assert.equal(view.result.maxMarks,8);assert.equal(view.result.incorrect,1);
    await view.showSaved();await view.showHistory(1);assert.ok(view.container.querySelector('[data-action=view-attempt]'));
    await view.viewAttempt(1,1);assert.equal(view.viewingHistory,true);assert.equal(view.result.confidence[1],'LOW');
  });
  await test('Wrong-only and skipped revision keep canonical slots and save separate subset scores',async({view,rows,attempts})=>{
    view.startQuiz(rows[0],false);view.answers=[0,0,null,3];await view.submitAttempt();view.retrySubset('WRONG');
    assert.deepEqual(clone(view.questionOrder),[1]);assert.deepEqual(clone(view.answers),[null,null,null,null]);
    view.answer(1);await view.submitAttempt();assert.equal(view.result.correct,1);assert.equal(view.result.totalQuestions,1);assert.equal(view.result.parentAttemptId,1);
    await view.viewAttempt(1,1);view.retrySubset('SKIPPED');assert.deepEqual(clone(view.questionOrder),[2]);view.answer(2);await view.submitAttempt();
    assert.equal(view.result.correct,1);assert.equal(attempts.length,3);
  });
  await test('Historical retake and revision cannot silently replace unfinished exam recovery',async({w,view,rows})=>{
    view.startQuiz(rows[0],false);view.answers=[0,0,null,3];await view.submitAttempt();view.retake();view.answer(0);
    await view.viewAttempt(1,1);w.confirm=()=>false;view.retake();assert.equal(view.mode,'result');assert.equal(view.readDraft(1).answers[0],0);
    view.retrySubset('WRONG');assert.equal(view.mode,'result');assert.equal(view.readDraft(1).answers[0],0);
  });
  await test('Retaking a saved exam keeps its own marking and timer controls',async({view,rows})=>{
    view.sessionSettings={...view.sessionSettings,mode:'EXAM',durationMinutes:20,marksPerQuestion:2,negativeMarks:0.5};view.startQuiz(rows[0],false);
    await view.submitAttempt();view.sessionSettings.mode='PRACTICE';view.retake();assert.equal(view.attemptSettings.mode,'EXAM');assert.equal(view.attemptSettings.durationMinutes,20);assert.equal(view.attemptSettings.negativeMarks,0.5);
  });
  await test('Review filters convert only shown questions and comparisons distinguish subsets',async({view,rows,calls})=>{
    view.startQuiz(rows[0],false);view.answers=[0,0,null,3];await view.submitAttempt();view.reviewFilter='WRONG';view.paint();
    assert.equal(view.container.querySelectorAll('.qz-review-question').length,1);await view.convertFlashcards();assert.equal(calls.flashcards,1);assert.ok(view.notice.includes('1 flashcards'));
    view.retrySubset('WRONG');view.answer(1);await view.submitAttempt();await tick();assert.ok(view.comparisonMarkup().includes('different modes, question sets or marking rules'));
  });
  await test('Manual editor saves quiz and exam controls locally without an AI call',async({view,calls})=>{
    view.chooseSource('MANUAL');view.form.title='My chapter test';view.manualQuestions=clone(quiz().questions.slice(0,2));
    view.form.language='BILINGUAL';view.sessionSettings.mode='EXAM';await view.saveManualQuiz();
    assert.equal(calls.generation,0);assert.equal(calls.save,1);assert.equal(view.mode,'attempt');assert.equal(view.currentQuiz.manual,true);assert.equal(view.attemptSettings.mode,'EXAM');
  });
  await test('Invalid manual options leave the editor recoverable rather than trapping ready data',async({view,calls})=>{
    view.chooseSource('MANUAL');view.form.title='Draft';view.manualQuestions=clone(quiz().questions.slice(0,1));view.manualQuestions[0].options=['x',' x ','b','c'];
    await view.saveManualQuiz();assert.equal(calls.save,0);assert.equal(view.readyQuiz,null);assert.equal(view.mode,'create');assert.ok(view.notice.includes('duplicate'));
    processingError(view,/duplicate/);
  });
  await test('Incomplete manual questions report their actionable validation inside processing',async({view,calls})=>{
    view.chooseSource('MANUAL');view.form.title='Draft';view.manualQuestions=[{question:'Incomplete question',options:['A','B','','D'],answerIndex:0,explanation:''}];
    await view.saveManualQuiz();assert.equal(calls.save,0);assert.equal(calls.generation,0);processingError(view,/Complete question 1/);
    assert.ok(!view.container.querySelector('#quiz-validation')?.textContent.includes('Complete question 1'));
  });
  await test('Invalid edited question count marks its input and centralizes the validation summary',({w,view})=>{
    view.chooseSource('TEXT');const text=view.container.querySelector('#quiz-text');text.value='Energy is conserved.';text.dispatchEvent(new w.Event('input',{bubbles:true}));
    const count=view.container.querySelector('#quiz-count');count.value='0';count.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(view.container.querySelector('#quiz-count').getAttribute('aria-invalid'),'true');processingError(view,/1 to 200/);
    assert.equal(view.container.querySelector('#quiz-generate').disabled,true);
    assert.ok(!view.container.querySelector('#quiz-validation')?.textContent.includes('Enter a whole number'));
  });
  await test('Moving between sections clears stale validation errors while retaining editable choices',async({w,view})=>{
    view.chooseSource('TEXT');let text=view.container.querySelector('#quiz-text');text.value='Energy is conserved.';text.dispatchEvent(new w.Event('input',{bubbles:true}));
    const count=view.container.querySelector('#quiz-count');count.value='0';count.dispatchEvent(new w.Event('input',{bubbles:true}));processingError(view,/1 to 200/);
    await view.showSaved();assert.equal(view.container.querySelector('#quiz-process-error'),null);view.showCreate();
    assert.equal(view.container.querySelector('#quiz-process-error'),null);assert.equal(view.form.count,'0');assert.equal(view.container.querySelector('#quiz-generate').disabled,true);
    assert.ok(!view.container.querySelector('#quiz-validation')?.textContent.includes('Enter a whole number'));
  });
  await test('Attempt comparison failures keep the saved result and show a single central error',async({w,view,rows})=>{
    view.startQuiz(rows[0],false);await view.submitAttempt();await tick();const result=view.result;
    w.quizStore.listAttempts=async()=>{throw Error('History unavailable');};await view.loadComparison();
    processingError(view,/Attempt comparison could not load/);assert.equal(view.result,result);assert.equal(view.resultUnsaved,false);
    assert.equal(view.container.querySelector('.qz-comparison'),null);assert.ok(view.container.querySelector('.qz-result'));
  });
  await test('Blocked print and flashcard failures remain in processing across result mode',async({w,view,rows})=>{
    view.startQuiz(rows[0],false);await view.submitAttempt();w.QuizTools={...w.QuizTools,printQuiz:()=>false};view.printQuiz();processingError(view,/print popup/i);
    w.quizStore.convertToFlashcards=async()=>{throw Error('Flashcard storage failed');};await view.convertFlashcards();processingError(view,/Flashcard storage failed/);
  });
  await test('Paused generation restores exam defaults, and checkpoints validate their bounds',async({w,view})=>{
    const defaults={mode:'EXAM',durationMinutes:30,marksPerQuestion:2,negativeMarks:0.5,shuffleQuestions:true,shuffleOptions:true,presetId:'mock'};
    const job={version:1,id:'job',title:'',source:{type:'TOPIC',text:'Energy'},count:20,difficulty:'MIXED',language:'BILINGUAL',tasks:null,next:0,questions:[],createdAt:new Date().toISOString(),sessionDefaults:defaults};
    w.quizService.getDraft=()=>job;view.restoreGenerationForm();assert.equal(view.sessionSettings.mode,'EXAM');assert.equal(view.sessionSettings.negativeMarks,0.5);
    const service=new w.QuizService();service._validateJob(job);assert.throws(()=>service._validateJob({...job,sessionDefaults:{...defaults,negativeMarks:4}}),/Invalid/);
  });
  await test('Print receives the selected saved attempt and no solutions for a question paper',async({w,view,rows})=>{
    let args;w.QuizTools={...w.QuizTools,printQuiz:(...values)=>{args=values;return true;}};view.startQuiz(rows[0],false);await view.submitAttempt();view.printQuiz();assert.equal(args[1],view.result);
    await view.openQuiz(1,false,true);view.printQuiz();assert.equal(args[1],null);
  });
  await test('Deleting one quiz removes its own recovery while preserving another quiz',async({view,rows})=>{
    view.startQuiz(rows[0],false);view.answer(0);await view.openQuiz(2);view.answer(1);await view.showSaved();await view.deleteQuiz(1);
    assert.equal(view.readDraft(1),null);assert.equal(view.readDraft(2).answers[0],1);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
