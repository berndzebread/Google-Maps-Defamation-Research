#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Place } from './types.js';
import chalk from 'chalk';

function mergeOutputs(outputBaseDir: string = './output'): void {
  console.log(chalk.bold.cyan(`\n🔀 Merging all outputs from ${outputBaseDir}\n`));

  const allPlaces = new Map<string, Place>();
  const dirs = readdirSync(outputBaseDir)
    .filter((d) => {
      try {
        return readdirSync(join(outputBaseDir, d)).includes('results.json');
      } catch { return false; }
    })
    .sort();

  console.log(chalk.gray(`Found ${dirs.length} output directories\n`));

  for (const dir of dirs) {
    const resultsPath = join(outputBaseDir, dir, 'results.json');
    try {
      const data = JSON.parse(readFileSync(resultsPath, 'utf-8'));
      const places: Place[] = data.places || [];
      const withNotice = places.filter((p) => p.hasDefamationNotice).length;
      console.log(chalk.cyan(`  ${dir}: ${places.length} places, ${withNotice} with notice`));
      for (const place of places) allPlaces.set(place.id, place);
    } catch (e) {
      console.log(chalk.red(`  ✗ ${dir}: ${(e as Error).message}`));
    }
  }

  const merged = Array.from(allPlaces.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const withNotice = merged.filter((p) => p.hasDefamationNotice).length;

  mkdirSync(outputBaseDir, { recursive: true });
  const outPath = join(outputBaseDir, 'results.json');
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), places: merged }, null, 2));

  console.log(chalk.green(`\n✓ ${merged.length} unique places, ${withNotice} with notice → ${outPath}`));
}

mergeOutputs(process.argv[2] || './output');
