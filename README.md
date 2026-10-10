# DUWOP

Our shadcn registry: the shared pieces every app, site and service we build starts from.

## Theme

15 themes, an AMOLED mode, 6 effects and 10 fonts, all switched by attributes on `<html>`.

- **Dark:** Trove (gold on ink, the default), Midnight, Ember, Forest, Synthwave, Rose, Arctic, Mono,
  Outrun, Cyberpunk, 8-bit, ASCII, and Roll the dice (a random palette).
- **Light:** Daylight, Linen.
- **Effects:** Underglow, Ambient glow, Drifting glow, Shine, Horizon, Neon. All of them stop moving for
  anyone whose system asks for reduced motion.
- **Fonts:** Inter, System, Outfit, Space Grotesk, Lexend, Atkinson Hyperlegible, Nunito, JetBrains Mono,
  Pixelify Sans, Chakra Petch. Each is size-adjusted so a line of text is the same width in every font.

### Install

In an app that already has shadcn set up, add the registry to `components.json` once:

```json
"registries": { "@duwop": "https://raw.githubusercontent.com/itsdankai/DUWOP/main/public/r/{name}.json" }
```

Then:

```sh
npx shadcn add @duwop/theme @duwop/appearance @duwop/boot @duwop/design-docs   # Vite app
npx shadcn add @duwop/theme @duwop/appearance @duwop/boot-astro @duwop/design-docs   # Astro site
```

| Item | Adds |
|---|---|
| `theme` | `src/duwop.css` (imported into your main CSS for you), `lib/theme.ts`, `lib/duwop-config.ts` |
| `appearance` | `components/appearance.tsx`: drop `<Appearance />` on a Settings page |
| `boot` | `public/duwop-boot.js`. In `index.html` `<head>`, first thing: `<script src="/duwop-boot.js" data-key="duwop-look"></script>` (use your config's `storageKey`) |
| `boot-astro` | `boot` plus `components/DuwopBoot.astro`: put `<DuwopBoot />` first in your layout's `<head>` |
| `design-docs` | Starter `PRODUCT.md` and `DESIGN.md` for Impeccable |

Updating later: `npx shadcn add @duwop/theme --overwrite`, then restore your `lib/duwop-config.ts` from git
(the update overwrites it too).

### Use

```tsx
import { applyLook, loadLook } from "@/lib/theme"

applyLook(loadLook()) // on startup: the saved look, or the default from duwop-config.ts
```

Put `<div className="fx-ambient" />` near the top of the page for Ambient, Drifting and Horizon. Add
`fx-lift` to cards that should glow (Underglow) or shine (Shine), and `fx-neon` to headings for Neon.

Pick the default look and the allowed themes in `lib/duwop-config.ts`. To save the look somewhere other
than the browser, subscribe with `onLookChange(look => ...)`.

## Build

```sh
npm run build   # writes public/r/*.json
```

MIT licence.
