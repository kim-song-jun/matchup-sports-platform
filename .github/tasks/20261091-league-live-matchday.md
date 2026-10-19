# 정규 리그 LIVE 경기 당일 표시

Status: Review — 구현·로컬 검증 통과, dev PR·CI·alpha QA 후속

## Context
정규 리그의 시즌 상태가 in_progress이면 경기 없는 날에도 상세의 LIVE 안내가 계속 표시된다.

## Goal
한국 시간 기준 경기 당일에만 LIVE · 진행 중인 리그 보기를 표시한다.

## Original Conditions
- [x] 정규 리그의 실제 leagueFixtures.startAt을 기준으로 오늘 경기를 확인한다.
- [x] 취소된 경기와 날짜 미정/잘못된 날짜는 제외한다.
- [x] 경기 없는 날에는 일정 보기로 같은 목적지 진입을 유지한다.
- [x] 모바일·데스크톱을 함께 수정하고 자정/탭 복귀 시 갱신한다.
- [x] 후속 사용자 확정: 정규 리그의 진행 중 배지를 시즌 진행 중으로 변경한다. 일반 대회·개별 경기의 진행 중 문구는 유지한다.

## User Scenarios
경기 당일에는 기존 LIVE 진입, 다른 날에는 중립 일정 진입을 제공한다. 시즌 상태 자체는 변경하지 않는다.

## Test Scenarios
KST 자정 양쪽 경계, 빈/잘못된 일정, 팀매치/게임 취소, 열린 화면의 날짜 전환과 타이머 정리, 일반 대회 문구 및 기존 공개 참가 상태 회귀를 확인한다. Inline fixture를 당일 경기로 맞춘다.

## Parallel Work Breakdown
단일 에이전트 순차 작업: 상세 노출 로직 → 회귀 테스트 → 검증 및 기록. Backend/Infra 변경 없음.
Owned: tournament-detail-client.tsx 및 관련 CTA/client 테스트, tournament-card.tsx, 공용 v1-status-labels.ts/v1-tournament-status.ts 및 관련 소비처 테스트, 이 문서, changeset.
Forbidden: 기존 공유 작업트리 WIP, API/DB, 다른 태스크 문서.

## Acceptance Criteria
- [x] 경기 없는 날 LIVE 문구/배지가 없다. 일정·순위 진입은 유지된다.
- [x] 한국 경기 당일에는 기존 LIVE 문구/배지를 제공한다.
- [x] 일반 대회의 상태별 CTA는 유지한다.
- [x] 좁은 회귀 테스트 128/128 통과.
- [ ] alpha 배포 후 390/768/1440 화면 및 console/network 확인.

## Tech Debt Resolved
시즌 진행 상태를 당일 경기 신호로 사용하는 오류를 제거한다. 날짜 판정은 기존 KST 유틸을 재사용한다.

## Security Notes
새 API/권한/입력/시크릿 변경 없음. 공개 응답의 일정만 사용한다.

## Risks & Dependencies
alpha에 수정본이 배포되기 전 실제 변경 후 QA는 수행할 수 없다. 기존 메인 작업트리가 origin/dev보다 뒤처져 있어 fetch 후 별도 _worktrees/league-live-matchday에서 작업한다.

## Ambiguity Log
사용자가 요청한 노출 조건 로직 변경으로 범위를 한정한다. 당일 종료된 경기라도 해당 날짜에는 안내가 유지되며, 취소된 경기만 있는 날에는 표시하지 않는다.

## Progress Snapshot
- 최신 origin/dev fd5495989 기준 fix/league-live-matchday.
- 상세 CTA/client 2파일 회귀 128/128 PASS(단일 worker). KST 날짜 양쪽 경계·취소·빈/잘못된 일정·자정 자동 갱신·타이머 해제·공개 참가 상태 포함.
- git diff --check PASS, touched-path TODO/FIXME/HACK/XXX 없음. 새 runtime import는 기존 추적 파일 kst-calendar.ts만 사용한다.
- TypeScript tsc --noEmit PASS. pnpm lint의 뒤 단계 패턴 검사는 Windows 기본 find/grep 환경 때문에 실패했고, Git usr/bin을 현재 프로세스 PATH에 앞세워 같은 node scripts/v1-pattern-check.mjs를 실행해 PASS했다. 전체 타입 검사는 반복하지 않았다.
- 테스트에는 비동기 상세 보조 조회 관련 act 경고가 남아 있다.
- 실제 alpha 변경 후 QA 0/3: 미커밋·미배포 상태라 변경 후 스크린샷/console/network 증거는 없음. 로컬 next 서버는 실행하지 않았다. DB/Docker는 필요하지 않았고 daemon은 미실행 상태다.
- 기존 작업트리 미커밋 변경은 보존했다. 소유한 상주 서버/브라우저 프로세스 없음.
- 후속 상태 문구: 목록·상세는 정규 리그 kind로 구분하며 공용 leagueStateLabel을 재사용한다. 내 리그/순위/경기 상세와 관리자 공용 리그 상태 알약도 같은 문구를 따른다. DB 상태/필터/전이 및 LIVE 버튼 문구는 그대로다.
- 후속 검증: 관련 8파일 349/349 PASS(단일 worker, 20.67초). 실제 목록 카드의 보이는 배지·접근성 이름, 상세 배지, 일반/리그 방식 대회 대조군, 개별 경기 진행 상태 유지, 공용 칩/순위표/경기 상세/관리자 알약 회귀 포함. git diff --check PASS, touched-path 신규 debt marker 없음. 기존 상세 보조 조회 act 경고는 남아 있다.
- 후속 변경도 미배포이며 alpha 변경 후 QA 0/3은 유지한다. 이번은 문구와 옵션 전달 변경으로 전체 타입/빌드 검사를 반복하지 않았다.
- PR 요청에 따른 커밋 직전 최종 pnpm --filter v1_web lint PASS(tsc --noEmit + 패턴 검사, Git usr/bin을 프로세스 PATH에 추가). 영향 테스트 349/349의 같은 트리에서 문서만 보완했다. PR은 dev 대상으로 생성하며 이번 요청에 머지/배포는 포함하지 않는다.
