# Apple App Site Association

nginx serves `apple-app-site-association` from this directory at
`https://<host>/.well-known/apple-app-site-association`. That file is what makes a
`https://<host>/...` link open the iOS app instead of Safari.

## Why the app needs it

`apps/v1_ios` sends third-party authorization pages out to Safari on purpose — the shell
must not render Kakao's login form with the reader's session attached. The redirect back to
`/callback/kakao` therefore also completes in Safari, and the session is created in the
wrong browser. A universal link brings that last hop back into the app.

## What is missing

**The Apple Team ID.** The association file identifies the app as `<TEAMID>.<bundle id>`,
and the Team ID only exists once the Apple Developer account is set up. Until then this
directory holds no `apple-app-site-association` file and nginx answers 404 — the same
answer it gives today, so nothing changes for anyone.

The Team ID is not a secret (it appears in App Store metadata), so the finished file is
committed here rather than injected at deploy time. Nothing about it varies per host except
the app id, which is why alpha and production each get their own entry.

## Filling it in

Copy `apple-app-site-association.example.json` to `apple-app-site-association` — **no
extension** — replace `TEAMID`, and commit it. Then check the deployed result:

```bash
curl -fsS https://alpha.teameet.co.kr/.well-known/apple-app-site-association | python3 -m json.tool
```

It must come back `200` with `content-type: application/json`, over https, with no redirect.
Apple's fetcher follows none, and a redirect is the usual reason a link silently keeps
opening Safari.

## Paths

Deliberately narrow: only `/callback/*`, the sign-in redirect this exists for. Every path
listed here is a page the shell will render with the session cookie attached, so widening
the list widens what a link someone else sends can put in front of the reader. Widen it
only for a specific need.
