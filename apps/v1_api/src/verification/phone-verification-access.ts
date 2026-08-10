/** 미인증 계정이 강제로 보내지는 인증 화면. 403 응답의 next.route 로 프론트에 전달된다. */
export const PHONE_VERIFICATION_ROUTE = '/my/phone-verify';

/**
 * 휴대폰 인증 강제 여부의 단일 판정.
 *
 * register 게이트(PhoneVerificationService.enabled), 프로필 번호 변경 게이트(ProfileService),
 * 전역 쓰기 게이트(V1AuthGuard)가 모두 같은 판정을 써야 한다 — 한쪽만 env 를 다시 읽으면
 * "가입은 막는데 번호 변경은 통과" 같은 반쪽 강제가 생기고, 그게 실제로 인증 우회 경로였다.
 *
 * 인증은 핵심 anti-abuse 통제이므로 **fail-closed** — 기본적으로 항상 필수다. SMS 시크릿 누락
 * 같은 설정 실수가 인증을 조용히 선택사항으로 만들지 못하도록, 비활성화는 명시적
 * 환경변수(V1_PHONE_VERIFICATION_DISABLED=true)로만 허용한다(비상용 opt-out).
 */
export function isPhoneVerificationEnforced(): boolean {
  return process.env.V1_PHONE_VERIFICATION_DISABLED !== 'true';
}

/** 조회는 미인증 계정에도 열어 둔다 — 차단 대상은 쓰기(신청·생성·참가·전송)뿐이다. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 미인증 계정에도 열어 두는 쓰기 경로.
 *
 * 두 겹으로 나뉜다.
 *
 * (1) 계정이 잠기지 않게 하는 최소 경로 — 이게 막히면 인증을 끝낼 수도, 떠날 수도 없다.
 * - /verification : 본인인증 자체. 막으면 인증을 끝낼 방법이 사라져 계정이 영구히 잠긴다.
 * - /auth         : 로그인·로그아웃·소셜 가입 완료. 가입 도중 잠기지 않게 한다.
 * - /admin        : 운영 콘솔. 운영자 계정이 미인증이면 장애 대응 자체가 막힌다.
 * - /terms/consents : 약관 재동의. 앞선 약관 게이트와 서로를 막는 교착을 방지한다.
 * - /me           : 프로필·설정·지역·관심사, 그리고 탈퇴(/me/withdrawal-request).
 *
 * (2) 자기 계정 범위 — 남에게 아무 영향도 주지 않는 쓰기.
 * 인증 도입 이전에 가입한 **레거시 미인증 계정**을 위해 연다. 이들은 로그인은 되는데 쓰기가
 * 전부 막혀서, 프로필 사진 한 장 바꾸지 못한 채 인증 안내만 반복해서 보게 된다. 인증이 실제로
 * 필요한 지점(팀·대회·채팅·매치·리뷰)은 그대로 막아 두고, 자기 계정을 건사하는 일만 돌려준다.
 * - /onboarding   : 온보딩 진행·완료·보류.
 * - /notifications, /notification-preferences : 읽음 처리와 푸시 구독. 수신자는 본인뿐이다.
 * - /uploads      : 프로필 사진. 자체 rate limit(이미지 20/분·영상 3/분)이 이미 걸려 있다.
 * - /inquiries    : 고객 문의. 막으면 "인증이 안 된다"는 문의 자체를 보낼 수 없는 교착이 된다.
 *                   유일하게 운영자에게 도달하므로 컨트롤러에 별도 rate limit 을 둔다.
 * - /search       : 최근 검색어 기록.
 * - /logs         : 클라이언트 에러 리포트.
 * - /master       : 지역 좌표 해석. 조회에 가깝지만 POST 로 노출돼 있다.
 *
 * 새 엔드포인트는 기본이 "막힘"이다(fail-closed). 여는 것은 언제나 명시적 추가여야 하며,
 * 반대로 뒤집으면 목록에 넣는 걸 잊는 순간 조용히 인증 우회가 생긴다.
 *
 * 접두사 매칭은 경계(`/`)까지 확인하므로 `/me` 가 `/mercenary` 를,
 * `/admin` 이 `/admins` 를 삼키지 않는다.
 */
const ALLOWED_WRITE_PREFIXES = [
  '/verification',
  '/auth',
  '/admin',
  '/me',
  '/onboarding',
  '/notifications',
  '/uploads',
  '/inquiries',
  '/search',
  '/logs',
  '/master',
];

/** 접두사로 열면 이웃 경로까지 삼키는 것들 — 정확히 일치할 때만 연다. */
const ALLOWED_WRITE_PATHS = ['/terms/consents', '/notification-preferences'];

/**
 * 플랫폼 관리자는 휴대폰 인증 게이트에서 면제된다.
 *
 * 왜 경로가 아니라 신분 기준인가: 운영 콘솔의 쓰기는 `/tournament-ops/*` 가 아니라 대부분
 * `/games/:gameId/...`(commands·events·lineups·result-revisions·corrections)로 나간다. 그런데
 * `/games/*` 에는 일반 사용자의 신원연동·동의 쓰기도 같이 있어서, 경로 프리픽스로 열면
 * 미인증 계정에게 "내가 그 선수다" 를 주장하는 경로까지 함께 열린다 — 휴대폰 인증이 정확히
 * 막으려는 행위다. 그래서 "어느 경로냐" 가 아니라 "누구냐" 로 판정한다.
 *
 * 권한이 약해지지 않는 이유: 관리자·스태프 전용 라우트는 각자 자기 권한 계층
 * (`TournamentStaffGuard`, `GamesService.resolveActor` 의 role 검사, `AdminGuard`)을 그대로
 * 통과해야 한다. 이 면제는 **인증(휴대폰) 게이트만** 건너뛸 뿐 인가(role)에는 손대지 않는다.
 * 관리자 권한 자체가 이미 다른 관리자가 명시적으로 부여해야 얻어지는, 휴대폰 인증보다 훨씬
 * 강한 통제다.
 *
 * `status`(V1AdminStatus)가 `active` 일 때만 면제한다 — 회수(revoked)된 관리자는 면제되지 않는다.
 */
export function isPhoneVerificationExemptActor(
  actor: { adminUser?: { status: string } | null } | null | undefined,
): boolean {
  return actor?.adminUser?.status === 'active';
}

/**
 * 이 요청이 휴대폰 미인증 상태에서도 허용되는가.
 * method 가 비어 있으면 안전한 조회로 단정하지 않고 쓰기로 취급한다(fail-closed).
 */
export function isPhoneVerificationRequestAllowed(
  method: string | undefined,
  requestUrl: string,
): boolean {
  if (method && SAFE_METHODS.has(method.toUpperCase())) return true;

  const path = normalizeRoutePath(requestUrl);
  if (ALLOWED_WRITE_PATHS.includes(path)) return true;
  return ALLOWED_WRITE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** `/api/v1/foo/?x=1` → `/foo`. 글로벌 프리픽스가 붙은 originalUrl 과 라우트 경로를 같은 축으로 맞춘다. */
function normalizeRoutePath(requestUrl: string): string {
  const pathname = requestUrl.split('?')[0] ?? '/';
  const withoutPrefix = pathname.replace(/^\/api\/v\d+/, '/');
  const trimmed = withoutPrefix.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
