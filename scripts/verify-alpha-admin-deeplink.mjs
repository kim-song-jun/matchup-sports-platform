/**
 * 어드민 문의 목록의 필터 딥링크를 alpha 에서 실측한다.
 *
 * 유닛 테스트는 next/navigation 을 목한 위에서만 증명한다 — 실제 App Router 와 브라우저
 * 주소창에서 도는지는 여기서 처음 확인된다. 세 가지를 본다:
 *   1) 쿼리가 붙은 주소로 들어가면 그 필터가 걸린 채 렌더되는가
 *   2) 화면에서 필터를 바꾸면 주소가 갱신되는가(공유할 링크를 만들 수 있는가)
 *   3) 허용 목록에 없는 값이 서버로 새지 않고 무시되는가
 *
 * 자격증명은 환경변수로만 받는다(이 저장소는 PUBLIC).
 *   ALPHA_ADMIN_EMAIL / ALPHA_ADMIN_PASSWORD (없으면 ALPHA_PASSWORD)
 */
import { chromium } from '@playwright/test';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const email = process.env.ALPHA_ADMIN_EMAIL;
const password = process.env.ALPHA_ADMIN_PASSWORD ?? process.env.ALPHA_PASSWORD;
if (!email || !password) throw new Error('필수 환경변수가 없습니다: ALPHA_ADMIN_EMAIL, ALPHA_ADMIN_PASSWORD(또는 ALPHA_PASSWORD)');

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

function listCalls(urls) {
  return urls.filter(isListCall);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// secure 를 BASE 프로토콜에서 계산한다. 이 저장소의 다른 alpha 캡처 스크립트들은
// secure: true 로 고정하는데, 그것들과 달리 이 스크립트는 CAPTURE_BASE 로 대상을 바꿀 수
// 있다고 문서에 적어뒀다 — http 대상에서 고정 secure 는 쿠키를 조용히 버려 **로그인은
// 성공했는데 화면은 비인증** 인 상태로 측정하게 만든다. 그러면 원인을 찾기 어렵다.
const isHttps = new URL(BASE).protocol === 'https:';
await ctx.addCookies([{
  name: 'teameet_v1_session', value: token,
  domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: isHttps, sameSite: 'Lax',
}]);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// 1) 딥링크로 들어가면 필터가 걸린 채 렌더되는가
{
  const page = await ctx.newPage();
  const apiCalls = [];
  page.on('request', (r) => {
    // 페이지 주소 자체도 /admin/inquiries? 를 포함한다 — API 경로로 좁히지 않으면
    // 브라우저 주소를 API 요청으로 착각해 거짓 통과·거짓 실패가 난다(처음에 그랬다).
    if (r.url().includes('/api/v1/admin/inquiries')) apiCalls.push(r.url());
  });
  await page.goto(`${BASE}/admin/inquiries?category=report&reportReason=spam`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);

  const categoryValue = await page.getByLabel('문의 분류 필터').inputValue();
  const reasonVisible = await page.getByLabel('신고 사유 필터').isVisible().catch(() => false);
  const reasonValue = reasonVisible ? await page.getByLabel('신고 사유 필터').inputValue() : null;
  check('딥링크로 분류가 report 로 선택된다', categoryValue === 'report', `분류=${categoryValue}`);
  check('딥링크로 사유 필터가 나타나고 spam 이 선택된다', reasonVisible && reasonValue === 'spam', `보임=${reasonVisible} 값=${reasonValue}`);

  const list = listCalls(apiCalls);
  const sentReason = list.some((u) => u.includes('reportReason=spam'));
  check('API 요청에 reportReason=spam 이 실린다', sentReason, list.at(-1)?.split('/api/v1')[1] ?? '(목록 요청 없음)');
  await page.close();
}

// 2) 화면에서 필터를 바꾸면 주소가 갱신되는가
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/inquiries`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3000);
  await page.getByLabel('문의 분류 필터').selectOption('report');
  await page.waitForTimeout(1500);
  const afterCategory = new URL(page.url()).search;
  check('분류를 고르면 주소에 category=report 가 붙는다', afterCategory.includes('category=report'), `주소=${afterCategory || '(빈 쿼리)'}`);

  await page.getByLabel('신고 사유 필터').selectOption('spam');
  await page.waitForTimeout(1500);
  const afterReason = new URL(page.url()).search;
  check('사유를 고르면 주소에 reportReason=spam 이 붙는다', afterReason.includes('reportReason=spam'), `주소=${afterReason}`);

  await page.getByLabel('문의 분류 필터').selectOption('');
  await page.waitForTimeout(1500);
  const afterClear = new URL(page.url()).search;
  check('분류를 비우면 쿼리가 사라진다(사유도 함께)', afterClear === '', `주소=${afterClear || '(빈 쿼리)'}`);
  await page.close();
}

// 3) 허용 목록에 없는 값이 서버로 새지 않는가
{
  const page = await ctx.newPage();
  const apiCalls = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/admin/inquiries')) apiCalls.push(r.url()); });
  // 응답도 **목록 호출만** 모은다. 이웃 엔드포인트(/pending-count)를 섞으면 목록 요청이
  // 아예 안 나가도 그쪽 200 때문에 통과해버린다 — 요청 쪽만 좁히고 여기를 빠뜨렸었다.
  const listResponses = [];
  page.on('response', (r) => {
    if (isListCall(r.url())) listResponses.push(r.status());
  });
  await page.goto(`${BASE}/admin/inquiries?status=bogus&category=nope&reportReason=whatever`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);

  const list = listCalls(apiCalls);
  const leaked = list.some((u) => /status=bogus|category=nope|reportReason=whatever/.test(u));
  check('잘못된 값이 API 로 새지 않는다', !leaked, list.at(-1)?.split('/api/v1')[1] ?? '(목록 요청 없음)');
  check(
    '목록이 400 없이 뜬다',
    listResponses.length > 0 && listResponses.every((code) => code < 400),
    `목록 응답=${listResponses.join(',') || '(목록 응답 없음)'}`,
  );
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length > 0) process.exitCode = 1;
