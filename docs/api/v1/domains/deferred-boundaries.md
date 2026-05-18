# V1 Deferred Boundaries

V1 must be honest about features that are intentionally outside the current API and DB scope. The UI may show disabled or read-only entry points only when the copy is explicit.

## No V1 Success API

These areas must not expose a fake successful flow in v1:

- payment checkout, payment confirmation, refund, settlement, dispute;
- marketplace and lessons commerce;
- support ticket success flow;
- venue owner/operator self-service;
- tournament operations beyond future planning;
- DM;
- permanent team chat;
- chat file attachment;
- upload/file management as a v1 core API;
- admin task queue and broad operations workflow.

## UI Contract

If visible, deferred surfaces must say that the function is not active in v1. They must not:

- call a non-existent payment/support endpoint;
- show a fake transaction id;
- show settlement/refund success;
- imply real billing or real refund;
- silently route to old app APIs;
- persist mock admin outcomes as if they were operational actions.

## Cutover Constraint

Cutover review happens only after:

- `docs/api/v1/**` is published;
- v1 frontend contract hooks and MSW exist;
- core routes are bound to real v1 API data;
- integration/state-machine tests cover stateful domains;
- `make dev-v1` live smoke has evidence;
- Playwright scenarios are automated from `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`.
