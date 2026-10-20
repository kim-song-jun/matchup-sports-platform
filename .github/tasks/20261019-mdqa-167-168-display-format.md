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
- [x] 관련 프론트 테스트와 타입 검사를 통과한다.
- [x] 제품 head `9b7e32ed8`의 PR base가 `dev`이며 Gates/API/Web CI가 통과했다.
- [ ] 문서 갱신 후 최신 head CI와 정식 Copilot 리뷰를 확인한다.
- [ ] dev 머지 뒤 Alpha 390/768/1440 실제 화면과 console/network를 확인한다.

## 범위 밖

- 저장된 포지션 코드와 생년월일 원본 데이터 변경
- 대회 명단 자격 판정·상태 전이 변경
- DB 스키마와 마이그레이션

## 2026-10-20 merge preparation

- Isolated checkout `/tmp/teameet-pr-1995`; source diff reviewed: backend already returns pinned `lineupConfig`, forwarded through the real console/action picker to the lineup grid. Birth-date helpers are moved without changing their existing normalization behavior and reused by the admin modal.
- Re-ran the actual lineup grid and two admin roster identity/modal suites serially: 3 files, 62/62 tests PASS on Node 22.22.2. Original exact-head Gates/API/Web CI SUCCESS includes type checks. No source changes or dependency updates were needed for this PR.
- The PR had no formal Copilot review. CLI requests returned success but no review request/start event was recorded; this is not a clean review. Request formal review again for this receipt commit and wait for actual submitted review before merging. Runtime Alpha verification is pending and is not inferred from unit/CI results.
