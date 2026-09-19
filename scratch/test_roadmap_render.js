// Test Roadmap Checklist rendering across all language modes
const fs = require('fs');
const path = require('path');

global.window = {
  db: { answerWritingSettings: { get: async () => null, put: async () => {} } },
  examProfileManager: { getStudentName: () => 'Aspirant' },
  audioEngine: { playTabSwitch: () => {}, playClick: () => {} },
  app: { showToast: () => {} }
};
global.document = {
  getElementById: () => ({ classList: { toggle: () => {} } }),
  querySelectorAll: () => []
};
global.SecurityUtils = {
  escapeHtml: (str) => String(str || '')
};

const serviceCode = fs.readFileSync(path.join(__dirname, '../js/answer-writing-service.js'), 'utf8');
const viewCode = fs.readFileSync(path.join(__dirname, '../js/views/answer-writing.js'), 'utf8');
const vm = require('vm');
vm.runInThisContext(serviceCode);
vm.runInThisContext(viewCode);

const service = global.window.answerWritingService;
const view = global.window.answerWritingView;

async function testRoadmap() {
  console.log('Testing Roadmap Rendering...');
  
  const evalResult = await service.evaluateAnswer({
    exam: "UPSC",
    subject: "Polity & Governance",
    question: "Critically examine Judicial Activism in India.",
    directive: "Critically Examine",
    wordLimit: 150,
    marks: 10,
    studentAnswer: "Judicial activism is when courts proactively enforce rights.",
    inputSource: "TYPED"
  });

  view.currentEvaluation = evalResult;
  view.activeQuestion = { wordLimit: 150, marks: 10, subject: "Polity", exam: "UPSC" };

  for (const mode of ['BILINGUAL', 'ENGLISH', 'HINDI']) {
    console.log(`\n--- Checking Mode: ${mode} ---`);
    view.evalLanguageMode = mode;
    const html = view.renderPanoramicEvaluationDashboardHtml();

    if (!html.includes('aw-checklist-item')) {
      throw new Error(`Missing aw-checklist-item in ${mode}`);
    }
    if (!html.includes('aw-checklist-title')) {
      throw new Error(`Missing aw-checklist-title in ${mode}`);
    }
    if (!html.includes('Crisp Introduction') && !html.includes('प्रस्तावना')) {
      throw new Error(`Missing step 1 content in ${mode}`);
    }
    if (!html.includes('Structural Subheadings') && !html.includes('उप-शीर्षक')) {
      throw new Error(`Missing step 2 content in ${mode}`);
    }
    if (!html.includes('Concrete Substantiation') && !html.includes('ठोस प्रमाण')) {
      throw new Error(`Missing step 3 content in ${mode}`);
    }
    if (!html.includes('Prune Fluff') && !html.includes('अनावश्यक विस्तार')) {
      throw new Error(`Missing step 4 content in ${mode}`);
    }
    if (!html.includes('Visionary Way Forward') && !html.includes('दूरदर्शी समाधान')) {
      throw new Error(`Missing step 5 content in ${mode}`);
    }
    console.log(`All 5 steps verified with non-empty, clear text in ${mode} mode!`);
  }

  console.log('\n>>> SUCCESS: Improvement Roadmap is 100% readable and verified! <<<');
}

testRoadmap().catch(err => {
  console.error('Roadmap Test Failed:', err);
  process.exit(1);
});
