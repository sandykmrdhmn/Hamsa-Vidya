/** Fresh PDF quiz regression checks. All PDF pages, AI responses and stores are isolated fixtures. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const waitFor=async(predicate,message='Fixture never reached its expected checkpoint')=>{const deadline=Date.now()+1500;while(!predicate()){if(Date.now()>=deadline)throw Error(message);await new Promise(resolve=>setTimeout(resolve,1));}};
let passed=0,failed=0;
async function test(label,run){try{await run();passed++;console.log('PASS '+label);}catch(error){failed++;console.error('FAIL '+label+': '+error.stack);}}
const response=(count=10,extra={})=>({title:'Energy practice',questions:Array.from({length:count},(_,i)=>({id:'q'+(i+1),question:`Which statement correctly describes energy example ${i+1}?`,options:[`Correct fact ${i+1}`,`Wrong claim ${i+1}`,`Other idea ${i+1}`,`Incorrect example ${i+1}`],answerIndex:0,explanation:`The selected material supports correct fact ${i+1} because energy is conserved.`,optionExplanations:['Energy is conserved.','Energy is not destroyed.','This contradicts the source.','This describes a different concept.'],difficulty:'MEDIUM',topic:'Energy',sourcePage:2})),...extra});
const aiResponse=(value=response(),options={})=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:123,candidatesTokenCount:234,totalTokenCount:357},...options}),{headers:{'Content-Type':'application/json'}});
const ocrResponse=(page,extra={})=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:`PAGE_${page}_SENTINEL. `+'Energy is conserved. Work transfers energy. Power is work per time. Force accelerates mass. '.repeat(8)+` PAGE_${page}_END_SENTINEL.`}]}}],...extra}),{headers:{'Content-Type':'application/json'}});
const ocrPage=payload=>Number(JSON.stringify(payload.contents).match(/\[PDF PAGE (\d+)\]/)?.[1]);
const quizCalls=calls=>calls.filter(call=>call[2]?.stage!=='quiz-source-ocr');
const sourceOcrCalls=calls=>calls.filter(call=>call[2]?.stage==='quiz-source-ocr');
const sequentialAI=(onOcr=page=>ocrResponse(page),onQuiz=null)=>{let offset=0;return async(model,payload,options)=>{if(options?.stage==='quiz-source-ocr')return onOcr(ocrPage(payload),payload,options);const value=batchResponse(payload,offset);offset+=value.questions.length;return onQuiz?onQuiz(value,payload,options):aiResponse(value);};};
const providerError=(status=400,message='Request contains an invalid argument.',providerStatus='INVALID_ARGUMENT')=>new Response(JSON.stringify({error:{message,status:providerStatus}}),{status,headers:{'Content-Type':'application/json'}});
const config={fromPage:2,toPage:3,count:10,difficulty:'MEDIUM',language:'ENGLISH'};
const batchResponse=(payload,offset=0)=>{
  const prompt=payload.contents[0].parts[0].text,count=Number(prompt.match(/Create exactly (\d+)/)[1]),difficulty=prompt.match(/Difficulty: (\w+)/)[1],bilingual=/bilingually:/.test(prompt);
  const value=response(count),page=Number(prompt.match(/sourcePage between (\d+) and (\d+)/)?.[1]) || null;
  const both=field=>bilingual?`${field}\nऊर्जा का हिंदी अनुवाद`:field;
  value.questions=value.questions.map((q,i)=>({...q,question:both(`Distinct energy question ${offset+i+1}?`),options:q.options.map(both),explanation:both(q.explanation),optionExplanations:q.optionExplanations.map(both),difficulty:difficulty==='MIXED'?['EASY','MEDIUM','HARD'][i%3]:difficulty,sourcePage:page ?? null}));
  return value;
};
// Match AIClient's real text/image estimates instead of a constant mock budget.
const estimateTextTokens=text=>{const value=String(text||''),hindi=(value.match(/[\u0900-\u097F]/g)||[]).length;return Math.ceil((value.length-hindi)/4+hindi/1.5);};
const estimatePayloadTokens=payload=>{
  let tokens=0;
  for(const content of payload.contents||[])for(const part of content.parts||[]){if(part.text)tokens+=estimateTextTokens(part.text);if(part.inlineData)tokens+=1120;}
  for(const part of payload.systemInstruction?.parts||[])if(part.text)tokens+=estimateTextTokens(part.text);
  return tokens;
};
const densePage=(number,hindi=false)=>({getTextContent:async()=>({items:[{str:`PAGE_${number}_SENTINEL. `+(hindi?'ऊर्जा संरक्षित रहती है। कार्य ऊर्जा का स्थानांतरण करता है। शक्ति कार्य की दर है। बल द्रव्यमान को त्वरित करता है। ':'Energy is conserved. Work transfers energy. Power is work per time. Force accelerates mass. ').repeat(70)+` PAGE_${number}_END_SENTINEL.`}]}),cleanup(){}});
const useRealBudget=(w,tokens)=>{w.aiClient.SHARED_INPUT_TOKENS_PER_MINUTE=tokens;w.aiClient.estimatePayloadTokens=estimatePayloadTokens;w.aiClient.estimateTokens=estimateTextTokens;};
function assertSourceCoverage(calls,fromPage,toPage){
  const source=calls.map(call=>call[1].contents.flatMap(content=>content.parts).map(part=>part.text||'').join('\n')).join('\n');
  const seen=new Set(Array.from(source.matchAll(/\[PDF PAGE (\d+)\]/g),match=>Number(match[1])));
  for(let page=fromPage;page<=toPage;page++){assert.ok(seen.has(page),`Selected page ${page} is represented`);assert.ok(source.includes(`PAGE_${page}_SENTINEL`),`Selected page ${page} reaches AI with its source text`);}
  assert.ok([...seen].every(page=>page>=fromPage&&page<=toPage),'No page outside the selected range reaches AI');
}
function assertRequestBudgets(calls,service,budget){for(const[,payload,options]of calls){assert.ok(estimatePayloadTokens(payload)<=budget,'Complete payload including system/prior questions fits TPM');assert.ok(Buffer.byteLength(JSON.stringify(payload))<=service.MAX_REQUEST_BYTES,'Complete payload fits byte limit');assert.equal(options.quotaSafe,true);}}
const storedQuiz=extra=>({...response(),source:{fileName:'Energy.pdf',fromPage:2,toPage:3,pageCount:6},difficulty:'MEDIUM',language:'ENGLISH',model:'gemini-2.5-flash',createdAt:'2026-10-07T08:00:00.000Z',...extra});

function memoryDatabase(){
  const database={verno:0};
  class Table {
    constructor(){this.rows=[];this.next=1;}
    async add(row){const transaction=Dexie.currentTransaction;if(this.delayAdd)await this.delayAdd;if(transaction?.aborted)throw new Error('Transaction aborted');const id=row.id||this.next++;this.next=Math.max(this.next,id+1);this.rows.push(clone({...row,id}));return id;}
    async put(row){if(!row.id)return this.add(row);this.next=Math.max(this.next,row.id+1);const index=this.rows.findIndex(item=>item.id===row.id);if(index<0)this.rows.push(clone(row));else this.rows[index]=clone(row);return row.id;}
    async get(id){return clone(this.rows.find(row=>row.id===id));}
    async toArray(){return clone(this.rows);}
    async count(){return this.rows.length;}
    async clear(){this.rows=[];}
    async delete(id){this.rows=this.rows.filter(row=>row.id!==id);}
    async bulkPut(rows){for(const row of rows)await this.put(row);}
    async update(id,changes){const row=this.rows.find(item=>item.id===id);if(row)Object.assign(row,clone(changes));return row?1:0;}
    orderBy(key){return this.collection([...this.rows].sort((a,b)=>String(a[key]).localeCompare(String(b[key]))));}
    where(key){return {equals:value=>this.collection(this.rows.filter(row=>row[key]===value)),anyOf:values=>this.collection(this.rows.filter(row=>values.includes(row[key])))};}
    filter(predicate){return this.collection(this.rows.filter(predicate));}
    toCollection(){return this.collection(this.rows);}
    collection(rows){const collection={toArray:async()=>clone(rows),count:async()=>rows.length,delete:async()=>{const ids=new Set(rows.map(row=>row.id));this.rows=this.rows.filter(row=>!ids.has(row.id));return ids.size;},reverse:()=>this.collection([...rows].reverse()),sortBy:async key=>clone([...rows].sort((a,b)=>String(a[key]).localeCompare(String(b[key])))),modify:async fn=>rows.forEach(fn)};return collection;}
  }
  database.version=number=>({stores:definitions=>{database.verno=Math.max(database.verno,number);for(const [name,schema]of Object.entries(definitions)){if(schema!==null&&!database[name])database[name]=new Table();}return {upgrade(){}};}});
  database.open=async()=>database;
  database.transaction=async(...args)=>{const operation=args.pop(),snapshots=new Map();for(const table of args.flat())if(table?.rows)snapshots.set(table,clone(table.rows));let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=reject;}),transaction={aborted:false,abort(){this.aborted=true;rejectAbort(new Error('Transaction aborted'));}},previous=Dexie.currentTransaction;Dexie.currentTransaction=transaction;try{return await Promise.race([operation(),aborted]);}catch(error){for(const[table,rows]of snapshots)table.rows=rows;throw error;}finally{Dexie.currentTransaction=previous;}};
  function Dexie(){return database;} Dexie.prototype={};
  return {database,Dexie};
}
function environment({pages=6,scanned=[],readPage,sendAI}={}){
  const dom=new JSDOM('<main><section id="view-quiz" class="view-section active"></section></main>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
  w.console={log(){},warn(){},error(){}};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Response=Response;
  const {database,Dexie}=memoryDatabase();w.Dexie=Dexie;
  const reads=[],renders=[],calls=[],progress=[],toasts=[];
  w.app={showToast:(...args)=>toasts.push(args),refreshIcons(){},currentView:'quiz',showConfirmation:options=>{w.confirmation=options;}};
  w.UIUtils={buildViewHero:options=>`<header class="view-hero"><h1>${String(options.title||'QUIZ')}</h1></header>`};
  w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){}});
  w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,VEVTVElNQUdF';
  const document={numPages:pages,destroy:async()=>{},getPage:async pageNumber=>{
    reads.push(pageNumber);
    if(readPage)return readPage(pageNumber);
    return {getTextContent:async()=>({items:scanned.includes(pageNumber)?[]:[{str:`PAGE_${pageNumber}_SENTINEL. `+'Energy is conserved. Work transfers energy. Power is work per time. Force accelerates mass. '.repeat(8)}]}),cleanup(){},getViewport:({scale})=>({width:600*scale,height:800*scale}),render(){renders.push(pageNumber);return {promise:Promise.resolve(),cancel(){}};}};
  }};
  w.pdfReader={ensure:async()=>({getDocument:()=>({promise:Promise.resolve(document),destroy:async()=>{}})})};
  w.geminiService={getActiveModel:()=> 'gemini-2.5-flash',getGeminiModel:()=> 'gemini-2.5-flash'};
  w.aiClient={fetchGenerateContent:async(...args)=>{calls.push(args);return sendAI?sendAI(...args):args[2]?.stage==='quiz-source-ocr'?ocrResponse(ocrPage(args[1])):aiResponse(batchResponse(args[1]));},createError:async result=>{const data=await result.json(),message=data.error?.message||'Provider unavailable',authentication=[401,403].includes(result.status)||result.status===400&&/API.?key|credential|authentication/i.test(message),invalid=result.status===400&&(data.error?.status==='INVALID_ARGUMENT'||/request contains an invalid argument/i.test(message));return Object.assign(Error(message),{status:result.status,providerStatus:data.error?.status,code:authentication?'AI_AUTHENTICATION_FAILED':invalid?'AI_INVALID_ARGUMENT':result.status===429?'AI_QUOTA_EXHAUSTED':result.status===503?'AI_OVERLOADED':'AI_PROVIDER_ERROR',invalidFields:(data.error?.details||[]).flatMap(detail=>(detail.fieldViolations||[]).map(violation=>violation.field)),retryable:[429,503].includes(result.status)});},estimateTokens:text=>Math.ceil(String(text).length/4),estimatePayloadTokens:()=>123,recordStageTiming(){}};
  w.eval(['js/sanitizer.js','js/pdf-extractor.js','js/db.js','js/quiz-service.js'].map(read).join('\n'));
  const service=w.quizService;service.READ_TIMEOUT_MS=250;service.REQUEST_TIMEOUT_MS=250;service.QUEUE_WAIT_TIMEOUT_MS=0;service.CLEANUP_TIMEOUT_MS=50;
  const file={name:'Energy.pdf',type:'application/pdf',size:1234,arrayBuffer:async()=>new ArrayBuffer(16)};
  const generate=options=>service.generate({...config,onProgress:event=>progress.push(event),...options});
  return {w,service,database,file,reads,renders,calls,progress,toasts,generate,dispose:async()=>{await service.dispose?.();await service.clear?.();dom.window.close();}};
}
async function isolated(run,options){const e=environment(options);try{await run(e);}finally{await e.dispose();}}

async function main(){
  await test('PDF metadata loads locally without contacting Gemini',()=>isolated(async({service,file,calls})=>{const metadata=await service.loadPdf(file);assert.equal(metadata.pageCount,6);assert.equal(metadata.fileName,file.name);assert.equal(calls.length,0);}));
  await test('Non-PDF and oversized uploads are rejected before parsing',()=>isolated(async({service,file,calls,reads})=>{await assert.rejects(service.loadPdf({...file,name:'document.txt',type:'text/plain'}),/PDF/i);await assert.rejects(service.loadPdf({...file,size:51*1024*1024}),/50|large|size/i);assert.equal(calls.length,0);assert.equal(reads.length,0);}));
  await test('A quiz requires an uploaded PDF',()=>isolated(async({generate,calls})=>{await assert.rejects(generate(),/PDF|upload/i);assert.equal(calls.length,0);}));
  await test('Selected pages alone enter the single structured AI request',()=>isolated(async({service,file,generate,reads,calls,progress})=>{await service.loadPdf(file);const quiz=await generate();assert.deepEqual(reads,[2,3]);assert.equal(calls.length,1);const [model,payload,options]=calls[0],prompt=JSON.stringify(payload);assert.equal(model,'gemini-2.5-flash');assert.match(prompt,/PAGE_2_SENTINEL/);assert.match(prompt,/PAGE_3_SENTINEL/);assert.doesNotMatch(prompt,/PAGE_[1456]_SENTINEL/);assert.equal(payload.generationConfig.responseMimeType,'application/json');assert.ok(payload.generationConfig.responseSchema);assert.ok(options.signal);assert.ok(options.timeoutMs<=250);assert.equal(quiz.questions.length,10);assert.equal(quiz.source.fromPage,2);assert.equal(quiz.source.toPage,3);assert.equal(quiz.difficulty,'MEDIUM');assert.equal(quiz.language,'ENGLISH');assert.ok(progress.some(event=>event.stage==='generating'));assert.equal(progress.at(-1).stage,'complete');}));
  await test('Quiz wire schemas avoid nested exact-length bounds while the prompt states its exact JSON contract',()=>isolated(async({service,file,generate,calls})=>{
    await service.loadPdf(file);await generate({count:20});
    const payload=calls[0][1],schema=payload.generationConfig.responseSchema;
    const inspect=node=>{if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){assert.ok(!['minItems','maxItems','minimum','maximum'].includes(key),`Wire schema must not contain ${key}`);inspect(value);}};inspect(schema);
    assert.deepEqual(Array.from(schema.required),['title','questions']);assert.equal(schema.properties.questions.type,'ARRAY');
    const fields=schema.properties.questions.items.properties;
    for(const field of ['question','options','answerIndex','explanation','optionExplanations','difficulty','topic','sourcePage'])assert.ok(fields[field],`${field} remains declared`);
    const prompt=payload.contents[0].parts[0].text;
    assert.match(prompt,/Create exactly 20/);assert.match(prompt,/sourcePage between 2 and 3/);
    for(const field of ['title','questions','question','options','answerIndex','explanation','optionExplanations','difficulty','topic','sourcePage'])assert.match(prompt,new RegExp('\\b'+field+'\\b'),`JSON-mode contract declares ${field}`);
  }));
  await test('Invalid structured-output arguments receive one JSON-mode correction for the same twenty-question batch',async()=>{
    let request=0,checkMode=()=>{};
    await isolated(async({service,file,generate,calls,progress})=>{
      checkMode=()=>{const draft=service.getDraft();assert.equal(draft.responseFormat,'JSON_MODE');assert.equal(draft.questions.length,0);assert.equal(draft.next,0);};
      await service.loadPdf(file);const quiz=await generate({count:20});
      assert.equal(calls.length,2);assert.equal(quiz.questions.length,20);assert.equal(new Set(quiz.questions.map(question=>question.id)).size,20);
      const first=calls[0][1],corrected=calls[1][1];assert.ok(first.generationConfig.responseSchema);assert.equal(corrected.generationConfig.responseSchema,undefined);assert.equal(corrected.generationConfig.responseMimeType,'application/json');
      assert.deepEqual(clone(corrected.contents),clone(first.contents),'Source, exclusions and exact requested count are preserved');
      assert.deepEqual(clone(corrected.systemInstruction),clone(first.systemInstruction));assert.equal(calls[0][0],calls[1][0]);
      assert.ok(progress.some(event=>/compatib|JSON/i.test(event.message)),'Compatibility correction is visible in progress');
      assert.equal(service.getDraft().responseFormat,'JSON_MODE');assert.equal(service.getDraft().next,1);
    },{sendAI:async(model,payload)=>{if(++request===1)return providerError();checkMode();return aiResponse(batchResponse(payload));}});
  });
  await test('A second invalid-argument response stops correction, and zero-question Resume reuses persisted JSON mode',async()=>{
    let request=0;
    await isolated(async({service,file,generate,w,calls})=>{
      await service.loadPdf(file);await assert.rejects(generate({count:20}),error=>error.status===400);
      assert.equal(calls.length,2);const original=service.getDraft();assert.equal(original.responseFormat,'JSON_MODE');assert.equal(original.questions.length,0);assert.equal(original.next,0);
      const restored=new w.QuizService();restored.REQUEST_TIMEOUT_MS=250;restored.QUEUE_WAIT_TIMEOUT_MS=0;assert.equal(restored.getDraft().responseFormat,'JSON_MODE');await restored.loadPdf(file);
      const quiz=await restored.generate({resume:true});assert.equal(calls.length,3);assert.equal(quiz.questions.length,20);assert.equal(quiz.generationId,original.id);assert.equal(quiz.createdAt,original.createdAt);
      assert.equal(calls[2][1].generationConfig.responseSchema,undefined);assert.equal(calls[2][1].generationConfig.responseMimeType,'application/json');assert.deepEqual(clone(calls[2][1].contents),clone(calls[1][1].contents));
    },{sendAI:async(model,payload)=>++request<=2?providerError():aiResponse(batchResponse(payload))});
  });
  await test('Authentication, quota, network and output failures never trigger a schema correction',async()=>{
    const failures=[
      {label:'quota',send:()=>providerError(429,'Quota exhausted.','RESOURCE_EXHAUSTED'),expected:error=>error.status===429},
      {label:'authentication',send:()=>providerError(401,'Credentials rejected.','UNAUTHENTICATED'),expected:error=>error.status===401},
      {label:'invalid API key',send:()=>providerError(400,'API key not valid. Please pass a valid API key.'),expected:error=>error.code==='AI_AUTHENTICATION_FAILED'},
      {label:'network',send:()=>{throw new TypeError('Failed to fetch');},expected:/Failed to fetch/},
      {label:'short quiz',send:()=>aiResponse(response(19)),expected:/20|count|incomplete/i},
      {label:'malformed JSON',send:()=>aiResponse(null,{candidates:[{finishReason:'STOP',content:{parts:[{text:'{broken-json'}]}}]}),expected:/invalid quiz JSON/i}
    ];
    for(const fixture of failures)await isolated(async({service,file,generate,calls})=>{
      await service.loadPdf(file);await assert.rejects(generate({count:20}),fixture.expected);assert.equal(calls.length,1,`${fixture.label} must use one call`);assert.notEqual(service.getDraft().responseFormat,'JSON_MODE');assert.equal(service.getDraft().questions.length,0);
    },{sendAI:async()=>fixture.send()});
  });
  await test('Real AI transport serializes compatible quiz requests and corrects a rejected schema across sources and models',async()=>{
    const fixtures=[
      {sourceType:'PDF',count:20,language:'ENGLISH',model:'gemini-2.5-flash'},
      {sourceType:'TOPIC',count:20,language:'BILINGUAL',model:'gemini-2.5-flash'},
      {sourceType:'TEXT',count:21,language:'BILINGUAL',model:'gemini-2.5-flash'},
      {sourceType:'PDF',count:20,language:'BILINGUAL',model:'gemini-2.5-pro'}
    ];
    for(const fixture of fixtures)await isolated(async({service,file,w})=>{
      const wire=[],probes=[],syntheticKey='synthetic-fixture-key-never-a-real-credential';let offset=0;
      w.localStorage.setItem('hamsa_gemini_api_key',syntheticKey);
      w.geminiService.getActiveModel=()=>fixture.model;w.geminiService.getGeminiModel=()=>fixture.model;
      // This stub is the only fetch implementation in this isolated DOM. It
      // handles the real transport's status probe and serialized wire body.
      w.fetch=async(url,init={})=>{
        if(String(url)==='/api/gemini/status'){probes.push(url);return new Response('{"configured":true}',{headers:{'Content-Type':'application/json'}});}
        assert.equal(String(url),`https://generativelanguage.googleapis.com/v1beta/models/${fixture.model}:generateContent`);
        assert.equal(init.method,'POST');assert.equal(init.headers['Content-Type'],'application/json');assert.equal(init.headers['x-goog-api-key'],syntheticKey);
        assert.equal(typeof init.body,'string');const payload=JSON.parse(init.body);wire.push(payload);
        assert.equal(require('../ai-proxy-policy.js').validatePayload(payload),null,'Serialized request passes shared proxy validation');
        assert.equal(payload.generationConfig.responseMimeType,'application/json');
        const inspect=node=>{if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){assert.ok(!['minItems','maxItems','minimum','maximum'].includes(key),`Nested schema constraint ${key} is absent`);inspect(value);}};
        inspect(payload.generationConfig.responseSchema);
        if(fixture.model==='gemini-2.5-pro')assert.ok(payload.generationConfig.thinkingConfig.thinkingBudget>=128,'Pro receives its supported thinking minimum');
        else assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget,0);
        if(wire.length===1){assert.ok(payload.generationConfig.responseSchema);return providerError();}
        assert.equal(payload.generationConfig.responseSchema,undefined,'The rejected grammar is absent from correction and following batches');
        const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);
      };
      w.eval(read('js/ai-client.js'));w.aiClient.SHARED_REQUEST_INTERVAL_MS=0;w.aiClient.SHARED_REQUESTS_PER_MINUTE=100;
      // Plenty of fixture token headroom: this check exercises real transport
      // normalization/error parsing, rather than rate-limit cooldown timing.
      w.aiClient.SHARED_INPUT_TOKENS_PER_MINUTE=100000;
      await w.aiClient.probeServerKey();assert.equal(probes.length,1);
      if(fixture.sourceType==='PDF')await service.loadPdf(file);
      const quiz=await service.generate({...config,...fixture,text:'Energy conservation, work, motion and power',difficulty:'MIXED'});
      assert.equal(quiz.questions.length,fixture.count);assert.equal(quiz.language,fixture.language);assert.equal(quiz.model,fixture.model);
      assert.equal(wire.length,Math.ceil(fixture.count/20)+1,'One correction, then only unfinished batches');
      assert.deepEqual(wire.map(payload=>Number(payload.contents[0].parts[0].text.match(/Create exactly (\d+)/)[1])),fixture.count===21?[20,20,1]:[20,20]);
      assert.deepEqual(wire[0].contents,wire[1].contents,'Rejected and corrected source/count contracts are identical');
      assert.equal(new Set(quiz.questions.map(question=>question.question)).size,fixture.count,'Accepted batches contain no duplicated questions');
      assert.equal(service.getDraft().responseFormat,'JSON_MODE');assert.equal(service.getDraft().questions.length,fixture.count);
      if(fixture.sourceType==='PDF')assert.ok(quiz.questions.every(question=>question.sourcePage>=2&&question.sourcePage<=3));
      else assert.ok(quiz.questions.every(question=>question.sourcePage===null));
      const rejected=w.aiClient._requestLog[0];assert.equal(rejected.status,400);assert.equal(rejected.errorCode,'AI_INVALID_ARGUMENT');assert.equal(rejected.providerStatus,'INVALID_ARGUMENT');
    });
  });
  await test('All difficulties and languages support combined bilingual question content',async()=>{for(const difficulty of ['EASY','MEDIUM','HARD','MIXED'])for(const language of ['AUTO','ENGLISH','HINDI','BILINGUAL'])await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);const quiz=await generate({difficulty,language});const prompt=JSON.stringify(calls[0][1]);assert.match(prompt,new RegExp(difficulty,'i'));if(language!=='AUTO')assert.match(prompt,new RegExp(language==='BILINGUAL'?'bilingually':language,'i'));assert.equal(quiz.difficulty,difficulty);assert.equal(quiz.language,language);if(language==='BILINGUAL')for(const question of quiz.questions)for(const field of [question.question,...question.options,question.explanation,...question.optionExplanations])assert.ok(/[A-Za-z]/.test(field)&&/[\u0900-\u097F]/.test(field));if(difficulty==='MIXED')assert.equal(new Set(quiz.questions.map(q=>q.difficulty)).size,3);});});
  await test('Requests under or equal to twenty use one batch; larger counts use twenty plus remainder',async()=>{for(const count of [1,5,19,20,21,30,41,200]){let offset=0;await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);const quiz=await generate({count});assert.equal(quiz.questions.length,count);assert.equal(calls.length,Math.ceil(count/20));assert.deepEqual(calls.map(call=>Number(call[1].contents[0].parts[0].text.match(/Create exactly (\d+)/)[1])),Array.from({length:Math.ceil(count/20)},(_,i)=>Math.min(20,count-i*20)));assert.equal(service.getDraft().questions.length,count);assert.equal(new Set(quiz.questions.map(q=>q.id)).size,count);},{sendAI:async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});}await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate({count:201}),/200|count|question/i);assert.equal(calls.length,0);});});
  await test('Invalid PDF page ranges never call AI',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);for(const [fromPage,toPage]of [[0,2],[2,1],[1,7],[1.5,2],[1,1001]])await assert.rejects(generate({fromPage,toPage}),/page|range|whole|integer/i);assert.equal(calls.length,0);}));
  await test('Scanned selected pages that fit keep their original image in the same request without OCR',()=>isolated(async({service,file,w,generate,calls,renders,reads})=>{useRealBudget(w,5000);await service.loadPdf(file);const quiz=await generate();assert.deepEqual(reads,[2,3]);assert.deepEqual(renders,[2]);assert.equal(calls.length,1);assert.equal(sourceOcrCalls(calls).length,0);const parts=calls[0][1].contents.flatMap(content=>content.parts);assert.ok(parts.some(part=>part.inlineData?.mimeType==='image/jpeg'));assert.ok(parts.some(part=>part.text?.includes('PAGE_3_SENTINEL')));assert.equal(quiz.questions.length,10);assert.equal(quiz.source.ocrPages,undefined);},{scanned:[2]}));
  await test('Short responses fail rather than pretending the requested count was met',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate(),/10|count|question|incomplete/i);assert.equal(calls.length,1);},{sendAI:async()=>aiResponse(response(9))}));
  await test('Duplicate questions are rejected without extra AI checks',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate(),/duplicate|repeated|unique/i);assert.equal(calls.length,1);},{sendAI:async()=>{const value=response();value.questions[1].question=value.questions[0].question;return aiResponse(value);}}));
  await test('Four distinct options and a valid answer are required',async()=>{for(const mutation of [value=>value.questions[0].options.pop(),value=>value.questions[0].options[1]=value.questions[0].options[0],value=>value.questions[0].answerIndex=4])await isolated(async({service,file,generate})=>{await service.loadPdf(file);await assert.rejects(generate(),/option|answer|format|invalid/i);},{sendAI:async()=>{const value=response();mutation(value);return aiResponse(value);}});});
  await test('Mathematical signs, decimal points and letter case remain distinct answer options',()=>isolated(async({w})=>{
    for(const options of [['+1','-1','1.2','12'],['x+1','x-1','x','X']]){const value=response(1);value.questions[0].options=options;const checked=w.QuizService.validateQuizResponse(value,{count:1,fromPage:2,toPage:3});assert.deepEqual(Array.from(checked.questions[0].options),options);}
    const value=response(1);value.questions[0].options=['Same value','  Same   value ','Other value','Final value'];assert.throws(()=>w.QuizService.validateQuizResponse(value,{count:1,fromPage:2,toPage:3}),/duplicate/);
    value.questions[0].options=['!!!','Value two','Value three','Value four'];assert.throws(()=>w.QuizService.validateQuizResponse(value,{count:1,fromPage:2,toPage:3}),/duplicate|option/);
  }));
  await test('New generation requires reasons for all options and rejects incomplete bilingual output locally',async()=>{
    for(const mutation of [value=>delete value.questions[0].optionExplanations,value=>value.questions[0].optionExplanations.pop(),value=>value.questions[0].difficulty='INVALID',value=>value.questions[0].topic=''])await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate(),/option|difficulty|topic|details/i);assert.equal(calls.length,1);assert.equal(service.getDraft().questions.length,0);},{sendAI:async(model,payload)=>{const value=batchResponse(payload);mutation(value);return aiResponse(value);}});
    await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate({language:'BILINGUAL'}),/both English and Hindi/);assert.equal(calls.length,1);},{sendAI:async(model,payload)=>{const value=batchResponse(payload);value.questions[0].options[0]='English only';return aiResponse(value);}});
  });
  await test('Mixed difficulty must contain a real difficulty mixture',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate({difficulty:'MIXED'}),/mixture/);assert.equal(calls.length,1);},{sendAI:async(model,payload)=>{const value=batchResponse(payload);for(const question of value.questions)question.difficulty='MEDIUM';return aiResponse(value);}}));
  await test('Context selections survive checkpoints, reload and resumed generation',async()=>{
    let request=0;
    await isolated(async({service,w,calls})=>{const selections={subject:' Physics ',chapter:'Work and energy',exam:'SSC practice'};await assert.rejects(service.generate({sourceType:'TOPIC',text:'Energy conservation',count:20,difficulty:'MIXED',language:'BILINGUAL',...selections}),error=>error.status===503);const restored=new w.QuizService();assert.equal(restored.getDraft().subject,'Physics');assert.equal(restored.getDraft().chapter,selections.chapter);assert.equal(restored.getDraft().exam,selections.exam);const quiz=await restored.generate({resume:true,subject:'Ignored override'});assert.equal(calls.length,2);assert.equal(quiz.subject,'Physics');assert.equal(quiz.chapter,selections.chapter);assert.equal(quiz.exam,selections.exam);assert.match(calls[1][1].contents[0].parts[0].text,/Physics/);assert.match(calls[1][1].contents[0].parts[0].text,/SSC practice/);const config=calls[1][1].generationConfig;assert.equal(config.maxOutputTokens,8192);assert.equal(require('../ai-proxy-policy.js').validatePayload(calls[1][1]),null);assert.ok(config.responseSchema.properties.questions.items.required.includes('optionExplanations'));assert.equal(config.responseSchema.properties.questions.minItems,undefined);assert.match(config.responseSchema.properties.questions.description,/Exactly 20 questions/);assert.equal(quiz.questions.length,20);},{sendAI:async(model,payload)=>++request===1?new Response('{"error":{"message":"Paused fixture"}}',{status:503}):aiResponse(batchResponse(payload))});
    await isolated(async({service,calls})=>{await assert.rejects(service.generate({sourceType:'TOPIC',text:'Physics',count:1,subject:'x'.repeat(121)}),/120/);assert.equal(calls.length,0);});
  });
  await test('Legacy ten-question generation drafts resume without losing existing IDs or metadata',()=>isolated(async({service,w,calls})=>{
    const existing=response(10).questions.map((question,index)=>{const old={...question,id:`q${index+1}`,sourcePage:null};delete old.optionExplanations;delete old.difficulty;delete old.topic;return old;});
    w.localStorage.setItem(service.draftKey,JSON.stringify({version:1,id:'legacy-job',source:{type:'TOPIC',text:'Energy conservation'},count:25,difficulty:'MEDIUM',language:'ENGLISH',tasks:[{count:10},{count:10},{count:5}],next:1,questions:existing,title:'Saved old quiz',createdAt:'2026-10-07T08:00:00.000Z'}));
    const quiz=await service.generate({resume:true});assert.equal(calls.length,2);assert.equal(quiz.questions.length,25);assert.equal(quiz.title,'Saved old quiz');assert.equal(quiz.questions[0].id,'q1');assert.equal(quiz.questions[9].id,'q10');assert.equal(quiz.questions[24].id,'q25');assert.equal(quiz.questions[0].optionExplanations,undefined);assert.equal(quiz.questions[10].optionExplanations.length,4);
  },{sendAI:(()=>{let offset=10;return async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);};})()}));
  await test('Questions must cite one of the selected pages',()=>isolated(async({service,file,generate})=>{await service.loadPdf(file);await assert.rejects(generate(),/source|page|selected/i);},{sendAI:async()=>{const value=response();value.questions[0].sourcePage=1;return aiResponse(value);}}));
  await test('Malformed JSON and interrupted provider responses are surfaced',async()=>{for(const value of [new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{bad json'}]}}]})),aiResponse(response(),{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(response())}]}}]})])await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate(),/JSON|complete|limit|response|format|interrupt/i);assert.equal(calls.length,1);},{sendAI:async()=>value});});
  await test('Authentication, quota and overload failures never trigger hidden retries',async()=>{for(const status of [401,429,503])await isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);await assert.rejects(generate(),error=>error.status===status);assert.equal(calls.length,1);},{sendAI:async()=>new Response(JSON.stringify({error:{message:'Fixture provider failure'}}),{status})});});
  await test('Cancellation before generation prevents any AI request',()=>isolated(async({service,file,generate,calls,w})=>{await service.loadPdf(file);const controller=new w.AbortController();controller.abort();await assert.rejects(generate({signal:controller.signal}),error=>error.name==='AbortError');assert.equal(calls.length,0);}));
  await test('Cancellation stops a waiting request and discards a late response',async()=>{const held=deferred();await isolated(async({service,file,generate,w,calls})=>{await service.loadPdf(file);const controller=new w.AbortController(),pending=generate({signal:controller.signal});await waitFor(()=>calls.length);controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');held.resolve(aiResponse());await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,1);},{sendAI:()=>held.promise});});
  await test('A hung response reaches a bounded timeout',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);service.REQUEST_TIMEOUT_MS=20;await assert.rejects(generate(),/time|long|deadline/i);assert.equal(calls.length,1);},{sendAI:()=>new Promise(()=>{})}));
  await test('A hung PDF page reaches a bounded read timeout without AI',()=>isolated(async({service,file,generate,calls})=>{await service.loadPdf(file);service.READ_TIMEOUT_MS=20;await assert.rejects(generate(),/time|long|reading/i);assert.equal(calls.length,0);},{readPage:async()=>({getTextContent:()=>new Promise(()=>{}),cleanup(){}})}));
  await test('Saving and loading a quiz uses a dedicated store, independently of archived quizzes',()=>isolated(async({w,database})=>{database.quizzes.rows.push({id:999,title:'Archived quiz'});const quiz={...response(),source:{fileName:'Energy.pdf',fromPage:2,toPage:3,pageCount:6},difficulty:'MEDIUM',language:'ENGLISH',model:'gemini-2.5-flash',createdAt:new Date().toISOString()};const stored=await w.quizStore.save(quiz);assert.ok(stored.id);const saved=await w.quizStore.get(stored.id);assert.equal(saved.questions.length,10);assert.equal(saved.source.fromPage,2);assert.equal((await w.quizStore.list()).length,1);assert.equal(database.quizzes.rows.length,1);}));
  await test('Deleting a fresh quiz removes its attempts and preserves other quizzes',()=>isolated(async({w,database})=>{const base={...response(),source:{fileName:'Energy.pdf',fromPage:2,toPage:3,pageCount:6},language:'ENGLISH',model:'gemini-2.5-flash',createdAt:new Date().toISOString()},first=await w.quizStore.save({...base,difficulty:'EASY'}),second=await w.quizStore.save({...base,difficulty:'HARD'});await w.quizStore.saveAttempt(first.id,{answers:Array(10).fill(0),completedAt:new Date().toISOString()});await w.quizStore.saveAttempt(second.id,{answers:Array(10).fill(0),completedAt:new Date().toISOString()});await w.quizStore.remove(first.id);assert.equal(await w.quizStore.get(first.id),null);assert.equal((await w.quizStore.listAttempts(first.id)).length,0);assert.equal((await w.quizStore.listAttempts(second.id)).length,1);assert.equal((await w.quizStore.list()).length,1);assert.equal(database.pdfQuizzes.rows.length,1);}));
  await test('Attempt scores are computed locally and ignore caller-supplied score fields',()=>isolated(async({w,calls})=>{
    const quiz=await w.quizStore.save(storedQuiz()),answers=[0,0,1,...Array(7).fill(null)];
    const attempt=await w.quizStore.saveAttempt(quiz.id,{answers,score:999,correct:999,incorrect:999,skipped:999,percentage:999,totalQuestions:999,durationSeconds:32,completedAt:'2026-10-07T08:01:00.000Z'});
    assert.equal(attempt.score,2);assert.equal(attempt.correct,2);assert.equal(attempt.incorrect,1);assert.equal(attempt.skipped,7);assert.equal(attempt.percentage,20);assert.equal(attempt.totalQuestions,10);assert.equal(attempt.durationSeconds,32);assert.equal(calls.length,0);
    answers[0]=3;assert.equal((await w.quizStore.listAttempts(quiz.id))[0].answers[0],0);
  }));
  await test('Malformed quiz and answer records never become saved quiz attempts',()=>isolated(async({w,database})=>{
    for(const mutate of [quiz=>quiz.questions[0]=null,quiz=>quiz.questions[0].options[0]='!!!',quiz=>quiz.questions[0].sourcePage=9,quiz=>quiz.questions=[]]){
      const quiz=storedQuiz();mutate(quiz);await assert.rejects(w.quizStore.save(quiz));
    }
    assert.equal(database.pdfQuizzes.rows.length,0);
    const quiz=await w.quizStore.save(storedQuiz());
    for(const answers of [[],Array(10).fill(4),Array(10).fill(undefined),Array(10),Array(9).fill(0)])await assert.rejects(w.quizStore.saveAttempt(quiz.id,{answers}));
    await assert.rejects(w.quizStore.saveAttempt(999,{answers:Array(10).fill(0)}),/exist/i);assert.equal(database.pdfQuizAttempts.rows.length,0);
  }));
  await test('Portable backup includes new quiz stores and REPLACE restores attempts with authoritative scores',()=>isolated(async({w,database})=>{
    const quiz=await w.quizStore.save(storedQuiz());await w.quizStore.saveAttempt(quiz.id,{answers:[0,1,...Array(8).fill(null)],completedAt:'2026-10-07T08:02:00.000Z'});
    await database.notes.add({title:'Unrelated note',content:'Study text'});await database.quizzes.add({title:'Preserved archived quiz'});
    let exported;w.UIUtils.toDateKey=()=> '2026-10-07';w.UIUtils.downloadJson=value=>{exported=clone(value);};
    const summary=await w.exportDatabaseBackup();assert.equal(summary.pdfQuizzes,1);assert.equal(summary.pdfQuizAttempts,1);assert.equal(exported.tables.pdfQuizzes[0].questions.length,10);assert.equal(exported.dexieVersion,13);
    Object.assign(exported.tables.pdfQuizAttempts[0],{score:999,correct:999,percentage:999});
    await w.quizStore.save(storedQuiz({title:'Will be replaced'}));
    const report=await w.importDatabaseBackup(JSON.stringify(exported),{mode:'REPLACE'});
    assert.equal(report.tables.pdfQuizzes.imported,1);assert.equal(report.tables.pdfQuizAttempts.imported,1);assert.equal((await w.quizStore.list()).length,1);
    const attempts=await w.quizStore.listAttempts(quiz.id);assert.equal(attempts.length,1);assert.equal(attempts[0].score,1);assert.equal(attempts[0].incorrect,1);assert.equal(attempts[0].skipped,8);assert.equal(attempts[0].percentage,10);
    assert.equal(database.notes.rows[0].title,'Unrelated note');assert.equal(database.quizzes.rows[0].title,'Preserved archived quiz');
  }));
  await test('Backup MERGE remaps numeric-string quiz IDs and their attempts without overwriting existing quizzes',()=>isolated(async({w,database})=>{
    const existing=await w.quizStore.save(storedQuiz({title:'Existing quiz'}));
    await w.quizStore.saveAttempt(existing.id,{answers:Array(10).fill(0),completedAt:'2026-10-07T07:00:00.000Z'});
    const imported=storedQuiz({id:'1',title:'Imported quiz'}),backup={formatVersion:3,tables:{pdfQuizzes:[imported],pdfQuizAttempts:[{id:'1',quizId:'1',answers:[1,...Array(9).fill(null)],score:999,completedAt:'2026-10-07T08:03:00.000Z'}]}};
    const report=await w.importDatabaseBackup(JSON.stringify(backup),{mode:'MERGE'});assert.equal(report.totalImported,2);
    const quizzes=await w.quizStore.list(),merged=quizzes.find(quiz=>quiz.title==='Imported quiz');assert.equal(quizzes.length,2);assert.notEqual(merged.id,existing.id);assert.equal((await w.quizStore.get(existing.id)).title,'Existing quiz');
    const attempts=await w.quizStore.listAttempts(merged.id);assert.equal(attempts.length,1);assert.equal(attempts[0].quizId,merged.id);assert.equal(attempts[0].score,0);assert.equal(attempts[0].incorrect,1);assert.equal(attempts[0].skipped,9);assert.equal((await w.quizStore.listAttempts(existing.id)).length,1);assert.equal(database.pdfQuizAttempts.rows.length,2);
  }));
  await test('Backup inspection rejects orphaned attempts and malformed parent IDs before any writes',()=>isolated(async({w,database})=>{
    const backup={tables:{pdfQuizzes:[storedQuiz({id:'1'}),storedQuiz({id:'not-a-number'})],pdfQuizAttempts:[
      {id:1,quizId:999,answers:Array(10).fill(0),completedAt:'2026-10-07T08:00:00.000Z'},
      {id:2,quizId:'1',answers:[],completedAt:'2026-10-07T08:00:00.000Z'},
      {id:3,quizId:'1',answers:Array(10).fill(0),completedAt:'2026-10-07T08:00:00.000Z'}
    ]}};
    const report=await w.inspectDatabaseBackup(JSON.stringify(backup));assert.equal(report.tables.pdfQuizzes.imported,1);assert.equal(report.tables.pdfQuizzes.skipped,1);assert.equal(report.tables.pdfQuizAttempts.imported,1);assert.equal(report.tables.pdfQuizAttempts.skipped,2);assert.equal(report.totalRecords,2);assert.equal(database.pdfQuizzes.rows.length,0);assert.equal(database.pdfQuizAttempts.rows.length,0);
  }));
  await test('QUIZ reset clears only fresh quiz records and summary counts include both new stores',()=>isolated(async({w,database})=>{
    const quiz=await w.quizStore.save(storedQuiz());await w.quizStore.saveAttempt(quiz.id,{answers:Array(10).fill(0),completedAt:'2026-10-07T08:00:00.000Z'});
    await database.notes.add({title:'Keep note'});await database.quizzes.add({title:'Keep archive'});await database.customDecks.add({title:'Keep deck'});
    w.localStorage.setItem('hamsa_gemini_api_key','fixture-private-key');
    let summary=await w.getDatabaseSummaryCounts();assert.equal(summary.quizCount,1);assert.equal(summary.quizAttemptCount,1);assert.equal(summary.notesCount,1);assert.equal(summary.deckCount,1);assert.equal(summary.totalRecords,4);
    const removed=await w.clearModuleData('QUIZ');assert.equal(removed.pdfQuizzes,1);assert.equal(removed.pdfQuizAttempts,1);assert.equal(database.pdfQuizzes.rows.length,0);assert.equal(database.pdfQuizAttempts.rows.length,0);assert.equal(database.notes.rows.length,1);assert.equal(database.customDecks.rows.length,1);assert.equal(database.quizzes.rows.length,1);assert.equal(w.localStorage.getItem('hamsa_gemini_api_key'),'fixture-private-key');
    summary=await w.getDatabaseSummaryCounts();assert.equal(summary.quizCount,0);assert.equal(summary.quizAttemptCount,0);assert.equal(summary.totalRecords,2);
  }));
  await test('A blocked database open times out before any write and cannot save later',()=>isolated(async({w,database})=>{
    const held=deferred();database.open=()=>held.promise;w.quizStore.STORAGE_TIMEOUT_MS=15;
    await assert.rejects(w.quizStore.save(storedQuiz()),error=>error.code==='QUIZ_STORAGE_TIMEOUT'&&/other.*tabs|storage/i.test(error.message));assert.equal(database.pdfQuizzes.rows.length,0);
    held.resolve(database);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(database.pdfQuizzes.rows.length,0);
    const saved=await w.quizStore.save(storedQuiz());assert.ok(saved.id);assert.equal(database.pdfQuizzes.rows.length,1);
  }));
  await test('A stalled storage write aborts its transaction and a late completion cannot create duplicate saves',()=>isolated(async({w,database})=>{
    const held=deferred();database.pdfQuizzes.delayAdd=held.promise;w.quizStore.STORAGE_TIMEOUT_MS=15;
    await assert.rejects(w.quizStore.save(storedQuiz()),error=>error.code==='QUIZ_STORAGE_TIMEOUT');assert.equal(database.pdfQuizzes.rows.length,0);
    held.resolve();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(database.pdfQuizzes.rows.length,0);
    database.pdfQuizzes.delayAdd=null;const saved=await w.quizStore.save(storedQuiz());assert.ok(saved.id);assert.equal(database.pdfQuizzes.rows.length,1);
  }));
  await test('PDF upload enforces both 50 MB and 1,000 pages',async()=>{
    await isolated(async({service,file,calls})=>{await service.loadPdf({...file,size:50*1024*1024});assert.equal(service.metadata.pageCount,1000);assert.equal(calls.length,0);},{pages:1000});
    await isolated(async({service,file,calls})=>{await assert.rejects(service.loadPdf(file),/1,000|1000/);assert.equal(calls.length,0);},{pages:1001});
  });
  await test('Dense forty-page sources generate exactly two twenty-question batches within real request budgets',()=>isolated(async({service,file,w,generate,calls})=>{
    const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);
    const quiz=await generate({fromPage:1,toPage:40,count:40});
    assert.equal(quiz.questions.length,40);assert.equal(calls.length,2);
    assert.deepEqual(calls.map(call=>Number(call[1].contents[0].parts[0].text.match(/Create exactly (\d+)/)[1])),[20,20]);
    assertSourceCoverage(calls,1,40);assertRequestBudgets(calls,service,budget);
    for(const[,payload]of calls)assert.match(payload.contents[0].parts[0].text,/excerpt|compact/i);
    assert.match(calls[1][1].contents[0].parts[0].text,/Distinct energy question 1\?/,'Earlier-question exclusion survives compaction');
    assert.deepEqual(Array.from(service.getDraft().tasks,task=>[task.fromPage,task.toPage,task.count]),[[1,20,20],[21,40,20]]);
    assert.deepEqual(Array.from(quiz.source.excerptedPages),Array.from({length:40},(_,index)=>index+1),'Saved quiz records the excerpted source pages');
  },{pages:40,readPage:number=>densePage(number),sendAI:(()=>{let offset=0;return async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);};})()}));
  await test('Dense Hindi source under twenty questions uses one request with every selected page represented',()=>isolated(async({service,file,w,generate,calls})=>{
    const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);
    const quiz=await generate({fromPage:3,toPage:32,count:19,language:'HINDI'});
    assert.equal(quiz.questions.length,19);assert.equal(calls.length,1);
    const prompt=calls[0][1].contents[0].parts[0].text;assert.match(prompt,/Create exactly 19/);assert.match(prompt,/excerpt|compact/i);assert.match(prompt,/[\u0900-\u097F]/);
    assertSourceCoverage(calls,3,32);assertRequestBudgets(calls,service,budget);
    assert.ok(estimatePayloadTokens(calls[0][1])>Math.ceil(prompt.length/4),'Hindi consumes its weighted token allowance');
  },{pages:40,readPage:number=>densePage(number,true)}));
  await test('Already-fitting sources retain their complete original text without excerpting',()=>isolated(async({service,file,w,generate,calls})=>{
    useRealBudget(w,12000);await service.loadPdf(file);const quiz=await generate();
    assert.equal(calls.length,1);const prompt=calls[0][1].contents[0].parts[0].text;
    for(const number of [2,3])assert.ok(prompt.includes((`PAGE_${number}_SENTINEL. `+'Energy is conserved. Work transfers energy. Power is work per time. Force accelerates mass. '.repeat(8)).trim()));
    assert.doesNotMatch(prompt,/\[(?:[^\]]*EXCERPT|[^\]]*COMPACT)/i);
    assertRequestBudgets(calls,service,12000);
    assert.equal(quiz.source.excerptedPages,undefined);
  }));
  await test('Over-budget scanned batches read individual pages and keep one exact twenty-question output request',()=>isolated(async({service,file,w,generate,calls,renders,progress})=>{
    const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);
    const quiz=await generate({fromPage:1,toPage:8,count:20}),ocr=sourceOcrCalls(calls),outputs=quizCalls(calls);
    assert.equal(quiz.questions.length,20);assert.equal(outputs.length,1);assert.ok(ocr.length>0&&ocr.length<8,'Only the minimum necessary scanned pages require OCR');assert.deepEqual(renders,[1,2,3,4,5,6,7,8]);
    assert.equal(new Set(ocr.map(call=>ocrPage(call[1]))).size,ocr.length,'Each paid OCR page is requested once');
    for(const[,payload,options]of ocr){const parts=payload.contents.flatMap(content=>content.parts);assert.equal(parts.filter(part=>part.inlineData).length,1);assert.equal(parts.find(part=>part.inlineData).inlineData.data,'VEVTVElNQUdF','Original rendered image bytes are preserved');assert.equal(payload.generationConfig.responseSchema,undefined);assert.doesNotMatch(parts.map(part=>part.text||'').join('\n'),/Create exactly \d+ questions/);assert.equal(options.quotaSafe,true);}
    const material=outputs[0][1].contents.flatMap(content=>content.parts).map(part=>part.text||'').join('\n');for(let page=1;page<=8;page++)assert.match(material,new RegExp(`\\[PDF PAGE ${page}\\]`),'Every scanned page remains represented in the final source');
    for(const call of ocr)assert.match(material,new RegExp(`PAGE_${ocrPage(call[1])}_SENTINEL`),'OCR source text reaches the question request');
    assertRequestBudgets(calls,service,budget);assert.deepEqual(Array.from(quiz.source.ocrPages),ocr.map(call=>ocrPage(call[1])));assert.equal(service.getDraft().pendingOcr,undefined);assert.ok(progress.some(event=>/OCR|read.*scan|scan.*read/i.test(event.message)),'Additional reading requests are visible');
  },{pages:8,scanned:[1,2,3,4,5,6,7,8]}));
  await test('Image part-count grouping retains every scan without paid OCR when the token budget fits',()=>isolated(async({service,file,w,generate,calls})=>{
    const budget=100000;useRealBudget(w,budget);await service.loadPdf(file);const quiz=await generate({fromPage:1,toPage:25,count:20}),outputs=quizCalls(calls),ocr=sourceOcrCalls(calls);
    assert.equal(quiz.questions.length,20);assert.equal(outputs.length,1);assert.equal(ocr.length,0,'Part-count grouping alone needs no paid transcription');assert.equal(outputs[0][1].contents.length,2);assert.ok(outputs[0][1].contents.every(content=>content.parts.length<=20));const parts=outputs[0][1].contents.flatMap(content=>content.parts);assert.equal(parts.length,26);assert.equal(parts.filter(part=>part.inlineData).length,25);for(const part of parts.filter(part=>part.inlineData))assert.equal(part.inlineData.data,'VEVTVElNQUdF');const source=parts.map(part=>part.text||'').join('\n');for(let page=1;page<=25;page++)assert.match(source,new RegExp(`\\[PDF PAGE ${page}\\]`));assertRequestBudgets(calls,service,budget);assert.equal(quiz.source.ocrPages,undefined);
  },{pages:25,scanned:Array.from({length:25},(_,index)=>index+1)}));
  await test('A hundred-question quiz preserves its first eighty questions while recovering the last scanned batch',async()=>{
    let completed=null,generationId=null;
    await isolated(async({service,file,w,generate,calls,progress})=>{
      const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);
      const quiz=await generate({fromPage:1,toPage:40,count:100,onProgress:event=>{progress.push(event);if(service.getDraft()?.questions.length===80&&!completed){completed=clone(service.getDraft().questions);generationId=service.getDraft().id;}}});
      const outputs=quizCalls(calls),ocr=sourceOcrCalls(calls);assert.equal(quiz.questions.length,100);assert.equal(outputs.length,5);assert.ok(ocr.length>0);assert.equal(quiz.generationId,generationId);assert.deepEqual(clone(quiz.questions.slice(0,80)),completed,'Earlier answers, explanations, IDs and citations stay identical');
      assert.deepEqual(outputs.map(call=>Number(call[1].contents[0].parts[0].text.match(/Create exactly (\d+)/)[1])),[20,20,20,20,20]);assert.ok(ocr.every(call=>ocrPage(call[1])>=33&&ocrPage(call[1])<=40));assert.equal(new Set(ocr.map(call=>ocrPage(call[1]))).size,ocr.length);
      assertSourceCoverage(outputs.slice(0,4),1,32);const finalSource=JSON.stringify(outputs[4][1].contents);for(let page=33;page<=40;page++)assert.match(finalSource,new RegExp(`\\[PDF PAGE ${page}\\]`));assertRequestBudgets(calls,service,budget);
      assert.equal(new Set(quiz.questions.map(question=>question.id)).size,100);assert.equal(service.getDraft().next,5);assert.equal(service.getDraft().pendingOcr,undefined);assert.deepEqual(Array.from(quiz.source.ocrPages),ocr.map(call=>ocrPage(call[1])));
    },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI()});
  });
  await test('An OCR quota interruption after eighty questions reloads its paid page text without replaying earlier batches',async()=>{
    let ocrAttempts=0,failedOnce=false;
    await isolated(async({service,file,w,generate,calls,reads})=>{
      const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);await assert.rejects(generate({fromPage:1,toPage:40,count:100}),error=>error.status===429);
      const draft=clone(service.getDraft()),completed=clone(draft.questions);assert.equal(completed.length,80);assert.equal(draft.next,4);assert.equal(draft.source.ocrPages,undefined,'Uncommitted source metadata stays pending');assert.equal(draft.pendingOcr.taskIndex,4);assert.equal(draft.pendingOcr.pages.length,1);
      const paidPage=draft.pendingOcr.pages[0].pageNumber,firstCalls=calls.length,readBoundary=reads.length;assert.equal(quizCalls(calls).length,4);assert.equal(sourceOcrCalls(calls).length,2);
      const restored=new w.QuizService();restored.REQUEST_TIMEOUT_MS=250;restored.QUEUE_WAIT_TIMEOUT_MS=0;assert.deepEqual(clone(restored.getDraft().pendingOcr),draft.pendingOcr);await restored.loadPdf(file);
      const quiz=await restored.generate({resume:true});assert.equal(quiz.questions.length,100);assert.equal(quiz.generationId,draft.id);assert.equal(quiz.createdAt,draft.createdAt);assert.deepEqual(clone(quiz.questions.slice(0,80)),completed);
      assert.equal(quizCalls(calls.slice(firstCalls)).length,1);assert.ok(sourceOcrCalls(calls.slice(firstCalls)).every(call=>ocrPage(call[1])!==paidPage),'Resume reuses OCR already paid for');assert.ok(!reads.slice(readBoundary).includes(paidPage),'Saved OCR pages need no rerender');assert.equal(quizCalls(calls).length,5);assert.equal(restored.getDraft().pendingOcr,undefined);assert.ok(quiz.source.ocrPages.includes(paidPage));assertRequestBudgets(calls,restored,budget);
    },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI(page=>{ocrAttempts++;if(ocrAttempts===2&&!failedOnce){failedOnce=true;return providerError(429,'Fixture OCR quota exhausted.','RESOURCE_EXHAUSTED');}return ocrResponse(page);})});
  });
  await test('OCR authentication, quota, empty, incomplete and malformed responses stop with eighty completed questions intact',async()=>{
    const cases=[
      {name:'authentication',send:()=>providerError(401,'OCR credentials rejected.','UNAUTHENTICATED'),expected:error=>error.status===401},
      {name:'quota',send:()=>providerError(429,'OCR quota exhausted.','RESOURCE_EXHAUSTED'),expected:error=>error.status===429},
      {name:'empty',send:()=>ocrResponse(33,{candidates:[{finishReason:'STOP',content:{parts:[{text:'   '}]}}]}),expected:/OCR|scan|text|read|empty/i},
      {name:'thought only',send:()=>ocrResponse(33,{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'This is private reasoning, not the source text.'}]}}]}),expected:/OCR|scan|text|read|empty/i},
      {name:'unreadable scan',send:()=>ocrResponse(33,{candidates:[{finishReason:'STOP',content:{parts:[{text:'UNREADABLE_PAGE'}]}}]}),expected:/readable|scan|OCR/i},
      {name:'incomplete',send:()=>ocrResponse(33,{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'Energy is conserved. This excerpt was interrupted.'}]}}]}),expected:/OCR|scan|complete|limit|interrupt/i},
      {name:'malformed',send:()=>new Response('{not-json'),expected:/OCR|scan|JSON|response|format/i},
      {name:'missing candidates',send:()=>new Response('{}'),expected:/OCR|scan|candidate|response|read|text/i},
      {name:'malformed text field',send:()=>ocrResponse(33,{candidates:[{finishReason:'STOP',content:{parts:[{text:{invented:'source text'}}]}}]}),expected:/OCR|invalid|response/i},
      {name:'oversized OCR output',send:()=>ocrResponse(33,{candidates:[{finishReason:'STOP',content:{parts:[{text:'Energy is conserved. '.repeat(4000)}]}}]}),expected:/OCR|too much text/i}
    ];
    for(const fixture of cases)await isolated(async({service,file,w,generate,calls})=>{
      useRealBudget(w,5000);await service.loadPdf(file);await assert.rejects(generate({fromPage:1,toPage:40,count:100}),fixture.expected);const draft=service.getDraft();assert.equal(draft.questions.length,80,fixture.name);assert.equal(draft.next,4);assert.equal(quizCalls(calls).length,4);assert.equal(sourceOcrCalls(calls).length,1,'Failed OCR never starts an automatic retry or final quiz request');assert.equal(draft.source.ocrPages,undefined);assert.equal(draft.pendingOcr?.pages?.length||0,0,'Invalid OCR never enters persisted source text');
    },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI(()=>fixture.send())});
  });
  await test('Cancelling page OCR after eighty questions rejects its late text and sends no further request',async()=>{
    const held=deferred();await isolated(async({service,file,w,generate,calls})=>{
      useRealBudget(w,5000);await service.loadPdf(file);const controller=new w.AbortController(),pending=generate({fromPage:1,toPage:40,count:100,signal:controller.signal});await waitFor(()=>sourceOcrCalls(calls).length===1);const completed=clone(service.getDraft().questions);controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');held.resolve(ocrResponse(33));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,5);assert.equal(service.getDraft().questions.length,80);assert.deepEqual(clone(service.getDraft().questions),completed);assert.equal(service.getDraft().pendingOcr?.pages?.length||0,0);assert.equal(service.getDraft().source.ocrPages,undefined);
    },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI(()=>held.promise)});
  });
  await test('A failed OCR checkpoint stops before another AI request and Resume reuses its retained source',()=>isolated(async({service,file,w,generate,calls})=>{
    useRealBudget(w,5000);const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key===service.draftKey&&JSON.parse(value).pendingOcr?.pages?.length)throw Error('Fixture storage full');return original.call(this,key,value);};
    await service.loadPdf(file);await assert.rejects(generate({fromPage:1,toPage:40,count:100}),error=>error.code==='QUIZ_CHECKPOINT_FAILED');assert.equal(calls.length,5);assert.equal(service.getDraft().questions.length,80);const paidPage=service.getDraft().pendingOcr.pages[0].pageNumber;assert.equal(service.getDraft().source.ocrPages,undefined);
    w.Storage.prototype.setItem=original;const quiz=await service.generate({resume:true});assert.equal(quiz.questions.length,100);assert.equal(sourceOcrCalls(calls).filter(call=>ocrPage(call[1])===paidPage).length,1);assert.equal(quizCalls(calls).length,5);
  },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI()}));
  await test('An individually unfit scan is rejected before any OCR or question request',()=>isolated(async({service,file,w,generate,calls})=>{
    useRealBudget(w,1000);await service.loadPdf(file);await assert.rejects(generate({fromPage:1,toPage:8,count:20}),error=>error.code==='AI_INPUT_BUDGET');assert.equal(calls.length,0);assert.equal(service.getDraft().questions.length,0);assert.equal(service.getDraft().source.ocrPages,undefined);
  },{pages:8,scanned:[1,2,3,4,5,6,7,8]}));
  await test('Long OCR pages use a bounded persisted cache and label verbatim source excerpts',()=>isolated(async({service,file,w,generate,calls,progress})=>{
    useRealBudget(w,5000);await service.loadPdf(file);const checkpoints=[];
    const quiz=await generate({fromPage:1,toPage:8,count:20,onProgress:event=>{progress.push(event);if(service.getDraft()?.pendingOcr)checkpoints.push(clone(service.getDraft().pendingOcr));}});
    assert.ok(checkpoints.length>0);for(const checkpoint of checkpoints){assert.ok(checkpoint.pages.reduce((sum,page)=>sum+page.text.length,0)<=300000);for(const page of checkpoint.pages){assert.ok(page.text.length<=37500);assert.equal(page.excerpted,true);assert.ok(page.text.includes(`PAGE_${page.pageNumber}_SENTINEL`));assert.ok(page.text.includes(`PAGE_${page.pageNumber}_END_SENTINEL`));}}
    const outputs=quizCalls(calls);assert.equal(outputs.length,1);const text=outputs[0][1].contents.flatMap(content=>content.parts).map(part=>part.text||'').join('\n');assert.match(text,/OCR TRANSCRIPTION/);assert.match(text,/TEXT EXCERPTS/);assert.ok(quiz.source.ocrPages.every(page=>quiz.source.excerptedPages.includes(page)));assertRequestBudgets(calls,service,5000);
  },{pages:8,scanned:[1,2,3,4,5,6,7,8],sendAI:sequentialAI(page=>{const start=`PAGE_${page}_SENTINEL. `,end=` PAGE_${page}_END_SENTINEL.`,text=start+'Energy is conserved. Work transfers energy. '.repeat(2000).slice(0,60000-start.length-end.length)+end;return ocrResponse(page,{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});})}));
  await test('Damaged OCR caches cannot resume with wrong pages, wrong task indices or oversized text',async()=>{
    let reads=0;await isolated(async({service,file,w,generate,calls})=>{
      useRealBudget(w,5000);await service.loadPdf(file);await assert.rejects(generate({fromPage:1,toPage:40,count:100}),error=>error.status===429);const valid=clone(service.getDraft());assert.equal(valid.questions.length,80);assert.equal(valid.pendingOcr.pages.length,1);const firstCalls=calls.length;
      const mutations=[
        draft=>draft.pendingOcr.taskIndex=3,
        draft=>draft.pendingOcr.pages[0].pageNumber=32,
        draft=>draft.pendingOcr.pages.push(clone(draft.pendingOcr.pages[0])),
        draft=>draft.pendingOcr.pages[0].text='',
        draft=>draft.pendingOcr.pages[0].text='x'.repeat(60001),
        draft=>draft.pendingOcr.pages[0].excerpted='yes',
        draft=>draft.pendingOcr.pages=Array.from({length:6},(_,index)=>({pageNumber:33+index,text:'x'.repeat(50001),excerpted:false})),
        draft=>draft.source.ocrPages=[33,33],
        draft=>draft.source.ocrPages=[41]
      ];
      for(const mutate of mutations){const damaged=clone(valid);mutate(damaged);w.localStorage.setItem(service.draftKey,JSON.stringify(damaged));const restored=new w.QuizService();assert.equal(restored.getDraft(),null);assert.match(restored.draftError,/damaged/);await assert.rejects(restored.generate({resume:true}),/damaged|discard|draft/i);assert.equal(calls.length,firstCalls,'Malformed cache never sends an AI request');}
    },{pages:40,scanned:[33,34,35,36,37,38,39,40],sendAI:sequentialAI(page=>++reads===2?providerError(429,'Fixture OCR quota exhausted.','RESOURCE_EXHAUSTED'):ocrResponse(page))});
  });
  await test('A previously failed zero-question planning draft resumes across reload without discarding its identity',()=>isolated(async({service,file,w,calls})=>{
    const budget=5000;useRealBudget(w,budget);const metadata=await service.loadPdf(file);
    const previous={version:1,id:'failed-forty-question-plan',source:{type:'PDF',fileName:metadata.fileName,fromPage:1,toPage:40,pageCount:metadata.pageCount,fingerprint:metadata.fingerprint},count:40,difficulty:'MEDIUM',language:'ENGLISH',tasks:null,next:0,questions:[],title:'',createdAt:'2026-10-07T08:00:00.000Z'};
    w.localStorage.setItem(service.draftKey,JSON.stringify(previous));const restored=new w.QuizService();
    assert.equal(restored.getDraft().tasks,null);await restored.loadPdf(file);
    const quiz=await restored.generate({resume:true});assert.equal(quiz.generationId,previous.id);assert.equal(quiz.createdAt,previous.createdAt);assert.equal(quiz.questions.length,40);assert.equal(calls.length,2);
    assertSourceCoverage(calls,1,40);assertRequestBudgets(calls,restored,budget);assert.equal(restored.getDraft().next,2);
  },{pages:40,readPage:number=>densePage(number),sendAI:(()=>{let offset=0;return async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);};})()}));
  await test('Quota interruption after a compacted batch resumes only unfinished pages and preserves completed questions',async()=>{
    let offset=0,failedOnce=false;
    await isolated(async({service,file,w,generate,calls})=>{
      const budget=5000;useRealBudget(w,budget);await service.loadPdf(file);
      await assert.rejects(generate({fromPage:1,toPage:40,count:40}),error=>error.status===429);
      assert.equal(calls.length,2);assert.equal(service.getDraft().questions.length,20);const completed=clone(service.getDraft().questions);
      assert.deepEqual(Array.from(service.getDraft().source.excerptedPages),Array.from({length:20},(_,index)=>index+1),'Only committed excerpt metadata is checkpointed');
      const restored=new w.QuizService();assert.equal(restored.getDraft().next,1);await restored.loadPdf(file);
      const quiz=await restored.generate({resume:true});assert.equal(quiz.questions.length,40);assert.equal(calls.length,3);
      assert.deepEqual(clone(quiz.questions.slice(0,20)),completed);assertSourceCoverage([calls[2]],21,40);assertRequestBudgets(calls,restored,budget);
      assert.deepEqual(Array.from(quiz.source.excerptedPages),Array.from({length:40},(_,index)=>index+1),'Excerpt metadata survives resumed source coverage');
      assert.doesNotMatch(calls[2][1].contents[0].parts[0].text,/\[PDF PAGE (?:[1-9]|1\d|20)\]/);
      assert.equal(new Set(quiz.questions.map(q=>q.id)).size,40);
    },{pages:40,readPage:number=>densePage(number),sendAI:async(model,payload)=>{if(offset===20&&!failedOnce){failedOnce=true;return new Response('{"error":{"message":"Fixture quota exhausted"}}',{status:429});}const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});
  });
  await test('Quota interruption survives reload and resumes only unfinished batches',async()=>{
    let offset=0,failedOnce=false;
    await isolated(async({service,file,w,generate,calls})=>{
      await service.loadPdf(file);await assert.rejects(generate({count:25}),error=>error.status===429);
      assert.equal(calls.length,2);assert.equal(service.getDraft().questions.length,20);
      const restored=new w.QuizService();restored.REQUEST_TIMEOUT_MS=250;restored.QUEUE_WAIT_TIMEOUT_MS=0;
      assert.equal(restored.getDraft().next,1);await restored.loadPdf(file);
      const quiz=await restored.generate({resume:true});assert.equal(quiz.questions.length,25);assert.equal(calls.length,3);
      assert.equal(new Set(quiz.questions.map(q=>q.id)).size,25);
    },{sendAI:async(model,payload)=>{if(offset===20&&!failedOnce){failedOnce=true;return new Response('{"error":{"message":"Fixture quota exhausted"}}',{status:429});}const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});
  });
  await test('Pause preserves a committed batch and discards a late in-flight response',async()=>{
    const held=deferred();let request=0,offset=0;
    await isolated(async({service,file,w,generate,calls})=>{
      await service.loadPdf(file);const controller=new w.AbortController(),pending=generate({count:25,signal:controller.signal});
      await waitFor(()=>calls.length>=2);controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');
      assert.equal(service.getDraft().questions.length,20);held.resolve(aiResponse(response(5)));await new Promise(resolve=>setTimeout(resolve,10));
      const quiz=await service.generate({resume:true});assert.equal(quiz.questions.length,25);assert.equal(calls.length,3);
    },{sendAI:async(model,payload)=>{if(++request===2)return held.promise;const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});
  });
  await test('A failed checkpoint halts before the next request and resumes its retained questions',async()=>{
    let offset=0;
    await isolated(async({service,file,w,generate,calls})=>{
      const original=w.Storage.prototype.setItem;
      w.Storage.prototype.setItem=function(key,value){if(key===service.draftKey&&JSON.parse(value).questions.length>=20)throw new Error('Storage full');return original.call(this,key,value);};
      await service.loadPdf(file);await assert.rejects(generate({count:25}),error=>error.code==='QUIZ_CHECKPOINT_FAILED');assert.equal(calls.length,1);assert.equal(service.getDraft().questions.length,20);
      w.Storage.prototype.setItem=original;const quiz=await service.generate({resume:true});assert.equal(quiz.questions.length,25);assert.equal(calls.length,2);
    },{sendAI:async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});
  });
  await test('Duplicates across batches pause generation with earlier questions intact',()=>isolated(async({service,file,generate,calls})=>{
    await service.loadPdf(file);await assert.rejects(generate({count:40}),/duplicate/);assert.equal(calls.length,2);assert.equal(service.getDraft().questions.length,20);
  }));
  await test('Topic and study-text quizzes need no PDF and have no invented page citations',async()=>{
    for(const sourceType of ['TOPIC','TEXT']){let offset=0;await isolated(async({service,w,calls})=>{
      const quiz=await service.generate({sourceType,text:'Energy conservation and work',count:25,difficulty:'HARD',language:'HINDI'});
      assert.equal(calls.length,2);assert.equal(quiz.source.type,sourceType);assert.ok(quiz.questions.every(q=>q.sourcePage===null));
      const first=await w.quizStore.save(quiz),second=await w.quizStore.save(quiz);assert.equal(first.id,second.id);assert.equal((await w.quizStore.list()).length,1);
      const attempt=await w.quizStore.saveAttempt(first.id,{answers:Array(25).fill(0)});assert.equal(attempt.correct,25);
      const report=await w.inspectDatabaseBackup(JSON.stringify({tables:{pdfQuizzes:[first]}}));assert.equal(report.tables.pdfQuizzes.imported,1);
      service.completeGeneration(quiz.generationId);assert.equal(service.getDraft(),null);
    },{sendAI:async(model,payload)=>{const value=batchResponse(payload,offset);offset+=value.questions.length;return aiResponse(value);}});}
  });
  await test('Resume rejects a different PDF without spending another request',()=>isolated(async({service,file,generate,calls})=>{
    await service.loadPdf(file);await assert.rejects(generate(),error=>error.status===503);await service.loadPdf({...file,size:5555});
    await assert.rejects(service.generate({resume:true}),/same PDF|different PDF/i);assert.equal(calls.length,1);
  },{sendAI:async()=>new Response('{"error":{"message":"Overloaded"}}',{status:503})}));
  await test('Damaged generation drafts cannot silently replace completed work',()=>isolated(async({service,w,calls})=>{
    w.localStorage.setItem(service.draftKey,'{broken');assert.equal(service.getDraft(),null);assert.match(service.draftError,/damaged/);
    await assert.rejects(service.generate({sourceType:'TOPIC',text:'Physics',count:10}),/discard/i);assert.equal(calls.length,0);service.discardDraft();assert.equal(service.draftError,'');
  }));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
