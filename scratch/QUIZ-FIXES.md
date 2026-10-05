# Quiz fixes and improvements

## 2026-10-03: quota pause recovery

- Fixed temporary HTTP 429 errors being treated as permanent because Google's generic error mentions "plan and billing details". Parse structured quota violations to distinguish minute limits, daily limits, zero quota and spending limits.
- Respect RetryInfo in the response body, Retry-After seconds/date headers, and retry delays in the message. Use the longest advertised delay, bounded attempts and cancellation-aware waits. Never hop models to evade quota.
- Share cooldown across parallel source workers and stagger subsequent requests according to an advertised RPM limit. Unrestricted successful generation retains the existing fast path.
- Save writer output separately as pending candidates before independent review. A failed review can be resumed without paying for a second writing call; unreviewed candidates are never exposed as ready questions.
- Display concise quota guidance instead of Google's full diagnostic dump. Toast content wraps and stays within the viewport. Proxy responses preserve upstream Retry-After headers.
- Advance service-worker cache to v25 and version affected boot scripts.
- Verification: 1,997 automated checks pass across 29 suites, including 12 quota regressions; isolated desktop/mobile Edge quiz checks: 220 passed. Quota tests use the real transport/error parser with mocked upstream responses, plus real local HTTP requests through the production proxy handler. No live Gemini calls or paid quota were used. Real quota availability and live generation latency remain controlled by the provider/project.

Updated: 2026-10-02. Implements the twelve findings and six improvements from the Quiz audit. Existing unrelated project edits are preserved. No live Gemini requests or paid services were used during verification.

## Audit tasks

| Task | Implemented behavior | Verification |
|---|---|---|
| 1. Printed answer-key mapping | Reject another question number, conflicting entries/sections or an unsupported printed identity. Accept an explicit inline answer only when the question and all options lead directly to that key. Hindi digits and equivalent bilingual option letters work. | Full import pipeline, wrong-number, compact-key, Hindi, repeated-section and inline-key cases. |
| 2. Mathematical deduplication | Preserve signs, operators, superscripts, generic types and chemical case; remove actual conflicting duplicates. | Addition/subtraction, x²/x2, CO/Co and conflicting duplicate cases. |
| 3. Source evidence | Normalize whitespace and Unicode without stripping technical syntax or meaningful case from quotations. | List<int>/List<float>, CO/Co and matching page/note evidence. |
| 4. Technical rendering | Shared safe Markdown/MathML formatting preserves types, code and equations in player/results. Flashcards retain their interaction/style compatibility. | Real KaTeX/Markdown, XSS, native browser rendering and Flashcard regressions. |
| 5. Flagged questions | Block flagged stored quizzes and new playable saves. Exclude flagged/invalid bookmark and missed questions with feedback. | Save/start guards and drill eligibility. |
| 6. Corrected missed drills | Resolve current questions through their original IDs, including changed stems. Preserve completed snapshots. Reject unrelated or deleted records. | Corrected keys, edited stems, snapshots and missing/flagged/unrelated questions. |
| 7. Late preview saves | Save a frozen question set. Clear only the owned, unchanged draft; navigate only from its active originating view. Disable repeat saves while pending. | Newer drafts, edits during save and normal save completion. |
| 8. Resume | Preserve per-quiz progress with legacy compatibility. Recognize time, flags and pending submission. Completion/deletion/reset clear the appropriate records. | Independent progress, timer-only/flags-only, expiry, stale submissions and quiz deletion. |
| 9. Missed-drill concurrency and errors | Disable pending actions, prevent duplicate quizzes and show recoverable storage errors. | Concurrent clicks, failure/retry and real IndexedDB. |
| 10. Model fallback | Continue for model-specific JSON compatibility errors. Stop for invalid credentials or exhausted quotas. | Mocked model compatibility, credential, quota and cancellation cases. |
| 11. Doubt keyboard focus | Restore focus through replies, bind controls after result renders, support Escape/Tab and reject stale responses. | Lifecycle cases and native keyboard controls on desktop/mobile. |
| 12. History errors | Distinguish an unavailable database from empty history and expose Retry. | Error/recovery cases and a native Retry click. |

## Student improvements

