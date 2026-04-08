# Match Flow Scenarios

## Scenario Checklist

- [x] MATCH-001 매치 생성 후 목록/상세/새로고침 반영
- [x] MATCH-002 다른 사용자의 참가와 참가 인원 동기화
- [ ] MATCH-003 수정 / 취소 / 종료 상태 반영 (`PATCH /matches/:id` 미구현)

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

- [ ] 호스트가 본인 매치 수정 페이지로 진입한다.
- [ ] 일정 또는 설명을 수정한다.
- [ ] 마감/취소가 가능하면 수행한다.
- [ ] 목록과 내 기록에서 변경 결과를 확인한다.

### Expected

- [ ] 수정값이 상세와 목록에 모두 반영된다.
- [ ] 취소/마감 상태가 사용자에게 명확히 보인다.

## Notes

- 이 파일은 가장 먼저 Playwright 자동화로 전개할 대상 중 하나다.
- 2026-04-07: `/matches`, `/matches/[id]`, `/my/matches`, `/my/team-matches` Desktop Chrome 스모크는 통과했다.
- 2026-04-08: `MATCH-001`과 `MATCH-002`를 `e2e/tests/match-join-flow.spec.ts`에 반영했고 Desktop Chrome `13/13`, Mobile Chrome deep-flow `2/2`를 통과했다.
- 2026-04-08: 실제 실행에서 `/matches/new`가 UI 전용 필드(`customVenue`, `rules`)를 DTO 그대로 POST해 Nest `ValidationPipe(whitelist + forbidNonWhitelisted)`에 막히는 버그를 발견했고, submit payload를 DTO 기준으로 정리해 수정했다.
- 2026-04-08: `customVenue` 직접 입력은 현재 백엔드 모델이 지원하지 않아 UI에서 등록된 시설 선택을 강제한다.
- 2026-04-08: `/matches/new`, `/matches/[id]/edit`는 업로드된 파일이 없을 때도 실사형 예시 스트립을 보여주도록 바뀌었고, decorative 예시는 스크린리더에서 숨겨 UX 혼선을 줄였다.
- 2026-04-08: `MATCH-003`은 프론트가 기대하는 수정/취소 흐름과 달리 backend `matches` 컨트롤러에 `PATCH /matches/:id`가 없어 구조적으로 blocked 상태다.
