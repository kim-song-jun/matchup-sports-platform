# Task 20261053: MD-QA #52 개인 매치 종료 시간 검증

Status: In Progress
**Owner**: root → frontend-ui worker
**Created**: 2026-10-08

## Context
https://teameet.jmandu.kr/issues/52/ : 개인 매치 3/4 단계에서 2026-10-10 10:00–09:00을 입력해도 확인 화면으로 진행한다. 최종 생성은 누르지 않은 제보이며 서버 저장 결함을 주장하지 않는다. root가 기존 IAB에서 미배정·댓글 0 상세와 중복 task/열린 PR/작업트리를 확인하고 18:41 김성준·확인 중 저장과 표시를 확인했다.

## Goal
종료 시간이 있는 동일 날짜 개인 매치에서 종료가 시작보다 늦어야 한다는 실제 단계/제출 계약을 복구하고 base dev PR 및 기존 리포트 댓글까지 게시한다.

## Original Conditions (must all be satisfied)
- [ ] 역전·동일 시간은 장소와 시간 단계에서 명확한 오류로 차단한다.
- [ ] 종료 생략과 정상 종료는 유지하며 초안 값·이전/다음 흐름을 보존한다.
- [ ] 직접 확인 화면 진입도 동일 검증을 사용하고 잘못된 POST를 보내지 않는다.
- [ ] 최소 v1 수정, 실제 RED→GREEN, 독립 리뷰와 committed 검증을 기록한다.

## User Scenarios
개인 매치 호스트가 장소·날짜·10:00 시작과 09:00 종료를 입력하고 다음을 누르면 같은 단계에서 종료 오류를 읽는다. 11:00으로 고치면 확인으로 진행하며 실제 요청 payload도 올바르다. 종료를 비우는 기존 선택은 유지한다.

## Test Scenarios
- [ ] 실제 production validation의 역전·동일·정상·종료 생략.
- [ ] 실제 production client의 다음 차단/오류/값 유지/정정 후 확인 이동.
- [ ] 직접 confirm submit 역전/동일 차단, create mutation 호출 없음.
- [ ] 기존 deadline/과거/필수값·정상 submit 회귀 유지.
- [ ] 필요한 inline fixture만 sync, 공용 MSW/API 계약 변경 없음.

## Parallel Work Breakdown
Worker: `apps/v1_web/src/components/matches/matches.validation.ts`, 기존 `matches.validation.test.ts`, `matches-create-client.test.tsx`, 이 task snapshot. 최소 추가 source 경로 필요 시 root 승인부터 받는다. root: Changeset/Git/PR/tracker/SSOT/alpha. Forbidden: 공용 hooks/types/MSW/DTO/API/정책/다른 route/worktree/.env, 자기 commit/push. 혼자가 아니므로 타인 변경을 되돌리지 않는다. 다른 버그 구현과 독립이나 모든 테스트는 root serial slot으로 실행한다.

## Acceptance Criteria
Given 종료가 시작 이하인 입력, When 다음/최종 제출, Then 명확한 종료 오류 및 이동/POST 없음. Given 종료 생략 또는 뒤 시간, Then 기존 정상 흐름 유지. 오류를 정정하면 값 손실 없이 다음으로 진행.

## Tech Debt Resolved
동일 validation을 단계와 payload가 함께 사용하여 검증 drift를 방지한다. 기존 시간 검증 util/팀 매치 계약을 v1 근거로 대조한다.

## Security Notes
인증·권한·API 저장 계약을 변경하지 않는다. .env/비밀을 읽거나 출력하지 않는다. 실제 alpha 최종 생성/신청/결제는 실행하지 않는다.

## Risks & Dependencies
종료 날짜는 선택 입력이며 비워 둔 기존 초안은 시작 날짜와 같은 날로 검증한다. 역전 시각으로 익일을 추론하지 않고 사용자가 명시한 날짜나 실제 서버 종료 날짜만 보존한다. alpha after는 dev 머지·정확한 배포 SHA 후 검증해야 하며 코드 PASS로 대체하지 않는다.

## Ambiguity Log
보고 당시 서빙 SHA 미확인, 모바일 미검증. 현재 API/controller/service 시간 계약을 읽고 same-day 규칙을 확정한다. 전체 폼 디자인 재설계는 범위 밖이다.

## Progress Snapshot

### PR1675 latest overnight guidance followup

