---
'v1_api': patch
'v1_web': patch
---

Stop executing the runtime `.env` as shell code. `deploy-prod.sh` loaded secrets with `set -a; source "${ENV_FILE}"`, which does not read a file — it runs it. Values arriving from Parameter Store are written as bare `KEY=VALUE`, so anything a secret happens to contain is interpreted: measured on 2026-08-03, `pa$$word` became the shell's PID, `profile_nickname account_email` lost everything after the space and tried to run the rest as a command, and both `$(cmd)` and `a;cmd` executed. None of the values currently stored contain shell metacharacters, so nothing is broken today — but `KAKAO_SCOPE` legitimately holds a space-separated scope list, and a single password rotation is enough to corrupt a credential silently or run whatever an operator pasted.

Quoting the values on the way out looked like the smaller fix and does not work: the same file is read by Compose via `--env-file`, and Compose cannot parse the shell escape for an embedded single quote — it rejects the entire file with `unexpected character "\" in variable name`. That trades a latent corruption for a deployment that fails outright the first time a secret contains an apostrophe. Both behaviours were confirmed against real `bash` and real `docker compose` rather than reasoned about.

So the file stays in Compose's native unquoted form and the shell stops sourcing it. Compose reads the secrets directly through `--env-file` and never needed them in the shell environment; the only values this script actually uses are `V1_DB_USER` and `V1_DB_NAME` for the `pg_isready` probe, now read with a `sed` extraction that performs no interpretation.
