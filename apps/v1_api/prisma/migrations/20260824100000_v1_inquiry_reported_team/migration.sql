-- 신고 대상 팀. 신고가 아닌 문의는 NULL 이다.
ALTER TABLE "v1_inquiries" ADD COLUMN     "reported_team_id" TEXT;

-- 팀이 사라져도 신고 기록은 남아야 한다 — Cascade 면 팀 삭제가 감사 이력에 구멍을 낸다.
ALTER TABLE "v1_inquiries" ADD CONSTRAINT "v1_inquiries_reported_team_id_fkey"
  FOREIGN KEY ("reported_team_id") REFERENCES "v1_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "v1_inquiries_reported_team_id_created_at_idx" ON "v1_inquiries"("reported_team_id", "created_at");
