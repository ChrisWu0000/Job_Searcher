# WW++ — WaterlooWorks Chrome Extension: Build Plan

Local job database + ranking engine + visible, assisted application runner. WaterlooWorks is the execution layer; the extension owns the data and the workflow.

---

## 0. Stack

| Layer | Choice | Version (verified 2026-09-06) | Why |
| --- | --- | --- | --- |
| Runtime / package manager | Bun | 1.4.1 | Scripts, installs, tests |
| Extension framework | WXT + `@wxt-dev/module-react` | 0.21.4 / 1.2.2 | MV3, typed entrypoints, HMR, generated manifest, Shadow DOM helper |
| UI | React | 19.2.8 | |
| Language | TypeScript | 7.0.2 | strict |
| Styling | Tailwind CSS + `@tailwindcss/vite` | 4.3.3 | CSS-first, no config file |
| Components | shadcn | CLI 4.21.0 | Copy-in components |
| Icons | lucide-react | 1.41.0 | |
| Database | Dexie + dexie-react-hooks | 4.4.5 / 4.4.0 | Typed IndexedDB, `useLiveQuery` for reactive tables |
| Validation | Zod | 4.5.4 | Validate scraped data at the adapter boundary, message payloads, and LLM JSON output |
| AI scoring | OpenRouter API, default model `z-ai/glm-5.3-flash` | $0.075 in / $0.25 out per M tokens, 1.3M ctx | Strict JSON schema output, `reasoning_effort`. Model ID is a setting |
| State | Zustand | 5.0.15 | Transient UI state (filters, selection, runner status); persistent data lives in Dexie |
| Tables | @tanstack/react-table + react-virtual | 9.2.4 / 3.14.10 | Sort/filter 300+ rows without jank |
| Lint / format | Biome | 2.5.12 | |
| Tests | Vitest | 5.0.0 | Parsers tested against saved HTML fixtures |

---

## 1. Architecture

