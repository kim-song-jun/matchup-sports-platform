/**
 * 몰수·중단 종결의 공용 어휘.
 *
 * 이 값은 세 화면에 동시에 나온다 — 운영 콘솔의 종료 다이얼로그(운영자가 사유를
 * 고르는 곳), 어드민 결과 검토(확정 전에 근거를 보는 곳), 관전자 공개 경기 기록
 * (사유가 최종적으로 남는 곳). 셋이 각자 라벨을 들고 있으면 같은 사건이 화면마다
 * 다른 이름으로 보이고, 그러면 "이 경기가 왜 이 점수인지"를 추적하려는 사람이
 * 세 화면을 같은 사건으로 연결하지 못한다. 그래서 라벨의 단일 소스는 여기 하나다.
 *
 * 어느 화면에도 속하지 않는 `lib/` 에 두는 이유: 셋 중 아무 화면 폴더에 두면 나머지
 * 둘이 그 화면의 컴포넌트 트리에 의존하게 된다(어드민이 공개 기록 모듈을, 또는 공개
 * 화면이 운영 콘솔 모듈을 끌어오는 식).
 */

/** 서버 `V1GameResultRevision.outcomeReason` 중 정상 종료(`NORMAL`)를 뺀 값. */
export type MatchOutcomeReason = 'FORFEIT' | 'ABANDONED';

const MATCH_OUTCOME_REASON_LABEL: Record<MatchOutcomeReason, string> = {
  FORFEIT: '몰수·기권',
  ABANDONED: '경기 중단',
};

export function matchOutcomeReasonLabel(reason: MatchOutcomeReason): string {
  return MATCH_OUTCOME_REASON_LABEL[reason];
}

/**
 * 표시 가능한 사유인지 판별한다. `reason !== 'NORMAL'` 로 분기하면 서버가 새 enum 값을
 * 추가하거나(또는 계약에 뒤처진 목/구버전 응답이 필드를 빼거나) 했을 때 라벨 조회가
 * `undefined` 를 돌려주고, 그게 그대로 문자열에 섞여 **되돌릴 수 없는 확정 직전 문구**에
 * "2:1 (undefined) 결과를 공식 결과로 확정해요" 로 뜬다(유닛 테스트가 실제로 잡은 결함).
 * 아는 값만 통과시키고, 모르는 값은 표기를 생략한다 — 틀린 라벨보다 무표기가 안전하다.
 */
export function toDisplayableOutcomeReason(reason: string | null | undefined): MatchOutcomeReason | null {
  return reason === 'FORFEIT' || reason === 'ABANDONED' ? reason : null;
}
