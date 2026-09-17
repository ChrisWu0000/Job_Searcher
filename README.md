# WW++

A Chrome extension that turns WaterlooWorks into a local job database with an AI ranking engine and
a visible, assisted application runner.

- **Sync** paginates the WaterlooWorks search results in your own logged-in tab, opens every posting,
  and stores it in IndexedDB.
- **Score** sends each posting plus your resume, your "reach" paragraph, and your constraint list to
  an OpenRouter model, which returns a desire score, an interview-likelihood estimate, and a verdict.
- **Resume** keeps an experience bank of your real positions, projects, bullet points, and facts, and
  builds a tailored LaTeX resume per posting from it: either a free local keyword match or a model
  pass that picks and rephrases bullets without inventing anything.
- **Queue** drives the application flow one job at a time. It highlights what it clicks, always stops
  at prescreen questions, and always stops for your confirmation before submitting.
- **Inspector** shows every table, every engine event, every model prompt and response, and every
  captured page, so nothing the extension does is hidden.

Everything lives on your machine. There is no backend and no account.

## Requirements

- [Bun](https://bun.sh) 1.4.1 or newer (this repo uses Bun for installs, scripts, and tests; Node is
  not required)
- Google Chrome or another Chromium browser with MV3 support

## Install and run

```sh
bun install          # also runs `wxt prepare`
bun run dev          # development build with hot reload
bun run build        # production build into .output/chrome-mv3
bun run check        # tsc, biome, the no-comments rule, and vitest
bun run zip          # packaged extension for distribution
```

`bun run dev` launches a browser with the extension loaded. To load a production build by hand:

1. `bun run build`
2. Open `chrome://extensions`
3. Turn on **Developer mode**
4. Choose **Load unpacked** and select `.output/chrome-mv3`

The toolbar button opens the WW++ dashboard in a normal tab. A "WW++" pill is also injected into
WaterlooWorks pages and opens the same dashboard.

## First run

