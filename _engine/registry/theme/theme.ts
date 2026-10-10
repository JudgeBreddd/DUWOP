// DUWOP theme (@duwop/theme). Each theme is a set of colour tokens in duwop.css, selected by data-theme on
// <html>; effects are words in data-fx; AMOLED is data-amoled; the font is --app-font. applyLook puts a
// look on the page and saves it to localStorage, so the boot script can apply it before the app loads
// (no flash). Apps that also save it elsewhere (a server, an account) subscribe with onLookChange.

import { duwopConfig } from "./duwop-config";

export type Theme = {
  id: string;
  name: string;
  note: string;
  dark: boolean;
  /** Font id this theme looks best with. A picker can offer it; applyLook never forces it. */
  font?: string;
  /** Effect ids this theme looks best with. */
  effects?: string[];
};

export const themes: Theme[] = [
  { id: "trove", name: "Trove", note: "Gold on deep ink. The original.", dark: true },
  { id: "midnight", name: "Midnight", note: "Electric blue, late-night cinema.", dark: true },
  { id: "ember", name: "Ember", note: "Warm orange glow.", dark: true },
  { id: "forest", name: "Forest", note: "Deep green and emerald.", dark: true },
  { id: "synthwave", name: "Synthwave", note: "Neon pink and cyan.", dark: true },
  { id: "rose", name: "Rose", note: "Soft pink on plum.", dark: true },
  { id: "arctic", name: "Arctic", note: "Ice blue on slate.", dark: true },
  { id: "mono", name: "Mono", note: "Black and white, no colour.", dark: true },
  {
    id: "outrun",
    name: "Outrun",
    note: "80s arcade racer: sunset orange on violet.",
    dark: true,
    font: "chakra",
    effects: ["ambient", "horizon", "motion"],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    note: "Hazard yellow and cyan, hard edges.",
    dark: true,
    font: "chakra",
    effects: ["underglow", "neon"],
  },
  {
    id: "8bit",
    name: "8-bit",
    note: "Cartridge colours and pixel shadows.",
    dark: true,
    font: "pixelify",
    effects: ["underglow"],
  },
  { id: "ascii", name: "ASCII", note: "Green phosphor terminal.", dark: true, font: "jetbrains", effects: ["neon"] },
  { id: "custom", name: "Roll the dice", note: "A random palette. Roll again for another.", dark: true },
  { id: "daylight", name: "Daylight", note: "Light mode.", dark: false },
  { id: "linen", name: "Linen", note: "Scandi neutrals: oat, clay and sage.", dark: false, font: "outfit" },
];

export const effects = [
  { id: "underglow", name: "Underglow", note: "Cards lift and glow in the theme's colour when you point at them." },
  { id: "ambient", name: "Ambient glow", note: "A soft wash of the theme's colours behind the page." },
  { id: "motion", name: "Drifting glow", note: "Moves the ambient glow and the horizon grid. Needs one of them on." },
  { id: "shine", name: "Shine", note: "A sweep of light across a card on hover." },
  { id: "horizon", name: "Horizon", note: "An 80s neon grid running to the horizon." },
  { id: "neon", name: "Neon", note: "Headings glow like neon tubes, with the odd flicker." },
] as const;

/** Fonts from Google Fonts, loaded only when picked. Inter is the default; System needs no download. */
export const fonts = [
  // adjust: a font-size-adjust value that gives each font about the same text width as Inter, so switching
  // fonts never reshapes the layout (measured in Chromium; JetBrains Mono was 19% wider, Outfit 9% narrower).
  { id: "inter", name: "Inter", family: "Inter", adjust: 0, note: "The default. Clean and neutral." },
  { id: "system", name: "System", family: "", adjust: 0.539, note: "Your device's own font. Nothing to download." },
  { id: "outfit", name: "Outfit", family: "Outfit", adjust: 0.521, note: "Round and friendly." },
  { id: "spacegrotesk", name: "Space Grotesk", family: "Space Grotesk", adjust: 0.481, note: "Techy, a bit quirky." },
  { id: "lexend", name: "Lexend", family: "Lexend", adjust: 0.525, note: "Wide and easy to read." },
  {
    id: "atkinson",
    name: "Atkinson Hyperlegible",
    family: "Atkinson Hyperlegible",
    adjust: 0.537,
    note: "Made for low vision.",
  },
  { id: "nunito", name: "Nunito", family: "Nunito", adjust: 0.505, note: "Soft rounded ends." },
  { id: "jetbrains", name: "JetBrains Mono", family: "JetBrains Mono", adjust: 0.466, note: "Monospace, for the nerds." },
  { id: "pixelify", name: "Pixelify Sans", family: "Pixelify Sans", adjust: 0.453, note: "Chunky pixels, 8-bit style." },
  { id: "chakra", name: "Chakra Petch", family: "Chakra Petch", adjust: 0.529, note: "Squared-off, sci-fi HUD." },
] as const;

