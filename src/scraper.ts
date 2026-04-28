import { Page } from 'playwright';
import { BrowserManager } from './browser.js';
import { Config, Place } from './types.js';
import { parseDefamationNotice, containsDefamationNotice } from './parsers.js';
import { CaptchaHandler } from './captcha.js';
import { injectOverlay } from './overlay.js';
import { mergeIntoGlobal } from './reporter.js';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync } from 'fs';
import { join } from 'path';

export class Scraper {
  private browserManager: BrowserManager;
  private captchaHandler: CaptchaHandler;
  private outputDir: string;
  private config: Config;

  constructor(config: Config, outputDir: string) {
    this.config = config;
    this.browserManager = new BrowserManager(config);
    this.captchaHandler = new CaptchaHandler();
    this.outputDir = outputDir;
    mkdirSync(outputDir, { recursive: true });
  }

  async init(): Promise<void> {
    await this.browserManager.init();
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  async scrapePlace(placeUrl: string, placeName: string): Promise<Place> {
    const page = await this.browserManager.getPage();
    const result: Place = {
      id: '',
      name: placeName,
      url: placeUrl,
      status: 'success',
      error: null,
      readAt: new Date(),
      hasDefamationNotice: false,
      rating: null,
      totalReviews: null,
      removedMin: null,
      removedMax: null,
      removedText: null,
    };
    const startTime = Date.now();

    try {
      // Extract place ID from URL
      const idMatch = placeUrl.match(/0x[a-f0-9]+/i);
      result.id = idMatch ? idMatch[0] : 'unknown';

      // Navigate to page
      const spinner = ora(`Loading ${placeName}...`).start();
      await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      spinner.succeed(`Loaded ${placeName}`);

      // Auto-accept Google consent (profile wiped every run → consent appears every time)
      if (page.url().toString().includes('consent.google.com')) {
        try {
          await page
            .locator('button')
            .filter({ hasText: /alle akzeptieren|alles akzeptieren|accept all/i })
            .first()
            .click({ timeout: 5000 });
          await page.waitForURL((url) => !url.toString().includes('consent.google.com'), { timeout: 10000 });
          console.log('  ✓ Consent accepted');
        } catch {
          console.log('  ⚠ Consent page detected but could not auto-accept');
        }
      }

      // Quick settle
      await page.waitForTimeout(1000);

      const afterPageLoad = Date.now();
      console.log(`  [${afterPageLoad - startTime}ms] Page loaded`);

      // Click reviews tab - critical for defamation notice visibility
      const beforeTabClick = Date.now();
      try {
        // Wait for actual buttons inside tablist (not just the container)
        await page.locator('[role="tablist"] button, [role="tablist"] [role="tab"]').first().waitFor({ timeout: 5000 });

        // Use page.evaluate: checks textContent + aria-label, more reliable in headless
        const tabResult = await page.evaluate(() => {
          const tablist = document.querySelector('[role="tablist"]');
          if (!tablist) return 'no-tablist';
          const buttons = Array.from(tablist.querySelectorAll('button, [role="tab"]'));
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (/rezensionen|reviews|bewertungen/.test(text) || /rezensionen|reviews/.test(label)) {
              (btn as HTMLElement).click();
              return 'named';
            }
          }
          if (buttons.length > 1) {
            (buttons[1] as HTMLElement).click();
            return 'fallback';
          }
          return 'none';
        });

        await page.waitForTimeout(1500);
        console.log(`  [${Date.now() - beforeTabClick}ms] Tab clicked (${tabResult})`);
      } catch {
        // No tablist or tab not found
      }

      // Get total reviews count - ONLY look for "Berichte" (after tab click)
      const reviewsData = await page.evaluate(() => {
        const pageText = document.body.innerText;

        // Match "X Berichte" or "X.XXX Berichte" (German format with period as thousands separator)
        const match = pageText.match(/(\d+(?:\.\d{3})*)\s+Berichte/);

        if (match) {
          // Remove periods (German thousands separator) and convert to number
          const numStr = match[1].replace(/\./g, '');
          const count = parseInt(numStr, 10);
          if (count > 0) {
            return { count, source: 'berichte' };
          }
        }

        return null;
      });

      if (reviewsData) {
        result.totalReviews = reviewsData.count;
      }

      // Extract rating
      const ratingData = await page.evaluate(() => {
        const text = document.body.innerText;
        // Look for rating patterns - try with "Stern" first, then just decimal number
        let match = text.match(/(\d+[.,]\d+)\s*Stern/i);
        if (!match) {
          // Try without Stern keyword - look for a decimal number at start of content
          const lines = text.split('\n');
          for (const line of lines.slice(0, 30)) {
            const m = line.match(/^(\d+[.,]\d+)$/);
            if (m) {
              match = [m[0], m[1]];
              break;
            }
          }
        }
        if (match) {
          const numStr = match[1].replace(',', '.');
          return parseFloat(numStr);
        }
        return undefined;
      });

      result.rating = ratingData ?? null;

      console.log(
        `  Total reviews: ${result.totalReviews || 'N/A'} (source: ${reviewsData?.source || 'unknown'}), Rating: ${result.rating || 'N/A'}`
      );

      // Check for defamation notice - look for key indicators
      const beforeNoticeCheck = Date.now();
      const noticeCheck = await page.evaluate(() => {
        const bodyText = document.body.innerText;

        // Just check if all key terms exist (simpler, more robust)
        const hasDiffamierung = /diffamierung/i.test(bodyText);
        const hasBeschwerden = /beschwerde/i.test(bodyText);
        const hasEntfernt = /entfernt/i.test(bodyText);

        // Combined check: if all three keywords exist, it's likely a defamation notice
        const matches = hasDiffamierung && hasBeschwerden && hasEntfernt;

        return {
          hasDiffamierung,
          hasBeschwerden,
          hasEntfernt,
          matches,
          bodyText,
        };
      });

      const afterNoticeCheck = Date.now();
      console.log(
        `  [${afterNoticeCheck - beforeNoticeCheck}ms] Notice check: diffamierung=${noticeCheck.hasDiffamierung}, beschwerde=${noticeCheck.hasBeschwerden}, entfernt=${noticeCheck.hasEntfernt}, matches=${noticeCheck.matches}`
      );

      if (noticeCheck.matches) {
        result.hasDefamationNotice = true;

        // Extract notice text from already-captured bodyText (no extra page call)
        let fullNoticeText = '';
        for (const line of noticeCheck.bodyText.split('\n')) {
          const lower = line.toLowerCase();
          if (lower.includes('diffamierung') && lower.includes('beschwerde') && lower.includes('entfernt')) {
            fullNoticeText = line.trim();
            break;
          }
        }

        if (fullNoticeText) {
          result.removedText = fullNoticeText;

          const parsed = parseDefamationNotice(fullNoticeText);
          result.removedMin = parsed.min;
          result.removedMax = parsed.max;

          console.log(
            chalk.yellow(
              `  ✓ NOTICE: ${fullNoticeText.substring(0, 50)}... [${parsed.min}-${parsed.max}]`
            )
          );
        }

        // Skip screenshot to speed up (causes 20+ second delays)
        // try {
        //   const screenshotPath = join(
        //     this.outputDir,
        //     'screenshots',
        //     `${result.id}.png`
        //   );
        //   mkdirSync(join(this.outputDir, 'screenshots'), {
        //     recursive: true,
        //   });
        //   await page.screenshot({
        //     path: screenshotPath,
        //     fullPage: false,
        //   });
        //   result.screenshotPath = screenshotPath;
        // } catch (e) {
        //   console.warn('Screenshot failed:', (e as Error).message);
        // }
      } else {
        console.log('  No defamation notice found');
      }

      // Skip CAPTCHA check to speed up (causes delays)
      // if (await this.captchaHandler.detectCaptcha(page)) {
      //   result.status = 'captcha';
      //   const action = await this.captchaHandler.handleCaptcha(
      //     page,
      //     placeName
      //   );
      //   if (action === 'quit') {
      //     throw new Error('User quit on CAPTCHA');
      //   } else if (action === 'skip') {
      //     result.status = 'skipped';
      //   } else {
      //     // Retry
      //     await this.browserManager.resetPage();
      //     return this.scrapePlace(placeUrl, placeName);
      //   }
      // }
    } catch (error) {
      result.status = 'error';
      result.error = (error as Error).message;
      result.readAt = new Date();
      console.error(chalk.red(`  ✗ Error: ${(error as Error).message}`));
    }

    return result;
  }

  async scrapePlaces(places: Place[]): Promise<Place[]> {
    const results: Place[] = [];
    const page = await this.browserManager.getPage();

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      console.log(chalk.cyan(`\n[${i + 1}/${places.length}] ${place.name}`));

      // Skip overlay injection - causes delays
      // if (!page.isClosed()) {
      //   try {
      //     await injectOverlay(page, {...});
      //   } catch {}
      // }

      const result = await this.scrapePlace(place.url, place.name);
      results.push(result);
      mergeIntoGlobal(results);

      // Delay between places
      if (i < places.length - 1) {
        const delayMin = (this.config.delayMin || 15) * 1000;
        const delayMax = (this.config.delayMax || 45) * 1000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        console.log(chalk.gray(`  Waiting ${Math.round(delay / 1000)}s...`));

        // Skip overlay update during wait
        // if (!page.isClosed()) {
        //   try {
        //     await injectOverlay(page, {...});
        //   } catch {}
        // }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return results;
  }
}