| Improvement | Implemented behavior |
|---|---|
| Import versus generation | PDF setup explains that import preserves original language and imports all valid keyed questions. AI generation follows selected count/language/difficulty; an empty import falls back to generation. Count mismatch and skipped-page notes remain visible. |
| Source inspection | Preview, practice feedback and results open saved PDF question/key pages. New saves retain the local original PDF and extracted text. Older quizzes show available context and allow attaching the original PDF locally. Object URLs are released on close. Drill source references survive backup merge. |
| Compact learning | Worked reasoning is expandable, option reasoning starts collapsed and memory cues remain compact. Code and mathematical content remain readable. |
| Coverage | Preview/results show real topic counts and declared difficulty distribution, including unknown imported difficulty. Generation prompts prioritize underrepresented topics. This is question distribution, not a guarantee of complete syllabus coverage. |
| Doubt provenance | Study Notes retain the model, fallback notice, source/key page, evidence and answer origin in content/section metadata. Concurrent saves produce one note. |
| Regression coverage | Quiz scenarios expanded from 62 to 126; native Quiz checks expanded from 97 to 212. |

## PDF upload follow-up

Reported error: `Failed to parse PDF: PDF reader is unavailable. Reload the page.`

The extractor rejected uploads immediately when the PDF.js global was absent, before reading the file. The shipped vendor loads normally with the local assets; the exact reason it failed in the reported browser is not established. There was no upload-time recovery, and neither the PDF reader nor its worker was guaranteed to be cached for a first offline upload.

- Added a shared local dependency resolver with absolute worker paths, deduplicated loading, cleanup, timeout and retry. Both supported PDF.js browser exports resolve correctly. Quiz extraction waits for the dependency instead of immediately asking for a reload. Other existing PDF consumers use the same recovery path.
- Precache the reader, worker and recovery module in service-worker v22. A real offline browser test deletes the reader globals, disables networking, uploads a PDF and reads its page text using the cached assets.
- Upload ownership prevents an older upload from replacing a newer PDF. Clear/change cancels pending ingestion and resets the page range; leaving the view prevents late upload notifications from repainting another tab.
- Clear the file input after processing so selecting the same file can retry. Show useful feedback for damaged/password-protected PDFs. Preserve and restore busy feedback after overlapping failures and view rerenders.
- Prevent fresh quiz generation while a PDF upload is pending, avoiding generation from the previous document. Saved generation drafts can still resume.
- Extended browser coverage to the real `index.html` and the actual native file input, local PDF.js worker, page selection, damaged-file retry, missing-reader recovery and drag-and-drop. Earlier browser checks used a fixture that did not exercise PDF ingestion.

## Repeated upload error: cache and serving follow-up

The initial recovery still requested the same vendor URL, so a bad cache could replay the same response on every retry. Reproduced this failure in an isolated native browser: put HTML under the PDF reader/worker cache keys, remove the reader globals, then select a real PDF. The previous loader failed this new regression; the updated loader passes it and extracts the PDF's actual text.

- Fixed `server.js`: missing JavaScript, workers and styles now return `404` with `Cache-Control: no-store`. Previously missing public assets returned `index.html` as HTTP 200, which could be saved under their asset URLs. Extensionless/HTML page routes retain the SPA fallback.
- Updated PDF boot script URLs and worker with release query `20261002-pdf2`, and precached those exact URLs. This avoids reusing old boot scripts and worker files while keeping offline upload support.
- Recovery requests explicitly refresh the reader and worker through a retry parameter. The service worker bypasses stale caches and HTTP cache for these requests, falls back to a valid cache offline and removes the nonce before storing responses.
- Validate JavaScript/CSS response types at install and runtime. Evict malformed cached assets only from Hamsa caches; never replay a cached HTML page as a script. Full-storage/cache-write failures cannot hide a valid network download.
- The extractor can bootstrap the recovery helper if that script was omitted or failed, with deduplication, cleanup and retry. Replace incompatible cached PDF.js versions with the bundled version; keep project subdirectory/encoded-path handling correct.
- Browser tests now include production `server.js`, direct local `file://` mode, missing helper plus reader, corrupted asset caches and offline recovery. No live AI requests or personal browser profile were used.

The exact original error text is absent from the current Quiz upload code. The URL and exact current error from the user's running page were requested to distinguish an old page/deployment from the local corrected version; that browser-specific diagnosis remains unconfirmed without that information.

## Slow PDF generation follow-up

Reported behavior: even five requested questions stayed in processing without a ready result. Code inspection found an unnecessary default printed-question scan, a second full source pass when no keyed questions were found, sequential source requests, repeated model discovery after discovery failures, and retries without a total time budget. The shared client also cleared its timeout/cancellation immediately after response headers, leaving a stalled body without a deadline. The user's specific live API response and latency were not captured.

