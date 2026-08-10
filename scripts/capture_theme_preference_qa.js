// Visual QA for the theme-preference feature: light/dark toggle + dark-mode contrast fixes.
// Mobile 390 / tablet 768 / desktop 1440, deviceScaleFactor 1.
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:13014';
// db:seed:demo가 만드는 owner@teameet.v1 계정의 UUID는 postgres 볼륨마다 새로 생성된다 —
// 하드코딩하면 다음 실행에서 조용히 401로 깨진다(이번 세션에서 실제로 겪음). 캡처 직전
// `psql -c "select id from v1_users where email='owner@teameet.v1'"`로 조회해 OWNER_USER_ID로
// 넘기는 게 기본 흐름이고, 폴백값은 마지막으로 확인된 값일 뿐 재사용을 보장하지 않는다.
const OWNER = {
  id: process.env.OWNER_USER_ID || 'b708b050-250d-4e41-9b61-033a486e4103',
  email: process.env.OWNER_USER_EMAIL || 'owner@teameet.v1',
};
const MATCH_ID = process.env.MATCH_ID || '00000000-0000-4000-8000-000000000201';

const SCREENS = [
  ['home', '/home'],
  ['my-settings', '/my/settings'],
  ['my-settings-theme', '/my/settings/theme'],
  ['matches-list', '/matches'],
  ['match-applications', `/matches/${MATCH_ID}/applications`],
];

const BPS = [
  ['mobile-390', 390],
  ['tablet-768', 768],
  ['desktop-1440', 1440],
];

const THEMES = [
  ['light', null],
  ['dark', 'dark'],
];

const API_BASE = process.env.API_BASE_URL || 'http://localhost:18122';

// ThemeProvider는 로그인 사용자의 경우 계정에 저장된 서버 값을 진실로 취급해 로컬(localStorage)
// 값을 덮어쓴다(다른 기기 동기화가 목적) — 그래서 localStorage만 dark로 세팅해서는 로그인 상태
// 캡처에서 다크가 유지되지 않는다. 캡처 전에 실제로 계정 설정 자체를 바꿔둬야 한다.
async function setServerTheme(theme) {
  const res = await fetch(`${API_BASE}/api/v1/me/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-v1-user-id': OWNER.id },
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) throw new Error(`setServerTheme(${theme}) failed: ${res.status} ${await res.text()}`);
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  fs.mkdirSync('docs/visual-qa/theme-preference', { recursive: true });

  for (const [themeName, themeValue] of THEMES) {
    await setServerTheme(themeValue === 'dark' ? 'dark' : 'light');
    for (const [bp, width] of BPS) {
      for (const [name, path] of SCREENS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await ctx.addInitScript(
          ([id, email, theme]) => {
            localStorage.setItem('teameet.v1.userId', id);
            localStorage.setItem('teameet.v1.userEmail', email);
            if (theme) localStorage.setItem('tm-theme', theme);
          },
          [OWNER.id, OWNER.email, themeValue],
        );
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errs.push(m.text().slice(0, 150));
        });
        try {
          await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(700);
          const out = `docs/visual-qa/theme-preference/${themeName}-${bp}-${name}.png`;
          await page.screenshot({ path: out, fullPage: true });
          results.push(`${themeName}/${bp}/${name} -> OK${errs.length ? ' ERR:' + errs.length + ' ' + errs[0] : ''}`);
        } catch (e) {
          results.push(`${themeName}/${bp}/${name} FAILED: ${String(e).slice(0, 120)}`);
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(results.join('\n'));
})();
