---
'v1_api': minor
'v1_web': minor
---

Give the admin tables page numbers and make their rows do something. Rows highlighted on hover but did nothing when clicked, and the only way forward was a "더 보기" button that piled results up without ever saying where you were or how much there was. Audit log rows now open a detail dialog with the untruncated target ID, the full reason, and the before/after state that the list has to cut short, and the list itself pages with a "전체 N건 중 M–K" readout. Admin list endpoints accept a page number alongside the existing cursor, and rows only take on a clickable appearance where a click is actually wired up.
