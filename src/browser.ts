import { chromium, BrowserContext, Page } from 'playwright';
import { Config } from './types.js';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const PROFILE_PATH = './browser-profile';

export class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async init(): Promise<void> {
    // Recreate profile on start (user requested this)
    if (existsSync(PROFILE_PATH)) {
      rmSync(PROFILE_PATH, { recursive: true });
    }
    mkdirSync(PROFILE_PATH, { recursive: true });

    const context = await chromium.launchPersistentContext(PROFILE_PATH, {
      headless: this.config.headless,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      viewport: this.parseViewport(this.config.windowSize || '800x900'),
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      args: this.getArgs(),
    });

    // Match typical browser environment for consistent page rendering in headless mode
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en'] });
      // @ts-ignore
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    });

    this.context = context;
  }

  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not initialized');
    const page = await this.context.newPage();
    await this.positionWindow(page);
    return page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  private parseViewport(sizeStr: string): { width: number; height: number } {
    const [w, h] = sizeStr.split('x').map(Number);
    return { width: w, height: h };
  }

  private getArgs(): string[] {
    const baseArgs = [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ];

    if (this.config.pinWindow) {
      baseArgs.push('--always-on-top');
    }

    return baseArgs;
  }

  private async positionWindow(page: Page): Promise<void> {
    // Note: Window positioning is tricky in Playwright
    // This is best-effort; actual positioning depends on OS
    try {
      const [width, height] = (this.config.windowSize || '800x900')
        .split('x')
        .map(Number);

      if (this.config.windowPos === 'right-top') {
        // Try to position right-top, but this is limited in Playwright
        // We can only set size reliably
        await page.evaluate(
          ({ w, h }) => {
            window.resizeTo(w, h);
          },
          { w: width, h: height }
        );
      }
    } catch (e) {
      // Window positioning might fail in some environments
      // Not critical, continue anyway
    }
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      this.page = await this.newPage();
    }
    return this.page;
  }

  async resetPage(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }
}
