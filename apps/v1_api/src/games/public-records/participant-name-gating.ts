import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { isParticipantPubliclyEligible, type ParticipantConsentEligibility } from './public-consent';

/**
 * 대회 경기(`public-tournament-records.service.ts`)와 팀 전적
 * (`public-team-records.service.ts`)이 함께 쓰는 "경기 참가자 이름을 어떻게
 * 보여줄지" 판정 모음. 원래 `public-tournament-records.service.ts` 안에만 있었지만,
 * 팀 전적 API(D-24 확장)가 경기 이벤트(득점자/카드)를 새로 노출하면서 **같은 규칙을
 * 정확히 똑같이** 적용해야 했다 -- "팀 전적에서만 실명이 더 노출되면 개인정보
 * 사고"이기 때문에, 같은 판정을 두 파일에 따로 베껴 적지 않고 이 파일 하나를
 * 공유한다.
 */

/** `loadParticipantNameProfiles`가 배치 조회하는 V1UserProfile 투영 -- 이름 표시
 * 해석(`resolveParticipantDisplayName`)에 필요한 4개 필드로 좁혀져 있다. */
export type ParticipantNameProfileRow = {
  userId: string;
  realName: string | null;
  displayName: string | null;
  nickname: string;
  tournamentRealNameVisible: boolean;
  deletedAt: Date | null;
};

/**
 * 대회 경기 기록 실명 표시 토글(2026-08-18 사용자 결정) -- 이름이 보이는 참가자
 * (`resolveParticipantNameEligible`이 통과시킨 사람) 중 `userId`가 연결된 사람만
 * 골라 `V1UserProfile`을 한 번에 in 조회한다(N+1 금지, `loadLiveScores`/`loadScorers`와
 * 동일한 배치 패턴). 게스트(`userId === null`)는 조인 대상 자체가 아니므로 여기 오지
 * 않는다 -- 호출부(`resolveParticipantDisplayName`)가 그 경우 스냅샷으로 바로 분기한다.
 *
 * select를 `realName`/`displayName`/`nickname`/`tournamentRealNameVisible`로 좁혀
 * 응답에 생년월일·연락처 같은 다른 PII가 새로 실리지 않게 한다 -- 이 프로필 행은
 * 그대로 공개 응답 페이로드의 이름 문자열로 변환될 값이라 select 범위가 곧 노출 범위다.
 */
export async function loadParticipantNameProfiles(
  prisma: PrismaService,
  userIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, ParticipantNameProfileRow>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => id !== null)));
  if (uniqueUserIds.length === 0) return new Map();
  const profiles = await prisma.v1UserProfile.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: {
      userId: true,
      realName: true,
      displayName: true,
      nickname: true,
      tournamentRealNameVisible: true,
      deletedAt: true,
    },
  });
  return new Map(profiles.map((profile) => [profile.userId, profile] as const));
}

