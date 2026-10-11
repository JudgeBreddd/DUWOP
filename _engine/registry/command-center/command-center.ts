// Command Center (@duwop/command-center): the theme entries for command-center.css. All dark-only.
// Add them in lib/duwop-config.ts: import { commandCenter } from "./command-center"; ... extraThemes: commandCenter.

import type { Theme } from "./theme";

export const commandCenter: Theme[] = [
  {
    id: "redline",
    name: "Redline",
    note: "True black, gunmetal and a red glow behind every card.",
    dark: true,
    font: "jetbrains",
    effects: ["underglow", "ambient"],
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    note: "The Tokyo Night editor palette: blue on night indigo.",
    dark: true,
    font: "jetbrains",
    effects: ["underglow"],
  },
  {
    id: "event-horizon",
    name: "Event Horizon",
    note: "True black and steel blue. Glows only when you point at it.",
    dark: true,
    font: "spacegrotesk",
    effects: ["underglow"],
  },
];
