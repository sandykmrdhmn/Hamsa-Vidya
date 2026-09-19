/**
 * Verify the onboarding education list.
 *
 * WHAT CHANGED
 * The profile form used to ask for exactly three things: a 10th percentage, a
 * 12th percentage and one "highest qualification". Both percentages were
 * mandatory, which meant a 10th-pass-only candidate could not complete the
 * profile at all — and a graduate had nowhere to record an ITI, a diploma or a
 * B.Ed alongside the degree. It is now a repeatable list.
 *
 * WHERE THE RISK IS
 * The eligibility engine still reads flat fields (`tenthPercentage`,
 * `twelfthPercentage`, `qualificationId`, `score`, `scoreType`). Those are now
 * DERIVED from the list on save, so the failure modes are:
 *
 *   1. Derivation picks the wrong "highest" qualification, and every exam is
 *      matched against the wrong education bar.
 *   2. A profile saved before the list existed loses its data on load, so a user
 *      who had filled everything in sees an empty form.
 *   3. 10th/12th become quietly mandatory again, re-locking the users the change
 *      was made for.
 *
 * The logic is pure, so it is executed directly rather than driven through the
 * DOM. The form markup and handler wiring are checked statically.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const HTML = read('index.html');
const APP = read('js/app.js');
const CSS = read('css/onboarding.css');
const SW = read('sw.js');

/** Load exam-profile.js with a localStorage stub and return the manager. */
function loadProfileManager() {
  const store = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    Math, Date, JSON, Number, String, Array, Object, isNaN, parseFloat, parseInt
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(read('js/exam-profile.js'), { filename: 'exam-profile.js' }).runInContext(sandbox);
  return { mgr: sandbox.window.examProfileManager, sandbox, store };
}

// ===========================================================================
console.log('\n=== Derivation: the list feeds the eligibility engine ===');
// ===========================================================================
{
  const { mgr } = loadProfileManager();

  // ---- the highest qualification wins, regardless of the order added
  const jumbled = mgr.deriveFromEducation([
    { level: 'BTECH', scoreType: 'PERCENTAGE', score: 72 },
    { level: '10TH_PASS', scoreType: 'PERCENTAGE', score: 88 },
    { level: 'DIPLOMA', scoreType: 'PERCENTAGE', score: 68 },
    { level: '12TH_PASS', scoreType: 'PERCENTAGE', score: 79 }
  ]);
  check('the highest qualification is chosen, not the first row',
    jumbled.qualificationId === 'BTECH', jumbled.qualificationId);
  check('the highest row supplies the degree score',
    jumbled.score === 72 && jumbled.scoreType === 'PERCENTAGE', JSON.stringify(jumbled));
  check('10th marks are read from the 10th row', jumbled.tenthPercentage === 88);
  check('12th marks are read from the 12th row', jumbled.twelfthPercentage === 79);

  const reversed = mgr.deriveFromEducation([
    { level: '10TH_PASS', scoreType: 'PERCENTAGE', score: 88 },
    { level: 'MSC', scoreType: 'PERCENTAGE', score: 65 }
  ]);
  check('order of entry does not change the answer',
    reversed.qualificationId === 'MSC', reversed.qualificationId);

  // ---- 10th-pass only: the case the old form made impossible
  const tenthOnly = mgr.deriveFromEducation([
    { level: '10TH_PASS', scoreType: 'PERCENTAGE', score: 62 }
  ]);
  check('a 10th-pass-only student derives a valid qualification',
    tenthOnly.qualificationId === '10TH_PASS', tenthOnly.qualificationId);
  check('their 10th marks are recorded', tenthOnly.tenthPercentage === 62);
  check('their 12th marks stay null rather than becoming 0',
    tenthOnly.twelfthPercentage === null, String(tenthOnly.twelfthPercentage));

  // ---- CGPA has to become a percentage to be comparable with a notification
  const cgpa = mgr.deriveFromEducation([
    { level: '10TH_PASS', scoreType: 'CGPA', score: 9.2 },
    { level: 'BTECH', scoreType: 'CGPA', score: 8.0 }
  ]);
  check('a 10th CGPA is converted to a percentage for comparison',
    cgpa.tenthPercentage === 87.4, String(cgpa.tenthPercentage));
  check('the degree score keeps its CGPA form and unit',
    cgpa.score === 8.0 && cgpa.scoreType === 'CGPA', JSON.stringify(cgpa));
  check('a converted percentage is capped at 100',
    mgr.deriveFromEducation([{ level: '10TH_PASS', scoreType: 'CGPA', score: 10.6 }]).tenthPercentage === 100);

  // ---- marks are optional
  const noMarks = mgr.deriveFromEducation([{ level: 'BA', scoreType: 'PERCENTAGE', score: null }]);
  check('a qualification with no marks still sets the level',
    noMarks.qualificationId === 'BA' && noMarks.score === null, JSON.stringify(noMarks));

  // ---- board and stream ride along for display
  const withBoards = mgr.deriveFromEducation([
    { level: '10TH_PASS', institution: 'CBSE', passingYear: 2016, scoreType: 'PERCENTAGE', score: 80 },
    { level: '12TH_PASS', institution: 'Science (PCM)', passingYear: 2018, scoreType: 'PERCENTAGE', score: 75 }
  ]);
  check('the 10th board is carried across', withBoards.tenthBoard === 'CBSE');
  check('the 12th stream is carried across', withBoards.twelfthStream === 'Science (PCM)');
  check('passing years are carried across',
    withBoards.tenthPassingYear === 2016 && withBoards.twelfthPassingYear === 2018);

  // ---- degenerate input must not throw
  check('an empty list derives empty fields',
    mgr.deriveFromEducation([]).qualificationId === '' &&
    mgr.deriveFromEducation([]).tenthPercentage === null);
  check('a non-array is tolerated', mgr.deriveFromEducation(null).qualificationId === '');
  check('rows without a level are ignored',
    mgr.deriveFromEducation([{ level: '', score: 50 }]).qualificationId === '');
}

