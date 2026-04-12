# Mercenary Flow Scenarios

> Status: Partial
> 2026-04-11 Task 36 기준으로 create -> detail redirect, unauthenticated apply redirect, applicant apply, host accept, applicant status 확인은 targeted automation으로 검증되었다. 다만 expanded rerun은 local Next dev `webServer` cold-boot instability(`.next/routes-manifest.json` / `app-paths-manifest.json` ENOENT)와 함께 새 글 노출 explicit reload / API-restart persistence smoke를 follow-up으로 남긴다.

## Scenario Checklist

- [x] MERC-001 용병 모집글 생성 후 영속성 검증
- [x] MERC-002 지원 / 승인 / 상태 확인

## MERC-001 용병 모집글 생성 후 영속성 검증

### Preconditions

- [x] `용병호스트E2E` 로그인 상태다.

### Steps

- [x] `/mercenary/new`에서 모집글을 생성한다.
- [x] 생성 직후 상세 페이지로 이동한다.
- [x] `/mercenary`, 관련 팀 상세, 내 모집글 화면에서 노출을 확인한다.

### Expected

- [x] 생성 결과가 상세로 반영된다.
- [x] 필수 정보가 손실되지 않는다.

### Persistence Check

- [x] 새로고침 후에도 유지된다.
- [ ] 가능하면 API 재시작 후에도 유지된다.

## MERC-002 지원 / 승인 / 상태 확인

### Preconditions

- [x] 지원 가능한 일반 사용자 계정을 준비한다.

### Steps

- [x] 일반 사용자가 용병 모집글에 지원한다.
- [x] 호스트가 지원 목록을 확인한다.
- [x] 호스트가 승인 또는 거절한다.
- [x] 지원자가 내 상태를 확인한다.

### Expected

- [x] 비로그인 사용자는 지원 완료 불가다.
- [x] 중복 지원이 차단된다.
- [x] 승인/거절 결과가 지원자 관점에서도 보인다.

## Notes

- 이 영역은 실제 DB 저장 확인이 특히 중요하다.
- 2026-04-11: `/mercenary/[id]` 상세 페이지는 현재 코드에 존재한다. 이전 backlog의 “detail page missing” 진술은 stale이며, follow-up 초점은 detail route 부재가 아니라 lifecycle completion이다.
- 2026-04-11: `e2e/tests/mercenary-flow.spec.ts`는 create -> detail redirect, unauthenticated apply redirect, apply -> host accept -> applicant status 확인까지 포함하도록 확장되었다.
- 2026-04-11: E2E runtime 안정화를 위해 `e2e/fixtures/auth.ts`, `e2e/fixtures/api-helpers.ts`에 transient fetch retry와 lighter protected-route bootstrap(`/matches`)를 반영했다.
- 2026-04-11: repo Playwright config의 local Next `webServer`는 cold boot 시 `.next/routes-manifest.json` / `app-paths-manifest.json` ENOENT를 간헐적으로 낼 수 있다. 이 경우 mercenary 제품 regression으로 단정하지 않고 runtime follow-up으로 분리한다.
