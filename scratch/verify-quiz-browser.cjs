// Optional native Edge regression test: real PDF.js, UI, IndexedDB and mocked Gemini only.
// The disposable browser profile and PDF fixture are removed after every run.
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const {spawn}=require('child_process'),assert=require('assert/strict'),{PDFDocument,StandardFonts}=require('pdf-lib');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'hamsa-fresh-quiz-browser-'));
const screenshotDirectory=process.env.HAMSA_QUIZ_REVIEW_SHOTS==='1'?fs.mkdtempSync(path.join(os.tmpdir(),'hamsa-quiz-review-')):null;
const origin='http://127.0.0.1:3310',sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server,browser,socket,send,checks=0,mode='success',requestedCount=10;
const calls=[],missingAssets=[];
const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label);};
const bootstrap=`(() => {
  window.__quizBoot=Math.random().toString(36);
  window.__quizErrors=[];window.__quizExternal=[];
  addEventListener('error',event=>{if(event.message)__quizErrors.push(event.message);});
  addEventListener('unhandledrejection',event=>__quizErrors.push(String(event.reason?.stack||event.reason)));
  localStorage.setItem('hamsa_auth_mode','GUEST');localStorage.setItem('hamsa_sound_enabled','false');
  localStorage.setItem('hamsa_exam_profile',JSON.stringify({fullName:'Quiz Test Student',dateOfBirth:'2001-03-12',category:'GENERAL',qualificationId:'GRADUATION',domicile:'Delhi',gender:'MALE',score:75,tenthPercentage:80,twelfthPercentage:80,education:[{level:'GRADUATION',score:75,scoreType:'PERCENTAGE'}]}));
  const originalFetch=fetch.bind(window);
  window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin){__quizExternal.push(url.origin+url.pathname);return Promise.resolve(new Response('{}',{status:503}));}return originalFetch(input,options);};
  if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>({addEventListener(){},installing:null});
})()`;
const quizResponse=count=>({title:'Energy practice <img src=x onerror="window.injected=true">',questions:Array.from({length:count},(_,index)=>({id:'q'+(index+1),question:`Which statement correctly describes energy example ${index+1}?`,options:[`Correct energy fact ${index+1}`,`Incorrect force claim ${index+1}`,`Other mass idea ${index+1}`,`Incorrect speed example ${index+1}`],answerIndex:0,explanation:`The selected energy material supports correct energy fact ${index+1} because energy is conserved.`,optionExplanations:['Energy is conserved.','Force is not energy.','Mass is a different quantity.','Speed alone is not energy.'],difficulty:'MEDIUM',topic:'Energy',sourcePage:2}))});

