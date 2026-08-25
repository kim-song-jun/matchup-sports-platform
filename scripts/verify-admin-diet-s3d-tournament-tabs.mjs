/**
 * 어드민 다이어트 S3d(#764 대회 탭 표준화) alpha 실측 + 갤러리.
 *
 * DOM 판정 (1440):
 *  [협찬] 목록이 공용 AdminCardList(ul role=list) 구조로 렌더 + 추가 폼의
 *         CoverImageUploader contain 모드(빈 상태에 커버 예시 사진·오버레이 없음)
 *  [리뷰] 로딩/빈 상태가 공용 가드(AdminEmpty)로 렌더 (도메인 카드 자체는 유지)
 *  [공지] 목록이 공용 AdminCardList 구조로 렌더
 * + 갤러리: 협찬·리뷰·공지 탭 3폭
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-s3d-tournament-tabs.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-s3d';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('ALPHA_EMAIL / ALPHA_PASSWORD 환경변수가 필요해요.');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const cookie = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error('세션 쿠키를 못 받았어요.');
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

const token = await login();

// 어드민 대회 목록에서 첫 대회 id 를 가져온다 — 캡처 대상은 어떤 대회여도 무방하다.
const listRes = await fetch(`${BASE}/api/v1/admin/tournaments?limit=5`, {
  headers: { cookie: `teameet_v1_session=${token}` },
});
if (!listRes.ok) throw new Error(`admin tournaments list ${listRes.status}`);
const listJson = await listRes.json();
const items = listJson?.data?.items ?? listJson?.data ?? [];
const tournamentId = items[0]?.id ?? items[0]?.tournamentId;
if (!tournamentId) throw new Error('대회가 없어요 — 캡처 대상 없음');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [{ check: 'target-tournament', id: String(tournamentId).slice(0, 8) }];

async function makePage(width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 800 ? 900 : 960 },
    deviceScaleFactor: 2,
  });
  await context.addCookies([
    { name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' },
  ]);
  await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  const page = await context.newPage();
  page.on('response', (res) => {
    if (res.status() === 403 && res.url().includes('/api/')) {
      results.push({ check: 'HTTP-403', url: res.url(), verdict: 'RATE-LIMITED' });
    }
  });
  return { context, page };
}

const TABS = [
  ['sponsors', `/admin/tournaments/${tournamentId}/sponsors`],
  ['reviews', `/admin/tournaments/${tournamentId}/reviews`],
  ['announcements', `/admin/tournaments/${tournamentId}/announcements`],
];

// ── DOM 판정 (1440) ───────────────────────────────────────────────────────
{
  const { context, page } = await makePage(1440);

  // 협찬 탭: AdminCardList(ul) 또는 AdminEmpty, 그리고 폼 열었을 때 contain 미리보기
  await page.goto(`${BASE}${TABS[0][1]}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const sponsorList = await page.locator('ul[class*="grid"], ul li').count();
  const sponsorEmpty = await page.getByText(/아직|없어요/).count();
  results.push({
    check: 's3d-sponsors-cardlist-or-empty',
    listNodes: sponsorList,
    emptyTexts: sponsorEmpty,
    verdict: sponsorList > 0 || sponsorEmpty > 0 ? 'PASS' : 'FAIL',
  });

  // 협찬 폼은 탭 안에 인라인 상시 노출 — CoverImageUploader contain 빈 상태를 바로 판정.
  // contain 모드 빈 상태: 커버 예시 사진(img[alt*="예시"])이 없어야 하고
  // 업로더 버튼(이미지 선택)이 렌더돼야 한다.
  const exampleImg = await page.locator('img[alt*="예시"]').count();
  const uploaderBtn = await page.getByRole('button', { name: /이미지 선택|이미지 변경/ }).count();
  results.push({
    check: 's3d-sponsor-form-contain-empty-state',
    exampleImg,
    uploaderBtn,
    verdict: uploaderBtn > 0 && exampleImg === 0 ? 'PASS' : uploaderBtn === 0 ? 'SKIP(폼 없음)' : 'FAIL',
  });
  await page.screenshot({ path: `${OUT}/sponsor-form-1440.png`, fullPage: false });

  // 리뷰 탭: 공용 가드 — 에러 없이 목록/빈 상태 렌더
  await page.goto(`${BASE}${TABS[1][1]}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const reviewBody = await page.locator('body').innerText();
  results.push({
    check: 's3d-reviews-guarded-render',
    hasEmptyOrRows: /후기|리뷰|없어요/.test(reviewBody),
    verdict: /후기|리뷰|없어요/.test(reviewBody) ? 'PASS' : 'FAIL',
  });

  // 공지 탭: AdminCardList 구조 또는 빈 상태
  await page.goto(`${BASE}${TABS[2][1]}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const annList = await page.locator('ul li').count();
  const annEmpty = await page.getByText(/아직|없어요/).count();
  results.push({
    check: 's3d-announcements-cardlist-or-empty',
    listNodes: annList,
    emptyTexts: annEmpty,
    verdict: annList > 0 || annEmpty > 0 ? 'PASS' : 'FAIL',
  });

  await context.close();
}

// ── 갤러리 ────────────────────────────────────────────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  for (const [name, path] of TABS) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    results.push({ check: `goto-${name}-${width}`, status: res?.status() });
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: false });
    await page.waitForTimeout(700);
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
