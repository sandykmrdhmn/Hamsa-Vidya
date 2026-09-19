// Unit & DOM integration test for Answer Writing features
const fs = require('fs');
const path = require('path');

// Minimal DOM Mock environment
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(c) { this.classes.add(c); }
  remove(c) { this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toggle(c, force) {
    if (force !== undefined) {
      if (force) this.classes.add(c);
      else this.classes.delete(c);
      return force;
    }
    if (this.classes.has(c)) {
      this.classes.delete(c);
      return false;
    } else {
      this.classes.add(c);
      return true;
    }
  }
}

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.innerHTML = '';
    this.value = '';
    this.textContent = '';
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  focus() { this._focused = true; }
  closest() { return null; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

const elementStore = new Map();

global.document = {
  getElementById: (id) => {
    if (!elementStore.has(id)) {
      elementStore.set(id, new MockElement('div', id));
    }
    return elementStore.get(id);
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => new MockElement(tag),
  body: new MockElement('body')
};

global.window = {
  document: global.document,
  audioEngine: {
    playClick: () => {},
    playSuccess: () => {},
    playTabSwitch: () => {},
    playError: () => {}
  },
  app: {
    showToast: (msg, type) => { console.log(`[Toast ${type}]: ${msg}`); }
  },
  lucide: {
    createIcons: () => {}
  }
};

// SecurityUtils mock
global.SecurityUtils = {
  escapeHtml: (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  sanitizeHtml: (str) => String(str || '')
};

// Mock Dexie DB methods
global.getAnswerAttemptById = async (id) => null;
global.getAllAnswerAttempts = async () => [];
global.getLatestAnswerDraft = async () => null;
global.saveAnswerDraft = async () => {};
global.clearAnswerDraft = async () => {};
global.saveAnswerAttempt = async (att) => ({ id: 999, ...att });
global.deleteAnswerAttempt = async () => {};

// Load answer-writing-service.js
const serviceCode = fs.readFileSync(path.join(__dirname, '../js/answer-writing-service.js'), 'utf8');
eval(serviceCode);

// Load answer-writing.js
const viewCode = fs.readFileSync(path.join(__dirname, '../js/views/answer-writing.js'), 'utf8');
eval(viewCode + '\nglobal.AnswerWritingView = AnswerWritingView;');

async function runTests() {
  console.log('--- STARTING ANSWER WRITING 100X INTEGRATION TESTS ---');

  // Test 1: Service Directive Extraction
  console.log('\n[Test 1] Directive Extraction');
  const d1 = window.answerWritingService.extractDirectiveWord('Critically evaluate the impact of digital public infrastructure on financial inclusion.');
  console.log('Extracted directive:', d1);
  if (d1 !== 'Critically Evaluate') throw new Error('Failed to extract Critically Evaluate');
  console.log('Tip:', window.answerWritingService.getDirectiveTip(d1));

  // Test 2: View Construction & Render
  console.log('\n[Test 2] View Initialization & Rendering');
  const view = new AnswerWritingView();
  await view.render();
  console.log('Active question initialized:', view.activeQuestion.title || view.activeQuestion.directive);

  // Test 3: Modal Opening (Fix for User Request)
  console.log('\n[Test 3] Open Manual Question Modal');
  const manualModal = document.getElementById('aw-manual-question-modal');
  // Initially inactive
  console.log('Before open, active class:', manualModal.classList.contains('active'));
  view.openManualQuestionModal();
  console.log('After open, active class:', manualModal.classList.contains('active'));
  console.log('After open, style.display:', manualModal.style.display);
  if (!manualModal.classList.contains('active') || manualModal.style.display !== 'flex') {
    throw new Error('openManualQuestionModal failed to activate modal!');
  }

  // Test 4: Quick Topic Inspiration Click
  console.log('\n[Test 4] Quick Topic Click (Judicial Activism)');
  // Set up elements in document store
  document.getElementById('aw-manual-question').value = '';
  document.getElementById('aw-manual-exam').value = '';
  document.getElementById('aw-manual-subject').value = '';
  document.getElementById('aw-manual-difficulty').value = '';
  document.getElementById('aw-manual-wordlimit').value = '';
  document.getElementById('aw-manual-marks').value = '';

  view.quickFillManualTopic(0);
  const qVal = document.getElementById('aw-manual-question').value;
  const wlVal = document.getElementById('aw-manual-wordlimit').value;
  const mVal = document.getElementById('aw-manual-marks').value;
  console.log('Filled Question:', qVal.substring(0, 50) + '...');
  console.log('Filled Word Limit:', wlVal);
  console.log('Filled Marks:', mVal);
  if (!qVal.includes('Judicial Activism') || wlVal != 150 || mVal != 10) {
    throw new Error('QuickFill failed to populate fields correctly!');
  }

  // Test 5: Submit Manual Question
  console.log('\n[Test 5] Submit Manual Question Form');
  const mockEvent = { preventDefault: () => {} };
  view.handleManualQuestionSubmit(mockEvent);
  console.log('New active question:', view.activeQuestion.question.substring(0, 50) + '...');
  console.log('Directive detected:', view.activeQuestion.directive);
  console.log('Manual modal after submit active class:', manualModal.classList.contains('active'));
  if (manualModal.classList.contains('active')) {
    throw new Error('Modal should be closed after submit');
  }

  // Test 6: Word Count & Progress Metrics
  console.log('\n[Test 6] Word Count & Health Detection');
  view.studentAnswerText = "Judicial activism is the exercise of judicial power to enforce constitutional rights and protect vulnerable citizens.\n\nHowever, it can lead to judicial overreach when it encroaches on the legislative domain.\n\nWay forward requires mutual institutional respect and adherence to constitutional morality.";
  const wc = view.getWordCount(view.studentAnswerText);
  console.log('Word count calculated:', wc);
  if (wc < 30) throw new Error('Word count calculation error');

  // Test 7: UPSC Exam Stopwatch
  console.log('\n[Test 7] Timer toggle and reset');
  view.toggleTimer();
  console.log('Timer running:', view.timerIsRunning);
  view.toggleTimer();
  console.log('Timer paused:', !view.timerIsRunning);
  view.resetTimer();
  console.log('Timer remaining after reset:', view.timerRemaining);

  // Test 8: AI Evaluation Generation (Deterministic Engine)
  console.log('\n[Test 8] Multi-dimensional UPSC Evaluation Engine');
  const evalResult = await window.answerWritingService.evaluateAnswer({
    question: view.activeQuestion.question,
    directive: view.activeQuestion.directive,
    studentAnswer: view.studentAnswerText,
    wordLimit: 150,
    marks: 10,
    exam: 'UPSC',
    subject: 'Polity & Governance',
    difficulty: 'DIFFICULT'
  });

  console.log('Summary:', evalResult.summary.substring(0, 80) + '...');
  console.log('Scores:', evalResult.scores);
  console.log('Strengths count:', evalResult.strengths?.length);
  console.log('Weaknesses count:', evalResult.weaknesses?.length);
  console.log('Missing Dimensions count:', evalResult.missingDimensions?.length);
  console.log('Model Answer length:', evalResult.improvedAnswer?.length, 'chars');

  if (!evalResult.scores || !evalResult.scores.overall || !evalResult.improvedAnswer) {
    throw new Error('Evaluation did not return comprehensive multi-dimensional structure');
  }

  console.log('\n✅ ALL 8 VERIFICATION TESTS PASSED FLAWLESSLY!');
}

runTests().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
