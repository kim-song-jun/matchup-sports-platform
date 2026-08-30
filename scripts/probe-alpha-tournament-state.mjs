/**
 * [P1-b 실측 보조] alpha 에서 **fixture 를 새로 붙일 수 있는 대회**를 찾는다.
 *
 * 새 대회를 만들어 신청·승인까지 밟는 경로는 관문이 많다(대회는 `draft` 로 생기고
 * `status !== 'open'` 이면 신청이 409). 이미 **confirmed 등록이 2건 이상**인 대회에
 * fixture 만 추가하는 편이 훨씬 짧다 -- 경기를 시작하지 않는 한(라인업 저장은 SCHEDULED
 * 안에서만 한다) 되돌릴 수 없는 잠금도 생기지 않는다.
 *
 * 자격증명은 환경변수로만 넘긴다(이 저장소는 PUBLIC).
 */
const API = 'https://alpha.teameet.co.kr/api/v1';
let SESSION = '';

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  const hit = (res.headers.getSetCookie?.() ?? [])
    .map((c) => /teameet_v1_session=([^;]+)/.exec(c))
    .find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  SESSION = hit[1];
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${SESSION}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, data: json?.data ?? json };
}

async function main() {
  await login();

  const list = await api('GET', '/tournaments?limit=40');
  const tournaments = list.data?.items ?? [];
  console.log(`대회 ${tournaments.length}건\n`);

  const candidates = [];
  for (const t of tournaments) {
    const regs = await api('GET', `/admin/tournaments/${t.id}/registrations`);
    if (regs.status >= 400) continue;
    const items = regs.data?.items ?? (Array.isArray(regs.data) ? regs.data : []);
    const confirmed = items.filter((r) => r.status === 'confirmed');
    if (confirmed.length < 2) continue;
    candidates.push({
      id: t.id,
      title: t.title.slice(0, 34),
      status: t.status,
      confirmed: confirmed.length,
      regA: confirmed[0].id,
      regB: confirmed[1].id,
    });
    if (candidates.length >= 6) break;
  }

  if (candidates.length === 0) {
    console.log('confirmed 등록이 2건 이상인 대회가 없습니다');
    process.exit(2);
  }
  console.table(candidates.map(({ regA, regB, ...rest }) => rest));
  const pick = candidates[0];
  console.log(`\nTOURNAMENT_ID=${pick.id}`);
  console.log(`REG_A=${pick.regA}`);
  console.log(`REG_B=${pick.regB}`);
}

main().catch((error) => {
  console.error(`실패: ${error.message}`);
  process.exit(1);
});
