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

Put `<div className="fx-ambient"><div className="fx-horizon" /></div>` near the top of the page for Ambient,
Drifting and Horizon. Add
`fx-lift` to cards that should glow (Underglow) or shine (Shine), and `fx-neon` to headings for Neon.

Pick the default look and the allowed themes in `lib/duwop-config.ts`. To save the look somewhere other
than the browser, subscribe with `onLookChange(look => ...)`.

## Aphrodite pack

Two dark themes: **Aphrodite Blue** (midnight blue, pearl and champagne) and
**Aphrodite Charcoal** (warm charcoal with blush accents). Both use italic Fraunces
headings and neutral surfaces. Effects are off by default when selecting either theme.

This fork publishes the pack at:

```json
"registries": { "@duwop": "https://raw.githubusercontent.com/JudgeBreddd/DUWOP/main/public/r/{name}.json" }
```

```sh
npx shadcn add @duwop/aphrodite
```

Import `aphrodite` from `"./aphrodite"` in `lib/duwop-config.ts` and append it to
`extraThemes` (retain any other packs):

```ts
extraThemes: [...aphrodite],
```

The existing `<Appearance />` picker lists both and saves the choice. If `themes` is
an allowlist, add `aphrodite-blue` and `aphrodite-charcoal` there too. The installer
adds `@import "@/lib/aphrodite.css"`; keep that import in the app stylesheet.

For a new app that should start in blue, set its `defaultLook` to:

```ts
{ theme: "aphrodite-blue", effects: [], amoled: false, font: "inter" }
```

Keep calling `applyLook(loadLook())` so saved choices win over that default. For a
custom switcher, pass the selected id through `lookForTheme(id, loadLook())` and then
`applyLook(...)`. With `loadFonts: false`, host Fraunces yourself, including its italic
face. AMOLED deliberately replaces the approved surface colors with black.

## EH Editor (dev tool)

A visual editor that sits in front of your running app. Move, reword, restyle and comment on the real UI;
the edits save as a handoff (`eh-data/<page>.handoff.md`) for Claude Code, and the chat box runs Claude to
change the code. Needs Node 18+, no installs.

```sh
npx shadcn add @duwop/eh-editor   # tools/eh-editor/ + a Claude Code /editor skill
node tools/eh-editor/server.mjs --proxy http://127.0.0.1:5173 --app . --port 4180 --claude
```

Open http://127.0.0.1:4180/ and press Ctrl+Shift+E. Or type `/editor` in Claude Code and it starts the dev
server and the editor for you. Leave out `--claude` for hand editing only; with it, each chat message is one
`claude -p` run on your plan (Sonnet; `--model opus` to change) with file tools only.

## Build

```sh
npm run build   # writes public/r/*.json
```

MIT licence.
