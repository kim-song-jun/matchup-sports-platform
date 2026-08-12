// alpha 대회 홍보 이미지 검증 — 대용량 포스터 업로드가 413 없이 통과하는지 + 3폭 캡처.
//
// alpha 는 프로덕션 모드라 헤더 dev 인증이 401 로 막혀 있다(실측). 세션 쿠키가 필요하므로
// POST /api/v1/auth/login 으로 로그인해 Set-Cookie 를 쓴다. 자격증명은 환경변수로만 받고
// 파일·로그에 남기지 않는다.
//
// 실제 디코드 가능한 대용량 JPEG 이 필요하다 — 패딩으로 크기만 키운 파일은 캔버스가
// 디코드하지 못해 압축 경로를 타지 않으므로 이 수정을 전혀 검증하지 못한다. 그래서
// 페이지 안에서 노이즈 캔버스를 JPEG(q=1)로 인코딩해 원본을 만든다.
//
// Run:
//   ALPHA_ADMIN_EMAIL=... ALPHA_ADMIN_PASSWORD=... node scripts/verify_alpha_promo_image_upload.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const EMAIL = (process.env.ALPHA_ADMIN_EMAIL || '').trim();
const PASSWORD = process.env.ALPHA_ADMIN_PASSWORD || '';
const PHASE = (process.env.PHASE || 'after').trim(); // before | after
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-promo-image');
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
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

/** 페이지 안에서 노이즈 캔버스를 JPEG 으로 인코딩해 대용량 원본을 만든다. */
const MAKE_BIG_JPEG = `(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 4000;
  canvas.height = 3000;
  const context = canvas.getContext('2d');
  const image = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (Math.random() * 256) | 0;
    image.data[i + 1] = (Math.random() * 256) | 0;
    image.data[i + 2] = (Math.random() * 256) | 0;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 1));
  window.__bigPoster = new File([blob], 'big-poster.jpg', { type: 'image/jpeg' });
  return blob.size;
})()`;

/** 압축을 거치지 않고 원본 그대로 올렸을 때 서버가 어떻게 응답하는지 — 수정 전 사용자가 본 경로. */
const RAW_UPLOAD_PROBE = `(async () => {
  const form = new FormData();
  form.append('files', window.__bigPoster);
  const response = await fetch('/api/v1/uploads', { method: 'POST', body: form, credentials: 'include' });
  return { status: response.status, body: (await response.text()).slice(0, 300) };
})()`;

/** 실제 UI 경로 — 커버 이미지 파일 입력에 원본을 물려 업로드가 끝날 때까지 기다린다. */
const UI_UPLOAD = `(async () => {
  const input = document.querySelector('input[type=file][accept*="image"]');
  if (!input) return { ok: false, reason: '파일 입력을 찾지 못했어요.' };
  const transfer = new DataTransfer();
  transfer.items.add(window.__bigPoster);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
})()`;

/** 위저드 1~3단계 필수값을 채우고 상금·홍보 단계로 이동한다. */
async function advanceToPromoStep(page) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = (daysFromNow, hour) => {
    const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
  };

  const sport = page.locator('#sport-id');
  const options = await sport.locator('option').all();
  for (const option of options) {
    const value = await option.getAttribute('value');
    if (value) {
      await sport.selectOption(value);
      break;
    }
  }
  await page.locator('#title').fill('[검증] 홍보 이미지 업로드');
  await page.getByRole('button', { name: '다음' }).click();

  await page.locator('#scheduled-at').fill(stamp(30, 10));
  await page.locator('#registration-deadline-at').fill(stamp(20, 10));
  await page.locator('#roster-deadline-at').fill(stamp(25, 10));
  await page.getByRole('button', { name: '다음' }).click();

  // 3단계(참가 조건)는 기본값이 이미 유효하므로 그대로 넘긴다.
  await page.getByRole('button', { name: '다음' }).click();
  await page.waitForTimeout(800);
}

/**
 * 홈 히어로의 computed backgroundImage 를 읽어 커버 폴백이 실제로 적용됐는지 수치로 남긴다.
 * 스크린샷 육안 대조로는 "그라디언트냐 사진이냐"를 놓치기 쉬워 URL 문자열로 대조한다.
 */
async function measurePromoFallback(page, tournaments) {
  const cards = await page.$$eval('.tm-featured-media', (nodes) =>
    nodes.map((node) => ({
      label: node.closest('a')?.getAttribute('aria-label') ?? null,
      background: getComputedStyle(node).backgroundImage,
      hasPlaceholderTrophy: Boolean(node.querySelector('svg[width="120"]')),
    })),
  );
  const coverOnly = tournaments.filter(
    (item) => (item.coverImageUrl || '').trim() && !(item.promoHomeImageUrl || '').trim(),
  );
  return {
    coverOnlyTournaments: coverOnly.map((item) => ({
      title: item.title,
      coverImageUrl: item.coverImageUrl,
      promoHomeImageUrl: item.promoHomeImageUrl,
      // 폴백이 걸렸다면 이 커버 URL 이 홈 히어로 배경에 그대로 들어가 있어야 한다.
      renderedWithCover: cards.some((card) => card.background.includes(item.coverImageUrl)),
    })),
    cards,
  };
}

