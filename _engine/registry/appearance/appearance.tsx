// DUWOP Appearance picker (@duwop/appearance): theme, AMOLED, font and effects, for a Settings page.
// Shows only the themes this app allows (lib/duwop-config.ts). Every change applies at once through
// applyLook, which also saves it to localStorage. onChange fires only when the user picks something, so an
// app can save the look to its own server there without echoing its own applyLook calls back.

import { Dices } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { allowedThemes, applyLook, effects, fonts, type Look, loadLook, paletteVars, rollPalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function Appearance({
  className,
  onChange,
  children,
}: {
  className?: string;
  onChange?: (look: Look) => void;
  /** App-specific settings shown at the bottom of the card (e.g. MediaTrove's rating posters). */
  children?: ReactNode;
}) {
  const [look, setLook] = useState<Look>(loadLook);
  const themes = allowedThemes();
  const theme = themes.find((t) => t.id === look.theme);
  const change = (patch: Partial<Look>) => {
    const next = applyLook({ ...look, ...patch });
    setLook(next);
    onChange?.(next);
  };
  const toggle = (id: string, on: boolean) =>
    change({ effects: on ? [...look.effects, id] : look.effects.filter((e) => e !== id) });
  // The picked theme's suggested font and effects, when they aren't all on yet.
  const missing =
    theme &&
    ((theme.font && theme.font !== look.font) || theme.effects?.some((e) => !look.effects.includes(e)));
  const hasBackdrop = look.effects.includes("ambient") || look.effects.includes("horizon");

  return (
    <Card className={cn("gap-6 p-5", className)}>
      <div className="space-y-3">
        <p className="text-sm font-medium">Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => change({ theme: t.id, palette: t.id === "custom" ? (look.palette ?? rollPalette()) : look.palette })}
              aria-pressed={look.theme === t.id}
              // The preview carries the theme itself (and AMOLED), so it shows the real colours.
              data-theme={t.id}
              data-amoled={look.amoled ? "" : undefined}
              style={t.id === "custom" && look.palette ? (paletteVars(look.palette) as CSSProperties) : undefined}
              className={cn(
                t.dark && "dark",
                "rounded-xl border bg-background p-3 text-left text-foreground transition-shadow",
                look.theme === t.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded-full bg-primary" />
                <span className="size-4 rounded-full" style={{ background: "var(--glow2)" }} />
                <span className="size-4 rounded-full bg-card ring-1 ring-border" />
                {t.id === "custom" && <Dices className="ml-auto size-4 text-muted-foreground" aria-hidden />}
              </div>
              <p className="mt-2 text-sm font-medium">{t.name}</p>
              <p className="max-w-prose text-xs text-muted-foreground">{t.note}</p>
            </button>
          ))}
        </div>
        {look.theme === "custom" && (
          <button
            type="button"
            onClick={() => change({ palette: rollPalette() })}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:ring-1 hover:ring-primary/50"
          >
            <Dices className="size-4" aria-hidden /> Roll again
          </button>
        )}
        {missing && (
          <p className="text-sm text-muted-foreground">
            {theme.name} looks best with its own font and effects.{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() =>
                change({ font: theme.font ?? look.font, effects: [...new Set([...look.effects, ...(theme.effects ?? [])])] })
              }
            >
              Use them
            </button>
          </p>
        )}
        <label htmlFor="duwop-amoled" className="flex items-center gap-3 pt-2 text-sm">
          <Switch
            id="duwop-amoled"
            checked={look.amoled}
            onCheckedChange={(on) => change({ amoled: on })}
            disabled={!theme?.dark}
            aria-label="AMOLED mode"
          />
          <span>
            AMOLED mode
            <span className="block max-w-prose text-xs text-muted-foreground">
              True black backgrounds: easier on OLED screens and their batteries. Works with every dark theme.
            </span>
          </span>
        </label>
      </div>
      <div className="space-y-3 border-t pt-5">
        <p className="text-sm font-medium">Font</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fonts.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => change({ font: f.id })}
              aria-pressed={look.font === f.id}
              title={f.note}
              className={cn(
                "rounded-lg border bg-card px-3 py-2 text-left text-sm transition-shadow",
                look.font === f.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        <p className="max-w-prose text-xs text-muted-foreground">
          {fonts.find((f) => f.id === look.font)?.note} Fonts other than System load from Google Fonts.
        </p>
      </div>
      <div className="space-y-3 border-t pt-5">
        <p className="text-sm font-medium">Effects</p>
        {effects.map((e) => (
          <label key={e.id} htmlFor={`duwop-fx-${e.id}`} className="flex items-center gap-3 text-sm">
            <Switch
              id={`duwop-fx-${e.id}`}
              checked={look.effects.includes(e.id)}
              onCheckedChange={(on) => toggle(e.id, on)}
              disabled={e.id === "motion" && !hasBackdrop}
              aria-label={e.name}
            />
            <span>
              {e.name}
              <span className="block max-w-prose text-xs text-muted-foreground">{e.note}</span>
            </span>
          </label>
        ))}
        <p className="max-w-prose text-xs text-muted-foreground">
          Movement is switched off if your device is set to reduce motion.
        </p>
      </div>
      {children}
    </Card>
  );
}
