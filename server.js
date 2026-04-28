#!/usr/bin/env node

import express from 'express';
import { readFileSync } from 'fs';
import chalk from 'chalk';

const app = express();
const PORT = 3000;
const DATA_PATH = './output/results.json';

function loadData() {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  } catch (e) {
    console.error(chalk.red(`Error loading ${DATA_PATH}: ${e.message}`));
    return null;
  }
}

app.get('/api/stats', (req, res) => {
  const data = loadData();
  if (!data) return res.status(500).json({ error: 'No data' });

  const places = data.places || [];
  const withNotice = places.filter((p) => p.hasDefamationNotice).length;
  const enriched = places
    .filter((p) => p.hasDefamationNotice && p.removedMin !== null && p.removedMax !== null && p.totalReviews)
    .map((p) => {
      const avg = (p.removedMin + p.removedMax) / 2;
      return avg;
    });
  const avgRemoved = enriched.length ? (enriched.reduce((a, v) => a + v, 0) / places.length).toFixed(1) : '0';

  res.json({
    totalPlaces: places.length,
    placesWithNotice: withNotice,
    percentageWithNotice: places.length ? ((withNotice / places.length) * 100).toFixed(1) : '0.0',
    avgRemoved,
  });
});

app.get('/api/suspects', (req, res) => {
  const data = loadData();
  if (!data) return res.status(500).json({ error: 'No data' });

  const suspects = (data.places || [])
    .filter((p) => p.hasDefamationNotice && p.removedMin !== null && p.removedMax !== null && p.totalReviews)
    .map((p) => {
      const avg = (p.removedMin + p.removedMax) / 2;
      const total = p.totalReviews + avg;
      const pct = total > 0 ? (avg / total) * 100 : 0;
      return { ...p, percentage: pct };
    })
    .filter((p) => p.percentage > 15)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 50);

  res.json(suspects);
});

app.get('/api/places', (req, res) => {
  const data = loadData();
  if (!data) return res.status(500).json({ error: 'No data' });
  res.json(data.places || []);
});

app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(chalk.bold.cyan(`\n🌐 Server running at http://localhost:${PORT}`));
  console.log(chalk.gray(`Serving data from: ${DATA_PATH}\n`));
});
