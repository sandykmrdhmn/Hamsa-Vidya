# `scratch/` — verification suites & migration tooling

Not shipped to the browser. `server.js` blocks `/scratch/` from being served.

## Run the checks

```powershell
npm test          # all 22 suites, 1644 checks
npm run check     # syntax only
```

Server suites need a live server (they make real HTTP requests):

```powershell
node server.js
powershell -ExecutionPolicy Bypass -File scratch/verify-server-hardening.ps1     # 23 checks
powershell -ExecutionPolicy Bypass -File scratch/verify-assets-served.ps1        # 67 assets
powershell -ExecutionPolicy Bypass -File scratch/verify-sw-precache-served.ps1   # 68 SW assets

# Rate limit / body cap / model validation need a key present:
$env:GEMINI_API_KEY="test"; $env:PORT="3100"; node server.js
powershell -ExecutionPolicy Bypass -File scratch/verify-proxy-limits.ps1
```

---

## Verification suites (keep these — they are the regression net)

| File | Checks | What it guards |
|---|---|---|
| `run-all-checks.js` | — | Runner. Aggregates every suite into one pass/fail summary. |
| `syntax-check.js` | 31 | Every JS file parses (`vm.Script`, no execution). |
| `verify-ai-client.js` | 22 | Transport mode resolution; **asserts the API key never appears in any URL** in proxy mode; timeout + `abortAll()`. |
| `verify-backup.js` | 55 | Export completeness, REPLACE/MERGE restore, foreign-key remapping, rollback (clean + partial), legacy v1/v2 files, `clearDatabase()`. |
| `verify-quiz-scoring.js` | 65 | Marking schemes and their arithmetic, wall-clock timer, in-progress persistence and resume guards. |
| `verify-data-honesty.js` | 149 | Scraper provenance flags, eligibility verdicts on estimated vs official data, attempt-log analytics. |
| `verify-hardening.js` | 74 | Accessibility wiring, sanitizer hard-dependency, **SVG sanitizer against 10 real XSS payloads**, AI cancellation. |
| `verify-ui-utils.js` | 67 | Shared helpers; **proves the old `escapeJs` produced a broken JS literal and the new one round-trips**; spotlight perf rewrite. |
| `verify-css-split.js` | 35 | The CSS split is **byte-identical** to the pre-split originals in `_backup/`; AI Teacher hero redesign. |
| `verify-service-worker.js` | 42 | Cache strategy (app code must be network-first), precache paths all exist, `/api/` never cached, escape hatch present. |
| `verify-token-usage.js` | 40 | Exact token accounting; **asserts reading `usageMetadata` does not consume the caller's response body**; oversized-prompt warning; input caps. |
| `verify-dashboard.js` | 170 | Dashboard markup ↔ CSS ↔ `db.js` stay in agreement, then **renders the view in jsdom** and asserts the real DOM: masthead is genuinely first and never opacity-0, type-size hierarchy, heatmap grid geometry, ring maths, counters landing on exact values, escaping of a live XSS payload, first-run vs returning-user branches. |
| `verify-view-hero.js` | 137 | The shared `UIUtils.buildViewHero()` banner: cascade position of `css/view-hero.css`, every view that must have a hero does and the two that must not still don't, accent allow-list ↔ CSS tokens agree, old duplicated headers are gone. Then **executes the builder in jsdom** against a live XSS payload and runs the counter animation to completion. |
| `verify-template-balance.js` | 28 | Every HTML template literal in the app is **tag-balanced**. Includes a self-test so a broken parser cannot make the suite tautological. |
| `verify-exam-listing.js` | 53 | The exam tab reads **one source and five fields** — `freejobalert.com/government-jobs/` and Post Date · Board · Exam/Post Name · Qualification · Last Date. Guards the boundary rather than the parsers: that no second host appears, that the removed AI notification stage (server fetcher, PDF proxy, Dexie store, enrichment service) stays deleted, that no field outside those five is produced, and that eligibility degrades honestly to qualification-only instead of certifying a candidate against an age limit that was never read. |
| `verify-header.js` | 64 | The **two-tier site header**: `--header-h` is measured by app.js and every sticky offset below the header reads it, the rail degrades in stages before it can overflow, and **index.html is parsed with jsdom** to prove no control was duplicated or lost while moving blocks between rows and all nine tabs keep the `data-module` app.js navigates by. |
| `verify-layout.js` | 75 | **One shared page width** on every view. Guards the zoom-stretch bug: `--page-max` is declared once, every per-view wrapper is released to it, long-form prose keeps its own measure, and a per-view table of approved wrappers stops a new view reintroducing its own width — or an inline one, which no stylesheet can override. Self-tested. |
| `verify-profile-education.js` | 95 | The onboarding **education list**. The form now stores a repeatable `education[]` array while the eligibility engine still reads flat fields, so the suite guards the seam: derivation picks the *highest* qualification and the right percentages, CGPA is converted once and capped, a level cannot be added twice, old single-qualification profiles migrate in memory **without being rewritten on disk**, and `isProfileComplete()` accepts a 10th-pass-only candidate instead of locking them out of the form. The pure logic is **executed** against a `localStorage` stub; the markup, the handler wiring and the new stylesheet's cascade position are checked statically. |
| `verify-quiz-palette.js` | 55 | **`position: fixed` inside a view**. Starting a quiz showed a stray empty panel beside the question card: `.view-section.active` animates with `animation-fill-mode: both`, so it keeps a `transform` forever and becomes the containing block for fixed descendants — and the Question Palette was hidden by parking it at `right: -420px`, which then measured from the content column instead of the window. The suite asserts the fill mode is released, the drawer hides by `visibility` like the app's two other drawers, and **no fixed overlay in any stylesheet is parked on a negative offset**. Self-tested. |
| `verify-auth-gate.js` | 81 | The **pre-app login screen** and the persistent site footer. Guards three fail-safe invariants: the Google button is a placeholder and must not grant entry (only `continueAsGuest()` may set the storage key, a value outside the `GUEST`/`GOOGLE` allow-list is treated as not authed, and the Google handler is asserted not to touch `localStorage`), a returning visitor's authenticated state bypasses the gate entirely (`#app-root` starts hidden, and `app.js`'s DOMContentLoaded conditional both un-hides it and falls through to boot even when `window.authGate` is missing so a script-load failure cannot brick the app), and the placeholder social links are actually intercepted by `handleSocialClick()` so `href="#"` never scrolls the page. The controller is **executed inside jsdom** against a real `localStorage`. |
| `verify-quiz-timer.js` | 98 | The **custom exam time limit**. The window used to be invisible and fixed at 1.5 min/question; it is now chosen on the Create Quiz screen and frozen onto the quiz row as `examDurationSeconds`. Guards the seams: `AUTO` must store `null` rather than a total computed from the *requested* count (the AI can return fewer questions), the player must still fall back to the old heuristic for every pre-feature quiz and for the four drill paths that do not ask, hostile values (`0`, negative, `NaN`, `{}`) must degrade to the heuristic instead of producing a zero-length exam, `examDurationSeconds` (allowed) must not be confused with the adjacent `durationSeconds` (spent), and typing must not clamp mid-keystroke or re-render (which would destroy the caret). Both the form logic and the player's window resolution are **executed**. |
| `verify-library-bookmarks.js` | 114 | **Saved questions actually reaching the Library**, grouped by subject. Bookmarking looked like it worked everywhere except the one screen built to show it: `isBookmarked` is an **index**, and IndexedDB silently omits boolean-valued records from an index, so `where('isBookmarked')` matched nothing while the dashboard's in-memory `filter()` counted them fine. This suite ships **its own fake Dexie that enforces IndexedDB's key rules** — the shared fake in `verify-data-honesty.js` stubs `where`/`equals`/`filter` to return every row, so the original broken code passes there. A self-test proves the fake reproduces the original failure before anything else is asserted. Then: reads find bookmarks in either representation, every write site stores `1`/`0`, the v10 migration loses no bookmark and is idempotent, an old backup cannot re-hide them on import, and grouping/ties/degenerate input are deterministic. |
| `verify-notes-focus.js` | 93 | The Study Notes **extraction scope** — "only the maths questions". The hard part is not adding a line to the prompt: the existing prompt shouts `ABSOLUTE ZERO SHORTENING` / `WORD COUNT PARITY MANDATE` / "ALL N must appear", so a scope *appended* to it gives the model contradictory orders and the louder one wins — the filter silently does nothing. The suite **runs gemini-service.js against a stubbed transport and reads the prompts it would send**, asserting the completeness mandate is *swapped* for a scoped variant rather than accompanied by it, and that the instruction is repeated after the 4000-char source chunk that would otherwise bury it. The other half is honesty: four separate paths used to answer failure with `generateStructuredFallbackNote()`, which rebuilds the **whole unscoped source** — so all-empty chunks, a transport failure, a missing API key and a user cancel are each asserted to report the truth instead of handing back notes on everything. |

