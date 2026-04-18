# Task 69 — Unimplemented / Half-Wired Feature Remediation

Owner: project-director ⟂ tech-planner → backend-api-dev ⟂ backend-data-dev ⟂ backend-integration-dev ⟂ frontend-ui-dev ⟂ frontend-data-dev → backend-review ⟂ frontend-review → QA
Date drafted: 2026-04-18
Status: Completed (2026-04-18)
Priority: P0 — user-facing flows are broken; trust/UX is measurably degraded

---

## 1. Context

사용자 요청 원문 (2026-04-18):
> "현재 팀 참여하기 버튼만 존재. 팀 참여하기 누른 경우 팀측에서 알림 올 수 있도록 함. 내 팀, 멤버관리 등에서 참여자에 대한 조회 가능. 수락과 거부 기능. 참여자의 정보를 알 수 있도록 프로필 조회 or 채팅 가능하게끔 해야함. 이런식으로 프로젝트 전체에 문제가 있어. 이처럼 아직 미구현된 기능들, 똑바로 동작 안하는것들을 찾아서 수정할 계획을 먼저 세워보고싶어."

### 1.1 Prior tasks — do not duplicate

- **Task 12 (Done)** — notifications action center. 알림 UI/센터 구조는 완성됐지만 **도메인 이벤트 fan-out은 matches + payments + lessons + marketplace 일부에만 적용**됨. 이 task는 12의 "알림 팩토리"를 재사용하고 missing fan-out만 메워 넣는다.
- **Task 13 (Done)** — match lifecycle completion. matches.complete/cancel/close, notifyParticipants helper 완성 → **재사용한다**.
- **Task 22/23/24** — team detail / team-match application visibility. 팀 매칭 application 목록 엔드포인트는 존재. **team membership application**은 동일 패턴으로 확장한다.
- **Task 31 (Done)** — team membership TDD. owner/manager/member 권한·UI 계약 완성. `TeamMembershipService.assertRole` · `useTeamMembers` 훅 등 기반 재사용.
- **Task 35** — team-match operational contracts. checkIn + arrival + referee schedule 완성. **단, geo-fence는 personal match에만 있음** — 이번 task에서 team match에도 동일 로직 이식.
- **Task 36** — mercenary lifecycle completion. apply/accept/reject/withdraw + getMyApplications 완성. **단, close/cancel 엔드포인트 + notification fan-out + chat 자동 생성은 빠져 있음**.
- **Task 67** — mock data / API / DB 정합성 정비 (Planning). 본 task에서 Prisma enum 확장 시 seed 업데이트까지 동일 브랜치에서 처리해 drift를 방지한다.

### 1.2 Audit evidence (2026-04-18 코드 검증 결과)

| 영역 | 진짜 갭 | 증거 파일:라인 |
|---|---|---|
| **A. 팀 참여 신청 라이프사이클** | `applyToTeam` 존재, 그러나 accept/reject/listApplications 메서드·컨트롤러·알림·UI 모두 부재. 팀측은 신청이 들어왔는지 알 방법이 없음. | `apps/api/src/teams/teams.service.ts:285`, `teams.controller.ts:194` — apply만 노출. `/teams/[id]/members/page.tsx`에 applicant 섹션 없음. |
| **B. 알림 fan-out 누락** | `notificationsService.create`가 팀 apply / team-match apply·approve·reject / mercenary apply·accept·reject / review 제출 / lesson ticket 구매 / match complete 후 review_pending 흐름에서 **호출되지 않음**. matches 자체에는 6곳 호출 있음. | `team-matches.service.ts:163-236` (주입 자체 없음), `mercenary.service.ts:209-363` (주입 없음), `reviews.service.ts` (검색 결과 0건), `teams.service.ts:285` (apply 메서드 내 notify 없음). |
| **C. 채팅 자동 생성** | `ChatService.createRoom`은 존재하지만 **manual POST 전용**. team-match approve / mercenary accept / marketplace order 확정 / lesson ticket 구매 시 자동 생성되지 않아 참여자 간 소통 경로 없음. | `chat.service.ts:199` createRoom. team-matches/mercenary 어디서도 호출 안됨. |
| **D. 마켓플레이스 라이프사이클 (DEFER)** | ship/deliver/complete/refund 상태 전이 API 없음. Escrow는 이름만 존재, 실제 hold/release 로직 부재. 분쟁·정산 반쪽. UI에도 "결제 준비 중" 배너. | `marketplace.service.ts`, `settlements.service.ts`, `disputes` 모듈. |
| **E. 용병 close/cancel** | apply/accept/reject/withdraw는 있으나 **작성자의 close/cancel 엔드포인트 부재**. filled 자동 전이만 있음 — 수동 종료·취소 불가능. | `mercenary.service.ts:252` acceptApplication에 closeFilledPost 호출, but no public close/cancel 메서드. |
| **F. 매치 완료 후 review_pending** | `matches.complete`는 `match_completed` 알림만 전송. 리뷰 독려 알림(review_pending)은 enum에는 있으나 **어디서도 트리거되지 않음**. | `matches.service.ts:731` — notifyParticipants type=match_completed, review_pending 호출 0건. |
| **G. 팀 매치 geo-fence** | personal match arrive는 200m Haversine 검증 (matches.service.ts:786-799). team-match checkIn은 lat/lng 저장만 하고 거리 검증 없음. | `team-matches.service.ts:339-350` — lat/lng 그대로 저장. |
| **H. 공개 프로필 페이지** | `GET /users/:id` 백엔드 존재. 프론트엔드 `/users/[id]/page.tsx` 라우트 부재 — 팀 applicant · mercenary applicant · team match opponent 신원 확인 경로 없음. | `apps/web/src/app/users/` 디렉토리 없음 확인됨. |
| **I. AI 팀 밸런싱 TODO** | `matches.service.ts:674` `// TODO: AI 기반 팀 밸런싱 로직 구현 / 현재는 단순 랜덤 배분` — 장기간 방치된 stub. | 동일 파일. |
| **J. 죽은 UI 버튼** | `/my/matches` "내가 만든 매치" stub, login password reset toast-only, admin lessons edit stub, `/badges` 하드코딩 fallback, badge awardIfEligible 미호출. | user-request verbatim. |
| **K. Polish** | `use-push-registration.ts:129-139` unsubscribe race (subscription.unsubscribe → API delete 순서 반대). chat read-receipt realtime broadcast 없음. typing indicator debounce 없음. | user-request verbatim. |

### 1.3 감사 원문 vs 코드 — 사실 정정 (builder가 죽은 가지를 따라가지 않도록)

