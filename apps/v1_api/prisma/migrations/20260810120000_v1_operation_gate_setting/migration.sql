-- 간소 운영 플래그 게이트(V1_ALLOW_SIMPLIFIED_OPERATION_FLAG_GATE 환경변수) 스위치를 DB 설정으로 옮긴다.
-- 오너 결정: "환경변수로 하지 말고 DB 값으로 admin에서 설정값으로 넣자" -- 프로덕션 포함 모든 환경에서
-- 관리자가 켤 수 있어야 하므로 배포 시점 고정값(env var)이 아니라 런타임에 토글 가능한 테이블이 필요하다.
-- singleton 행(id='singleton') 하나만 두고 simplified_gate_enabled 로 on/off, version 으로 CAS 한다.
-- 기본값은 false -- 갓 프로비저닝된 환경(프로덕션 포함)이 실수로 간소 경로를 열어두면 안 된다.
CREATE TABLE "v1_game_operation_gate_settings" (
  "id" TEXT NOT NULL DEFAULT 'singleton', "simplified_gate_enabled" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 0,
  "updated_by_user_id" TEXT, "updated_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_game_operation_gate_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "v1_game_operation_gate_settings" ("id", "simplified_gate_enabled", "version", "updated_at", "created_at")
VALUES ('singleton', false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
