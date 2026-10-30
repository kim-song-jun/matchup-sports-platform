// Headed Alpha demo QA. Commands arrive over stdin; credentials and session state are never written.
const { chromium } = require('playwright');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'https://alpha.teameet.co.kr';
const out = path.resolve('docs/screenshots/tournament-ops-demo');
const demoKey = 'teameet.tournament-ops-demo.v1';
function observe(page) {
  const errors = [], activity = [];
  page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
  page.on('console', msg => { if (msg.type() === 'error') errors.push({ type: 'console', message: msg.text() }); });
  page.on('request', req => { if (req.url().startsWith(origin + '/api/v1/')) activity.push({ method: req.method(), path: new URL(req.url()).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi, '[id]') }); });
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(origin)) errors.push({ type: 'network', status: r.status(), path: new URL(r.url()).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi, '[id]') });
  });
  return { errors, activity };
}

(async () => {
  const server = await chromium.launchServer({ headless: false, channel: 'chrome' });
  const browser = await chromium.connect(server.wsEndpoint());
  const sessions = new Map();
  // Disable terminal echo before receiving private fill commands.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  console.log(JSON.stringify({ ready: true, browserPid: server.process().pid, parentPid: process.pid }));
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  try {
    for await (const line of input) {
      let command;
      try {
        command = JSON.parse(line);
        if (command.action === 'close') break;
        const name = command.session || 'admin';
        if (!sessions.has(name)) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          const page = await context.newPage();
          sessions.set(name, { context, page, ...observe(page) });
        }
        const { page, context, errors, activity } = sessions.get(name);
        const locator = () => command.role
          ? page.getByRole(command.role, { name: command.name, exact: command.exact ?? true })
          : command.label ? page.getByLabel(command.label, { exact: true })
            : page.locator(command.selector);
        let result;
        switch (command.action) {
          case 'goto': {
            const url = new URL(command.path, origin);
            if (url.origin !== origin) throw new Error('Alpha only');
            const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
            result = { status: response.status(), commit: response.headers()['x-teameet-commit'] }; break;
          }
          case 'fill': await locator().fill(command.value); result = { filled: true }; break;
          case 'click': {
            if (command.popupSession) {
              const pending = page.waitForEvent('popup');
              await locator().click();
              const popup = await pending;
              sessions.set(command.popupSession, { context, page: popup, ...observe(popup) });
              await popup.waitForLoadState('domcontentloaded');
              result = { clicked: true, popupPath: new URL(popup.url()).pathname };
            } else { await locator().click(); result = { clicked: true }; }
            break;
          }
          case 'select': await locator().selectOption(command.value); result = { selected: true }; break;
          case 'check': await locator().setChecked(command.checked ?? true); result = { checked: true }; break;
          case 'wait': await locator().waitFor({ timeout: command.timeout || 15000 }); result = { visible: true }; break;
          case 'viewport': await page.setViewportSize({ width: command.width, height: command.height || 1000 }); result = { resized: true }; break;
          case 'focus': await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); result = { focused: true }; break;
          case 'activity': result = { requests: activity.splice(0), errors: errors.splice(0) }; break;
          case 'theme': {
            if (!['dark', 'light'].includes(command.scheme)) throw new Error('Invalid theme');
            await page.evaluate(theme => localStorage.setItem('tm-theme', theme), command.scheme);
            await page.reload({ waitUntil: 'domcontentloaded' });
            result = { theme: command.scheme }; break;
          }
          case 'storage': {
            if (new URL(page.url()).pathname !== '/tournament-ops-demo') throw new Error('Demo page only');
            if (command.mode === 'corrupt') await page.evaluate(key => sessionStorage.setItem(key, '{broken'), demoKey);
            else if (command.mode === 'deny') await page.addInitScript(key => {
              const original = Storage.prototype.setItem;
              Storage.prototype.setItem = function (name, value) {
                if (name === key) throw new DOMException('QA storage denied', 'QuotaExceededError');
                return original.call(this, name, value);
              };
            }, demoKey);
            else throw new Error('Invalid demo storage fault');
            await page.reload({ waitUntil: 'domcontentloaded' });
            result = { injected: command.mode }; break;
          }
          case 'diagnostics': result = await page.evaluate(() => ({
            dark: document.documentElement.classList.contains('dark'),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            smallTargets: [...document.querySelectorAll('button,a,input,select,summary')].map(n => ({ name: n.getAttribute('aria-label') || n.textContent?.trim().slice(0, 50), rect: n.getBoundingClientRect() })).filter(n => n.rect.width > 0 && n.rect.height > 0 && (n.rect.width < 44 || n.rect.height < 44)).map(n => ({ name: n.name, width: n.rect.width, height: n.rect.height })),
          })); break;
          case 'snapshot': result = { path: new URL(page.url()).pathname, text: (await page.locator('body').innerText()).slice(0, 22000), controls: await page.locator('input,textarea,select').evaluateAll(nodes => nodes.map(n => ({ tag: n.tagName, type: n.type, name: n.name, placeholder: n.placeholder, label: n.labels?.[0]?.textContent, options: n.tagName === 'SELECT' ? [...n.options].map(o => ({ value: o.value, text: o.text })) : undefined }))), links: await page.getByRole('link').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, href: n.getAttribute('href') }))), errors: errors.splice(0) }; break;
          case 'screenshot': {
            if (!/^[a-z0-9-]+$/.test(command.file)) throw new Error('Invalid screenshot name');
            fs.mkdirSync(out, { recursive: true });
            await page.screenshot({ path: path.join(out, `${command.file}.png`), fullPage: command.fullPage ?? true, mask: [page.locator('input[type="email"],input[type="password"]')] });
            result = { file: `${command.file}.png`, width: page.viewportSize().width, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors: errors.splice(0) }; break;
          }
          case 'request': {
            if (!command.path.startsWith('/api/v1/')) throw new Error('API only');
            const response = await context.request.fetch(origin + command.path, { method: command.method || 'GET', data: command.data });
            result = { status: response.status(), body: await response.json() }; break;
          }
          default: throw new Error('Unknown action');
        }
        console.log(JSON.stringify({ session: name, action: command.action, result }));
      } catch (error) {
        // Do not echo command values: fill/login commands can contain credentials.
        console.log(JSON.stringify({ action: command?.action, error: error.message.split('Call log:')[0] }));
      }
    }
  } finally {
    input.close();
    process.stdin.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    for (const { context } of sessions.values()) await context.close();
    await browser.close();
    await server.close();
    console.log(JSON.stringify({ cleanup: 'owned headed browser and contexts closed' }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
