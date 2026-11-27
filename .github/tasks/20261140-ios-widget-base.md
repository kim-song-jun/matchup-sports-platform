# Task 20261140: iOS 홈 위젯 PR-A

Status: In Progress
Owner: Codex (단일 세션)
Created: 2026-11-27

## Context
인수인계 `~/Downloads/codex-아이폰-위젯-인수인계.md` §8 PR-A. 시작 HEAD b7accfe5d = fetch 후 origin/dev. 전용 codex/ios-widget-base worktree는 clean. Android 작업 공간은 접근/수정하지 않고 PR #2556의 ceabeab0 소스만 git show로 참조.

## Goal
서명 없이 앱+홈 위젯을 함께 빌드하고 상태별 증거와 함께 dev 대상 한국어 PR 제출(머지는 사용자).

## Original Conditions
- [ ] XcodeGen 확장 타깃, 환경별 App Group/entitlements/프로파일
- [ ] 공용 모델·포맷터·화면 우선순위와 Android 동일 테스트 값
- [ ] WK 쿠키 기반 토큰 발급/폐기, API·캐시·원형 로고
- [ ] systemMedium/systemSmall: 경기/하프타임/정지/종료/응답/일정/없음
- [ ] iOS 17 참석·불참 App Intent, iOS 16 앱 이동
- [ ] 단위 테스트, unsigned simulator 빌드, 상태별 캡처
- [ ] 한국어 dev PR, 확인 필요 명시. 잠금화면·Live Activity·서버 푸시 제외

## User Scenarios
로그인 → 토큰 공유 → 위젯. 위젯 참석/불참 → API 저장 → 다시 조회. 로그아웃/계정 전환 → 이전 정보 삭제. 네트워크 실패 → 지연 표시, 3시간 후 정보 숨김.

## Test Scenarios
Happy: Android format/plan/model 15개 동일 값, API envelope와 attendance body.
Edge: KST 날짜, 일시정지 차감, null 점수/이름, 정원 미상, 서로 다른 날 후속 일정.
Error: 401 삭제, 네트워크 오류, 저장 실패, 로그아웃 중 응답, 계정 전환, 캐시 만료.
Mock: 비밀값 없는 고정 응답만 테스트/시각 검증에 사용. 실제 alpha 검증과 구별.

## Parallel Work Breakdown
병렬 에이전트 없음. Owned: apps/v1_ios, scripts/ios 위젯 관련, 이 task와 기능 시나리오. Forbidden: Android, API/Web 계약, main/merge, 다른 WIP.
순차 Phase 1 계약/기반 → Phase 2 앱/위젯 → Phase 3 테스트/빌드/캡처 → Phase 4 PR/리뷰.

## Acceptance Criteria
- [ ] 원본 조건 모두 검증 또는 외부 차단을 PR 확인 필요에 명시
- [ ] 실패가 성공처럼 표시되지 않음, 비밀값 없음, diff 범위 확인
- [ ] 지정 #2554 시안 사용(사용자가 확정 디자인을 지정해 신규 A/B/C 선택 불필요)

## Tech Debt Resolved
위젯 신규 기능 범위. 생성 Xcode project는 커밋하지 않음.

## Security Notes
환경 격리, 쿠키 scope/HTTPS, 토큰/쿠키 로그 금지. 세션 변경 후 늦은 응답 저장 차단. 로고 제한 및 원격 렌더 금지.

## Risks & Dependencies
Apple App Group/App ID/배포 프로파일 관리자 승인 미확인. 서명 검증 범위 밖.
실제 토큰 주입 도구 미전달: 사용자에게 저장소 밖 파일 경로 요청. 실제 API 참석 저장 검증은 도구 수신 전 중단.

## Ambiguity Log
| 날짜 | 항목 | 상태 |
|---|---|---|
| 2026-11-27 | 시작 경로가 main인 것과 인수인계 불일치 | 전용 worktree 확인, 그 경로만 사용 |
| 2026-11-27 | inject.sh 없음 | 전달 요청, 비밀값 요구/출력 안 함 |

## Progress Snapshot
Phase 1/2 구현, Phase 3 검증 중. Alpha 앱+확장 unsigned compile 및 WidgetTests 8/8 PASS. iPhone 17 Pro iOS 26.2 전용 시뮬레이터에서 고정 샘플 7상태×2크기=14개 뷰 캡처/육안 확인. 실제 WidgetKit 호스트/갤러리·실제 alpha API/참석 저장 PASS를 뜻하지 않음. Production unsigned 앱+확장 빌드 PASS. Draft PR #2559 (base dev) 생성.

규칙 감사: AGENTS.md 504줄/50,852바이트, CLAUDE.md 604줄/51,582바이트를 구간별 끝까지 재확인. 두 규칙 문서·Codex 설정·신뢰 등록은 변경하지 않음. 사용자 확정 디자인/머지 금지 지시 우선. 자동 AGENTS byte cap은 도구 직접 읽기로 보완.

시뮬레이터 UDID: 6F68E52F-23C1-4040-8C1E-B372EE92B28B (이번 세션 생성). 빌드/테스트 로그: /private/tmp/teameet-widget-{test,production}.log. raw 샘플 캡처: output/playwright/visual-audit/ios-widget-base/.

남은 확인: inject.sh 또는 비밀값을 출력하지 않는 실제 인증 주입 경로, 실제 위젯 갤러리와 App Group 런타임, 참석/불참 실저장, iOS16/17 및 Dynamic Type/VoiceOver, Apple 계정 관리자 프로비저닝 확인. 확인 전 Draft PR로 검토 가능하게 공유하며 완료/merge-ready로 표시하지 않음.
