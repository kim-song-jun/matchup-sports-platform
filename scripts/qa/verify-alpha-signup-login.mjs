#!/usr/bin/env node
// alpha 에서 회원가입과 로그인이 끝까지 되는지 실제로 해 본다.
//
// 왜 자동화할 수 있게 됐나: alpha 는 인증번호를 발송하지 않고 응답에 실어 보낸다
// (docker-compose.alpha.yml 의 V1_VERIFICATION_DEV_ECHO). 실제 문자를 기다려야 하면 이 흐름은
// 사람이 폰을 들고 있어야만 돌릴 수 있고, 그래서 그동안 가입 경로는 E2E 에서 통째로 빠져
// 있었다 — 기존 계정을 재사용하는 시나리오만 돌았다.
//
// 검증하는 계약(하나라도 어긋나면 실패로 끝난다):
//   1. 약관 목록이 필수 문서를 준다
//   2. 중복 확인이 처음 보는 닉네임·이메일을 통과시킨다
//   3. 인증번호 발급이 devCode 를 함께 준다  ← 우회가 실제로 켜져 있다는 유일한 증거
//   4. 틀린 코드는 거절된다                   ← 우회가 검증 자체를 무력화하지 않았다는 증거
//   5. 맞는 코드가 proofToken 을 준다
//   6. 그 토큰으로 가입이 되고 세션 쿠키가 내려온다
//   7. 방금 만든 계정으로 로그인이 되고
//   8. /auth/me 가 같은 사람을 돌려준다
//
// 4번이 있는 이유: devCode 를 그대로 넘기면 서버가 코드를 안 보고 통과시켜도 3·5·6이 전부
// 초록이다. 틀린 코드를 한 번 던져 봐야 "검증이 살아 있다" 를 말할 수 있다.
//
// 이 스크립트는 alpha 에 **사용자 행을 만든다.** 지우지 않는다 — 가입 흐름을 다시 밟을 때
// 필요하고, 남은 계정이 어떤 것인지 이름으로 알 수 있게 접두어를 붙인다.
//
// 사용법:
//   node scripts/qa/verify-alpha-signup-login.mjs
//   BASE_URL=https://alpha.teameet.co.kr node scripts/qa/verify-alpha-signup-login.mjs

const BASE = process.env.BASE_URL ?? 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
// 사람이 만든 계정과 섞이지 않게. 나중에 정리할 때 이 접두어로 고른다.
const PREFIX = 'qa-e2e';