`verify-hardening.js`, `verify-ui-utils.js`, `verify-dashboard.js` and `verify-view-hero.js`
need `jsdom` (a devDependency). They skip their runtime sections with a clear `SKIP` message
if it is missing, rather than passing silently.

### Why `verify-template-balance.js` exists

The whole UI is concatenated strings assigned to `innerHTML`, with no build step and no
template compiler. A stray `</div>` raises **no error**: the parser discards it and
re-parents every following sibling, so a panel escapes its container and the layout breaks
somewhere unrelated. Moving or deleting a header block is exactly the edit that causes it —
and this project has now done that nine times. The suite parses every template literal with
a real scanner (comments stripped first, `${…}` skipped with recursive brace/quote/backtick
tracking) because a regex gets both of those wrong.

### Why `verify-dashboard.js` is the largest suite

The dashboard is built by concatenating strings, so its failure mode is silent: a renamed
class, an unlinked stylesheet or a stats field that never existed produces an unstyled or
blank page with **no console error**. The suite therefore checks all three sides against
each other — every class the markup emits has a CSS rule, every rule has markup behind it,
and every `stats.*` field it reads is actually returned by `getDashboardStats()`.

## `_backup/`

Pre-change copies kept as the reference for `verify-css-split.js`, which concatenates
`css/components/*` and `css/ai-teacher/*` and compares against them.
**Do not delete `_backup/components.css` or `_backup/ai-teacher.css`** — that check would
lose its baseline. The `.js` copies are pre-codemod snapshots, useful for diffing.

