/** The retired multi-view Quiz implementation stays isolated from the fresh tab. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const retiredViews = ['create-quiz', 'quiz-player', 'quiz-result', 'quiz-history'];
const retiredFiles = [
  'js/quiz-engine.js', 'js/quiz-quality.js', 'js/quiz-source.js', 'js/charts.js',
  ...retiredViews.map(view => `js/views/${view}.js`),
  'css/quiz-generator.css', 'css/quiz-improvements.css',
  'css/components/03-create-quiz.css'
];
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); }
}

(async () => {
  const html = read('index.html');
  const dom = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  try {
    await test('Retired implementation files are removed from disk', () => {
      assert.deepEqual(retiredFiles.filter(file => fs.existsSync(path.join(root, file))), []);
    });
    await test('Old multi-view navigation and search entry points stay retired', () => {
      assert.equal(w.document.querySelector('#module-subnav-quiz,[data-filter="QUIZZES"],[data-filter="QUESTIONS"]'), null);
      for (const view of retiredViews) {
        assert.equal(w.document.getElementById('view-' + view), null);
        assert.equal(w.document.querySelector(`[data-view="${view}"]`), null);
      }
      for (const view of retiredViews) assert.ok(!html.includes(view));
      assert.ok(w.document.querySelector('[data-module="quiz"]'));
      assert.ok(w.document.getElementById('view-quiz'));
    });
    await test('All remaining shell styles and scripts exist', () => {
      for (const element of w.document.querySelectorAll('script[src],link[rel="stylesheet"]')) {
        const file = (element.getAttribute('src') || element.getAttribute('href')).split('?')[0];
        assert.ok(fs.existsSync(path.join(root, file)), file);
      }
    });
    await test('Offline shell and app shortcuts cannot reopen retired code', () => {
      const sw = read('sw.js');
      const manifest = JSON.parse(read('manifest.webmanifest'));
      for (const view of retiredViews) {
        assert.ok(!sw.includes(view));
        assert.ok(manifest.shortcuts.every(shortcut => !shortcut.url.includes(view)));
      }
      assert.ok(!/js\/charts\.js/.test(sw));
      const cacheVersion = /CACHE_VERSION\s*=\s*'v(\d+)'/.exec(sw);
      assert.ok(cacheVersion && Number(cacheVersion[1]) >= 49, 'retired assets need a fresh cache version');
    });
    await test('Shared AI transport has no retired quiz dependency', () => {
      assert.ok(!/QuizQuality|quizEngine|getQuizInputBudget|QUIZ_|your quiz/.test(read('js/ai-client.js')));
      assert.ok(!/quizEngine|generateQuiz\(|detectAndExtractExistingQuiz/.test(read('js/gemini-service.js')));
    });

    w.eval(read('js/app.js').split("document.addEventListener('DOMContentLoaded'")[0]);
    const app = w.app;
    app.showToast = () => {};
    w.UIUtils = { stopSpeaking() {} };
    const rendered = [];
    const views = ['dashboard', 'quiz', 'ai-teacher', 'study-notes', 'library', 'flashcards', 'answer-writing', 'tools', 'exam-alerts', 'settings'];
    const globals = ['dashboardView', 'quizView', 'aiTeacherView', 'studyNotesView', 'libraryView', 'flashcardsView', 'answerWritingView', 'toolsView', 'examAlertsView', 'settingsView'];
    views.forEach((view, index) => {
      w[globals[index]] = { render() { rendered.push(view); }, onLeaveView() {}, detachKeyboard() {}, stopSpeech() {} };
    });
    await test('Old quiz bookmarks and unknown hashes fall back to Dashboard', () => {
      for (const route of [...retiredViews, 'missing-module']) {
        w.history.replaceState(null, '', '#' + route + '?id=123');
        app.handleRoute();
        assert.equal(app.currentView, 'dashboard', route);
        assert.equal(w.document.querySelector('.view-section.active')?.id, 'view-dashboard');
      }
    });
    await test('Direct retired navigation cannot create an empty view', () => {
      for (const route of retiredViews) {
        app.navigate(route);
        assert.equal(app.currentView, 'dashboard');
        assert.equal(w.location.hash, '#dashboard');
      }
    });
    await test('Every remaining study route invokes its renderer', () => {
      rendered.length = 0;
      for (const route of views) app.navigate(route);
      assert.deepEqual(rendered, views);
      assert.equal(w.document.querySelectorAll('.view-section.active').length, 1);
    });
    await test('Player, generation and paper-export controllers are unavailable', () => {
      for (const method of ['startQuiz', 'viewQuizResult', 'launchQuickDrill', 'launchMockTest', 'exportQuizPdf', 'studentQuizProgress']) {
        assert.equal(typeof app[method], 'undefined', method);
      }
    });
    await test('Shared study generation still supports cancellation and cleanup', () => {
      assert.equal(app.beginGeneration('Writing study notes…'), true);
      const context = app.getGenerationContext();
      assert.equal(context.signal.aborted, false);
      assert.ok(w.document.getElementById('generating-overlay').classList.contains('active'));
      app.cancelGeneration();
      assert.equal(context.signal.aborted, true);
      assert.equal(app._isGenerating, false);
      assert.ok(!w.document.getElementById('generating-overlay').classList.contains('active'));
    });
    await test('Inline Quiz generation shares cancellation and excludes simultaneous generation', () => {
      assert.equal(app.beginGeneration('Creating quiz…', { inline: true, owner: 'quiz' }), true);
      const context = app.getGenerationContext();
      assert.equal(context.jobId, context.id);
      assert.equal(context.isCurrent(), true);
      assert.ok(!w.document.getElementById('generating-overlay').classList.contains('active'));
      assert.equal(app.beginGeneration('Writing notes…'), false);
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
      assert.equal(context.signal.aborted, true);
      assert.equal(context.isCurrent(), false);
      assert.equal(app._isGenerating, false);
      assert.equal(app.beginGeneration('Writing notes…'), true);
      const newer = app.getGenerationContext();
      app.endGeneration(context.jobId);
      assert.equal(newer.isCurrent(), true, 'an older job cannot close a newer one');
      app.cancelGeneration();
    });
    await test('Library reads only saved notes and escapes stored text', async () => {
      w.eval(read('js/sanitizer.js'));
      w.eval(read('js/ui-utils.js'));
      app.refreshIcons = () => {};
      w.getAllNotes = async () => [
        { id: 1, title: 'Physics <img src=x onerror=alert(1)>', subject: 'Science', sections: [{ heading: 'Motion', content: 'Speed and distance' }] },
        { id: 2, title: 'History', subject: 'History', sections: [] }
      ];
      w.getAllQuizzes = () => { throw Error('Retired data must not be queried'); };
      w.eval(read('js/views/library.js'));
      await w.libraryView.render();
      const container = w.document.getElementById('view-library');
      assert.match(container.textContent, /Saved Study Notes/);
      assert.equal(container.querySelector('[onerror]'), null);
      assert.ok(!/Quiz|Practice Quiz|View History/.test(container.textContent));
      w.libraryView.subject = 'Science';
      await w.libraryView.render();
      assert.equal(container.querySelectorAll('article').length, 1);
      assert.match(container.textContent, /Physics/);
    });
  } finally { dom.window.close(); }
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
