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
- Direct REST integration with Google Gemini (`gemini-1.5-flash` or `gemini-2.5-flash`).
- Built-in intelligent deterministic MCQ generator when offline or if no API key is provided.
- Multi-step animated progress overlay ("Reading PDF...", "Extracting concepts...", "Formulating MCQs...", "Crafting answer key...").

### 3. Dual Quiz Playback Modes
- **Practice Mode**:
  - Immediate question lock upon answer selection.
  - Emerald green highlight for correct, crimson red for wrong.
  - Instant slide-in conceptual explanation card with verified source page citations.
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
- Generates official, print-ready A4 PDF documents using `jspdf` and `jspdf-autotable`.
- Running headers and footers with total page numbering.
- **Section I**: Clean formatted MCQs with page break protection.
- **Section II**: AutoTable Official Answer Key & detailed conceptual explanations.

### 6. Study Library & Bookmarks Knowledge Base
- **All Quizzes**: Search, sort (Newest, Oldest, Highest/Lowest score), filter by difficulty, retake, view results, or export PDF.
- **Saved Questions**: Browse bookmarked questions across all quizzes, collapsible explanations, and a **`🚀 Start Bookmarks Drill`** CTA.

### 7. Customization & Themes
- Seamless Light Mode and True OLED Dark Mode.
- **6 Curated Color Palettes**: Indigo, Emerald Teal, Radiant Amber, Vivid Rose, Ocean Cyan, Slate.
- Font scaling (Small to Extra Large) and typography font families.
- Portable JSON backup and restore.

---

## 🚀 Quick Start & Running Locally

### Option 1: Double-Click Launcher (Windows)
Double-click `start-server.bat`. It will automatically launch the local Node.js server.

### Option 2: Command Line
```powershell
node server.js
```
Open your browser and navigate to `http://localhost:3000`.

### 🔒 Recommended: run with the API key server-side

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

---

## ✅ Verification

The project ships a regression suite covering the security-, data- and scoring-critical
paths. Run it after any change:

```powershell
npm test          # 10 suites, 477 checks
npm run check     # syntax only (fast)
```

Server-dependent checks (rate limiting, the static-file deny-list, asset availability) need
a running server — see `scratch/README.md` for the exact commands.

`jsdom` is a **devDependency** used only to exercise the HTML/SVG sanitizers against real
XSS payloads. Nothing in `node_modules` is served to the browser; the app's own vendor
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
│   ├── pdf-generator.js         # jsPDF + AutoTable A4 question paper & answer key
│   ├── gemini-service.js        # Gemini prompts, model rotation, deterministic fallback
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
