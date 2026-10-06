# Task 20261025: 정규 리그 공개 여부 설정

Status: In Progress
**Owner**: Codex root; implementation GPT-6-luna; independent review GPT-6-sol
**Created**: 2026-10-07

## Context
운영의 `[수원] 수요일 여성부 리그전`이 무료 표기·대진 수정 완료 전에 공개되어 있다. 사용자 요청은 데이터와 운영을 보존한 비공개다. AWS/SSM 읽기 전용 조사에서 대상은 regular_league, in_progress, 참가팀 4개, 대진 24개다. 기존 공개 설정은 없으며 deletedAt은 관리자 운영까지 막는다.

## Goal
관리자가 공개 여부를 바꾸면 메인·공개 목록·검색·직접 공개 상세와 그 리그의 공개 경기 정보를 일관되게 숨기고 관리자 운영은 유지한다.

## Original Conditions
- [x] 사용자 A안 선택: 메인·목록·상세까지 비공개 기능 추가.
- [x] 삭제·취소·진행 상태 변경 없이 공개 여부만 변경(API 변경 키·unit 검증).
- [x] alpha migration 후 기존 대회/리그 59개는 공개 상태 유지. production은 배포 후 확인.
- [ ] 운영 서비스 대상은 id 22cad756-211f-4438-9066-208efabd3a2e.
- [ ] 운영 반영은 dev → main 승격과 production 승인·배포 뒤 진행. 2026-10-07 사용자가 승격 PR 생성을 명시적으로 요청했다.

## User Scenarios
관리자가 정규 리그 상세의 공개 설정에서 비공개를 저장한다. 일반 사용자는 목록·검색·직접 공개 상세에서 볼 수 없으며, 관리자는 같은 리그와 대진을 계속 운영한다. 다시 공개하면 기존 정보가 표시된다.

## Test Scenarios
- [ ] 비공개 리그의 공개 목록·상세·파생 공개 경기 차단; 공개 리그 유지.
- [ ] 일반 계정의 공개 설정 변경 거부; 관리자 저장 및 감사 기록.
- [ ] 공개/비공개 전환 시 기존 진행 상태·참가팀·대진 보존.
- [x] 프론트 payload/오류 처리와 mock 계약 일치(unit 검증; 실제 웹 저장은 별도).
- [x] 변경 범위의 좁은 테스트·typecheck, 독립 리뷰.
- [ ] alpha 실제 화면 및 사용자 동선 검증. 배포 접근 제한 시 정확한 미검증 범위 기록.

## Parallel Work Breakdown
- Wave 0: backend implementer 단독 schema+additive migration, isPublic Boolean default true; 이 계약 확정 전 다른 구현 금지.
- Wave 1 backend: apps/v1_api 공개 조회·권한·관리자 endpoint·감사·테스트. frontend: apps/v1_web types/hooks/MSW 및 관리자 정규 리그 공개 설정 UI. root: task/API docs·회귀 경계 검토·검증 오케스트레이션.
- Wave 2: GPT-6-sol 독립 검토; 필요한 수정; 직렬 최소 검증.
- Forbidden: .env 조회, main 직접 push, 운영 schema/데이터를 배포 전 임의 변경, 취소/삭제/rollback, 다른 세션 WIP, self-commit.

## Acceptance Criteria
- [x] public filtering을 클라이언트에만 의존하지 않음.
- [ ] 비공개 리그의 관리자 운영·데이터 보존.
- [x] DB migration·API docs·frontend 계약·fixtures sync.
- [x] 실제 검증 결과와 미검증/운영 반영 상태를 구분해서 보고.

## Tech Debt Resolved
- 공개 여부를 진행 상태와 삭제 여부로 우회하는 경로를 만들지 않는다.

## Security Notes
비공개 여부는 서버 조회 경계에서 적용한다. 관리자 변경은 기존 active admin/guard와 audit를 따른다. 공개 경기·영상·검색 등 parent league에서 파생되는 경로를 점검한다. 관리자 전용 조회는 공개 필터를 공유하지 않는다.

## Risks & Dependencies
스키마 변경은 migration 동반. production은 main 승격과 기존 승인 게이트가 필요하다. 비공개 콘텐츠의 우회 조회 누락과 관리자 공개 조회 재사용에 의한 운영 차단을 독립 검토한다.

