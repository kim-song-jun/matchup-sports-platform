# Task 200: 팀 편집의 미정 목표 정원 보존

Status: Review
**Owner**: Codex issue fix session
**Created**: 2026-10-02

## Context
Refs #1559. 실제 alpha 원본에서 소개만 저장한 뒤 숫자 목표 정원 2명이 생겼다. 원본 사진 5장/행동 기록/현재 v1 표시·hydrate·submit 계약을 대조하되 raw API null→2를 독립 재현했다고 주장하지 않는다. 현재 dev의 순차 task188 및 다른 미병합 task189–199와 충돌하지 않도록 200을 쓴다.

## Goal
기존 미정 정원을 소개 편집에서 보존하고, 같은 정원 컨트롤의 명시적 미정/숫자 선택이 기존 API nullable·숫자 하한 계약과 일치하게 한다.

## Original Conditions
- [x] 미정 목표 정원은 소개만 저장할 때 계속 null이다(합성 client/payload 회귀).
- [x] 유효한 숫자 정원은 소개만 저장할 때 같은 숫자다(합성 client/payload 회귀).
- [x] 편집에 미정을 표시/선택하며 숫자 선택은 최소2·현재 인원 하한·최대50을 유지한다(초점 회귀).
- [x] 작성 기본값·레벨 원본 보존·현재 인원 집계·권한·version·API/DTO/schema·가입/필터 계약을 변경하지 않는다.
- [x] 명시 pathspec commit/feature push/Ready base dev PR1561과 첫 head CI 성공을 확인했다. 리뷰 교정 후 새 정확 head CI는 PR 기록으로 확인한다.
- [x] 실제 alpha before만 사용하고 수정 after는 승인된 배포 뒤 대기, #1559 OPEN/Refs 유지.

## User Scenarios
1. 팀장·매니저가 미정 팀 소개만 바꿔 저장한다. UI와 payload의 정원은 미정/null이다.
2. 숫자 정원을 그대로 둔 소개 저장은 같은 숫자를 보존한다. 숫자 직접 선택/증감은 하한과 최대를 지킨다.
3. 숫자→미정→숫자 연속 선택, 저장 실패/재시도/중복 제출, 취소·Back/Escape를 기존 가드로 처리한다.

## Test Scenarios
### Happy path
- [x] 실제 TeamEditPageClient + TeamFormPageView의 미정/숫자 상태와 소개 제출/성공 복귀 확인(API 훅·Next navigation 경계는 합성 fixture).
- [x] 미정 선택 및 숫자 선택·stepper·현재 인원 1/다수/상한 확인. 현재51명/기존숫자50 경계는 유효범위 밖 초안을 disabled ‘변경 필요’로 표시하고 명시 미정 선택 후에만 null을 보낸다.
### Edge cases
- [x] 연속 입력·재진입 fixture 재조회·중복 제출·작성 기본값·기존 레벨 회귀 확인.
### Error paths
- [x] 일시500·server version 불변일 때 재시도 정원 유지, stale version의 반복409·오류 문구·초안 유지·이동 없음, 상세 fixture의 새 version hydrate 후 다시 입력한 소개 저장을 분리한다. 실제 취소/페이지 Back 모달의 Escape에서 초안 유지·저장 없음(JSDOM).
### Mock data updates needed
- 합성 fixture와 기존 정원 null→2 기대값만 정정한다. 실제 데이터/API/MSW 응답 계약 변경 없음.

## Parallel Work Breakdown
- Main Owned: `apps/v1_web/src/components/teams/teams-form-client.tsx`, `teams-page.tsx`, 정원 회귀 test, 기존 `teams-form-client.test.tsx`/`teams-form-levels.test.tsx`/`teams-page.test.tsx`의 관련 기대값, 이 task, patch Changeset.
- Read-only delegate: API nullable/min/current-count 저장 계약·기존 테스트 및 원본 공개 증거 5장/metadata 확인. 파일 편집·실행·원격 쓰기 없음.
- Forbidden: 다른 worktree/미병합 코드, API/DTO/schema, 실제 팀 데이터·가입/권한·C/B 정원 복구, QA179 명단·완료 결과, Task182·scenarios 허브.
- 사용자가 승인한 최소 수정은 기존 select/stepper의 미정 상태 계약을 복원한다. 새 레이아웃·컴포넌트/스타일을 제안하는 UI 작업으로 확대하지 않는다.
- [x] RED→GREEN→scope lint/guards→독립 read-only 계약/제품 리뷰.
- [x] 첫 head76eb483의 명시 commit/push→Ready PR1561→정확 head CI 성공/committed diff 리뷰 확인. 리뷰 교정 후 최종 head CI/리뷰는 PR 기록에 추가한다.

