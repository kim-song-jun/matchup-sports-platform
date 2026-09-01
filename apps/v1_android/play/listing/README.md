# Google Play listing assets

Canonical release-ready listing files live in this directory. Store screenshots must be captured
from a production-signed build or a release-equivalent internal-test build; generated screenshots
must never be submitted as product evidence.

## Graphics

- `graphics/play-icon-512.png`: 512×512 Play icon, rendered from the repository-owned adaptive `팀밋` wordmark and brand color.
- `graphics/feature-graphic-1024x500.png`: 1024×500 Play feature graphic.
- Device screenshots are intentionally absent until the physical-device matrix is complete.

Feature graphic generation prompt:

> Create a polished Google Play Store feature graphic for 팀밋, a Korean community app that
> helps amateur sports players find matches, teams, venues, and lessons. Exact target composition:
> 1024×500 landscape. Clean premium product-brand style, not a phone mockup and not a screenshot.
> Use a vivid royal blue (#3483F5-like), deep navy (#111827-like), white, and very subtle cool gray.
> Build an abstract sports-field composition with crisp geometric court lines and several circular
> player nodes converging toward a central open-ring match symbol, conveying connection and fair play
> across multiple sports. Plenty of calm negative space; strong visual balance; flat vector-like
> shapes with restrained depth, no glow, no heavy shadows, no decorative left accent rail. Keep all
> important elements inside a central safe area. Absolutely no text, no letters, no logos, no
> app-store badges, no device frames, no gradients that reduce legibility, no photographic people.

The generated source was center-cropped and downsampled to the exact Play Console dimensions. The
launcher icon uses the existing project-owned v4 artwork and was not AI-edited.
