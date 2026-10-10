# HAMSA VIDYA (हंस विद्या) — AI Study Companion

Hamsa Vidya is a browser-based study workspace for notes, concept explanations, flashcards, answer writing and exam preparation. Google Gemini powers its cloud AI features; saved study material and preferences are stored locally on the device.

## Study workspace

- **Dashboard:** Study activity, streaks and progress across notes, flashcard reviews, written answers and AI Teacher lessons.
- **QUIZ:** Create 1–200 questions from selected PDF pages, a topic, pasted text or a manual editor. AI generation uses batches of 20, with one question batch for 1–20 questions and a final remainder for larger quizzes. Oversized scans can require additional OCR requests to prepare source text. Choose Easy/Medium/Hard/Mixed difficulty and English, Hindi or combined Hindi–English questions and explanations. Subject, chapter and exam fields guide generation. Practice offers an explicit answer check; Exam mode hides solutions until submission and supports a timer, automatic submission, optional negative marking, review flags, confidence ratings, editable presets and question/option shuffle. Resume quiz-specific drafts, review previous attempts, compare results, retry only wrong/skipped questions, convert reviewed questions into flashcards, and print question papers or reviews to PDF. Local checks validate structure, count and duplicates; they do not independently prove factual accuracy.
- **Study Notes:** Import selected PDF pages, images or text, or start from a topic. OCR can read scans with configured Gemini access. The reader supports teaching blocks, glossary terms, source references, highlights, chat, reading position, editing and revision summaries. Failed source batches can retain completed work for retry.
- **AI Teacher:** Request concept explanations and follow-up help, with diagrams and saved lesson history.
- **Flashcards:** Review note-derived cards or custom decks. Reveal before rating, use scheduled Again/Hard/Good/Easy reviews, resume sessions and undo the last rating. Card management includes CSV import, cloze prompts, typed recall and printable deck sheets.
- **Answer Writing:** Draft answers, request AI feedback and keep saved writing practice.
- **Library:** Find saved study notes and open their original source material.
- **Exam Alerts:** Browse the configured exam listing and save entries. Profile-based eligibility guidance depends on the fields actually available in the listing.
- **Tools:** Browser utilities for images, PDFs, word counts, formatted notes, study timers and exam calculations.
- **Settings:** Gemini connection, student defaults, appearance, fonts, audio, local storage controls and portable backups.

The fresh QUIZ tab uses its own generation service and the `pdfQuizzes` / `pdfQuizAttempts` stores. The retired multi-view Quiz implementation stays removed. Its older IndexedDB records remain archival backup data and are separate from the new tab.

Quiz generation accepts PDFs up to 50 MB and 1,000 pages. Question counts determine the output batches: 40 questions always use two batches of 20, and 1–20 use one. Selected PDF pages are spread across those batches. Full text is used when it fits; dense text uses locally selected, page-labelled excerpts from every page in its batch, without an extra AI request. Excerpts preserve source wording but omit some details, and the saved quiz identifies pages that used excerpts. Complete payloads, including prompts and prior questions, stay within token and request-size estimates. Scanned images keep their prepared resolution. If combined scans cannot fit, the unfinished batch reads pages individually with Gemini OCR until its source fits, retaining the other images and every original page label. Those source-reading requests are additional to the question batches and follow the same request pacing. Each OCR request must produce readable, complete text; an unreadable or incomplete page pauses the batch instead of being skipped. OCR text is checkpointed after each page, so Resume reuses it and keeps all completed questions. The pending OCR cache is bounded; long transcriptions can use explicitly marked verbatim excerpts. Saved quizzes and printed exports identify OCR and excerpt page counts. Topics support up to 2,000 characters; pasted study text supports 20,000. Topic questions use model knowledge; PDF/text questions are grounded in the provided material. Failed planning drafts can Resume with the corrected planner; older completed batch plans retain their counts and progress.

Successful batches and exam controls are checkpointed in browser storage before the next request. Quiz response schemas keep their structure simple; exact question/option counts, answer indices and PDF page ranges are checked locally. A schema-related HTTP 400 allows one visible correction of the unfinished batch in JSON mode, with that mode checkpointed for Resume. It does not repeat completed questions. Quota, authentication, malformed output or storage errors pause the workflow rather than start hidden retries. Gemini thinking settings are normalized to the selected model's supported range by both browser and proxy. Reload restores completed questions, study text and checkpointed scan text; PDF resumes require selecting the same file, checked by size, page count and a sampled file fingerprint. Only unfinished question batches and unread scanned pages are sent again. Browser storage must be available; an unsaved checkpoint remains in the current tab until saving succeeds. Generation and manual-editor drafts are local recovery data, separate from portable backups; saved quizzes, attempts and question bookmarks are included in backups. Timed exams retain their deadline across reloads and navigation. Quiz presets are editable practice defaults, not official exam rules. Position-dependent options retain their original order when shuffling is enabled. A successful model connection does not reveal remaining project quota; application pacing and provider cooldowns bound requests, but cannot guarantee capacity or eliminate provider overloads.

