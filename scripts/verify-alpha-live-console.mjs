/**
 * M5 alpha 실측 — 현장 콘솔 두 표면이 각자 자기 표면을 가리키는지 확인한다.
 * 육안이 아니라 **DOM 의 href** 를 읽어 판정한다.
 * 자격증명은 환경변수로만 받는다(이 저장소는 PUBLIC).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = process.env.OUT_DIR ?? '/private/tmp/claude-501/-Users-sungjun-Dev-projects-matchup-sports-platform/649fe467-4fd8-45cb-b161-4e1927ed92fa/scratchpad/m5-gallery';
const WIDTHS = [
  { w: 390, h: 900, tag: 'mobile-390' },
  { w: 768, h: 1000, tag: 'tablet-768' },
  { w: 1440, h: 1000, tag: 'desktop-1440' },
];

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('teameet_v1_session='));
  return raw.split(';')[0].split('=').slice(1).join('=');
}

async function pickTournament(token) {
  const res = await fetch(`${BASE}/api/v1/admin/tournaments?limit=20`, {
    headers: { cookie: `teameet_v1_session=${token}` },
  });
  const body = await res.json();
  const items = body?.data?.items ?? [];
  const sorted = [...items].sort((a, b) => (b.registrationCount ?? 0) - (a.registrationCount ?? 0));
  return sorted[0] ?? items[0];
}

/**
 * nav 뿐 아니라 **본문까지** 훑는다. 처음엔 `nav, aside` 만 봤는데, 그 결과 "상대 표면 링크
 * 0건"이 nav 에 한정된 사실이었고 본문의 '운영 콘솔' 링크가 어드민 표면에서 스태프 경로로
 * 나가는 것을 놓쳤다(alpha 에서 뒤늦게 발견). 표면 판정은 화면 전체를 봐야 한다.
 */
async function surfaceHrefs(page) {
  return page.$$eval('a[href]', (els) =>
    els.map((el) => el.getAttribute('href')).filter((h) => h && (h.includes('/tournament-ops/') || h.includes('/admin/live/'))),
  );
}

async function main() {
  const token = await login();
  const t = await pickTournament(token);
  if (!t) throw new Error('no tournament');
  console.log(`tournament: ${t.title}`);
  await mkdir(OUT, { recursive: true });

  const surfaces = [
    { name: 'admin-live-operations', url: `${BASE}/admin/live/${t.id}/operations`, expect: '/admin/live/' },
    { name: 'staff-ops-operations', url: `${BASE}/tournament-ops/tournaments/${t.id}/operations`, expect: '/tournament-ops/' },
    { name: 'admin-live-result-review', url: `${BASE}/admin/live/${t.id}/result-review`, expect: '/admin/live/' },
    { name: 'admin-live-staff', url: `${BASE}/admin/live/${t.id}/staff`, expect: '/admin/live/' },
  ];

  const browser = await chromium.launch();
  const verdicts = [];
  try {
    for (const { w, h, tag } of WIDTHS) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await context.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true }]);
      await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
      const page = await context.newPage();
      for (const s of surfaces) {
        await page.goto(s.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${OUT}/${s.name}-${tag}.png`, fullPage: true });
        if (w === 1440) {
          const hrefs = await surfaceHrefs(page);
          const wrong = hrefs.filter((href) => !href.startsWith(s.expect));
          verdicts.push({ surface: s.name, surfaceLinks: hrefs.length, wrongSurface: wrong.length, sample: hrefs[0] ?? null, finalPath: new URL(page.url()).pathname });
        }
        console.log(`captured ${s.name} @${w}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log('\n=== nav 표면 판정 (1440) ===');
  for (const v of verdicts) console.log(JSON.stringify(v));
  console.log(`OUT=${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
