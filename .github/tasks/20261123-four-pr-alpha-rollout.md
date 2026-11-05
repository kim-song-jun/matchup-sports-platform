# Task 20261123: PR 2065·2087·2091·2094 alpha 배포

Status: In Progress
Owner: Codex
Created: 2026-10-30

## Context
사용자가 네 PR의 리뷰 후속 수정본 반영, CI 확인, dev 머지와 alpha 배포·검증을 승인했다. main/prod 승격은 범위 밖이다.

## Goal
네 수정본을 각 PR에 반영하고 게이트 확인 후 dev에 순차 머지해 alpha의 실제 배포 SHA와 DB·화면을 검증한다.

## Original Conditions
- [x] PR #2091의 취소 입력·단계 버전 보존 수정과 신규8개 RED→GREEN, 관련187개·Web 타입 검사 PASS.
- [x] #2065·#2087·#2094의 현재 계약·QA 문서 연결 보완.
- [ ] 네 PR의 최신 head CI·리뷰·미해결 스레드 확인.
- [ ] dev 머지·로컬 dev fast-forward·alpha 최종 배포 확인.
- [ ] 배포된 변경의 사용자/운영자 시나리오·3폭 증거 또는 정확한 접근 blocker 기록.

## User Scenarios
일반 사용자는 레벨·지역·개최순 필터를 사용한다. 운영자는 파울 안내, 리그 접수 상태, 조·경기 시간 취소/재진입·단계 동시 편집을 확인한다. 상세 기준은 각 PR의 task 및 docs/scenarios/index.md를 따른다.

## Test Scenarios
- 기존 로컬 증거: 관련5개 파일187개 PASS, Web tsc exit0. 공유 설치의 중복 React/누락된 validator는 /tmp 검증 의존성으로 격리했다.
- 새 head: Gates/API/Web와 변경 후 리뷰를 확인하고 받은 미해결 스레드 전체를 대조한다.
- alpha: 최종 merge SHA 포함, DB health=true, migration 배포 성공, guest 필터·운영 화면·console/network·390/768/1440을 확인한다.

## Parallel Work Breakdown
에이전트 병렬화 없이 순차 진행한다. Owned: 네 PR 후속의 명시19개 파일, 이 rollout task와 필요한 배포 증거. Forbidden: main push/merge·prod 변경·환경파일·타 세션 WIP·파괴적 DB reset/seed.

## Acceptance Criteria
- [ ] 4/4 수정본 커밋·원래 PR 브랜치 push, PR base dev 재확인.
- [ ] 각 PR gate 확인 후 4/4 dev 머지. 개별 merge마다 로컬 dev ff-only 동기화.
- [ ] alpha 성공 배포와 모든 merge의 포함 여부·DB 확인.
- [ ] 실제 화면 QA와 PR별 갤러리 또는 실행하지 못한 정확한 원인을 기록.

## Tech Debt Resolved
PR 본문과 로컬 수정본이 분리된 상태를 해소하고 원인·수정·검증·배포 커서를 연결한다.

## Security Notes
인증 토큰·테스트 계정·환경파일은 출력·커밋하지 않는다. 운영 데이터는 필요한 범위만 다루며 결과 생성 등 영구 기록은 별도 시나리오 계약을 따른다.

## Risks & Dependencies
GitHub CLI·Copilot 리뷰 서비스·alpha 배포와 실제 브라우저 로그인 접근이 필요하다. 외부 게이트가 불가하면 성공으로 처리하지 않는다. #2091은 additive schema migration2개, #2065는 리그 상태 데이터 migration이 있다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-30 | 배포 대상 | 사용자 승인: 네 PR 모두 dev/alpha, main/prod 제외 |

## Progress Snapshot
- Phase 1 in_progress: 최신 dev·4개 PR head fetch, 명시 경로 commit/push 준비. 기존 로컬 검증 완료.
- Phase 2 pending: 변경 head CI·리뷰·스레드 게이트, 순차 dev 머지/로컬 dev 동기화.
- Phase 3 pending: 최종 alpha 배포 SHA·DB·화면 QA·PR 증거·최종 보고.
