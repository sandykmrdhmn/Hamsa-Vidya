/** Transport/shared-budget regressions. Mocked upstream, storage and clocks. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {EventEmitter}=require('events');
const {createRequire}=require('module');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const policy=require('../ai-proxy-policy');
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}}
const payload=()=>({contents:[{role:'user',parts:[{text:'भारत 😀 source text'}]}],generationConfig:{maxOutputTokens:128,thinkingConfig:{thinkingLevel:'low'}}});
function proxyFixture(upstream=async()=>Response.json({candidates:[]}),{env={},limits={},timeout=false}={}){
  let handler,calls=0,sent;
  const actualRequire=createRequire(path.join(root,'server.js'));
  const context={__dirname:root,URL,console:{log(){}},process:{env:{GEMINI_API_KEY:'fixture-only',...env}},AbortController,AbortSignal,
    setInterval:()=>({unref(){}}),clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,timeout&&ms===120000?1:ms),
    require:name=>name==='http'?{createServer:fn=>(handler=fn,{})}:name==='./ai-proxy-policy'?{...policy,ProxyBudget:class extends policy.ProxyBudget{constructor(options){super({...options,...limits,file:null});}}}:actualRequire(name),
    fetch:async(url,init)=>{calls++;sent=init?.body?JSON.parse(init.body):null;return upstream(url,init);}};
  const source=read('server.js');vm.runInNewContext(source.slice(0,source.lastIndexOf('server.listen(')),context);
  async function request({url='/api/gemini/gemini-3.6-flash',body=JSON.stringify(payload()),chunks,method='POST',ip='127.0.0.1',headers={}}={}){
    const req=new EventEmitter();Object.assign(req,{url,method,headers:{host:'localhost:3000',...headers},socket:{remoteAddress:ip},destroy(){}});
    const res=new EventEmitter();let finish;
    const done=new Promise(resolve=>finish=resolve);
    Object.assign(res,{destroyed:false,writableEnded:false,setHeader(){},writeHead(status,values){this.status=status;this.headers=values;},end(value){this.writableEnded=true;finish({status:this.status,headers:this.headers,body:JSON.parse(value)});}});
    handler(req,res);
    if(!res.writableEnded&&method==='POST'){for(const chunk of chunks||[Buffer.from(body)])req.emit('data',chunk);req.emit('end');}
    let timer;try{return await Promise.race([done,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Mock response stalled')),2000))]);}finally{clearTimeout(timer);}
  }
  return {request,calls:()=>calls,sent:()=>sent};
}
function browserFixture(){
  const dom=new JSDOM('<main/>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  w.console={warn(){},log(){}};let now=Date.now();w.Date.now=()=>now;
  w.QuizQuality={wait:async(ms,signal)=>{if(signal?.aborted)throw new w.DOMException('Cancelled','AbortError');now+=ms;}};
  w.fetch=async url=>String(url).endsWith('/status')?Response.json({configured:true}):Response.json({candidates:[],usageMetadata:{promptTokenCount:10,totalTokenCount:10}});
  w.eval(read('js/ai-client.js'));
  return {dom,w,advance:ms=>now+=ms,close:()=>dom.window.close()};
}
function durableBudgetFixture(){
  const files=new Map();let fail=false;
  const fakeFs={readFileSync(file){if(!files.has(file))throw Object.assign(Error('Missing'),{code:'ENOENT'});return files.get(file);},writeFileSync(file,data){if(fail)throw Error('Disk full');files.set(file,data);},renameSync(from,to){if(fail)throw Error('Disk full');files.set(to,files.get(from));files.delete(from);}};
  const context={require:name=>name==='fs'?fakeFs:require(name),module:{exports:{}},Intl,Date,Number,Math};
  vm.runInNewContext(read('ai-proxy-policy.js'),context);
  return {Budget:context.module.exports.ProxyBudget,fail:()=>fail=true,files};
}
(async()=>{
  await test('Split UTF-8 request bytes preserve Hindi and emoji exactly',async()=>{
    const f=proxyFixture(),body=Buffer.from(JSON.stringify(payload())),at=body.indexOf(Buffer.from('भारत'))+1;
    const r=await f.request({chunks:[body.subarray(0,at),body.subarray(at,at+2),body.subarray(at+2)]});
    assert.equal(r.status,200);assert.equal(f.sent().contents[0].parts[0].text,'भारत 😀 source text');assert.equal(f.calls(),1);
  });
  await test('Malformed model encoding, unapproved models and invalid JSON never reach upstream',async()=>{
    const f=proxyFixture();for(const request of [{url:'/api/gemini/%'},{url:'/api/gemini/gemini-3.1-pro-preview'},{body:'{not-json'}])assert.equal((await f.request(request)).status,400);assert.equal(f.calls(),0);
  });
  await test('Payload shape and spend controls reject malformed system parts, tools and excess output',async()=>{
    const f=proxyFixture();const invalid=[{...payload(),systemInstruction:{parts:{}}},{...payload(),generationConfig:'bad'},{...payload(),tools:[{}]},{...payload(),generationConfig:{maxOutputTokens:65000}},{...payload(),generationConfig:{candidateCount:2}},{...payload(),generationConfig:{thinkingConfig:{thinkingLevel:'high'}}}];
    for(const value of invalid)assert.equal((await f.request({body:JSON.stringify(value)})).status,400);assert.equal(f.calls(),0);
  });
  await test('Missing generation limits are materialized before forwarding',async()=>{
    const f=proxyFixture(),value=payload();delete value.generationConfig;assert.equal((await f.request({body:JSON.stringify(value)})).status,200);assert.equal(f.sent().generationConfig.maxOutputTokens,8192);assert.equal(f.sent().generationConfig.thinkingConfig.thinkingLevel,'low');
  });
  await test('Mixed text, URI and tool parts never bypass admission or token estimates',async()=>{
    const f=proxyFixture();
    for(const part of [{text:'Short',fileData:{mimeType:'application/pdf',fileUri:'https://example.test/large.pdf'}},{text:'Short',functionCall:{name:'search'}},{text:'Short',inlineData:{mimeType:'image/png',data:'fixture'}},{inlineData:{mimeType:'image/png',data:'fixture'},functionResponse:{name:'search'}}]) {
      const value=payload();value.contents[0].parts=[part];assert.equal((await f.request({body:JSON.stringify(value)})).status,400);
    }
    const system={...payload(),systemInstruction:{parts:[{text:'Short',fileData:{fileUri:'https://example.test/large.pdf'}}]}};
    assert.equal((await f.request({body:JSON.stringify(system)})).status,400);assert.equal(f.calls(),0);
  });
  await test('Remote, cross-origin and DNS-rebinding hosts cannot spend the shared key',async()=>{
    const f=proxyFixture();for(const request of [{ip:'203.0.113.5'},{headers:{origin:'https://foreign.example'}},{headers:{host:'foreign.example:3000',origin:'http://foreign.example:3000'}},{headers:{origin:'null'}}])assert.equal((await f.request(request)).status,403);
    assert.equal(f.calls(),0);assert.equal((await f.request({headers:{origin:'http://localhost:3000'}})).status,200);
  });
  await test('Body byte cap rejects oversize before a generation request',async()=>{
    const f=proxyFixture();assert.equal((await f.request({chunks:[Buffer.alloc(2*1024*1024+1)]})).status,413);assert.equal(f.calls(),0);
  });
  await test('Project request budget combines different loopback callers',async()=>{
    const f=proxyFixture();for(let n=0;n<5;n++)assert.equal((await f.request({ip:n%2?'::1':'127.0.0.1'})).status,200);
    const blocked=await f.request({ip:'::1'});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers['Retry-After'])>0);assert.equal(f.calls(),5);
  });
  await test('Daily shared guard is terminal and counts conservative output reservations',async()=>{
    const f=proxyFixture(undefined,{limits:{dailyRequests:1}});assert.equal((await f.request()).status,200);const blocked=await f.request();assert.equal(blocked.body.error.code,'AI_DAILY_QUOTA');assert.equal(blocked.body.error.retryable,false);assert.equal(f.calls(),1);
    const tiny=proxyFixture(undefined,{limits:{dailyTokens:50}});assert.equal((await tiny.request()).body.error.code,'AI_DAILY_QUOTA');assert.equal(tiny.calls(),0);
  });
  await test('Configured project TPM rejects one oversized request before upstream',async()=>{
    const f=proxyFixture(undefined,{env:{GEMINI_PROJECT_TPM:'5'}});const r=await f.request();assert.equal(r.status,400);assert.equal(r.body.error.code,'AI_INPUT_BUDGET');assert.equal(f.calls(),0);
  });
  await test('Upstream deadline returns a terminal typed timeout',async()=>{
    const f=proxyFixture(async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})),{timeout:true});
    const r=await f.request();assert.equal(r.status,502);assert.equal(r.body.error.code,'AI_UPSTREAM_TIMEOUT');assert.equal(r.body.error.retryable,false);assert.equal(f.calls(),1);
  });
  await test('Daily reservations survive restart; failed budget storage prevents spending',()=>{
    const f=durableBudgetFixture();let clock=Date.UTC(2026,9,5,12),options={file:'fixture-state',dailyRequests:1,now:()=>clock};
    assert.equal(new f.Budget(options).reserve(10,128),null);assert.equal(new f.Budget(options).reserve(10,128).code,'AI_DAILY_QUOTA');
    clock+=24*3600000;const next=new f.Budget(options);f.fail();assert.equal(next.reserve(10,128).code,'AI_BUDGET_STORAGE');assert.equal(next.reserve(10,128).code,'AI_BUDGET_STORAGE');
  });
  await test('Corrupt saved shared budget fails closed',()=>{
    const f=durableBudgetFixture();f.files.set('fixture-state','{"requests":"wrong"}');assert.equal(new f.Budget({file:'fixture-state'}).reserve(10,128).code,'AI_BUDGET_STORAGE');
  });
  await test('Transient status failure expires and recovery stays single-flight',async()=>{
    const f=browserFixture();try{await f.w.aiClient.probeServerKey();const c=f.w.aiClient;c._serverKeyConfigured=null;c._probeExpiresAt=0;let calls=0,recovered=false;
      f.w.fetch=async()=>{calls++;if(!recovered)throw Error('Offline');return Response.json({configured:true});};
      assert.equal(await c.probeServerKey(),false);recovered=true;assert.equal(await c.probeServerKey(),false);assert.equal(calls,1);f.advance(5001);
      const results=await Promise.all([c.probeServerKey(),c.probeServerKey(),c.probeServerKey()]);assert.ok(results.every(Boolean));assert.equal(calls,2);assert.equal(c.isAvailable(),true);
    }finally{f.close();}
  });
  await test('Online recovery reprobes immediately and a personal key retains precedence',async()=>{
    const f=browserFixture();try{await f.w.aiClient.probeServerKey();const c=f.w.aiClient;c._serverKeyConfigured=null;c._probeExpiresAt=f.w.Date.now()+5000;f.w.dispatchEvent(new f.w.Event('online'));await c.probeServerKey();assert.equal(c.getMode(),'PROXY');f.w.localStorage.setItem('hamsa_gemini_api_key','fixture-only');assert.equal(c.getMode(),'DIRECT');}finally{f.close();}
  });
  await test('Non-quiz generation shares pacing and every attempt has privacy-safe diagnostics',async()=>{
    const f=browserFixture();try{await f.w.aiClient.probeServerKey();const c=f.w.aiClient,start=f.w.Date.now();
      for(let n=0;n<5;n++)await c.fetchGenerateContent('gemini-3.6-flash',payload(),{stage:'teacher'});
      await c.fetchGenerateContent('gemini-3.6-flash',payload(),{quotaSafe:true,stage:'writer',jobId:9});
      const logs=c.getRequestDiagnostics();assert.equal(logs.length,6);assert.ok(f.w.Date.now()-start>=60000);assert.ok(logs[5].quotaWaitMs>=60000);assert.equal(logs[5].jobId,9);assert.equal(logs[0].usageKnown,true);assert.ok(!JSON.stringify(logs).includes('भारत'));
      c.recordStageTiming('pdf-extraction',start,{pages:2,text:'private',key:'private'});assert.equal(c.getStageDiagnostics()[0].pages,2);assert.equal(c.getStageDiagnostics()[0].text,undefined);
    }finally{f.close();}
  });
  await test('Uncertain network spend is recorded and typed proxy errors remain terminal',async()=>{
    const f=browserFixture();try{await f.w.aiClient.probeServerKey();const c=f.w.aiClient;f.w.fetch=async()=>{throw new TypeError('Connection lost');};await assert.rejects(c.fetchGenerateContent('gemini-3.6-flash',payload()),e=>e.code==='AI_NETWORK_UNCERTAIN');const log=c.getRequestDiagnostics()[0];assert.equal(log.usageKnown,false);assert.equal(log.errorCode,'AI_NETWORK_UNCERTAIN');
      const error=await c.createError(Response.json({error:{message:'Upstream timed out',code:'AI_UPSTREAM_TIMEOUT',retryable:false}},{status:502}));assert.equal(error.code,'AI_UPSTREAM_TIMEOUT');assert.equal(error.retryable,false);
    }finally{f.close();}
  });
  await test('OCR estimate preserves resolution and actual input usage corrects reservations',async()=>{
    const f=browserFixture();try{await f.w.aiClient.probeServerKey();const c=f.w.aiClient;const image={contents:[{parts:[{inlineData:{mimeType:'image/png',data:'fixture'}}]}]};assert.equal(c.estimatePayloadTokens(image),1120);assert.equal(c.estimatePayloadTokens({...image,generationConfig:{mediaResolution:'MEDIA_RESOLUTION_LOW'}}),280);
      f.w.fetch=async()=>Response.json({usageMetadata:{promptTokenCount:2000,totalTokenCount:2000}});await c.fetchGenerateContent('gemini-3.6-flash',image,{quotaSafe:true,stage:'ocr'});const scope=c._quotaScope('gemini-3.6-flash',{});assert.equal(c._loadQuota(scope).history[0].tokens,2000);
    }finally{f.close();}
  });
  await test('Queued cancellation and deadline settle immediately without sending later',async()=>{
    const f=browserFixture();try{
      await f.w.aiClient.probeServerKey();const c=f.w.aiClient;let release,requests=0;
      const held=new Promise(resolve=>release=resolve);c._quotaQueue=held;
      f.w.fetch=async()=>{requests++;return Response.json({candidates:[]});};
      const controller=new f.w.AbortController();const cancelled=c.fetchGenerateContent('gemini-3.6-flash',payload(),{signal:controller.signal});controller.abort();
      await assert.rejects(cancelled,{name:'AbortError'});assert.equal(requests,0);
      const expired=c.fetchGenerateContent('gemini-3.6-flash',payload(),{deadlineAt:f.w.Date.now()+10});
      await assert.rejects(expired,e=>e.code==='AI_STEP_TIMEOUT');f.advance(11);release();await c._quotaQueue;
      assert.equal(requests,0);assert.ok(c.getRequestDiagnostics().every(log=>log.sent===false));
    }finally{f.close();}
  });
  await test('Global cancellation includes queued work without a caller signal',async()=>{
    const f=browserFixture();try {
      await f.w.aiClient.probeServerKey();const c=f.w.aiClient;let release,requests=0;
      c._quotaQueue=new Promise(resolve=>release=resolve);f.w.fetch=async()=>{requests++;return Response.json({candidates:[]});};
      const pending=c.fetchGenerateContent('gemini-3.6-flash',payload());assert.equal(c.inFlightCount,1);
      c.abortAll();await assert.rejects(pending,{name:'AbortError'});assert.equal(c.inFlightCount,0);
      release();await c._quotaQueue;assert.equal(requests,0);assert.equal(c.getRequestDiagnostics()[0].sent,false);
    }finally{f.close();}
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
