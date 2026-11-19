# Task 20261136: 회원·팀 운영 정보와 회원 대리 접속

Status: In Progress
Owner: Codex (단일 세션)
Created: 2026-11-19

## Context
회원·팀 관리의 기본 조회는 있으나 상태 변경 이력, 관련 문의·신고, 참가 활동, 팀 검색 조건이 부족하다. 삭제 상태와 최종 삭제의 의미도 구분되지 않는다.

## Goal
회원·팀 상세에서 운영 판단에 필요한 실제 정보를 확인하고, 감사 가능한 회원 대리 접속을 제공한다.

## Original Conditions
- [ ] 사용자 요청: 기존 검토에서 제시한 개선 항목 전체 진행.
- [ ] 회원·팀 상태 변경 이력(사유·처리자·시간), 관련 문의·신고와 결과 연결.
- [ ] 회원 가입 미완료 항목, 참가 경기·대회·리그 이력, 탈퇴 예정일.
- [ ] 팀 지역 표시, 종목·지역 필터, 팀장 검색, 주최·참가 경기와 예정 경기.
- [ ] 팀장 상태, 가입 신청 대기 인원, 실제 최근 활동일.
- [ ] 삭제 상태와 최종 삭제 구분, 최종 삭제 버튼 조건 수정.
- [ ] 팀 경기 링크와 신뢰 정보 한글·표본 설명.
- [ ] 사용자 추가 요청: 해당 회원 계정으로 접근하는 관리자 기능.

## User Scenarios
1. 운영자가 회원 상세에서 가입이 막힌 원인과 처리 이력을 확인한다.
2. 운영자가 팀을 종목·지역·팀장으로 찾아 참가/주최 일정과 신고를 확인한다.
3. 운영자가 사유를 입력하고 회원으로 접속했다가 관리자 화면으로 돌아온다.

## Test Scenarios
- 권한 없는 사용자 및 허용하지 않은 관리자 등급 거부.
- 대상별 로그 격리, 문의 작성자/신고 대상의 구분, 실제 참가 자료와 주최 자료 구분.
- 팀 검색과 상태 facet, 안정적인 페이지 정렬.
- 삭제 상태만 바뀐 계정의 최종 삭제 가능, 최종 삭제된 계정 복구 불가.
- 대리 접속 서명·만료·권한 회수·계정 상태·세션 epoch 확인, 시작/종료 감사 기록 및 원계정 복귀.
- 선택된 대리 접속 범위에 따른 HTTP/Socket 차단 회귀.
- 관련 fixtures/MSW/API 문서와 UI 테스트 동기화.

## Parallel Work Breakdown
병렬 에이전트 사용 안 함. 순서: API → UI → 자체 리뷰·검증 → PR·dev → alpha.
Owned: v1 admin·auth 관련 구현, 회원/팀 화면 및 공유 구성요소, types/hooks/MSW, 관련 테스트·API 문서·changeset·시나리오.
Forbidden: 운영 승격, 실제 회원 데이터 변경, 비밀값 출력, 다른 세션 worktree 변경.

## Acceptance Criteria
- [ ] UI A/B/C 비교 → 사용자 선택 → 화면 구현.
- [ ] 모든 Original Conditions 충족, 데이터가 없거나 실패하면 정확한 상태 표시.
- [ ] 권한·데이터·UI 회귀 테스트 및 변경 범위 타입 검사.
- [ ] API 문서와 mocks 동기화, 신규 부채 없음.
- [ ] 최신 커밋 기준 자체 리뷰, Copilot/CI 확인 후 dev PR 머지.
- [ ] ego-lite alpha 390/768/1440 실측·console/network·전후 증거, PR 갤러리.
- [ ] 이번 작업 소유 자원 정리.

## Tech Debt Resolved
- 삭제 상태와 실제 비식별화 완료를 같은 상태값으로 오인하는 UI 조건.
- 내부 신뢰 상태 코드 노출 및 상세에서 끊긴 경기 이동 경로.

## Security Notes
기존 AdminContextService·V1AuthGuard 계약 유지. 대리 접속 범위는 사용자 선택 대기. 대상 비밀번호를 조회하거나 일반 로그인 세션을 위조하지 않는다. 감사 로그를 필수로 남긴다.

## Risks & Dependencies
- ego-lite 도구/스킬이 현재 세션에 노출되지 않음. Alpha 실제 로그인 검증 경로 확보 필요.
- worktree는 도구로 생성 후 쓰기 허용된 /tmp/teameet-admin-member-team-operations로 이동.
- 의존성 설치·GitHub 네트워크 접근 및 CI 확인 필요.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-11-19 | UI 구성 | A 기존 확장 / B 탭 / C 업무 중심, 선택 대기 |
| 2026-11-19 | 계정으로 접근 의미와 범위 | 회원 대리 접속(조회 또는 쓰기) / 관리자 권한 부여, 선택 대기 |

## Progress Snapshot
- 최신 origin/dev 07e51596e 기반 feat/admin-member-team-operations.
- Phase 1 API 기반 구현 완료: 대상별 context, 상태 이력·문의·개인 매치·팀 경기·대회/리그 명단·현재 공식 출전자 조회(10개 단위 페이지). 팀 목록의 종목/상위·하위 지역/팀장 검색과 지역 필드 추가.
- 기존 회원 상세의 탈퇴 요청 로그도 targetId로 제한해 다른 대상의 기록을 섞지 않음.
- Phase 2 UI 및 대리 접속은 사용자 선택 대기. 기존 화면은 변경하지 않았고 세션 발급 기능도 아직 구현하지 않음. Phase 3 PR/alpha 대기.
- 검증: API 관련 84/84, 웹 HTTP 훅 2/2 통과. API·웹 타입 검사 0, surface/pattern 검사 통과, diff-check 통과. 타입 검사 뒤 스크립트의 하위 셸이 sandbox EPERM으로 실패하여 해당 스크립트만 앱 cwd에서 권한 확장 재실행해 통과.
- runtime Node 22.23.1은 저장소 요구 >=22.23.5보다 낮아 경고 발생. 의존성은 기존 pnpm store에서 offline/frozen 설치, Prisma는 이번 작업 전용 /tmp 캐시로 생성. DB 통합/실제 로그인/Alpha 화면은 미검증.
- docs/api README·global-contract·admin-and-ops와 MSW(실제 연결 필요 503)·웹 타입/조회 훅 동기화. 새 schema/migration 없음.
- 전체 요청은 미완료이며 UI 선택/접근 허용 범위 답변 후 이어서 구현해야 한다. dev 머지·배포·PR-ready로 보고하지 않음.
- 전용 worktree 외 기존 변경 없음. 기존 /admin/users 및 /admin/teams 목록/상세 4개 화면 검토 완료.
