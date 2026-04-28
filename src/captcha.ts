import { Page } from 'playwright';
import notifier from 'node-notifier';
import { stdin as input, stdout as output } from 'process';
import * as readline from 'readline';
import chalk from 'chalk';

export type UserAction = 'solved' | 'skip' | 'quit';

export class CaptchaHandler {
  private timeoutMs: number;

  constructor(timeoutMs: number = 5 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
  }

  async detectCaptcha(page: Page): Promise<boolean> {
    try {
      // Check for common CAPTCHA indicators
      const selectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
      ];

      for (const selector of selectors) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          return true;
        }
      }

      // Check page text
      const bodyText = await page.textContent('body');
      if (!bodyText) return false;

      const captchaPatterns = [
        /ungewöhnlicher\s+datenverkehr/i,
        /ich\s+bin\s+kein\s+roboter/i,
        /unusual\s+traffic/i,
      ];

      for (const pattern of captchaPatterns) {
        if (pattern.test(bodyText)) {
          return true;
        }
      }

      // Check URL for /sorry/
      if (page.url().includes('/sorry/')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async handleCaptcha(page: Page, currentPlace: string): Promise<UserAction> {
    console.log('\n');
    console.log(chalk.bgRed.white('  ⚠  CAPTCHA ERKANNT  '));
    console.log(
      chalk.red(
        '╔═══════════════════════════════════════════════╗'
      )
    );
    console.log(
      chalk.red(
        '║  Bitte löse das CAPTCHA im Browser-Fenster.   ║'
      )
    );
    console.log(
      chalk.red(
        '║  Das Script wartet automatisch und macht      ║'
      )
    );
    console.log(
      chalk.red(
        '║  weiter, sobald die Seite wieder normal lädt. ║'
      )
    );
    console.log(
      chalk.red(
        '║                                               ║'
      )
    );
    console.log(
      chalk.red(
        '║  [Enter] = Manuell als gelöst markieren       ║'
      )
    );
    console.log(
      chalk.red(
        '║  [s]     = Diesen Ort überspringen            ║'
      )
    );
    console.log(
      chalk.red(
        '║  [q]     = Komplett abbrechen                 ║'
      )
    );
    console.log(
      chalk.red(
        '╚═══════════════════════════════════════════════╝'
      )
    );

    // Beep
    process.stdout.write('\x07');

    // OS notification
    notifier.notify({
      title: 'Google Maps Scraper - CAPTCHA',
      message: `CAPTCHA auf: ${currentPlace}`,
    });

    // Bring page to front
    try {
      await page.bringToFront();
    } catch {
      // Some environments don't support this
    }

    // Start auto-detection + user input in parallel
    return await Promise.race([
      this.waitForResolution(page),
      this.waitForUserInput(),
      this.waitForTimeout(),
    ]);
  }

  private async waitForResolution(page: Page): Promise<UserAction> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (true) {
      if (Date.now() - startTime > this.timeoutMs) {
        throw new Error('CAPTCHA timeout');
      }

      const isCaptchaVisible = await this.detectCaptcha(page);
      if (!isCaptchaVisible) {
        console.log(
          chalk.green('✓ CAPTCHA gelöst, setze fort...')
        );
        await new Promise((resolve) => setTimeout(resolve, 30000)); // 30s wait
        return 'solved';
      }

      await new Promise((resolve) =>
        setTimeout(resolve, pollInterval)
      );
    }
  }

  private waitForUserInput(): Promise<UserAction> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input, output });

      const listener = (line: string) => {
        const cmd = line.toLowerCase().trim();
        rl.close();

        if (cmd === 's') {
          resolve('skip');
        } else if (cmd === 'q') {
          resolve('quit');
        } else {
          resolve('solved');
        }
      };

      rl.on('line', listener);
    });
  }

  private waitForTimeout(): Promise<UserAction> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('quit');
      }, this.timeoutMs);
    });
  }
}
