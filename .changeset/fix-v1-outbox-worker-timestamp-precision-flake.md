---
"v1_api": patch
---

`V1GameOperationsWorkerService`의 outbox lease 클레임 쿼리가 간헐적으로 CI를
실패시키던 근본 원인을 고쳤다. `available_at`/`lease_until`/`updated_at`는
`TIMESTAMP(3)`(밀리초 정밀도) 컬럼인데, 저장 시 `CURRENT_TIMESTAMP`(마이크로초
정밀도) 표현식을 반올림(내림이 아님)해 저장하는 Postgres 동작 때문에 저장된
값이 실제 계산 시점보다 최대 0.5ms **미래**로 밀릴 수 있었다. 방금 삽입/갱신된
행을 거의 지연 없이 바로 클레임하는 경로(테스트의 `insertJob()` → `claimOne()`
연쇄, `makeRetryDue()` → `processOne()` 연쇄)에서 그 반올림된 값이 바로 다음
트랜잭션의 `CURRENT_TIMESTAMP`보다 늦게 보여 `available_at <= CURRENT_TIMESTAMP`
비교가 허위로 false가 되고, 실제로 존재하는 클레임 가능한 행인데도
`claimOne()`이 `null`을 반환했다(`test/jobs/v1-game-operations-worker.integration-spec.ts`
"releases only its own leases..." / "applies every exact retry delay..." flaky
실패의 원인).

`claimOne()`/`heartbeat()`/`fail()`/`releaseOwnedLeases()`/`completeWith()`가
쓰는 모든 타임스탬프 표현식을 `date_trunc('milliseconds', CURRENT_TIMESTAMP)`
(내림)로 바꿔 저장값이 항상 실제 계산 시점 이하가 되도록 했다 — 이후 어떤
"미래" 트랜잭션의 `CURRENT_TIMESTAMP`와 비교해도 더 이상 역전되지 않는다.
운영 중인 워커(`run()`, 250ms 폴링)는 이 레이스 창(최대 0.5ms)보다 500,000배
넓은 여유가 있어 실제 배포 환경에서 job 유실/중복 처리로 이어진 적은 없는
잠재적(dormant) 결함이었다 — 테스트가 "삽입 직후 즉시 클레임"하는 근접
지연 패턴 때문에 노출됐을 뿐이다. 같은 테스트 파일을 55회 반복 실행해 전부
통과함을 확인했다.
