# HAMSA VIDYA (हंस विद्या) — AI Wisdom & Quiz Companion

> **"AI Wisdom & Quiz Companion • Sharpen Your Intellect"**  
> *Symbolism: The celestial swan (Hamsa) represents discrimination (Viveka)—filtering pure knowledge and truth from noise.*

---

## 🪿 Overview

**Hamsa Vidya (हंस विद्या)** is a modern, full-stack educational web application and AI study companion. Designed for competitive exam aspirants (UPSC, SSC, Banking, NEET, State PSCs) and lifelong learners, it transforms study materials (PDF documents with precise page range boundaries or study notes) into high-yield Multiple Choice Questions (MCQs) powered by Google Gemini AI.

---

## 🌟 Key Features

### 1. Ingestion Engine & Bug-Free Page Range Selector
- **PDF Document Ingestion**: Upload study PDFs up to 200MB. PDF.js automatically parses metadata, file size, and page counts.
- **Advanced Dual-Thumb Page Range Selector**:
  - Dual-thumb range slider syncing `fromPage` and `toPage`.
  - Stepper controls (`[-] [Input] [+]`) for start and end pages.
  - Quick presets: `First 10 Pages`, `First 25 Pages`, `Pages 10–30`.
  - **Zero Premature Snapping**: Raw text inputs allow natural typing (e.g. typing "30" without jumping to the end page).
  - **Strict Scope Enforcement**: Questions are generated strictly from the specified page boundary.
- **Study Notes / Direct Text**:
  - Live character counter with textarea.
  - One-click topic inspiration pills (Polity Fundamental Rights, 1857 Revolt, Cell Biology & DNA, RBI Monetary Policy).

