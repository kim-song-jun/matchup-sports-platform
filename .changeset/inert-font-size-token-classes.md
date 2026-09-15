---
"v1_web": patch
---

Restore the type scale that 186 places were asking for but not getting. `text-[var(--font-size-x)]` never set a font size — Tailwind v4 reads a bare `var()` inside `text-[...]` as a color, so those elements silently inherited 16px instead of the 11–20px the token named. Every occurrence now declares its type as `text-[length:var(--font-size-x)]`, and the v1 pattern check fails the build if the inert form comes back.