(async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let number=1;number<=4;number++){
    const page=pdf.addPage([600,800]);
    const sentinel=`PAGE_${number}_SENTINEL`;
    page.drawText(sentinel,{x:30,y:760,size:16,font});
    const lines=number===2||number===3?['Energy is the capacity to do work. Work is force multiplied by displacement.','Kinetic energy equals half mass times speed squared. Potential energy depends on height.','Power is work per unit time. Energy cannot be created or destroyed.','Mechanical energy consists of kinetic energy and potential energy.','A battery stores chemical energy. A moving object has kinetic energy.','A spring stores elastic energy. Friction transfers mechanical energy as heat.']:['This page is outside the selected range and must never enter the AI payload.'];
    for(let i=0;i<24;i++)page.drawText(lines[i%lines.length],{x:30,y:720-i*24,size:11,font});
  }
  const pdfPath=path.join(directory,'Energy-study.pdf');fs.writeFileSync(pdfPath,await pdf.save());
  const invalidPath=path.join(directory,'Broken.pdf');fs.writeFileSync(invalidPath,'this is not a PDF document');
  server=http.createServer(async(req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,origin).pathname);
    if(pathname.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');
      if(pathname==='/api/live-exams')return res.end(JSON.stringify({success:true,exams:[],source:'ISOLATED_FIXTURE',timestamp:new Date().toISOString()}));
      if(pathname==='/api/gemini/status')return res.end(JSON.stringify({configured:true,models:['gemini-2.5-flash'],defaultModel:'gemini-2.5-flash'}));
      if(req.method==='POST'&&/^\/api\/gemini\/gemini-/.test(pathname)){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=JSON.parse(Buffer.concat(chunks).toString());calls.push({body,mode,path:pathname});
        const selectedMode=mode;
        if(selectedMode==='delayed')await sleep(1800);
        if(selectedMode==='overloaded'){res.statusCode=503;return res.end(JSON.stringify({error:{code:503,status:'UNAVAILABLE',message:'Fixture Gemini temporarily overloaded.'}}));}
        if(selectedMode==='quota'){res.statusCode=429;return res.end(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Fixture quota exhausted.'}}));}
        if(selectedMode==='auth'){res.statusCode=401;return res.end(JSON.stringify({error:{code:401,status:'UNAUTHENTICATED',message:'Fixture API key rejected.'}}));}
        if(selectedMode==='quota-second'&&calls.filter(call=>call.mode==='quota-second').length===2){res.statusCode=429;return res.end(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Fixture quota after completed batch.'}}));}
        const batchCount=Number(body.contents[0].parts[0].text.match(/Create exactly (\d+)/)?.[1] || requestedCount);
        const prompt=body.contents[0].parts[0].text,difficulty=prompt.match(/Difficulty: (\w+)/)?.[1] || 'MEDIUM',bilingual=/bilingually:/.test(prompt);
        const value=quizResponse(batchCount),offset=calls.length*20,both=field=>bilingual?`${field}\nऊर्जा का हिंदी अनुवाद`:field;
        value.questions=value.questions.map((question,index)=>({...question,question:both(`Which statement correctly describes energy example ${offset+index+1}?`),options:question.options.map(both),explanation:both(question.explanation),optionExplanations:question.optionExplanations.map(both),difficulty:difficulty==='MIXED'?['EASY','MEDIUM','HARD'][index%3]:difficulty}));
        if(selectedMode==='short')value.questions.pop();
        if(selectedMode==='malformed')value.questions[0].answerIndex=7;
        return res.end(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:200,candidatesTokenCount:600,totalTokenCount:800}}));
      }
      res.statusCode=503;return res.end(JSON.stringify({error:'Non-quiz generation is disabled in this fixture.'}));
    }
    const publicPath=pathname==='/'?'/index.html':pathname;
    if(!/^\/(?:index\.html|manifest\.webmanifest|sw\.js|(?:assets|js|css)\/)/.test(publicPath)){res.statusCode=404;return res.end();}
    const filename=path.resolve(root,'.'+publicPath);
    if(!filename.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
    try{const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');res.end(fs.readFileSync(filename));}
    catch{missingAssets.push(publicPath);res.statusCode=404;res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3310,'127.0.0.1',resolve);});
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-sync','--disable-background-networking','--remote-debugging-port=9264','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(directory,'profile')],{windowsHide:true,stdio:'ignore'});
  let version;for(let attempt=0;attempt<80;attempt++){try{version=await(await fetch('http://127.0.0.1:9264/json/version')).json();break;}catch{await sleep(100);}}
  if(!version)throw Error('Isolated Edge did not start.');
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true},message.sessionId).catch(()=>{});return;}const task=pending.get(message.id);if(!task)return;clearTimeout(task.timer);pending.delete(message.id);if(message.error)task.reject(Error(message.error.message));else task.resolve(message.result);};
  send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const current=++id,timer=setTimeout(()=>{pending.delete(current);reject(Error('CDP timeout: '+method));},25000);pending.set(current,{resolve,reject,timer});socket.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));});
  const{targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const wait=condition=>evaluate(`new Promise((resolve,reject)=>{let n=0;const ready=()=>(${condition})?resolve(true):++n>150?reject(Error('Timed out waiting for: '+${JSON.stringify(condition)}+'; errors='+JSON.stringify(__quizErrors)+'; quiz='+JSON.stringify({busy:window.quizView?.isBusy(),notice:window.quizView?.notice,progress:window.quizView?.progress,draft:window.quizService?.getDraft()&&{next:quizService.getDraft().next,count:quizService.getDraft().questions.length}}))):setTimeout(ready,60);ready();})`);
  const reload=async()=>{const previous=await evaluate('window.__quizBoot');await send('Page.reload',{},sessionId);await wait(`window.__quizBoot!==${JSON.stringify(previous)} && window.app && window.quizView`);};
  const hitPoint=selector=>evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control '+${JSON.stringify(selector)});element.scrollIntoView({behavior:'instant',block:'center'});const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);if(!rect.width||!rect.height||x<0||x>innerWidth||y<0||y>innerHeight||!hit||!(element===hit||element.contains(hit)))throw Error('Control is blocked or invisible: '+${JSON.stringify(selector)}+'; hit='+(hit?.id||hit?.className));return{x,y};})()`);
  const click=async selector=>{const{x,y}=await hitPoint(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},sessionId);};
  const upload=async filename=>{await hitPoint('label[for=quiz-file]');const{root:documentRoot}=await send('DOM.getDocument',{},sessionId),{nodeId}=await send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'#quiz-file'},sessionId);assert.ok(nodeId,'PDF upload exists');await send('DOM.setFileInputFiles',{nodeId,files:[filename]},sessionId);};
  const fill=async(difficulty='MEDIUM',language='ENGLISH',count=10)=>{requestedCount=count;await evaluate(`(()=>{for(const[id,value]of [['quiz-from-page','2'],['quiz-to-page','3'],['quiz-count',${JSON.stringify(String(count))}],['quiz-difficulty',${JSON.stringify(difficulty)}],['quiz-language',${JSON.stringify(language)}]]){const element=document.getElementById(id);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`);};
  const resetFixtureQuota=()=>evaluate(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('hamsa_ai_pacing_'))localStorage.removeItem(key);aiClient._quotaMemory.clear();aiClient.SHARED_REQUESTS_PER_MINUTE=1000;aiClient.SHARED_INPUT_TOKENS_PER_MINUTE=1000000;aiClient.SHARED_REQUEST_INTERVAL_MS=0;return true;})()`);
  const prepare=async()=>{await evaluate("app.navigate('quiz');if(quizService.getDraft())quizService.discardDraft();quizView.form.sourceType='PDF';quizView.paint();true");await click('[data-action=create]');await wait("document.querySelector('#quiz-file')");await upload(pdfPath);await wait("document.querySelector('#quiz-generate') && !document.querySelector('#quiz-generate').disabled");await fill();};
  await send('Page.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Network.setBlockedURLs',{urls:['https://*']},sessionId);await send('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await send('Page.navigate',{url:origin+'/#quiz'},sessionId);
  await wait("window.app && window.quizView && document.querySelector('#quiz-file')");
  check(await evaluate("examProfileManager.isProfileComplete() && getComputedStyle(document.querySelector('#mandatory-onboarding-modal')).display==='none' && !document.body.classList.contains('onboarding-locked')"),'complete isolated student profile leaves the actual QUIZ controls unobstructed');
  // The mock provider has no actual quota. Do not spend native tests waiting for artificial fixture pacing.
  await evaluate("aiClient.SHARED_REQUESTS_PER_MINUTE=1000;aiClient.SHARED_INPUT_TOKENS_PER_MINUTE=1000000;aiClient.SHARED_REQUEST_INTERVAL_MS=0;true");
  check(await evaluate("app.currentView==='quiz' && [...document.querySelectorAll('.primary-module-btn')].findIndex(button=>button.dataset.module==='quiz')===[...document.querySelectorAll('.primary-module-btn')].findIndex(button=>button.dataset.module==='dashboard')+1"),'QUIZ deep link opens the fresh tab next to Dashboard');
  await prepare();check(calls.length===0,'native PDF upload reads metadata without an AI generation request');
  check(await evaluate("document.querySelector('#quiz-from-page').value==='2' && document.querySelector('#quiz-to-page').value==='3' && document.querySelector('#quiz-count').value==='10'"),'selected PDF pages and question count are editable');
  mode='delayed';let before=calls.length;await click('#quiz-generate');await wait("document.querySelector('#quiz-processing') && document.querySelector('[data-action=cancel]')");
  for(let attempt=0;attempt<100&&calls.length===before;attempt++)await sleep(30);
  check(calls.length===before+1,'processing reaches the single mocked Gemini request before cancellation');
  check(await evaluate("document.querySelector('#quiz-processing').getBoundingClientRect().width>0 && /creating|generating|reading|processing/i.test(document.querySelector('#quiz-processing').innerText)"),'generation shows a visible processing box');
  await sleep(550);
  const processingPosition=await evaluate("(()=>{const panel=document.querySelector('#quiz-processing').getBoundingClientRect(),progress=document.querySelector('#quiz-progress').getBoundingClientRect();return {panelTop:panel.top,panelBottom:panel.bottom,progressTop:progress.top,progressBottom:progress.bottom,height:innerHeight};})()");
  check(processingPosition.progressTop>=0 && processingPosition.progressBottom<=processingPosition.height,'processing progress is automatically visible in the viewport '+JSON.stringify(processingPosition));
  await click('[data-action=cancel]');await sleep(2100);
  check(await evaluate("db.pdfQuizzes.count().then(count=>count===0)"),'cancelled generation cannot save a late response');
  check(calls.length===before+1,'cancel does not start a replacement AI request');
  mode='success';await prepare();before=calls.length;await click('#quiz-generate');await wait("document.querySelector('[data-action=answer]')");
  check(calls.length===before+1,'a selected-page quiz is generated with exactly one AI request');
  const payload=calls.at(-1).body,prompt=JSON.stringify(payload);
  check(/PAGE_2_SENTINEL/.test(prompt)&&/PAGE_3_SENTINEL/.test(prompt)&&!/PAGE_[14]_SENTINEL/.test(prompt),'real PDF extraction sends only pages two and three');
  check(payload.generationConfig.responseMimeType==='application/json'&&Boolean(payload.generationConfig.responseSchema),'native request asks for structured quiz JSON');
  check(await evaluate("db.pdfQuizzes.toArray().then(rows=>rows.length===1 && rows[0].questions.length===10 && rows[0].difficulty==='MEDIUM')"),'completed quiz is saved in real IndexedDB');
  check(await evaluate("!document.querySelector('#view-quiz img[src=x]') && !window.injected && document.querySelector('#view-quiz').innerText.includes('<img')"),'provider text renders safely without HTML injection');
  await evaluate("document.querySelector('[data-action=answer][data-index=\"0\"]').focus();true");
  await hitPoint('[data-action=answer][data-index="0"]');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  check(await evaluate("document.querySelector('[data-action=answer][data-index=\"0\"]').getAttribute('aria-pressed')==='true' && quizView.answers[0]===0"),'native keyboard Enter selects and saves a quiz answer');
  await click('[data-action=next]');
  await reload();await wait("window.quizView && document.querySelector('#quiz-question-heading')");await evaluate("aiClient.SHARED_REQUESTS_PER_MINUTE=1000;aiClient.SHARED_INPUT_TOKENS_PER_MINUTE=1000000;true");
  const firstId=await evaluate('db.pdfQuizzes.toArray().then(rows=>rows[0].id)');
  await evaluate(`quizView.openQuiz(${firstId})`);await wait("document.querySelector('[data-action=answer]')");
  check(await evaluate("document.querySelector('#view-quiz').innerText.match(/2\\s*(?:of|\\/)\\s*10/i)"),'unfinished quiz resumes at the saved question after reload');
  for(let index=1;index<10;index++){await click('[data-action=answer][data-index="0"]');if(index<9)await click('[data-action=next]');}
  await click('[data-action=submit]');await sleep(100);
  if(await evaluate("document.querySelector('#confirmation-modal.active')!==null"))await click('#modal-confirm-btn');
  await wait("document.querySelector('[data-action=retake]')");
  check(await evaluate(`quizStore.listAttempts(${firstId}).then(rows=>rows.length===1 && rows[0].correct===10 && rows[0].percentage===100)`),'finishing scores and saves one complete attempt');
  check(await evaluate("/100\\s*%/.test(document.querySelector('#view-quiz').innerText) && /conserved/.test(document.querySelector('#view-quiz').innerText)"),'results show score and grounded explanations');
  await click('[data-action=retake]');await wait("document.querySelector('[data-action=answer]')");
  check(await evaluate("document.querySelectorAll('[data-action=answer][aria-pressed=true]').length===0"),'retake resets previous selections');
  check(calls.length===before+1,'quiz play, reload, results and retake need no additional AI calls');
  for(const[difficulty,language]of [['EASY','HINDI'],['HARD','AUTO']]){
    await prepare();await fill(difficulty,language,5);before=calls.length;await click('#quiz-generate');await wait("document.querySelector('[data-action=answer]')");
    check(calls.length===before+1&&new RegExp(difficulty,'i').test(JSON.stringify(calls.at(-1).body)),difficulty+' quiz uses the chosen difficulty in one request');
    check(await evaluate(`db.pdfQuizzes.toArray().then(rows=>rows.some(row=>row.difficulty===${JSON.stringify(difficulty)} && row.language===${JSON.stringify(language)} && row.questions.length===5))`),difficulty+' question count and language persist');
  }
  for(const failure of ['overloaded','quota','auth','short','malformed']){
    mode=failure;await resetFixtureQuota();await prepare();before=calls.length;const savedBefore=await evaluate('db.pdfQuizzes.count()');await click('#quiz-generate');
    await wait("document.querySelector('#view-quiz [role=alert]') && !quizView.isBusy()");
    check(await evaluate('db.pdfQuizzes.count()')===savedBefore,failure+' does not save an invalid quiz');
    check(calls.length===before+1,failure+' is reported without hidden AI retry calls');
  }
  mode='success';await prepare();before=calls.length;await evaluate("document.querySelector('#quiz-from-page').value='3';document.querySelector('#quiz-to-page').value='2';document.querySelector('#quiz-from-page').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#quiz-to-page').dispatchEvent(new Event('change',{bubbles:true}));true");await click('#quiz-generate');await sleep(150);
  check(calls.length===before,'reversed page range is rejected without a provider request');
  await upload(invalidPath);await wait("document.querySelector('#view-quiz [role=alert]')");check(calls.length===before,'broken PDF shows an error before contacting Gemini');

  mode='success';await resetFixtureQuota();await prepare();before=calls.length;
  await evaluate("window.__realQuizSave=quizStore.save;quizStore.save=async()=>{throw Error('Injected full browser storage');};true");
  const savedBeforeFailure=await evaluate('db.pdfQuizzes.count()');await click('#quiz-generate');await wait("document.querySelector('[data-action=retry-save]') && !document.querySelector('[data-action=retry-save]').disabled");
  check(await evaluate('db.pdfQuizzes.count()')===savedBeforeFailure,'storage failure keeps the generated quiz available without claiming it was saved');
  await evaluate('quizStore.save=window.__realQuizSave;true');await click('[data-action=retry-save]');await wait("document.querySelector('[data-action=answer]')");
  check(calls.length===before+1 && await evaluate('db.pdfQuizzes.count()')===savedBeforeFailure+1,'retrying quiz storage saves the same quiz without a second AI request');
  const retryQuizId=await evaluate('quizView.currentQuiz.id');
  await click('[data-action=answer][data-index="0"]');await click('[data-action=next]');await click('[data-action=answer][data-index="1"]');
  await evaluate("window.__realAttemptSave=quizStore.saveAttempt;quizStore.saveAttempt=async()=>{throw Error('Injected attempt storage failure');};true");
  await click('[data-action=submit]');await wait("document.querySelector('[data-action=retry-attempt]') && !document.querySelector('[data-action=retry-attempt]').disabled");
  check(await evaluate(`quizStore.listAttempts(${retryQuizId}).then(rows=>rows.length===0)`),'failed attempt storage does not claim a saved result');
  check(await evaluate("JSON.parse(localStorage.getItem(quizView.draftKey)).submitted===true && quizView.result.correct===1 && quizView.result.incorrect===1 && quizView.result.skipped===8"),'submitted result preserves correct, incorrect and skipped counts in the recovery draft');
  await reload();await wait("window.quizView && document.querySelector('[data-action=retry-attempt]')");await resetFixtureQuota();
  check(await evaluate("quizView.mode==='result' && quizView.result.correct===1 && quizView.result.incorrect===1 && quizView.result.skipped===8"),'unsaved result restores after reload with its original local score');
  await click('[data-action=retry-attempt]');await wait("document.querySelector('[data-action=retake]') && !document.querySelector('[data-action=retry-attempt]')");
  check(await evaluate(`quizStore.listAttempts(${retryQuizId}).then(rows=>rows.length===1 && rows[0].correct===1 && rows[0].incorrect===1 && rows[0].skipped===8)`),'retrying result storage saves exactly one locally scored attempt');
  check(await evaluate('!localStorage.getItem(quizView.draftKey)') && calls.length===before+1,'successful attempt recovery clears the draft without any AI request');

  await prepare();await click('[data-action=source][data-source=TOPIC]');
  await evaluate("document.querySelector('#quiz-text').value='Energy conservation, work and power';document.querySelector('#quiz-text').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#quiz-count').value='200';document.querySelector('#quiz-count').dispatchEvent(new Event('input',{bubbles:true}));true");
  check(await evaluate("!document.querySelector('#quiz-generate').disabled && getComputedStyle(document.querySelector('#quiz-drop-zone')).display==='none'"),'topic text box enables quiz creation without requiring a PDF');
  await resetFixtureQuota();mode='success';before=calls.length;await click('#quiz-generate');await wait("quizView.mode==='attempt' && quizView.currentQuiz?.questions.length===200");
  check(calls.length===before+10,'200 topic questions use ten sequential twenty-question requests');
  check(await evaluate("quizView.currentQuiz.source.type==='TOPIC' && quizView.currentQuiz.questions.every(question=>question.sourcePage===null) && quizService.getDraft()===null"),'topic quiz saves 200 questions without fabricated PDF citations and clears generation checkpoint');
  await click('[data-action=answer][data-index="0"]');await reload();await wait("window.quizView && quizView.mode==='attempt' && quizView.currentQuiz?.questions.length===200");
  check(await evaluate("quizView.answers[0]===0 && JSON.parse(localStorage.getItem(quizView.draftKey)).answers.length===200"),'a 200-question attempt resumes with its saved answer after reload');

  await prepare();await click('[data-action=source][data-source=TEXT]');
  await evaluate("document.querySelector('#quiz-text').value='Energy is conserved. Work transfers energy and power measures work per unit time.';document.querySelector('#quiz-text').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#quiz-count').value='25';document.querySelector('#quiz-count').dispatchEvent(new Event('input',{bubbles:true}));true");
  mode='quota-second';await resetFixtureQuota();before=calls.length;await click('#quiz-generate');await wait("!quizView.isBusy() && quizService.getDraft()?.questions.length===20");
  check(calls.length===before+2 && await evaluate("document.querySelector('#quiz-generation-draft').innerText.includes('20 / 25')"),'quota after the first batch pauses with twenty completed questions saved');
  await reload();await wait("document.querySelector('[data-action=resume-generation]')");
  check(await evaluate("quizService.getDraft().questions.length===20 && quizView.form.sourceType==='TEXT' && !document.querySelector('[data-action=resume-generation]').disabled"),'study-text generation restores across reload without needing a PDF');
  mode='success';await resetFixtureQuota();await click('[data-action=resume-generation]');await wait("quizView.mode==='attempt' && quizView.currentQuiz?.questions.length===25");
  check(calls.length===before+3,'Resume sends only the unfinished final five questions');

  for(const[width,theme]of [[1440,'LIGHT'],[390,'LIGHT'],[390,'DARK'],[320,'DARK']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};true`);await prepare();await sleep(500);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),width+'px '+theme+' quiz creation fits the screen');
    if(screenshotDirectory && ((width===1440 && theme==='LIGHT') || (width===390 && theme==='LIGHT'))){await evaluate("document.querySelector('#view-quiz').scrollIntoView({behavior:'instant',block:'start'});true");await sleep(100);const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);const filename=path.join(screenshotDirectory,width===1440?'desktop.png':'mobile.png');fs.writeFileSync(filename,Buffer.from(screenshot.data,'base64'));console.log('REVIEW_SCREENSHOT '+filename);}
    if(width===390&&theme==='LIGHT'){
      mode='delayed';await resetFixtureQuota();const storedCount=await evaluate('db.pdfQuizzes.count()');await click('#quiz-generate');await wait("document.querySelector('#quiz-processing')");await sleep(600);
      check(await evaluate("(()=>{const progress=document.querySelector('#quiz-progress').getBoundingClientRect();return progress.top>=0 && progress.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth;})()"),'mobile generation brings the processing progress into view without overflow');
      await click('[data-action=cancel]');await sleep(1900);check(await evaluate('db.pdfQuizzes.count()')===storedCount,'mobile cancellation also prevents a late quiz from being saved');mode='success';
    }
    await evaluate(`quizView.openQuiz(${firstId})`);await sleep(500);check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),width+'px '+theme+' quiz player fits the screen');
    await click('[data-action=saved]');await sleep(500);check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),width+'px '+theme+' saved quizzes fit the screen');
  }
  await click(`[data-action=history][data-id="${firstId}"]`);await wait("document.querySelector('.qz-history ol')");
  check(await evaluate("/10\\s*\\/\\s*10/.test(document.querySelector('.qz-history').innerText) && /100%/.test(document.querySelector('.qz-history').innerText)"),'saved attempt history displays the original completed score');
  await click(`[data-action=delete][data-id="${firstId}"]`);await sleep(100);
  if(await evaluate("document.querySelector('#confirmation-modal.active')!==null"))await click('#modal-confirm-btn');
  await wait(`db.pdfQuizzes.get(${firstId}).then(row=>!row)`);
  check(await evaluate(`quizStore.listAttempts(${firstId}).then(rows=>rows.length===0)`),'saved quiz deletion also removes only its own attempts');
  check(await evaluate('__quizErrors.length===0'),'all native quiz flows finish without JavaScript exceptions');
  check(await evaluate('__quizExternal.length===0'),'fixture never sends external provider calls');
  check(missingAssets.length===0,'fresh quiz and PDF worker assets all load');
  console.log(`RESULT: ${checks} passed, 0 failed`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  try{if(send&&socket?.readyState===WebSocket.OPEN)await send('Browser.close');}catch{}
  socket?.close();if(browser&&!browser.killed)browser.kill();if(server)await new Promise(resolve=>server.close(resolve));
  for(let attempt=0;attempt<30;attempt++){try{fs.rmSync(directory,{recursive:true,force:true});break;}catch{await sleep(100);}}
  if(screenshotDirectory&&fs.existsSync(screenshotDirectory)&&!fs.readdirSync(screenshotDirectory).length)fs.rmSync(screenshotDirectory,{recursive:true,force:true});
});
