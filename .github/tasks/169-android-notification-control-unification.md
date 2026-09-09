# Task 169 — Android notification control unification

Status: COMPLETE
Base branch: `dev`
Target: both (`apps/v1_android`, `apps/v1_web`, `apps/v1_api`)

## Objective

Keep the explicit notification opt-in action in onboarding, while removing repeated prompts and making the remaining Android notification controls follow one understandable state and category contract.

## Decisions

- Keep the onboarding `알림 받기` action.
- Remove the duplicate home notification nudge.
- Present one adaptive device-push control on notification settings; an OS-blocked state opens Android settings instead of rendering a disabled switch plus a second button.
- Treat opening Android notification settings from that recovery control as an explicit enable intent. If permission is granted on return, continue FCM registration without another tap.
- Reduce visible category switches to four: 경기·대회, 팀 활동, 채팅, 서비스 공지. Keep stored compatibility fields, group match/team-match/tournament fields in the first switch, and hide marketing until a real producer/consent contract exists.
- Category switches continue to govern both notification-center creation and push delivery. Align chat with that existing contract.
- Do not add database columns or Android OS notification channels in this task.

## Acceptance Criteria

- [x] Onboarding still exposes and executes explicit notification opt-in.
- [x] Home no longer repeats the notification opt-in banner.
- [x] Notification settings renders at most one device-level action for each permission/registration state.
- [x] Returning from Android settings after granting permission registers FCM without a second tap.
- [x] A failed native revoke is not reported to the web UI as confirmed success.
- [x] The four visible category controls map to real server behavior, including tournament and chat notifications.
- [x] Targeted Android, web, and API tests pass.
- [x] Mobile/tablet/desktop visual evidence covers the updated notification settings route.

## Progress Snapshot

- Latest `origin/dev` confirms duplicate opt-in entry points in onboarding and home plus a device master control in settings.
- `chatEnabled=false` currently suppresses push only while still creating notification-center rows, contrary to settings copy.
- Tournament events use the hidden `activityEnabled` field, and the visible marketing toggle has no current producer.
- Implementation complete on latest `origin/dev` base. Targeted Web tests: 84/84; API tests: 55/55; Web/API typechecks and Android alpha unit compile pass.
- Headed QA captured mobile/tablet/desktop plus Android denied/recovered states with no horizontal overflow or scoped console/network failures.
- The standard Turbopack build cannot resolve Next from this nested worktree. Webpack compilation succeeds, then Next's pre-existing `app/tournaments/page.ts` named export `TournamentsListContent` fails generated route type validation.
