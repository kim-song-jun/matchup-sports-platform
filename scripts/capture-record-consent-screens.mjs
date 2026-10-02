/**
 * Task 154 기록 공개 화면 3폭 캡처 (📱390 / 📲768 / 🖥1440).
 *
 * 캡처 대상
 *  - P0-6 알림 착지 화면: `/my/settings/record-consent?from=tournament&tournamentId=...`
 *    (맥락 배너가 뜬 상태) 와 파라미터 없는 기본 화면(배너 없음) 둘 다.
 *  - P0-3 홈 넛지 배너: `/home` — 단 `pendingRecordCount > 0` 인 계정으로 로그인해야
 *    실제로 뜬다. 안 뜨면 그 사실을 그대로 기록한다(억지로 DOM 을 만들지 않는다).
 *
 * alpha 는 프로덕션 모드라 헤더 dev 인증이 401 이다 — login API 로만 세션을 받는다.
 * 자격증명은 **환경변수로만** 넘긴다(이 저장소는 PUBLIC).
 *
 * 세션 토큰을 이미 갖고 있으면 그걸 쓴다. alpha 의 login API 는 rate limit(429 +
 * retry-after)이 있어서, 캡처를 돌릴 때마다 로그인하면 금방 막힌다 — 한 번 받아 둔
 * 토큰을 여러 스크립트가 나눠 쓰는 게 이 저장소의 관례다(scripts/README-alpha-verify.md).
 *
 * 사용법 (권장):
 *   ALPHA_SESSION_TOKEN=... [TOURNAMENT_ID=...] \
 *     node scripts/capture-record-consent-screens.mjs [outDir]
 *
 * 토큰이 없을 때만:
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/capture-record-consent-screens.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/record-consent';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
const SESSION_TOKEN = process.env.ALPHA_SESSION_TOKEN;
const TOURNAMENT_ID = process.env.TOURNAMENT_ID ?? '';

if (!SESSION_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error('ALPHA_SESSION_TOKEN 또는 ALPHA_EMAIL/ALPHA_PASSWORD 가 필요해요.');
  process.exit(1);
}

const WIDTHS = [
  { key: 'mobile', width: 390, height: 900 },
  { key: 'tablet', width: 768, height: 1000 },
  { key: 'desktop', width: 1440, height: 1000 },
];

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

const token = SESSION_TOKEN ?? (await login());
await mkdir(OUT, { recursive: true });

// 서버가 실제로 무엇을 내려주는지 먼저 기록한다 — 배너가 안 뜬 이유를 나중에
// 스크린샷만 보고 추측하지 않기 위해서다.
const consentRes = await fetch(`${BASE}/api/v1/me/record-consent`, {
  headers: { cookie: `teameet_v1_session=${token}` },
});
const consentBody = await consentRes.text();
console.log(`GET /me/record-consent -> ${consentRes.status} ${consentBody}`);

const targets = [
  { name: 'home', path: '/home' },
  { name: 'consent-settings-plain', path: '/my/settings/record-consent' },
];
if (TOURNAMENT_ID) {
  targets.push({
    name: 'consent-settings-from-notification',
    path: `/my/settings/record-consent?from=tournament&tournamentId=${encodeURIComponent(TOURNAMENT_ID)}`,
  });
}

const browser = await chromium.launch();
const results = [];
for (const { key, width, height } of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.addCookies([
    { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' },
  ]);
  // 프로덕션 빌드는 쿠키가 아니라 이 localStorage 힌트로 로그인 여부를 판단한다.
  await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  const page = await context.newPage();
  for (const t of targets) {
    // 라이브 폴링이 있는 화면은 networkidle 이 끝나지 않는다 — domcontentloaded + 명시 대기.
    const resp = await page.goto(`${BASE}${t.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const file = `${OUT}/${t.name}-${key}-${width}.png`;
    await page.screenshot({ path: file, fullPage: false });
    // 캡처 41장을 통째로 날린 전례가 있다 — 상태코드를 반드시 남긴다(403 rate limit 감지).
    results.push({ target: t.name, width: key, httpStatus: resp?.status() ?? null, file });
    console.log(`${t.name} @${width} -> ${resp?.status()} ${file}`);
  }
  await context.close();
}
await browser.close();
await writeFile(`${OUT}/meta.json`, JSON.stringify({ base: BASE, consentBody, results }, null, 2));
console.log(`\n완료: ${OUT}/meta.json`);
