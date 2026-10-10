/** Preset, canonical ordering and safe printable export regressions; no network. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/quiz-tools.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost:3210/study/index.html#quiz', runScripts:'outside-only'});
dom.window.eval(source);
const tools = dom.window.QuizTools;
const fixture = () => ({title:'अध्ययन / Study', difficulty:'MIXED', language:'BILINGUAL', subject:'Science', chapter:'Water', exam:'Mock',
  source:{type:'PDF',fileName:'पाठ.pdf',fromPage:1,toPage:3}, settings:{marksPerQuestion:2,negativeMarks:0.5,durationMinutes:20},
  questions:[0,1,2].map(index => ({question:`प्रश्न ${index+1} / Question ${index+1}`, options:['एक / One','दो / Two','तीन / Three','चार / Four'], answerIndex:index,
    sourcePage:index+1, explanation:`स्पष्टीकरण ${index+1} / Explanation ${index+1}`, optionExplanations:['कारण A','Reason B','Reason C','Reason D']}))});
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await test('Presets are distinct editable defaults with explicit exam-inspired labels', () => {
    assert.equal(new Set(tools.PRESETS.map(preset => preset.id)).size, tools.PRESETS.length);
    assert.ok(Object.isFrozen(tools.PRESETS));
    for (const preset of tools.PRESETS) { assert.ok(Object.isFrozen(preset)); assert.ok(preset.count >= 1 && preset.count <= 200); assert.ok(preset.negativeMarks >= 0); }
    for (const id of ['upsc-style','ssc-style','school-test']) assert.match(tools.PRESETS.find(preset => preset.id === id).label, /editable practice defaults/);
  });
  await test('Shuffle copies input, preserves object identity and permutes every slot', () => {
    const input = [{id:0},{id:1},{id:2},{id:3}], before = input.slice();
    const result = tools.shuffle(input, () => 0);
    assert.deepEqual(Array.from(result), [input[1],input[2],input[3],input[0]]);
    assert.deepEqual(input, before);
    assert.notEqual(result, input);
    for (let run = 0; run < 30; run++) assert.equal(tools.isPermutation(tools.shuffle([0,1,2,3]),4), true);
    assert.throws(() => tools.shuffle([0,1], () => 1), /random value/);
    assert.throws(() => tools.shuffle([0,1], () => NaN), /random value/);
  });
  await test('Permutation validation rejects duplicates, sparse arrays and range errors', () => {
    for (const value of [[0,0,2,3],[0,1,2,4],[0,1,2],new Array(4),[-1,0,1,2]]) assert.equal(tools.isPermutation(value,4), false);
    assert.equal(tools.isPermutation([3,2,1,0],4), true);
  });
  await test('Question paper preserves bilingual text and local bundled font while hiding answer key', () => {
    const html = tools.buildPrintDocument(fixture()), output = new JSDOM(html);
    assert.match(output.window.document.body.textContent, /अध्ययन \/ Study/);
    assert.equal(output.window.document.querySelectorAll('.question').length,3);
    assert.equal(output.window.document.querySelectorAll('.solution').length,0);
    assert.match(html,/http:\/\/localhost:3210\/study\/assets\/fonts\/NotoSansDevanagari.ttf/);
    assert.doesNotMatch(html,/https:\/\/|fonts.googleapis|<script/i);
    output.window.close();
  });
  await test('Printed question papers retain scanned-page OCR and excerpt provenance', () => {
    const quiz = fixture(); quiz.source.ocrPages = [1,2]; quiz.source.excerptedPages = [2];
    const output = new JSDOM(tools.buildPrintDocument(quiz));
    assert.match(output.window.document.body.textContent, /Scanned-page OCR: 2 pages/);
    assert.match(output.window.document.body.textContent, /Text excerpts from 1 pages/);
    assert.equal(output.window.document.querySelectorAll('.question').length,3);
    output.window.close();
  });
  await test('Attempt export scores canonical subset answers and preserves shuffled option letters', () => {
    const quiz=fixture(), attempt={answers:[0,1,0],questionIndices:[2,0],optionOrder:[[3,2,1,0],[0,1,2,3],[2,0,3,1]],durationSeconds:72,completedAt:'2026-10-09T12:00:00Z',settings:quiz.settings};
    const html=tools.buildPrintDocument(quiz,attempt), output=new JSDOM(html), text=output.window.document.body.textContent;
    assert.equal(output.window.document.querySelectorAll('.question').length,2);
    assert.match(text,/Marks: 1.5 \/ 4/);
    assert.match(text,/Correct: 1 · Incorrect: 1 · Skipped: 0/);
    assert.match(text,/Time taken: 1m 12s/);
    assert.match(output.window.document.querySelector('.question').textContent,/Correct answer: A · Your answer: B/);
    assert.match(output.window.document.querySelectorAll('.question')[1].textContent,/Correct answer: D · Your answer: D/);
    assert.match(text,/कारण A/);
    output.window.close();
  });
  await test('Explicit answer-key controls include explanations or omit solutions', () => {
    const quiz=fixture();
    assert.match(tools.buildPrintDocument(quiz,null,{includeAnswers:true}),/Why it is incorrect/);
    assert.doesNotMatch(tools.buildPrintDocument(quiz,{answers:[0,null,null]},{includeAnswers:false}),/class="solution"|स्पष्टीकरण/);
  });
  await test('All user and AI fields are text, never executable markup in export', () => {
    const quiz=fixture(), payload='</style><script>alert(1)</script><img src=x onerror=alert(2)>';
    quiz.title=quiz.subject=quiz.chapter=quiz.exam=quiz.source.fileName=payload;
    quiz.questions[0].question=quiz.questions[0].options[0]=quiz.questions[0].explanation=quiz.questions[0].optionExplanations[0]=payload;
    const output=new JSDOM(tools.buildPrintDocument(quiz,null,{includeAnswers:true}));
    assert.equal(output.window.document.querySelectorAll('script,img').length,0);
    assert.equal(output.window.document.querySelector('h1').textContent,payload);
    assert.equal(output.window.document.querySelector('h2').textContent,payload);
    output.window.close();
  });
  await test('Popup opens immediately, severs opener and waits for Hindi font before printing', async () => {
    const popup=new JSDOM('',{url:dom.window.location.href}), p=popup.window;
    let fontResolve, printCalls=0, openCalls=0;
    const fontReady=new Promise(resolve => {fontResolve=resolve;});
    Object.defineProperty(p.document,'fonts',{value:{load:()=>fontReady,ready:fontReady}});
    p.print=()=>{printCalls++;}; p.focus=()=>{}; p.opener=dom.window;
    dom.window.open=()=>{openCalls++;return p;};
    assert.equal(tools.printQuiz(fixture()),true);
    assert.equal(openCalls,1); assert.equal(p.opener,null); assert.equal(printCalls,0);
    p.dispatchEvent(new p.Event('load'));
    assert.equal(p.document.getElementById('quiz-print-button').disabled,true);
    fontResolve(); await tick();
    assert.equal(printCalls,1); assert.equal(p.document.getElementById('quiz-print-button').disabled,false);
    p.document.getElementById('quiz-print-button').click(); assert.equal(printCalls,2);
    popup.window.close();
  });
  await test('Blocked popup returns a recoverable false result', () => {
    dom.window.open=()=>null;
    assert.equal(tools.printQuiz(fixture()),false);
  });
  dom.window.close();
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  process.exitCode=failed ? 1 : 0;
})();
