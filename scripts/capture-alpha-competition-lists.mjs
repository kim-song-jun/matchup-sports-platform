/**
 * [입구 설계] `/tournaments` 와 `/league-matches` 상단을 3폭으로 찍고 **레이아웃을 값으로 읽는다.**
 *
 * ## 왜 필요한가
 * 두 목록을 잇는 `CompetitionKindSegment`(정규 대회 ↔ 정규 리그)가 이미 붙어 있는데, 그
 * **아래에 종목 칩 줄이 또 있다.** 저장소가 스스로 경고한 상황이다 — *"같은 무게의 세그먼트를
 * 두 줄로 쌓으면 어느 쪽이 상위인지 읽히지 않는다."* 사용자가 말한 "서브탭이 못생겼다" 가
 * 이 실물일 가능성이 크므로, **목업이 아니라 실화면**을 본다.
 *
 * ## 눈으로 안 보이는 것을 잰다
 * "두 줄이 쌓였다" 는 스크린샷으로도 보이지만, **얼마나 쌓였는지**(세로 점유 픽셀)와 **본문이
 * 어디서 시작하는지**는 안 보인다. 그래서 좌표를 읽는다 — 화면 높이 대비 헤더 영역이 몇 %를
 * 먹는지가 판단의 근거다.
 *
 * ## ⚠️ 읽기만 한다
 * `goto` · `evaluate`(읽기) · `screenshot` 만 쓴다. 클릭·입력·제출·mutation 없음.
 * 이 성질은 `test/config/alpha-probe-readonly.contract.spec.ts` 가 게이트로 지킨다.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? 'output/competition-lists';
const PAGES = ['/tournaments', '/league-matches'];
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

/**
 * **보이는 것만 잰다.** 모바일·데스크톱 노드가 DOM 에 둘 다 있고 CSS 로 하나만 표시된다 —
 * 문서 전체에서 세면 폭과 무관한 숫자가 나온다(이 저장소가 nav 로 이미 겪었다).
 */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(seen);

  const segment = vis('[aria-label="대회 유형"]')[0] ?? vis('.tm-segment-row')[0];
  const segTabs = segment ? [...segment.querySelectorAll('a, button')].filter(seen).map((e) => ({
    label: (e.textContent || '').trim(),
    // \`data-active="false"\` 는 **문자열이라 truthy** 다 — 그대로 쓰면 비활성 탭도 활성으로
    // 읽힌다(실제로 그렇게 한 번 틀렸다). 활성 판정은 \`aria-current\` 하나로 한다.
    active: e.getAttribute('aria-current') === 'page',
    minSide: Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)),
  })) : [];

  // 종목 칩 줄 — 세그먼트 바로 아래에서 같은 무게로 경쟁하는 그 줄
  // 클래스는 **실측한 이름**을 쓴다 — \`.tm-chip-row\` 로 짐작했다가 0개가 나왔고, 실제
  // 이름은 \`.tm-sport-chip-row\` 였다. 그리고 **줄이 하나가 아니다**(종목 + 상태).
  const segBottom = segment ? segment.getBoundingClientRect().bottom : 0;
  const chipRows = vis('.tm-sport-chip-row').filter((e) => e.getBoundingClientRect().top >= segBottom - 4);
  const firstCard = vis('.tm-card, article, li').find((e) => e.getBoundingClientRect().height > 60) ?? null;

  return {
    viewportH: window.innerHeight,
    segment: box(segment),
    segTabs,
    chipRows: chipRows.map((e) => ({ ...box(e), n: [...e.querySelectorAll('a, button')].filter(seen).length, txt: (e.textContent || '').trim().slice(0, 24) })),
    firstCard: box(firstCard),
    listCount: vis('.tm-card, article').filter((e) => e.getBoundingClientRect().height > 60).length,
  };
})()`;

async function main() {
  const session = await login();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];

  for (const { key, width, height } of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height },
      storageState: {
        cookies: [{ name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
        origins: [],
      },
    });
    const page = await context.newPage();
    try {
      for (const path of PAGES) {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (status >= 400) {
          rows.push({ 폭: key, 경로: path, HTTP: status, 비고: status === 403 ? '403 rate limit — 판정 불가' : `HTTP ${status}` });
          continue;
        }
        await page.waitForTimeout(4000);
        const r = await page.evaluate(READ);
        // **뷰포트 위 화면 그대로** 찍는다 — 문제가 "위쪽 두 줄" 이라 전체 페이지를 펴면
        // 정작 봐야 할 상단이 5000px 문서의 머리로 밀려 갤러리에서 안 보인다.
        await page.screenshot({ path: `${OUT}/${path.slice(1)}--${key}.png` });
        const headerEnd = r.chipRows.at(-1)?.bottom ?? r.segment?.bottom ?? 0;
        rows.push({
          폭: key, 경로: path, HTTP: status,
          세그먼트: r.segment ? `${r.segment.top}~${r.segment.bottom}(${r.segment.h}px)` : '없음',
          탭: r.segTabs.map((t) => `${t.label}${t.active ? '*' : ''}`).join('|') || '-',
          칩줄: r.chipRows.length === 0 ? '없음' : r.chipRows.map((c) => `${c.top}~${c.bottom}(${c.n}개)`).join(' + '),
          첫카드top: r.firstCard?.top ?? '-',
          '상단점유%': headerEnd ? Math.round((headerEnd / r.viewportH) * 100) : '-',
          카드수: r.listCount,
        });
        console.log(`[${key} ${path}] ${status} · 세그먼트 ${r.segment?.h ?? 0}px · 칩줄 ${r.chipRows.length}개(${r.chipRows.map((c) => c.txt).join(' / ') || '-'}) · 첫카드 top=${r.firstCard?.top ?? '-'} · 상단점유 ${headerEnd ? Math.round((headerEnd / r.viewportH) * 100) : '-'}%`);
        await new Promise((s) => setTimeout(s, 1500));
      }
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.log('\n=== 화면에서 읽은 값 ===');
  console.table(rows);
  console.log(`\n캡처: ${OUT}/`);
}

main().catch((error) => { console.error(`\n실패: ${error.message}`); process.exit(1); });
