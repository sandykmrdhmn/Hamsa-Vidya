/** Regression checks for Teacher correctness, cancellation, persistence and exports.
 * Uses isolated DOMs, a memory database and mocked AI responses; no live requests.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); console.log(`  PASS  ${name}`); passed++; }
  catch (error) { console.error(`  FAIL  ${name}: ${error.stack}`); failed++; }
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const copy = value => JSON.parse(JSON.stringify(value));
const lesson = (answer = 'A valid explanation') => ({
  topic: 'Test lesson', subject: 'Mathematics', quickAnswer: answer,
  foundation: { title: 'Foundation title', explanation: 'Foundation explanation' },
  steps: [{ stepNumber: 1, title: 'Step title', content: 'Step detail' }],
  examples: [{ title: 'Original example', description: 'Original description' }]
});
function environment() {
  const dom = new JSDOM('<div id="view-ai-teacher"><div id="teacher-tab-content"><textarea id="ai-teacher-input">Question one</textarea><div id="teacher-results-container"></div></div></div>', {
    url: 'http://localhost/', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.console = { log() {}, warn() {}, error() {} };
  w.TextEncoder = TextEncoder;
  w.marked = { parse: text => String(text) };
  const toasts = [];
  w.app = { showToast: (...args) => toasts.push(args), refreshIcons() {} };
  w.confirm = () => true;
  w.URL.revokeObjectURL = () => {};
  w.URL.createObjectURL = () => 'blob:teacher-test';
  const rows = new Map();
  const saves = [];
  w.saveAiTeacherExplanation = async record => {
    const id = record.id || rows.size + 1;
    const saved = copy({ ...record, id });
    rows.set(id, saved); saves.push(saved); return id;
  };
  w.getAiTeacherExplanationById = async id => copy(rows.get(id) || null);
  w.getAllAiTeacherExplanations = async () => [...rows.values()].map(copy);
  w.getAiTeacherStats = async () => ({ totalLessons: rows.size });
  w.deleteAiTeacherExplanation = async id => rows.delete(id);
  w.eval(read('js/sanitizer.js'));
  w.eval(read('js/ai-teacher-service.js'));
  w.eval(read('js/views/ai-teacher.js'));
  const service = w.aiTeacherService, view = w.aiTeacherView;
  view.selectedLanguage = 'ENGLISH';
  const dispose = () => { view.onLeaveView(); dom.window.close(); };
  return { w, service, view, rows, saves, toasts, dispose };
}
async function isolated(run) {
  const e = environment();
  try { await run(e); } finally { e.dispose(); }
}
const offline = service => {
  service._callGeminiWithFallback = async () => { throw new Error('offline'); };
};
const transport = (w, response) => {
  let calls = 0;
  w.aiClient = {
    probeServerKey: async () => true, isAvailable: () => true,
    fetchGenerateContent: async (...args) => { calls++; return response(...args); }
  };
  return () => calls;
};
async function main() {
  await test('Different equations and percentages never reuse demo answers', () => isolated(async ({ service }) => {
    for (const question of ['Solve 3x + 6 = 27', '20% of 500', 'Solve 2x + 5 = 150', '15% of 2000', 'What is 15% of 200 plus 30?', 'Explain a histogram', 'Explain black holes']) {
      assert.equal(service.getDeterministicExplanation({ question }), null, question);
    }
    assert.equal(service.getDeterministicExplanation({ question: 'Solve 2x + 5 = 15', language: 'ENGLISH' }).mathSolution.finalAnswer.includes('5'), true);
    offline(service);
    await assert.rejects(service.explain({ question: 'Solve 3x + 6 = 27' }), /no matching built-in lesson/);
  }));
  await test('School level aliases select the correct curated lesson', () => isolated(({ service }) => {
    const ctx = service._resolveStudentContext('CLASS_6_8');
    assert.equal(ctx.educationLevel, 'CLASS_6');
    assert.equal(service.getDeterministicExplanation({ question: 'Photosynthesis', language: 'ENGLISH', studentContext: ctx }).difficulty, 'BEGINNER');
    assert.equal(service._resolveStudentContext('CLASS_9_10').educationLevel, 'CLASS_10');
    assert.equal(service._resolveStudentContext('CLASS_11_12').educationLevel, 'CLASS_12');
  }));
  await test('Offline answers cannot silently ignore language, level or attachments', () => isolated(async ({ service }) => {
    offline(service);
    await assert.rejects(service.explain({ question: 'What is the Indian Constitution?', language: 'ENGLISH' }), /no matching/);
    await assert.rejects(service.explain({ question: 'What is the water cycle?', language: 'HINDI' }), /no matching/);
    await assert.rejects(service.explain({ question: 'What is RAM?', imageFile: {} }), /Attachments/);
    await assert.rejects(service.explain({ question: 'Photosynthesis', advancedModes: { socratic: true } }), /advanced modes/);
    await assert.rejects(service.explain({ question: 'Photosynthesis', educationLevel: 'ADVANCED', language: 'ENGLISH' }), /no matching/);
  }));
  await test('Auxiliary requests fail honestly instead of inventing generic content', () => isolated(async ({ service }) => {
    service._callGeminiRaw = async () => { throw new Error('offline'); };
    await assert.rejects(service.makeItSimpler({ question: 'Q', currentExplanation: lesson() }), /offline/);
    await assert.rejects(service.generateAnotherExample({ question: 'Q', currentExplanation: lesson() }), /offline/);
    await assert.rejects(service.askFollowUp({ originalQuestion: 'Q', previousExplanation: lesson(), followUpQuery: 'Why?' }), /offline/);
  }));
  await test('Advanced prompt schema is valid JSON in every combination', () => isolated(({ service }) => {
    for (let flags = 0; flags < 32; flags++) {
      const prompt = service._buildPrompt({ question: 'Q', language: 'ENGLISH', advancedModes: {
        mindmap: !!(flags & 1), connections: !!(flags & 2), teachBack: !!(flags & 4), socratic: !!(flags & 8), debate: !!(flags & 16)
      } });
      const schema = prompt.split('Return a JSON object. Include ONLY fields relevant to this question (return null for irrelevant ones):\n')[1].split('\n\nREMINDERS:')[0];
      JSON.parse(schema);
    }
  }));
  const mentorshipLesson = () => ({
    ...lesson('A conceptual starting point'),
    advancedModes: { socratic: true, debate: true, mindmap: true, connections: true, teachBack: true },
    socraticTutor: { learningGoal: 'Reason about energy transfer', guidingQuestion: 'Where does the energy go?', hints: ['Track the input energy', 'Compare input and useful output'] },
    debateCoach: { claim: 'This energy source is always the best choice', supportingPoints: ['It has low operational emissions'], counterPoints: ['Availability varies with conditions'], boundary: 'Conservation of energy is a fact; suitability is contextual', reflectionQuestion: 'Which criterion matters in this situation?' },
    mindMap: { centralTopic: 'Energy', branches: [
      { title: 'Transfer', detail: 'Energy moves between objects', children: ['Heat', 'Work'] },
      { title: 'Conversion', detail: 'Energy changes form', children: ['Electrical to light'] }
    ] },
    hamsaConnections: { Economics: 'Compare costs and useful output', Biology: 'Trace energy through a food chain' },
    teachBackChallenge: 'Explain energy transfer to a younger student', teachBackCriteria: ['Describe the input and output', 'Explain one everyday example']
  });
  await test('Every mentorship switch works without a Mermaid dependency and retains selection on rerender', () => isolated(async ({ w, view }) => {
    assert.equal(w.mermaid, undefined);
    await view._renderActiveTabContent();
    const mindmap = w.document.getElementById('teacher-mode-mindmap');
    assert.ok(mindmap); assert.equal(mindmap.disabled, false);
    assert.equal(w.document.querySelectorAll('.adv-switch-card input').length, 5);
    assert.equal(w.document.querySelector('.advanced-tools-panel').tagName, 'DETAILS');
    for (const name of Object.keys(view.advancedModes)) view.toggleAdvancedMode(name, true);
    view.setLanguage('HINDI'); await Promise.resolve();
    assert.ok(Object.values(view.advancedModes).every(Boolean));
    assert.ok([...w.document.querySelectorAll('.adv-switch-card input')].every(input => input.checked));
    view.toggleAdvancedMode('__proto__', true);
    assert.equal(Object.keys(view.advancedModes).length, 5);
  }));
  await test('Mode normalization accepts only known boolean switches', () => isolated(({ service }) => {
    const modes = service.normalizeAdvancedModes({ socratic: 'true', debate: true, unknown: true });
    assert.equal(modes.socratic, false); assert.equal(modes.debate, true); assert.equal(modes.unknown, undefined);
  }));
  await test('All 32 mode combinations demand and validate the requested outputs', () => isolated(({ service }) => {
    const names = ['socratic', 'debate', 'mindmap', 'connections', 'teachBack'];
    for (let bits = 0; bits < 32; bits++) {
      const modes = Object.fromEntries(names.map((name, index) => [name, !!(bits & (1 << index))]));
      assert.equal(service.validateAdvancedOutputs(mentorshipLesson(), modes), true);
      const prompt = service._buildPrompt({ question: 'Energy', language: 'HINDI', advancedModes: modes });
      const schema = JSON.parse(prompt.split('Return a JSON object. Include ONLY fields relevant to this question (return null for irrelevant ones):\n')[1].split('\n\nREMINDERS:')[0]);
      for (const [name, field] of [['socratic', 'socraticTutor'], ['debate', 'debateCoach'], ['mindmap', 'mindMap'], ['connections', 'hamsaConnections'], ['teachBack', 'teachBackChallenge']]) assert.equal(field in schema, modes[name], `${bits}: ${field}`);
      if (modes.socratic) { assert.ok(schema.quickAnswer.includes('without revealing')); assert.ok(prompt.includes('Socratic mode: omit')); }
      if (modes.debate) assert.ok(prompt.includes('never manufacture false opposition'));
    }
  }));
  await test('Selected modes reject missing, empty or incomplete coaching content', () => isolated(({ service }) => {
    const mutations = [
      ['socratic', data => data.socraticTutor.hints = []],
      ['debate', data => data.debateCoach.counterPoints = []],
      ['mindmap', data => data.mindMap.branches.pop()],
      ['connections', data => data.hamsaConnections = {}],
      ['teachBack', data => data.teachBackCriteria = ['Only one criterion']]
    ];
    for (const [mode, mutate] of mutations) { const data = mentorshipLesson(); mutate(data); assert.equal(service.validateAdvancedOutputs(data, { [mode]: true }), false, mode); }
    const bad = mentorshipLesson(); bad.mindMap.branches[0].children = [{}];
    assert.equal(service.normalizeExplanation(bad), null);
    assert.equal(service.normalizeExplanation({ ...mentorshipLesson(), debateCoach: 'invalid' }), null);
  }));
  await test('Partial mentorship output retries a supported fallback instead of silently dropping the mode', () => isolated(async ({ w, service }) => {
    w.geminiService = { getApiKey: () => '', getActiveModel: () => 'gemini-3.6-flash', discoverAvailableModels: async () => ['gemini-3.6-flash', 'gemini-3.5-flash'], sortModelsByPreference: models => models };
    const count = transport(w, async model => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(model === 'gemini-3.6-flash' ? lesson() : mentorshipLesson()) }] } }] }) }));
    const result = await service.explain({ question: 'Energy', language: 'ENGLISH', advancedModes: { mindmap: true } });
    assert.equal(count(), 2); assert.equal(result.model, 'gemini-3.5-flash');
    assert.ok(result.data.mindMap); assert.equal(result.data.socraticTutor, undefined);
    assert.equal(result.data.advancedModes.mindmap, true);
  }));
  await test('Socratic mode removes completed solutions and answer keys while preserving selected coaching', () => isolated(async ({ w, service }) => {
    const data = { ...mentorshipLesson(), mathSolution: { finalAnswer: 'SPOILER_RESULT' }, practiceQuestions: [{ question: 'Q', answer: 'SPOILER_KEY' }], summary: ['SPOILER_SUMMARY'] };
    transport(w, async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] }) }));
    const result = await service.explain({ question: 'Q', language: 'ENGLISH', advancedModes: data.advancedModes });
    assert.ok(result.data.socraticTutor); assert.ok(result.data.mindMap);
    for (const field of ['mathSolution', 'steps', 'examples', 'practiceQuestions', 'summary', 'examPoints']) assert.equal(result.data[field], null, field);
  }));
  await test('Guided and evaluative follow-ups carry specific intent, rubric, language and history', () => isolated(async ({ service }) => {
    let prompt;
    service._callGeminiRaw = async value => { prompt = value; return '{"followUpAnswer":"Specific feedback","checkQuestion":"Next step?"}'; };
    for (const intent of ['socratic', 'debate', 'teachBack']) {
      await service.askFollowUp({ originalQuestion: 'Energy', previousExplanation: mentorshipLesson(), followUpQuery: 'MY_REASONING', replyIntent: intent, language: 'HINDI', history: [{ query: 'EARLIER_ATTEMPT', response: { followUpAnswer: 'Earlier feedback' } }] });
      assert.ok(prompt.includes(`Reply purpose: ${intent}`)); assert.ok(prompt.includes('MY_REASONING')); assert.ok(prompt.includes('EARLIER_ATTEMPT')); assert.ok(prompt.includes('HINDI'));
      if (intent === 'teachBack') assert.ok(prompt.includes('EACH teachBackCriteria item'));
      if (intent === 'debate') assert.ok(prompt.includes('Do not dispute settled facts'));
      assert.ok(prompt.includes('unless the student explicitly requests the full answer'));
    }
  }));
  await test('Simpler and extra-example actions preserve Socratic guidance', () => isolated(async ({ service }) => {
    const prompts = [];
    service._callGeminiRaw = async value => { prompts.push(value); return '{"simplerQuickAnswer":"Hint","storyExplanation":"Concept setup","scenario":"A different setup","howItApplies":"Think about the inputs"}'; };
    await service.makeItSimpler({ question: 'Q', currentExplanation: mentorshipLesson() });
    await service.generateAnotherExample({ question: 'Q', currentExplanation: mentorshipLesson() });
    assert.equal(prompts.length, 2); assert.ok(prompts.every(prompt => prompt.includes('Use hints rather than worked solutions')));
  }));
  await test('All five result sections open initially; native maps and hidden hints need no renderer', () => isolated(({ w, view, service }) => {
    view.currentExplanation = service.normalizeExplanation(mentorshipLesson());
    view._updateResultsDOM(view._buildResponseHTML());
    for (const id of ['socratic', 'debate', 'mindmap', 'connections', 'teachback']) assert.equal(w.document.querySelector(`[data-notebook-section="${id}"]`).open, true, id);
    assert.equal(w.document.querySelectorAll('.mentor-map-branch').length, 2);
    assert.equal(w.document.querySelectorAll('.mentor-hints details[open]').length, 0);
    assert.ok(!w.document.getElementById('teacher-results-container').textContent.includes('Renderer unavailable'));
    w.document.querySelector('[data-notebook-section="mindmap"]').open = false;
    view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(w.document.querySelector('[data-notebook-section="mindmap"]').open, false);
  }));
  await test('Mentorship reply actions preserve drafts and send the chosen intent', () => isolated(async ({ w, view, service, saves }) => {
    view.currentExplanation = mentorshipLesson(); view._updateResultsDOM(view._buildResponseHTML());
    w.document.getElementById('followup-input-field').value = 'MY_TEACH_BACK';
    view.beginMentorshipReply('teachBack');
    assert.equal(w.document.getElementById('followup-input-field').value, 'MY_TEACH_BACK');
    assert.ok(w.document.getElementById('followup-input-field').placeholder.includes('own words'));
    let request;
    service.askFollowUp = async args => { request = args; return { followUpAnswer: 'Specific feedback', checkQuestion: 'TRY_AGAIN_QUESTION' }; };
    await view.sendFollowUp();
    assert.equal(request.replyIntent, 'teachBack'); assert.equal(request.followUpQuery, 'MY_TEACH_BACK');
    assert.equal(saves.at(-1).followUpHistory[0].replyIntent, 'teachBack');
    assert.ok(w.document.querySelector('.mentorship-next-question').textContent.includes('TRY_AGAIN_QUESTION'));
    for (const mode of ['socratic', 'debate', 'teachBack']) {
      const button = [...w.document.querySelectorAll('.mentor-reply-btn')].find(button => button.getAttribute('onclick').includes(`('${mode}')`));
      assert.equal(button.disabled, false, `${mode} reply must remain available after feedback`);
      view.beginMentorshipReply(mode); assert.equal(view._mentorshipIntent, mode);
    }
    view.beginMentorshipReply('question'); assert.equal(view._mentorshipIntent, 'question');
  }));
  await test('Failed feedback preserves the student attempt for retry', () => isolated(async ({ w, view, service }) => {
    view.currentExplanation = mentorshipLesson(); view._updateResultsDOM(view._buildResponseHTML()); view.beginMentorshipReply('debate');
    service.askFollowUp = async () => { throw new Error('temporarily unavailable'); };
    w.document.getElementById('followup-input-field').value = 'MY_ARGUMENT'; await view.sendFollowUp();
    assert.equal(w.document.getElementById('followup-input-field').value, 'MY_ARGUMENT');
    assert.equal(view.followUpHistory.length, 0); assert.equal(view.isFollowUpLoading, false);
    assert.ok([...w.document.querySelectorAll('.mentor-reply-btn')].every(button => !button.disabled));
  }));
  await test('A draft typed while feedback is pending survives the response render', () => isolated(async ({ w, view, service }) => {
    view.currentExplanation = mentorshipLesson(); view._updateResultsDOM(view._buildResponseHTML());
    const response = deferred(); service.askFollowUp = () => response.promise;
    w.document.getElementById('followup-input-field').value = 'FIRST_ATTEMPT'; const pending = view.sendFollowUp();
    w.document.getElementById('followup-input-field').value = 'NEXT_DRAFT';
    response.resolve({ followUpAnswer: 'Feedback' }); await pending;
    assert.equal(w.document.getElementById('followup-input-field').value, 'NEXT_DRAFT');
  }));
  await test('Reply remains visible if saving feedback fails', () => isolated(async ({ w, view, service, toasts }) => {
    view.currentExplanation = mentorshipLesson(); view._updateResultsDOM(view._buildResponseHTML());
    service.askFollowUp = async () => ({ followUpAnswer: 'READY_FEEDBACK' }); w.saveAiTeacherExplanation = async () => { throw new Error('storage full'); };
    w.document.getElementById('followup-input-field').value = 'Attempt'; await view.sendFollowUp();
    assert.ok(w.document.getElementById('teacher-results-container').textContent.includes('READY_FEEDBACK'));
    assert.ok(toasts.some(([message]) => message.includes('history could not be saved')));
  }));
  await test('Saved mentorship settings and content reload independently of current switches', () => isolated(async ({ w, view, service, rows }) => {
    const data = mentorshipLesson(); service.explain = async () => ({ data }); view.advancedModes = { ...data.advancedModes }; await view.handleExplain();
    const id = view.currentRecordId; assert.ok(rows.get(id).structuredData.mindMap);
    view.advancedModes = service.normalizeAdvancedModes(); await view.loadSavedLesson(id);
    assert.ok(Object.values(view.advancedModes).every(Boolean)); assert.ok(Object.values(view._lessonSettings.advancedModes).every(Boolean));
    assert.equal(view.currentExplanation.mindMap.centralTopic, 'Energy');
  }));
  await test('Mind maps and coaching content cannot inject HTML and remain complete in copy/PDF', () => isolated(({ w, view, service }) => {
    const data = mentorshipLesson(); data.mindMap.branches[0].children.push('<img src=x onerror="window.injected=true">');
    data.socraticTutor.guidingQuestion += ' SOCRATIC_EXPORT'; data.debateCoach.boundary += ' DEBATE_EXPORT'; data.teachBackCriteria.push('RUBRIC_EXPORT');
    view.currentExplanation = service.normalizeExplanation(data); view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(w.document.querySelector('.mentor-mindmap img'), null); assert.equal(w.injected, undefined);
    for (const marker of ['SOCRATIC_EXPORT', 'DEBATE_EXPORT', 'RUBRIC_EXPORT', 'Energy changes form', 'Electrical to light']) {
      assert.ok(view._lessonMarkdown().includes(marker), marker); assert.ok(view._generateBookHTMLForExport().includes(marker), marker);
    }
  }));
  await test('Legacy mind-map and teach-back records remain readable without dependencies', () => isolated(({ view, service }) => {
    const data = { ...lesson(), mermaidMindmap: 'graph TD; A[Old concept] --> B[Old connection]', teachBackChallenge: 'Explain the old concept' };
    view.currentExplanation = service.normalizeExplanation(data);
    assert.ok(view._buildResponseHTML().includes('Old connection'));
    assert.ok(view._lessonMarkdown().includes('Old connection'));
    assert.equal(service.lessonAdvancedModes(data).mindmap, true);
  }));
  await test('Selected PDF text is not silently cut at 3000 characters', () => isolated(({ service }) => {
    const prompt = service._buildPrompt({ question: 'Q', pdfContext: 'a'.repeat(4500) + 'END_OF_DOCUMENT' });
    assert.ok(prompt.includes('END_OF_DOCUMENT'));
  }));
  await test('Response validation rejects invalid lists, empty lessons and invalid optional values', () => isolated(({ service }) => {
    for (const data of [{}, [], { quickAnswer: 'OK', steps: 'bad' }, { quickAnswer: 'OK', steps: [null] }, { quickAnswer: 'OK', practiceQuestions: [{ options: 'bad' }] }]) {
      assert.equal(service.normalizeExplanation(data), null);
    }
    assert.equal(service._parseJsonSafely('{"followUpAnswer":"ok","miniAnalogy":{}}', ['followUpAnswer']), null);
    assert.equal(service.normalizeExplanation(lesson()).foundation.title, 'Foundation title');
  }));
  await test('AI and imported step numbers cannot inject executable HTML', () => isolated(({ service, view, w }) => {
    const malicious = '<img src=x onerror="window.teacherInjected=true">';
    const data = lesson(); data.steps[0].stepNumber = malicious;
    assert.equal(service.normalizeExplanation(data).steps[0].stepNumber, 1);
    view.currentExplanation = data;
    const holder = w.document.createElement('div'); holder.innerHTML = view._buildResponseHTML();
    assert.equal(holder.querySelector('[onerror]'), null);
    assert.ok(!view._buildResponseHTML().includes('✓ Verified'));
  }));
  await test('Minimal valid maths answers appear on screen and in exports', () => isolated(({ service, view }) => {
    view.currentExplanation = service.normalizeExplanation({ mathSolution: { finalAnswer: 'MINIMAL_MATH_ANSWER' } });
    assert.ok(view._buildResponseHTML().includes('MINIMAL_MATH_ANSWER'));
    assert.ok(view._generateBookHTMLForExport().includes('MINIMAL_MATH_ANSWER'));
  }));
  await test('Notebook keeps the core visible and all deeper content available without clipping', () => isolated(({ view, w }) => {
    const data = lesson();
    data.foundation.explanation = 'DEEP_FOUNDATION '.repeat(150);
    data.steps[0].content = 'FULL_REASONING '.repeat(100);
    data.mathSolution = { formula: 'FORMULA_CONTENT', finalAnswer: 'FORMULA_RESULT' };
    view.currentExplanation = data;
    view._updateResultsDOM(view._buildResponseHTML());
    const result = w.document.getElementById('teacher-results-container');
    assert.equal(result.querySelectorAll('details[open]').length, 0);
    assert.equal(result.querySelector('.foundation-content').closest('details'), null);
    assert.equal(result.querySelector('.takeaway-body').closest('details'), null);
    assert.equal(result.querySelector('.foundation-content').textContent, data.foundation.explanation);
    assert.equal(result.querySelector('.spine-text').textContent, data.steps[0].content);
    assert.ok(result.querySelector('[data-notebook-section="formula"]').textContent.includes('FORMULA_RESULT'));
    assert.ok(view._lessonMarkdown().includes(data.steps[0].content));
    assert.ok(view._generateBookHTMLForExport().includes(data.steps[0].content));
  }));
  await test('Notebook preserves selected open sections during updates and tab rendering', () => isolated(async ({ view, w }) => {
    view.currentExplanation = lesson();
    view._updateResultsDOM(view._buildResponseHTML());
    const result = w.document.getElementById('teacher-results-container');
    result.querySelector('[data-notebook-section="reasoning"]').open = true;
    result.querySelector('[data-notebook-section="examples"]').open = true;
    view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(result.querySelector('[data-notebook-section="reasoning"]').open, true);
    assert.equal(result.querySelector('[data-notebook-section="examples"]').open, true);
    result.querySelector('[data-notebook-section="examples"]').open = false;
    await view._renderActiveTabContent();
    assert.equal(w.document.querySelector('[data-notebook-section="reasoning"]').open, true);
    assert.equal(w.document.querySelector('[data-notebook-section="examples"]').open, false);
  }));
  await test('A new notebook resets expanded sections while maths retains its answer', () => isolated(({ view, w }) => {
    view.currentExplanation = lesson();
    view._updateResultsDOM(view._buildResponseHTML());
    w.document.querySelector('[data-notebook-section="reasoning"]').open = true;
    view._requestVersion++;
    view.currentExplanation = { ...lesson('NEW_ANSWER'), isMath: true,
      mathSolution: { finalAnswer: 'VISIBLE_MATH_RESULT', calculationSteps: [{ math: 'x = 5', explanation: 'Full calculation' }] } };
    view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(w.document.querySelectorAll('details[open]').length, 0);
    assert.equal(w.document.querySelector('.math-final-val').closest('details'), null);
    assert.ok(w.document.querySelector('[data-notebook-section="calculation"]'));
    assert.equal(w.document.querySelector('[data-notebook-section="formula"]'), null);
  }));
  await test('Useful visuals show initially, preserve student choices and reset for a new lesson', () => isolated(({ w, view }) => {
    const data = { ...lesson(),
      flowchart: { title: 'Causal process', nodes: [{ label: 'Cause', description: 'Cause explanation' }, { label: 'Result', description: 'Result explanation' }] },
      diagram: { title: 'Labelled illustration', svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 180"><text x="20" y="40">Concept label</text></svg>', caption: 'How to read the illustration' } };
    view.currentExplanation = data;
    view._updateResultsDOM(view._buildResponseHTML());
    const result = w.document.getElementById('teacher-results-container');
    assert.equal(result.querySelector('.notebook-visuals-grid [data-notebook-section="flow"]').open, true);
    assert.equal(result.querySelector('.notebook-visuals-grid [data-notebook-section="diagram"]').open, true);
    assert.ok(result.querySelector('.diagram-viewer-box svg text').textContent.includes('Concept label'));
    result.querySelector('[data-notebook-section="diagram"]').open = false;
    view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(result.querySelector('[data-notebook-section="diagram"]').open, false);
    assert.equal(result.querySelector('[data-notebook-section="flow"]').open, true);
    view._requestVersion++;
    view._updateResultsDOM(view._buildResponseHTML());
    assert.equal(result.querySelector('[data-notebook-section="diagram"]').open, true);
    assert.ok(view._generateBookHTMLForExport().includes('How to read the illustration'));
  }));
  await test('Imported history IDs cannot inject inline handlers', () => isolated(async ({ w, view }) => {
    w.getAllAiTeacherExplanations = async () => [{ id: '1);window.teacherInjected=true;//', question: 'Q', createdAt: '2026-01-01' }];
    const html = await view._buildVaultHTML();
    assert.ok(!html.includes('window.teacherInjected')); assert.ok(html.includes('loadSavedLesson(0)'));
  }));
  await test('Local proxy generation uses shared transport and propagates cancellation', () => isolated(async ({ w, service }) => {
    const count = transport(w, async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; });
    w.geminiService = { getApiKey: () => '', getActiveModel: () => 'preferred-model',
      discoverAvailableModels: async () => ['one', 'two', 'three'], sortModelsByPreference: models => models };
    w.fetch = () => { throw new Error('Unexpected direct request'); };
    await assert.rejects(service.explain({ question: 'Photosynthesis' }), { name: 'AbortError' });
    assert.equal(count(), 1);
  }));
  await test('Proxy-only credentials work and preserve response provenance', () => isolated(async ({ w, service }) => {
    transport(w, async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(lesson()) }] } }] }) }));
    const result = await service.explain({ question: 'Q' });
    assert.equal(result.source, 'GEMINI_AI'); assert.equal(result.data.generation.source, 'GEMINI_AI');
  }));
  await test('Blocked or truncated AI responses cannot count as completed lessons', () => isolated(async ({ w, service }) => {
    for (const finishReason of ['MAX_TOKENS', 'SAFETY']) {
      transport(w, async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(lesson()) }] } }] }) }));
      await assert.rejects(service._callGeminiWithFallback('Q'), /cut short|could not complete/);
    }
  }));
  await test('Rapid Explain clicks launch one generation and preserve its settings', () => isolated(async ({ view, service, saves }) => {
    const request = deferred(); let calls = 0;
    service.explain = () => { calls++; return request.promise; };
    const pending = view.handleExplain();
    await view.handleExplain();
    view.selectedLanguage = 'HINDI';
    request.resolve({ data: lesson() }); await pending;
    assert.equal(calls, 1); assert.equal(saves[0].language, 'ENGLISH');
  }));
  await test('Clear cancels work and pending answers cannot reappear', () => isolated(async ({ view, service, saves }) => {
    const request = deferred(); let signal;
    service.explain = options => { signal = options.signal; return request.promise; };
    const pending = view.handleExplain(); view.handleClear();
    assert.equal(signal.aborted, true);
    request.resolve({ data: lesson() }); await pending;
    assert.equal(view.currentExplanation, null); assert.equal(saves.length, 0); assert.equal(view.loadingInterval, null);
  }));
  await test('Old response cannot replace a newer question after Clear', () => isolated(async ({ view, service, w }) => {
    const old = deferred(), fresh = deferred(); let calls = 0;
    service.explain = () => ++calls === 1 ? old.promise : fresh.promise;
    const first = view.handleExplain(); view.handleClear();
    w.document.getElementById('ai-teacher-input').value = 'Question two';
    const second = view.handleExplain();
    fresh.resolve({ data: lesson('New answer') }); await second;
    old.resolve({ data: lesson('Old answer') }); await first;
    assert.equal(view.currentExplanation.quickAnswer, 'New answer'); assert.equal(view._lessonQuestion, 'Question two');
  }));
  await test('Save failure never bookmarks a previous lesson', () => isolated(async ({ w, view, service, saves }) => {
    view.currentRecordId = 42;
    service.explain = async () => ({ data: lesson() });
    const save = w.saveAiTeacherExplanation;
    w.saveAiTeacherExplanation = async () => { throw new Error('storage full'); };
    await view.handleExplain(); assert.equal(view.currentRecordId, null);
    w.saveAiTeacherExplanation = save; await view.toggleBookmark();
    assert.notEqual(view.currentRecordId, 42); assert.equal(saves[0].isBookmarked, true);
  }));
  await test('Simpler, examples and follow-up conversation survive saved-lesson reload', () => isolated(async ({ view, service, w, saves }) => {
    service.explain = async () => ({ data: lesson() }); await view.handleExplain();
    service.makeItSimpler = async () => ({ simplerQuickAnswer: 'Simplified answer', storyExplanation: 'Simplified foundation' });
    await view.makeSimpler();
    service.generateAnotherExample = async () => ({ title: 'New example', scenario: 'New scenario', howItApplies: 'Application' });
    await view.anotherExample();
    service.askFollowUp = async () => ({ followUpAnswer: 'Follow-up answer' });
    w.document.getElementById('followup-input-field').value = 'Follow-up doubt'; await view.sendFollowUp();
    const id = view.currentRecordId;
    assert.equal(saves.at(-1).followUpHistory.length, 1);
    await view.loadSavedLesson(id);
    assert.equal(view.currentExplanation.quickAnswer, 'Simplified answer');
    assert.equal(view.currentExplanation.examples[0].title, 'New example');
    assert.equal(view.followUpHistory[0].query, 'Follow-up doubt');
  }));
  await test('Lesson edits ignore stale responses after a clear or navigation', () => isolated(async ({ view, service }) => {
    view.currentExplanation = lesson(); const pending = deferred();
    service.makeItSimpler = () => pending.promise;
    const action = view.makeSimpler(); view.onLeaveView();
    pending.resolve({ simplerQuickAnswer: 'Stale answer', storyExplanation: 'Stale foundation' }); await action;
    assert.equal(view.currentExplanation.quickAnswer, 'A valid explanation');
    assert.equal(view._requestControllers.size, 0);
  }));
  await test('Follow-up prompt includes lesson steps and previous conversation', () => isolated(async ({ service }) => {
    let prompt;
    service._callGeminiRaw = async text => { prompt = text; return '{"followUpAnswer":"OK"}'; };
    await service.askFollowUp({ originalQuestion: 'Q', previousExplanation: lesson(), followUpQuery: 'Why?',
      history: [{ query: 'Earlier doubt', response: { followUpAnswer: 'Earlier answer' } }] });
    assert.ok(prompt.includes('Step detail')); assert.ok(prompt.includes('Earlier answer'));
  }));
  await test('Copy and PDF preserve maths, diagrams, sources, all examples and follow-ups', () => isolated(({ view, w }) => {
    view.currentExplanation = { ...lesson(), isMath: true,
      mathSolution: { formula: 'f', finalAnswer: 'ANSWER_42', alternateMethod: 'ALTERNATE_MARKER' },
      diagram: { title: 'DIAGRAM_MARKER', svgContent: '<svg xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg>' },
      sources: [{ name: 'SOURCE_MARKER', detail: 'Source detail' }],
      hamsaConnections: { Art: 'CONNECTION_MARKER' }, teachBackChallenge: 'TEACH_BACK_MARKER',
      examples: [1, 2, 3].map(n => ({ title: `Example ${n}`, description: `EXAMPLE_MARKER_${n}` })) };
    view.followUpHistory = [{ query: 'FOLLOWUP_MARKER', response: { followUpAnswer: 'Follow-up answer' } }];
    const markdown = view._lessonMarkdown();
    const html = view._generateBookHTMLForExport();
    for (const marker of ['ANSWER_42', 'ALTERNATE_MARKER', 'DIAGRAM_MARKER', 'SOURCE_MARKER', 'CONNECTION_MARKER', 'TEACH_BACK_MARKER', 'EXAMPLE_MARKER_3', 'FOLLOWUP_MARKER']) {
      assert.ok(markdown.includes(marker), `Copy missing ${marker}`); assert.ok(html.includes(marker), `PDF missing ${marker}`);
    }
    const doc = new JSDOM(html).window.document;
    assert.ok(doc.querySelector('svg')); assert.ok(!html.includes('100% Academic Integrity'));
    assert.ok(html.includes('.hamsa-book-export-root *'));
  }));
  await test('Invalid image replacement keeps the previous valid attachment', () => isolated(async ({ view }) => {
    view.attachedImage = { file: { name: 'old.png' }, previewUrl: 'blob:old' };
    await view.handleImageUpload({ target: { files: [{ type: 'image/svg+xml', size: 4 }], value: 'upload' } });
    assert.equal(view.attachedImage.file.name, 'old.png');
  }));
  await test('Image-only uploads can use the existing Explain action', () => isolated(async ({ view, service, w }) => {
    w.document.getElementById('ai-teacher-input').value = '';
    view.attachedImage = { file: { type: 'image/png', size: 100 } };
    let options;
    service.explain = async request => { options = request; return { data: lesson() }; };
    await view.handleExplain();
    assert.ok(options.imageFile); assert.ok(options.question.includes('attached image'));
  }));
  await test('Scanned PDFs fail clearly without replacing another tab document', () => isolated(async ({ view, w }) => {
    const quizExtractor = { currentFile: 'quiz.pdf' }; w.pdfExtractor = quizExtractor;
    w.PdfExtractorService = class {
      async loadPdfFile() { this.metadata = { pageCount: 20 }; }
      async extractTextFromPageRange() { return { text: '--- [PAGE 1 START] ---', extractedPages: [{ text: '' }] }; }
    };
    await view.handlePdfUpload({ target: { files: [{ name: 'scan.pdf', type: 'application/pdf', size: 100 }] } });
    assert.equal(w.pdfExtractor, quizExtractor); assert.equal(view.attachedPdf, null);
  }));
  await test('PDF attachment cannot return after Clear', () => isolated(async ({ view, w }) => {
    const pending = deferred(); w.pdfExtractor = {};
    w.PdfExtractorService = class {
      async loadPdfFile() { await pending.promise; this.metadata = { pageCount: 1 }; }
      async extractTextFromPageRange() { return { text: 'PDF content', extractedPages: [{ text: 'PDF content' }] }; }
    };
    const upload = view.handlePdfUpload({ target: { files: [{ name: 'book.pdf', type: 'application/pdf', size: 100 }] } });
    view.handleClear(); pending.resolve(); await upload;
    assert.equal(view.attachedPdf, null);
  }));
  await test('PDF diagrams retain intrinsic dimensions and sanitization without changing the lesson', () => isolated(({ view, w }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" width="100%" height="100%" onload="bad()"><script>bad()</script><text x="20" y="50">Diagram label</text></svg>';
    view.currentExplanation = { ...lesson(), diagram: { title: 'Diagram', svgContent: svg } };
    const holder = w.document.createElement('div'); holder.innerHTML = view._generateBookHTMLForExport();
    const exported = holder.querySelector('svg');
    assert.equal(exported.getAttribute('width'), '640');
    assert.equal(exported.getAttribute('height'), '240');
    assert.equal(exported.getAttribute('viewBox'), '0 0 640 240');
    assert.equal(exported.querySelector('script'), null);
    assert.equal(exported.getAttribute('onload'), null);
    assert.ok(exported.textContent.includes('Diagram label'));
    assert.equal(view.currentExplanation.diagram.svgContent, svg);
    assert.equal(view._diagramSvgForExport('Invalid image'), '');
  }));
  await test('PDF export keeps its original lesson after Clear and releases its DOM', () => isolated(async ({ view, w }) => {
    const fonts = deferred(); Object.defineProperty(w.document, 'fonts', { value: { ready: fonts.promise } });
    view.currentExplanation = lesson('PDF_ORIGINAL_ANSWER'); let exported = '', filename = '';
    w.html2pdf = () => ({ set(options) { filename = options.filename; return this; },
      from(node) { exported = node.innerHTML; return this; }, save() { return Promise.resolve(); } });
    const pending = view.downloadPdf(); view.handleClear(); fonts.resolve(); await pending;
    assert.ok(exported.includes('PDF_ORIGINAL_ANSWER')); assert.ok(filename.includes('Test_lesson'));
    assert.equal(w.document.getElementById('hamsa-printable-book-export-container'), null);
    assert.equal(view._pdfExporting, false);
  }));
  await test('PDF capture isolates light paper and scroll coordinates without changing the app theme', () => isolated(async ({ view, w }) => {
    view.currentExplanation = lesson('VISIBLE_PDF_TEXT');
    w.document.documentElement.dataset.theme = 'DARK';
    Object.defineProperty(w, 'scrollY', { value: 1800 });
    const clone = w.document.implementation.createHTMLDocument('PDF capture');
    clone.documentElement.dataset.theme = 'DARK';
    let settings;
    w.html2pdf = () => ({ set(options) { settings = options; return this; },
      from(node) { assert.ok(node.textContent.includes('VISIBLE_PDF_TEXT')); return this; },
      async save() { settings.html2canvas.onclone(clone); } });
    await view.downloadPdf();
    assert.equal(settings.html2canvas.scrollX, 0);
    assert.equal(settings.html2canvas.scrollY, 0);
    assert.equal(clone.documentElement.dataset.theme, 'LIGHT');
    assert.equal(w.document.documentElement.dataset.theme, 'DARK');
    assert.equal(w.scrollY, 1800);
    assert.equal(w.document.getElementById('hamsa-printable-book-export-container'), null);
  }));
  await test('Synchronous PDF failures fall back to the same lesson and clean up', () => isolated(async ({ view, w }) => {
    view.currentExplanation = lesson('PRINT_SNAPSHOT'); let printed = '';
    w.html2pdf = () => { throw new Error('renderer failure'); };
    w.open = () => ({ document: { open() {}, write(html) { printed = html; }, close() {} } });
    await view.downloadPdf();
    assert.ok(printed.includes('PRINT_SNAPSHOT'));
    assert.equal(w.document.getElementById('hamsa-printable-book-export-container'), null);
  }));
  await test('Vault empty results preserve the search input and focus', () => isolated(async ({ view, w }) => {
    view.activeTab = 'history'; await view.render();
    const input = w.document.querySelector('.vault-search-input'); input.focus(); input.value = 'missing';
    await view._renderVaultCardsOnly(false);
    assert.equal(w.document.querySelector('.vault-search-input'), input);
    assert.equal(w.document.activeElement, input);
  }));
  await test('Navigation stops voice recognition and prevents late transcripts', () => isolated(({ view }) => {
    let aborted = false;
    const recognition = { abort() { aborted = true; }, onresult() {}, onerror() {}, onstart() {}, onend() {} };
    view.recognition = recognition; view.isListeningVoice = true;
    view.onLeaveView();
    assert.equal(aborted, true); assert.equal(recognition.onresult, null);
    assert.equal(recognition.onerror, null); assert.equal(view.isListeningVoice, false);
  }));
  await test('Saved lesson loading clears stale attachments and cancels pending work', () => isolated(async ({ view, rows }) => {
    rows.set(1, { id: 1, question: 'Saved question', structuredData: lesson(), language: 'ENGLISH' });
    view.attachedPdf = 'Old PDF'; view.attachedImage = { previewUrl: 'blob:old' };
    const controller = view._createRequestController();
    await view.loadSavedLesson(1);
    assert.equal(controller.signal.aborted, true); assert.equal(view.attachedPdf, null); assert.equal(view.attachedImage, null);
  }));
  await test('Vault selection remains selected after a full render', () => isolated(async ({ view }) => {
    view.vaultSubjectFilter = 'Economy';
    const doc = new JSDOM(await view._buildVaultHTML()).window.document;
    assert.equal(doc.querySelector('select').value, 'Economy');
  }));
  await test('Deleting the active saved record resets its state', () => isolated(async ({ view, rows }) => {
    rows.set(1, { id: 1 }); view.currentRecordId = 1; view.currentExplanation = lesson(); view.isBookmarked = true;
    await view.deleteSavedLesson(1, false);
    assert.equal(view.currentRecordId, null); assert.equal(view.currentExplanation, null); assert.equal(view.isBookmarked, false);
  }));
  await test('Dark selectors match actual theme values', () => {
    const css = read('css/ai-teacher/06-manuscript.css');
    assert.ok(!css.includes('[data-theme="dark"]'));
    assert.ok(css.includes('[data-theme="DARK"]')); assert.ok(css.includes('[data-theme="CHARCOAL"]'));
  });
  await test('Curated inflation facts use current CPI base and correct report recipient', () => isolated(({ service }) => {
    const text = JSON.stringify(service.getDeterministicExplanation({ question: 'Inflation', studentContext: service._resolveStudentContext('UPSC') }));
    assert.ok(text.includes('2024')); assert.ok(text.includes('Central Government')); assert.ok(!text.includes('Union Parliament'));
  }));
  await test('Database edits preserve creation date, context and conversation; missing IDs fail', async () => {
    const rows = new Map([[1, { id: 1, createdAt: '2020-01-01T00:00:00Z' }]]);
    const table = {
      get: async id => rows.get(id),
      update: async (id, record) => { if (!rows.has(id)) return 0; rows.set(id, { ...rows.get(id), ...record }); return 1; },
      add: async record => { rows.set(2, record); return 2; }
    };
    const context = vm.createContext({ db: { aiTeacherExplanations: table }, toBookmarkFlag: value => value ? 1 : 0, Date, console });
    const src = read('js/db.js'); vm.runInContext(src.slice(src.indexOf('async function saveAiTeacherExplanation')), context);
    await context.saveAiTeacherExplanation({ id: 1, structuredData: lesson(), followUpHistory: [{ query: 'Q' }], educationLevel: 'CLASS_6_8', isBookmarked: true });
    assert.equal(rows.get(1).createdAt, '2020-01-01T00:00:00Z'); assert.equal(rows.get(1).followUpHistory.length, 1); assert.equal(rows.get(1).isBookmarked, 1);
    await assert.rejects(context.saveAiTeacherExplanation({ id: 999 }), /no longer exists/);
  });
  await test('Subject aliases include Economics and Physics without misclassifying Computer Science', async () => {
    const rows = [{ subject: 'Economics / Social Science' }, { subject: 'Physics' }, { subject: 'Computer Science' }];
    const table = { toCollection: () => ({ reverse: () => ({ sortBy: async () => rows }) }) };
    const context = vm.createContext({ db: { aiTeacherExplanations: table }, Date, console });
    const src = read('js/db.js'); vm.runInContext(src.slice(src.indexOf('async function getAllAiTeacherExplanations')), context);
    const economy = await context.getAllAiTeacherExplanations({ subject: 'Economy' }); assert.equal(economy.length, 1);
    const science = await context.getAllAiTeacherExplanations({ subject: 'Science' }); assert.equal(science.length, 2); // Economics has an explicit Social Science label.
    assert.ok(science.some(row => row.subject === 'Physics')); assert.ok(!science.some(row => row.subject === 'Computer Science'));
  });
  await test('Today counter uses local midnight instead of UTC midnight', async () => {
    const previousTZ = process.env.TZ; process.env.TZ = 'Asia/Kolkata';
    try {
      class LocalDate extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-10-01T01:00:00+05:30'])); }
      }
      const rows = [{ subject: 'Math', createdAt: '2026-09-30T19:00:00Z' }, { subject: 'Math', createdAt: '2026-09-30T17:00:00Z' }];
      const context = vm.createContext({ db: { aiTeacherExplanations: { toArray: async () => rows } }, Date: LocalDate, console });
      const src = read('js/db.js'); vm.runInContext(src.slice(src.indexOf('async function getAiTeacherStats')), context);
      assert.equal((await context.getAiTeacherStats()).lessonsToday, 1);
    } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
  });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
