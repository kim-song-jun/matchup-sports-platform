# Task 20261093: 대회 중복 정보와 긴 권유 문구 정리

Status: In Progress
Owner: Codex root; implementation gpt-6-luna; independent review gpt-6-sol
Created: 2026-10-20

## Context
사용자가 실제 화면 기반 V2 RECORDS·DETAIL·AWARDS 시안을 선택하고, 세 항목만 Alpha 검증·PR 리뷰 후 main 배포까지 명시적으로 승인했다. 이전 검색 문구 감사의 17개 결정은 별도다. 기존 PR #1999의 공개 브라켓 득점표 제거를 재사용한다.

## Goal
중복 정보와 불필요한 긴 문구를 제거하되, 실제 경기 기록·시상 데이터·필요한 이동 동선을 유지한다.

## Original Conditions
- [ ] 브라켓의 별도 득점·도움 순위 부록만 제거하고 경기 카드의 점수·득점 이벤트를 유지한다.
- [ ] 완료 대회의 결과 배너와 중복되는 결과 행만 제거하고 시상·대진표·후기 링크를 유지한다.
- [ ] 시상 하단 권유 문구·빈 카드 장식은 제거하고 다른 대회 보기·결과 공유를 유지한다.
- [ ] Alpha 390/768/1440 실화면·현재 코드 리뷰·CI 통과 후 해당 변경만 main에 반영한다.

## User Scenarios
1. 방문자는 브라켓에서 경기별 기록을 보고 대회 정보·최종 결과로 이동한다.
2. 완료 대회에서 우승팀 또는 우승 미정 배너로 경기 결과에 진입하고 시상·후기도 각각 열 수 있다.
3. 시상 기록과 참가 후기 안내를 확인하고 다른 대회 보기·결과 공유를 사용한다.

## Test Scenarios
- [ ] 브라켓 순위 조회·표시 없음, 경기 이벤트 유지.
- [ ] 완료 대회 배너와 fallback 결과 진입 유지, 중복 메뉴 없음, 다른 3개 목적지 유지.
- [ ] 시상 기록·리그 기록·후기 권한 안내 및 공유 계약 유지, 권유 문구 없음.
- [ ] 로딩·오류·빈 기록 상태 유지.
- [ ] 모바일·태블릿·데스크톱의 레이아웃, 스크롤 끝, CTA 높이·가림 및 콘솔·네트워크 확인.
- Mock/API/DB fixture 변경 없음: 응답·저장 계약을 바꾸지 않는다.

## Parallel Work Breakdown
- Luna: 명시된 대회 상세·시상·공유 기록 렌더러 및 직접 발생한 전용 dead code 정리. Git·배포·DB 수정 금지.
- Sol: 기존 PR와 최종 diff의 기록·동선 보존을 읽기 전용으로 독립 리뷰.
- Root: 공유 WIP 보존, 정확한 tree/CI, Alpha 실제 QA, 범위 한정 운영 반영·검증.

## Acceptance Criteria
- [ ] 세 항목의 변경만 포함하며 새 페이지·검색 문구·라우트 변경이 없다.
- [ ] 실제 기록·참가팀·시상 데이터는 보존된다.
- [ ] 좁은 테스트와 정확한 PR head CI가 통과한다.
- [ ] 실제 Alpha 전후 캡처와 3개 크기 검증을 완료한다.
- [ ] main의 실제 serving SHA·release·DB health 및 해당 화면을 확인한다.

## Tech Debt Resolved
제거한 브라켓 전용 hide/containerStyle 분기와 테스트, 시상 권유 카드 전용 CSS, 과거의 선수 순위 이동 설명을 함께 정리한다. 공유 기록 컴포넌트 자체와 시상 소비자는 유지한다.

## Security Notes
인증·권한·개인정보·데이터 저장·API를 바꾸지 않는다. 기존 공유 테스트의 외부 from URL 차단 검증을 유지한다. Alpha noindex를 유지한다.

## Risks & Dependencies
완료 화면은 결과 배너가 항상 렌더되는 현재 구조를 전제로 중복 행을 제거한다. 우승팀 미정 fallback도 테스트한다. 다른 dev 변경을 전체 승격하지 않으며 공유 작업트리와 PR #1997은 건드리지 않는다.

## Ambiguity Log
- 2026-10-20: 최초 시안 선택은 제품 승인 아니었으나 후속 답변 A로 세 항목의 구현·검증·main 배포가 승인됐다.
- 2026-10-20: detail 첫 번째 행은 /awards, 두 번째 행이 /results다. 실제 중복은 배너와 두 번째 행이다.

## Progress Snapshot
- Fresh dev 85893b0, existing PR #1999 f46f2e6. 공유 checkout의 detached HEAD·외부 WIP를 보존하고 두 tree를 합친 소스 복사본에서 작업한다.
- 구현 후 테스트·최종 독립 리뷰·실제 Alpha·main 검증은 아직 대기다. 실행 증거는 로컬 cleanup-v2 evidence에 유지하며 완료로 추정하지 않는다.
