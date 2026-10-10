/** Quiz presets, unbiased shuffling and a local printable quiz/attempt export. */
(() => {
  'use strict';

  // These are editable practice defaults, never a statement of official exam rules.
  const PRESETS = Object.freeze([
    { id:'custom', label:'Custom settings', mode:'PRACTICE', count:20, durationMinutes:0, marksPerQuestion:1, negativeMarks:0, exam:'' },
    { id:'practice', label:'Practice · untimed', mode:'PRACTICE', count:20, durationMinutes:0, marksPerQuestion:1, negativeMarks:0, exam:'Practice' },
    { id:'mock', label:'Mock exam · 20 minutes', mode:'EXAM', count:20, durationMinutes:20, marksPerQuestion:1, negativeMarks:0, exam:'Mock exam' },
    { id:'upsc-style', label:'UPSC-style · editable practice defaults', mode:'EXAM', count:100, durationMinutes:120, marksPerQuestion:2, negativeMarks:0.67, exam:'UPSC-style practice' },
    { id:'ssc-style', label:'SSC-style · editable practice defaults', mode:'EXAM', count:100, durationMinutes:60, marksPerQuestion:2, negativeMarks:0.5, exam:'SSC-style practice' },
    { id:'school-test', label:'School test · editable practice defaults', mode:'EXAM', count:20, durationMinutes:30, marksPerQuestion:1, negativeMarks:0, exam:'School test practice' }
  ].map(preset => Object.freeze(preset)));

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));

  function shuffle(array, random = Math.random) {
    if (!Array.isArray(array)) throw new TypeError('Shuffle expects an array.');
    const copy = array.slice();
    for (let index = copy.length - 1; index > 0; index--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('The shuffle random value must be in [0, 1).');
      const other = Math.floor(value * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function isPermutation(order, length) {
    return Number.isSafeInteger(length) && length >= 0 && Array.isArray(order) && order.length === length &&
      Array.from(order).every(value => Number.isSafeInteger(value) && value >= 0 && value < length) && new Set(order).size === length;
  }

  const number = (value, fallback = 0) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
  const displayNumber = value => Number(value.toFixed(2)).toString();
  const validAnswer = answer => Number.isInteger(answer) && answer >= 0 && answer < 4;
  const questionIndices = (quiz, attempt) => {
    const all = quiz.questions.map((_, index) => index), indices = attempt?.questionIndices;
    return Array.isArray(indices) && indices.length > 0 && new Set(indices).size === indices.length &&
      indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < all.length) ? indices : all;
  };

  function sourceText(quiz) {
    const source = quiz.source || {};
    if ((source.type || 'PDF') === 'PDF') return `${source.fileName || 'PDF source'}${source.fromPage ? ` · Pages ${source.fromPage}–${source.toPage || source.fromPage}` : ''}${source.ocrPages?.length ? ` · Scanned-page OCR: ${source.ocrPages.length} pages` : ''}${source.excerptedPages?.length ? ` · Text excerpts from ${source.excerptedPages.length} pages` : ''}`;
    if (source.type === 'MANUAL') return 'Manually entered questions';
    if (source.type === 'TOPIC') return `Topic: ${String(source.text || '').slice(0, 300)}`;
    return 'Study text';
  }

  function localFontURL() {
    // A deployed subdirectory keeps its own bundled font; no external requests.
    const base = document.baseURI || window.location.href;
    return new URL('./assets/fonts/NotoSansDevanagari.ttf', base).href.replace(/["<>\\]/g, value => encodeURIComponent(value));
  }

  function buildPrintDocument(quiz, attempt = null, options = {}) {
    if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) throw new TypeError('There are no quiz questions to export.');
    const includeAnswers = options.includeAnswers ?? Boolean(attempt);
    const indices = questionIndices(quiz, attempt), settings = attempt?.settings || quiz.sessionDefaults || quiz.settings || {};
    const marks = number(settings.marksPerQuestion, 1), penalty = number(settings.negativeMarks), maxMarks = indices.length * marks;
    const answers = Array.isArray(attempt?.answers) ? attempt.answers : [];
    const correct = indices.filter(index => answers[index] === quiz.questions[index].answerIndex).length;
    const answered = indices.filter(index => validAnswer(answers[index])).length;
    const incorrect = answered - correct, skipped = indices.length - answered;
    const score = correct * marks - incorrect * penalty;
    const duration = number(attempt?.durationSeconds);
    const metadata = [sourceText(quiz), quiz.subject, quiz.chapter, quiz.exam, quiz.difficulty, quiz.language].filter(Boolean);
    const completedAt = attempt?.completedAt && Number.isFinite(Date.parse(attempt.completedAt))
      ? new Date(attempt.completedAt).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'}) + ' IST' : '';
    const content = indices.map((index, position) => {
      const question = quiz.questions[index], chosen = answers[index];
      const requestedOrder = (attempt?.optionOrder || attempt?.optionOrders)?.[index];
      const order = isPermutation(requestedOrder, question.options.length) ? requestedOrder : question.options.map((_, optionIndex) => optionIndex);
      const answerLetter = order.indexOf(question.answerIndex), chosenLetter = order.indexOf(chosen);
      const status = attempt ? !validAnswer(chosen) ? 'Skipped' : chosen === question.answerIndex ? 'Correct' : 'Incorrect' : '';
      return `<section class="question"><p class="overline">Question ${position + 1}${indices.length !== quiz.questions.length ? ` · Original question ${index + 1}` : ''}${question.sourcePage ? ` · PDF page ${escape(question.sourcePage)}` : ''}${attempt ? ` · ${includeAnswers ? status : validAnswer(chosen) ? 'Answered' : 'Skipped'}` : ''}</p>
        <h2>${escape(question.question)}</h2><ol class="options">${order.map((optionIndex, letter) => `<li><span class="letter">${String.fromCharCode(65 + letter)}.</span><span>${escape(question.options[optionIndex])}${attempt && chosen === optionIndex ? '<strong class="chosen"> — Your answer</strong>' : ''}</span></li>`).join('')}</ol>
        ${includeAnswers ? `<div class="solution"><p><strong>Correct answer: ${answerLetter >= 0 ? String.fromCharCode(65 + answerLetter) : '—'}</strong>${attempt ? ` · Your answer: ${chosenLetter >= 0 ? String.fromCharCode(65 + chosenLetter) : 'Skipped'}` : ''}</p>${question.explanation ? `<p>${escape(question.explanation)}</p>` : ''}${Array.isArray(question.optionExplanations) ? `<dl>${order.map((optionIndex, letter) => question.optionExplanations[optionIndex] ? `<dt>${String.fromCharCode(65 + letter)}. ${optionIndex === question.answerIndex ? 'Why it is correct' : 'Why it is incorrect'}</dt><dd>${escape(question.optionExplanations[optionIndex])}</dd>` : '').join('')}</dl>` : ''}</div>` : ''}</section>`;
    }).join('');
    return `<!doctype html><html lang="${quiz.language === 'Hindi' || quiz.language === 'HI' ? 'hi' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(quiz.title || 'Quiz')} · Hamsa Vidya</title>
      <style>@font-face{font-family:QuizDevanagari;src:url("${localFontURL()}") format("truetype");font-display:swap}*{box-sizing:border-box}body{margin:0;color:#172033;background:#f1f4f8;font-family:QuizDevanagari,Arial,sans-serif;line-height:1.6}main{max-width:850px;margin:24px auto;padding:28px 36px;background:#fff;border:1px solid #d9e0ea;border-radius:12px}h1{font-size:25px;line-height:1.4;margin:0 0 12px}h2{font-size:17px;line-height:1.7;margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.meta,.overline{color:#526073;font-size:12px}.meta{overflow-wrap:anywhere}.score{padding:12px 16px;background:#edf3ff;border:1px solid #dae5fa;border-radius:8px}.question{border-top:1px solid #d9e0ea;margin-top:20px;padding-top:16px;break-inside:avoid}.options{list-style:none;padding:0;margin:14px 0}.options li{display:flex;gap:10px;padding:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.letter{flex:0 0 22px;font-weight:bold}.chosen{font-size:12px}.solution{background:#f5f7fa;border-left:3px solid #8799b9;padding:10px 14px;font-size:13px}.solution p,.solution dd{white-space:pre-wrap;overflow-wrap:anywhere}.solution p:first-child{margin-top:0}.solution dt{font-weight:700;margin-top:8px}.solution dd{margin:2px 0 0}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:850px;margin:20px auto;padding:0 12px}.toolbar button{min-height:44px;background:#5146b8;color:#fff;border:0;border-radius:7px;font:inherit;font-weight:700;padding:10px 18px;cursor:pointer}.toolbar p{font-size:13px;color:#526073;margin:0}footer{font-size:11px;color:#526073;margin-top:22px}@page{size:A4;margin:14mm}@media print{body{background:#fff}.toolbar{display:none}main{border:0;border-radius:0;padding:0;margin:0;max-width:none}.solution,.score{background:#fff}.question{break-inside:auto}h2,.overline{break-after:avoid}.options li{break-inside:avoid}}@media(max-width:600px){main{margin:12px;padding:20px}}
      </style></head><body><div class="toolbar"><button id="quiz-print-button" type="button" disabled>Print / Save as PDF</button><p>Choose “Save as PDF” in your browser’s print dialog.</p><p id="quiz-font-status" role="status">Preparing Hindi and English text…</p></div><main><header><p class="overline">HAMSA VIDYA · ${attempt ? 'Attempt review' : 'Quiz question paper'}</p><h1>${escape(quiz.title || 'Quiz')}</h1><p class="meta">${metadata.map(escape).join(' · ')}</p><p class="meta">${indices.length} questions · ${displayNumber(marks)} marks per correct answer · ${penalty ? `−${displayNumber(penalty)} per incorrect answer` : 'No negative marking'}${settings.durationMinutes ? ` · Time limit: ${escape(settings.durationMinutes)} minutes` : ''}</p>${completedAt ? `<p class="meta">Completed: ${escape(completedAt)}</p>` : ''}${attempt ? `<p class="score">Correct: ${correct} · Incorrect: ${incorrect} · Skipped: ${skipped}<br><strong>Marks: ${displayNumber(score)} / ${displayNumber(maxMarks)}</strong> · Time taken: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s</p>` : ''}</header>${content}<footer>Created with Hamsa Vidya · ${includeAnswers ? 'Includes answers and available explanations' : 'Question paper; answer key omitted'}</footer></main></body></html>`;
  }

  function printQuiz(quiz, attempt = null, options = {}) {
    // Open synchronously while browser user activation is available.
    const html = buildPrintDocument(quiz, attempt, options);
    const popup = window.open('', '_blank', 'width=960,height=760');
    if (!popup) return false;
    popup.opener = null;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    let ready = false;
    const print = () => { if (!popup.closed) { popup.focus(); popup.print(); } };
    const onReady = async () => {
      if (ready || popup.closed) return;
      ready = true;
      try {
        await popup.document.fonts?.load('16px QuizDevanagari', 'हंस विद्या हिन्दी');
        await popup.document.fonts?.ready;
      } catch { /* Keep the printable text available even when a font cannot load. */ }
      if (popup.closed) return;
      const status = popup.document.getElementById('quiz-font-status');
      if (status) status.textContent = 'Ready to print.';
      const button = popup.document.getElementById('quiz-print-button');
      if (button) button.disabled = false;
      if (options.autoPrint !== false) print();
    };
    popup.document.getElementById('quiz-print-button')?.addEventListener('click', print);
    if (popup.document.readyState === 'complete') void onReady();
    else popup.addEventListener('load', onReady, {once:true});
    return true;
  }

  window.QuizTools = Object.freeze({ PRESETS, shuffle, isPermutation, buildPrintDocument, printQuiz });
})();
