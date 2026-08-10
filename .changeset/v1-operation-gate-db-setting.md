---
"v1_api": minor
"v1_web": minor
---

간소 운영 플래그 게이트(경기 운영 플래그를 게이트 번들 증적 없이 켜는 admin 우회 경로)의 on/off 스위치를 환경변수에서 DB 설정으로 옮긴다.

**왜:** 오너 결정 두 가지가 근거다. (1) "굳이 다 환경변수로 하지 말고 DB 값으로 admin에서 설정값으로 넣자" — 지금까지는 alpha 배포 설정에만 켜져 있는 전용 opt-in 환경변수 하나가 유일한 스위치라 alpha에서만 쓸 수 있었다. 이제 `v1_game_operation_gate_settings` singleton 행(`simplified_gate_enabled`, `version`으로 CAS)으로 옮겨, `platform_ops` 관리자가 **프로덕션을 포함한 모든 환경**에서 이 스위치 자체를 켜고 끌 수 있다. 새 `PATCH /tournament-ops/operation-flags/simplified-gate`가 그 CAS+감사 로그 경로다. (2) "game write 같은 경우도 모두 진행할 수 있게끔 해줘. 전부 다 말이지?" — 지금까지 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 두 키만 쓸 수 있던 간소 경로가 이제 `GAME_READ`/`GAME_WRITE`를 포함한 4개 키 전부를 다룬다.

**무엇이 그대로인가 (안전장치는 하나도 완화되지 않았다):** 간소 경로가 없애는 것은 게이트 번들(R1/R2, 14일 서명 증적) 서류 절차뿐이다. `platform_ops` 권한, `expectedVersion` CAS, 한 번에 한 칸만 전이하는 `assertSingleTransition`(되돌리기는 여전히 `tupleTransition` 필요), READ compare → WRITE new → READ new → PUBLIC_LIVE/DIRECTOR_OFFICIALIZE 순서를 강제하는 `assertFrozenForwardOrder`, 필수 `reason`/`Idempotency-Key`, `V1OperationAudit`/outbox 기록은 전부 그대로 남는다.

**되돌릴 수 없는 부분:** `GAME_WRITE=new`로 전이해 새 권위로 첫 쓰기가 일어나는 순간 `v1_game_cutover_epochs.first_new_write_at` 래치가 걸리고, 그 이후로는 이 간소 경로로도 되돌릴 수 없다 — 되돌리려면 여전히 정식 `tupleTransition` 경로를 거쳐야 한다. 스위치 자체의 기본값도 `false`다: 갓 프로비저닝된 환경(프로덕션 포함)이 실수로 간소 경로를 열어두는 사고를 막기 위해서다.

**API 변경:**
- `PATCH /tournament-ops/operation-flags/simplified-gate` (신규) — `{ expectedVersion, enabled, reason }`, 스위치 자체를 CAS로 켜고 끈다.
- `GET /tournament-ops/operation-flags/simplified-gate/status` — 응답에 `version`/`updatedByUserId`/`updatedAt`이 추가됐다(CAS·감사 정보 노출).
- `PATCH /tournament-ops/operation-flags/:key/simplified-toggle` — `value`가 `legacy`/`compare`/`new`도 허용하도록 넓어졌다(4개 키 전부 지원).
