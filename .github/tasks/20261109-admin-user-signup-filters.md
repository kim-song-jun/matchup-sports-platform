# Task 20261109: 회원 가입 상태·로그인 수단 집계와 복수 필터

Status: In Progress
Created: 2026-10-26

## Context
회원 목록은 활성·정지 등의 계정 상태만 집계하여 가입 중단 회원과 가입 경로를 분리해서 볼 수 없었다.

## Goal
기존 회원 관리 디자인에 가입 단계·연결 로그인 수단별 집계와 복수 필터를 추가한다.

## Original Conditions
- [x] A/B/C 제안 → 기존 화면에 필터를 추가하는 A안 사용자 선택 및 로컬 동작 시안 검토.
- [x] 기존 회원 목록 디자인 유지, 가입 상태·이메일·카카오·Apple별 인원과 복수 선택.
- [x] 약관·기본 프로필 완료와 추가 온보딩 완료 구분, 입력 보류는 가입 미완료에 포함.

## User Scenarios
- 가입 미완료와 카카오·Apple을 선택하면 가입 미완료이면서 둘 중 한 수단이 연결된 회원만 본다.
- 필수정보 완료와 온보딩 완료를 함께 선택해도 회원을 중복 집계하지 않는다.
- 검색·계정 상태와 조합하며, 상세에서 돌아와도 URL 필터와 페이지를 유지한다.

## Test Scenarios
- API: DTO 허용 목록·복수 값·잘못된 값, 기존 status 호환, 회원 단위 provider 조회, 페이지 전체 인원.
- 가입 분류: 자동 생성된 보류 프로필, 없는 프로필, 이전 이메일 가입 상태, 완료 상태의 부분집합.
- 웹: 칩 복수 선택·해제·전체, 검색 debounce, URL 복원·페이지 초기화·상세 복귀.
- 기존 단일 선택 필터 사용 화면 회귀 검사.

## Parallel Work Breakdown
단일 에이전트 순차 작업: API 계약 → 기존 UI 확장 → 테스트·타입 검사 → diff 리뷰 → 배포 환경 확인.
Owned: v1 admin user API/DTO/helper, web member list/filter bar/URL hook/types/labels, 관련 테스트 및 changeset.
Forbidden: 인증·가입 흐름·DB 스키마·운영 데이터 수정.

## Acceptance Criteria
- [x] 검색·다른 그룹을 적용하고 자기 그룹만 제외한 facet 인원 구현 (DB 실행 검증은 CI 대기).
- [x] 같은 그룹 OR / 다른 그룹 AND, 연결된 active identity 기준, 결과 중복 제거.
- [x] 기존 디자인·접근성·단일 상태 필터 호환.
- [x] 관련 테스트 및 타입 검사 통과, diff 범위 검증.
- [ ] alpha 수동 확인 결과와 한계 기록.

## Tech Debt Resolved
가입 상태를 회원 이름에만 의존하던 목록에 독립 컬럼을 추가한다.
공유 필터 바와 URL 훅에 선택적 복수 필터 기능을 추가해 동일 UI 복제를 피한다.

## Security Notes
기존 getActiveAdmin 권한 검사 유지. 읽기 전용 집계. 인증 비밀·개인정보를 테스트나 문서에 저장하지 않는다.

## Risks & Dependencies
Prisma User/Profile/AuthIdentity/TermsConsent 기존 테이블 조회만 추가하며 migration 불필요.
facet 집계는 회원 테이블 기준으로 수행하여 연결 identity가 여러 개여도 중복되지 않는다.
약관 개정 후 재동의는 가입 진행 집계와 별개의 계약이다. 이 변경은 가입 이력과 기본 프로필을 분류하며 현재 약관 준수 여부를 의미하지 않는다.

## Ambiguity Log
- 필수정보 완료에는 추가 온보딩 완료자가 포함됨(사용자 확인).
- 기존 계정 상태는 단일 선택 유지, 새 가입/로그인 수단 그룹은 복수 선택.
- not_started라도 기존 동의 기록이 있으면 프로필 단계로 분류. social_terms_required는 저장된 가입 게이트 우선.
- 별도 UI 카드로 재설계하지 않고 기존 AdminFilterBar를 재사용.

## Progress Snapshot
- 최신 origin/dev d312dda13b52 기반 feat/admin-member-signup-filters.
- API·웹 타입 검사 통과. API 84 tests / web 14 tests 통과. 실제 페이지→조회 훅→HTTP 직렬화→응답 렌더 검증 포함.
- v1 웹 패턴 및 API surface 검사 통과. Windows의 find/grep 충돌은 Git usr/bin PATH로 실행해 해결.
- DB 통합 테스트 2개 추가 및 독립 타입 검사 통과. 이 호스트에는 테스트 PostgreSQL/Docker가 없어 실행은 CI에서 확인.
- 실제 alpha 화면 QA는 배포 및 Teameet 브라우저 연결 후 확인. 관련 없는 Chrome 업무창은 접근하지 않음.