/**
 * 대회 참가자 이름 공개 정책 (2026-08-13 결정 → 2026-08-18 갱신).
 *
 * ## 지금까지도 그대로인 것: "이름이 보이는가"
 * 대회 경기 기록(라인업/이벤트 득점자/MVP)에 **어떤 이름이든 하나가 붙는가**는
 * 2026-08-13 결정 그대로다 -- 계정 연동·동의(Task 24 consent) 여부와 무관하게 항상
 * 보인다. "대회에 선수로 등록해 실제로 뛰었다"는 사실 자체가 공개 활동이라는 전제,
 * 그리고 그 전제가 적용되는 모집단(`V1GameParticipant`, 게스트/미연동 참가자 포함)도
 * 바뀌지 않았다. 이 게이트는 여전히 `resolveParticipantNameEligible`이 맡고, 되돌리는
 * 방법(`V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true` 환경 변수)도 아래 그대로
 * 남아 있다 -- 재배포 없이 이전(Task 24 동의 게이팅)으로 즉시 돌아갈 수 있다.
 *
 * ## 2026-08-18에 바뀐 것: "보이면 어떤 이름인가"
 * 이름이 보이기로 정해진 다음, **그 이름이 실명인지 닉네임인지**는 이제 참가자 본인이
 * 프로필에서 켜고 끄는 스위치(`V1UserProfile.tournamentRealNameVisible`, 기본값
 * false)로 결정된다 -- 대회 신청 때마다 동의를 다시 묻지 않고, 한 번 켜면 이후 모든
 * 대회 기록에 계속 적용된다. 이전 정책은 이 지점에서 **항상 실명**(`displayNameSnapshot`,
 * 브라켓 생성 시점에 `V1TournamentPlayer.realName`에서 찍힌 스냅샷)을 썼다 -- 그게
 * "동의와 무관하게 공개"라는 표현이 실제로 뜻하던 값이었다. 지금은 그 자리를
 * `resolveParticipantDisplayName`(아래)이 대신한다:
 *   - `userId`가 없는 참가자(게스트/미연동)는 조인 대상이 아니므로 여전히
 *     `displayNameSnapshot` 그대로다 -- 이 경우는 전혀 바뀌지 않았다.
 *   - `userId`가 있는데 프로필이 없거나(온보딩 미완료 등) 토글이 없으면 실명 없이
 *     조용히 시작해야 하므로(fail-closed) 역시 스냅샷으로 접지한다.
 *   - `userId`가 있고 토글 OFF(기본값)면 `V1UserProfile.nickname`(닉네임)을 쓴다.
 *     **`displayName`을 여기 끼워 넣으면 안 된다** -- 그 컬럼은 닉네임이 아니라
 *     실명의 레거시 미러다: 가입 경로(`auth.service.ts`)가 `const realName = displayName;`
 *     으로 가입 폼의 실명을 두 컬럼에 함께 쓰고, `UpdateProfileDto.displayName`은
 *     `@deprecated`로 남아 `realName`으로 접힌다. 실제로 2026-08-18 alpha에서
 *     이 폴백 때문에 OFF인데도 실명이 그대로 노출됐다(닉네임 `E2E선수01` 대신
 *     `선수01`). 코드베이스의 다른 공개 경로도 모두 `profile.nickname`을 쓴다
 *     (`profile.service.ts`, `public-user-records.service.ts`).
 *   - `userId`가 있고 토글 ON이면 `V1UserProfile.realName`(실명)을 쓰되, 그 필드가
 *     비어 있으면(실명을 아직 입력 안 한 채 토글만 켠 경우) 닉네임으로 방어적으로
 *     내려간다 -- 빈 이름을 보여주지 않기 위함이지 실명을 지어내는 게 아니다.
 *   - 탈퇴 회원(`deletedAt != null`)만 예외로 `displayName`('탈퇴 회원')을 쓴다 --
 *     탈퇴 처리가 nickname을 `deleted_<8자>` 식별자로 덮어쓰기 때문이다.
 *
 * `displayNameSnapshot`은 여전히 라인업/브라켓 생성 시점에 찍힌 불변 스냅샷이라
 * `V1User`로의 라이브 조인이 아예 없다(계정을 탈퇴해도 갱신되지 않는다, `roster-cleanup.ts`와
 * 동일한 "기록 보존" 원칙) -- 새 정책에서 그 스냅샷이 쓰이는 경우(게스트/프로필 없음)의
 * 성격도 그대로다. 반면 `userId`가 있는 참가자는 이제 **표시 시점에 매번**
 * `V1UserProfile`을 조인하므로(`loadParticipantNameProfiles`), 토글을 끄고 켜는 즉시
 * (재배포·재계산 없이) 다음 조회부터 반영된다 -- 스냅샷과 달리 이 경로는 라이브 값이다.
 *
 * `public-consent.ts`의 판정 로직 자체는 건드리지 않는다 -- 위 "이름이 보이는가" 게이트와
 * 그 롤백 경로, 그리고 이 파일 밖의 다른 두 소비자(`public-user-records.service.ts`의
 * 개인 기록, `league-match-public.service.ts`의 리그)가 여전히 그대로
 * 의존한다. `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE`로 되돌렸을 때도
 * `resolveParticipantDisplayName`의 토글 기반 이름 선택은 그대로 적용된다 -- 그 환경
 * 변수가 통제하는 것은 "이름이 보이는가"뿐이고 "어떤 이름인가"는 이번 정책이 대체한
 * 별개의 축이라, 되돌린 상태에서도 실명 대신 닉네임 기본값이 유지되는 것이 맞다.
 *
 * ## 팀 전적(`public-team-records.service.ts`)도 이 정책을 그대로 쓴다
 * 환경 변수 이름은 여전히 `V1_TOURNAMENT_...`이지만(대회 경기 기록에서 처음 만들어진
 * 이름이라 바꾸지 않았다 -- 이미 배포된 롤백 스위치의 이름을 바꾸는 건 별도 변경),
 * 이 함수가 게이팅하는 모집단은 `V1GameParticipant` 전체이지 대회 소스 타입으로
 * 좁혀져 있지 않다. 팀 전적 API가 노출하는 골/카드 득점자는 대회 경기든 팀 매치든
 * 똑같이 이 판정을 통과해야 한다 -- 팀 전적에서만 실명이 더 보이면 개인정보 사고다.
 */
