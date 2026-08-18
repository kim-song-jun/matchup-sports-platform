/**
 * alpha 홈 배너(알림 · 남은 후기) 390 폭 캡처.
 *
 * 로그인은 login API 로만 가능하다(alpha 는 프로덕션 모드라 헤더 dev 인증이 401).
 * 프로덕션 빌드의 hasStoredV1Session() 이 localStorage 힌트를 읽으므로 그것도 함께 심는다.
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/capture-alpha-home-banners.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/alpha-home-banners';
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
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' }]);
// 프로덕션 빌드는 쿠키가 아니라 이 localStorage 힌트로 로그인 여부를 판단한다.
await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));

// 알림 배너는 푸시 지원 + 권한 'default' + 미구독일 때만 뜬다. 헤드리스 크로미움은 PushManager 가
// 없어 'unsupported' 로 빠지므로 배너 자체를 볼 수 없다 — 레이아웃을 확인하려면 그 환경만 만들어
// 준다(컴포넌트·CSS 는 실제 배포본 그대로이고 DOM 은 건드리지 않는다).
if (process.env.CAPTURE_FORCE_PUSH_NUDGE === '1') {
  await context.addInitScript(() => {
    if (!('PushManager' in window)) {
      Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
    }
    Object.defineProperty(window, 'Notification', {
      value: Object.assign(function Notification() {}, { permission: 'default', requestPermission: async () => 'default' }),
      configurable: true,
    });
    window.localStorage.removeItem('teameet.v1.pushNudgeDismissed');
  });
}

const page = await context.newPage();
await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

await page.screenshot({ path: `${OUT}/home-390.png`, fullPage: false });

// 배너만 잘라 대비를 확인한다.
for (const [name, text] of [['banner-review', '남은 후기'], ['banner-push', '알림을 받아보세요']]) {
  const el = page.locator(`text=${text}`).first();
  if (await el.count()) {
    const card = el.locator('xpath=ancestor::*[contains(@class,"tm-card")][1]');
    const target = (await card.count()) ? card : el;
    await target.screenshot({ path: `${OUT}/${name}-390.png` }).catch(() => {});
    console.log(`${name}: 캡처됨`);
  } else {
    console.log(`${name}: 화면에 없음`);
  }
}

console.log('저장 위치:', OUT);
await browser.close();
