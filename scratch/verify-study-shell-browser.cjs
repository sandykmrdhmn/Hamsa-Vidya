// Optional production-shell smoke test in a disposable Edge profile.
// Uses real scripts and IndexedDB, fixture API responses and no provider calls.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamsa-study-shell-browser-'));
const origin = 'http://127.0.0.1:3306';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const missingAssets = [], apiRequests = [], layoutFailures = [];
let server, browser, socket, checks = 0, send;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
const bootstrap = `(() => {
  window.__shellErrors = [];
  window.__externalRequests = [];
  const originalError = console.error.bind(console);
  console.error = (...args) => { __shellErrors.push(args.map(value => String(value?.stack || value)).join(' ')); originalError(...args); };
  addEventListener('error', event => { if (event.message) __shellErrors.push(event.message); });
  addEventListener('unhandledrejection', event => __shellErrors.push(String(event.reason?.stack || event.reason)));
  localStorage.setItem('hamsa_auth_mode', 'GUEST');
  localStorage.setItem('hamsa_sound_enabled', 'false');
  localStorage.setItem('hamsa_exam_profile', JSON.stringify({fullName:'Shell Test Student',dateOfBirth:'2001-03-12',category:'GENERAL',qualificationId:'GRADUATION',domicile:'Delhi',gender:'MALE',score:75,tenthPercentage:80,twelfthPercentage:80,education:[{level:'GRADUATION',score:75,scoreType:'PERCENTAGE'}]}));
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin) {
      __externalRequests.push(url.origin + url.pathname);
      return Promise.resolve(new Response(JSON.stringify({error:'External requests disabled in shell fixture'}), {status:503,headers:{'Content-Type':'application/json'}}));
    }
    return originalFetch(input, options);
  };
  // This test owns a fresh profile; leave service-worker behavior to its suite.
  if (navigator.serviceWorker) navigator.serviceWorker.register = async () => ({addEventListener(){},installing:null});
})()`;

