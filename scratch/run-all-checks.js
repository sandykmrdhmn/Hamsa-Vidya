#!/usr/bin/env node
/**
 * Runs every verification suite and reports a single pass/fail summary.
 *
 *   node scratch/run-all-checks.js
 *
 * The PowerShell server suites are listed but not executed here because they
 * need a live server; the command to run them is printed at the end.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  { file: 'syntax-check.js', label: 'Syntax (all JS parses)' },
  { file: 'verify-ai-client.js', label: 'AI transport + API key safety' },
  { file: 'verify-backup.js', label: 'Backup / restore / rollback' },
  { file: 'verify-quiz-scoring.js', label: 'Marking scheme + timer + resume' },
  { file: 'verify-data-honesty.js', label: 'Data provenance + eligibility + attempts' },
  { file: 'verify-hardening.js', label: 'A11y + sanitizer + AI cancellation' },
  { file: 'verify-ui-utils.js', label: 'Shared helpers + spotlight perf' },
  { file: 'verify-css-split.js', label: 'CSS split is byte-identical' },
  { file: 'verify-service-worker.js', label: 'Offline shell + cache strategy' },
  { file: 'verify-token-usage.js', label: 'AI token accounting + input caps' },
  { file: 'verify-dashboard.js', label: 'Dashboard markup / CSS / data contract' },
  { file: 'verify-view-hero.js', label: 'Shared view hero on every tab' },
  { file: 'verify-template-balance.js', label: 'HTML templates are tag-balanced' },
  { file: 'verify-layout.js', label: 'One shared page width on every view' },
  { file: 'verify-header.js', label: 'Two-tier header fits the page column' },
  { file: 'verify-exam-listing.js', label: 'Exam listing: one source, five fields' },
  { file: 'verify-profile-education.js', label: 'Onboarding education list' },
  { file: 'verify-quiz-palette.js', label: 'In-view overlays are hidden + viewport-fixed' },
  { file: 'verify-auth-gate.js', label: 'Pre-app login gate + social footer' },
];

let totalPass = 0;
let totalFail = 0;
let suitesFailed = 0;

console.log('\n' + '='.repeat(64));
console.log(' HAMSA VIDYA — VERIFICATION SUITES');
console.log('='.repeat(64));

for (const suite of SUITES) {
  const res = spawnSync(process.execPath, [path.join(__dirname, suite.file)], {
    encoding: 'utf8',
    windowsHide: true
  });

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const m = out.match(/RESULT:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  const checkedOnly = out.match(/Checked\s+(\d+)\s+files\s+—\s+(\d+)\s+with syntax errors/);

  let passed = 0;
  let failed = 0;

  if (m) {
    passed = Number(m[1]);
    failed = Number(m[2]);
  } else if (checkedOnly) {
    passed = Number(checkedOnly[1]);
    failed = Number(checkedOnly[2]);
  } else {
    failed = 1; // suite crashed before reporting
  }

  totalPass += passed;
  totalFail += failed;

  const ok = failed === 0 && res.status === 0;
  if (!ok) suitesFailed++;

  const status = ok ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${suite.label}`);
  console.log(`        ${passed} passed, ${failed} failed   (${suite.file})`);

  if (!ok) {
    // Surface the failing lines so the problem is visible without re-running.
    out.split('\n')
      .filter(l => /FAIL|SYNTAX ERROR|Error:/.test(l))
      .slice(0, 12)
      .forEach(l => console.log(`        ${l.trim()}`));
  }
}

console.log('\n' + '='.repeat(64));
console.log(` TOTAL: ${totalPass} checks passed, ${totalFail} failed  —  ${SUITES.length - suitesFailed}/${SUITES.length} suites green`);
console.log('='.repeat(64));
console.log('\nServer suites (need a running server):');
console.log('  node server.js');
console.log('  powershell -ExecutionPolicy Bypass -File scratch/verify-server-hardening.ps1');
console.log('  $env:GEMINI_API_KEY="test"; $env:PORT="3100"; node server.js');
console.log('  powershell -ExecutionPolicy Bypass -File scratch/verify-proxy-limits.ps1\n');

process.exit(totalFail > 0 ? 1 : 0);
