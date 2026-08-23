/**
 * PR #641 시각 검증 캡처 — 팀 간 컨택 메시지 (Phase 1 + Phase 2·3).
 *
 * alpha 는 프로덕션 모드라 헤더 dev 인증(x-v1-user-*)이 401 이다. 로그인 API 로
 * 받은 세션 쿠키(teameet_v1_session)를 컨텍스트에 심어 캡처한다.
 *
 * 자격증명은 **저장소에 적지 않는다**(이 저장소는 PUBLIC). 아래 환경변수로만 받는다:
 *
 *   필수
 *     ALPHA_EMAIL_A    — 컨택을 보내는 팀(A) 팀장 계정
 *     ALPHA_PASSWORD   — 위 계정 비밀번호
 *     ALPHA_TEAM_A_ID  — A 팀 id (컨택 설정 화면은 **내 팀 운영진만** 볼 수 있다)
 *     ALPHA_TEAM_B_ID  — B 팀 id (팀 상세·컨택 보내기 화면 대상)
 *
 *   선택
 *     ALPHA_CONTACT_ID      — 있으면 컨택 상세(신고·차단 버튼) 화면도 캡처
 *     ALPHA_ADMIN_EMAIL     — 있으면 어드민 문의 목록·신고 사유 필터도 캡처 (adminRole=ops 필요)
 *     ALPHA_ADMIN_PASSWORD  — 없으면 ALPHA_PASSWORD 를 쓴다
 *     CAPTURE_BASE          — 기본 https://alpha.teameet.co.kr
 *     CAPTURE_OUT           — 기본 .screenshots/team-contacts
 *
 * 사용:
 *   ALPHA_EMAIL_A=... ALPHA_PASSWORD=... ALPHA_TEAM_A_ID=... ALPHA_TEAM_B_ID=... \
 *     node scripts/capture-team-contacts-alpha.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-contacts');

const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

/**
 * 필수 env 를 시작 시점에 한 번에 검증한다. 없으면 login() 에 undefined 가 들어가
 * 요청이 이상하게 나가고, 실패 메시지를 만들 때 `email.replace` 에서 TypeError 로
 * 스크립트가 터진다(실제로 그렇게 터졌다) — 원인이 env 누락인지 alpha 장애인지
 * 구분이 안 된다. 여기서 먼저 죽는 편이 진단이 빠르다.
 */
function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);
  }
}

async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('login(email, password) 는 둘 다 문자열이어야 합니다');
  }
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} for ${email.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/teameet_v1_session=([^;]+)/);
  if (!m) throw new Error('세션 쿠키를 못 받았다');
  return m[1];
}

/** 라이브 컨택 화면은 폴링이 있을 수 있어 networkidle 대신 domcontentloaded + 명시 대기. */
async function shoot(ctx, url, file, theme) {
  const page = await ctx.newPage();
  // 이 앱은 prefers-color-scheme 이 아니라 <html>.dark 클래스 + localStorage 수동 토글을 쓴다
  // (globals.css:3-7 — OS 자동에서 수동 토글로 전환됨). emulateMedia 만으로는 다크가 안 걸린다.
  await page.addInitScript((t) => {
    try { window.localStorage.setItem('tm-theme', t); } catch {}
  }, theme);
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: file, fullPage: true });
  // 육안 대조 대신 computed 값을 직접 읽는다.
  const probe = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    darkApplied: document.documentElement.classList.contains('dark'),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  await page.close();
  return probe;
}

requireEnv('ALPHA_EMAIL_A', 'ALPHA_PASSWORD', 'ALPHA_TEAM_A_ID', 'ALPHA_TEAM_B_ID');
const token = await login(process.env.ALPHA_EMAIL_A, process.env.ALPHA_PASSWORD);
const teamA = process.env.ALPHA_TEAM_A_ID;
const teamB = process.env.ALPHA_TEAM_B_ID;
const contactId = process.env.ALPHA_CONTACT_ID;

// 계정 A 로 보는 화면. 컨택 설정은 **내 팀 운영진만** 볼 수 있으므로 teamA 를 쓴다
// (teamB 로 열면 백엔드가 PERMISSION_DENIED 를 주고 화면은 권한 없음 빈 상태가 된다 —
// 그것도 유효한 화면이지만 여기서 확인하려는 건 정상 경로다).
const PAGES = [
  { key: 'team-detail', url: `/teams/${teamB}` },
  { key: 'contact-new', url: `/teams/${teamB}/contact/new` },
  { key: 'inbox-list', url: '/my/team-contacts' },
  // Phase 2·3
  { key: 'contact-settings', url: `/teams/${teamA}/contact/settings` },
  ...(contactId ? [{ key: 'contact-detail', url: `/my/team-contacts/${contactId}` }] : []),
];

// 어드민 화면은 별도 계정이 필요하다(adminRole=ops). 자격증명이 없으면 조용히 건너뛴다 —
// 팀 화면 캡처까지 통째로 실패시키지 않는다.
const adminEmail = process.env.ALPHA_ADMIN_EMAIL;
const adminToken = adminEmail
  ? await login(adminEmail, process.env.ALPHA_ADMIN_PASSWORD ?? process.env.ALPHA_PASSWORD)
  : null;
const ADMIN_PAGES = adminToken
  ? [
      { key: 'admin-inquiries', url: '/admin/inquiries' },
      { key: 'admin-inquiries-report', url: '/admin/inquiries?category=report' },
    ]
  : [];
if (!adminToken) console.log('SKIP 어드민 화면 — ALPHA_ADMIN_EMAIL 미설정');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const theme of ['light', 'dark']) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    await ctx.addCookies([{
      name: 'teameet_v1_session', value: token,
      domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
    }]);
    for (const p of PAGES) {
      const file = path.join(OUT, `${p.key}-${theme}-${vp.key}.png`);
      try {
        const probe = await shoot(ctx, p.url, file, theme);
        report.push({ page: p.key, theme, vp: vp.key, ...probe, file });
        console.log(`OK   ${p.key} ${theme} ${vp.key}  bg=${probe.bg}  dark=${probe.darkApplied}  overflow=${probe.overflow} (${probe.scrollW}/${probe.innerW})`);
      } catch (e) {
        console.log(`FAIL ${p.key} ${theme} ${vp.key}: ${e.message}`);
        report.push({ page: p.key, theme, vp: vp.key, error: e.message });
      }
    }
    await ctx.close();

    if (adminToken) {
      const adminCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      await adminCtx.addCookies([{
        name: 'teameet_v1_session', value: adminToken,
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
      }]);
      for (const p of ADMIN_PAGES) {
        const file = path.join(OUT, `${p.key}-${theme}-${vp.key}.png`);
        try {
          const probe = await shoot(adminCtx, p.url, file, theme);
          report.push({ page: p.key, theme, vp: vp.key, ...probe, file });
          console.log(`OK   ${p.key} ${theme} ${vp.key}  bg=${probe.bg}  dark=${probe.darkApplied}  overflow=${probe.overflow} (${probe.scrollW}/${probe.innerW})`);
        } catch (e) {
          console.log(`FAIL ${p.key} ${theme} ${vp.key}: ${e.message}`);
          report.push({ page: p.key, theme, vp: vp.key, error: e.message });
        }
      }
      await adminCtx.close();
    }
  }
}
await browser.close();
console.log('\n=== 가로 오버플로 (390 에서 반드시 false 여야 함) ===');
for (const r of report.filter((x) => x.vp === 'mobile')) {
  console.log(`${r.page} ${r.theme}: overflow=${r.overflow ?? 'ERR'}`);
}
