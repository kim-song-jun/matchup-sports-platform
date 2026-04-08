import { chromium } from 'playwright';
import { join } from 'path';

const BASE = 'http://localhost:3003';
const OUT = join(process.cwd(), 'docs/screenshots');

const pages = [
  { path: '/login', name: '01_login', desc: '로그인' },
  { path: '/home', name: '02_home', desc: '홈', needsLogin: true },
  { path: '/matches', name: '03_matches', desc: '매치 목록', needsLogin: true },
  { path: '/matches/new', name: '04_match_create', desc: '매치 만들기', needsLogin: true },
  { path: '/team-matches', name: '05_team_matches', desc: '팀 매칭 목록', needsLogin: true },
  { path: '/team-matches/new', name: '06_team_match_create', desc: '팀 매칭 모집글 작성', needsLogin: true },
  { path: '/teams', name: '07_teams', desc: '팀 목록', needsLogin: true },
  { path: '/lessons', name: '08_lessons', desc: '강좌 목록', needsLogin: true },
  { path: '/marketplace', name: '09_marketplace', desc: '장터', needsLogin: true },
  { path: '/venues', name: '10_venues', desc: '시설 목록', needsLogin: true },
  { path: '/chat', name: '11_chat', desc: '채팅', needsLogin: true },
  { path: '/mercenary', name: '12_mercenary', desc: '용병 모집', needsLogin: true },
  { path: '/badges', name: '13_badges', desc: '뱃지', needsLogin: true },
  { path: '/payments', name: '14_payments', desc: '결제 내역', needsLogin: true },
  { path: '/profile', name: '15_profile', desc: '프로필', needsLogin: true },
  { path: '/settings', name: '16_settings', desc: '설정', needsLogin: true },
  { path: '/my/matches', name: '17_my_matches', desc: '내가 만든 매치', needsLogin: true },
  { path: '/my/teams', name: '18_my_teams', desc: '내 팀', needsLogin: true },
  { path: '/admin/dashboard', name: '19_admin_dashboard', desc: 'Admin 대시보드', needsLogin: true },
  { path: '/admin/disputes', name: '20_admin_disputes', desc: 'Admin 분쟁 관리', needsLogin: true },
  { path: '/admin/statistics', name: '21_admin_statistics', desc: 'Admin 통계', needsLogin: true },
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Desktop screenshots
  console.log('📸 데스크탑 스크린샷 촬영 중...\n');
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopCtx.newPage();

  // Login first
  await desktopPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await desktopPage.fill('input[placeholder="닉네임 입력"]', '축구왕민수');
  await desktopPage.click('button:has-text("입장")');
  await desktopPage.waitForTimeout(2000);

  for (const pg of pages) {
    try {
      await desktopPage.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle', timeout: 10000 });
      await desktopPage.waitForTimeout(1000);
      await desktopPage.screenshot({ path: join(OUT, `${pg.name}_desktop.png`), fullPage: false });
      console.log(`  ✅ ${pg.name}_desktop.png — ${pg.desc}`);
    } catch (e) {
      console.log(`  ❌ ${pg.name} — ${e.message.slice(0, 40)}`);
    }
  }

  // Mobile screenshots (key pages only)
  console.log('\n📱 모바일 스크린샷 촬영 중...\n');
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
  });
  const mobilePage = await mobileCtx.newPage();

  await mobilePage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await mobilePage.fill('input[placeholder="닉네임 입력"]', '축구왕민수');
  await mobilePage.click('button:has-text("입장")');
  await mobilePage.waitForTimeout(2000);

  const mobilePages = [
    { path: '/home', name: '02_home' },
    { path: '/matches', name: '03_matches' },
    { path: '/team-matches', name: '05_team_matches' },
    { path: '/chat', name: '11_chat' },
    { path: '/profile', name: '15_profile' },
  ];

  for (const pg of mobilePages) {
    try {
      await mobilePage.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle', timeout: 10000 });
      await mobilePage.waitForTimeout(1000);
      await mobilePage.screenshot({ path: join(OUT, `${pg.name}_mobile.png`), fullPage: false });
      console.log(`  ✅ ${pg.name}_mobile.png`);
    } catch (e) {
      console.log(`  ❌ ${pg.name}_mobile — ${e.message.slice(0, 40)}`);
    }
  }

  await browser.close();
  console.log(`\n📁 스크린샷 저장 위치: ${OUT}`);
  console.log(`총 ${pages.length + mobilePages.length}장 촬영 완료`);
}

main().catch(console.error);
