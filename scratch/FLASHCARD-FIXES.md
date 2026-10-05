# Flashcard implementation checklist

Completed against the Flashcard audit. Evidence below comes from actual executed checks, not proposed tests.

- [x] 1. Preserve scientific notation and case in answer/card identities.
- [x] 2. Persist Note identity migration and last-read timestamp.
- [x] 3. Keyboard ratings work after Reveal without duplicate native activation.
- [x] 4. Safe horizontal content scrolling and optional swipe ratings.
- [x] 5. Protect asynchronous deck loading from review/session races.
- [x] 6. Protect CSV file reads, imports and preview from races.
- [x] 7. Repair malformed optional backup metadata; safe Reveal and PDF.
- [x] 8. Keep currency as text while rendering explicit mathematics.
- [x] 9. Refresh due counts while the vault is open and on returning.
- [x] 10. Report physical CSV line numbers, including blank/multiline records.
- [x] 11. Compact mobile recall and bring revealed answers into view.
- [x] 12. Index bulk review cleanup, Note identities and deck counts.
- [x] 13. Split long notes at semantic boundaries; preserve code/math blocks.
- [x] 14. Open original source pages with a useful text fallback.
- [x] 15. Remember the preferred recall mode and swipe preference.
- [x] 16. Explain excluded Quiz cards and disable unusable decks.

Additional fixes found during implementation: flat legacy Notes now resolve consistently in reading/library/review storage; failed read-metadata writes leave saved Notes readable and never claim new metadata was persisted. Formula markers cannot become HTML inside Markdown link attributes; literal URL paths are restored and sanitized.

| Tasks | Regression evidence |
| --- | --- |
| 1 | `x²`/`x2`, `H₂O`/`H2O`, `CO`/`Co`, `m`/`M`, `m/s`/`M/s` differ; both exponent cards import. Ordinary prose comparison and case-only duplicate option rejection still work. |
| 2 | Returned IDs/timestamps equal the stored Note; subsequent reads keep tokens. Storage failures return durable saved content. Flat legacy Notes successfully save a real review against their library identity. |
| 3 | Native Edge Space activates Reveal/rating exactly once; Digit3 saves from the focused Reveal button on all four layouts. |
| 4 | Gestures on pre/code/table/math and horizontal scrollers save zero ratings; disabled swipe saves zero; an eligible enabled gesture rates once. Existing vertical/cancel/multitouch regressions pass. |
| 5 | Deferred Note, manual/smart/resume loads cannot replace a saving/completed review or a session with an open dialog. Existing navigation/Undo races pass. |
| 6 | Submit and preview stay blocked during delayed reads; latest file wins; old previews are omitted; disk failures, closed dialogs and oversized files preserve/unlock the appropriate state. |
| 7 | Malformed optional metadata repairs without discarding valid front/back; Reveal works; PDF export tolerates invalid arrays/null references. |
| 8 | Currency ranges/lists/escaped dollars/adjacent prices stay text. Explicit equations render MathML; Markdown links retain their literal URL. |
| 9 | Elapsed time and midnight change due/reviewed counts. A real short-delay timer updates the visible vault while preserving search focus/caret. |
| 10 | Blank rows, CRLF and quoted multiline records report the original physical start line; unclosed quotes identify their start line. |
| 11 | Submitted response text remains in compact details. Edge geometry checks confirm the key answer is visible above rating controls at 390px light/dark and 320px. Screenshot manually inspected. |
| 12 | Cleanup of 350 Note reviews builds the source card list once and performs zero per-review Note reads. Existing insertion/reordering/editing/migration regressions pass. Deck counts use maps. |
| 13 | Source whitespace-normalized text is retained; fenced code, display math and tables remain complete; ordinary parts stay within the target size. Protected blocks may exceed the target to preserve meaning. |
| 14 | Native Edge source clicks open actual saved PDF bytes at page 2. Missing/unsafe files use escaped saved text. Object URLs revoke on close; stale reads cannot open a viewer after leaving. |
| 15 | Preferred recall, swipe and limits persist together; resumed session mode does not overwrite the preferred mode; restored preferences are read for new decks. |
| 16 | Flagged questions, missing explanations and ambiguous keys produce visible reason counts. A deck with zero usable cards has a disabled Study button. |

Final validation, 2026-10-02:

- `npm test`: **1,886 checks passed, 0 failed; 28/28 suites green**, including **87 Flashcard regressions**.
- `node scratch/verify-flashcards-browser.cjs`: **194 checks passed, 0 failed**, isolated Edge with real IndexedDB; 1440px desktop, 390px light/dark and 320px.
- Native A4 PDF: multiple pages; every page contains actual text drawing operators, including Hindi content.
- `git diff --check`: exit 0; only existing Windows line-ending notices.
- Browser artifacts: `C:\Users\sandy\AppData\Local\Temp\hamsa-flashcards-browser-U9ziPB` (`desktop.png`, `mobile.png`, `mobile-dark.png`, `small-mobile.png`, `flashcards.pdf`).

Browser fixtures use isolated test data and no API credentials. No live AI grading or factual answer verification is claimed. Existing paid/free provider configuration was not part of this task.
