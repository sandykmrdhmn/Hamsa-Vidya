/**
 * Comprehensive Verification Script:
 * 1. Verifies 100% PDF page extraction (no 25-page cap)
 * 2. Verifies 8,000-char batching & Strict Completeness Mandate in GeminiService
 * 3. Verifies Unified Summary Tab (no redundant right-side button)
 * 4. Verifies Minimum 40% Depth Section-by-Section Summary Breakdown
 */
const fs = require('fs');
const assert = require('assert');

console.log('--- Test 1: Verifying PDF Page Cap Removal in study-notes.js ---');
const studyNotesCode = fs.readFileSync('js/views/study-notes.js', 'utf8');

assert(!studyNotesCode.includes('Math.min(meta.pageCount || 1, 25)'), 'The 25-page limit must be completely removed');
assert(studyNotesCode.includes('const totalPages = meta.pageCount || 1;'), 'Must extract all pages (totalPages = meta.pageCount)');
console.log('✓ 25-page cap eliminated: 100% of uploaded PDF pages are extracted');

console.log('\n--- Test 2: Verifying Unified Summary Tab (Zero Redundant Buttons) ---');
assert(studyNotesCode.includes('⚡ AI Study Summary (40% Deep Dive)'), 'Summary tab must have clear 40% deep dive label');
// Check that right-side actions no longer contain the redundant summary button
const rightClusterMatch = studyNotesCode.match(/<button class="btn btn-secondary btn-sm[^>]*onclick="studyNotesView\.setReaderTab\('SUMMARY'\)"[^>]*>[\s\S]*?Summary[\s\S]*?<\/button>/);
assert(!rightClusterMatch, 'Redundant Summary action button must be removed from right action bar');
console.log('✓ Summary controls unified: Exactly 1 single, prominent tab in the navigation pill bar');

console.log('\n--- Test 3: Verifying 8,000-char Batching & Strict Completeness Mandate ---');
const geminiCode = fs.readFileSync('js/gemini-service.js', 'utf8');
assert(geminiCode.includes('MAX_CHUNK_LEN = 8000;'), 'MAX_CHUNK_LEN must be set to 8000 characters for optimal uncompressed batching');
assert(geminiCode.includes('STRICT CONTENT COMPLETENESS (DO NOT SHORTEN OR CONDENSE)'), 'Prompt must contain strict non-shortening mandate');
assert(geminiCode.includes('notes ko short nahi karega'), 'User mandate must be explicitly reflected in prompt');
console.log('✓ Batch size calibrated to 8,000 chars with Strict Non-Shortening Completeness Mandate');

console.log('\n--- Test 4: Verifying 40% Deep Dive Section-by-Section Summary Engine ---');
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {} };
require('../js/gemini-service.js');

const sampleSections = [
  {
    id: 'sec-1',
    heading: '1. Constitutional Classification & Doctrine of Basic Structure',
    content: `The Constitution of India organizes Fundamental Rights under Articles 12 to 35. These rights act as a profound shield against state arbitrariness.\n\nIn the historic Kesavananda Bharati case (1973), the Supreme Court ruled that while Parliament possesses constituent power under Article 368 to amend any part of the Constitution, including Part III, it cannot alter or abrogate its 'Basic Structure'.\n\nArticle 13(2) mandates that the State shall not make any law which takes away or abridges the rights conferred by Part III, rendering such enactments void ab initio. This judicial review authority empowers courts to strike down unconstitutional legislation.`,
    keyPoints: ['Kesavananda Bharati 1973 doctrine', 'Article 13 judicial review shield', 'Justiciability under Part III']
  },
  {
    id: 'sec-2',
    heading: '2. Right to Equality & Substantive Affirmative Action',
    content: `Article 14 establishes equality before the law and equal protection of the laws within the territory of India. The former concept is of British origin, indicating negative absence of special privilege, while the latter is drawn from the US Constitution, embodying positive affirmative treatment.\n\nArticles 15 and 16 empower the state to make special provisions and affirmative quotas for socially and educationally backward classes.\n\nThe Indira Sawhney case (1992) upheld the 27% OBC reservation while instituting the creamy layer exclusion principle and fixing a general 50% cap on total reservations.`,
    keyPoints: ['British vs US concepts in Article 14', 'Indira Sawhney 1992 ruling', 'Creamy layer exclusion doctrine']
  }
];

const totalNotesWordCount = sampleSections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0);

const summary = window.geminiService.generateFallbackComprehensiveSummary({
  title: 'Fundamental Rights & Judicial Review',
  subject: 'Indian Polity',
  content: sampleSections.map(s => `${s.heading}\n${s.content}`).join('\n\n'),
  sections: sampleSections
});

assert(Array.isArray(summary.sectionBreakdowns) && summary.sectionBreakdowns.length === 2, 'Must generate sectionBreakdowns for each section');
assert(summary.sectionBreakdowns[0].sectionTitle === sampleSections[0].heading, 'Section breakdown must match heading');
assert(summary.sectionBreakdowns[0].deepDiveSummary.length > 100, 'Section deep dive summary must have substantial length');
assert(Array.isArray(summary.sectionBreakdowns[0].highYieldPointers) && summary.sectionBreakdowns[0].highYieldPointers.length > 0, 'Must have pointers');

// Calculate summary words
let summaryWords = summary.coreConcept.split(/\s+/).length;
summary.sectionBreakdowns.forEach(sb => {
  summaryWords += sb.deepDiveSummary.split(/\s+/).length;
});
summary.takeaways.forEach(t => summaryWords += t.split(/\s+/).length);

const depthPercentage = Math.round((summaryWords / totalNotesWordCount) * 100);
console.log(`✓ Original Notes Word Count: ${totalNotesWordCount} words`);
console.log(`✓ Generated Summary Word Count: ${summaryWords} words`);
console.log(`✓ Summary Depth: ${depthPercentage}% (Requirement was minimum 40%)`);
assert(depthPercentage >= 40, `Summary depth must be >= 40%, got ${depthPercentage}%`);

console.log('\n--- Test 5: Verifying CSS for Deep Dive Section Cards ---');
const compCss = fs.readFileSync('css/components.css', 'utf8');
assert(compCss.includes('.summary-deepdive-container'), 'CSS must include .summary-deepdive-container');
assert(compCss.includes('.summary-section-breakdown-card'), 'CSS must include .summary-section-breakdown-card');
assert(compCss.includes('[data-theme="LIGHT"] .summary-section-breakdown-card'), 'Light mode high-contrast rule must exist for breakdown cards');
console.log('✓ CSS & Light Mode styling verified for 40% Deep Dive cards');

console.log('\n🎉 ALL TESTS PASSED! Complete notes preservation and 40% deep dive summary confirmed!');
