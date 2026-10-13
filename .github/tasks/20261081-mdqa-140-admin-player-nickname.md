# Task 20261081: MD-QA #140 관리자 선수 명단 식별 이름

Status: In Progress
**Owner**: root → backend-data-dev
**Created**: 2026-10-13

## Context
https://teameet.jmandu.kr/issues/140/ 원문·재현·최근 댓글 확인, 김성준 담당·확인 중 저장 재확인 완료. 관리자 선수 목록은 realName만 제공하며 공개 roster의 nickname-only 개인정보 경계는 이미 존재한다. 다른 PR1883은 games/arrival 영역으로 이 목록과 중복하지 않는다.

## Goal
관리자 선수 목록은 실명·현재 닉네임을 함께 구별할 수 있고 공개 응답·화면은 닉네임만 유지한다.

## Original Conditions (must all be satisfied)
- [x] 기존 관리자 role gate 뒤에서 realName+nickname 계약을 제공한다.
- [x] 공개 목록에 실명이 새로 노출되지 않는다.

## User Scenarios
관리자는 실제 참가 선수의 실명과 닉네임을 비교한다. 일반 사용자는 기존 공개 닉네임만 본다.

## Test Scenarios
### Happy path
- [x] 실제 listPlayersForAdmin 호출에서 가입 프로필 닉네임과 보존된 실명 반환을 검증한다.
### Edge cases
- [x] 닉네임 null/동일 이름/긴 한글 이름과 기존 CSV 계약을 보존한다.
### Error paths
- [x] 비관리자 공개 경로의 realName 제한과 기존 인증 실패를 유지한다.
### Mock data updates needed
- [x] frontend 타입·fixture가 실제 admin/public 계약과 맞는지 확인한다.

## Parallel Work Breakdown
- Phase A 단일 contract 소유자: Owned `apps/v1_api/src/tournaments/tournament-players.service.ts`, 관련 `tournament-players.service.spec.ts`, `docs/api/domains/tournaments.md` 해당 admin/public 선수 목록 계약; `apps/v1_web/src/types/api.ts` 관련 admin 선수 타입만. 추가 fixture/hook path는 정확한 위치를 찾아 root 승인 후 편집한다.
- Forbidden: controller/DTO/schema, games/arrival, 다른 타입·공유 hooks/MSW, UI pages, 다른 task/state/Git 및 테스트 실행. UI는 Phase A 완료 후 단일 소유권으로 이어간다.
- root 실제 RED/GREEN 최소 worker 직렬 검증, 독립 리뷰·dev PR·리포트 댓글·CI·실제 alpha/admin+public 실측.
- Phase B A안 단일 UI 소유자: 기존 `registrations-tab.tsx`의 이름 영역과 새 `tournament-roster-identity.test.tsx`만 변경한다. 공유 타입은 Phase A 소유자가 선행 완료했고 root가 Git·직렬 검증을 담당한다.

## Acceptance Criteria
- [ ] Original conditions와 실제 회귀 RED→GREEN
- [ ] 개인정보·권한 경계 유지 및 문서·fixture sync
- [ ] 최신 committed head 독립 Critical0/Warning0
- [ ] 필요한 alpha persona/viewport 검증은 코드 테스트와 구분

## Tech Debt Resolved
관리자 목록·CSV·공개 roster 사이 식별자 계약의 실제 drift만 좁게 해결한다.

## Security Notes
기존 접근 권한을 확장하지 않고 private realName은 public response/display로 전달하지 않는다.

## Risks & Dependencies
shared api.ts는 이 작업자 한 명만 해당 타입을 수정한다. UI 변경은 기존 토큰·컴포넌트와 시각 검증 기준을 따른다. Managed checkout 생성은 성공했으나 attachment100 제한으로 등록 실패; 반환된 checkout만 재사용한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root | nickname의 현재 값 또는 등록 snapshot | 실제 profile/API 계약 대조 후 현재 프로필 값을 사용 |
| 2026-10-13 | 사용자 | 관리자 명단의 실명·닉네임 배치 | A 선택: 실명을 주 이름, 바로 아래 닉네임을 보조 정보로 표시 |
| 2026-10-13 | root | PR1883 이미 머지 여부와 중복 | PR1883은 games/arrival console 식별 정보만 변경하며 이 관리자 등록 선수 목록은 포함하지 않음 |

## Progress Snapshot
- Claim verified 2026-10-13 05:16Z; branch `fix/mdqa-140-admin-player-nickname`; base `5d289d7f40ccc6f0e447d5ce1f89a1f4c331c711`.
- 2026-10-13 Phase A: 실제 관리자 service의 신규 5건 RED → 기존 포함112/112 GREEN. 현재 프로필 닉네임은 nullable 별도 필드이며 등록 당시 실명·CSV·권한·정렬을 보존한다.
- 2026-10-13 Phase B: 선택된 A안 실제 RosterModal + QueryClient + MSW GET/PATCH/DELETE 소비자6건에서5 FAIL/1 PASS RED를 확인한 뒤 기존 이름 영역만 수정했다. 기존 roster16 + awards11 + 신규6 =33/33 GREEN (`mdqa140-ui-a-affected-green.log`). 403 시 명단·개인정보를 숨기는 기존 계약과 read-only 수정 차단도 통과했다. 403의 logger HTTP boundary는 204 핸들러를 추가했고 신규6/6 재검증 PASS, unhandled request 없음 (`mdqa140-ui-a-logger-boundary-green.log`).
- 공개 상세 실제 service의 exact nickname-only 응답 검증1 PASS /37 skipped (`mdqa140-public-privacy-green.log`); 전체 공개 suite 통과로 표시하지 않는다. 최신 origin/dev 통합, committed-tree 타입 검사·독립 개인정보/프론트 리뷰·dev PR·실제 alpha390/768/1440 검증은 아직 남아 있다.
