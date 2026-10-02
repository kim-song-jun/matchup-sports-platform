# Apple App Site Association

nginx serves `apple-app-site-association` from this directory at
`https://<host>/.well-known/apple-app-site-association`. That file is what makes a
`https://<host>/...` link open the iOS app instead of Safari.

## Why the app needs it

`apps/v1_ios` sends third-party authorization pages out to Safari on purpose — the shell
must not render Kakao's login form with the reader's session attached. The redirect back to
`/callback/kakao` therefore also completes in Safari, and the session is created in the
wrong browser. A universal link brings that last hop back into the app.

## Current association

The committed `apple-app-site-association` file contains both current App IDs:

- alpha: `U9J95Q6XD3.kr.co.teameet.alpha`
- production: `U9J95Q6XD3.kr.co.teameet`

Both entries cover only `/callback/*`. If the production app moves to a new Apple
organization, update only the production App ID after the new Team ID is confirmed;
preserve the alpha entry.

## Filling it in

Edit `apple-app-site-association` in place when an App ID changes — **no extension** —
and commit the confirmed value. Then check the deployed result:

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
