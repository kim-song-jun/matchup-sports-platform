/**
 * PR #829 실측 검증 — radius 토큰이 배포본에서 실제로 해석되는가 + 3폭 캡처.
 *
 * 왜 alpha 에서 봐야 하나
 *   #829 는 TSX 인라인 `style={{ borderRadius: 12 }}` 139곳을 `var(--radius-control)` 류로
 *   바꿨다. 정적 대조(토큰 → px 역산)로 픽셀 무손실은 이미 확인됐지만, 그건 **토큰이
 *   런타임에 해석된다는 전제** 위에서만 성립한다. `@theme` 정의가 어떤 이유로든 `:root` 로
 *   방출되지 않으면 `var(--radius-*)` 는 빈 값이 되고 borderRadius 가 **0px 으로 무너진다** —
 *   그러면 화면 전체의 모서리가 각지는데, 유닛 테스트도 정적 대조도 이걸 못 잡는다.
 *   그래서 배포본에서 ① 토큰 8개가 :root 에서 실제 값을 갖는지 ② 인라인 var() 를 쓰는
 *   요소의 computed borderRadius 가 0px 이 아닌지를 직접 읽는다.
 *
 * 육안 대조로 "차이 없음"을 결론내지 않는다 — computed 값을 직접 읽어 판정한다.
 *
 * 사용법:
 *   ALPHA_SESSION_TOKEN=v1.... node scripts/verify_alpha_radius_tokens.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/radius-tokens';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;

const WIDTHS = [
  { key: 'mobile', width: 390, height: 900 },
  { key: 'tablet', width: 768, height: 1000 },
  { key: 'desktop', width: 1440, height: 1000 },
];

// tokens.css 가 정의한 값. 배포본이 이 값을 그대로 내려주는지 대조한다.
const EXPECTED = {
  '--radius-tight': '4px',
  '--radius-chip': '8px',
  '--radius-control': '12px',
  '--radius-field': '14px',
  '--radius-container': '16px',
  '--radius-hero': '24px',
  '--radius-pill': '999px',
  '--radius-circle': '50%',
};

const TARGETS = (process.env.TARGETS ?? '/home,/teams,/tournaments').split(',').map((s) => s.trim()).filter(Boolean);

await mkdir(OUT, { recursive: true });

const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
const servingCommit = head.headers.get('x-teameet-commit');
console.log(`serving commit: ${servingCommit}`);

const browser = await chromium.launch();
const report = { base: BASE, servingCommit, pages: [] };
let failures = 0;

for (const target of TARGETS) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    if (TOKEN) {
      await ctx.addCookies([{
        name: 'teameet_v1_session', value: TOKEN,
        domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
      }]);
    }
    const page = await ctx.newPage();
    const bad = [];
    page.on('response', (r) => {
      const s = r.status();
      // 과한 캡처에 alpha 가 403 을 거는 일이 있다 — 통과로 오독하지 않게 상태코드를 남긴다.
      if (s >= 400) bad.push({ status: s, url: r.url().replace(BASE, '') });
    });

    // 라이브 폴링 화면은 networkidle 이 끝나지 않는다 — domcontentloaded + 명시 대기.
    await page.goto(BASE + target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);

    const probe = await page.evaluate((expected) => {
      const root = getComputedStyle(document.documentElement);
      const tokens = {};
      for (const name of Object.keys(expected)) tokens[name] = root.getPropertyValue(name).trim();

      // 인라인 style 에 var(--radius-*) 를 쓰는 요소를 찾아 computed 를 읽는다.
      const inlineVarEls = [];
      let collapsed = 0;
      for (const el of document.querySelectorAll('[style*="--radius-"]')) {
        const raw = el.getAttribute('style') ?? '';
        const cs = getComputedStyle(el).borderTopLeftRadius;
        inlineVarEls.push({ raw: raw.slice(0, 110), computed: cs });
        // var() 가 안 풀리면 0px 으로 무너진다 — 그게 이 검증이 잡으려는 실패 모드다.
        if (cs === '0px') collapsed += 1;
      }
      return {
        tokens,
        inlineVarCount: inlineVarEls.length,
        collapsedCount: collapsed,
        samples: inlineVarEls.slice(0, 8),
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    }, EXPECTED);

    const tokenMismatches = Object.entries(EXPECTED)
      .filter(([k, v]) => probe.tokens[k] !== v)
      .map(([k, v]) => ({ token: k, expected: v, actual: probe.tokens[k] || '(empty)' }));

    const horizontalOverflow = probe.docScrollW > probe.clientW + 1;
    const ok = tokenMismatches.length === 0 && probe.collapsedCount === 0 && !horizontalOverflow;
    if (!ok) failures += 1;

    const shot = `${OUT}/${target.replace(/\W+/g, '_') || 'root'}-${w.key}.png`;
    await page.screenshot({ path: shot, fullPage: false });

    report.pages.push({
      target, width: w.key, ok,
      tokenMismatches,
      inlineVarCount: probe.inlineVarCount,
      collapsedCount: probe.collapsedCount,
      samples: probe.samples,
      horizontalOverflow, scrollW: probe.docScrollW, clientW: probe.clientW,
      httpErrors: bad.slice(0, 8),
      screenshot: shot,
    });
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${target} @${w.key}  tokens=${tokenMismatches.length === 0 ? 'all-resolved' : JSON.stringify(tokenMismatches)}` +
      `  inlineVar=${probe.inlineVarCount} collapsed=${probe.collapsedCount} overflow=${horizontalOverflow} http4xx5xx=${bad.length}`,
    );
    await ctx.close();
  }
}

await browser.close();
report.verdict = failures === 0 ? 'PASS' : 'FAIL';
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n판정: ${report.verdict} (실패 ${failures}건 / 총 ${report.pages.length}건)`);
process.exit(failures === 0 ? 0 : 1);
