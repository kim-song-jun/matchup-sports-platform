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

-- singleton 행은 여기서 INSERT 하지 않는다. expand-contract 가드
-- (scripts/qa/check-expand-contract-migrations.mjs)는 마이그레이션에 추가형 DDL 만
-- 허용하고 DML 은 거부한다 — 롤백 시 이전 버전 코드가 그 행을 어떻게 다룰지 보장할 수
-- 없기 때문이다. 대신 GameOperationFlagsService.readGateSetting() 이 매 조회마다
-- `INSERT ... ON CONFLICT (id) DO NOTHING` 으로 행을 보장한다(기존 ensureDefaults() 가
-- 플래그 기본행을 다루는 방식과 같다). 따라서 여기 INSERT 는 중복이었고, 없어도
-- 첫 조회 시점에 기본값 false 로 행이 생긴다.
