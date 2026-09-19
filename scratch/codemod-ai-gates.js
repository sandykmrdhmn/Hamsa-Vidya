/**
 * One-shot codemod: replace API-key-presence gates with capability checks.
 *
 * `const apiKey = getApiKey()` followed by `if (apiKey)` was used to mean
 * "can we call the AI?". That breaks in PROXY mode, where the server holds the
 * key and the browser legitimately has none — the app would silently fall back
 * to its offline deterministic engine even though AI was available.
 *
 * geminiService.isAiAvailable() is the correct capability check.
 */

const fs = require('fs');
const path = require('path');

const EDITS = [
  {
    file: 'js/gemini-service.js',
    // Inside the class, so `this.` is correct.
    replacements: [
      { from: /if \(!apiKey\) \{/g, to: 'if (!this.isAiAvailable()) {' }
    ]
  },
  {
    file: 'js/ai-teacher-service.js',
    replacements: [
      { from: /if \(!apiKey\) \{/g, to: 'if (!window.geminiService?.isAiAvailable()) {' }
    ]
  },
  {
    file: 'js/answer-writing-service.js',
    replacements: [
      { from: /if \(apiKey\) \{/g, to: 'if (window.geminiService?.isAiAvailable()) {' },
      {
        from: /if \(window\.geminiService && window\.geminiService\.getApiKey\(\)\) \{/g,
        to: 'if (window.geminiService?.isAiAvailable()) {'
      }
    ]
  },
  {
    file: 'js/notification-summary-service.js',
    replacements: [
      {
        from: /const hasGeminiKey = window\.geminiService && window\.geminiService\.getApiKey\(\);/g,
        to: 'const hasGeminiKey = window.geminiService?.isAiAvailable();'
      }
    ]
  }
];

let total = 0;

for (const edit of EDITS) {
  const full = path.join(__dirname, '..', edit.file);
  let src = fs.readFileSync(full, 'utf8');
  let fileCount = 0;

  for (const r of edit.replacements) {
    const matches = src.match(r.from);
    if (matches) {
      src = src.replace(r.from, r.to);
      fileCount += matches.length;
    }
  }

  fs.writeFileSync(full, src, 'utf8');
  console.log(`${edit.file}: ${fileCount} gate(s) converted`);
  total += fileCount;
}

console.log(`\nTotal gates converted: ${total}`);
