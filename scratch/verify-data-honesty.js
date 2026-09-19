/**
 * Verify Phase 3 (data honesty):
 *   H6 — scraper no longer fabricates data; estimated fields are flagged
 *   H7 — eligibility engine won't say NOT_ELIGIBLE based on inferred numbers
 *   H5 — analytics/history come from the attempts log, so retakes accumulate
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DB_SRC = fs.readFileSync(path.join(ROOT, 'js', 'db.js'), 'utf8');
const ELIG_SRC = fs.readFileSync(path.join(ROOT, 'js', 'eligibility-engine.js'), 'utf8');
const SCRAPER_SRC = fs.readFileSync(path.join(ROOT, 'live-exams-scraper.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

const TABLES = ['quizzes', 'questions', 'attempts', 'notes', 'customDecks', 'customCards',
  'cardReviews', 'exams', 'savedExams', 'answers', 'answerDrafts', 'aiTeacherExplanations'];

function makeTable(autoId = true) {
  return {
    rows: [], _next: 1, autoId,
    async toArray() { return this.rows.map(r => ({ ...r })); },
    async count() { return this.rows.length; },
    async clear() { this.rows = []; },
    async bulkPut(r) { this.rows.push(...r); },
    async add(r) { const id = this.autoId ? this._next++ : r.id; this.rows.push({ ...r, id }); return id; },
    async get(id) { return this.rows.find(r => r.id === id); },
    async update() { return 1; },
    orderBy() { return this; }, reverse() { return this; },
    where() { this._w = true; return this; },
    equals(v) { this._eq = v; return this; },
    filter() { return this; }, or() { return this; }
  };
}

function loadDb() {
  const db = { verno: 7 };
  const chain = { stores: () => chain, upgrade: () => chain };
  db.version = () => chain;
  for (const t of TABLES) db[t] = makeTable(t !== 'exams');

  // attempts.where('quizId').equals(n).toArray() needs to actually filter.
  db.attempts.where = function () {
    return {
      equals: (v) => ({
        toArray: async () => db.attempts.rows.filter(r => r.quizId === v).map(r => ({ ...r })),
        delete: async () => { db.attempts.rows = db.attempts.rows.filter(r => r.quizId !== v); }
      })
    };
  };

  db.transaction = async (_m, _t, fn) => fn();

  const store = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    Dexie: function () { return db; },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(DB_SRC, { filename: 'db.js' }).runInContext(sandbox);
  new vm.Script(ELIG_SRC, { filename: 'eligibility-engine.js' }).runInContext(sandbox);
  return { sandbox, db };
}

(async () => {
  // =========================================================== H6: listing
  //
  // The reader was reduced to ONE source and FIVE columns:
  //   https://www.freejobalert.com/government-jobs/
  //   Post Date | Board | Exam / Post Name | Qualification | Last Date
  //
  // The rule that survived every revision is the one worth guarding: a field
  // is read from a table cell or it is null. An earlier version invented
  // `minAge = 18, maxAge = 32` for 51 of 51 exams, so every eligibility
  // verdict in the app was computed against a number nobody had read.
  console.log('\n=== H6: the listing reader never invents a value ===');
  {
    check('no Math.random() anywhere in the reader',
      !/Math\.random\(\)/.test(SCRAPER_SRC),
      (SCRAPER_SRC.match(/.*Math\.random\(\).*/g) || []).join(' | '));

    // Checked against code with comments stripped: the file header documents
    // what the old version did, and those examples must not read as current.
    const CODE = SCRAPER_SRC
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    // The helpers whose entire job was to guess are gone, not merely unused.
    for (const dead of ['estimateFee', 'estimateSalary', 'markEstimated', 'summariseDataQuality']) {
      check(`the guessing helper ${dead}() is gone`, !new RegExp(`function ${dead}\\b`).test(CODE));
    }
    check('no default minimum age of 18',
      !/minimumAge:\s*18\b/.test(CODE) && !/minAge\s*=\s*18\b/.test(CODE));
    check('no default maximum age of 32',
      !/maximumAge:\s*32\b/.test(CODE) && !/maxAge\s*=\s*32\b/.test(CODE));
    check('no hardcoded rupee fee strings', !/₹\d/.test(CODE));
    check('no hardcoded pay-level strings', !/Level \d+-\d+ \(₹/.test(CODE));
    check('no blanket category relaxation default', !/OBC:\s*3,\s*SC:\s*5/.test(CODE));

    const scraper = require(path.join(ROOT, 'live-exams-scraper.js'));
    const S = scraper._internal;

    // ---- exactly one source, and it is the one that was asked for
    check('the only source is the FreeJobAlert government jobs page',
      scraper.SOURCE.url === 'https://www.freejobalert.com/government-jobs/',
      scraper.SOURCE.url);
    check('no other listing site is contacted',
      !/sarkariresult|sarkari-naukri/i.test(CODE),
      (CODE.match(/.*sarkari.*/gi) || []).slice(0, 3).join(' | '));
    check('the RSS feeds are gone too', !/\/feed/.test(CODE));

    // ---- five published fields, named
    check('exactly five fields are published',
      S.PUBLISHED_FIELDS.length === 5, JSON.stringify(S.PUBLISHED_FIELDS));
    for (const f of ['postDate', 'organizingBody', 'examName', 'eligibility.qualifications', 'applicationDeadline']) {
      check(`${f} is a published field`, S.PUBLISHED_FIELDS.includes(f));
    }

    // ---- parsers return null rather than something plausible
    check('parseDate handles DD-MM-YYYY', S.parseDate('06-10-2026') === '2026-10-06', String(S.parseDate('06-10-2026')));
    check('parseDate handles DD/MM/YYYY', S.parseDate('29/09/2026') === '2026-09-29', String(S.parseDate('29/09/2026')));
    check('parseDate handles a named month', S.parseDate('6 October 2026') === '2026-10-06', String(S.parseDate('6 October 2026')));
    check('parseDate returns null when absent', S.parseDate('apply online now') === null);
    check('parseDate rejects an impossible date', S.parseDate('45/13/2026') === null);
    check('parseDate returns null for empty input', S.parseDate('') === null && S.parseDate(null) === null);

    // The most important one: an earlier version defaulted to GRADUATION
    // whenever the cell said nothing recognisable about education.
    check('parseQualifications returns [] when the cell says nothing',
      S.parseQualifications('-').length === 0 && S.parseQualifications('Various').length === 0,
      JSON.stringify(S.parseQualifications('Various')));
    check('parseQualifications returns [] for empty input',
      S.parseQualifications(null).length === 0 && S.parseQualifications('').length === 0);
    check('parseQualifications reads a stated degree', S.parseQualifications('B.Tech/B.E').includes('BTECH'));
    check('a degree also satisfies the graduate bar', S.parseQualifications('Any Graduate').includes('GRADUATION'));
    check('a school level does not imply a degree',
      S.parseQualifications('10TH').includes('10TH_PASS') &&
      !S.parseQualifications('10TH').includes('GRADUATION'));

    // ---- stable identity, so bookmarks cannot detach on re-sync
    const idA = S.stableId('CPO SI Recruitment 2026', 'SSC');
    const idB = S.stableId('CPO SI Recruitment 2026', 'SSC');
    const idC = S.stableId('ESE Notification 2027', 'UPSC');
    check('stableId is deterministic', idA === idB);
    check('stableId differs per exam', idA !== idC);
    check('stableId is a safe positive integer', Number.isSafeInteger(idA) && idA > 0, String(idA));
    check('stableId ignores punctuation and case',
      S.stableId('cpo  si-recruitment 2026', 'ssc') === idA);

    // ---- the table extractor, against the real markup shape
    const table = [
      '<table><tr>',
      '<th>Post Date</th><th>Recruitment Board</th><th>Exam / Post Name</th>',
      '<th>Qualification</th><th>Advt No</th><th>Last Date</th><th>More Information</th>',
      '</tr><tr>',
      '<td>19-09-2026</td><td>UPSC</td><td>Engineering Services 2027 - 480 Posts</td>',
      '<td>B.Tech/B.E</td><td>02/2027</td><td>06-10-2026</td>',
      '<td><a href="/articles/upsc-ese-2027">Get Details</a></td>',
      '</tr><tr>',
      '<td>18-09-2026</td><td>SSC</td><td>CGL Result 2026 Declared</td>',
      '<td>Any Graduate</td><td>-</td><td>01-10-2026</td>',
      '<td><a href="/articles/ssc-cgl-result">Get Details</a></td>',
      '</tr></table>'
    ].join('');

    const rows = S.extractRows(table, 'https://www.freejobalert.com/government-jobs/');
    check('a result row is skipped, not listed as a vacancy', rows.length === 1,
      JSON.stringify(rows.map(r => r.postName)));
    check('post date is read', rows[0].postDate === '2026-09-19', String(rows[0].postDate));
    check('board is read', rows[0].board === 'UPSC', String(rows[0].board));
    check('post name is read', /Engineering Services 2027/.test(rows[0].postName));
    check('qualification is read verbatim', rows[0].qualificationText === 'B.Tech/B.E', String(rows[0].qualificationText));
    check('last date is read', rows[0].lastDate === '2026-10-06', String(rows[0].lastDate));
    check('the detail link is absolutised',
      rows[0].detailUrl === 'https://www.freejobalert.com/articles/upsc-ese-2027', String(rows[0].detailUrl));

    // Columns are found by header text, so an inserted column shifts nothing.
    const shifted = table.replace('<th>Post Date</th>', '<th>Sr No</th><th>Post Date</th>')
      .replace(/<tr><td>19-09-2026<\/td>/, '<tr><td>1</td><td>19-09-2026</td>')
      .replace(/<tr><td>18-09-2026<\/td>/, '<tr><td>2</td><td>18-09-2026</td>');
    const shiftedRows = S.extractRows(shifted, 'https://www.freejobalert.com/government-jobs/');
    check('an inserted column does not break the mapping',
      shiftedRows.length === 1 && shiftedRows[0].board === 'UPSC' && shiftedRows[0].lastDate === '2026-10-06',
      JSON.stringify(shiftedRows[0] || null));

    // A table without the listing headers is the page's featured-links block.
    check('a headerless featured-links table is ignored',
      S.extractRows('<table><tr><td>A</td><td>B</td><td>C</td></tr></table>', 'https://x/').length === 0);

    // ---- a built exam leaves everything outside the five columns null
    const exam = S.buildExam(rows[0]);

    check('the five read values survive',
      exam.postDate === '2026-09-19' && exam.organizingBody === 'UPSC' &&
      exam.applicationDeadline === '2026-10-06' &&
      exam.eligibility.qualifications.includes('BTECH') &&
      /Engineering Services 2027/.test(exam.examName));

    check('age is null, not a default',
      exam.eligibility.minimumAge === null && exam.eligibility.maximumAge === null);
    check('age relaxation is null, not a blanket 3/5/5', exam.eligibility.categoryAgeRelaxation === null);
    check('gender restriction is null', exam.eligibility.genderRestriction === null);
    check('domicile requirement is null', exam.eligibility.domicileRequired === null);
    check('percentage bars are null',
      exam.eligibility.minimum10thPercentage === null &&
      exam.eligibility.minimum12thPercentage === null &&
      exam.eligibility.minimumPercentage === null);

    // Fields the previous revision fabricated are not even present now.
    for (const gone of ['applicationFee', 'payScale', 'vacancies', 'selectionStages', 'advtNo', 'officialPdfUrl']) {
      check(`${gone} is not published at all`, exam[gone] === undefined,
        `${gone} = ${JSON.stringify(exam[gone])}`);
    }

    check('the unread age limit is recorded as unknown',
      exam.dataQuality.unknownFields.includes('eligibility.maximumAge') &&
      exam.eligibility.unknownFields.includes('eligibility.maximumAge'),
      JSON.stringify(exam.dataQuality.unknownFields));
    check('read fields are recorded as confirmed',
      exam.dataQuality.confirmedFields.includes('applicationDeadline') &&
      exam.dataQuality.confirmedFields.includes('postDate') &&
      exam.dataQuality.confirmedFields.includes('organizingBody'));
    check('a field is never both confirmed and unknown',
      exam.dataQuality.confirmedFields.every(f => !exam.dataQuality.unknownFields.includes(f)));
    check('a listing row can never claim the gating fields are known',
      exam.dataQuality.gatingFieldsKnown === false,
      'the table has no age column, so this must always be false');
    check('confidence says this is listing data', exam.dataQuality.confidence === 'LISTING');
    check('the single source is recorded for citation',
      exam.dataQuality.sources.length === 1 && exam.dataQuality.sources[0].name === 'FreeJobAlert');
    check('the disclaimer names the five columns and says blanks are not guessed',
      /post date/i.test(exam.dataQuality.disclaimer) &&
      /last date/i.test(exam.dataQuality.disclaimer) &&
      /rather than guessed/i.test(exam.dataQuality.disclaimer),
      exam.dataQuality.disclaimer);

    // ---- a missing Qualification cell must not become GRADUATION
    const blank = S.buildExam({
      postDate: null, board: null, postName: 'Some Recruitment 2026',
      qualificationText: null, lastDate: null, detailUrl: null
    });
    check('a blank qualification cell yields no qualifications',
      blank.eligibility.qualifications.length === 0);
    check('a blank row records every field as unknown',
      blank.dataQuality.unknownFields.includes('postDate') &&
      blank.dataQuality.unknownFields.includes('applicationDeadline') &&
      blank.dataQuality.unknownFields.includes('organizingBody'));

    // ---- tolerant attribute reading, which this page requires
    check('attr reads an unquoted href',
      S.attr('\nhref=https://www.freejobalert.com/x ', 'href') === 'https://www.freejobalert.com/x');
    check('anchors survive newlines inside the tag',
      S.anchors('<a\nhref=/articles/x >Get Details</a>', 'https://www.freejobalert.com/').length === 1);
  }

  // ======================================================= H7: eligibility
  console.log('\n=== H7: unknown criteria never read as satisfied ===');
  {
    const { sandbox } = loadDb();
    const engine = sandbox.window.eligibilityEngine;

    sandbox.window.examProfileManager = {
      calculateAgeAtDate: (dob, cutoff) => {
        const d = new Date(dob), c = new Date(cutoff);
        let age = c.getFullYear() - d.getFullYear();
        const m = c.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && c.getDate() < d.getDate())) age--;
        return age;
      }
    };
    sandbox.window.QUALIFICATION_HIERARCHY = {
      GRADUATION: { label: 'Graduation', satisfies: ['GRADUATION', 'BACHELORS', '12TH_PASS', '10TH_PASS'] }
    };
    sandbox.window.STATE_OPTIONS = ['Punjab', 'Bihar', 'Uttar Pradesh'];

    const profile = {
      dateOfBirth: '1990-01-01',
      gender: 'MALE',
      category: 'GENERAL',
      domicile: 'Punjab',
      qualificationId: 'GRADUATION',
      tenthPercentage: 80,
      twelfthPercentage: 75,
      hasBEd: false
    };
    const young = { ...profile, dateOfBirth: '2002-01-01' };

    const base = {
      qualifications: ['GRADUATION'],
      allowedCategories: ['ALL'],
      additionalRequirements: []
    };

    // ---- the core fix: an unread age limit is not "no age limit"
    const noAge = engine.checkEligibility(profile, {
      ...base, minimumAge: null, maximumAge: null, unknownFields: ['eligibility.maximumAge']
    });
    check('unknown age limit => LIKELY_ELIGIBLE, not ELIGIBLE',
      noAge.status === 'LIKELY_ELIGIBLE', noAge.status);
    check('the age check reports UNKNOWN', noAge.checks.age === 'UNKNOWN', String(noAge.checks.age));
    check('it names what is unknown',
      noAge.unknownCriteria.some(u => /age limit/i.test(u)), JSON.stringify(noAge.unknownCriteria));
    check('it still asks for verification', noAge.needsVerification === true);
    check('it is still actionable', noAge.eligible === true);

    // ---- a confirmed failure is a real failure
    const confirmed = { ...base, minimumAge: 18, maximumAge: 32, ageCutoffDate: '2026-09-19' };
    const hard = engine.checkEligibility(profile, confirmed);
    check('confirmed over-age => NOT_ELIGIBLE', hard.status === 'NOT_ELIGIBLE', hard.status);
    check('the reason quotes the real limit', hard.reasons.some(r => /Maximum age is 32/.test(r)));

    const ok = engine.checkEligibility(young, confirmed);
    check('confirmed and within limits => ELIGIBLE', ok.status === 'ELIGIBLE', ok.status);
    check('ELIGIBLE needs no verification', ok.needsVerification === false);

    // ---- an unstated relaxation must not produce a false rejection
    const reserved = { ...profile, category: 'OBC', dateOfBirth: '1992-01-01' };
    const noRelax = engine.checkEligibility(reserved, confirmed);
    check('over-age with unstated relaxation => VERIFY, not NOT_ELIGIBLE',
      noRelax.status === 'NEEDS_VERIFICATION', noRelax.status);
    check('the warning explains relaxation may apply',
      noRelax.warnings.some(w => /relaxation/i.test(w)));

    const withRelax = engine.checkEligibility(reserved, {
      ...confirmed, categoryAgeRelaxation: { OBC: 3, SC: 5, ST: 5 }
    });
    check('a stated relaxation is applied', withRelax.status === 'ELIGIBLE', withRelax.status);

    // ---- missing profile data is named, not just counted
    const noDob = engine.checkEligibility({ ...profile, dateOfBirth: null }, confirmed);
    check('missing DOB => INCOMPLETE', noDob.status === 'INCOMPLETE', noDob.status);
    check('it names the exact field',
      noDob.missingProfileFields.some(f => f.field === 'dateOfBirth'),
      JSON.stringify(noDob.missingProfileFields));
    check('it explains why the field is needed',
      noDob.missingProfileFields.every(f => f.why && f.label));

    // ---- checks the profile fed data to but nothing read
    const femaleOnly = { ...confirmed, genderRestriction: 'FEMALE_ONLY' };
    check('a female-only post blocks a male candidate',
      engine.checkEligibility(young, femaleOnly).status === 'NOT_ELIGIBLE');
    check('a female-only post accepts a female candidate',
      engine.checkEligibility({ ...young, gender: 'FEMALE' }, femaleOnly).status === 'ELIGIBLE');
    check('an unrestricted post ignores gender',
      engine.checkEligibility(young, confirmed).checks.gender === true);

    const biharOnly = { ...confirmed, domicileRequired: 'Bihar' };
    const wrongState = engine.checkEligibility(young, biharOnly);
    check('a domicile mismatch is VERIFY, not a hard block',
      wrongState.status === 'NEEDS_VERIFICATION', wrongState.status);
    check('the domicile warning names both states',
      wrongState.warnings.some(w => /Bihar/.test(w) && /Punjab/.test(w)));
    check('a matching domicile passes',
      engine.checkEligibility(young, { ...confirmed, domicileRequired: 'Punjab' }).status === 'ELIGIBLE');

    const teaching = { ...confirmed, qualificationText: 'Graduation with B.Ed from a recognised university' };
    check('a B.Ed post blocks a candidate without it',
      engine.checkEligibility(young, teaching).status === 'NOT_ELIGIBLE');
    check('a B.Ed post accepts a candidate with it',
      engine.checkEligibility({ ...young, hasBEd: true }, teaching).status === 'ELIGIBLE');

    const physical = { ...confirmed, physicalStandards: 'Height 170cm, chest 80cm' };
    const phys = engine.checkEligibility(young, physical);
    check('physical standards always ask for verification',
      phys.status === 'NEEDS_VERIFICATION', phys.status);
    check('the standards are quoted to the user', phys.warnings.some(w => /170cm/.test(w)));

    // ---- unknown qualification is also not "no requirement"
    const noQual = engine.checkEligibility(young, { ...confirmed, qualifications: [] });
    check('unknown qualification => LIKELY_ELIGIBLE', noQual.status === 'LIKELY_ELIGIBLE', noQual.status);
    check('the qualification check reports UNKNOWN', noQual.checks.qualification === 'UNKNOWN');

    // ---- helper used by every filter, count and sort
    const isPositive = sandbox.window.isEligibilityPositive;
    check('isEligibilityPositive accepts ELIGIBLE', isPositive('ELIGIBLE') === true);
    check('isEligibilityPositive accepts LIKELY_ELIGIBLE', isPositive('LIKELY_ELIGIBLE') === true);
    check('isEligibilityPositive rejects NOT_ELIGIBLE', isPositive('NOT_ELIGIBLE') === false);
    check('isEligibilityPositive rejects NEEDS_VERIFICATION', isPositive('NEEDS_VERIFICATION') === false);
    check('isEligibilityPositive rejects INCOMPLETE', isPositive('INCOMPLETE') === false);

    // ---- the profile prompt is driven by what is actually blocking
    const summarise = sandbox.window.summariseMissingProfileFields;
    const ranked = summarise([
      { _eligibilityResult: engine.checkEligibility({ ...profile, dateOfBirth: null }, confirmed) },
      { _eligibilityResult: engine.checkEligibility({ ...profile, dateOfBirth: null }, confirmed) },
      { _eligibilityResult: engine.checkEligibility({ ...profile, qualificationId: null }, confirmed) }
    ]);
    check('missing fields are ranked by how many exams they block',
      ranked[0].field === 'dateOfBirth' && ranked[0].blockedCount === 2,
      JSON.stringify(ranked.map(r => [r.field, r.blockedCount])));
    check('every blocking field carries a label and a reason',
      ranked.every(r => r.label && r.why));
  }

  console.log('\n=== H7: UI accepts the new status ===');
  {
    const eaSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'exam-alerts.js'), 'utf8');
    const svcSrc = fs.readFileSync(path.join(ROOT, 'js', 'exam-service.js'), 'utf8');

    check('exam-alerts has _isPositive helper', /_isPositive\(result\)/.test(eaSrc));
    check('eligible count uses the helper', /const eligible = all\.filter\(e => window\.isEligibilityPositive/.test(svcSrc) || /isEligibilityPositive/.test(eaSrc));
    check('filter accepts LIKELY_ELIGIBLE', /isEligibilityPositive\?\.\(e\._eligibilityResult\?\.status\)/.test(svcSrc));
    check('sort ranks LIKELY_ELIGIBLE with ELIGIBLE', /'LIKELY_ELIGIBLE':\s*0/.test(svcSrc));
    check('badge has a LIKELY_ELIGIBLE case', /LIKELY_ELIGIBLE/.test(eaSrc));
    // A blank now renders as an explicit statement rather than a figure with a
    // small "approx." beside it, because the value no longer exists at all.
    check('an unread field renders as "Not published yet"', /Not published yet/.test(eaSrc));
    check('the unknown marker has its own class for styling',
      /spec-value-unknown/.test(eaSrc));
    check('spec values go through the null-aware renderer', /_specValue\(/.test(eaSrc));

    // The card and table mirror the five source columns, in the source's order.
    for (const col of ['Post Date', 'Board', 'Exam / Post Name', 'Qualification', 'Last Date']) {
      check(`the table has a "${col}" column`, eaSrc.includes(`<th>${col}</th>`));
    }
    check('the removed columns are gone from the table',
      !/<th>Vacancies<\/th>/.test(eaSrc) && !/<th>Pay Scale<\/th>/.test(eaSrc));

    check('data provenance is cited to the user', /_renderDataQualityNote/.test(eaSrc));
    check('the note names the source table', /government jobs table/.test(eaSrc));
    check('the note states the age limit is absent rather than guessed',
      /left blank rather than guessed/.test(eaSrc));
    check('the detail link opens safely',
      /rel="noopener noreferrer"/.test(eaSrc));

    // The modal used to default a missing age limit to "18 to 32 years".
    check('the modal no longer defaults an age range',
      !/e\.minimumAge \|\| '18'/.test(eaSrc) && !/e\.maximumAge \|\| '32'/.test(eaSrc));
    check('the modal states the age limit is not in the source',
      /Not in the source table/.test(eaSrc));

    // Every apply button read a field the listing reader does not set. Checked
    // against code with comments stripped, since the fix documents the old bug.
    const eaCode = eaSrc
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    check('apply links no longer read the unset officialApplyUrl',
      !/exam\.officialApplyUrl/.test(eaCode),
      'it rendered href="undefined" on every card');
    check('apply links fall back through a single helper', /_applyUrl\(exam\)/.test(eaSrc));
    check('the verdict line names the blocking profile field',
      /_eligibilitySummaryLine/.test(eaSrc) && /missingProfileFields/.test(eaSrc));
    check('a targeted profile prompt replaces the generic nag',
      /_renderProfileGapStrip/.test(eaSrc) && /blocks \$\{f\.blockedCount\}/.test(eaSrc));
  }

  // =========================================================== H5: attempts
  console.log('\n=== H5: retakes accumulate instead of overwriting ===');
  {
    const { sandbox, db } = loadDb();

    db.quizzes.rows = [
      { id: 1, title: 'Polity Quiz', subject: 'Polity', totalQuestions: 10, completedAt: '2026-09-03T10:00:00Z', correct: 8, incorrect: 2, skipped: 0, percentage: 80, durationSeconds: 300 },
      { id: 2, title: 'History Quiz', subject: 'History', totalQuestions: 10, completedAt: '2026-09-02T10:00:00Z', correct: 5, incorrect: 5, skipped: 0, percentage: 50, durationSeconds: 400 }
    ];
    // Quiz 1 attempted three times, improving each time. The quiz row only holds
    // the last one (80%), but all three are in the attempts log.
    db.attempts.rows = [
      { id: 1, quizId: 1, attemptedAt: '2026-09-01T10:00:00Z', correct: 4, incorrect: 6, skipped: 0, percentage: 40, durationSeconds: 500 },
      { id: 2, quizId: 1, attemptedAt: '2026-09-02T10:00:00Z', correct: 6, incorrect: 4, skipped: 0, percentage: 60, durationSeconds: 400 },
      { id: 3, quizId: 1, attemptedAt: '2026-09-03T10:00:00Z', correct: 8, incorrect: 2, skipped: 0, percentage: 80, durationSeconds: 300 },
      { id: 4, quizId: 2, attemptedAt: '2026-09-02T10:00:00Z', correct: 5, incorrect: 5, skipped: 0, percentage: 50, durationSeconds: 400 }
    ];

    const stats = await sandbox.getDashboardStats();
    check('counts every attempt, not every quiz', stats.totalQuizzesTaken === 4, `got ${stats.totalQuizzesTaken}`);
    check('questions completed sums all attempts', stats.questionsCompleted === 40, `got ${stats.questionsCompleted}`);
    check('correct answers sums all attempts', stats.correctAnswers === 23, `got ${stats.correctAnswers}`);
    check('average score across attempts', stats.averageScore === 58, `got ${stats.averageScore}`);
    check('best score preserved from any attempt', stats.bestScore === 80, `got ${stats.bestScore}`);

    const analytics = await sandbox.getAnalyticsData();
    check('trend has one point per attempt', analytics.trend.length === 4, `got ${analytics.trend.length}`);
    check('trend is chronological', analytics.trend[0].percentage === 40 && analytics.trend[3].percentage === 80,
      analytics.trend.map(t => t.percentage).join(','));
    check('repeat attempts labelled', analytics.trend.some(t => /attempt 2/.test(t.title)),
      analytics.trend.map(t => t.title).join(' | '));
    check('donut totals across attempts', analytics.donut.correct === 23 && analytics.donut.incorrect === 17,
      JSON.stringify(analytics.donut));
    const polity = analytics.subjects.find(s => s.subject === 'Polity');
    check('subject mastery aggregates attempts', polity && polity.questionsAttempted === 30,
      JSON.stringify(polity));

    const history = await sandbox.getAttemptHistory();
    check('history has one row per attempt', history.length === 4, `got ${history.length}`);
    check('history newest first', history[0].percentage === 80 || history[0].percentage === 50);
    check('attempt numbers assigned', history.some(h => h.attemptNumber === 1 && h.totalAttempts === 3));
    check('rows carry quiz metadata', history.every(h => !!h.title));
    check('rows expose quiz id for actions', history.every(h => h.id === h.quizId));

    const summary = await sandbox.getQuizAttemptSummary(1);
    check('summary counts 3 attempts', summary.totalAttempts === 3, `got ${summary.totalAttempts}`);
    check('summary latest is the newest', summary.latest.percentage === 80);
    check('summary best found', summary.best.percentage === 80);
    check('summary improvement computed', summary.improvementFromPrevious === 20,
      `got ${summary.improvementFromPrevious}`);
    check('summary flags personal best', summary.isPersonalBest === true);
  }

  console.log('\n=== H5: legacy data without an attempts log still counts ===');
  {
    const { sandbox, db } = loadDb();
    db.quizzes.rows = [
      { id: 1, title: 'Old Quiz', subject: 'Polity', totalQuestions: 10, completedAt: '2025-01-01T10:00:00Z', correct: 7, incorrect: 3, skipped: 0, percentage: 70, durationSeconds: 300 }
    ];
    db.attempts.rows = []; // pre-dates the attempts log

    const stats = await sandbox.getDashboardStats();
    check('legacy quiz still counted', stats.totalQuizzesTaken === 1, `got ${stats.totalQuizzesTaken}`);
    check('legacy score preserved', stats.bestScore === 70);

    const analytics = await sandbox.getAnalyticsData();
    check('legacy quiz appears in trend', analytics.trend.length === 1);

    const history = await sandbox.getAttemptHistory();
    check('legacy quiz appears in history', history.length === 1 && history[0].title === 'Old Quiz');
  }

  // ==================================================== M1: duplicate removed
  console.log('\n=== M1: duplicate function definition ===');
  {
    const defs = (DB_SRC.match(/async function getCompletedQuizHistory/g) || []).length;
    check('getCompletedQuizHistory defined exactly once', defs === 1, `found ${defs}`);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
