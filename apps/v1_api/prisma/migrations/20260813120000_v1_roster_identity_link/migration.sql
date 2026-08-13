-- 라인업 저장 시 팀 매니저가 로스터에 지정한 계정을 participant 에 함께 저장하고, 그 저장
-- 행위 자체를 신원 연결(identity link)의 새 트리거 액션(ROSTER_ASSERTED)으로 인정한다.
-- 배경: GET /users/:id/records 가 모든 사용자에게 항상 0건이었다 — v1_participant_identity_link_current
-- 행을 만드는 제품 경로가 없었기 때문(기존 5개 연결 API는 '선수 본인 요청 → 제3자 승인' 2자
-- 방식이고 프론트 호출부가 0건). 대회 라인업 DTO/V1GameParticipant 스키마에 userId 자체가
-- 없어 자동 연결이 구조적으로 불가능했다. 이 마이그레이션은 그 구조적 공백을 메운다.
--
-- v1_game_participants.user_id 는 여기서 만들지 않는다. 같은 날 dev 에 먼저 들어간
-- 20260813190000_v1_game_participant_user_id 가 그 컬럼의 소유자다(대회 라인업을 참가
-- 등록 명단과 대조하려고 추가됐고, userId 단독 조회 경로가 없어 인덱스도 두지 않기로
-- 결정됐다). 이 마이그레이션이 그 타임스탬프보다 앞서므로 여기서 같은 컬럼을 또 만들면
-- 빈 DB 재생 시 뒤따르는 마이그레이션과 충돌한다 — 컬럼은 그쪽에 맡기고, 여기서는
-- 연결/동의에 필요한 것만 만든다.
--
-- 1) V1IdentityLinkAction 에 ROSTER_ASSERTED 를 추가한다. 트리거 v1_guard_identity_event
--    (20260729000100_v1_game_operations 에서 생성)는 action IN ('ATTESTED', 'EXPIRED') 인
--    경우에만 승인자≠본인 검증을 강제하므로, ROSTER_ASSERTED 는 그 트리거를 건드리지 않고
--    통과한다 — 팀 매니저가 자기 자신을 라인업에 넣는 경우(선수 겸 매니저)도 막히지 않는다.
ALTER TYPE "V1IdentityLinkAction" ADD VALUE IF NOT EXISTS 'ROSTER_ASSERTED';

-- 3) 사용자 단위 공개 기록 동의 테이블. 기존 participant 단위 스냅샷(GRANTED/REVOKED +
--    effectiveAt 시간 비교)을 대체하는 상위 스위치 — 동의하면 시간 비교 없이 과거 경기까지
--    전부 공개 후보가 된다(개별 participant 의 REVOKED 스냅샷만 예외로 숨김. 이 규칙 자체는
--    apps/v1_api/src/games/public-records/public-consent.ts 가 구현한다).
CREATE TABLE "v1_user_record_consents" (
  "user_id" TEXT NOT NULL,
  "state" "V1ConsentState" NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "policy_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "v1_user_record_consents_pkey" PRIMARY KEY ("user_id")
);

-- 4) 백필: alpha 에는 이미 participant 단위 GRANTED 스냅샷으로 이름이 공개되는 참가자가
--    있다. 사용자 단위 동의로 전환하면서 이들이 조용히 사라지면 회귀다 — 각 participant 의
--    최신 스냅샷이 GRANTED 인 링크를 찾아 그 userId 를 GRANTED 상태로 미리 심어 둔다.
--    ON CONFLICT DO NOTHING 으로 userId 중복(여러 participant 가 같은 계정에 연결된 경우)을
--    걸러낸다. updated_at 은 컬럼 기본값이 없으므로(@updatedAt 은 Prisma 클라이언트가 채우는
--    관례를 따르되, raw SQL 백필에서는 직접 세팅) NOW() 를 명시한다.
WITH latest_snapshot AS (
  SELECT DISTINCT ON (participant_id) participant_id, state
  FROM "v1_participant_consent_snapshots"
  ORDER BY participant_id, consent_version DESC
),
granted_user_ids AS (
  SELECT DISTINCT lc.user_id
  FROM "v1_participant_identity_link_current" lc
  JOIN latest_snapshot ls ON ls.participant_id = lc.participant_id
  WHERE ls.state = 'GRANTED'
)
INSERT INTO "v1_user_record_consents" ("user_id", "state", "effective_at", "policy_hash", "created_at", "updated_at")
SELECT "user_id", 'GRANTED', CURRENT_TIMESTAMP, 'backfill-20260813-participant-snapshot', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM granted_user_ids
ON CONFLICT ("user_id") DO NOTHING;