```
┌──────────────────────────────── WW++ extension ────────────────────────────────┐
│                                                                                │
│  Dashboard page (extension origin)     Background service worker (MV3)         │
│  ─────────────────────────────────     ────────────────────────────────        │
│  React app, full tab                   Message router                          │
│  Dexie (IndexedDB) ← owns all data     Tab management (open/focus WW tab)      │
│  SyncEngine / ScoringEngine /          Persists engine checkpoints in          │
│  ApplyEngine + Inspector UI            chrome.storage (SW can be killed)       │
│  ScoringEngine → https://openrouter.ai │                                       │
│           │  ▲                                   │  ▲                          │
│           │  │  chrome.runtime messaging (typed) │  │                          │
│           ▼  │                                   ▼  │                          │
│  Content script on waterlooworks.uwaterloo.ca (page origin, isolated world)    │
│  ─────────────────────────────────────────────────────────────────────────     │
│  WaterlooWorks adapter: selectors / scraper / navigator / applier              │
│  Highlighter overlay (Shadow DOM)                                              │
│  Injected "WW++" pill → opens dashboard                                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Three constraints that shape the design:**

1. **Content scripts cannot reach the extension's IndexedDB.** They run under the WaterlooWorks origin. All scraped data is sent by message to the dashboard/background and written there. The content script is stateless.
2. **The MV3 service worker dies after ~30 s idle.** Long-running work (sync, apply queue) is orchestrated from the dashboard page, which stays alive while open. The background only routes messages, manages tabs, and holds a small resumable checkpoint.
3. **WaterlooWorks will change its DOM.** Every selector lives in one file. Every parser is tested against saved HTML fixtures so a breakage shows up as a red test, not a silent empty import.

---

## 2. Repository layout

```
wpp/
├── package.json                 bun scripts: dev, build, zip, test, lint, check
├── wxt.config.ts                manifest, permissions, host_permissions, Tailwind plugin
├── tsconfig.json
├── biome.json
├── src/
│   ├── entrypoints/
│   │   ├── background.ts                 message router, tab manager, checkpoint store
│   │   ├── waterlooworks.content.tsx     mounts adapter + Shadow DOM overlay on WW
│   │   └── dashboard/
│   │       ├── index.html
│   │       ├── main.tsx
│   │       └── App.tsx                   router: Jobs / Queue / Sync / Inspector / Settings
│   ├── components/
│   │   ├── ui/                           shadcn components (generated)
│   │   ├── jobs/                         JobTable, JobFilters, JobDetail, ScoreBadge
│   │   ├── queue/                        QueuePanel, RunnerStatus, PauseCard
│   │   ├── sync/                         SyncProgress
│   │   ├── inspector/                    generic record/table/JSON viewers (see §8)
│   │   └── settings/                     ProfileEditor, ConstraintList, ApiKeyField, ModelPicker
│   ├── engines/                          stateful, long-lived classes with a clear lifecycle
│   │   ├── SyncEngine.ts                 paginate results → open postings → persist Jobs
│   │   ├── ScoringEngine.ts              queue + concurrency + cache + retries for LLM scoring
│   │   ├── ApplyEngine.ts                apply-queue state machine, checkpoint, pause/resume
│   │   └── EventBus.ts                   typed pub/sub every engine emits progress/log events to
│   ├── lib/                              pure functions and thin clients; no engine logic here
│   │   ├── db/
│   │   │   ├── db.ts                     Dexie instance + versioned schema
│   │   │   └── repo.ts                   typed query helpers
│   │   ├── messaging/
│   │   │   ├── protocol.ts               Zod schemas for every message, both directions
│   │   │   └── client.ts                 typed send/listen wrappers
│   │   ├── waterlooworks/
│   │   │   ├── selectors.ts              THE ONLY FILE WITH CSS SELECTORS
│   │   │   ├── scraper.ts                DOM → JobStub[] / Job / ApplicationRequirements
│   │   │   ├── navigator.ts              open job, next page, back to results
│   │   │   ├── applier.ts                start application, pick documents, read questions
│   │   │   ├── observer.ts               MutationObserver + waitFor helpers
│   │   │   └── adapter.ts                implements WaterlooWorksAdapter interface
│   │   ├── automation/
│   │   │   ├── highlighter.ts            outline + tooltip overlay in Shadow DOM
│   │   │   └── actions.ts                visibleClick, visibleSelect, waitForPageChange
│   │   ├── ai/
│   │   │   ├── openrouter.ts             fetch wrapper: auth, JSON-schema output, retries, usage
│   │   │   ├── prompts.ts                system/user prompt builders (profile, constraints, job)
│   │   │   ├── schemas.ts                Zod + JSON Schema for the scoring verdict
│   │   │   └── cost.ts                   token estimate + cost preview from model pricing
│   │   └── ranking/
│   │       ├── prefilter.ts              zero-cost hard exclusions before any LLM call
│   │       └── profile.ts                profile + constraints → versioned hash
│   ├── stores/                           Zustand: filters, selection, engine UI state
│   ├── types/
│   │   ├── job.ts
│   │   ├── application.ts
│   │   ├── scoring.ts
│   │   └── preferences.ts
│   └── styles/globals.css                @import "tailwindcss"; shadcn theme tokens
├── test/
│   ├── fixtures/waterlooworks/           saved HTML of results page, posting, apply flow
│   ├── fixtures/ai/                      recorded OpenRouter responses for scoring tests
│   ├── scraper.test.ts
│   └── scoring.test.ts
└── PLAN.md
```

---

## 3. Data model

```ts
// types/job.ts
export type JobStatus = "new" | "skipped" | "interested" | "queued" | "applied" | "error";

export interface JobStub {           // from search results row
  id: string;
  company: string;
  title: string;
  location: string;
  deadline?: string;                 // ISO
  openings?: number;
  scrapedAt: string;
}

