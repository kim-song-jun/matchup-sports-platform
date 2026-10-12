# Task 20261074: Android 웹 앱 안내 및 플랫폼별 스토어 연결

Status: Review — implementation validated; alpha deployment pending
**Owner**: Codex
**Created**: 2026-10-12

## Context
기존 앱 안내 시트는 iPhone만 허용하고 Android Chrome을 제외했다.

## Goal
iPhone과 Android 웹에서 기존 안내 시트를 표시하고 각 OS의 공식 스토어로 연결한다.

## Original Conditions
- [x] Android에도 기존 안내 시트를 제공한다.
- [x] iOS: https://apps.apple.com/kr/app/id6809736050
- [x] Android: https://play.google.com/store/apps/details?id=kr.co.teameet

## User Scenarios
iPhone 또는 Android 브라우저로 일반 화면을 방문하면 1.5초 후 안내가 표시된다. 앱으로 열기를 누르면 OS에 맞는 스토어로 이동한다. 웹으로 계속 보기를 누르면 같은 세션에서 다시 표시되지 않는다.

## Test Scenarios
- [x] iPhone Safari / Android Chrome의 지연 표시와 실제 링크 href
- [x] 양쪽 네이티브 셸 및 데스크톱 제외
- [x] 인증·운영 경로 제외와 세션 내 닫힘 유지
- [x] 스토어 링크 클릭 후 시트 닫힘
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

- `node node_modules/vitest/vitest.mjs run src/components/app-promotion/open-in-app-sheet.test.tsx --maxWorkers=1 --no-file-parallelism`: 16/16 통과.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: 종료 코드 0.
- `git diff --check`: 통과. 삭제한 `isIosMobileUserAgent` 참조 및 touched path 부채 marker 없음.
- Windows에서 기존 공유 의존성이 실행 불가능하여 작업트리 안에 웹 의존성을 frozen lockfile / ignore-scripts로 설치했다. 기존 공유 파일 및 의존성은 수정하지 않았다.
- 실제 브라우저 alpha QA 및 휴대폰 검증은 미실행: 변경은 아직 미커밋·미배포 상태다. UI 구조 및 스타일 변경은 없고 Android 표시 조건과 링크만 추가했다.
- 로컬 서버/브라우저는 실행하지 않았다. 단위 테스트와 타입 검사 프로세스 종료 확인.