// ===========================================================================
console.log('\n=== Saving: validation matches what the form allows ===');
// ===========================================================================
{
  const { mgr } = loadProfileManager();

  const base = {
    fullName: 'Sandeep Kumar',
    dateOfBirth: '1996-06-16',
    category: 'OBC',
    gender: 'MALE',
    domicile: 'Punjab'
  };

  // The headline fix: one qualification is enough.
  const tenthOnly = mgr.saveProfile({
    ...base,
    education: [{ level: '10TH_PASS', scoreType: 'PERCENTAGE', score: 62 }]
  });
  check('a 10th-pass-only profile saves',
    tenthOnly.valid === true, JSON.stringify(tenthOnly.errors));
  check('it is considered complete', mgr.isProfileComplete() === true);
  check('no 12th percentage is invented',
    tenthOnly.profile.twelfthPercentage === null, String(tenthOnly.profile?.twelfthPercentage));

  // Nothing at all must still be refused.
  const none = mgr.saveProfile({ ...base, education: [] });
  check('a profile with no qualification is refused', none.valid === false);
  check('the error names the education section',
    !!none.errors.education, JSON.stringify(none.errors));

  // Validation of the rows themselves.
  const badPct = mgr.saveProfile({
    ...base, education: [{ level: '10TH_PASS', scoreType: 'PERCENTAGE', score: 140 }]
  });
  check('a percentage above 100 is refused', badPct.valid === false, JSON.stringify(badPct.errors));

  const badCgpa = mgr.saveProfile({
    ...base, education: [{ level: 'BTECH', scoreType: 'CGPA', score: 12 }]
  });
  check('a CGPA above 10 is refused', badCgpa.valid === false);
  check('the CGPA limit is stated in the message',
    /between 0 and 10/.test(badCgpa.errors.education || ''), badCgpa.errors.education);

  const okCgpa = mgr.saveProfile({
    ...base, education: [{ level: 'BTECH', scoreType: 'CGPA', score: 8.4 }]
  });
  check('a valid CGPA is accepted', okCgpa.valid === true, JSON.stringify(okCgpa.errors));

  const dupe = mgr.saveProfile({
    ...base,
    education: [
      { level: '12TH_PASS', scoreType: 'PERCENTAGE', score: 70 },
      { level: '12TH_PASS', scoreType: 'PERCENTAGE', score: 80 }
    ]
  });
  check('the same qualification twice is refused', dupe.valid === false);
  check('the duplicate is named', /twice/i.test(dupe.errors.education || ''), dupe.errors.education);

  const badYear = mgr.saveProfile({
    ...base, education: [{ level: '10TH_PASS', passingYear: 1850, score: 70 }]
  });
  check('an impossible passing year is refused', badYear.valid === false);

  const unknown = mgr.saveProfile({
    ...base, education: [{ level: 'NOT_A_REAL_LEVEL', score: 70 }]
  });
  check('an unrecognised qualification is refused', unknown.valid === false);

  // Marks are optional — a year and a board are too.
  const minimal = mgr.saveProfile({
    ...base, education: [{ level: 'GRADUATION' }]
  });
  check('a qualification with no marks, board or year saves',
    minimal.valid === true, JSON.stringify(minimal.errors));

  // What gets stored.
  const full = mgr.saveProfile({
    ...base,
    education: [
      { level: '10TH_PASS', institution: 'CBSE', passingYear: 2012, scoreType: 'PERCENTAGE', score: 88 },
      { level: '12TH_PASS', institution: 'Science (PCM)', passingYear: 2014, scoreType: 'PERCENTAGE', score: 79 },
      { level: 'BTECH', institution: 'Punjab University', passingYear: 2018, scoreType: 'CGPA', score: 8.1 }
    ],
    hasBEd: false,
    physicalFitnessReady: true
  });
  check('all three qualifications are stored', full.profile.education.length === 3);
  check('the stored list keeps the order they were added',
    full.profile.education.map(e => e.level).join(',') === '10TH_PASS,12TH_PASS,BTECH');
  check('the derived highest qualification is the degree',
    full.profile.qualificationId === 'BTECH', full.profile.qualificationId);
  check('the derived label is human-readable',
    full.profile.qualification === 'B.Tech', full.profile.qualification);
  check('derived 10th and 12th percentages reach the engine fields',
    full.profile.tenthPercentage === 88 && full.profile.twelfthPercentage === 79);
  check('the degree CGPA is stored as a CGPA',
    full.profile.score === 8.1 && full.profile.scoreType === 'CGPA');
  check('institution text is length-capped',
    mgr.saveProfile({
      ...base, education: [{ level: 'BA', institution: 'x'.repeat(300) }]
    }).profile.education[0].institution.length === 120);
}

