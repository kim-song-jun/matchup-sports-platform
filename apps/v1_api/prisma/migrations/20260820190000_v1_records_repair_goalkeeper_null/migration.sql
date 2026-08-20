-- 20260819090000_v1_records_profile_integration_repair 를 **고쳐서 다시 수행한다.**
--
-- 왜 그 파일을 고치지 않고 통째로 복제했나: 이 저장소의 expand-contract 게이트
-- (`scripts/qa/check-expand-contract-migrations.mjs`)는 이미 커밋된 마이그레이션 파일의
-- 수정을 status != 'A' 로 잡아 거부한다 — 어딘가에 이미 적용된 마이그레이션이 나중에
-- 내용만 바뀌는 것을 막기 위한 규칙이다. 그래서 앞으로 고치는 새 파일이 유일한 길이다.
--
-- 왜 전체를 다시 하나: 원본에는 트랜잭션 비활성 지시자가 없어 Prisma 가 파일 전체를 한
-- 트랜잭션으로 돌린다. alpha 에서 마지막 INSERT 가 23502 로 죽으면서 **앞선 구문까지 전부
-- 롤백**됐다(2026-08-20 실측: 배포 로그 P3018 + 이후 배포 연쇄 차단). 즉 alpha 에는 원본의
-- 효과가 하나도 남아 있지 않으므로, 복구는 처음부터 다시 해야 한다.
--
-- 재실행 안전(멱등): 신원 링크 백필은 임시 테이블을 `NOT EXISTS` 두 개로 거르고 뒤이은
-- INSERT 도 `ON CONFLICT DO NOTHING` 이라 이미 채워진 DB 에서는 아무 행도 만들지 않는다.
-- 전적 보정 UPDATE 는 `IS DISTINCT FROM` 으로 이미 맞는 행을 건드리지 않고, 출전 행 백필도
-- `ON CONFLICT (result_revision_id, participant_id) DO NOTHING` 이다. 원본이 성공한 DB
-- (있다면)에서도 전부 no-op 이고, 빈 DB(CI 마이그레이션 재생)에서는 대상 데이터가 없다.
--
-- 운영 메모: alpha 처럼 원본이 **실패로 기록된** DB 는 Prisma 가 P3009 로 이후 모든
-- 마이그레이션을 막는다. 이 파일이 배포되기 전에 운영자가 실패 기록을 지워야 한다 —
-- 원본의 효과가 없으므로 `--rolled-back` 이 아니라 `--applied` 로 지운다(rolled-back 은
-- 원본을 다시 시도해 같은 지점에서 또 죽는다):
--   prisma migrate resolve --applied 20260819090000_v1_records_profile_integration_repair

-- Repair official team outcomes for regulation draws decided by penalties.
-- Regulation goals remain the goals-for/goals-against source; penalties only
-- decide WON/LOST.
WITH penalty_outcomes AS (
  SELECT
    trf.id,
    CASE
      WHEN trf.team_id = gof.home_team_id
        THEN CASE
          WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
             > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
            THEN 'WON'
          ELSE 'LOST'
        END
      ELSE CASE
        WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
           > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
          THEN 'WON'
        ELSE 'LOST'
      END
    END AS repaired_result
  FROM v1_team_record_facts trf
  JOIN v1_game_official_facts gof ON gof.revision_id = trf.revision_id
  JOIN v1_games game
    ON game.id = trf.game_id
   AND game.current_official_revision_id = trf.revision_id
  WHERE gof.home_score = gof.away_score
    AND jsonb_typeof(COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) = 'object'
    AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'home') = 'number'
    AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'away') = 'number'
    AND ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
      <> ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
)
UPDATE v1_team_record_facts trf
SET result = penalty_outcomes.repaired_result
FROM penalty_outcomes
WHERE trf.id = penalty_outcomes.id
  AND trf.result IS DISTINCT FROM penalty_outcomes.repaired_result;

-- Older tournament lineups predate automatic ROSTER_ASSERTED identity links.
-- Only participants that already carry a trusted user_id and have never had
-- an identity event are repaired. A revoked or disputed historical link is
-- deliberately never recreated.
CREATE TEMP TABLE v1_record_repair_identity_links ON COMMIT DROP AS
SELECT
  participant.id AS participant_id,
  participant.user_id,
  gen_random_uuid()::text AS link_id
FROM v1_game_participants participant
WHERE participant.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM v1_participant_identity_link_current current_link
    WHERE current_link.participant_id = participant.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM v1_participant_identity_link_events identity_event
    WHERE identity_event.participant_id = participant.id
  );

INSERT INTO v1_participant_identity_link_events (
  id,
  participant_id,
  link_id,
  event_version,
  request_id,
  action,
  user_id,
  effective_at,
  actor_type,
  actor_user_id,
  system_actor,
  reason,
  created_at
)
SELECT
  gen_random_uuid()::text,
  participant_id,
  link_id,
  1,
  link_id,
  'ROSTER_ASSERTED'::"V1IdentityLinkAction",
  user_id,
  CURRENT_TIMESTAMP,
  'SYSTEM'::"V1IdentityActorType",
  NULL,
  'V1_RECORD_PROFILE_REPAIR',
  'Backfill trusted roster participant identity for public record projection',
  CURRENT_TIMESTAMP
