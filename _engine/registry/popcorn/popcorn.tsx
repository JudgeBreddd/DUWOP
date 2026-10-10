// DUWOP popcorn rain (@duwop/popcorn): popcorn drifting down behind the page. An opt-in add-on, not part of
// every app: put <PopcornRain /> once near the top of the layout, and add the effect to the picker in
// lib/duwop-config.ts: extraEffects: [{ id: "popcorn", name: "Popcorn rain", note: "..." }].
// It shows only while the look's effects include "popcorn", moves by transform only (no repaint per frame),
// and stays hidden for anyone who asked their system for less motion.

import type { CSSProperties } from "react";

const KERNELS = 16;

// Fixed, evenly spread values so every visit (and server render) looks the same; no Math.random.
const kernels = Array.from({ length: KERNELS }, (_, i) => {
  const r = (n: number) => ((i * n) % 97) / 97;
  return {
    left: `${((i + r(31)) * 100) / KERNELS}%`,
    size: 16 + Math.round(r(53) * 14),
    fall: 11 + r(17) * 9,
    delay: -r(71) * 20,
    sway: 14 + Math.round(r(29) * 26),
    spin: (i % 2 ? 1 : -1) * (180 + Math.round(r(41) * 360)),
  };
});

const css = `
.fx-popcorn { display: none; position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
@media (prefers-reduced-motion: no-preference) {
  [data-fx~="popcorn"] .fx-popcorn { display: block; }
}
.fx-popcorn > span {
  position: absolute; top: -48px;
  animation: duwop-popcorn-fall var(--fall) linear var(--delay) infinite;
  will-change: transform;
}
.fx-popcorn svg {
  display: block; opacity: 0.85;
  animation: duwop-popcorn-sway calc(var(--fall) / 3) ease-in-out var(--delay) infinite alternate;
  filter: drop-shadow(0 0 6px color-mix(in oklch, var(--primary) 35%, transparent));
}
@keyframes duwop-popcorn-fall {
  to { transform: translateY(calc(100dvh + 96px)) rotate(var(--spin)); }
}
@keyframes duwop-popcorn-sway {
  from { transform: translateX(calc(var(--sway) * -1)); }
  to { transform: translateX(var(--sway)); }
}
`;

/** One popped kernel: a cream puff with a butter tint and a toasted hull fleck. */
function Kernel({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g fill="oklch(0.97 0.03 90)">
        <circle cx="11" cy="12" r="7" />
        <circle cx="20" cy="10" r="7" />
        <circle cx="23" cy="19" r="6.5" />
        <circle cx="14" cy="21" r="7" />
        <circle cx="16" cy="15" r="6" />
      </g>
      <circle cx="21" cy="11" r="3.2" fill="oklch(0.9 0.12 90)" />
      <circle cx="12" cy="20" r="2.6" fill="oklch(0.88 0.13 85)" />
      <ellipse cx="17" cy="16" rx="2.2" ry="1.4" fill="oklch(0.55 0.09 60)" />
    </svg>
  );
}

export function PopcornRain() {
  return (
    <div className="fx-popcorn" aria-hidden="true">
      <style>{css}</style>
      {kernels.map((k, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list that never reorders
          key={i}
          style={
            {
              left: k.left,
              "--fall": `${k.fall}s`,
              "--delay": `${k.delay}s`,
              "--sway": `${k.sway}px`,
              "--spin": `${k.spin}deg`,
            } as CSSProperties
          }
        >
          <Kernel size={k.size} />
        </span>
      ))}
    </div>
  );
}
