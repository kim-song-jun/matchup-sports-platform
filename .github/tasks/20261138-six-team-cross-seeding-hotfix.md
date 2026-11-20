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


## Follow-up — 템플릿 생성 순서 (2026-11-21)
Status: In progress

### Context / Goal
사용자가 신규 템플릿부터 상단 A1→B2/A3 승자, 하단 B1→A2/B3 승자로 생성하도록 확정했다.
Alpha의 기존 템플릿은 drawSources가 동순위 조를 섞어 B1을 위에 두고 같은 조 1·2위를 같은 가지에 배치했다.

### Original Conditions / Owned / Forbidden
- [x] 2개 조 각 3팀 진출일 때 조 표시 순서대로 1위를 상단/하단 직행에 고정한다.
- [x] 첫 경기 B2/A3 및 A2/B3와 실제 승자 edge를 함께 검증한다.
- [x] 다른 결선 규모와 일반 추첨, 기존 대회 데이터는 보존한다.
- 단일 에이전트 순차. Owned: flexible-bracket-plan.ts/spec, 관련 통합 스펙, API 문서, changeset, 이 task.
- Forbidden: 기존 대회 배정/결과 변경, main 승격, 재배정 저장 로직 변경, UI 변경.

### User / Test Scenarios
신규 템플릿 미리보기와 생성에서 drawSeed에 무관하게 위쪽 첫 조 1위가 반대 조 2위/같은 조 3위 승자와 만난다.
seed 0/1/7/99/최댓값, 3위전 유무, 불균등 조, 실제 저장된 sourceGroupId/position/edge를 확인한다.

### Acceptance Criteria
- [x] 단위 RED5건→GREEN, flexible/template/group planner 3개 스위트 167건 통과.
- [ ] DB 통합 회귀 작성, 로컬/CI 실행 결과 기록.
- [ ] 범위 typecheck/surface, diff/debt 검토, dev PR·CI·머지.
- [ ] Alpha 검증 결과 또는 정확한 blocker 기록.

### Tech Debt / Security / Risks / Ambiguity
기존 추천 우회에 앞서 템플릿의 순위 출처와 연결을 일치시킨다. 인증/권한/DTO/스키마 변경 없음.
브라우저 도구 ego-browser가 현재 세션에 없고 로컬 Docker도 실행 불가. 기존 Alpha는 GET 조회만 수행했다.
사용자의 최신 요청으로 우선 범위를 신규 템플릿 생성으로 제한한다. 재배정 저장은 이 변경에서 수정하지 않는다.

### Progress Snapshot
base ff7174832, branch fix/finalist-reassign-20261121, isolated worktree /tmp/teameet-finalist-reassign.
Alpha 현재 #21=B2/A3→#23=B1, #22=A2/B3→#24=A1. 사용자 대회 데이터 변경 없음.

- v1 surface PASS (842 files); diff --check PASS; touched code debt markers 없음. 코드 자체 검토: 고정 조건은 2개 조 advanceCount=3에만 적용하며 기존 rank-major seeds와 실제 edge 생성 경로를 재사용한다.
- DB 저장 통합 회귀 작성 완료. 로컬 Docker가 WSL socket 오류로 실행되지 않아 DB 통합은 CI에서 확인한다.
- 로컬 API typecheck는 공유 node_modules의 오래된 Prisma 생성물(예: V1AdCampaign/bracketTrack 누락)로 1021행 오류. 공유 client는 다른 세션 소유이므로 재생성하지 않음. CI의 새 Prisma 생성 이후 타입/DB 검증을 머지 게이트로 사용한다.
- ego-browser가 없어 Alpha 클릭·스크린샷 검증은 현재 불가. 기존 Alpha/운영 대회는 변경하지 않았다.
