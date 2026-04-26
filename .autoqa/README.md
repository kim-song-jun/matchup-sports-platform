# autoqa usage

This is the project-local operator handbook for Teameet.

## Current repo contract

- Authenticated personas are captured as Playwright `storageState()` JSON.
- The files currently live under the legacy `.autoqa/cookies/` path to keep ignore rules minimal.
- Reuse is valid only when the saved state still contains `accessToken`, `refreshToken`, and `authUser` for `http://localhost:3003`.
- The repo helper refreshes authenticated storage states from the saved `refreshToken` before `check`, so expired access tokens do not create false 401 console failures on the first request wave.
- The repo helper also waits briefly before screenshots during `check`, which avoids transient hydration mismatch noise on input-heavy routes like `/matches`.
- The repo cycle runner also waits briefly after `click` and `type`, which avoids false negatives on React forms where the next step can otherwise observe stale `aria-pressed` / disabled state.
- `--background` is unsupported unless the current Codex host exposes automation / heartbeat tools. Unsupported hosts must not fake queue dispatch; they should degrade immediately to foreground execution or a host cron fallback.

## Recommended order

1. `make dev`
2. `make db-seed-mocks`
3. Capture one authenticated storage state in foreground
4. Run `SC-SMOKE-001` in foreground
5. Run one authenticated representative scenario in foreground
6. Only then consider `autoqa` or `autoqa-cycle all --background`

## Repo helper

- Capture auth state:
  `node scripts/qa/autoqa-playwright-session.mjs capture --persona team-owner --label "팀장오너E2E" --out .autoqa/cookies/team-owner.json`
  Default capture mode follows the repo E2E contract: dev-login API -> localStorage injection -> Playwright `storageState()`.
- Verify public smoke:
  `node scripts/qa/autoqa-playwright-session.mjs check --path /landing --expect-url "/landing(?:\\?|$)" --expect-selector body --expect-selector nav --no-console-errors`
- Verify authenticated shell:
  `node scripts/qa/autoqa-playwright-session.mjs check --state .autoqa/cookies/team-owner.json --path /matches --expect-selector "[data-testid='match-results']" --expect-storage-key accessToken --expect-storage-key refreshToken --expect-storage-key authUser --no-console-errors`

## Common commands

- `autoqa`
  scenario refresh + unattended closure loop, with immediate foreground fallback when heartbeat is unavailable
- `autoqa status`
  inspect queue, phase, blockers, and automation status
- `autoqa login team-owner`
  refresh one persona storage state explicitly
- `autoqa run SC-SMOKE-001 --scope minimal`
  narrow public smoke/debug pass
- `autoqa-cycle SC-SMOKE-002`
  foreground loop for one authenticated representative scenario
- `autoqa cron install`
  install the managed 30-minute host cron fallback for this repository
