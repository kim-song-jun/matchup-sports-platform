-- 한 계정에는 같은 제공자의 활성 로그인 수단이 하나만 붙는다.
-- 해제된(unlinked) 신원은 기록으로 남으므로 같은 계정·제공자에 여러 개 있어도 된다 -- 활성 행만 막는다.
-- 이미 같은 계정에 같은 제공자 활성 행이 둘 이상이면 인덱스 생성이 중복 키와 함께 실패해 마이그레이션이 멈춘다.
-- 어느 로그인을 남길지는 사람이 정할 일이라 행을 자동으로 지우거나 해제하지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS "v1_auth_identities_user_provider_active_key"
  ON "v1_auth_identities" ("user_id", "provider")
  WHERE "status" = 'active';
