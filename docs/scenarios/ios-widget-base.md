# iOS 홈 위젯 PR-A 검증

작업: [Task 20261140](../../.github/tasks/20261140-ios-widget-base.md). 범위: 홈 systemMedium/systemSmall만. Android PR #2556 head ceabeab0 read-only 참고, 브랜치 합치지 않음.

## 실행 증거
- Alpha: xcodebuild test, TeameetAlpha, CODE_SIGNING_ALLOWED=NO, jobs=1, parallel-testing=NO, only-testing:TeameetTests/WidgetTests. 앱과 확장 함께 컴파일, 8/8 PASS.
- 모델/시간/KST/득점/우선순위/다른 날 일정/null 점수/캐시 만료/로그아웃 늦은 쓰기 거절을 실제 Swift 함수로 검증.
- 시뮬레이터: iPhone 17 Pro, iOS 26.2, 402×874pt (1206×2622 PNG). 전용 UDID 6F68E52F-23C1-4040-8C1E-B372EE92B28B.
- 고정 샘플: live, halftime, paused, ended, pending, schedule, empty. 7/7 캡처, 중간/정사각형 14/14 뷰 육안 확인. 점수/원형 이니셜/팀명/득점 띠·정지/휴식 텍스트·응답 버튼과 게이지 확인. 신규 위젯이라 before 런타임 없음; #2554 시안 대조.
- 샘플은 DEBUG launch argument --widget-preview <state>로만 표시. 네트워크/토큰·서버 저장 증거 아님. 샘플 버튼은 유효 세션 revision이 없어 실제 참석 저장 불가.
- raw 캡처: output/playwright/visual-audit/ios-widget-base/*.png. PR SHA 고정 갤러리로 공유.

## 실제 alpha API 및 플랫폼: 확인 필요
- [ ] 사용자 제공 inject.sh 또는 비밀값 비노출 인증 주입 경로
- [ ] 앱 실제 로그인 → 토큰 발급 → App Group → 홈 화면 위젯 갤러리
- [ ] 참석/불참 → 실제 서버 저장 → widget/home 변화
- [ ] 실제 로그아웃/계정 전환/401 시 이전 위젯 삭제
- [ ] 실제 원격 팀 로고 다운로드·원형 캐시
- [ ] iOS16 탭 이동, iOS17 App Intent 실행, Dynamic Type/VoiceOver
- [ ] Apple App ID/App Group 및 두 환경 배포 프로파일 관리자 승인

샘플 7/7과 실제 alpha API 0/검증대상을 구분한다. 실제 토큰·비밀번호·쿠키는 파일/문서/PR/로그에 포함하지 않는다. 새 대회/경기 또는 DB seed/reset은 실행하지 않았다. 잠금화면·Live Activity·서버 푸시는 제외.