### 2. Google Gemini AI & Deterministic Fallback Engine
- Direct REST integration with Google Gemini, defaulting to stable `gemini-3.6-flash`. Automatic fallbacks use earlier free-tier Flash models; 3.7 and 3.8 are excluded from automatic selection (Google's usage quotas still apply; a billing-enabled API project uses its configured paid tier). Model availability and [pricing](https://ai.google.dev/gemini-api/docs/pricing) verified on October 1, 2026.
- Quiz generation requires configured Gemini access. Offline doubt review shows saved explanations; it does not invent answers to follow-up questions. Saved quizzes remain playable offline.
- Multi-step animated progress overlay ("Reading PDF...", "Extracting concepts...", "Formulating MCQs...", "Crafting answer key...").

### 3. Dual Quiz Playback Modes
- **Practice Mode**:
  - Immediate question lock upon answer selection.
  - Emerald green highlight for correct, crimson red for wrong.
  - Instant explanation with option reasoning, memory cues and source references when available.
- **Exam Mode**:
  - Timed countdown timer with under-2-minute warning pulse.
  - Answers hidden until final evaluation.
  - **Question Palette Drawer**: 1-click grid navigation with color-coded badges (Answered, Unanswered, Marked for Review).

### 4. Performance Analytics & Visual Charts
- **8-Metric Statistics Grid**: Quizzes taken, questions completed, correct answers, overall accuracy %, average score %, best score %, library count, consecutive day streak.
- **Pure SVG Charts**:
  - Accuracy Donut Chart (Correct, Incorrect, Skipped slices).
  - 10-Quiz Performance Trend Line with smooth splines and gradient area.
  - Subject Mastery Bar Chart.

### 5. Native Printable A4 PDF Question Paper Generator
- Opens a native A4 print preview with selectable text and bundled Hindi fonts. Choose Save as PDF in the print dialog.
- Quiz title, student details and saved time/marking information in the paper header.
- **Section I**: Clean formatted MCQs with page break protection.
- Export questions only, answer key only, or the complete paper with explanations. Printed time and marks follow the saved quiz settings; source and AI keys are labelled accurately.

### 6. Study Library & Bookmarks Knowledge Base
- **All Quizzes**: Search, sort (Newest, Oldest, Highest/Lowest score), filter by difficulty, retake, view results, or export PDF.
- **Saved Questions**: Browse bookmarked questions across all quizzes, collapsible explanations, and a **`🚀 Start Bookmarks Drill`** CTA.

### 7. Customization & Themes
- Seamless Light Mode and True OLED Dark Mode.
- **6 Curated Color Palettes**: Indigo, Emerald Teal, Radiant Amber, Vivid Rose, Ocean Cyan, Slate.
- Font scaling (Small to Extra Large) and typography font families.
- Portable JSON backup and restore.

### 8. Flashcards & Active Recall
- Study validated quiz answers, note definitions/formulas/key points, bookmarks and custom decks in a compact layout.
- Reveal before rating; displayed Again/Hard/Good/Easy intervals match saved schedules. Again is due in ten minutes and repeats in a bounded practice queue. Scheduling uses local calendar dates and a custom ease-factor algorithm.
- Undo the last rating, resume a saved session, practise weak cards, or restart the full deck. Edited/deleted cards are omitted from recovery; corrected custom answers reset their schedules.
- Manage and search cards, edit deck titles, import quoted CSV files, or create fill-in-the-blank prompts with `{{c1::phrase}}`. Imports validate all rows before saving and skip duplicates.
- Optional typed recall compares normalized wording with the saved answer; it does not use AI grading. Daily new/review limits, source references, memory cues and honest session counts support revision.
- Export the full deck as a printable A4 sheet with answers, explanations and available source context. No additional API calls are needed for these tools.
- Compact animated header, mobile toolbar and sticky rating controls keep studying usable on small screens. Keyboard focus follows reveal, answer feedback and the next question.
- Notes retain their card identities after insertion or reordering; edited answers invalidate their old schedules. Long note explanations are split into smaller recall cards, with source references retained.
- Add/Edit/Import forms recover unfinished drafts on this device. Discard is explicit; successful saves, deletion and Flashcard resets clear the appropriate drafts. Form drafts are local recovery data and are not included in portable backups.
- Import preview reports existing/batch duplicates and invalid rows before saving. BOM-prefixed CSV files are supported; unsupported or incomplete cloze groups are rejected.
- Mathematical signs, decimals and technical type names remain distinct answers. Formula cards and explicitly delimited TeX render through the bundled MIT-licensed KaTeX 0.19.0 renderer using native MathML; invalid formulas fall back to readable text. The renderer uses [untrusted TeX and bounded expansion](https://katex.org/docs/options), with a separate MathML allow-list.
- Superscripts/subscripts and chemical case are preserved (`x²` differs from `x2`, `CO` from `Co`); ordinary prose comparison still tolerates case. Currency stays literal. Invalid optional backup metadata is repaired before display/export.
- Recall mode and optional swipe ratings are remembered. Scrolling code, formulas and tables never rates a card. Typed responses collapse after submission and mobile Reveal brings the answer into view.
- Original Note PDF/image references open locally at the cited page, with saved text when the original file is unavailable. Quiz decks explain excluded questions; due counts refresh as time passes and when returning to the tab.
- CSV reads block imports until complete; later file selections win, and errors report the original physical line numbers. Long Note cards split at sentence/paragraph boundaries while preserving complete code/math blocks. Indexed bulk review cleanup avoids rebuilding Notes for every review.

---

## 🚀 Quick Start & Running Locally

### Option 1: Double-Click Launcher (Windows)
Double-click `start-server.bat`. It will automatically launch the local Node.js server.

### Option 2: Command Line
```powershell
node server.js
```
Open your browser and navigate to `http://localhost:3000`.

### 🔒 Local use: run with the API key server-side

By default the app looks for a personal Gemini key in browser `localStorage`, which means
the key is readable by anyone with access to the browser profile and travels in every
request URL. Setting the key as an environment variable instead keeps it on the server —
the browser never receives it:

```powershell
$env:GEMINI_API_KEY="your-key-here"
node server.js
```

The startup banner tells you which mode is active:

```
🔒 Gemini mode: SECURE PROXY (key stays server-side)
⚠️  Gemini mode: DIRECT (no GEMINI_API_KEY set — browser will use a personal key from Settings)
```

Settings → *Google Gemini AI Configuration* shows the same status, so you can confirm it
in the UI.

The shared-key Gemini routes accept loopback connections with a localhost host and
same-origin browser requests. Remote visitors use their own key from Settings. The
app's browser login is not backend authorization; sharing the server key on a public
deployment requires an authenticated backend before relaxing this local restriction.

The shared proxy enables Gemini 3.6 Flash, text output, inline-image OCR and one
candidate, with at most 8,192 output tokens and minimal/low thinking. Defaults are
application safeguards, not Google's published quota or a billing limit:

| Environment variable | Default | Guard |
|---|---:|---|
| `GEMINI_PROJECT_RPM` | 5 | Shared generation requests per rolling minute |
| `GEMINI_PROJECT_TPM` | 12,000 | Estimated input tokens per rolling minute |
| `GEMINI_PROJECT_DAILY_REQUESTS` | 100 | Shared generation requests per Pacific calendar day |
| `GEMINI_PROJECT_DAILY_TOKENS` | 500,000 | Estimated input plus maximum output reservations per day |

Set positive integer overrides to match your actual project allowance. Explicitly
setting TPM also rejects a single oversized request. With the default TPM, an existing
large study request can use an otherwise empty minute. Daily reservations persist in
the private, git-ignored `.hamsa-ai-budget.json`; corrupt, unreadable or unwritable budget
storage pauses shared generation. A missing file starts a fresh budget, so preserve it
across restarts. Failed requests retain reservations because upstream usage can be
unknown. These guards cover one server process; other apps, replicas and personal keys
sharing the same Google project need a common authenticated quota store for a global cap.

---

## ✅ Verification

The project ships a regression suite covering the security-, data- and scoring-critical
paths. Run it after any change:

```powershell
npm test          # 35 suites, including Quiz and Flashcard regressions
npm run check     # syntax only (fast)
```

Server-dependent checks (rate limiting, the static-file deny-list, asset availability) need
a running server — see `scratch/README.md` for the exact commands.

`jsdom` is a **devDependency** used for isolated view, storage and sanitizer regression
checks. Nothing in `node_modules` is served to the browser; the app's own vendor
libraries live in `assets/vendor/`.

---

## 📴 Offline behaviour

A service worker (`sw.js`) caches the app shell on first load, so after visiting once the
UI, your quizzes, notes and flashcards all work with no network.

- **Your edits still show up immediately.** App code (`js/`, `css/`, HTML) is served
  network-first, so the cache is only a fallback. It does not create the usual
  "why isn't my change appearing" problem.
- **Vendor libraries are cached aggressively** because they're immutable versioned bundles.
  The heavy PDF libraries (~3.1 MB) are cached on first use rather than up front.
- **AI features still need the network** — `/api/` is never cached, so no stale AI answers.
- If the cache ever misbehaves, run `await app.clearServiceWorker()` in the browser console
  and reload.

---

## 📂 Project Architecture

```
Hamsa Vidya Website/
├── index.html                   # Master HTML5 SPA container
├── server.js                    # Zero-dependency Node server + secure Gemini proxy
├── sw.js                        # Service worker: offline shell, network-first app code
├── manifest.webmanifest         # PWA manifest (installable, app shortcuts)
├── start-server.bat             # 1-click Windows launcher
├── package.json                 # Metadata, npm test / npm run check
├── css/
│   ├── tokens.css               # Design tokens, 6 palettes, light/dark OLED modes, font scaling
│   ├── main.css                 # Master styles, typography, ambient mesh glows, resets
│   ├── components/              # 10 feature files, split from the old 8132-line components.css
│   │   ├── 01-base-and-header.css …  02-dashboard.css …  03-create-quiz.css
│   │   └── …  10-tools.css          # NOTE: load order is significant
│   ├── ai-teacher/              # 7 files, split from the old 4225-line ai-teacher.css
│   ├── quiz.css                 # Quiz playback, option cards, explanations, palette drawer
│   ├── exam-alerts.css          # Exam radar cards, eligibility strips
│   ├── answer-writing.css       # Answer writing studio & evaluation dashboard
│   ├── responsive.css           # Mobile nav, tablet/desktop grids, print, reduced-motion
│   └── a11y.css                 # Focus indicators, skip link, sr-only (loaded LAST)
├── js/
│   ├── sanitizer.js             # XSS defence: escapeHtml, sanitizeHtml, sanitizeSvg
│   ├── ui-utils.js              # Shared escaping, downloads, TTS, date & jsPDF helpers
│   ├── ai-client.js             # Single Gemini transport: proxy/direct, timeout, abort
│   ├── db.js                    # Dexie IndexedDB: 12 tables, scoring engine, backup v3
│   ├── pdf-extractor.js         # PDF.js loader & strict [fromPage..toPage] extraction
│   ├── pdf-generator.js         # Native A4 question papers, answer keys and study booklets
│   ├── quiz-quality.js          # Shared answer validation, deduplication and source matching
│   ├── quiz-engine.js           # Source coverage, independent answer review and checkpoints
│   ├── gemini-service.js        # Gemini prompts, model rotation, saved-explanation fallback
│   ├── eligibility-engine.js    # Exam eligibility with provenance-aware verdicts
│   ├── charts.js                # SVG donut, trend line, subject mastery bars
│   ├── app.js                   # Router, view lifecycle, generation lifecycle, a11y promotion
│   └── views/                   # One module per view (dashboard, quiz-player, study-notes, …)
├── assets/
│   ├── vendor/                  # Dexie, Lucide, PDF.js, jsPDF, marked (offline-ready)
│   └── icons/                   # Hamsa swan logo variants per theme
├── scratch/                     # Verification suites + migration tooling (not served)
└── CODE-REVIEW-CHECKLIST.md     # Full audit: 22 items, what changed and why
```

> **CSS load order matters.** `css/components/` and `css/ai-teacher/` are numbered splits of
> two formerly enormous files. Later parts intentionally override earlier ones, so keep the
> `<link>` tags in numeric order. `verify-css-split.js` fails if the concatenated parts ever
> stop matching the original byte-for-byte.

### Study Notes workspace

Study Notes now preserves original PDF/image files with page references, supports selected PDF pages and OCR for scans, and exposes note language, learning level and target exam settings. Scans, translations and AI teaching require configured Gemini access. Without AI, full-source notes are labelled as local formatting rather than generated teaching.

The reader includes compact expandable teaching blocks, source-grounded tables/flows/SVG diagrams when useful, Hindi glossary terms, search within notes, persistent highlights/chat/reading position, active recall, chapter-based quizzes and flashcards. Revision offers Quick, Detailed and Compact Exam views; there is no percentage-based Deep Dive mode or guaranteed one-page export. Failed source batches report their page references and can resume without repeating successful batches. Edited explanations invalidate dependent teaching aids; the AI refresh action rebuilds them from the edited text. Immediate Done saves before leaving editing, with Undo for the last saved revision.

PDF exports preserve all requested revision sections and full reference content. Allow site pop-ups to open the print preview, then choose Save as PDF. Runtime coverage is in `scratch/verify-study-notes.js`; optional isolated Edge verification is in `scratch/verify-study-notes-browser.cjs`.

Study PDF previews load a bundled Noto Sans Devanagari font and wait for fonts before printing, including offline use. The font is from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/notosansdevanagari), distributed with its SIL Open Font License in `assets/fonts/OFL-NotoSansDevanagari.txt`. PDF imports with replacement or null characters are sent through OCR rather than treated as reliable extracted text.


## Quiz reliability & learning workflow

Generated questions pass structural validation, exact source-quote matching when a source is supplied, and a separate AI solving/review pass. Missing keys, duplicate or placeholder options, conflicting source keys and unsupported citations are excluded. This improves reliability but does not guarantee factual correctness. Topic-only questions do not get fabricated page references.

Long sources are split into chunks and supplied as bounded excerpts. Small quizzes can sample parts of a long source; the quiz records its coverage and the player identifies sampled material. Sampling uses unseen chunks before repeating them. One generation is limited to 1 million extracted characters; oversized sources require a smaller page range. Optional OCR uses the configured API quota. Quiz creation can skip unreadable PDF pages and nonterminal OCR failures, then generate questions from remaining readable pages. Authentication, quota, timeout and uncertain network failures pause extraction instead of spending on later pages. Each successfully extracted page is saved against the original draft file and OCR version before processing the next page, so reload/resume reuses it. A PDF source note lists skipped original page numbers and reasons in the player, saved results and every PDF export; it is preserved in generation drafts. A PDF with no readable pages cannot generate a source-based quiz. Existing PDF questions are imported only with an unambiguous printed key, matching printed question and complete ordered options; ambiguous layouts can be excluded conservatively. Completed quizzes save and start directly, without a manual review screen. Interrupted runs offer Continue quiz or an explicit start of the ready questions. Save failures retain the completed draft for retry without regenerating. Accepted batches are checkpointed locally, including quick drills and mock tests. Browser storage limits can prevent a persistent checkpoint; the view reports that condition and pauses paid OCR when its recovery page cannot be saved.

All generation features share browser pacing for the active model and credentials: five requests/minute and a 12,000 estimated input-token/minute quiz budget, with stricter provider cooldowns applied when reported. Small requests have no fixed 12.1-second gap. OCR estimates account for image resolution; actual reported input usage can raise a reservation. Cancelled queued requests cannot send later. Job timing accounts for writer/reviewer stages and known waits under the existing 15-minute ceiling. Blocked/truncated responses and uncertain timeout/network outcomes pause without an identical automatic resend; a malformed completed response retains bounded repair. Transient connection-status failures expire and can recover on reconnect. Processing uses student messages for reading material, creating questions, checking answers and opening the quiz. These application safeguards do not guarantee a project's available Google quota or live generation speed.

Opening a question's doubt panel shows saved explanations immediately without an AI
call. Extra AI help requires an explicit action; unchanged successful preset replies
can be reused in the current result view. Question corrections and changed source,
settings or model invalidate reuse. Custom conversations retain their history. Bounded
in-memory request/stage diagnostics record timings, outcomes and reported usage without
keys, prompts or source text; unknown usage is never presented as zero.

Practice feedback includes option reasoning and memory cues. Exam mode supports Clear Response, keyboard controls, wall-clock timing and saved progress; a failed expired submission can be restored for saving its result. The quick drill is timed for five minutes; the 15-question UPSC mock uses 18 minutes and its +2 / −2⁄3 marking scheme. Student language, level, exam and explanation preferences guide generation.

Every new attempt stores its question, answer and scoring snapshot. History opens the selected attempt and deletes only that attempt. Older logs without snapshots show their saved summary rather than fabricated answers. Results provide topic revision priorities, attempt comparisons, separate wrong/skipped filters, paginated review and local question corrections for future attempts. Corrections preserve completed snapshots. Quiz deletion also removes its related flashcard review records.

Run `npm test` for the automated regression suites. Optional `node scratch/verify-quiz-browser.cjs` verifies desktop and 390px/320px mobile layouts, actual IndexedDB attempt flows and native PDF text rendering in an isolated Edge profile; it never uses a real API key or personal browser data.
