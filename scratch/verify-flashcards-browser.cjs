// Optional isolated Edge checks for Flashcard study, storage, dialogs and keyboard controls.
// Serves local assets with mocked credentials; never accesses personal browser data.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const assert = require('assert/strict');
const {PDFDocument,PDFName,PDFArray}=require('pdf-lib');
const zlib=require('zlib');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamsa-flashcards-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, browser, socket, checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };

(async () => {
  const css = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
    .map(match => match[0]).filter(tag => !/https?:/.test(tag)).join('\n');
  const html = `<!doctype html><html data-theme='LIGHT' data-palette='INDIGO'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>${css}</head><body><main class='main-content'><section id='view-flashcards' class='view-section active'></section></main><div id='confirmation-modal' class='modal-overlay'><div class='modal-content'><h2 id='modal-confirm-title'></h2><p id='modal-confirm-message'></p><button id='modal-cancel-btn'>Cancel</button><button id='modal-confirm-btn'>Delete</button></div></div><script>window.errors=[];window.toasts=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.authGate={isAuthenticated:()=>false,show(){}};window.audioEngine={playClick(){},playSuccess(){}};</script><script src='/js/sanitizer.js'></script><script src='/js/ui-utils.js'></script><script src='/js/study-preferences.js'></script><script src='/assets/vendor/marked.min.js'></script><script src='/assets/vendor/dexie.min.js'></script><script src='/js/quiz-quality.js'></script><script src='/assets/vendor/katex.min.js'></script><script src='/js/study-format.js'></script><script src='/js/flashcard-tools.js'></script><script src='/js/db.js'></script><script src='/js/flashcard-store.js'></script><script src='/js/pdf-generator.js'></script><script src='/js/views/flashcards.js'></script><script src='/js/app.js'></script><script>app.showToast=(text,type)=>toasts.push({text,type});app.refreshIcons=()=>app.enhanceInteractiveElements();app.fireCelebrationConfetti=()=>{};app._setupKeyboardActivation();app.currentView='flashcards';(async()=>{await Promise.all([db.customDecks.clear(),db.customCards.clear(),db.notes.clear(),db.quizzes.clear(),db.questions.clear(),db.cardReviews.clear()]);localStorage.removeItem('hamsa_flashcard_session');localStorage.removeItem('hamsa_flashcard_drafts');window.deckId=await createCustomDeck({title: "2026 Student's Notes — a long, useful title for small mobile screens",subject:'Science'});window.card1=await addCustomCard({deckId,front:'What is energy? List<T> technical text',back:'Capacity to do work',explanation:'Energy can change forms.\\n**Recall:** compare kinetic and potential energy.'});window.card2=await addCustomCard({deckId,front:'What is force?',back:'A push or pull'});for(let i=0;i<13;i++)await createCustomDeck({title:'Other deck '+i,subject:'History'});window.noteId=await db.notes.add({title:'Physics notes',subject:'Science',sections:[{id:'section-1',heading:'Motion',definitions:[{term:'Speed',definition:'Distance travelled per unit time'}],formulas:[{name:'Speed',formula:'v = d/t'}]}]});await db.cardReviews.add({cardKey:'note_'+noteId+':section-1:Speed',dueDate:'2000-01-01',lastReviewedAt:'2000-01-01T00:00:00Z'});await flashcardsView.render();window.ready=true;})();</script></body></html>`;
  server = http.createServer((req, res) => {
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    try {
      res.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
      res.end(fs.readFileSync(filename));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(3306, '127.0.0.1', resolve));
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-sync',
    '--remote-debugging-port=9259', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + path.join(dir, 'profile')
  ], { windowsHide: true, stdio: 'ignore' });
  let version;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch('http://127.0.0.1:9259/json/version')).json(); break; } catch { await sleep(100); }
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

  for(const [label,width,theme] of [['desktop',1440,'LIGHT'],['mobile',390,'LIGHT'],['mobile-dark',390,'DARK'],['small-mobile',320,'LIGHT']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:3306/fixture'},sessionId);await sleep(150);
    try { await evaluate("new Promise((resolve,reject)=>{let n=0;const ready=()=>window.ready?resolve():++n>100?reject(Error('Flashcards failed to load')):setTimeout(ready,50);ready();})"); } catch(e) { console.error(await evaluate('({errors:window.errors,html:document.body.innerHTML.slice(-3000)})')); throw e; }
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' vault fits viewport');
    const heroMetrics=await evaluate("(()=>{const h=document.querySelector('.vhero');return {height:h.getBoundingClientRect().height,padding:getComputedStyle(h).padding,children:[...h.querySelector('.vhero-inner').children].map(e=>({class:e.className,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize}))};})()");
    if(heroMetrics.height>=360)console.error(heroMetrics);
    check(heroMetrics.height<360,label+' animated hero stays compact');
    check(await evaluate("document.querySelectorAll('.fc-deck').length===12"),label+' vault pagination renders twelve decks');
    check(await evaluate('getAllDueCards().then(cards=>cards.length===1 && cards[0].sourceDeckType===\'NOTE\')'),label+' legacy Notes reviews resolve in real IndexedDB');
    if(label==='desktop') {
      await evaluate("Promise.all([saveCardReviewProgress('custom:'+card1,deckId,'CUSTOM',3,{token:'same-browser-operation'}),saveCardReviewProgress('custom:'+card1,deckId,'CUSTOM',3,{token:'same-browser-operation'})]).then(rows=>window.parallelReviews=rows)");
      check(await evaluate("db.cardReviews.toArray().then(rows=>rows.filter(r=>r.cardKey==='custom:'+card1).length===1 && parallelReviews[0].id===parallelReviews[1].id && parallelReviews[1].repetitions===1)"),'Real IndexedDB concurrent duplicate reviews are idempotent');
      await evaluate('undoCardReviewProgress(parallelReviews[0])');
      await evaluate("Promise.all([saveCardReviewProgress('custom:'+card1,deckId,'CUSTOM',3,{token:'browser-operation-one'}),saveCardReviewProgress('custom:'+card1,deckId,'CUSTOM',3,{token:'browser-operation-two'})]).then(rows=>window.parallelReviews=rows)");
      check(await evaluate("getCardReviewProgress('custom:'+card1).then(r=>r.repetitions===2 && r.interval===4)"),'Real IndexedDB serializes distinct reviews without losing a schedule update');
      await evaluate("db.cardReviews.where('cardKey').equals('custom:'+card1).delete()");
    }
    await evaluate("document.getElementById('deck-search-input').value='Notes';document.getElementById('deck-search-input').focus();document.getElementById('deck-search-input').setSelectionRange(2,2);document.getElementById('deck-search-input').dispatchEvent(new Event('input',{bubbles:true}));new Promise(r=>setTimeout(r,350))");
    check(await evaluate("document.activeElement.id==='deck-search-input' && document.activeElement.selectionStart===2"),label+' search keeps focus and caret');
    await evaluate('flashcardsView.openCreateDeckModal()');
    check(await evaluate("document.querySelector('dialog').open && document.activeElement.name==='title' && getComputedStyle(document.querySelector('dialog')).overflowY==='auto'"),label+' creator dialog has focus and scrolling');
    await evaluate("document.querySelector('[name=title]').value='Unfinished deck';flashcardsView.closeModal(false,false);flashcardsView.openCreateDeckModal()");
    check(await evaluate("document.querySelector('[name=title]').value==='Unfinished deck' && document.querySelector('.fc-draft-hint')"),label+' closing and reopening recovers an unsaved deck draft');
    await evaluate("document.querySelector('[name=title]').value=\"2026 Student's Science\";document.querySelector('[name=subject]').value='Science';document.querySelector('dialog form').requestSubmit();new Promise(r=>setTimeout(r,150))");
    check(await evaluate("db.customDecks.toArray().then(rows=>rows.some(d=>d.title===\"2026 Student's Science\"))"),label+' creator preserves numbers and apostrophes');
    await evaluate("document.querySelector('[name=front]').value='Front one';document.querySelector('[name=back]').value='Answer one';document.querySelector('dialog form').requestSubmit();document.querySelector('dialog form').requestSubmit();new Promise(r=>setTimeout(r,100))");
    check(await evaluate("db.customCards.toArray().then(rows=>rows.filter(c=>c.front==='Front one').length===1)"),label+' duplicate form submission saves once');
    check(await evaluate("Object.keys(flashcardsView.readDrafts()).length===0"),label+' successful deck and card saves clear recovery drafts');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await sleep(30);
    check(await evaluate("!document.querySelector('dialog[open]')"),label+' Escape closes dialog');
    await evaluate('flashcardsView.loadCustomDeck(deckId)');await sleep(50);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' study screen fits viewport');
    if(width<820){
      check(await evaluate("document.querySelector('.flashcard-hud-bar').getBoundingClientRect().height<190"),label+' Decks/PDF/Shuffle share a compact toolbar');
      check(await evaluate("getComputedStyle(document.querySelector('.fc-controls')).position==='sticky' && parseFloat(getComputedStyle(document.querySelector('.srs-interval')).fontSize)>=13"),label+' ratings stick near the viewport with readable intervals');
    }
    check(await evaluate("!document.querySelector('.fc-answer') && [...document.querySelectorAll('[data-action=rate]')].every(b=>b.disabled)"),label+' answer stays hidden and ratings wait for reveal');
    check(await evaluate("document.querySelector('.fc-prompt').textContent.includes('List<T>')"),label+' technical angle brackets remain readable');
    await evaluate("document.querySelector('[data-action=flip]').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32},sessionId);
    check(await evaluate('flashcardsView.isFlipped && document.querySelectorAll(\'.fc-answer\').length===1'),label+' native Space reveals exactly once');
    check(await evaluate("document.activeElement.dataset.action==='flip'"),label+' revealing preserves useful keyboard focus');
    await evaluate("document.querySelector('[data-rating=\"3\"]').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32},sessionId);await sleep(60);
    check(await evaluate('flashcardsView.currentIndex===1 && flashcardsView.ratingsMap.size===1'),label+' native rating button saves and advances once');
    check(await evaluate("document.activeElement.matches('.fc-prompt')"),label+' rating advances focus to the next question');
    check(await evaluate('db.cardReviews.toArray().then(rows=>rows.filter(r=>r.cardKey===\'custom:\'+card1).length===1)'),label+' one actual schedule saved');
    await evaluate('flashcardsView.undoRating()');
    check(await evaluate('db.cardReviews.toArray().then(rows=>!rows.some(r=>r.cardKey===\'custom:\'+card1) && flashcardsView.currentIndex===0)'),label+' Undo restores card and removes first schedule');
    await evaluate('flashcardsView.toggleFlip()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3',windowsVirtualKeyCode:51},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'3',code:'Digit3',windowsVirtualKeyCode:51},sessionId);await sleep(70);
    check(await evaluate("flashcardsView.currentIndex===1 && flashcardsView.ratingsMap.size===1 && !flashcardsView._saving"),label+' native Digit3 rates from the focused Reveal button');
    await evaluate('flashcardsView.undoRating()');
    await evaluate('flashcardsView.isFlipped=true;flashcardsView.rateCard(1)');
    check(await evaluate('flashcardsView.cards.length===3 && flashcardsView.masterDeckCards.length===2'),label+' Again repeats card without losing full deck');
    await evaluate('flashcardsView.undoRating()');
    await evaluate("window.originalAdd=db.cardReviews.add.bind(db.cardReviews);db.cardReviews.add=async()=>{throw Error('Simulated storage failure')};flashcardsView.isFlipped=true;flashcardsView.rateCard(3)");
    check(await evaluate('flashcardsView.currentIndex===0 && flashcardsView.ratingsMap.size===0 && !flashcardsView._saving'),label+' failed save retains current card and progress');
    await evaluate('db.cardReviews.add=originalAdd;flashcardsView.isFlipped=true;flashcardsView.rateCard(2)');
    await evaluate('flashcardsView.isFlipped=true;flashcardsView.rateCard(3)');
    check(await evaluate("flashcardsView.activeTab==='summary' && document.querySelector('#view-flashcards').textContent.includes('2/2 unique cards reviewed')"),label+' summary counts actual unique reviews');
    await evaluate('flashcardsView.restartWithWeakCards()');
    check(await evaluate('flashcardsView.cards.length===1 && flashcardsView.masterDeckCards.length===2'),label+' weak practice keeps original deck');
    await evaluate('flashcardsView.restartFullDeck()');
    check(await evaluate('flashcardsView.cards.length===2'),label+' full restart restores all cards');
    await evaluate("flashcardsView.mode='TYPE';flashcardsView.currentIndex=1;flashcardsView.answerDraft='A push or pull';flashcardsView.renderStudyCard();flashcardsView.persistSession();flashcardsView.exitSession();new Promise(r=>setTimeout(r,50))");
    await evaluate('flashcardsView.resumeSession()');
    check(await evaluate("flashcardsView.currentIndex===1 && document.getElementById('fc-typed-answer').value==='A push or pull'"),label+' saved session restores typed draft and position');
    await evaluate("document.querySelector('[data-action=check-answer]').click()");
    await sleep(80);
    check(await evaluate("document.querySelector('.fc-notice').textContent.includes('normalized wording matches')"),label+' typed recall comparison uses saved answer');
    check(await evaluate("!document.querySelector('#fc-typed-answer') && !document.querySelector('[data-action=check-answer]') && document.querySelector('.fc-submitted-answer').textContent.includes('A push or pull')"),label+' submitted typed response collapses without losing its text');
    if(width<820) check(await evaluate("(()=>{const answer=document.querySelector('.fc-answer-text').getBoundingClientRect(),controls=document.querySelector('.fc-controls').getBoundingClientRect();return answer.top>=0 && answer.bottom<=controls.top && answer.bottom<innerHeight;})()"),label+' revealed key answer is visible above the ratings without extra scrolling');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' revealed card fits viewport');
    if(width<820){
      await evaluate("window.longAnswerState={html:document.querySelector('.fc-answer-text').innerHTML,scroll:scrollY};window.testNav=document.createElement('nav');testNav.className='mobile-bottom-nav';testNav.textContent='Mobile navigation';document.body.appendChild(testNav);document.querySelector('.fc-answer-text').textContent='A detailed answer to read. '.repeat(180);scrollTo(0,document.querySelector('.fc-answer').getBoundingClientRect().top+scrollY-100);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      check(await evaluate("(()=>{const c=document.querySelector('.fc-controls').getBoundingClientRect(),n=testNav.getBoundingClientRect();return c.top>=0 && c.bottom<=n.top+1 && c.bottom>innerHeight-250;})()"),label+' long answers keep ratings visible above mobile navigation');
      await evaluate("document.querySelector('.fc-answer-text').innerHTML=longAnswerState.html;testNav.remove();scrollTo(0,longAnswerState.scroll)");
    }
    if(label==='desktop') {
      await evaluate("window.originalPrint=pdfGenerator.openPrintWindow;pdfGenerator.openPrintWindow=html=>{window.paper=html;return true};window.originalMaster=flashcardsView.masterDeckCards;flashcardsView.masterDeckCards=Array.from({length:35},(_,i)=>({...originalMaster[i%2],front:'Prompt '+(i+1)+': '+originalMaster[i%2].front,explanation:'बल एक धक्का या खिंचाव है। '+originalMaster[0].explanation}));flashcardsView.exportCurrentDeckToPdf();flashcardsView.masterDeckCards=originalMaster;pdfGenerator.openPrintWindow=originalPrint");
      const paper=await evaluate('paper');
      check(paper.includes('35 flashcards')&&paper.includes('बल एक धक्का')&&paper.includes('Energy can change forms.'),'PDF export keeps prompts, Hindi answers and explanations');
      const target=await send('Target.createTarget',{url:'about:blank'});
      const printSession=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      const html=`<!doctype html><html><head><meta charset="UTF-8"><style>@font-face{font-family:'Noto Sans Devanagari';src:url('http://127.0.0.1:3306/assets/fonts/NotoSansDevanagari.ttf');font-weight:100 900}@page{size:A4;margin:12mm}</style></head><body>${paper}</body></html>`;
      await send('Runtime.evaluate',{expression:`document.open();document.write(${JSON.stringify(html)});document.close();document.fonts.ready`,awaitPromise:true},printSession.sessionId);
      const printed=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true},printSession.sessionId);
      const bytes=Buffer.from(printed.data,'base64');fs.writeFileSync(path.join(dir,'flashcards.pdf'),bytes);
      const pdf=await PDFDocument.load(bytes);let textPages=0;
      for(const page of pdf.getPages()) {
        const contents=pdf.context.lookup(page.node.Contents());
        const streams=contents instanceof PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref)):[contents];
        const operators=streams.map(stream=>{if(!stream?.contents)return '';const filter=stream.dict.get(PDFName.of('Filter'));return (filter?.toString()==='/FlateDecode'?zlib.inflateSync(stream.contents):Buffer.from(stream.contents)).toString('latin1');}).join('');
        if(/\bBT\b/.test(operators)&&/\bTj\b|\bTJ\b/.test(operators))textPages++;
      }
      check(pdf.getPageCount()>1&&textPages===pdf.getPageCount(),'Multi-page native A4 Flashcard PDF draws text on every page');
      await send('Target.closeTarget',{targetId:target.targetId});
    }
    await sleep(300);const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(dir,label+'.png'),Buffer.from(screenshot.data,'base64'));
    await evaluate('flashcardsView.exitSession();new Promise(r=>setTimeout(r,50))');
    await evaluate('flashcardsView.openManager(deckId)');
    check(await evaluate("document.querySelectorAll('.fc-manager-card').length===2"),label+' manager lists editable cards');
    await evaluate("document.querySelector('[data-manager=edit]').click();new Promise(r=>setTimeout(r,20))");
    await evaluate("document.querySelector('[name=back]').value='Updated verified answer';document.querySelector('dialog form').requestSubmit();new Promise(r=>setTimeout(r,70))");
    check(await evaluate("db.customCards.get(card1).then(c=>c.back==='Updated verified answer')"),label+' edit updates stored card');
    check(await evaluate("db.cardReviews.toArray().then(rows=>!rows.some(r=>r.cardKey==='custom:'+card1))"),label+' changed answer resets its schedule');
    await evaluate("document.querySelector('[data-manager=bulk]').click();new Promise(r=>setTimeout(r,20))");
    await evaluate("document.querySelector('[name=content]').value='front,back\\nWhat is force?,A push or pull\\nNew,Answer\\nNew,Answer\\nMissing,';document.getElementById('fc-preview-import').onclick()");
    check(await evaluate("document.getElementById('fc-import-preview').textContent.includes('1 new cards') && document.getElementById('fc-import-preview').textContent.includes('2 duplicates') && document.getElementById('fc-import-preview').textContent.includes('Row 5')"),label+' import preview reports duplicates and invalid-row reasons');
    await evaluate("document.querySelector('[name=format]').value='CLOZE';document.querySelector('[name=content]').value='Water freezes at {{c1::0°C}}.';document.getElementById('fc-preview-import').onclick()");
    check(await evaluate("document.getElementById('fc-import-preview').textContent.includes('Water freezes at [ … ].')"),label+' cloze import preview hides marked answer');
    await evaluate("document.querySelector('dialog form').requestSubmit();new Promise(r=>setTimeout(r,70))");
    check(await evaluate("db.customCards.where('deckId').equals(deckId).toArray().then(rows=>rows.length===3 && rows.some(c=>c.front.includes('[ … ]') && c.back.includes('0°C')))"),label+' cloze import stores usable prompt and answer');
    await evaluate("document.querySelector('[data-manager=delete]').click()");
    check(await evaluate("!document.querySelector('dialog[open]') && document.getElementById('confirmation-modal').classList.contains('active')"),label+' delete confirmation is visible outside native dialog');
    await evaluate("document.getElementById('modal-cancel-btn').click();new Promise(r=>setTimeout(r,70))");
    check(await evaluate("document.querySelector('dialog[open]') && document.querySelectorAll('.fc-manager-card').length===3"),label+' cancelling deletion restores manager');
    await evaluate("document.querySelector('[data-manager=delete]').click();document.getElementById('modal-confirm-btn').click();new Promise(r=>setTimeout(r,70))");
    check(await evaluate("db.customCards.get(card1).then(c=>!c)"),label+' manager deletion removes only selected card');
    await evaluate("flashcardsView.closeModal();flashcardsView.loadNotesDeck(noteId)");
    check(await evaluate("flashcardsView.cards.length===2 && flashcardsView.cards.every(c=>c.cardKey.startsWith('note:'))"),label+' Notes deck uses stable shared cards');
    await evaluate("flashcardsView.currentIndex=flashcardsView.cards.findIndex(c=>c.badge==='Formula');flashcardsView.renderStudyCard();flashcardsView.toggleFlip()");
    check(await evaluate("document.querySelector('.fc-answer-text math') && document.querySelector('.fc-answer-text math').textContent.includes('v')"),label+' formula answer renders readable native MathML');
    const sourcePdf=await PDFDocument.create();
    for(let i=0;i<3;i++)sourcePdf.addPage().drawText('Original source page '+(i+1));
    const originalPdf=Buffer.from(await sourcePdf.save()).toString('base64');
    await evaluate(`(async()=>{await db.notes.update(noteId,{originalSource:{files:[{name:'motion.pdf',type:'PDF',data:'data:application/pdf;base64,${originalPdf}'}],pages:[{fileName:'motion.pdf',page:2,text:'Source page two: speed = distance / time.'}]}});flashcardsView.cards[flashcardsView.currentIndex].sourceReferences=[{fileName:'motion.pdf',page:2}];flashcardsView.renderStudyCard();document.querySelector('.fc-source').open=true;document.querySelector('[data-action=source]').click();await new Promise(r=>setTimeout(r,70))})()`);
    check(await evaluate("document.querySelector('.fc-modal iframe').src.endsWith('#page=2') && document.querySelector('.fc-modal').textContent.includes('Source page two')"),label+' original source reference opens its actual PDF page');
    check(await evaluate("fetch(document.querySelector('.fc-modal iframe').src.split('#')[0]).then(r=>r.arrayBuffer()).then(b=>b.byteLength>400)"),label+' source viewer receives the saved PDF bytes');
    await evaluate('flashcardsView.closeModal(false,false)');
    if(label==='desktop'){
      await evaluate("(async()=>{window.originalNoteCards=FlashcardTools.noteCards(await getNoteById(noteId));window.definitionCard=originalNoteCards.find(c=>c.badge==='Definition');await saveCardReviewProgress(definitionCard.cardKey,noteId,'NOTE',4);await updateNote(noteId,{sections:[{id:'section-1',heading:'Motion',definitions:[{term:'Acceleration',definition:'Change in velocity'},{term:'Speed',definition:'Distance travelled per unit time'}],formulas:[{name:'Speed',formula:'v = d/t'}]}]});window.afterNoteCards=(await getFlashcardLibrary()).cards.filter(c=>c.sourceDeckType==='NOTE' && c.sourceDeckId===noteId)})()");
      check(await evaluate("afterNoteCards.find(c=>c.back===definitionCard.back).cardKey===definitionCard.cardKey && afterNoteCards.find(c=>c.back===definitionCard.back).srs.lastRating===4"),'Real IndexedDB keeps the correct Note review after insertion');
      await evaluate("(async()=>{window.againDeck=await createCustomDeck({title:'Again recovery',subject:'Science'});await addCustomCard({deckId:againDeck,front:'Repeat?',back:'Recall'});await flashcardsView.loadCustomDeck(againDeck);flashcardsView.toggleFlip();await flashcardsView.rateCard(1);flashcardsView.mode='TYPE';flashcardsView.answerDraft='Second occurrence';flashcardsView.persistSession();flashcardsView.exitSession();await flashcardsView.resumeSession()})()");
      check(await evaluate("flashcardsView.currentIndex===1 && flashcardsView.cards[0].cardKey===flashcardsView.cards[1].cardKey && flashcardsView.answerDraft==='Second occurrence'"),'Real IndexedDB resume restores the exact repeated queue occurrence');
    }
    check(await evaluate('errors.length===0'),label+' no runtime errors');
  }
  console.log(`RESULT: ${checks} passed, 0 failed\nArtifacts: ${dir}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); if (browser && !browser.killed) browser.kill();
  if (server) await new Promise(resolve => server.close(resolve));
});
