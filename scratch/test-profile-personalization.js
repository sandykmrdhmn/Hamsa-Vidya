/**
 * Test Suite: Student Profile Personalization across all 4 tiers
 * Class 6, Class 10, Class 12 Science, and UPSC Aspirant
 */

const fs = require('fs');
const path = require('path');

// Mock browser environment for node testing
global.window = {};
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};

const vm = require('vm');

// Load AiTeacherService
const serviceCode = fs.readFileSync(path.join(__dirname, '../js/ai-teacher-service.js'), 'utf8');
vm.runInThisContext(serviceCode);

const service = new AiTeacherService();

async function runTests() {
  console.log('====================================================');
  console.log('TESTING AI TEACHER PERSONALIZATION ACROSS 4 PROFILES');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Photosynthesis across all 4 profiles
  // ----------------------------------------------------
  console.log('--- TEST 1: Question = "What is photosynthesis?" ---');

  // Profile A: Class 6
  console.log('\n[Profile A: Class 6]');
  const resC6 = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  const dataC6 = resC6.data;
  assert(dataC6.difficulty === 'BEGINNER', 'Class 6 has BEGINNER difficulty tier');
  assert(dataC6.studentContext.educationLevel === 'CLASS_6', 'Student context reflects CLASS_6');
  assert(dataC6.quickAnswer.includes('किचन') || dataC6.quickAnswer.includes('food') || dataC6.quickAnswer.includes('खाना'), 'Class 6 uses relatable food/kitchen concepts');
  assert(!dataC6.quickAnswer.includes('RuBisCO'), 'Class 6 avoids high-level biochemistry (RuBisCO)');
  assert(!dataC6.quickAnswer.includes('Z-scheme'), 'Class 6 avoids complex photochemical pathways');

  // Profile B: Class 10
  console.log('\n[Profile B: Class 10]');
  const resC10 = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'CLASS_10',
    language: 'BILINGUAL'
  });
  const dataC10 = resC10.data;
  assert(dataC10.difficulty === 'INTERMEDIATE', 'Class 10 has INTERMEDIATE difficulty tier');
  assert(dataC10.studentContext.educationLevel === 'CLASS_10', 'Student context reflects CLASS_10');
  assert(dataC10.foundation.explanation.includes('6CO') || dataC10.quickAnswer.includes('6CO'), 'Class 10 contains balanced chemical equation (6CO2 + 6H2O)');
  const fullTextC10 = JSON.stringify(dataC10);
  assert(fullTextC10.toLowerCase().includes('stomata') || fullTextC10.includes('रंध्र'), 'Class 10 explains stomata / guard cells');

  // Profile C: Class 12 Science
  console.log('\n[Profile C: Class 12 Science]');
  const resC12 = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'CLASS_12_SCIENCE',
    language: 'BILINGUAL'
  });
  const dataC12 = resC12.data;
  assert(dataC12.difficulty === 'ADVANCED', 'Class 12 Science has ADVANCED difficulty tier');
  assert(dataC12.studentContext.educationLevel === 'CLASS_12_SCIENCE', 'Student context reflects CLASS_12_SCIENCE');
  assert(dataC12.foundation.explanation.includes('RuBisCO') || dataC12.quickAnswer.includes('RuBisCO'), 'Class 12 Science includes RuBisCO enzyme mechanism');
  assert(dataC12.foundation.explanation.includes('Thylakoid') || dataC12.foundation.explanation.includes('Z-scheme') || dataC12.foundation.explanation.includes('Light Reaction'), 'Class 12 Science includes thylakoid membrane / photochemical reactions');
  assert(dataC12.foundation.technicalTerms.some(t => t.term.includes('C4') || t.term.includes('Kranz') || t.term.includes('RuBisCO')), 'Class 12 Science defines C4 / Kranz anatomy / RuBisCO in technical terms');

  // Profile D: UPSC Aspirant
  console.log('\n[Profile D: UPSC Aspirant]');
  const resUPSC = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'UPSC',
    language: 'BILINGUAL'
  });
  const dataUPSC = resUPSC.data;
  assert(dataUPSC.difficulty === 'EXAM_FOCUSED', 'UPSC has EXAM_FOCUSED difficulty tier');
  assert(dataUPSC.studentContext.educationLevel === 'UPSC', 'Student context reflects UPSC');
  const fullTextUPSC = JSON.stringify(dataUPSC);
  assert(fullTextUPSC.includes('Primary Productivity') || fullTextUPSC.includes('Blue Carbon') || fullTextUPSC.includes('GS-3'), 'UPSC includes ecological/policy dimensions (Primary Productivity / Blue Carbon / GS-3)');
  assert(dataUPSC.examPoints.expectedAnswerStructure.includes('Introduction') || dataUPSC.examPoints.expectedAnswerStructure.includes('Way Forward'), 'UPSC includes GS Mains answer blueprint (Intro -> Body -> Way Forward)');

  // ----------------------------------------------------
  // TEST 2: Mathematics adaptation on "Solve 2x + 5 = 15"
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Question = "Solve 2x + 5 = 15" ---');

  const mathC6 = await service.explain({
    question: 'Solve 2x + 5 = 15',
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  assert(mathC6.data.difficulty === 'BEGINNER', 'Math Class 6 is BEGINNER tier');
  assert(mathC6.data.foundation.explanation.includes('मिस्ट्री बॉक्स') || mathC6.data.foundation.explanation.includes('Mystery Box') || mathC6.data.foundation.explanation.includes('सी-सॉ') || mathC6.data.foundation.explanation.includes('तराजू'), 'Math Class 6 uses intuitive mystery box / balance scale analogy');

  const mathUPSC = await service.explain({
    question: 'Solve 2x + 5 = 15',
    educationLevel: 'UPSC',
    language: 'BILINGUAL'
  });
  assert(mathUPSC.data.difficulty === 'EXAM_FOCUSED', 'Math UPSC is EXAM_FOCUSED tier');
  assert(mathUPSC.data.foundation.explanation.includes('CSAT') || mathUPSC.data.foundation.explanation.includes('Mental Math') || mathUPSC.data.foundation.explanation.includes('1.5 seconds'), 'Math UPSC features CSAT rapid inspection / mental math calculation');

  // ----------------------------------------------------
  // TEST 3: Economics adaptation on "What is inflation?"
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Question = "What is inflation?" ---');

  const econC6 = await service.explain({
    question: 'What is inflation?',
    educationLevel: 'CLASS_6',
    language: 'BILINGUAL'
  });
  assert(econC6.data.difficulty === 'BEGINNER', 'Inflation Class 6 is BEGINNER tier');
  assert(econC6.data.foundation.explanation.includes('आइसक्रीम') || econC6.data.foundation.explanation.includes('सिक्का') || econC6.data.foundation.explanation.includes('10'), 'Inflation Class 6 uses simple ice-cream/coin story');

  const econUPSC = await service.explain({
    question: 'What is inflation?',
    educationLevel: 'UPSC',
    language: 'BILINGUAL'
  });
  assert(econUPSC.data.difficulty === 'EXAM_FOCUSED', 'Inflation UPSC is EXAM_FOCUSED tier');
  const fullTextEconUPSC = JSON.stringify(econUPSC.data);
  assert(fullTextEconUPSC.includes('MPC') || fullTextEconUPSC.includes('Repo') || fullTextEconUPSC.includes('4%'), 'Inflation UPSC includes monetary policy framework (MPC / Repo Rate / 4% ± 2%)');

  // ----------------------------------------------------
  // TEST 4: Auto profile detection from LocalStorage
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Auto detection from existing student profile ---');

  // Case 1: Student has 12TH_PASS with Science
  global.localStorage.setItem('hamsa_exam_profile', JSON.stringify({
    qualificationId: '12TH_PASS',
    qualification: '12th Standard',
    twelfthStream: 'Science (PCM)'
  }));
  global.localStorage.removeItem('hamsa_target_exam_data');

  const autoC12 = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'AUTO'
  });
  assert(autoC12.data.studentContext.educationLevel === 'CLASS_12_SCIENCE', 'Auto detected Class 12 Science from hamsa_exam_profile');

  // Case 2: Student sets target exam to UPSC Civil Services
  global.localStorage.setItem('hamsa_target_exam_data', JSON.stringify({
    shortName: 'UPSC CSE',
    name: 'UPSC Civil Services Examination'
  }));
  const autoUPSC = await service.explain({
    question: 'What is photosynthesis?',
    educationLevel: 'AUTO'
  });
  assert(autoUPSC.data.studentContext.educationLevel === 'UPSC', 'Auto detected UPSC from hamsa_target_exam_data');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during tests:', err);
  process.exit(1);
});
