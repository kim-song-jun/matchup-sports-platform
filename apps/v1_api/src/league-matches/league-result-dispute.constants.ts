/**
 * D2 (2026-08-24 사용자 확정 E2/E3/E4): 리그 경기 결과의 자동 승인 지연 시간과
 * 이의 제기 가능 기간. **전역 상수다 -- 리그별 설정이 아니다.** 이 두 값 외의
 * 숫자를 임의로 도입하지 않는다(태스크 지침).
 *
 * 자동 승인은 팀이 직접 제출한 결과(GamesService.submitResultRevision, SUBMITTED
 * 상태)에만 적용된다 -- 운영자가 직접 입력하는 경로(LeagueMatchResultEntryService,
 * E1)는 이미 같은 트랜잭션 안에서 즉시 approve까지 수행하므로 SUBMITTED 상태로
 * 머무르는 시간이 사실상 없고, 이 자동 승인 대상이 될 일도 없다(있어도
 * `revision.state !== 'SUBMITTED'` 가드가 조용히 막는다 -- 멱등).
 */
export const LEAGUE_RESULT_AUTO_APPROVE_DELAY_MS = 24 * 60 * 60 * 1_000;

/** 결과가 OFFICIAL로 확정된 시점(officialAt) 기준 이의 제기 가능 기간. */
export const LEAGUE_RESULT_DISPUTE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * 자동 승인이 `V1GameResultDecision`에 남기는 시스템 액터 식별자.
 *
 * **함정 회피 메모** (오케스트레이터 지침 -- `V1GameResultDecision.actorUserId`는
 * NOT NULL이고 `@@unique([revisionId, actorUserId, decision])`가 걸려 있다):
 * `actorUserId`를 nullable로 바꾸면 Postgres에서 NULL <> NULL이라 그 유니크가
 * 무력화된다(`V1ParticipantIdentityLinkEvent`가 이 문제를 systemActor 플래그를
 * 유니크에 함께 넣어 푼 선례가 있다). 이 컬럼은 애초에 FK가 걸려 있지 않다
 * (20260729000100_v1_game_operations 마이그레이션 확인 -- v1_users를 참조하지
 * 않는 평문 문자열이다). 그래서 이 상수를 **NULL을 도입하지 않고** actorUserId
 * 자리에 그대로 채운다: actorType='SYSTEM'과 짝지어 감사 로그에서 시스템 행위임이
 * 명확히 드러나고, 기존 유니크 제약이 (revisionId, 이 상수, 'approve') 조합으로
 * 그대로 idempotency를 보장한다 -- 스키마 변경도, REVIEWED_NON_ADDITIVE 예외
 * 등록도 필요 없다. `V1GameResultDecision.actorUserId`는 애초에 v1_users FK가
 * 없으므로 실제 사용자와 충돌할 걱정도 없다(uuid 형태가 아닌 값이라 실제 유저
 * id와 절대 겹치지 않는다).
 */
export const LEAGUE_RESULT_AUTO_APPROVE_SYSTEM_ACTOR_ID = 'system:league-result-auto-approve';
