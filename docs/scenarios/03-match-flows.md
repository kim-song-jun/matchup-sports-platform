# Match Flow Scenarios

> Status: Verified with follow-up
> `MATCH-001/002/003`는 문서상 검증됨이다. 남은 follow-up은 API/app restart persistence와 broader multi-browser expansion이다.

## Scenario Checklist

- [x] MATCH-001 매치 생성 후 목록/상세/새로고침 반영
- [x] MATCH-002 다른 사용자의 참가와 참가 인원 동기화
- [x] MATCH-003 수정 / 취소 / 종료 상태 반영

## MATCH-001 매치 생성 후 목록/상세/새로고침 반영

### Preconditions

- [x] 생성 가능한 사용자 프로필이 준비되어 있다.
- [x] `시나로E2E` 로그인 상태다.

### Steps

- [x] `/matches/new`에서 새 매치를 생성한다.
- [x] 생성 직후 `/matches?created=true`로 이동한다.
- [x] `/matches` 검색, 상세, `/my/matches?tab=created`에서 같은 매치를 찾는다.
- [x] 같은 사용자 새 탭에서 같은 상세 페이지를 연다.

### Expected

- [x] 상세 정보가 입력값과 일치한다.
- [x] 목록과 내 매치 화면에 반영된다.
- [x] 새 탭에서도 동일 정보가 보인다.

### Persistence Check

- [x] 기존 탭 새로고침 후 유지된다.
- [x] 새 탭 새로고침 후 유지된다.
- [ ] 가능하면 API 또는 앱 재시작 후에도 유지된다.

## MATCH-002 다른 사용자의 참가와 참가 인원 동기화

### Preconditions

- [x] 호스트가 만든 참가 가능한 매치가 존재한다.
- [x] 다른 일반 사용자 컨텍스트를 준비한다.

### Steps

- [x] 호스트 컨텍스트와 참가자 컨텍스트에서 같은 매치 상세를 연다.
- [x] 참가자가 참가 버튼을 누른다.
- [x] 참가 완료 후 참가자 상태를 본다.
- [x] 호스트 화면을 새로고침해 인원 변화를 본다.
- [x] 정원이 찬 뒤 세 번째 사용자 컨텍스트로 마감 상태를 본다.

### Expected

- [x] 참가자에게 성공 피드백이 보인다.
- [x] 참가 인원 수가 증가한다.
- [x] 이미 참가한 사용자는 재진입 후 `참가 취소하기` 상태를 본다.
- [x] 정원 초과 시 차단된다.

### Multi-Browser Check

- [x] 호스트/참가자/초과 참가자 컨텍스트가 같은 상태를 본다.
- [ ] 호스트 화면의 새로고침 없는 실시간 push 동기화는 별도 검증이 필요하다.

## MATCH-003 수정 / 취소 / 종료 상태 반영

### Steps

- [x] 호스트가 본인 매치 상세에서 모집 마감 후 다시 모집중으로 되돌린다.
- [x] 호스트가 수정 페이지로 진입해 제목, 설명, 모집 인원을 수정한다.
- [x] 호스트가 취소 또는 완료 처리를 수행한다.
- [x] 상세, 참가자 view, 내 기록에서 변경 결과를 확인한다.

### Expected

- [x] 수정값이 상세와 내 기록에 반영된다.
- [x] 모집 마감/재오픈, 취소, 완료 상태가 사용자에게 명확히 보인다.
- [x] 참가자 컨텍스트는 reload 후 동일 상태를 본다.

## Notes

- 이 파일은 가장 먼저 Playwright 자동화로 전개할 대상 중 하나다.
- 2026-04-07: `/matches`, `/matches/[id]`, `/my/matches`, `/my/team-matches` Desktop Chrome 스모크는 통과했다.
- 2026-04-08: `MATCH-001`과 `MATCH-002`를 `e2e/tests/match-join-flow.spec.ts`에 반영했고 Desktop Chrome `13/13`, Mobile Chrome deep-flow `2/2`를 통과했다.
- 2026-04-08: 실제 실행에서 `/matches/new`가 UI 전용 필드(`customVenue`, `rules`)를 DTO 그대로 POST해 Nest `ValidationPipe(whitelist + forbidNonWhitelisted)`에 막히는 버그를 발견했고, submit payload를 DTO 기준으로 정리해 수정했다.
- 2026-04-08: `customVenue` 직접 입력은 현재 백엔드 모델이 지원하지 않아 UI에서 등록된 시설 선택을 강제한다.
- 2026-04-08: `/matches/new`, `/matches/[id]/edit`는 업로드된 파일이 없을 때도 실사형 예시 스트립을 보여주도록 바뀌었고, decorative 예시는 스크린리더에서 숨겨 UX 혼선을 줄였다.
- 2026-04-11: backend `PATCH /matches/:id`, `POST /matches/:id/cancel`, `POST /matches/:id/close`는 현재 코드에 존재하며, `e2e/tests/match-join-flow.spec.ts`에도 `MATCH-003` 케이스가 추가돼 있다.
- 2026-04-11: Task 40 문서 정합성 기준으로 `MATCH-003 blocked` 주장은 제거한다. 현재 truth는 lifecycle scenario verified이며, 최신 런타임 재검증은 follow-up이다.
- 2026-04-11: Task 38에서 `/matches/new`, `/matches/[id]/edit`는 mock-only affordance가 아니라 real upload UI + submit guard로 연결됐다. edit route smoke는 통과했지만 create-route upload completion smoke는 current dev runtime instability와 분리해 재검증이 필요하다.
