import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'https://alpha.teameet.co.kr';
const mode = process.argv[2] ?? 'before';
const output = `output/playwright/visual-audit/20261004-round12/${mode}`;
const response = await fetch(`${base}/api/v1/tournaments?limit=50`);
if (!response.ok) throw new Error(`Tournaments ${response.status}`);
const payload = await response.json();
const items = payload.data.items;
const tournament = items.find((item) => item.format === 'group_knockout' && item.status === 'completed') ?? items.find((item) => item.format === 'knockout');
if (!tournament) throw new Error('No public knockout tournament for read-only QA');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false });
console.log(`Owned headed browser parent ${process.pid}; tournament ${tournament.id}`);
console.log(execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }));
const evidence = [];
try {
  for (const [name, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 1000]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    const failedRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (result) => { if (result.url().startsWith(base) && result.status() >= 400) failedRequests.push({ url: result.url(), status: result.status() }); });
    await page.goto(`${base}/tournaments/${tournament.id}/bracket`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('대진'), { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role=tab]')).some((tab) => tab.textContent === '순위 · 대진표' && tab.getAttribute('aria-selected') === 'true'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    evidence.push({ name, width, height, url: page.url(), errors, failedRequests, overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
