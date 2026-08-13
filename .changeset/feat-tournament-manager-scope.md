---
"v1_api": minor
"v1_web": minor
---

팀 운영진(manager)이 대회 실무를 팀장(owner)과 동일하게 처리할 수 있게 한다.

**증상**: 팀 운영진이 대회 관련 기능을 팀장 대신 처리할 수 없다는 요청. 대회 도메인의 팀 권한 게이트를 전수 조사한 결과, 신청·명단·라인업 등 **대부분은 이미 `role: { in: ['owner','manager'] }`로 운영진을 포함**하고 있었고 실제로 막혀 있던 곳은 두 군데였다.

**원인 1 — 선수 신원연결 승인**: `GamesService.assertAttestorAuthority`만 멤버십을 `role: 'owner'` 단독으로 조회하고 있었다. 같은 서비스의 `resolveActor`·라인업 권한 판정은 전부 owner/manager를 동등하게 취급하는데 이 한 곳만 예외로 남아, 운영진은 자기 팀 선수의 신원 연결을 승인·거부할 수 없었다.

**원인 2 — 대회 후기**: 권한 기준이 팀 역할이 아니라 **"대회 신청 버튼을 누른 사람"**(`registration.appliedByUserId === me`)이었다. 팀장이 신청했으면 운영진은 후기를 쓰지도, 우리 팀이 이미 썼는지 조회하지도 못했다. `submitReview`·`listMyPendingReviews`·`getMyReview`·`isParticipant` 네 곳이 모두 같은 기준을 쓰고 있었다.

**수정**:
- `assertAttestorAuthority`를 owner+manager로 확장. `sideTeamId` 스코프(상대 팀 승인 불가)와 자가승인 금지(`IDENTITY_LINK_SELF_ATTESTATION_FORBIDDEN`)는 그대로 유지 — 넓힌 것은 "누가"이지 "어느 팀을"이 아니다.
- 후기 권한을 **"참가 확정 팀의 active owner/manager"**로 전환. 팀 조회에는 대회 도메인의 다른 게이트(`tournament-registrations.service.ts`, `tournament-players.service.ts`)와 동일하게 `status: 'active', deletedAt: null`을 적용해 해체된 팀의 운영진이 새어 들어오지 않게 했다.
- 후기를 팀에 귀속시키기 위해 `V1TournamentReview.teamId`를 추가하고 **팀당 대회 1건** unique를 건다. 기존 `(tournamentId, authorUserId)` unique도 유지되므로 "한 사람 1건 + 한 팀 1건"이 함께 보장된다.
- 여러 팀의 운영진을 겸임하고 그 팀들이 모두 같은 대회에 참가 확정된 경우에만 팀 선택이 필요하다. 서버가 `400 TEAM_SELECTION_REQUIRED` + `details.teams`로 후보를 돌려주고, 프론트가 이미 입력한 별점·내용·사진을 유지한 채 `role="radiogroup"` 팀 선택 UI를 띄워 재제출한다. 자격 팀이 하나면 자동 선택돼 기존 UX 그대로다.

**함께 고친 조용한 버그**: 팀 후보 목록을 예외 바디의 top-level `teams`로 실었더니 `AllExceptionsFilter`가 `code`/`message`/`details`만 전달하고 그 필드를 버려, 프론트가 이 상태에서 영영 복구할 수 없었다. 다른 도메인의 구조화 에러(`PROFILE_COMPLETION_REQUIRED`)와 같게 `details` 안으로 옮겼다.

**마이그레이션**(`20260813070000_v1_tournament_review_team_scope`): `team_id` 추가 → 백필 → unique → FK 순이며 전 구문 idempotent(빈 DB 재생 포함). 백필은 `registration.status='confirmed'` + `team.name = review.team_name` 스냅샷으로 후보를 좁혀 **review당 후보가 정확히 1건일 때만** 채우고, 모호하면 `NULL`로 보존한다(삭제 없음). 첫 작성본은 `(tournament_id, applied_by_user_id)`로만 조인해 여러 팀을 겸임한 신청자의 리뷰가 팀 수만큼 fan-out 되고 `UPDATE ... FROM`이 그중 아무 행이나 고르는(Postgres 문서상 unspecified) 결함이 있었다 — 적대적 리뷰에서 잡아 고쳤다. partial index 대신 평범한 composite unique를 쓴 것은 Postgres NULL-distinct 시맨틱상 NULL끼리 충돌하지 않고, Prisma DSL이 `WHERE` 절을 표현하지 못해 partial index를 쓰면 드리프트 게이트가 영구히 깨지기 때문이다.

**하지 않은 것**: 대회 일정 화면의 라인업 진입 동선은 이 브랜치에서도 만들었다가 버렸다 — 작업 중 dev에 `useV1MyTournamentFixtures` 기반의 "우리 팀 경기 + 라인업 상태" 요약이 머지됐고, 그쪽이 이미 owner+manager를 포함하는 데다 더 낫다. 중복 구현을 남기지 않고 dev 것을 채택했다.
