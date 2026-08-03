---
'v1_api': patch
'v1_web': patch
---

Fix two guards that reported success on the failures they existed to catch.

`assert_compose_variables_resolve` piped `compose config` stderr straight into a grep for "variable is not set" and swallowed the exit status with `|| true`. Any failure that does not produce that phrase — a YAML syntax error, an unsatisfied `${VAR:?}`, a missing compose file — left the grep empty and the function returned success. Measured: a file with broken indentation and a file with an unmet required variable both passed exactly like a valid one. A guard added to stop deploys with blank secrets was letting a completely unparseable configuration through. It now checks the exit status first and only then looks for the warning.

The uploads backup discarded stderr and treated every `docker cp` failure as "no existing uploads directory". A full disk, a permission error, or a dead container all produced the same reassuring message, after which the `[[ -d ... ]]` restore check found nothing and skipped silently — losing user uploads without a word. Failures are now classified: only "no such file" counts as absent, and anything else aborts the deploy before the container is replaced.

Both were reported by a GPT Pro review and reproduced before being accepted. Two other findings from the same review were rejected after checking: the migration-rollback hazard is already prevented by `check-expand-contract-migrations.mjs`, which runs in `build-images` and rejects any non-additive statement (verified against its own negative controls), and the temp-file permission concern does not apply because `mktemp` creates `600 root` on the instance regardless of umask (measured).
