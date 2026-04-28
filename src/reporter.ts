import { Place, Config } from './types.js';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const GLOBAL_RESULTS = join('output', 'results.json');

export function mergeIntoGlobal(places: Place[]): void {
  let existing: Place[] = [];
  try {
    const raw = JSON.parse(readFileSync(GLOBAL_RESULTS, 'utf-8'));
    existing = raw.places || [];
  } catch {
    // File doesn't exist yet
  }

  const map = new Map<string, Place>();
  for (const p of existing) map.set(p.id, p);
  for (const p of places) map.set(p.id, p);

  const merged = Array.from(map.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  mkdirSync('output', { recursive: true });
  writeFileSync(GLOBAL_RESULTS, JSON.stringify({ timestamp: new Date().toISOString(), places: merged }, null, 2));
}

export class Reporter {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    mkdirSync(outputDir, { recursive: true });
  }

  async generateReports(config: Config, places: Place[]): Promise<void> {
    const withNotice = places.filter((p) => p.hasDefamationNotice).length;
    console.log('\n' + chalk.bold.cyan('📊 Generating Reports'));

    writeFileSync(
      join(this.outputDir, 'results.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), config, places }, null, 2)
    );
    console.log(chalk.green(`  ✓ results.json (${places.length} places, ${withNotice} with notice)`));

    mergeIntoGlobal(places);
    console.log(chalk.green(`  ✓ output/results.json (global merged)`));
  }
}
