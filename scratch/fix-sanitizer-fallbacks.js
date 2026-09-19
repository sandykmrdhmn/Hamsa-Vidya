/**
 * One-shot codemod: remove the "fall back to raw content" sanitizer guards.
 *
 * `window.SecurityUtils ? SecurityUtils.sanitizeHtml(x) : x` looks defensive but
 * does the opposite: if sanitizer.js ever fails to load, the guard silently
 * injects unsanitized AI output into innerHTML. Sanitization must be a hard
 * dependency, not a best-effort.
 *
 * sanitizer.js is the very first script in index.html, so the fallback branch
 * only ever fires when something is already badly wrong.
 */

const fs = require('fs');
const path = require('path');

const edits = [
  {
    file: 'js/views/quiz-player.js',
    replacements: [
      {
        from: '${window.SecurityUtils ? SecurityUtils.sanitizeHtml(q.questionText) : q.questionText}',
        to: '${SecurityUtils.sanitizeHtml(q.questionText)}'
      },
      {
        from: '${window.SecurityUtils ? SecurityUtils.sanitizeHtml(opt) : opt}',
        to: '${SecurityUtils.sanitizeHtml(opt)}'
      },
      {
        from: '${window.SecurityUtils ? SecurityUtils.sanitizeHtml(q.explanation) : q.explanation}',
        to: '${SecurityUtils.sanitizeHtml(q.explanation)}'
      }
    ]
  },
  {
    file: 'js/views/quiz-result.js',
    replacements: [
      {
        from: '${window.SecurityUtils ? SecurityUtils.sanitizeHtml(opt) : opt}',
        to: '${SecurityUtils.sanitizeHtml(opt)}'
      },
      {
        from: '${window.SecurityUtils ? SecurityUtils.sanitizeHtml(q.explanation) : q.explanation}',
        to: '${SecurityUtils.sanitizeHtml(q.explanation)}'
      },
      {
        from: 'return window.SecurityUtils ? window.SecurityUtils.sanitizeHtml(paragraphs) : paragraphs;',
        to: 'return SecurityUtils.sanitizeHtml(paragraphs);'
      }
    ]
  },
  {
    file: 'js/pdf-generator.js',
    replacements: [
      {
        from: 'return window.SecurityUtils ? window.SecurityUtils.escapeHtml(text) : text;',
        to: 'return SecurityUtils.escapeHtml(text);'
      }
    ]
  }
];

let total = 0;
for (const e of edits) {
  const full = path.join(__dirname, '..', e.file);
  let src = fs.readFileSync(full, 'utf8');
  let count = 0;

  for (const r of e.replacements) {
    if (!src.includes(r.from)) {
      console.log(`  SKIP (not found in ${e.file}): ${r.from.slice(0, 60)}`);
      continue;
    }
    const before = src.split(r.from).length - 1;
    src = src.split(r.from).join(r.to);
    count += before;
  }

  fs.writeFileSync(full, src, 'utf8');
  console.log(`${e.file}: ${count} guard(s) hardened`);
  total += count;
}

console.log(`\nTotal: ${total}`);
