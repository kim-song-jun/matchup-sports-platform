import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const results = [];

function log(page, status, msg) {
  results.push({ page, status, msg });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${page}] ${msg}`);
}

async function testPage(page, path, checks) {
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
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

  const checks = [checkDeadInteractions, checkEmptyContent, checkBrokenImages];

  // 모든 주요 라우트 테스트
  const routes = [
    '/home', '/matches', '/lessons', '/marketplace', '/teams',
    '/chat', '/mercenary', '/badges', '/payments', '/profile',
    '/notifications', '/reviews', '/settings', '/venues', '/team-matches',
    '/login',
    '/matches/new', '/teams/new', '/marketplace/new', '/mercenary/new',
    '/team-matches/new', '/payments/checkout',
    '/my/matches', '/my/team-matches', '/my/teams', '/my/lessons',
    '/my/listings', '/my/mercenary', '/my/reviews-received',
    '/settings/account', '/settings/notifications', '/settings/terms', '/settings/privacy',
    '/admin/dashboard', '/admin/matches', '/admin/users', '/admin/lessons',
    '/admin/teams', '/admin/venues', '/admin/payments', '/admin/disputes',
    '/admin/statistics', '/admin/settlements',
  ];

  console.log(`\n🔍 MatchUp QA 테스트 시작 — ${routes.length}개 라우트\n`);

  for (const route of routes) {
    await testPage(page, route, checks);
  }

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
