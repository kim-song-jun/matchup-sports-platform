-- Immutable tournament refund policy revision. Retain all previously accepted documents.
INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "subtitle", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1150000-0000-4000-8000-000000000008', 'a1100000-0000-4000-8000-000000000008', 'v1.2', '참가비 입금·취소·환불 정책 동의', '입금 기한, 신청 취소, 환불 기준에 대한 동의입니다.', '본인은 팀밋 대회 참가비 입금, 신청 취소 및 환불 정책을 확인하였으며 이에 동의합니다.

1. 참가비 입금

대회 신청 후 팀밋이 안내한 계좌로 참가비를 입금해야 합니다.

제1항부터 제3항까지의 입금 관련 조항은 참가비가 있는 대회에만 적용됩니다. 참가비가 없는(무료) 대회는 신청과 동시에 접수되며 입금 절차가 없습니다.

2. 입금 기한

참가비가 있는 대회에서 대회 신청 후 2시간 이내에 참가비 입금이 확인되지 않는 경우 해당 신청은 자동 취소됩니다.

3. 입금자명

입금자명은 신청자명 또는 팀명과 동일하게 입력해야 합니다.

입금자명 불일치로 인해 입금 확인이 지연되는 경우 신청 취소 또는 참가 제한이 발생할 수 있습니다.

4. 신청 취소

참가비 입금 후 신청자의 단순 변심, 일정 착오, 팀 내부 사정, 선수 구성 실패, 개인 사정 등을 이유로 한 신청 취소는 원칙적으로 불가합니다.

참가자는 신청 전 대회 일정, 장소, 참가비, 경기 방식, 참가 자격, 환불 기준을 충분히 확인해야 합니다.

5. 대회 취소 시 환불

팀밋 또는 주최 측 사정으로 대회가 취소되는 경우 참가비는 100% 환불됩니다.

기상 악화, 천재지변, 시설 문제, 안전 문제, 감염병, 행정명령 등 불가피한 사유로 대회가 취소되는 경우에도 참가비는 100% 환불됩니다.

대회 취소가 결정되는 경우 팀밋은 사전에 서비스 공지, 문자, 알림톡, 이메일, 대표자 연락 등 가능한 방법으로 안내합니다.

6. 대회 연기 시 환불

대회가 연기되는 경우 팀밋은 변경 일정, 장소, 운영 방식을 사전에 안내합니다.

대회가 연기되는 경우 참가자는 기존 대회일 기준 2주 전까지 참가 취소 및 환불을 요청할 수 있습니다.

기존 대회일 기준 2주 전이 지난 이후에는 연기된 일정에 참가하지 않더라도 환불이 제한될 수 있습니다.

7. 환불 제한

노쇼, 허위 신분 제출, 선출·비선출 여부 허위 기재, 대리 참가, 명단 외 선수 출전, 운영 방해 등 참가자 또는 참가팀 귀책 사유로 실격 처리되는 경우 참가비는 환불되지 않습니다.

8. 환불 처리 기간

환불은 환불 대상 확정 및 환불 계좌 확인 후 영업일 기준 3~7일 이내 처리됩니다.

단, 금융기관, 공휴일, 내부 확인 절차에 따라 지연될 수 있습니다.

본인은 위 참가비 입금·취소·환불 정책을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 7월 1일
최종 변경일: 2026년 10월 1일', '727e9d373c6e1036f7f256c9bf51e8372b1c032475092681bbe2fba65d93d874', '참가비가 없는(무료) 대회에는 입금·미입금 자동 취소 조항이 적용되지 않음을 명시', false, 'published'::"V1TermsDocumentStatus", '2026-10-01T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, 'a1110000-0000-4000-8000-000000000008', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_refund_v12_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1150000-0000-4000-8000-000000000008' AND "policy_id" = 'a1100000-0000-4000-8000-000000000008' AND "version" = 'v1.2' AND "content_hash" = '727e9d373c6e1036f7f256c9bf51e8372b1c032475092681bbe2fba65d93d874' AND md5("content") = '832d4a3782077289243a817cd319b05b' AND "status" = 'published' AND "supersedes_document_id" = 'a1110000-0000-4000-8000-000000000008') THEN RAISE EXCEPTION 'Tournament refund v1.2 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_refund_v12_guard$;
