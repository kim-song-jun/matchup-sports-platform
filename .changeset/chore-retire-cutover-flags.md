---
"v1_api": patch
"v1_web": patch
---

컷오버가 끝난 `GAME_WRITE`/`GAME_READ` 운영 플래그와 그 부속 로직을 제거한다.

Task 10 game-result 마이그레이션의 read/write 권한 컷오버는 완료·영구 확정됐다(alpha가
`GAME_WRITE=new`/`GAME_READ=new`로 롤백 없이 안정 서빙 중). 두 플래그와 그것만을 위해
존재하던 코드를 전부 걷어낸다:

- `GameOperationFlagKey`가 이제 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 둘뿐이다. `tupleTransition()`,
  `withNewWriteAuthority()`, `v1_game_cutover_epochs` 앱 레벨 읽기/쓰기, "frozen forward order"
  교차-플래그 순서 검증(`assertFrozenForwardOrder`)을 전부 제거했다 — 남는 두 플래그는 순서
  의존 없는 독립 boolean 킬스위치다.
- 운영보드(`TournamentOperationsBoardService.list()`)가 `GAME_READ` 컴패어 모드 분기를 잃고
  `'new'` 전용 경로로 고정됐다 — 응답 형태·해시·watermark는 변경 없음(제거된 분기는 이미 항상
  false였다). 이에 따른 `GAME_READ_AUTHORITY` DI seam과 Task 10 백필/비교 구현
  (`games/migration/game-result-backfill.ts`, `compare-game-result-reads.ts`), 전용 CLI 2개,
  `task10-game-result-cutover` CI 리허설 job도 함께 제거했다.
- 관리자 "경기 운영 플래그" 화면이 5단계 순차 컷오버 스테퍼에서 운영 토글 2개(실시간 점수
  공개 · 결과 확정 권한)로 단순화됐다. 각 토글을 끌 때 무엇이 바뀌는지(공개 화면 강등 /
  디렉터 확정 거부) 카드에 명시하고, 확인 모달을 거쳐야만 실행된다.
- `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE`는 계속 CAS·gate-bundle·감사 로그를 통해 동작한다 —
  롤백 수단(실시간 공개 끄기·확정 권한 끄기)은 그대로 유지된다.

DB 스키마(`V1GameOperationFlagKey` enum, `V1GameCutoverEpoch` 테이블)는 손대지 않았다 — 살아있는
enum 값을 줄이는 마이그레이션은 위험 대비 이득이 없다고 판단해 보류했다. 자세한 근거는 PR 설명 참고.
