---
"v1_api": patch
---

플랫폼 관리자를 휴대폰 본인인증 쓰기 게이트에서 면제한다 — 운영 콘솔이 미인증 계정으로도
쓸 수 있게.

## 무엇이 막고 있었나

`V1AuthGuard` 의 전역 쓰기 게이트는 `phoneVerifiedAt` 이 비어 있으면 GET 외 모든 쓰기를
403 `PHONE_VERIFICATION_REQUIRED` 로 막는다. 허용 목록에 `/admin` 은 이미 있었지만
(**"운영 콘솔. 운영자 계정이 미인증이면 장애 대응 자체가 막힌다"**), 실제 운영 콘솔의 쓰기는
거기로 가지 않는다:

```
/games/:gameId/commands/:command      경기 시작·일시정지·종료
/games/:gameId/events                 이벤트 기록 (골·카드·파울)
/games/:gameId/lineups/:sideId        라인업 제출
/games/:gameId/result-revisions/...   결과 검토·공식화·무효화
/games/:gameId/corrections            정정
```

`/tournament-ops/*` 는 대부분 GET(운영 보드·스태프 목록·필드)이라 이미 통과하고 있었다.
즉 프리픽스를 하나 더 추가하는 것으로는 아무것도 해결되지 않는다.

## 왜 경로가 아니라 신분 기준인가

`/games/*` 를 통째로 허용 목록에 넣으면 **일반 사용자의 신원연동·동의 쓰기까지 열린다**:

```
/games/:gameId/participants/:participantId/identity-link-requests
/games/:gameId/participants/:participantId/.../attest
/games/:gameId/participants/:participantId/consents/grant | revoke
```

"내가 그 선수다" 를 주장하는 경로 — 휴대폰 인증이 정확히 막으려는 행위다. 그래서
"어느 경로냐" 가 아니라 "누구냐" 로 판정한다.

## 인가는 그대로다

이 면제는 **인증(휴대폰) 게이트만** 건너뛴다. 관리자·스태프 전용 라우트는 각자의 권한 계층
(`TournamentStaffGuard`, `GamesService.resolveActor` 의 role 검사, `AdminGuard`)을 그대로
통과해야 한다. 관리자 권한 자체가 다른 관리자의 명시적 부여로만 얻어지는, 휴대폰 인증보다
강한 통제다.

- `isPhoneVerificationExemptActor()` 추가 — `V1AdminUser.status === 'active'` 일 때만 면제.
  **회수(revoked)·정지(suspended) 관리자는 면제되지 않는다** — 살아 있는 권한 부여가 신뢰의 근거다.
- `V1AuthGuard` 가 기존 `select` 에 `adminUser: { select: { status: true } }` 를 중첩으로 붙인다.
  `V1AdminUser.userId` 가 `@unique` 라 **추가 쿼리가 생기지 않는다**.
- 유닛 4케이스 + end-to-end 2케이스. e2e 는 실 DB·실 HTTP 로 미인증 관리자가 쓰기를
  통과하고 회수된 관리자는 여전히 403 인지 확인한다. 가드의 면제 호출을 제거하면 관리자
  케이스만 정확히 실패하는 것을 확인했다(red/green).