export function isTournamentParticipantNameGatingReverted(): boolean {
  return process.env.V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE === 'true';
}

/**
 * 라인업/이벤트/MVP 세 빌더와 일정 카드 득점자 요약, 그리고 팀 전적의 이벤트 요약이
 * 공유하는 단일 판정. 기본(정책 공개)일 때는 무조건 true -- `consent`는 건드리지도
 * 않는다. 되돌렸을 때만 기존 규칙(스태프 우회 OR 동의 eligible)을 그대로 재현한다.
 * `isParticipantPubliclyEligible` 자체가 시간 인자를 받지 않으므로(공개 동의 규칙
 * 재정의, `public-consent.ts` 참고) 이 함수도 시간 인자를 받지 않는다. 스태프 우회
 * 자체가 없는 화면(일정 카드 득점자 요약, 팀 전적)의 호출부는 항상
 * `isStaffBypass=false`로 호출해 되돌린 상태에서도 기존 동작과 완전히 동일하게
 * 유지한다.
 */
/**
 * 참가자의 **공개 프로필 주소**. 열어도 되면 경로를, 아니면 `null` 을 돌려준다.
 *
 * 공개 응답에 `userId` 를 싣지 않기로 한 결정(2026-08-24 B-2)의 구현이다. 계정 식별자를
 * 내보내면 이름을 가려 둔 경기에서도 같은 id 로 사람을 이어 붙일 수 있게 되는데, 링크를
 * 걸기 위해 그 표면을 새로 만들 이유가 없다. 대신 **열어도 되는지 판단까지 여기서 끝내고**
 * 소비처에는 바로 쓸 수 있는 경로만 준다 — 화면 세 곳이 각자 게이팅을 다시 판단하면
 * 언젠가 갈린다.
 *
 * 두 가지를 모두 만족해야 열린다:
 *   1. `userId` 가 있다 — 라인업은 이름만으로도 짤 수 있어서, 계정이 없는 참가자에게는
 *      애초에 열어 줄 프로필이 없다.
 *   2. 사용자 단위 공개 동의가 켜져 있다 — 프로필 화면(`/users/:id`) 자체가 같은 조건으로
 *      게이팅하므로, 이걸 빼면 열어도 빈 화면이 나오는 링크를 걸게 된다.
 *
 * **`resolveParticipantNameEligible` 의 롤백 스위치를 타지 않는다.** 그 스위치는 "이름을
 * 보여줄지"를 되돌리는 것이고, 프로필 링크는 이름보다 강한 노출(그 사람의 전체 활동 기록)
 * 이라 동의를 직접 확인한다. 이름 게이팅이 꺼져 있어도 동의하지 않은 사람의 프로필은
 * 열리지 않는다.
 */
export function resolveParticipantProfileHref(
  userId: string | null,
  consent: ParticipantConsentEligibility | undefined,
): string | null {
  if (userId === null) return null;
  if (consent === undefined || !isParticipantPubliclyEligible(consent)) return null;
  return `/users/${encodeURIComponent(userId)}`;
}