// ===========================================================================
console.log('\n=== Migration: an older profile must not appear empty ===');
// ===========================================================================
{
  const { mgr, store } = loadProfileManager();

  // Exactly what the previous version wrote to localStorage.
  store.set('hamsa_exam_profile', JSON.stringify({
    fullName: 'Sandeep Kumar',
    gender: 'MALE',
    dateOfBirth: '1990-06-16',
    category: 'OBC',
    domicile: 'Punjab',
    tenthPercentage: 75,
    tenthBoard: 'State Board',
    tenthPassingYear: 2006,
    twelfthPercentage: 62,
    twelfthStream: 'Science (PCM)',
    twelfthPassingYear: 2008,
    qualificationId: 'BCA',
    qualification: 'BCA',
    scoreType: 'PERCENTAGE',
    score: 68,
    hasBEd: false,
    physicalFitnessReady: true
  }));

  const loaded = mgr.loadProfile();
  check('an older profile still loads', !!loaded);
  check('an education list is rebuilt from the old flat fields',
    Array.isArray(loaded.education) && loaded.education.length === 3,
    JSON.stringify(loaded.education));
  check('the 10th row is rebuilt with its board and year',
    loaded.education[0].level === '10TH_PASS' &&
    loaded.education[0].score === 75 &&
    loaded.education[0].institution === 'State Board' &&
    loaded.education[0].passingYear === 2006,
    JSON.stringify(loaded.education[0]));
  check('the 12th row is rebuilt with its stream',
    loaded.education[1].level === '12TH_PASS' && loaded.education[1].institution === 'Science (PCM)');
  check('the old highest qualification becomes its own row',
    loaded.education[2].level === 'BCA' && loaded.education[2].score === 68);
  check('the migrated profile is still complete, so the modal does not re-lock',
    mgr.isProfileComplete() === true);

  // The migration must not rewrite what is on disk — only a submit should.
  const onDisk = JSON.parse(store.get('hamsa_exam_profile'));
  check('loading does not silently persist the migration',
    onDisk.education === undefined,
    'a read that writes would mutate the user profile behind their back');

  // A 10th-only legacy profile: the old form could not produce one, but a
  // restored backup could.
  const { mgr: mgr2, store: store2 } = loadProfileManager();
  store2.set('hamsa_exam_profile', JSON.stringify({
    fullName: 'A B', dateOfBirth: '2000-01-01', category: 'SC',
    tenthPercentage: 55, qualificationId: '10TH_PASS'
  }));
  const partial = mgr2.loadProfile();
  check('a legacy profile with only 10th rebuilds one row',
    partial.education.length === 1 && partial.education[0].level === '10TH_PASS',
    JSON.stringify(partial.education));

  // A profile that already has a list must be left alone.
  const { mgr: mgr3, store: store3 } = loadProfileManager();
  store3.set('hamsa_exam_profile', JSON.stringify({
    fullName: 'C D', dateOfBirth: '2000-01-01', category: 'GENERAL',
    education: [{ level: 'MBA', scoreType: 'PERCENTAGE', score: 70 }],
    tenthPercentage: 90
  }));
  const existing = mgr3.loadProfile();
  check('an existing education list is not overwritten by migration',
    existing.education.length === 1 && existing.education[0].level === 'MBA',
    JSON.stringify(existing.education));
}

