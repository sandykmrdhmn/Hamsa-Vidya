/** Model migration, free-tier fallbacks and Gemini 3 request compatibility.
 * Isolated browser storage and mocked responses; never uses a real API key.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const DEFAULT = 'gemini-3.6-flash';
const model = (name, extra = {}) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'], ...extra });
let passed = 0, failed = 0;

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
    calls.push({ url: String(url), payload: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith('/status')) return Response.json({ configured: true });
    if (String(url).endsWith('/models')) return Response.json({ models: listed });
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
    for (const old of ['gemini-3.8-flash', 'models/gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'models/gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro', 'models/gemini-pro', 'gemini-3.1-pro-preview', 'unknown']) {
      w.localStorage.setItem('hamsa_gemini_model', old);
      assert.equal(svc.getActiveModel(), DEFAULT, old);
      assert.equal(w.localStorage.getItem('hamsa_gemini_model'), DEFAULT);
    }
    assert.equal(w.localStorage.getItem('hamsa_gemini_api_key'), 'fake-personal-key');
    assert.equal(w.localStorage.getItem('hamsa_theme_mode'), 'DARK');
  });
  await test('Valid manual free-tier choices persist and model prefixes normalize', ({ svc }) => {
    svc.setActiveModel('models/gemini-3.5-flash');
    assert.equal(svc.getActiveModel(), 'gemini-3.5-flash');
    svc.setActiveModel('gemini-3.1-pro-preview');
    svc.setActiveModel('gemini-3.8-flash-tts');
    assert.equal(svc.getActiveModel(), 'gemini-3.5-flash');
  });
  await test('Fallback ranking prefers quality and never automatically selects unverified models', ({ svc }) => {
    const input = ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', DEFAULT, `models/${DEFAULT}`, 'gemini-2.0-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-99-flash'];
    const original = [...input];
    assert.deepEqual(Array.from(svc.sortModelsByPreference(input)), [DEFAULT, 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    assert.equal(svc.sortModelsByPreference(input, 'models/gemini-3.5-flash')[0], 'gemini-3.5-flash');
    assert.deepEqual(input, original);
    assert.equal(svc.sortModelsByPreference(['gemini-3.1-pro-preview']).length, 0);
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
    assert.deepEqual(Array.from(found), [DEFAULT]);
    await svc.discoverAvailableModels();
    assert.equal(calls.filter(c => c.url.endsWith('/models')).length, 1);
  });
  await test('Connection testing chooses the default model even if discovery is unordered', async ({ svc, calls }) => {
    const result = await svc.testApiKey();
    assert.equal(result.success, true);
    assert.equal(result.model, DEFAULT);
    assert.equal(calls.find(c => c.payload).url, `/api/gemini/${DEFAULT}`);
    assert.ok(!result.availableModels.includes('gemini-3.1-pro-preview'));
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
  await test('Transport uses the same default and strips deprecated overrides without mutating callers', async ({ w, calls }) => {
    const payload = { contents: [{ parts: [{ text: 'Explain this' }] }], generationConfig: {
      temperature: 0.25, topP: 0.8, topK: 20, candidateCount: 2,
      maxOutputTokens: 8192, responseMimeType: 'application/json'
    } };
    const original = JSON.stringify(payload);
    await w.aiClient.fetchGenerateContent(undefined, payload);
    const sent = calls.find(c => c.payload);
    assert.equal(sent.url, `/api/gemini/${DEFAULT}`);
    assert.deepEqual(sent.payload.generationConfig, { maxOutputTokens: 8192, responseMimeType: 'application/json' });
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
    assert.deepEqual(sent.payload.contents[0].parts[0], image);
    assert.deepEqual(sent.payload.generationConfig, { responseMimeType: 'application/json' });
  });
  await test('Omitted transport model honors a valid manual choice and works before service initialization', async ({ w, svc, calls }) => {
    svc.setActiveModel('gemini-3.5-flash');
    await w.aiClient.fetchGenerateContent(undefined, { contents: [] });
    assert.equal(calls.at(-1).url, '/api/gemini/gemini-3.5-flash');
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
    assert.ok(!('temperature' in sent.payload.generationConfig));
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
    const result = await w.aiTeacherService._callGeminiWithFallback('Q', null, { validateLesson: false });
    assert.equal(result.model, 'gemini-3.5-flash');
    assert.equal(calls.filter(c => c.payload).length, 2);
  });
  await test('Settings renders the migrated selection and recommends only the default', async ({ w, svc }) => {
    w.localStorage.setItem('hamsa_gemini_model', 'gemini-3.8-flash');
    w.eval(read('js/views/settings.js'));
    await w.settingsView.render();
    const select = w.document.getElementById('gemini-model-select');
    assert.ok(select, w.document.getElementById('view-settings').textContent);
    assert.equal(select.value, DEFAULT);
    assert.deepEqual(Array.from(select.options, o => o.value), Array.from(svc.candidateModels));
    assert.equal(Array.from(select.options).filter(o => o.textContent.includes('Recommended')).length, 1);
    await w.settingsView.testApiKey();
    assert.equal(select.value, DEFAULT);
    assert.equal(Array.from(select.options).filter(o => o.textContent.includes('Recommended')).length, 1);
  });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
