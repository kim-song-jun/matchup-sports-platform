---
"v1_api": patch
---

게이트 설정 마이그레이션(`20260810120000_v1_operation_gate_setting`)에서 singleton 행 INSERT 를 제거한다.

expand-contract 가드는 마이그레이션에 추가형 DDL 만 허용하고 DML 은 거부한다 — 롤백했을 때 이전 버전 코드가 그 행을 어떻게 다룰지 보장할 수 없기 때문이다. alpha 배포가 이 가드에서 막혔다.

이 INSERT 는 애초에 중복이었다. `GameOperationFlagsService.readGateSetting()` 이 매 조회마다 `INSERT ... ON CONFLICT (id) DO NOTHING` 으로 singleton 행을 보장하므로(기존 `ensureDefaults()` 가 플래그 기본행을 다루는 방식과 동일), 마이그레이션이 행을 만들지 않아도 첫 조회 시점에 기본값 `false` 로 생긴다.

가드를 완화하거나 예외 목록에 넣지 않았다.
