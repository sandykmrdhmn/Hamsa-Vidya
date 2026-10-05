/** Saved-first doubt review regressions. Isolated UI and mocked solver; no API calls. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
let passed=0,failed=0;
const question=(id=1)=>({id,questionText:`What is ${id} plus one?`,options:[String(id+1),String(id+2),String(id+3),String(id+4)],correctAnswerIndex:0,userSelectedOptionIndex:1,
  explanation:'Adding one gives the next integer.',optionExplanations:['Add one.','Adds two.','Adds three.','Adds four.'],memoryCue:'Move one step ahead.',aiReviewed:true,evidenceQuote:'The next integer is one larger.'});
const live=(text='Additional worked explanation')=>({success:true,isFallback:false,text,model:'gemini-3.6-flash'});
function fixture(){
  const dom=new JSDOM('<section id="view-quiz-result"></section><button id="launch">Review</button><div id="doubt-solver-drawer" aria-hidden="true"></div><div id="doubt-solver-backdrop"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[],prefs={language:'ENGLISH',level:'CLASS_6_8',depth:'SIMPLE'};
  w.console={log(){},warn(){},error(){}};
  w.fetch=async()=>{throw Error('Live network access is forbidden in this test');};
  w.app={refreshIcons(){},showToast(){},currentView:'quiz-result'};
  w.studyPreferences={get:()=>prefs};
  let reply=async()=>live(),model='gemini-3.6-flash';
  w.geminiService={getActiveModel:()=>model,solveQuestionDoubt:async options=>{calls.push(options);return reply(options);}};
  w.eval(read('js/sanitizer.js'));w.eval(read('js/quiz-quality.js'));w.eval(read('js/views/quiz-result.js'));
  const view=w.quizResultView;view.quiz={id:7,attemptId:2,subject:'Mathematics',language:'AUTO'};view.questions=[question(),question(2)];
  return {dom,w,view,calls,prefs,respond:fn=>reply=fn,setModel:value=>model=value};
}
async function test(name,fn){const f=fixture();try{await fn(f);passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}finally{f.dom.window.close();}}
(async()=>{
  await test('Opening and reopening renders saved reviewed reasoning, all option reasons and cue with zero AI calls',async({w,view,calls})=>{
    w.document.getElementById('launch').focus();view.openDoubtSolver(1);
    const drawer=w.document.getElementById('doubt-solver-drawer');
    for(const text of ['Saved reviewed explanation','Adding one gives the next integer.','Adds two.','Adds three.','Adds four.','Move one step ahead.','Ask AI: More detail'])assert.ok(drawer.textContent.includes(text));
    assert.equal(view.isDoubtLoading,false);assert.equal(view.doubtHistory.length,0);assert.ok(drawer.contains(w.document.activeElement));
    view.closeDoubtSolver();assert.equal(w.document.activeElement.id,'launch');view.openDoubtSolver(1);await Promise.resolve();assert.equal(calls.length,0);
  });
  await test('Legacy or flagged saved explanations are honestly labelled and still open without AI',({w,view,calls})=>{
    Object.assign(view.questions[0],{aiReviewed:false,reviewIssue:true,explanation:'',optionExplanations:[],memoryCue:''});view.openDoubtSolver(1);
    const text=w.document.getElementById('doubt-solver-drawer').textContent;
    assert.ok(text.includes('Saved explanation'));assert.ok(!text.includes('Saved reviewed explanation'));assert.ok(text.includes('flagged for review'));assert.ok(text.includes('was not saved'));assert.equal(calls.length,0);
  });
  await test('Explicit matching presets and reopened presets reuse a successful reply without another call',async({view,calls})=>{
    view.openDoubtSolver(1);await view.askDoubt('deep-rationale');assert.equal(calls.length,1);assert.equal(calls[0].conversationHistory.length,0);
    await view.askDoubt('deep-rationale');assert.equal(calls.length,1);assert.equal(view.doubtHistory.at(-1).note,'Reused your earlier AI explanation.');
    view.closeDoubtSolver();view.openDoubtSolver(1);assert.equal(view.doubtHistory.length,0);assert.equal(calls.length,1);
    await view.askDoubt('deep-rationale');assert.equal(calls.length,1);await view.askDoubt('why-wrong');assert.equal(calls.length,2);
  });
  await test('Changed content, key, source, revision, language, level, depth or model does not reuse stale reasoning',async({view,calls,prefs,setModel})=>{
    view.openDoubtSolver(1);const q=view.questions[0];await view.askDoubt('analogy');
    const changes=[()=>q.questionText+=' Explain carefully.',()=>q.options[1]='Different distractor',()=>q.correctAnswerIndex=1,()=>q.evidenceQuote='Changed source evidence',()=>q.updatedAt='revision-2',
      ()=>prefs.language='HINDI',()=>prefs.level='COLLEGE',()=>prefs.depth='DETAILED',()=>view.quiz.language='BILINGUAL',()=>setModel('different-approved-model')];
    for(const change of changes){const before=calls.length;change();await view.askDoubt('analogy');assert.equal(calls.length,before+1);}
  });
  await test('Custom follow-ups preserve earlier conversation and always request a new contextual answer',async({view,calls})=>{
    view.openDoubtSolver(1);await view.askDoubt('deep-rationale');await view.askDoubt('custom','Explain the second step.');
    assert.equal(calls[1].conversationHistory.length,2);assert.equal(calls[1].conversationHistory[1].text,'Additional worked explanation');
    await view.askDoubt('custom','Explain the second step.');assert.equal(calls.length,3);assert.equal(calls[2].conversationHistory.length,4);
    await view.askDoubt('analogy');assert.equal(calls[3].conversationHistory.length,0);assert.equal(view.doubtHistory.length,8);
  });
  await test('Offline fallbacks, rejected results, empty replies and errors are not cached as successful AI',async({view,calls,respond})=>{
    view.openDoubtSolver(1);
    for(const reply of [{success:true,isFallback:true,text:'Saved explanation',model:'Saved explanation',note:'Live AI unavailable'}, {success:false,isFallback:false,text:'Failed response'},live('')]){
      respond(async()=>reply);const before=calls.length;await view.askDoubt('mnemonic');await view.askDoubt('mnemonic');assert.equal(calls.length,before+2);assert.equal(view._doubtPresetCache.size,0);
    }
    respond(async()=>{throw Error('Offline');});const before=calls.length;await view.askDoubt('mnemonic');await view.askDoubt('mnemonic');assert.equal(calls.length,before+2);assert.equal(view._doubtPresetCache.size,0);
    respond(async()=>live());await view.askDoubt('mnemonic');assert.equal(view._doubtPresetCache.size,1);
  });
  await test('Concurrent clicks are deduplicated and cancelled old replies neither display nor enter cache',async({view,calls,respond})=>{
    let resolve;respond(()=>new Promise(done=>resolve=done));view.openDoubtSolver(1);const pending=view.askDoubt('deep-rationale'),signal=calls[0].signal;
    await view.askDoubt('analogy');assert.equal(calls.length,1);view.closeDoubtSolver();assert.equal(signal.aborted,true);view.openDoubtSolver(2);resolve(live('Old question answer'));await pending;
    assert.equal(view.doubtHistory.length,0);assert.equal(view._doubtPresetCache.size,0);assert.equal(view.isDoubtLoading,false);
  });
  await test('Successful corrections clear cached explanations and prevent in-flight results from repopulating old cache',async({w,view,calls,respond})=>{
    view.openDoubtSolver(1);await view.askDoubt('analogy');assert.equal(view._doubtPresetCache.size,1);
    let resolve;respond(()=>new Promise(done=>resolve=done));const pending=view.askDoubt('deep-rationale');
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.onclose?.();};
    w.getQuizQuestion=async()=>question();let corrections=0;w.updateQuizQuestion=async()=>{corrections++;};
    await view.openQuestionEditor(1);const form=w.document.querySelector('.quiz-edit-dialog form');form.elements.namedItem('explanation').value='Corrected reasoning';
    await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(corrections,1);assert.equal(view._doubtPresetCache.size,0);
    resolve(live());await pending;assert.equal(view._doubtPresetCache.size,0);
    respond(async()=>live());const before=calls.length;await view.askDoubt('analogy');assert.equal(calls.length,before+1);
  });
  await test('Cache remains bounded and evicts the oldest reply while recent replies stay reusable',async({view,calls})=>{
    view.questions=Array.from({length:25},(_,i)=>question(i+1));
    for(const q of view.questions){view.openDoubtSolver(q.id);await view.askDoubt('analogy');}
    assert.equal(calls.length,25);assert.equal(view._doubtPresetCache.size,24);
    view.openDoubtSolver(25);await view.askDoubt('analogy');assert.equal(calls.length,25);view.openDoubtSolver(1);await view.askDoubt('analogy');assert.equal(calls.length,26);assert.equal(view._doubtPresetCache.size,24);
  });
  await test('Escape cancels an explicit request and result re-render retains drawer keyboard focus',async({w,view,respond})=>{
    view.openDoubtSolver(1);let resolve;respond(()=>new Promise(done=>resolve=done));const pending=view.askDoubt('deep-rationale'),signal=view._doubtController.signal;
    view.updateDoubtMessagesDom();const drawer=w.document.getElementById('doubt-solver-drawer');assert.ok(drawer.contains(w.document.activeElement));
    drawer.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(view.isDoubtDrawerOpen,false);assert.equal(signal.aborted,true);
    resolve(live('Late reply'));await pending;assert.equal(view.doubtHistory.length,1);assert.equal(view._doubtPresetCache.size,0);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