export interface Job extends JobStub {   // after opening the posting
  arrangement?: "remote" | "hybrid" | "in-person";
  city?: string; region?: string; country?: string;
  durationMonths?: number;
  compensation?: string;
  summary?: string;
  responsibilities?: string;
  qualifications?: string;
  targetedPrograms?: string[];
  application: {
    deadline?: string;
    resume: boolean;
    gradeReport: boolean;
    coverLetter: boolean;
    otherDocuments: string[];
    hasPrescreenQuestions: boolean;
  };
  rawText: string;
  detailScrapedAt?: string;
  status: JobStatus;
  score?: number;                    // denormalized from latest JobScore for sorting
  notes?: string;
}

// types/scoring.ts
export interface Constraint {
  id: string;
  text: string;                      // "must be in Canada or USA", "no WordPress shops"
  kind: "hard" | "soft";
  weight: number;                    // soft only, 1–5
}

export interface Profile {           // single row in `preferences`
  id: "me";
  resumeText: string;                // pasted resume / bio
  reach: string;                     // free text: what you want and how ambitious to be
  constraints: Constraint[];
  payFloors: Record<string, number>; // hourly floor per currency, e.g. { CAD: 60, USD: 50 }
  unknownPay: "llm" | "reject";     // what to do when a posting has no parseable pay
  model: string;                     // OpenRouter model id, default "z-ai/glm-5.3-flash"
  reasoningEffort: "low" | "medium" | "high";
  version: string;                   // hash of the fields above; changes invalidate scores
}

export interface JobScore {          // one row per (jobId, profileVersion)
  id: string;                        // `${jobId}:${profileVersion}`
  jobId: string;
  profileVersion: string;
  score: number;                     // 0–100, model's judgement of "how much I'd want this"
  likelihood: number;                // 0–100, model's estimate of getting an interview
  verdict: "apply" | "maybe" | "skip";
  hardViolations: string[];          // constraint ids that failed
  softNotes: { constraintId: string; satisfied: boolean; note: string }[];
  strengths: string[];
  gaps: string[];
  summary: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
  prompt: string;                    // exact request sent, for the inspector
  rawResponse: string;               // exact response received, for the inspector
  scoredAt: string;
}

export interface Application {
  jobId: string;
  status: "queued" | "in-progress" | "paused" | "submitted" | "failed" | "cancelled";
  packageId?: string;
  answers: Record<string, string>;   // prescreen question → user's answer
  log: { at: string; step: string; ok: boolean; detail?: string }[];
  submittedAt?: string;
}

export interface SavedAnswer {       // reusable deterministic answers
  questionHash: string;
  questionText: string;
  answer: string;
  lastUsedAt: string;
}
```

```ts
// lib/db/db.ts
db.version(1).stores({
  jobs:         "id, company, status, score, deadline, detailScrapedAt",
  jobScores:    "id, jobId, profileVersion, verdict, scoredAt",
  applications: "jobId, status, submittedAt",
  savedAnswers: "questionHash, lastUsedAt",
  runs:         "++id, kind, startedAt",     // sync | score | apply
  events:       "++id, runId, at, level",    // every engine log line, queryable in inspector
  preferences:  "id",                        // single row: Profile
});
```

The OpenRouter API key is **not** in Dexie. It lives in `chrome.storage.local` only (never `sync`), entered on the Settings page, and is the one value excluded from JSON export.
```

---

## 4. Messaging protocol (content ⇄ dashboard/background)

All messages are Zod-validated discriminated unions in `lib/messaging/protocol.ts`.

```
Dashboard → Content (via background, targeted at the WW tab)
  ww:getPageKind            → "results" | "posting" | "apply" | "other"
  ww:scrapeResultsPage      → JobStub[]
  ww:nextResultsPage        → boolean (had next page)
  ww:openJob {id}           → void
  ww:scrapeCurrentJob       → Job
  ww:startApplication {id}  → void
  ww:getApplyState          → { packages, documents, questions, canSubmit }
  ww:selectPackage {id}     → void
  ww:selectDocument {kind,id} → void
  ww:getPrescreenQuestions  → Question[]
  ww:submit                 → void
  ww:highlight {selectorKey, label} → void

Content → Dashboard
  ww:pageChanged {kind, jobId?}
  ww:error {step, message, html?}     html snippet saved for fixture creation
```

