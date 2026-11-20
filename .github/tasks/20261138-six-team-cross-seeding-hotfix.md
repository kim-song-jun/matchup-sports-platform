# Task 20261138 — 6팀 결선 교차 자동 배정 핫픽스
Status: In progress

## Context
사용자 지정 Alpha 대회6c2b5f3d-a56d-4beb-bdb1-b9df154b66d4에서 같은 조1·2위의4강 재대결 가능. 사용자 확정: A1 상대는 B2/A3 승자, B1 상대는 A2/B3 승자. 수동 유지. dev/main 핫픽스 명시 요청.
## Goal
2개 조에서 각3팀 진출·각1위 부전승일 때 교차 자동 추천을 실제 승자 연결 기준으로 배치한다.
## Original Conditions
수동 선택/교환·저장/권한/잠금·기존 시드순 자동 배정 유지. 기존 대회 자동 덮어쓰기 없음. main에는 이번 수정과 필수 릴리스만 포함한다.
## User Scenarios
결선 진출팀 배정→조별 교차 자동 배정에서 A1-[B2/A3], B1-[A2/B3] 초안 표시. 필요하면 수동 조정 후 명시 저장. 슬롯/경기 순서·홈/원정이 달라도 실제 연결 기준으로 처리.
## Test Scenarios
6팀 조순위 출처/수동 슬롯 양쪽, 순서 반전, 연결 누락/중복 거부, 시드순 유지, 수동 변경/저장 payload. API 미리보기 연결 메타데이터와 기존 권한/저장 회귀. Alpha 실제 자동 추천 후 저장하지 않고 닫기.
## Parallel Work Breakdown
단일 에이전트 순차. Owned: finalist preview/추천/helper/type/test/API 문서·changeset·릴리스. Forbidden: 다른 기능의 운영 승격, 실제 대회 결과 변경, 수동 배정 강제.
## Acceptance Criteria
- [x] RED2건→GREEN API21/Web17, API/Web 타입·surface/pattern PASS. 새 PostgreSQL 통합1건은 원격 CI에서 실행 확인.
- [ ] dev PR/CI·머지·Alpha 실측.
- [ ] main 기반 최소 핫픽스 PR·버전/변경 이력·CI 및 운영 승인 단계 확인.
## Tech Debt Resolved
템플릿 조순위 shortcut이 결선 승자 연결을 보지 않아 잘못된 자동 배정을 유지하는 경로를 보강.
## Security Notes
미리보기는 읽기 전용 additive metadata. 쓰기 계약과 서버 기존 가드 유지. 운영 승인 우회 없음.
## Risks & Dependencies
Alpha screenshot timeout 이력. main은 dev와436파일 차이이므로 전체 dev 승격하지 않는다.
## Ambiguity Log
최신 직접 사용자 요청이 main 핫픽스 실행을 명시적으로 허용한 것으로 적용한다(일반 자동 승격 금지의 이번 범위 한정 예외). 기존2개 자동 버튼 중 교차에만 규칙 적용, 시드순·수동은 유지.
## Progress Snapshot
base dev b6156d248, main ef22e365d. 격리 worktree six-team-cross-seeding. 관련 finalist 파일은 현재 main/dev 동일하여 최소 cherry-pick 가능. UI 레이아웃 변경 없이 추천 로직/API 메타데이터만 보완.

- Alpha 원본 미리보기(space11) 확보. A1 알파 레드 FC의 #24 상대는 #22(A2 종점FS/B3 곰빵은 가면가), B1 FS풋술의 #23 상대는 #21(B2 잡초fs/A3 SOUL FC)로 문제 확인. 저장/실제 팀 배정 변경 없음.
- 타입 검사에서 DB edge 이름을 sourceOutcome으로 정정했고 단위 fixture도 Prisma 타입으로 묶었다. 승자/패자 실제 PostgreSQL 회귀 추가. 로컬 Docker 없음, .env 조회/seed/reset 없음. Node24.15.0 차이는 CI Node22로 검증한다.
