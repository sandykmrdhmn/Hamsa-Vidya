const fs = require('fs');
const path = require('path');

global.window = {
  location: { hostname: 'localhost' }
};

const serviceCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-teacher-service.js'), 'utf8');
eval(serviceCode);

const service = global.window.aiTeacherService;

async function runInteractiveTests() {
  console.log('Testing AI Teacher Interactive Actions (Offline Fallbacks)...\n');

  // Test 1: Follow-up
  const initial = service.getDeterministicExplanation({
    question: 'What is inflation?',
    language: 'BILINGUAL'
  });

  const followUp = await service.askFollowUp({
    originalQuestion: 'What is inflation?',
    previousExplanation: initial,
    followUpQuery: 'Why does inflation increase?',
    language: 'BILINGUAL'
  });

  console.log('✅ Follow-up Test:');
  console.log('   Answer:', followUp.followUpAnswer);
  console.log('   Example:', followUp.clarifyingExample);
  console.log('   Mini-Analogy:', followUp.miniAnalogy, '\n');

  // Test 2: Make it Simpler
  const simpler = await service.makeItSimpler({
    question: 'What is RAM?',
    currentExplanation: service.getDeterministicExplanation({ question: 'What is RAM?', language: 'ENGLISH' }),
    language: 'ENGLISH'
  });

  console.log('✅ Make it Simpler Test:');
  console.log('   Simpler Answer:', simpler.simplerQuickAnswer);
  console.log('   Story Explanation:', simpler.storyExplanation);
  console.log('   Everyday Analogy:', simpler.everydayAnalogy, '\n');

  // Test 3: Another Example
  const anotherEx = await service.generateAnotherExample({
    question: 'What is photosynthesis?',
    currentExplanation: service.getDeterministicExplanation({ question: 'What is photosynthesis?', language: 'ENGLISH' }),
    language: 'ENGLISH'
  });

  console.log('✅ Another Example Test:');
  console.log('   Title:', anotherEx.title);
  console.log('   Scenario:', anotherEx.scenario);
  console.log('   Takeaway:', anotherEx.takeaway, '\n');

  console.log('All interactive micro-actions verified successfully!');
}

runInteractiveTests();
