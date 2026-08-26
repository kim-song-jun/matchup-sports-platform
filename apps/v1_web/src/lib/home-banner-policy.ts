/**
 * 홈 상단 배너 표시 정책 (Task 154 P2-1, 사용자 선택 A안).
 *
 * ## 왜 필요한가
 * 배너 4종이 각자 독립 조건으로 뜬다. 조건이 겹치면 넷이 한꺼번에 쌓여 인사말·통계·
 * 추천이 전부 접힘 아래로 밀린다(alpha 실화면에서 2개가 연달아 뜨는 것을 확인했고,
 * 미인증 사용자면 넷까지 간다).
 *
 * ## A안: 성격에 따라 다르게 센다
 * 배너를 두 부류로 나눈다.
 *
 * - **차단성(blocking)**: 안 보이면 사용자가 *막힌 이유를 알 수 없는* 것. 휴대폰 인증이
 *   여기 해당한다 — 인증 전에는 매치 신청·대회 등록이 전부 거부되는데 조회는 되므로
 *   화면상 정상으로 보인다. **상한에서 제외하고 항상 보여준다.**
 * - **유도(nudge)**: 안 보여도 사용자가 막히지 않는 것. 우선순위대로 **한 번에 하나만**
 *   보여주고 나머지는 다음 방문으로 미룬다.
 *
 * 이 구분이 이 파일의 전부다. 넷을 같은 무게로 세면 차단성 배너가 유도 배너에 밀려
 * "왜 신청이 안 되지" 상태로 이탈하는 경우가 생긴다.
 *
 * ## 우선순위 근거 (2026-08-24 프로덕션 실측)
 * `recordConsent` 를 `pendingReviews`·`push` 앞에 둔다:
 *   - 신원 연결 1,384건 중 **131명 / 383경기가 동의만 켜면 즉시 공개**되는데 동의한
 *     사람이 0명이다. 노출 기회도 계정당 **총 2회**뿐이라 한 번 밀리면 회수가 어렵다.
 *   - `push` 는 로그인마다 다시 뜨므로 가장 뒤에 둬도 손해가 가장 적다.
 *   - `pendingReviews` 는 0건이 되면 스스로 사라지므로 영구 점유 위험이 없다.
 *
 * ## 어드민 설정화 여지
 * 지금 순서는 이 파일의 상수다(어드민 화면 없음). 나중에 서버에서 순서를 내려주게
 * 되면 `NUDGE_PRIORITY` 를 인자로 받게 바꾸면 되고, 호출부는 그대로다 — 그래서
 * 렌더 컴포넌트가 아니라 순수 함수로 떼어 뒀다.
 */

/** 유도 배너 식별자. 배열 순서가 곧 우선순위다(앞이 우선). */
export const NUDGE_PRIORITY = ['recordConsent', 'pendingReviews', 'push'] as const;

export type HomeNudgeKey = (typeof NUDGE_PRIORITY)[number];

export interface HomeBannerAvailability {
  /** 차단성 — 상한에서 제외되어 available 이면 항상 보인다. */
  readonly phoneVerify: boolean;
  readonly recordConsent: boolean;
  readonly pendingReviews: boolean;
  readonly push: boolean;
}

export interface HomeBannerDecision {
  readonly showPhoneVerify: boolean;
  /** 이번 방문에 보여줄 유도 배너 하나. 없으면 null. */
  readonly nudge: HomeNudgeKey | null;
  /** 조건은 맞지만 이번엔 밀린 유도 배너들. 진단·테스트용이며 렌더에는 쓰지 않는다. */
  readonly deferred: readonly HomeNudgeKey[];
}

/**
 * 한 번에 보여줄 유도 배너 수. 1인 이유는 차단성 배너가 이미 한 자리를 쓸 수 있어서
 * 최악의 경우에도 상단이 2개를 넘지 않게 하기 위해서다.
 */
export const MAX_NUDGES = 1;

export function decideHomeBanners(available: HomeBannerAvailability): HomeBannerDecision {
  const eligible = NUDGE_PRIORITY.filter((key) => available[key]);
  const shown = eligible.slice(0, MAX_NUDGES);
  return {
    showPhoneVerify: available.phoneVerify,
    nudge: shown[0] ?? null,
    deferred: eligible.slice(MAX_NUDGES),
  };
}
