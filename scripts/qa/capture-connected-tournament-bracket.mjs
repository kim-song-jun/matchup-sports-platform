/** Read-only alpha baseline + explicitly labelled browser-local component previews.
 * No API mutations, no deployment claim. Bundle the current component beforehand.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = 'https://alpha.teameet.co.kr';
const route = `${base}/tournaments/d209a886-1a38-44ab-90a7-d08009aeee16`;
const output = 'output/playwright/visual-audit/20261005-connected-bracket';
const bundle = await readFile('/tmp/round12-preview-bundle.js', 'utf8');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false });
console.log(`Owned headed browser parent ${process.pid}`);
console.log(execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }));
const evidence = [];
try {
  for (const [viewport, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, bypassCSP: true });
    const page = await context.newPage(); const errors = []; const consoleErrors = []; const failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) failures.push({ status: response.status(), url: response.url() }); });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.locator('[role="region"][aria-label="결선 대진표"]').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/before-${viewport}.png`, fullPage: true });
    const selector = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="결선 대진표"]');
      const host = region.parentElement.parentElement;
      host.id = 'connected-bracket-preview';
      return '#connected-bracket-preview';
    });
    const layoutCss = await readFile('apps/v1_web/src/app/desktop/tournaments.css', 'utf8');
    await page.addStyleTag({ content: layoutCss.slice(layoutCss.indexOf('/* Multiple knockout matches')) });
    await page.evaluate(() => {
      document.querySelector('.tm-tournament-detail-bracket').setAttribute('data-connected-bracket-wide', 'true');
      const aside = document.querySelector('.tm-tournament-detail-aside');
      if (aside) { const boundary = document.createElement('div'); boundary.className = 'tm-tournament-detail-aside-boundary'; aside.before(boundary); boundary.append(aside); }
    });
    await page.addScriptTag({ content: bundle });
    if (!(await page.evaluate(() => typeof window.renderBracketPreview === 'function'))) throw new Error(`Preview bundle failed: ${JSON.stringify(errors)}`);
    for (const size of [4, 8, 12]) {
      await page.evaluate(({ selector, size }) => window.renderBracketPreview(selector, size), { selector, size });
      await page.getByText(`${size}강 화면 예시 · 실제 대회 데이터 아님`, { exact: true }).waitFor();
      await page.waitForTimeout(700);
      await page.locator(selector).evaluate((node) => node.scrollIntoView({ block: 'start' }));
      const metrics = await page.evaluate(() => {
        const host = document.querySelector('#connected-bracket-preview');
        const rects = Array.from(host.querySelectorAll('[data-bracket-node]')).map((node) => ({ id: node.dataset.bracketNode, ...Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, node.getBoundingClientRect()[key]])) }));
        const board = host.getBoundingClientRect();
        const aside = document.querySelector('.tm-tournament-detail-aside')?.getBoundingClientRect();
        const railOverlap = innerWidth >= 1024 && aside ? board.left < aside.right && board.right > aside.left && board.top < aside.bottom && board.bottom > aside.top : false;
        return { railOverlap, overflow: document.documentElement.scrollWidth - innerWidth, paths: host.querySelectorAll('svg[aria-label="경기별 진출 연결선"] path').length, cards: rects.length, overlappingCards: rects.flatMap((a, i) => rects.slice(i + 1).filter((b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).map((b) => [a.id, b.id])) };
      });
      await page.screenshot({ path: `${output}/preview-${size}-${viewport}.png`, fullPage: true });
      // Capture the complete board while preserving its measured viewport width.
      // A taller capture viewport prevents the sticky page CTA obscuring a cropped board.
      const boardHeight = await page.locator(selector).evaluate((node) => Math.ceil(node.getBoundingClientRect().height));
      await page.setViewportSize({ width, height: Math.max(height, boardHeight + 240) });
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.locator(selector).screenshot({ path: `${output}/graph-${size}-${viewport}.png` });
      await page.setViewportSize({ width, height });
      if (metrics.railOverlap || metrics.overflow > 1 || metrics.overlappingCards.length || metrics.paths !== (size === 4 ? 3 : size === 8 ? 7 : 15)) throw new Error(`Invalid ${size}/${viewport}: ${JSON.stringify(metrics)}`);
      await page.getByRole('navigation', { name: '대진 단계 이동' }).getByRole('button', { name: '결승', exact: true }).click();
      await page.waitForTimeout(600);
      const scroll = await page.locator('[role="region"][aria-label="결선 대진표"]').evaluate((node) => ({ left: node.scrollLeft, max: node.scrollWidth - node.clientWidth }));
      evidence.push({ route, viewport, size, metrics, scroll, errors: [...errors], consoleErrors: [...consoleErrors], failures: [...failures], mode: 'browser-local labelled sample; alpha not changed' });
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
