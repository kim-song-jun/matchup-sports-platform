---
"v1_web": minor
---

Restore a top-left back control on the email signup screen, and make back controls survive the desktop layout. The signup form rendered without a top bar at all, so once you entered it the only way out was the inline "이전" button buried under the progress bar. It now shows "‹ 회원가입" in the top-left going back to the terms step, which in turn goes back to login — a visible path out of signup at every step. On top of that, `AuthFrame` only ever drew `backHref` inside the mobile top bar, which desktop CSS hides entirely at ≥1024px, so login, terms and signup all had no visible back control on desktop; the in-card nav that was already restoring this for the Kakao signup exit now renders for link-style back too. The inline "이전" button no longer appears on the first signup step, where it did exactly what the new header control does.