## Ambiguity Log
- 2026-10-07 A안 선택 완료. 공개 범위: 메인·목록·검색·상세. 관리자 운영 보존. 새 디자인 대안/요금/정원/대진 수정은 범위 밖.
- 공개 설정 구현 계약: V1Tournament.isPublic(Boolean, DB is_public), default true; 정규 리그 관리에서 제어. DTO whitelist에 맞춘 별도 관리자 visibility endpoint를 우선 사용.
- 2026-10-07 사용자 추가 요청: dev → main 승격 PR 생성. 릴리스 전체 dev 변경을 승격하며 API/Web fixed version 1.3.0으로 Changeset 32개를 소비한다. 기존 웹 로그인 요청에는 아직 답이 없어 실제 관리자 UI 저장 검증은 남아 있다.

## Progress Snapshot
- 조사 완료: 운영 스키마에도 별도 비공개 필드 없음. 운영 쓰기 0건.
- Wave 0 completed: isPublic schema와 additive migration 추가, Prisma Client generate 성공(DB 쓰기 없음).
- Wave 1 implemented: backend/frontend GPT-6-luna 구현; feature 52개 경로만 pathspec commit 33c5ddafd으로 고정했다.
- Wave 2 in_progress. upstream 66 commits를 merge a6b5748c7으로 통합했다. global-contract 문서 충돌은 두 계약 모두 보존해 해결했고 feature diff는 origin/dev 기준 52개 경로다.
- 최초 backend 검증: 9 suites, 266 passed/5 failed. 새 공개 조건으로 바뀐 조회 모양에 대한 기존 날짜/친선경기 테스트 기대값 5개를 보완 중이다. Frontend 7 files/145 tests passed; 기존 fixture provider act 경고의 원인을 별도 확인 중이다.
- backend tsc 통과; surface gate는 새 row-lock/조회 및 공개 집계 SQL의 등록되지 않은 참조 3건을 검출했다. 회피하지 않고 불필요한 조회 제거와 필수 SQL의 근거 등록으로 수정 중이다.
- GPT-6-sol 독립 리뷰에서 support 관리자 mutation 허용과 일부 공개 SSR/LLM/landing/sitemap의 300초 캐시 잔존을 확인했다. 실제 write gate와 no-store 경계를 보완한다.
- 착수 시 Docker daemon은 꺼져 있었으나 검증 시 다른 프로젝트 컨테이너가 실행 중인 것으로 관찰됐다. 다른 프로젝트 DB/프로세스는 사용하거나 종료하지 않는다. DB integration은 아직 미실행이다.
- ego-browser task space 814는 카카오 로그인 단계에서 사용자에게 제어를 넘겼다. 실제 alpha 관리자 QA는 웹 로그인과 코드 배포가 필요하며, 현재 AWS 인증만 완료됐다. 운영 쓰기 0건.
- load/swap은 기록 후 사용자 진행 지침에 따라 직렬 최소 worker로 작업한다. 테스트 launcher PID 96268/97576, lint PID 98711은 실행 종료를 확인했다.
- 문서 patch의 오래된 앵커가 일치하지 않아 최초 적용이 실패했으며, 정본 앵커로 다시 적용해 복구했다. 실패를 성공으로 보고하지 않는다.
- Wave 2 code review PASS: support는 실제 getMutationAdmin에서 transaction 전에 403; lock query에서 현재 공개 상태를 읽어 불필요한 조회 제거. audit/no-op·공개 조회/SQL·캐시 경계는 GPT-6-sol이 독립 확인했다.
- backend 9개 unit suite를 실행했고 실패한 3개 suite만 수정 뒤 재검증(152 tests passed)했다. backend tsc/surface gate 통과. SQL baseline에는 필수 regular_league row lock과 공개 전적 페이지/집계/시즌 필터의 정확한 근거를 등록했다.
- frontend 11개 test file(169개 고유 tests) 통과. 추가 캐시 테스트의 wrapper 인자 전달을 실제 호출과 일치시켜 실패 2건을 해결했다. MSW boolean literal 추론 오류는 fixture 계약 타입으로 수정했고 tsc 통과. 새 UI는 기존 타이포그래피 토큰을 사용한다.
- Jest config module-loader 경고와 기존 PersistQueryClientProvider act 경고는 기존 설정/provider에 기인한 baseline으로 분리했다. 새로운 공개 설정 테스트는 해당 provider를 쓰지 않고 fixture suite는 새 mutation을 inert mock한다. 이 작업에서 경고를 숨기지 않았다.
- 로컬 DB integration·실제 alpha UI·운영 비공개 전환은 미실행이다. CI integration 결과는 아래와 같이 별도로 기록하며, 전체 완료로 보고하지 않는다.
- dev d28eb5c3f push 완료. 첫 CI 37490469602는 실패했고 alpha 37490469549는 해당 CI를 기다리므로 배포되지 않았다. Web 606 files/6557 tests, API integration 121 suites/840 tests는 통과했다.
- 이번 변경의 CI 누락 2건을 수정: 관리자 목록 복귀 테스트에 새 공개 설정 hook/owner/Boolean fixture 추가(16 tests passed); schema 변경에 따른 current source/manifest/runtime client pin 5곳 갱신. historical final-drop·StageB·기존 승인 hash·M11/game migration은 보존했다. 실제 current/historical binding·변조 거부 검증 7개와 game source snapshot 검증이 통과했다.
- game-projection integration의 takeoverClaim null은 feature에서 변경하지 않은 generic worker/test의 실패다. GPT-6-sol은 정확히 1초 만료를 쓰는 밀리초 경계와 shared advisory lock이라는 기존 null 경로를 확인했다. 단일 CI만으로 원인 분기는 미확정이며 이 작업에서 관련 코드를 수정하지 않았다. 다음 필수 CI에서 재확인한다.
- alpha EC2 i-07344f6ccf3f53c53의 Name=teameet-alpha-dev를 검증하고 SSM cfba02f6-48ef-44ba-b1f0-df9db4cfc812의 READ ONLY transaction으로 조사했다. 실제 alpha DB에는 운영 대상 id가 없고 visibility column도 아직 없다. 따라서 alpha 공개 화면의 이전 관찰을 동일 DB 행의 근거로 쓰지 않으며, alpha QA는 별도 QA 리그를 사용한다. alpha/production 수동 쓰기 0건.
- 경로 탐색에서 존재하지 않는 replay/test 경로와 changeset 문구 앵커를 사용한 호출은 실패했다. 실제 workflow 경로(test-final-schema-binding.py)와 정확한 문구로 복구했다. 제품/배포 검증 실패와 분리해 기록한다.
- 최종 feature SHA 88c1c1d8d의 CI 37492133674, alpha 배포 37492133760은 모두 success. API unit 340 suites/4623 tests, integration 123 suites/842 passed/3 skipped, Web 607 files, Gates와 migration replay가 통과했다. 앞선 generic worker 실패도 이 필수 CI에서는 통과했다.
- alpha SSM 31b89f8c-6479-4457-bab1-489dcf486aff의 READ ONLY 확인: is_public column 존재, 기존 59개 모두 true, 운영 대상 ID는 alpha에 없음. health DB true, 공개 목록 200, 존재하지 않는 운영 ID 상세 404, 비로그인 visibility PATCH 401, sitemap no-store를 확인했다. alpha의 llms 404는 기존 nginx 정책이다.
- 실제 공개/비공개 전환·감사·데이터 보존과 viewport별 UI 검증은 로그인/제어권 반환을 기다린다. ego space 814를 사용자 로그인용으로 유지하며 검증 후 finish({ keep: [] })로 닫는다. alpha/production 수동 쓰기 0건.
- 승격 준비: c98c1004c에서 32개 Changeset 소비와 API/Web 1.2.0 → 1.3.0 및 changelog를 pathspec 36개 경로로 커밋했다. 11ae087f4에서 main의 승격 merge 이력 3개를 dev에 흡수했고 제품 코드 diff는 없었다. committed tree의 release-promotion gate와 diff check가 통과했다. 새 dev SHA의 CI/alpha 및 승격 PR 검증은 이어서 확인한다.