- Fresh quizzes now generate directly. Printed-question import remains an explicit checkbox and still checks every selected page and printed answer key.
- Read long sources using at most two concurrent requests, with exact source quotes and page validation. Writing waits until all selected readable source batches are complete. Failure/cancellation stops peer readers and preserves completed batches for Resume.
- Reuse up to two completed source analyses in memory only, keyed by exact source/page content, API credentials and transport. Changing language, difficulty or requested count still creates and independently reviews a fresh question set. Changed sources are re-read. Resume/cache facts are checked against their actual quoted pages before reuse.
- Reuse the last successful PDF text extraction for the same document, range and OCR setting. Return isolated copies, respect cancellation and clear on new uploads/removal. Skipped or failed OCR pages are retried on the next extraction.
- Model discovery runs once per generation/import run. Each generation call has a 75-second body-inclusive timeout, each AI step has a 150-second retry budget, and generation/import jobs have a source/count-scaled 3–15 minute budget. Timeouts do not repeat the same model twice; model compatibility fallback remains available. Numeric and date-based Retry-After are respected; long limits pause with saved work rather than retrying too early.
- Processing shows source batches read, question writing, independent answer review and reviewed question counts. Percentages never move backwards. A deadline presents a recoverable pause instead of indefinite processing.
- Preserve the independent blind solver, matching answer keys, full option reasoning, source grounding, exact requested count and refill of rejected questions. Import prompts no longer repeat the current primary source in their context field.
- Service worker advanced to v23 and precaches the exact `20261002-quiz-speed1` boot URLs. Existing PDF reader/worker recovery and offline assets remain available.

Mocked comparison for 20 source batches and five questions, with no printed questions to import: the previous default made 42 AI content calls (20 import + 20 facts + writer + reviewer). Fresh generation now makes 22 (20 facts + writer + reviewer), with at most two source readers concurrently. A second generation from unchanged source makes two content calls (writer + reviewer). Model discovery is separate from these counts. These are verified call counts, not measured live Gemini speed or guaranteed timings.

The native test also exposed an existing application-header overflow at 390px after guest boot (`header-actions` extended to approximately 529px). The generated Quiz panel and its contents fit the viewport; the common header is outside this generation-speed change.

## Validation

- `npm test`: 1,973 checks, 0 failures; all 28 suites pass, including 126 Quiz, 29 AI transport, 55 service-worker and 87 Flashcard scenarios.
- `node scratch/verify-quiz-browser.cjs`: 212 passed; 1440px desktop, 390px light/dark and 320px mobile. Real IndexedDB, native keyboard controls, source/key PDF views, native PDF uploads/retries, real application boot, corrupted-cache and offline reader/worker recovery, production-server and direct-file uploads, actual five-question generation with mocked AI, repeated PDF text reuse, and text on every exported PDF page.
- `powershell -ExecutionPolicy Bypass -File scratch/verify-server-hardening.ps1`: 31 passed, including missing asset 404s and versioned PDF dependencies.
- `powershell -ExecutionPolicy Bypass -File scratch/verify-sw-precache-served.ps1`: all 95 precache assets and six optional vendor bundles served correctly; 0 failures.
- `node scratch/verify-flashcards-browser.cjs`: 194 passed after sharing the formatter.
- Desktop/mobile screenshots inspected for technical choices, MathML and compact explanations.
- Service-worker cache advanced to v23; the shared formatter, source viewer, versioned PDF reader/recovery/worker and updated generation dependencies are precached.

AI calls in tests are mocked. Independent review and source checks reduce errors but do not guarantee every live generated answer is factually correct. Original PDFs absent from older saves cannot be reconstructed; the viewer offers saved context and local attachment.

## Quiz audit follow-up: draft recovery and accessibility

- Keep student corrections separate from the engine checkpoint and completed raw result. Editing a partial preview no longer marks generation complete; Resume fills missing questions and overlays the saved corrections. Stable original-stem keys keep successive stem edits associated with the same question. Invalid edits remain available for repair rather than disappearing on reopening.
- Autosave pre-generation notes, topic and quiz settings using a versioned, validated field whitelist. Native input/change, note/title handlers, view exit and pagehide persist the form. Restored explicit language and explanation preferences survive the first render. Credentials, controller references and source files are never included. Storage failures warn without discarding in-tab work.
- Dexie schema v11 adds a temporary `quizDraftFiles` store for the original PDF blob. Generation stores an opaque file ID in its JSON checkpoint; reload, preview source inspection and quiz saving resolve the blob locally. Completed quizzes retain their existing original-source export format. Successful save, discard and replacement remove the corresponding temporary blob; Quiz/all-data reset clears temporary files and form/generation drafts. Temporary draft files are not included in library JSON backups.
- Preserve an active quiz or selected result when the primary Quiz module is clicked again; do not reset the view or its URL.
- Retain keyboard option focus across player renders. Label options and their question group, announce selected/locked states, and provide visible keyboard focus. Label the PDF page switch, range sliders, page steppers and custom subject.
- Native Edge verification exposed a visibility transition on Palette buttons preventing immediate focus when the drawer opened. Exclude visibility from those transitions so focus enters the drawer immediately on desktop and mobile.
- Keep existing mock-exam pause/resume semantics. Creation, active player and resume confirmation explain that leaving the quiz/closing the page pauses the saved time, whereas background tabs continue counting down. Strict uninterrupted exam timing is not implemented by this change.
- Advance the service-worker cache to v24 so the updated local code is available offline after refresh.