Every adapter method resolves only after the expected post-condition is observed in the DOM (via `observer.ts`), never on a fixed timeout alone.

---

## 5. Automation primitives

```ts
// lib/automation/actions.ts
export async function visibleClick(el: HTMLElement, label: string, expect: () => boolean) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  highlighter.show(el, label);          // purple outline + tooltip, Shadow DOM
  await sleep(350);
  el.click();
  await waitFor(expect, { timeout: 10_000 });
  highlighter.hide();
}
```

`ApplyEngine` is an explicit state machine per queued job:

```
idle → opening → reading-requirements → selecting-package → selecting-documents
     → (questions? → PAUSED_FOR_USER) → review → PAUSED_BEFORE_SUBMIT → submitting → done
                                                                          ↘ failed (logged)
```

- Pauses are real: the runner writes `Application.status = "paused"` and waits for a dashboard action.
- Checkpoint (`{queueIds, currentIndex, currentState}`) is mirrored to `chrome.storage.session` so a dashboard reload can resume.
- A "Stop" button always works between steps.
- **v1 never answers a prescreen question automatically.** It shows the question with any `SavedAnswer` as a one-click suggestion.

---

## 6. AI scoring via OpenRouter

**Model.** Default `z-ai/glm-5.3-flash`. The model ID is a text setting with a "test connection" button.

**Inputs the user provides once** (Settings page):
- Resume or bio text.
- A "reach" paragraph in their own words: what they want, how ambitious to be, what a dream job looks like versus an acceptable one.
- A constraint list. Each row is free text plus `hard` or `soft`, and soft rows carry a weight. Hard examples: "Canada or USA only", "4 months only". Soft examples: "prefer backend or infra over frontend" (weight 4), "prefer pay above $30/h" (weight 2).

**Pipeline per job** (`ScoringEngine`):

```
Job + Profile
   │
   ▼
prefilter.ts        zero-cost exclusions: parsed hourly pay below profile.payFloors[currency],
   │                blocked companies, keyword rules; excluded jobs get verdict=skip, no call.
   │                Unparseable pay falls through to the LLM unless unknownPay="reject"
   ▼
prompts.ts          system: role + profile + reach + constraints (stable, first, cache-friendly)
   │                user:   normalized job fields + rawText (truncated to ~6k tokens)
   ▼
openrouter.ts       POST /api/v1/chat/completions
   │                response_format: { type: "json_schema", json_schema: { strict: true, ... } }
   │                reasoning: { effort: profile.reasoningEffort }
   ▼
schemas.ts          Zod-parse the JSON; invalid → one retry with the validation error appended
   │
   ▼
JobScore row        prompt + rawResponse + usage stored verbatim; Job.score denormalized
```

**Verdict schema** (what the model must return):

```ts
{
  score: number,            // 0–100 desire, given reach + soft constraints
  likelihood: number,       // 0–100 interview chance, given resume vs. qualifications
  verdict: "apply" | "maybe" | "skip",
  hardViolations: string[], // constraint ids; any entry forces verdict=skip client-side
  softNotes: { constraintId, satisfied, note }[],
  strengths: string[],
  gaps: string[],
  summary: string           // two sentences max
}
```

The client enforces the invariants (hard violation ⇒ skip ⇒ score clamped to 0) rather than trusting the model to.

**Engine behaviour:**
- Concurrency 6, exponential backoff on 429/5xx, per-job timeout 60 s.
- Cache key is `jobId:profileVersion`. Editing the profile bumps the version and shows "312 jobs need rescoring, est. $0.09" before anything is sent.
- Cost preview from `cost.ts` uses `/api/v1/models` pricing fetched at settings time and cached.
- Scoring is resumable: the run row records which jobIds are done; a reload continues.
- Sort order in the table defaults to `score desc`, with `likelihood` and `verdict` as columns and filters.

**Privacy.** Job text and the user's profile leave the machine and go to OpenRouter and the upstream provider under that provider's retention terms. The Settings page states this in one sentence next to the key field. No key, no scoring; every other feature still works.

