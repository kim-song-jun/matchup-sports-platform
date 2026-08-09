-- 경기조건(경기방식/경기 스타일/유니폼 색상) 구조화: format_note 자유텍스트 이어붙이기를
-- 대체하는 3개 nullable 컬럼. grade는 이미 min/max_sport_level_id로 참값이 존재해 대상 아님.

ALTER TABLE "v1_team_matches"
  ADD COLUMN "match_format" TEXT,
  ADD COLUMN "match_style" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "uniform_color" TEXT;