Validation for this follow-up:

- `npm test`: 1,985 checks passed, 0 failed, all 28 suites green; includes 138 Quiz regression scenarios and 40 parsed application JavaScript files.
- `node scratch/verify-quiz-browser.cjs`: 220 checks passed, 0 failed. Includes native IndexedDB PDF-blob recovery across a real page reload, saving the original recovered PDF into the quiz, temporary-blob cleanup, notes/topic/language recovery, Enter selection focus, Quiz navigation, 1440px desktop, 390px light/dark and 320px layouts.
- Live Gemini responses remain mocked; no paid API requests or personal browser profile were used. PDFs lost before this fix cannot be reconstructed. Source recovery depends on browser storage remaining available; clearing site data also removes drafts.

## Single-model, low-quota generation audit — October 3, 2026

- Restrict generation and OCR to `gemini-3.6-flash`; do not discover or hop across models during Quiz generation.
- Replace mandatory AI analysis of every source chunk with local, bounded excerpts. A successful 10-question fresh Quiz uses one writer and one blind reviewer. A successful 50-question Quiz uses five writers and five reviewers. OCR, explicitly selected printed-question import, malformed-response retry and replacement rounds are additional calls, not included in those counts.
- Writer returns a brief rationale; the independent reviewer supplies final worked reasoning and option explanations. Source quotes and answer agreement remain validated locally. Rejected stems are retained, excluded from subsequent candidates and prompts, and two stalled rounds pause instead of exhausting quota in a long refill loop.
- Bound Hindi source/import prompts and neighboring import context. Large PDFs use rotating sampled excerpts rather than claiming every page was covered. Completed and partial previews explicitly disclose sampled coverage. Select a narrower page range when complete focused coverage is important.
- Prefer the saved personal key for direct requests; use configured server credentials when no personal key is saved. Connection tests and generation use consistent routing, and capability probing can recover after transient failure.
- Share a serialized scheduler across Quiz writer, reviewer and OCR requests. Persist per-credential cooldown and recent estimated input history; use browser locks where available to coordinate tabs. The initial 12.1-second spacing and 12,000 estimated input tokens/minute are conservative application safeguards, not verified Google project limits. Returned RPM/TPM and retry delays can make pacing stricter. Daily/zero/spend-limit errors block immediate replays; daily recovery follows the Pacific reset boundary.
- Keep written candidates when review fails so Resume does not rewrite them. Do not automatically resend timed-out requests. Successful OCR pages remain reusable in the current tab after a later page fails, and quota/authentication errors stop extraction rather than treating all later pages as unreadable.
- Propagate browser proxy disconnects to the upstream abort signal. This avoids leaving avoidable requests running; it does not guarantee refund of tokens already processed by Google.
- Request diagnostics include stage, model, transport, estimated input, response usage when available, duration and status. Diagnostics do not expose the API key or full source prompt. Usage is browser-local, not a complete view of project consumption across users/devices/other applications.

Final verification:

- Full automated suite: **2,009 checks passed, 0 failed, 30/30 suites green**.
- Isolated Edge Quiz checks: **229 passed, 0 failed**, including native PDF upload, Generate-button processing through production transport and real pacing, independent answer review, desktop/mobile previews, sampled-coverage disclosure, reload/draft recovery and saving.
- Efficiency suite: **12 passed**, including long-PDF two-call generation, 50-question ten-call generation, bounded Hindi import, rejected-question deduplication, OCR quota recovery, key routing and production-proxy upstream cancellation.
- Quota suite: **12 passed**, including returned cooldowns, terminal quota errors, limited retries and saved pending-review Resume.
- Production server hardening: **31 passed**; **95 precache assets and 6 lazy vendor bundles** served with no failures. Temporary test servers were stopped after verification.
- `git diff --check` found no whitespace errors.