## Run locally

Use a current Node.js version that supports `--env-file-if-exists`.

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). On Windows, `start-server.bat` is also available.

There is no frontend build step. The server serves the app's HTML, CSS and JavaScript directly.

## Configure Google Gemini

All cloud AI features use the shared Gemini transport. `gemini-2.5-flash` is the default model. Settings can discover the text models listed for the active credentials and test a model before selecting it.

For a personal connection, open **Settings → AI Connection**, paste the key and choose **Test Connection**. A successful test activates the verified key and model. Generation still requires access to that model and sufficient project quota. The connection result reports credential, permission, model and provider errors.

For a server-held key, set `GEMINI_API_KEY` in a local `.env` file or in PowerShell:

```powershell
$env:GEMINI_API_KEY="your-key-here"
npm start
```

With a server key and no saved personal key, the browser uses `/api/gemini`; the server key is not sent to the browser. A saved personal key takes precedence and is stored in browser localStorage for direct requests. Requests authenticate using Google's `x-goog-api-key` header.

The shared-key routes accept loopback connections, localhost hosts and same-origin browser requests. The browser login gate does not provide backend authorization for a public shared-key deployment.

### Application quota guards

These settings limit the local proxy process; they are not Google's published quotas:

| Environment variable | Default | Guard |
|---|---:|---|
| `GEMINI_PROJECT_RPM` | 5 | Generation requests per rolling minute |
| `GEMINI_PROJECT_TPM` | 12,000 | Estimated input tokens per rolling minute |
| `GEMINI_PROJECT_DAILY_REQUESTS` | 100 | Requests per Pacific calendar day |
| `GEMINI_PROJECT_DAILY_TOKENS` | 500,000 | Input plus maximum output reservations per day |

Use positive integer overrides that fit the actual project allowance. Explicitly setting TPM rejects a single oversized request. Daily reservations are saved in the private, git-ignored `.hamsa-ai-budget.json`; failed requests can retain reservations when upstream usage is unknown. Preserve that file across restarts. Budget guards do not account for other apps or server replicas using the same Google project.

## Local data, backups and offline use

Study data lives in IndexedDB. Settings can export and restore a portable JSON backup using the supported replace or merge flow. Backup preferences exclude API credentials. Local form drafts and recovery state are separate from portable backups.

The service worker caches the app shell and previously used assets. Saved notes, lessons and flashcards remain available when the required assets are cached. New AI requests, OCR and live exam updates require a network connection. App code uses network-first caching; API responses are never cached. Heavy PDF bundles are loaded and cached on demand.

If an old shell persists after an update, reload with `Ctrl+Shift+R`. The browser console escape hatch `await app.clearServiceWorker()` clears this app's offline cache.

## Printing and source files

Study note, lesson, answer and flashcard exports use browser print previews. Allow site pop-ups where required, then choose **Save as PDF** in the print dialog. Saved PDF/image sources open locally when available; source text can remain useful when an original binary is unavailable.

Hindi print previews use the bundled Noto Sans Devanagari font. Its SIL Open Font License is in `assets/fonts/OFL-NotoSansDevanagari.txt`.

## Verification

```powershell
npm test
npm run check
```

The regression runner covers the remaining modules, transport, data compatibility, sanitization, accessibility and offline cache behavior. Mocked provider tests do not prove that a particular live key currently has generation access or quota.

Additional server and isolated browser checks are documented in [scratch/README.md](scratch/README.md). `jsdom` is a development dependency; browser vendor libraries are bundled under `assets/vendor/`.

## Project structure

```text
index.html                 SPA shell and navigation
server.js                  Static server, Gemini proxy and exam listing routes
ai-proxy-policy.js         Shared payload and quota guards
sw.js                      Offline shell and asset cache strategy
manifest.webmanifest       Installable app metadata
js/app.js                  Routing, shared generation lifecycle and accessibility
js/db.js                   IndexedDB helpers and portable backup compatibility
js/ai-client.js            Gemini transport, pacing, cancellation and usage
js/gemini-service.js       Study prompts, model discovery and connection tests
js/quiz-service.js         Bounded source batches, question generation and checkpoints
js/views/quiz.js           Quiz creation, processing, attempts and saved quizzes
js/pdf-extractor.js        PDF text extraction and OCR
js/pdf-generator.js        Printable study material
js/views/                  Dashboard and remaining study module controllers
css/                       Shared themes, module layouts and accessibility
assets/vendor/             Bundled browser dependencies
assets/fonts/              Print fonts and their licenses
scratch/                   Maintained regression and browser verification suites
```

Keep numbered CSS parts in their linked order. Later parts can intentionally override earlier rules.
