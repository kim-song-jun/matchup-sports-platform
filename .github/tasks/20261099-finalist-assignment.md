# Task 20261099: 조별 결과 기반 공통 결선 진출팀 배정
Status: Review
Created: 2026-10-21

## Context
14·15팀 대회의 수동 대진에는 조별 순위 슬롯이 없어 순위대로 채우기가 표시되지 않는다.
## Goal
기존 경기·시간·장소·진출 연결을 보존하면서 조별 순위 확인 및 자동/수동 결선 배정을 지원한다.
## Original Conditions
- [x] 12강 전용 선발/시드/직행/동률 규칙 보존
- [x] 조별 공식 순위를 확인하고 배정안에서 진출팀/순서 수정
- [x] 수동 대진 및 불균등 조 지원, 자동 추천 후 수동 편집
- [x] 원본 순위 불변, 사유·변경 전후 감사, stale 검증, 시작 경기 보호
## User Scenarios
14팀(4/4/3/3) 또는 15팀(4/4/4/3) 대회에서 조별 결과를 확인하고 8강 자리에 상위 2팀씩 배정한다. 기존 12강은 전용 규칙으로 동일하게 배정한다.
## Test Scenarios
- [x] Happy: 수동 결선, 순위 불러오기, 교차/시드 추천, 직접 선택 및 저장
- [x] Edge: 동률·부전승·중복·미배정·같은 조 재대결
- [x] Error: 미완료 조, stale preview, 시작/결과 경기, 잘못된 팀/다른 대회/중복 자리, 권한
- [x] Mock: API/controller/UI tests 계약 갱신
## Parallel Work Breakdown
순차 단독 구현. Backend: preview/atomic apply → Frontend: 공통 배정 화면 → 검증/문서. 공유 작업트리는 수정하지 않는다.
## Acceptance Criteria
- [x] 승인된 기능 시나리오와 보안 계약 검증
- [x] 타입/API 문서/changeset 동기화
- [x] alpha QA blocker 기록
- [ ] dev 반영 후 alpha 실제 화면 390/768/1440 검증
## Tech Debt Resolved
수동 대진에서 조별 결과 기반 배정이 불가능했던 템플릿 종속성 제거.
## Security Notes
V1AuthGuard 및 활성 관리자 읽기/쓰기 권한. 서버에서 대상·확정 등록·공식 결과·중복·잠금 검증. 한 트랜잭션 저장.
## Risks & Dependencies
alpha 로그인/브라우저 도구 없음. 공식 결과 정정 시 저장된 결선은 자동 덮어쓰지 않음; 새 preview에서 차이 확인.
## Ambiguity Log
사용자가 기존 12강 유지 및 공통 순위 확인/수정/자동·수동 배정 기획을 승인함. 기존 UI 프리미티브와 12강 모달 패턴 확장. 공식 순위 변경 대신 배정 초안 수정.
## Progress Snapshot
origin/dev 88119dbd9, branch feat/group-finalist-assignment, worktree /tmp/teameet-finalist-assignment.
- Phase 1 backend: completed — versioned preview, confirmed group candidates, root/direct-advance targets, atomic apply, reason/audit, official standings fingerprint, linked-side/start protection. DB schema/migration 없음.
- Phase 2 frontend: completed — 목록/그림 공통 진입, 기존 12강 전용 흐름 유지, 조별 성적 확인/진출 수/배정 순서 조정, 교차/시드 추천, 수동 선택/교환, 같은 조 경고 및 변경 전후 확인.
- Phase 3 validation: API unit 관련 28 + DTO8 = 36 PASS. Web5 suites/113 PASS. API/Web full typecheck exit0, API surface/Web pattern PASS. 신규 테스트 중 타입·reflect-metadata 초기 설정 오류 수정 후 통과. 최종 DB 증거는 아래 후속 기록 참조.
- DB: 임시 localhost:56439 PostgreSQL 18.4-beta에 migration 전체 재생, suite별 격리 clone 사용. 신규 14/15팀 저장/교환/권한/중복/stale/시작 차단 및 중간 쓰기 실패 강제 trigger로 전체 rollback 확인. 기존12강 회귀 및 공통 배정의 슬롯 있는/없는 부전승 보존도 검증. 소유 클러스터/임시 데이터는 종료 후 정리.
- Phase 4 docs: completed — API README/global/domain, 정본 도메인 결정 이력, changeset, docs/scenarios/finalist-assignment.md 및 index 동기화.
- Self review: 입력 DTO whitelist, 서비스 read/mutation admin, same-tournament targets/registration, single transaction, no silent success, touched code debt markers 없음. 기존12강 implementation 파일 변경 없음(회귀 테스트만 추가).
- Alpha QA: pending **0/3**(390/768/1440), 미배포 및 인증된 브라우저/세션 없음. 실제 alpha 화면/console/network/screenshot은 미검증. 지정 대회 데이터 변경 없음.
- Git: local worktree diff만 있음. commit/push/PR/dev merge 없음; PR-ready 또는 완료로 주장하지 않음. 원래 shared working tree의 다수 WIP는 수정하지 않음.

최종 DB 통합 검증: **2 suites / 7 tests PASS**(신규 수동14/15팀2 + 기존12강3 + 공통12강 부전승 보존2). DB 중간 오류 전체 rollback PASS, 임시 클러스터 제거 확인.

## PR / dev 배포 진행 (2026-10-21 사용자 요청)
- 사용자가 PR 생성 및 dev 배포를 명시 승인. 최신 fetch 후 origin/dev와 base 차이 0.
- 변경26파일을 exact pathspec으로 커밋/feature branch push → base=dev PR → 최신 head Copilot/CI 게이트 → dev 머지 → alpha 배포 SHA 확인 순서로 진행.
- 원본 작업트리 WIP는 보존. alpha 실제 로그인 세션 확보 요청 중이며 직접 대회 배정은 저장하지 않고 화면·응답을 확인할 예정.

- PR #2013 생성, 최초 head 3c369ed79. Copilot run39528327466은 코드 검토 전 모델 `claude-opus-5` unavailable로 실패(최신 리뷰 없음). 실패를 clean으로 취급하지 않음.
- 실제 alpha 로그인·지정15팀 수동대진의 before1440/768/390 캡처 완료(overflow0, console/network 오류0). 모바일 그림은 별도 컴포넌트라 공통 버튼 진입을 보강했으며, 수동/슬롯 없는 대진에서 preview API까지 여는 모바일 회귀8 PASS. Web 검증 누적121.