async function settle(page) {
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sessionToken = await loginForSessionCookie();
  console.log(`[${PHASE}] 로그인 성공 — 세션 쿠키 확보`);

  const browser = await chromium.launch();
  const report = { phase: PHASE, capturedAt: new Date().toISOString() };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([
      {
        name: 'teameet_v1_session',
        value: sessionToken,
        domain: 'alpha.teameet.co.kr',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/tournaments/new`, { waitUntil: 'commit', timeout: 60000 });
    await settle(page);

    report.originalBytes = await page.evaluate(MAKE_BIG_JPEG);
    console.log(`[${PHASE}] 원본 JPEG 생성: ${(report.originalBytes / 1024 / 1024).toFixed(1)}MB`);

    report.rawUpload = await page.evaluate(RAW_UPLOAD_PROBE);
    console.log(`[${PHASE}] 원본 직접 업로드(압축 미경유): HTTP ${report.rawUpload.status} ${report.rawUpload.body}`);

    // 커버 업로더는 위저드 4단계(상금·홍보)에 있다. 이 단계는 초안 생성(POST) 없이도
    // 앞 단계 검증만 통과하면 들어갈 수 있으므로, alpha 에 대회 레코드를 남기지 않고
    // 실제 UI 경로를 그대로 태울 수 있다.
    await advanceToPromoStep(page);
    const hasUploader = await page.locator('input[type=file][accept*="image"]').count();
    if (!hasUploader) {
      report.uiUpload = { status: null, body: '커버 업로더까지 진입하지 못했어요.' };
      console.log(`[${PHASE}] UI 경로 업로드 건너뜀: ${report.uiUpload.body}`);
    } else {
      const uploadResponse = page
        .waitForResponse(
          (response) =>
            response.url().includes('/api/v1/uploads') && response.request().method() === 'POST',
          { timeout: 120000 },
        )
        .catch(() => null);
      const triggered = await page.evaluate(UI_UPLOAD);
      const response = triggered.ok ? await uploadResponse : null;
      // 대용량 요청은 본문이 inspector 캐시에서 밀려나 text() 가 실패할 수 있다 — 판정은
      // 상태코드와 아래 미리보기 반영 여부로 하고, 본문은 얻어지면 참고로만 남긴다.
      const body = response ? await response.text().catch(() => '(본문 없음)') : null;
      report.uiUpload = response
        ? { status: response.status(), body: body.slice(0, 300) }
        : { status: null, body: triggered.reason ?? '업로드 응답을 받지 못했어요.' };
      console.log(`[${PHASE}] UI 경로 업로드: HTTP ${report.uiUpload.status} ${report.uiUpload.body}`);

      // 서버가 돌려준 URL 이 실제로 미리보기에 붙었는지까지 확인한다 — 200 만으로는
      // 폼이 결과를 반영했는지 알 수 없다.
      report.previewSrc = await page
        .locator('img[src*="/uploads/"]')
        .first()
        .getAttribute('src', { timeout: 30000 })
        .catch(() => null);
      console.log(`[${PHASE}] 미리보기 이미지: ${report.previewSrc ?? '없음'}`);
      await page.screenshot({ path: path.join(OUT, `${PHASE}-admin-cover-upload.png`), fullPage: false });
    }
    await context.close();

    for (const [widthLabel, width] of WIDTHS) {
      const shotContext = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 900 },
        deviceScaleFactor: 2,
      });
      await shotContext.addCookies([
        {
          name: 'teameet_v1_session',
          value: sessionToken,
          domain: 'alpha.teameet.co.kr',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ]);
      const shotPage = await shotContext.newPage();
      for (const [name, route] of [
        ['home', '/home'],
        ['tournaments', '/tournaments'],
      ]) {
        await shotPage.goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: 60000 });
        await settle(shotPage);
        await shotPage.screenshot({ path: path.join(OUT, `${PHASE}-${name}-${widthLabel}.png`) });
        console.log(`[${PHASE}] 캡처: ${PHASE}-${name}-${widthLabel}.png`);
        if (name === 'home' && widthLabel === 'desktop') {
          const listed = await fetch(`${BASE}/api/v1/tournaments?limit=30`)
            .then((response) => response.json())
            .then((json) => json?.data?.items ?? [])
            .catch(() => []);
          report.promoFallback = await measurePromoFallback(shotPage, listed);
          for (const item of report.promoFallback.coverOnlyTournaments) {
            console.log(
              `[${PHASE}] 커버 폴백 — ${item.title}: promoHomeImageUrl=${item.promoHomeImageUrl} → 홈 히어로에 커버 반영=${item.renderedWithCover}`,
            );
          }
        }
      }
      await shotContext.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, `${PHASE}-report.json`), JSON.stringify(report, null, 2));
  console.log(`[${PHASE}] 완료 → ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
