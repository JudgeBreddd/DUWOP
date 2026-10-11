# Contributing to DUWOP

Written for a contributor's coding agent (Claude Code or similar) and the person driving it. Read this
whole file before changing anything here.

## What DUWOP is

**DU**sk**W**ood **O**asis **P**ackaged: a shadcn registry. Each "item" is a set of files an app pulls in
with `npx shadcn add @duwop/<name>`. GitHub serves the built JSON in `public/r/` for free, so there is no
server. The core item is `theme` (themes, effects, fonts); everything else is an opt-in add-on.

Two people work on it: Kaize (owner, merges PRs) and Tyler. Both use Claude Code with shadcn. Kaize designs
with the Impeccable skill, Tyler with UI/UX Pro Max. Either is fine here: the design tool shapes how a theme
looks, but every package must follow the rules below so it drops into any app.

## Layout

| Path | Holds |
|---|---|
| `registry.json` | The item list and the files each item installs. Edit this to add an item |
| `_engine/registry/theme/` | `duwop.css` (core themes and effects), `theme.ts` (theme, effect and font lists; `applyLook`, `loadLook`, `onLookChange`, `rollPalette`), `duwop-config.ts` (the one file an app edits) |
| `_engine/registry/appearance/` | `appearance.tsx`: the Settings → Appearance picker |
| `_engine/registry/boot/` | `duwop-boot.js` (blocking head script, paints the saved look before first paint) and `DuwopBoot.astro` |
| `_engine/registry/gods/` | `gods.css` + `gods.ts`: **Glamours of the Gods**, the model for a theme pack |
| `_engine/registry/mode/` | `mode-toggle.tsx`: light / dark / system switch |
| `_engine/registry/popcorn/` | `popcorn.tsx`: the model for an add-on effect |
| `_engine/registry/design-docs/` | Starter `PRODUCT.md` / `DESIGN.md` written against DUWOP token names |
| `public/r/` | Build output (`npm run build`). Committed, because GitHub serves it |

## Rules

1. **Modular.** Only what every app needs goes in `theme`. A themed pack, an effect only some apps want,
   or a special component is its own item that installs separately.
2. **No app-specific code in packages.** App choices live in that app's `lib/duwop-config.ts`.
3. **Public repo.** Nothing secret, ever: no keys, tokens, `.env`, private hostnames or personal data.
4. **Two-part theme selectors**, so a theme beats an app's own `:root` / `.dark` tokens whatever order CSS
   loads: `.dark[data-theme="x"]` for dark and `[data-theme="x"]:not(.dark)` for light.
5. **Reduced motion.** Every animated effect stops under `prefers-reduced-motion: reduce`.
6. **Contrast.** Titles at least 3:1, button and body text at least 4.5:1 (WCAG AA), in every mode a
   theme ships.
7. **Fonts are measured.** A new font needs an `adjust` value so a sample line is the same width as Inter,
   within 3%. Measure it in a browser; don't guess.
8. **Generic names, own code.** Name looks generically ("8-bit", not a product's name), don't copy another
   project's code, fonts or images unless its licence allows it, and note the licence in the PR.
9. **Animate cheaply.** Move things with `transform` / `opacity`, not `background-position` or filters on
   page-sized layers (that made an early theme stutter).

## Recipe: a new theme pack (like `gods`)

1. Make `_engine/registry/<pack>/<pack>.css` and `<pack>.ts`.
2. In the CSS, one block per theme and mode. Each sets the shadcn tokens plus DUWOP's: `--nh`, `--nc`,
   `--primary`, `--glow2`. Copy the shape of a block in `gods.css`.
3. In the TS, export an array of `Theme` (type from `./theme`): `id`, `name`, `note`, `dark`
   (`true`, `false` or `"both"`), optional `display` font and default `effects`. See `gods.ts`.
4. Add the item to `registry.json` with `"registryDependencies": ["@duwop/theme"]` and a `css` entry
   `"@import \"@/lib/<pack>.css\"": {}`. Copy the `gods` entry.
5. Apps turn it on in their config: `import { <pack> } from "./<pack>"` then `extraThemes: <pack>`.
6. Say in the item's `description` what it is and how to turn it on.

A new **core** theme (rare: only if every app should offer it) is one CSS block in `duwop.css` plus one
entry in `themes` in `theme.ts`. A new **effect** follows `popcorn`: its own item, turned on with
`extraEffects` in the app's config.

## Test before a PR

1. `npm install`, then `npm run build`. It must write `public/r/<item>.json` with no errors.
2. Serve the build: `python -m http.server 4174` inside `public/`.
3. In a throwaway Vite (or Astro) + shadcn app outside this repo, add to `components.json`:
   `"registries": { "@duwop": "http://localhost:4174/r/{name}.json" }`
   (an `http://` URL; a Windows `C:/...` path fails with "unknown scheme").
4. `npx shadcn add @duwop/theme @duwop/boot @duwop/<your-item>`, turn it on in `lib/duwop-config.ts`,
   and run the app.
5. Check every theme in the pack in light and dark (whichever it ships) at desktop and phone width,
   check contrast (rule 6), and reload to confirm no flash of the wrong theme.
6. Put screenshots in the PR description, not in the repo (`*.png` is not published).

## How to send work

- Branch from `main` (`theme/<pack-name>`, `fix/<thing>`). Never push to `main`.
- One PR per round of work. Commit the rebuilt `public/r/` with the source change.
- The PR says what the item is, how to turn it on, what you tested, and any borrowed references with
  their licences. Kaize reviews and merges.
- Don't edit another person's open PR or rename existing theme ids: apps have saved looks that use them.

## Updating an app later

`npx shadcn add @duwop/<item> --overwrite` also overwrites the app's `lib/duwop-config.ts`. Restore that
one file from git afterwards.