- Actual Copilot comment4218064407 at b8e7f580 found no next-day selection guidance when the end date is blank and23:00->01:00 is entered. Existing team-match description provides the same instruction. Existing CreateField caption/aria-describedby is reused; only the personal-match end-date description changes, with no automatic next-day inference.
- Source-unchanged real UI/hooks/HTTP RED1failed/31skipped (focused missing-guidance assertion),4.06s -> complete client GREEN32/32,5.97s. The new case proves visible/accessibly described guidance, blank date preserved, invalid next step blocked and no POST. Existing31 cases including actual overnight GET/edit PATCH retain their coverage. Logs own `tmp/qa/mdqa-52/red-overnight-guidance.txt` and `green-overnight-guidance.txt`; CPU52/free10274MiB/Node84/browser14 preflight, test process exited and serial slot released.
- Root owns committed62 (client32+validation30), Web types/pattern, latest-dev integration, full8-file exact-head independent review, same PR push/reply/resolution and original tracker followup. No new worktree or PR for this existing open task; alpha after remains pending.
- 실제 external 후속: OPEN PR1675 head `7d7`의 Codex thread `PRRT_kwDORrML2s6qTy4h` / REST4217718555를 현재 service·GET edit·draft mapper·RULES·payload와 대조했다. API는 full ISO 종료가 시작보다 늦으면 익일 종료도 허용하지만 draft mapper가 종료 날짜를 버리고 검증이 시작 날짜를 다시 붙여 유효한 23:00→익일01:00 수정을 막았다. production 유지 상태의 actual GET→hydrate→무변경/제목 수정 consumer2가 실제 장소시간 단계에서 차단되는 RED2/2(4.36s)를 확인했다. 증거 `tmp/qa/mdqa-52/red-explicit-end-date.txt`, client spec에 `--maxWorkers=1 --fileParallelism=false -t 'API 유효 익일 종료 매치'`.
- Root는 A 기존 `CreateField` 종료 날짜 선택 입력을 승인했다. B datetime-local 통합은 입력 구조 변경이 크고 C 읽기전용 날짜 보존은 날짜 정정이 불가능하므로 최소 A를 선택했다. exact source scope는 local `matches.types.ts` optional endDate, client 기본값/실제 종료 날짜 hydrate, validation/ISO payload, 기존 CreateField와 확인 화면의 종료 날짜 표시다. 공용 API types/hooks/MSW/서버 계약은 변경하지 않았다.
- 종료 날짜는 입력·복원된 실제 값만 사용하고, 생략된 과거 초안은 기존 시작 날짜로 검증한다. `HH:mm` 00–23/00–59 보호와 달력 날짜 round-trip 검사로 24:00/11:60/2월30일/잘못된 달을 차단한다. 날짜만 입력하면 종료 시간도 요구하며 손상 날짜를 시작 날짜나 익일로 대체하지 않는다. UI 전용 endDate/endTime은 POST/PATCH에 보내지 않는다.
- 후속 local GREEN61/61(consumer31+validation30, 21.09s): 기존50 전부 유지+consumer5·validation6. actual GET의 익일 매치를 무변경 또는 제목 수정 후 원 ISO로 PATCH하고 이전 이동 시 표시 날짜를 유지하며, 사용자가 명시한 익일 날짜 생성과 확인/POST, 손상된 저장 날짜의 오류·수정 링크/POST 없음, 명시적 same-day 역전·날짜만 입력 차단을 확인했다. 증거 `tmp/qa/mdqa-52/green-explicit-end-date.txt`, 기존 2파일 1worker 명령. 새로운 helper/import는 local 소스만 사용한다.
- 후속 preflight CPU39%, free physical10640MiB/virtual22880MiB, Node78/browser7, Docker daemon 없음, alpha landing HEAD200. 모든 테스트 process exit와 MSW·QueryClient·scroll stub·env·navigation/overlay cleanup 완료, serial slot 반환. tsc/fullsuite/Git/브라우저/서버 실행 없음. root committed/type·독립 재리뷰·PR·tracker·alpha gate 대기이며 기존 RED/GREEN50과 리뷰 이력은 아래에 보존한다.
- Dedicated worktree: `C:/Users/kinso/.codex/worktrees/mdqa-52-match-time-order/matchup-sports-platform`.
- Branch: `fix/mdqa-52-match-time-order`; fresh origin/dev base `016847e36093e775de71dd16e059d902df39602f`.
- Phase: 최소 production 수정 및 local narrow GREEN 완료. root committed/type·독립 리뷰·PR·tracker·alpha 검증 대기; dev 머지·실측 완료로 간주하지 않는다.
- Claimed: 실제 IAB 저장 toast와 김성준·확인 중 표시 확인. 증거 0550/report52-claim-confirmed.txt/png.
- 실제 계약: `MutateMatchDto`는 종료 ISO를 선택값으로 받고 controller POST/PATCH는 `MatchesService.validateMatchDates`를 사용한다. service는 종료가 시작 이하이면 거부한다. 개인 매치 UI에는 종료 날짜가 없어 같은 날짜로 비교하며 임의 익일 보정하지 않는다. 팀 매치의 기존 종료 오류 문구를 재사용했다.
- 원인: 개인 매치 RULES에 종료 검증이 없고 payload가 역전·동일·해석 불가 종료를 `endsAt:null`로 바꿨다. 공통 RULES에 종료 오류를 추가하여 다음·완료 배지·최종 payload 검증을 함께 적용하고 silent null 변환을 제거했다.
- Root exact 추가 source 승인 2곳: `matches-page.tsx` 종료 CreateField 1곳에 `field-endTime` id와 `errors?.endTime` 연결; `matches-create-client.tsx`의 `draftFromMatchEdit` 1줄에서 종료 생략을 빈 문자열로 보존. 후자는 기존 `endTime=startTime` 초기화가 새 검증에 걸리는 실제 hydrate drift를 해결한다. 다른 화면·스타일·날짜/시간대·공용 계약을 변경하지 않았다.
- 생성 source-unchanged actual RED: 7FAIL/4PASS(31 기존 제외, 5.87s). 실제 화면의 역전·동일 종료 오류 부재, 실제 hooks→MSW direct confirm POST의 `endsAt:null`, production payload의 잘못된 성공을 각각 증명했다. 최초 harness의 지역 표시 기대 `강남구`는 실제 `서울 강남구`로 바로잡았으며 그 초기 실패는 계약 RED로 계산하지 않았다. 공식 증거 `tmp/qa/mdqa-52/red-contract.txt`.
- 추가 hydrate 수정 전 actual RED4/4(4.14s): `endsAt` 생략/null이 실제 수정 화면과 mapper에서 시작 시간으로 채워짐을 확인. 증거 `tmp/qa/mdqa-52/red-edit-hydration.txt`. 임의 종료 값을 fixture에 추가해 통과시키지 않았다.
- 최종 GREEN46/46(2files, 6.85s): 신규 validation5·실제 client/view/hooks/API consumer8·hydrate2와 기존31. 역전/동일 차단·오류의 접근 가능한 설명·포커스·값 보존·정정 후 다음/이전/POST, direct confirm 수정 링크와 POST 없음, 정상/생략 생성 payload, 생략/null 실제 수정 PATCH payload를 검증했다. 증거 `tmp/qa/mdqa-52/green-final.txt`.
- 명령: `pnpm exec vitest run src/components/matches/matches.validation.test.ts src/components/matches/matches-create-client.test.tsx --maxWorkers=1 --fileParallelism=false` (`apps/v1_web` cwd). 생성 RED는 같은 명령에 `-t '개인 매치 종료 시간'`; hydrate RED는 client 파일에 `-t '종료.*(수정 데이터|시각)'`를 적용했다.
- Preflight CPU68%, free physical10614MiB/virtual23370MiB, Node72/browser7, Docker daemon 없음, alpha landing HEAD200. 모든 테스트 프로세스 exit 완료; MSW·QueryClient·scroll API stub·env·overlay/navigation history cleanup. 테스트 serial slot 반환 완료. 브라우저·서버·Git mutation·전체 test/type/lint는 worker가 실행하지 않았다.
- 후속 실제 검증: root committed `90b` narrow46/46 PASS 이후 tsc에서 `matches-create-client.test.tsx:417` fixture의 `status:string`이 `V1MatchApiStatus`와 호환되지 않아 FAIL했다. 안정된 fixture를 vi.hoisted 내부 `const matchEditData: V1MatchEdit`로 명시하여 실제 계약으로 타입을 고정하고 기존 deadline 타입 단언도 제거했다. any/단언/검증 약화 없음. worker는 tsc를 실행하지 않았으며 root committed 재검증 대기다.
- 독립 리뷰 후속 scope 승인: 기존 Owned validation·두 spec에서 손상된 `24:00` 종료 초안만 추가 검증했다. production 변경 전 실제 client/view/hooks→MSW consumer RED1/1(3.88s)에서 10:00 시작의 종료가 익일00:00으로 정규화되어 POST되는 것을 확인했다. 증거 `tmp/qa/mdqa-52/red-24-hour.txt`; 명령은 client spec에 `--maxWorkers=1 --fileParallelism=false -t '잘못된 24:00 종료'`.
- 종료 규칙에서 Date 파싱 전 유효한 `HH:mm`(시00–23/분00–59)만 허용하도록 최소 guard를 추가했다. 잘못된 초안은 기존 종료 오류·수정 링크로 돌아가며 값은 유지하고 POST하지 않는다. 같은날 정상23:59와 종료 생략은 유지한다.
- 후속 최종 GREEN50/50(consumer26+validation24, 6.63s), 기존46+추가4. 동일 2파일 1worker 명령의 증거 `tmp/qa/mdqa-52/green-24-hour.txt`. preflight CPU37%, free physical10486MiB/virtual23312MiB, Node72/browser7, Docker daemon 없음, alpha landing HEAD200. 모든 테스트 process exit/fixture cleanup과 serial slot 반환 완료. product 다른 파일·API·Git·브라우저는 수정/실행하지 않았다. root type·committed·독립 재리뷰·alpha gate는 대기다.
