/**
 * Split the two oversized stylesheets into focused feature files.
 *
 * SAFETY: CSS is order-dependent, so the parts are numbered and must be loaded
 * in numeric order. The script asserts that concatenating the parts reproduces
 * the original file BYTE FOR BYTE — if that check fails nothing is written, so a
 * silent cascade change is impossible.
 *
 * Sections are cut at the existing `/* ===== SECTION ===== *\/` banners, and the
 * ranges below were taken from those banner line numbers.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');

const PLANS = [
  {
    source: 'components.css',
    outDir: 'components',
    parts: [
      { name: '01-base-and-header.css', startLine: 1, label: 'Resets, buttons, header & navigation' },
      { name: '02-dashboard.css', startLine: 564, label: 'Hero, shloka banner, AI advisor, metrics, charts, recent quizzes' },
      { name: '03-create-quiz.css', startLine: 2423, label: 'Quiz ingestion form & page range selector' },
      { name: '04-motion.css', startLine: 3286, label: 'Aurora mesh, confetti, page cascade motion' },
      { name: '05-study-notes.css', startLine: 3527, label: 'Study notes vault & digital textbook reader' },
      { name: '06-flashcards.css', startLine: 5660, label: 'Flashcards engine & deck creator' },
      { name: '07-global-search.css', startLine: 6403, label: 'Command palette & header search trigger' },
      { name: '08-doubt-solver.css', startLine: 6741, label: 'AI doubt solver drawer' },
      { name: '09-reading-themes.css', startLine: 7140, label: 'Reading themes, selection toolbar, micro-quiz, TOC mastery' },
      { name: '10-tools.css', startLine: 7776, label: 'Tools studio' }
    ]
  },
  {
    source: 'ai-teacher.css',
    outDir: 'ai-teacher',
    parts: [
      { name: '01-hero-and-input.css', startLine: 1, label: 'Hero emblem, input studio, HUD bar' },
      { name: '02-controls.css', startLine: 624, label: 'Controls matrix & action toolbar' },
      { name: '03-loading.css', startLine: 1119, label: 'Holographic neural-mind waiting screen' },
      { name: '04-folio.css', startLine: 1557, label: 'Study book folio & chapter dividers' },
      { name: '05-toolbar-and-chat.css', startLine: 2846, label: 'Sticky actions, follow-up chat, bookmarks drawer' },
      { name: '06-manuscript.css', startLine: 3169, label: 'Master study book manuscript' },
      { name: '07-print-and-responsive.css', startLine: 4695, label: 'Print styles & responsive rules' }
    ]
  }
];

let totalParts = 0;

for (const plan of PLANS) {
  const srcPath = path.join(CSS_DIR, plan.source);
  const original = fs.readFileSync(srcPath, 'utf8');

  // Preserve line endings exactly by splitting on \n and re-joining with \n.
  const lines = original.split('\n');

  const outDirAbs = path.join(CSS_DIR, plan.outDir);
  fs.mkdirSync(outDirAbs, { recursive: true });

  // Compute [start, end) ranges from the declared start lines.
  const ranges = plan.parts.map((p, i) => {
    const startIdx = p.startLine - 1;
    const endIdx = i + 1 < plan.parts.length ? plan.parts[i + 1].startLine - 1 : lines.length;
    return { ...p, startIdx, endIdx };
  });

  // --- Verify the split is lossless BEFORE writing anything ---------------
  const rebuilt = ranges.map(r => lines.slice(r.startIdx, r.endIdx).join('\n')).join('\n');
  if (rebuilt !== original) {
    console.error(`ABORT: split of ${plan.source} is not byte-identical. Nothing written.`);
    console.error(`  original ${original.length} chars, rebuilt ${rebuilt.length} chars`);
    process.exitCode = 1;
    continue;
  }

  const written = [];
  for (const r of ranges) {
    const body = lines.slice(r.startIdx, r.endIdx).join('\n');
    const header =
      `/* ==========================================================================\n` +
      `   ${plan.source} — part ${r.name}\n` +
      `   ${r.label}\n\n` +
      `   Extracted from the original ${lines.length}-line ${plan.source}\n` +
      `   (source lines ${r.startIdx + 1}-${r.endIdx}).\n\n` +
      `   ORDER MATTERS: these parts must stay linked in numeric order in\n` +
      `   index.html. Later rules intentionally override earlier ones.\n` +
      `   ========================================================================== */\n\n`;

    fs.writeFileSync(path.join(outDirAbs, r.name), header + body, 'utf8');
    written.push({ name: r.name, lines: r.endIdx - r.startIdx });
  }

  console.log(`\n${plan.source} -> css/${plan.outDir}/ (${written.length} parts)`);
  written.forEach(w => console.log(`   ${String(w.lines).padStart(5)} lines  ${w.name}`));
  totalParts += written.length;

  // Replace the original with a pointer so a stale copy can't silently be used.
  const linkList = ranges
    .map(r => `     <link rel="stylesheet" href="css/${plan.outDir}/${r.name}">`)
    .join('\n');
  fs.writeFileSync(
    srcPath,
    `/* ==========================================================================\n` +
    `   ${plan.source} has been split into css/${plan.outDir}/ for maintainability.\n\n` +
    `   This file is intentionally empty. Do not add rules here — they would not\n` +
    `   be loaded. index.html links the parts directly, in this order:\n\n` +
    `${linkList}\n\n` +
    `   Order is significant: later parts override earlier ones.\n` +
    `   ========================================================================== */\n`,
    'utf8'
  );
}

console.log(`\nTotal parts written: ${totalParts}`);
