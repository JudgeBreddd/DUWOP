// DUWOP Anymouse (@duwop/anymouse): the anonymous idea / bug / gripe box. Drop <Anymouse /> anywhere (a header, a
// Settings page); it opens a small dialog and POSTs { kind, text, page } as JSON to `endpoint`. The app's server
// answers that with sendAnymouse() from lib/anymouse-server.ts, which posts to the app's Discord thread.
// Nothing about the user is sent: no name, no account, no device.

import { Bug, Lightbulb, Mouse, Send, ThumbsDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AnymouseKind = "idea" | "bug" | "gripe";

const kinds: { id: AnymouseKind; label: string; Icon: typeof Bug }[] = [
  { id: "idea", label: "Idea", Icon: Lightbulb },
  { id: "bug", label: "Bug", Icon: Bug },
  { id: "gripe", label: "Gripe", Icon: ThumbsDown },
];

export function Anymouse({
  endpoint = "/api/anymouse",
  headers,
  children,
  className,
}: {
  endpoint?: string;
  /** Extra request headers, e.g. a CSRF token. The request always sends JSON with the browser's cookies. */
  headers?: Record<string, string>;
  /** The trigger's label. Default: a mouse icon and "Anymouse". */
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AnymouseKind>("idea");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ kind, text: text.trim(), page: location.pathname }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `couldn't send (${res.status})`);
      setText("");
      setNote({ ok: true, text: "Sent. Thanks, it's anonymous." });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNote(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          {children ?? (
            <>
              <Mouse className="size-4" aria-hidden /> Anymouse
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={send} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mouse className="size-5 text-primary" aria-hidden /> Anymouse
            </DialogTitle>
            <DialogDescription>An idea, a bug or a gripe. No name is sent.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Kind" className="grid grid-cols-3 gap-2">
            {kinds.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={kind === id}
                onClick={() => setKind(id)}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-md border border-border text-sm text-muted-foreground transition-colors hover:text-foreground",
                  kind === id && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <Textarea
            aria-label="Your note"
            placeholder="What should we know?"
            className="min-h-32 text-base"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {note && (
            <p role="status" className={cn("text-sm", note.ok ? "text-muted-foreground" : "text-destructive")}>
              {note.text}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" className="h-11" disabled={busy || !text.trim()}>
              <Send className="size-4" aria-hidden /> Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
