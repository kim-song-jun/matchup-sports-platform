/**
 * 신고 운영 조치·롤업 화면을 alpha 에서 캡처한다 (PR #681).
 *
 * 화면 3종:
 *   1) 어드민 신고 상세 — 대상 팀 누적 요약 + 조치 버튼
 *   2) 어드민 신고 누적 팀 목록 (/admin/reports/teams)
 *   3) 팀 컨택 설정 — 차단 사유 표시
 *
 * **대기는 조건 기반이다.** 고정 waitForTimeout 은 느린 alpha 에서 거짓 실패를, 빠를 때는
 * 불필요한 지연을 낸다.
 *
 * 이 앱은 prefers-color-scheme 이 아니라 <html>.dark + localStorage(tm-theme) 를 쓴다 —
 * emulateMedia 만으로는 다크가 안 걸려 **라이트/다크가 같은 픽셀로 찍혀도 통과** 한다.
 * 그래서 클래스 적용 여부를 매 캡처마다 직접 단언한다.
 *
 * 자격증명은 환경변수로만 받는다(이 저장소는 PUBLIC).
 *   필수: ALPHA_ADMIN_EMAIL, ALPHA_PASSWORD(또는 ALPHA_ADMIN_PASSWORD),
 *         ALPHA_EMAIL_A, ALPHA_TEAM_A_ID, ALPHA_INQUIRY_ID
 *   선택: CAPTURE_BASE, CAPTURE_OUT
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/report-enforcement');
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);
}
requireEnv('ALPHA_ADMIN_EMAIL', 'ALPHA_EMAIL_A', 'ALPHA_TEAM_A_ID', 'ALPHA_INQUIRY_ID');

async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('login(email, password) 는 둘 다 문자열이어야 합니다');
  }
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  // get() 은 Set-Cookie 가 여러 개일 때 하나로 합쳐 돌려줘 쿠키 경계가 흐려진다.
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const token = cookies.map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error('세션 쿠키를 못 받았다');
  return token;
}

const password = process.env.ALPHA_ADMIN_PASSWORD ?? process.env.ALPHA_PASSWORD;
const adminToken = await login(process.env.ALPHA_ADMIN_EMAIL, password);
const memberToken = await login(process.env.ALPHA_EMAIL_A, process.env.ALPHA_PASSWORD ?? password);

const PAGES = [
  { key: 'admin-report-detail', url: `/admin/inquiries/${process.env.ALPHA_INQUIRY_ID}`, token: adminToken },
  { key: 'admin-reported-teams', url: '/admin/reports/teams', token: adminToken },
  { key: 'contact-settings-reason', url: `/teams/${process.env.ALPHA_TEAM_A_ID}/contact/settings`, token: memberToken },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];
const isHttps = new URL(BASE).protocol === 'https:';

for (const theme of ['light', 'dark']) {
  for (const vp of VIEWPORTS) {
    for (const p of PAGES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, colorScheme: theme,
      });
      await ctx.addCookies([{
        name: 'teameet_v1_session', value: p.token,
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: isHttps, sameSite: 'Lax',
      }]);
      const page = await ctx.newPage();
      await page.addInitScript((t) => { try { window.localStorage.setItem('tm-theme', t); } catch {} }, theme);
      const file = path.join(OUT, `${p.key}-${theme}-${vp.key}.png`);
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        // 본문이 실제로 그려질 때까지 기다린다(고정 대기 아님).
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.screenshot({ path: file, fullPage: true });
        const probe = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          darkApplied: document.documentElement.classList.contains('dark'),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
        }));
        report.push({ page: p.key, theme, vp: vp.key, ...probe });
        console.log(`OK   ${p.key} ${theme} ${vp.key}  bg=${probe.bg}  dark=${probe.darkApplied}  overflow=${probe.overflow} (${probe.scrollW}/${probe.innerW})`);
      } catch (e) {
        console.log(`FAIL ${p.key} ${theme} ${vp.key}: ${e.message}`);
        report.push({ page: p.key, theme, vp: vp.key, error: e.message });
      }
      await page.close();
      await ctx.close();
    }
  }
}
await browser.close();

console.log('\n=== 가로 오버플로 (390 에서 반드시 false) ===');
for (const r of report.filter((x) => x.vp === 'mobile')) {
  console.log(`${r.page} ${r.theme}: overflow=${r.overflow ?? 'ERR'}`);
}
const badDark = report.filter((r) => r.theme === 'dark' && r.darkApplied === false);
console.log(badDark.length === 0 ? '\n다크 클래스 전부 적용됨' : `\n!! 다크 미적용 ${badDark.length}건`);
