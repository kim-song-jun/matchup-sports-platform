// Measure desktop layout ground-truth at 1440x900 (NOT full-page) to separate
// real composition issues from full-page-screenshot artifacts.
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3013';
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const M = '00000000-0000-4000-8000-000000000202';
const TMATCH = '00000000-0000-4000-8000-000000001406';
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';

const TARGETS = [
  ['match-detail', `/matches/${M}`, ['.tm-match-detail-desktop-layout', '.tm-match-detail-desktop-cta', '.tm-match-detail-body']],
  ['team-match-detail', `/team-matches/${TMATCH}`, ['.tm-team-match-detail-desktop', '.tm-team-match-detail-left']],
  ['chat-room', `/chat/${CHAT}`, ['.tm-chat-room', '.tm-chat-thread', '.tm-chat-inputbar', '.tm-chat-composer']],
  ['my', '/my', ['.tm-my-desktop-layout', '.tm-my-shell']],
  ['my-teams', '/my/teams', ['.tm-my-shell']],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([id, email]) => {
    localStorage.setItem('teameet.v1.userId', id);
    localStorage.setItem('teameet.v1.userEmail', email);
  }, HOST);
  const page = await ctx.newPage();
  for (const [name, route, sels] of TARGETS) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(700);
      const data = await page.evaluate((sels) => {
        const out = { docH: Math.round(document.documentElement.scrollHeight), vpH: window.innerHeight, els: {} };
        for (const s of sels) {
          const el = document.querySelector(s);
          if (!el) { out.els[s] = null; continue; }
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          out.els[s] = { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), pos: cs.position, gridCols: cs.gridTemplateColumns?.slice(0, 40) };
        }
        // blank space below the lowest visible content within the viewport
        return out;
      }, sels);
      console.log(name, JSON.stringify(data));
    } catch (e) {
      console.log(name, 'ERR', (e instanceof Error ? e.message : String(e)).slice(0, 80));
    }
  }
  await browser.close();
})();
