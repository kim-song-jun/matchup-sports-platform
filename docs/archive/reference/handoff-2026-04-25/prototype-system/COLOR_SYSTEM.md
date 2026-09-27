# Color System

## Intent

Teameet prototype는 Toss-like white-first interface를 기준으로 한다.

- white-first background
- `#3182f6` as primary interaction blue
- grey text hierarchy
- semantic colors only for state
- decorative gradients/glows avoided

## Core Tokens

| Token | Value | Usage |
|---|---:|---|
| `--blue500` | `#3182f6` | primary action, selected state |
| `--blue50` | `#e8f3ff` | selected/weak blue background |
| `--grey900` | `#191f28` | strong text |
| `--grey700` | `#4e5968` | body text |
| `--grey600` | `#6b7684` | muted text |
| `--grey500` | `#8b95a1` | caption text |
| `--grey100` | `#f2f4f6` | neutral surface |
| `--grey200` | `#e5e8eb` | border |
| `--bg` | `#ffffff` | main surface |
| `--static-white` | `#ffffff` | text/icons on brand/media surfaces |
| `--red500` | `#f04452` | destructive/error |
| `--green500` | `#03b26c` | success |
| `--orange500` | `#fe9800` | warning/pending |

## Fix11 Normalization

Before `fix11`, old prototype files still contained many raw Toss colors such as:

- `#191f28`
- `#3182f6`
- `#f2f4f6`
- `#e5e8eb`
- `#6b7684`
- `#8b95a1`
- `#fff`

In `fix11`, these were normalized into shared tokens across prototype JSX files.

Result:

- total color references: `4395`
- token/variable-backed references: about `93%`
- remaining hard color references: `316`
- remaining hard values are mostly token definitions, scrims/overlays, dark canvas helpers, and a few visual mock accents.

## Rules

- New surfaces must use `var(--bg)`, `var(--grey50)`, `var(--grey100)`, and `var(--border)`.
- New text must use `var(--text-strong)`, `var(--text)`, `var(--text-muted)`, or `var(--text-caption)`.
- New primary actions must use `var(--blue500)`.
- Do not introduce new hex colors in screen files unless it is a deliberate media/canvas accent.
- If a new color is needed repeatedly, add it to `tokens.jsx` first.
- Use alpha tokens such as `--blue-alpha-08` and `--blue-alpha-10` instead of hex-alpha strings.

## Remaining Color Debt

Low-risk remaining items:

- `rgba(...)` scrims over media.
- dark prototype canvas helpers.
- sport-specific diagram accents.
- one-off local mock accents.

These can be normalized in a future pass after visual selection of final variants.

