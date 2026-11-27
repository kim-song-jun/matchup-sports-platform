# Task 20261141: PR-A 로고 후속 및 PR-B 잠금화면 위젯
Status: In Progress

## Context
PR-A #2559가 dev에 머지됨. 최신 origin/dev e7979b290에서 새 codex/ios-widget-pr-b worktree 생성. 이전 iOS 및 Android 작업 공간 보존.
## Goal
타임라인에서도 로고 다운로드(전체8초/최대4개)와 잠금화면 직사각형/한 줄 위젯. dev 한국어 PR, 머지 금지.
## Original Conditions
- [x] HomeProvider.getTimeline에서 WidgetLogos.prefetch 호출
- [x] 캐시 없는 HTTPS 로고 우선, 중복 제거, 확장 최대4개/전체8초/512KB 및 세션 revision 보호
- [x] accessoryRectangular/accessoryInline, 단색 텍스트, 동일 화면 우선순위/시계/캐시 만료
- [ ] 단위·unsigned 앱/확장 빌드·상태별 샘플 캡처, 실제 alpha API 검증과 구분
## User Scenarios
앱을 열지 않아도 새 상대팀 마크를 받음. 잠금화면에서 경기·응답 대기·일정·없음 확인, 탭하면 앱 일정 이동.
## Test Scenarios
로고 중복/캐시/최대개수/시간 제한·취소. 잠금화면 우선순위·null 점수·종료15분·캐시3시간. 샘플 상태별 두 크기.
## Parallel Work Breakdown
단일 세션 순차: 기반/로고 → 잠금화면 → 검증 → PR. Owned: iOS 위젯·공유 모델·테스트 및 관련 문서. Forbidden: API/Web/Android/설정/Live Activity/푸시/머지.
## Acceptance Criteria
- [ ] 요청 범위 구현 및 좁은 검증 통과
- [ ] 신규 고정 샘플과 실제 WidgetKit·alpha 결과를 구분, 차단은 PR 확인 필요
- [ ] 디자인은 사용자 지정 #2554 캡처와 인수인계의 단색 텍스트 규칙 사용(디자인 재선택 불필요)
## Tech Debt Resolved
앱만 로고를 받던 제한 제거, 홈/잠금화면 종료/캐시 판정 공유.
## Security Notes
인증 없는 로고 요청, HTTPS/리디렉션 제한, 크기·개수·시간 제한, 세션 바뀌면 캐시 쓰기 거절. 비밀값 출력 금지.
## Risks & Dependencies
실제 인증 주입 경로 미전달. alpha 실거래·실기기·프로비저닝 미확인. 이미지 시안의 Live Activity 카드와 PR-B WidgetKit 액세서리를 혼동하지 않음.
## Ambiguity Log
#2554 잠금화면 PNG에는 컬러 Live Activity 카드도 섞여 있으나 인수인계 §5의 WidgetKit 단색·텍스트·동일 크기 명시를 우선.
## Progress Snapshot
구현 완료, 검증/PR 진행 중. Alpha 앱+확장 unsigned test PASS: 기존 WidgetTests 10 + 신규 WidgetFollowupTests 3 = 13/13. 고정 샘플 7상태의 잠금화면 14/14 뷰 캡처·육안 확인. Production unsigned 앱+확장 빌드 PASS. PR-C/D 제외.

현재 worktree /private/tmp/teameet-ios-widget-pr-b, branch codex/ios-widget-pr-b. 원본 iOS/Android worktree 변경하지 않음. 모델/예시의 로고 URL은 nil이며 샘플 첫 글자 표시는 실제 다운로드 결과가 아님. 실제 alpha 토큰 주입·WidgetKit 호스트 네트워크 검증은 여전히 미확인.
