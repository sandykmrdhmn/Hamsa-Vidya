/**
 * One-shot codemod: accept LIKELY_ELIGIBLE wherever the UI tests for ELIGIBLE.
 *
 * LIKELY_ELIGIBLE means "meets the criteria, but the criteria were inferred from
 * a job-alert feed". It must still count as eligible for filtering, counting,
 * card styling and the Apply button — otherwise every scraped exam (all of which
 * carry estimated data) would disappear from the Eligible view.
 *
 * Line 599 is deliberately left alone: it is a distinct branch inside a
 * status-to-label mapper that already gets its own LIKELY_ELIGIBLE case.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'js', 'views', 'exam-alerts.js');
let src = fs.readFileSync(file, 'utf8');

const edits = [
  {
    what: 'eligible count in stats',
    from: `const eligible = all.filter(e => e._eligibilityResult?.status === 'ELIGIBLE');`,
    to: `const eligible = all.filter(e => window.isEligibilityPositive?.(e._eligibilityResult?.status));`
  },
  {
    what: 'card border highlight',
    from: `\${result.status === 'ELIGIBLE' ? 'border-eligible' : ''}`,
    to: `\${this._isPositive(result) ? 'border-eligible' : ''}`
  },
  {
    what: 'table-row apply button',
    from: `\${result.status === 'ELIGIBLE' && days >= 0 ? \`<a href="\${exam.officialApplyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary ea-apply-btn"`,
    to: `\${this._isPositive(result) && days >= 0 ? \`<a href="\${exam.officialApplyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary ea-apply-btn"`
  },
  {
    what: 'detail modal heading icon',
    from: `\${result.status === 'ELIGIBLE' ? 'check-circle' : result.status === 'NEEDS_VERIFICATION' ? 'alert-circle' : 'x-circle'}`,
    to: `\${this._isPositive(result) ? 'check-circle' : result.status === 'NEEDS_VERIFICATION' ? 'alert-circle' : 'x-circle'}`
  },
  {
    what: 'detail modal checks grid',
    from: `\${result.status === 'ELIGIBLE' && result.checks ? \``,
    to: `\${this._isPositive(result) && result.checks ? \``
  },
  {
    what: 'detail modal apply button',
    from: `\${result.status === 'ELIGIBLE' && days >= 0 ? \`<a href="\${exam.officialApplyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">`,
    to: `\${this._isPositive(result) && days >= 0 ? \`<a href="\${exam.officialApplyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">`
  }
];

let applied = 0;
for (const e of edits) {
  if (!src.includes(e.from)) {
    console.log(`  SKIP (not found): ${e.what}`);
    continue;
  }
  src = src.split(e.from).join(e.to);
  console.log(`  OK: ${e.what}`);
  applied++;
}

fs.writeFileSync(file, src, 'utf8');
console.log(`\nApplied ${applied}/${edits.length} edits.`);
