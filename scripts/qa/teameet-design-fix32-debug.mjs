// Debug mount issues for fix32. Captures page errors + console + mounted sections.

import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix32';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleEvents = [];
  const pageErrors = [];
  page.on('console', (msg) => consoleEvents.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push({ message: err.message, stack: err.stack }));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(8000); // give babel + render time

  const summary = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-dc-section]'));
    const slots = Array.from(document.querySelectorAll('[data-dc-slot]'));
    return {
      sectionCount: sections.length,
      sectionIds: sections.map((el) => el.getAttribute('data-dc-section')).slice(0, 60),
      slotCount: slots.length,
      mGridSlotCount: slots.filter((el) => /^m\d{2}-/.test(el.getAttribute('data-dc-slot') || '')).length,
    };
  });

  const errors = pageErrors.slice(0, 8);
  // Also collect React component-level stack from console messages mentioning "bg"
  const bgConsoleErrors = consoleEvents.filter((e) => /reading 'bg'|undefined.*bg/i.test(e.text)).slice(0, 5);
  const importantConsole = consoleEvents
    .filter((e) => e.type === 'error' || e.type === 'warning')
    .filter((e) => !/babel.*standalone.*development|in-browser Babel transformer.*precompile/i.test(e.text))
    .slice(0, 25);

  console.log(JSON.stringify({ summary, errors, bgConsoleErrors, importantConsole }, null, 2));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
