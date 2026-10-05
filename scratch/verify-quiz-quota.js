/** Real transport/error parser, mocked Gemini responses; no credentials or paid calls. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const http=require('http'),vm=require('vm'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
let passed=0,failed=0;
const question=(n=1)=>({questionText:`What is ${n} plus one?`,options:[`${n+1}`,`${n+2}`,`${n+3}`,`${n+4}`],correctAnswerIndex:0,explanation:'Add one to the given number.',optionExplanations:['Adds one','Adds two','Adds three','Adds four'],topic:'Addition'});
const ok=data=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});
const quota=({id='GenerateRequestsPerMinutePerProjectPerModel-FreeTier',value='5',delay='28.4125796s',message='You exceeded your current quota, please check your plan and billing details. Quota exceeded, limit: 5, model: gemini-3.6-flash. Please retry in 28.4125796s.',headers={}}={})=>Response.json({error:{code:429,status:'RESOURCE_EXHAUSTED',message,details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:id,quotaValue:value}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:delay}]}},{status:429,headers});
function fixture(){
  const dom=new JSDOM('<section id="view-create-quiz"></section>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  w.console={warn(){},error(){},log(){}};
  w.localStorage.setItem('hamsa_gemini_api_key','test-only');
  w.fetch=async()=>Response.json({configured:false});
  w.eval(read('js/ai-client.js'));w.eval(read('js/quiz-quality.js'));w.eval(read('js/quiz-engine.js'));w.eval(read('js/gemini-service.js'));
  const service=w.geminiService;service.discoverAvailableModels=async()=>service.candidateModels;
  let clock=100000;w.Date.now=()=>clock;
  const waits=[];w.QuizQuality.wait=async(ms,signal)=>{w.QuizQuality.abort(signal);waits.push(ms);clock+=ms;w.QuizQuality.abort(signal);};
  return {dom,w,service,waits,options:{sourceType:'TOPIC',sourceTitle:'Addition',subject:'Mathematics',questionCount:1,language:'ENGLISH'},now:()=>clock};
}
async function test(name,fn){const f=fixture();try{await f.w.aiClient.probeServerKey();await fn(f);passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}finally{f.dom.window.close();}}
(async()=>{
  await test('Screenshot quota is temporary despite generic plan/billing text; body RetryInfo and printed RPM are parsed',async({w})=>{
    const response=quota({value:null});const error=await w.aiClient.createError(response);
    assert.equal(error.status,429);assert.equal(error.retryable,true);assert.equal(error.code,'AI_RATE_LIMIT');
    assert.equal(error.retryAfterMs,28412.5796);assert.equal(error.requestIntervalMs,12100);
    assert.ok(!error.userMessage.includes('googleapis'));assert.ok(error.userMessage.includes('29 seconds'));
  });
  await test('Header, JSON seconds/nanos and message delays use the longest advertised wait',async({w})=>{
    let error=await w.aiClient.createError(quota({delay:{seconds:'30',nanos:500000000},headers:{'Retry-After':'35'}}));assert.equal(error.retryAfterMs,35000);
    error=await w.aiClient.createError(quota({delay:'1s',headers:{'Retry-After':new Date(w.Date.now()+45000).toUTCString()}}));assert.equal(error.retryAfterMs,45000);
    error=await w.aiClient.createError(Response.json({error:'Rate limit exceeded. Retry in 17s.'},{status:429}));assert.equal(error.retryAfterMs,17000);
    assert.equal(error.message,'Rate limit exceeded. Retry in 17s.');
  });
  await test('Daily, zero-quota and spending failures remain terminal even with RetryInfo',async({w})=>{
    const cases=[quota({id:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}),quota({value:'0'}),quota({message:'Project spending cap reached'})];
    for(const response of cases){const error=await w.aiClient.createError(response);assert.equal(error.retryable,false);assert.notEqual(error.code,'AI_RATE_LIMIT');}
  });
  await test('Temporary 429 waits correctly, retries same model and completes independent answer review',async({w,service,options,waits})=>{
    const models=[],statuses=[];let calls=0;
    w.fetch=async(url,init)=>{
      models.push(url);const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(++calls===1)return quota();
      return prompt.startsWith('Independently solve')?ok({reviews:[{index:0,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Add one.',optionExplanations:['Adds one','Adds two','Adds three','Adds four']}]}):ok({questions:[question()]});
    };
    const result=await service.generateQuiz({...options,onStatusUpdate:s=>statuses.push(s)});
    assert.equal(calls,3);assert.equal(new Set(models).size,1);assert.equal(result.questions[0].aiReviewed,true);
    assert.ok(waits[0]>=28412.5796);assert.ok(waits.some(ms=>ms>=12100));assert.ok(statuses.some(s=>/Retrying this step/.test(s.message)));
  });
  await test('Persistent minute limits stop after two calls without model hopping',async({w,service,options})=>{
    let calls=0;w.fetch=async()=>{calls++;return quota();};
    await assert.rejects(service.generateQuiz(options),e=>e.code==='AI_RATE_LIMIT'&&!!e.retryState);assert.equal(calls,2);
  });
  await test('Daily and zero quota consume only one request; long delay never retries prematurely',async({w,service,options,waits})=>{
    for(const make of [()=>quota({id:'GenerateRequestsPerDayPerProjectPerModel'}),()=>quota({value:'0'}),()=>quota({delay:'120s'})]){
      for(const key of Object.keys(w.localStorage))if(key.startsWith('hamsa_ai_pacing_'))w.localStorage.removeItem(key);
      w.aiClient._quotaMemory.clear();
      let calls=0;w.fetch=async()=>{calls++;return make();};await assert.rejects(service.generateQuiz(options),e=>e.status===429);assert.equal(calls,1);
    }
    assert.equal(waits.length,0);
  });
  await test('Cancellation during cooldown performs no retry',async({w,service,options})=>{
    const controller=new w.AbortController();let calls=0;w.fetch=async()=>{calls++;return quota();};
    w.QuizQuality.wait=async(ms,signal)=>{controller.abort();w.QuizQuality.abort(signal);};
    await assert.rejects(service.generateQuiz({...options,signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);
  });
  await test('Sibling source steps use the shared cooldown and stagger request slots',async({w,service,now,waits})=>{
    const run={deadlineAt:now()+150000,retryNotBefore:now()+28000,requestIntervalMs:12100,retry(){}};
    const times=[];w.fetch=async()=>{times.push(now());return ok({facts:[]});};
    await Promise.all([w.quizEngine.request(service,'Source A',{run}),w.quizEngine.request(service,'Source B',{run})]);
    assert.equal(times.length,2);assert.ok(waits[0]>=28000);assert.ok(waits.length>=2);assert.ok(run.nextRequestAt>=152200);
  });
  await test('Real concurrent workers send staggered requests instead of a retry burst',async({w,service})=>{
    w.aiClient.QUIZ_REQUEST_INTERVAL_MS=35;
    w.Date.now=Date.now;
    w.QuizQuality.wait=async(ms,signal)=>{w.QuizQuality.abort(signal);await new Promise(resolve=>setTimeout(resolve,ms));w.QuizQuality.abort(signal);};
    const start=Date.now(),run={deadlineAt:start+5000,retryNotBefore:start+45,requestIntervalMs:35,retry(){}};
    const times=[];w.fetch=async()=>{times.push(Date.now());return ok({facts:[]});};
    await Promise.all([w.quizEngine.request(service,'Source A',{run}),w.quizEngine.request(service,'Source B',{run})]);
    assert.equal(times.length,2);assert.ok(times[0]-start>=40);assert.ok(times[1]-times[0]>=25);
  });
  await test('Failed review saves unreviewed candidates; JSON-restored resume reviews without rewriting',async({w,service,options})=>{
    let writes=0,reviews=0;
    w.fetch=async(url,init)=>{const prompt=JSON.parse(init.body).contents[0].parts[0].text;if(prompt.startsWith('Independently solve')){reviews++;return quota({id:'GenerateRequestsPerDayPerProjectPerModel'});}writes++;return ok({questions:[question()]});};
    let state;await assert.rejects(service.generateQuiz(options),e=>{state=JSON.parse(JSON.stringify(e.retryState));return e.status===429;});
    assert.equal(state.questions.length,0);assert.equal(state.pendingCandidates.length,1);assert.equal(writes,1);
    await assert.rejects(service.generateQuiz({...options,retryState:state}),e=>e.code==='AI_DAILY_QUOTA');
    assert.equal(reviews,1); // No request before the real reset window.
    w.Date.now=()=>Date.now()+48*3600000;
    w.aiClient.QUIZ_REQUEST_INTERVAL_MS=0;
    w.fetch=async(url,init)=>{assert.ok(JSON.parse(init.body).contents[0].parts[0].text.startsWith('Independently solve'));reviews++;return ok({reviews:[{index:0,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Add one.',optionExplanations:['Adds one','Adds two','Adds three','Adds four']}]});};
    const result=await service.generateQuiz({...options,retryState:state});assert.equal(result.questions.length,1);assert.equal(result.questions[0].aiReviewed,true);assert.equal(writes,1);assert.equal(reviews,2);
  });
  await test('Quiz UI uses concise actionable quota message and retains resumable checkpoint',async({w})=>{
    w.eval(read('js/sanitizer.js'));w.UIUtils={buildViewHero:()=>''};
    const signal=new w.AbortController().signal,toasts=[];
    w.app={currentView:'create-quiz',beginGeneration:()=>true,getGenerationContext:()=>({id:1,signal}),endGeneration(){},showToast:text=>toasts.push(text)};
    w.eval(read('js/views/create-quiz.js'));const view=w.createQuizView;view.activeSource='TEXT';view.customTopicTitle='Addition';view.render=async()=>{};
    const error=await w.aiClient.createError(quota({id:'GenerateRequestsPerDayPerProjectPerModel'}));error.retryState={questions:[]};
    w.geminiService.generateQuiz=async()=>{throw error;};await view.generateQuiz();
    assert.ok(toasts.at(-1).includes('daily quota'));assert.ok(!toasts.at(-1).includes('billing details'));assert.ok(view.generationDraft.state);
    assert.ok(read('css/main.css').includes('.toast > span'));assert.ok(read('css/main.css').includes('overflow-wrap: anywhere'));
  });
  await test('Production proxy forwards upstream 429 Retry-After and structured details for POST and model listing',async()=>{
    const actualRequire=createRequire(path.join(root,'server.js'));let server;
    const policy=actualRequire('./ai-proxy-policy');
    const context={require:name=>name==='http'?{...http,createServer:handler=>(server=http.createServer(handler))}:name==='./ai-proxy-policy'?{...policy,ProxyBudget:class extends policy.ProxyBudget{constructor(options){super({...options,file:null});}}}:actualRequire(name),__dirname:root,
      process:{env:{GEMINI_API_KEY:'fake-proxy-key',PORT:'0'}},console,URL,setInterval:()=>({unref(){}}),AbortSignal,AbortController,setTimeout,clearTimeout,
      fetch:async()=>quota({headers:{'Retry-After':'29'}})};
    const source=read('server.js');vm.runInNewContext(source.slice(0,source.lastIndexOf('server.listen(')),context,{filename:'server.js'});
    try {
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const base=`http://127.0.0.1:${server.address().port}/api/gemini`;
      for(const [route,init] of [['/gemini-3.6-flash',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"contents":[{"parts":[{"text":"Fixture"}]}]}'}],['/models',{}]]){
        const response=await fetch(base+route,init);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'29');assert.equal((await response.json()).error.details.length,2);
      }
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
