/** Low-quota regressions using the production flow with isolated fake responses. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http'),vm=require('vm');
const {createRequire}=require('module'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
let passed=0,failed=0;
const question=n=>({questionText:`What is ${n} plus one?`,options:[`${n+1}`,`${n+2}`,`${n+3}`,`${n+4}`],correctAnswerIndex:0,explanation:'Add one.',topic:'Arithmetic'});
const ok=data=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});
function fixture(){
  const dom=new JSDOM('<main/>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  w.console={log(){},warn(){},error(){}};w.localStorage.setItem('hamsa_gemini_api_key','fixture-key');
  w.fetch=async()=>Response.json({configured:true});
  for(const file of ['js/ai-client.js','js/quiz-quality.js','js/quiz-engine.js','js/gemini-service.js'])w.eval(read(file));
  let time=Date.now();w.Date.now=()=>time;w.QuizQuality.wait=async(ms,signal)=>{w.QuizQuality.abort(signal);time+=ms;};
  return {dom,w,advance:ms=>time+=ms,options:{sourceType:'TEXT',sourceTitle:'Arithmetic',subject:'Mathematics',questionCount:10}};
}
async function test(name,fn){const f=fixture();try{await f.w.aiClient.probeServerKey();await fn(f);passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}finally{f.dom.window.close();}}
(async()=>{
  await test('50 questions use 5 writers + 5 blind reviews, no discovery or analysis',async({w,options})=>{
    const stages=[];let serial=0;w.geminiService.discoverAvailableModels=async()=>{throw Error('Unexpected discovery');};
    w.fetch=async(url,init)=>{
      assert.ok(url.includes('/gemini-3.6-flash:generateContent?key=fixture-key'));
      const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;
      assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel,'low');
      if(prompt.startsWith('Create exactly')){stages.push('writer');return ok({questions:Array.from({length:10},()=>question(++serial))});}
      assert.ok(prompt.startsWith('Independently solve'));stages.push('review');
      const qs=JSON.parse(prompt.split('QUESTIONS:\n')[1]);assert.ok(qs.every(q=>!('correctAnswerIndex' in q)));
      return ok({reviews:qs.map((q,index)=>({index,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Verified addition.',optionExplanations:['Add one','Adds two','Adds three','Adds four']}))});
    };
    const result=await w.geminiService.generateQuiz({...options,questionCount:50});
    assert.equal(result.questions.length,50);assert.equal(stages.filter(s=>s==='writer').length,5);assert.equal(stages.length,10);
    const logs=w.aiClient.getRequestDiagnostics();assert.equal(logs.length,10);assert.ok(logs.every((log,i)=>i<5||log.startedAt-logs[i-5].startedAt>=60000));
  });
  await test('Saved personal key really takes priority; removing it restores proxy',async({w})=>{
    const urls=[];w.fetch=async url=>{urls.push(url);return ok({});};
    await w.aiClient.fetchGenerateContent('gemini-3.6-flash',{});assert.equal(w.aiClient.getMode(),'DIRECT');assert.ok(urls[0].includes('key=fixture-key'));
    w.geminiService.setApiKey('');await w.aiClient.fetchGenerateContent('gemini-3.6-flash',{});assert.equal(w.aiClient.getMode(),'PROXY');assert.equal(urls[1],'/api/gemini/gemini-3.6-flash');
  });
  await test('Malformed successful output costs at most 2 calls, not 6 model attempts',async({w,options})=>{
    let calls=0;w.fetch=async()=>{calls++;return ok({questions:[{questionText:'Incomplete'}]});};
    await assert.rejects(w.geminiService.generateQuiz(options),/incomplete or inconsistent/);assert.equal(calls,2);
  });
  await test('Rejected stem is not reviewed again; two stalled rounds pause with saved state',async({w,options})=>{
    let writes=0,reviews=0;w.fetch=async(url,init)=>{
      const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){writes++;return ok({questions:[question(1)]});}
      reviews++;return ok({reviews:[{index:0,verdict:'REJECT',reason:'Ambiguous.'}]});
    };
    await assert.rejects(w.geminiService.generateQuiz(options),e=>{assert.equal(e.retryState.rejectedStems.length,1);return /Only 0/.test(e.message);});
    assert.equal(writes,2);assert.equal(reviews,1);
  });
  await test('Hindi source excerpts fit safe input budget and do not require AI analysis',async({w,options})=>{
    const pages=Array.from({length:20},(_,i)=>({pageNumber:i+1,text:'यह एक अध्ययन सामग्री है। '.repeat(400)}));let calls=0;
    w.fetch=async(url,init)=>{calls++;const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;assert.ok(w.aiClient.estimatePayloadTokens(payload)<12000);
      if(prompt.startsWith('Create exactly'))return ok({questions:[{...question(1),sourcePage:1,evidenceQuote:'यह एक अध्ययन सामग्री है।'}]});
      return ok({reviews:[{index:0,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Verified.',optionExplanations:['Correct','Wrong','Wrong','Wrong']}]});};
    const result=await w.geminiService.generateQuiz({...options,questionCount:1,language:'HINDI',sourceType:'PDF',sourcePages:pages});assert.equal(calls,2);assert.equal(result.coverage.sampled,true);
  });
  await test('One OCR daily-quota error stops after 1 call and blocks immediate retry',async({w})=>{
    let calls=0;w.fetch=async()=>{calls++;return Response.json({error:{message:'Daily quota exhausted',details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel',quotaValue:'20'}]}]}},{status:429});};
    for(let i=0;i<2;i++)await assert.rejects(w.geminiService.extractTextFromImage({base64Data:'fake-image'}),e=>e.code==='AI_DAILY_QUOTA');
    assert.equal(calls,1);
  });
  await test('Long PDF needs only writer + review for 10 questions, with explicit sampled coverage',async({w,options})=>{
    const pages=Array.from({length:20},(_,i)=>({pageNumber:i+1,text:'Addition uses arithmetic principles. '+'Source material. '.repeat(750)}));
    const stages=[];w.geminiService.discoverAvailableModels=async()=>{throw Error('Unexpected discovery');};
    w.fetch=async(url,init)=>{
      const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;
      assert.ok(w.aiClient.estimatePayloadTokens(payload)<12000);
      if(prompt.startsWith('Create exactly')){stages.push('writer');return ok({questions:Array.from({length:10},(_,i)=>({...question(i+1),sourcePage:1,evidenceQuote:'Addition uses arithmetic principles.'}))});}
      assert.ok(prompt.startsWith('Independently solve'));stages.push('review');
      return ok({reviews:Array.from({length:10},(_,index)=>({index,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Verified.',optionExplanations:['Correct','Wrong','Wrong','Wrong']}))});
    };
    const result=await w.geminiService.generateQuiz({...options,sourceType:'PDF',sourcePages:pages});
    assert.deepEqual(stages,['writer','review']);assert.equal(result.questions.length,10);
    assert.equal(result.coverage.readChunks,2);assert.ok(result.coverage.totalChunks>20);assert.equal(result.coverage.sampled,true);
  });
  await test('Hindi printed-key import bounds primary, neighboring and key context before sending',async({w,options})=>{
    const pages=[{pageNumber:1,text:'अध्ययन सामग्री। '.repeat(500)},{pageNumber:2,text:'उत्तर कुंजी\n'+'1. A; '.repeat(600)}];
    let calls=0;w.fetch=async(url,init)=>{
      const payload=JSON.parse(init.body),prompt=payload.contents[0].parts[0].text;
      assert.ok(prompt.startsWith('Extract complete'));assert.ok(w.aiClient.estimatePayloadTokens(payload)<12000);
      const context=prompt.split('CONTEXT:\n')[1];assert.ok(context.length<5200);
      calls++;return ok({found:false});
    };
    const result=await w.geminiService.detectAndExtractExistingQuiz({...options,sourceType:'PDF',sourcePages:pages});
    assert.equal(result.found,false);assert.equal(calls,w.QuizQuality.chunks('',pages,3000).length);
  });
  await test('Successful scanned pages survive a later OCR quota failure in this tab',async({w})=>{
    w.eval(read('js/pdf-extractor.js'));const reader=w.pdfExtractor;
    reader.currentDoc={numPages:2,getPage:async()=>({getTextContent:async()=>({items:[]}),getViewport:()=>({width:100,height:100}),render:()=>({promise:Promise.resolve()}),cleanup(){}})};
    w.HTMLCanvasElement.prototype.getContext=()=>({});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,fixture';
    let calls=0;w.geminiService.extractTextFromImage=async()=>{calls++;if(calls===2)throw Object.assign(Error('Daily quota'),{status:429});return 'Readable OCR text.';};
    await assert.rejects(reader.extractTextFromPageRange(1,2,()=>{},{ocr:true,skipUnreadable:true}),/Daily quota/);
    const result=await reader.extractTextFromPageRange(1,2,()=>{},{ocr:true,skipUnreadable:true});assert.equal(result.extractedPages.length,2);assert.equal(calls,3);
  });
  await test('TPM violations update future input budget; spending-tier text is not permanent billing failure',async({w})=>{
    const error=await w.aiClient.createError(Response.json({error:{message:'Spend-based rate limit exceeded. Retry in 5s.',details:[{violations:[{quotaId:'GenerateInputTokensPerMinutePerProjectPerModel',quotaValue:'9000'}]}]}},{status:429}));
    assert.equal(error.retryable,true);assert.equal(error.inputTokensPerMinute,9000);
  });
  await test('Quota cooldown survives saving the same key and failed local storage',async({w})=>{
    const c=w.aiClient,scope=c._quotaScope('gemini-3.6-flash',{});c._saveQuota(scope,{nextAt:w.Date.now()+20000,interval:20000,tpm:12000,history:[]});
    w.geminiService.setApiKey('fixture-key');assert.ok(c._loadQuota(scope).nextAt>w.Date.now());
    w.Storage.prototype.setItem=()=>{throw Error('Storage full');};c._saveQuota(scope,{nextAt:w.Date.now()+30000,interval:30000,tpm:12000,history:[]});assert.equal(c._loadQuota(scope).interval,30000);
  });
  await test('Production proxy propagates browser disconnect to the upstream abort signal',async()=>{
    const actualRequire=createRequire(path.join(root,'server.js'));let server,started,aborted;
    const began=new Promise(r=>started=r),cancelled=new Promise(r=>aborted=r);
    const policy=actualRequire('./ai-proxy-policy');
    const context={require:name=>name==='http'?{...http,createServer:handler=>(server=http.createServer(handler))}:name==='./ai-proxy-policy'?{...policy,ProxyBudget:class extends policy.ProxyBudget{constructor(options){super({...options,file:null});}}}:actualRequire(name),__dirname:root,
      process:{env:{GEMINI_API_KEY:'fixture-proxy',PORT:'0'}},console,URL,setInterval:()=>({unref(){}}),AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,
      fetch:async(url,{signal})=>{started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted();reject(new DOMException('Cancelled','AbortError'));},{once:true}));}};
    const source=read('server.js');vm.runInNewContext(source.slice(0,source.lastIndexOf('server.listen(')),context);
    try{
      await new Promise(r=>server.listen(0,'127.0.0.1',r));const controller=new AbortController();
      const request=fetch(`http://127.0.0.1:${server.address().port}/api/gemini/gemini-3.6-flash`,{method:'POST',body:'{"contents":[{"parts":[{"text":"Fixture"}]}]}',signal:controller.signal}).catch(()=>{});
      await began;controller.abort();let timer;try{await Promise.race([cancelled,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Upstream did not cancel')),2000))]);}finally{clearTimeout(timer);}await request;
    }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
  });
  await test('Small quiz starts blind review immediately without an artificial pacing wait',async({w,options})=>{
    const start=w.Date.now();w.fetch=async(url,init)=>{
      const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      return prompt.startsWith('Create exactly')?ok({questions:[question(1)]}):ok({reviews:[{index:0,verdict:'ACCEPT',correctAnswerIndex:0,reason:'Add one.',optionExplanations:['Adds one','Adds two','Adds three','Adds four']}]});
    };
    await w.geminiService.generateQuiz({...options,questionCount:1});
    assert.equal(w.aiClient.getRequestDiagnostics().length,2);assert.equal(w.Date.now()-start,0);
  });
  await test('Rolling pacing caps requests at five per minute across a client reload',async({w})=>{
    const times=[];w.fetch=async url=>{if(String(url).endsWith('/status'))return Response.json({configured:true});times.push(w.Date.now());return ok({});};
    const payload={contents:[{parts:[{text:'A short quiz request.'}]}]};
    for(let i=0;i<5;i++)await w.aiClient.fetchGenerateContent('gemini-3.6-flash',payload,{quotaSafe:true});
    assert.equal(new Set(times).size,1);
    w.eval(read('js/ai-client.js'));await w.aiClient.probeServerKey();
    await w.aiClient.fetchGenerateContent('gemini-3.6-flash',payload,{quotaSafe:true});
    assert.equal(times.length,6); // Only generation calls spend request quota.
    assert.ok(times.at(-1)-times[0]>=60000);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
