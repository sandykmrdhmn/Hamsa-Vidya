/**
 * One-shot codemod: replace hand-rolled blob-download blocks with
 * UIUtils.downloadBlob().
 *
 * The repeated idiom was:
 *     const link = document.createElement('a');
 *     link.href = URL.createObjectURL(BLOB);
 *     link.download = NAME;
 *     link.click();
 *     ...
 *     setTimeout(() => URL.revokeObjectURL(link.href), 10000);
 *
 * Problems with the copies: the anchor was never removed from the DOM in some
 * variants, and the 10-second revoke timer leaked the object URL if the tab
 * closed first. UIUtils.downloadBlob() handles both.
 *
 * Revokes that clean up *state* (e.g. a cached preview URL) are left alone —
 * only the `link.href` download revokes are removed.
 */

const fs = require('fs');
const path = require('path');

const TARGETS = [
  'js/views/tools.js',
  'js/views/ai-teacher.js',
  'js/views/answer-writing.js',
  'js/views/study-notes.js',
  'js/db.js'
];

// const link = document.createElement('a');            (var name captured)
// link.href = URL.createObjectURL(<blob>);
// link.download = <name>;
// [optional] document.body.appendChild(link);
// link.click();
// [optional] document.body.removeChild(link);
const DOWNLOAD_RE = new RegExp(
  [
    /(^[ \t]*)const (\w+) = document\.createElement\('a'\);[ \t]*\r?\n/,
    /[ \t]*\2\.href = URL\.createObjectURL\(([^;]+?)\);[ \t]*\r?\n/,
    /[ \t]*\2\.download = ([^;]+?);[ \t]*\r?\n/,
    /(?:[ \t]*document\.body\.appendChild\(\2\);[ \t]*\r?\n)?/,
    /[ \t]*\2\.click\(\);[ \t]*\r?\n/,
    /(?:[ \t]*document\.body\.removeChild\(\2\);[ \t]*\r?\n)?/
  ].map(r => r.source).join(''),
  'gm'
);

let grandTotal = 0;
let revokesRemoved = 0;

for (const rel of TARGETS) {
  const file = path.join(__dirname, '..', rel);
  let src = fs.readFileSync(file, 'utf8');
  let count = 0;

  src = src.replace(DOWNLOAD_RE, (_m, indent, varName, blobExpr, nameExpr) => {
    count++;
    return `${indent}UIUtils.downloadBlob(${blobExpr.trim()}, ${nameExpr.trim()});\n`;
  });

  // Drop the now-orphaned revoke timers that referenced the removed anchor.
  const revokeRe = /^[ \t]*setTimeout\(\(\) => URL\.revokeObjectURL\(\w+\.href\), \d+\);[ \t]*\r?\n/gm;
  const revokeMatches = src.match(revokeRe);
  if (revokeMatches) {
    revokesRemoved += revokeMatches.length;
    src = src.replace(revokeRe, '');
  }

  // Also the immediate-revoke variant used right after a click.
  const immediateRe = /^[ \t]*URL\.revokeObjectURL\(url\);[ \t]*\r?\n(?=\s*(?:if \(window\.app\)|\}))/gm;
  const immediateMatches = src.match(immediateRe);
  if (immediateMatches) {
    revokesRemoved += immediateMatches.length;
    src = src.replace(immediateRe, '');
  }

  fs.writeFileSync(file, src, 'utf8');
  console.log(`${rel}: ${count} download block(s) replaced`);
  grandTotal += count;
}

console.log(`\nTotal downloads consolidated: ${grandTotal}`);
console.log(`Orphaned revoke timers removed: ${revokesRemoved}`);
