#!/usr/bin/env node
// Event Horizon Editor — injector server. Zero dependencies (Node 18+).
//
//   node server.mjs <folder>                      serve a folder of HTML prototypes
//   node server.mjs --proxy http://127.0.0.1:5173 --app ../my-app   sit in front of a running app (Flask, Vite, ...)
//
// Options: --port 4173   --app <repo> (saves go to <repo>/eh-data)   --data ./eh-data   --host 127.0.0.1
//          --claude (chat runs `claude -p` in the app folder, or the served folder)   --model sonnet
//
// What it does: injects <script src="/__eh/eh.js"> into every HTML response, and exposes
//   GET  /__eh/ping           health + whether chat is on
//   GET  /__eh/eh.js          the editor
//   GET  /__eh/state?page=P   saved editor state for page P
//   PUT  /__eh/state?page=P   save {state, handoff}; writes <slug>.json and <slug>.handoff.md into --data
//   POST /__eh/chat           with --claude: one `claude -p` run, same session per page; without: says how to turn it on

import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const PORT = Number(opt('port', process.env.PORT || 4173));
const HOST = opt('host', '127.0.0.1');
const PROXY = opt('proxy', '');
const APP = opt('app', '') && path.resolve(opt('app'));
const DATA = path.resolve(opt('data', path.join(APP || process.cwd(), 'eh-data')));
const SWITCHES = ['--claude']; // flags without a value
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !SWITCHES.includes(args[i - 1])));
const ROOT = path.resolve(positional[0] || '.');
const CLAUDE = args.includes('--claude');
const MODEL = opt('model', 'sonnet');
const TAG = '<script src="/__eh/eh.js" data-server="" defer></script>' +
  (PROXY ? '' : "<script>new EventSource('/__eh/live').onmessage = () => location.reload()</script>");

// Live reload (static mode): any file change under ROOT reloads open pages. Editor ops replay after reload.
const live = new Set();
let liveTimer, chatting = 0;
if (!PROXY) fs.watch(ROOT, { recursive: true }, (_, f) => {
  if (f && path.resolve(ROOT, f).startsWith(DATA)) return; // our own saves
  if (chatting) return; // a reload now would drop the pending reply; the reply asks for one reload instead
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { for (const r of live) r.write('data: reload\n\n'); }, 150);
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const inject = (html) => {
  if (html.includes('/__eh/eh.js')) return html;
  const i = html.lastIndexOf('</body>');
  return i >= 0 ? html.slice(0, i) + TAG + html.slice(i) : html + TAG;
};
const slug = (p) => (String(p || 'index').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'index').slice(0, 120);
const readBody = (req) => new Promise((res, rej) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > 8e6) { rej(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => res(Buffer.concat(chunks)));
  req.on('error', rej);
});
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

// Only pages served by this editor may call it, or the app behind it: any other site open in the browser could
// otherwise POST /__eh/chat (a text/plain POST skips CORS preflight) or open the app's websocket and drive its agents.
// The proxy rewrites Origin for the app, so this check stands in for the app's own guard.
// Host allow-list blocks DNS rebinding (evil.example resolving to 127.0.0.1 passes the Origin check with a matching Host).
const refuse = (req) =>
  ![`127.0.0.1:${PORT}`, `localhost:${PORT}`, `${HOST}:${PORT}`].includes(req.headers.host) ? 'unknown Host'
  : req.headers.origin && req.headers.origin !== `http://${req.headers.host}` ? 'cross-origin request refused' : '';

async function handleEH(req, res, url) {
  const why = refuse(req);
  if (why) return json(res, 403, { error: why });
  const origin = req.headers.origin;
  if (req.method !== 'GET' && !origin) return json(res, 403, { error: 'missing Origin' });
  const route = url.pathname.slice('/__eh/'.length);

  if (route === 'live') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write(': ok\n\n'); live.add(res); req.on('close', () => live.delete(res));
    return;
  }
  if (route === 'ping') return json(res, 200, { ok: true, mode: PROXY ? 'proxy' : 'static', claude: CLAUDE, data: DATA });
  if (route === 'eh.js') {
    res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(path.join(HERE, 'overlay', 'eh.js')));
  }
  if (route === 'state') {
    const base = path.join(DATA, slug(url.searchParams.get('page')));
    if (req.method === 'GET') {
      try { return json(res, 200, JSON.parse(fs.readFileSync(base + '.json', 'utf8'))); }
      catch { return json(res, 200, { empty: true }); }
    }
    if (req.method === 'PUT') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      fs.mkdirSync(DATA, { recursive: true });
      fs.writeFileSync(base + '.json', JSON.stringify(body.state ?? {}, null, 2));
      if (typeof body.handoff === 'string') fs.writeFileSync(base + '.handoff.md', body.handoff);
      return json(res, 200, { ok: true, json: base + '.json', handoff: base + '.handoff.md' });
    }
  }
  if (route === 'chat' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!CLAUDE) return json(res, 200, { stub: true, reply: 'Chat is off. Restart the server with --claude to talk to Claude (each message is one claude -p run on your subscription).' });
    const page = String(body.context?.page?.path || '/');
    const sel = body.context?.selection;
    const prompt = `You are answering from the EH Editor chat panel, page ${page}. ` +
      (APP ? 'This folder is the app: make requested changes in its source.' : 'This folder holds the HTML prototypes: edit the page file directly.') +
      ' The handoff below lists the hand edits made in the editor so far. Keep the reply short: say what you changed, with file names.\n\n' +
      (sel ? `Selected element: ${sel.label} (${sel.selector})\n\n` : '') + `Message: ${body.message || ''}\n\n${body.handoff || ''}`;
    return json(res, 200, await runClaude(page, prompt));
  }
  json(res, 404, { error: 'not found' });
}