// ===========================================================================
console.log('\n=== Completeness no longer demands both school percentages ===');
// ===========================================================================
{
  const { mgr } = loadProfileManager();

  check('a blank profile is incomplete', mgr.isProfileComplete() === false);

  mgr.saveProfile({
    fullName: 'X Y', dateOfBirth: '1999-01-01', category: 'GENERAL',
    education: [{ level: 'ITI' }]
  });
  check('an ITI-only profile counts as complete', mgr.isProfileComplete() === true);

  // Name, DOB and category are still required, since the engine cannot run
  // without them.
  const noDob = mgr.saveProfile({
    fullName: 'X Y', dateOfBirth: '', category: 'GENERAL',
    education: [{ level: 'ITI' }]
  });
  check('date of birth is still required', noDob.valid === false, JSON.stringify(noDob.errors));

  const readiness = mgr.getEligibilityReadiness();
  check('readiness reporting still works after the change',
    typeof readiness.percent === 'number' && Array.isArray(readiness.missing));
}

// ===========================================================================
console.log('\n=== Form markup and handler wiring ===');
// ===========================================================================
{
  // The fields the list replaced must be gone, or the old ones would be read
  // back on submit and quietly win.
  for (const id of ['ob-tenthPercentage', 'ob-twelfthPercentage', 'ob-qualification', 'ob-score', 'ob-scoreType']) {
    check(`the old #${id} input is gone`, !HTML.includes(`id="${id}"`));
  }
  check('the old schooling section heading is gone',
    !/Schooling Details \(10th & 12th Marks/.test(HTML));

  check('the education section exists', HTML.includes('id="ob-group-education"'));
  check('rows are rendered into a list container', HTML.includes('id="ob-education-list"'));
  check('there is a plus button to add a qualification',
    HTML.includes('id="ob-add-education"') && /onclick="app\.addEducationRow\(\)"/.test(HTML));
  check('the plus sign is shown on the button', /class="ob-add-icon"[^>]*>\+</.test(HTML));
  check('the section has its own error slot', HTML.includes('id="ob-err-education"'));
  check('a live count is shown', HTML.includes('id="ob-education-count"'));
  check('the note explains why every qualification matters',
    /Add every qualification you have completed/.test(HTML));

  // Handlers.
  for (const fn of ['addEducationRow', 'removeEducationRow', '_renderEducationRows',
                    '_collectEducation', 'validateEducation', '_syncEducationRowsFromDom']) {
    check(`app.${fn}() exists`, new RegExp(`\\n  ${fn}\\(`).test(APP));
  }
  check('rows are seeded from the saved profile',
    /_initEducationRows\(profileData\)/.test(APP));
  check('the submit handler sends the collected list',
    /education: this\._collectEducation\(\)/.test(APP));
  check('submit refuses to continue on an invalid list',
    /if \(!this\.validateEducation\(\)\)/.test(APP));

  // Re-render reads the DOM back first, so edits are never lost.
  check('state is synced from the DOM before re-rendering',
    /_syncEducationRowsFromDom\(\);\s*\n\s*this\._renderEducationRows\(\)/.test(APP),
    'a re-render that ignores current input would discard what the user typed');

  // Escaping: institution text is user input and is interpolated into a value.
  check('row values are escaped before interpolation',
    /const esc = \(v\) => SecurityUtils\.escapeHtml/.test(APP) &&
    /value="\$\{esc\(row\.institution\)\}"/.test(APP));

  // Two blank rows would be a dead end.
  check('a second blank row is refused',
    /const hasBlank = this\._educationRows\.some\(r => !r\.level\)/.test(APP));
  // Removing the last row must leave something to type into.
  check('removing the last row leaves one blank row',
    /this\._educationRows = \[this\._blankEducationRow\(\)\]/.test(APP));
  check('an already-added qualification cannot be picked twice',
    /chosen\.includes\(o\.id\)/.test(APP));
}

// ===========================================================================
console.log('\n=== Styling ===');
// ===========================================================================
{
  check('css/onboarding.css is linked', /<link[^>]+href="css\/onboarding\.css"/.test(HTML));
  const linked = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  check('it is linked after exam-alerts.css, whose rules it overrides',
    linked.indexOf('css/onboarding.css') > linked.indexOf('css/exam-alerts.css'),
    `onboarding=${linked.indexOf('css/onboarding.css')} exam-alerts=${linked.indexOf('css/exam-alerts.css')}`);
  check('it is linked before responsive.css',
    linked.indexOf('css/onboarding.css') < linked.indexOf('css/responsive.css'));
  check('it is precached', /'css\/onboarding\.css'/.test(SW));

  check('each qualification is presented as its own card', /\.ob-edu-row \{/.test(CSS));
  check('rows are numbered', /\.ob-edu-num \{/.test(CSS));
  check('the add button is a full-width dashed target',
    /\.ob-add-education \{[\s\S]{0,400}border: 1\.5px dashed/.test(CSS));
  check('the plus icon rotates on hover, so the affordance is legible',
    /\.ob-add-education:hover:not\(:disabled\) \.ob-add-icon \{[\s\S]{0,80}rotate\(90deg\)/.test(CSS));

  // Inputs inside .ob-edu-field are not covered by exam-alerts.css's
  // .onboarding-input-group rules, so they must be styled here or they fall
  // back to browser defaults and look nothing like the rest of the form.
  check('row inputs are styled rather than left as browser defaults',
    /\.ob-edu-field input,\s*\.ob-edu-field select \{/.test(CSS));
  check('row inputs get a visible focus ring',
    /\.ob-edu-field input:focus,\s*\.ob-edu-field select:focus \{[\s\S]{0,200}box-shadow: 0 0 0 3px/.test(CSS));

  check('the four fields are sized by importance',
    /\.ob-edu-grid \{[\s\S]{0,200}grid-template-columns: minmax\(0, 1\.4fr\)/.test(CSS));
  check('the grid collapses to two columns on a tablet',
    /@media \(max-width: 900px\)[\s\S]{0,300}\.ob-edu-grid \{[\s\S]{0,120}1fr\) minmax\(0, 1fr\)/.test(CSS));
  check('the qualification selector spans the row when space is tight',
    /@media \(max-width: 900px\)[\s\S]{0,400}\.ob-edu-field-level \{[\s\S]{0,80}grid-column: 1 \/ -1/.test(CSS));
  check('it collapses to one column on a phone',
    /@media \(max-width: 560px\)[\s\S]{0,200}\.ob-edu-grid \{[\s\S]{0,80}grid-template-columns: 1fr/.test(CSS));

  check('the error state is visible on the section and its rows',
    /#ob-group-education\.has-error/.test(CSS) && /#ob-err-education:not\(:empty\)/.test(CSS));
  check('the row entrance animation respects reduced motion',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,260}\.ob-edu-row \{[\s\S]{0,80}animation: none/.test(CSS));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
