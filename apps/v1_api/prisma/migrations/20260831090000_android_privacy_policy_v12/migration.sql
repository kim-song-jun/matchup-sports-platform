-- Additive Android privacy disclosure. The immutable v1.1 document is retained for audit history.
INSERT INTO "v1_managed_terms_documents" (
  "id",
  "policy_id",
  "version",
  "title",
  "subtitle",
  "content",
  "content_hash",
  "change_summary",
  "requires_reconsent",
  "status",
  "effective_at",
  "published_at",
  "supersedes_document_id",
  "created_at",
  "updated_at"
)
SELECT
  'a1130000-0000-4000-8000-000000000004',
  "policy_id",
  'v1.2',
  '개인정보처리방침',
  '회원가입 및 서비스 이용에 필요한 개인정보 수집·이용 동의예요.',
  regexp_replace("content", E'\n시행일: 2026년 7월 1일$', '') || $android_privacy$

11. Android 앱에서의 개인정보 처리

Android 앱은 teameet.co.kr 서비스를 WebView로 제공하며 로그인 세션을 위한 쿠키와 서비스 이용 기록을 처리합니다.

이용자가 앱에서 알림 수신에 명시적으로 동의하면 Firebase Cloud Messaging 알림 전송을 위해 앱 설치 식별자, FCM 토큰, 앱 버전, 기기 제조사·모델 정보를 처리합니다. 알림 동의를 철회하거나 로그아웃하면 해당 설치의 푸시 등록을 해제하고 토큰 삭제를 요청합니다. Firebase Cloud Messaging 제공 과정에서는 Google이 수탁자로서 관련 정보를 처리할 수 있습니다.

이용자가 현재 위치 기능을 직접 실행한 경우에만 Android의 대략적 위치 권한을 요청합니다. 제공된 좌표는 가까운 지역을 확인하기 위해 회사 서버로 전송되고, 현재 날씨 제공을 위해 Open-Meteo에 전송될 수 있습니다. 위치 권한을 거부해도 위치 기반 편의 기능을 제외한 서비스는 이용할 수 있습니다.

사진·파일은 이용자가 파일 선택기를 직접 실행하고 제출한 경우에만 업로드됩니다. 앱은 기기 저장소 전체를 조회하는 권한을 요청하지 않습니다.

계정 삭제는 앱의 설정 > 회원 탈퇴에서 직접 진행하거나 https://teameet.co.kr/account-deletion 에서 요청할 수 있습니다. 법령상 보관 의무가 있는 정보를 제외한 계정 연결 정보는 처리 목적이 끝난 뒤 파기합니다.

시행일: 2026년 7월 1일
최종 변경일: 2026년 8월 31일$android_privacy$,
  '8b157cae4348c80f0a185a555b29666c16a5122e516b0f8f17dcc0e55457f8a9',
  'Android 앱의 WebView, FCM, 대략적 위치, 파일 선택 및 계정 삭제 처리 기준 추가',
  false,
  'published'::"V1TermsDocumentStatus",
  '2026-08-31T00:00:00.000Z'::timestamptz,
  CURRENT_TIMESTAMP,
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "v1_managed_terms_documents"
WHERE "id" = 'a1110000-0000-4000-8000-000000000004'
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $privacy_v12_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "v1_managed_terms_documents" AS candidate
    INNER JOIN "v1_managed_terms_documents" AS baseline
      ON baseline."id" = 'a1110000-0000-4000-8000-000000000004'
    WHERE candidate."id" = 'a1130000-0000-4000-8000-000000000004'
      AND candidate."policy_id" = baseline."policy_id"
      AND candidate."version" = 'v1.2'
      AND candidate."content_hash" = '8b157cae4348c80f0a185a555b29666c16a5122e516b0f8f17dcc0e55457f8a9'
      AND md5(candidate."content") = 'd31b4d3136f443697c08b4f987a69f2d'
      AND candidate."requires_reconsent" = false
      AND candidate."status" = 'published'::"V1TermsDocumentStatus"
      AND candidate."effective_at" = '2026-08-31T00:00:00.000Z'::timestamptz
      AND candidate."supersedes_document_id" = baseline."id"
  ) THEN
    RAISE EXCEPTION 'canonical Android privacy policy v1.2 was not materialized'
      USING ERRCODE = '23514';
  END IF;
END
$privacy_v12_guard$;
