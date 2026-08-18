-- 대회 경기 기록 공개(실명 표시) 선택 동의 신설 (2026-08-18 사용자 결정).
--
-- 배경: 이전 커밋에서 "tournamentRealNameVisible" 토글을 추가했지만, 실명 공개에 대한
-- 이용자 동의 근거가 없었다 -- 기존 "tournament_privacy"(v1.1, policy_id
-- a1100000-0000-4000-8000-000000000007) 의 이용 목적 10개 중 경기 기록 공개는 없다.
--
-- 왜 tournament_privacy 를 v1.2 로 올리지 않았는가: 이 항목은 선택 동의여야 한다
-- (동의하지 않아도 대회 참가 제한 없음). 그런데 V1ManagedTermsPlacement 는
-- @@unique([policyId, context]) 라서 정책 하나는 같은 context(tournament_application)에
-- requirement 하나(현재 tournament_privacy 는 required)만 가질 수 있다 -- 필수 10개 목적과
-- 선택 1개 목적을 같은 문서에 넣으면 그 선택 항목도 사실상 강제 동의가 된다(문서 단위로만
-- accepted/required 를 추적하기 때문). 그래서 이미 존재하는 "tournament_media"(선택,
-- policy_id a1100000-0000-4000-8000-000000000009, 같은 context 에서 requirement=optional)
-- 와 동일한 패턴으로, 완전히 별도의 정책(policy)+문서(document)+선택 placement 를 신설한다.
-- tournament_privacy 자체는 이 마이그레이션에서 전혀 건드리지 않는다 -- v1.1 그대로 유지.
--
-- 소급 금지: 이 마이그레이션은 새 policy/document/placement row 만 INSERT 한다. 기존
-- V1ManagedTermsConsentEvent, V1UserProfile.tournamentRealNameVisible 값은 전혀 건드리지
-- 않는다. 이 정책에 동의한 적 없는 기존 사용자는 계속 미동의 상태이고, 토글도 그대로 false다.
--
-- 강제 재동의 트리거 여부: 트리거되지 않는다. tournament_privacy 문서 버전이 바뀌지 않으므로
-- ManagedTermsRuntimeService.currentTournamentTerms() 가 돌려주는 필수(required) 항목
-- 목록에는 변화가 없다 -- 새로 추가되는 placement 는 requirement=optional 이라
-- assertTournamentAcceptances() 의 missingRequiredDocumentIds 계산에 들어가지 않는다.
-- 즉 이미 제출된 신청(registration)은 물론, 앞으로 제출될 신청도 이 항목 없이 그대로
-- 통과한다 -- 참가자가 명시적으로 이 선택 항목에 체크해야만 acceptedCodes 에 코드가
-- 잡히고, 그때만 V1UserProfile.tournamentRealNameVisible 이 true 로 바뀐다(코드 변경은
-- apps/v1_api/src/tournaments/tournament-registrations.service.ts submit() 참고).
INSERT INTO "v1_managed_terms_policies" ("id", "code", "name", "is_active", "created_at", "updated_at")
VALUES ('f772fb99-2671-4066-8874-54867ce0ecf4', 'tournament_record_disclosure', '대회 경기 기록 공개 동의', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "created_at", "updated_at")
VALUES (
  '86b39028-bd47-4a4e-9c09-6a4c71c34df6',
  'f772fb99-2671-4066-8874-54867ce0ecf4',
  'v1.1',
  '대회 경기 기록 공개 동의',
  $terms$본인은 팀밋 대회 경기 기록(라인업, 득점·어시스트 등 이벤트 기록, MVP 등)에 닉네임 대신 실명이 표시되는 것에 동의할 수 있습니다. 이 동의는 선택 사항이며, 동의하지 않아도 대회 신청 및 참가에는 어떠한 제한도 없습니다.

1. 공개 항목

이름, 등번호, 포지션, 소속 팀명, 경기별 기록(출전·득점·어시스트·경고·퇴장·MVP 등)

2. 공개 목적

대회 경기 기록 및 참가 명단을 팀밋 서비스 내에서 공개 게시하기 위한 목적으로 이용합니다.

3. 공개 위치

팀밋 서비스 내 대회 기록, 순위표, 선수 기록 화면

4. 공개 기간

동의 시점부터 본인이 철회하기 전까지 계속 공개됩니다.

철회 후에는 별도 요청 없이 즉시 닉네임 표시로 전환됩니다.

5. 동의 거부 및 철회 안내

본 동의는 선택 사항입니다.

동의하지 않아도 대회 신청 및 참가에는 제한이 없으며, 이 경우 경기 기록에는 닉네임이 표시됩니다.

이미 동의한 경우에도 마이페이지 > 설정 > 대회 기록 실명 표시에서 언제든지 철회할 수 있습니다.

6. 유의사항

회사는 공개된 경기 기록을 대회 운영, 기록 게시, 서비스 제공 목적 범위 내에서만 사용합니다.

본인은 위 내용을 확인하였으며 대회 경기 기록 공개(실명 표시)에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 8월 18일$terms$,
  'b0527fa26264263b1ed78388472df50499c9e2cb0730ff0a3d28e090f278e65a',
  '대회 경기 기록(라인업/득점/MVP 등)에 실명 표시를 선택적으로 동의받기 위한 신규 정책 최초 발행',
  true,
  'published'::"V1TermsDocumentStatus",
  '2026-08-18T00:00:00.000Z'::timestamptz,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "v1_managed_terms_placements" ("id", "policy_id", "context", "requirement", "display_order", "is_active", "created_at", "updated_at")
VALUES (
  '7ef702a4-6289-4913-a31a-319de15bebd8',
  'f772fb99-2671-4066-8874-54867ce0ecf4',
  'tournament_application'::"V1ManagedTermsContext",
  'optional'::"V1ManagedTermsRequirement",
  4,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
