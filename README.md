# Google Maps Review Notice Collector

Tool for systematic collection of publicly visible Google Maps profile metadata to support research on review moderation practices. Detects and records profiles where Google displays a notice that reviews were removed due to defamation complaints ("Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt").

## ⚠️ Disclaimer

**This tool violates Google's Terms of Service.** Intended exclusively for personal non-commercial research, journalistic investigation, and academic study. Do not use for commercial purposes or mass data harvesting. Users are solely responsible for compliance with local laws. The author assumes no liability for misuse.

## Installation

```bash
npm install
npx playwright install chromium
npm run build
```

## Usage

```bash
npm start
```

Prompts for country (DE/AT), postal code or city, place type, and max results. Runs headless by default.

### Optional CLI Flags

```
--resume <dir>        Resume interrupted run from checkpoint
--discovery-only      Phase 1 only (find places, no scraping)
--skip-discovery      Skip Phase 1, use existing checkpoint
--headless            Force headless mode
--max-results <n>     Limit discovery results
--delay-min <s>       Min delay between places (default: 5)
--delay-max <s>       Max delay between places (default: 8)
```

### Analysis Server

```bash
npm run server   # http://localhost:3000
```

Serves a dashboard reading from `output/results.json`. Shows rankings, distribution charts, and worst-case rating model.

### Re-merge Runs

```bash
npm run merge
```

Re-merges all per-run `output/*/results.json` files into the global `output/results.json`.

## How It Works

**Phase 1 — Discovery**
- Searches Google Maps for `{type} {postal/city}`
- Scrolls sidebar, extracts place names, URLs, IDs
- Deduplicates against previous runs
- Saves to `checkpoint.json`

**Phase 2 — Scraping**
- Loads each place page in headless Chromium
- Auto-accepts Google consent
- Clicks the Rezensionen tab
- Extracts rating, review count, defamation notice text
- Parses removed count from notice (range/min/max/exact)
- Saves incrementally; updates `output/results.json` after each place

**Phase 3 — Reporting**
- Writes per-run `results.json`
- Merges into global `output/results.json`

## Output

All output is JSON only.

```
output/
├── results.json                  # Global merged dataset (updated after each place)
└── {postal}_{type}_{timestamp}/
    ├── checkpoint.json           # Resume state
    ├── discovery.json            # Phase 1 results
    └── results.json              # Per-run backup
```

### Place Schema

Every field is always present; `null` when no data.

```json
{
  "id": "0x47aff669026ee2d1",
  "name": "Mois",
  "url": "https://www.google.de/maps/...",
  "status": "success",
  "error": null,
  "readAt": "2026-04-27T15:02:02.224Z",
  "hasDefamationNotice": true,
  "rating": 4.6,
  "totalReviews": 663,
  "removedMin": 51,
  "removedMax": 100,
  "removedText": "51 bis 100 Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt."
}
```

No computed fields (percentages, recalculated ratings) are stored — the dashboard computes these client-side.

## Notice Detection

Detects the German defamation notice by keyword match (`diffamierung` + `beschwerde` + `entfernt` in page text after clicking the reviews tab).

Parses removed count from patterns:
- `"51 bis 100 Bewertungen"` → `removedMin: 51, removedMax: 100`
- `"mehr als 100 Bewertungen"` → `removedMin: 101, removedMax: null`
- `"weniger als 50 Bewertungen"` → `removedMin: null, removedMax: 49`
- `"Eine Bewertung"` → `removedMin: 1, removedMax: 1`

## Resume

```bash
npm start -- --resume output/10115_Restaurant_2026-04-27T12-00-00
```

## CAPTCHA

> **Note:** CAPTCHA handling is untested and only works with `--headless false` (headed mode). In default headless mode, a CAPTCHA will likely cause the place to fail silently.

When detected in headed mode, the scraper pauses and prompts:
- `[Enter]` — retry after manual solve
- `[s]` — skip this place
- `[q]` — quit and save checkpoint

## Debugging

```bash
DEBUG=1 npm start
```

Saves HTML snapshots on errors to `debug/{place_id}.html`.

## Common Issues

**Notices not detected** — Google Maps DOM changes break selectors. Update notice/tab selectors in `src/scraper.ts` and place-link selectors in `src/discovery.ts` using DevTools.

**CAPTCHA loop** — Never tested, but never needed!

## Tech Stack

- Node.js 20+, TypeScript, Playwright
- Headless Chromium with custom user-agent, de-DE locale
- Profile recreated on every run (fresh consent handling)
- `@inquirer/prompts`, `chalk`, `ora`, `zod`, `express`

## Performance

- Discovery: ~100 places/min
- Scraping: ~10 places/min
- Typical run (50 places): ~6 min total

## License

MIT — use at your own risk. For research and journalistic purposes only.

---

**Last tested:** April 2026 · Chromium 124+ · Google Maps DE/AT
