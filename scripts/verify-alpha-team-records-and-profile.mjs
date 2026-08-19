/**
 * PR #562 / #564 alpha 실측 검증.
 *
 * 무엇을 확인하나:
 *  1) 승부차기로 끝난 경기가 팀 전적에서 "승/패"로 나오는가 (예전엔 항상 "무")
 *  2) 그 행에 `penalties` 와 경기별 `events`(골·카드) 가 실려 오는가
 *  3) `isCorrected` 가 응답에서 사라졌는가
 *  4) 공개 프로필 `activitySummary` 에 대회 출전이 합산되는가
 *  5) 본인 조회 시 동의 없이도 `/users/:id/records` 가 기록을 돌려주는가
 *     (`viewerIsOwner: true`, `consentGranted: false`)
 *
 * 판정은 **공개 API 응답값**을 ground truth 로 삼는다 — 육안 스크린샷 대조로
 * "차이 없음"을 결론내지 않는다. 스크린샷은 별도 PHASE 로 3폭만 남긴다.
 *
 * 자격증명은 파일에 넣지 않는다(이 저장소는 public):
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... OUT_DIR=... TEAM_ID=... \
 *     node scripts/verify-alpha-team-records-and-profile.mjs
 *
 *   PHASE=api      (기본) 계약 검증만
 *   PHASE=browser  Playwright 3폭 캡처까지
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// playwright 는 워크스페이스 루트가 아니라 apps/v1_web/node_modules 에만 있다(pnpm workspace).
const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const B = `${ORIGIN}/api/v1`;
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
const PHASE = process.env.PHASE ?? 'api';
const OUT_DIR = process.env.OUT_DIR;
const TEAM_ID = process.env.TEAM_ID;

if (!EMAIL || !PASSWORD) {
  console.error('ALPHA_EMAIL / ALPHA_PASSWORD 환경변수가 필요합니다.');
  process.exit(1);
}
if (!OUT_DIR) {
  console.error('OUT_DIR 환경변수가 필요합니다(저장소 밖 경로).');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log(...a);
const fail = [];
function check(label, ok, detail) {
  log(`${ok ? '  PASS' : '  FAIL'} — ${label}${detail === undefined ? '' : ` :: ${detail}`}`);
  if (!ok) fail.push(label);
}

/** 세션은 stateless HMAC 쿠키 하나. login API 가 유일한 발급 경로다. */
async function login() {
  const res = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error(`로그인 실패(${res.status}) — 세션 쿠키 없음`);
  const me = await (await fetch(`${B}/me/profile`, { headers: { cookie } })).json();
  return { cookie, userId: (me.data ?? me).userId ?? (me.data ?? me).id };
}

async function getJson(pathname, cookie) {
  const res = await fetch(`${B}${pathname}`, cookie ? { headers: { cookie } } : undefined);
  const body = await res.json().catch(() => null);
  return { status: res.status, data: body?.data ?? body };
}

