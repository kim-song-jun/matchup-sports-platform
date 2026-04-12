# Team Match Flow Scenarios

## Scenario Checklist

- [ ] TM-001 팀 매치 생성과 팀 선택 검증
- [ ] TM-002 상대 팀 신청과 상호 확인
- [ ] TM-003 승인 / 거절 후 상태 동기화와 알림 반영
- [ ] TM-004 도착 인증 / 점수 입력 / 경기 후 평가

## TM-001 팀 매치 생성과 팀 선택 검증

### Preconditions

- [ ] `팀장오너E2E` 또는 `매니저E2E` 계정을 준비한다.
- [ ] 생성 가능한 팀이 존재한다.

### Steps

- [ ] `/team-matches/new`에 진입한다.
- [ ] 생성 가능한 팀 목록이 노출되는지 확인한다.
- [ ] 팀을 선택하고 팀 매치를 생성한다.
- [ ] 생성 후 상세 페이지로 이동한다.

### Expected

- [ ] 생성 가능한 팀만 선택 가능하다.
- [ ] host team 정보가 상세에 노출된다.
- [ ] `/team-matches`, `/my/team-matches`에 반영된다.
- [ ] 일반팀원은 생성이 차단된다.

## TM-002 상대 팀 신청과 상호 확인

### Preconditions

- [ ] 호스트 팀이 생성한 팀 매치가 있다.
- [ ] 신청 가능한 다른 팀 계정을 준비한다.

### Steps

- [ ] 신청 사용자 컨텍스트에서 상세를 연다.
- [ ] 어떤 팀으로 신청할지 선택한다.
- [ ] 신청을 제출한다.
- [ ] 호스트 컨텍스트에서 신청 목록 또는 상태 화면을 연다.
- [ ] 신청자 컨텍스트에서 내 신청 상태를 본다.

### Expected

- [ ] 팀 선택 없이 신청이 완료되지 않는다.
- [ ] 호스트는 신청 팀 목록을 볼 수 있다.
- [ ] 신청자는 자신의 상태를 볼 수 있다.

## TM-003 승인 / 거절 후 상태 동기화와 알림 반영

### Steps

- [ ] 호스트가 신청을 승인한다.
- [ ] 신청자 화면에서 상태를 확인한다.
- [ ] 알림 화면을 확인한다.
- [ ] 거절 케이스도 별도 데이터로 재현한다.

### Expected

- [ ] `pending -> approved/rejected` 전환이 양쪽에 반영된다.
- [ ] 알림이 생성된다.
- [ ] 새로고침 후에도 상태가 유지된다.

## TM-004 도착 인증 / 점수 입력 / 경기 후 평가

### Steps

- [ ] 양 팀이 도착 인증 페이지에 진입한다.
- [ ] 점수 입력과 결과 제출을 수행한다.
- [ ] 경기 후 평가를 제출한다.

### Expected

- [ ] 단계가 끊기지 않고 이어진다.
- [ ] 이미 완료한 단계를 중복 제출할 수 없다.
- [ ] 결과와 평가가 후속 화면에 반영된다.
- [ ] `arrival`은 실제 참가 팀과 저장된 `arrivalChecks` 기준으로 hydrate된다.
- [ ] GPS 반경 판정, 사진 업로드, 상대팀 지각/노쇼 판정은 미지원이면 fake control 대신 안내형 UI로 노출된다.
- [ ] `score`는 실제 `quarterCount`와 확정된 두 참가 팀 기준으로 저장되고, `completed` 후에는 read-only 상태를 본다.
- [ ] `evaluate`는 `completed` 경기에서만 제출 가능하고, 실제 참가 팀 기준으로 팀당 1회만 제출된다.

## Notes

- 팀 매치는 권한, 실시간, 알림이 함께 얽혀 있어 핵심 회귀 세트로 다룬다.
- 2026-04-07: `/teams/new`, `/my/teams`, `/team-matches`, `/team-matches/new` step 0 Desktop Chrome 스모크는 통과했다. 실제 신청/승인/거절/알림/경기 후 평가 흐름은 다음 자동화 묶음으로 남아 있다.
- 2026-04-07: `e2e/tests/team-owner-flow.spec.ts` Desktop Chrome smoke는 통과했다. 현재 자동화 범위는 팀 생성/my teams/team-matches step-0 진입까지이며, 신청/승인/알림/평가 시나리오는 후속 범위다.
- 2026-04-11: `TM-004` 운영 화면 계약은 실제 `team-match` detail 기반으로 정렬되었고, arrival 재제출도 backend에서 차단되도록 닫았다. 전용 Playwright spec(`e2e/tests/team-match-operations.spec.ts`)은 `/team-matches` warmup으로 조정했고, live API `health`/`dev-login`도 다시 통과했다. 다만 현재 host Next dev runtime에서 `/team-matches` 계열이 간헐적으로 `ERR_CONNECTION_RESET` 또는 generic `Internal Server Error`를 반환해 browser green은 아직 별도 런타임 정리 후 다시 확인해야 한다.
