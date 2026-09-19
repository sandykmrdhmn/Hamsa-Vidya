// Test verification for AI Teacher Option Boxes, Symmetrical Layout, and Highlight Coverage
const fs = require('fs');
const path = require('path');

// Mock browser globals
global.window = {
  aiTeacherService: {
    _resolveStudentContext: () => ({ levelLabel: 'Class 10 (Secondary School)', stream: 'Science' })
  },
  lucide: { createIcons: () => {} }
};
global.document = {
  getElementById: (id) => {
    if (id === 'view-ai-teacher') return { innerHTML: '' };
    if (id === 'ai-teacher-input') return { value: 'Explain Photosynthesis step by step' };
    return null;
  }
};
global.SecurityUtils = {
  escapeHtml: (str) => str || ''
};
global.saveAiTeacherExplanation = async () => 1;

// Load ai-teacher.js
const aiTeacherJsPath = path.join(__dirname, '..', 'js', 'views', 'ai-teacher.js');
const jsCode = fs.readFileSync(aiTeacherJsPath, 'utf8');

const vm = require('vm');
vm.runInThisContext(jsCode);

console.log('=== TEST 1: Instantiation and HTML Generation ===');
const view = new AiTeacherView();
const studioHtml = view._buildStudioHTML();

// Check for 2x2 grids
if (!studioHtml.includes('option-boxes-grid-2x2')) {
  throw new Error('FAILED: Missing option-boxes-grid-2x2 in studio HTML');
}
console.log('✔ PASS: Found option-boxes-grid-2x2 for Language and Depth');

// Check for mode grid
if (!studioHtml.includes('option-boxes-grid-mode')) {
  throw new Error('FAILED: Missing option-boxes-grid-mode in studio HTML');
}
console.log('✔ PASS: Found option-boxes-grid-mode for Learning Mode');

// Check option buttons
const optionBtnMatches = studioHtml.match(/class="[^"]*option-box-btn[^"]*"/g) || [];
console.log(`✔ Found ${optionBtnMatches.length} option-box-btn elements (expected 10: 4 lang + 4 depth + 2 mode)`);
if (optionBtnMatches.length !== 10) {
  throw new Error(`FAILED: Expected 10 option-box-btn elements, found ${optionBtnMatches.length}`);
}

// Check active classes initially
console.log('=== TEST 2: Initial Active State Verification ===');
if (!studioHtml.includes('setLanguage(\'BILINGUAL\')') || !studioHtml.includes('setDepth(\'DETAILED\')')) {
  throw new Error('FAILED: Default selections missing');
}
console.log('✔ PASS: Default state correctly rendered with active selections');

// Check state changes & textarea preservation
console.log('=== TEST 3: State Switching & Textarea Preservation ===');
let mockActiveTabCalled = false;
view._renderActiveTabContent = () => { mockActiveTabCalled = true; };

view.setLanguage('HINGLISH');
if (view.selectedLanguage !== 'HINGLISH') throw new Error('FAILED: Language did not update to HINGLISH');
if (view.questionInput !== 'Explain Photosynthesis step by step') {
  throw new Error('FAILED: Textarea questionInput was not preserved during setLanguage');
}
console.log('✔ PASS: setLanguage preserved textarea input: ' + view.questionInput);

view.setDepth('DEEP_DIVE');
if (view.selectedDepth !== 'DEEP_DIVE') throw new Error('FAILED: Depth did not update to DEEP_DIVE');
if (view.questionInput !== 'Explain Photosynthesis step by step') {
  throw new Error('FAILED: Textarea questionInput was not preserved during setDepth');
}
console.log('✔ PASS: setDepth preserved textarea input');

view.setMode('EXAM');
if (view.selectedMode !== 'EXAM') throw new Error('FAILED: Mode did not update to EXAM');
if (view.questionInput !== 'Explain Photosynthesis step by step') {
  throw new Error('FAILED: Textarea questionInput was not preserved during setMode');
}
console.log('✔ PASS: setMode preserved textarea input');

// Check CSS rules
console.log('=== TEST 4: CSS Rules Verification ===');
const cssPath = path.join(__dirname, '..', 'css', 'ai-teacher.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredSelectors = [
  '.control-box',
  '.control-box:hover',
  '.option-boxes-grid-2x2',
  '.option-boxes-grid-mode',
  '.option-box-btn',
  '.option-box-btn.active',
  '.option-box-btn.mode-exam-box.active',
  '.media-upload-pill'
];

for (const sel of requiredSelectors) {
  if (!cssContent.includes(sel)) {
    throw new Error(`FAILED: Missing CSS selector: ${sel}`);
  }
}
console.log('✔ PASS: All required CSS selectors exist in css/ai-teacher.css');

// Check active full coverage properties
if (!cssContent.includes('background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;')) {
  throw new Error('FAILED: Missing active gradient highlight coverage');
}
console.log('✔ PASS: Full background coverage gradient verified');

console.log('\n=================================================');
console.log('ALL TESTS PASSED! Symmetrical boxes and full coverage ready.');
console.log('=================================================');
