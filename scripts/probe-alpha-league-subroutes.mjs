/**
 * [read-swap 후속] 리그 거울 행이 **대회 하위 라우트**에서 어떻게 보이는지 값으로 읽는다.
 *
 * ## 왜 필요한가
 * 문(`/tournaments/:id`)을 열면서 그 아래 라우트들도 **리그 id 로 도달 가능**해졌다.
 * 그중 `apply`·`schedule`·`reviews`·`my` 는 소스에서 `kind` 를 안 본다(정적 신호) — 그런데
 * 이 페이지들은 **클라이언트 렌더**라 curl 로는 못 본다. 결함이라 부르려면 실제 화면을 봐야 한다.
 *
 * ## ⚠️ 읽기만 한다
 * 클릭·폼 제출·API mutation 을 하지 않는다. 신청 버튼을 한 번 누르면 **alpha 에 신청 row 가
 * 생긴다** — 그건 데이터 변경이고 사용자 승인이 필요하다. 이 스크립트는 `goto` 와
 * `evaluate`(읽기) 만 쓴다.
 *
 * ## ⚠️ 대조군 없이 숫자를 읽지 않는다
 * 같은 라우트를 **리그 거울 / 대회(format=league) / 대회(group_knockout)** 세 축으로 열어
 * 나란히 놓는다. 셋이 같으면 그건 **리그 고유 문제가 아니다.** 대조군 없이 `404` 를 읽고
 * "리그가 막혔다" 로 오판한 전례가 이 세션에 있다.
 *
 * 두 번째 대조군(format=league 인 **대회**)이 특히 중요하다 — 프론트의
 * `isLeagueCompetition` 분기를 **거울과 똑같이** 타면서 데이터는 대회 축이다. 화면 차이가
 * 나면 그건 분기가 아니라 **데이터 축** 때문이라는 뜻이다.
 */
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const ROUTES = ['', '/apply', '/schedule', '/reviews', '/my'];

const SUBJECTS = [
  { key: '리그거울', id: process.env.LEAGUE_ID },
  { key: '대회(league)', id: process.env.CONTROL_LEAGUE_FORMAT_ID },
  { key: '대회(group_ko)', id: process.env.CONTROL_GK_ID },
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
 * 화면에서 **읽는다.** "괜찮아 보인다" 가 아니라 값을 낸다.
 * 대회 전용 어휘가 리그에 노출되는지가 핵심 질문이라, 그 단어들을 직접 센다.
 */
const READ = `(() => {
  const t = document.body.innerText || '';
  const has = (s) => t.includes(s);
  const btns = [...document.querySelectorAll('button, a[role=button]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => (e.textContent || '').trim())
    .filter((s) => s.length > 0 && s.length < 24);
  return {
    title: (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 40),
    chars: t.replace(/\\s+/g, ' ').trim().length,
    head: t.replace(/\\s+/g, ' ').trim().slice(0, 110),
    buttons: [...new Set(btns)].slice(0, 12),
    notFound: has('찾을 수 없') || has('존재하지 않'),
    // 대회 전용 개념 — 리그에 뜨면 그게 §1-4 가 경고한 것이다
    entryFee: has('참가비'),
    applyCta: has('참가 신청') || has('신청하기'),
    deposit: has('입금'),
    capacity: has('정원'),
    roster: has('선수 명단') || has('로스터'),
    registration: has('참가 등록') || has('등록 정보'),
  };
})()`;

async function main() {
  for (const s of SUBJECTS) if (!s.id) throw new Error(`${s.key} id 가 없다 — 환경변수를 확인해라`);
  const session = await login();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [{ name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
      origins: [],
    },
  });
  const page = await context.newPage();
  const rows = [];

  for (const route of ROUTES) {
    for (const subject of SUBJECTS) {
      const path = `/tournaments/${subject.id}${route}`;
      try {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (status === 403) { rows.push({ 라우트: route || '(상세)', 축: subject.key, HTTP: 403, 비고: 'rate limit — 화면 판정 불가' }); continue; }
        // 클라이언트 렌더라 명시 대기. networkidle 은 폴링 때문에 안 끝난다.
        await page.waitForTimeout(4500);
        const r = await page.evaluate(READ);
        const leak = ['entryFee', 'applyCta', 'deposit', 'capacity', 'roster', 'registration'].filter((k) => r[k]);
        rows.push({
          라우트: route || '(상세)', 축: subject.key, HTTP: status,
          글자수: r.chars, notFound: r.notFound ? 'Y' : '',
          대회어휘: leak.join(',') || '-',
          제목: r.title,
        });
        console.log(`[${route || '(상세)'} · ${subject.key}] ${status} · ${r.chars}자 · notFound=${r.notFound} · 대회어휘=${leak.join(',') || '없음'}`);
        console.log(`   본문머리: ${r.head}`);
        console.log(`   버튼: ${r.buttons.join(' | ') || '(없음)'}`);
      } catch (error) {
        rows.push({ 라우트: route || '(상세)', 축: subject.key, HTTP: '-', 비고: `층1 실패: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log('');
  }
  await context.close();
  await browser.close();
  console.log('=== 요약 ===');
  console.table(rows);
}

main().catch((error) => { console.error(`\n실패: ${error.message}`); process.exit(1); });
