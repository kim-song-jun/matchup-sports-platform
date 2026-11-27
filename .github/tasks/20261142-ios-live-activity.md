# Task 20261142: PR-C Live Activity
Status: PR #2565 open; review pending

## Context
사용자 요청: PR-C는 PR-B 브랜치에서 분기, PR-D는 PR-C에서 분기. PR base는 직전 브랜치. PR 본문 첫 줄에 선행 PR 머지 조건 명시. 머지는 사용자만.
## Goal
ActivityKit iOS16.2+ 잠금화면 카드와 Dynamic Island compact/minimal/expanded, 앱 로컬 시작·갱신·종료, unsigned 앱+확장 빌드·샘플 증거·단위 테스트.
## Original Conditions
- [x] origin/codex/ios-widget-pr-b ba552eb2f에서 codex/ios-widget-pr-c 생성
- [x] PR base codex/ios-widget-pr-b, 본문 첫 줄: PR-B 머지 후 머지
- [x] ActivityAttributes 공유, WidgetBundle ActivityConfiguration, Live Activity 지원 plist
- [x] 잠금화면 카드, 아일랜드 compact/minimal/expanded. 중앙 카메라 영역 사용 금지, 펼침 중앙 점수/아래 구간, 팀명2줄. 진행 막대 없음
- [x] API period 경과/일시정지/하프타임, null 점수/이름 공개 규칙, 로컬 팀 마크
- [x] 시작·갱신·종료·로그아웃/계정 전환 및 캐시 만료 처리
- [x] iOS16.0~16.1은 기존 홈/잠금화면 위젯 유지, ActivityKit은16.2+ 가드
- [x] PR-D APNs push token 등록/서버 전송은 이번 제외
## User Scenarios
경기 상태를 잠금화면과 아일랜드에서 본다. 앱이 다시 활성화되면 API로 갱신하고 로그아웃하면 표시를 종료한다. 백그라운드 갱신은 OS 허용 범위로 제한되며 실제 실시간 push는 PR-D다.
## Test Scenarios
활동 선택·상태 전이·null 점수·일시정지 차감·종료·세션 변경·중복 방지·최소OS 가드. 단위/unsigned 빌드/샘플 캡처와 실제 alpha/ActivityKit 호스트를 구분.
## Parallel Work Breakdown
단일 세션. Owned apps/v1_ios 및 이 task와 관련 시나리오. Forbidden Android/API/Web/Codex 권한·신뢰 설정/푸시/머지.
## Acceptance Criteria
- [x] 시작 조건과 다중 경기 정책 확정 후 그 정책에 맞춰 구현
- [x] 빌드·관련 테스트·카드/아일랜드 상태별 샘플 검증, 외부 차단 PR 확인 필요
## Tech Debt Resolved
범위 안 중복 정책을 공유. 푸시 미연동을 실시간 성공처럼 표시하지 않음.
## Security Notes
사용자 설정으로 Live Activity가 꺼진 상태 존중. 토큰/쿠키를 ActivityAttributes에 포함하지 않음. 잠금화면 개인정보와 세션 종료 반영.
## Risks & Dependencies
실제 인증 주입 경로 및 실기기/Apple 서명 미확인. Background App Refresh는 OS 재량, 주기 보장 금지.
## Ambiguity Log
- 사용자 확정: 포그라운드에서 자동 시작, 서버 live 첫 경기 하나, 선택 UI 없음. 사용자가 닫은 경기 ID는 다시 시작하지 않음.
- 종료 시각: 앱이 최초 ENDED를 확인한 시각을 경기 ID별로 영속 저장, 15분 후 dismissalPolicy 범위에서 정리. 재실행해도 15분 연장 금지.
- 원격 시작 iOS17.2+는 PR-D에서 별도 논의, 이번 pushType=nil.
## Progress Snapshot
PR-C 전용 /private/tmp/teameet-ios-widget-pr-c, base origin/codex/ios-widget-pr-b ba552eb2f(재확인 동일). 위젯·활동 정책 단위17/17 PASS 및 최종 정책5/5 재확인 PASS. 실제 ActivityKit 합성 데이터 UI1/1 PASS(시작/갱신/종료 후15분 유지요청/즉시정리). Alpha 앱+확장 unsigned 컴파일 PASS, Production 앱+확장 unsigned 빌드 PASS. 실제 시스템 compact/expanded와 잠금화면 stale 표시 확인, 고정7상태 샘플 재캡처. 초기 실패는 로그 확인 후 전용 기기 재시작·대기와 타이머 폭/구간 레이블 압축을 수정했고 최종 UI PASS.

OS 실시간 현황 권한은 사용자 `허용해` 승인 후 작업 전용 UDID에서만 허용. Codex 설정 변경 없음. 실제 alpha API 검증은 인증 경로 미전달로 보류(샘플 결과와 구분). 실제 최소OS/실기기·접근성·15분 경과 관찰 및 계정 전환/swipe 재실행은 확인 필요. 샘플 생성 카드는 테스트에서 종료. PR-D 미착수, 후속 분기는 PR-C에서만. 직접 머지하지 않음.

PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2565 (base codex/ios-widget-pr-b, 일반 PR). 종료 후 최종 카드 닫기도 추적을 유지하여 같은 ID 재시작 금지. 앱의 기존 WidgetSessionCoordinator가 먼저 ENDED를 받은 경우에도 로고 IO 전 최초 관찰시각을 기록한다.

## PR 및 증거 커서
- PR [#2565](https://github.com/kim-song-jun/matchup-sports-platform/pull/2565), base codex/ios-widget-pr-b, draft=false.
- [화면 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2565#issuecomment-7212995159): SHA 2b7fb1acd 고정 raw10/10 HTTP200. 실제 시스템 compact/expanded/잠금화면 stale3장 + 고정 상태7장. PNG는 후속 커밋에서 트리에서 제거, URL 유지. 화면 코드 변경 없음.
- 종료 카드도 tracked.finalized로 닫기를 계속 관찰한다. JSON 재실행 후 최종 카드 닫기 차단 회귀 테스트 추가. WidgetSessionCoordinator의 선행 API 관찰도 로고 다운로드 전 기록.