- 감사 초안은 "mercenary.service.apply/accept/reject/withdraw 메서드 missing"이라 했으나 **실제로는 모두 존재함** (`mercenary.service.ts:209/252/334/366`, controller에도 노출됨 — `mercenary.controller.ts:122/137/152/167`). 진짜 갭은 **NotificationsService 주입 자체가 없는 것** + close/cancel 엔드포인트 부재 + accept 시 chat 자동 생성 없음.
- 감사 초안은 "teams apply/accept/reject 패턴은 team-matches 미러링"이라 했으나, **같은 파일 안에 있는 team invitation 패턴(teams.service.ts:331-552) 미러링이 더 정확함**. `inviteMember`(upsert + assertRole + notification), `acceptInvitation`(본인 검증 + 트랜잭션 + memberCount increment) 구조를 user-initiated apply 흐름으로 뒤집으면 그대로 맞음. 또한 이 파일은 이미 `NotificationsService` 주입 완료 상태이므로 추가 module import 불필요.
- 감사 초안은 "matches.complete가 review_pending 못 보냄"이라 했는데, 정확히는 **match_completed는 이미 보냄**(`matches.service.ts:731`). 진짜 갭은 completion 후 별도 타이머/리뷰 독려 흐름으로 review_pending을 쏘는 경로가 없다는 것. 본 task에서는 match_completed에 immediately follow-up으로 review_pending을 함께 fan-out하는 단순 버전을 채택 (장기: scheduler 도입은 out-of-scope).

### 1.4 Key principle drivers

- **Principle 1 (Tech Debt)**: audit에서 드러난 범위 내 TODO는 같은 task에서 해결한다. AI 팀 밸런싱 TODO(I)는 즉시 해결이 비합리적으로 크므로 **scope-split #71로 명시 분리**한다. geo-fence(G)·push race(K)·badge(J)는 저비용이므로 본 task에서 해결.
- **Principle 4 (Mock discipline)**: NotificationType enum 확장 시 `apps/api/prisma/seed.ts` + inline spec mock + MSW handler까지 **같은 브랜치에서** 업데이트.
- **Principle 5 (No silent skipping)**: 사용자 원문의 4가지 조건(알림 도달 / 멤버관리 조회 / 수락·거부 / 프로필·채팅 링크)이 아래 Original Conditions에 verbatim에 가깝게 살아 있어야 한다.
- **Principle 6 (Ambiguity → re-enter planning)**: 마켓플레이스 결제·에스크로 설계는 product 의사결정이 필요 — 본 task에서 **silent drop하지 않고 명시 deferral**로 처리.

---

## 2. Goal

