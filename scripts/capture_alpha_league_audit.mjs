/**
 * alpha 리그전 전 플로우 실화면 캡처 + 진단 덤프.
 *
 * 로그인은 login API 로만 가능하다(alpha 는 프로덕션 모드라 헤더 dev 인증이 401).
 * 프로덕션 빌드는 localStorage 힌트로 로그인 여부를 판단하므로 그것도 함께 심는다.
 *
 * 세트별 요구 조건:
 *   TARGET_SET=dark                   자격증명 불필요 (비로그인 캡처) + LEAGUE_IDS
 *   그 외(main/series/extra/fixture/wave4)  ALPHA_PASSWORD + ALPHA_ADMIN_EMAIL / ALPHA_CAPTAIN_EMAIL
 *
 * 사용법:
 *   ALPHA_PASSWORD=... ALPHA_CAPTAIN_EMAIL=... TARGET_SET=main \
 *     node scripts/capture_alpha_league_audit.mjs <outDir>
 *   LEAGUE_IDS='{"tier":"<리그 id>"}' TARGET_SET=dark \
 *     node scripts/capture_alpha_league_audit.mjs <outDir>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/alpha-league-audit';
// 자격증명 검사는 login() 안에서 한다 — TARGET_SET=dark 처럼 비로그인으로 도는 세트가 있어서,
// 최상단에서 무조건 막으면 로그인이 필요 없는 캡처까지 시작도 못 하고 죽는다.
const PASSWORD = process.env.ALPHA_PASSWORD;
const ADMIN_EMAIL = process.env.ALPHA_ADMIN_EMAIL;
const CAPTAIN_EMAIL = process.env.ALPHA_CAPTAIN_EMAIL;

async function login(email) {
  if (!PASSWORD) throw new Error('로그인이 필요한 캡처예요 — ALPHA_PASSWORD 환경변수를 넣어주세요.');
  if (!email) throw new Error('로그인이 필요한 캡처예요 — ALPHA_ADMIN_EMAIL / ALPHA_CAPTAIN_EMAIL 을 넣어주세요.');
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const cookie = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error('세션 쿠키를 못 받았어요.');
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

const WIDTHS = [
  { key: 'mobile', width: 390, height: 900 },
  { key: 'tablet', width: 768, height: 1000 },
  { key: 'desktop', width: 1440, height: 1000 },
];

/** 페이지가 렌더된 뒤 실제 DOM 에서 뽑는 진단값. 육안 대조 대신 computed 값을 읽는다. */
const DIAGNOSE = () => {
  const vw = window.innerWidth;
  const overflowers = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) {
      overflowers.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 90),
        right: Math.round(r.right),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  });
  const smallTargets = [];
  document.querySelectorAll('button, a[href], input, select, [role="button"], [role="tab"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 44 || r.width < 24) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  });
  const namelessIconButtons = [];
  document.querySelectorAll('button, a[href], [role="button"]').forEach((el) => {
    const label = (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
    if (!label) {
      namelessIconButtons.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 70) });
    }
  });
  const tables = [...document.querySelectorAll('table')].map((t) => ({
    headers: [...t.querySelectorAll('th')].map((th) => th.textContent.trim()),
    rows: t.querySelectorAll('tbody tr').length,
    scrollW: t.scrollWidth,
    clientW: t.clientWidth,
    parentScrollable: (() => {
      const p = t.parentElement;
      return p ? getComputedStyle(p).overflowX : null;
    })(),
  }));
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}:${h.textContent.trim().slice(0, 50)}`);
  const buttons = [...document.querySelectorAll('button, a[href]')]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || '').trim().slice(0, 28) || el.getAttribute('aria-label') || '',
        href: el.getAttribute('href') || null,
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        fs: cs.fontSize,
        h: Math.round(el.getBoundingClientRect().height),
      };
    })
    .filter((b) => b.text);
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    overflowers: overflowers.slice(0, 12),
    smallTargets: smallTargets.slice(0, 15),
    namelessIconButtons: namelessIconButtons.slice(0, 8),
    tables,
    bodyBg,
    headings: headings.slice(0, 15),
    buttons: buttons.slice(0, 40),
    bodyText: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 4000),
  };
};

const report = {};

// 다크 캡처 여부는 TARGET_SET=dark 또는 CAPTURE_DARK=1 둘 중 하나로 켠다.
const wantDark = process.env.CAPTURE_DARK === '1' || process.env.TARGET_SET === 'dark';

async function capture(ctxName, token, targets) {
  const browser = await chromium.launch();
  try {
    for (const { key, width, height } of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: key === 'desktop' ? 1 : 2,
        locale: 'ko-KR',
        ...(wantDark ? { colorScheme: 'dark' } : {}),
      });
      if (token) {
        await context.addCookies([
          { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' },
        ]);
        await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
      }
      if (wantDark) {
        // v1_web 은 OS 다크모드(prefers-color-scheme)를 의도적으로 무시한다 — colorScheme 만
        // 주면 라이트 화면이 찍혀 "다크를 확인했다"는 거짓 증거가 된다. 실제 토글은 이 키다.
        await context.addInitScript(() => window.localStorage.setItem('tm-theme', 'dark'));
      }
      const page = await context.newPage();
      const consoleErrors = [];
      const badRequests = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('response', (r) => {
        if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url().replace(BASE, '')}`.slice(0, 160));
      });

      for (const t of targets) {
        if (t.widths && !t.widths.includes(key)) continue;
        consoleErrors.length = 0;
        badRequests.length = 0;
        const url = `${BASE}${t.path}`;
        let status = 'ok';
        try {
          const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          status = String(resp?.status() ?? '?');
          await page.waitForTimeout(t.wait ?? 3000);
          if (t.action) await t.action(page).catch((e) => { status += ` action-fail:${e.message.slice(0, 60)}`; });
        } catch (e) {
          status = `nav-fail: ${e.message.slice(0, 80)}`;
        }
        const file = `${OUT}/${ctxName}__${t.name}__${key}.png`;
        try {
          await page.screenshot({ path: file, fullPage: true });
        } catch {
          await page.screenshot({ path: file });
        }
        let diag = null;
        try {
          diag = await page.evaluate(DIAGNOSE);
        } catch (e) {
          diag = { error: e.message.slice(0, 120) };
        }
        const id = `${ctxName}/${t.name}/${key}`;
        report[id] = {
          url: t.path,
          httpStatus: status,
          consoleErrors: [...new Set(consoleErrors)].slice(0, 6),
          badRequests: [...new Set(badRequests)].slice(0, 8),
          ...diag,
        };
        console.log(`[${id}] ${status} overflow=${diag?.horizontalOverflow} small=${diag?.smallTargets?.length ?? '-'}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await mkdir(OUT, { recursive: true });

const L = JSON.parse(process.env.LEAGUE_IDS ?? '{}');
const SET = process.env.TARGET_SET ?? 'main';

// ── 0. 시리즈(시즌·승강) 운영 화면 ─────────────────────────────────
if (SET === 'series') {
  const adminToken = await login(ADMIN_EMAIL);
  await capture('admin', adminToken, [
    { name: '30-series-list', path: '/admin/league-series' },
    { name: '31-series-new', path: '/admin/league-series/new' },
    { name: '32-series-detail-2tier', path: `/admin/league-series/${L.series2}` },
    { name: '33-series-detail-3tier', path: `/admin/league-series/${L.series3}` },
  ]);
  await writeFile(`${OUT}/diagnostics-series.json`, JSON.stringify(report, null, 2));
  console.log(`\n시리즈 캡처 완료 → ${OUT} (${Object.keys(report).length} 뷰)`);
  process.exit(0);
}

// ── 0-b. 보강 캡처 (내 리그 · 배포창에 502 로 실패했던 어드민 화면) ──
if (SET === 'extra') {
  const capToken = await login(CAPTAIN_EMAIL);
  await capture('captain', capToken, [{ name: '15-my-leagues', path: '/my/leagues', wait: 4000 }]);
  const adminToken = await login(ADMIN_EMAIL);
  await capture('admin', adminToken, [
    { name: '23b-admin-league-detail-tier', path: `/admin/league-matches/${L.tier}`, wait: 4000 },
    { name: '24b-admin-league-detail-draft', path: `/admin/league-matches/${L.draft}`, wait: 4000 },
  ]);
  await writeFile(`${OUT}/diagnostics-extra.json`, JSON.stringify(report, null, 2));
  console.log(`\n보강 캡처 완료 → ${OUT} (${Object.keys(report).length} 뷰)`);
  process.exit(0);
}

// ── 0-e. Wave 4 — 명칭 정리 + 우승 발표 ────────────────────────────
if (SET === 'wave4') {
  await capture('anon', null, [
    { name: '60-home', path: '/', wait: 4000 },
    { name: '61-league-list', path: '/league-matches' },
    { name: '62-tournaments-tab', path: '/tournaments' },
    { name: '63-summary-card', path: `/league-matches/${L.completed}` },
    { name: '64-awards', path: `/league-matches/${L.completed}/awards` },
    { name: '65-awards-not-completed', path: `/league-matches/${L.active}/awards`, widths: ['mobile'] },
    { name: '66-search', path: '/search', widths: ['mobile'] },
  ]);
  // 홈 사이드바 리그 위젯·검색 캡션은 로그인해야 보인다 — 명칭 검증은 로그인 상태로 해야 한다.
  if (CAPTAIN_EMAIL) {
    const capToken = await login(CAPTAIN_EMAIL);
    await capture('captain', capToken, [
      { name: '67-home-in', path: '/', wait: 5000 },
      { name: '68-search-in', path: '/search', wait: 4000, widths: ['mobile', 'desktop'] },
    ]);
  }
  await writeFile(`${OUT}/diagnostics-wave4.json`, JSON.stringify(report, null, 2));
  console.log(`\nWave 4 캡처 완료 (${Object.keys(report).length} 뷰)`);
  process.exit(0);
}

// ── 0-d. 다크모드 ─────────────────────────────────────────────────
if (SET === 'dark') {
  await capture('anon-dark', null, [
    { name: '50-league-list', path: '/league-matches', widths: ['mobile'] },
    { name: '51-detail-tier', path: `/league-matches/${L.tier}`, widths: ['mobile'] },
  ]);
  await writeFile(`${OUT}/diagnostics-dark.json`, JSON.stringify(report, null, 2));
  console.log(`\n다크모드 캡처 완료 (${Object.keys(report).length} 뷰)`);
  process.exit(0);
}

// ── 0-c. 리그 경기(팀매치) 상세 — 리그 맥락이 보이는지 ──────────────
if (SET === 'fixture') {
  await capture('anon', null, [
    { name: '40-league-fixture-detail', path: `/team-matches/${L.fixture}`, wait: 4000, widths: ['mobile'] },
  ]);
  const capToken = await login(CAPTAIN_EMAIL);
  await capture('captain', capToken, [
    { name: '41-league-fixture-detail', path: `/team-matches/${L.fixtureMine}`, wait: 4000, widths: ['mobile'] },
  ]);
  await writeFile(`${OUT}/diagnostics-fixture.json`, JSON.stringify(report, null, 2));
  console.log(`\n경기 상세 캡처 완료 (${Object.keys(report).length} 뷰)`);
  process.exit(0);
}

// ── 1. 비로그인 관전자 ─────────────────────────────────────────────
await capture('anon', null, [
  { name: '01-league-list', path: '/league-matches' },
  { name: '02-detail-scored', path: `/league-matches/${L.scored}` },
  { name: '03-detail-tier', path: `/league-matches/${L.tier}` },
  { name: '04-detail-forfeit', path: `/league-matches/${L.forfeit}` },
  { name: '05-detail-draft', path: `/league-matches/${L.draft}` },
  { name: '06-tournaments-tab', path: '/tournaments', widths: ['mobile'] },
  { name: '07-home', path: '/', widths: ['mobile'] },
]);

// ── 2. 팀장 ───────────────────────────────────────────────────────
if (CAPTAIN_EMAIL) {
  const capToken = await login(CAPTAIN_EMAIL);
  await capture('captain', capToken, [
    { name: '10-my', path: '/my' },
    { name: '11-league-list', path: '/league-matches', widths: ['mobile'] },
    { name: '12-detail-scored', path: `/league-matches/${L.scored}`, widths: ['mobile'] },
    { name: '13-team-matches', path: '/team-matches', widths: ['mobile'] },
    { name: '14-tournaments', path: '/tournaments', widths: ['mobile'] },
  ]);
}

// ── 3. 운영자 ─────────────────────────────────────────────────────
if (ADMIN_EMAIL) {
  const adminToken = await login(ADMIN_EMAIL);
  await capture('admin', adminToken, [
    { name: '20-admin-league-list', path: '/admin/league-matches' },
    { name: '21-admin-league-new', path: '/admin/league-matches/new' },
    { name: '22-admin-league-detail-active', path: `/admin/league-matches/${L.scored}` },
    { name: '23-admin-league-detail-tier', path: `/admin/league-matches/${L.tier}` },
    { name: '24-admin-league-detail-draft', path: `/admin/league-matches/${L.draft}` },
    { name: '25-admin-home', path: '/admin', widths: ['desktop', 'mobile'] },
  ]);
}

await writeFile(`${OUT}/diagnostics.json`, JSON.stringify(report, null, 2));
console.log(`\n캡처 완료 → ${OUT} (${Object.keys(report).length} 뷰)`);