## One-shot codemods (already applied)

Kept because they document mechanical transformations that are hard to infer from the
result. Re-running them is a no-op or an error, not a corruption — each either matches
nothing or aborts.

| File | What it did |
|---|---|
| `codemod-ai-client.js` | Rewrote 15 direct `generativelanguage.googleapis.com` fetches to `window.aiClient.fetchGenerateContent()`. |
| `codemod-ai-gates.js` | Converted 17 `if (apiKey)` capability gates to `isAiAvailable()`. |
| `codemod-download-blob.js` | Replaced 7 hand-rolled blob-download blocks with `UIUtils.downloadBlob()`. |
| `fix-sanitizer-fallbacks.js` | Removed 7 `window.SecurityUtils ? sanitize(x) : x` guards that fell back to raw content. |
| `fix-eligible-checks.js` | Taught 6 UI sites to accept the new `LIKELY_ELIGIBLE` status. |
| `split-css.js` | Split `components.css` (8132 lines) and `ai-teacher.css` (4225) into numbered parts, asserting byte-identical output before writing. |

## Legacy exploratory scripts

`test-*.js`, `test_*.js`, `verify_complete_notes_and_40pct_summary.js` predate this work.
They need a live Gemini API key and were written for manual inspection, so they are **not**
in `npm test`. The suites above cover the same functionality automatically.
