#!/usr/bin/env node

import { select, input, confirm } from '@inquirer/prompts';
import { Config, CountrySchema, PlaceTypeSchema, ConfigSchema } from './types.js';
import { Discovery } from './discovery.js';
import { Scraper } from './scraper.js';
import { Reporter } from './reporter.js';
import { DedupeHelper } from './dedupe-scraper.js';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ora from 'ora';

const PLACE_TYPES = [
  'Restaurant',
  'Café',
  'Bar',
  'Arzt',
  'Zahnarzt',
  'Anwalt',
  'Friseur',
  'Hotel',
  'Apotheke',
  'Werkstatt',
  'Shop',
  'Custom',
];

async function getConfig(): Promise<Config> {
  console.log(chalk.bold.cyan('\n🗺️  Google Maps Defamation Notice Scraper\n'));

  const country = await select({
    message: 'Land:',
    choices: [
      { name: 'Deutschland (DE)', value: 'DE' },
      { name: 'Österreich (AT)', value: 'AT' },
    ],
  });

  const postalCode = await input({
    message:
      country === 'DE'
        ? 'Postleitzahl oder Stadt:'
        : 'Postleitzahl oder Stadt:',
    validate: (val) => {
      return val.length > 0 || 'Eingabe erforderlich';
    },
  });

  let placeType = await select({
    message: 'Ortstyp:',
    choices: PLACE_TYPES.map((t) => ({
      name: t,
      value: t,
    })),
  });

  let customType: string | undefined;
  if (placeType === 'Custom') {
    customType = await input({
      message: 'Benutzerdefinierter Typ:',
    });
  }

  const maxResults = await input({
    message: 'Max Ergebnisse (leer = alle):',
    default: '300',
  });

  const headless = await confirm({
    message: 'Headless-Modus?',
    default: true,
  });

  const config: Config = {
    country: CountrySchema.parse(country),
    postalCode,
    placeType: PlaceTypeSchema.parse(placeType),
    customType: customType || undefined,
    headless,
    discoveryOnly: false,
    delayMin: 5,
    delayMax: 8,
    windowPos: 'right-top',
    windowSize: '800x900',
    pinWindow: false,
    noOverlay: false,
    noNotify: false,
    noSound: false,
    maxResults: maxResults ? parseInt(maxResults, 10) : undefined,
  };

  return config;
}

function getOutputDir(config: Config): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const typeStr =
    config.placeType === 'Custom' ? config.customType : config.placeType;
  const dirname = `output/${config.postalCode}_${typeStr}_${timestamp}`;
  return dirname;
}

function saveCheckpoint(dir: string, data: any): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'checkpoint.json'), JSON.stringify(data, null, 2));
}

function loadCheckpoint(dir: string): any {
  try {
    return JSON.parse(readFileSync(join(dir, 'checkpoint.json'), 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let config: Config;
    let outputDir: string;

    // Parse CLI flags
    const parseFlag = (flag: string): string | null => {
      const idx = args.indexOf(flag);
      return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
    };

    if (args.includes('--resume')) {
      const idx = args.indexOf('--resume');
      outputDir = args[idx + 1];

      if (!existsSync(outputDir)) {
        console.error(chalk.red(`Output directory not found: ${outputDir}`));
        process.exit(1);
      }

      const checkpoint = loadCheckpoint(outputDir);
      if (!checkpoint) {
        console.error(chalk.red('No checkpoint found in output directory'));
        process.exit(1);
      }

      config = checkpoint.config;
      console.log(chalk.cyan(`Resuming from ${outputDir}`));
    } else {
      config = await getConfig();
      outputDir = getOutputDir(config);

      // Override config with CLI flags
      const delayMin = parseFlag('--delay-min');
      const delayMax = parseFlag('--delay-max');
      const maxResults = parseFlag('--max-results');
      const headless = args.includes('--headless');

      if (delayMin) config.delayMin = parseInt(delayMin, 10);
      if (delayMax) config.delayMax = parseInt(delayMax, 10);
      if (maxResults) config.maxResults = parseInt(maxResults, 10);
      if (headless) config.headless = true;

      console.log(
        chalk.gray(
          `Delays: ${config.delayMin}-${config.delayMax}s, Max: ${config.maxResults || 'all'}`
        )
      );
    }

    // Phase 1: Discovery
    if (!args.includes('--skip-discovery')) {
      const dedupe = new DedupeHelper();
      dedupe.loadKnownPlaces();

      const discovery = new Discovery(config, dedupe);
      await discovery.init();

      const places = await discovery.discoverPlaces(
        config.country,
        config.postalCode,
        config.placeType === 'Custom' ? config.customType! : config.placeType,
        config.maxResults
      );

      console.log(chalk.cyan(`\n🔄 Skipped ${dedupe.getKnownCount()} known places from previous runs`));

      saveCheckpoint(outputDir, { phase: 'discovery', config, places });
      await discovery.close();

      if (args.includes('--discovery-only')) {
        console.log(chalk.green('\n✓ Discovery complete'));
        return;
      }
    } else {
      const checkpoint = loadCheckpoint(outputDir);
      if (!checkpoint) {
        console.error(chalk.red('No checkpoint found'));
        process.exit(1);
      }
    }

    // Phase 2: Scraping
    const scraper = new Scraper(config, outputDir);
    await scraper.init();

    const checkpoint = loadCheckpoint(outputDir);
    const places = checkpoint.places;

    const results = await scraper.scrapePlaces(places);
    saveCheckpoint(outputDir, { phase: 'scraping', config, places: results });
    await scraper.close();

    // Phase 3: Reporting
    const reporter = new Reporter(outputDir);
    await reporter.generateReports(config, results);

    console.log(chalk.green.bold(`\n✓ All phases complete. Results in ${outputDir}`));
  } catch (error) {
    console.error(
      chalk.red('Error:'),
      (error as Error).message
    );
    process.exit(1);
  }
}

main();
