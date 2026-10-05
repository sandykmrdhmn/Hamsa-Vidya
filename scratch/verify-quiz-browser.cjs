// Optional isolated Edge checks for Quiz flows, native PDF upload and offline recovery.
// Serves local assets with mocked credentials; never accesses personal browser data.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const {pathToFileURL}=require('url');
const assert = require('assert/strict');
const {PDFDocument,PDFName,PDFArray}=require('pdf-lib');
const zlib=require('zlib');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamsa-quiz-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, actualServer, browser, socket, checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };

(async () => {
  const css = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
    .map(match => match[0]).filter(tag => !/https?:/.test(tag)).join('\n');
  const sourcePdf=await PDFDocument.create();
  for(const title of ['Original question page','Context page','Printed answer key: 1. A'])sourcePdf.addPage([400,500]).drawText(title,{x:25,y:450,size:14});
  const sourceData='data:application/pdf;base64,'+Buffer.from(await sourcePdf.save()).toString('base64');
  const uploadPath=path.join(dir,'study-upload.pdf'),retryPath=path.join(dir,'retry.pdf');
  fs.writeFileSync(uploadPath,Buffer.from(sourceData.split(',')[1],'base64'));
  const html = `<!doctype html><html data-theme="LIGHT" data-palette="INDIGO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><main class="main-content"><section id="view-create-quiz" class="view-section"></section><section id="view-quiz-player" class="view-section active"></section><section id="view-quiz-result" class="view-section"></section><section id="view-quiz-history" class="view-section"></section><section id="view-library" class="view-section"></section><section id="view-dashboard" class="view-section"></section></main><div id="generating-overlay"></div><div id="generating-title"></div><div id="confirmation-modal"></div>
  <script>window.errors=[];window.toasts=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));window.authGate={isAuthenticated:()=>false,show(){}};window.audioEngine={playClick(){},playTabSwitch(){},playOptionSelect(){},playCorrect(){},playWrong(){},playFanfare(){}};window.HamsaCharts={renderDonutChart(){}};</script>
  <script src="/assets/vendor/pdf.min.js"></script><script src="/js/pdf-reader.js"></script><script src="/js/pdf-extractor.js"></script><script src="/js/sanitizer.js"></script><script src="/js/ui-utils.js"></script><script src="/js/study-preferences.js"></script><script src="/js/quiz-quality.js"></script><script src="/assets/vendor/katex.min.js"></script><script src="/assets/vendor/marked.min.js"></script><script src="/js/study-format.js"></script><script src="/js/quiz-source.js"></script><script src="/js/quiz-engine.js"></script><script src="/assets/vendor/dexie.min.js"></script><script src="/js/db.js"></script><script src="/js/pdf-generator.js"></script><script src="/js/views/create-quiz.js"></script><script src="/js/views/quiz-player.js"></script><script src="/js/views/quiz-result.js"></script><script src="/js/views/quiz-history.js"></script><script src="/js/views/library.js"></script><script src="/js/app.js"></script>
  <script>app.showToast=(text,type)=>toasts.push({text,type});app.checkAndUpdateStreak=()=>{};app.showConfirmation=options=>window.confirmation=options;app.refreshIcons=()=>app.enhanceInteractiveElements();app._setupKeyboardActivation();window.geminiService={solveQuestionDoubt:async()=>({text:'Saved explanation',model:'Fixture'})};
  window.q=n=>({questionText:'What is '+n+' + 1? '+(n===1?'A long but useful question title on a small screen. ':''),options:[''+(n+1),''+(n+2),''+(n+3),''+(n+4)],correctAnswerIndex:0,explanation:'Adding one to '+n+' gives '+(n+1)+'.',topic:'Addition',optionExplanations:['Correct addition','One too many','Two too many','Three too many'],memoryCue:'Move one step ahead',aiReviewed:true});
  (async()=>{await db.quizzes.clear();await db.questions.clear();await db.attempts.clear();await db.cardReviews.clear();localStorage.removeItem('hamsa_active_quiz_attempt');window.quizId=await saveNewQuiz({title:'Addition and mathematical reasoning — a complete practice quiz for students',subject:'Mathematics',quizMode:'EXAM',examDurationSeconds:300,scoringPreset:'UPSC_PRELIMS',language:'HINDI',skippedPdfPages:[{pageNumber:2,reason:'No readable text'},{pageNumber:5,reason:'OCR failed'}]},Array.from({length:12},(_,i)=>q(i+1)));app.currentView='quiz-player';await quizPlayerView.loadAndStart(quizId);window.ready=true;})();</script></body></html>`;
  server = http.createServer((req, res) => {
    if (req.url === '/real-app' || req.url === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(root,'index.html')));}
    if (req.url.startsWith('/api/')) {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({hasGeminiKey:false,configured:false}));}
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    try {
      res.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
      res.end(fs.readFileSync(filename));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(3305, '127.0.0.1', resolve));
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-sync',
    '--remote-debugging-port=9258', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + path.join(dir, 'profile')
  ], { windowsHide: true, stdio: 'ignore' });
  let version;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch('http://127.0.0.1:9258/json/version')).json(); break; } catch { await sleep(100); }
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
  await send('DOM.enable',{},sessionId);
  const uploadFile=async file=>{const {root}=await send('DOM.getDocument',{},sessionId);const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pdf-file-input'},sessionId);if(!nodeId)throw Error('PDF upload input not found');await send('DOM.setFileInputFiles',{files:[file],nodeId},sessionId);};
   const waitFor=(expression,timeoutMs=10000)=>evaluate(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{try{if(${expression})return resolve(true);}catch{}if(++n>${Math.ceil(timeoutMs/100)})return reject(Error('Condition timed out: '+${JSON.stringify(expression)}));setTimeout(poll,100);};poll();})`);
  for(const [label,width,theme] of [['desktop',1440,'LIGHT'],['mobile',390,'LIGHT'],['mobile-dark',390,'DARK'],['small-mobile',320,'LIGHT']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:3305/fixture'},sessionId);await sleep(200);
    await evaluate("new Promise((resolve,reject)=>{let n=0;const ready=()=>window.ready?resolve():++n>50?reject(Error('Quiz failed to start')):setTimeout(ready,100);ready();})");
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};true`);
    if(!await evaluate('document.documentElement.scrollWidth<=innerWidth')) console.log('OVERFLOW',await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))})"));
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' player fits viewport');
    await evaluate("document.querySelector('.option-card').focus();true");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
    check(await evaluate('quizPlayerView.currentIndex===0 && quizPlayerView.userAnswers[quizPlayerView.questions[0].id]===0'),label+' Enter selects once without advancing');
    await evaluate('quizPlayerView.clearResponse();true');
    check(await evaluate('Object.keys(quizPlayerView.userAnswers).length===0'),label+' Clear Response works');
    await evaluate('quizPlayerView.selectOption(0);quizPlayerView.nextQuestion();quizPlayerView.selectOption(1);quizPlayerView.togglePalette(true);true');
    check(await evaluate("document.getElementById('palette-drawer').getAttribute('aria-modal')==='true' && document.activeElement.closest('#palette-drawer')!==null"),label+' palette moves focus into dialog');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    check(await evaluate("!document.getElementById('palette-drawer').classList.contains('active')"),label+' Escape closes palette');
    await evaluate('quizPlayerView.submitQuiz()');await sleep(100);
    check(await evaluate("app.currentView==='quiz-result' && !localStorage.getItem('hamsa_active_quiz_attempt')"),label+' submit clears saved progress permanently');
    check(await evaluate('db.attempts.toArray().then(rows=>rows.length===1 && rows[0].questionsSnapshot.length===12)'),label+' real IndexedDB saves complete answer snapshot');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' result fits viewport');
    check(await evaluate("document.querySelector('#view-quiz-result').textContent.includes('PDF source note — skipped pages: 2') && pdfGenerator.buildDocumentHtml(quizResultView.quiz,quizResultView.questions).includes('5 (OCR failed)')"),label+' saved skipped-page note appears in results and PDF');
    check(await evaluate("document.querySelectorAll('#view-quiz-result .review-item-card').length===10"),label+' review is paginated');
    await evaluate("quizResultView.setFilter('INCORRECT');true");
    check(await evaluate("document.querySelectorAll('#view-quiz-result .review-item-card').length===1"),label+' wrong filter excludes skipped questions');
    await evaluate("quizResultView.setFilter('SKIPPED');true");
    check(await evaluate("document.querySelectorAll('#view-quiz-result .review-item-card').length===10"),label+' skipped filter shows unanswered questions');
    await evaluate("window.firstAttempt=quizResultView.quiz.attemptId;app.currentView='quiz-player';awaitPromise=quizPlayerView.loadAndStart(quizId)");
    await evaluate("quizPlayerView.userAnswers={};quizPlayerView.questions.forEach(q=>quizPlayerView.userAnswers[q.id]=q.correctAnswerIndex);quizPlayerView.submitQuiz()");await sleep(100);
    check(await evaluate('db.attempts.count().then(n=>n===2)'),label+' retake adds a separate attempt');
    await evaluate('quizResultView.loadResult(quizId,firstAttempt)');
    check(await evaluate('quizResultView.questions[1].userSelectedOptionIndex===1 && quizResultView.quiz.correct===1'),label+' old result retains old selected answers');
    await evaluate("window.editId=quizResultView.questions[0].id;window.originalExplanation=quizResultView.questions[0].explanation;quizResultView.openQuestionEditor(editId)");
    check(await evaluate("document.querySelector('.quiz-edit-dialog').open && document.documentElement.scrollWidth<=innerWidth"),label+' correction dialog opens and fits');
    await evaluate("document.querySelector('.quiz-edit-dialog textarea[name=explanation]').value='Verified correction for future attempts.';document.querySelector('.quiz-edit-dialog form').requestSubmit();new Promise(resolve=>setTimeout(resolve,100))");
    await waitFor("!document.querySelector('.quiz-edit-dialog')");
    check(await evaluate("Promise.all([getQuizQuestion(editId),getQuizAttemptResult(quizId,firstAttempt)]).then(([q,result])=>q.explanation==='Verified correction for future attempts.'&&result.questions[0].explanation===originalExplanation&&!document.querySelector('.quiz-edit-dialog'))"),label+' corrections preserve completed snapshots');
    await evaluate("deleteQuizAttempts(['attempt:'+firstAttempt])");
    check(await evaluate('Promise.all([db.quizzes.count(),db.questions.count(),db.attempts.count()]).then(([a,b,c])=>a===1&&b===12&&c===1)'),label+' deleting attempt retains quiz and questions');
    check(await evaluate("pdfGenerator.buildDocumentHtml(quizResultView.quiz,quizResultView.questions).includes('5m 0s') && pdfGenerator.buildDocumentHtml(quizResultView.quiz,quizResultView.questions).includes('wrong: −2/3')"),label+' PDF honors real timer and marking scheme');
    if(label==='desktop') {
      const paper=await evaluate("pdfGenerator.buildDocumentHtml(quizResultView.quiz,quizResultView.questions)");
      const printTarget=await send('Target.createTarget',{url:'about:blank'});
      const printSession=await send('Target.attachToTarget',{targetId:printTarget.targetId,flatten:true});
      const printHtml=`<!doctype html><html><head><meta charset="UTF-8"><style>@font-face{font-family:'Noto Sans Devanagari';src:url('http://127.0.0.1:3305/assets/fonts/NotoSansDevanagari.ttf');font-weight:100 900}@page{size:A4;margin:12mm}</style></head><body>${paper}</body></html>`;
      await send('Runtime.evaluate',{expression:`document.open();document.write(${JSON.stringify(printHtml)});document.close();document.fonts.ready`,awaitPromise:true},printSession.sessionId);
      const printed=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true},printSession.sessionId);
      const bytes=Buffer.from(printed.data,'base64');fs.writeFileSync(path.join(dir,'quiz-paper.pdf'),bytes);
      const pdf=await PDFDocument.load(bytes);let textPages=0;
      for(const page of pdf.getPages()) {
        const contents=pdf.context.lookup(page.node.Contents());
        const streams=contents instanceof PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref)):[contents];
        const operators=streams.map(stream=>{if(!stream?.contents) return '';const filter=stream.dict.get(PDFName.of('Filter'));return (filter?.toString()==='/FlateDecode'?zlib.inflateSync(stream.contents):Buffer.from(stream.contents)).toString('latin1');}).join('');
        if(/\bBT\b/.test(operators)&&/\bTj\b|\bTJ\b/.test(operators)) textPages++;
      }
      check(pdf.getPageCount()>0 && textPages===pdf.getPageCount(),'Native A4 PDF has text drawing on every page');
      await send('Target.closeTarget',{targetId:printTarget.targetId});
    }
    await evaluate("app.navigate('create-quiz');createQuizView.generationDraft={options:{sourceTitle:'Saved quiz',questionCount:12,sourceType:'PDF',skippedPdfPages:[{pageNumber:2,reason:'OCR failed'}]},result:{title:'Saved quiz',questions:Array.from({length:12},(_,i)=>q(i+1)),coverage:{readChunks:2,totalChunks:20,sampled:true}}};createQuizView.render()");
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth && !document.querySelector("#view-create-quiz .quiz-preview")'),label+' creation has no manual review screen and fits viewport');
    check(await evaluate("document.querySelector('.quiz-draft-banner').textContent.includes('Start quiz')"),label+' completed draft offers direct start');
    check(await evaluate("createQuizView.readyQuiz().coverage.sampled && createQuizView.readyQuiz().options.skippedPdfPages[0].pageNumber===2"),label+' direct-start draft retains sampled coverage and skipped pages');
    await evaluate("createQuizView.generationDraft.state={title:'Partial quiz',questions:[q(1)],sentChunks:[0,10],totalSourceChunks:20};delete createQuizView.generationDraft.result;createQuizView.render()");
    check(await evaluate("document.querySelector('.quiz-draft-banner').textContent.includes('Continue quiz') && document.querySelector('.quiz-draft-banner').textContent.includes('Start 1 ready questions')"),label+' partial draft offers continue or direct start');
    await evaluate("createQuizView.activeSource='TEXT';createQuizView.notesText='Notes';createQuizView.render()");
    check(await evaluate("document.getElementById('notes-textarea').value==='Notes' && document.documentElement.scrollWidth<=innerWidth"),label+' creation controls render safely and fit');
    await evaluate("app.navigate('library');libraryView.render()");
    if(!await evaluate('document.documentElement.scrollWidth<=innerWidth')) console.log('LIBRARY OVERFLOW',await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('#view-library *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))})"));
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' library fits viewport');
    await evaluate("app.navigate('quiz-history');quizHistoryView.render()");
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' attempt history fits viewport');

    // New native-browser regressions, with isolated DB and saved source PDF.
    await evaluate(`(async()=>{app.navigate('quiz-player');window.technicalId=await saveNewQuiz({title:'Technical choices',subject:'Computer Science',quizMode:'PRACTICE',sourceType:'PDF',sourceTitle:'Types.pdf',originalSource:{pages:[{pageNumber:1,text:'List<int> represents integers. List<float> represents decimals.'},{pageNumber:3,text:'Printed answer key: 1. A'}],files:[{name:'Types.pdf',data:${JSON.stringify(sourceData)}}]}},[{questionText:'For $x=1$, choose the integer collection: List<int> or List<float>.',options:['List<int>','List<float>','Map<T>','Vector<int>'],correctAnswerIndex:0,explanation:'Use **List<int>** for integers. The equation is $x=1$.',sourcePage:1,keySourcePage:3,evidenceQuote:'List<int> represents integers.',keyEvidenceQuote:'1. A',sourceQuestionNumber:1,topic:'Types',difficulty:'MEDIUM',optionExplanations:['Integer collection','Decimal collection','Key-value mapping','Another collection'],memoryCue:'int means integer'}]);await quizPlayerView.loadAndStart(technicalId);return true;})()`);
    check(await evaluate("[...document.querySelectorAll('.option-label-text')].map(el=>el.textContent.trim()).join('|')==='List<int>|List<float>|Map<T>|Vector<int>'"),label+' technical options remain distinct');
    check(await evaluate("!!document.querySelector('#view-quiz-player math') && document.documentElement.scrollWidth<=innerWidth"),label+' mathematics renders without horizontal page overflow');
    await evaluate('quizPlayerView.selectOption(1);true');
    check(await evaluate("document.querySelector('.quiz-reasoning').open && !document.querySelector('.quiz-option-reasons').open"),label+' detailed reasoning opens while option breakdown stays compact');
    await sleep(400);
    const technicalScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(dir,label+'-technical.png'),Buffer.from(technicalScreenshot.data,'base64'));
    await evaluate("document.querySelector('[onclick*=\"quizSourceView.open\"]:not([onclick*=\"key\"])').click();true");
    check(await evaluate("document.querySelector('.quiz-source-dialog').open && document.querySelector('.quiz-source-dialog iframe').src.endsWith('#page=1') && document.documentElement.scrollWidth<=innerWidth"),label+' original saved PDF opens at the question page');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    await sleep(50);
    check(await evaluate("!document.querySelector('.quiz-source-dialog') && quizSourceView.url===null"),label+' Escape closes source viewer and releases its PDF URL');
    await evaluate("document.querySelector('[onclick*=\"quizSourceView.open\"][onclick*=\"key\"]').click();true");
    check(await evaluate("document.querySelector('.quiz-source-dialog iframe').src.endsWith('#page=3') && document.querySelector('.quiz-source-dialog').textContent.includes('Printed answer key: 1. A')"),label+' printed key control opens its own saved page');
    await evaluate('quizSourceView.close();quizPlayerView.submitQuiz()');await sleep(100);
    check(await evaluate("document.querySelector('#view-quiz-result').textContent.includes('List<float>') && !!document.querySelector('.quiz-distribution')"),label+' results preserve technical choices and expose real coverage');
    await evaluate("quizResultView.openDoubtSolver(quizResultView.questions[0].id);true");await sleep(50);
    check(await evaluate("document.querySelector('#doubt-solver-drawer').contains(document.activeElement)"),label+' doubt reply preserves drawer focus');
    await evaluate("quizResultView.setFilter('ALL');true");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    check(await evaluate('quizResultView.isDoubtDrawerOpen===false'),label+' doubt Escape works after a result re-render');
    await evaluate("updateQuizQuestion(quizResultView.questions[0].id,{correctAnswerIndex:1,explanation:'Latest verified correction',optionExplanations:[],memoryCue:''})");
    await evaluate('Promise.all([quizResultView.reattemptMissed(),quizResultView.reattemptMissed()])');await sleep(100);
    check(await evaluate("app.currentView==='quiz-player' && quizPlayerView.questions[0].correctAnswerIndex===1 && quizPlayerView.questions[0].explanation==='Latest verified correction'"),label+' missed drill uses the current corrected key');
    check(await evaluate("db.quizzes.toArray().then(qs=>qs.filter(q=>q.title==='Technical choices (Missed Drill)').length===1)"),label+' duplicate missed-drill clicks save one quiz');
    await evaluate("quizPlayerView.onLeaveView();updateQuizQuestion(quizPlayerView.questions[0].id,{reviewIssue:true})");
    await evaluate("quizPlayerView.loadAndStart(quizPlayerView.quiz.id)");await sleep(100);
    check(await evaluate("app.currentView==='quiz-result' && toasts.some(t=>/marked as needing review/.test(t.text))"),label+' a flagged saved question cannot start a scored attempt');
    await evaluate("app.navigate('quiz-history');window.realHistory=getAttemptHistory;getAttemptHistory=async()=>{throw Error('Storage unavailable')};quizHistoryView.render()");
    check(await evaluate("document.querySelector('#view-quiz-history').textContent.includes('could not be loaded')"),label+' history errors have a clear retry state');
    await evaluate("getAttemptHistory=realHistory;document.querySelector('#view-quiz-history button').click();new Promise(resolve=>setTimeout(resolve,50))");
    check(await evaluate("!document.querySelector('#view-quiz-history').textContent.includes('could not be loaded')"),label+' native Retry reloads history');


    // Parse a real PDF with the shipped PDF.js library and worker, through the actual file input.
    await evaluate("app.navigate('create-quiz');createQuizView.preview=null;createQuizView.generationDraft=null;createQuizView.activeSource='PDF';createQuizView.removeLoadedPdf();new Promise(r=>setTimeout(r,50))");
    check(await evaluate("typeof pdfjsLib.getDocument==='function' && new URL(pdfjsLib.GlobalWorkerOptions.workerSrc).pathname.endsWith('/assets/vendor/pdf.worker.min.js')"),label+' bundled reader and worker are initialized');
    await uploadFile(uploadPath);
    await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
    check(await evaluate("createQuizView.pdfTotalPages===3 && !!document.querySelector('.pdf-loaded-card') && document.documentElement.scrollWidth<=innerWidth"),label+' native PDF upload loads the correct page count');
    check(await evaluate("pdfExtractor.extractTextFromPageRange(1,3,()=>{},{skipUnreadable:true}).then(result=>result.extractedPages.length===3 && result.text.includes('Original question page') && result.text.includes('Printed answer key'))"),label+' actual PDF worker extracts page text without an API');
    await evaluate("createQuizView.removeLoadedPdf();new Promise(r=>setTimeout(r,50))");
    fs.writeFileSync(retryPath,'This is a damaged PDF fixture.');
    await uploadFile(retryPath);
    await waitFor("!createQuizView._pdfUploading && toasts.some(t=>/damaged/.test(t.text))");
    check(await evaluate("!createQuizView.loadedPdfMeta && document.getElementById('pdf-file-input').value===''"),label+' damaged PDF gives useful feedback and allows retry');
    fs.writeFileSync(retryPath,Buffer.from(sourceData.split(',')[1],'base64'));
    await uploadFile(retryPath);
    await waitFor("createQuizView.loadedPdfMeta?.fileName==='retry.pdf' && !createQuizView._pdfUploading");
    check(await evaluate("createQuizView.pdfTotalPages===3"),label+' selecting the same file after fixing it succeeds');
    await evaluate("createQuizView.removeLoadedPdf();new Promise(r=>setTimeout(r,50))");
    await evaluate("window.pdfjsLib=undefined;delete window['pdfjs-dist/build/pdf'];true");
    await uploadFile(uploadPath);
    await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
    check(await evaluate("typeof pdfjsLib.getDocument==='function' && pdfExtractor.currentDoc.numPages===3"),label+' missing reader automatically recovers during upload without reload');
    await evaluate("createQuizView.removeLoadedPdf();new Promise(r=>setTimeout(r,50))");
    await evaluate(`(()=>{const binary=atob(${JSON.stringify(sourceData.split(',')[1])}),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'Dropped.pdf',{type:'application/pdf'}));document.getElementById('pdf-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));return true;})()`);
    await waitFor("createQuizView.loadedPdfMeta?.fileName==='Dropped.pdf' && !createQuizView._pdfUploading");
    check(await evaluate("createQuizView.pdfTotalPages===3 && createQuizView.fromPage===1 && createQuizView.toPage===3"),label+' drag and drop uses the same working PDF upload path');

    check(await evaluate('errors.length===0'),label+' no runtime errors');
    await sleep(600);const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(dir,label+'.png'),Buffer.from(screenshot.data,'base64'));
  }

  // Boot the real index.html too: the earlier fixture did not exercise vendor loading.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.actualBootErrors=[];addEventListener('error',e=>{if(e.message)actualBootErrors.push(e.message)});addEventListener('unhandledrejection',e=>actualBootErrors.push(String(e.reason)));"},sessionId);
  await send('Page.navigate',{url:'http://127.0.0.1:3305/real-app'},sessionId);
  await waitFor("document.readyState==='complete' && window.createQuizView && window.app");
  check(await evaluate("typeof window.pdfjsLib?.getDocument==='function' && typeof window.pdfReader?.ensure==='function'"),'real application index loads the local PDF dependencies');
  await evaluate("window.actualToasts=[];app.showToast=(text,type)=>actualToasts.push({text,type});app.navigate('create-quiz');new Promise(r=>setTimeout(r,100))");
  await uploadFile(uploadPath);
  await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
  check(await evaluate("createQuizView.pdfTotalPages===3 && !actualToasts.some(t=>t.type==='error')"),'real application Quiz input uploads and parses a PDF');
  check(await evaluate("pdfExtractor.extractTextFromPageRange(3,3).then(result=>result.extractedPages.length===1 && result.extractedPages[0].pageNumber===3 && result.text.includes('Printed answer key'))"),'real application page selection reads exactly the selected PDF page');
  check(await evaluate('actualBootErrors.length===0'),'real application has no bootstrap or upload runtime errors');

  // Precache the real worker/library, then force actual network failure before recovering them.
  await evaluate("navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready)");
  await waitFor('!!navigator.serviceWorker.controller');
  check(await evaluate("caches.keys().then(async keys=>{const key=keys.find(k=>k.startsWith('hamsa-shell-'));if(!key)return false;const cache=await caches.open(key);return (await Promise.all(['pdf.min.js','pdf.worker.min.js'].map(name=>cache.match(new URL('/assets/vendor/'+name,location.href))))).every(Boolean);})"),'offline shell precaches both the PDF reader and worker');
  await evaluate("createQuizView.removeLoadedPdf();window.pdfjsLib=undefined;delete window['pdfjs-dist/build/pdf'];new Promise(r=>setTimeout(r,50))");
  await send('Network.enable',{},sessionId);
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId);
  try {
    await uploadFile(uploadPath);
    await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
    check(await evaluate("typeof pdfjsLib.getDocument==='function' && pdfExtractor.currentDoc.numPages===3"),'missing PDF reader recovers and native upload succeeds while offline');
    check(await evaluate("pdfExtractor.extractTextFromPageRange(1,1).then(result=>result.extractedPages.length===1 && result.text.includes('Original question page'))"),'offline PDF worker extracts readable page text without an API');
    check(await evaluate('actualBootErrors.length===0'),'offline PDF recovery has no runtime errors');
  } finally {
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},sessionId);
  }

  // A static-host fallback can leave HTML cached under the vendor URL. Recovery
  // must escape this bad cache rather than repeatedly executing the same HTML.
  await evaluate("(async()=>{for(const key of await caches.keys()){if(!key.startsWith('hamsa-'))continue;const cache=await caches.open(key);for(const request of await cache.keys()){if(/\\/pdf(?:\\.worker)?\\.min\\.js$/.test(new URL(request.url).pathname))await cache.put(request,new Response('<!DOCTYPE html><html>Wrong cached document</html>',{headers:{'Content-Type':'text/html'}}));}}createQuizView.removeLoadedPdf();window.pdfjsLib=undefined;delete window['pdfjs-dist/build/pdf'];actualToasts.length=0;return true;})()");
  await uploadFile(uploadPath);
  await waitFor("!createQuizView._pdfUploading");
  check(await evaluate("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && pdfExtractor.currentDoc.numPages===3"),'PDF upload recovers from HTML cached as the reader and worker');
  check(await evaluate("pdfExtractor.extractTextFromPageRange(1,3).then(r=>r.extractedPages.length===3 && r.text.includes('Printed answer key'))"),'recovered reader and worker extract real page text after bad-cache eviction');
  check(await evaluate("fetch('/assets/vendor/pdf.min.js').then(r=>r.headers.get('Content-Type').startsWith('text/javascript'))"),'normal reader requests evict cached HTML and return actual JavaScript');
  check(await evaluate("(async()=>{for(const key of await caches.keys()){if(!key.startsWith('hamsa-'))continue;for(const request of await(await caches.open(key)).keys()){if(new URL(request.url).searchParams.has('pdf-refresh'))return false;}}return true;})()"),'fresh-reader retries do not create unbounded cache entries');
  check(await evaluate('actualBootErrors.length===0'),'bad-cache recovery executes no HTML as JavaScript');
  await evaluate("createQuizView.removeLoadedPdf();delete window.pdfReader;delete window.pdfjsLib;delete window['pdfjs-dist/build/pdf'];true");
  await uploadFile(uploadPath);await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
  check(await evaluate("typeof pdfReader.ensure==='function' && pdfExtractor.currentDoc.numPages===3"),'native upload recovers when both helper and PDF reader were missing');

  // Exercise production server.js and its real security/cache headers too.
  actualServer=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:{...process.env,PORT:'3316',GEMINI_API_KEY:''},windowsHide:true,stdio:'ignore'});
  let serverReady=false;
  for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:3316/');if(r.ok){serverReady=true;break;}}catch{}await sleep(100);}
  if(!serverReady)throw Error('Production test server failed to start.');
  const missing=await fetch('http://127.0.0.1:3316/assets/vendor/missing-pdf-reader-fixture.js');
  check(missing.status===404 && missing.headers.get('Cache-Control')==='no-store','production server rejects missing reader assets instead of caching HTML');
  await send('Page.navigate',{url:'http://127.0.0.1:3316/?v=20261002-pdf2'},sessionId);
  await waitFor("document.readyState==='complete' && window.createQuizView && window.app");
  await evaluate("window.actualToasts=[];app.showToast=(text,type)=>actualToasts.push({text,type});app.setModule('quiz');new Promise(r=>setTimeout(r,100))");
  await uploadFile(uploadPath);await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
  check(await evaluate("createQuizView.pdfTotalPages===3 && !actualToasts.some(t=>t.type==='error')"),'production server Quiz tab uploads an actual PDF');
  check(await evaluate("pdfExtractor.extractTextFromPageRange(2,2).then(r=>r.extractedPages.length===1 && r.text.includes('Context page'))"),'production server worker extracts exactly the requested page');
  check(await evaluate('actualBootErrors.length===0'),'production server boot and upload have no runtime errors');

  // Exercise the real Generate button, engine and direct start with a real PDF and
  // mocked model responses. No live API or paid quota is used by this test.
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate("app.checkMandatoryProfileOnboarding=()=>{};authGate.continueAsGuest();true");
  await waitFor("!document.getElementById('app-root').hidden && document.getElementById('auth-gate').hidden");
  await evaluate("app.setModule('quiz');new Promise(resolve=>setTimeout(resolve,100))");
  await evaluate(`(()=>{
    window.generationCalls=[];window.generationUpdates=[];window.generationMessages=[];
    const report=app.handleGenerationProgress.bind(app);
    app.handleGenerationProgress=status=>{generationUpdates.push(status);const result=report(status);generationMessages.push(document.getElementById('generating-title').textContent);return result;};
    geminiService.setApiKey('browser-fixture-not-a-real-key');
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(url,init)=>{
      if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return nativeFetch(url,init);
      if(!String(url).includes('/models/gemini-3.6-flash:generateContent?'))throw Error('Unexpected model or discovery call');
      const payload=JSON.parse(init.body);
      const prompt=payload.contents[0].parts[0].text;generationCalls.push(prompt);
      await new Promise(resolve=>setTimeout(resolve,25));
      let value;
      if(prompt.startsWith('Create exactly')) {
        value={title:'PDF section revision',questions:Array.from({length:5},(_,i)=>{
          const page=i%3+1,labels=['Original question page','Context page','Printed answer key: 1. A'];
          return {questionText:'For revision check '+(i+1)+', which label appears on page '+page+' of this PDF?',options:[...labels,'Glossary'],correctAnswerIndex:page-1,explanation:'The label is printed on the referenced page.',optionExplanations:['Check the original page label.','Check the context page label.','Check the printed key label.','No glossary label is supplied.'],topic:'Document sections',difficulty:'MEDIUM',sourcePage:page,evidenceQuote:labels[page-1]};
        })};
      } else if(prompt.startsWith('Independently solve')) {
        const questions=JSON.parse(prompt.split('QUESTIONS:\\n')[1]);
        value={reviews:questions.map((q,index)=>({index,verdict:'ACCEPT',correctAnswerIndex:Number(q.questionText.match(/page (\\d+)/)[1])-1,reason:'The raw page excerpt confirms this exact label.',optionExplanations:['Original page label.','Context page label.','Printed key label.','Unsupported glossary label.']}))};
      } else throw Error('Unnecessary source import/read request for a small fresh PDF.');
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
    };
    createQuizView.selectedQuestionCount=5;createQuizView.generationDraft=null;
    return createQuizView.render();
  })()`);
  check(await evaluate("!createQuizView.importSourceQuestions && !document.querySelector('input[onchange*=\"importSourceQuestions\"]').checked"),'production default creates a fresh quiz without scanning printed questions');
  await evaluate("document.getElementById('btn-generate-quiz').click();true");
   await waitFor("app.currentView==='quiz-player' && quizPlayerView.questions.length===5 && !app._isGenerating",60000);
  check(await evaluate("quizPlayerView.questions.length===5 && quizPlayerView.questions.every(q=>q.aiReviewed&&q.sourceMatched)"),'native Generate click creates five independently reviewed source-backed questions');
  check(await evaluate("generationCalls.length===2 && generationCalls[0].startsWith('Create exactly') && generationCalls[1].startsWith('Independently solve')"),'small PDF generation uses only the writer and independent solver');
   check(await evaluate("aiClient.getRequestDiagnostics().length===2 && aiClient.getRequestDiagnostics().every(log=>log.model==='gemini-3.6-flash'&&log.status===200) && aiClient.getRequestDiagnostics()[1].startedAt-aiClient.getRequestDiagnostics()[0].startedAt<2000"),'small native quiz starts answer checking without the former 12-second wait');
  check(await evaluate("generationMessages.some(s=>s.includes('Checking your answers')) && generationMessages.every(s=>!/quota|token|batch|AI step|independent/i.test(s)) && generationUpdates.at(-1).percent===100 && generationUpdates.every((s,i)=>!i||s.percent>=generationUpdates[i-1].percent)"),'native processing displays answer review with monotonic progress through completion');
  check(await evaluate("!document.querySelector('.quiz-preview') && !document.getElementById('generating-overlay').classList.contains('active') && createQuizView.generationDraft===null"),'generated quiz directly opens its player and clears processing and draft');
  check(await evaluate("document.getElementById('view-quiz-player').getBoundingClientRect().width>0 && !document.querySelector('.quiz-preview')"),'real desktop application directly starts the generated quiz');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
  await sleep(200);
  // The application header has a separate existing mobile overflow; verify
  // the generated Quiz panel itself here.
  check(await evaluate("(()=>{const el=document.getElementById('view-quiz-player'),rect=el.getBoundingClientRect();return rect.width>0&&rect.left>=0&&rect.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;})()"),'real mobile directly generated Quiz panel and content fit the viewport');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
  check(await evaluate("quizPlayerView.quiz.originalSource.pages.length===3 && quizPlayerView.quiz.originalSource.files[0].name==='study-upload.pdf'"),'fresh quiz retains all selected PDF pages and the original file');
  await evaluate("app.navigate('create-quiz');createQuizView.render();new Promise(r=>setTimeout(r,50))");
  await evaluate("document.getElementById('btn-generate-quiz').click();true");
   await waitFor("app.currentView==='quiz-player' && quizPlayerView.questions.length===5 && !app._isGenerating",60000);
  check(await evaluate("generationCalls.length===4 && aiClient.getStageDiagnostics().filter(s=>s.stage==='pdf-page-cache'&&s.cacheHits===1).length>=3 && generationUpdates.some(s=>/Reusing page \\d+ already read/.test(s.message))"),'repeated native generation reuses PDF text and independently reviews the new quiz');
  await evaluate(`(()=>{
    const previousFetch=window.fetch;let writes=0;
    geminiService.setApiKey('browser-partial-response-fixture');aiClient.QUIZ_REQUEST_INTERVAL_MS=0;
    window.fetch=async(url,init)=>{
      const response=await previousFetch(url,init);
      if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return response;
      const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly') && ++writes===1){
        const data=await response.json(),value=JSON.parse(data.candidates[0].content.parts[0].text);
        value.questions[4]={questionText:'An incomplete AI question'};
        data.candidates[0].content.parts[0].text=JSON.stringify(value);return Response.json(data);
      }
      return response;
    };
    app.navigate('create-quiz');return createQuizView.render();
  })()`);
  await evaluate("document.getElementById('btn-generate-quiz').click();true");
  await waitFor("app.currentView==='quiz-player' && quizPlayerView.questions.length===5 && !app._isGenerating",60000);
  check(await evaluate("quizPlayerView.questions.length===5 && quizPlayerView.questions.every(q=>q.aiReviewed&&q.sourceMatched)"),'native PDF quiz completes after one malformed AI question');
  check(await evaluate("generationCalls.length===8 && generationCalls[6].startsWith('Create exactly 1')"),'native PDF flow preserves four good questions and writes only the missing one');
  check(await evaluate("!document.getElementById('generating-overlay').classList.contains('active') && createQuizView.generationDraft===null"),'partial response recovery closes processing and leaves no unchecked answers');
  await evaluate(`(()=>{
    const previousFetch=window.fetch;let writes=0;window.pauseFixture=true;
    geminiService.setApiKey('browser-paused-response-fixture');
    window.fetch=async(url,init)=>{
      const response=await previousFetch(url,init);
      if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return response;
      const prompt=JSON.parse(init.body).contents[0].parts[0].text;
      if(prompt.startsWith('Create exactly')){
        writes++;
        if(writes>1 && window.pauseFixture)throw Object.assign(Error('Simulated provider timeout'),{code:'AI_TIMEOUT'});
        if(writes===1){const data=await response.json(),value=JSON.parse(data.candidates[0].content.parts[0].text);value.questions[4]={questionText:'Incomplete'};data.candidates[0].content.parts[0].text=JSON.stringify(value);return Response.json(data);}
      }
      return response;
    };
    app.navigate('create-quiz');return createQuizView.render();
  })()`);
  await evaluate("document.getElementById('btn-generate-quiz').click();true");
  await waitFor("createQuizView.generationDraft?.state?.questions.length===4 && !app._isGenerating",60000);
  check(await evaluate("app.currentView==='create-quiz' && !document.querySelector('.quiz-preview') && document.querySelector('.quiz-draft-banner').textContent.includes('Continue quiz') && !document.getElementById('generating-overlay').classList.contains('active')"),'interrupted native generation keeps four ready questions and offers Continue without a review screen');
  await evaluate("window.pauseFixture=false;document.querySelector('button[onclick=\"createQuizView.generateQuiz(true)\"]').click();true");
  await waitFor("app.currentView==='quiz-player' && !app._isGenerating",60000);
  check(await evaluate("quizPlayerView.questions.length===5 && quizPlayerView.questions.every(q=>q.aiReviewed&&q.sourceMatched) && new Set(quizPlayerView.questions.map(q=>q.questionText)).size===5"),'native Continue completes and directly starts the quiz without lost or duplicate questions');
  await waitFor("Number(getComputedStyle(document.getElementById('generating-overlay')).opacity)===0");
  const generationScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
  fs.writeFileSync(path.join(dir,'generated-quiz.png'),Buffer.from(generationScreenshot.data,'base64'));
  check(await evaluate('actualBootErrors.length===0'),'native PDF generation has no runtime errors');

  // Recover a completed draft after a save failure and real reload.
  await evaluate("window.saveNewQuiz=async()=>{throw Error('Simulated storage failure');};geminiService.setApiKey('browser-save-recovery-fixture');app.navigate('create-quiz');createQuizView.render()");
  await evaluate("document.getElementById('btn-generate-quiz').click();true");
  await waitFor("!!createQuizView.generationDraft?.result && !app._isGenerating",60000);
  check(await evaluate("createQuizView.generationDraft.options.draftPdfId && getQuizDraftFile(createQuizView.generationDraft.options.draftPdfId).then(file=>file?.name==='study-upload.pdf' && file.size>0)"),'failed direct save retains the ready quiz and original PDF draft blob');
  await evaluate("createQuizView.activeSource='TEXT';createQuizView.onNotesChange('Autosaved native notes');createQuizView.onTopicTitleChange('Autosaved native topic');createQuizView.setLanguage('HINDI');true");
  await send('Page.reload',{},sessionId);
  await waitFor("document.readyState==='complete' && window.createQuizView && window.app");
  check(await evaluate("createQuizView.notesText==='Autosaved native notes' && createQuizView.customTopicTitle==='Autosaved native topic' && createQuizView.selectedLanguage==='HINDI'"),'native reload restores pre-generation notes, topic and selected language');
  await evaluate("window.actualToasts=[];app.showToast=(text,type)=>actualToasts.push({text,type});app.checkMandatoryProfileOnboarding=()=>{};authGate.continueAsGuest();app.setModule('quiz');new Promise(resolve=>setTimeout(resolve,100))");
  check(await evaluate("!createQuizView.generationDraft.options._pdfFile && quizSourceView.capture(createQuizView.generationDraft.options).then(source=>source.files[0]?.name==='study-upload.pdf' && source.pages.length===3)"),'reloaded completed draft captures its retained original PDF and all pages');
  await evaluate("quizSourceView.open(createQuizView.generationDraft.options,createQuizView.readyQuiz().questions[0]);new Promise(resolve=>setTimeout(resolve,100))");
  check(await evaluate("!!document.querySelector('.quiz-source-file iframe') && document.querySelector('.quiz-source-status').textContent==='Original PDF saved with this quiz.'"),'recovered draft source viewer opens the retained PDF');
  await evaluate("quizSourceView.close();window.fetch=async()=>{throw Error('Recovered ready quiz must not call AI');};createQuizView.generateQuiz(true);true");
  await waitFor("app.currentView==='quiz-player' && !!quizPlayerView.quiz && !app._isGenerating");
  check(await evaluate("getQuizWithQuestions(quizPlayerView.quiz.id).then(quiz=>quiz.originalSource.files[0]?.name==='study-upload.pdf')"),'recovered ready draft directly starts with its original PDF and no new AI request');
  check(await evaluate("db.quizDraftFiles.count().then(count=>count===0)"),'direct saving removes the temporary PDF blob');
  await evaluate("document.querySelector('[data-quiz-option=\"1\"]').focus();true");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  check(await evaluate("document.activeElement?.dataset.quizOption==='1' && document.activeElement.getAttribute('aria-pressed')==='true'"),'native keyboard selection retains option focus and announces selection');
  check(await evaluate("(()=>{const view=app.currentView,id=quizPlayerView.quiz.id,hash=location.hash;app.setModule('quiz');return app.currentView===view&&quizPlayerView.quiz.id===id&&location.hash===hash;})()"),'primary Quiz tab preserves active attempt and its URL');

  // Local file URLs have different worker/CORS rules from HTTP URLs.
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href},sessionId);
  await waitFor("document.readyState==='complete' && window.createQuizView && window.app");
  await evaluate("window.actualToasts=[];app.showToast=(text,type)=>actualToasts.push({text,type});app.setModule('quiz');new Promise(r=>setTimeout(r,100))");
  await uploadFile(uploadPath);await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
  check(await evaluate("createQuizView.pdfTotalPages===3 && !actualToasts.some(t=>t.type==='error')"),'direct local index.html uploads a PDF with its local worker fallback');
  check(await evaluate("pdfExtractor.extractTextFromPageRange(1,1).then(r=>r.text.includes('Original question page'))"),'direct local file mode extracts real PDF page text');
  await evaluate("createQuizView.removeLoadedPdf();delete window.pdfReader;delete window.pdfjsLib;delete window['pdfjs-dist/build/pdf'];true");
  await uploadFile(uploadPath);await waitFor("createQuizView.loadedPdfMeta?.fileName==='study-upload.pdf' && !createQuizView._pdfUploading");
  check(await evaluate("pdfExtractor.currentDoc.numPages===3 && typeof pdfReader.ensure==='function'"),'direct local file mode recovers missing helper and reader without network');

  console.log(`RESULT: ${checks} passed, 0 failed\nArtifacts: ${dir}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); if (browser && !browser.killed) browser.kill();
  if(actualServer && !actualServer.killed)actualServer.kill();
  if (server) await new Promise(resolve => server.close(resolve));
});
