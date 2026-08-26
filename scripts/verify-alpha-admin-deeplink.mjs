/**
 * 어드민 문의 목록의 필터 딥링크를 alpha 에서 실측한다.
 *
 * 유닛 테스트는 next/navigation 을 목한 위에서만 증명한다 — 실제 App Router 와 브라우저
 * 주소창에서 도는지는 여기서 처음 확인된다. 세 가지를 본다:
 *   1) 쿼리가 붙은 주소로 들어가면 그 필터가 걸린 채 렌더되고, 그 필터가 API 까지 실리는가
 *   2) 화면에서 필터를 바꾸면 주소가 갱신되는가(공유할 링크를 만들 수 있는가)
 *   3) 허용 목록에 없는 값이 서버로 새지 않고 목록도 정상인가
 *
 * **대기는 전부 조건 기반이다.** 고정 waitForTimeout 은 느린 alpha 에서 거짓 실패를,
 * 빠를 때는 불필요한 지연을 낸다 — 목록 응답과 주소 변화 자체를 기다린다.
 *
 * 자격증명은 환경변수로만 받는다(이 저장소는 PUBLIC).
 *   ALPHA_ADMIN_EMAIL / ALPHA_ADMIN_PASSWORD (없으면 ALPHA_PASSWORD)
 */
import { chromium } from '@playwright/test';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const NAV_TIMEOUT = 45_000;
const WAIT_TIMEOUT = 20_000;

const email = process.env.ALPHA_ADMIN_EMAIL;
const password = process.env.ALPHA_ADMIN_PASSWORD ?? process.env.ALPHA_PASSWORD;
if (!email || !password) {
  throw new Error('필수 환경변수가 없습니다: ALPHA_ADMIN_EMAIL, ALPHA_ADMIN_PASSWORD(또는 ALPHA_PASSWORD)');
}

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) throw new Error(`login failed ${res.status}`);
const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
const token = cookies.map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);
if (!token) throw new Error('세션 쿠키를 못 받았다');

// /admin/inquiries/pending-count 같은 이웃 엔드포인트를 제외하고 목록 호출만 골라낸다.
// 요청·응답 양쪽이 같은 기준을 써야 한다 — 한쪽만 좁히면 거짓 통과가 남는다.
function isListCall(url) {
  return /\/api\/v1\/admin\/inquiries\?/.test(url);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** 주소가 조건을 만족할 때까지 기다린다. 실패는 예외가 아니라 판정으로 돌려준다. */
async function urlSettles(page, predicate) {
  try {
    await page.waitForURL((url) => predicate(new URL(url).search), { timeout: WAIT_TIMEOUT });
    return { ok: true, search: new URL(page.url()).search };
  } catch {
    return { ok: false, search: new URL(page.url()).search };
  }
}

/** 목록 API 응답 하나를 기다린다(goto/조작 **전에** 걸어야 놓치지 않는다). */
function awaitListResponse(page) {
  return page.waitForResponse((r) => isListCall(r.url()), { timeout: WAIT_TIMEOUT }).catch(() => null);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// secure 를 BASE 프로토콜에서 계산한다. http 대상에서 고정 secure 는 쿠키를 조용히 버려
// **로그인은 성공했는데 화면은 비인증** 인 상태로 측정하게 만든다.
const isHttps = new URL(BASE).protocol === 'https:';
await ctx.addCookies([{
  name: 'teameet_v1_session', value: token,
  domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: isHttps, sameSite: 'Lax',
}]);

// 1) 딥링크로 들어가면 필터가 걸린 채 렌더되고, 그 필터가 API 까지 실리는가
{
  const page = await ctx.newPage();
  const listCalls = [];
  page.on('request', (r) => { if (isListCall(r.url())) listCalls.push(r.url()); });

  const firstList = awaitListResponse(page);
  await page.goto(`${BASE}/admin/inquiries?category=report&reportReason=spam`, {
    waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
  });
  await firstList;

  const categoryValue = await page.getByLabel('문의 분류 필터').inputValue();
  check('딥링크로 분류가 report 로 선택된다', categoryValue === 'report', `분류=${categoryValue}`);

  const reasonSelect = page.getByLabel('신고 사유 필터');
  const reasonVisible = await reasonSelect.isVisible().catch(() => false);
  const reasonValue = reasonVisible ? await reasonSelect.inputValue() : null;
  check('딥링크로 사유 필터가 나타나고 spam 이 선택된다', reasonVisible && reasonValue === 'spam', `보임=${reasonVisible} 값=${reasonValue}`);

  const sentReason = listCalls.some((u) => u.includes('reportReason=spam'));
  check('API 요청에 reportReason=spam 이 실린다', sentReason, listCalls.at(-1)?.split('/api/v1')[1] ?? '(목록 요청 없음)');
  await page.close();
}

// 2) 화면에서 필터를 바꾸면 주소가 갱신되는가
{
  const page = await ctx.newPage();
  const firstList = awaitListResponse(page);
  await page.goto(`${BASE}/admin/inquiries`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await firstList;

  await page.getByLabel('문의 분류 필터').selectOption('report');
  const afterCategory = await urlSettles(page, (s) => s.includes('category=report'));
  check('분류를 고르면 주소에 category=report 가 붙는다', afterCategory.ok, `주소=${afterCategory.search || '(빈 쿼리)'}`);

  await page.getByLabel('신고 사유 필터').selectOption('spam');
  const afterReason = await urlSettles(page, (s) => s.includes('reportReason=spam'));
  check('사유를 고르면 주소에 reportReason=spam 이 붙는다', afterReason.ok, `주소=${afterReason.search || '(빈 쿼리)'}`);

  await page.getByLabel('문의 분류 필터').selectOption('');
  const afterClear = await urlSettles(page, (s) => s === '');
  check('분류를 비우면 쿼리가 사라진다(사유도 함께)', afterClear.ok, `주소=${afterClear.search || '(빈 쿼리)'}`);
  await page.close();
}

// 3) 허용 목록에 없는 값이 서버로 새지 않는가
{
  const page = await ctx.newPage();
  const listCalls = [];
  const listStatuses = [];
  page.on('request', (r) => { if (isListCall(r.url())) listCalls.push(r.url()); });
  page.on('response', (r) => { if (isListCall(r.url())) listStatuses.push(r.status()); });

  const firstList = awaitListResponse(page);
  await page.goto(`${BASE}/admin/inquiries?status=bogus&category=nope&reportReason=whatever`, {
    waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
  });
  await firstList;

  const leaked = listCalls.some((u) => /status=bogus|category=nope|reportReason=whatever/.test(u));
  check('잘못된 값이 API 로 새지 않는다', !leaked, listCalls.at(-1)?.split('/api/v1')[1] ?? '(목록 요청 없음)');
  check(
    '목록이 400 없이 뜬다',
    listStatuses.length > 0 && listStatuses.every((code) => code < 400),
    `목록 응답=${listStatuses.join(',') || '(목록 응답 없음)'}`,
  );
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length > 0) process.exitCode = 1;
