import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix30';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleEvents = [];
const pageErrors = [];
page.on('console', (msg) => consoleEvents.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (err) => pageErrors.push(err.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(8000);

const sectionCount = await page.evaluate(() => document.querySelectorAll('[data-dc-section]').length);
const artboardCount = await page.evaluate(() => document.querySelectorAll('[data-dc-slot]').length);

console.log('sections:', sectionCount);
console.log('artboards:', artboardCount);
console.log('---');
console.log('pageErrors:', pageErrors.length);
for (const e of pageErrors.slice(0, 8)) console.log('  ', e.slice(0, 250));
console.log('---');
console.log('errors/warnings:', consoleEvents.filter((e) => e.type === 'error' || e.type === 'warning').length);
for (const e of consoleEvents.slice(0, 12)) {
  if (e.type === 'error' || e.type === 'warning') console.log('  ', e.type, e.text.slice(0, 250));
}

await browser.close();
