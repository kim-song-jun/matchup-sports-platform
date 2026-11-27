# PR-C Live Activity 검증

Task: [20261142](../../.github/tasks/20261142-ios-live-activity.md). Stacked base: codex/ios-widget-pr-b. PR-D는 이 PR-C 브랜치에서 분기하며 별도 구현.

## 사용자 확정 계약
- 경기 중 앱 포그라운드 → 서버 live 첫 경기 하나만 자동 시작. 선택 UI/원격 시작 없음, pushType=nil.
- 사용자가 닫은 경기 ID를 로컬 ledger에 영속 보존. 활동 state stream과 재실행 시 사라진 ID 대조로 같은 경기 재시작 차단. OS가 없앤 활동도 보수적으로 같은 처리.
- 최초 ENDED 확인 API 응답 수신 시각을 경기 ID별 영속 보존. 종료 content와 고정 최초시각+15분 dismissalPolicy.after 전달. 재실행해도 연장 안 함. 만료 후 immediate 정리. ActivityKit end 호출로 아일랜드는 종료되고, 최종 점수 잠금화면 카드는 시스템이 허용하는 범위에서 15분 유지(조기 제거·사용자 닫기 가능).
- 포그라운드 30초 재조회, 백그라운드 전환 때 허용된 시간에 기존 카드 1회 갱신만. 사용자 설정 비활성/로그아웃/계정 변경 시 정리. 갱신 실패는 기존 콘텐츠를 fresh로 위장하지 않고 60초 staleDate로 지연 표시. 앱 종료 중 득점 푸시는 PR-D.
- bounded public payload (<4KB): 팀/점수/구간/로고 파일 key만, 토큰/쿠키/득점자·계정 식별자 없음. 앱과 확장 공유 ActivityAttributes, iOS16.2+ 가드. 최소 iOS16.0~16.1 기존 위젯 유지.

## 실행 증거
- Alpha unsigned 앱+확장 컴파일 및 관련 단위 테스트 17/17 PASS, 최종 정책 변경 후 정책5/5 재확인 PASS. dismissal ledger JSON 재실행, ID별 최초 종료시각 고정, 첫 경기만 선택, 숨겨진 점수/멈춘 시계/4KB 제한 검증.
- Production unsigned 앱+확장 빌드 PASS.
- XCTest LiveActivityUITests: 실제 Simulator ActivityKit.request/update/end 사용. 합성 샘플로 생성·갱신·15분 종료화면 유지요청·즉시종료1/1 PASS. 고정 텍스트 존재만 검사하는 테스트가 아니며 OS 명령의 실제 대상을 ID로 찾아야 결과가 성공이 된다.
- 전용 iPhone17 Pro iOS26.2, UDID 6F68E52F-23C1-4040-8C1E-B372EE92B28B. 시스템 compact/expanded XCTest 첨부 및 CUA 실제 잠금화면 stale 표시·권한 허용 후 갱신·샘플 종료 확인. 시스템 권한은 사용자 명시 승인 후 이 기기에서만 허용.
- 샘플 갤러리: live/halftime/paused/ended/penalties/hidden/stale, DEBUG --live-activity-preview 인자. 샘플 팀 로고 URL nil → 이니셜은 의도된 예시. 실제 API·원격 이미지 검증 아님. 신규 화면으로 before baseline 없음; #2554 시안 대조.
- raw output/playwright/visual-audit/ios-widget-pr-c/. 로그 /private/tmp/teameet-widget-pr-c-{test,ui,production}.log. 시뮬레이터 외 서버/DB mutation·푸시 없음.

## 확인 필요
- [ ] 미전달 inject.sh/비밀값 비노출 인증 경로로 실제 alpha 로그인→자동 시작/세션 종료 검증
- [ ] 실제 경기 로그아웃/계정 전환·사용자 swipe 후 재실행 확인 (정책은 unit으로, OS는 샘플로 검증)
- [ ] 실제 최소 iOS16.2/실기기/서명·접근성·Dynamic Type 및 시스템 minimal 레이아웃
- [ ] 15분 실시간 대기 관찰 (고정 deadline unit·시스템 after(15분) 수락은 검증, wall-clock15분 경과는 미관찰)
- [ ] 앱이 죽어 있는 동안 갱신·원격 시작: PR-D 논의/구현

샘플 UI, 실제 ActivityKit 합성 데이터 테스트, 실제 alpha API 검증을 구분한다. 프리뷰 확장 아일랜드는 시스템 region의 근사 갤러리이므로 실제 시스템 첨부가 우선이다. 테스트 샘플 카드는 종료하고 전용 기기만 종료한다.

## 화면 판정
- iPhone17 Pro 402×874pt(1206×2622px): 카드/확장 팀명·중앙 점수·구간 타이머 겹침 없음. compact 점수·시계, minimal 샘플 점수 확인. 실제 minimal은 미검증.
- 타이머는 시스템 Text(timer)의 늘어나는 폭을 제한했고 구간 레이블은 압축하지 않음. 팀명 두 줄, 일시정지/하프타임/지연은 의미색, 숨김 점수는 대시.
- 신규 네이티브 화면이라 before 구현 없음. #2554 시안과 대조. 작은 화면/큰 화면 및 light/dark 전체 기기 매트릭스는 미완료이며 샘플 한 기기 검증으로 대체 완료 판정하지 않음.

## PR 및 증거 커서
- PR [#2565](https://github.com/kim-song-jun/matchup-sports-platform/pull/2565), base codex/ios-widget-pr-b, draft=false.
- [화면 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2565#issuecomment-7212995159): SHA 2b7fb1acd 고정 raw10/10 HTTP200. 실제 시스템 compact/expanded/잠금화면 stale3장 + 고정 상태7장. PNG는 후속 커밋에서 트리에서 제거, URL 유지. 화면 코드 변경 없음.
- 종료 카드도 tracked.finalized로 닫기를 계속 관찰한다. JSON 재실행 후 최종 카드 닫기 차단 회귀 테스트 추가. WidgetSessionCoordinator의 선행 API 관찰도 로고 다운로드 전 기록.

Cleanup: 실제 ActivityKit UI 테스트의 end/immediate 정리 확인, 고정 갤러리 앱 종료 및 위 전용 UDID shutdown 완료. 다른 시뮬레이터/Android/서버·DB 상태 변경 없음.
