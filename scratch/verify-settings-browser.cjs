// Optional isolated Edge checks for Settings layout and native keyboard controls.
// Serves local assets with mocked credentials; never accesses personal browser data.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamsa-settings-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, browser, socket, checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };

(async () => {
  const css = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
    .map(match => match[0]).filter(tag => !/https?:/.test(tag)).join('\n');
  const html = `<!doctype html><html data-theme="LIGHT" data-palette="INDIGO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head>
  <body><main class="main-content"><section id="view-settings" class="view-section active"></section></main>
  <script>window.errors=[];addEventListener('error',event=>errors.push(event.message));window.fetch=async()=>new Response(JSON.stringify({configured:true}),{headers:{'Content-Type':'application/json'}});
  window.app={refreshIcons(){window.lucide?.createIcons();},showToast(){},showConfirmation(options){window.confirmation=options;},setThemeMode(value){localStorage.setItem('hamsa_theme_mode',value);document.documentElement.dataset.theme=value;},setThemePalette(value){localStorage.setItem('hamsa_theme_palette',value);document.documentElement.dataset.palette=value;},setFontSize(value){localStorage.setItem('hamsa_font_size',value);document.documentElement.dataset.fontScale=value;},setFontFamily(value){localStorage.setItem('hamsa_font_family',value);document.documentElement.dataset.fontFamily=value;}};</script>
  <script src="/assets/vendor/lucide.min.js"></script>
  <script src="/js/ai-client.js"></script><script src="/js/study-preferences.js"></script><script src="/js/gemini-service.js"></script><script src="/js/sanitizer.js"></script><script src="/js/ui-utils.js"></script><script src="/assets/vendor/dexie.min.js"></script><script src="/js/db.js"></script><script src="/js/views/settings.js"></script>
  <script>settingsView.render().then(()=>window.ready=true);</script></body></html>`;
  server = http.createServer((req, res) => {
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    try {
      res.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
      res.end(fs.readFileSync(filename));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(3302, '127.0.0.1', resolve));
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-sync',
    '--remote-debugging-port=9255', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + path.join(dir, 'profile')
  ], { windowsHide: true, stdio: 'ignore' });
  let version;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch('http://127.0.0.1:9255/json/version')).json(); break; } catch { await sleep(100); }
  }
  if (!version) throw Error('Isolated Edge failed to start.');
  socket = new WebSocket(version.webSocketDebuggerUrl); await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0; const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data); if (!message.id) return;
    const task = pending.get(message.id); pending.delete(message.id);
    if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const current = ++id; pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await send('Page.enable', {}, sessionId);
  for (const [label, width, theme] of [['desktop', 1440, 'LIGHT'], ['mobile', 390, 'LIGHT'], ['mobile-dark', 390, 'DARK'], ['small-mobile', 320, 'LIGHT']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1050, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:3302/fixture' }, sessionId);
    await sleep(200);
    await evaluate("new Promise((resolve,reject)=>{let n=0;const ready=()=>window.ready?resolve():++n>50?reject(Error('Settings failed')):setTimeout(ready,100);ready();})");
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};new Promise(resolve=>setTimeout(resolve,600))`);
    const layout = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,errors,buttons:document.querySelectorAll('.theme-mode-card').length})");
    if (layout.scroll > width) console.log('OVERFLOW ' + JSON.stringify(await evaluate("[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width}))")));
    check(layout.scroll <= width, label + ' Settings fits viewport');
    check(layout.errors.length === 0 && layout.buttons === 8, label + ' Settings renders without errors');
    check(await evaluate("document.querySelectorAll('details[data-settings-section]').length===5 && document.querySelectorAll('details[data-settings-section][open]').length===1"), label + ' compact expandable sections');
    await evaluate("document.querySelector('details[data-settings-section=appearance]').open=true;document.querySelector('.theme-mode-card[onclick*=\"LIGHT\"]').focus();document.getElementById('gemini-api-key-input').value='unsaved-fake-key';true");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await sleep(200);
    check(await evaluate("localStorage.getItem('hamsa_theme_mode')==='LIGHT' && document.activeElement.getAttribute('aria-pressed')==='true'"), label + ' Enter activates theme and keeps focus');
    check(await evaluate("document.getElementById('gemini-api-key-input').value==='unsaved-fake-key' && !localStorage.getItem('hamsa_gemini_api_key')"), label + ' theme retains unsaved key');
    check(await evaluate("document.querySelector('.settings-live-preview').getBoundingClientRect().height>0 && document.documentElement.scrollWidth<=innerWidth"), label + ' preview and appearance fit viewport');
    const originalSize=await evaluate("parseFloat(getComputedStyle(document.querySelector('.settings-live-preview p')).fontSize)");
    await evaluate("settingsView.setFontSize('LARGE')");
    check(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.settings-live-preview p')).fontSize)>${originalSize}`),label+' live preview responds to font size');
    await evaluate("settingsView.setFontFamily('SERIF')");
    check(await evaluate("getComputedStyle(document.querySelector('.settings-live-preview p')).fontFamily.includes('Georgia')"),label+' live preview responds to font family');
    await evaluate("settingsView.setFontSize('DEFAULT');settingsView.setFontFamily('DEFAULT')");
    await evaluate("document.querySelectorAll('details[data-settings-section]').forEach(section=>section.open=section.dataset.settingsSection==='study');document.querySelector('details[data-settings-section=study]').scrollIntoView({block:'start',behavior:'instant'});true");
    check(await evaluate("document.getElementById('study-pref-exam').getBoundingClientRect().width>0 && document.documentElement.scrollWidth<=innerWidth"), label + ' study preference fields fit viewport');
    await evaluate("settingsView._studyDraft.language='HINDI';settingsView._studyDraft.exam='CBSE Class 10';settingsView.saveStudyPreferences();true");
    check(await evaluate("studyPreferences.get().language==='HINDI' && studyPreferences.get().exam==='CBSE Class 10'"), label + ' study preferences save');
    await evaluate("document.querySelector('[data-settings-section=data]').open=true;document.querySelector('[data-settings-section=data]').scrollIntoView({block:'start',behavior:'instant'});true");
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll('.settings-module-resets button').length===6"),label+' storage and module reset controls fit viewport');
    await evaluate("(async()=>{await db.notes.put({id:1,title:'Note to reset'});await db.quizzes.put({id:1,title:'Quiz to keep'});await db.cardReviews.bulkPut([{id:1,cardKey:'note_1:energy'},{id:2,cardKey:'q:1'}]);settingsView.confirmModuleReset('NOTES');})()");
    check(await evaluate("db.notes.count().then(count=>count===1 && confirmation.title.includes('Study Notes'))"),label+' module reset waits for confirmation');
    await evaluate("confirmation.onConfirm()");
    check(await evaluate("Promise.all([db.notes.count(),db.quizzes.count(),db.cardReviews.toArray()]).then(([notes,quizzes,reviews])=>notes===0&&quizzes===1&&reviews.length===1&&reviews[0].cardKey==='q:1')"),label+' actual IndexedDB reset removes only notes and related reviews');
    await evaluate("document.querySelector('[data-settings-section=data]').open=false;document.querySelector('[data-settings-section=study]').scrollIntoView({block:'start',behavior:'instant'});true");
    await sleep(600); // Let the existing card entrance animation finish before capturing.
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    fs.writeFileSync(path.join(dir, label + '.png'), Buffer.from(screenshot.data, 'base64'));
  }
  console.log(`RESULT: ${checks} passed, 0 failed\nArtifacts: ${dir}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); if (browser && !browser.killed) browser.kill();
  if (server) await new Promise(resolve => server.close(resolve));
});
