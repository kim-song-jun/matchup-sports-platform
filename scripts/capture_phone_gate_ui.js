// 휴대폰 인증 전역 게이트 UI 캡처 — 미인증/인증완료 상태를 3폭(390/768/1440)으로 담는다.
// 사용: node scripts/capture_phone_gate_ui.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.CAPTURE_BASE_URL || 'http://localhost:3013';
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'phone-gate');
// 세션은 이메일로만 심는다 — 시드가 만드는 userId 는 실행할 때마다 달라져서 UUID 를 박아 두면
// 다른 환경에서 그 계정으로 인증되지 않는다(백엔드는 x-v1-user-id 를 먼저 해석한다).
const UNVERIFIED = { email: process.env.CAPTURE_UNVERIFIED_EMAIL || 'member@teameet.v1' };
const VERIFIED = { email: process.env.CAPTURE_VERIFIED_EMAIL || 'host@teameet.v1' };

// dev 오버레이(Next devtools 버튼·토스트)는 캡처마다 좌하단에 끼어들어 갤러리를 더럽힌다.
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

async function newContext(browser, viewport, user) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((session) => {
    window.localStorage.removeItem('teameet.v1.userId');
    window.localStorage.setItem('teameet.v1.userEmail', session.email);
  }, user);
  return context;
}

async function shoot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(3000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  // 폰트 로딩 전에 찍으면 같은 화면이 실행마다 다르게 나온다.
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('captured', name);
}

(async () => {
  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    // 미인증 계정: 홈 상시 배너 / 마이페이지 인증 카드 / 계정 설정 휴대폰 행
    const unverified = await newContext(browser, viewport, UNVERIFIED);
    const page = await unverified.newPage();

    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await shoot(page, `home-unverified-${viewport.key}`);

    await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
    await shoot(page, `my-unverified-${viewport.key}`);

    await page.goto(`${BASE}/my/settings`, { waitUntil: 'domcontentloaded' });
    await shoot(page, `settings-unverified-${viewport.key}`);

    // 차단 모달: 알림 설정 토글이 실제 PATCH 를 보내 403 을 받는 경로
    await page.goto(`${BASE}/my/settings/notifications`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // 브라우저 알림 토글은 권한이 없으면 disabled 라 클릭해도 요청이 나가지 않는다 —
    // 실제 PATCH 를 보내는 알림 선호도 토글을 이름으로 집는다.
    const toggle = page.getByRole('switch', { name: '매치 승인 알림' });
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    await toggle.click();
    // 모달이 실제로 떴는지 확인하고 찍는다. 클릭 실패를 삼키면 모달 없는 화면이 '차단 모달'
    // 증거로 남는다 — 이 스크립트에서 실제로 한 번 그렇게 잘못 캡처된 적이 있다.
    await page.getByText('휴대폰 본인인증이 필요해요').waitFor({ state: 'visible', timeout: 15000 });
    await shoot(page, `blocked-modal-${viewport.key}`);
    await unverified.close();

    // 인증 완료 계정: 마이페이지 뱃지 / 계정 설정 인증 완료 표시
    const verified = await newContext(browser, viewport, VERIFIED);
    const verifiedPage = await verified.newPage();

    await verifiedPage.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
    await shoot(verifiedPage, `my-verified-${viewport.key}`);

    await verifiedPage.goto(`${BASE}/my/settings`, { waitUntil: 'domcontentloaded' });
    await shoot(verifiedPage, `settings-verified-${viewport.key}`);
    await verified.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
