/**
 * HAMSA VIDYA (हंस विद्या) — Government Exam Listing Reader
 *
 * ONE SOURCE, FIVE FIELDS.
 *
 *   Source: https://www.freejobalert.com/government-jobs/
 *   Fields: Post Date · Board · Exam / Post Name · Qualification · Last Date
 *
 * That page publishes a real table with exactly those columns, so every value
 * here is read straight out of a table cell. Nothing is inferred, averaged or
 * defaulted.
 *
 * WHAT WAS REMOVED, AND WHY IT MATTERS
 * Earlier revisions read three listing sites and then ran a second AI stage that
 * opened each notification and its PDF to extract age limits, fees, pay scales,
 * vacancy counts and selection stages. That whole pipeline is gone by request:
 * this file now reads one page and reports one table.
 *
 * The consequence to be aware of: the five columns do not include an age limit,
 * and age is the primary gate in the eligibility engine. Eligibility can
 * therefore match on QUALIFICATION only, and the engine reports the age limit as
 * unknown rather than guessing it. That is the honest behaviour — the previous
 * code invented `minAge = 18, maxAge = 32` for every exam, which is exactly what
 * this design avoids.
 *
 * THE RULE THAT SURVIVES
 * A field is either read from the table or it is `null`. There is no third
 * option — no defaults, no typical values, no family averages. A blank reaches
 * the UI as "not stated" and the engine declines to rule on it.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

let _cachedExams = null;
let _lastFetchedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — the page updates a few times a day

const SOURCE = {
  name: 'FreeJobAlert',
  url: 'https://www.freejobalert.com/government-jobs/'
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_ROWS = 200;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// =========================================================================
// NETWORK
// =========================================================================

/**
 * GET a URL following redirects. Never rejects — a fetch failure must leave the
 * previous good result in place rather than emptying the exam list.
 * @returns {Promise<{status:number, body:string}>}
 */
function fetchUrl(url, timeoutMs = 15000, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve({ status: 0, body: '' });

    let parsed;
    try { parsed = new URL(url); } catch { return resolve({ status: 0, body: '' }); }
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).toString(); }
        catch { return resolve({ status: 0, body: '' }); }
        return fetchUrl(next, timeoutMs, depth + 1).then(resolve);
      }

      let size = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) { req.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });

    req.on('error', () => resolve({ status: -1, body: '' }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: -2, body: '' }); });
  });
}

// =========================================================================
// HTML HELPERS
// =========================================================================

/** Read an attribute whether it is double-, single- or un-quoted. */
function attr(tagSource, name) {
  const m = tagSource.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  );
  if (!m) return '';
  return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

/** Visible text of an HTML fragment, with the entities this page emits. */
function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;|&#38;/g, '&')
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, '-')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;|&#8216;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Anchors in a fragment, with an absolute URL and visible text. */
function anchors(html, baseUrl) {
  const out = [];
  // `[\s\S]*?` inside the open tag: this page breaks lines mid-tag.
  const re = /<a\b([\s\S]*?)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = attr(m[1], 'href');
    if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, baseUrl).toString(); } catch { continue; }
    out.push({ url: abs, text: stripTags(m[2]) });
  }
  return out;
}

/** Rows that are not a recruitment notification. */
const SKIP_TITLE = /\bresult|admit\s*card|answer\s*key|syllabus|cut[\s-]?off|merit\s*list|admission|score\s*card|counselling|hall\s*ticket/i;

// =========================================================================
// FIELD PARSERS — each returns null rather than a guess
// =========================================================================

