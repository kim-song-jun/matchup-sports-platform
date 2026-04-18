# Task 69 Completion Report — 2026-04-18

## Summary

11개 테마(A–K)로 분류된 미구현/반쪽 구현 기능을 end-to-end로 완성했다. 팀 가입 신청 라이프사이클(신청→호스트 알림→수락·거부→신청자 알림), 8개 도메인 알림 fan-out, team-match approve/mercenary accept 시 채팅 자동 생성, 공개 프로필 페이지, 5건의 잔부채 해소가 포함된다. 마켓플레이스 결제 라이프사이클(Theme D)과 AI 팀 밸런싱(Theme I)은 명시 scope-split으로 이연했다.

## Original conditions met

### §3.1 사용자 원문 4조건
- [x] 팀 참여 신청 후 팀측에 알림 도달 (type: `team_application_received`, 수신자: team owner + managers)
- [x] 내 팀·멤버관리 UI에서 참여자(applicant) 목록 조회 가능 (`GET /teams/:id/applications`, manager+ 접근)
- [x] 참여자 수락·거부 기능 동작 (`PATCH /teams/:id/applications/:userId/{accept,reject}`, manager+ 권한, 신청자에게 알림)
- [x] 참여자 프로필 조회 또는 1:1 채팅으로 신원 확인 가능 (applicant row → `/users/:id` + "채팅 시작" → `POST /chat/rooms`)

### §3.2 Theme B — 알림 fan-out 완성
- [x] `team-matches.service.apply` → host team owner+managers에게 `team_match_applied`
- [x] `team-matches.service.approveApplication` → applicant team owner+managers에게 `team_match_approved`
- [x] `team-matches.service.rejectApplication` → applicant team owner+managers에게 `team_match_rejected`
- [x] `mercenary.service.apply` → post author에게 `mercenary_applied`
- [x] `mercenary.service.acceptApplication` → applicant에게 `mercenary_accepted`
- [x] `mercenary.service.rejectApplication` → applicant에게 `mercenary_rejected`
- [x] `mercenary.service.closePost` → pending/accepted 신청자 전원에게 `mercenary_closed`
- [x] `mercenary.service.cancelPost` → 신청자 전원에게 `mercenary_cancelled`
- [x] `reviews.service.create` → reviewed userId에게 `review_received`
- [x] `matches.service.complete` → 참가자 전원에게 `match_completed` + 즉시 follow-up `review_pending`
- [x] `lessons.service` ticket 구매 후 instructor에게 `lesson_ticket_purchased`

### §3.3 Theme C — 채팅 자동 생성
- [x] `team-matches.approveApplication` 트랜잭션에서 `ChatRoom(type=team_match, teamMatchId=...)` get-or-create + 양 팀 owner+managers를 `ChatParticipant`로 추가
- [x] `mercenary.acceptApplication` 트랜잭션에서 `ChatRoom(type=direct)` get-or-create (host ↔ applicant)
- [x] 두 경우 모두 시스템 메시지 1건 주입

### §3.4 Theme H — 공개 프로필 페이지
- [x] `/users/[id]/page.tsx` 신규 (공개 필드만, PII 숨김)
- [x] `UserCard` 컴포넌트 신규 (`components/user/user-card.tsx`)
- [x] applicant row에 "프로필" + "채팅 시작" 버튼 (44x44 터치 타겟, `aria-label`)

### §3.5 Theme F·G·K — 잔부채
- [x] `team-matches.service.checkIn` 200m Haversine geo-fence 이식
- [x] `use-push-registration.ts` unsubscribe race 해소 (API DELETE 선행)
- [x] `badges.service.awardIfEligible()` `matches.complete` + `team-matches.submitResult` 2곳 연결
- [x] Dead button 4건 정리 (my/matches stub, login password reset toast, admin/lessons edit, badges fallback)

### §3.6 (Deferred — 미완료 유지)
- [ ] Theme D (마켓플레이스 결제 라이프사이클) → Task #70
- [ ] Theme I (AI 팀 밸런싱) → Task #71

## Scope shipped

- **Backend**: 5개 신규 엔드포인트 (`GET /teams/:id/applications`, `PATCH /teams/:id/applications/:userId/accept`, `PATCH /teams/:id/applications/:userId/reject`, `POST /mercenary/:id/close`, `POST /mercenary/:id/cancel`), 서비스 메서드 ~18개 신규/수정, 알림 fan-out 11개 도메인 이벤트, 2개 통합 테스트 신규
- **Frontend**: 7개 신규 훅, 3개 신규 페이지/파일(`/users/[id]` + loading + not-found), `UserCard` 컴포넌트, members page applicant 탭, MSW handler 9개, dead button 4건 제거
- **Migration**: `NotificationType` +14값, `ChatMessage.senderId` nullable 완화 (`20260418000000_notification_type_expansion_and_system_messages`)

## Pipeline metrics

- Wave 0: 1 agent serial (backend-data-dev)
- Wave 1: 4 agents parallel (backend-data-dev ⟂ backend-api-dev ⟂ frontend-data-dev ⟂ frontend-ui-dev)
- 리뷰 라운드: 3회 (backend+frontend 병렬 리뷰 후 수정 × 2, 디자인 라운드 × 1)
- QA 라운드: 1회 (4 personas)
- 최종 테스트: API 620/620, Web 336/336
- 변경 파일: ~40

## Key decisions

- **Teams application 패턴**: team-matches 계약이 아닌 같은 파일 내 `inviteMember`/`acceptInvitation` 패턴을 미러링 (NotificationsService 이미 주입 완료, 별도 module import 불필요)
- **ChatMessage.senderId nullable**: 시스템 메시지를 위한 `String?` 완화, 기존 non-null 행 영향 없음 (ALTER COLUMN DROP NOT NULL)
- **AcceptApplication serializable isolation**: `updateMany + status guard` 패턴으로 동시 수락 race 방지 (QA power BLOCKING 발견 후 수정)
- **공개 프로필 PII strip**: 서비스 레이어 `toPublicProfile()` projector를 단일 진입점으로 강제, UI field allowlist로 이중 방어
- **mercenary_accepted 알림**: chatRoomId를 `data` 필드에 포함해 알림에서 채팅으로 직접 deep-link (디자인 라운드 지적)

## Deferred (scope split)

- **Task #70** — 마켓플레이스 결제 라이프사이클 (escrow hold/release, settlements payout, disputes persistence). 트리거: 결제 흐름 product/finance 의사결정 문서화
- **Task #71** — AI 팀 밸런싱 (ELO 데이터 최소 표본 100+ 완료 매치 + 설계 문서). 트리거: 통계 표본 도달

## Known minor issues (acknowledged, non-blocking)

- `/users` 루트 라우트와 `/(main)/user` 경로 중복 — 별도 이슈로 추적
- `hasApplied` local optimistic state — 새로고침 시 서버 상태로 복원
- mercenary close/cancel 재호출 시 400 (idempotency 미구현, 현재 예외 발생)
- Match 참가자 목록에서 `/users/:id` 링크 미연결
- "거부" vs "거절" copy 일관성 — 별도 i18n 정리 필요

## References

- Task doc: `.github/tasks/69-unimplemented-features-remediation.md`
- Migration: `apps/api/prisma/migrations/20260418000000_notification_type_expansion_and_system_messages`
