import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const results = [];
const NAVIGATION_TIMEOUT = 60000;

function log(page, status, msg) {
  results.push({ page, status, msg });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${page}] ${msg}`);
}

async function openPage(page, path) {
  const res = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT,
  });

  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);

  return res;
}

async function loginAsDev(page, nickname = '테스트유저') {
  await openPage(page, '/login');

  const devInput = page.locator('[data-testid="dev-login-input"]');
  await devInput.waitFor({ state: 'visible', timeout: NAVIGATION_TIMEOUT });
  await devInput.fill(nickname);
  await page.locator('[data-testid="dev-login-submit"]').click();
  await page.waitForURL('**/home', { timeout: NAVIGATION_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function testPage(page, path, checks) {
  try {
    const res = await openPage(page, path);
    if (!res || res.status() !== 200) {
      log(path, 'FAIL', `HTTP ${res?.status()}`);
      return;
    }
    log(path, 'PASS', `페이지 로드 OK`);

    for (const check of checks) {
      try {
        await check(page, path);
      } catch (e) {
        log(path, 'WARN', `체크 실패: ${e.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    log(path, 'FAIL', `페이지 로드 실패: ${e.message.slice(0, 80)}`);
  }
}

// Check: 클릭 가능해 보이는데 실제로 동작하지 않는 요소 찾기
async function checkDeadInteractions(page, path) {
  // 1. cursor-pointer 있지만 onClick/href 없는 요소
  const deadPointers = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="cursor-pointer"]');
    const dead = [];
    els.forEach(el => {
      const tag = el.tagName.toLowerCase();
      const hasClick = el.onclick || el.getAttribute('onclick');
      const hasHref = el.getAttribute('href');
      const isInput = tag === 'input' || tag === 'label' || tag === 'select';
      if (!hasClick && !hasHref && !isInput && tag !== 'a') {
        dead.push(`<${tag}> "${el.textContent?.trim().slice(0, 30)}"`);
      }
    });
    return dead;
  });
  if (deadPointers.length > 0) {
    log(path, 'WARN', `cursor-pointer 있지만 핸들러 없음: ${deadPointers.join(', ')}`);
  }

  // 2. button 태그인데 disabled도 아니고 onclick도 없는 것
  const deadButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button:not([disabled])');
    const dead = [];
    btns.forEach(btn => {
      // React는 이벤트를 직접 attach하므로 __reactFiber 체크
      const hasReactHandler = Object.keys(btn).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
      if (!hasReactHandler && !btn.onclick && !btn.getAttribute('onclick')) {
        dead.push(`"${btn.textContent?.trim().slice(0, 30)}"`);
      }
    });
    return dead;
  });
  if (deadButtons.length > 0) {
    log(path, 'WARN', `onClick 없는 button: ${deadButtons.join(', ')}`);
  }

  // 3. hover 효과 있는 div/카드인데 클릭 안 되는 것
  const hoverCards = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="hover:shadow"], [class*="hover:bg-"]');
    const dead = [];
    els.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag !== 'button' && tag !== 'a' && tag !== 'input' && tag !== 'label') {
        const hasClick = el.onclick || el.closest('a') || el.closest('button');
        if (!hasClick) {
          dead.push(`<${tag}> "${el.textContent?.trim().slice(0, 25)}..."`);
        }
      }
    });
    return dead;
  });
  if (hoverCards.length > 0 && hoverCards.length < 5) {
    log(path, 'WARN', `hover 효과 있지만 클릭 불가: ${hoverCards.join(', ')}`);
  }
}

// Check: 빈 콘텐츠 영역
async function checkEmptyContent(page, path) {
  const isEmpty = await page.evaluate(() => {
    const main = document.querySelector('main') || document.querySelector('[class*="animate-fade-in"]');
    if (!main) return false;
    const text = main.textContent?.trim() || '';
    return text.length < 20;
  });
  if (isEmpty) {
    log(path, 'WARN', '콘텐츠가 거의 비어있음');
  }
}

