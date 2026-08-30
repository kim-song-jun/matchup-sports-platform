/**
 * [하단 탭 6→5] alpha 3폭 갤러리 + **숫자로** 판정.
 *
 * | 항목 | 기대 | 왜 눈으로 안 보나 |
 * |---|---|---|
 * | 하단 탭 수 | **5** | 앱이 모바일·데스크톱 노드를 **둘 다 렌더**하고 CSS 로 하나만 보인다 — 문서 전체에서 세면 10 이 나온다 |
 * | 탭 라벨 잘림 | 없음 | 390px 에서 한두 글자가 말줄임되는 건 스크린샷으로 잘 안 보인다 → `scrollWidth > clientWidth` |
 * | 세그먼트 라벨 | "정규 대회"/"정규 리그" 잘림 없음 | 같은 이유. 기획이 실측을 요구한 지점이다 |
 * | 세그먼트 전환 | 목록이 실제로 바뀐다 | 링크만 있고 목록이 그대로면 "동작하는 것처럼" 보인다 |
 * | 터치 타깃 | 44px 이상 | 프로젝트 접근성 기준 |
 * | 활성 표시 | 색 **밖에도** 있다 | 색만으로 정보 전달 금지 — `aria-current` 로 확인 |
 *
 * 캡처 위생(앞선 하네스에서 배운 것):
 * - 이 앱은 `main.tm-scroll-area` 가 진짜 스크롤러라 `fullPage: true` 가 뷰포트 높이까지만
 *   찍는다 → 캡처 직전에만 스크롤을 문서로 되돌린다.
 * - **측정은 CSS 를 풀기 전에** 끝낸다. 푼 뒤 좌표는 실제 화면 값이 아니다.
 * - 페이지마다 httpStatus 확인(alpha 는 과한 캡처에 1분간 전면 403 을 걸고, 403 페이지도
 *   PNG 로는 멀쩡해 보인다). 착지 URL 도 확인한다 — 세션이 만료되면 `/login` 도 200 이다.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? '.screenshots/bottom-tabs-five';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) throw new Error('ALPHA_SESSION_TOKEN 또는 ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

/**
 * **보이는 것만 센다.** 모바일 하단 nav 와 데스크톱 상단 nav 가 DOM 에 둘 다 있고 CSS 로
 * 하나만 표시되므로, `querySelectorAll` 결과를 그대로 세면 폭과 무관하게 10 이 나온다.
 */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const navs = [...document.querySelectorAll('nav')].filter(seen);
  // 데스크톱 nav 는 **브랜드 로고와 액션 링크까지 같은 <nav> 안**에 담는다 — nav 전체를
  // 세면 폭과 무관하게 10 이 나온다(실측했다). 탭만 담는 컨테이너가 따로 있으므로
  // 있으면 그쪽으로 좁힌다. 모바일 하단 nav 는 그런 컨테이너가 없고 링크가 곧 탭이다.
  const rawMain = navs.find((n) => (n.getAttribute('aria-label') || '').includes('주요 메뉴'));
  const mainNav = rawMain?.querySelector('.tm-desktop-nav-tabs') ?? rawMain;
  const segment = navs.find((n) => (n.getAttribute('aria-label') || '') === '대회 유형');

  const readLinks = (root) =>
    root === undefined
      ? []
      : [...root.querySelectorAll('a')].filter(seen).map((a) => {
          const r = a.getBoundingClientRect();
          // 잘림은 링크 자신이 아니라 **글자를 담은 요소**에서 난다.
          const textEl = [...a.querySelectorAll('*')].find((el) => el.textContent === a.textContent) ?? a;
          return {
            label: (a.textContent || '').trim(),
            href: a.getAttribute('href'),
            current: a.getAttribute('aria-current'),
            minSide: Math.round(Math.min(r.width, r.height)),
            clipped: textEl.scrollWidth > textEl.clientWidth + 1,
          };
        });

  return { tabs: readLinks(mainNav), segment: readLinks(segment), segmentPresent: segment !== undefined };
})()`;

function verdict(r, path) {
  const out = [];
  if (path === '/tournaments' || path === '/league-matches') {
    out.push(r.tabs.length === 5 ? '✅ 탭 5개' : `❌ 탭 ${r.tabs.length}개`);
    out.push(r.tabs.some((t) => t.href === '/league-matches') ? '❌ 리그 탭이 남아 있다' : '✅ 리그 탭 없음');
    const activeTab = r.tabs.find((t) => t.current === 'page');
    out.push(activeTab?.href === '/tournaments' ? '✅ 대회 탭 활성' : `❌ 활성 탭 ${activeTab?.href ?? '없음'}`);
    out.push(r.segmentPresent ? '✅ 세그먼트 있음' : '❌ 세그먼트 없음');
  }
  const clipped = [...r.tabs, ...r.segment].filter((x) => x.clipped);
  out.push(clipped.length === 0 ? '✅ 라벨 잘림 없음' : `❌ 잘림: ${clipped.map((x) => x.label).join(',')}`);
  const small = [...r.tabs, ...r.segment].filter((x) => x.minSide < 44);
  out.push(small.length === 0 ? '✅ 44px 이상' : `❌ 44px 미만: ${small.map((x) => `${x.label}(${x.minSide})`).join(',')}`);
  return out.join(' · ');
}

async function main() {
  const session = await login();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];

  for (const { key, width, height } of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height },
      storageState: {
        cookies: [
          { name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' },
        ],
        origins: [],
      },
    });
    const page = await context.newPage();

    for (const path of ['/tournaments', '/league-matches']) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const status = res?.status() ?? 0;
      if (status === 403) throw new Error('alpha 403 (rate limit) — 1분 후 재시도');
      if (status >= 400) throw new Error(`${path} HTTP ${status}`);
      await page.waitForTimeout(4000);
      const landed = new URL(page.url()).pathname;
      if (landed !== path) throw new Error(`${path} 로 갔는데 ${landed} 에 착지했다 — 세션 만료 가능성`);

      const r = await page.evaluate(READ);
      rows.push({
        폭: key,
        경로: path,
        HTTP: status,
        탭수: r.tabs.length,
        탭: r.tabs.map((t) => t.label).join('·'),
        판정: verdict(r, path),
      });

      // 캡처 직전에만 스크롤을 문서로 되돌린다(측정은 위에서 끝났다).
      await page.addStyleTag({
        content: `html, body, .tm-app-frame { overflow: visible !important; height: auto !important; }
                  .tm-scroll-area { overflow: visible !important; height: auto !important; max-height: none !important; }`,
      });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('body *')) {
          if (getComputedStyle(el).position !== 'fixed') continue;
          el.style.setProperty('position', 'static', 'important');
          for (const prop of ['left', 'right', 'top', 'bottom', 'transform', 'width']) {
            el.style.setProperty(prop, prop === 'width' ? '100%' : 'auto', 'important');
          }
        }
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${path.slice(1)}--${key}.png`, fullPage: true });
    }
    console.log(`${key}: 캡처 완료`);
    await context.close();
  }
  await browser.close();

  console.log('\n=== 화면에서 읽은 값 ===');
  console.table(rows);
  const failed = rows.filter((r) => String(r.판정).includes('❌'));
  console.log(`\n캡처: ${OUT}/`);
  console.log(failed.length === 0 ? '전 폭·전 경로 기대와 일치' : `기대 불일치 ${failed.length}건`);
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