---

## 7. Milestones

Each milestone ends with something runnable. Build in order.

### M0 — Scaffold (½ day)
- `git init`, `.gitignore` for `node_modules`, `.output`, `.wxt`; first commit is the empty scaffold.
- `bun create wxt@latest` (react template), add Tailwind v4 via `@tailwindcss/vite`, init shadcn, Biome, Vitest.
- `wxt.config.ts`: host permissions for WaterlooWorks and OpenRouter, `permissions: ["storage", "tabs"]`, action opens dashboard.
- Biome config plus the `no-comments` check script from §11 wired into `bun run check`.
- Dashboard renders "Hello", content script logs on WW. `bun run dev` loads in Chrome with HMR.

### M1 — Recognize WaterlooWorks (1 day)
- `selectors.ts` + `getPageKind()` for results / posting / apply pages.
- Inject "WW++" pill in Shadow DOM; click opens dashboard.
- Save one HTML fixture of each page kind into `test/fixtures/`.

### M2 — Scrape a posting (1–2 days)
- `scraper.scrapeCurrentJob()` → `Job`, Zod-validated.
- Unit tests against fixtures.
- Dashboard "Import this posting" button → row appears in Dexie → visible in a plain table.

### M3 — Scrape search results, all pages (1–2 days)
- `scrapeResultsPage()`, `nextResultsPage()`.
- Sync run: paginate results → stubs → sequentially open each posting → full `Job`. Progress UI with Stop. Skips jobs already detail-scraped unless "force refresh".
- Rate limit: 1 posting per ~1.5 s; runs in the user's own logged-in tab so it looks like a person clicking through.

### M4 — Dashboard v1 (2 days)
- TanStack table: search, sort, column filters (country, arrangement, duration, deadline, docs required, status).
- Job detail drawer with parsed sections + raw text fallback.
- Status buttons: Skip / Interested / Queue. Notes field.
- "Open in WaterlooWorks" → background focuses/creates WW tab and navigates via adapter.

### M4.5 — Inspector (1 day, before M5 so scoring is debuggable from day one)
- See §8. Generic table browser + record viewer over every Dexie table, plus the live event log.

### M5 — AI scoring (2 days)
- Settings page: API key field (masked, stored in `chrome.storage.local`), model picker with "test connection", reasoning effort, resume text, reach text, constraint list editor.
- `openrouter.ts`, `prompts.ts`, `schemas.ts`, `cost.ts`, `prefilter.ts`.
- `ScoringEngine`: queue, concurrency, cache, retries, resumable run, events.
- Table: score, likelihood, verdict columns and filters; job detail shows strengths, gaps, constraint notes, summary, and a link to the full prompt/response in the inspector.
- Tests: prompt builder snapshot; schema validation against recorded good and malformed responses.

### M6 — Assisted apply, single job (3 days)
- `applier.ts` reads apply page state: packages, per-document dropdowns, prescreen questions, submit button.
- `visibleClick` + highlighter.
- Runner for one job: opens, selects default package, stops at questions, stops before submit. User confirms in the dashboard; extension clicks submit; verifies confirmation state; marks `applied`.