## Acceptance Criteria
- [x] 원본 조건의 로컬 초점 검증 및 첫 committed diff scope 확인. 리뷰 교정도 owned test/task에만 한정한다.
- [x] 실제 Sonnet/독립 Codex 정적 검토·서비스 오류·CI·alpha 실측을 구분한다.
- [x] 원본 사진 5장과 시간/폭/관측 한계를 PR에 보존한다.
- [ ] 실제 alpha 수용 조건·payload/reload/3폭 after를 확인하기 전 이슈 종료하지 않는다.

## Tech Debt Resolved
- nullable 정원을 편집 hydrate에서 숫자로 만들어 무관한 소개 저장에 전송하는 값 손실.

## Security Notes
- API의 auth/role/version/current-count gate를 우회하지 않는다. 로그인/실제 팀/멤버/정원 쓰기를 실행하지 않는다.
- 공개 사진의 개인 정보/원본 민감 payload를 추가하지 않으며 합성 로컬 fixture만 사용한다.

## Risks & Dependencies
- API는 명시 null 저장을 허용하며 숫자일 때만 최소2/최대50 및 현재 인원 하한 검사. DTO95–100/service370/402/418/2251/2687 및 기존 service·integration 테스트를 읽기 전용 대조했다. 필드 생략도 service의 `?? null`로 null 저장이므로 기존 숫자는 명시 payload로 유지한다.
- 이전 PR1527 최소 숫자 정원 오류, PR1513 현재 인원 집계, #1528/PR1529 레벨 보존은 별도 계약이다. 관련된 stale null→2 테스트 기대값을 정정한다.
- 현재 C팀의 숫자2를 원래 미정 before로 다시 사용하지 않는다. 원본 raw API null/당시 PATCH/DB JSON·태블릿·사진별 UTC/serving SHA는 미확보다.
- 로컬/CI 테스트는 실제 alpha 저장·reload/전체 여정/키보드·console/network 검증을 대체하지 않는다.
- 기존 edit client는 VERSION_CONFLICT catch에서 오류 표시·submit lock 해제만 하고 자동 refetch/version 갱신을 하지 않는다. 새 query.data hydrate는 소개 초안도 서버 값으로 바꾼다. 충돌 복구 동선·초안 병합은 기존 제품 문제이며 이번 정원 보존 범위에서 변경하지 않는다. 재조회 테스트는 훅 경계 fixture를 명시 갱신한 것이며 실제 자동 복구/캐시/HTTP/DB 검증이 아니다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-02 | Parent | 기존 최소 숫자 정원 수정과 미정 보존은 같은 문제인가 | #1559로 분리; 명시 숫자 최소2/현재 인원 제약 유지, 미정은 기존 nullable 계약 보존. C/B 실제 값 복구 없음. |
| 2026-10-02 | PR1561 independent review5396458639 | 같은 stale version의409 후 mock 성공은 실제 재시도 계약인가 | 타당한 P2. 일시500 재시도와 지속409를 분리하고 상세 fixture의 새 version hydrate 후 재입력을 별도로 검증한다. 관련 레벨 fixture도500으로 정정하며 제품 version/서버 계약은 변경하지 않는다. |

