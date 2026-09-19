// Comprehensive Verification of Bilingual Evaluation & Diagram Flow & PDF Report Pipeline
const fs = require('fs');
const path = require('path');

// Setup mock browser DOM environment
global.window = {
  db: {
    answerWritingSettings: {
      get: async () => null,
      put: async () => {}
    }
  }
};
global.document = {
  createElement: () => ({ style: {}, appendChild: () => {}, querySelectorAll: () => [] }),
  getElementById: () => null
};
global.navigator = {};

// Mock SecurityUtils
global.SecurityUtils = {
  escapeHtml: (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Load AnswerWritingService
const serviceCode = fs.readFileSync(path.join(__dirname, '../js/answer-writing-service.js'), 'utf8');
const vm = require('vm');
vm.runInThisContext(serviceCode);

const service = global.window.answerWritingService;

async function runVerification() {
  console.log('--- Testing AnswerWritingService bilingual evaluation & diagram generator ---');
  
  const question = "Critically examine the concept of Judicial Activism in India. Has the Supreme Court effectively safeguarded fundamental rights without transgressing parliamentary boundaries?";
  const answer = "Judicial activism refers to the proactive role played by the judiciary in protecting rights and promoting justice when other state organs fail. In Kesavananda Bharati (1973), the Supreme Court established the Basic Structure Doctrine. However, critics argue that excessive activism leads to judicial overreach, such as the cancellation of 2G spectrum licenses. A harmonious balance between judicial review and parliamentary sovereignty is essential.";

  const evalResult = await service.evaluateAnswer({
    exam: "UPSC",
    subject: "Polity & Governance",
    question: question,
    directive: "Critically Examine",
    wordLimit: 150,
    marks: 10,
    studentAnswer: answer,
    inputSource: "TYPED"
  });

  console.log('Overall Score:', evalResult.scores?.overall);
  console.log('Marks Awarded:', evalResult.scores?.marksAwarded);
  
  // Verify Bilingual Summary
  console.log('\n[1] Bilingual Summary:');
  console.log('EN:', evalResult.bilingualSummary?.en?.substring(0, 80) + '...');
  console.log('HI:', evalResult.bilingualSummary?.hi?.substring(0, 80) + '...');
  if (!evalResult.bilingualSummary?.hi) throw new Error('Missing Hindi summary');

  // Verify Bilingual Strengths
  console.log('\n[2] Bilingual Strengths:');
  console.log('Count:', evalResult.bilingualStrengths?.length);
  console.log('Item 1 EN:', evalResult.bilingualStrengths?.[0]?.en);
  console.log('Item 1 HI:', evalResult.bilingualStrengths?.[0]?.hi);
  if (!evalResult.bilingualStrengths?.[0]?.hi) throw new Error('Missing Hindi strength');

  // Verify Bilingual Weaknesses
  console.log('\n[3] Bilingual Weaknesses:');
  console.log('Count:', evalResult.bilingualWeaknesses?.length);
  console.log('Item 1 EN:', evalResult.bilingualWeaknesses?.[0]?.en);
  console.log('Item 1 HI:', evalResult.bilingualWeaknesses?.[0]?.hi);
  if (!evalResult.bilingualWeaknesses?.[0]?.hi) throw new Error('Missing Hindi weakness');

  // Verify Visual Diagram
  console.log('\n[4] Visual Diagram & Flowchart:');
  console.log('Title:', evalResult.visualDiagram?.diagramTitle);
  console.log('Type:', evalResult.visualDiagram?.diagramType);
  console.log('Flow Nodes Count:', evalResult.visualDiagram?.flowNodes?.length);
  console.log('First Node:', evalResult.visualDiagram?.flowNodes?.[0]);
  console.log('ASCII Blueprint snippet:\n' + evalResult.visualDiagram?.asciiBlueprint?.substring(0, 120) + '...');
  if (!evalResult.visualDiagram?.flowNodes || evalResult.visualDiagram.flowNodes.length === 0) {
    throw new Error('Visual diagram flow nodes missing');
  }

  // Verify Hindi Model Answer
  console.log('\n[5] Hindi Model Answer:');
  console.log('HI Model Answer Snippet:', evalResult.improvedAnswerHi?.substring(0, 100) + '...');
  if (!evalResult.improvedAnswerHi) throw new Error('Missing Hindi model answer');

  console.log('\n>>> All Answer Writing Service tests passed successfully! <<<');
}

runVerification().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
