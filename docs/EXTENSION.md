# JobScope

JobScope is a local-first Chrome extension for collecting, filtering, scoring, and organizing
software engineering, data science, cyber security, hardware engineering, and fintech jobs.

- **Sync** imports active listings from public job-list JSON feeds, then discovers and refreshes
  supported company job boards linked by those listings.
- **Jobs** deduplicates postings, classifies them into the five target categories, and lets you
  filter, export, mark interested, or open the original posting.
- **Score** ranks eligible listings against your profile using OpenRouter. Local pay and role
  filters run before any model request.
- **Resume** maintains an experience bank and LaTeX templates, and can tailor a resume locally or
  with a model.
- **Inspector** displays the local job database, sync and scoring events, and model requests.

There is no JobScope backend or account. Job data is stored in IndexedDB in your browser.

## Sources and coverage

JobScope currently reads public structured listing feeds from SimplifyJobs, zshah101, and aprameyak.
It discovers supported boards from HTTPS job links in those feeds and uses public listings
APIs for Ashby, Greenhouse, Lever, SmartRecruiters, Workable, Pinpoint, Gem, and Workday.

This is a curated, best-effort source set, not a complete scraper for every website in a report or a
registry of every ATS tenant. Private, markdown-only, unresolved, or credential-required sources are
not polled. Sync reports source failures in the run log; individual source failures do not discard
successful imports. JobScope does not log in to job boards, scrape arbitrary websites, or submit
applications.

## Requirements and setup

- [Bun](https://bun.sh) 1.4.1 or newer
- Google Chrome or another Chromium browser with Manifest V3 support

```sh
bun install
bun run dev
bun run build
bun run check
bun run zip
```

To load a production build manually, run `bun run build`, open `chrome://extensions`, enable
**Developer mode**, and choose **Load unpacked** with `.output/chrome-mv3`.

The toolbar button opens the JobScope dashboard. On the **Sync** page, choose **Start source sync**
to fetch the public feeds and refresh the discovered supported boards.

## Profile and filtering

The default profile targets the five categories above, requires explicit pay, and uses CAD 60/hour
and USD 50/hour pay floors. Edit the resume, goals, constraints, and floors under **Settings →
Profile**. Existing customized goals are preserved during database upgrades.

The **Term** filter splits listings into **Winter 2027** and **Summer 2027**, like the
SimplifyJobs Summer2027-Internships lists. Feed entries use their `terms` field (entries with only
other seasons are dropped); other listings are matched from the title and description. Listings with
no detectable term stay visible when no term is selected, and a Term column is added to the table and
CSV export.

The **Job category** filter supports multiple selections. Listings are classified from their titles,
companies, tags, and available description text; a listing can match more than one category. The
dashboard also supports country, arrangement, duration, deadline, status, score, and likelihood
filters. Automatically filtered listings remain stored and can be reviewed in the Jobs view.

Set an [OpenRouter](https://openrouter.ai) API key under **Settings** to use model scoring and model
resume tailoring. Local ranking filters and local resume tailoring do not require an API key.

## Resume PDFs

The saved resume library reads `public/resumes/manifest.json` and matching `<stem>.pdf`,
`<stem>.tex`, and `previews/<stem>.png` files. Each manifest row contains `jobId`, `company`,
`title`, `stem`, and `tailoringNote`. Files are packaged locally by `bun run build`; personal resume
artifacts in `public/resumes/` are excluded from Git. Missing files produce an explicit empty/error
view.

The Tailored tab has an independent experience-bank and LaTeX editing workflow. PDF compilation
happens in Overleaf or a local TeX installation.

## Privacy and existing data

Listings, profile data, scores, and resume content stay in browser storage unless you choose to send
job/profile/resume content to OpenRouter for model scoring or tailoring. The API key is stored in
`chrome.storage.local`, not in the database export. Opening a tailored resume in Overleaf sends only
the LaTeX content you choose to open.

Use **Settings → Data** to export/import a JSON backup or delete local records. Existing records from
older versions—including application history and captured HTML—remain in the database and backups,
but JobScope no longer captures WaterlooWorks pages or provides application queue/submission
automation.

## Development

```
src/
  entrypoints/      extension background and dashboard
  components/       jobs, resume, source sync, settings, inspector, shared UI
  engines/          external sync, scoring, resume, shared engine lifecycle
  lib/
    ai/             OpenRouter client, prompts, validation, cost estimates
    db/             Dexie schema, typed repository, import/export
    messaging/      typed dashboard/background protocol
    ranking/        category classification, pay parsing, profile and prefilter
    resume/         LaTeX rendering, local selection, grounding checks
    sources/        public feed and ATS-board normalization
  stores/           transient dashboard state
  types/            Zod schemas and derived types
test/               Vitest suites and API fixtures
```

Run `bun run check` for TypeScript, Biome, comment-policy, and test validation. `bun run build`
produces the production extension in `.output/chrome-mv3`.
