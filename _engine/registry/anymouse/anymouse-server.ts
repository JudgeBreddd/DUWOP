// DUWOP Anymouse, server half (@duwop/anymouse). Posts a note from the <Anymouse /> box to Discord, into the app's
// own thread. One webhook can serve every app (it lives in the channel that holds the "AM - <App>" threads); each
// app only needs its thread id. Plain fetch, no framework: wire it into any server in three lines, e.g. Hono:
//
//   app.post("/api/anymouse", async (c) => {
//     const r = await sendAnymouse(await c.req.json(), { app: "Session Hub" });
//     return c.json(r.body, r.status);
//   });
//
// Settings come from the options, else the environment: ANYMOUSE_DISCORD_WEBHOOK and ANYMOUSE_THREAD_ID.
// Keep the webhook server-side only: anyone holding it can post to the channel.

export type AnymouseOptions = {
  /** Shown in the message footer, e.g. "Session Hub". */
  app: string;
  /** Discord webhook URL. Default: process.env.ANYMOUSE_DISCORD_WEBHOOK. */
  webhook?: string;
  /** The app's thread id. Default: process.env.ANYMOUSE_THREAD_ID. Empty = post in the channel itself. */
  thread?: string;
  /** Most notes accepted per 10 minutes (whole server). Default 10. */
  limit?: number;
};

export type AnymouseResult = { status: 200 | 400 | 429 | 502 | 503; body: { ok: true } | { error: string } };

const KINDS = { idea: "💡 Idea", bug: "🐛 Bug", gripe: "👎 Gripe" } as const;
const WINDOW = 10 * 60_000;
const recent: number[] = [];

export async function sendAnymouse(input: unknown, opts: AnymouseOptions): Promise<AnymouseResult> {
  const env = typeof process === "undefined" ? {} : process.env;
  const webhook = opts.webhook ?? env.ANYMOUSE_DISCORD_WEBHOOK ?? "";
  const thread = opts.thread ?? env.ANYMOUSE_THREAD_ID ?? "";
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook))
    return { status: 503, body: { error: "Anymouse isn't set up yet (no Discord webhook)" } };
  if (thread && !/^\d{15,22}$/.test(thread)) return { status: 503, body: { error: "Anymouse thread id isn't a Discord id" } };

  const b = (input ?? {}) as Record<string, unknown>;
  const kind = typeof b.kind === "string" && b.kind in KINDS ? (b.kind as keyof typeof KINDS) : "idea";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const page = typeof b.page === "string" ? b.page.slice(0, 200) : "";
  if (!text) return { status: 400, body: { error: "write something first" } };
  if (text.length > 2000) return { status: 400, body: { error: "keep it under 2000 characters" } };

  const now = Date.now();
  while (recent.length && recent[0] < now - WINDOW) recent.shift();
  if (recent.length >= (opts.limit ?? 10)) return { status: 429, body: { error: "lots of notes just now, try again in a few minutes" } };
  recent.push(now);

  const url = new URL(webhook);
  url.searchParams.set("wait", "true");
  if (thread) url.searchParams.set("thread_id", thread);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Anymouse",
        allowed_mentions: { parse: [] }, // a note saying @everyone pings no one
        embeds: [
          {
            title: KINDS[kind],
            description: text,
            footer: { text: page ? `${opts.app} · ${page}` : opts.app },
            timestamp: new Date(now).toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`anymouse: Discord answered ${res.status}`);
      return { status: 502, body: { error: `Discord refused it (${res.status})` } };
    }
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 502, body: { error: "couldn't reach Discord" } };
  }
}
