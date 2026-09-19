const fs = require('fs');
const path = require('path');

// Setup minimal browser mocks for Node environment
global.window = {
  location: { hostname: 'localhost' }
};
global.document = {
  getElementById: () => null
};
global.SecurityUtils = {
  escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  sanitizeHtml: (s) => s || ''
};
global.marked = {
  parse: (s) => `<p>${s || ''}</p>`
};

// Load ai-teacher-service.js
const serviceCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-teacher-service.js'), 'utf8');
eval(serviceCode);

const service = global.window.aiTeacherService;

// Load ai-teacher.js
const viewCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'ai-teacher.js'), 'utf8');
eval(viewCode);

const view = global.window.aiTeacherView;

const exp = service.getDeterministicExplanation({
  question: 'Why is 15% of 200 equal to 30?',
  language: 'BILINGUAL',
  depth: 'DETAILED',
  mode: 'STUDENT',
  educationLevel: 'COLLEGE'
});

view.currentExplanation = exp;
view.questionInput = 'Why is 15% of 200 equal to 30?';
view.selectedLanguage = 'BILINGUAL';

const exportHtml = view._generateBookHTMLForExport();
console.log('Export HTML length:', exportHtml.length);
console.log('Contains Printable Book ID:', exportHtml.includes('id="hamsa-printable-book"'));
console.log('Contains Section § I:', exportHtml.includes('§ I'));
console.log('Contains Section § II:', exportHtml.includes('§ II'));
console.log('Contains Section § III:', exportHtml.includes('§ III'));
console.log('Contains Section § IV:', exportHtml.includes('§ IV'));
console.log('Contains Quick Answer:', exportHtml.includes(exp.quickAnswer.substring(0, 30)));
console.log('Contains Math Box:', exportHtml.includes('book-export-math-box'));

if (exportHtml.length > 2000 && exportHtml.includes('§ IV') && exportHtml.includes('id="hamsa-printable-book"')) {
  console.log('\n✅ PDF Export HTML is complete, rich, structured, and non-empty!');
} else {
  console.error('\n❌ PDF Export HTML failed validation checks!');
  process.exit(1);
}
