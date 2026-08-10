---
"v1_api": minor
"v1_web": minor
---

관리자가 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 운영 플래그를 켜고 끌 수 있는 화면을 추가한다 — `/admin/ops/operation-flags`.

`PATCH /tournament-ops/operation-flags/:key`의 정식 경로는 프로덕션에서 그대로 유지된다: 여전히 `docs/api/domains/game-migration.md`의 게이트 번들(R1/R2, 24시간 간격 서명 7회 x 2)이 필요하다. 이번에 추가한 건 별도의 `PATCH /tournament-ops/operation-flags/:key/simplified-toggle` 경로로, 그 게이트 번들 증거만 생략한다 — 그 외 admin 권한 수준(ops/owner, `getMutationAdmin`), CAS(`expectedVersion`), `off<->on`만 허용하는 전이 검증, **frozen cutover order**(off→on은 여전히 `GAME_WRITE=new && GAME_READ=new`가 선행돼야 한다 — alpha는 현재 둘 다 `legacy`라 오늘은 이 경로로도 `PUBLIC_LIVE`를 켤 수 없다), 필수 `reason`, `Idempotency-Key`, `V1OperationAudit`/outbox 기록은 동일하게 유지한다. (이 PR 시점엔 `GAME_WRITE`/`GAME_READ`는 이 경로로 열 수 없었다 — 이후 `.changeset/v1-operation-gate-db-setting.md`에서 4개 키 전부로 확장됐다.)

이 간소 경로가 동작하는지 여부는 이제 환경변수가 아니라 DB 설정값(`v1_game_operation_gate_settings` singleton 행)으로 관리한다 — 자세한 내용과 되돌릴 수 없는 부분은 `.changeset/v1-operation-gate-db-setting.md` 참고.
