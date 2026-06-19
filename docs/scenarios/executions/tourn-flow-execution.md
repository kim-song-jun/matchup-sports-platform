# TOURN Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `TOURN-001` 대회 목록
- `TOURN-002` 대회 목록 검색/필터
- `TOURN-003` 대회 상세
- `TOURN-004` 대회 상세 상태별 CTA
- `TOURN-005` 참가 신청 권한
- `TOURN-006` 참가 팀 선택
- `TOURN-007` 참가 선수 명단
- `TOURN-008` 참가 신청 제출
- `TOURN-009` 내 신청 상태
- `TOURN-010` 신청 상세
- `TOURN-011` 신청 취소 요청
- `TOURN-012` 명단 수정
- `TOURN-013` 대회 공지
- `TOURN-014` 대진표 조회
- `TOURN-015` 결과/순위 조회
- `TOURN-016` 관리자 대회 목록
- `TOURN-017` 관리자 대회 생성
- `TOURN-018` 관리자 대회 상세/수정
- `TOURN-019` 관리자 신청 목록
- `TOURN-020` 입금 확인
- `TOURN-021` 참가 확정/대기
- `TOURN-022` 관리자 취소 처리
- `TOURN-023` 명단 잠금/해제
- `TOURN-024` 대회 알림 연동
- `TOURN-025` 대회 반응형

Out of scope:

- `AUTH-*`
- `TEAM-*` implementation except reading team permission state
- `MY-*` implementation except checking reflected tournament status
- `CHAT-*`
- `NOTI-*` implementation except tournament producer assertion
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/tournaments/**`
- `apps/v1_web/src/app/admin/tournaments/**`
- `apps/v1_web/src/components/tournaments/**`
- `apps/v1_api/src/tournaments/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Mobile `390x844` route/action check
- [ ] Desktop `1440x900` route/action check
- [ ] Team owner/manager/member permission check where applicable
- [ ] Participant state transition check
- [ ] Admin state transition check
- [ ] Duplicate/invalid status conflict check
- [ ] Reload persistence check
- [ ] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- tournaments-read.service.spec.ts tournament-registrations.service.spec.ts admin-registrations.service.spec.ts`
- `pnpm --filter v1_api test -- tournament-bracket.service.spec.ts tournament-players.service.spec.ts tournament-announcements.service.spec.ts`
- `pnpm --filter v1_web test -- src/components/tournaments`
- `pnpm --filter v1_web test -- src/app/tournaments`

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| TOURN-001 | Not run | Not run | Pending | - | - |
| TOURN-002 | Not run | Not run | Pending | - | - |
| TOURN-003 | Not run | Not run | Pending | - | - |
| TOURN-004 | Not run | Not run | Pending | - | - |
| TOURN-005 | Not run | Not run | Pending | - | - |
| TOURN-006 | Not run | Not run | Pending | - | - |
| TOURN-007 | Not run | Not run | Pending | - | - |
| TOURN-008 | Not run | Not run | Pending | - | - |
| TOURN-009 | Not run | Not run | Pending | - | - |
| TOURN-010 | Not run | Not run | Pending | - | - |
| TOURN-011 | Not run | Not run | Pending | - | - |
| TOURN-012 | Not run | Not run | Pending | - | - |
| TOURN-013 | Not run | Not run | Pending | - | - |
| TOURN-014 | Not run | Not run | Pending | - | - |
| TOURN-015 | Not run | Not run | Pending | - | - |
| TOURN-016 | Not run | Not run | Pending | - | - |
| TOURN-017 | Not run | Not run | Pending | - | - |
| TOURN-018 | Not run | Not run | Pending | - | - |
| TOURN-019 | Not run | Not run | Pending | - | - |
| TOURN-020 | Not run | Not run | Pending | - | - |
| TOURN-021 | Not run | Not run | Pending | - | - |
| TOURN-022 | Not run | Not run | Pending | - | - |
| TOURN-023 | Not run | Not run | Pending | - | - |
| TOURN-024 | Not run | Not run | Pending | - | - |
| TOURN-025 | Not run | Not run | Pending | - | - |