### M7 — Apply queue (2 days)
- Multiple jobs, sequential, resumable checkpoint, per-job log, failure isolation (one failure doesn't stop the queue unless the user chooses).
- SavedAnswers suggestions on prescreen questions.

### M8 — Polish and hardening
- Export/import all data as JSON (backup, portability).
- Deadline warnings, "closing in 24h" filter.
- Fixture refresh script: one click in dashboard saves the current WW page HTML (sanitized) as a new fixture when parsing fails.
- Optional: side panel (`chrome.sidePanel`) showing the current posting's score while browsing WW.

**Out of scope for v1:** full auto mode, LLM-answered prescreen questions, any backend or accounts, reverse-engineering WaterlooWorks' internal API.

---

## 8. Inspector: one UI for everything the extension surfaces

Every table, every engine event, every LLM round-trip is viewable without writing a bespoke screen. The inspector is generic over the Dexie schema, so adding a table adds a tab for free.

```
Dashboard nav:  Jobs | Queue | Sync | Inspector | Settings

Inspector
┌─────────────────────────────────────────────────────────────────────────────┐
│ Table: [jobs ▾]   Search: [________]   Rows: 327   [Export JSON] [Refresh]   │
│ id        company   title             status   score  detailScrapedAt   ...  │
│ 384922    Datadog   SWE Intern        queued   96     2026-09-06T14:02  ...  │
│ ...                                                                          │
├────────────────────────────── selected record ──────────────────────────────┤
│ [Fields] [JSON] [Related]                                                    │
│                                                                              │
│ Fields   → key/value grid, long strings collapsed with expand                │
│ JSON     → pretty-printed, copy button                                       │
│ Related  → jobScores for this job, application, events mentioning it         │
│            for a JobScore: the exact prompt and rawResponse side by side      │
└─────────────────────────────────────────────────────────────────────────────┘

Events tab (same page, second view)
│ live tail of `events`, filter by runId / level / engine, click → record view │
```

Components in `components/inspector/`:
- `TableBrowser` — picks a table from `db.tables`, virtualized rows, column auto-derived from the first 50 records, free-text search across stringified rows.
- `RecordView` — Fields / JSON / Related tabs. Related links are declared once in `lib/db/relations.ts` (`jobScores.jobId → jobs.id`, `events.runId → runs.id`, ...).
- `EventLog` — subscribes to `EventBus` and `useLiveQuery(db.events)` so it shows both live and historical lines.
- `PromptViewer` — used inside `RecordView` for JobScore rows; also linked from the Job detail drawer.

The same `RecordView` is reused by the Job detail drawer's "raw" tab and the Queue panel's per-step log, so the "surface all information" requirement is met by one component set, not by five.

## 9. Coding conventions

- **No comments.** Names and types carry the meaning. If something needs explaining, it needs renaming or splitting. Enforced by a script in `bun run check` that fails on `//` or `/*` in `src/` outside of string literals and the license header of shadcn-generated files.
- **DRY at the logic level, not the character level.** One implementation each for: DOM waiting, visible actions, OpenRouter calls, Dexie access patterns, message send/receive, engine progress reporting. Duplicated UI markup is acceptable; duplicated behaviour is not.
- **Engines are classes; everything else is functions.** A class exists only when there is real state with a lifecycle (start, pause, resume, stop, dispose) and events to emit. That is `SyncEngine`, `ScoringEngine`, `ApplyEngine`, `EventBus`. Parsers, prompt builders, scorers' post-processing, and repo helpers are pure functions in `lib/`. React components never call the adapter or OpenRouter directly; they call an engine or a `lib/` function.
- **Shared engine contract** so the UI treats them uniformly:

```ts
interface Engine<TProgress> {
  readonly state: "idle" | "running" | "paused" | "stopped" | "failed";
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  on(event: "progress" | "log" | "state", handler: (p: TProgress | LogEvent | EngineState) => void): () => void;
}
```

  `RunnerStatus` in the UI takes any `Engine` and renders progress, state, and controls once.
- **Validate at boundaries only.** Zod at DOM→data, message→handler, LLM→data. Inside the app, trust the types.
- **One selector file, one prompt file, one schema file.** Anything WaterlooWorks-specific or model-specific is in exactly one place.
- **Biome** for lint and format, strict TypeScript, no `any`, no non-null assertions outside `selectors.ts`.
- **Commit as you go.** `git init` is the first step of M0. Commit after every self-contained change that passes `bun run check`: a new engine, a parser plus its fixture test, a screen, a schema version. Never batch a whole milestone into one commit. Message format is `<area>: <what changed>`, for example `scraper: parse posting requirements`.

## 10. Key `wxt.config.ts` shape

```ts
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "WW++",
    permissions: ["storage", "tabs"],
    host_permissions: [
      "https://waterlooworks.uwaterloo.ca/*",
      "https://openrouter.ai/*",
    ],
    action: { default_title: "Open WW++" },  // background opens dashboard tab on click
  },
});
```

---

## 11. Bun scripts

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "test": "vitest",
    "lint": "biome check .",
    "check": "tsc --noEmit && biome check . && bun scripts/no-comments.ts && vitest run",
    "postinstall": "wxt prepare"
  }
}
```

---

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| WW DOM changes break scraping | Single `selectors.ts`; fixture tests; "save fixture" button; page-kind detection fails loudly in the UI |
| WW rate-limits or logs out during sync | Throttle, detect login page kind, pause and prompt user |
| Service worker killed mid-queue | Orchestrate from dashboard; checkpoint in `chrome.storage.session` |
| Wrong document selected | Runner always shows the selected package/documents and pauses before submit in v1 |
| Prescreen honesty requirement | Never auto-answer; only surface the user's own prior answers as suggestions |
| Extension CSS clashes with WW | All injected UI in Shadow DOM via WXT `createShadowRootUi` |
| Stealth model disappears or is renamed | Model ID is a setting; "test connection" surfaces a 404 immediately; scores keep their `model` field so old results stay interpretable |
| Model returns malformed or inconsistent JSON | Strict JSON schema mode + Zod parse + one retry; client re-derives verdict from hard violations |
| Scoring cost surprises | Cost preview before every run; per-run usage totals in the Inspector's `runs` table |
| API key leaks | `chrome.storage.local` only, excluded from export, masked in Settings, never logged to `events` |

---

## 13. Initial configuration

Seeded into `preferences` on first run; every field is editable in Settings. Constraint text is passed verbatim to the model, so it is written the way the user would say it.

```ts
export const defaultProfile: Profile = {
  id: "me",
  resumeText: "",
  reach: "Software engineering internships at companies that pay well and where the work is interesting. Full stack, backend, infra, and ML are all fine. Big-name and well-funded companies preferred, but a smaller company with strong pay and a real engineering problem is fine too.",
  constraints: [
    { id: "ca-pay",     kind: "hard", weight: 5, text: "Canadian jobs are rejected unless hourly pay is at least the CAD floor" },
    { id: "us-pay",     kind: "hard", weight: 5, text: "US jobs are rejected if hourly pay is below the USD floor" },
    { id: "software",   kind: "hard", weight: 5, text: "Role must be software engineering: full stack, backend, frontend, infra, ML, data engineering, or similar" },
    { id: "no-hw",      kind: "hard", weight: 5, text: "No hardware, mechatronics, embedded, mechanical, or electrical roles" },
    { id: "no-nonswe",  kind: "hard", weight: 5, text: "No research assistant, grad-student, HR, business, marketing, QA-only, or IT support roles" },
    { id: "pay",        kind: "soft", weight: 5, text: "Higher pay is better" },
    { id: "interest",   kind: "soft", weight: 4, text: "Interesting, technically substantive work over routine CRUD or maintenance" },
    { id: "company",    kind: "soft", weight: 3, text: "Prefer well-known or well-funded companies" },
  ],
  payFloors: { CAD: 60, USD: 50 },
  unknownPay: "llm",
  model: "z-ai/glm-5.3-flash",
  reasoningEffort: "medium",
  version: "",
};
```

Behaviour of the pay rules:
- `prefilter.ts` parses hourly pay from the posting. Salary ranges use the top of the range. Annual or monthly figures are converted to hourly assuming 40 h/week. If the parsed value is below the floor for the posting's currency, the job is skipped with `hardViolations: ["ca-pay"]` or `["us-pay"]` and no model call is made.
- If pay is missing or unparseable, the job goes to the model with the floors stated in the system prompt, and the model reports whether it could determine a violation. Setting `unknownPay: "reject"` skips those jobs instead.
- Jobs outside Canada and the US have no pay floor and are judged by the model on the remaining constraints.
- Floors are shown as two number inputs in Settings, one per currency, and editing them bumps `profile.version` so affected jobs rescore.
