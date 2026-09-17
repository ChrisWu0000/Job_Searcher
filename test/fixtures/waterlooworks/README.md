# WaterlooWorks HTML fixtures

**Every file in this folder except `results-real-page-1.html` is synthetic.** The rest was
not saved from the real WaterlooWorks (Orbis) site. It was hand-written from memory of the page structure so the
parsers had something to run against before anyone could log in. Treat green tests here as
"the parser is internally consistent", not as "the parser works on WaterlooWorks".

**These files must be replaced with real saved pages before trusting any scrape.**

## How to save a real fixture

1. Log in to <https://waterlooworks.uwaterloo.ca> and navigate to the page you want to capture.
2. Open DevTools (F12) → Console, and run:

   ```js
   copy(document.documentElement.outerHTML)
   ```

   `copy()` puts the whole page on your clipboard. Paste it into the matching file below.
3. Or, once M8 lands, click **Save fixture** in the WW++ dashboard, which does the same
   capture with the sanitizer already applied.
4. **Sanitize before committing.** Remove your name, student id, email, phone number,
   WatIAM id, uploaded document file names that identify you, and any session tokens in
   inline scripts or hidden inputs. The content script's `captureSanitizedHtml()` in
   `src/lib/waterlooworks/adapter.ts` strips scripts, styles, input values, emails and phone
   numbers, which is a good starting point but is not a guarantee.
5. Re-run `bun x vitest run test/scraper.test.ts test/applier.test.ts test/pageKind.test.ts`.
   Expect failures. Fix them in `src/lib/waterlooworks/selectors.ts` first — the parsers are
   written to work off labels, so a fixture that changes classes but keeps the visible field
   labels ("Job Summary", "Work Term Duration", "Application Documents Required", …) should
   still pass. Only the results table and the pager rely on CSS selectors in an essential way.

## Files

| File | Page it stands in for |
| --- | --- |
| `results-page-1.html` | Search results, page 1 of 2: `#postingsTable`, 4 rows, pager with an enabled "Next" |
| `results-page-2.html` | Search results, page 2 of 2: 3 rows, pager with a disabled "Next" |
| `results-real-page-1.html` | **Real**, saved with "Save page as fixture" on 2026-09-07 and trimmed to the `table__container--fullscreen` block with 5 rows: Vue `table.data-viewer-table`, `input#resultRow_<id>` checkboxes, `a.pagination__link` pager with `aria-label` "Go to next page" |
| `posting-overlay.html` | Reconstructed by hand from the live DOM on 2026-09-07: the real results table with the posting opened as `div.modal.is--visible` on top, header with the id pill and `h2` title, `tag__key-value-list` label/value pairs in three panels, and the floating action bar whose last button closes the overlay. Values are shortened; structure and class names are real |
| `posting-full.html` | An opened posting with every section present, laid out as Bootstrap panels + `tag__key` / `tag__value` table rows |
| `posting-missing-sections.html` | An opened posting in a different markup style (`np__label` / `np__value` spans, no `#postingDiv`), missing responsibilities, required skills, targeted programs, compensation and region |
| `apply-with-packages.html` | Apply form: two existing packages as radios, three document dropdowns, two pre-screening questions, enabled submit |
| `apply-no-questions.html` | Apply form: packages as a `<select>`, two document dropdowns, no questions |
| `apply-confirmation.html` | Apply form after submission: success banner, disabled submit |
| `login.html` | The campus sign-in page (password field + `#loginForm`) |

## What each fixture is asserting

The tests deliberately assert on *parsed values*, not on markup, so that a real fixture with
different classes can be dropped in with only the expected values updated:

- `test/pageKind.test.ts` — every fixture resolves to the right `PageKind`, and an unknown
  page returns `kind: "other"` with a non-empty `reason`.
- `test/scraper.test.ts` — results rows → `JobStub[]`, posting → `Job`, plus unit tests for the
  pure text parsers (duration, arrangement, deadline formats, document requirements).
- `test/applier.test.ts` — apply page → `ApplyState`, question ids are stable hashes of the
  question text, and nothing ever auto-fills an answer.
- `test/observer.test.ts` — `waitFor` / `waitForElement` resolve on mutation and reject with
  `WaitTimeoutError`.
