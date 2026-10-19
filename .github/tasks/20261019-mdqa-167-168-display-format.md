# MD-QA #167·#168 — 운영 포지션·생년월일 표시 정리

## 범위

- Frontend only: `apps/v1_web`
- MD-QA #167: 운영 콘솔 선수 포지션은 pinned competition config의 `short`를 표시한다.
- MD-QA #168: 어드민 명단 검토 생년월일은 저장 형식과 무관하게 `YYYY.MM.DD`로 표시한다.

## 정본

- `docs/design/competition-canonical-flow.md` §3
- `/Users/limseungje/.agents/skills/teameet-domain-rules/tournament-rules.md` §4·§5

## 완료 조건

- [x] 풋살 골키퍼 저장 코드 `GOLEIRO`가 운영 콘솔에서 `GK`로 보인다.
- [x] 포지션 약칭은 프론트 하드코딩이 아니라 서버 `lineupConfig.positions` 사전을 사용한다.
- [x] `19950315`와 `1995-03-15`가 모두 `1995.03.15`로 보인다.
- [ ] 관련 프론트 테스트와 타입 검사를 통과한다.
- [ ] PR base가 `dev`인지 확인하고 CI를 통과한다.

## 범위 밖

- 저장된 포지션 코드와 생년월일 원본 데이터 변경
- 대회 명단 자격 판정·상태 전이 변경
- DB 스키마와 마이그레이션
