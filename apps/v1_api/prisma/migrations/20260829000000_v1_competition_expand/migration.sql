-- 대회·리그 통합 R1 — expand.
--
-- 이 파일은 **추가만 한다.** 컬럼·테이블 rename 도, 기존 컬럼의 NOT NULL 승격도,
-- 데이터 이동도 없다. 되돌리기가 "새로 만든 것 드롭" 하나로 끝나야 하기 때문이다.
-- 백필(R3)·읽기 전환(R4)·구 모델 제거(R5)는 각각 별도 릴리스다.
--
-- 이 릴리스 시점에 이 컬럼들을 읽거나 쓰는 애플리케이션 코드는 없다.
-- 롤링 배포 중 구·신 인스턴스가 겹쳐도 양쪽 모두 이 스키마를 모른 채 정상 동작한다.

-- ── 1. 새 enum ────────────────────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "V1CompetitionKind" AS ENUM ('regular_tournament', 'regular_league');

-- CreateEnum
CREATE TYPE "V1CompetitionEntrySource" AS ENUM ('applied', 'promoted', 'seeded');

-- ── 2. 게임 소스 타입 — 값 추가만, 개명 아님 ──────────────────────────────────
-- sourceType 이 바뀌는 순간 그 경기에 걸린 운영 규칙이 통째로 달라진다(예:
-- requireTakeover 는 TEAM_MATCH 를 곧바로 통과시키지만 대회 소스에는 takeover 토큰을
-- 요구한다). 그래서 구 값 TEAM_MATCH·TOURNAMENT_FIXTURE 는 그대로 두고 값만 늘린다 —
-- 실제 승격은 R3 에서 종료된 경기부터, LIVE 0건 가드를 두고 한다.
--
-- Postgres 제약: 여기서 추가한 값은 **같은 트랜잭션 안에서 사용할 수 없다.**
-- R3 백필 UPDATE 는 반드시 별도 마이그레이션 파일이어야 한다.
-- AlterEnum
ALTER TYPE "V1GameSourceType" ADD VALUE IF NOT EXISTS 'COMPETITION_FIXTURE';
ALTER TYPE "V1GameSourceType" ADD VALUE IF NOT EXISTS 'FRIENDLY_MATCH';

-- ── 3. v1_tournaments — 통합 축 (테이블명은 그대로 둔다) ──────────────────────
-- kind 는 nullable + DEFAULT 다. Postgres 11+ 는 비휘발성 DEFAULT 를 테이블 재작성 없이
-- 기존 행에 채우므로 현존 대회는 전부 regular_tournament 가 된다 — 사실과 일치한다.
-- NOT NULL 승격은 읽기 전환이 안정된 뒤 R5 로 미룬다.
-- series_id / tier / season_no 는 정규 리그 시즌에만 채워지며 항상 셋이 함께다.
-- AlterTable
ALTER TABLE "v1_tournaments" ADD COLUMN     "kind" "V1CompetitionKind" DEFAULT 'regular_tournament',
ADD COLUMN     "season_no" INTEGER,
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "tier" INTEGER;

-- ── 4. v1_tournament_registrations — 참가 경로와 조정 사유 (D7·D9) ────────────
-- entry_source 기존 행은 전부 'applied' 가 된다: 이 테이블에 행을 만드는 경로는
-- 신청 서비스(tournament-registrations.service.ts)와 목업 시더 둘뿐이고 양쪽 다 신청이다.
-- adjustment_note 는 nullable 이다 — 사유 필수는 운영자 조정 액션에만 걸리는 규칙이라
-- 서비스 계층에서 강제한다. 컬럼 제약으로 걸면 사유가 필요 없는 등록까지 막힌다.
-- AlterTable
ALTER TABLE "v1_tournament_registrations" ADD COLUMN     "adjustment_note" TEXT,
ADD COLUMN     "entry_source" "V1CompetitionEntrySource" DEFAULT 'applied';

-- ── 5. 전술보드 — "누가 뛰는가"에서 "어떻게 배치하는가"를 떼어낼 자리 ─────────
-- 지금은 선발/후보·포지션·좌표가 v1_game_participants 의 컬럼이라 라인업 저장이
-- 참가자 목록을 바꾼다. Phase 1 에서 그 세 값의 책임이 이 테이블로 넘어온다.
-- 여기서는 테이블만 만들고 아무도 읽지 않는다.
-- (game_id, side_id) 축을 쓰는 이유는 대체 대상인 v1_game_lineups 가 같은 축이고,
-- 대회 픽스처·친선 팀매치·리그 대진이 그 아래에서 같은 v1_games 를 공유하기 때문이다.
-- CreateTable
CREATE TABLE "v1_team_tactics_boards" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "side_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "formation" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_team_tactics_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_team_tactics_board_entries" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT NOT NULL,
    "jersey_number" INTEGER,
    "position" TEXT,
    "position_x" DOUBLE PRECISION,
    "position_y" DOUBLE PRECISION,
    "started" BOOLEAN NOT NULL DEFAULT true,
    "goalkeeper" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_team_tactics_board_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v1_team_tactics_boards_side_id_key" ON "v1_team_tactics_boards"("side_id");

-- CreateIndex
CREATE INDEX "v1_team_tactics_boards_game_id_idx" ON "v1_team_tactics_boards"("game_id");

-- CreateIndex
CREATE INDEX "v1_team_tactics_boards_team_id_updated_at_idx" ON "v1_team_tactics_boards"("team_id", "updated_at");

-- CreateIndex
CREATE INDEX "v1_team_tactics_board_entries_board_id_sort_idx" ON "v1_team_tactics_board_entries"("board_id", "sort_order");

-- ── 6. 시즌 유일성 ───────────────────────────────────────────────────────────
-- v1_leagues 의 v1_leagues_series_season_tier_key 와 같은 불변식. 세 컬럼 모두 위에서
-- 방금 추가된 nullable 컬럼이라 기존 대회 행은 전부 NULL 이고, Postgres 는 NULL 끼리를
-- 충돌로 보지 않으므로 현존 행끼리는 이 제약에 걸리지 않는다.
-- CreateIndex
CREATE UNIQUE INDEX "v1_tournaments_series_season_tier_key" ON "v1_tournaments"("series_id", "season_no", "tier");

-- ── 7. 외래키 ────────────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "v1_team_tactics_boards" ADD CONSTRAINT "v1_team_tactics_boards_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_tactics_boards" ADD CONSTRAINT "v1_team_tactics_boards_side_fk" FOREIGN KEY ("side_id") REFERENCES "v1_game_sides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_tactics_boards" ADD CONSTRAINT "v1_team_tactics_boards_team_fk" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_tactics_board_entries" ADD CONSTRAINT "v1_team_tactics_board_entries_board_fk" FOREIGN KEY ("board_id") REFERENCES "v1_team_tactics_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- v1_tournaments.series_id 는 이 마이그레이션에서 추가된 nullable 컬럼이라 기존 행은
-- 전부 NULL 이고, MATCH SIMPLE 규칙상 NULL 은 FK 검사를 통과한다 — 현존 대회를 막지 않는다.
-- AddForeignKey
ALTER TABLE "v1_tournaments" ADD CONSTRAINT "v1_tournaments_series_fk" FOREIGN KEY ("series_id") REFERENCES "v1_league_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
