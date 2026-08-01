---
'v1_api': patch
'v1_web': patch
---

Expose the deployed release version and commit SHA on production responses via `X-Teameet-Release` / `X-Teameet-Commit`, matching what alpha already does, so an incident responder can tell which build is live without shelling into the host.
