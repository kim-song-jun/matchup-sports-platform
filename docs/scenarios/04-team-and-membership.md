# Team And Membership Scenarios

## Scenario Checklist

- [ ] TEAM-001 팀 생성 후 오너 권한과 내 팀 반영
- [ ] TEAM-002 팀원 / 매니저 / 오너 권한 차등
- [x] TEAM-003 팀 목록/상세의 fallback photo slot과 logo slot 분리 유지

## TEAM-001 팀 생성 후 오너 권한과 내 팀 반영

### Preconditions

- [ ] `팀장오너E2E` 로그인 상태다.

### Steps

- [ ] `/teams/new`에서 팀을 생성한다.
- [ ] 생성 후 팀 상세로 이동한다.
- [ ] 수정, 멤버 관리, 운영 관련 CTA를 확인한다.
- [ ] `/my/teams`와 `/teams`에서 생성 팀을 찾는다.

### Expected

- [ ] 팀이 영속적으로 보인다.
- [ ] 오너 전용 조작 버튼이 노출된다.
- [ ] 내 팀 목록과 전체 목록 양쪽에 반영된다.

## TEAM-002 팀원 / 매니저 / 오너 권한 차등

### Preconditions

- [ ] 동일 팀 기준으로 오너, 매니저, 일반팀원 계정을 준비한다.

### Steps

- [ ] 오너 계정으로 운영 기능 접근을 확인한다.
- [ ] 매니저 계정으로 허용된 운영 기능 접근을 확인한다.
- [ ] 일반팀원 계정으로 같은 기능 접근을 시도한다.

### Expected

- [ ] 오너는 모든 운영 기능에 접근 가능하다.
- [ ] 매니저는 허용 범위 내 운영 기능만 접근 가능하다.
- [ ] 일반팀원은 운영 액션이 차단된다.
- [ ] UI 숨김과 서버 권한이 일치한다.

## TEAM-003 팀 목록/상세의 fallback photo slot과 logo slot 분리 유지

### Steps

- [x] `/teams`와 `/teams/[id]`를 연다.
- [x] `logoUrl`, `coverImageUrl`, `photos`가 비어 있는 팀 기준으로 카드/상세를 확인한다.
- [x] 같은 팀을 새로고침 후 다시 확인한다.

### Expected

- [x] 팀 로고 슬롯은 deterministic logo fallback을 유지한다.
- [x] 팀 커버/갤러리 같은 photo slot은 실사형 로컬 자산을 노출한다.
- [x] 로고 fallback과 photo fallback이 서로 섞이지 않는다.

## Notes

- 팀 역할 검증은 팀 매치와 용병 시나리오의 선행 조건이다.
- 2026-04-08: 팀 목록/상세는 logo fallback과 photoreal photo fallback의 역할 분리를 유지하는 것으로 재검증했다.
