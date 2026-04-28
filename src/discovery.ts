import { Page } from 'playwright';
import { BrowserManager } from './browser.js';
import { Config, Place } from './types.js';
import { DedupeHelper } from './dedupe-scraper.js';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export class Discovery {
  private browserManager: BrowserManager;
  private dedupeHelper: DedupeHelper;

  constructor(config: Config, dedupeHelper?: DedupeHelper) {
    this.browserManager = new BrowserManager(config);
    this.dedupeHelper = dedupeHelper || new DedupeHelper();
  }

  async init(): Promise<void> {
    await this.browserManager.init();
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  async discoverPlaces(
    country: string,
    postalCode: string,
    placeType: string,
    maxResults?: number
  ): Promise<Place[]> {
    const page = await this.browserManager.getPage();
    const places: Place[] = [];
    const seenIds = new Set<string>();

    const domainMap: Record<string, string> = {
      DE: 'google.de',
      AT: 'google.at',
    };

    const domain = domainMap[country] || 'google.de';
    const searchQuery = encodeURIComponent(`${placeType} ${postalCode}`);
    const searchUrl = `https://${domain}/maps/search/${searchQuery}`;

    console.log(chalk.cyan(`🔍 Discovery: ${placeType} in ${postalCode}`));
    const spinner = ora('Loading search results...').start();

    try {
      spinner.text = `Loading ${searchUrl}...`;

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (error) {
        spinner.warn(`Page load took too long or failed: ${(error as Error).message}`);
      }

      // Auto-accept Google consent (headless / fresh profile)
      if (page.url().toString().includes('consent.google.com')) {
        try {
          await page
            .locator('button')
            .filter({ hasText: /alle akzeptieren|alles akzeptieren|accept all/i })
            .first()
            .click({ timeout: 5000 });
          await page.waitForURL((url) => !url.toString().includes('consent.google.com'), { timeout: 10000 });
          spinner.text = '✓ Consent accepted, loading results...';
        } catch {
          spinner.warn('Consent page detected but could not auto-accept — check browser');
        }
      }

      spinner.text = 'Scrolling results list...';

      await this.scrollAndCollect(page, places, seenIds, maxResults, spinner);

      spinner.succeed(`Found ${places.length} unique places`);
    } catch (error) {
      spinner.fail(`Discovery error: ${(error as Error).message}`);
      throw error;
    }

    return places;
  }

  private async scrollAndCollect(
    page: Page,
    places: Place[],
    seenIds: Set<string>,
    maxResults?: number,
    spinner?: Ora
  ): Promise<void> {
    let scrollCount = 0;
    const maxScrolls = Math.max(150, (maxResults || 300) / 2);

    // Wait for feed element to appear (max 5 seconds)
    try {
      await page.locator('[role="feed"]').first().waitFor({ timeout: 5000 });
    } catch (error) {
      console.warn('Feed element not found after 5s, may be mobile layout or API limit');
    }

    while (scrollCount < maxScrolls) {
      // Extract visible results with multiple selector fallbacks
      const results = await page.evaluate(() => {
        const items: Array<{ name: string; url: string; id: string }> = [];

        // Method 1: Look for place links directly
        const placeLinks = document.querySelectorAll('a[href*="/maps/place/"]') as NodeListOf<HTMLAnchorElement>;
        const seenIds = new Set<string>();

        placeLinks.forEach((link) => {
          const href = link.getAttribute('href') || '';
          const idMatch = href.match(/0x[a-f0-9]+/i);
          const id = idMatch ? idMatch[0] : '';
          const name = link.getAttribute('aria-label') || link.textContent || '';

          if (id && name && !seenIds.has(id)) {
            seenIds.add(id);
            // href might be absolute or relative
            const url = href.startsWith('http') ? href : 'https://maps.google.de' + href;
            items.push({
              id,
              name: name.trim().substring(0, 100),
              url,
            });
          }
        });

        return items;
      });

      // Add new results
      for (const result of results) {
        if (!seenIds.has(result.id) && !this.dedupeHelper.isKnown(result.id) && (!maxResults || places.length < maxResults)) {
          seenIds.add(result.id);
          places.push({
            id: result.id,
            name: result.name,
            url: result.url,
            status: 'success',
            error: null,
            readAt: null,
            hasDefamationNotice: false,
            rating: null,
            totalReviews: null,
            removedMin: null,
            removedMax: null,
            removedText: null,
          });
        }
      }
      if (spinner) {
        const limit = maxResults ? `/${maxResults}` : '';
        spinner.text = `Scrolling... ${places.length}${limit} places found`;
      }

      // Check for end marker
      const hasEndMarker = await page.evaluate(() => {
        const text = document.body.innerText;
        return /ende.*liste|end.*list/i.test(text);
      });

      if (hasEndMarker) {
        console.log('  End marker detected, stopping scroll');
        break;
      }

      if (maxResults && places.length >= maxResults) {
        console.log(`  Reached max results (${places.length})`);
        break;
      }

      // Stop if we found no new results this round
      if (results.length === 0 && scrollCount > 2) {
        console.log('  No new results, stopping');
        break;
      }

      // Scroll
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) {
          feed.scrollTop += 500;
        }
      });

      await page.waitForTimeout(1000);
      scrollCount++;
    }
  }
}