1. **Settings → API key.** Paste an [OpenRouter](https://openrouter.ai) key. It is stored in
   `chrome.storage.local` only, never synced, never written to the database, and never included in
   an export. Scoring is the only feature that needs it; everything else works without one.
2. **Settings → Model.** The default is `z-ai/glm-5.3-flash`. Use "Test connection" to confirm the
   model id is valid and to cache its pricing for cost estimates.
3. **Settings → Profile.** Paste your resume or a bio, write a "reach" paragraph in your own words
   (what you want, how ambitious to be, dream job versus acceptable job), and edit the constraint
   list and hourly pay floors. Defaults require SWE work, at least $50 USD/hour or $60 CAD/hour,
   and explicit pay. In Canada, prefer strong pay, a recognized employer such as a bank, or broadly
   transferable SWE experience; reputation never waives the pay minimum. Saving applies local filters
   immediately, even to jobs with older scores. Existing model scores are kept; jobs with no model score
   can be ranked when eligible. Upgrading an existing database applies these requirements while keeping
   your resume, reach text, model choice, and unrelated constraints.
4. **Sync.** Log in to WaterlooWorks in a normal tab. On the Sync tab press "Start sync". WW++ opens
   the Full-Cycle job search through Co-op Jobs and the Full-Cycle job-board link, then clicks
   "All Jobs" on the overview (or "My Program" when that is the available entry). It waits across
   page reloads until the results table is present; an empty results table is also a valid search.
   If navigation fails, it pauses so you can check WaterlooWorks, then press Resume.
   From there it uses the same requests the page itself makes: one request lists a hundred
   postings at a time, and postings are fetched eight at a time, so a full board
   takes well under a minute. If those requests are unavailable it falls back to
   paginating the results and opening each posting at about one every 1.5 seconds,
   and writes the rows into the local database. Stop is available between every step, and if the session
   drops the run pauses so you can log back in and press Resume. "Import this posting" pulls in just
   the posting currently open in the WaterlooWorks tab.
5. **Score.** The Jobs tab immediately hides embedded, firmware, CAD, non-SWE, and unclear-role postings,
   plus jobs below the pay floors or with missing, vague, university-norm, or maximum-only pay. Filters
   inspect full text fields; ranges use the lower end and annual salaries assume 2,080 hours. Postings
   stay saved. Use **Automatically filtered** to review them with reasons, or **Show skip verdicts** to
   include all skipped jobs. On the Jobs tab press "Score N unscored jobs" to rank eligible postings;
   filtered jobs use no model calls and are excluded from the cost estimate. The table sorts by score by
   default, hides jobs the model marked skip unless you switch them on, badges jobs first seen in the
   latest sync as New, and has filters for verdict, country, arrangement, duration, required
   documents, status, "closing in 24h", "new only", "no Waterloo" (hides postings located in
   Waterloo), and minimum score or likelihood. Marking a job Skipped also gives it a skip verdict, so
   it drops out of the default view; the model's own verdict is still kept on the score record.
   **Open in WaterlooWorks** navigates to the board if needed, opens an existing matching row or
   clears conflicting search filters and searches the exact posting ID. It checks that the requested
   posting actually opened and reports when a posting is no longer available.
6. **Resume.** On the Resume tab fill the experience bank: one entry per job, project, degree, or
   award, each with the bullet points you would be willing to put on a resume, the facts behind them
   (metrics, scope, team size, outcomes), the technologies used, and optional tags. Add your skill
   groups. Press "Use as scoring resume" to turn the bank into the resume text the scorer sees. The
   Template tab holds the LaTeX document and the snippets for sections, entries, bullets, and skills
   (Jake's Resume by default) with a live preview of the full master resume. From a job's drawer or
   the Jobs bulk bar choose "Tailor resume": the local match picks the most relevant entries and
   bullets instantly and for free; the model pass also rephrases bullets toward the posting. Every
   rewrite is checked against that entry's own bullets and facts, and any rewrite that introduces a
   number, technology, or proper noun that is not already in your bank is reverted and listed in the
   result. Tailored resumes open in the Tailored tab with the selection, an editable LaTeX source,
   Download .tex, and Open in Overleaf. PDF compilation happens in Overleaf or your own TeX install.
7. **Queue.** Mark jobs Interested or Queue them from the job drawer or with the bulk actions, then
   open the Queue tab and press "Start queue". The runner opens each job, picks the default package
   and documents, pauses for prescreen questions, and pauses again before submitting. Nothing is ever
   submitted without your click.

## Saved application PDFs

**Resume → Saved PDFs** opens the final resume library: search by company, role, or posting ID,
review the rendered page, download the PDF or editable LaTeX, and return to the associated job.
The same gallery is available at `resumes.html` in the extension build.

The library reads `public/resumes/manifest.json` and the matching `<stem>.pdf`, `<stem>.tex`,
and `previews/<stem>.png` files. The preview must be rendered from the corresponding final PDF.
Each manifest row contains `jobId`, `company`, `title`, `stem`, and `tailoringNote`.
Files are packaged locally by `bun run build`; personal resume artifacts in `public/resumes/`
are excluded from Git. Missing files produce an explicit empty/error view.

The September 2026 batch was written against the 12 exported Interested postings, compiled with
pdfLaTeX, and checked for one page and single-line bullets. Editable originals are saved in
`../resumes/output/resumes/`; use pdfLaTeX with the Charter, Font Awesome 5, and fullpage packages to compile those sources.
The supplied August 2026 template supplies the company-first headings, grouped roles, icons, and spacing.
After updating a PDF, render its preview again, copy the updated files into `public/resumes/`,
run `bun run build`, and reload the extension. The existing Tailored tab retains its independent
experience-bank and LaTeX editing workflow.

## Privacy

Job text, your resume, your reach paragraph, and your constraints are sent to OpenRouter and to the
upstream model provider under that provider's retention terms whenever you score a job. Tailoring a
resume with the model sends the posting and your whole experience bank the same way; the local match
sends nothing. Nothing else leaves the machine except the LaTeX you choose to open in Overleaf: the database is IndexedDB in your own browser, and the API key stays in
`chrome.storage.local`. Use **Settings → Backup** to export every table as JSON (the key is excluded),
import it back, or delete everything.

## WaterlooWorks selector verification

Navigation through Co-op Jobs, All Jobs and My Program, saved-posting lookup by job ID, and a
one-page sync were checked against live WaterlooWorks on September 10, 2026. The sync imported
100 postings with no failures. The fixtures in `test/fixtures/waterlooworks/` include synthetic
pages as well as captured markup; passing fixture tests alone does not verify every live flow,
including application submission.

Everything site-specific lives in one file: `src/lib/waterlooworks/selectors.ts`. Each entry has a
primary selector, a list of fallbacks, and a description; `query`/`queryAll` try them in order. The
parsers that consume them are in `scraper.ts`, `applier.ts`, `navigator.ts`, and `pageKind.ts`, and
every one of them is covered by a fixture test.

To fix a breakage:

1. Open the WaterlooWorks page that failed.
2. In the dashboard, use **Save page as fixture** (on the Sync tab, or on the Inspector's
   "Captured HTML" tab). It captures the current page with scripts, styles, form values, email
   addresses, phone-like strings, and your own name stripped, downloads it as
   `<kind>-<timestamp>.html`, and keeps a copy in the database. Content-script errors save the same
   kind of capture automatically, so a failed parse usually already has one waiting in the Inspector.
3. Drop the file into `test/fixtures/waterlooworks/` and reference it from the matching test.
4. Update the selector entry in `selectors.ts` until the test passes.

The Inspector's event log and the `runs` table record what each engine did, which is the fastest way
to see which step failed.

## Layout

```
src/
  entrypoints/      background service worker, WaterlooWorks content script, dashboard page
  components/       React UI: jobs, queue, resume, sync, settings, inspector, shared, ui (shadcn)
  engines/          SyncEngine, ScoringEngine, ResumeEngine, ApplyEngine, EventBus, shared engine contract
  lib/
    db/             Dexie schema, typed repository helpers, export/import
    messaging/      Zod message protocol and typed send/listen wrappers
    waterlooworks/  selectors, scraper, navigator, applier, observer, adapter
    automation/     visible click/select helpers and the Shadow DOM highlighter
    ai/             OpenRouter client, prompt builders, verdict and tailoring schemas, cost estimates
    ranking/        pay parsing, prefilter, profile versioning
    resume/         LaTeX rendering, local bullet selection, grounding check, bank versioning
  stores/           Zustand UI state
  types/            Zod schemas and the types derived from them
test/               vitest suites plus HTML and API fixtures
```

Three constraints shape the design: content scripts cannot reach the extension's IndexedDB, so all
scraped data is messaged out and written by the dashboard; the MV3 service worker dies when idle, so
long runs are orchestrated from the dashboard page and only checkpoints live in the worker; and
WaterlooWorks will change its DOM, so every selector sits in one tested file.

## Conventions

- **No comments in `src/`** outside `src/components/ui/` (shadcn-generated). Names and types carry
  the meaning; `bun run check` fails on any `//` or `/*` elsewhere.
- Strict TypeScript. No `any`, no non-null assertions outside `selectors.ts`.
- Biome for lint and format; run `bun run lint` or let `bun run check` cover it.
- Zod validates at boundaries only: DOM to data, message to handler, model output to data.
- Engines are classes with a lifecycle; everything else is a function.
- Commit after every self-contained change that passes `bun run check`, with a
  `<area>: <what changed>` message, for example `scraper: parse posting requirements`.
