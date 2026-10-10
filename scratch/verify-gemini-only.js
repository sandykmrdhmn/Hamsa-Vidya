/** Gemini-only migration, settings and request boundaries. All HTTP is mocked. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let passed = 0, failed = 0;
async function test(name, run) {
  const dom = new JSDOM('<div id="view-settings"></div>', {url:'http://localhost/',runScripts:'outside-only'});
  const w = dom.window, calls = [];
  w.console = {log(){},warn(){},error(){}};
  w.TextEncoder = TextEncoder;
  w.UIUtils = {buildViewHero:()=>''};
  w.app = {refreshIcons(){},showToast(){}};
  for (const [key,value] of Object.entries({hamsa_ai_provider:'openai',hamsa_openai_model:'z-ai/glm-5.3-flash',hamsa_openai_api_key:'obsolete-key',hamsa_ai_pacing_openai_old:'{}',hamsa_theme_mode:'DARK',hamsa_gemini_model:'gemini-2.5-flash'})) w.localStorage.setItem(key,value);
  w.fetch = async (url, init={}) => {
    calls.push({url:String(url),init});
    if(String(url).endsWith('/status'))return Response.json({configured:true});
    if(String(url).endsWith('/models'))return Response.json({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]});
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'PONG'}]}}],usageMetadata:{promptTokenCount:3,candidatesTokenCount:1,totalTokenCount:4}});
  };
  for(const file of ['js/ai-client.js','js/study-preferences.js','js/gemini-service.js','js/views/settings.js'])w.eval(read(file));
  try { await run({w,calls,client:w.aiClient,service:w.geminiService,view:w.settingsView}); passed++; console.log('PASS '+name); }
  catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}
  finally {w.aiClient.abortAll();w.close();}
}
(async()=>{
  await test('Existing browser profiles migrate to Gemini and keep study preferences',async({w,client,service,calls})=>{
    await client.probeServerKey();
    assert.equal(client.getProvider(),'gemini');assert.equal(service.getActiveModel(),'gemini-2.5-flash');
    for(const key of ['hamsa_ai_provider','hamsa_openai_model','hamsa_openai_api_key','hamsa_ai_pacing_openai_old'])assert.equal(w.localStorage.getItem(key),null);
    assert.equal(w.localStorage.getItem('hamsa_theme_mode'),'DARK');
    assert.deepEqual(calls.map(call=>call.url),['/api/gemini/status']);
  });
  await test('Settings has only Gemini credentials, model and connection controls',async({w,view,calls})=>{
    await view.render();
    assert.ok(w.document.querySelector('#gemini-api-key-input'));
    assert.ok(w.document.querySelector('#gemini-model-select'));
    assert.ok(w.document.querySelector('#api-test-button'));
    assert.equal(w.document.querySelector('#ai-provider-select'),null);
    assert.equal(w.document.querySelector('#openai-api-key-input'),null);
    assert.ok(!/OpenAI|ChatGPT|Nemotron|GLM/i.test(w.document.body.textContent));
    assert.ok(!calls.some(call=>!call.url.startsWith('/api/gemini')));
  });
  await test('Old selections cannot reactivate providers; new generation uses Gemini',async({w,client,calls})=>{
    w.localStorage.setItem('hamsa_ai_provider','openai');
    const result=await client.generate({prompt:'Reply PONG'});
    assert.equal(result.provider,'gemini');assert.equal(result.model,'gemini-2.5-flash');assert.equal(result.text,'PONG');
    assert.equal(calls.find(call=>call.init.method==='POST').url,'/api/gemini/gemini-2.5-flash');
  });
  await test('Explicit retired providers and model IDs fail before network generation',async({client,calls})=>{
    await client.probeServerKey();const before=calls.length;
    for(const provider of ['openai','anthropic','nvidia']){
      await assert.rejects(client.generate({prompt:'PONG',provider}),{code:'AI_PROVIDER_UNSUPPORTED'});
      await assert.rejects(client.fetchListModels({provider}),{code:'AI_PROVIDER_UNSUPPORTED'});
      assert.equal(client.isAvailable(provider),false);assert.equal(client.getUserKey(provider),'');
    }
    for(const model of ['gpt-4.1-mini','nvidia/nemotron-3-ultra-550b-a55b','z-ai/glm-5.3-flash'])await assert.rejects(client.fetchGenerateContent(model,{contents:[]}),{code:'AI_MODEL_UNSUPPORTED'});
    assert.equal(calls.length,before);
  });
  await test('Gemini connection test still obtains a complete model response',async({service,calls})=>{
    const result=await service.testApiKey('',{saveModel:false});
    assert.equal(result.success,true);
    assert.equal(calls.filter(call=>call.init.method==='POST').length,1);
    assert.ok(calls.every(call=>call.url.startsWith('/api/gemini')));
  });
  await test('Gemini personal keys still use direct Google requests',async({service,client,calls})=>{
    service.setApiKey('fake-gemini-key');
    const result=await client.generate({prompt:'PONG'});
    assert.equal(result.provider,'gemini');
    const post=calls.find(call=>call.init.method==='POST');
    assert.ok(post.url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!post.url.includes('key=') && !post.url.includes('fake-gemini-key'));
    assert.equal(post.init.headers['x-goog-api-key'], 'fake-gemini-key');
    assert.ok(calls.filter(call=>call.url.startsWith('/api/gemini')).every(call=>!call.init.headers?.['x-goog-api-key']));
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
