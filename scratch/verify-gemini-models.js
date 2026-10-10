/** Gemini account model discovery, automatic selection and REST compatibility.
 * Isolated browser storage and mocked responses; never uses a real API key.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const vm = require('vm');
const {createRequire} = require('module');
const {EventEmitter} = require('events');
const {Writable} = require('stream');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const DEFAULT = 'gemini-2.5-flash';
const model = (name, extra = {}) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'], ...extra });
let passed = 0, failed = 0;

// Check serialized REST requests against the documented generateContent model
// contracts, rather than accepting every outbound payload as a successful mock.
function assertThinkingContract(name, config = {}) {
  const thinking = config.thinkingConfig;
  if (/^gemini-2\.5(?:[.-]|$)/.test(name)) {
    assert.ok(thinking && Number.isInteger(thinking.thinkingBudget), name);
    assert.ok(!('thinkingLevel' in thinking), name);
    const budget = thinking.thinkingBudget;
    assert.ok(budget >= 0 && budget <= 1024, name);
    if (/^gemini-2\.5-pro(?:[.-]|$)/.test(name)) assert.ok(budget >= 128, 'Pro cannot disable thinking');
    if (/^gemini-2\.5-flash-lite(?:[.-]|$)/.test(name)) assert.ok(budget === 0 || budget >= 512, 'Flash-Lite positive budget starts at 512');
  } else if (/^gemini-3(?:[.-]|$)/.test(name)) {
    const levels=/^gemini-3(?:\.\d+)?-pro(?:[.-]|$)/.test(name) ? ['low','high']
      : /^gemini-3\.(?:7|8)-flash(?:[.-]|$)/.test(name) ? ['low','medium','high']
      : /^gemini-3\.1-flash-lite-image(?:[.-]|$)/.test(name) ? ['minimal','high']
      : ['minimal','low','medium','high'];
    assert.ok(thinking && levels.includes(thinking.thinkingLevel), name);
    assert.ok(!('thinkingBudget' in thinking), name);
    for (const key of ['temperature','topP','topK','candidateCount']) assert.ok(!(key in config), name+' '+key);
  } else assert.equal(thinking, undefined, name+' does not support thinking controls');
}

const thinkingCases = [
  ...[undefined,0,1,127,128,500,100000,-1].map(budget => ({name:'gemini-2.5-pro',thinking:budget===undefined?undefined:{thinkingBudget:budget},expected:Math.max(128,Math.min(1024,budget||0))})),
  ...[0,1,511,512,9999].map(budget => ({name:'gemini-2.5-flash-lite',thinking:{thinkingBudget:budget},expected:budget===0?0:Math.max(512,Math.min(1024,budget))})),
  {name:'gemini-2.5-flash',thinking:{thinkingBudget:0},expected:0},
  {name:'gemini-2.5-pro-preview',thinking:{thinkingBudget:0},expected:128},
  {name:'gemini-3-pro-preview',thinking:{thinkingLevel:'minimal'},expected:'low'},
  {name:'gemini-3.1-pro-preview',thinking:{thinkingLevel:'medium'},expected:'low'},
  {name:'gemini-3.1-pro-preview',thinking:{thinkingLevel:'high'},expected:'high'},
  {name:'gemini-3-flash-preview',thinking:{thinkingLevel:'minimal'},expected:'minimal'},
  {name:'gemini-3.5-flash',thinking:{thinkingLevel:'medium'},expected:'medium'},
  {name:'gemini-3.8-flash',thinking:{thinkingLevel:'minimal'},expected:'low'},
  {name:'gemini-3.1-flash-lite-image',thinking:{thinkingLevel:'low'},expected:'minimal'},
  {name:'gemini-2.0-flash',thinking:{thinkingBudget:0},expected:undefined}
];

async function proxyRequest(name, payload) {
  let handler;
  const upstream=[];
  const root=path.resolve(__dirname,'..');
  const requireFromRoot=createRequire(path.join(root,'server.js'));
  const policy=requireFromRoot('./ai-proxy-policy');
  class MemoryBudget { constructor(){this.daily={day:'fixture'};} reserve(){return null;} markProviderDailyExhausted(){} }
  const source=read('server.js');
  vm.runInNewContext(source.slice(0,source.lastIndexOf('server.listen(')), {
    __dirname:root,process:{env:{GEMINI_API_KEY:'fake-server-fixture-key'}},URL,Buffer,AbortController,AbortSignal,
    console:{log(){},warn(){},error(){}},setInterval:()=>({unref(){}}),setTimeout,clearTimeout,
    require:module=>module==='http'?{createServer(fn){handler=fn;return {};}}:module==='./ai-proxy-policy'?{...policy,ProxyBudget:MemoryBudget}:requireFromRoot(module),
    fetch:async(url,init)=>{
      const body=JSON.parse(init.body);
      upstream.push({url:String(url),payload:body});
      assertThinkingContract(name,body.generationConfig);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'OK'}]}}]});
    }
  });
  const req=new EventEmitter();
  Object.assign(req,{url:'/api/gemini/'+name,method:'POST',headers:{host:'localhost:3000'},socket:{remoteAddress:'127.0.0.1'}});
  const chunks=[];
  const res=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
  res.setHeader=()=>{};
  res.writeHead=status=>{res.status=status;return res;};
  const done=new Promise((resolve,reject)=>{res.on('error',reject);res.on('finish',()=>resolve({status:res.status,body:Buffer.concat(chunks).toString('utf8'),upstream}));});
  handler(req,res);req.emit('data',Buffer.from(JSON.stringify(payload)));req.emit('end');
  return done;
}

async function test(name, run) {
  const dom = new JSDOM('<div id="view-settings"></div>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [];
  const listed = [model('gemini-3.5-flash-lite'), model('gemini-3.5-flash'), model(DEFAULT), model('gemini-3.1-pro-preview')];
  w.console = { log() {}, warn() {}, error() {} };
  w.TextEncoder = TextEncoder;
  w.UIUtils = { buildViewHero: () => '' };
  w.app = { refreshIcons() {}, showToast() {} };
  w.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), payload: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    if (String(url).endsWith('/status')) return Response.json({ configured: true });
    if (/\/models(?:\?|$)/.test(String(url))) return Response.json({ models: listed });
    const name=decodeURIComponent(String(url).match(/(?:\/models\/|\/api\/gemini\/)(gemini-[\w.-]+)/)?.[1] || '');
    try { assertThinkingContract(name,JSON.parse(init.body).generationConfig); }
    catch (error) { return Response.json({error:{message:error.message,status:'INVALID_ARGUMENT'}},{status:400}); }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":"OK"}' }] } }] });
  };
  w.eval(read('js/ai-client.js'));
  w.eval(read('js/gemini-service.js'));
  try {
    await run({ w, svc: w.geminiService, calls, listed });
    console.log(`  PASS  ${name}`); passed++;
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack}`); failed++;
  } finally { dom.window.close(); }
}

(async () => {
  await test('New installations save the requested stable free-tier default', ({ w, svc }) => {
    assert.equal(svc.getActiveModel(), DEFAULT);
    assert.equal(w.localStorage.getItem('hamsa_gemini_model'), DEFAULT);
  });
  await test('Old defaults, retired models and unknown choices migrate without changing other preferences', ({ w, svc }) => {
    w.localStorage.setItem('hamsa_gemini_api_key', 'fake-personal-key');
    w.localStorage.setItem('hamsa_theme_mode', 'DARK');
    for (const old of ['gemini-3.6-flash','models/gemini-3.6-flash','gemini-3.8-flash', 'models/gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'models/gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro', 'models/gemini-pro', 'gemini-3.1-pro-preview', 'unknown']) {
      w.localStorage.setItem('hamsa_gemini_model', old);
      assert.equal(svc.getActiveModel(), DEFAULT, old);
      assert.equal(w.localStorage.getItem('hamsa_gemini_model'), DEFAULT);
    }
    assert.equal(w.localStorage.getItem('hamsa_gemini_api_key'), 'fake-personal-key');
    assert.equal(w.localStorage.getItem('hamsa_theme_mode'), 'DARK');
  });
  await test('Valid manual free-tier choices persist and model prefixes normalize', ({ svc }) => {
    svc.setActiveModel('models/gemini-2.5-flash');
    assert.equal(svc.getActiveModel(), DEFAULT);
    svc.setActiveModel('gemini-3.1-pro-preview');
    svc.setActiveModel('gemini-3.8-flash-tts');
    assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Fallback ranking prefers the selected/default model while retaining discovered account models', ({ svc }) => {
    const input = ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', DEFAULT, `models/${DEFAULT}`, 'gemini-2.0-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-99-flash'];
    const original = [...input];
    const ranked = Array.from(svc.sortModelsByPreference(input));
    assert.equal(ranked[0], DEFAULT);
    assert.ok(ranked.includes('gemini-3.5-flash'));
    assert.ok(ranked.includes('gemini-3.1-pro-preview'));
    assert.ok(!ranked.includes('models/gemini-2.5-flash'));
    assert.equal(svc.sortModelsByPreference(input, 'models/gemini-3.5-flash')[0], 'gemini-3.5-flash');
    assert.deepEqual(input, original);
    assert.deepEqual(Array.from(svc.sortModelsByPreference(['gemini-3.1-pro-preview'])), ['gemini-3.1-pro-preview']);
  });
  await test('Discovery intersects free-tier eligibility with API capabilities and caches it', async ({ w, svc, listed, calls }) => {
    await w.aiClient.probeServerKey();
    listed.splice(0, listed.length,
      model(DEFAULT),
      model('gemini-3.5-flash', { supportedResponseModalities: ['AUDIO'] }),
      model('gemini-3.5-flash-lite', { supportedGenerationMethods: ['embedContent'] }),
      model('gemini-3.8-flash'), model('gemini-3.7-flash'),
      model('gemini-3.1-pro-preview'), model('gemini-3.8-flash-image'));
    const found = await svc.discoverAvailableModels();
    assert.deepEqual(Array.from(found), [DEFAULT, 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview']);
    await svc.discoverAvailableModels();
    assert.equal(calls.filter(c => c.url.endsWith('/models')).length, 1);
    assert.deepEqual(Array.from(svc.candidateModels), [DEFAULT]);
    assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Connection testing chooses the default model even if discovery is unordered', async ({ svc, calls }) => {
    const result = await svc.testApiKey();
    assert.equal(result.success, true);
    assert.equal(result.model, DEFAULT);
    assert.equal(calls.find(c => c.payload).url, `/api/gemini/${DEFAULT}`);
    assert.ok(result.availableModels.includes('gemini-3.1-pro-preview'));
  });
  await test('Unavailable default model falls back to an eligible model and saves that choice', async ({ w, svc, calls }) => {
    const originalFetch = w.fetch;
    w.fetch = async (url, init) => {
      if (String(url).endsWith(`/${DEFAULT}`)) {
        calls.push({ url: String(url), payload: JSON.parse(init.body) });
        return Response.json({ error: { message: 'Model unavailable' } }, { status: 404 });
      }
      return originalFetch(url, init);
    };
    const result = await svc.testApiKey();
    assert.equal(result.success, true);
    assert.equal(result.model, 'gemini-3.5-flash');
    assert.equal(svc.getActiveModel(), 'gemini-3.5-flash');
    assert.deepEqual(calls.filter(c => c.payload).map(c => c.url), [`/api/gemini/${DEFAULT}`, '/api/gemini/gemini-3.5-flash']);
  });
  await test('Verified fallback and account models survive service reload for the same connection', async ({ w, svc }) => {
    const originalFetch = w.fetch;
    w.fetch = (url, init) => String(url).endsWith(`/${DEFAULT}`)
      ? Promise.resolve(Response.json({ error: { message: 'Unavailable' } }, { status: 404 }))
      : originalFetch(url, init);
    const result = await svc.testApiKey('');
    assert.equal(result.model, 'gemini-3.5-flash');
    const restored = new svc.constructor();
    assert.equal(restored.getActiveModel(), result.model);
    assert.deepEqual(Array.from(restored.candidateModels), Array.from(svc.sortModelsByPreference(result.availableModels, result.model)));
  });
  await test('A tested personal key activates matching credentials and persists only a fingerprint in model metadata', async ({ w, svc, calls }) => {
    const result = await svc.testApiKey('fake-personal-for-model-test');
    assert.equal(result.success, true);
    assert.equal(svc.getApiKey(), 'fake-personal-for-model-test');
    const metadata = w.localStorage.getItem('hamsa_gemini_verified_models');
    assert.ok(metadata && !metadata.includes('fake-personal-for-model-test'));
    assert.equal(new svc.constructor().getActiveModel(), result.model);
    await w.aiClient.fetchGenerateContent(undefined, { contents: [] });
    assert.ok(!calls.at(-1).url.includes('key=') && !calls.at(-1).url.includes('fake-personal-for-model-test'));
    assert.equal(calls.at(-1).headers['x-goog-api-key'], 'fake-personal-for-model-test');
    assert.ok(!JSON.stringify(w.aiClient.getRequestDiagnostics()).includes('fake-personal-for-model-test'));
    svc.setApiKey('different-fake-key');
    assert.deepEqual(Array.from(svc.candidateModels), [DEFAULT]);
    assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Discovery and noncommitting probes cannot overwrite an already verified connection', async ({ w, svc }) => {
    await svc.testApiKey('');
    svc.setGeminiModel('gemini-3.5-flash');
    const before = w.localStorage.getItem('hamsa_gemini_verified_models');
    await svc.discoverAvailableModels('another-fake-key', { forceDirect: true });
    const result = await svc.testApiKey('another-fake-key', { saveModel: false });
    assert.equal(result.success, true);
    assert.equal(svc.getApiKey(), '');
    assert.equal(svc.getActiveModel(), 'gemini-3.5-flash');
    assert.equal(w.localStorage.getItem('hamsa_gemini_verified_models'), before);
  });
  await test('Transient overload on the preferred model falls back to another listed model', async ({ w, svc }) => {
    const originalFetch = w.fetch;
    w.fetch = async (url, init) => String(url).endsWith(`/${DEFAULT}`)
      ? Response.json({ error: { message: 'Temporarily overloaded' } }, { status: 503 })
      : originalFetch(url, init);
    const result = await svc.testApiKey();
    assert.equal(result.success, true);
    assert.equal(result.model, 'gemini-3.5-flash');
  });
  await test('Transport uses the same default and preserves supported sampling and adds compatible thinking parameters without mutating callers', async ({ w, calls }) => {
    const payload = { contents: [{ parts: [{ text: 'Explain this' }] }], generationConfig: {
      temperature: 0.25, topP: 0.8, topK: 20, candidateCount: 2,
      maxOutputTokens: 8192, responseMimeType: 'application/json'
    } };
    const original = JSON.stringify(payload);
    await w.aiClient.fetchGenerateContent(undefined, payload);
    const sent = calls.find(c => c.payload);
    assert.equal(sent.url, `/api/gemini/${DEFAULT}`);
    assert.deepEqual(sent.payload.generationConfig, {...payload.generationConfig,thinkingConfig:{thinkingBudget:0,includeThoughts:false}});
    assert.equal(JSON.stringify(payload), original);
    await w.aiClient.fetchGenerateContent('gemini-2.5-flash', payload);
    assert.equal(calls.at(-1).payload.generationConfig.temperature, 0.25);
  });
  await test('Direct transport uses the configured model and preserves JSON and image inputs', async ({ w, calls }) => {
    w.aiClient._serverKeyConfigured = false;
    w.localStorage.setItem('hamsa_gemini_api_key', 'fake-personal-key');
    const image = { inlineData: { mimeType: 'image/png', data: 'FAKE' } };
    await w.aiClient.fetchGenerateContent(undefined, { contents: [{ parts: [image] }], generationConfig: { temperature: 0.25, responseMimeType: 'application/json' } });
    const sent = calls.at(-1);
    assert.ok(sent.url.includes(`/models/${DEFAULT}:generateContent`));
    assert.ok(!sent.url.includes('key=') && !sent.url.includes('fake-personal-key'));
    assert.equal(sent.headers['x-goog-api-key'], 'fake-personal-key');
    assert.deepEqual(sent.payload.contents[0].parts[0], image);
    assert.deepEqual(sent.payload.generationConfig, {temperature:0.25,responseMimeType:'application/json',thinkingConfig:{thinkingBudget:0,includeThoughts:false}});
  });
  await test('Proxy and direct transport normalize each model thinking contract without changing inputs or model choice', async ({w,calls}) => {
    w.aiClient.SHARED_REQUESTS_PER_MINUTE=1000;
    await w.aiClient.probeServerKey();
    const selected=w.localStorage.getItem('hamsa_gemini_model');
    for (const forceDirect of [false,true]) for (const item of thinkingCases) {
      const payload={contents:[{role:'user',parts:[{text:'Quiz fixture'}]}],generationConfig:{temperature:0.2,topP:0.8,topK:20,candidateCount:1,maxOutputTokens:8192,responseMimeType:'application/json',...(item.thinking?{thinkingConfig:item.thinking}:{})}};
      const original=JSON.stringify(payload);
      const response=await w.aiClient.fetchGenerateContent(item.name,payload,{forceDirect,forceProxy:!forceDirect,apiKey:forceDirect?'fake-direct-fixture-key':undefined});
      assert.equal(response.status,200,forceDirect+' '+item.name+' '+original);
      const sent=calls.at(-1);
      assert.ok(sent.url.includes(item.name));
      assert.equal(sent.payload.generationConfig.thinkingConfig?.thinkingBudget ?? sent.payload.generationConfig.thinkingConfig?.thinkingLevel,item.expected,item.name);
      assert.equal(JSON.stringify(payload),original,item.name);
      assert.equal(w.localStorage.getItem('hamsa_gemini_model'),selected);
    }
  });
  await test('Server proxy enforces the same model-specific contract at the upstream REST boundary', async () => {
    for (const item of thinkingCases) {
      const payload={contents:[{role:'user',parts:[{text:'Quiz fixture'}]}],generationConfig:{temperature:0.2,topP:0.8,topK:20,candidateCount:1,maxOutputTokens:8192,responseMimeType:'application/json',...(item.thinking?{thinkingConfig:item.thinking}:{})}};
      const original=JSON.stringify(payload),result=await proxyRequest(item.name,payload);
      if (item.thinking?.thinkingBudget<0 || item.thinking?.thinkingBudget>1024) {
        assert.equal(result.status,400,item.name+' preserves the proxy budget boundary');
        assert.equal(result.upstream.length,0);
        continue;
      }
      assert.equal(result.status,200,item.name+' '+result.body);
      assert.equal(result.upstream.length,1,item.name);
      const sent=result.upstream[0];
      assert.ok(sent.url.endsWith('/models/'+item.name+':generateContent'));
      assert.equal(sent.payload.generationConfig.thinkingConfig?.thinkingBudget ?? sent.payload.generationConfig.thinkingConfig?.thinkingLevel,item.expected,item.name);
      assert.equal(JSON.stringify(payload),original,item.name);
    }
  });
  await test('Invalid argument errors preserve only safe parameter paths and remain distinct from authentication failures', async ({w}) => {
    const error=await w.aiClient.createError(Response.json({error:{code:400,status:'INVALID_ARGUMENT',message:'Request contains an invalid argument.',details:[
      {'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[
        {field:'generation_config.thinking_config.thinking_budget',description:'PRIVATE_SOURCE_TEXT'},
        {field:'generation_config.response_schema.properties[questions].minItems',description:'fake-api-key'},
        {field:'generation_config.thinking_config.thinking_budget',description:'duplicate'},
        {field:'SECRET=value'}, {field:'<script>alert(1)</script>'}, {field:'x'.repeat(241)}
      ]},
      {'@type':'type.googleapis.com/google.rpc.ErrorInfo',fieldViolations:[{field:'do_not_trust'}]}
    ]}},{status:400}));
    assert.equal(error.code,'AI_INVALID_ARGUMENT');assert.equal(error.providerStatus,'INVALID_ARGUMENT');assert.equal(error.retryable,false);
    assert.deepEqual(Array.from(error.invalidFields),['generation_config.thinking_config.thinking_budget','generation_config.response_schema.properties[questions].minItems']);
    assert.ok(!JSON.stringify(error).includes('PRIVATE_SOURCE_TEXT')&&!JSON.stringify(error).includes('fake-api-key'));
    const generic=await w.aiClient.createError(Response.json({error:{message:'Request contains an invalid argument.'}},{status:400}));
    assert.equal(generic.code,'AI_INVALID_ARGUMENT');assert.equal(generic.retryable,false);assert.deepEqual(Array.from(generic.invalidFields),[]);
    const auth=await w.aiClient.createError(Response.json({error:{status:'INVALID_ARGUMENT',message:'API key not valid.'}},{status:400}));
    assert.equal(auth.code,'AI_AUTHENTICATION_FAILED');assert.equal(auth.retryable,false);assert.equal(auth.invalidFields,undefined);
  });
  await test('Omitted transport model honors a valid manual choice and works before service initialization', async ({ w, svc, calls }) => {
    svc.setActiveModel('gemini-3.5-flash');
    await w.aiClient.fetchGenerateContent(undefined, { contents: [] });
    assert.equal(calls.at(-1).url, `/api/gemini/${DEFAULT}`);
    delete w.geminiService;
    await w.aiClient.fetchGenerateContent(undefined, { contents: [] });
    assert.equal(calls.at(-1).url, `/api/gemini/${DEFAULT}`);
  });
  await test('AI Teacher uses the shared default and its existing JSON response contract', async ({ w, calls }) => {
    w.eval(read('js/ai-teacher-service.js'));
    const result = await w.aiTeacherService._callGeminiWithFallback('Explain this', null, { validateLesson: false });
    assert.equal(result.model, DEFAULT);
    assert.equal(result.data.answer, 'OK');
    const sent = calls.find(c => c.payload);
    assert.equal(sent.payload.generationConfig.responseMimeType, 'application/json');
    assert.equal(sent.payload.generationConfig.thinkingConfig.thinkingBudget,0);assert.ok(!('thinkingLevel' in sent.payload.generationConfig.thinkingConfig));
  });
  await test('AI Teacher keeps free-tier fallback candidates when discovery fails', async ({ w, svc, calls }) => {
    w.eval(read('js/ai-teacher-service.js'));
    svc.discoverAvailableModels = async () => { throw new Error('List temporarily unavailable'); };
    const originalFetch = w.fetch;
    w.fetch = async (url, init) => {
      if (String(url).endsWith(`/${DEFAULT}`)) {
        calls.push({ url: String(url), payload: JSON.parse(init.body) });
        return Response.json({ error: { message: 'Unavailable' } }, { status: 404 });
      }
      return originalFetch(url, init);
    };
    await assert.rejects(w.aiTeacherService._callGeminiWithFallback('Q', null, { validateLesson: false }), /Unavailable/);
    assert.equal(calls.filter(c => c.payload).length, 1);
  });
  await test('Settings renders discovered models and recommends only the default', async ({ w, svc }) => {
    w.localStorage.setItem('hamsa_gemini_model', 'gemini-3.8-flash');
    w.eval(read('js/views/settings.js'));
    await w.settingsView.render();
    const select = w.document.getElementById('gemini-model-select');
    assert.ok(select, w.document.getElementById('view-settings').textContent);
    assert.equal(select.value, DEFAULT);assert.equal(select.options.length,1);assert.ok(select.options[0].textContent.includes('Gemini 2.5 Flash'));
    assert.deepEqual(Array.from(select.options, o => o.value), Array.from(svc.candidateModels));
    assert.equal(Array.from(select.options).filter(o => o.textContent.includes('Recommended')).length, 1);
    await w.settingsView.testApiKey();
    const refreshedSelect = w.document.getElementById('gemini-model-select');
    assert.equal(refreshedSelect.value, DEFAULT);
    assert.deepEqual(Array.from(refreshedSelect.options, o => o.value), Array.from(svc.candidateModels));
    assert.equal(Array.from(refreshedSelect.options).filter(o => o.textContent.includes('Recommended')).length, 1);
  });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
