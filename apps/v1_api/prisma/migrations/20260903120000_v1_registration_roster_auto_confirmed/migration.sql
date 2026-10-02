-- D10 (Task 164 BE-4b): 시즌 시작 시각 자동 명단 확정의 표식.
--
-- **순수 additive** 다: nullable 컬럼 하나. 기존 행은 NULL(=수동 확정)이 되고, 이 컬럼을
-- 읽지 않는 구 코드는 영향이 없다. 백필 없음 — 이 기능 이전에 만들어진 등록은 전부
-- 사람이 만든 것이므로 NULL 이 곧 사실이다.
ALTER TABLE "v1_tournament_registrations"
  ADD COLUMN "roster_auto_confirmed_at" TIMESTAMP(3);
