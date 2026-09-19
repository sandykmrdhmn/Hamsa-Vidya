/**
 * Verify the exam tab reads ONE source and FIVE fields — and nothing else.
 *
 *   Source: https://www.freejobalert.com/government-jobs/
 *   Fields: Post Date · Board · Exam / Post Name · Qualification · Last Date
 *
 * WHY THIS SUITE EXISTS
 * This area has been rewritten three times and each revision added surface:
 * RSS feeds, then three listing sites, then a second AI stage that opened each
 * notification and its PDF to extract age limits and fees. All of that is now
 * removed. The cost of it creeping back is not cosmetic:
 *
 *   • Another source means exam rows whose fields come from somewhere the user
 *     did not ask for, with no way to tell from the UI.
 *   • An invented field means the eligibility engine judging a candidate against
 *     a number nobody read — which is how 51 of 51 exams once ended up with a
 *     fabricated `maxAge = 32`.
 *   • A revived server fetcher means the SSRF surface comes back with it.
 *
 * verify-data-honesty.js covers the parsers and the built record in depth. This
 * suite guards the boundary: what is contacted, what is published, and what must
 * stay deleted.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Source with comments stripped — the files document what was removed. */
function codeOf(file) {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const SCRAPER = read('live-exams-scraper.js');
const SCRAPER_CODE = codeOf('live-exams-scraper.js');
const SERVER_CODE = codeOf('server.js');
const APP_CODE = codeOf('js/app.js');
const SVC_CODE = codeOf('js/exam-service.js');
const DB = read('js/db.js');
const HTML = read('index.html');
const SW = read('sw.js');

// ===========================================================================
console.log('\n=== Exactly one source is contacted ===');
// ===========================================================================
{
  const scraper = require(path.join(ROOT, 'live-exams-scraper.js'));

  check('the source is the FreeJobAlert government jobs page',
    scraper.SOURCE.url === 'https://www.freejobalert.com/government-jobs/',
    scraper.SOURCE.url);

  // Any other hostname in the reader is a second source by definition.
  const hosts = new Set(
    (SCRAPER_CODE.match(/https?:\/\/[\w.-]+/g) || []).map(u => {
      try { return new URL(u).hostname; } catch { return u; }
    })
  );
  check('no other host appears in the reader',
    hosts.size === 1 && hosts.has('www.freejobalert.com'),
    [...hosts].join(', '));

  for (const gone of ['sarkariresult', 'sarkari-naukri', 'sarkariresults']) {
    check(`${gone} is no longer read`, !new RegExp(gone, 'i').test(SCRAPER_CODE));
  }
  check('the RSS feed endpoints are gone', !/\/feed\b/.test(SCRAPER_CODE));

  // The reader must not grow a generic fetch-anything capability.
  check('only the one source URL is fetched',
    (SCRAPER_CODE.match(/fetchUrl\(/g) || []).length <= 3 &&
    /fetchUrl\(SOURCE\.url\)/.test(SCRAPER_CODE),
    'a parameterised fetch over a list of sources is how this regressed before');
}

// ===========================================================================
console.log('\n=== Exactly five fields are published ===');
// ===========================================================================
{
  const { _internal: S } = require(path.join(ROOT, 'live-exams-scraper.js'));

  check('five published fields are declared', S.PUBLISHED_FIELDS.length === 5,
    JSON.stringify(S.PUBLISHED_FIELDS));

  const expected = ['postDate', 'organizingBody', 'examName', 'eligibility.qualifications', 'applicationDeadline'];
  check('they are the five columns of the source table',
    JSON.stringify(S.PUBLISHED_FIELDS.slice().sort()) === JSON.stringify(expected.slice().sort()),
    S.PUBLISHED_FIELDS.join(', '));

  // The extractor must look for exactly these headers.
  for (const header of ['post date', 'board', 'qualification', 'last date']) {
    check(`the extractor locates the "${header}" column by header text`,
      new RegExp(`col\\((?:[^)]*['"])?${header}`, 'i').test(SCRAPER_CODE) ||
      SCRAPER_CODE.includes(`'${header}'`),
      'index-based column access breaks when the source inserts a column');
  }

  // Fields earlier revisions fabricated must not be produced at all.
  const built = S.buildExam({
    postDate: '2026-09-19', board: 'UPSC', postName: 'Engineering Services 2027',
    qualificationText: 'B.Tech/B.E', lastDate: '2026-10-06', detailUrl: 'https://www.freejobalert.com/x'
  });
  for (const gone of ['applicationFee', 'payScale', 'vacancies', 'selectionStages', 'advtNo', 'officialPdfUrl', 'applicationStartDate']) {
    check(`${gone} is not produced`, built[gone] === undefined, JSON.stringify(built[gone]));
  }

  // And the eligibility fields outside the five columns stay null, never a default.
  const e = built.eligibility;
  check('every eligibility field outside the Qualification column is null',
    e.minimumAge === null && e.maximumAge === null && e.ageCutoffDate === null &&
    e.categoryAgeRelaxation === null && e.genderRestriction === null &&
    e.domicileRequired === null && e.minimumPercentage === null,
    JSON.stringify(e));
  check('the Qualification column is the one eligibility field that is read',
    e.qualifications.includes('BTECH') && e.qualificationText === 'B.Tech/B.E');
}

// ===========================================================================
console.log('\n=== The AI notification stage stays removed ===');
// ===========================================================================
{
  check('the server-side detail/PDF fetcher is deleted', !exists('exam-detail-fetcher.js'));
  check('the client enrichment service is deleted', !exists('js/exam-detail-service.js'));

  check('GET /api/exam-detail is gone', !/api\/exam-detail/.test(SERVER_CODE));
  check('GET /api/exam-pdf is gone', !/api\/exam-pdf/.test(SERVER_CODE));
  check('the fetcher is no longer required', !/require\(['"]\.\/exam-detail-fetcher/.test(SERVER_CODE));

  check('app init no longer schedules enrichment',
    !/_scheduleExamEnrichment|_runExamEnrichment/.test(APP_CODE));
  check('exam-service no longer merges enrichment',
    !/mergeEnrichment|getExamEnrichmentMap/.test(SVC_CODE));
  check('the enrichment script tag is gone', !/exam-detail-service\.js/.test(HTML));
  check('it is no longer precached', !/exam-detail-service\.js/.test(SW));

  // The Dexie store is dropped rather than abandoned: users who already ran v8
  // have the table on disk, and replaying the chain is what removes it.
  check('the examDetails store is dropped in a later version',
    /db\.version\(9\)\.stores\(\{\s*examDetails: null\s*\}\)/.test(DB),
    'skipping the version would leave an orphaned table for existing users');
  check('the v8 declaration is kept so the upgrade chain still replays',
    /db\.version\(8\)\.stores\(\{[\s\S]{0,80}examDetails:/.test(DB));
  check('the enrichment db helpers are gone',
    !/saveExamEnrichment|getExamsNeedingEnrichment|EXAM_ENRICHMENT_TTL_MS/.test(codeOf('js/db.js')));
}

// ===========================================================================
console.log('\n=== Honest gaps reach the UI ===');
// ===========================================================================
{
  const EA = read('js/views/exam-alerts.js');
  const { _internal: S } = require(path.join(ROOT, 'live-exams-scraper.js'));

  const built = S.buildExam({
    postDate: '2026-09-19', board: 'UPSC', postName: 'Engineering Services 2027',
    qualificationText: 'B.Tech/B.E', lastDate: '2026-10-06', detailUrl: 'https://www.freejobalert.com/x'
  });

  check('a listing row never claims the gating fields are known',
    built.dataQuality.gatingFieldsKnown === false,
    'the table has no age column, so this can never be true');
  check('confidence is labelled as listing data',
    built.dataQuality.confidence === 'LISTING', built.dataQuality.confidence);
  check('the single source is recorded for citation',
    built.dataQuality.sources.length === 1 &&
    built.dataQuality.sources[0].url === 'https://www.freejobalert.com/government-jobs/');

  check('an unread field renders as a stated absence', /Not published yet|Not stated/.test(EA));
  check('the card shows the four remaining source columns',
    /Post Date<\/span>/.test(EA) && /Board<\/span>/.test(EA) &&
    /Qualification<\/span>/.test(EA) && /Last Date<\/span>/.test(EA));
  check('the modal says the age limit is not in the source',
    /Not in the source table/.test(EA));
  check('the hero names the source and its columns',
    /FreeJobAlert government jobs table/.test(EA));

  // Labels are the easiest place for a removed source to survive: the UI kept
  // saying "FreeJobAlert & SarkariResult" long after SarkariResult was dropped.
  for (const [file, label] of [
    ['js/views/exam-alerts.js', 'exam tab'],
    ['index.html', 'markup'],
    ['server.js', 'server'],
    ['js/exam-service.js', 'exam service']
  ]) {
    const src = read(file);
    check(`the ${label} no longer names a removed source`,
      !/sarkariresult|sarkari-naukri|sarkari naukri/i.test(src),
      (src.match(/.*sarkari.*/gi) || []).slice(0, 2).join(' | '));
  }
  check('the server reports the source from the reader, not a literal',
    /source: liveExamsScraper\.SOURCE\.url/.test(read('server.js')),
    'a restated label is how the UI drifted out of sync before');
}

// ===========================================================================
console.log('\n=== Eligibility degrades honestly without an age limit ===');
// ===========================================================================
{
  // With no age column, the engine can only match on qualification. It must say
  // so rather than certifying a candidate as eligible.
  const vm = require('vm');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {}, Math, Date, JSON, Number, String, Array, Object
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(read('js/eligibility-engine.js'), { filename: 'eligibility-engine.js' }).runInContext(sandbox);

  sandbox.window.examProfileManager = {
    calculateAgeAtDate: () => 30
  };
  sandbox.window.QUALIFICATION_HIERARCHY = {
    BTECH: { label: 'B.Tech', satisfies: ['BTECH', 'BE', 'GRADUATION', 'BACHELORS', '12TH_PASS', '10TH_PASS'] }
  };

  const { _internal: S } = require(path.join(ROOT, 'live-exams-scraper.js'));
  const exam = S.buildExam({
    postDate: '2026-09-19', board: 'UPSC', postName: 'Engineering Services 2027',
    qualificationText: 'B.Tech/B.E', lastDate: '2026-10-06', detailUrl: 'https://x/'
  });

  const profile = {
    dateOfBirth: '1996-01-01', gender: 'MALE', category: 'GENERAL',
    qualificationId: 'BTECH', tenthPercentage: 80, twelfthPercentage: 75, hasBEd: false
  };

  const result = sandbox.window.eligibilityEngine.checkEligibility(profile, exam.eligibility);

  check('a matching qualification is not certified as fully ELIGIBLE',
    result.status === 'LIKELY_ELIGIBLE', result.status);
  check('the qualification check passes on real data',
    result.checks.qualification === true, String(result.checks.qualification));
  check('the age check reports UNKNOWN rather than satisfied',
    result.checks.age === 'UNKNOWN', String(result.checks.age));
  check('the missing age limit is named to the user',
    (result.unknownCriteria || []).some(u => /age limit/i.test(u)),
    JSON.stringify(result.unknownCriteria));
  check('it still counts as actionable', result.eligible === true);
  check('it asks the user to verify', result.needsVerification === true);

  // A candidate whose qualification does not match must still be a hard no —
  // removing the age column must not make every verdict soft.
  const wrongQual = sandbox.window.eligibilityEngine.checkEligibility(
    { ...profile, qualificationId: 'TENTH' }, exam.eligibility
  );
  check('a qualification mismatch is still NOT_ELIGIBLE',
    wrongQual.status === 'NOT_ELIGIBLE', wrongQual.status);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
