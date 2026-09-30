-- One platform voice per match/target, independent of the operating admin.
CREATE UNIQUE INDEX "v1_platform_review_user_key"
ON "v1_post_event_reviews" ("source_id", "target_user_id")
WHERE "source_type" = 'platform_team_match';
CREATE UNIQUE INDEX "v1_platform_review_team_key"
ON "v1_post_event_reviews" ("source_id", "target_team_id")
WHERE "source_type" = 'platform_team_match';
