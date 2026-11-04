# Task 20261128: 독립 정규리그 다음 시즌 잇기

Status: In Progress
**Owner**: Claude main
**Created**: 2026-11-03

## Context
리그 신청 화면의 '다음 리그'·'다른 리그' 안내는 리그 체계 안의 다음 시즌만 알았다. 독립 리그(체계 없음)는 다음 시즌을 만들어도 지난 리그와 이어지지 않아, 같이 뛴 팀이 새 리그를 찾아 처음부터 신청하고 명단을 다시 꾸려야 했다. 같은 날 PR #2137(독립 리그 → 리그 체계 전환)이 다른 방향의 '이어 가기'를 열었다.

## Goal
어드민이 독립 리그에서 다음 시즌을 만들어 잇고, 지난 시즌 팀이 그 시즌에 쉽게 재참가하게 한다.

## Original Conditions
- [x] 정규리그 → 정규리그(독립 → 독립)로 이전 시즌을 잇는다. 어드민에서 연결을 만든다(사용자 선택 A안: '다음 시즌 만들기'가 지난 설정을 채운 개설 화면을 열고 자동으로 잇는다).
- [x] 기존 리그 신청 화면의 다음/다른 리그 안내가 이어진 다음 시즌으로 넘어가 신청하게 한다.
- [x] 리그를 했던 팀이 다시 참가한다 — 재참가 버튼, 지난 명단 이어받기, 어드민이 한 번에 넣기, 접수 시작 알림(사용자 선택: 넷 다).
- [x] 리그 체계 전환(#2137)과 둘 중 하나만 한다(사용자 확정 "둘 중 하나만으로 시작해").
- [x] 수정 전에 무엇을 고칠지 알리고 허락을 받는다 — 허락 후 착수. #2137 브랜치를 그대로 가져간다.

## User Scenarios
1. 어드민: 진행 중·종료 독립 리그 → 사후 '다음 시즌 만들기' → 종목·지역·성별·참가비·계좌·명단 인원·정원·경기 수·경기 시간이 채워진 개설 화면 → 기간·마감만 정해 만든다. 이은 뒤 메뉴는 '다음 시즌 보기', '리그 체계로 전환'은 숨는다.
2. 어드민: 다음 시즌 참가팀 관리 → '지난 시즌 팀' 목록에서 골라 한 번에 넣기 → 바로 참가 확정, 지난 명단 이어받음.
3. 팀장: 다음 시즌 접수가 열리면 알림 → 지난 시즌 공개 화면의 '다음 시즌 재참가 신청' → 그 팀이 골라진 신청 화면 → 제출하면 지난 명단이 옮겨져 있다.

## Test Scenarios
- Happy: 다음 시즌 생성·양방향 연결, 재참가 제출·한 번에 넣기의 명단 이전(지난 번호, 떠난 선수 제외), 첫 접수 알림, 공개 nextRound/previousRound/previousSeason — `test/league-matches/league-next-season.integration-spec.ts`.
- Edge: 닫았다 다시 열어도 알림 한 번, 지운 다음 시즌의 연결 풀기, 피리어드 3개 이상은 종목 기본값, 참가비 미설정은 비움.
- Error: 시작 전·체계 소속·다른 종목 지난 리그 422, 두 번째 다음 시즌 409, 전환한 리그 409, 다음 시즌 이은 리그의 전환 409, 지난 시즌에 없던 팀 섞이면 전원 거절 — `league-season-link.spec.ts`, 통합 스펙, 전환 스펙.
- Web: 메뉴 상호 배제, 개설 화면 prefill·payload, 다음 시즌 화면 차단 상태, 지난 시즌 팀 넣기, 안내 링크·문구, 상세 지난 시즌 링크.
- Mock updates: 어드민·공개 서비스 스펙 fake 에 `previousLeagueId`·다음 시즌 조회·전환 기록 조회 추가.

## Parallel Work Breakdown
- Backend: 스키마·마이그레이션, `league-season-link.ts`, 생성·상세·한 번에 넣기·접수 알림, 명단 이전, 제출 훅, 공개 응답, 전환 차단.
- Frontend: 개설 화면 분리(`league-create-wizard.tsx`)·prefill, 다음 시즌 라우트, 사후 메뉴, 지난 시즌 팀 넣기, 다음 리그 안내·상세 링크.
- 순차: 타입 → 화면 → 통합 검증 → 문서.

## Acceptance Criteria
- [x] UI 위치는 A·B·C 안 제시 뒤 사용자가 A안을 골랐다(2026-11-03).
- [x] 한 지난 리그에 다음 시즌 하나, 전환과 상호 배제가 DB 에서 성립한다(유니크 인덱스 + 원본 행 잠금).
- [x] 명단 이전은 행이 한 번도 없던 명단에만, 자동 채움과 같은 자격 판정으로.
- [ ] dev 머지 후 alpha 에서 생성 → 접수 → 재참가 → 한 번에 넣기를 확인한다.

## Tech Debt Resolved
- 리그 개설 화면을 페이지 파일에서 `league-create-wizard.tsx` 로 옮겨 생성·다음 시즌이 같은 화면을 쓴다(복제 없음).
- `loadUserIdsOnOtherTeams` 를 자동 채움과 명단 이전이 같이 쓰도록 뽑았다.

## Security Notes
새 어드민 엔드포인트는 `V1AuthGuard` + mutation admin(owner/ops). 팀 id 는 UUID 1~50개, 지난 시즌 확정 팀만 받는다. 알림 수신자는 서버가 계산한다. 공개 응답의 지난 시즌은 공개 리그만 싣는다.

## Risks & Dependencies
- PR #2137(리그 체계 전환) 커밋을 포함한다 — #2137 이 먼저 머지되면 이 PR 의 차이는 다음 시즌분만 남는다.
- PR #2138·#2140과 통합하면 관리 화면 import, 공유 API 훅 import, 리그 응답 타입 3개 파일에서 충돌한다. 아래 통합 진행 기록을 따른다.
- 마이그레이션 `20261103120000_v1_league_previous_season`(nullable 컬럼 + 유니크 + FK, 되돌리기 쉬움). main 승격 시 migrate deploy 필요.

## Ambiguity Log
- 다음 시즌은 진행 중 리그에서도 미리 만들 수 있다(접수를 시즌 끝 전에 열 수 있게). 전환은 종료 후에만 열리므로, 다음 시즌을 먼저 이으면 전환 메뉴가 사라진다 — 사용자 확정 "둘 중 하나만".
- 옮긴 명단은 `needs_review` 로 들어가고 팀이 제출 전에 확인한다. 지난 시즌 뒤 바뀐 등번호는 고치지 않는다(지난 번호 그대로).

## PR #2144 리뷰 후속 (2026-11-03)
- P2: 확정 등록은 일반 팀원에게도 조회되므로, 모바일 CTA와 데스크톱 레일이 같은 훅으로 현재 팀 역할(owner·manager)을 확인한다. 일반 팀원·다른 팀 운영자·조회 중·조회 실패에는 특정 팀 재참가를 안내하지 않는다.
- P1: 현재 스키마 SHA256 `b0c1313b36e6a93e0f84a56a17e7950826bbd5f38b284f22eb72fb3570292960`를 API 이미지·런타임 attestation·manifest 생성/검증·입력 준비·게임 fixture에 맞췄다. 기존 dev 해시는 historical 허용 목록에 보존했다.
- 검증: 상세 CTA 테스트 64개, final-schema binding 검사 9개, 웹 lint(tsc·패턴) 통과. 기존 테스트의 React act 경고는 남아 있다.
- 변경 후 alpha UI는 아직 미검증이며 머지·배포 후 확인한다. 스키마·마이그레이션 자체는 이번 리뷰 후속에서 바꾸지 않았다.

## PR #2144 Gates 후속
- 실패한 expand-contract 검사는 FK 추가를 감싼 `DO $$` 블록을 정적으로 판정하지 못했다. 새 nullable 컬럼 뒤에 직접 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`를 실행하도록 수정했다. 검사기와 허용 목록은 바꾸지 않는다.
- 이 마이그레이션은 아직 dev 미머지이며, Prisma 적용 이력으로 한 번 실행한다. 이미 적용된 운영 마이그레이션은 수정하지 않는다.
- 격리 PostgreSQL 16에서 기존 2행 보존·새 값 NULL, 다음 시즌 중복 거절, 없는 이전 시즌 FK 거절, ID 갱신 전파, 삭제 시 NULL 동작을 확인했다.
- schema.prisma 바이트는 그대로이므로 앞서 갱신한 스키마 해시는 유효하다. 커밋본에서 expand-contract 게이트와 final-schema binding 검사를 확인한다.

## PR #2144 Web CI 후속
- CI 41642472317의 Web은 상세 화면 테스트 한 파일에서 `No QueryClient set`으로 42개 실패했다(다른 885파일은 통과). 팀 역할 조회 훅을 추가하면서 기존 뷰 테스트의 QueryClientProvider 보완이 빠졌다.
- `tournament-detail-client.test.ts`의 렌더 헬퍼가 테스트마다 독립 QueryClient를 생성하도록 수정했다. 기존 화면 단언과 실제 역할 조회 훅은 유지한다.
- 실패 파일 83개와 재참가 CTA 파일 64개, 합계 147개 통과. 기존 React act 경고는 남아 있다. 웹 타입·패턴 검사는 커밋 전에 확인한다.

## PR 5개 충돌 해결 — 2026-11-04

### Scope / Ownership
- 사용자 요청: #2137·#2138·#2140·#2142·#2144 통합 시 발생하는 충돌 해결.
- 기준: origin/dev `185043dcb`, PR heads `f517a048a` / `f5e256f4f` / `db07e8045` / `ad3b2cd11` / `21d20dfee`.
- 별도 로컬 clone의 `fix/league-pr-integration-20261104`에서 순차 통합. 원래 공유 작업트리와 원격 브랜치는 수정하지 않는다.
- Owned: 충돌 3개 파일, 이 task의 진행 기록, 통합 계약을 검증하는 관련 테스트.
- Forbidden: 원래 작업트리의 WIP, 원격 dev/main, 새 UI 설계·DB 변경. 리뷰에서 발견한 별도 P2 3건은 이번 충돌 해결 범위 밖이다.

### Acceptance Criteria / Progress Snapshot
- [x] 경기 추가 모달의 `nextKickoffTime`과 `LeaguePreviousSeasonTeams`를 함께 보존.
- [x] 공유 훅의 일괄 경기 추가·지난 시즌 팀 추가 타입 import를 모두 보존.
- [x] `V1CreateManualLeagueFixturesResult`와 `V1AddPreviousSeasonTeamsResult`를 각각 독립 타입으로 유지.
- [x] 신청 확정·취소 후 리그 상세·목록 캐시 갱신 유지.
- [x] 관련 회귀 테스트와 웹 lint(typecheck + pattern) 검증.
- [x] 충돌 marker·diff whitespace·새 debt marker·통합 diff 범위 검증.
- [x] 검증 결과와 배포 전 미검증 범위 기록.

### Ambiguity / QA
- 새 디자인은 추가하지 않고 각 PR의 기존 화면과 계약을 보존한다. alpha에 아직 없는 통합 코드이므로 로컬 Next 서버를 띄우지 않는다.
- 실제 alpha 브라우저 검증과 운영 데이터 변경은 하지 않았다. 원격 머지·배포 후 기존 task의 alpha 확인 항목이 남는다.
- 최초 테스트 실행은 공유 node_modules에 `@tanstack/query-sync-storage-persister`·`@tanstack/react-query-persist-client`가 없어 3개 파일의 수집이 실패했다(다른 2개 파일 19개 테스트 통과). lockfile에 고정된 TanStack 5.102.8을 `/tmp`에만 설치하고, 격리 clone에서 해당 링크를 사용해 실패한 파일만 재실행한다. 저장소 package.json/lockfile과 원래 node_modules는 바꾸지 않았다.
- `use-v1-api.league-integration.test.tsx`는 실제 훅 + MSW 요청으로 지난 시즌 팀 일괄 등록 → 수동 경기 일괄 추가 → 상세·참가팀·목록 갱신을 검증한다. POST payload와 후속 GET 데이터를 함께 확인한다.
- 최종 검증: 관련 5파일 131개 테스트 통과(경기 추가 모달 16, 지난 시즌 팀 3, 관리 화면 108, 신청 갱신 3, 새 통합 테스트 1). 새 통합 테스트는 성공했고, 기존 UI 테스트의 React act 경고는 남아 있다.
- 웹 `tsc --noEmit --incremental false`와 `scripts/v1-pattern-check.mjs` 통과. 첫 타입 검사는 설치된 validator·타입 패키지의 누락 링크만 3건 보고했으며, 격리 clone에서 lockfile 버전(validator 13.15.26 / @types/validator 13.15.10) 링크를 복구한 뒤 성공했다.
- `git diff --check`, staged diff 검사, 충돌 marker 검사, touched-path debt grep 통과. 테스트·타입 검사 이후 소스 코드는 추가 수정하지 않았다.
- 범위 제한: API/DB 통합 테스트·alpha 브라우저 실측·원격 PR 갱신·dev/main 머지는 수행하지 않았다. 이번 결과는 충돌 해결과 로컬 웹 검증 완료이며, 기존 P2 3건과 배포 후 QA를 완료한 것으로 보지 않는다.
