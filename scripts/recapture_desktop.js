// Batch re-capture of authenticated desktop pages (1440px) for the manual.
// Reflects the new desktop GNB + settings width fix. Run: cd e2e && node ../scripts/recapture_desktop.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, '../docs/visual-qa/manual-v2/desktop');
fs.mkdirSync(OUT, { recursive: true }); // robust on fresh/cleaned workspaces
const BASE = 'http://localhost:3013';
const HOST_ID = '0cf89db6-3e53-406c-b896-89ade09add9a';
const HOST_EMAIL = 'host@teameet.v1';
const M = '00000000-0000-4000-8000-000000000202';
const TEAM = '00000000-0000-4000-8000-000000000101';
const TEAM2 = '00000000-0000-4000-8000-000000000102';
const TMATCH = '00000000-0000-4000-8000-000000001406';
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';

const PAGES = [
  ['web-09-home', '/home'],
  ['web-10-matches-list', '/matches'],
  ['web-11-match-detail', `/matches/${M}`],
  ['web-12-match-new-info', '/matches/new'],
  ['web-13-match-new-sport', '/matches/new/sport'],
  ['web-14-match-new-placetime', '/matches/new/place-time'],
  ['web-15-team-matches-list', '/team-matches'],
  ['web-16-team-match-detail', `/team-matches/${TMATCH}`],
  ['web-17-team-match-new', '/team-matches/new'],
  ['web-18-teams-list', '/teams'],
  ['web-19-team-detail', `/teams/${TEAM}`],
  ['web-20-team-members', `/teams/${TEAM2}/members`],
  ['web-21-team-new', '/teams/new'],
  ['web-22-teams-search', '/teams/search', '풋살'],
  ['web-23-chat-list', '/chat'],
  ['web-24-chat-room', `/chat/${CHAT}`],
  ['web-25-search', '/search'],
  ['web-26-notifications', '/notifications'],
  ['web-27-notices', '/notices'],
  ['web-28-my', '/my'],
  ['web-29-my-profile-edit', '/my/profile/edit'],
  ['web-30-my-teams', '/my/teams'],
  ['web-31-my-matches', '/my/matches/created'],
  ['web-32-my-reviews', '/my/reviews'],
  ['web-33-my-settings', '/my/settings'],
  ['web-34-my-settings-notifications', '/my/settings/notifications'],
  ['web-35-my-settings-sports', '/my/settings/sports'],
  ['web-36-team-members-private', `/teams/${TEAM}/members`],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  // Set header-based dev auth before any page script runs.
  await ctx.addInitScript(([id, email]) => {
    localStorage.setItem('teameet.v1.userId', id);
    localStorage.setItem('teameet.v1.userEmail', email);
  }, [HOST_ID, HOST_EMAIL]);

  const page = await ctx.newPage();
  let ok = 0;
  for (const [name, route, typeQuery] of PAGES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      if (typeQuery) {
        const input = page.locator('input[type="search"], input[type="text"]').first();
        await input.fill(typeQuery).catch(() => {});
        await page.waitForTimeout(1200);
      }
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true, scale: 'css' });
      ok++;
      console.log('OK', name);
    } catch (e) {
      console.log('FAIL', name, e.message.slice(0, 80));
    }
  }
  await browser.close();
  console.log(`DONE ${ok}/${PAGES.length}`);
})();
