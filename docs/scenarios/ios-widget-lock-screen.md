# iOS 위젯 PR-A 로고 후속 / PR-B

Task: [20261141](../../.github/tasks/20261141-ios-widget-lock-screen.md). PR-C Live Activity/PR-D 푸시 제외.

## 구현 계약
- HomeProvider.getTimeline: widget/home 새 응답 → WidgetLogos.prefetch → 세션 revision 재확인 → 타임라인. 로고 갱신 도중 로그아웃하면 이전 정보를 출력하지 않음.
- 다운로드: API 우선순위 유지, 중복·캐시·잘못된 URL 제외 후 확장 최대4개. 전체 배치8초 제한과 URLSession 취소, 개별 요청/리소스8초, 최대512KB, 원형128px 저장. 앱도 같은 전체8초 예산 사용(최대20개). 로고 실패는 API/참석 성공으로 위장하지 않고 기존 이니셜 표시 유지.
- WidgetBundle: 기존 TeameetHome + 새 TeameetLock. 새 family는 accessoryRectangular/accessoryInline만. 흑백 텍스트, 채움·칩·진행 막대·원형 위젯 없음. 같은 우선순위/경과/종료15분/캐시3시간. 탭은 앱의 /my/schedule.

## 검증 결과
- Alpha unsigned 앱+확장 동반 컴파일 및 테스트 13/13 PASS (기존10+신규3). 신규 테스트는 로고 선택·개수·중복·캐시, 실제 async 시간 초과 취소, 잠금화면 우선순위/null 점수/종료 경계.
- iPhone17 Pro iOS26.2 402×874pt (1206×2622png), 이번 세션 소유 UDID 6F68E52F-23C1-4040-8C1E-B372EE92B28B.
- 샘플 live/halftime/paused/ended/pending/schedule/empty: 7/7 화면 캡처·육안 확인. 새 잠금화면 14/14 뷰에 상태 텍스트·점수·동적 시계·일정 표시. 홈14뷰도 같은 샘플에 포함. 신규 잠금화면이라 이전 런타임 baseline 없음; #2554 캡처와 인수인계 단색 지침 대조.
- raw: output/playwright/visual-audit/ios-widget-pr-b/*.png. DEBUG 갤러리는 실제 shipping view를 재사용하지만 시스템 WidgetKit 호스트가 아님. 샘플 로고 URL nil → 이니셜이며 로고 다운로드의 런타임 증거가 아님.
- git diff --check 및 touched path debt marker 점검. 설정/정책 파일 변경 없음.

- Production unsigned 앱+확장 빌드 PASS.

## 확인 필요 (실제 alpha/API와 별도)
- [ ] 비밀값을 출력하지 않는 인증 주입 스크립트/경로: 사용자가 미전달
- [ ] 앱을 종료한 채 실제 홈 위젯 갱신 → 새 상대팀 로고 파일·마크 표시
- [ ] 실제 잠금화면 갤러리 등록·시스템 tint/redaction·탭 이동·갱신
- [ ] 실기기/최소 iOS16 및 VoiceOver/Dynamic Type
- [ ] Apple App Group/서명 프로비저닝

새 대회·경기·DB 변경과 토큰 발급/저장 검증은 실행하지 않음. 샘플 PASS를 실제 API PASS로 보고하지 않음.
