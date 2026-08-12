---
"v1_api": patch
---

**공개 경기 기록 화면(`/tournaments/:id/matches/:fixtureId`)에서 골·반칙 이벤트 선수명이 담당 스태프에게도 "비공개 선수"로 표시되던 문제를 고쳤다.**

## 근본 원인

`PublicTournamentRecordsService.getMatch`는 요청자 신원(actor)을 전혀 받지 않는 순수 공개 조회였다. `buildLineup`/`buildEvents`/`buildMvp`는 참가자의 공개 동의(consent) 상태만 보고 `eligible ? displayNameSnapshot : null`을 계산했는데, 이 동의 게이트는 익명 방문자와 방금 그 골을 기록한 대회 운영진에게 **완전히 동일하게** 적용됐다 — 스태프 우회가 구조적으로 없었다. 운영자 전용 화면(라인업 저장/제출, 결과 검토 등)은 이 문제가 없었지만, 공개 "경기 기록" 화면은 로그인한 스태프도 그대로 방문할 수 있는 라우트였다.

## 고친 방법

- `getMatch`가 이제 `@CurrentUser()`(`OptionalV1AuthGuard`, 여전히 익명 허용)로 요청자를 받는다.
- 익명 요청(`user === undefined`)은 스태프 권한 검사를 아예 건너뛰고 기존과 동일하게 동의 기반으로 처리한다 — 익명/미권한 사용자 경로는 그대로 유지, 오류(403)로 바뀌지 않는다.
- 로그인한 사용자가 있으면, 라인업 컨트롤러가 이미 쓰는 `TournamentStaffAccessService.assertAccess({ action: 'read', resource: { tournamentId, fixtureId, fieldId } })`를 그대로 재사용해 **이 경기(fixture)/이 필드 단위로 좁혀서** 검사한다 — 대회 전체 스태프 여부가 아니다. 다른 필드·다른 경기 담당 스태프는 여전히 "비공개 선수"를 본다.
- 인가된 경우에만 `buildLineup`/`buildEvents`/`buildMvp`의 동의 게이트를 우회(`isStaffBypass`)한다. 라인업 스냅샷에 없는 참가자는 우회가 켜져 있어도 이름을 지어내지 않는다(`participant?.displayNameSnapshot ?? null`은 그대로 적용).
- 프론트(`presentParticipantName`/`WITHHELD_IDENTITY_LABEL`)는 이미 `displayName`이 오면 실명을, `null`이면 라벨을 그대로 렌더링하고 있어 별도 변경이 필요 없었다 — 백엔드가 실명을 내려주면 자동으로 연결된다.
- `getSchedule`(대회 일정 카드의 득점자 요약)은 이 변경 범위 밖이다 — 여전히 모든 호출자에게 동의 게이트를 적용한다.

## 테스트

`public-tournament-records.service.spec.ts`에 권한 스코프 전용 스펙을 추가했다: 익명 요청(회귀), 대회 스태프 배정이 전혀 없는 로그인 사용자, 다른 필드 담당 FIELD_OPERATOR, 다른 경기(fixture) 담당 FIELD_OPERATOR — 이상 네 가지는 모두 여전히 "비공개 선수"이고, 이 경기가 배정된 필드의 FIELD_OPERATOR와 TOURNAMENT_DIRECTOR만 실명을 본다. `TournamentStaffAccessService`는 mock이 아니라 실제 구현(+최소 fake Prisma)을 써서 `decideTournamentStaffAccess` 정책 자체가 아니라 `getMatch`가 그 정책에 올바른 resource를 넘기는지를 검증한다. 라인업 스냅샷에 없는 참가자에 대한 "이름을 지어내지 않는다" 케이스도 별도로 커버했다.
