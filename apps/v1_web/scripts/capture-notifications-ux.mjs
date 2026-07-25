/**
 * 알림 화면 시각 검증 캡처.
 *
 * v1 dev DB가 없는 환경에서도 "실제 컴포넌트 + 실제 globals.css"를 브라우저로 렌더해
 * 확인하려고, 알림 API 응답만 라우트 레벨에서 주입한다(DOM 변조 없음).
 *
 * 사용법: node scripts/capture-notifications-ux.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3013';
const OUT = process.argv[2] ?? '.capture/notifications';

const NOW = new Date('2026-07-26T02:10:00.000Z');
const iso = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

const NOTIFICATIONS = {
  unreadCount: 2,
  items: [
    {
      notificationId: 'n-inquiry',
      type: 'inquiry',
      title: '문의에 답변이 등록됐어요',
      body: '"참가비 환불 언제 되나요" 문의 답변: 결제하신 참가비는 취소 승인 후 3영업일 이내에 원결제 수단으로 환불돼요. 카드사 사정에 따라 하루 이틀 더 걸릴 수 있어요.',
      target: { type: 'inquiry', id: 'inq-1', route: '/my/inquiries/inq-1' },
      status: 'created',
      readAt: null,
      createdAt: iso(12),
    },
    {
      notificationId: 'n-match',
      type: 'match',
      title: '매치 신청이 승인됐어요',
      body: '매치 참가가 확정됐어요.',
      target: { type: 'match', id: 'm-1', route: '/matches/m-1' },
      status: 'created',
      readAt: null,
      createdAt: iso(90),
    },
    {
      notificationId: 'n-team',
      type: 'team',
      title: '팀 가입 신청이 수락됐어요',
      body: '팀 가입이 승인됐어요.',
      target: { type: 'team', id: 't-1', route: '/teams/t-1' },
      status: 'read',
      readAt: iso(200),
      createdAt: iso(240),
    },
  ],
  pageInfo: { nextCursor: null, hasNext: false },
};

const SESSION = {
  user: {
    id: 'capture-user',
    email: 'capture@teameet.v1',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  },
  profile: { displayName: '캡처유저', nickname: '캡처유저', avatarUrl: null, regionSummary: '서울 강남구' },
  termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
  verification: { emailVerified: true, phoneVerified: true },
  socialSignupPrefill: null,
};

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** dev 서버의 Next devtools 오버레이는 캡처에 잡히면 안 된다(런북 §3.3). */
const HIDE_DEVTOOLS = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });

    // 헤더 dev 인증에 쓰이는 세션 값 주입 (require-auth 게이트 통과용)
    await context.addInitScript(() => {
      localStorage.setItem('teameet.v1.userId', 'capture-user');
      localStorage.setItem('teameet.v1.userEmail', 'capture@teameet.v1');
      localStorage.setItem('teameet.v1.session', 'active');
    });

    // v1 API 서버 없이 화면만 검증하므로, 이 화면이 의존하는 응답을 라우트 레벨에서 채운다.
    const json = (data) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data, timestamp: NOW.toISOString() }),
    });

    await context.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/notifications')) return route.fulfill(json(NOTIFICATIONS));
      if (url.includes('/auth/me')) return route.fulfill(json(SESSION));
      if (url.includes('/popups/active')) return route.fulfill(json({ items: [] }));
      if (url.includes('/health')) return route.fulfill(json({ ok: true }));
      // 그 외는 빈 성공 응답 — 이 화면의 렌더를 막지 않으면서 실제 호출 흐름은 유지한다.
      return route.fulfill(json({}));
    });

    const page = await context.newPage();
    // dev 서버는 HMR 소켓 때문에 networkidle에 도달하지 않는다 — DOM 준비 후 셀렉터로 대기한다.
    await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tm-notification-card', { timeout: 15_000 });
    await page.addStyleTag({ content: HIDE_DEVTOOLS });

    await page.screenshot({ path: `${OUT}/${viewport.name}-list.png`, fullPage: true });

    // 첫 카드를 눌러 상세 시트를 연 상태 캡처
    await page.locator('.tm-notification-card').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
    await page.waitForTimeout(350); // 시트 진입 애니메이션(.22s) 종료 대기
    await page.screenshot({ path: `${OUT}/${viewport.name}-sheet.png` });

    await context.close();
    console.log(`captured ${viewport.name}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
