#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Place } from './types.js';

interface ResultsFile {
  timestamp: string;
  config: any;
  totalPlaces: number;
  placesWithNotice: number;
  places: Place[];
}

export class DedupeHelper {
  private knownPlaces: Map<string, Place> = new Map();
  private mergedPath = './output/results.json';

  loadKnownPlaces(): void {
    if (existsSync(this.mergedPath)) {
      try {
        const data: ResultsFile = JSON.parse(
          readFileSync(this.mergedPath, 'utf-8')
        );
        for (const place of data.places) {
          this.knownPlaces.set(place.id, place);
        }
        console.log(`📚 Loaded ${this.knownPlaces.size} known places from global results`);
      } catch (e) {
        console.warn(`⚠ Could not load global results: ${(e as Error).message}`);
      }
    } else {
      console.log(`ℹ No global results found yet (${this.mergedPath})`);
    }
  }

  isKnown(placeId: string): boolean {
    return this.knownPlaces.has(placeId);
  }

  getKnown(placeId: string): Place | undefined {
    return this.knownPlaces.get(placeId);
  }

  getKnownCount(): number {
    return this.knownPlaces.size;
  }
}