/** A rolled palette: neutral hue and chroma, accent hue, second-glow hue. */
export type Palette = { nh: number; nc: number; ph: number; gh: number };

export type Look = { theme: string; effects: string[]; amoled: boolean; font: string; palette?: Palette };

/** The themes this app lets users pick (lib/duwop-config.ts). */
export const allowedThemes = () =>
  duwopConfig.themes === "all" ? themes : themes.filter((t) => duwopConfig.themes.includes(t.id));

/** A random, readable palette for the "custom" theme: any neutral hue, an accent on the opposite side of
 *  the wheel, lightness and chroma kept in the range every other dark theme uses. */
export function rollPalette(): Palette {
  const nh = Math.round(Math.random() * 360);
  const ph = Math.round(nh + 120 + Math.random() * 120) % 360;
  return { nh, nc: Math.round((0.01 + Math.random() * 0.04) * 1000) / 1000, ph, gh: (ph + 40 + Math.round(Math.random() * 60)) % 360 };
}

/** The CSS variables a palette sets on <html>. */
export const paletteVars = (p: Palette): Record<string, string> => ({
  "--nh": String(p.nh),
  "--nc": String(p.nc),
  "--primary": `oklch(0.78 0.16 ${p.ph})`,
  "--glow2": `oklch(0.68 0.18 ${p.gh})`,
});
const PALETTE_VARS = ["--nh", "--nc", "--primary", "--glow2"];

const listeners = new Set<(look: Look) => void>();

/** Runs fn every time applyLook runs. Returns a function that unsubscribes. */
export function onLookChange(fn: (look: Look) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The saved look, or the app's default. */
export function loadLook(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(duwopConfig.storageKey) || "null");
    if (saved?.theme && Array.isArray(saved.effects)) return saved;
  } catch {
    // Storage blocked or bad JSON: fall through to the default.
  }
  return duwopConfig.defaultLook;
}

/** Puts a look on the page now, remembers it for the next load, and tells onLookChange subscribers.
 *  Returns the look as applied (the "custom" theme gains a palette if it had none). */
export function applyLook(look: Look): Look {
  const html = document.documentElement;
  const theme = themes.find((t) => t.id === look.theme) ?? themes[0];
  const font = fonts.find((f) => f.id === look.font) ?? fonts[0];
  const url = font.family
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@400;500;600;700&display=swap`
    : "";
  if (theme.id === "custom" && !look.palette) look = { ...look, palette: rollPalette() };
  const vars = theme.id === "custom" && look.palette ? paletteVars(look.palette) : {};

  html.dataset.theme = theme.id;
  html.dataset.fx = look.effects.join(" ");
  html.classList.toggle("dark", theme.dark);
  html.toggleAttribute("data-amoled", look.amoled);
  html.style.setProperty("--app-font", font.family ? `"${font.family}"` : "system-ui");
  if (font.adjust) html.style.setProperty("--app-font-adjust", String(font.adjust));
  else html.style.removeProperty("--app-font-adjust");
  for (const v of PALETTE_VARS) html.style.removeProperty(v);
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
  loadFont(url);

  try {
    // The boot script reads this copy, so it carries everything needed to paint without this module.
    localStorage.setItem(
      duwopConfig.storageKey,
      JSON.stringify({ ...look, dark: theme.dark, family: font.family, adjust: font.adjust, url, vars }),
    );
  } catch {
    // Private windows can refuse storage; the look still applies for this visit.
  }
  for (const fn of listeners) fn(look);
  return look;
}

function loadFont(url: string) {
  let link = document.getElementById("app-font") as HTMLLinkElement | null;
  if (!url) return link?.remove();
  if (!link) {
    link = document.createElement("link");
    link.id = "app-font";
    link.rel = "stylesheet";
    document.head.append(link);
  }
  if (link.href !== url) link.href = url;
}
