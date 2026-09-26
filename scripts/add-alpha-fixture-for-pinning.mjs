/**
 * [P1-b 실측 보조] 이미 confirmed 등록이 있는 alpha 대회에 **fixture 를 하나 추가**해
 * SCHEDULED 상태의 `TOURNAMENT_FIXTURE` 경기를 만든다.
 *
 * 새 대회를 만들어 신청·승인까지 밟는 경로는 관문이 많아(대회는 `draft` 로 생기고
 * `status !== 'open'` 이면 신청이 409) 여기서는 fixture 만 붙인다. 경기를 **시작하지
 * 않으므로**(라인업 저장은 SCHEDULED 안에서만 한다) 대회에 되돌릴 수 없는 잠금은
 * 생기지 않는다.
 *
 * `publish-bracket` 을 해야 공개 API 에 `gameId` 가 생긴다 -- 안 하면 계속 404 다.
 *
 * 환경변수: ALPHA_EMAIL / ALPHA_PASSWORD / TOURNAMENT_ID / REG_A / REG_B
 */
const API = 'https://alpha.teameet.co.kr/api/v1';
let SESSION = '';

async function login() {
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  // 누락을 여기서 끊는다 -- 그대로 요청하면 "로그인 실패 HTTP 401" 만 남아서
  // 자격증명이 틀린 것인지 안 넘어온 것인지 구분이 안 된다.
  if (!email || !password) throw new Error('ALPHA_EMAIL / ALPHA_PASSWORD 가 필요합니다');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  // `getSetCookie()` 가 없는 런타임을 대비해 `get('set-cookie')` 로 떨어진다 --
  // 이 저장소의 capture_alpha_league_audit.mjs·capture-admin-report-filter.mjs 와 같은
  // 처리다. `get()` 은 Set-Cookie 가 여러 개일 때 하나로 합쳐 돌려주므로 폴백일 때만 쓴다.
  const rawCookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = rawCookies.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
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
  const tournamentId = process.env.TOURNAMENT_ID;
  const regA = process.env.REG_A;
  const regB = process.env.REG_B;
  if (!tournamentId || !regA || !regB) throw new Error('TOURNAMENT_ID / REG_A / REG_B 가 필요합니다');

  // 기존 fixture 번호와 겹치지 않게 뒤로 민다.
  const existing = await api('GET', `/admin/tournaments/${tournamentId}/fixtures`);
  const items = existing.data?.items ?? (Array.isArray(existing.data) ? existing.data : []);
  const nextNumber = Math.max(0, ...items.map((f) => f.fixtureNumber ?? 0)) + 1;
  console.log(`기존 fixture ${items.length}건 → fixtureNumber=${nextNumber}`);

  const created = await api('POST', `/admin/tournaments/${tournamentId}/fixtures`, {
    round: 'final',
    fixtureNumber: nextNumber,
    homeRegistrationId: regA,
    awayRegistrationId: regB,
    scheduledAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  });
  if (created.status >= 400) throw new Error(`fixture 생성 실패 HTTP ${created.status}: ${created.text.slice(0, 400)}`);
  const fixtureId = created.data?.id;
  console.log(`fixture 생성: ${fixtureId}`);

  const published = await api('POST', `/admin/tournaments/${tournamentId}/publish-bracket`, {});
  console.log(`publish-bracket: HTTP ${published.status}${published.status >= 400 ? ' ' + published.text.slice(0, 200) : ''}`);

  const match = await api('GET', `/tournaments/${tournamentId}/matches/${fixtureId}`);
  const gameId = match.data?.gameId ?? match.data?.game?.id;
  if (!gameId) throw new Error(`gameId 없음 (HTTP ${match.status}): ${match.text.slice(0, 300)}`);

  const game = await api('GET', `/games/${gameId}`);
  const g = game.data;
  console.log(`\nsourceType=${g.sourceType} state=${g.state} sides=${g.sides?.length} version=${g.version}`);
  console.log(`\nGAME_ID=${gameId}`);
}

main().catch((error) => {
  console.error(`실패: ${error.message}`);
  process.exit(1);
});