FROM v1_record_repair_identity_links;

INSERT INTO v1_participant_identity_link_current (
  participant_id,
  link_id,
  user_id,
  version,
  effective_from,
  updated_at
)
SELECT participant_id, link_id, user_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM v1_record_repair_identity_links
ON CONFLICT (participant_id) DO NOTHING;

-- Backfill missing appearance rows for current official tournament revisions.
-- This mirrors deriveAppearedParticipantIds plus the stat-event safety net.
ALTER TABLE v1_game_result_participants
  DISABLE TRIGGER v1_guard_result_participant_mutation;

DELETE FROM v1_game_result_participants result_participant
USING
  v1_game_result_revisions revision,
  v1_games game,
  v1_game_participants participant,
  v1_game_lineups lineup
WHERE result_participant.result_revision_id = revision.id
  AND revision.id = game.current_official_revision_id
  AND game.source_type = 'TOURNAMENT_FIXTURE'
  AND result_participant.participant_id = participant.id
  AND participant.lineup_id = lineup.id
  AND EXISTS (
    SELECT 1
    FROM v1_game_lineups newer_lineup
    WHERE newer_lineup.game_id = lineup.game_id
      AND newer_lineup.side_id = lineup.side_id
      AND newer_lineup.revision > lineup.revision
  );

WITH reversed_events AS (
  SELECT DISTINCT reverses_event_id AS event_id
  FROM v1_game_events
  WHERE reverses_event_id IS NOT NULL
),
active_events AS (
  SELECT event.*
  FROM v1_game_events event
  LEFT JOIN reversed_events reversed ON reversed.event_id = event.id
  WHERE reversed.event_id IS NULL
),
appearance_rows AS (
  SELECT
    revision.id AS result_revision_id,
    participant.id AS participant_id,
    participant.side_id,
    participant.started,
    participant.position,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'GOAL'
        AND event.participant_id = participant.id
    ) AS goals,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'GOAL'
        AND event.assist_participant_id = participant.id
    ) AS assists,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'FOUL'
        AND event.participant_id = participant.id
    ) AS fouls,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'CARD'
        AND event.participant_id = participant.id
        AND event.payload ->> 'card' IS DISTINCT FROM 'RED'
    ) AS yellow_cards,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'CARD'
        AND event.participant_id = participant.id
        AND event.payload ->> 'card' = 'RED'
    ) AS red_cards
  FROM v1_games game
  JOIN v1_game_result_revisions revision
    ON revision.id = game.current_official_revision_id
   AND revision.state = 'OFFICIAL'
  JOIN v1_game_participants participant ON participant.game_id = game.id
  JOIN v1_game_lineups lineup ON lineup.id = participant.lineup_id
  WHERE game.source_type = 'TOURNAMENT_FIXTURE'
    AND NOT EXISTS (
      SELECT 1
      FROM v1_game_lineups newer_lineup
      WHERE newer_lineup.game_id = lineup.game_id
        AND newer_lineup.side_id = lineup.side_id
        AND newer_lineup.revision > lineup.revision
    )
),
appeared AS (
  SELECT row.*
  FROM appearance_rows row
  WHERE row.started
     OR row.goals > 0
     OR row.assists > 0
     OR row.fouls > 0
     OR row.yellow_cards > 0
     OR row.red_cards > 0
     OR EXISTS (
       SELECT 1
       FROM active_events event
       JOIN v1_game_result_revisions revision
         ON revision.id = row.result_revision_id
       WHERE event.game_id = revision.game_id
         AND event.type = 'SUBSTITUTION'
         AND event.participant_id = row.participant_id
     )
)
INSERT INTO v1_game_result_participants (
  id,
  result_revision_id,
  participant_id,
  side_id,
  started,
  minutes_played,
  goals,
  assists,
  fouls,
  cards,
  goalkeeper,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  appeared.result_revision_id,
  appeared.participant_id,
  appeared.side_id,
  appeared.started,
  NULL,
  appeared.goals,
  appeared.assists,
  appeared.fouls,
  jsonb_build_object('yellow', appeared.yellow_cards, 'red', appeared.red_cards),
  -- ★ 이 한 줄이 원본과의 유일한 차이다.
  -- `position` 은 nullable 인데(`V1GameParticipant.position String?`) SQL 의 `IN` 은
  -- 왼쪽이 NULL 이면 false 가 아니라 **NULL** 을 돌려준다(3값 논리). 그 NULL 이 NOT NULL 인
  -- `v1_game_result_participants.goalkeeper` 로 들어가 alpha 배포가 23502 로 죽었다.
  -- 앱은 같은 판정을 `participant.position === goalkeeperPositionCode`
  -- (games.service.ts)로 하는데 JS 에서 `null === 'GK'` 는 false 다 —
  -- COALESCE 가 그 의미를 SQL 로 그대로 옮긴다.
  COALESCE(appeared.position IN ('GK', 'GOALKEEPER', 'GOLEIRO'), false),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM appeared
ON CONFLICT (result_revision_id, participant_id) DO NOTHING;

ALTER TABLE v1_game_result_participants
  ENABLE TRIGGER v1_guard_result_participant_mutation;
