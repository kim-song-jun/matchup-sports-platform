---
"v1_api": patch
---

게임 커맨드가 동시에 들어왔을 때 500이 나던 것을 고쳤어요. 커맨드는 Serializable 트랜잭션에서 `SELECT ... FOR UPDATE`로 시작하는데, 이 raw query가 내는 Postgres 40001(serialization failure)이 Prisma에서 `P2010`으로 감싸여 기존 `P2034`/`P2002` 매핑에 안 걸렸어요. 이제 409 `COMMAND_CONCURRENCY_CONFLICT`로 정상 응답해요.