/** `06-10-2026` / `29/09/2026` / `6 October 2026` → `YYYY-MM-DD`, else null. */
function parseDate(text) {
  if (!text) return null;
  const s = String(text);

  const iso = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dmy = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dmy) {
    const d = Number(dmy[1]), mo = Number(dmy[2]);
    // Reject an impossible date rather than clamping it into something plausible.
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${dmy[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const named = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (named) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.indexOf(named[2].slice(0, 3).toLowerCase());
    const d = Number(named[1]);
    if (mi === -1 || d < 1 || d > 31) return null;
    return `${named[3]}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Map the Qualification cell onto the engine's qualification IDs.
 *
 * Returns an empty array when the cell says nothing recognisable. It must never
 * default to GRADUATION — an earlier version did, which silently told graduates
 * they qualified for posts whose requirement had never been read.
 */
function parseQualifications(text) {
  if (!text) return [];
  const s = String(text).toLowerCase();
  const quals = new Set();
  const add = (...ids) => ids.forEach(id => quals.add(id));

  if (/ph\.?\s?d|doctorate|m\.?phil/.test(s)) add('POST_GRADUATION', 'MASTERS');
  if (/m\.?\s?tech|m\.?\s?e\b/.test(s)) add('POST_GRADUATION', 'MASTERS');
  if (/m\.?\s?sc/.test(s)) add('MSC', 'POST_GRADUATION', 'MASTERS');
  if (/mca\b/.test(s)) add('MCA', 'POST_GRADUATION', 'MASTERS');
  if (/mba\b|pgdm/.test(s)) add('MBA', 'POST_GRADUATION', 'MASTERS');
  if (/m\.?\s?com/.test(s)) add('MCOM', 'POST_GRADUATION', 'MASTERS');
  if (/m\.?\s?a\b/.test(s)) add('MA', 'POST_GRADUATION', 'MASTERS');
  if (/\bms\b|\bmd\b|dnb/.test(s)) add('POST_GRADUATION', 'MASTERS');
  if (/post\s*graduat|\bpg\b/.test(s)) add('POST_GRADUATION', 'MASTERS');

  if (/b\.?\s?tech|b\.?\s?e\b|engineering|b\.?\s?arch/.test(s)) add('BTECH', 'BE', 'GRADUATION', 'BACHELORS');
  if (/b\.?\s?sc/.test(s)) add('BSC', 'GRADUATION', 'BACHELORS');
  if (/b\.?\s?com/.test(s)) add('BCOM', 'GRADUATION', 'BACHELORS');
  if (/bca\b/.test(s)) add('BCA', 'GRADUATION', 'BACHELORS');
  if (/bba\b/.test(s)) add('BBA', 'GRADUATION', 'BACHELORS');
  if (/b\.?\s?a\b/.test(s)) add('BA', 'GRADUATION', 'BACHELORS');
  if (/llb|law\s*degree/.test(s)) add('GRADUATION', 'BACHELORS');
  if (/b\.?\s?ed\b/.test(s)) add('GRADUATION', 'BACHELORS');
  if (/\bany\s*graduate|graduat|degree|bachelor/.test(s)) add('GRADUATION', 'BACHELORS');

  if (/diploma|polytechnic/.test(s)) add('DIPLOMA');
  if (/\biti\b|trade\s*certificate/.test(s)) add('ITI');
  if (/12th|intermediate|senior\s*secondary|10\s*\+\s*2|higher\s*secondary/.test(s)) add('12TH_PASS');
  if (/10th|matric|high\s*school|sslc/.test(s)) add('10TH_PASS');

  return Array.from(quals);
}

/** Short education labels for the filter pills, derived from the same cell. */
function summariseEducation(qualifications) {
  const tags = [];
  if (qualifications.includes('10TH_PASS')) tags.push('10th Pass');
  if (qualifications.includes('12TH_PASS')) tags.push('12th Pass');
  if (qualifications.includes('ITI')) tags.push('ITI');
  if (qualifications.includes('DIPLOMA')) tags.push('Diploma');
  if (qualifications.includes('BTECH') || qualifications.includes('BE')) tags.push('B.Tech/B.E.');
  if (qualifications.includes('GRADUATION')) tags.push('Graduate');
  if (qualifications.includes('POST_GRADUATION')) tags.push('Post Graduate');
  return tags;
}

/**
 * Central vs State, and which state.
 *
 * Derived locally from the Board and Exam Name that were read — it is a filter
 * aid, not a sixth fetched field. A miss simply means the exam stays under
 * "All India", which is the safe default for a filter.
 */
const STATE_PATTERNS = [
  { state: 'Uttar Pradesh', regex: /uttar\s*pradesh|uppsc|upsssc|upessc|uppcl|upprb|\bup\s/i },
  { state: 'Bihar', regex: /bihar|bpsc|bssc|bpssc|csbc|btsc/i },
  { state: 'Rajasthan', regex: /rajasthan|rpsc|rsmssb|rssb|ruhs|rvunl/i },
  { state: 'Madhya Pradesh', regex: /madhya\s*pradesh|mppsc|mpesb|vyapam|mptrb/i },
  { state: 'Delhi', regex: /\bdelhi\b|dsssb/i },
  { state: 'Maharashtra', regex: /maharashtra|mpsc|maha\s*(?:transco|metro)|zila\s*parishad/i },
  { state: 'Haryana', regex: /haryana|hssc|hpsc/i },
  { state: 'Punjab', regex: /punjab|ppsc|psssb|pspcl/i },
  { state: 'Gujarat', regex: /gujarat|gpsc|gsssb|ojas/i },
  { state: 'Karnataka', regex: /karnataka|kpsc|kea|kptcl|kslu/i },
  { state: 'Tamil Nadu', regex: /tamil\s*nadu|tnpsc|tnusrb|tneb/i },
  { state: 'Kerala', regex: /kerala|kseb/i },
  { state: 'Andhra Pradesh', regex: /andhra\s*pradesh|appsc/i },
  { state: 'Telangana', regex: /telangana|tspsc|tslprb/i },
  { state: 'West Bengal', regex: /west\s*bengal|wbpsc|wbprb|wbcsc/i },
  { state: 'Odisha', regex: /odisha|opsc|osssc|ossc/i },
  { state: 'Jharkhand', regex: /jharkhand|jpsc|jssc/i },
  { state: 'Chhattisgarh', regex: /chhattisgarh|cgpsc|cg\s*vyapam/i },
  { state: 'Uttarakhand', regex: /uttarakhand|ukpsc|uksssc/i },
  { state: 'Himachal Pradesh', regex: /himachal|hppsc|hpssc/i },
  { state: 'Assam', regex: /assam|apsc/i },
  { state: 'Jammu and Kashmir', regex: /jammu|kashmir|jkssb|jkpsc/i }
];

function classifyGovt(examName, board) {
  const text = `${board || ''} ${examName || ''}`;
  for (const item of STATE_PATTERNS) {
    if (item.regex.test(text)) return { govtType: 'STATE', state: item.state };
  }
  return { govtType: 'CENTRAL', state: 'All India' };
}

/**
 * Stable ID derived from the exam's identity, not its row position.
 *
 * An earlier version used an incrementing counter over listing order. The order
 * changes between syncs and `db.savedExams` stores `examId`, so a bookmark
 * silently began pointing at a different exam after every refresh.
 */
function stableId(examName, board) {
  const key = `${(examName || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${(board || '').toLowerCase()}`;
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
  // Dexie's `exams` store uses a non-auto primary key, so this must be a number.
  return parseInt(hash, 16) % Number.MAX_SAFE_INTEGER;
}

// =========================================================================
// THE TABLE
//
// Columns are located by their header text, not by index, so a column inserted
// upstream shifts nothing. The page also renders a short "featured links" table
// with three cells and no headers — requiring both a post-name and a last-date
// header is what distinguishes the real listing from it.
// =========================================================================

function extractRows(html, baseUrl) {
  const rows = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];

  for (const table of tables) {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (trs.length < 2) continue;

    const headers = (trs[0].match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [])
      .map(c => stripTags(c).toLowerCase());
    const col = (...needles) => headers.findIndex(h => needles.some(n => h.includes(n)));

    const iPostDate = col('post date');
    const iBoard = col('recruitment board', 'board');
    const iName = col('exam / post', 'post name', 'exam');
    const iQual = col('qualification');
    const iLast = col('last date');

    if (iName === -1 || iLast === -1) continue; // not the listing table

    for (const tr of trs.slice(1)) {
      const cells = tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
      if (cells.length < 3) continue;

      const name = stripTags(cells[iName] || '');
      if (!name || name.length < 8 || SKIP_TITLE.test(name)) continue;

      const board = iBoard === -1 ? '' : stripTags(cells[iBoard] || '');
      const qual = iQual === -1 ? '' : stripTags(cells[iQual] || '');

      // The last cell is "More Information", which carries the detail link.
      const link = anchors(cells[cells.length - 1] || '', baseUrl)[0]
        || anchors(cells[iName] || '', baseUrl)[0];

      rows.push({
        postDate: iPostDate === -1 ? null : parseDate(stripTags(cells[iPostDate] || '')),
        board: board && board !== '-' ? board : null,
        postName: name,
        qualificationText: qual && qual !== '-' ? qual : null,
        lastDate: parseDate(stripTags(cells[iLast] || '')),
        detailUrl: link ? link.url : null
      });

      if (rows.length >= MAX_ROWS) return rows;
    }
  }
  return rows;
}

// =========================================================================
// EXAM RECORD
// =========================================================================

/** The five fields this reader publishes, plus what they gate. */
const PUBLISHED_FIELDS = ['postDate', 'organizingBody', 'examName', 'eligibility.qualifications', 'applicationDeadline'];

function buildExam(row) {
  const board = row.board;
  const { govtType, state } = classifyGovt(row.postName, board);
  const qualifications = parseQualifications(row.qualificationText);

  const confirmed = [];
  const unknown = [];
  const note = (field, value) => {
    const known = Array.isArray(value) ? value.length > 0 : (value !== null && value !== undefined && value !== '');
    (known ? confirmed : unknown).push(field);
  };

  note('postDate', row.postDate);
  note('organizingBody', board);
  note('applicationDeadline', row.lastDate);
  note('eligibility.qualifications', qualifications);

  // The table has no age column, and age is the engine's primary gate. Recorded
  // as unknown so the engine reports it rather than assuming a limit.
  unknown.push('eligibility.minimumAge', 'eligibility.maximumAge');

  // A board prefix makes the name self-describing; the table splits them.
  const examName = board && !row.postName.toLowerCase().startsWith(board.toLowerCase())
    ? `${board} ${row.postName}`
    : row.postName;

  return {
    id: stableId(row.postName, board),

    // ---- the five published fields
    postDate: row.postDate,
    organizingBody: board,
    examName,
    postName: row.postName,
    applicationDeadline: row.lastDate,

    // ---- derived locally for filtering and display
    shortName: board,
    govtType,
    state,
    educationTags: summariseEducation(qualifications),
    officialNotificationUrl: row.detailUrl,
    detailPageUrl: row.detailUrl,

    eligibility: {
      // Read from the Qualification column.
      qualifications,
      qualificationText: row.qualificationText,

      // Not published in these five columns. Null, never a default — the engine
      // treats null as unknown and says so.
      minimumAge: null,
      maximumAge: null,
      ageCutoffDate: null,
      categoryAgeRelaxation: null,
      minimum10thPercentage: null,
      minimum12thPercentage: null,
      minimumPercentage: null,
      categoryPercentageRelaxation: null,
      allowedCategories: ['ALL'],
      genderRestriction: null,
      domicileRequired: null,
      experienceRequired: null,
      physicalStandards: null,
      maximumAttempts: null,
      additionalRequirements: [],
      unknownFields: unknown.filter(f => f.startsWith('eligibility.'))
    },

    dataQuality: {
      confirmedFields: confirmed,
      unknownFields: unknown,
      // The age limit is never in this table, so a listing row can never be
      // "fully known" — the UI says so rather than implying completeness.
      gatingFieldsKnown: false,
      confidence: 'LISTING',
      sources: [{ name: SOURCE.name, url: SOURCE.url }],
      disclaimer:
        'Read directly from the FreeJobAlert government jobs table: post date, ' +
        'board, post name, qualification and last date. Anything not in those ' +
        'columns — including the age limit — is left blank rather than guessed. ' +
        'Open the official notification before applying.'
    },

    source: `LISTING: ${SOURCE.name}`,
    lastVerifiedAt: new Date().toISOString().split('T')[0]
  };
}

// =========================================================================
// AGGREGATION
// =========================================================================

async function fetchAndParseLiveExams() {
  const res = await fetchUrl(SOURCE.url);
  if (res.status !== 200 || !res.body) {
    console.warn(`[exams] ${SOURCE.name} unavailable (status ${res.status})`);
    return [];
  }

  let rows = [];
  try {
    rows = extractRows(res.body, SOURCE.url);
  } catch (err) {
    console.warn(`[exams] table parse failed: ${err.message}`);
    return [];
  }

  // The same post can appear twice on the page (featured plus in-table).
  const byKey = new Map();
  for (const row of rows) {
    if (!row.postName) continue;
    const key = row.postName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || byKey.has(key)) continue;
    byKey.set(key, buildExam(row));
  }

  const exams = [...byKey.values()];

  // Closing soonest first. Undated rows go last rather than being dropped — an
  // unstated last date is a fact about the table, not a reason to hide a job.
  exams.sort((a, b) => {
    if (!a.applicationDeadline && !b.applicationDeadline) return 0;
    if (!a.applicationDeadline) return 1;
    if (!b.applicationDeadline) return -1;
    return a.applicationDeadline.localeCompare(b.applicationDeadline);
  });

  console.log(`[exams] ${SOURCE.name}: ${exams.length} exams`);
  return exams;
}

/**
 * Exams with in-memory caching.
 * @param {{ forceRefresh?: boolean }} options
 * @returns {Promise<Array>}
 */
async function getLiveExams(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && _cachedExams && (now - _lastFetchedAt) < CACHE_TTL_MS) {
    return _cachedExams;
  }

  try {
    const exams = await fetchAndParseLiveExams();
    if (exams.length > 0) {
      _cachedExams = exams;
      _lastFetchedAt = now;
      return exams;
    }
  } catch (err) {
    console.error('[exams] read failed:', err.message);
  }

  // Serve the previous good result rather than an empty list.
  return _cachedExams || [];
}

module.exports = {
  getLiveExams,
  SOURCE,
  // Exported for scratch/verify-exam-listing.js — these are pure functions, so
  // the suite tests them directly instead of hitting the network.
  _internal: {
    attr,
    stripTags,
    anchors,
    parseDate,
    parseQualifications,
    summariseEducation,
    classifyGovt,
    stableId,
    extractRows,
    buildExam,
    PUBLISHED_FIELDS,
    SOURCE
  }
};
