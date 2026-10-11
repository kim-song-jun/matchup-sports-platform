-- Immutable tournament-application terms revisions: "대회" wording becomes "대회 / 리그 / 매치" (MD-QA #98, 2026-10-11 user decision).
-- Retains every previous document. requires_reconsent=false and all policies live only in the tournament_application context,
-- so the signup-context global re-consent gate (TERMS_RECONSENT_REQUIRED) is not triggered.

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "subtitle", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1160000-0000-4000-8000-000000000006', 'a1100000-0000-4000-8000-000000000006', 'v1.2', '대회 규정 및 안내사항 동의', '참가 자격, 경기 운영, 노쇼, 실격, 허위 신분 제출 금지에 대한 동의입니다.', '본인은 팀밋 대회 / 리그 / 매치 규정 및 안내사항을 확인하였으며 이에 동의합니다.

1. 참가 신청 및 참가 확정

대회 / 리그 / 매치 참가 신청은 신청 완료만으로 확정되지 않습니다.

운영진의 신청 내용 확인과 참가비 입금 확인이 완료되어야 최종 참가가 확정됩니다.

참가자는 팀명, 대표자명, 연락처, 참가자 명단, 생년월일, 성별, 포지션, 선출·비선출 여부 등 대회 / 리그 / 매치 운영에 필요한 정보를 정확히 입력해야 합니다.

2. 참가 자격

참가자는 대회 / 리그 / 매치별로 정해진 참가 자격을 충족해야 합니다.

참가자는 본인의 이름, 생년월일, 성별, 선출·비선출 여부, 포지션 등 참가 자격 확인에 필요한 정보를 사실대로 제출해야 합니다.

3. 선출·비선출 구분

본 대회 / 리그 / 매치는 공정한 경기 운영을 위해 선출·비선출 여부를 구분할 수 있습니다.

참가자는 본인의 선수 경력, 소속 이력, 참가 자격과 관련된 정보를 사실대로 제출해야 합니다.

4. 허위 신분 및 허위 이력 제출 금지

선출·비선출 구분을 피하거나 참가 자격을 충족하는 것처럼 보이기 위해 이름, 생년월일, 소속, 선수 경력, 선출 여부 등 신분 또는 이력을 허위로 제출하거나 숨기는 행위는 금지됩니다.

신분을 속이는 행위, 선출·비선출 여부 허위 기재, 선수 경력 은폐, 대리 참가, 명단 외 선수 출전이 확인되는 경우 해당 선수는 출전 제한될 수 있으며, 해당 팀은 몰수패, 실격 또는 팀 탈락 처리될 수 있습니다.

5. 대회 / 리그 / 매치 종료 후 조치

대회 / 리그 / 매치 종료 후라도 허위 신분, 허위 이력, 대리 참가, 참가 자격 위반이 확인되는 경우 수상 취소, 기록 삭제, 시상 회수, 향후 팀밋 대회 / 리그 / 매치 참가 제한 등의 조치가 이루어질 수 있습니다.

6. 팀원 변경

참가자 명단은 운영진이 정한 기한 내에 제출해야 하며, 명단 제출 이후 선수 변경은 운영진의 사전 승인 하에만 가능합니다.

운영진 승인 없이 명단에 없는 선수가 출전하는 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

7. 경기 운영

경기 방식, 경기 시간, 휴식 시간, 교체 방식, 조 편성, 토너먼트 방식, 순위 결정 기준은 대회 / 리그 / 매치별 안내에 따릅니다.

참가팀은 경기 시작 전 지정된 시간까지 현장에 도착하여 출석 확인 및 경기 준비를 완료해야 합니다.

경기 중 모든 참가자는 심판 및 운영진의 안내에 따라야 합니다.

8. 노쇼 및 지각

참가 확정 후 대회 / 리그 / 매치 당일 사전 통보 없이 불참하는 경우 노쇼로 간주합니다.

노쇼가 발생한 팀 또는 참가자는 실격 처리됩니다.

경기 시작 시간까지 운영진이 정한 최소 인원이 도착하지 않은 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

9. 금지행위

참가자는 대회 / 리그 / 매치 중 다음 행위를 해서는 안 됩니다.

- 폭언, 욕설, 비방, 조롱
- 심판, 운영진, 상대팀, 관중에 대한 위협적 언행
- 폭행 또는 물리적 충돌
- 고의적인 위험 플레이
- 경기 지연 행위
- 심판 판정에 대한 과도한 항의
- 음주 후 경기 참가
- 허위 정보 제출
- 대리 참가
- 명단에 없는 선수 출전
- 선출·비선출 여부를 속이는 행위
- 시설물 훼손
- 대회 / 리그 / 매치 운영 방해

위 행위가 확인되는 경우 운영진은 경고, 퇴장, 몰수패, 실격, 팀 탈락, 향후 대회 / 리그 / 매치 참가 제한 등의 조치를 할 수 있습니다.

10. 안전 및 부상

참가자는 본인의 건강 상태를 확인한 후 대회 / 리그 / 매치에 참가해야 합니다.

참가자는 경기 중 부상 위험이 있음을 인지하고, 무리한 플레이나 위험한 행동을 해서는 안 됩니다.

경기 중 발생한 부상, 개인 질환, 참가자 간 충돌, 장비 미착용 등으로 인한 사고에 대해 팀밋은 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.

본인은 위 대회 / 리그 / 매치 규정 및 안내사항을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
시행일: 2026년 7월 1일
최종 변경일: 2026년 10월 11일', '83b6173553e9e8dc7c14d2d2bf13f8e8e5725f5a163d74beafb6a3f02bc9cc7e', '약관 원문의 "대회" 표기를 "대회 / 리그 / 매치"로 바꿔 대회·리그·매치 신청에 공통으로 쓰도록 함 (조항 내용은 그대로)', false, 'published'::"V1TermsDocumentStatus", '2026-10-11T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, 'a1110000-0000-4000-8000-000000000006', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_rules_v12_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1160000-0000-4000-8000-000000000006' AND "policy_id" = 'a1100000-0000-4000-8000-000000000006' AND "version" = 'v1.2' AND "content_hash" = '83b6173553e9e8dc7c14d2d2bf13f8e8e5725f5a163d74beafb6a3f02bc9cc7e' AND md5("content") = '52edc08a9e2df4d484e0c9a56a6095f6' AND "status" = 'published' AND "supersedes_document_id" = 'a1110000-0000-4000-8000-000000000006') THEN RAISE EXCEPTION 'tournament_rules v1.2 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_rules_v12_guard$;

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "subtitle", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1160000-0000-4000-8000-000000000007', 'a1100000-0000-4000-8000-000000000007', 'v1.2', '대회 참가 개인정보 수집·이용 동의', '대회 참가자 확인 및 참가 자격 검토를 위한 동의입니다.', '아이위(IWI)(대표 김봉목)는 팀밋 대회 / 리그 / 매치 신청 및 운영을 위해 아래 개인정보를 수집·이용합니다.

1. 수집 항목

팀명, 대표자명, 대표자 연락처, 참가자 이름, 생년월일, 성별, 포지션, 선출·비선출 여부, 참가 신청 내역, 입금자명

2. 이용 목적

1. 대회 / 리그 / 매치 참가 신청 접수
2. 참가자 확인
3. 참가 자격 검토
4. 선출·비선출 구분
5. 참가비 입금 확인
6. 경기 운영
7. 실격 및 제재 관리
8. 대회 / 리그 / 매치 안내
9. 분쟁 대응
10. 부정 참가 및 대리 참가 확인

3. 보유 및 이용 기간

대회 / 리그 / 매치 종료 후 최대 3년까지 보관합니다.

단, 분쟁, 사고, 부정 참가, 환불, 정산 대응이 필요한 경우 해당 사유 종료 시까지 보관할 수 있습니다.

4. 동의 거부 안내

이용자는 개인정보 수집 및 이용에 동의하지 않을 권리가 있습니다.

다만 필수 개인정보 수집 및 이용에 동의하지 않을 경우 대회 / 리그 / 매치 신청 및 참가가 제한됩니다.

5. 개인정보 보호책임자

성명: 김봉목
직책: 대표
이메일: teameetsports@naver.com

본인은 위 개인정보 수집 및 이용 내용을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
시행일: 2026년 7월 1일
최종 변경일: 2026년 10월 11일', 'ed372627c12ce9ea389bb7f7766d0825dfcb4287ca3b93effed82b5033e3f653', '약관 원문의 "대회" 표기를 "대회 / 리그 / 매치"로 바꿔 대회·리그·매치 신청에 공통으로 쓰도록 함 (조항 내용은 그대로)', false, 'published'::"V1TermsDocumentStatus", '2026-10-11T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, 'a1110000-0000-4000-8000-000000000007', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_privacy_v12_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1160000-0000-4000-8000-000000000007' AND "policy_id" = 'a1100000-0000-4000-8000-000000000007' AND "version" = 'v1.2' AND "content_hash" = 'ed372627c12ce9ea389bb7f7766d0825dfcb4287ca3b93effed82b5033e3f653' AND md5("content") = 'd243e1f8ebcb22fbed178490dc3876e1' AND "status" = 'published' AND "supersedes_document_id" = 'a1110000-0000-4000-8000-000000000007') THEN RAISE EXCEPTION 'tournament_privacy v1.2 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_privacy_v12_guard$;

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "subtitle", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1160000-0000-4000-8000-000000000009', 'a1100000-0000-4000-8000-000000000009', 'v1.2', '사진·영상 촬영 및 홍보 활용 동의', '대회 기록, 홍보 콘텐츠, 협찬사 결과 보고에 활용될 수 있습니다.', '본인은 팀밋 대회 / 리그 / 매치 현장에서 사진, 영상, 음성 등이 촬영될 수 있음을 확인하며, 촬영된 자료가 아래 목적과 범위 내에서 활용되는 것에 동의합니다.

1. 촬영 항목

1. 대회 / 리그 / 매치 현장 사진
2. 경기 장면 사진 및 영상
3. 단체 사진
4. 참가자 인터뷰
5. 현장 스케치 영상
6. 음성 또는 발언 내용
7. 시상식, 이벤트, 부스 참여 장면

2. 활용 목적

촬영된 자료는 다음 목적으로 활용될 수 있습니다.

1. 팀밋 서비스 홍보
2. 대회 / 리그 / 매치 기록 및 결과 보고
3. 팀밋 홈페이지, 앱, SNS 콘텐츠 게시
4. 보도자료 및 홍보자료 제작
5. 제안서, 소개서, 협찬사 결과 보고 자료 활용
6. 향후 대회 / 리그 / 매치 및 이벤트 홍보
7. 현장 스케치, 릴스, 숏폼, 카드뉴스 등 콘텐츠 제작

3. 활용 매체

촬영 자료는 다음 매체에 게시 또는 활용될 수 있습니다.

1. 팀밋 공식 홈페이지
2. 팀밋 앱 또는 웹서비스
3. 팀밋 공식 SNS
4. 블로그, 커뮤니티, 뉴스레터
5. 제휴사 또는 협찬사 결과 보고 자료
6. 대회 / 리그 / 매치 소개서, 제안서, 홍보물
7. 온라인 광고 또는 오프라인 홍보물

4. 보유 및 이용 기간

촬영 자료는 활용 목적 달성 시까지 보유 및 이용될 수 있습니다.

단, 이용자가 삭제 또는 사용 중단을 요청하는 경우 회사는 합리적인 범위 내에서 검토 후 조치합니다.

이미 배포된 인쇄물, 제3자에게 전달된 결과 보고 자료, 단체 사진, 경기 전체 영상 등 회수 또는 개별 삭제가 어려운 자료는 삭제 또는 사용 중단이 제한될 수 있습니다.

5. 동의 거부 안내

사진·영상 촬영 및 홍보 활용 동의는 선택 사항입니다.

동의하지 않아도 대회 / 리그 / 매치 참가 자체에는 제한이 없습니다.

다만 단체 사진, 경기 장면, 현장 스케치 등 공개된 행사 공간에서 불가피하게 촬영될 수 있는 자료에 일부 노출될 수 있습니다.

촬영을 원하지 않는 참가자는 대회 / 리그 / 매치 또는 행사 시작 전 운영진에게 사전에 알려야 하며, 회사는 합리적인 범위 내에서 이를 반영하기 위해 노력합니다.

6. 유의사항

회사는 촬영 자료를 특정 개인을 비방하거나 명예를 훼손하는 방식으로 사용하지 않습니다.

회사는 촬영 자료를 팀밋 서비스, 대회 / 리그 / 매치 운영, 홍보, 기록, 결과 보고 목적 범위 내에서 사용합니다.

본인은 위 내용을 확인하였으며 사진·영상 촬영 및 홍보 활용에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 7월 1일
최종 변경일: 2026년 10월 11일', '901473e3e2dbb9aca98982c6af3e37d9e9754134236c2cfe3fbc599065272b9b', '약관 원문의 "대회" 표기를 "대회 / 리그 / 매치"로 바꿔 대회·리그·매치 신청에 공통으로 쓰도록 함 (조항 내용은 그대로)', false, 'published'::"V1TermsDocumentStatus", '2026-10-11T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, 'a1110000-0000-4000-8000-000000000009', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_media_v12_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1160000-0000-4000-8000-000000000009' AND "policy_id" = 'a1100000-0000-4000-8000-000000000009' AND "version" = 'v1.2' AND "content_hash" = '901473e3e2dbb9aca98982c6af3e37d9e9754134236c2cfe3fbc599065272b9b' AND md5("content") = 'b9aa933bbba19f1a62eebf1bc252a78e' AND "status" = 'published' AND "supersedes_document_id" = 'a1110000-0000-4000-8000-000000000009') THEN RAISE EXCEPTION 'tournament_media v1.2 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_media_v12_guard$;

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "subtitle", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1160000-0000-4000-8000-000000000008', 'a1100000-0000-4000-8000-000000000008', 'v1.3', '참가비 입금·취소·환불 정책 동의', '입금 기한, 신청 취소, 환불 기준에 대한 동의입니다.', '본인은 팀밋 대회 / 리그 / 매치 참가비 입금, 신청 취소 및 환불 정책을 확인하였으며 이에 동의합니다.

1. 참가비 입금

대회 / 리그 / 매치 신청 후 팀밋이 안내한 계좌로 참가비를 입금해야 합니다.

제1항부터 제3항까지의 입금 관련 조항은 참가비가 있는 대회 / 리그 / 매치에만 적용됩니다. 참가비가 없는(무료) 대회 / 리그 / 매치는 신청과 동시에 접수되며 입금 절차가 없습니다.

2. 입금 기한

참가비가 있는 대회 / 리그 / 매치에서 대회 / 리그 / 매치 신청 후 2시간 이내에 참가비 입금이 확인되지 않는 경우 해당 신청은 자동 취소됩니다.

3. 입금자명

입금자명은 신청자명 또는 팀명과 동일하게 입력해야 합니다.

입금자명 불일치로 인해 입금 확인이 지연되는 경우 신청 취소 또는 참가 제한이 발생할 수 있습니다.

4. 신청 취소

참가비 입금 후 신청자의 단순 변심, 일정 착오, 팀 내부 사정, 선수 구성 실패, 개인 사정 등을 이유로 한 신청 취소는 원칙적으로 불가합니다.

참가자는 신청 전 대회 / 리그 / 매치 일정, 장소, 참가비, 경기 방식, 참가 자격, 환불 기준을 충분히 확인해야 합니다.

5. 대회 / 리그 / 매치 취소 시 환불

팀밋 또는 주최 측 사정으로 대회 / 리그 / 매치가 취소되는 경우 참가비는 100% 환불됩니다.

기상 악화, 천재지변, 시설 문제, 안전 문제, 감염병, 행정명령 등 불가피한 사유로 대회 / 리그 / 매치가 취소되는 경우에도 참가비는 100% 환불됩니다.

대회 / 리그 / 매치 취소가 결정되는 경우 팀밋은 사전에 서비스 공지, 문자, 알림톡, 이메일, 대표자 연락 등 가능한 방법으로 안내합니다.

6. 대회 / 리그 / 매치 연기 시 환불

대회 / 리그 / 매치가 연기되는 경우 팀밋은 변경 일정, 장소, 운영 방식을 사전에 안내합니다.

대회 / 리그 / 매치가 연기되는 경우 참가자는 기존 대회 / 리그 / 매치 개최일 기준 2주 전까지 참가 취소 및 환불을 요청할 수 있습니다.

기존 대회 / 리그 / 매치 개최일 기준 2주 전이 지난 이후에는 연기된 일정에 참가하지 않더라도 환불이 제한될 수 있습니다.

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
최종 변경일: 2026년 10월 11일', '28c14403d1d100d29729e98df86d93d21800a2513faa765442e418e1c7abb6e7', '약관 원문의 "대회" 표기를 "대회 / 리그 / 매치"로 바꿔 대회·리그·매치 신청에 공통으로 쓰도록 함 (조항 내용은 그대로)', false, 'published'::"V1TermsDocumentStatus", '2026-10-11T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, 'a1150000-0000-4000-8000-000000000008', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_refund_v13_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1160000-0000-4000-8000-000000000008' AND "policy_id" = 'a1100000-0000-4000-8000-000000000008' AND "version" = 'v1.3' AND "content_hash" = '28c14403d1d100d29729e98df86d93d21800a2513faa765442e418e1c7abb6e7' AND md5("content") = 'a473c0629be23f79cc6f39c6adbdf66c' AND "status" = 'published' AND "supersedes_document_id" = 'a1150000-0000-4000-8000-000000000008') THEN RAISE EXCEPTION 'tournament_refund v1.3 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_refund_v13_guard$;

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "supersedes_document_id", "created_at", "updated_at")
VALUES ('a1160000-0000-4000-8000-000000000013', 'f772fb99-2671-4066-8874-54867ce0ecf4', 'v1.2', '대회 경기 기록 공개 동의', '본인은 팀밋 대회 / 리그 / 매치 경기 기록(라인업, 득점·어시스트 등 이벤트 기록, MVP 등)에 닉네임 대신 실명이 표시되는 것에 동의할 수 있습니다. 이 동의는 선택 사항이며, 동의하지 않아도 대회 / 리그 / 매치 신청 및 참가에는 어떠한 제한도 없습니다.

1. 공개 항목

이름, 등번호, 포지션, 소속 팀명, 경기별 기록(출전·득점·어시스트·경고·퇴장·MVP 등)

2. 공개 목적

대회 / 리그 / 매치 경기 기록 및 참가 명단을 팀밋 서비스 내에서 공개 게시하기 위한 목적으로 이용합니다.

3. 공개 위치

팀밋 서비스 내 대회 / 리그 / 매치 기록, 순위표, 선수 기록 화면

4. 공개 기간

동의 시점부터 본인이 철회하기 전까지 계속 공개됩니다.

철회 후에는 별도 요청 없이 즉시 닉네임 표시로 전환됩니다.

5. 동의 거부 및 철회 안내

본 동의는 선택 사항입니다.

동의하지 않아도 대회 / 리그 / 매치 신청 및 참가에는 제한이 없으며, 이 경우 경기 기록에는 닉네임이 표시됩니다.

이미 동의한 경우에도 마이페이지 > 설정 > 대회 기록 실명 표시에서 언제든지 철회할 수 있습니다.

6. 유의사항

회사는 공개된 경기 기록을 대회 / 리그 / 매치 운영, 기록 게시, 서비스 제공 목적 범위 내에서만 사용합니다.

본인은 위 내용을 확인하였으며 대회 / 리그 / 매치 경기 기록 공개(실명 표시)에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 8월 18일
최종 변경일: 2026년 10월 11일', 'f19be0df53a74d9cde4e36cf51268483e11fb913173d39130b23b3d44e559fa8', '약관 원문의 "대회" 표기를 "대회 / 리그 / 매치"로 바꿔 대회·리그·매치 신청에 공통으로 쓰도록 함 (조항 내용은 그대로)', false, 'published'::"V1TermsDocumentStatus", '2026-10-11T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, '86b39028-bd47-4a4e-9c09-6a4c71c34df6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("policy_id", "version") DO NOTHING;

DO $tournament_record_disclosure_v12_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "v1_managed_terms_documents" WHERE "id" = 'a1160000-0000-4000-8000-000000000013' AND "policy_id" = 'f772fb99-2671-4066-8874-54867ce0ecf4' AND "version" = 'v1.2' AND "content_hash" = 'f19be0df53a74d9cde4e36cf51268483e11fb913173d39130b23b3d44e559fa8' AND md5("content") = 'b86fc084d2c54f9e36ac905eb5f8b07f' AND "status" = 'published' AND "supersedes_document_id" = '86b39028-bd47-4a4e-9c09-6a4c71c34df6') THEN RAISE EXCEPTION 'tournament_record_disclosure v1.2 canonical document conflict' USING ERRCODE = '23514'; END IF;
END $tournament_record_disclosure_v12_guard$;
