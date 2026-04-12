# Scenario Template

## Coverage Summary

- Primary personas:
- Automation status:
- Blocking dependencies:

## Scenario Checklist

- [ ] SCENARIO-ID 시나리오 이름

## SCENARIO-ID 시나리오 이름

### User Story

- As a ...
- I want ...
- So that ...

### Preconditions

- [ ] 필요한 계정/데이터 준비

### Given / When / Then

- Given ...
- When ...
- Then ...

### Assertions

- [ ] 사용자 UI 결과
- [ ] 서버/API 결과

### Negative / Edge Cases

- [ ] 권한 차단
- [ ] 빈 상태 / 에러 상태
- [ ] 미지원 기능 blocker

### Test Case Matrix

| Case ID | Type | Intent | Layer | Status | Automation |
|---------|------|--------|-------|--------|------------|
| `SCENARIO-ID-A` | Happy | 핵심 성공 플로우 | Playwright | Planned | `e2e/tests/...` |
| `SCENARIO-ID-B` | Negative | 권한/검증 실패 | Playwright / unit | Planned | `...` |

### Multi-Context Check

- [ ] 같은 사용자 다중 탭
- [ ] 다른 사용자 다중 브라우저

### Persistence Check

- [ ] 새로고침 후 유지
- [ ] 재로그인 후 유지
- [ ] 서버 재시작 후 유지

### Notes

- 추가 논의 사항
- blocker가 있으면 “미구현 기능”과 “테스트 미작성”을 구분해서 적는다.
- 테스트 이름에도 동일한 시나리오 ID (`SCENARIO-ID-A`)를 반영한다.
