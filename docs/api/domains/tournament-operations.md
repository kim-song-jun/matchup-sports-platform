# Tournament operations contract

The authoritative field, fixture-lineup, competition-config, operations-board, job-requeue, and operation-flag method/field/actor rows are frozen in the [REST and idempotency registry](../global-contract.md#frozen-rest-and-idempotency-contract).

Staff scope and actor permissions are defined by [Tournament operations authorization](./tournament-operations-auth.md). Review escalation is a durable result boundary defined by [Tournament operations escalations](./tournament-operations-escalations.md), never an ephemeral admin task queue.
