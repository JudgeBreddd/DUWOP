---
name: editor
description: Open this app ready for hand editing in the EH Editor (start the dev server if needed, put the editor in front with the Claude chat on). Use when the user types /editor, or says "let me edit the app", "open this in the editor", "launch the editor".
argument-hint: "[page path or dev server URL]"
---

# Editor

The EH Editor lives in `tools/eh-editor/` (installed by `npx shadcn add @duwop/eh-editor`). It sits in front of the
running app: the user moves, rewords, restyles and comments on the real UI, the edits save as a handoff in `eh-data/`,
and the chat runs `claude -p` in this folder to change the real code.

1. Find the dev server URL: the user's argument, else the `dev` script and its config (Vite: 5173, Astro: 4321, Next: 3000).
   Write it as `127.0.0.1`, not `localhost`.
2. If nothing answers there, start the dev server in the background (`npm run dev`, or the package manager this repo uses)
   and wait until it answers. Vite listens on IPv6 only by default: pass `--host 127.0.0.1`.
3. Start the editor in the background on the first free port from 4180:

   ```
   node tools/eh-editor/server.mjs --proxy http://127.0.0.1:<dev port> --app . --port 4180 --claude
   ```

   A plain folder of HTML needs no dev server: `node tools/eh-editor/server.mjs <folder> --app <folder> --port 4180 --claude`.
4. Check `http://127.0.0.1:4180/__eh/ping` answers, then give the user the URL.

Tell the user: Ctrl+Shift+E toggles the editor; saves land in `eh-data/` (the handoff is `eh-data/<page>.handoff.md`);
each chat message is one `claude -p` run on their Claude plan (Sonnet; `--model opus` to change), with file tools only.
Leave out `--claude` if they only want hand editing.

Click-to-source (`file:line` in the handoff) needs the dev server to stamp `data-insp-path` (code-inspector-plugin).
