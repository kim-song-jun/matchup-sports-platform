/**
 * [어드민 대비 스윕] 틴트 지면 위 보조 텍스트(#1138)와 세그먼트 활성 알약(#1148)의
 * **결과 화면**을 3폭으로 찍고, 같은 방문에서 대비를 값으로 읽는다.
 *
 * ## 왜 스크린샷만으로 끝내지 않는가
 * 이 스윕이 고친 것은 **회색 한 단계**(--grey600 → --grey700)와 **알약 지면 한 단계**다.
 * 육안 대조로는 #f9fafb 와 #ffffff 를 못 가른다(이 저장소의 선례). 그래서 캡처와 함께
 * `getComputedStyle` 로 실제 색을 읽어 대비를 계산하고, 미달 건수를 함께 출력한다.
 *
 * ## ⚠️ 읽기만 한다
 * `goto` · `evaluate`(읽기) · `screenshot` 만 쓴다. 클릭·입력·제출·mutation 없음.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? 'output/playwright/visual-audit/admin-contrast';
/**
 * 기본은 어드민 9화면. `PAGES_JSON` 으로 다른 표면을 넣을 수 있다 —
 * `[["home","/home"],["teams","/teams"]]` 형태. 같은 계산기를 쓰기 위한 것이지,
 * 이 스크립트를 범용 크롤러로 만들려는 것은 아니다(로그인·읽기 전용 전제는 그대로).
 */
const PAGES = process.env.PAGES_JSON ? JSON.parse(process.env.PAGES_JSON) : [
  ['dashboard', '/admin'],
  ['tournaments', '/admin/tournaments'],
  ['users', '/admin/users'],
  ['monitoring', '/admin/monitoring'],
  ['content', '/admin/content'],
  ['league-matches', '/admin/league-matches'],
  ['matches', '/admin/matches'],
  ['teams', '/admin/teams'],
  ['inquiries', '/admin/inquiries'],
];
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
 * 보이는 텍스트의 실제 색과 **뒤에 실제로 깔린 지면**을 읽어 대비를 센다.
 *
 * 이 계산기는 **세 번 다시 재고 나서** 이 모양이 됐다(미달 930 → 197 → 45).
 * 장치는 넷이고, 각 장치가 막는 오판을 적어 둔다.
 *
 * 1. **canvas 로 색을 정규화한다.** Tailwind v4 는 `lab()`·`oklab()`·`color()` 를 그대로
 *    내보내고, 그 문자열의 숫자를 0~255 로 읽으면 지면이 `rgb(0.98, 0.002, 0.02)` 라는
 *    새까만 색으로 잡힌다 — 멀쩡한 화면이 1.02:1 로 보인다.
 * 2. **반투명 지면은 합성한다.** `bg-blue-50/60` 처럼 알파가 있는 배경을 불투명으로 읽으면
 *    실제보다 진한 지면이 되어 대비가 과소 계산된다. 알파가 1 이 될 때까지 조상으로 올라가며 겹친다.
 * 3. **`background-image` 가 끼면 포기한다.** 사진·그라디언트 위 글자는 픽셀을 봐야 하고,
 *    흰색으로 가정하면 유령 결함이 무더기로 나온다(이 저장소가 실제로 9건 오검출했다).
 * 4. **`docs/design/a11y-decisions.md` 에 등재된 예외는 세지 않는다.** solid-fill 버튼의 흰
 *    글씨 4색(2026-08-27 현행 유지 결정)과 `disabled` 가 그것이다. 안 빼면 미달 목록이
 *    이미 닫힌 논의로 가득 차 새 결함이 묻힌다.
 */
