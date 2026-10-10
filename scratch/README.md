# `scratch/` — maintained verification tooling

This directory is not shipped to the browser. The server blocks requests to `/scratch/`.

## Run checks

```powershell
npm test
npm run check
```

`run-all-checks.js` is the current list of maintained regression suites. It reports a combined pass/fail result; check counts can change as modules evolve. `syntax-check.js` parses the active application files without executing them.

The automated provider fixtures use mocked Gemini responses or local HTTP servers. They do not establish that a live API key has permission or quota. View, storage and sanitizer checks use the `jsdom` development dependency.

## Maintained coverage

| Suites | Coverage |
|---|---|
| `verify-ai-client.js`, `verify-token-usage.js` | Transport selection, API key handling, deadlines, cancellation, response bodies and usage accounting |
| `verify-gemini-only.js`, `verify-gemini-models.js`, `verify-provider-static.js` | Gemini settings, credential/model selection, compatibility migration and static-file isolation |
| `verify-settings.js`, `verify-backup.js` | Settings lifecycle, data actions, portable restore, preferences, rollback and archival records |
| `verify-ai-teacher.js` | Explanations, saved lessons, diagrams, feedback and lifecycle |
| `verify-quiz.js`, `verify-quiz-ui.js`, `verify-quiz-practice.js`, `verify-quiz-storage-options.js`, `verify-quiz-tools.js` | Exact 20-question output batches, bilingual output, source budgets, individual OCR recovery for oversized scan batches, page checkpoints, exam timer and scoring, shuffle/revisions, manual editor, bookmark backups, flashcards and safe print/PDF export |
| `verify-study-notes.js`, `verify-notes-focus.js` | Import scope, source coverage, editing, revision, original sources, retry and cancellation |
| `verify-flashcards.js` | Note/custom cards, identity, schedules, typed recall, recovery, editing and imports |
| `verify-dashboard.js` | Non-module-specific learning activity, data/markup/style agreement, heatmaps, escaping and motion |
| `verify-exam-listing.js`, `verify-data-honesty.js`, `verify-profile-education.js` | Exam source boundaries, provenance, eligibility and profile education |
| `verify-hardening.js`, `verify-ui-utils.js` | Sanitization, SVG allow-lists, accessibility, shared helpers and AI cancellation |
| `verify-service-worker.js` | Cache strategy, existing precache assets, offline fallback, API exclusions and cache cleanup |
| `verify-css-split.js`, `verify-view-hero.js`, `verify-template-balance.js` | Shared CSS structure, view heroes and balanced generated HTML |
| `verify-layout.js`, `verify-header.js`, `verify-auth-gate.js` | Responsive page width, remaining navigation, login gate and footer |

The runner also guards against restoring the retired Quiz implementation while allowing the fresh QUIZ tab and preserving archival backup compatibility.

Quiz scan recovery fixtures use mocked OCR responses. Oversized scanned material can require additional Gemini requests to read each image before the unfinished question batch is generated. Those source requests do not change the 20-question output batches. Completed questions and successfully checkpointed scan text survive Resume; no source page is silently skipped. Automated checks cover request budgets, page references, pause/reload recovery and incomplete or unreadable OCR responses without sending user PDFs to a provider.

## Server checks

Start the local server in another terminal:

```powershell
npm start
```

Then run the HTTP checks:

```powershell
powershell -ExecutionPolicy Bypass -File scratch/verify-server-hardening.ps1
powershell -ExecutionPolicy Bypass -File scratch/verify-assets-served.ps1
powershell -ExecutionPolicy Bypass -File scratch/verify-sw-precache-served.ps1
```

These checks exercise serving, private-path rejection and asset responses.

## Optional browser checks

```powershell
node scratch/verify-study-shell-browser.cjs
node scratch/verify-quiz-browser.cjs
node scratch/verify-settings-browser.cjs
node scratch/verify-flashcards-browser.cjs
node scratch/verify-study-notes-browser.cjs
```

These scripts use isolated browser fixtures and mocked provider responses. The shell check boots the complete application and checks every remaining route at desktop and mobile widths. Screenshots, PDFs and browser profiles are written to the operating system's temporary directory. Read each script's setup requirements before running it; browser availability and local server requirements can differ.

For a manual Quiz preview, run `node scratch/preview-quiz.cjs` and open `http://127.0.0.1:3315/#quiz`. It uses a synthetic guest profile and mocked bilingual questions on a separate local origin, blocks external provider requests, and serves only public application assets. Set `HAMSA_QUIZ_PREVIEW_PORT` to change its port.

`verify-quiz-live.cjs` is an opt-in smoke check using only synthetic physics material and the configured server key. It is excluded from `npm test`. Set `HAMSA_QUIZ_LIVE=1` and run `node --env-file-if-exists=.env scratch/verify-quiz-live.cjs` to spend one live request for a 20-question quiz. Optional `HAMSA_QUIZ_MODEL` and `HAMSA_QUIZ_LANGUAGE` select the model and language. It prints status and validation results, never credentials or user study data.

## Optional Answer Writing checks

```powershell
node scratch/test_bilingual_full_suite.js
node scratch/test_full_view_and_pdf.js
node scratch/test_roadmap_render.js
```

These working checks cover deterministic evaluation, bilingual reports, diagram rendering, printable report HTML and improvement roadmaps. They use local fixtures and do not send provider requests.
