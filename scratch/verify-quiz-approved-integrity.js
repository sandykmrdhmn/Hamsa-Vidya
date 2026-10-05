/** Approved integrity/retry/budget fixes: isolated memory and mocked AI only. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const ok=value=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
const question=(n=1,extra={})=>({questionText:`What is ${n} plus one?`,options:[`${n+1}`,`${n+2}`,`${n+3}`,`${n+4}`],correctAnswerIndex:0,explanation:'Add one.',topic:'Arithmetic',...extra});
const reviews=qs=>({reviews:qs.map((q,index)=>({index,verdict:'ACCEPT',correctAnswerIndex:q.correctAnswerIndex??0,reason:'Checked independently.',optionExplanations:['Correct','Incorrect','Incorrect','Incorrect']}))});
function fixture(){
  const dom=new JSDOM('<main/>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  for(const file of ['js/quiz-quality.js','js/quiz-engine.js'])w.eval(read(file));
  let now=Date.now();w.Date.now=()=>now;w.QuizQuality.wait=async(ms,signal)=>{w.QuizQuality.abort(signal);now+=ms;};
  w.aiClient={probeServerKey:async()=>true,getQuizInputBudget:()=>12000,fetchGenerateContent:async()=>{throw Error('Unexpected fixture call');},createError:async response=>{
    const body=await response.json(),error=Error(body.error?.message||`HTTP ${response.status}`);
    error.status=response.status;error.code=body.error?.code;return error;
  }};
  const service={isAiAvailable:()=>true,getApiKey:()=>'',setActiveModel(){}};
  return {dom,w,service,advance:ms=>now+=ms};
}
let passed=0,failed=0;
async function test(name,run){const f=fixture();try{await run(f);passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}finally{f.dom.window.close();}}
const printed=(extra={})=>({questionText:'What color is the sky?',options:['Blue','Green','Red','White'],correctAnswerIndex:0,sourcePage:1,evidenceQuote:'What color is the sky?',sourceQuestionNumber:1,keySourcePage:2,keyEvidenceQuote:'1. A',...extra});
const paper=[{pageNumber:1,text:'1. What color is the sky? A. Blue B. Green C. Red D. White'},{pageNumber:2,text:'Answer Key\n1. A'}];
(async()=>{
  await test('Numbered imports require the actual printed stem and every ordered option',({w})=>{
    const Q=w.QuizQuality;assert.ok(Q.sourceKeySupported(printed(),paper));
    assert.equal(Q.sourceKeySupported(printed({questionText:'What is the capital of France?',options:['Rome','Paris','Berlin','Tokyo']}),paper),false);
    assert.equal(Q.sourceKeySupported(printed({options:['Blue','Green','Yellow','White']}),paper),false);
    assert.equal(Q.sourceKeySupported(printed({options:['Blue','Red','Green','White']}),paper),false);
    assert.equal(Q.sourceKeySupported(printed({options:['Blue','Green','Red','Wh']}),paper),false);
  });
  await test('Hindi numbering, line wrapping and printed option labels remain importable',({w})=>{
    const q=printed({questionText:'आकाश का रंग क्या है?',options:['(क) नीला','(ख) हरा','(ग) लाल','(घ) सफेद'],evidenceQuote:'आकाश का रंग क्या है?',sourceQuestionNumber:'१',keyEvidenceQuote:'१. क'});
    const pages=[{pageNumber:1,text:'प्रश्न १. आकाश का रंग\nक्या है? (क) नीला\n(ख) हरा (ग) लाल (घ) सफेद'},{pageNumber:2,text:'उत्तर कुंजी\n१. क'}];
    assert.ok(w.QuizQuality.sourceKeySupported(q,pages));
  });
  await test('Technical signs and chemistry case cannot be changed in printed options',({w})=>{
    const q=printed({questionText:'Select the chemical symbol.',options:['Co','CO','C + O','C - O'],evidenceQuote:'Select the chemical symbol.'});
    const pages=[{pageNumber:1,text:'1. Select the chemical symbol. (A) Co [B] CO C: C + O D) C - O'},paper[1]];
    assert.ok(w.QuizQuality.sourceKeySupported(q,pages));
    assert.equal(w.QuizQuality.sourceKeySupported({...q,options:['co','CO','C + O','C - O']},pages),false);
    assert.equal(w.QuizQuality.sourceKeySupported({...q,options:['Co','CO','C - O','C + O']},pages),false);
  });
  await test('Contiguous page continuation works but skipped pages cannot provide missing options',({w})=>{
    const q=printed({keySourcePage:3});
    const pages=[{pageNumber:1,text:'1. What color is the sky? A. Blue'},{pageNumber:2,text:'B. Green C. Red D. White\n2. Which gas is oxygen? A. O2 B. CO2 C. N2 D. He'},{pageNumber:3,text:'Answer Key\n1. A; 2. A'}];
    assert.ok(w.QuizQuality.sourceKeySupported(q,pages));
    assert.equal(w.QuizQuality.sourceKeySupported({...q,keySourcePage:4},[pages[0],{...pages[1],pageNumber:3},{...pages[2],pageNumber:4}]),false);
    assert.ok(w.QuizQuality.sourceKeySupported({...q,evidenceQuote:'What color is the'},[
      {pageNumber:1,text:'1. What color is the'},{pageNumber:2,text:'sky? A. Blue B. Green C. Red D. White'},pages[2]
    ]));
  });
  await test('Imports cannot borrow options from a following question or an ambiguous numbered section',({w})=>{
    const short={pageNumber:1,text:'1. What color is the sky? A. Blue B. Green\n2. Another question? A. Wrong B. Wrong C. Red D. White'};
    assert.equal(w.QuizQuality.sourceKeySupported(printed(),[short,paper[1]]),false);
    assert.equal(w.QuizQuality.sourceKeySupported(printed({keySourcePage:3}),[paper[0],{pageNumber:2,text:'Section Two\n1. Another question? A. One B. Two C. Three D. Four'},{...paper[1],pageNumber:3}]),false);
  });
  await test('Inline answer keys cannot bypass exact option binding for numbered or unnumbered questions',({w})=>{
    const q=printed({questionText:'Which city is the capital of France?',options:['Paris','Berlin','Rome','Madrid'],correctAnswerIndex:1,evidenceQuote:'1. Which city is the capital of France?',keySourcePage:1,keyEvidenceQuote:'Answer: B'});
    const text='1. Which city is the capital of France? A) Paris is not the answer B) Berlin C) Rome D) Madrid Answer: B';
    assert.equal(w.QuizQuality.sourceKeySupported(q,[{pageNumber:1,text}]),false);
    assert.equal(w.QuizQuality.sourceKeySupported({...q,sourceQuestionNumber:null,evidenceQuote:q.questionText},[{pageNumber:1,text:text.slice(3)}]),false);
    assert.ok(w.QuizQuality.sourceKeySupported(q,[{pageNumber:1,text:text.replace('Paris is not the answer','Paris')}]));
  });
  await test('Full import pipeline rejects invented options without adding a reviewer call',async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async(model,payload)=>{calls++;assert.ok(payload.contents[0].parts[0].text.startsWith('Extract complete'));return ok({found:true,questions:[printed({options:['Blue','Green','Invented','White']})]});};
    const result=await w.quizEngine.extract(service,{sourceTitle:'Paper',sourcePages:paper});
    assert.equal(result.questions.length,0);assert.ok(result.invalidCount>0);assert.equal(calls,w.QuizQuality.chunks('',paper,3000).length);
  });
  await test('Balanced sampling sends unseen chunks before repeating earlier pairs',({w})=>{
    const engine=w.quizEngine,first=engine.selectSourceChunks(4,0,2,[]),second=engine.selectSourceChunks(4,1,2,first);
    assert.deepEqual(Array.from(first),[0,2]);assert.deepEqual(Array.from(second),[1,3]);
    let sent=[];for(let batch=0;batch<10;batch++)sent.push(...engine.selectSourceChunks(20,batch,10,sent));
    assert.equal(new Set(sent).size,20);assert.equal(sent.length,20);
    assert.deepEqual(Array.from(engine.selectSourceChunks(1,5,2,[0])),[0]);
  });
  await test('Four source chunks and twenty questions retain four generation/review calls',async({w,service})=>{
    const pages=Array.from({length:4},(_,i)=>({pageNumber:i+1,text:`Page ${i+1} gives an exact study fact. `+'x'.repeat(5900)}));let calls=0,serial=0;
    w.aiClient.fetchGenerateContent=async(model,payload)=>{calls++;const prompt=payload.contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){const page=Number(prompt.match(/\[PAGE (\d+)\]/)[1]);return ok({questions:Array.from({length:10},()=>question(++serial,{sourcePage:page,evidenceQuote:`Page ${page} gives an exact study fact.`}))});}
      return ok(reviews(JSON.parse(prompt.split('QUESTIONS:\n')[1])));
    };
    const result=await w.quizEngine.generate(service,{sourceType:'PDF',sourceTitle:'Four pages',sourcePages:pages,questionCount:20});
    assert.equal(calls,4);assert.equal(result.questions.length,20);assert.equal(result.coverage.readChunks,4);assert.equal(result.coverage.sampled,false);
  });
  for(const finishReason of ['SAFETY','RECITATION','MAX_TOKENS'])await test(`${finishReason} output is never resent automatically`,async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async()=>{calls++;return Response.json({candidates:[{finishReason,content:{parts:[{text:'{"unfinished":'}]}}]});};
    await assert.rejects(w.quizEngine.request(service,'Fixture'),error=>error.retryable===false);assert.equal(calls,1);
  });
  await test('Prompt-level blocking is terminal even without a candidate',async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async()=>{calls++;return Response.json({promptFeedback:{blockReason:'SAFETY'}});};
    await assert.rejects(w.quizEngine.request(service,'Fixture'),error=>error.code==='AI_RESPONSE_BLOCKED');assert.equal(calls,1);
  });
  for(const status of [404,413,502])await test(`HTTP ${status} pauses after one request`,async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async()=>{calls++;return Response.json({error:{message:'Fixture failure'}},{status});};
    await assert.rejects(w.quizEngine.request(service,'Fixture'),error=>error.status===status);assert.equal(calls,1);
  });
  for(const code of ['AI_TIMEOUT','AI_UPSTREAM_TIMEOUT','AI_NETWORK_UNCERTAIN'])await test(`${code} pauses without repeating uncertain generation`,async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async()=>{calls++;throw Object.assign(Error('Fixture connection failure'),{code});};
    await assert.rejects(w.quizEngine.request(service,'Fixture'),error=>error.code===code);assert.equal(calls,1);
  });
  await test('Malformed completed JSON retains one bounded repair attempt',async({w,service})=>{
    let calls=0;w.aiClient.fetchGenerateContent=async()=>++calls===1?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{bad JSON'}]}}]}):ok({valid:true});
    assert.equal((await w.quizEngine.request(service,'Fixture',{validate:value=>value.valid})).data.valid,true);assert.equal(calls,2);
  });
  await test('Truncated review retains writer candidates and explicit resume reviews only pending work',async({w,service})=>{
    let writes=0,reviewCalls=0,truncate=true;
    w.aiClient.fetchGenerateContent=async(model,payload)=>{const prompt=payload.contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){writes++;return ok({questions:[question()]});}
      reviewCalls++;return truncate?Response.json({candidates:[{finishReason:'MAX_TOKENS'}]}):ok(reviews([question()]));
    };
    const options={sourceTitle:'Addition',questionCount:1};let state;
    await assert.rejects(w.quizEngine.generate(service,options),error=>{state=error.retryState;return error.code==='AI_OUTPUT_TRUNCATED';});
    assert.equal(state.questions.length,0);assert.equal(state.pendingCandidates.length,1);assert.equal(writes,1);assert.equal(reviewCalls,1);
    truncate=false;const result=await w.quizEngine.generate(service,{...options,retryState:JSON.parse(JSON.stringify(state))});
    assert.equal(result.questions.length,1);assert.ok(result.questions[0].aiReviewed);assert.equal(writes,1);assert.equal(reviewCalls,2);
  });
  await test('Job plan accounts for detailed reviews, resumed work, split groups and bounded quota waits',({w})=>{
    const engine=w.quizEngine,now=w.Date.now(),normal=engine.createRun({},0,10),detailed=engine.createRun({settings:{depth:'DETAILED'}},0,10);
    try{assert.equal(normal.deadlineAt-now,240000);assert.equal(detailed.deadlineAt-now,360000);
      normal.reserveStage();normal.reserveStage();normal.reserveStage();assert.equal(normal.deadlineAt-now,360000);
      normal.reserveWait(60000);assert.equal(normal.deadlineAt-now,420000);normal.reserveWait(2000000);assert.equal(normal.deadlineAt-now,900000);
      const resumed=engine.createRun({settings:{depth:'DETAILED'},retryState:{questions:Array(5),pendingCandidates:Array(5)}},0,10);
      try{assert.equal(resumed.plannedStages,1);assert.equal(resumed.deadlineAt-now,180000);}finally{resumed.close();}
      assert.equal(engine.REQUEST_TIMEOUT_MS,120000);assert.equal(engine.REQUEST_BUDGET_MS,180000);
    }finally{normal.close();detailed.close();}
  });
  await test('Request attempts and validation/checkpoint diagnostics carry job counts without question text',async({w,service})=>{
    const requests=[],timings=[];w.aiClient.recordStageTiming=(stage,startedAt,metadata)=>timings.push({stage,...metadata});
    w.aiClient.fetchGenerateContent=async(model,payload,options)=>{requests.push(options);return ok(payload.contents[0].parts[0].text.startsWith('Create exactly')?{questions:[question()]}:reviews([question()]));};
    await w.quizEngine.generate(service,{sourceTitle:'Addition',questionCount:1,jobId:7});
    assert.deepEqual(requests.map(request=>[request.stage,request.jobId,request.attempt]),[['writer',7,1],['review',7,1]]);
    assert.ok(timings.some(timing=>timing.stage==='quiz-checkpoint'&&timing.questions===1));
    assert.ok(timings.some(timing=>timing.stage==='quiz-answer-validation'&&timing.accepted===1&&timing.rejected===0&&timing.unresolved===0));
    assert.equal(JSON.stringify(timings).includes('What is'),false);assert.ok(timings.every(timing=>timing.jobId===7));
  });
  await test('Known waiting cannot overrun the existing per-step budget',async({w,service})=>{
    const run=w.quizEngine.createRun({},0,10);let calls=0;run.retryNotBefore=w.Date.now()+180001;
    w.aiClient.fetchGenerateContent=async()=>{calls++;return ok({});};
    try{await assert.rejects(w.quizEngine.request(service,'Fixture',{run}),/request budget/);assert.equal(calls,0);}finally{run.close();}
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
