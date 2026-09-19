const fs = require('fs');
const path = require('path');

// Setup minimal browser mocks for Node environment
global.window = {
  location: { hostname: 'localhost' }
};

// Load ai-teacher-service.js
const serviceCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-teacher-service.js'), 'utf8');
eval(serviceCode);

const service = global.window.aiTeacherService;

console.log('Testing AI Teacher Service against 7 Required Test Cases...\n');

const testCases = [
  { id: 1, name: 'Mathematics', query: 'Why is 15% of 200 equal to 30?', lang: 'BILINGUAL' },
  { id: 2, name: 'Science', query: 'What is photosynthesis?', lang: 'ENGLISH' },
  { id: 3, name: 'History', query: 'Why did the French Revolution happen?', lang: 'ENGLISH' },
  { id: 4, name: 'Geography', query: 'What is the water cycle?', lang: 'ENGLISH' },
  { id: 5, name: 'Computer Science', query: 'What is RAM?', lang: 'ENGLISH' },
  { id: 6, name: 'Hindi', query: 'भारतीय संविधान क्या है?', lang: 'HINDI' },
  { id: 7, name: 'Bilingual', query: 'What is inflation?', lang: 'BILINGUAL' }
];

let passed = 0;

for (const tc of testCases) {
  const result = service.getDeterministicExplanation({
    question: tc.query,
    language: tc.lang,
    depth: 'DETAILED',
    mode: 'STUDENT'
  });

  const hasQuickAnswer = Boolean(result.quickAnswer && result.quickAnswer.length > 10);
  const hasFoundation = Boolean(result.foundation && result.foundation.explanation);
  const hasSteps = Boolean(result.steps && result.steps.length > 0);
  const hasSummary = Boolean(result.summary && result.summary.length > 0);
  const hasPractice = Boolean(result.practiceQuestions && result.practiceQuestions.length > 0);

  const isMathValid = tc.id === 1 ? Boolean(result.mathSolution && result.mathSolution.finalAnswer) : true;
  const isFlowchartValid = Boolean(result.flowchart && result.flowchart.nodes?.length);
  const isDiagramValid = Boolean(result.diagram && result.diagram.svgContent);

  const allChecks = hasQuickAnswer && hasFoundation && hasSteps && hasSummary && hasPractice && isMathValid && isFlowchartValid && isDiagramValid;

  if (allChecks) {
    console.log(`✅ TEST ${tc.id} [${tc.name}]: "${tc.query}" PASSED`);
    console.log(`   - Subject: ${result.subject}`);
    console.log(`   - Topic: ${result.topic}`);
    console.log(`   - Quick Answer Preview: ${result.quickAnswer.substring(0, 70)}...`);
    console.log(`   - Flowchart Nodes: ${result.flowchart.nodes.length}, Practice Qs: ${result.practiceQuestions.length}\n`);
    passed++;
  } else {
    console.error(`❌ TEST ${tc.id} [${tc.name}] FAILED validation checks!`);
    console.error(JSON.stringify(result, null, 2));
  }
}

console.log(`\n================================`);
console.log(`RESULTS: ${passed}/${testCases.length} Tests Passed Perfectly!`);
console.log(`================================`);
if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