Limits of verification: network/model responses are isolated fixtures, not real Gemini answers. The shell has no usable server API key and tests do not read a personal browser profile, so actual project access, remaining RPM/TPM/RPD, daily capacity and live answer quality were not verified. Project quota is shared beyond this browser; local pacing cannot guarantee availability or enforce aggregate consumption across devices or different keys in the same project. No guarantee of instantaneous generation, complete large-PDF coverage or elimination of every future provider error is implied.

## Processing ends without a quiz — further repair, October 3, 2026

The reported symptom was continued processing followed by no ready quiz. Seven new regressions failed against the starting code before changes: a partly malformed writer batch discarded usable questions, long Hindi review inputs exceeded the scheduler budget, a learned lower TPM budget was ignored when selecting writer excerpts, partial review responses repeated completed work, MIXED difficulty overwrote individual difficulties, one unsupported PDF glyph discarded the entire page, and cancellation could remain blocked inside a PDF text read. These are reproduced code failures; the user's exact live Gemini response was not available.

- Keep valid four-option MCQs from a partially invalid batch, while excluding malformed or unsupported questions. Independently review the good questions and request only the missing count.
- Budget writer excerpts against the active credential's learned input allowance. Bound repeated avoidance/topic metadata. Split blind reviews by estimated input size, and detailed explanations into groups of at most five. Normal small quizzes still use a writer and a reviewer; additional review groups avoid oversized requests.
- Checkpoint after each reviewed group. Keep unresolved review candidates, exclude duplicate/invalid reviewer indices, compare the independently solved key locally, and resume without rewriting or duplicating accepted questions.
- Immediately show reviewed questions when a later step fails. The preview labels the actual ready/requested count and offers a Finish control; existing student corrections remain attached to the recovered draft.
- Preserve actual EASY/MEDIUM/HARD labels within MIXED quizzes and restore the MIXED form preference.
- Retain usable PDF text containing an occasional unsupported glyph; substantially damaged text still requires OCR. Bound file/page/text/render waits and promptly observe cancellation, including underlying tasks that reject during synchronous cancellation. A timed-out page stops extraction rather than silently skipping every later page.
- Keep the connection-status deadline active while its response body is read. Previously a successful header cleared that timer before the body, allowing a stalled probe to hold generation open.
- Update the changed boot URLs and service-worker cache to v27. Existing PDF recovery, OCR choices, quota pacing, source checks, saved quiz data and the configured model remain supported.

Final verification: **2,021 automated checks passed, 0 failed (31 suites)** and **234 isolated Edge checks passed, 0 failed**. The browser tests include actual PDF.js uploads, ordinary two-call generation, malformed-question refill, automatic four-question preview after interruption, native Finish completion, saving, reload recovery and offline/direct-file PDF reading. A fixed-delay browser assertion was changed to wait for correction saving to complete; completed-attempt snapshots are still checked. `git diff --check` passed. Gemini responses are simulated; no live model latency or project quota claim is made.

## Direct quiz start and student processing — 3 October 2026

- Removed the editable “Review your quiz before starting” screen and its controller methods. Completed generation saves the original source and quiz, then opens the player immediately. Independent answer checking stays in the generation pipeline.
- Interrupted runs retain their reviewed checkpoint and offer Continue quiz or an explicit start of the ready questions. Completed drafts retry saving without generating again. A cancellation during a database write records the saved quiz ID so continuing cannot duplicate that quiz. Late saves preserve newer work and cannot navigate after the originating view is left. Valid corrections in older drafts remain supported.
- Replaced the fixed 12.1-second default gap with a rolling five-request/minute cap. Estimated input-token limits, cross-tab locks, saved request history, reported provider cooldowns, stricter learned intervals and terminal quota blocks remain enforced. Removed the additional refill-round delay. These are application safeguards, not verified Google project limits.
- Quiz processing translates reading, writing, checking, retrying and waiting into student messages. Batch/model/quota terminology is kept out of the processing box. Sampled-source and skipped-page notices appear in the player instead of the removed review screen.
- Refreshed script versions and service-worker cache v28. Script-order verification now recognizes versioned URLs.

Verification: **2,025 automated checks passed, 0 failed (31 suites)** and **234 isolated Edge checks passed, 0 failed**. Native PDF generation directly opens the quiz, and its second small request starts without the former fixed wait. Browser tests cover desktop/mobile layouts, partial responses, interrupted Continue, save-failure/reload recovery and retained source PDFs. Gemini responses are simulated; live model latency was not measured.
