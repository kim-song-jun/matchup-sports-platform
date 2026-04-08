import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const issues = [];
const NAVIGATION_TIMEOUT = 60000;

function issue(page, severity, msg) {
  issues.push({ page, severity, msg });
  const icon = severity === 'HIGH' ? '🔴' : severity === 'MED' ? '🟡' : '🔵';
  console.log(`${icon} [${page}] ${msg}`);
}

async function openPage(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function loginAsDev(page, nickname = '테스트유저') {
  await openPage(page, '/login');
  await page.locator('[data-testid="dev-login-input"]').waitFor({ state: 'visible', timeout: NAVIGATION_TIMEOUT });
  await page.locator('[data-testid="dev-login-input"]').fill(nickname);
  await page.locator('[data-testid="dev-login-submit"]').click();
  await page.waitForURL('**/home', { timeout: NAVIGATION_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function hasText(page, text) {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}

async function checkPage(page, path, name, checks) {
  try {
    await openPage(page, path);
    for (const check of checks) {
      await check(page, path, name);
    }
  } catch (e) {
    issue(path, 'HIGH', `페이지 로드 실패: ${e.message.slice(0, 60)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await loginAsDev(page);

  console.log('\n🔍 UI 관점 기능 누락 분석\n');

  // ━━━ 홈 페이지 ━━━
  await checkPage(page, '/home', '홈', [
    async (p, path) => {
      const hasSearchOrFilter = await p.$('input[type="text"], input[type="search"]');
      if (!hasSearchOrFilter) issue(path, 'MED', '홈에 검색 바 없음 — 사용자가 바로 검색할 수 없음');

      const hasNewMatchBtn = await p.$('a[href="/matches/new"], button:has-text("매치 만들기")');
      if (!hasNewMatchBtn) issue(path, 'MED', '홈에서 바로 매치 만들기 버튼 없음 (사이드바에만 있음)');
    }
  ]);

  // ━━━ 매치 목록 ━━━
  await checkPage(page, '/matches', '매치 목록', [
    async (p, path) => {
      const hasSortOption = await p.$('select, button:has-text("정렬"), button:has-text("최신순")');
      if (!hasSortOption) issue(path, 'MED', '매치 목록에 정렬 옵션 없음 (최신순/인기순/가격순)');

      const hasDateFilter = await p.$('input[type="date"], button:has-text("날짜")');
      if (!hasDateFilter) issue(path, 'MED', '날짜 필터 없음 — 특정 날짜 매치를 찾기 어려움');

      const hasLocationFilter = await p.$('button:has-text("지역"), select');
      if (!hasLocationFilter) issue(path, 'LOW', '지역 필터 없음 (검색으로 대체 가능)');
    }
  ]);

  // ━━━ 매치 상세 ━━━
  await checkPage(page, '/matches', '매치→상세', [
    async (p, path) => {
        const firstMatch = await p.$('a[href*="/matches/"]');
        if (firstMatch) {
          await firstMatch.click();
          await p.waitForTimeout(2000);

        const hasParticipantList = await hasText(p, '참가자');
        if (!hasParticipantList) issue('/matches/[id]', 'MED', '참가자 목록이 보이지 않음');

        const hasHostInfo = await hasText(p, '호스트');
        if (!hasHostInfo) issue('/matches/[id]', 'LOW', '호스트 정보 미표시');

        const hasVenueMap = await p.$('[class*="map"], [class*="Map"]');
        if (!hasVenueMap) issue('/matches/[id]', 'MED', '시설 지도가 매치 상세에 없음');

        // 공유 기능
        const hasShare = await p.$('button:has-text("공유"), [aria-label="share"], svg.lucide-share');
        // 이건 OK

        await p.goBack();
        await p.waitForTimeout(500);
      }
    }
  ]);

  // ━━━ 팀 매칭 ━━━
  await checkPage(page, '/team-matches', '팀 매칭', [
    async (p, path) => {
      const hasSortOption = await p.$('button:has-text("최신순"), button:has-text("정렬")');
      if (!hasSortOption) issue(path, 'MED', '팀 매칭 목록에 정렬 옵션 없음');

      const hasLevelFilter = await p.$('button:has-text("레벨"), select');
      if (!hasLevelFilter) issue(path, 'MED', '레벨 필터 없음 — 수준에 맞는 상대 찾기 어려움');

      const hasDateFilter = await p.$('input[type="date"]');
      if (!hasDateFilter) issue(path, 'MED', '날짜 필터 없음');
    }
  ]);

  // ━━━ 팀 상세 ━━━
  await checkPage(page, '/teams', '팀→상세', [
    async (p, path) => {
      const firstTeam = await p.$('a[href*="/teams/"]');
      if (firstTeam) {
        await firstTeam.click();
        await p.waitForTimeout(2000);

        const hasJoinBtn = await p.$('button:has-text("가입"), button:has-text("신청"), button:has-text("참여")');
        if (!hasJoinBtn) issue('/teams/[id]', 'HIGH', '팀 가입/참여 신청 버튼 없음');

        const hasGallery = await hasText(p, '갤러리');
        // 갤러리는 optional

        await p.goBack();
        await p.waitForTimeout(500);
      }
    }
  ]);

  // ━━━ 장터 ━━━
  await checkPage(page, '/marketplace', '장터', [
    async (p, path) => {
      const hasSearchBar = await p.$('input[type="text"]');
      if (!hasSearchBar) issue(path, 'HIGH', '장터에 검색 바 없음');

      const hasPriceSort = await p.$('button:has-text("가격순"), button:has-text("정렬")');
      if (!hasPriceSort) issue(path, 'MED', '가격순 정렬 없음');

      const hasConditionFilter = await p.$('button:has-text("상태"), button:has-text("새 상품")');
      if (!hasConditionFilter) issue(path, 'MED', '상품 상태(새것/중고) 필터 없음');
    }
  ]);

  // ━━━ 장터 상세 ━━━
  await checkPage(page, '/marketplace', '장터→상세', [
    async (p, path) => {
      const firstItem = await p.$('a[href*="/marketplace/"]');
      if (firstItem) {
        await firstItem.click();
        await p.waitForTimeout(2000);

        const hasSellerRating = await hasText(p, '매너');
        // 판매자 매너 점수

        const hasReportBtn = await p.$('button:has-text("신고"), button:has-text("report")');
        if (!hasReportBtn) issue('/marketplace/[id]', 'MED', '신고하기 버튼 없음');

        await p.goBack();
        await p.waitForTimeout(500);
      }
    }
  ]);

  // ━━━ 강좌 ━━━
  await checkPage(page, '/lessons', '강좌', [
    async (p, path) => {
      const hasCreateBtn = await p.$('a[href*="new"], button:has-text("등록"), button:has-text("만들기")');
      if (!hasCreateBtn) issue(path, 'HIGH', '강좌 등록 버튼 없음 — 사용자가 강좌를 만들 수 없음');

      const hasSearchBar = await p.$('input[type="text"]');
      if (!hasSearchBar) issue(path, 'MED', '강좌 검색 바 없음');
    }
  ]);

  // ━━━ 시설 상세 ━━━
  await checkPage(page, '/venues', '시설→상세', [
    async (p, path) => {
      const firstVenue = await p.$('a[href*="/venues/"]');
      if (firstVenue) {
        await firstVenue.click();
        await p.waitForTimeout(2000);

        const hasBookingBtn = await p.$('button:has-text("예약"), button:has-text("문의")');
        if (!hasBookingBtn) issue('/venues/[id]', 'MED', '시설 예약/문의 버튼 없음');

        const hasPhoneLink = await p.$('a[href*="tel:"]');
        if (!hasPhoneLink) issue('/venues/[id]', 'LOW', '전화번호 클릭 연결 없음');

        await p.goBack();
        await p.waitForTimeout(500);
      }
    }
  ]);

  // ━━━ 프로필 ━━━
  await checkPage(page, '/profile', '프로필', [
    async (p, path) => {
      const hasActivityStats = await hasText(p, '활동 통계');
      if (!hasActivityStats) issue(path, 'MED', '활동 통계 요약(승률, 총 경기수 등) 없음');

      const hasBadgeDisplay = await hasText(p, '뱃지');
      if (!hasBadgeDisplay) issue(path, 'MED', '프로필에 뱃지 표시 없음');
    }
  ]);

  // ━━━ 채팅 ━━━
  await checkPage(page, '/chat', '채팅', [
    async (p, path) => {
      const hasSearchChat = await p.$('input[placeholder*="검색"]');
      if (!hasSearchChat) issue(path, 'LOW', '채팅 검색 없음');
    }
  ]);

  // ━━━ 결제 ━━━
  await checkPage(page, '/payments', '결제', [
    async (p, path) => {
      const hasDateFilter = await p.$('input[type="date"], button:has-text("기간")');
      if (!hasDateFilter) issue(path, 'MED', '결제 내역 기간 필터 없음');

      const hasTotalAmount = await hasText(p, '총');
      if (!hasTotalAmount) issue(path, 'LOW', '총 결제 금액 요약 없음');
    }
  ]);

  // ━━━ 알림 ━━━
  await checkPage(page, '/notifications', '알림', [
    async (p, path) => {
      const hasMarkAllRead = await p.$('button:has-text("모두 읽음"), button:has-text("전체 읽기")');
      if (!hasMarkAllRead) issue(path, 'MED', '모두 읽음 처리 버튼 없음');
    }
  ]);

  // ━━━ 용병 ━━━
  await checkPage(page, '/mercenary', '용병', [
    async (p, path) => {
      const hasMyApplications = await p.$('button:has-text("내 신청"), a[href*="my"]');
      if (!hasMyApplications) issue(path, 'MED', '내가 신청한 용병 목록 바로가기 없음');
    }
  ]);

  await browser.close();

  // Summary
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`📊 UI 기능 누락 분석 결과`);
  console.log(`${'━'.repeat(60)}`);
  const high = issues.filter(i => i.severity === 'HIGH');
  const med = issues.filter(i => i.severity === 'MED');
  const low = issues.filter(i => i.severity === 'LOW');
  console.log(`\n🔴 HIGH: ${high.length}개  🟡 MED: ${med.length}개  🔵 LOW: ${low.length}개`);

  if (high.length) {
    console.log('\n🔴 HIGH — 핵심 기능 누락:');
    high.forEach(i => console.log(`  [${i.page}] ${i.msg}`));
  }
  if (med.length) {
    console.log('\n🟡 MED — 사용성 저하:');
    med.forEach(i => console.log(`  [${i.page}] ${i.msg}`));
  }
  if (low.length) {
    console.log('\n🔵 LOW — 개선 권장:');
    low.forEach(i => console.log(`  [${i.page}] ${i.msg}`));
  }
}

main().catch(console.error);