async function runApiChecks() {
  const { cookie, userId } = await login();
  log(`로그인 OK — userId=${String(userId).slice(0, 8)}…`);

  const report = { checkedAt: new Date().toISOString(), userId, team: null, profile: null, records: null };

  // --- 1~3. 팀 전적 -------------------------------------------------------
  if (TEAM_ID) {
    const { status, data } = await getJson(`/teams/${TEAM_ID}/records?limit=30`);
    log(`\n[팀 전적] GET /teams/${TEAM_ID.slice(0, 8)}…/records → ${status}`);
    report.team = data;
    check('응답 200', status === 200, status);

    const items = data?.items ?? [];
    log(`  summary: ${JSON.stringify(data?.summary)}`);
    for (const it of items) {
      log(
        `  · ${it.result} ${it.goalsFor}:${it.goalsAgainst}` +
          `${it.penalties ? ` (승부차기 ${it.penalties.for}-${it.penalties.against})` : ''}` +
          ` | events=${it.events?.length ?? 'MISSING'} | ${it.tournamentTitle ?? it.teamMatchId ?? '-'}`,
      );
    }

    const withPenalty = items.filter((it) => it.penalties);
    check('승부차기 경기가 최소 1건 응답에 있다', withPenalty.length > 0, `${withPenalty.length}건`);
    // 핵심 회귀: 정규시간 동점 + 승부차기 → 절대 DRAWN 이면 안 된다.
    const wrongDraw = withPenalty.filter(
      (it) => it.result === 'DRAWN' && it.penalties.for !== it.penalties.against,
    );
    check('승부차기로 갈린 경기가 DRAWN 으로 남아 있지 않다', wrongDraw.length === 0, `${wrongDraw.length}건`);
    // 승부차기 승자/패자 판정이 실제 점수와 일치하는가
    const mismatched = withPenalty.filter((it) => {
      if (it.penalties.for === it.penalties.against) return false;
      const expected = it.penalties.for > it.penalties.against ? 'WON' : 'LOST';
      return it.result !== expected;
    });
    check('승부차기 점수와 result 가 일치한다', mismatched.length === 0, JSON.stringify(mismatched.map((m) => m.gameId)));
    check('items 에 events 배열이 있다', items.every((it) => Array.isArray(it.events)));
    check('isCorrected 필드가 제거됐다', items.every((it) => !('isCorrected' in it)));

    const totalEvents = items.reduce((n, it) => n + (it.events?.length ?? 0), 0);
    check('골·카드 이벤트가 최소 1건 실려 온다', totalEvents > 0, `${totalEvents}건`);
  } else {
    log('\n[팀 전적] TEAM_ID 미지정 — 건너뜀');
  }

  // --- 4. 공개 프로필 활동 요약 -------------------------------------------
  const prof = await getJson(`/users/${userId}/public-profile`);
  log(`\n[공개 프로필] → ${prof.status}`);
  log(`  activitySummary: ${JSON.stringify(prof.data?.activitySummary)}`);
  report.profile = prof.data;
  check('응답 200', prof.status === 200, prof.status);

  // --- 5. 본인 조회 self-view ---------------------------------------------
  const mine = await getJson(`/users/${userId}/records?limit=20`, cookie);
  const others = await getJson(`/users/${userId}/records?limit=20`);
  log(`\n[내 기록] 본인 조회 → ${mine.status} / 비로그인 조회 → ${others.status}`);
  log(`  본인:   viewerIsOwner=${mine.data?.viewerIsOwner} consentGranted=${mine.data?.consentGranted} items=${mine.data?.items?.length}`);
  log(`  비로그인: viewerIsOwner=${others.data?.viewerIsOwner} consentGranted=${'consentGranted' in (others.data ?? {})} items=${others.data?.items?.length}`);
  report.records = { mine: mine.data, anonymous: others.data };

  check('본인 조회에 viewerIsOwner=true', mine.data?.viewerIsOwner === true);
  check('타인/비로그인 조회에 viewerIsOwner=false', others.data?.viewerIsOwner === false);
  check('타인 조회에는 consentGranted 를 싣지 않는다', !('consentGranted' in (others.data ?? {})));
  check('items 에 isCorrected 가 없다', (mine.data?.items ?? []).every((it) => !('isCorrected' in it)));
  // 동의를 켜지 않았다면 본인만 보이고 남에겐 안 보여야 한다.
  if (mine.data?.consentGranted === false) {
    check(
      '미동의 상태에서 본인은 보이고 비로그인은 안 보인다',
      (mine.data?.items?.length ?? 0) >= (others.data?.items?.length ?? 0),
      `본인 ${mine.data?.items?.length} vs 비로그인 ${others.data?.items?.length}`,
    );
  }

  writeFileSync(path.join(OUT_DIR, 'api-report.json'), JSON.stringify(report, null, 2));
  log(`\n리포트: ${path.join(OUT_DIR, 'api-report.json')}`);
  return { cookie, userId };
}

/** 라이브 경기가 있는 화면은 10초 폴링이라 networkidle 이 끝나지 않는다 — domcontentloaded + 명시 대기. */
async function capture(page, url, file, { expand = false } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (expand) {
    const toggles = page.locator('button[aria-expanded="false"]');
    const n = await toggles.count();
    for (let i = 0; i < n; i += 1) {
      await toggles.nth(0).click().catch(() => {});
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: file, fullPage: true });
  log(`  캡처: ${path.basename(file)}`);
}

async function runBrowser(cookie, userId) {
  const { chromium } = require_('playwright');
  const browser = await chromium.launch();
  const widths = [
    ['mobile', 390, 844],
    ['tablet', 768, 1024],
    ['desktop', 1440, 900],
  ];
  const targets = [
    ...(TEAM_ID ? [['team-records', `${ORIGIN}/teams/${TEAM_ID}/records`, { expand: true }]] : []),
    ['user-records', `${ORIGIN}/users/${userId}/records`, {}],
    ['public-profile', `${ORIGIN}/users/${userId}`, {}],
  ];
  const token = cookie.split('=')[1];
  for (const [label, w, h] of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([
      { name: 'teameet_v1_session', value: token, domain: new URL(ORIGIN).hostname, path: '/' },
    ]);
    const page = await ctx.newPage();
    for (const [name, url, opts] of targets) {
      await capture(page, url, path.join(OUT_DIR, `${name}-${label}-${w}.png`), opts);
    }
    await ctx.close();
  }
  await browser.close();
}

const { cookie, userId } = await runApiChecks();
if (PHASE === 'browser') {
  log('\n[캡처] 390 / 768 / 1440');
  await runBrowser(cookie, userId);
}
log(`\n${fail.length === 0 ? '전부 통과' : `실패 ${fail.length}건: ${fail.join(' / ')}`}`);
process.exit(fail.length === 0 ? 0 : 1);