const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;
const account = {
  nickname: `${PREFIX}${stamp}`,
  email: `${PREFIX}.${stamp}@example.com`,
  password: 'QaE2e!2026alpha',
  // 010-0000-xxxx 는 어느 통신사에도 배정되지 않는다. 발송 경로가 꺼져 있으므로 어차피 아무
  // 곳으로도 나가지 않지만, 실수로 실발송이 켜져 있어도 남의 폰이 울리지 않는 번호를 쓴다.
  phone: `0100000${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
  realName: 'QA 이이삼',
  birthDate: '19950301',
  gender: 'male',
};

let cookie = null;
const steps = [];

function record(name, ok, detail) {
  steps.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`${name}: ${detail ?? 'failed'}`);
}

async function call(path, { method = 'GET', body, useCookie = false } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (useCookie && cookie) headers.cookie = cookie;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  // getSetCookie() is the only way to read more than one Set-Cookie; the joined header
  // collapses them and the session value gets lost among the others.
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const session = setCookies.find((c) => c.startsWith('teameet_v1_session='));
  if (session) cookie = session.split(';')[0];

  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 JSON 이 아닌 경우 그대로 둔다 */ }
  return { status: response.status, json, text, gotSession: Boolean(session) };
}

async function main() {
  console.log(`대상: ${BASE}`);
  console.log(`계정: ${account.nickname} / ${account.email} / ${account.phone}\n`);

  // 1 ── 약관
  const terms = await call('/terms/current?context=signup');
  record('약관 목록', terms.status === 200 && Array.isArray(terms.json?.data?.items) && terms.json.data.items.length > 0,
    `${terms.status}, ${terms.json?.data?.items?.length ?? 0}건`);
  const documentIds = terms.json.data.items.map((item) => item.documentId);

  // 2 ── 중복 확인
  const nickCheck = await call(`/auth/check-nickname?nickname=${encodeURIComponent(account.nickname)}`);
  record('닉네임 중복 확인', nickCheck.status === 200 && nickCheck.json?.data?.available === true,
    JSON.stringify(nickCheck.json?.data ?? nickCheck.status));
  const mailCheck = await call(`/auth/check-email?email=${encodeURIComponent(account.email)}`);
  record('이메일 중복 확인', mailCheck.status === 200 && mailCheck.json?.data?.available === true,
    JSON.stringify(mailCheck.json?.data ?? mailCheck.status));

  // 3 ── 인증번호 발급. devCode 가 없으면 우회가 꺼진 것이고, 그러면 이 흐름은 자동화할 수 없다.
  const issue = await call('/auth/phone/issue', { method: 'POST', body: { phone: account.phone } });
  const devCode = issue.json?.data?.devCode;
  record('인증번호 발급', issue.status === 200 && typeof devCode === 'string' && /^\d{6}$/.test(devCode),
    issue.status === 200 && !devCode
      ? 'devCode 없음 — 발송 수단이 살아 있어 우회가 꺼져 있다(dispatcher 는 sms·email 이 모두 비활성일 때만 코드를 싣는다)'
      : `${issue.status}, devCode ${devCode ? '받음' : '없음'}`);

  // 4 ── 틀린 코드는 막혀야 한다. 이게 없으면 5·6의 통과가 아무것도 증명하지 못한다.
  const wrong = String((Number(devCode) + 1) % 1_000_000).padStart(6, '0');
  const rejected = await call('/auth/phone/verify', { method: 'POST', body: { phone: account.phone, code: wrong, purpose: 'signup' } });
  record('틀린 인증번호 거절', rejected.status >= 400,
    `${rejected.status} ${rejected.json?.code ?? ''}`);

  // 5 ── 맞는 코드
  const verified = await call('/auth/phone/verify', { method: 'POST', body: { phone: account.phone, code: devCode, purpose: 'signup' } });
  const proofToken = verified.json?.data?.proofToken;
  record('인증번호 확인', verified.status === 200 && typeof proofToken === 'string' && proofToken.length > 0,
    `${verified.status}, proofToken ${proofToken ? `${proofToken.length}자` : '없음'}`);

  // 6 ── 가입
  const registered = await call('/auth/register', {
    method: 'POST',
    body: {
      nickname: account.nickname,
      email: account.email,
      password: account.password,
      requiredTermsAccepted: true,
      acceptedTermsDocumentIds: documentIds,
      phoneProofToken: proofToken,
      realName: account.realName,
      phone: account.phone,
      birthDate: account.birthDate,
      gender: account.gender,
    },
  });
  record('회원가입', registered.status >= 200 && registered.status < 300 && registered.gotSession,
    `${registered.status}${registered.gotSession ? ', 세션 쿠키 받음' : ', 세션 쿠키 없음'}` +
    (registered.status >= 400 ? ` ${registered.text.slice(0, 200)}` : ''));

  // 7 ── 로그인. 가입이 준 쿠키가 아니라 **새로 받은** 쿠키로 확인해야 로그인 경로를 잰 것이다.
  cookie = null;
  const login = await call('/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  // 2xx 면 통과. 이 라우트에는 @HttpCode 가 없어서 NestJS 기본값대로 POST 가 201 을 낸다 —
  // 200 을 요구하면 «로그인이 되는가» 가 아니라 «NestJS 기본 상태코드가 무엇인가» 를 재게 된다.
  record('로그인', login.status >= 200 && login.status < 300 && login.gotSession,
    `${login.status}${login.gotSession ? ', 세션 쿠키 받음' : ', 세션 쿠키 없음'}`);

  // 8 ── 같은 사람인지
  const me = await call('/auth/me', { useCookie: true });
  const identity = me.json?.data;
  record('세션으로 본인 조회', me.status === 200 && (identity?.email === account.email || identity?.user?.email === account.email),
    `${me.status}, ${identity?.email ?? identity?.user?.email ?? '이메일 없음'}`);

  // 9 ── 틀린 비밀번호는 막혀야 한다.
  cookie = null;
  const badLogin = await call('/auth/login', { method: 'POST', body: { email: account.email, password: `${account.password}x` } });
  record('틀린 비밀번호 거절', badLogin.status >= 400 && !badLogin.gotSession, `${badLogin.status} ${badLogin.json?.code ?? ''}`);

  console.log(`\n${steps.length}단계 전부 통과. 만들어진 계정: ${account.email}`);
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  console.error(`통과 ${steps.filter((s) => s.ok).length} / 시도 ${steps.length}`);
  process.exitCode = 1;
});
