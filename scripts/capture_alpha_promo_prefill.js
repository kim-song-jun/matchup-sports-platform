// 대회 생성 4단계(상금·홍보) 홍보 카드 문구 자동 채움 검증 + 3폭 캡처.
//
// alpha 는 프로덕션 모드라 헤더 dev 인증이 401 이다 — POST /api/v1/auth/login 으로 세션
// 쿠키를 받아 주입한다(scripts/verify_alpha_promo_image_upload.js 와 같은 패턴).
// 자격증명은 환경변수로만 받고 파일·로그에 남기지 않는다.
//
// 이 스크립트는 4단계에서 "다음"을 누르지 않는다 — 초안 생성(POST)이 일어나지 않으므로
// alpha 에 대회가 만들어지지 않는다.
//
// 스크린샷 육안 대조로는 "문구가 채워졌는지"를 놓치기 쉬워, 실제 input 의 value 를 읽어
// 앞 단계 입력값과 함께 리포트에 남긴다.
//
// Run:
//   ALPHA_ADMIN_EMAIL=... ALPHA_ADMIN_PASSWORD=... node scripts/capture_alpha_promo_prefill.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const EMAIL = (process.env.ALPHA_ADMIN_EMAIL || '').trim();
const PASSWORD = process.env.ALPHA_ADMIN_PASSWORD || '';
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-promo-prefill');
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const VENUE = '서울월드컵보조경기장';
const PRIZE_SUMMARY = '우승팀 트로피 + 상금 300만원';
const WIDTHS = [
  ['mobile', 390, 844],
  ['tablet', 768, 900],
  ['desktop', 1440, 900],
];

if (!EMAIL || !PASSWORD) {
  console.error('ALPHA_ADMIN_EMAIL / ALPHA_ADMIN_PASSWORD 가 필요합니다.');
  process.exit(1);
}

async function loginForSessionCookie() {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`로그인 실패: HTTP ${response.status}`);
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const raw = setCookie.find((cookie) => cookie.startsWith('teameet_v1_session='));
  if (!raw) throw new Error('응답에 teameet_v1_session 쿠키가 없어요.');
  return raw.split(';')[0].slice('teameet_v1_session='.length);
}

const sessionCookie = (value) => ({
  name: 'teameet_v1_session',
  value,
  domain: 'alpha.teameet.co.kr',
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
});

const pad = (value) => String(value).padStart(2, '0');
const stamp = (daysFromNow, hour) => {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
};

/** 위저드 1~3단계를 채우고 상금·홍보 단계로 이동한다(4단계에서 멈춘다 — 서버 쓰기 없음). */
async function advanceToPromoStep(page) {
  const sport = page.locator('#sport-id');
  for (const option of await sport.locator('option').all()) {
    const value = await option.getAttribute('value');
    if (value) {
      await sport.selectOption(value);
      break;
    }
  }
  await page.locator('#title').fill('[검증] 홍보 문구 자동 채움');
  await page.getByRole('button', { name: '다음' }).click();

  await page.locator('#scheduled-at').fill(stamp(30, 10));
  await page.locator('#registration-deadline-at').fill(stamp(20, 10));
  await page.locator('#roster-deadline-at').fill(stamp(25, 10));
  const venue = page.locator('#venue');
  if (await venue.count()) await venue.fill(VENUE);
  await page.getByRole('button', { name: '다음' }).click();

  // 3단계(참가 조건)는 기본값이 이미 유효하므로 그대로 넘긴다.
  await page.getByRole('button', { name: '다음' }).click();
  await page.waitForTimeout(800);

  // 상금 요약은 4단계 안에 있다 — 입력하는 순간 홍보 카드의 상금 문구가 따라오는지까지 본다.
  const prizeSummary = page.locator('#prize-summary');
  if (await prizeSummary.count()) {
    await prizeSummary.fill(PRIZE_SUMMARY);
    await prizeSummary.blur();
    await page.waitForTimeout(400);
  }
}

