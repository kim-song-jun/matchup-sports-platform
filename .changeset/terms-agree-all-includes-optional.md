---
"v1_web": minor
---

Make the terms screen's agree-all cover optional consents, and stop showing internal document metadata. "필수 약관 전체 동의" only ticked the required items, so anyone who wanted the optional consent had to hunt for it afterwards — it is now "전체 동의" and ticks every item, with each optional item still individually removable and the continue button still gated on required consents alone, so declining an optional item never blocks signup. The agree-all toggle now reflects every item rather than only the required ones, so unticking a single optional consent turns it off instead of leaving it stuck on. Each agreement card also no longer prints the document version and consent status (`v1 · 새 동의 필요` / `· 동의 완료`) — the version is an internal token that means nothing to the user, and already-accepted items are conveyed by their checkbox being ticked and disabled.
