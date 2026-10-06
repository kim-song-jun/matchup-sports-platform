// Headed Alpha-only manual QA session. Credentials stay in the browser memory.
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const { createInterface } = require('node:readline');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const BASE = 'https://alpha.teameet.co.kr';
const TARGET = '/admin/tournaments/ad120000-0000-4000-8000-000000000001/bracket';
const OUT = path.resolve('tmp/qa-round12-flow');

(async () => {
  mkdirSync(OUT, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.QA_BROWSER_EXECUTABLE });
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', (error) => issues.push({ kind: 'pageerror', message: error.message }));
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push({ kind: 'http', status: response.status(), path: new URL(response.url()).pathname });
  });
  await page.goto(BASE + TARGET, { waitUntil: 'domcontentloaded' });
  console.log(JSON.stringify({ ready: true, pid: server.process().pid, parentPid: process.pid, url: page.url() }));
  const input = createInterface({ input: process.stdin });
  try {
    for await (const line of input) {
      let command;
      try {
        command = JSON.parse(line);
        const locator = command.role ? page.getByRole(command.role, { name: command.name, exact: !!command.exact }) : command.selector ? page.locator(command.selector) : null;
        if (command.action === 'close') break;
        if (command.action === 'goto') {
          if (!command.path.startsWith('/admin/tournaments/ad120000-0000-4000-8000-000000000001/')) throw new Error('Only designated tournament navigation allowed');
          await page.goto(BASE + command.path, { waitUntil: 'domcontentloaded' });
        } else if (command.action === 'click') await locator.click();
        else if (command.action === 'fill') await locator.fill(command.value);
        else if (command.action === 'select') await locator.selectOption(command.value);
        else if (command.action === 'viewport') await page.setViewportSize({ width: command.width, height: command.height });
        else if (command.action === 'screenshot') {
          if (!/^[a-z0-9-]+$/.test(command.name)) throw new Error('Invalid screenshot name');
          await page.screenshot({ path: path.join(OUT, command.name + '.png'), fullPage: true });
        } else if (command.action === 'snapshot') {
          console.log(JSON.stringify({ url: page.url(), snapshot: await page.locator('body').ariaSnapshot(), issues }));
          continue;
        } else if (command.action === 'scroll') await locator.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        else throw new Error('Unknown action');
        console.log(JSON.stringify({ ok: true, action: command.action, url: page.url() }));
      } catch (error) { console.log(JSON.stringify({ ok: false, action: command?.action, message: error.message })); }
    }
  } finally {
    await context.close();
    await browser.close();
    await server.close();
    console.log(JSON.stringify({ closed: true, issues }));
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