/** 홍보 카드 입력칸의 실제 value — 육안 대조 대신 값으로 남긴다. */
async function readPromoInputs(page) {
  return page.evaluate(() => {
    const read = (suffix) =>
      Array.from(document.querySelectorAll(`input[id*="promo-"][id$="-${suffix}"]`)).map(
        (input) => input.value,
      );
    return {
      date: read('date'),
      teams: read('teams'),
      location: read('location'),
      prize: read('prize'),
      labels: Array.from(document.querySelectorAll('label'))
        .map((label) => label.textContent.trim())
        .filter((text) => ['강조 문구', '팀 문구', '날짜 문구', '장소 문구', '상금 문구'].includes(text)),
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sessionToken = await loginForSessionCookie();
  console.log('로그인 성공 — 세션 쿠키 확보');

  const browser = await chromium.launch();
  const report = {
    capturedAt: new Date().toISOString(),
    input: { scheduledAt: stamp(30, 10), venue: VENUE, prizeSummary: PRIZE_SUMMARY },
  };
  try {
    for (const [widthLabel, width, height] of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });
      await context.addCookies([sessionCookie(sessionToken)]);
      const page = await context.newPage();
      // networkidle 은 Socket.IO 연결 때문에 도달하지 않는다 — commit 후 폼이 뜰 때까지 기다린다.
      await page.goto(`${BASE}/admin/tournaments/new`, { waitUntil: 'commit', timeout: 60000 });
      await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
      await page.locator('#sport-id').waitFor({ state: 'visible', timeout: 60000 });
      await page.addStyleTag({ content: HIDE });
      await advanceToPromoStep(page);

      if (widthLabel === 'desktop') {
        report.promoInputs = await readPromoInputs(page);
      }

      // 홍보 카드 섹션만 — 위저드 전체는 세로가 너무 길어 문구가 안 보인다.
      // 위저드 상단 헤더·하단 CTA 는 position:fixed 라 섹션 element 캡처 위에 겹쳐 문구를
      // 가린다(실측). 이 변경과 무관한 chrome 이므로 캡처 동안만 숨긴다 — 레이아웃에는
      // 영향이 없도록 visibility 만 끈다.
      await page.evaluate(() => {
        // 홍보 카드 섹션 안에는 고정 요소가 없다 — 바깥의 헤더·CTA 만 숨긴다.
        const promoSections = Array.from(document.querySelectorAll('section')).filter((node) =>
          /홈 오늘의 추천|대회 목록 상단/.test(node.textContent || ''),
        );
        for (const element of document.querySelectorAll('body *')) {
          const position = getComputedStyle(element).position;
          if (position !== 'fixed' && position !== 'sticky') continue;
          if (promoSections.some((section) => section.contains(element))) continue;
          element.setAttribute('data-capture-hidden', '1');
          element.style.visibility = 'hidden';
        }
      });

      // hasText 는 조상 section 까지 매칭하므로 가장 안쪽(last)이 그 카드의 섹션이다.
      const section = page.locator('section').filter({ hasText: '홈 오늘의 추천' }).last();
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await section.screenshot({ path: path.join(OUT, `promo-home-${widthLabel}-${width}.png`) });

      const listSection = page.locator('section').filter({ hasText: '대회 목록 상단' }).last();
      await listSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await listSection.screenshot({
        path: path.join(OUT, `promo-list-${widthLabel}-${width}.png`),
      });

      // 전체 캡처는 실제 화면 그대로 — 숨겼던 고정 요소를 되돌린다.
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('[data-capture-hidden]')) {
          element.style.visibility = '';
          element.removeAttribute('data-capture-hidden');
        }
      });
      await page.screenshot({
        path: path.join(OUT, `step4-full-${widthLabel}-${width}.png`),
        fullPage: true,
      });
      console.log(`캡처 완료 — ${widthLabel} ${width}px`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
