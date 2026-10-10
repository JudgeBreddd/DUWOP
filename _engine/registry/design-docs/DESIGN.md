---
name: <App name>
description: <One line: what this app is.>
colors:
  background: "var(--background)"
  surface: "var(--card)"
  raised: "var(--secondary)"
  text: "var(--foreground)"
  muted-text: "var(--muted-foreground)"
  primary: "var(--primary)"
  on-primary: "var(--primary-foreground)"
  glow: "var(--glow)"
  glow-2: "var(--glow2)"
  edge: "var(--border)"
  danger: "var(--destructive)"
typography:
  display:
    fontFamily: "var(--app-font), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "var(--app-font), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
  title:
    fontFamily: "var(--app-font), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.55
  body:
    fontFamily: "var(--app-font), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "var(--app-font), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
---

<!-- Starter from @duwop/design-docs. Replace every line in angle brackets, then delete this comment.
     After the app has a real UI, `/impeccable document` can rewrite this file from what shipped. -->

# Design System: <App name>

## Overview

This app wears the DUWOP look. Colours are CSS variables that change with the theme the user picks
(Settings → Appearance), so design against the token names above, never raw colours. The default theme
for new visitors is set in `src/lib/duwop-config.ts` (Trove, gold on deep ink, unless this app says
otherwise). <Name this app's north star in one line, e.g. "The Treasure Vault".>

## Colors

All colours come from the active DUWOP theme. **Primary** is the one accent: buttons, links, the focus
ring and selected states. **Glow** and **Glow 2** are only for effects (Underglow, Ambient, Horizon, Neon).

### Named Rules

- **Tokens only.** No hex values or Tailwind palette colours (`bg-blue-500`) in components; they don't change
  with the theme.
- **One accent per screen region.** Primary marks what to press or what is selected, nothing else.

## Typography

The font is the user's pick from the DUWOP list (`--app-font`), width-matched to Inter, so layouts hold in
every font. Use the scale above; weight carries hierarchy before size does.

## Layout

<Page widths, grid, how the phone layout differs.>

## Elevation & Depth

Surfaces step up in lightness: background, card, raised. Opt cards into effects with `fx-lift`; put one
`<div className="fx-ambient" />` near the top of the page for the backdrop effects.

## Shapes

Corners follow `--radius`, which some themes change (8-bit, ASCII and Cyberpunk are square). Use the
`rounded-*` utilities, never fixed pixel radii.

## Components

shadcn/ui components, themed by DUWOP. <List this app's signature components here.>

## Do's and Don'ts

### Do:

- Check new screens in at least Trove, Daylight and 8-bit: dark, light and square-cornered.
- Keep motion behind the effects switches, so reduced motion turns it off.

### Don't:

- Edit `src/duwop.css` or `src/lib/theme.ts` in the app. Change DUWOP itself so every app stays in step.
- Tone down the look to "quiet" without asking the builder.