// Check: 깨진 이미지/아이콘
async function checkBrokenImages(page, path) {
  const broken = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    const broken = [];
    imgs.forEach(img => {
      if (!img.complete || img.naturalWidth === 0) {
        broken.push(img.src?.slice(0, 50));
      }
    });
    return broken;
  });
  if (broken.length > 0) {
    log(path, 'WARN', `깨진 이미지 ${broken.length}개`);
  }
}

// Check: 콘솔 에러
async function checkConsoleErrors(page, path) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(msg.text().slice(0, 60));
    }
  });
  await page.waitForTimeout(500);
  if (errors.length > 0) {
    log(path, 'WARN', `콘솔 에러: ${errors.slice(0, 2).join('; ')}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const guestPage = await context.newPage();

  const checks = [checkDeadInteractions, checkEmptyContent, checkBrokenImages];

  await loginAsDev(page);

  const routes = [
    { path: '/home', requiresAuth: true },
    { path: '/matches', requiresAuth: true },
    { path: '/lessons', requiresAuth: true },
    { path: '/marketplace', requiresAuth: true },
    { path: '/teams', requiresAuth: true },
    { path: '/chat', requiresAuth: true },
    { path: '/mercenary', requiresAuth: true },
    { path: '/badges', requiresAuth: true },
    { path: '/payments', requiresAuth: true },
    { path: '/profile', requiresAuth: true },
    { path: '/notifications', requiresAuth: true },
    { path: '/reviews', requiresAuth: true },
    { path: '/settings', requiresAuth: true },
    { path: '/venues', requiresAuth: true },
    { path: '/team-matches', requiresAuth: true },
    { path: '/login', requiresAuth: false },
    { path: '/matches/new', requiresAuth: true },
    { path: '/teams/new', requiresAuth: true },
    { path: '/marketplace/new', requiresAuth: true },
    { path: '/mercenary/new', requiresAuth: true },
    { path: '/team-matches/new', requiresAuth: true },
    { path: '/payments/checkout', requiresAuth: true },
    { path: '/my/matches', requiresAuth: true },
    { path: '/my/team-matches', requiresAuth: true },
    { path: '/my/teams', requiresAuth: true },
    { path: '/my/lessons', requiresAuth: true },
    { path: '/my/listings', requiresAuth: true },
    { path: '/my/mercenary', requiresAuth: true },
    { path: '/my/reviews-received', requiresAuth: true },
    { path: '/settings/account', requiresAuth: true },
    { path: '/settings/notifications', requiresAuth: true },
    { path: '/settings/terms', requiresAuth: true },
    { path: '/settings/privacy', requiresAuth: true },
    { path: '/admin/dashboard', requiresAuth: true },
    { path: '/admin/matches', requiresAuth: true },
    { path: '/admin/users', requiresAuth: true },
    { path: '/admin/lessons', requiresAuth: true },
    { path: '/admin/teams', requiresAuth: true },
    { path: '/admin/venues', requiresAuth: true },
    { path: '/admin/payments', requiresAuth: true },
    { path: '/admin/disputes', requiresAuth: true },
    { path: '/admin/statistics', requiresAuth: true },
    { path: '/admin/settlements', requiresAuth: true },
  ];

  console.log(`\n🔍 MatchUp QA 테스트 시작 — ${routes.length}개 라우트\n`);

  for (const route of routes) {
    await testPage(route.requiresAuth ? page : guestPage, route.path, checks);
  }

  await guestPage.close();
  await browser.close();

  // Summary
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 QA 결과: ${pass} PASS / ${warn} WARN / ${fail} FAIL`);
  console.log(`${'='.repeat(50)}\n`);

  if (warn > 0) {
    console.log('⚠️  경고 상세:');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  [${r.page}] ${r.msg}`);
    });
  }
  if (fail > 0) {
    console.log('\n❌ 실패 상세:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  [${r.page}] ${r.msg}`);
    });
  }
}

main().catch(console.error);