export function resolveParticipantNameEligible(
  isStaffBypass: boolean,
  consent: ParticipantConsentEligibility | undefined,
): boolean {
  if (!isTournamentParticipantNameGatingReverted()) return true;
  return isStaffBypass || (consent !== undefined && isParticipantPubliclyEligible(consent));
}

/**
 * "이름이 보이기로 정해진(eligible) 참가자에게 실제로 어떤 이름 문자열을 붙일지" --
 * 위 `isTournamentParticipantNameGatingReverted` doc comment의 2026-08-18 표(닉네임
 * 기본 + 프로필 토글)를 그대로 구현한다. 이 함수는 `resolveParticipantNameEligible`이
 * 이미 true를 반환한 뒤에만 호출되므로 "숨길지"는 다루지 않는다 -- 오직 "무엇을
 * 보여줄지"만 결정한다.
 *
 * `participant`가 `undefined`(라인업 스냅샷에 없는 참가자 id를 이벤트가 참조하는 경우,
 * `buildEvents`의 기존 fail-safe와 동일한 상황)면 이름을 지어내지 않고 그대로 null이다.
 */
export function resolveParticipantDisplayName(
  participant: { userId: string | null; displayNameSnapshot: string } | undefined,
  profileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
): string | null {
  if (participant === undefined) return null;
  if (participant.userId === null) return participant.displayNameSnapshot;
  const profile = profileByUserId.get(participant.userId);
  if (profile === undefined) return participant.displayNameSnapshot;
  // 탈퇴 회원만 예외로 displayName을 쓴다. 탈퇴 처리(admin.service.ts)가 nickname을
  // `deleted_<8자>`라는 내부 식별자로 덮어쓰고 displayName에만 '탈퇴 회원'을 남기므로,
  // 여기서 nickname을 쓰면 화면에 식별자가 그대로 노출된다.
  if (profile.deletedAt !== null) return profile.displayName ?? profile.nickname;
  if (profile.tournamentRealNameVisible) {
    return profile.realName ?? profile.nickname;
  }
  return profile.nickname;
}

/** GOAL/CARD 이벤트의 `payload`에서 카드 색을 읽는다 -- 카드가 아니거나 색 정보가
 * 없는(과거 payload) 이벤트는 null. `buildEvents`/`loadScheduleEvents`/팀 전적
 * 이벤트 요약이 모두 이 파서를 공유한다. */
export function parseCardColor(value: Prisma.JsonValue): 'YELLOW' | 'RED' | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
  const card = value.card;
  return card === 'YELLOW' || card === 'RED' ? card : null;
}

/**
 * 백필로 복원된 골/카드는 `period`/`clockMs`가 "모른다"는 뜻으로 null로 내려온다(위
 * `parseCardColor`를 쓰는 호출부가 `isPeriodUnknown`/`isMinuteUnknown`으로 이미 그렇게
 * 접어 놓은 뒤다). DB의 `orderBy: [period, clockMs, sequence]`는 그 null을 반영하지
 * 않으므로(백필이 넣은 `period: 1`/`clockMs: 0` 플레이스홀더를 진짜 값으로 믿고
 * 정렬한다), 이 비교자로 다시 정렬해 모르는 값을 뒤로 보낸다 -- 안 그러면 "몇 분인지
 * 모른다"고 선언한 골이 정렬에서는 맨 앞(그 경기의 첫 골)으로 잘못 나타난다.
 * `Array.prototype.sort`는 안정 정렬이라 알려진 값들 사이의 기존 순서는 그대로
 * 보존된다.
 */
export function byUnknownLast(
  a: { period: number | null; clockMs: number | null },
  b: { period: number | null; clockMs: number | null },
): number {
  const period = (a.period ?? Number.MAX_SAFE_INTEGER) - (b.period ?? Number.MAX_SAFE_INTEGER);
  if (period !== 0) return period;
  return (a.clockMs ?? Number.MAX_SAFE_INTEGER) - (b.clockMs ?? Number.MAX_SAFE_INTEGER);
}