1. **팀 가입 신청 라이프사이클**이 신청 → 호스트 알림 → 멤버관리 UI에서 수락/거부 → 신청자 알림까지 end-to-end 동작한다. 호스트는 applicant의 프로필을 조회하거나 1:1 채팅을 열 수 있다.
2. **알림 fan-out 누락** 8개 도메인(team apply, team-match apply·approve·reject, mercenary apply·accept·reject, review received, review pending after match complete, lesson ticket purchased, chat message)에 대해 `notificationsService.create` 호출을 주입하고 `NotificationType` enum 을 확장한다.
3. **채팅 자동 생성**을 team-match approve / mercenary accept / marketplace order completed 시점에 도입한다 (marketplace 부분은 #70으로 이연, 본 task는 team-match + mercenary까지).
4. **공개 프로필 페이지 `/users/[id]`** + **1:1 채팅 open** (`POST /chat/rooms` `type: direct`)가 applicant row에서 1-click 가능해야 한다.
5. **작은 잔부채 해소**: team-match geo-fence 이식 / web push unsubscribe race 수정 / badge awardIfEligible 연결 / dead button 정리(K 2건) / password reset toast 제거.
6. 마켓플레이스 lifecycle(Theme D)과 AI 팀 밸런싱(Theme I)은 **scope 분리 명시** — 본 doc 끝의 "Deferred" 섹션에 사유·follow-up 트리거 기록.

---

## 3. Original Conditions (verbatim traceable checkboxes)

### 3.1 사용자 원문 4조건
- [x] 팀 참여 신청 후 팀측에 알림 도달 (type: `team_application_received`, 수신자: team owner + managers)
- [x] 내 팀·멤버관리 UI에서 참여자(applicant) 목록 조회 가능 (`GET /teams/:id/applications`, manager+ 접근)
- [x] 참여자 수락·거부 기능 동작 (`PATCH /teams/:id/applications/:userId/{accept,reject}`, manager+ 권한, 신청자에게 `team_application_accepted/rejected` 알림)
- [x] 참여자 프로필 조회 또는 1:1 채팅으로 신원 확인 가능 (applicant row → `/users/:id` 링크 + "채팅 시작" 버튼 → `POST /chat/rooms` type=direct)

### 3.2 Theme B — 알림 fan-out 완성
- [x] `team-matches.service.apply` → host team owner+managers에게 `team_match_applied`
- [x] `team-matches.service.approveApplication` → applicant team owner+managers에게 `team_match_approved`
- [x] `team-matches.service.rejectApplication` → applicant team owner+managers에게 `team_match_rejected`
- [x] `mercenary.service.apply` → post author에게 `mercenary_applied`
- [x] `mercenary.service.acceptApplication` → applicant에게 `mercenary_accepted`
- [x] `mercenary.service.rejectApplication` → applicant에게 `mercenary_rejected`
- [x] `mercenary.service.closePost` (**신규 메서드**) → pending/accepted 신청자 전원에게 `mercenary_closed`
- [x] `mercenary.service.cancelPost` (**신규 메서드**) → 신청자 전원에게 `mercenary_cancelled`
- [x] `reviews.service.create` → reviewed userId에게 `review_received`
- [x] `matches.service.complete` → 참가자 전원에게 `match_completed`(기존) **와 즉시 follow-up `review_pending`** (본 task 신규)
- [x] `lessons.service`의 ticket 구매 후 instructor에게 `lesson_ticket_purchased` (현재 line 417에 1건만 호출 중 — 수신자·타입 정합성 검증하고 누락분 보강)

### 3.3 Theme C — 채팅 자동 생성
- [x] `team-matches.approveApplication` 트랜잭션 안에서 `ChatRoom` type=`team_match`, `teamMatchId` 연결 상태로 get-or-create, 두 팀 owner+managers를 `ChatParticipant`로 추가
- [x] `mercenary.acceptApplication` 트랜잭션 안에서 `ChatRoom` type=`direct` (post author ↔ accepted applicant) get-or-create
- [x] 두 경우 모두 시스템 메시지(`type: system`, `"매칭이 확정되었습니다"` / `"용병 지원이 수락되었습니다"`) 1건 주입

### 3.4 Theme H — 공개 프로필 페이지
- [x] `/users/[id]/page.tsx` 신규 — 닉네임·프로필 이미지·스포츠 프로필·manner score·최근 매치(선택) 공개 필드만 노출. PII(email·phone) 숨김.
- [x] `UserCard` 컴포넌트 재사용 가능 형태(`components/user/user-card.tsx`) — applicant row / mercenary applicant / team-match opponent에서 동일 컴포넌트 사용.
- [x] applicant row에 "프로필" + "채팅 시작" 버튼 (key 44x44 터치 타겟, `aria-label` 포함).

### 3.5 Theme F·G·K — 잔부채
- [x] `team-matches.service.checkIn`에 200m Haversine geo-fence 이식 (venue lat/lng 있을 때만; 없으면 skip, matches.arrive와 동일 규칙).
- [x] `use-push-registration.ts:129-139` — API `DELETE /notifications/push-unsubscribe` 호출 후에만 `subscription.unsubscribe()` 진행 (race 해소).
- [x] `badges.service.awardIfEligible()`를 **`matches.service.complete` 및 `team-matches.service.submitResult`**의 status `completed` 전이 지점 2곳에서 호출 (각 참가자/팀 멤버별). lesson completion은 scope 밖 (Task #72로 이연).
- [x] Dead button 제거 3건 + 1건 수정:
   - [x] `/my/matches:198` "내가 만든 매치" stub 제거 (또는 `GET /users/me/matches?role=host` 기반 실제 라우트로 교체)
   - [x] `(auth)/login:312` password reset toast 제거 또는 `/auth/reset-password` 경로로 연결
   - [x] `/admin/lessons:116` 편집 진입점 제거 (backend 미지원 confirmed)
   - [x] `/badges` 하드코딩 fallback 제거 → 실 API (`GET /badges/me`) 결과만 렌더

### 3.6 Theme D (Defer) · Theme I (Defer)
- [ ] **Theme D (마켓플레이스 결제 라이프사이클 + 에스크로 + 정산 payout + 분쟁 영속화)** — Task #70으로 분리. 이유: 에스크로 머니플로·정산 은행 송금·분쟁 증거 보관 정책은 product/finance 의사결정 필요 (Principle 6). 트리거: 사용자 또는 운영에서 결제 흐름 승인 문서 완성 시 #70 개시.
- [ ] **Theme I (AI 팀 밸런싱 TODO)** — Task #71로 분리. 이유: Elo-like skill rating 데이터 축적(minimum 100+ completed matches) + 매칭 알고리즘 설계 필요. 본 task에서는 존재 여부만 체크박스로 남기고 코드는 건드리지 않음. 트리거: ELO 통계 최소 표본 도달 + 설계 문서.

---

## 4. User Scenarios

### S1 — 팀 가입 신청 full loop (사용자 원문 직접 대응)
1. 비멤버 User A가 `/teams/:id` 상세에서 "팀 참여하기" 클릭.
2. (기존) `POST /teams/:id/apply` 201 OK. 신규: owner B + managers에게 `team_application_received` 알림.
3. Owner B의 `/notifications` 배지 증가, 클릭 시 `/teams/:id/members?tab=applicants`로 deep-link.
4. B는 applicant row에서 A의 "프로필" 버튼 → `/users/:id`에서 A의 manner score·스포츠 프로필 확인.
5. 필요 시 "채팅 시작" 버튼 → `POST /chat/rooms` type=direct → `/chat/:roomId` 진입.
6. B가 "수락" 클릭 → `PATCH /teams/:id/applications/:userId/accept`. TeamMembership status `pending→active`, memberCount +1. A에게 `team_application_accepted` 알림.
7. 또는 "거부" 클릭 → `PATCH .../reject`. status `pending→left` 또는 `removed`. A에게 `team_application_rejected` 알림.

### S2 — 팀 매치 승인 → 채팅방 자동 생성
1. Applicant team manager가 `POST /team-matches/:id/apply`.
2. 신규: host team owner+managers에게 `team_match_applied` 알림.
3. Host manager가 승인 `PATCH .../approve`. 기존: status 전이. 신규: applicant team owner+managers에게 `team_match_approved` 알림 + `ChatRoom(type=team_match, teamMatchId=...)` get-or-create + 양 팀 owner+managers `ChatParticipant` 추가 + 시스템 메시지 1건.
4. 양팀이 `/chat/:roomId`로 이동해 즉시 대화 가능.

### S3 — 공개 프로필 열람
1. User가 `/teams/:id/members`, `/mercenary/:id`, `/team-matches/:id` 중 어디서나 상대 닉네임 클릭.
2. `/users/:id` 라우트로 이동 (직접 URL 접근도 가능, 비로그인 시 `useRequireAuth` 미적용 — 공개 프로필은 로그인 불필요).
3. 닉네임 + 프로필 이미지 + 스포츠 프로필(레벨 포함) + manner score + 공개 최근 경기 수(optional) 표시. email/phone/birthYear는 절대 미표시.

### S4 — 매치 완료 → 리뷰 독려
1. Host가 `POST /matches/:id/complete`.
2. 기존: 참가자 전원에게 `match_completed` 알림.
3. 신규: 동일 트랜잭션/동일 호출 지점에서 `review_pending`도 참가자 전원에게 fan-out (title: "상대방을 평가해주세요", body: "경기가 끝났어요. 리뷰를 남기면 신뢰 점수가 올라가요").
4. 알림 클릭 시 `/reviews/new?matchId=...` 딥링크.

### S5 — 용병 승인 → 직접 채팅
1. Host가 `PATCH /mercenary/:id/applications/:appId/accept`.
2. 신규: applicant에게 `mercenary_accepted` 알림.
3. 신규: `ChatRoom(type=direct)` get-or-create (host ↔ applicant), 시스템 메시지 "용병 지원이 수락되었습니다".
4. 알림에서 "채팅 열기" 딥링크.

---

## 5. Test Scenarios

### 5.1 Happy path (Jest + Vitest + Playwright)
- **API Jest (unit)**:
  - `teams.service.spec.ts` — `acceptApplication`: pending membership → active, memberCount +1, notification spy called once with type=`team_application_accepted`.
  - 동일 — `rejectApplication`: pending → left/removed, notification fired.
  - 동일 — `listApplications`: manager+ 인증 통과 시 pending 목록 반환, user 서브셋에 nickname/profileImageUrl/mannerScore 포함.
  - `team-matches.service.spec.ts` — approveApplication 후 `ChatRoom.findFirst({ where: { teamMatchId }})` 결과 존재 + participants N명 + 시스템 메시지 1건.
  - `mercenary.service.spec.ts` — accept 후 chat room 생성 + applicant에게 알림.
  - `reviews.service.spec.ts` — create 후 reviewedId에 `review_received` 알림 fired.
  - `matches.service.spec.ts` — complete 후 participants × 2 (match_completed + review_pending) 알림 fired.
- **API integration (Supertest)**:
  - `test/integration/teams-application.e2e-spec.ts` (신규) — 비멤버 apply → owner 알림 DB 조회 → manager가 accept/reject → applicant 알림 DB 조회.
  - `test/integration/team-match-chat.e2e-spec.ts` (신규) — approve 후 `GET /chat/rooms` 조회에 새 room 포함.
- **Web Vitest**:
  - `apps/web/src/app/(main)/teams/[id]/members/page.test.tsx` — applicant tab 렌더, accept/reject 버튼 클릭 mutation 호출, profile/chat 링크 present.
  - `apps/web/src/app/users/[id]/page.test.tsx` (신규) — public 필드만 노출, email/phone 미표시.
- **Playwright E2E**:
  - `e2e/tests/team-application-flow.spec.ts` (신규) — applicant/owner 두 storageState로 2-user flow.
  - 기존 `team-manager-membership.spec.ts`에 applicant 탭 assertion 확장.

### 5.2 Edge cases
- 이미 active member인 사용자가 apply → 409 `TEAM_ALREADY_MEMBER` (기존 유지).
- accept 시 동시성 — `P2034` 감지 후 `ConflictException` (mercenary accept 패턴 참조).
- 호스트가 자기 자신을 accept → 검증 단계에서 막기 (applicant.userId === team.ownerId).
- team-match approve 시 chat room 이미 존재 → get-or-create → no duplicate.
- review_pending fan-out 중 push service disabled → 알림 DB row는 생성되고 push만 fail-safe(fire-and-forget).

### 5.3 Error paths
- Reject 후 다시 apply → 기존 로직으로 status reset (teams.service.ts:306-309 동작 유지, 알림은 재발송).
- Chat room 생성 실패(DB) → 팀 매치 approve 트랜잭션 롤백 (`$transaction` 블록 안에서 함께 묶기).
- Prisma enum 확장 전에 빌드된 API 버전이 신규 타입을 보내면 기본값 `match_created`로 fallback 금지 → 명확한 enum validation error.

### 5.4 Mock data updates (Principle 4)
- **Inline unit mocks to update** (해당 spec의 기존 inline 모델 fixture에 추가 필드/타입 값 반영):
  - `apps/api/src/teams/teams.service.spec.ts` — `NotificationsService` 주입 mock fn 추가, `acceptApplication`/`rejectApplication`/`listApplications` describe 블록 3개 신규.
  - `apps/api/src/team-matches/team-matches.service.spec.ts` — `NotificationsService` + `ChatService` mock 주입, 신규 assertion: approve 후 chat create spy 1회.
  - `apps/api/src/mercenary/mercenary.service.spec.ts` — 동일 패턴. 기존 accept/reject spec에 notification spy assertion 추가 + **신규 describe: `closePost`/`cancelPost`** (작성자 권한, status 전이, pending 신청자 일괄 fan-out 검증).
  - `apps/api/src/reviews/reviews.service.spec.ts` — notification spy.
  - `apps/api/src/matches/matches.service.spec.ts` — `complete` describe 블록에 review_pending assertion 추가.
  - `apps/api/src/notifications/notifications.service.spec.ts` — 신규 14개 NotificationType 값에 대해 category 매핑 테이블 확장 (`notification-presentation.ts`의 `notificationCategory` 반영).
- **Prisma seed** (`apps/api/prisma/seed.ts` + `seed-mocks.ts`) — 신규 NotificationType 샘플 알림 각 1건 시드 (읽음/안읽음 분산).
- **MSW handlers** (`apps/web/src/test/msw/handlers.ts`) — `GET /teams/:id/applications`, `PATCH /teams/:id/applications/:userId/{accept,reject}`, `GET /users/:id` 핸들러 3개 추가. 기존 알림 핸들러 응답에 신규 type 포함.
- **E2E seed**: `e2e/global-setup.ts` — applicant 페르소나 sinaro가 team A에 pending 상태로 신청된 fixture 추가.
- **Fixture factory**: `apps/api/test/fixtures/teams.ts` — `pendingApplication` 생성 헬퍼. `chat.ts` (신규) — `directRoom` / `teamMatchRoom` 생성 헬퍼.

---

## 6. Parallel Work Breakdown

### Wave 0 — Prisma schema 확장 (직렬, backend-data-dev 단독)

**유일한 직렬 포인트.** 이후 모든 wave는 이 migration을 기준으로 컴파일된다.

**Owned files (backend-data-dev 단독)**:
- `apps/api/prisma/schema.prisma` — `NotificationType` enum에 아래 값들 추가:
  - `team_application_received`, `team_application_accepted`, `team_application_rejected`
  - `team_match_applied`, `team_match_approved`, `team_match_rejected`
  - `mercenary_applied`, `mercenary_accepted`, `mercenary_rejected`, `mercenary_closed`, `mercenary_cancelled`
  - `review_received`
  - `lesson_ticket_purchased`
  - `chat_message` (future-proof; 본 task에서는 스키마만 추가하고 발송은 미도입)
  - (audit의 `marketplace_order_placed`, `marketplace_order_shipped`는 Task #70으로 이연 — 스키마 추가도 #70에서 함께)
- `apps/api/prisma/schema.prisma` — **`ChatMessage.senderId`를 `String?` (nullable)로 완화** (검증됨: 현재 1168행 non-null). 신규 `type: 'system'` 메시지는 senderId 없이 저장. 또는 대체안으로 `ChatMessage`에 `senderType` enum 추가 대신 nullable 완화가 최소 변경. 마이그레이션은 ALTER COLUMN DROP NOT NULL.
- `apps/api/prisma/migrations/XXXX_notification_type_expansion/migration.sql` (신규)
- `apps/api/src/notifications/notification-presentation.ts` — `notificationCategory()`에 신규 타입을 `match` / `team` / `chat` / `payment` 중 적절 카테고리로 매핑.

**Migration strategy (safe enum addition)**:
- PostgreSQL `ALTER TYPE ... ADD VALUE` — 기존 row에 영향 없음, 롤백 시 enum value 제거만 필요 (Prisma migrate reset 경로 문서화).
- 배포 순서: migrate → 백엔드 배포 → 프론트 배포 (프론트가 enum 몰라도 unknown은 그대로 무시하도록 `presentNotification` fallback 유지).

**완료 조건**: `pnpm db:migrate` 로컬 성공 + `pnpm --filter api exec tsc --noEmit` 통과 + `NotificationType.team_application_received` 타입 import 가능.

**블로커**: 이 wave가 머지되기 전까지 Wave 1 모든 sub-task 시작 금지.

---

### Wave 1 — 핵심 기능 구현 (병렬, 4 agents)

파일 도메인이 수직 분리되어 있어 충돌 없음. 각 에이전트는 자기 owned 파일만 수정하고 다른 에이전트의 파일을 건드리지 않는다.

#### 1A. backend-api-dev — Teams application lifecycle (Theme A)
**Owned files**:
- `apps/api/src/teams/teams.service.ts` (신규 메서드 3개: `acceptApplication`, `rejectApplication`, `listApplications`)
- `apps/api/src/teams/teams.controller.ts` (신규 엔드포인트 3개)
- `apps/api/src/teams/dto/application.dto.ts` (신규)

**미러링 기준**: **같은 파일의 `inviteMember`/`acceptInvitation`/`declineInvitation` 패턴** (line 331-552). 차이점: user-initiated apply는 이미 존재하므로 upsert 대신 pending membership row를 직접 전이.

**구현 스케치**:
```ts
async listApplications(teamId: string, userId: string) {
  await this.membershipService.assertRole(teamId, userId, 'manager');
  return this.prisma.teamMembership.findMany({
    where: { teamId, status: 'pending' },
    include: { user: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true }}},
    orderBy: { createdAt: 'desc' },
  });
}
async acceptApplication(teamId: string, applicantUserId: string, managerUserId: string) {
  await this.membershipService.assertRole(teamId, managerUserId, 'manager');
  // transaction: pending → active, memberCount +1, notify applicant
  // mirror team-matches.approveApplication:191-219 transaction shape
}
async rejectApplication(teamId: string, applicantUserId: string, managerUserId: string) { /* status → left, notify */ }
```

**Apply 메서드 수정**: 기존 `teams.service.ts:285 applyToTeam`에 owner+manager 대상 fan-out 추가 (team membership 목록 조회 후 `Promise.all(notificationsService.create(...))`).

**Do NOT touch**: `apps/api/src/team-matches/*`, `apps/api/src/mercenary/*`, `apps/api/src/chat/*`, `schema.prisma`, `notifications.service.ts`, 프론트엔드 모든 파일.

#### 1B. backend-integration-dev — Notification fan-out + chat auto-create (Theme B · C · E · F)
**Owned files**:
- `apps/api/src/team-matches/team-matches.service.ts` (apply/approve/reject에 notify + approve 트랜잭션에 chat create)
- `apps/api/src/team-matches/team-matches.module.ts` (NotificationsModule, ChatModule imports 추가)
- `apps/api/src/mercenary/mercenary.service.ts` (apply/accept/reject notify + accept 시 chat create + **`closePost(id, userId)` / `cancelPost(id, userId)` 신규 메서드** — 작성자 또는 팀 manager+ 권한 검증, pending→withdrawn/rejected 일괄 처리, 신청자 fan-out)
- `apps/api/src/mercenary/mercenary.controller.ts` (**신규 엔드포인트 2개**: `POST /mercenary/:id/close`, `POST /mercenary/:id/cancel`)
- `apps/api/src/mercenary/mercenary.module.ts` (imports 추가)
- `apps/api/src/reviews/reviews.service.ts` (create 시 reviewed에게 notify)
- `apps/api/src/reviews/reviews.module.ts` (imports 추가)
- `apps/api/src/matches/matches.service.ts` (`complete` 메서드에 review_pending fan-out 한 줄 추가)
- `apps/api/src/lessons/lessons.service.ts` (ticket 구매 flow 재검토, 누락분 보강)
- `apps/api/src/chat/chat.service.ts` (신규 헬퍼 `createOrGetRoomForTeamMatch(teamMatchId, participantUserIds)`, `createOrGetDirectRoom(userA, userB)`, 시스템 메시지 주입)

**Chat auto-create 패턴**:
```ts
// chat.service.ts에 공개 헬퍼 추가
async getOrCreateTeamMatchRoom(teamMatchId: string, participantUserIds: string[]) {
  const existing = await this.prisma.chatRoom.findUnique({ where: { teamMatchId }});
  if (existing) return existing;
  return this.prisma.chatRoom.create({
    data: {
      type: 'team_match',
      teamMatchId,
      participants: { create: participantUserIds.map(uid => ({ userId: uid })) },
      messages: { create: { type: 'system', content: '매칭이 확정되었습니다', senderId: null }},
    },
  });
}
```

**Team match approve 안에서 호출**: 호스트 팀 owner+managers + applicant 팀 owner+managers userIds 수집 → `getOrCreateTeamMatchRoom` 호출 (같은 `$transaction` 블록 안).

**Do NOT touch**: `teams.service.ts` (1A 담당), `schema.prisma`, 프론트엔드 모든 파일.

#### 1C. frontend-data-dev — 신규 API hooks
**Owned files**:
- `apps/web/src/hooks/use-api.ts` — 신규 hooks:
  - `useTeamApplications(teamId)` — `GET /teams/:id/applications`, manager+ 권한 전제
  - `useAcceptTeamApplication()` — mutation → invalidate `['team-applications', teamId]` + `['team-members', teamId]`
  - `useRejectTeamApplication()` — 동일 패턴
  - `useUserPublicProfile(userId)` — `GET /users/:id`
  - `useStartDirectChat()` — `POST /chat/rooms` type=direct, redirect helper
- `apps/web/src/types/api.ts` — 신규 타입: `TeamApplication`, `UserPublicProfile`, `NotificationType` union 확장
- `apps/web/src/test/msw/handlers.ts` — 신규 3개 핸들러 추가

**Do NOT touch**: `teams/[id]/members/page.tsx`, `users/[id]/page.tsx` (1D 담당), 백엔드 모든 파일.

#### 1D. frontend-ui-dev — 멤버관리 UI 확장 + 공개 프로필 페이지 (Theme A · H)
**Owned files**:
- `apps/web/src/app/(main)/teams/[id]/members/page.tsx` — applicant 섹션 신규 (역할별 tab `members | applicants`, manager+ 에게만 applicants tab 노출)
- `apps/web/src/components/user/user-card.tsx` (신규) — 재사용 가능 Card: avatar + nickname + sport profile + manner + CTA slots (profile link, chat button)
- `apps/web/src/app/users/[id]/page.tsx` (신규) — public profile 페이지
- `apps/web/src/app/users/[id]/loading.tsx`, `apps/web/src/app/users/[id]/not-found.tsx`

**Applicant row UI 계약**:
- avatar + nickname + sport profile primary + manner score
- 2 action buttons: "프로필" (`/users/:id`) + "채팅" (`POST /chat/rooms` direct → `/chat/:id`)
- 1 primary CTA: "수락" (blue) / "거부" (red outline) — 각 44x44 touch target, `aria-label` 포함
- pending state 중엔 `disabled:opacity-50` + spinner

**Public profile 필드** (PII 보호):
- 노출 OK: `nickname`, `profileImageUrl`, `sportProfiles[]` (sportType, level only), `mannerScore`, `createdAt` (가입일)
- 절대 노출 금지: `email`, `phone`, `birthYear`, `realName`, `passwordHash`, `address`

**Do NOT touch**: 백엔드, `hooks/use-api.ts`, `types/api.ts`.

---

### Wave 2 — 잔부채 해소 (병렬, 3 agents)

Wave 1과 Wave 2는 원칙적으로 파일 충돌이 없으므로 동시 시작 가능. 단 Wave 1 리뷰 결과에 따라 순서를 조정할 수 있음.

#### 2A. backend-integration-dev (Theme G, J badge 연결)
- `team-matches.service.ts:291-351 checkIn`에 matches.arrive의 200m Haversine 로직 이식. venue 좌표는 `venueInfo` JSON 필드 또는 별도 `venueId` 존재 여부로 분기 (DTO 확인 필요).
- `matches.service.ts:complete`에 `badges.service.awardIfEligible(participantId, 'match_completed')` 참가자별 호출.
- `team-matches.service.submitResult`의 status `completed` 전이 지점에 `badges.service.awardIfEligible(memberId, 'team_match_completed')` 양 팀 owner+managers 대상 호출.
- **중요**: `matches.service.ts`는 §6 Ambiguity #9 결정에 따라 Wave 1B(backend-integration-dev)가 단독 소유. review_pending 추가(Wave 1B) + badge 호출 추가(Wave 2A) + team-match geo-fence 이식은 **모두 같은 agent (backend-integration-dev)의 1 PR 또는 순차 2 PR**로 처리. Wave 2A는 Wave 1B 머지 후 순차로 수행 가능.

#### 2B. backend-api-dev (Theme J)
- `/admin/lessons/:id` 편집 지원 여부 확인 → 미지원 확인되면 UI 쪽(2C)에 신호.
- `users.service.ts` public profile projector 함수 `toPublicProfile(user)` 추가 (PII strip) — 1D가 사용하는 `GET /users/:id` 핸들러가 이 projector를 거치도록.

#### 2C. frontend-ui-dev (Theme J · K)
- `/my/matches:198`에서 "내가 만든 매치" stub 제거 (또는 실 API로 대체).
- `(auth)/login:312` password reset toast 교체: 경로 미구현이면 deterministic disabled 상태로.
- `/admin/lessons:116` edit entrypoint 제거.
- `/badges/page.tsx` 하드코딩 fallback 제거, `useMyBadges()` 빈 상태는 기존 `EmptyState` 사용.
- `apps/web/src/hooks/use-push-registration.ts:129-139` — unsubscribe 순서 수정 (API DELETE 성공 확인 후 subscription.unsubscribe).

---

### Wave 3 — Docs, seed, E2E (순차, docs-writer + qa-regular)

- `apps/api/prisma/seed.ts` + `seed-mocks.ts`에 신규 알림 타입 샘플 + pending team application 샘플 + direct/team_match chat room 샘플 시드 (Task 67과 연계 가능 시 해당 PR에 병합 제안).
- `e2e/tests/team-application-flow.spec.ts` 신규 + `e2e/global-setup.ts`에 applicant fixture.
- CLAUDE.md의 "API 엔드포인트 → 팀" 섹션에 신규 3개 엔드포인트 반영.
- `docs/scenarios/04-team-and-membership.md` 업데이트 (Task 31 확장).

---

### Deferred (명시 이연, silent drop 아님)

- **Task #70 (TBD)** — Marketplace lifecycle + escrow + settlements payout + disputes persistence (Theme D). 트리거: 결제 흐름 product 의사결정 문서화.
- **Task #71 (TBD)** — AI 팀 밸런싱 알고리즘 (Theme I). 트리거: 완료 매치 100건+ 통계 확보 + ELO 설계 문서.

---

## 7. Acceptance Criteria

### 7.1 기능 acceptance
- S1–S5 모든 scenario가 E2E로 재현 가능.
- Original Conditions 3.1–3.5 전 체크박스 ✓.
- 신규 NotificationType 12개(본 task scope) 전부 seed에 최소 1건, `notificationCategory` 매핑 완비.

### 7.2 검증 gate
- `pnpm --filter api exec tsc --noEmit` — green
- `pnpm --filter web exec tsc --noEmit` — green
- `pnpm --filter api test` — 모든 기존 suite + 신규 describe 블록 green (coverage delta: teams/team-matches/mercenary/reviews/matches services별 +3–5 cases)
- `pnpm --filter api test:integration` — 신규 `teams-application.e2e-spec.ts` + `team-match-chat.e2e-spec.ts` green
- `pnpm --filter web test` — 신규 `members/page.test.tsx` + `users/[id]/page.test.tsx` green
- `npx playwright test team-application-flow.spec.ts` — green (mobile + desktop)

### 7.3 품질 gate
- Applicant row / public profile 페이지 4.5:1 대비 + 44x44 터치 타겟 + keyboard focus + dark mode 4.5:1 확인.
- Notification 알림함 딥링크가 4개 신규 타입 모두 정확히 대응.
- 공개 프로필 페이지에서 email/phone/birthYear 네트워크 탭에서도 비노출 확인 (백엔드 projector 기준).

---

## 8. Tech Debt Resolved

1. **Team application 반쪽 상태** (apply만 있고 accept/reject 없음) — 이 task에서 전량 해결.
2. **NotificationType 14개 fan-out 누락** — 이 task에서 12개 해결 (마켓플레이스 2개는 #70).
3. **Chat 수동 생성만 존재, 트리거 없음** — team-match approve · mercenary accept 2개 트리거 도입.
4. **Team match geo-fence 부재** — matches.arrive 200m 로직 이식으로 parity 달성.
5. **Web push unsubscribe race** — API delete 선행으로 해소.
6. **Badge awardIfEligible 미호출 dead code** — 최소 1 도메인에 연결.
7. **Dead UI button 4건** — 3건 제거 + 1건 실 API 연결.

---

## 9. Security Notes

### 9.1 신규 엔드포인트 threat model
- `GET /teams/:id/applications` — `TeamMembershipService.assertRole(teamId, userId, 'manager')` 필수. member는 접근 차단 (403).
- `PATCH /teams/:id/applications/:userId/{accept,reject}` — 동일. 추가로 target applicant가 실제 pending 상태인지 서비스 레이어에서 검증 (이미 active면 400, 존재하지 않으면 404).
- `GET /users/:id` — 이미 존재. PII strip projector를 본 task에서 확정 (`toPublicProfile`). 응답에 `email`, `phone`, `birthYear`, `realName`, `passwordHash` 비노출.
- Chat auto-create — 참여자가 아닌 userId가 `ChatParticipant`로 추가되지 않도록 서비스 레이어에서 owner+manager 조회 결과만 사용 (외부 입력 없음).

### 9.2 알림 PII 경계
- 신규 알림 `data` 필드에 applicant의 nickname은 가능, profileImageUrl은 OK, phone/email 금지. 서비스 호출 지점에서 `data`에 넣는 필드 명시적 화이트리스트.

### 9.3 기타
- `/users/:id` 라우트는 로그인 불필요 (공개 프로필). 단, viewer에게 sensitive한 필드는 없음을 최종 확인.
- Socket.IO chat auto-join 시 realtime 게이트웨이의 JWT 핸드셰이크는 기존 흐름 그대로 사용 (추가 변경 없음).
- 기존 `UserBlocksService` 체크 (`notifications.service.ts:35`)가 신규 알림에도 작동하는지 자동 검증.

---

## 10. Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Wave 0 enum migration이 production DB에서 실패 | PostgreSQL `ALTER TYPE ADD VALUE`는 append-only로 안전. staging에서 먼저 migrate → verify → promote. 롤백 시 새 enum value 사용 전이라면 `ALTER TYPE ... RENAME VALUE` 또는 수동 SQL로 제거. |
| Wave 1 4 agent 병렬 실행 중 module 주입 충돌 (예: mercenary.module.ts에 chat 추가 시 chat이 mercenary를 역참조하면 circular) | `forwardRef` 사용 (`notifications.service.ts:16` 패턴 참조). chat → mercenary 참조는 없으므로 위험 낮음. |
| Chat room auto-create가 team-match approve transaction 안에서 실패해 rollback 시 사용자 혼란 | `$transaction` 블록 안에서 함께 묶어 원자성 보장. 에러 메시지는 "매칭 승인은 완료됐어요. 채팅방은 잠시 후 자동 생성됩니다" 대신 **실패 시 둘 다 롤백**이 더 안전. |
| Public profile 페이지에서 의도치 않게 PII 노출 | 서비스 레이어 projector `toPublicProfile` 를 단일 진입점으로 강제. controller에서는 이 함수를 거치지 않은 응답 금지. 리뷰어 Critical 대상. |
| review_pending 알림이 match_completed와 중복 느낌 | body 문구를 명확히 구분 ("상대를 평가해주세요"). frontend 알림함에서 같은 matchId의 두 알림이 인접하면 시각적 구분 확인. |
| 마켓플레이스 Theme D를 #70으로 분리했지만 사용자 기대와 괴리 | 본 doc §2.6과 §6 Deferred 섹션에 사유·트리거 명시. `pnpm dev` 기동 시 `/marketplace` 배너 문구를 "결제 기능은 준비 중입니다 (Task #70)"로 유지. |

### 10.1 Inter-task dependencies
- Task 67 (mock data overhaul) Planning 상태 — **결정 트리**:
  - (a) 69 시작 시점에 67이 **active** (작업 진행 중 또는 PR open) → 69의 `prisma/seed.ts` + MSW handler 변경은 **67 브랜치에 얹는다**. 69는 seed 변경 없이 코드 구현만.
  - (b) 69 시작 시점에 67이 **inactive** (Planning만, 미착수) → 69가 seed 변경 포함해 그대로 진행. 67 재개 시 rebase는 67이 책임.
  - 오케스트레이터가 69 착수 직전 `.github/tasks/67-*.md` 상태 확인 후 (a)/(b) 선택, 결정 사항을 69 PR description에 기록.
- Task 31 TDD rollout Docs (scenarios/04) 업데이트 필요 — Wave 3 docs-writer가 함께 처리.
- **`presentNotification` fallback 검증 완료 (2026-04-18)**: `notification-presentation.ts:75, 117, 144`에 `default:` branch 존재 (`return 'system'` / `return null`). 프론트가 신규 enum 몰라도 category=system, link/ctaLabel=null로 안전하게 렌더. 따라서 "migrate → 백엔드 → 프론트" 롤아웃 가정 유효.

---

## 11. Ambiguity Log

| # | Question | Resolution |
|---|----------|------------|
| 1 | `team_application_received` 알림 수신자 범위 — owner만인가 manager도 포함인가? | **owner + managers 모두**. `TeamMembership.findMany({ where: { teamId, role: { in: ['owner', 'manager'] }, status: 'active' }})` 기준. 사용자 원문 "팀측에서 알림"은 운영진 전원으로 해석. |
| 2 | `/users/:id` 노출 필드 중 "최근 매치 수" 포함 여부 | **optional, 공개 필드만**. `sportProfiles.matchCount` 집계값이 이미 public이면 노출, 개별 matchId·상세 경기 리스트는 비노출. 리뷰어가 필요 시 축소. |
| 3 | team-match approve 시 chat 참여자 범위 — 두 팀의 모든 active 멤버 vs owner+managers만 | **owner+managers만** (초기). 전체 멤버는 UX 노이즈 가능 + scale 문제 (팀당 20-30명). member가 채팅 원하면 별도 1:1 direct room 생성 경로 유지. |
| 4 | mercenary accept 시 auto-create chat room type | **`direct`**, host ↔ applicant 2인. `team_match` 타입은 team 단위이므로 mercenary용 신규 type enum 추가는 불필요 (현 ChatRoomType enum으로 충분). |
| 5 | review_pending 알림을 matches.complete 동일 트랜잭션에 둘 것인가 vs 분리? | **동일 트랜잭션 안에 fan-out**. 이미 match_completed가 같은 방식으로 fan-out 중이므로 패턴 일관성 우선. 장기적으로 scheduler 기반 지연 알림은 out-of-scope. |
| 6 | `team_application_rejected` 후 신청자가 재신청 가능한가? | **가능** (기존 `applyToTeam`에 `left/removed` 상태 복원 경로 존재, teams.service.ts:304-309). accept/reject 결과 status는 각각 `active` / `left` (거절을 removed로 쓰면 재신청 영구 차단됨 — `left`가 정답). |
| 7 | 채팅방 시스템 메시지의 `senderId` — system user 필요한가? | **검증 완료 (2026-04-18)**: 현재 `schema.prisma:1168`의 `senderId String @map("sender_id")`는 non-nullable. → **Wave 0에서 `String?`로 완화**한다 (section §6 Wave 0 owned files에 추가됨). 신규 `type: 'system'` 메시지는 senderId 없이 저장. 기존 non-null row는 그대로 유지되므로 ALTER COLUMN DROP NOT NULL로 안전. |
| 8 | 신규 Vitest test 파일 경로 convention | 페이지 컴포넌트는 `page.test.tsx`, 훅은 `__tests__/use-foo.test.tsx`. 프로젝트 기존 pattern (`apps/web/src/hooks/__tests__/*.test.tsx`) 따름. |
| 9 | Wave 1과 Wave 2 병렬 시 `matches.service.ts` 동시 수정 위험 | **같은 파일이므로 1B와 2A 합침**. `complete` 메서드에 review_pending 추가(1B)와 badge awardIfEligible 추가(2A)를 1개 agent (backend-integration-dev)가 1 PR로 처리. |

---

## 12. Out-of-scope (명시)

- 마켓플레이스 escrow / refund / dispute → Task #70
- AI 팀 밸런싱 → Task #71
- 실시간 chat typing indicator · read-receipt realtime broadcast → polish 백로그
- FCM / 네이티브 푸시 infrastructure → #69-K에서는 웹 push race만 해소, 모바일은 별도
- 관리자 신규 알림 센터 — 본 task는 end-user notification만 다룸
- `lessons`의 출석 API / 세션 차감 / 만료 enforcement → Task #72 (lessons lifecycle completion, 필요 시 신규 task)

---

## 13. Validation plan (타임 기대치)

- Wave 0 migration: 30분
- Wave 1 병렬 4 agents: 1.5~2 days (각 agent 12~16 files, 직접 겹침 없음)
- Wave 2 병렬 3 agents: 0.5~1 day
- Wave 3 docs + E2E seed: 0.5 day
- Total (ideal): 3~4 days. 2 review round 포함 시 1 week 내 PR merge ready.

---

## 14. References

- `apps/api/src/teams/teams.service.ts:285 applyToTeam` — 신청 기존 로직 (재사용)
- `apps/api/src/teams/teams.service.ts:331-552 inviteMember/acceptInvitation/declineInvitation` — **미러링 기준 패턴**
- `apps/api/src/team-matches/team-matches.service.ts:191-236 approveApplication/rejectApplication` — fan-out + transaction 베스트 참조
- `apps/api/src/matches/matches.service.ts:786-799 arrive geo-fence` — 200m Haversine 이식 대상
- `apps/api/src/notifications/notifications.service.ts:24-80 create` — 알림 진입점, `fromUserId` 옵션으로 block 체크
- `apps/api/src/chat/chat.service.ts:199 createRoom` — 확장 기준
- `apps/web/src/app/(main)/teams/[id]/members/page.tsx` — applicant tab 추가 대상
- `apps/web/src/hooks/use-api.ts` — 신규 hooks 추가 위치
- `apps/web/src/hooks/use-push-registration.ts:129-139` — race 수정 대상

---

## 15. Change log

- 2026-04-18 — 초안 작성 (tech-planner + project-director joint). Audit 원문 vs 실제 코드 불일치 3건 정정 (mercenary 존재 확인 / teams invitation 패턴을 미러링 기준으로 교체 / matches.complete는 이미 match_completed 전송). Marketplace/AI balancing은 #70/#71으로 명시 이연.
- 2026-04-18 — 리뷰 반영: (a) mercenary close/cancel 누락 복원 (Wave 1B에 흡수, NotificationType 2개 추가), (b) `ChatMessage.senderId`를 nullable로 완화하는 schema 변경을 Wave 0에 추가 (검증: 현재 non-null), (c) Task 67 coordination을 명시 결정 트리로 전환, (d) badge scope를 "최소 1"에서 match + team-match 2개로 특정, (e) `presentNotification` default fallback 존재를 코드 검증으로 확정 (§10.1).
- 2026-04-18 — 구현 완료. **Wave 0 (serial, backend-data-dev)**: `NotificationType` +14값 추가, `ChatMessage.senderId` nullable 완화, migration `20260418000000_notification_type_expansion_and_system_messages`, `notification-presentation.ts` 카테고리 매핑 완성, seed/fixture 업데이트. **Wave 1 (4-way parallel)**: (1A) teams application lifecycle 3 service 메서드 + 3 컨트롤러 엔드포인트 + DTO; (1B) team-matches/mercenary/reviews/matches/lessons/chat 서비스에 알림 fan-out + chat auto-create + `closePost`/`cancelPost` 신규 메서드; (1C) hooks 7개 신규(`useTeamApplications`, `useAcceptTeamApplication`, `useRejectTeamApplication`, `useUserPublicProfile`, `useStartDirectChat`, `useCloseMercenaryPost`, `useCancelMercenaryPost`) + MSW handler 9개; (1D) `/users/[id]` 페이지·loading·not-found 신규, `UserCard` 컴포넌트, members page applicant 탭, dead button 4건 정리. **리뷰 라운드 1**: backend PASS-WITH-FIXES(Critical 1: 죽은 TODO 주석), frontend REWORK(Critical 3: 채팅 CTA 깨짐, PII 테스트 부실, deep-link 테스트 부재) → 수정 완료. **디자인 라운드**: design-main/ux-manager/ui-manager 모두 PASS-WITH-FIXES → 포커스 링 15개 + skeleton 토큰 + `mercenary_accepted` chatRoomId 수정 완료. **QA 라운드**: beginner 6/7, regular 5/7, power 7/9 BLOCKING(teams acceptApplication race, h-18 토큰, 빈 copy), uiux 25/29 → 수정 완료. **최종 검증**: tsc green(web+api), API 620/620, Web 336/336. 상태 → Completed.
