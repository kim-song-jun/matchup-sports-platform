# Task 111 — V1 tournament roster registration deadline

## Scope

- Target: frontend
- Runtime: `apps/v1_web`
- Route: `/tournaments/:tournamentId/registrations/:registrationId/roster`

## Request

- 선수 명단 관리 화면에서 대회 신청 마감 날짜와 시간을 바로 확인할 수 있게 한다.
- 대회 신청 마감과 선수 명단 수정 잠금은 서로 다른 계약임을 사용자에게 명확히 안내한다.

## Owned files

- `apps/v1_web/src/lib/date-utils.ts`
- `apps/v1_web/src/lib/date-utils.test.ts`
- `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx`
- 관련 roster tests

## Acceptance criteria

- [x] 신청 마감이 설정된 대회는 명단 관리 상단에서 연도, 날짜, 요일, 시각을 확인할 수 있다.
- [x] 신청 마감 전, 신청 마감 후, 일정 미정 상태가 구분된다.
- [x] 신청 마감 여부와 무관하게 실제 `rosterLockedAt` 및 신청 상태를 기준으로 명단 수정 가능 여부를 안내한다.
- [x] 신청 마감이 지났지만 명단이 열려 있으면 신청은 마감됐고 명단은 수정 가능하다는 두 상태가 함께 보인다.
- [x] 날짜 포맷과 상태 문구를 회귀 테스트로 검증한다.

## Progress snapshot

- Current: implementation and non-browser validation complete
- Passed: focused tests 7/7, full web tests 100/100, TypeScript (`tsc --noEmit`)
- Runtime QA blocker: `localhost:3013`, `localhost:8121`, Docker Compose 서비스가 모두 내려가 있어 보호된 실제 명단 경로의 desktop/tablet/mobile screenshot과 console/network 검증은 실행하지 못했다.

## Ambiguity log

- `registrationDeadlineAt`은 신규 참가 신청을 막는 시각이다. 선수 명단 수정은 현재 서버 계약상 `rosterLockedAt` 또는 취소 상태로 제한되므로 두 마감을 동일하게 표현하지 않는다.
