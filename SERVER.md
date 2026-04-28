# Defamation Analysis Server

Local web server to visualize the MERGED analysis results.

## Start Server

```bash
npm run server
```

Then open: http://localhost:3000

## Features

- **Stats Dashboard**: Overview of total places, defamation notices, percentages
- **Suspect Table**: Interactive table of all places with defamation claims
- **Risk Filtering**: Filter by risk level (High >25%, Medium 15-25%)
- **Rating Comparison**: Original vs recalculated ratings based on removed reviews
- **Direct Links**: Click place names to view on Google Maps

## API Endpoints

- `GET /api/stats` - Overall statistics
- `GET /api/suspects` - Places with defamation notices (sorted by risk)
- `GET /api/places` - All places in MERGED dataset

## Data Source

Reads from `output/MERGED/results.json`. Update by running:

```bash
npm run merge:outputs
```

Then refresh browser to see new data.
