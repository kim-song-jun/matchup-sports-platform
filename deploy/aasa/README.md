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

Both entries share the path rules below. If the production app moves to a new Apple
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

Since 2026-10-09 (product decision: links shared from other apps should open the installed
app on the same page) every user-facing page is associated; the first matching component
wins, so the exclusions come before the final `*`:

- `/callback/*` — the Kakao sign-in redirect this file was created for.
- excluded: `/admin*` (admin console and content preview), `/tournament-ops*`, `/api/*`,
  `/uploads/*`, `/.well-known/*`, and file routes (`*.txt`, `*.xml`, `manifest.webmanifest`).

Every associated path is a page the shell renders with the session cookie attached, so a link
someone else sends lands signed in. Before associating a new kind of page, check that it does
nothing on load — joining, accepting, paying, deleting must stay behind an explicit tap (the
invite landing `/invite/[token]` joins only on its button). A page that acts on load must be
added to the exclusions above.

A link tapped on a teameet.co.kr page in Safari still stays in Safari — iOS only hands over
links coming from another app or domain. The web's own "open in app" prompt therefore points
to the App Store, not to a same-site link.