const READ = `(() => {
  const cvEl = document.createElement('canvas');
  cvEl.width = cvEl.height = 1;
  const cv = cvEl.getContext('2d', { willReadFrequently: true });
  /**
   * 어떤 CSS 색 표기든 [r,g,b,a] 로 — **문자열이 아니라 그려진 픽셀을 읽는다.**
   * canvas 는 \`oklab()\`/\`lab()\` 을 fillStyle 로 받아들이지만 **그 문자열을 그대로
   * 돌려준다**(정규화하지 않는다). 그 문자열의 숫자를 0~255 로 읽으면 L·a·b 성분이
   * RGB 로 둔갑해, 연한 파란 틴트가 새까만 색으로 잡힌다 — 실제로 이 계산기가 처음에
   * 그렇게 930건을 만들어 냈다. 픽셀로 읽으면 브라우저의 변환을 그대로 얻는다:
   *   oklab(0.959438 -0.00665909 -0.0187867) → rgb(232, 243, 255)  ✅
   *   같은 값을 문자열로 파싱하면            → rgb(1, 0, 0)        ❌
   */
  const rgba = (s) => {
    if (!s || s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = s;
    cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) };
  const cr = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) };

  /** 조상을 거슬러 올라가며 반투명 배경을 겹친다. 이미지가 끼면 null(측정 포기). */
  const ground = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
  };

  /** a11y-decisions.md 1번 — solid-fill 버튼 위 흰 글씨(4색). */
  const SOLID_FILL = new Set(['49,130,246', '240,68,82', '3,178,108', '254,152,0']);
  const isWhite = (c) => c[0] > 250 && c[1] > 250 && c[2] > 250;
  /**
   * WCAG 2.1 SC 1.4.3 자체 예외 — *"로고 또는 브랜드명의 일부인 텍스트에는 대비 요구가 없다."*
   * 워드마크를 세면 홈·팀·마이·채팅 모든 화면에서 같은 두 건이 영원히 올라와, 진짜 결함이 묻힌다.
   * 클래스로 고르는 이유: 텍스트로 고르면 "teameet" 이 들어간 **본문**까지 함께 빠진다.
   */
  const LOGOTYPE = '.tm-desktop-nav-brand, .tm-desktop-footer-wordmark';

  const out = { checked: 0, skipped: 0, exempt: 0, fails: [] };
  for (const el of document.querySelectorAll('body *')) {
    // leaf 만 보면 \`<button><svg/>라벨</button>\` 처럼 **자식 요소와 직접 텍스트가 함께
    // 있는** 요소를 통째로 놓친다(아이콘 버튼이 전부 이 모양이다). 요소의 **직접 텍스트
    // 노드만** 모으면 자식이 있어도 재고, 자식 요소의 글자를 두 번 세지도 않는다.
    let text = '';
    for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent;
    text = text.trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (el.closest('[disabled],[aria-disabled="true"]')) { out.exempt += 1; continue }
    if (el.closest(LOGOTYPE)) { out.exempt += 1; continue }
    const bg = ground(el);
    if (!bg) { out.skipped += 1; continue }
    const fg = over(rgba(cs.color), bg);
    if (isWhite(fg) && SOLID_FILL.has(bg.slice(0, 3).map(Math.round).join(','))) { out.exempt += 1; continue }
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    out.checked += 1;
    const v = cr(fg, bg);
    if (v < need) out.fails.push({
      t: text.slice(0, 22), v: Math.round(v * 100) / 100, need, size, weight,
      fg: 'rgb(' + fg.slice(0, 3).map(Math.round).join(', ') + ')',
      bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(', ') + ')',
    });
  }
  return out;
})()`;

/**
 * 테마. 다크는 **`localStorage` 를 첫 페인트 전에 심어서** 만든다 —
 * `document.documentElement.classList.add('dark')` 로 켜면 `ThemeProvider` 의 effect 가
 * 다음 렌더에서 되돌리고, 같은 evaluate 안에서 토글하고 바로 읽으면 스타일 재계산 전이라
 * **라이트 값이 그대로 나온다**(다른 세션이 실제로 그 함정에 빠졌다).
 */
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';

const token = await login();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let totalFails = 0;

const only = process.env.WIDTH_KEYS?.split(',').map((x) => x.trim()).filter(Boolean);
for (const { key, width, height } of WIDTHS.filter((w) => !only || only.includes(w.key))) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/', secure: true }]);
  if (THEME === 'dark') {
    // 키 이름은 src/lib/theme.ts 의 THEME_STORAGE_KEY 와 같아야 한다.
    await ctx.addInitScript(() => { try { localStorage.setItem('tm-theme', 'dark') } catch {} });
  }
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);
    // 길이로 거르지 않는다. 검색·채팅의 빈 상태는 정상 화면인데도 200자가 안 되고,
    // 그걸 "측정 무효" 로 버리면 **재야 할 화면을 조용히 안 재게 된다**(실제로 3화면을
    // 그렇게 버렸다). 무효는 **화면 자체가 다른 것**일 때만이다.
    const body = await page.evaluate(
      "({ len: document.body.innerText.length, text: document.body.innerText })",
    );
    const wrongScreen = ['페이지를 찾을 수 없어요', '운영자 권한이 필요해요', '로그인이 필요해요'].find((m) =>
      body.text.includes(m),
    );
    if (wrongScreen) { console.log(`  ⚠️ ${key}/${name}: "${wrongScreen}" — 다른 화면이라 측정 무효`); continue; }
    if (body.len < 60) { console.log(`  ⚠️ ${key}/${name}: 본문 ${body.len}자 — 렌더 전으로 보임, 측정 무효`); continue; }
    const isDark = await page.evaluate("document.documentElement.classList.contains('dark')");
    if (THEME === 'dark' && !isDark) { console.log(`  ⚠️ ${key}/${name}: 다크 적용 실패 — 측정 무효`); continue; }
    await page.screenshot({ path: `${OUT}/${name}-${key}${THEME === 'dark' ? '-dark' : ''}.png`, fullPage: false });
    const r = await page.evaluate(READ);
    totalFails += r.fails.length;
    const head = r.fails.slice(0, 4).map((f) => `${f.v}:1 "${f.t}" ${f.size}px/${f.weight} ${f.fg} on ${f.bg}`).join(' | ');
    console.log(
      `  ${r.fails.length ? '❌' : '✅'} ${key}/${name}  검사 ${r.checked} · 등재예외 ${r.exempt} · 이미지지면 ${r.skipped}  미달 ${r.fails.length}${head ? '  ' + head : ''}`,
    );
  }
  await ctx.close();
}
await browser.close();
console.log(`\n=== ${THEME} · 3폭 × ${PAGES.length}화면 · 대비 미달 총 ${totalFails}건 · ${OUT} ===`);