## Progress Snapshot
- Base `1d09562a9b7d1b2be261a89519167ff2a031a576` (fetch 직후 origin/dev), 새 worktree `/tmp/teameet-issue-1559-20261002`, branch `fix/issue-1559-team-edit-capacity-preservation`.
- 열린 PR에서 정원 보존 구현 중복 없음. 다른 미병합 코드는 가져오지 않는다.
- 실제 client + 공용 폼 + 공용 미저장 모달/Back + shared history를 사용하는 새21개 RED: 11 FAIL / 10 PASS. 첫 GREEN21 PASS; 독립 리뷰가 발견한 current51/goal50의 UI/payload 불일치 경계는 추가 RED1 FAIL 뒤 수정해 새22개 PASS.
- 첫 head76eb483은 기존 client31·공용 page56·레벨14를 합쳐 4 suite / 123 PASS. 중간 122개 검증의1실패는 작성 기본값 fixture를 실제 create mode/더 꾸미기 펼침으로 바로잡았다.
- 첫 lint는 새 테스트가 반환값 없는 installNavigationHistory를 cleanup 함수로 간주한 TS 오류였다. __resetNavigationHistoryForTests로 설치/cleanup 경계를 고친 뒤 최종123개와 scope lint(typecheck+v1 pattern) PASS. 필수 guardrail6/6, patch Changeset policy, diff check, touched debt marker 검사 PASS.
- 제품 수정은 nullable hydrate 1분기와 기존 정원 control의 미정/숫자 상태 및 경계·설명뿐이다. 작성 기본24·유효 숫자 유지·기존 유효범위 아래 숫자 하한 교정·레벨 원본 저장 로직은 유지했다.
- 독립 API/source 리뷰: 명시 null/생략→null 및 숫자 제약 확인. 제품 경계 지적1건 해결, 후속 제품2/2·새22개·관련 기존3test에서 새 actionable 미발견. 최종 candidate/committed scope는 PR 기록으로 확인한다.
- 고정 공개 원본7/7 HTTP200·Git blob/bytes, JPEG5/5 SHA256/raster/디코딩/픽셀 확인. 원본 실행06:54:38.202–06:56:47.236 UTC, raster402×605 2장/1180×757 3장. raw API null→2·태블릿·사진별UTC·serving SHA 미확보, 현재 C팀 정원2를 원래미정 before로 재사용하지 않는다.
- 2026-10-02 20:04 UTC 사전 점검: 12CPU/load4.19·6.28·8.58, swap2872.81/4096MB, Node98/browser19, Docker29.8.1, alpha landing HEAD503. 직렬 worker1로 검증; 로컬 Next/브라우저/MCP 서버 시작 없음.
- PR1561은 Ready/base dev/Refs #1559. 첫 head76eb483의 CI37059187384 attempt1은2026-10-02 20:22:22 UTC SUCCESS(API/Web/Gates PASS, images/deploy SKIP). Web572 suite5849 PASS/build113, API unit335 suite4501 PASS/integration119 suite825 PASS·3 SKIP. alpha HEAD는20:04 UTC503에서20:21:01 UTC200으로 재관측했으나 배포/화면 증거가 아니다.
- 2026-10-02 20:23:29 UTC 새 독립 Codex review5396458639의 재시도 fixture P2를 실제 service version gate·client catch/hydrate·hook onSuccess와 대조해 수용했다. 기존 정원/레벨의 두 실패 테스트에 지속409를 반영하자 성공 이동 기대가 RED2 FAIL(34 SKIP)했다. 일시500은 서버 version 불변 조건으로 정정하고 정원 null/24의 반복409 및 fixture version 갱신 후 재입력 case3개를 추가했다.
- 리뷰 교정 최종 GREEN: 정원25·레벨14·기존 client31·page56, 4 suite / 126 PASS. 일시500의 INTERNAL_ERROR는 현행 API exception filter와 맞추고 VERSION_CONFLICT의 실제 사용자 오류 문구도 확인했다. scope lint(typecheck+v1 pattern) PASS; 제품2 변경0, 후속 owned3파일(test2/task)·diff check 확인. 전체 checks는 새 정확 head CI로 재검증한다.
- 현재 단계: 리뷰 교정한 test2/task만 명시 추가 commit/push, 최종 초점/lint와 새 정확head CI 결과를 PR 기록에 남긴다. 제품2 및 API/DTO/schema/실데이터 계약 변경 없음. 실제 alpha 수정 after/3폭 저장·reload/console/network는 별도 승인된 배포 뒤 대기. 실제 데이터 쓰기/정원 복구/merge/deploy 없음.
