import { Page } from 'playwright';

export interface OverlayState {
  current: number;
  total: number;
  placeName: string;
  status: 'scraping' | 'waiting' | 'error';
  message?: string;
}

export async function injectOverlay(
  page: Page,
  state: OverlayState
): Promise<void> {
  const statusColor =
    state.status === 'scraping'
      ? '#22c55e'
      : state.status === 'waiting'
        ? '#eab308'
        : '#ef4444';

  const html = `
    <div id="gmaps-scraper-overlay" style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 16px;
      border-radius: 8px;
      z-index: 99999;
      font-family: monospace;
      font-size: 12px;
      width: 300px;
      border: 2px solid ${statusColor};
    ">
      <div style="margin-bottom: 8px; font-weight: bold;">
        🔍 Scraper [${state.current}/${state.total}]
      </div>
      <div style="margin-bottom: 4px;">
        <span style="color: ${statusColor}; display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
        ${state.placeName}
      </div>
      <div style="color: #999; margin-top: 8px;">
        ${state.status === 'scraping' ? '⟳ scraping...' : state.status === 'waiting' ? '⏸  waiting...' : '✗ error'}
      </div>
      ${state.message ? `<div style="margin-top: 8px; color: #fbbf24;">${state.message}</div>` : ''}
    </div>
  `;

  await page.evaluate((overlayHtml) => {
    let overlay = document.getElementById('gmaps-scraper-overlay');
    if (overlay) {
      overlay.remove();
    }
    const div = document.createElement('div');
    div.innerHTML = overlayHtml;
    document.body.appendChild(div.firstElementChild as Element);
  }, html);
}

export async function removeOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.getElementById('gmaps-scraper-overlay');
    if (overlay) {
      overlay.remove();
    }
  });
}
