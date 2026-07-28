---
"v1_api": patch
---

Put the Teameet mark in the verification email header. The header was a text-only wordmark; it now leads with the real brand icon already served in production, sized and given explicit dimensions so clients reserve the right space. The wordmark stays next to it and the image carries alt text, so a client that blocks images by default still shows an intact header rather than a broken box — the same reason a data URI or inline SVG was not used, since Gmail strips both.
