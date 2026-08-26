-- 기존 신고의 대상 팀을 한 번 계산해 채운다. 대상은 "컨택의 두 팀 중 신고자가 속하지 않은 쪽"이다.
-- active 멤버십만 인정한다 — 이미 떠난(left/removed) 소속으로 대상을 정하면 엉뚱한 팀에 신고가 쌓인다.
-- 판정이 안 되는 행(양쪽 다 아니거나 양쪽 다 운영진)은 NULL 로 남긴다: 억지로 한쪽을 고르면
-- 잘못된 팀에 누적된다.
UPDATE "v1_inquiries" i
SET "reported_team_id" = sub.reported_team_id
FROM (
  SELECT i2."id" AS id,
         CASE
           WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m
                        WHERE m."team_id" = c."from_team_id" AND m."user_id" = i2."user_id" AND m."status" = 'active')
             THEN c."to_team_id"
           WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m
                        WHERE m."team_id" = c."to_team_id" AND m."user_id" = i2."user_id" AND m."status" = 'active')
             THEN c."from_team_id"
           ELSE NULL
         END AS reported_team_id
  FROM "v1_inquiries" i2
  JOIN "v1_team_contacts" c ON c."id" = i2."related_id"
  WHERE i2."related_type" = 'team_contact'
    AND i2."category" = 'report'
    AND i2."user_id" IS NOT NULL
) sub
WHERE i."id" = sub.id AND sub.reported_team_id IS NOT NULL;
