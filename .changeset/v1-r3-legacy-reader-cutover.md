---
"v1_api": minor
---

R3 롤아웃 — 레거시 대회 결과 리더 3곳을 새 시스템(`V1Game.currentOfficialRevision`)으로 교체하고, 결과 확정 시 조별 순위를 자동 재계산한다.

레거시 `V1TournamentFixtureResult` 는 쓰기가 전부 퇴역(409)했는데 admin 대진표와 공개 대회 상세는 여전히 그 테이블만 읽고 있었다 — 아무도 쓰지 않는 컬럼을 읽으니 스태프가 결과를 확정해도 그 화면들의 점수가 영원히 안 바뀌었다.

교체 대상: `tournament-bracket.service.ts`(팀변경/삭제 가드, 순위 계산 입력, 대진표 응답), `tournament-detail.presenter.ts`(공개 상세 `fixtures[].result`), `tournament-fixture-review-mappers.ts`(리뷰 게이트·타임스탬프).

조별 순위는 `GAME_RESULT_OFFICIAL` outbox 처리와 같은 트랜잭션에서 자동 재계산된다. 브래킷 진출 배정과 동일한 지점·동일한 실패 규칙을 따른다. 수동 재계산 라우트는 운영자 복구 수단으로 남긴다.

레거시 테이블·조인은 그대로 남겨 롤백 여지를 둔다(문서 §4의 4~6단계는 이번 범위 밖).
