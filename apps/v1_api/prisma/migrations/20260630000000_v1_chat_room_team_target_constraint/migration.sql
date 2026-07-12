ALTER TABLE "v1_chat_rooms"
  DROP CONSTRAINT IF EXISTS "v1_chat_rooms_exactly_one_target_check";

ALTER TABLE "v1_chat_rooms"
  ADD CONSTRAINT "v1_chat_rooms_exactly_one_target_check"
  CHECK (
    (
      ("match_id" IS NOT NULL)::int
      + ("team_id" IS NOT NULL)::int
      + ("team_match_id" IS NOT NULL)::int
    ) = 1
  );
