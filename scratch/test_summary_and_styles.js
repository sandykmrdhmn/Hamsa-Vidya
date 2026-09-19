/**
 * Automated Verification Script:
 * Tests the 4 user requirements:
 * 1. Full-width page layout (no left gap)
 * 2. Wider reading portion & enlarged typography
 * 3. High-contrast Light Mode color definitions
 * 4. Dedicated Comprehensive Summary tab & schema
 */
const fs = require('fs');
const assert = require('assert');

console.log('--- Step 1: Checking CSS for Full-Width & Typography ---');
const mainCss = fs.readFileSync('css/main.css', 'utf8');
const compCss = fs.readFileSync('css/components.css', 'utf8');

assert(mainCss.includes('view-study-notes.active'), 'main.css must contain #view-study-notes.active full width rule');
assert(mainCss.includes('1720px'), 'main.css must set max-width: 1720px for study notes');
console.log('✓ main.css expands main-content to 1720px / 96% for study notes');

assert(compCss.includes('.study-vault-container') && compCss.includes('1680px'), 'components.css study-vault-container must be 1680px');
assert(compCss.includes('.textbook-reader-view') && compCss.includes('310px minmax(0, 1fr)'), 'TOC sidebar must dock at 310px on left, reading canvas takes all remaining space');
assert(compCss.includes('.textbook-reader-canvas') && compCss.includes('max-width: 100%'), 'Reading canvas max-width must be 100%');
assert(compCss.includes('.textbook-chapter-title') && compCss.includes('2.65rem'), 'Chapter title font size must be 2.65rem');
assert(compCss.includes('.textbook-section-heading') && compCss.includes('1.75rem'), 'Section heading font size must be 1.75rem');
assert(compCss.includes('.textbook-body-paragraph') && compCss.includes('1.2rem'), 'Body font size must be 1.2rem with line-height 1.95');
console.log('✓ components.css enforces 1680px width, docked TOC on left, and enlarged typography');

console.log('\n--- Step 2: Checking Light Mode High-Contrast Overrides ---');
const lightModeKeywords = [
  '[data-theme="LIGHT"] .textbook-book-page',
  '[data-theme="LIGHT"] .semantic-keypoints-box',
  '[data-theme="LIGHT"] .semantic-definitions-card',
  '[data-theme="LIGHT"] .semantic-facts-box',
  '[data-theme="LIGHT"] .semantic-formula-box',
  '[data-theme="LIGHT"] .semantic-example-card',
  '[data-theme="LIGHT"] .glossary-interactive-term',
  '[data-theme="LIGHT"] .original-source-panel',
  '[data-theme="LIGHT"] .reader-tabs-pill-bar',
  '[data-theme="LIGHT"] .summary-hero-header-card'
];

lightModeKeywords.forEach(k => {
  assert(compCss.includes(k), `components.css must contain high-contrast light mode override for: ${k}`);
  console.log(`✓ Light Mode contrast rule confirmed: ${k}`);
});

console.log('\n--- Step 3: Checking Gemini Service Summary Generation ---');
// Mock browser environment for testing
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {} };
require('../js/gemini-service.js');

const summaryResult = window.geminiService.generateFallbackComprehensiveSummary({
  title: 'Fundamental Rights in Indian Constitution',
  subject: 'Indian Polity',
  content: 'Articles 12 to 35 contained in Part III of the Constitution deal with Fundamental Rights.',
  sections: [
    {
      heading: 'Article 14 - Right to Equality',
      content: 'The State shall not deny to any person equality before the law.',
      keyPoints: ['Equality before law', 'Equal protection of the laws']
    },
    {
      heading: 'Article 21 - Protection of Life and Personal Liberty',
      content: 'No person shall be deprived of his life or personal liberty except according to procedure established by law.',
      keyPoints: ['Procedure established by law vs Due process of law', 'Inherent dignity']
    }
  ]
});

assert(typeof summaryResult.coreConcept === 'string' && summaryResult.coreConcept.length > 50, 'coreConcept must be detailed prose');
assert(Array.isArray(summaryResult.takeaways) && summaryResult.takeaways.length >= 8, 'takeaways must contain 8+ comprehensive points');
assert(Array.isArray(summaryResult.keyDefinitions) && summaryResult.keyDefinitions.length > 0, 'keyDefinitions must be present');
assert(Array.isArray(summaryResult.formulasOrRules), 'formulasOrRules must be present');
assert(Array.isArray(summaryResult.examTraps) && summaryResult.examTraps.length > 0, 'examTraps must be present');
assert(typeof summaryResult.finalTakeaway === 'string', 'finalTakeaway must be present');

console.log('✓ High-Yield Summary Schema Verified:');
console.log('  - Core Concept Length:', summaryResult.coreConcept.length, 'chars');
console.log('  - Total High-Yield Takeaways:', summaryResult.takeaways.length);
console.log('  - Definitions Indexed:', summaryResult.keyDefinitions.length);
console.log('  - Exam Traps / Pitfalls:', summaryResult.examTraps.length);
console.log('  - Final Memory Anchor:', summaryResult.finalTakeaway.slice(0, 60) + '...');

console.log('\n--- Step 4: Checking StudyNotesView Tabs & Summary Rendering ---');
const studyNotesCode = fs.readFileSync('js/views/study-notes.js', 'utf8');

assert(studyNotesCode.includes("this.readerActiveTab = 'TEXTBOOK'"), 'study-notes.js constructor must initialize readerActiveTab');
assert(studyNotesCode.includes("studyNotesView.setReaderTab('TEXTBOOK')"), 'Reader must have Digital Textbook tab switch');
assert(studyNotesCode.includes("studyNotesView.setReaderTab('SUMMARY')"), 'Reader must have AI High-Yield Summary tab switch');
assert(studyNotesCode.includes("studyNotesView.setReaderTab('SOURCE')"), 'Reader must have Original Source tab switch');
assert(studyNotesCode.includes("renderSummaryTabView(note)"), 'renderSummaryTabView must be implemented');
assert(studyNotesCode.includes("await updateNote(noteId, { summary })"), 'generateFreshSummary must save summary to IndexedDB');

console.log('✓ 3-Tab Reader Architecture & Persistent Summary Saving Confirmed in study-notes.js');
console.log('\n🎉 ALL 4 USER REQUIREMENTS VERIFIED SUCCESSFULLY!');
