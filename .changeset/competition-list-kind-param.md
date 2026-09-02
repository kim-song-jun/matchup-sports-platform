---
'v1_api': minor
---

대회 목록에 `kind` 쿼리 파라미터를 추가한다 (`tournament` | `league` | `all`).
**기본값은 `tournament` 라 응답은 지금과 같다** — 리그는 안 나온다. 목록이 어느 종류를
담을지 고르는 자리는 `v1-surface-check` 가 세어 baseline 으로 묶는다.
