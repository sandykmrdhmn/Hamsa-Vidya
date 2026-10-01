/** Settings regressions. Isolated storage and mocked HTTP; never uses real keys. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const DEFAULT = 'gemini-3.6-flash';
let passed = 0, failed = 0;

async function test(name, run) {
  const dom = new JSDOM('<div id="view-settings"></div>', { url: 'http://localhost/', runScripts: 'dangerously' });
  const w = dom.window, calls = [], toasts = [], confirmations = [], heroes = [];
  w.console = { log() {}, warn() {}, error() {} };
  w.TextEncoder = TextEncoder;
  w.UIUtils = { buildViewHero: hero => { heroes.push(hero); return ''; } };
  w.app = {
    refreshIcons() {}, showToast: (...args) => toasts.push(args),
    showConfirmation: options => confirmations.push(options),
    initThemeAndPreferences() {},
    setThemeMode: value => w.localStorage.setItem('hamsa_theme_mode', value),
    setThemePalette: value => w.localStorage.setItem('hamsa_theme_palette', value),
    setFontSize: value => w.localStorage.setItem('hamsa_font_size', value),
    setFontFamily: value => w.localStorage.setItem('hamsa_font_family', value)
  };
  w.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/status')) return Response.json({ configured: true });
    if (/\/models(?:\?|$)/.test(String(url))) return Response.json({ models: [
      { name: `models/${DEFAULT}`, supportedGenerationMethods: ['generateContent'] }
    ] });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'PONG' }] } }] });
  };
  w.eval(read('js/ai-client.js'));
  w.eval(read('js/study-preferences.js'));
  w.eval(read('js/gemini-service.js'));
  w.eval(read('js/views/settings.js'));
  try {
    await run({ w, view: w.settingsView, svc: w.geminiService, calls, toasts, confirmations, heroes,
      input: () => w.document.getElementById('gemini-api-key-input'),
      result: () => w.document.getElementById('api-test-result-box') });
    console.log(`  PASS  ${name}`); passed++;
  } catch (error) { console.error(`  FAIL  ${name}: ${error.stack}`); failed++; }
  finally { w.aiClient.abortAll(); dom.window.close(); }
}

(async () => {
  await test('Profile text and key attributes cannot inject markup; absent scores remain readable', async ({ w, view, input }) => {
    const hostile = '<img src=x onerror="window.bad=true">';
    w.examProfileManager = { loadProfile: () => ({ fullName: hostile, domicile: hostile, tenthBoard: hostile,
      tenthPercentage: 80, dateOfBirth: hostile, category: hostile, qualification: hostile }) };
    w.geminiService.setApiKey('fake" autofocus onfocus="window.bad=true');
    await view.render();
    assert.equal(w.document.querySelector('img'), null);
    assert.ok(w.document.getElementById('view-settings').textContent.includes(hostile));
    assert.ok(w.document.getElementById('view-settings').textContent.includes('Not filled'));
    assert.ok(!w.document.getElementById('view-settings').textContent.includes('undefined'));
    assert.equal(input().getAttribute('onfocus'), null);
    assert.equal(input().value, 'fake" autofocus onfocus="window.bad=true');
  });
  await test('Theme count matches controls and privacy explains the real cloud route', async ({ view, heroes, w }) => {
    await view.render();
    assert.equal(heroes.at(-1).stats.find(stat => stat.label === 'Themes').value, w.document.querySelectorAll('.theme-mode-card').length);
    assert.ok(heroes.at(-1).tagline.includes('sent to Google'));
    assert.ok(!w.document.body.textContent.includes('undefined'));
    assert.ok(!w.document.body.textContent.includes('only used if the server proxy becomes unavailable'));
  });
  await test('Unsaved key survives every appearance control without being stored', async ({ view, input, w }) => {
    await view.render(); input().value = 'unsaved-fake-key';
    for (const [method, value] of [['setThemeMode', 'LIGHT'], ['setThemePalette', 'TEAL'], ['setFontSize', 'LARGE'], ['setFontFamily', 'SERIF']]) {
      await view[method](value); assert.equal(input().value, 'unsaved-fake-key');
    }
    assert.equal(w.localStorage.getItem('hamsa_gemini_api_key'), null);
  });
  await test('Typing while a render awaits counts keeps the newest draft; stale renders cannot overwrite it', async ({ view, input, w }) => {
    await view.render(); input().value = 'first';
    const older = deferred(), newer = deferred(); let count = 0;
    w.getDatabaseSummaryCounts = () => (++count === 1 ? older.promise : newer.promise);
    const p1 = view.render(); await Promise.resolve(); await Promise.resolve();
    const p2 = view.render(); await Promise.resolve(); await Promise.resolve();
    input().value = 'typed-last'; newer.resolve({ notesCount: 8 }); await p2;
    older.resolve({ notesCount: 1 }); await p1;
    assert.equal(input().value, 'typed-last');
    assert.ok(w.document.body.textContent.includes('Study Notes: 8'));
  });
  await test('Theme, palette and font controls are native buttons with selection state and stable focus', async ({ view, w }) => {
    await view.render();
    const controls = [...w.document.querySelectorAll('.theme-mode-card,.palette-swatch-card,.select-chip')];
    assert.equal(controls.length, 22);
    assert.ok(controls.every(el => el.tagName === 'BUTTON' && el.hasAttribute('aria-pressed')));
    const theme = controls.find(el => el.getAttribute('onclick').includes("'LIGHT'"));
    theme.focus(); await view.setThemeMode('LIGHT');
    assert.ok(w.document.activeElement.getAttribute('onclick').includes("'LIGHT'"));
    assert.equal(w.document.activeElement.getAttribute('aria-pressed'), 'true');
  });
  await test('Key visibility updates label, icon and state; leaving masks it again', async ({ view, input, w }) => {
    await view.render(); view.togglePasswordVisibility();
    assert.equal(input().type, 'text');
    assert.equal(w.document.getElementById('api-visibility-button').getAttribute('aria-label'), 'Hide API key');
    assert.equal(w.document.getElementById('api-eye-icon').getAttribute('data-lucide'), 'eye-off');
    view.onLeaveView(); await view.render(); assert.equal(input().type, 'password');
  });
  await test('Save failures keep the draft and never report success', async ({ view, svc, input, toasts }) => {
    await view.render(); input().value = 'unsaved'; svc.setApiKey = () => { throw new Error('Storage unavailable'); };
    view.saveApiKey(); assert.equal(input().value, 'unsaved');
    assert.equal(toasts.at(-1)[1], 'error');
  });
  await test('Saving blank removes the existing personal key and reports removal honestly', async ({ view, svc, input, w, toasts }) => {
    svc.setApiKey('old-fake-key'); await view.render(); input().value = ''; view.saveApiKey();
    assert.equal(w.localStorage.getItem('hamsa_gemini_api_key'), null);
    assert.ok(toasts.at(-1)[0].includes('removed'));
  });
  await test('Personal key tests go directly to Google even with an enabled proxy; normal generation still uses proxy', async ({ view, input, calls, w }) => {
    await view.render(); input().value = 'fake-personal'; await view.testApiKey();
    const testCalls = calls.filter(call => !call.url.endsWith('/status'));
    assert.equal(testCalls.length, 2);
    assert.ok(testCalls.every(call => call.url.startsWith('https://generativelanguage.googleapis.com/') && call.url.includes('key=fake-personal')));
    await w.aiClient.fetchGenerateContent(DEFAULT, { contents: [] });
    assert.equal(calls.at(-1).url, `/api/gemini/${DEFAULT}`);
  });
  await test('A cached successful proxy discovery cannot validate a bad personal key', async ({ view, svc, input, w, result }) => {
    await view.render(); await svc.discoverAvailableModels('');
    const original = w.fetch;
    w.fetch = (url, init) => String(url).includes('key=invalid-fake')
      ? Promise.resolve(Response.json({ error: { message: 'API key invalid' } }, { status: 400 })) : original(url, init);
    input().value = 'invalid-fake'; await view.testApiKey();
    assert.ok(result().textContent.includes('invalid'));
    assert.ok(result().querySelector('.badge-error'));
  });
  await test('Blank test input never silently uses an older saved key', async ({ w, svc, calls }) => {
    await w.aiClient.probeServerKey(); calls.length = 0;
    svc.setApiKey('old-fake-key'); w.aiClient._serverKeyConfigured = false;
    const res = await svc.testApiKey(''); assert.equal(res.success, false); assert.equal(calls.length, 0);
  });
  await test('Blank input with server credentials tests the proxy without leaking a saved key', async ({ svc, calls, w }) => {
    svc.setApiKey('old-fake-key'); await w.aiClient.probeServerKey();
    const res = await svc.testApiKey(''); assert.equal(res.success, true); assert.equal(res.transport, 'PROXY');
    assert.ok(calls.every(call => !call.url.includes('old-fake-key')));
  });
  await test('HTTP 200 with empty, blocked, thinking-only, truncated or malformed content is not a verified connection', async ({ w, svc }) => {
    await w.aiClient.probeServerKey();
    svc.discoverAvailableModels = async () => [DEFAULT];
    for (const data of [{}, { promptFeedback: { blockReason: 'SAFETY' } },
      { candidates: [{ content: { parts: [{ text: 'PONG', thought: true }] } }] },
      { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'PONG' }] } }] },
      { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'PONG' }] } }] }]) {
      w.aiClient.fetchGenerateContent = async () => Response.json(data);
      assert.equal((await svc.testApiKey('')).success, false);
    }
    w.aiClient.fetchGenerateContent = async () => new Response('not json', { status: 200 });
    assert.equal((await svc.testApiKey('')).success, false);
  });
  await test('Changing spare personal-key test model does not overwrite the proxy model', async ({ view, svc, input, w }) => {
    await view.render(); svc.setActiveModel(DEFAULT); input().value = 'fake';
    w.aiClient.fetchGenerateContent = async model => model === DEFAULT
      ? Response.json({ error: { message: 'Not available' } }, { status: 404 })
      : Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'PONG' }] } }] });
    svc.discoverAvailableModels = async () => [DEFAULT, 'gemini-3.5-flash'];
    await view.testApiKey(); assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Duplicate clicks start one test; re-render keeps pending state and places result in the current box', async ({ view, svc, w, result }) => {
    await view.render(); const pending = deferred(); let calls = 0;
    svc.testApiKey = () => { calls++; return pending.promise; };
    const work = view.testApiKey(); await view.testApiKey(); assert.equal(calls, 1);
    await view.setFontSize('LARGE'); assert.equal(w.document.getElementById('api-test-button').disabled, true);
    pending.resolve({ success: true, message: 'Verified', model: DEFAULT, transport: 'PROXY' }); await work;
    assert.ok(result().textContent.includes('Verified'));
    assert.equal(w.document.getElementById('api-test-button').disabled, false);
  });
  await test('Late result after key changes is discarded without overwriting the model', async ({ view, svc, w, result, input }) => {
    await view.render(); const pending = deferred(); svc.testApiKey = () => pending.promise;
    const work = view.testApiKey(); input().value = 'changed'; input().dispatchEvent(new w.Event('input'));
    pending.resolve({ success: true, message: 'Old response', model: 'gemini-3.5-flash', transport: 'PROXY' }); await work;
    assert.equal(svc.getActiveModel(), DEFAULT); assert.equal(result().style.display, 'none');
  });
  await test('Leaving Settings cancels its test and ignores a late response', async ({ view, svc, result }) => {
    await view.render(); const pending = deferred(); let signal;
    svc.testApiKey = (_, options) => { signal = options.signal; return pending.promise; };
    const work = view.testApiKey(); view.onLeaveView(); assert.equal(signal.aborted, true);
    pending.resolve({ success: true, message: 'Old response', model: 'gemini-3.5-flash' }); await work;
    assert.equal(result().style.display, 'none'); assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Service cancellation during generation stops retries and leaves selected model untouched', async ({ w, svc }) => {
    await w.aiClient.probeServerKey(); const pending = deferred(); let calls = 0;
    svc.discoverAvailableModels = async () => [DEFAULT, 'gemini-3.5-flash'];
    w.aiClient.fetchGenerateContent = () => { calls++; return pending.promise; };
    const controller = new w.AbortController(); const work = svc.testApiKey('', { signal: controller.signal });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); controller.abort();
    pending.resolve(Response.json({ candidates: [{ content: { parts: [{ text: 'PONG' }] } }] }));
    await assert.rejects(work, error => error.name === 'AbortError');
    assert.ok(calls <= 1); assert.equal(svc.getActiveModel(), DEFAULT);
  });
  await test('Thrown test failures recover controls; API error text cannot inject HTML', async ({ view, svc, result, w }) => {
    await view.render(); svc.testApiKey = async () => { throw new Error('<img src=x onerror="bad()">'); };
    await view.testApiKey(); assert.equal(result().querySelector('img'), null);
    assert.ok(result().textContent.includes('<img')); assert.equal(w.document.getElementById('api-test-button').disabled, false);
  });
  await test('Unsupported or unsaved model changes report errors rather than success', async ({ view, svc, toasts }) => {
    await view.render(); view.onModelSelect('paid-or-unknown'); assert.equal(toasts.at(-1)[1], 'error');
    svc.setActiveModel = () => { throw new Error('Storage full'); };
    view.onModelSelect('gemini-3.5-flash'); assert.equal(toasts.at(-1)[1], 'error');
  });
  await test('Preference storage failures are surfaced', async ({ view, w, toasts }) => {
    await view.render(); w.app.setThemeMode = () => { throw new Error('Storage full'); };
    await view.setThemeMode('LIGHT'); assert.equal(toasts.at(-1)[1], 'error');
  });
  await test('Render errors are escaped and retry remains available', async ({ view, w }) => {
    w.getDatabaseSummaryCounts = () => { throw new Error('<img src=x onerror="bad()">'); };
    await view.render(); assert.equal(w.document.querySelector('img'), null);
    assert.ok(w.document.body.textContent.includes('<img')); assert.ok(w.document.body.textContent.includes('Retry'));
  });
  await test('Displayed daily usage rolls over after midnight without losing session totals', ({ w }) => {
    w.aiClient._usage = { date: '2000-01-01', requests: 4, promptTokens: 5, outputTokens: 6, totalTokens: 11,
      session: { requests: 2, promptTokens: 3, outputTokens: 4, totalTokens: 7 } };
    const usage = w.aiClient.getUsage(); assert.equal(usage.today.requests, 0); assert.equal(usage.session.totalTokens, 7);
  });
  const preview = { totalRecords: 1, tables: { notes: { imported: 1, skipped: 0, label: 'Notes' } }, formatVersion: 3 };
  const event = () => ({ target: { value: 'backup.json', files: [{ name: 'backup.json', text: async () => '{}' }] } });
  await test('Import cancellation clears the file input and allows the same backup again', async ({ view, w, confirmations }) => {
    w.inspectDatabaseBackup = async () => preview; const first = event();
    await view.handleImportFile(first); await confirmations.at(-1).onCancel(); assert.equal(first.target.value, '');
    await view.handleImportFile(event()); assert.equal(confirmations.length, 2); confirmations.at(-1).onCancel();
  });
  await test('Pending restore blocks duplicate imports, export and reset until completion', async ({ view, w, confirmations }) => {
    w.inspectDatabaseBackup = async () => preview; let imports = 0, exports = 0;
    const pending = deferred(); w.importDatabaseBackup = () => { imports++; return pending.promise; };
    w.exportDatabaseBackup = async () => { exports++; return {}; };
    await view.handleImportFile(event()); await view.handleImportFile(event()); view.confirmResetAll(); await view.handleExportBackup();
    assert.equal(confirmations.length, 1); assert.equal(exports, 0);
    const work = confirmations[0].onConfirm(); assert.equal(imports, 1);
    await view.handleImportFile(event()); assert.equal(confirmations.length, 1);
    pending.resolve({ tables: preview.tables, totalImported: 1, mode: 'REPLACE' }); await work;
    await view.handleImportFile(event()); assert.equal(confirmations.length, 2); confirmations.at(-1).onCancel();
  });
  await test('Invalid or failed imports release busy state without reporting success', async ({ view, w, toasts, confirmations }) => {
    w.inspectDatabaseBackup = async () => { throw new Error('Invalid JSON'); };
    const first = event(); await view.handleImportFile(first); assert.equal(first.target.value, '');
    assert.equal(toasts.at(-1)[1], 'error'); assert.equal(confirmations.length, 0);
    w.inspectDatabaseBackup = async () => preview; w.importDatabaseBackup = async () => { throw new Error('Write failed'); };
    await view.handleImportFile(event()); await confirmations.at(-1).onConfirm(); assert.equal(toasts.at(-1)[1], 'error');
    assert.equal(view._importPending, false);
  });
  await test('Profile-only backups remain restorable while entirely empty backups are rejected', async ({ view, w, confirmations }) => {
    w.inspectDatabaseBackup = async () => ({ ...preview, totalRecords: 0, tables: {}, hasProfile: true });
    await view.handleImportFile(event()); assert.equal(confirmations.length, 1); confirmations[0].onCancel();
    w.inspectDatabaseBackup = async () => ({ ...preview, totalRecords: 0, tables: {} });
    await view.handleImportFile(event()); assert.equal(confirmations.length, 1); assert.equal(view._importPending, false);
  });
  await test('Backup export and reset ignore duplicate actions and recover after failure/cancel', async ({ view, w, confirmations, toasts }) => {
    const pending = deferred(); let exports = 0;
    w.exportDatabaseBackup = () => { exports++; return pending.promise; };
    const work = view.handleExportBackup(); await view.handleExportBackup(); view.confirmResetAll();
    assert.equal(exports, 1); assert.equal(confirmations.length, 0); pending.resolve({ notes: 1 }); await work;
    view.confirmResetAll(); view.confirmResetAll(); assert.equal(confirmations.length, 1); confirmations[0].onCancel();
    view.confirmResetAll(); assert.equal(confirmations.length, 2);
    w.clearDatabase = async () => { throw new Error('Reset failed'); };
    await confirmations[1].onConfirm(); assert.equal(toasts.at(-1)[1], 'error'); assert.equal(view._resetPending, false);
  });
  await test('Five native expandable sections retain open state and unsaved preference drafts', async ({ view, w }) => {
    await view.render(); assert.equal(w.document.querySelectorAll('details[data-settings-section]').length,5);
    assert.equal(w.document.querySelectorAll('details[data-settings-section][open]').length,1);
    w.document.querySelector('[data-settings-section=data]').open=true;
    w.document.getElementById('study-pref-exam').value='SSC draft'; w.document.getElementById('study-pref-exam').dispatchEvent(new w.Event('input'));
    await view.setThemeMode('LIGHT');
    assert.equal(w.document.getElementById('study-pref-exam').value,'SSC draft');
    assert.equal(w.document.querySelector('[data-settings-section=data]').open,true);
    assert.equal(w.studyPreferences.get().exam,'');
  });
  await test('Preference normalization rejects invalid options and safely restores malformed storage', ({ w }) => {
    w.localStorage.setItem('hamsa_study_preferences','not-json'); assert.equal(w.studyPreferences.get().language,'AUTO');
    const p=w.studyPreferences.save({language:'UNKNOWN',level:'invalid',voiceRate:100,depth:'invalid',exam:'x'.repeat(200)});
    assert.equal(p.language,'AUTO'); assert.equal(p.voiceRate,.95); assert.equal(p.exam.length,120);
  });
  await test('Saving preferences persists validated defaults; failed storage does not claim success', async ({ view, w, toasts }) => {
    await view.render(); view._studyDraft={...view._studyDraft,language:'HINDI',level:'CLASS_9_10',exam:' CBSE ',depth:'SIMPLE'};
    view.saveStudyPreferences(); assert.equal(w.studyPreferences.get().exam,'CBSE'); assert.equal(w.studyPreferences.get().depth,'SIMPLE');
    w.studyPreferences.save=()=>{throw Error('Storage unavailable');}; view.saveStudyPreferences(); assert.equal(toasts.at(-1)[1],'error');
  });
  await test('Available voices are selected by language; changing voices uses the current device list', async ({ view, w }) => {
    const voices=[{voiceURI:'hi-local',name:'Hindi',lang:'hi-IN',localService:true},{voiceURI:'en-local',name:'English',lang:'en-IN',localService:true}];
    w.speechSynthesis={getVoices:()=>voices}; await view.render();
    view._studyDraft.voiceLanguage='HINDI'; view.updateVoiceOptions();
    const select=w.document.getElementById('study-pref-voiceURI'); assert.ok([...select.options].some(o=>o.value==='hi-local'));
    assert.ok(![...select.options].some(o=>o.value==='en-local'));
    view._studyDraft.voiceURI='voice-from-another-device'; view.updateVoiceOptions(); assert.ok(select.textContent.includes('unavailable'));
  });
  await test('Read-aloud preferences set speed and compatible voice without starting speech automatically', ({ w }) => {
    let spoken=0; w.speechSynthesis={getVoices:()=>[{voiceURI:'hi-local',lang:'hi-IN',localService:true},{voiceURI:'en-local',lang:'en-IN',localService:true}],speak(){spoken++;}};
    w.studyPreferences.save({voiceLanguage:'HINDI',voiceURI:'en-local',voiceRate:1.2});
    const utterance=w.studyPreferences.applySpeech({lang:'en-IN'},'Example');
    assert.equal(utterance.rate,1.2); assert.equal(utterance.lang,'hi-IN'); assert.equal(utterance.voice.voiceURI,'hi-local'); assert.equal(spoken,0);
  });
  await test('Teacher defaults affect new lessons while saved lessons and per-tab choices keep their settings', async ({ w }) => {
    w.eval(read('js/sanitizer.js')); w.eval(read('js/ai-teacher-service.js'));
    w.document.body.insertAdjacentHTML('beforeend','<div id="view-ai-teacher"></div>');
    w.eval(read('js/views/ai-teacher.js'));
    w.studyPreferences.save({language:'HINDI',level:'CLASS_6_8',depth:'SIMPLE',exam:'School exam'});
    await w.aiTeacherView.render(); assert.equal(w.aiTeacherView.selectedLanguage,'HINDI'); assert.equal(w.aiTeacherView.selectedDepth,'SIMPLE');
    const prompt=w.aiTeacherService._buildPrompt({question:'Why do plants grow?',language:w.aiTeacherView.selectedLanguage,depth:w.aiTeacherView.selectedDepth,mode:'STUDENT',studentContext:w.aiTeacherService._resolveStudentContext(w.aiTeacherView.selectedEducationLevel)});
    assert.ok(prompt.includes('plain language and concise')); assert.ok(prompt.includes('Class 6'));
    w.aiTeacherView.selectedLanguage='ENGLISH'; w.studyPreferences.save({language:'HINGLISH',level:'COLLEGE'});
    await w.aiTeacherView.render(); assert.equal(w.aiTeacherView.selectedLanguage,'ENGLISH');
    w.aiTeacherView.currentExplanation={quickAnswer:'Existing'}; w.aiTeacherView.selectedDepth='DETAILED';
    w.studyPreferences.save({depth:'SIMPLE'}); await w.aiTeacherView.render(); assert.equal(w.aiTeacherView.selectedDepth,'DETAILED');
  });
  await test('Notes creator inherits class and exam; saved notes and manual form choices stay intact', async ({ w }) => {
    w.eval(read('js/sanitizer.js')); w.document.body.insertAdjacentHTML('beforeend','<div id="view-study-notes"></div>');
    w.getAllNotes=async()=>[]; w.eval(read('js/views/study-notes.js'));
    w.studyPreferences.save({language:'HINGLISH',level:'CLASS_9_10',exam:'CBSE',depth:'DETAILED'});
    await w.studyNotesView.render(); assert.equal(w.studyNotesView.noteSettings.language,'HINGLISH');
    assert.equal(w.studyNotesView.noteSettings.level,'SCHOOL'); assert.equal(w.studyNotesView.noteSettings.classLevel,'Class 9–10');
    assert.ok(!JSON.stringify(w.studyNotesView.noteSettings).includes('_studyDefaults'));
    w.studyNotesView.noteSettings.language='ENGLISH'; w.studyPreferences.save({language:'HINDI'}); await w.studyNotesView.render();
    assert.equal(w.studyNotesView.noteSettings.language,'ENGLISH');
    const saved={id:1,settings:{language:'ENGLISH'}}; w.studyNotesView.activeNote=saved; await w.studyNotesView.render(); assert.equal(saved.settings.language,'ENGLISH');
  });
  await test('Storage reports estimates and unsupported APIs honestly without breaking Settings', async ({ w, view }) => {
    Object.defineProperty(w.navigator,'storage',{configurable:true,value:{estimate:async()=>({usage:10*1024**2,quota:100*1024**2}),persisted:async()=>true}});
    await view.render(); assert.ok(w.document.body.textContent.includes('10.0 MB')); assert.ok(w.document.body.textContent.includes('Persistent storage granted'));
    w.navigator.storage.estimate=()=>{throw Error('Unavailable');}; w.navigator.storage.persisted=async()=>{throw Error('Denied');};
    await view.render(); assert.ok(w.document.body.textContent.includes('Status unavailable')); assert.ok(w.document.querySelector('[data-settings-section=study]'));
  });
  await test('Persistent storage is requested only by the action; denial and retries are handled honestly', async ({ w, view, toasts }) => {
    let requested=0,granted=false;
    Object.defineProperty(w.navigator,'storage',{configurable:true,value:{persisted:async()=>granted,persist:async()=>{requested++;return granted;}}});
    await view.render(); assert.equal(requested,0); await view.requestPersistentStorage(); assert.equal(toasts.at(-1)[1],'info');
    granted=true; await view.requestPersistentStorage(); assert.ok(w.document.body.textContent.includes('Persistent storage granted'));
  });
  await test('Backup export records its download-request date and displays it on this device', async ({ w, view }) => {
    await view.render(); w.exportDatabaseBackup=async()=>({notes:2}); await view.handleExportBackup();
    const last=JSON.parse(w.localStorage.getItem('hamsa_last_backup')); assert.equal(last.records,2); assert.ok(Date.parse(last.requestedAt));
    assert.ok(w.document.body.textContent.includes(new Date(last.requestedAt).toLocaleString()));
  });
  await test('Oversized backups are rejected before reading or touching data', async ({ view, toasts, confirmations }) => {
    let read=0; const oversized={target:{value:'large.json',files:[{size:101*1024**2,text:async()=>{read++;return '{}';}}]}};
    await view.handleImportFile(oversized); assert.equal(read,0); assert.equal(confirmations.length,0); assert.equal(toasts.at(-1)[1],'error');
  });
  await test('Module reset requires explicit confirmation and recovers from cancel or database failure', async ({ w, view, confirmations, toasts }) => {
    let resets=0; w.clearModuleData=async()=>{resets++;throw Error('Write failed');};
    view.confirmModuleReset('TEACHER'); assert.equal(resets,0); assert.ok(confirmations[0].message.includes('Other libraries'));
    confirmations[0].onCancel(); assert.equal(view._resetPending,false);
    view.confirmModuleReset('TEACHER'); await confirmations[1].onConfirm(); assert.equal(resets,1); assert.equal(toasts.at(-1)[1],'error');
    assert.equal(view._resetPending,false);
  });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
