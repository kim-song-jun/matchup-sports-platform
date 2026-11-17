# Task 20261074: Android 웹 앱 안내 및 플랫폼별 스토어 연결

Status: Review — mobile banner correction; Alpha visual QA pending
**Owner**: Codex
**Created**: 2026-10-12

## Context
기존 앱 안내 시트는 iPhone만 허용하고 Android Chrome을 제외했다. 이후 MD-QA #223 결정으로 큰 바텀시트는 위쪽 얇은 배너(`open-in-app-banner.tsx`)로 바뀌었고, 두 OS 지원과 스토어 링크 계약은 그대로 이어진다.

## Goal
iPhone과 Android 웹에서 앱 안내를 표시하고 각 OS의 공식 스토어로 연결한다.

## Original Conditions
- [x] Android에도 앱 안내를 제공한다.
- [x] iOS: https://apps.apple.com/kr/app/id6809736050
- [x] Android: https://play.google.com/store/apps/details?id=kr.co.teameet

## User Scenarios
iPhone 또는 Android 브라우저로 일반 화면을 방문하면 화면 맨 위에 얇은 배너가 바로 표시된다. 앱으로 열기를 누르면 OS에 맞는 스토어로 이동한다. 닫기나 앱으로 열기를 누르면 7일 동안(localStorage) 다시 표시되지 않는다.

## Test Scenarios
- [x] iPhone Safari / Android Chrome의 즉시 표시와 실제 링크 href
- [x] 양쪽 네이티브 셸 및 데스크톱 제외
- [x] 인증·운영 경로 제외와 7일 닫힘 유지
- [x] 스토어 링크 클릭 후 배너 닫힘
- API 및 fixture 변경 없음

## Parallel Work Breakdown
단일 에이전트, 순차 구현. Owned: app-store-links.ts, app-promotion/*, 본 문서, changeset. 다른 세션 파일은 수정하지 않는다.

## Acceptance Criteria
- [x] 플랫폼별 표시 및 스토어 링크 구현
- [x] 관련 단위 테스트 통과
- [ ] alpha 실제 브라우저 검증

## Tech Debt Resolved
iOS 전용 감지 및 Android 미표시를 기대하던 테스트를 양 플랫폼 계약으로 변경한다.

## Security Notes
스토어 링크는 고정 HTTPS 상수다. 네이티브 앱 내부 표시 제외와 기존 인증·운영 경로 제외를 유지한다.

## Risks & Dependencies
dev 배포 전 alpha에는 변경이 반영되지 않는다. 링크는 스토어 이동이며 설치 앱 직접 실행을 보장하지 않는다.

## Ambiguity Log
사용자가 기존 시트의 Android 확장을 명시했다. 디자인 및 레이아웃은 기존 것을 사용한다.

## Progress Snapshot
최신 origin/dev(37a06cea0) 기반 fix/android-app-promotion 작업트리에서 구현했다.

- `node node_modules/vitest/vitest.mjs run src/components/app-promotion/open-in-app-banner.test.tsx --maxWorkers=1 --no-file-parallelism`: 28/28 통과(배너 전환 뒤 기준).
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: 종료 코드 0.
- `git diff --check`: 통과. 삭제한 `isIosMobileUserAgent` 참조 및 touched path 부채 marker 없음.
- Windows에서 기존 공유 의존성이 실행 불가능하여 작업트리 안에 웹 의존성을 frozen lockfile / ignore-scripts로 설치했다. 기존 공유 파일 및 의존성은 수정하지 않았다.
- 실제 브라우저 alpha QA 및 휴대폰 검증은 미실행: 변경은 아직 미커밋·미배포 상태다. UI 구조 및 스타일 변경은 없고 Android 표시 조건과 링크만 추가했다.
- 로컬 서버/브라우저는 실행하지 않았다. 단위 테스트와 타입 검사 프로세스 종료 확인.

## 2026-11-17 — 모바일 상단 배너 겹침 수정 (사용자 선택 A)

Status: In Progress

- 신고 화면: `/tournaments/5fa78e0e-4708-4518-a9f5-9ba2dcd737ec?from=%2Ftournaments%3Fkind%3Dtournament`.
- UI 선행 조건: A(배너 유지·공간 계산 수정)/B(대회 상세만 숨김)/C(모바일 상단 배너 전체 제거)를 제시했고 사용자가 A를 선택했다.
- Context: 상단바 기준56px과 44px 버튼+상하8px+border의 실제 최소61px이 어긋나 배너가 top5px/본문padding64px에 의존한다. 배너도56px 고정 높이라 글자·버튼 크기 변화에 대응하지 못한다. 실제 사용자 viewport/스크린샷은 아직 제공되지 않아 코드의 높이 불일치를 우선 수정한다.
- Goal: 공유 배너·스토어 링크·7일 닫기·네이티브/인증/운영/채팅 제외를 유지하면서 헤더·배너·본문의 높이를 일치시킨다.
- Owned: `apps/v1_web/src/components/app-promotion/open-in-app-banner.{tsx,css}`, 해당 spec, `apps/v1_web/src/app/globals.css`, 이 task와 patch Changeset. Forbidden: 대회/API/DB/스토어 URL 변경, 다른 세션 WIP, main/production 배포. 단일 에이전트 순차 작업.
- Implementation: 상단바 버튼이56px 안에 들어가도록 세로padding4px 사용; 배너의 절대top5px/고정height56px 제거; 실제 배너 높이를 측정해 스크롤 본문 여백으로 반영한다. 기본값56px은 측정 전/미지원 브라우저의 최초 배치값이다.
- Test scenarios: 기존 배너 노출/링크/닫기 회귀, 배너 측정값의 본문 여백 반영·리사이즈·닫기/제외경로 전환 시 제거; 실제 390/768/1440 화면은 Alpha에서 겹침·스크롤·console/network를 확인해야 한다.
- Acceptance: [x] 좁은 회귀31개 통과 [x] TypeScript 검사 [x] 스타일 패턴 검사 [ ] dev PR CI/리뷰 [ ] Alpha 3폭 전후 브라우저 검증.
- Security: 인증/권한/데이터 변경 없음. 새 이벤트/개인정보 수집 없음.
- Risks/dependencies: 현재 세션에는 ego-browser 스킬/도구가 없어 실제 브라우저 검증이 막혀 있다. 단위 테스트로 화면 검증을 대체하지 않는다.
- Ambiguity: A안 선택은 배너 유지 권한이며 B/C 제거로 확대하지 않는다.
- Progress: 최신 dev `2f77a3c9a` 격리 worktree에서 구현. 배너 spec31/31 PASS(기존28+실측공간 동기화3), TypeScript PASS. CSS/layout 실화면은 미검증이며 테스트를 시각검증으로 표시하지 않는다. 로컬 Next/브라우저를 실행하지 않았다. 실제 원격 배포·화면 PASS는 아직 주장하지 않는다.
