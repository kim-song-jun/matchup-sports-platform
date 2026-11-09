const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
(async () => {
  const phase = process.argv[2] || 'before';
  const out = `docs/visual-qa/demo-navigation/${phase}`;
  fs.mkdirSync(out, { recursive: true });
  const server = await chromium.launchServer({ headless: false });
  console.log('Owned browser tree:', execFileSync('ps', ['-o', 'pid,ppid,comm', '-p', String(server.process().pid)], { encoding: 'utf8' }).trim());
  const browser = await chromium.connect(server.wsEndpoint());
  const findings = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
      for (const [name, path] of [['console', '/field-console-demo'], ['guide', '/tournament-ops-demo#demo-guide']]) {
        await page.goto(`https://alpha.teameet.co.kr${path}`, { waitUntil: 'domcontentloaded' });
        if (name === 'console') await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
        else await page.getByRole('region', { name: '대회 관리 내용' }).waitFor();
        await page.waitForTimeout(500);
        if (name === 'guide') await page.evaluate(() => window.scrollTo(0, 0));
        const returns = page.getByRole('link', { name: '대회 운영으로 돌아가기' });
        findings.push({ name, width, returnLinks: await returns.count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), errors: [...errors] });
        await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
        if (phase === 'after') {
          if (await returns.count() !== 1) throw new Error('Missing return link');
          const destination = await returns.getAttribute('href');
          await returns.click();
          await page.waitForURL(url => url.pathname === destination || url.pathname === '/login');
          findings.push({ name, width, returnDestination: destination, observedPath: new URL(page.url()).pathname, tabs: context.pages().length });
        }
      }
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings));
})().catch(error => { console.error(error); process.exitCode = 1; });
