# JobScope architecture

JobScope is a local-first browser extension that imports listings from a curated set of public job
feeds and ATS boards, stores them in IndexedDB, and provides category filtering, optional model
scoring, and resume tailoring.

## Data flow

1. `ExternalSyncEngine` fetches the configured public JSON feeds.
2. Feed records are normalized and filtered to software engineering, data science, cyber security,
   hardware engineering, and fintech categories.
3. Supported ATS company boards are discovered from HTTPS job links in feed entries and refreshed
   through their public listings APIs.
4. Jobs are canonicalized, deduplicated, and persisted through the database repository. Existing
   user status, notes, and scores are preserved during re-import.
5. The scoring engine applies local eligibility filters before sending eligible postings to the
   configured OpenRouter model.

Source failures are logged per feed or board; they do not prevent successful sources from being
imported. The set is best-effort and does not cover private, unresolved, markdown-only, or
credential-required sources. JobScope does not scrape arbitrary pages or submit applications.

## Extension components

- `src/entrypoints/background.ts` opens or focuses the dashboard.
- `src/components/sync/SourceSyncPage.tsx` starts and monitors external source sync runs.
- `src/lib/sources/` normalizes the public feeds and supported ATS APIs.
- `src/lib/ranking/categories.ts` classifies jobs across the five target categories.
- `src/lib/db/` owns the versioned Dexie database and JSON backup/import paths.
- `src/engines/` contains the sync, scoring, and resume engine lifecycles.

Legacy application and captured-HTML stores remain in the database schema so existing user data
continues to survive upgrades and exports. Their WaterlooWorks capture and application automation
are no longer active.

## Development and validation

Use Bun with the scripts in `package.json`:

```sh
bun run dev
bun run check
bun run build
bun run zip
```

`bun run check` runs TypeScript, Biome, the source comment policy, and Vitest. Source normalization,
ATS discovery, sync behavior, category classification, and profile migration are covered by tests.
