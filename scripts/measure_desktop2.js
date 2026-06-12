const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3013';
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const ONB = ['00000000-0000-4000-8000-000000001006', 'coverage-not-started@teameet.v1'];
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';

// [name, route, auth(null=clear), selectors]
const T = [
  ['chat-room', `/chat/${CHAT}`, HOST, ['.tm-chat-room', '.tm-chat-thread', '.tm-chat-inputbar']],
  ['login-email', '/login/email', null, ['.tm-auth-frame']],
  ['signup', '/signup', null, ['.tm-auth-frame']],
  ['onboarding-sport', '/onboarding/sport', ONB, ['.tm-auth-frame']],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, route, auth, sels] of T) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    if (auth) await ctx.addInitScript(([id, e]) => { localStorage.setItem('teameet.v1.userId', id); localStorage.setItem('teameet.v1.userEmail', e); }, auth);
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(700);
      const d = await page.evaluate((sels) => {
        const o = { docH: Math.round(document.documentElement.scrollHeight), vpH: window.innerHeight, url: location.pathname, els: {} };
        for (const s of sels) { const el = document.querySelector(s); if (!el) { o.els[s] = null; continue; } const r = el.getBoundingClientRect(); o.els[s] = { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }
        return o;
      }, sels);
      console.log(name, JSON.stringify(d));
    } catch (e) { console.log(name, 'ERR', e.message.slice(0, 70)); }
    await ctx.close();
  }
  await browser.close();
})();
