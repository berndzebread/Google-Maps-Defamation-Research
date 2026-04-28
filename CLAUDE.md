# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # tsc compile src/ → dist/
npm start       # interactive scraper (prompts country/postal/type)
npm run dev     # build + start in one step
npm run server  # analysis web server at http://localhost:3000
npm run merge   # re-merge all per-run dirs into output/results.json
DEBUG=1 npm start  # verbose: 500ms slowdown, selector logs, HTML snapshots in debug/
```

Resume interrupted run:
```bash
npm start -- --resume output/10115_Restaurant_2026-04-27T...
```

## Architecture

Three-phase pipeline, all state persisted to disk via `checkpoint.json`:

| Phase | Class | File | What it does |
|-------|-------|------|--------------|
| 1 Discovery | `Discovery` | `src/discovery.ts` | Google Maps search → scroll sidebar → extract place list → `discovery.json` |
| 2 Scraping | `Scraper` | `src/scraper.ts` | Load each place page → click Rezensionen tab → detect notice → screenshot → incremental save |
| 3 Reporting | `Reporter` | `src/reporter.ts` | Build `results.csv`, `results.json`, `summary.md` from scraped data |

Supporting modules:
- `src/browser.ts` — `BrowserManager`: persistent Chromium context, window positioning. **Profile at `./browser-profile/` is deleted and recreated on every `npm start`** (intentional; comment out `rmSync` to preserve across runs).
- `src/parsers.ts` — `parseDefamationNotice` / `containsDefamationNotice`: German-language regex patterns for notice text and removed-count extraction (range, min, max, exact, single).
- `src/captcha.ts` — `CaptchaHandler`: auto-detects CAPTCHA, brings window to front, offers [Enter]/[s]/[q] keyboard handoff.
- `src/overlay.ts` — `injectOverlay`: in-page status overlay injected via `page.evaluate`.
- `src/dedupe-scraper.ts` — `DedupeHelper`: skips places already scraped in previous runs.
- `src/types.ts` — Zod schemas: `Config`, `Place`, `DiscoveryResult`, `ScrapingResult`.
- `src/cli.ts` — Entry point: parses `--resume`, `--discovery-only`, `--skip-discovery`, `--headless`, `--delay-min`, `--delay-max`, `--max-results`.
- `server.js` — Express server; reads `output/results.json`; API at `/api/stats`, `/api/suspects`, `/api/places`; static files from `public/`. Reads fresh from disk on every request.

## Output Layout

```
output/
├── results.json                     # Global merged file — single source of truth
└── {postal}_{type}_{timestamp}/
    ├── discovery.json               # Phase 1 results
    ├── checkpoint.json              # Resume state
    ├── results.json                 # Per-run backup
    ├── results.csv                  # UTF-8 BOM for Excel
    └── summary.md
```

`Reporter.mergeIntoGlobal()` auto-dedupes by place `id` (newer run wins) into `output/results.json` after every completed run. No manual merge needed.

## Selector Fragility

Google Maps DOM changes break the scraper. When notice detection fails:
1. Inspect the live place page in DevTools
2. Update notice selectors in `src/scraper.ts`
3. Update place-link / sidebar selectors in `src/discovery.ts`
4. Validate with `npm run test:quick`

## Place Schema (scraped fields only, no computed values)

```
id, name, url, status, error, readAt, hasDefamationNotice,
rating, totalReviews, removedMin, removedMax, removedText
```

All fields always present; null when no data. `recalculatedRating`, `removedPctMin/Max`, etc. are computed client-side in `public/index.html`.

## Key Behaviour Notes

- Browser locale `de-DE`, timezone `Europe/Berlin` — required for German notice text to appear.
- Scraping delays default 15-45s randomized; auto-long-pause every ~20 places.
- Place ID extracted from URL hex pattern `0x[a-f0-9]+`.
- Server "suspect" threshold is >15% removed.
- `DEBUG=1` saves HTML snapshots on errors to `debug/{place_id}.html`.
