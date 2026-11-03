/** Headed alpha-only review capture. No injected session, mock routes or app mutation. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const base = 'https://alpha.teameet.co.kr';
const out = path.resolve('docs/screenshots/pr1858-multi-finals');
(async () => {
  const server = await chromium.launchServer({ headless: false });
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) errors.push({ type: 'http', status: response.status(), path: new URL(response.url()).pathname }); });
  let closed = false;
  async function close() {
    if (closed) return; closed = true;
    await browser.close(); await server.close();
    console.log(JSON.stringify({ cleanup: 'owned headed browser closed' }));
    process.exit(0);
  }
  process.on('SIGINT', close); process.on('SIGTERM', close);
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  console.log(JSON.stringify({ browserPid: server.process().pid, parentPid: process.pid, ready: true, route: new URL(page.url()).pathname }));
  const input = readline.createInterface({ input: process.stdin });
  for await (const line of input) {
    try {
      const command = JSON.parse(line);
      if (command.action === 'close') { await close(); break; }
      if (command.action === 'login') {
        await page.getByRole('link', { name: '이메일로 로그인', exact: true }).click();
        await page.getByLabel('이메일', { exact: true }).fill(command.email);
        await page.getByLabel('비밀번호', { exact: true }).fill(command.password);
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
        console.log(JSON.stringify({ loggedIn: true, route: new URL(page.url()).pathname }));
      } else if (command.action === 'status') {
        const result = await page.evaluate(async () => {
          const response = await fetch('/api/v1/auth/me');
          return { status: response.status, path: location.pathname, text: document.body.innerText.slice(0, 1200) };
        });
        console.log(JSON.stringify(result));
      } else if (command.action === 'open') {
        if (typeof command.path !== 'string' || !command.path.startsWith('/') || command.path.startsWith('//')) throw Error('alpha relative path required');
        await page.goto(`${base}${command.path}`, { waitUntil: 'domcontentloaded' });
        console.log(JSON.stringify({ route: new URL(page.url()).pathname }));
      } else if (command.action === 'capture') {
        if (!/^[a-z0-9-]+$/.test(command.label)) throw Error('safe label required');
        fs.mkdirSync(out, { recursive: true });
        const observations = [];
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(out, `${command.label}-${width}.png`), fullPage: true });
          observations.push(await page.evaluate(() => ({ width: innerWidth, path: location.pathname, overflowX: document.documentElement.scrollWidth > innerWidth, title: document.title })));
        }
        fs.writeFileSync(path.join(out, `${command.label}-observations.json`), JSON.stringify({ observations, errors }, null, 2));
        console.log(JSON.stringify({ observations, errorCount: errors.length }));
      }
    } catch (error) { console.log(JSON.stringify({ error: error.message })); }
  }
  await close();
})().catch(error => { console.error(error.message); process.exitCode = 1; });