// One `claude -p` per chat message, run where the app's code is. File tools only (no Bash, no MCP servers), edits auto-accepted
// inside that folder. stream-json shows each tool call, so the page reloads only when Claude used Edit or Write.
const sessions = new Map(); // page → Claude session id; memory only, a server restart starts a new conversation
function runClaude(page, prompt) {
  const argv = ['-p', '--verbose', '--output-format', 'stream-json', '--model', MODEL, '--permission-mode', 'acceptEdits',
    '--tools', 'Read,Edit,Write,Glob,Grep', '--strict-mcp-config'];
  if (sessions.has(page)) argv.push('--resume', sessions.get(page));
  chatting++;
  return new Promise((resolve) => {
    let buf = '', err = '', result = null, changed = false, over = false;
    const finish = (r) => { if (over) return; over = true; chatting--; resolve({ ...r, reload: changed }); };
    const line = (s) => {
      let m; try { m = JSON.parse(s); } catch { return; }
      if (m.session_id) sessions.set(page, m.session_id);
      if (m.type === 'result') result = m;
      if (m.type === 'assistant') for (const c of m.message?.content || []) if (c.type === 'tool_use' && (c.name === 'Edit' || c.name === 'Write')) changed = true;
    };
    const child = spawn('claude', argv, { cwd: APP || ROOT, timeout: 5 * 60e3 });
    child.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => finish({ err: true, reply: 'Could not start claude: ' + e.message }));
    child.on('close', (code, signal) => {
      line(buf);
      if (result && !result.is_error) return finish({ reply: result.result || '(no reply)' });
      finish({ err: true, reply: signal ? 'Claude stopped after 5 minutes (timeout).' : 'claude failed: ' + String(result?.result || err || 'exit ' + code).slice(0, 400) });
    });
    child.stdin.on('error', () => {}); // EPIPE when claude is missing; 'error' above reports it
    child.stdin.end(prompt);
  });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const idx = path.join(file, 'index.html');
    if (fs.existsSync(idx)) file = idx;
    else {
      const items = fs.readdirSync(file).filter((f) => !f.startsWith('.')).sort();
      const li = items.map((f) => `<li><a href="${escHtml(encodeURI(path.posix.join(rel, f)))}">${escHtml(f)}</a></li>`).join('');
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(`<!doctype html><meta charset=utf-8><title>EH index</title><body style="font:14px ui-monospace,monospace;background:#050608;color:#e6edf3;padding:24px"><h3>${escHtml(rel)}</h3><ul>${li}</ul>`);
    }
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' || ext === '.htm') buf = Buffer.from(inject(buf.toString('utf8')));
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

// The app sees itself as the caller: Host and Origin point at the target, so guards like
// a dev server's same-origin check (Host 127.0.0.1:port, Origin http://<Host>) pass.
const upstreamHeaders = (req, target) => {
  const h = { ...req.headers, host: target.host };
  if (h.origin) h.origin = `${target.protocol}//${target.host}`;
  return h;
};

function proxy(req, res, url) {
  const why = refuse(req);
  if (why) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('EH proxy: ' + why); }
  const target = new URL(PROXY);
  const headers = { ...upstreamHeaders(req, target), 'accept-encoding': 'identity' };
  const up = http.request({ hostname: target.hostname, port: target.port || 80, path: url.pathname + url.search, method: req.method, headers }, (r) => {
    const type = String(r.headers['content-type'] || '');
    if (!type.includes('text/html')) { res.writeHead(r.statusCode, r.headers); return r.pipe(res); }
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => {
      const out = Buffer.from(inject(Buffer.concat(chunks).toString('utf8')));
      const h = { ...r.headers, 'content-length': out.length };
      delete h['transfer-encoding']; // we send a content-length now; both together is an invalid response
      delete h['content-security-policy']; delete h['content-security-policy-report-only'];
      res.writeHead(r.statusCode, h); res.end(out);
    });
  });
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'text/plain' }); res.end('EH proxy: upstream unreachable — ' + e.message); });
  req.pipe(up);
}

// Websockets (Vite HMR, the app's own /ws): replay the upgrade request upstream, then pipe raw bytes both ways.
function proxyUpgrade(req, sock, head) {
  if (!PROXY || refuse(req)) return sock.destroy();
  const target = new URL(PROXY);
  const h = upstreamHeaders(req, target);
  const up = net.connect(Number(target.port) || 80, target.hostname, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(h).flatMap(([k, v]) => [].concat(v).map((x) => `${k}: ${x}\r\n`)).join('') + '\r\n');
    if (head.length) up.write(head);
    up.pipe(sock).pipe(up);
  });
  up.on('error', () => sock.destroy());
  sock.on('error', () => up.destroy());
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/__eh/')) return await handleEH(req, res, url);
    return PROXY ? proxy(req, res, url) : serveStatic(req, res, url);
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}).on('upgrade', proxyUpgrade).listen(PORT, HOST, () => {
  console.log(`Event Horizon Editor  http://${HOST}:${PORT}/`);
  console.log(PROXY ? `  proxying ${PROXY}` + (APP ? ` (app ${APP})` : '') : `  serving ${ROOT}`);
  console.log(`  saves to ${DATA}`);
  console.log(CLAUDE ? `  chat → claude -p (${MODEL}) in ${APP || ROOT}` : '  chat is off (add --claude to turn it on)');
});
