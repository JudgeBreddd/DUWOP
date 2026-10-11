// DUWOP mode switch (@duwop/mode): light / dark / system for sites that set their own look and don't offer the
// full Appearance picker (brand sites, stores). Changes only the mode; the theme and effects stay the site's.
// Works with themes that have both looks (dark: "both", e.g. @duwop/gods). System follows the device live.

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyLook, loadLook, type Mode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const modes: { id: Mode; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

export function ModeToggle({ className }: { className?: string }) {
  // Read after mount: the server render can't know the visitor's choice (the boot script already painted it).
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => setMode(loadLook().mode ?? "dark"), []);

  return (
    <div role="radiogroup" aria-label="Colour mode" className={cn("inline-flex rounded-full border border-border p-0.5", className)}>
      {modes.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          aria-label={label}
          title={label}
          onClick={() => {
            applyLook({ ...loadLook(), mode: id });
            setMode(id);
          }}
          className={cn(
            "grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
            mode === id && "bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
