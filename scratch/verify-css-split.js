/**
 * Verify the CSS split (M4) did not change a single byte of effective CSS.
 *
 * Concatenates the parts in the order index.html links them and compares the
 * result against the pre-split backups. This is the check that makes the split
 * trustworthy: identical bytes in identical order means an identical cascade.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const html = read('index.html');

/** Stylesheet hrefs in the order the document links them. */
function linkedStylesheets() {
  const out = [];
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** Strip the banner comment the splitter prepends to each part. */
function stripPartHeader(text, partName) {
  const marker = `part ${partName}`;
  if (!text.includes(marker)) return text;
  const end = text.indexOf('*/');
  if (end === -1) return text;
  // The banner is followed by exactly one blank line.
  return text.slice(end + 2).replace(/^\r?\n\r?\n/, '');
}

console.log('\n=== M4: split integrity ===');

/**
 * `frozen` means the parts have not been edited since the split, so the
 * concatenation must still equal the pre-split backup byte for byte. That check
 * is what made the migration trustworthy.
 *
 * Once a group is intentionally edited the comparison stops being meaningful —
 * it would either fail forever or have to be silenced by regenerating the
 * baseline, which makes it tautological. Those groups get structural checks
 * instead, plus targeted assertions about the change that was made.
 */
const GROUPS = [
  {
    backup: 'scratch/_backup/components.css',
    dir: 'css/components',
    frozen: true
  },
  {
    backup: 'scratch/_backup/ai-teacher.css',
    dir: 'css/ai-teacher',
    frozen: false,
    divergenceReason: 'hero banner was redesigned (logo removed, stats + deliverables added)'
  }
];

const linked = linkedStylesheets();

for (const g of GROUPS) {
  const name = path.basename(g.backup);
  const parts = linked.filter(href => href.startsWith(g.dir + '/'));

  check(`${name}: parts are linked in index.html`, parts.length > 0, 'none linked');

  // Numeric prefixes must be strictly increasing in document order — the
  // cascade depends on it.
  const nums = parts.map(p => Number(path.basename(p).slice(0, 2)));
  const ascending = nums.every((n, i) => i === 0 || n > nums[i - 1]);
  check(`${name}: linked in ascending part order`, ascending, nums.join(','));

  // Every file on disk must be linked, and every link must exist on disk.
  const onDisk = fs.readdirSync(path.join(ROOT, g.dir)).filter(f => f.endsWith('.css')).sort();
  const linkedNames = parts.map(p => path.basename(p)).sort();
  check(`${name}: every part on disk is linked`,
    JSON.stringify(onDisk) === JSON.stringify(linkedNames),
    `disk=[${onDisk}] linked=[${linkedNames}]`);

  // No part should be empty — an empty file means content was lost.
  const empty = parts.filter(href => {
    const body = stripPartHeader(read(href), path.basename(href));
    return body.replace(/\/\*[\s\S]*?\*\//g, '').trim().length === 0;
  });
  check(`${name}: no part is empty`, empty.length === 0, empty.join(', '));

  if (g.frozen) {
    const original = read(g.backup);
    const rebuilt = parts
      .map(href => stripPartHeader(read(href), path.basename(href)))
      .join('\n');

    check(`${name}: concatenated parts match the original exactly`,
      rebuilt === original,
      `original ${original.length} chars vs rebuilt ${rebuilt.length} chars`);

    if (rebuilt !== original) {
      // Point at the first divergence to make debugging quick.
      for (let i = 0; i < Math.max(rebuilt.length, original.length); i++) {
        if (rebuilt[i] !== original[i]) {
          console.log(`        first difference at char ${i}`);
          console.log(`        original: ${JSON.stringify(original.slice(i - 40, i + 40))}`);
          console.log(`        rebuilt : ${JSON.stringify(rebuilt.slice(i - 40, i + 40))}`);
          break;
        }
      }
    }
  } else {
    console.log(`        (byte-identity not asserted — ${g.divergenceReason})`);
  }
}

console.log('\n=== AI Teacher hero redesign ===');
{
  const heroCss = read('css/ai-teacher/01-hero-and-input.css');
  const heroJs = read('js/views/ai-teacher.js');

  // The orbital logo and its animation layers must be gone from both sides.
  const deadClasses = [
    'teacher-logo-orbit-stage', 'orbit-glow-disc', 'orbit-ring',
    'orbit-particle', 'teacher-hamsa-logo-img', 'teacher-brand-hero-emblem',
    'teacher-hero-text-block', 'teacher-hero-header'
  ];
  const stillInCss = deadClasses.filter(c => heroCss.includes(c));
  check('old orbital-logo CSS removed', stillInCss.length === 0, stillInCss.join(', '));

  const stillInJs = deadClasses.filter(c => heroJs.includes(c));
  check('old orbital-logo markup removed', stillInJs.length === 0, stillInJs.join(', '));

  check('hero no longer renders the 3D logo image',
    !/teacher-hero[\s\S]{0,2000}hamsa-logo-3d\.png/.test(heroJs) ||
    !/_buildHeroHTML[\s\S]{0,3000}hamsa-logo-3d/.test(heroJs));

  // New structure present on both sides.
  for (const cls of ['teacher-hero', 'teacher-hero-inner', 'teacher-hero-stats',
                     'hero-stat', 'teacher-hero-deliverables', 'deliverable-pill']) {
    check(`CSS defines .${cls}`, new RegExp(`\\.${cls}[\\s,{:]`).test(heroCss));
  }
  check('JS renders the new hero', /_buildHeroHTML\(stats/.test(heroJs));
  check('hero is fed real stats', /getAiTeacherStats/.test(heroJs));

  // Accessibility and robustness of the new decoration.
  check('decorative layers are aria-hidden',
    /teacher-hero-aurora" aria-hidden="true"/.test(heroJs) &&
    /teacher-hero-grid-overlay" aria-hidden="true"/.test(heroJs));
  check('stat list has list semantics', /role="list"/.test(heroJs) && /role="listitem"/.test(heroJs));
  check('gradient text has a colour fallback',
    /\.hero-title-accent \{[\s\S]{0,200}color: var\(--color-primary-light\)/.test(heroCss));
  check('reduced-motion disables the pulse',
    /prefers-reduced-motion[\s\S]{0,260}live-pulse-radar[\s\S]{0,80}animation: none/.test(heroCss));
  check('print hides the decoration', /@media print[\s\S]{0,320}teacher-hero-aurora/.test(heroCss));
  check('deliverable labels are escaped', /escapeHtml\(d\.label\)/.test(heroJs));
  check('stats degrade to zero if the DB read fails',
    /catch[\s\S]{0,180}AI Teacher stats unavailable/.test(heroJs));

  // Print stylesheet must target the renamed root.
  const printCss = read('css/ai-teacher/07-print-and-responsive.css');
  check('print stylesheet targets .teacher-hero',
    printCss.includes('.teacher-hero,') && !printCss.includes('.teacher-hero-header'));
}

console.log('\n=== M4: originals are neutralised, not left as stale duplicates ===');
{
  for (const f of ['css/components.css', 'css/ai-teacher.css']) {
    const src = read(f);
    check(`${path.basename(f)} contains no rules`,
      !/\{[^}]*:[^}]*\}/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
      'still has declarations');
    check(`${path.basename(f)} explains where the rules moved`, /split into/.test(src));
    check(`${path.basename(f)} is no longer linked`,
      !linked.includes(f), 'still linked in index.html');
  }
}

console.log('\n=== M4: file sizes are workable ===');
{
  const oversized = [];
  for (const dir of ['css/components', 'css/ai-teacher']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const lines = read(`${dir}/${f}`).split('\n').length;
      if (lines > 2300) oversized.push(`${dir}/${f} (${lines})`);
    }
  }
  check('no part exceeds ~2300 lines', oversized.length === 0, oversized.join(', '));

  const biggest = Math.max(...['css/components', 'css/ai-teacher'].flatMap(dir =>
    fs.readdirSync(path.join(ROOT, dir)).map(f => read(`${dir}/${f}`).split('\n').length)
  ));
  console.log(`        largest remaining part: ${biggest} lines (was 8132)`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
