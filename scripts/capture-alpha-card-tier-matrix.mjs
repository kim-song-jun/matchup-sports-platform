#!/usr/bin/env node
/**
 * alpha 에 배포된 선수 카드 CSS 가 티어 5단계 × 형태 2벌을 실제로 그리는지 실측한다.
 *
 * 실계정은 전부 브론즈(0~4경기)라 상위 티어를 데이터로는 볼 수 없다 -- 대신 실제
 * 페이지의 카드 루트에서 data-tier / data-shape 속성만 바꿔 **배포된 CSS 그대로**
 * 10가지 변형을 렌더한다(데이터 조작이 아니라 속성 강제 렌더임을 파일명·보고에 명시).
 * 뒷면은 실제 뒤집기 버튼을 눌러 캡처한다.
 *
 * 자격증명은 저장소에 적지 않는다 -- 환경변수로만 받는다:
 *   ALPHA_PASSWORD=... ALPHA_ACCOUNT=alpha.e2e.player01@teameet.test \
 *     node scripts/capture-alpha-card-tier-matrix.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PASSWORD = process.env.ALPHA_PASSWORD;
const ACCOUNT = process.env.ALPHA_ACCOUNT;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/tier-matrix';

if (!PASSWORD || !ACCOUNT) {
  console.error('ALPHA_PASSWORD 와 ALPHA_ACCOUNT 가 필요합니다.');
  process.exit(1);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`${email} 로그인 실패 ${res.status}`);
  const token = (res.headers.getSetCookie?.() ?? [])
    .map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1])
    .find(Boolean);
  if (!token) throw new Error('세션 쿠키 없음');
  const me = await fetch(`${BASE}/api/v1/auth/me`, {
    headers: { cookie: `teameet_v1_session=${token}` },
  }).then((r) => r.json());
  return { token, userId: me.data.user.id };
}

const TIERS = ['bronze', 'silver', 'gold', 'legend', 'special'];

async function main() {
  await mkdir(OUT, { recursive: true });
  const { token, userId } = await login(ACCOUNT);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' },
  ]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/users/${userId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-player-card', { timeout: 20000 });
  await page.waitForTimeout(2000);

  const card = page.locator('.tm-player-card').first();

  for (const shape of ['rect', 'shield']) {
    for (const tier of TIERS) {
      await card.evaluate((el, [s, t]) => {
        el.setAttribute('data-shape', s);
        el.setAttribute('data-tier', t);
      }, [shape, tier]);
      // 티어 등장 애니메이션·광택이 자리잡을 시간.
      await page.waitForTimeout(900);
      const file = path.join(OUT, `forced-${shape}-${tier}.png`);
      await card.screenshot({ path: file });
      console.log('찍음', file);
    }
  }

  // 뒷면은 실제 버튼으로 뒤집어서(gold shield 변형) -- 산식·성향 태그가 그려지는지.
  await card.evaluate((el) => {
    el.setAttribute('data-shape', 'shield');
    el.setAttribute('data-tier', 'gold');
  });
  await page.getByRole('button', { name: /카드 뒤집기/ }).click();
  await page.waitForTimeout(1100);
  await card.screenshot({ path: path.join(OUT, 'forced-shield-gold-back.png') });
  console.log('찍음 (뒷면)', path.join(OUT, 'forced-shield-gold-back.png'));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