(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    if (pathname.startsWith('/api/')) {
      apiRequests.push({method:req.method,path:pathname});
      res.setHeader('Content-Type', 'application/json');
      if (pathname === '/api/live-exams') return res.end(JSON.stringify({success:true,exams:[],source:'ISOLATED_FIXTURE',timestamp:new Date().toISOString()}));
      if (pathname === '/api/gemini/status') return res.end(JSON.stringify({configured:false,models:['gemini-2.5-flash'],defaultModel:'gemini-2.5-flash'}));
      res.statusCode = 503;
      return res.end(JSON.stringify({error:'Generation is disabled in the shell fixture'}));
    }
    const publicPath = pathname === '/' ? '/index.html' : pathname;
    if (!/^\/(?:index\.html|manifest\.webmanifest|sw\.js|(?:assets|js|css)\/)/.test(publicPath)) { res.statusCode=404; return res.end(); }
    const filename = path.resolve(root, '.' + publicPath);
    if (!filename.startsWith(root + path.sep)) { res.statusCode=403; return res.end(); }
    try {
      const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
      res.setHeader('Content-Type', (mime[path.extname(filename)] || 'application/octet-stream'));
      res.end(fs.readFileSync(filename));
    } catch { missingAssets.push(publicPath); res.statusCode=404; res.end(); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(3306,'127.0.0.1',resolve); });
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new','--no-first-run','--disable-extensions','--disable-sync','--disable-background-networking',
    '--remote-debugging-port=9260','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(directory,'profile')
  ], {windowsHide:true,stdio:'ignore'});
  let version;
  for (let attempt=0;attempt<80;attempt++) {
    try { version=await (await fetch('http://127.0.0.1:9260/json/version')).json(); break; } catch { await sleep(100); }
  }
  if (!version) throw Error('Isolated Edge failed to start.');
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
  let id=0; const pending=new Map();
  socket.onmessage=event => {
    const message=JSON.parse(event.data); if (!message.id) return;
    const task=pending.get(message.id); if (!task) return;
    clearTimeout(task.timer); pending.delete(message.id);
    if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result);
  };
  send=(method,params={},sessionId) => new Promise((resolve,reject) => {
    const current=++id;
    const timer=setTimeout(() => { pending.delete(current); reject(Error('CDP timeout: '+method)); },15000);
    pending.set(current,{resolve,reject,timer});
    socket.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression => {
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable',{},sessionId);
  await send('Network.enable',{},sessionId);
  await send('Network.setBlockedURLs',{urls:['https://*']},sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:origin+'/'},sessionId);
  await evaluate(`new Promise((resolve,reject) => {let tries=0; const ready=()=>window.app && document.querySelector('#view-dashboard .dash-masthead') ? resolve(true) : ++tries>100 ? reject(Error('Production dashboard failed to load: '+JSON.stringify(window.__shellErrors))) : setTimeout(ready,100); ready();})`);
  await sleep(300);
  check(await evaluate('window.__shellErrors.length===0'),'production shell boots without script exceptions');
  check(missingAssets.length===0,'all production shell assets load');
  check(await evaluate(`['createQuizView','quizEngine','quizQuality','quizPlayerView','quizResultView','quizHistoryView','HamsaCharts'].every(key=>typeof window[key]==='undefined') && !document.querySelector('#view-create-quiz,#view-quiz-player,#view-quiz-result') && typeof window.quizView?.render==='function'`),'fresh QUIZ view replaces the retired quiz implementation');
  check(await evaluate(`document.querySelectorAll('.primary-module-btn').length===9 && document.querySelectorAll('.mobile-nav-item').length===9 && [...document.querySelectorAll('.primary-module-btn')].findIndex(button=>button.dataset.module==='quiz')===[...document.querySelectorAll('.primary-module-btn')].findIndex(button=>button.dataset.module==='dashboard')+1`),'top and mobile navigation expose QUIZ beside Dashboard');
  check(await evaluate(`(async()=>{await db.open();await db.notes.put({id:1,title:'Shell note',subject:'Science',content:'Saved material',description:'A saved note',createdAt:new Date().toISOString(),sections:[{heading:'Energy',content:'Energy is conserved.'}],flashcards:[{front:'Energy?',back:'The capacity to do work.'}]});await db.customDecks.put({id:1,title:'Shell deck',subject:'Science',createdAt:new Date().toISOString()});await db.customCards.put({id:1,deckId:1,front:'Energy?',back:'The capacity to do work.'});return await db.notes.count()===1;})()`),'real isolated IndexedDB saves a note and custom deck');
  await evaluate(`(() => {for(const name of ['dashboardView','quizView','aiTeacherView','studyNotesView','flashcardsView','answerWritingView','libraryView','toolsView','examAlertsView','settingsView']) {const view=window[name]; if(!view || typeof view.render!=='function') throw Error('Missing view '+name); const render=view.render; view.render=function(...args){const result=render.apply(this,args); window.__lastRender=Promise.resolve(result);return result;};} return true;})()`);
  const routes=['dashboard','quiz','ai-teacher','study-notes','flashcards','answer-writing','exam-alerts','tools','settings'];
  const visit=async (route,selector,label,width) => {
    await evaluate(`(() => {window.__lastRender=null; const button=document.querySelector(${JSON.stringify(selector)});if(!button)throw Error('Missing navigation button');button.click();return true;})()`);
    await evaluate('window.__lastRender');
    await sleep(500); // Let entrance transforms release fixed overlays before measuring.
    const state=await evaluate(`({view:app.currentView,active:document.querySelector('.view-section.active')?.id,text:document.querySelector('.view-section.active')?.innerText.trim().length,width:innerWidth,scroll:document.documentElement.scrollWidth,errors:window.__shellErrors})`);
    check(state.view===route && state.active==='view-'+route && state.text>40,label+' navigates and renders '+route);
    if (state.errors.length) throw Error(label+' script errors: '+JSON.stringify(state.errors));
    if (state.scroll>width) {
      layoutFailures.push(label+' '+route+' document width '+state.scroll+' exceeds '+width);
      console.log('OVERFLOW '+JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('.view-section.active *')).filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0 && rect.right>innerWidth+1;}).slice(0,12).map(element=>({tag:element.tagName,class:element.className,width:Math.round(element.getBoundingClientRect().width),right:Math.round(element.getBoundingClientRect().right)}))`)));
      console.log('CONTAINERS '+JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('.view-section.active > *, .ea-govt-filter-bar, .ea-govt-toggle-group, .ea-filter-pills')).map(element=>{const css=getComputedStyle(element),rect=element.getBoundingClientRect();return {class:element.className,width:rect.width,overflow:css.overflowX,display:css.display,wrap:css.flexWrap,minWidth:css.minWidth};})`)));
    } else {
      check(true,label+' '+route+' fits viewport');
    }
  };
  for (const width of [1440,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    for (const route of routes) await visit(route,`.primary-module-btn[data-module="${route}"]`,width+'px top nav',width);
    await evaluate("app.navigate('library');window.__lastRender");
    await sleep(180);
    check(await evaluate("app.currentView==='library' && document.querySelector('#view-library.active').innerText.includes('Shell note') && document.documentElement.scrollWidth<=innerWidth"),width+'px saved notes Library renders');
    if (width===390) for (const route of routes) await visit(route,`.mobile-nav-item[data-view="${route}"]`,'390px mobile nav',width);
  }
  await evaluate("app.navigate('library');window.__lastRender");
  await evaluate("location.hash='#create-quiz';true");
  await sleep(350);
  await evaluate('window.__lastRender');
  check(await evaluate("app.currentView==='dashboard' && document.querySelector('#view-dashboard.active') && __shellErrors.length===0"),'old create-quiz hash safely opens Dashboard');
  check(!apiRequests.some(request=>request.method!=='GET' || /generateContent|:generate|\/models\//.test(request.path)),'navigation sends no AI generation requests');
  check(await evaluate('window.__externalRequests.length===0'),'navigation sends no external API requests');
  check(missingAssets.length===0,'all navigated views retain valid local assets');
  assert.equal(layoutFailures.length,0,'Responsive layout failures: '+layoutFailures.join('; '));
  console.log(`RESULT: ${checks} passed, 0 failed\nIsolated profile: ${directory}`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  try { if (send && socket?.readyState===WebSocket.OPEN) await send('Browser.close'); } catch {}
  socket?.close();
  if (browser && !browser.killed) browser.kill();
  if (server) await new Promise(resolve=>server.close(resolve));
  for (let attempt=0;attempt<20;attempt++) {
    try { fs.rmSync(directory,{recursive:true,force:true}); break; }
    catch { await sleep(100); }
  }
});
