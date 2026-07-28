-- 비로그인 이메일 OTP 챌린지(비밀번호 재설정).
-- 가입 여부와 무관하게 행을 만들 수 있어야 응답이 갈리지 않으므로(계정 열거 방어)
-- user 참조 없이 이메일을 키로 둔다. 5분 TTL ephemeral 데이터.
-- CreateTable
CREATE TABLE "v1_email_verification_challenges" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_email_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v1_email_verification_challenges_email_key" ON "v1_email_verification_challenges"("email");
