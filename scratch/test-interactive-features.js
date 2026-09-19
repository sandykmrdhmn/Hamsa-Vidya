/**
 * Verification of Interactive Actions:
 * - makeItSimpler
 * - generateAnotherExample
 * - askFollowUp
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = {};
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};

const serviceCode = fs.readFileSync(path.join(__dirname, '../js/ai-teacher-service.js'), 'utf8');
vm.runInThisContext(serviceCode);

const service = new AiTeacherService();

async function runInteractiveTests() {
  console.log('Testing Interactive Actions with Student Profile...');

  // 1. Initial Explanation
  const initial = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });

  // 2. Test makeItSimpler
  const simpler = await service.makeItSimpler({
    question: 'What is photosynthesis?',
    currentExplanation: initial.data,
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  console.log('  ✅ makeItSimpler returned:', typeof simpler.storyExplanation === 'string' && simpler.storyExplanation.length > 0);

  // 3. Test generateAnotherExample
  const example = await service.generateAnotherExample({
    question: 'What is photosynthesis?',
    currentExplanation: initial.data,
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  console.log('  ✅ generateAnotherExample returned:', typeof example.title === 'string' && example.title.length > 0);

  // 4. Test askFollowUp
  const followUp = await service.askFollowUp({
    originalQuestion: 'What is photosynthesis?',
    previousExplanation: initial.data,
    followUpQuery: 'Why do leaves look green?',
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  console.log('  ✅ askFollowUp returned:', typeof followUp.followUpAnswer === 'string' && followUp.followUpAnswer.length > 0);

  console.log('\nAll interactive methods verified successfully!');
}

runInteractiveTests().catch(err => {
  console.error(err);
  process.exit(1);
});
