# Task 20261123: 업체 전달용 대회 운영 콘솔 체험

Status: In Progress
Owner: Codex (single agent)
Created: 2026-10-30

## Context
외부 대회 운영사가 준비→참가팀→대진→현장 기록→결과·시상을 직접 살펴볼 진입점이 필요하다.
기존 Alpha 목업 생성은 실제 DB/관리자 권한을 사용하므로 외부 무인 체험에는 재사용하지 않는다.

## Goal
대회 운영 목록 상단에서 로그인 없는 공유 링크로 진입하고 업체/브라우저 탭마다 독립된 샘플을 조작한다.

## Original Conditions
- [x] 사용자 B안 선택: 독립 체험 세션 + 짧은 단계 안내.
- [x] 운영 목록 상단 CTA와 외부 전달용 링크.
- [x] 실제 대회·회원·알림·공식 결과에 영향 없음. 모든 화면은 체험임을 명시.
- [x] 실제 샘플 상태 변경, 새로고침 유지, 자기 체험 초기화, 3개 역할 관점 제공.
- [x] PR과 Alpha 390/768/1440 스크린샷.

## User Scenarios
관리자는 운영 목록에서 체험을 연다. 외부 업체는 공유 링크로 자기 탭의 샘플을 시작한다.
디렉터 관점으로 참가팀을 확정하고 대진을 만든다. 기록 담당자로 라인업 준비·경기 시작·득점/경고 기록·종료를 체험한다.
디렉터 관점에서 체험 결과를 확정하고 참가자 관점에서 공개 결과/시상을 본다.

## Test Scenarios
총 12개 기능 시나리오: 진입/준비 저장/참가 확정/대진 생성/역할 범위/라인업·시작 보호/기록·취소/종료·검토/결선 반영/시상·참가자 표시/저장·손상·실패/공유·자기 초기화.
화면은 5개 단계와 3개 역할, 390/768/1440. 실제 API 호출이 없는지 검증한다.

## Parallel Work Breakdown
서브에이전트 없이 순차 작업. Phase 1 모델/저장 계약 → Phase 2 UI/테스트 → Phase 3 리뷰/PR/Alpha 캡처.
Owned: 신규 demo 모델·컴포넌트·공개 route, 운영 목록의 체험 CTA, 관련 테스트/문서/changeset.
Forbidden: 기존 PR #2101 변경, 실제 대회 API/권한 플래그, 운영 DB/seed/reset, main 승격, 다른 세션 WIP.

## Acceptance Criteria
- [x] 체험 진행은 실제 모델 상태에 반영되고 역할/진행 상태 보호를 따른다.
- [x] 실패를 성공으로 표시하지 않는다. 저장 실패/손상은 오류와 초기화 경로를 제공한다.
- [x] 샘플 경기·팀은 실제 ID/API와 연결되지 않는다.
- [x] 테스트·tsc·diff·자체 리뷰와 PR, Alpha 증거 또는 구체적 배포 blocker.

## Tech Debt Resolved
외부 체험을 실제 DB 목업 생성과 분리해 실사용자/운영 권한이 섞이지 않도록 한다.

## Security Notes
체험은 명시적 시뮬레이터다. API 성공을 가장하는 fallback이나 MSW interception을 사용하지 않는다.
sessionStorage에 버전/명령 이력만 저장하고 검증 후 재생한다. 공유 URL에는 세션/개인정보를 넣지 않는다.
로그인/관리자·디렉터 권한을 부여하지 않고 실제 알림·결과 API를 호출하지 않는다.

## Risks & Dependencies
탭 간/기기 간 체험 진행 공유는 하지 않는다. 새 탭(noopener)/공유 링크는 새 체험이다. 탭 내 새로고침만 유지한다.
Alpha 화면 검증은 dev 반영 후 가능하다. 기존 DIRECTOR_OFFICIALIZE는 그대로다.

## Ambiguity Log
- A/B/C 제안 중 사용자 '그렇게 진행'은 추천 B안 승인으로 해석했다.
- 독립 세션은 브라우저 탭별 체험 전용 상태로 구현한다고 사용자에게 착수 시 명시했다. 실제 운영 API의 시험 권한이 아니다.

## Progress Snapshot
origin/dev d93d0ab8d 기반 격리 worktree tournament-ops-demo, branch feat/tournament-ops-demo.
Phase 1/2/3 완료. PR #2103 dev 병합 및 Alpha 배포 완료. 5/5 단계·3/3 역할·3/3 폭·12/12 기능 시나리오 실측.

## Local verification snapshot
- Phase 1/2 구현. 모델12 + 신규 UI5 + 기존 담당 목록9 tests PASS, tsc 및 pattern gate PASS.
- 전체 UI 진행에서 fetch 호출0, 실제 상태/점수/결선·시상 반영 및 복원 확인. 손상/저장 실패를 성공으로 표시하지 않음.
- Alpha baseline SHA d93d0ab8d. 관리자 로그인 재시도 후 성공(첫 hydration 도중 로그인400은 baseline에서 제외). 기준 목록3폭 캡처 진행. 신규 Alpha는0/5·0/3·기능0/12.

## Final Snapshot — 2026-10-30
- PR #2103 dev merge2708c6149, PR/dev CI PASS, Alpha deployment41033900947 attempt2 PASS. 첫 배포35분 CI 대기 timeout을 정상 재실행으로 해결했다.
- Alpha 5/5단계·3/3역할·3/3폭·12/12 시나리오. PNG45장(before6/after39), console/network와 fault injection/경계값별 검증 범위는 docs/scenarios/tournament-ops-demo.md 정본.
- Headed Chrome32296/Node62088 cleanup 및 PID 부재. 실제 대회 쓰기0, DIRECTOR_OFFICIALIZE 변경0, main 승격0.
- 외부 전달 가이드 docs/guides/tournament-ops-demo.md, 증거는 docs/tournament-ops-demo-evidence 브랜치와 동일 PR 갤러리에 보관.