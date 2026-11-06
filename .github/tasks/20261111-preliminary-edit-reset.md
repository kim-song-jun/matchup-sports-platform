# 예선 편성 수정·팀 배정과 독립 대진 초기화

Status: In Progress

## Context
league_knockouts 예선은 저장 이후 읽기 전용이며 팀 배정 입력이 없다.

## Goal
독립 대진 초기화, 대진이 없는 상태의 예선 수정, 확정 참가팀 수동·자동 배정을 제공한다.

## Original Conditions
- 초기화와 예선 수정은 독립 액션이다.
- 예선은 조별리그이며 기존 대회처럼 팀 선택과 자동 배정이 가능하다.

## User Scenarios
어드민이 초기화를 확인하면 예선·결선 대진과 일정·자리·진출팀 선택을 지운다. 참가 신청과 예선 편성·팀 선택·결선 규칙은 유지한다. 이후 별도로 예선 편성을 수정하고 저장해 조별리그 대진을 만든다.

## Test Scenarios
시작/기록/결과/종료 대회 초기화 거절, stale revision 거절, 대진 존재 시 편성 수정 거절, 수동/자동/부분 배정 저장·재조회, 중복/다른 대회/미확정 팀 거절, 결선 규칙 조 ID 재연결.

## Parallel Work Breakdown
단일 에이전트. Owned: multi-finals API/service/DTO/plan/tests, use-multi-finals, multi-finals-wizard/tests, API 문서, changeset. Forbidden: 원본 작업트리 WIP.

## Acceptance Criteria
- [x] 독립 초기화 확인과 서버 권한·상태·revision 검증
- [x] 대진 없는 저장된 예선의 편성 수정
- [x] 팀 수동/자동 배정 및 저장 경로 연결
- [x] 좁은 회귀 검증과 API 문서 동기화
- [ ] Alpha 390/768/1440 화면·console/network 검증

## Tech Debt Resolved
예선 저장 후 수정 경로 부재와 배정 API가 UI에서 노출되지 않는 문제.

## Security Notes
mutation admin, 대회 advisory lock, optimistic revision, 감사 로그 사용. 실제 대회 초기화는 이 작업 중 실행하지 않는다.

## Risks & Dependencies
진행·결과가 있는 대회는 초기화 불가. DB 스키마 변경 없음. Alpha 검증은 배포 필요.

## Ambiguity Log
사용자와 독립 초기화 버튼 + 대진 없을 때 예선 수정 + 기존 패턴 수동/자동 배정안을 구체적으로 합의하고 진행 승인받았다. 기존 UI 재사용으로 추가 디자인 선택을 요청하지 않는다.

## Progress Snapshot
- 최신 origin/dev 4a22824a5 기준 feat/preliminary-edit-reset 격리 worktree.
- Phase 1 API, Phase 2 UI 구현. API 28 tests / Web·공용 MSW 고유 22 tests PASS. API/Web tsc --noEmit --incremental false PASS. surface/pattern 및 diff whitespace·debt marker 검사 PASS.
- PR #2151 (dev), 초기 HEAD 5da742413. 실제 자리와 GroupTeam 생성 순서가 다를 때 hydrate/초기화 뒤 순서를 보존하는 회귀도 검증했다.
- API 첫 실행은 공유 Prisma Client가 구버전이라 컴파일 실패. 공유 생성물은 보존하고 격리 Client를 현행 스키마로 생성해 재실행 PASS.
- 실제 DB 통합 시나리오 2개 추가 및 support 권한 시나리오 확장. 로컬 PostgreSQL/Docker 없음으로 실행은 CI에 위임.
- Phase 3 진행 중: PR/CI/Copilot 및 Alpha 변경 후 QA. ffb004a59의 CI Gates/Web PASS, API 실제 PostgreSQL 검증은 진행 중이다. 후속 전체 경기 수 잠금 보완은 로컬 회귀 PASS 후 별도 커밋한다.
- Copilot 요청은 CLI와 공식 REST 모두 성공 응답이나 requested_reviewers=[], review_requested 이벤트/실제 리뷰 0이다. 보안 AI 스캔 성공을 Copilot clean으로 대체하지 않았고 dev 머지는 보류했다. 권한·요금제·머지 규칙을 변경하지 않았다.
- Alpha 관리자 UI 로그인 및 before 390/768/1440 screenshot PASS. uncaught/console 오류 0, 실패 HTTP 응답 0, 가로 overflow 없음. after 기능 0/5·viewport 0/3: 미머지·미배포.
- QA 전용 비공개 대회와 본인 소유 임시 팀 2개만 생성했다. 기준선 캡처 후 대회 cancelled + isPublic=false, 두 QA 팀 해체 완료. 기존 대회·팀 수정 0. 자격증명·쿠키·팀/대회 UUID는 커밋하지 않았다.
- Headed Chrome PID/Node PPID: 35420/18588, 17548/13228, 11472/28932, 26004/32164, 14528/30448, 15180/10424, 33376/12200, 33436/14488, 33224/1832. 각 시도는 finally에서 browser/context/server 종료 확인. 로그인 1차 load 대기와 후속 hydration/networkidle 대기는 harness 실패로 기록하며 API 실패로 오인하지 않는다. 최종 harness는 React 폼 hydration 이후 로그인했다.
- 스키마·migration 변경 없음. 관련 모델: Tournament/Group/GroupTeam/Standing/Slot/MatchDetails/TeamMatch/Game/AdvancementEdge 및 일정·감사 기록.
