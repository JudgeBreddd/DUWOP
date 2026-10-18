/*!
 * Event Horizon Editor — portable overlay editor for HTML prototypes (and any web app).
 * One file, no dependencies. Include it with a <script> tag, the injector server, or a bookmarklet.
 *
 * Edits are recorded as an ordered list of OPERATIONS (text / move / hide / add) plus pinned NOTES
 * (intent and descriptions). They are never written into the app. When the app re-renders and wipes
 * the DOM, the operations are replayed on top of the fresh render. The result is exported as a
 * handoff brief (markdown + JSON) that Claude Code can implement against the real components.
 */
(() => {
  'use strict';
  if (window.__EH__) { window.__EH__.toggle(); return; }

  const me = document.currentScript || document.querySelector('script[src*="eh.js"]');
  const CFG = Object.assign({
    server: me && me.dataset && me.dataset.server != null ? me.dataset.server : null, // '' = same origin, null = none
    designRefs: [],            // e.g. ['DESIGN.md', 'event-horizon-design-philosophy.md'] listed in the handoff
    chatPlaceholder: 'Ask Claude to add, remove or rework something…',
  }, window.EH_CONFIG || {});

  /* ───────────────────────── utilities ───────────────────────── */
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const snip = (s, n = 40) => { s = norm(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));
  const q = (sel) => { try { return sel ? document.querySelector(sel) : null; } catch { return null; } };
  const tryJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

  const addTok = (el, attr, id) => {
    const t = (el.getAttribute(attr) || '').split(' ').filter(Boolean);
    if (!t.includes(id)) t.push(id);
    el.setAttribute(attr, t.join(' '));
  };
  const delTok = (el, attr, id) => {
    const t = (el.getAttribute(attr) || '').split(' ').filter((x) => x && x !== id);
    t.length ? el.setAttribute(attr, t.join(' ')) : el.removeAttribute(attr);
  };
  const byTok = (attr, id) => document.querySelector(`[${attr}~="${id}"]`);
  const STAMPS = ['data-eh-op', 'data-eh-from', 'data-eh-next', 'data-eh-note'];

  const slotOf = (el) => (el && el.getAttribute && (el.getAttribute('data-slot') || el.getAttribute('data-component'))) || null;
  const nearestSlot = (el) => { const s = el && el.closest && el.closest('[data-slot],[data-component]'); return s ? slotOf(s) : null; };
  /** Palette identity of a component: slot + classes + variant. Your names for components are keyed by it. */
  const sigOf = (el) => slotOf(el) + '|' + [...el.classList].filter((c) => !c.startsWith('eh-')).join('.') + '|' + (el.getAttribute('data-variant') || '');

  // Names you give palette entries. Shared by every page on this origin.
  // ponytail: browser-local; move into the server's eh-data if names need to follow you across browsers.
  const NAMES_KEY = 'eh:v1:names';
  let names = {};

  /* DUWOP kit: the registry's pieces as insertable markup. Real data-slot / data-variant / fx-* hooks, so the
     page's DUWOP CSS and theme style them; [data-eh-kit] fallbacks (zero specificity) only fill gaps. */
  const KIT = [
    { id: 'card', name: 'Card', m: '[data-slot="card"]', html: '<div data-slot="card" data-eh-kit="card" class="fx-lift"><div data-slot="card-title">Card title</div><div data-slot="card-description">What this card holds, in one line.</div></div>' },
    { id: 'session', name: 'Session card (status + meter)', m: '.fx-lift', html: '<button data-slot="card" data-eh-kit="card" class="fx-lift" style="text-align:left"><div data-slot="card-title">Session name <span data-slot="badge" data-eh-kit="badge">running</span></div><div data-slot="card-description">Last step the agent took</div><div class="fx-meter" data-eh-kit="meter"><div></div></div></button>' },
    { id: 'btn-default', name: 'Button · primary', m: '[data-slot="button"][data-variant="default"]', html: '<button data-slot="button" data-variant="default" data-size="sm" data-eh-kit="button">Primary</button>' },
    { id: 'btn-secondary', name: 'Button · secondary', m: '[data-slot="button"][data-variant="secondary"]', html: '<button data-slot="button" data-variant="secondary" data-size="sm" data-eh-kit="button">Secondary</button>' },
    { id: 'btn-outline', name: 'Button · outline', m: '[data-slot="button"][data-variant="outline"]', html: '<button data-slot="button" data-variant="outline" data-size="sm" data-eh-kit="button">Outline</button>' },
    { id: 'btn-ghost', name: 'Button · ghost', m: '[data-slot="button"][data-variant="ghost"]', html: '<button data-slot="button" data-variant="ghost" data-size="sm" data-eh-kit="button">Ghost</button>' },
    { id: 'btn-destructive', name: 'Button · destructive', m: '[data-slot="button"][data-variant="destructive"]', html: '<button data-slot="button" data-variant="destructive" data-size="sm" data-eh-kit="button">Stop</button>' },
    { id: 'badge', name: 'Badge', m: '[data-slot="badge"]', html: '<span data-slot="badge" data-eh-kit="badge">Badge</span>' },
    { id: 'input', name: 'Input', m: '[data-slot="input"]', html: '<input data-slot="input" data-eh-kit="input" placeholder="Type here">' },
    { id: 'textarea', name: 'Textarea', m: '[data-slot="textarea"]', html: '<textarea data-slot="textarea" data-eh-kit="textarea" placeholder="Longer text"></textarea>' },
    { id: 'tabs', name: 'Tabs', m: '[data-slot="tabs-list"]', html: '<div data-slot="tabs-list" data-eh-kit="tabs"><button data-slot="tabs-trigger" data-state="active">First</button><button data-slot="tabs-trigger">Second</button></div>' },
    { id: 'separator', name: 'Separator', m: '[data-slot="separator"]', html: '<div data-slot="separator" data-eh-kit="separator" role="separator"></div>' },
    { id: 'meter', name: 'Meter (thin progress)', m: '.fx-meter, [data-slot="progress"]', html: '<div class="fx-meter" data-eh-kit="meter"><div></div></div>' },
    { id: 'title', name: 'Page title', m: '.fx-title', html: '<h2 class="fx-title">Page title</h2>' },
    { id: 'neon', name: 'Neon heading', m: '.fx-neon', html: '<h3 class="fx-neon">Neon heading</h3>' },
  ];
  const KIT_CSS = `:where([data-eh-kit=card]){display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius,10px);background:var(--card);color:var(--card-foreground,inherit);font:inherit}
:where([data-eh-kit=card]) :where([data-slot=card-title]){font-weight:600;display:flex;gap:8px;align-items:center}
:where([data-eh-kit=card]) :where([data-slot=card-description]){font-size:13px;color:var(--muted-foreground)}
:where([data-eh-kit=button]){display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:calc(var(--radius,10px) - 2px);border:1px solid var(--border);background:var(--secondary);color:var(--foreground);font:inherit;font-size:13px;cursor:pointer}
:where([data-eh-kit=badge]){display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;border:1px solid var(--border);font-size:11px;font-weight:500;color:var(--muted-foreground)}
:where([data-eh-kit=input],[data-eh-kit=textarea]){padding:6px 10px;border:1px solid var(--input,var(--border));border-radius:calc(var(--radius,10px) - 2px);background:transparent;color:var(--foreground);font:inherit}
:where([data-eh-kit=textarea]){min-height:64px}
:where([data-eh-kit=tabs]){display:inline-flex;gap:2px;padding:3px;border-radius:var(--radius,10px);background:var(--muted)}
:where([data-eh-kit=tabs]>*){padding:4px 10px;border:0;border-radius:calc(var(--radius,10px) - 3px);background:transparent;color:var(--muted-foreground);font:inherit;font-size:13px}
:where([data-eh-kit=tabs]>[data-state=active]){background:var(--background);color:var(--foreground)}
:where([data-eh-kit=separator]){height:1px;background:var(--border);margin:8px 0}
:where([data-eh-kit=meter]){height:4px;border-radius:999px;background:var(--muted);overflow:hidden}
:where([data-eh-kit=meter]>*){height:100%;width:60%;background:var(--primary)}`;


  // Theme tokens offered as colour swatches (only the ones the page defines are shown).
  const TOKENS = ['background', 'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'border', 'ring', 'foreground', 'muted-foreground', 'primary-foreground', 'chart-1', 'chart-2'];
  const tokenVal = (t) => getComputedStyle(document.documentElement).getPropertyValue('--' + t).trim();
  let cv = null;
  /** Any CSS colour → [r,g,b,a 0-1], via a 1×1 canvas (handles oklch, color-mix, …). */
  function rgba(css) {
    if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = 1; cv = cv.getContext('2d', { willReadFrequently: true }); }
    cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = css; cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  }
  const hexOf = (c) => '#' + c.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');

  /** Stable-ish CSS path: id anchor, else tag:nth-of-type chain from <body>. */
  function pathOf(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id && document.querySelectorAll('#' + cssEsc(n.id)).length === 1) { parts.unshift('#' + cssEsc(n.id)); break; }
      const tag = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [n];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
    }
    return parts.join(' > ');
  }
  /** Structural fingerprint used to refuse replaying an op onto the wrong element. */
  // Element effects only. fx-ambient / fx-horizon are DUWOP's page backdrop (fixed, display:none): they hide an element.
  const FXC = ['fx-lift', 'fx-neon', 'fx-title', 'fx-eyebrow', 'fx-halo'];
  // Effect classes are ours to toggle, so they are not part of an element's identity.
  const ownCls = (c) => !c.startsWith('eh-') && !FXC.includes(c);
  const fp = (el) => [el.tagName.toLowerCase(), slotOf(el) || '', [...el.classList].filter(ownCls).slice(0, 3).join('.'), el.children.length ? '' : snip(el.textContent, 30)].join('|');
  // Older saves recorded effect classes in the fingerprint: drop them before comparing.
  const fpMatch = (el, f) => {
    if (!f) return true;
    const a = fp(el).split('|'), b = f.split('|');
    const bc = b[2].split('.').filter((c) => c && ownCls(c)).join('.');
    return a[0] === b[0] && a[1] === b[1] && a.slice(3).join('|') === b.slice(3).join('|') && (a[2] + '.').startsWith(bc ? bc + '.' : '');
  };
  /** "All like this": the slot (or tag) plus every own class, e.g. div.card.major. null when that would match every div. */
  const likeSel = (el) => {
    const attr = ['data-slot', 'data-component'].find((a) => el.hasAttribute(a)), cls = [...el.classList].filter(ownCls);
    if (!attr && !cls.length) return null;
    return (attr ? `[${attr}="${cssEsc(el.getAttribute(attr))}"]` : el.tagName.toLowerCase()) + cls.map((c) => '.' + cssEsc(c)).join('');
  };
  /** Source file:line from code-inspector-plugin's data-insp-path ("file:line:col:tag"), on the element or its nearest ancestor. */
  const srcOf = (el) => {
    const n = el && el.closest && el.closest('[data-insp-path]'), m = n && /^(.*?):(\d+):\d+/.exec(n.getAttribute('data-insp-path'));
    return m ? m[1] + ':' + m[2] : null;
  };
  const labelOf = (el) => {
    if (!el || el === document.body) return 'page';
    const slot = slotOf(el), named = slot && names['pg:' + sigOf(el)];
    const base = named ? `${named} [${slot}]` : slot || el.tagName.toLowerCase();
    const cls = !slot && el.classList.length ? '.' + el.classList[0] : '';
    const raw = norm(el.textContent), t = raw.length <= 60 ? snip(raw, 26) : '';
    return base + cls + (t ? ` “${t}”` : '');
  };
  const idxOf = (el) => (el.parentElement ? [...el.parentElement.children].indexOf(el) : 0);
  const cleanHtml = (el) => {
    const c = el.cloneNode(true);
    [c, ...c.querySelectorAll('*')].forEach((n) => {
      [...n.attributes].forEach((a) => { if ((a.name.startsWith('data-eh-') && a.name !== 'data-eh-kit') || a.name.startsWith('data-insp-')) n.removeAttribute(a.name); });
      n.removeAttribute('id');
    });
    return c.outerHTML;
  };
  const isTextual = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && norm(n.nodeValue));

  /* ───────────────────────── state ───────────────────────── */
  // let, not const: a single-page app changes the path without a reload, and each path keeps its own changes (onRoute)
  let PAGE = location.pathname;
  let KEY = 'eh:v1:' + location.origin + PAGE;
  const UIKEY = 'eh:v1:ui';
  const blank = () => ({ v: 1, page: PAGE, title: document.title, ops: [], notes: [], look: null, updated: 0 });
  let S = blank();
  const status = {}; // op.id → ok | stale | missing (transient)
  let serverOK = false, chatOn = false, busy = false;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } };

  let saveTimer = 0;
  function touch() {
    S.updated = Date.now(); S.title = document.title;
    lsSet(KEY, JSON.stringify(S));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushServer, 600);
  }
  async function api(path, init) {
    if (CFG.server == null) throw new Error('no server');
    const r = await fetch(CFG.server + '/__eh/' + path, init);
    return r.json();
  }
  async function pushServer() {
    if (!serverOK) return;
    try { await api('state?page=' + encodeURIComponent(PAGE), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: S, handoff: buildHandoff() }) }); } catch { /* offline */ }
  }

  /* ───────────────────────── applying operations ───────────────────────── */
  let applying = false;
  let mo = null;
  const withApply = (fn) => { applying = true; try { return fn(); } finally { applying = false; if (mo) mo.takeRecords(); } };

  function applyOp(op) {
    if (op.t === 'text') {
      const el = q(op.sel); if (!el) return 'missing';
      const node = el.childNodes[op.ti];
      if (!node || node.nodeType !== 3 || !fpMatch(el, op.fp)) return 'stale';
      const cur = norm(node.nodeValue);
      if (cur !== norm(op.from) && cur !== norm(op.to)) return 'stale';
      const lead = (node.nodeValue.match(/^\s*/) || [''])[0], trail = (node.nodeValue.match(/\s*$/) || [''])[0];
      node.nodeValue = lead + op.to + trail;
      addTok(el, 'data-eh-op', op.id); return 'ok';
    }
    if (op.t === 'hide') {
      const el = q(op.sel); if (!el) return 'missing';
      if (!fpMatch(el, op.fp)) return 'stale';
      el.setAttribute('data-eh-hidden', ''); addTok(el, 'data-eh-op', op.id); return 'ok';
    }
    if (op.t === 'move') {
      const el = q(op.sel), parent = q(op.to.psel), ref = op.to.bsel ? q(op.to.bsel) : null;
      if (!el || !parent) return 'missing';
      if (!fpMatch(el, op.fp) || el.contains(parent) || el === parent) return 'stale';
      if (op.to.bsel && !ref) return 'missing';
      if (el.parentElement) addTok(el.parentElement, 'data-eh-from', op.id);
      if (el.nextElementSibling) addTok(el.nextElementSibling, 'data-eh-next', op.id);
      parent.insertBefore(el, ref && ref !== el ? ref : null);
      addTok(el, 'data-eh-op', op.id); return 'ok';
    }
    if (op.t === 'add') {
      const anchor = q(op.sel); if (!anchor) return 'missing';
      const tpl = document.createElement('template'); tpl.innerHTML = op.html;
      const node = tpl.content.firstElementChild; if (!node) return 'stale';
      node.setAttribute('data-eh-added', ''); addTok(node, 'data-eh-op', op.id);
      op.pos === 'append' ? anchor.appendChild(node) : anchor.after(node);
      return 'ok';
    }
    if (op.t === 'style' || op.t === 'class') {
      const el = q(op.sel); if (!el) return 'missing';
      if (!fpMatch(el, op.fp)) return 'stale';
      if (op.t === 'class') el.classList.toggle(op.cls, op.on);
      else if (op.to) el.style.setProperty(op.prop, op.to, 'important'); else el.style.removeProperty(op.prop); // important: beats "all like this" rules and the page's own !important
      addTok(el, 'data-eh-op', op.id); return 'ok';
    }
    if (op.t === 'rule') { try { document.querySelector(op.sel.replace(/::?(before|after)$/, '')); } catch { return 'stale'; } writeRules(S.ops.includes(op) ? null : op); return 'ok'; }
    return 'stale';
  }
  /* "All like this" and ::before/::after edits are CSS rules in one <style>, rebuilt from the rule ops in order.
     A rule needs no replay: it styles whatever the app renders next. */
  let rulesEl = null;
  function writeRules(extra) {
    if (!rulesEl || !rulesEl.isConnected) { rulesEl = document.createElement('style'); rulesEl.setAttribute('data-eh-rules', ''); document.head.appendChild(rulesEl); }
    rulesEl.textContent = [...S.ops, ...(extra ? [extra] : [])].filter((o) => o.t === 'rule' && o.to).map((o) => `${o.sel}{${o.prop}:${o.to} !important}`).join('\n');
  }
  function isApplied(op) {
    if (op.t === 'rule') return !!rulesEl && rulesEl.isConnected;
    const el = byTok('data-eh-op', op.id); if (!el) return false;
    if (op.t === 'text') { const n = el.childNodes[op.ti]; return !!n && norm(n.nodeValue) === norm(op.to); }
    if (op.t === 'hide') return el.hasAttribute('data-eh-hidden');
    if (op.t === 'class') return el.classList.contains(op.cls) === op.on;
    return true;
  }
  function revertOp(op) {
    const el = byTok('data-eh-op', op.id);
    if (op.t === 'text' && el) { const n = el.childNodes[op.ti]; if (n) { const lead = (n.nodeValue.match(/^\s*/) || [''])[0], trail = (n.nodeValue.match(/\s*$/) || [''])[0]; n.nodeValue = lead + op.from + trail; } }
    if (op.t === 'hide' && el) el.removeAttribute('data-eh-hidden');
    if (op.t === 'move' && el) { const p = byTok('data-eh-from', op.id), nx = byTok('data-eh-next', op.id); if (p) p.insertBefore(el, nx && nx.parentElement === p ? nx : null); }
    if (op.t === 'add' && el) el.remove();
    if (op.t === 'style' && el) { if (op.from) el.style.setProperty(op.prop, op.from); else el.style.removeProperty(op.prop); }
    if (op.t === 'class' && el) el.classList.toggle(op.cls, !op.on);
    if (op.t === 'rule') writeRules(); // callers drop the op from S.ops first
    document.querySelectorAll('[data-eh-op],[data-eh-from],[data-eh-next]').forEach((n) => STAMPS.slice(0, 3).forEach((a) => delTok(n, a, op.id)));
  }

  /** Re-apply anything a re-render wiped, in order. Notes are re-pinned at the point in history they were made. */
  function reconcile() {
    withApply(() => {
      const pin = (k) => S.notes.forEach((n) => {
        if (Math.min(n.at, S.ops.length) !== k || byTok('data-eh-note', n.id)) return;
        const el = q(n.sel); if (el && fpMatch(el, n.fp)) addTok(el, 'data-eh-note', n.id);
      });
      for (let i = 0; i < S.ops.length; i++) {
        pin(i);
        const op = S.ops[i];
        status[op.id] = isApplied(op) ? 'ok' : applyOp(op);
      }
      pin(S.ops.length);
    });
  }

  function commit(op, author, quiet) {
    op.id = op.id || uid(); op.ts = Date.now(); if (author) op.by = author;
    if (op.src === undefined) op.src = srcOf(op.t === 'rule' ? sel : q(op.sel)) || undefined;
    const r = withApply(() => applyOp(op));
    status[op.id] = r;
    if (r !== 'ok') { toast(r === 'missing' ? 'Could not find that element.' : 'That element no longer matches; change skipped.'); return false; }
    S.ops.push(op); touch();
    if (quiet) { renderTabs(); renderCtx(); } else refresh(); // quiet: a slider is mid-drag; re-rendering would drop it
    return true;
  }
  function undo() {
    const op = S.ops.pop(); if (!op) return toast('Nothing to undo.');
    const gone = [op]; // ops sharing a group id (a border colour plus the style/width it needed, a resize) undo together
    while (op.g && S.ops.length && S.ops[S.ops.length - 1].g === op.g) gone.push(S.ops.pop());
    withApply(() => gone.forEach(revertOp));
    gone.forEach((o) => delete status[o.id]);
    S.notes.forEach((n) => {
      if (n.at > S.ops.length) { n.at = S.ops.length; const el = byTok('data-eh-note', n.id); if (el) n.sel = pathOf(el); }
    });
    touch(); refresh();
  }
  /** Delete one change from the middle of history: unwind everything after it, drop it (and its group), replay the rest. */
  function delOp(id) {
    const op = S.ops.find((o) => o.id === id); if (!op) return;
    const drop = new Set(S.ops.filter((o) => o === op || (op.g && o.g === op.g)).map((o) => o.id));
    const i = S.ops.findIndex((o) => drop.has(o.id)), tail = S.ops.splice(i);
    withApply(() => tail.slice().reverse().forEach(revertOp));
    tail.forEach((o) => delete status[o.id]);
    S.ops.push(...tail.filter((o) => !drop.has(o.id)));
    S.notes.forEach((n) => { if (n.at > i) n.at = Math.max(i, n.at - drop.size); });
    writeRules(); reconcile(); touch(); refresh(); // writeRules first: reconcile treats a connected <style> as "rule applied"
  }

  /* ───────────────────────── host + shadow UI ───────────────────────── */
  const host = document.createElement('eh-editor-host');
  host.setAttribute('popover', 'manual');
  host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;color:inherit;display:block;';
  const root = host.attachShadow({ mode: 'open' });

  const CSS_UI = `
:host{all:initial}
*{box-sizing:border-box}
.ui{--bg:#050608;--ctrl:#171B20;--elev:#14191F;--inp:#161B22;--hov:#20262D;--line:#2A313C;--tx:#E6EDF3;--tx2:#9DA7B3;--mut:#6E7681;--steel:#4C89B7;--steelh:#5A97C7;--viol:#6A72C9;--violh:#7B84DB;--cop:#A86432;--ok:#67B99A;--bad:#C66B76;
  font:12.5px/1.4 "Space Grotesk",ui-sans-serif,system-ui,sans-serif;color:var(--tx)}
.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
button,input,select,textarea{font:inherit;color:inherit}
.pill{position:fixed;right:14px;bottom:14px;pointer-events:auto;background:var(--ctrl);border:1px solid var(--line);border-radius:999px;padding:7px 13px;cursor:pointer;color:var(--tx);display:flex;gap:7px;align-items:center;box-shadow:0 6px 24px rgba(0,0,0,.45)}
.pill:hover{background:var(--hov)} .pill i{width:7px;height:7px;border-radius:50%;background:var(--steel);display:inline-block}
.panel[hidden]{display:none}
.panel{position:fixed;right:14px;top:14px;width:328px;max-height:calc(100vh - 28px);display:flex;flex-direction:column;pointer-events:auto;background:var(--elev);border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 44px rgba(0,0,0,.6);overflow:hidden}
.hd{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);cursor:grab;user-select:none}
.hd b{font-weight:600;letter-spacing:.01em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd b span{color:var(--mut);font-weight:400}
.seg{display:flex;background:var(--inp);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.seg button{background:none;border:0;padding:3px 9px;cursor:pointer;color:var(--tx2)}
.seg button:disabled{opacity:.4;cursor:default}
.seg button[aria-pressed=true]{background:var(--ctrl);color:var(--tx);box-shadow:inset 0 -1.5px 0 var(--steel)}
.ib{background:none;border:0;color:var(--tx2);cursor:pointer;padding:2px 6px;border-radius:5px;font-size:14px;line-height:1}
.ib:hover{background:var(--hov);color:var(--tx)}
.tabs{display:flex;gap:2px;padding:0 8px;border-bottom:1px solid var(--line)}
.tabs button{background:none;border:0;padding:7px 8px 6px;color:var(--mut);cursor:pointer;border-bottom:1.5px solid transparent;margin-bottom:-1px}
.tabs button:hover{color:var(--tx2)} .tabs button[aria-selected=true]{color:var(--tx);border-bottom-color:var(--steel)}
.tabs .n{color:var(--mut);font-size:10.5px;margin-left:3px}
.body{padding:10px;overflow:auto;min-height:60px;flex:1 1 auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.sec{margin:0 0 10px} .sec>h4{margin:0 0 5px;font-size:10.5px;font-weight:500;color:var(--mut);text-transform:uppercase;letter-spacing:.07em}
.crumbs{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.crumbs button{background:var(--inp);border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--tx2);cursor:pointer;font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crumbs button:hover{background:var(--hov);color:var(--tx)} .crumbs button.cur{color:var(--tx);border-color:var(--steel)}
.kv{display:grid;grid-template-columns:62px 1fr;gap:2px 8px;font-size:11.5px} .kv dt{color:var(--mut)} .kv dd{margin:0;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btns{display:flex;flex-wrap:wrap;gap:5px}
.b{background:var(--ctrl);border:1px solid var(--line);border-radius:6px;padding:4px 9px;cursor:pointer;color:var(--tx)}
.b:hover{background:var(--hov)} .b:active{transform:scale(.98)} .b:focus-visible,.ib:focus-visible,.tabs button:focus-visible{outline:1.5px solid var(--steel);outline-offset:1px}
.b.pri{border-color:var(--steel)} .b.ghost{background:none;border-color:transparent;color:var(--tx2)} .b.ghost:hover{background:var(--hov);color:var(--tx)}
.b.bad{color:var(--bad)} .b[disabled]{opacity:.4;pointer-events:none}
textarea.in,input.in,select.in{width:100%;background:var(--inp);border:1px solid var(--line);border-radius:6px;padding:6px 8px;outline:none;resize:vertical}
textarea.in:focus,input.in:focus,select.in:focus{border-color:var(--steel);box-shadow:0 0 0 3px rgba(76,137,183,.16)}
.kinds{display:flex;gap:5px;margin-bottom:5px}
.chip{background:var(--inp);border:1px solid var(--line);border-radius:999px;padding:1px 9px;cursor:pointer;color:var(--tx2);font-size:11px}
.chip[aria-pressed=true].k-comment{border-color:var(--steel);color:var(--tx)} .chip[aria-pressed=true].k-description{border-color:var(--viol);color:var(--tx)}
.row{display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--line)} .row:first-child{border-top:0}
.row .t{flex:1;min-width:0;overflow-wrap:anywhere} .row .m{color:var(--mut);font-size:11px}
.dot{width:16px;height:16px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:9.5px;font-weight:600;color:#fff;background:var(--steel);margin-top:1px}
.dot.d{background:var(--viol)} .dot.r{background:var(--mut)}
.badge{font-size:10px;border-radius:4px;padding:0 5px;border:1px solid var(--line);color:var(--mut)} .badge.stale,.badge.missing{color:var(--cop);border-color:var(--cop)}
.empty{color:var(--mut);padding:6px 0}
.kbd{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10.5px;background:var(--inp);border:1px solid var(--line);border-radius:4px;padding:0 4px;color:var(--tx2)}
.hint{color:var(--tx2);font-size:11.5px;line-height:1.55} .hint div{display:flex;gap:8px;margin:2px 0}
.pal{display:flex;gap:6px;align-items:center;padding:5px 0;border-top:1px solid var(--line)} .pal:first-child{border-top:0}
.pal .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fxs{display:flex;flex-wrap:wrap;gap:5px}
.chat{border-top:1px solid var(--line);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.msgs{max-height:150px;overflow:auto;display:flex;flex-direction:column;gap:5px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.msgs:empty{display:none}
.msg{padding:5px 8px;border-radius:7px;background:var(--inp);border:1px solid var(--line);color:var(--tx2);overflow-wrap:anywhere;white-space:pre-wrap}
.msg.u{background:var(--ctrl);color:var(--tx);align-self:flex-end;max-width:92%} .msg.stub{border-style:dashed}
.msg.err{color:var(--bad)}
.cform{display:flex;gap:6px;align-items:center}
.cform input{flex:1}
.ctx{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);pointer-events:none;background:var(--ctrl);border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:6px 12px;box-shadow:0 8px 28px rgba(0,0,0,.5);opacity:0;transition:opacity .15s}
.toast.on{opacity:1}
/* overlay layer */
.layer{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.box{position:fixed;display:none;border-radius:2px}
.hoverbox{border:1px dashed rgba(76,137,183,.7);background:rgba(76,137,183,.06)}
.selbox{border:1.5px solid var(--steel);box-shadow:0 0 0 3px rgba(76,137,183,.16)}
.selbox .chipl{position:absolute;left:-1.5px;bottom:100%;margin-bottom:2px;background:var(--steel);color:#fff;font:10.5px/1.5 "JetBrains Mono",ui-monospace,monospace;padding:0 6px;border-radius:4px 4px 4px 0;white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis}
.selbox.low .chipl{bottom:auto;top:100%;margin:2px 0 0;border-radius:0 4px 4px 4px}
.selbox.gin .grip{right:3px}
.selbox .grip{position:absolute;right:-27px;top:50%;margin-top:-9px;width:22px;height:18px;background:var(--ctrl);border:1px solid var(--steel);border-radius:4px;cursor:grab;pointer-events:auto;display:grid;place-items:center;color:var(--tx2);font-size:11px;touch-action:none}
.selbox .grip:hover{color:var(--tx);background:var(--hov)}
.selbox .rsz{position:absolute;right:-6px;bottom:-6px;width:11px;height:11px;background:var(--steel);border:2px solid #fff;border-radius:3px;cursor:nwse-resize;pointer-events:auto;touch-action:none}
.drop{position:fixed;display:none;background:var(--violh);border-radius:2px;box-shadow:0 0 0 3px rgba(123,132,219,.25)}
.drop.into{background:rgba(106,114,201,.12);border:1.5px dashed var(--violh);box-shadow:none}
#ghost{position:fixed;display:none;border:1px solid var(--violh);background:rgba(106,114,201,.14);border-radius:4px;opacity:.85}
.pin{position:fixed;width:18px;height:18px;border-radius:50%;display:none;place-items:center;font:600 10px/1 "Space Grotesk",system-ui,sans-serif;color:#fff;background:var(--steel);border:1.5px solid #050608;cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.pin.d{background:var(--viol)} .pin.r{background:var(--mut);opacity:.7} .pin.cur{outline:2px solid #fff3}
.texted{position:fixed;display:none;pointer-events:auto;background:var(--inp);border:1.5px solid var(--steelh);border-radius:5px;box-shadow:0 0 0 3px rgba(76,137,183,.2);color:var(--tx);padding:2px 4px;resize:none;outline:none;overflow:hidden;z-index:2}
.hlbox{border:1.5px solid var(--cop);background:rgba(168,100,50,.14)}
.st{display:grid;grid-template-columns:60px 1fr auto;gap:6px 8px;align-items:center;font-size:11.5px}
.st>label{color:var(--mut)} .st input[type=range]{width:100%;accent-color:var(--steel);margin:0} .st output{color:var(--tx2);font-size:10.5px;min-width:34px;text-align:right}
.st input.in,.st select.in{padding:3px 6px}
.sw{display:flex;flex-wrap:wrap;gap:4px} .swb{width:16px;height:16px;border-radius:4px;border:1px solid var(--line);cursor:pointer;padding:0}
.swb:hover{outline:1.5px solid var(--steel)} input.in.col{width:30px;height:22px;padding:0 2px;cursor:pointer}
@media (prefers-reduced-motion:reduce){.toast{transition:none}}
`;
  root.innerHTML = `<style>${CSS_UI}</style><div class="ui">
  <div class="layer"><div class="box hoverbox" id="hb"></div><div class="box selbox" id="sb"><span class="chipl" id="sbl"></span><span class="grip" id="grip" title="Drag to move the selected element">⠿</span><span class="rsz" id="rsz" title="Drag to resize"></span></div>
    <div class="drop" id="drop"></div><div class="ghost" id="ghost"></div><div id="pins"></div><div id="hls"></div><textarea class="texted" id="texted" rows="1" spellcheck="false"></textarea></div>
  <button class="pill" id="pill" title="Open the editor (Ctrl+Shift+E)"><i></i>Edit</button>
  <div class="panel" id="panel" hidden>
    <div class="hd" id="hd"><b>EH Editor <span id="pgl"></span></b>
      <div class="seg" role="group" aria-label="Mode"><button data-act="mode:edit" aria-pressed="true" title="Click selects, drag moves, double-click edits text">Edit</button><button data-act="mode:interact" aria-pressed="false" title="Use the app normally (I)">Use</button></div>
      <button class="ib" data-act="collapse" title="Collapse">–</button><button class="ib" data-act="close" title="Close (Ctrl+Shift+E)">×</button></div>
    <div id="main" style="display:contents">
      <div class="tabs" id="tabs" role="tablist"></div>
      <div class="body" id="body"></div>
    </div>
    <div class="chat"><div class="msgs" id="msgs"></div><div class="ctx" id="ctx"></div>
      <form class="cform" id="cform"><input class="in" id="cin" autocomplete="off" placeholder="${esc(CFG.chatPlaceholder)}"><button class="b pri" type="submit">Send</button></form></div>
  </div>
  <div class="toast" id="toast"></div></div>`;
  const $r = (id) => root.getElementById(id);
  const el$ = { hb: $r('hb'), sb: $r('sb'), sbl: $r('sbl'), grip: $r('grip'), rsz: $r('rsz'), drop: $r('drop'), ghost: $r('ghost'), pins: $r('pins'), texted: $r('texted'), pill: $r('pill'), panel: $r('panel'), hd: $r('hd'), tabs: $r('tabs'), body: $r('body'), msgs: $r('msgs'), ctx: $r('ctx'), cform: $r('cform'), cin: $r('cin'), toast: $r('toast'), main: $r('main'), pgl: $r('pgl'), hls: $r('hls') };

  /* ───────────────────────── editor state ───────────────────────── */
  let on = false, mode = 'edit', tab = 'inspect', collapsed = false, bsArm = {};
  let sel = null, selPath = '', hover = null, ptr = { x: 0, y: 0 };
  let draft = { kind: 'comment', text: '' };
  let focusNote = null;
  let stBase = {}, renaming = null, bSide = ''; // stBase: the base colour picked per property, which the alpha sliders fade
  const CHATKEY = 'eh:chat:' + location.pathname;
  const chat = tryJSON(ssGet(CHATKEY)) || []; // survives the reload a reply asks for
  let drag = null, dropInfo = null, edit = null, toastTimer = 0;
  const look0 = { theme: document.documentElement.getAttribute('data-theme'), fx: document.documentElement.getAttribute('data-fx') };

  const isOurs = (e) => { const p = e.composedPath ? e.composedPath() : []; return p.includes(host); };
  const inEditable = (e) => { const t = e.composedPath ? e.composedPath()[0] : e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };

  function toast(msg) {
    el$.toast.textContent = msg; el$.toast.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el$.toast.classList.remove('on'), 2200);
  }

  /* ───────────────────────── geometry ───────────────────────── */
  function visRect(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect(); l = Math.max(l, pr.left); t = Math.max(t, pr.top); rr = Math.min(rr, pr.right); b = Math.min(b, pr.bottom);
      }
    }
    l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, innerWidth); b = Math.min(b, innerHeight);
    return rr > l && b > t ? { l, t, w: rr - l, h: b - t, full: r } : null;
  }
  const place = (node, r, pad = 0) => { if (!r) { node.style.display = 'none'; return; } node.style.display = 'block'; node.style.left = r.l - pad + 'px'; node.style.top = r.t - pad + 'px'; node.style.width = r.w + pad * 2 + 'px'; node.style.height = r.h + pad * 2 + 'px'; };
  const targetAt = (x, y) => {
    const e = document.elementFromPoint(x, y);
    if (!e || e === document.documentElement || e === document.body || e === host || host.contains(e)) return null;
    return e;
  };

  /* ───────────────────────── selection ───────────────────────── */
  function select(el) {
    sel = el && el.isConnected ? el : null;
    selPath = sel ? pathOf(sel) : '';
    focusNote = null;
    stBase = {}; scope = 'one';
    if (sel && tab !== 'inspect' && tab !== 'palette' && tab !== 'style') tab = 'inspect';
    renderBody(); renderCtx();
  }
  const nav = {
    parent: () => sel && sel.parentElement && sel.parentElement !== document.documentElement && select(sel.parentElement),
    child: () => { const c = sel && [...sel.children].find((k) => k.getBoundingClientRect().width); c && select(c); },
    prev: () => { let s = sel && sel.previousElementSibling; while (s && !s.getBoundingClientRect().width) s = s.previousElementSibling; s && select(s); },
    next: () => { let s = sel && sel.nextElementSibling; while (s && !s.getBoundingClientRect().width) s = s.nextElementSibling; s && select(s); },
  };

  /* ───────────────────────── drag to move ───────────────────────── */
  const CONTAINERS = new Set(['DIV', 'SECTION', 'UL', 'OL', 'NAV', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'ARTICLE', 'DIALOG', 'FORM', 'DETAILS', 'TBODY']);
  function visibleKids(el, skip) { return [...el.children].filter((c) => c !== skip && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE' && c.tagName.toLowerCase() !== 'eh-editor-host' && c.getBoundingClientRect().width + c.getBoundingClientRect().height > 0); }
  function axisHoriz(el) {
    const sib = el.nextElementSibling || el.previousElementSibling; if (!sib) return false;
    const a = el.getBoundingClientRect(), b = sib.getBoundingClientRect();
    return Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.5 && Math.abs(a.left - b.left) > 2;
  }
  function computeDrop(x, y, dragEl) {
    const stack = document.elementsFromPoint(x, y).filter((e) => e !== host && !host.contains(e) && e !== document.documentElement);
    let h = stack.find((e) => e !== dragEl && !dragEl.contains(e));
    if (!h || h === document.body) { h = document.body; }
    if (h === dragEl || dragEl.contains(h)) return null;
    // container with children: place next to the nearest child; empty container: drop inside it
    if (h === document.body || (CONTAINERS.has(h.tagName) && visibleKids(h, dragEl).length && !isTextual(h))) {
      const kids = visibleKids(h, dragEl);
      if (!kids.length) return { parent: h, before: null, rect: h.getBoundingClientRect(), into: true };
      let best = null, bd = Infinity;
      for (const k of kids) { const r = k.getBoundingClientRect(); const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)); if (d < bd) { bd = d; best = k; } }
      h = best;
    } else if (!visibleKids(h, dragEl).length && !isTextual(h) && CONTAINERS.has(h.tagName) && !h.textContent.trim()) {
      return { parent: h, before: null, rect: h.getBoundingClientRect(), into: true };
    }
    const r = h.getBoundingClientRect(), horiz = axisHoriz(h);
    const before = horiz ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
    let ref = before ? h : h.nextElementSibling;
    while (ref && (ref === dragEl)) ref = ref.nextElementSibling;
    const line = horiz ? { l: (before ? r.left : r.right) - 1, t: r.top, w: 2, h: r.height } : { l: r.left, t: (before ? r.top : r.bottom) - 1, w: r.width, h: 2 };
    return { parent: h.parentElement, before: ref, rect: null, line, anchor: h, after: !before };
  }
  function startDrag(el, e, grip) {
    drag = { el, sx: e.clientX, sy: e.clientY, active: false, grip };
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.active && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) { drag.active = true; el$.ghost.style.display = 'block'; }
    if (!drag.active) return;
    const r = drag.el.getBoundingClientRect();
    el$.ghost.style.left = e.clientX - Math.min(r.width, 160) / 2 + 'px'; el$.ghost.style.top = e.clientY + 6 + 'px';
    el$.ghost.style.width = Math.min(r.width, 160) + 'px'; el$.ghost.style.height = Math.min(r.height, 36) + 'px';
    dropInfo = computeDrop(e.clientX, e.clientY, drag.el);
    const d = el$.drop;
    if (!dropInfo) { d.style.display = 'none'; return; }
    d.classList.toggle('into', !!dropInfo.into);
    const rr = dropInfo.into ? dropInfo.rect : { left: dropInfo.line.l, top: dropInfo.line.t, width: dropInfo.line.w, height: dropInfo.line.h };
    d.style.display = 'block'; d.style.left = rr.left + 'px'; d.style.top = rr.top + 'px'; d.style.width = rr.width + 'px'; d.style.height = rr.height + 'px';
  }
  function endDrag() {
    const dd = drag, di = dropInfo; drag = null; dropInfo = null;
    el$.ghost.style.display = 'none'; el$.drop.style.display = 'none';
    if (!dd || !dd.active || !di) return;
    const el = dd.el, fromParent = el.parentElement, fromNext = el.nextElementSibling;
    if (di.parent === fromParent && (di.before === fromNext || di.before === el)) return; // no-op
    const op = {
      t: 'move', sel: pathOf(el), fp: fp(el), label: labelOf(el),
      to: { psel: pathOf(di.parent), bsel: di.before ? pathOf(di.before) : null },
      fromLabel: labelOf(fromParent), fromIndex: idxOf(el), toLabel: labelOf(di.parent), beforeLabel: di.before ? labelOf(di.before) : null,
    };
    if (commit(op)) { op.toIndex = idxOf(el); touch(); select(el); }
  }
  function nudge(dir) {
    if (!sel || !sel.parentElement) return;
    const sibs = visibleKids(sel.parentElement, null), i = sibs.indexOf(sel);
    const target = sibs[i + dir]; if (!target) return toast(dir < 0 ? 'Already first.' : 'Already last.');
    const before = dir < 0 ? target : target.nextElementSibling;
    const op = { t: 'move', sel: pathOf(sel), fp: fp(sel), label: labelOf(sel), to: { psel: pathOf(sel.parentElement), bsel: before ? pathOf(before) : null }, fromLabel: labelOf(sel.parentElement), fromIndex: idxOf(sel), toLabel: labelOf(sel.parentElement), beforeLabel: before ? labelOf(before) : null };
    const el = sel; if (commit(op)) { op.toIndex = idxOf(el); select(el); }
  }

  /* ───────────────────────── inline text edit ───────────────────────── */
  function startTextEdit(el) {
    if (!el) return;
    const cands = [...el.childNodes].map((n, i) => [n, i]).filter(([n]) => n.nodeType === 3 && norm(n.nodeValue));
    if (!cands.length) return toast('No text directly in this element. Press ↓ to pick the child that holds it.');
    cands.sort((a, b) => b[0].nodeValue.length - a[0].nodeValue.length);
    const [node, ti] = cands[0];
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), t = el$.texted;
    edit = { el, ti, from: norm(node.nodeValue) };
    t.value = edit.from; t.style.display = 'block';
    t.style.left = Math.max(0, r.left - 4) + 'px'; t.style.top = Math.max(0, r.top - 3) + 'px';
    t.style.width = Math.max(120, r.width + 8) + 'px';
    t.style.font = cs.font; t.style.letterSpacing = cs.letterSpacing; t.style.textTransform = cs.textTransform;
    t.style.height = 'auto'; t.style.height = Math.max(r.height + 6, t.scrollHeight) + 'px';
    t.focus(); t.select();
  }
  function endTextEdit(commitIt) {
    if (!edit) return;
    const e = edit; edit = null;
    const t = el$.texted, to = norm(t.value); t.style.display = 'none';
    if (!commitIt || !to || to === e.from) return;
    commit({ t: 'text', sel: pathOf(e.el), fp: fp(e.el), ti: e.ti, from: e.from, to, label: labelOf(e.el) });
    if (e.el.isConnected) select(e.el);
  }
  el$.texted.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); endTextEdit(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); endTextEdit(false); }
  });
  el$.texted.addEventListener('blur', () => endTextEdit(true));
  el$.texted.addEventListener('input', () => { el$.texted.style.height = 'auto'; el$.texted.style.height = el$.texted.scrollHeight + 'px'; });

  /* ───────────────────────── other ops ───────────────────────── */
  function hideSel() {
    if (!sel || sel === document.body) return;
    const el = sel; if (commit({ t: 'hide', sel: pathOf(el), fp: fp(el), label: labelOf(el) })) select(null);
  }
  function addAt(html, anchor, pos, label) {
    if (!anchor) return toast('Select an element first, then insert.');
    if (commit({ t: 'add', sel: pathOf(anchor), pos, html, label, anchorLabel: labelOf(anchor) })) {
      const op = S.ops[S.ops.length - 1], n = byTok('data-eh-op', op.id); if (n) select(n);
    }
  }
  const dupSel = () => sel && addAt(cleanHtml(sel), sel, 'after', labelOf(sel));

  /* ───────────────────────── notes ───────────────────────── */
  function addNote() {
    const text = draft.text.trim(); if (!sel) return toast('Select an element to attach a note to.'); if (!text) return;
    const n = { id: uid(), at: S.ops.length, sel: pathOf(sel), fp: fp(sel), label: labelOf(sel), slot: nearestSlot(sel), kind: draft.kind, text, resolved: false, ts: Date.now() };
    S.notes.push(n); withApply(() => addTok(sel, 'data-eh-note', n.id));
    draft.text = ''; focusNote = n.id; touch(); refresh();
  }
  function delNote(id) { const n = byTok('data-eh-note', id); if (n) withApply(() => delTok(n, 'data-eh-note', id)); S.notes = S.notes.filter((x) => x.id !== id); touch(); refresh(); }
  function noteEl(id) { return byTok('data-eh-note', id); }

  /* ───────────────────────── look ───────────────────────── */
  let looksCache = null;
  function detectLooks() {
    if (looksCache) return looksCache;
    const themes = new Set(), fx = new Set();
    const scan = (rules) => { for (const r of rules || []) { if (r.cssRules) scan(r.cssRules); const s = r.selectorText || ''; for (const m of s.matchAll(/\[data-theme=["']?([\w-]+)["']?\]/g)) themes.add(m[1]); for (const m of s.matchAll(/\[data-fx[~*^$|]?=["']?([\w-]+)["']?\]/g)) fx.add(m[1]); } };
    for (const sh of document.styleSheets) { try { scan(sh.cssRules); } catch { /* cross-origin sheet */ } }
    const cur = lookNow(); if (cur.theme) themes.add(cur.theme); cur.fx.forEach((f) => fx.add(f));
    ['custom', 'x'].forEach((t) => themes.delete(t));
    return (looksCache = { themes: [...themes], fx: [...fx] });
  }
  const lookNow = () => { const h = document.documentElement; return { theme: h.getAttribute('data-theme') || '', fx: (h.getAttribute('data-fx') || '').split(/\s+/).filter(Boolean) }; };
  function applyLook(l) {
    if (!l) return;
    const h = document.documentElement;
    if (window.DUWOP && typeof window.DUWOP.set === 'function' && l.theme) { try { window.DUWOP.set(l.theme, l.fx && l.fx.length ? true : false); } catch { /* fall through */ } }
    if (l.theme) h.setAttribute('data-theme', l.theme);
    h.setAttribute('data-fx', (l.fx || []).join(' '));
  }
  function setLook(patch) { const cur = Object.assign(lookNow(), patch); S.look = cur; applyLook(cur); touch(); renderBody(); }

  /* ───────────────────────── describing + handoff ───────────────────────── */
  function describeOp(op) {
    if (op.t === 'text') return `Reword ${op.label}: “${op.from}” → “${op.to}”`;
    if (op.t === 'move') return `Move ${op.label} from ${op.fromLabel} (position ${op.fromIndex + 1}) to ${op.toLabel}, ${op.beforeLabel ? 'before ' + op.beforeLabel : 'at the end'}`;
    if (op.t === 'hide') return `Remove ${op.label}`;
    if (op.t === 'add') return `Add ${op.label} ${op.pos === 'append' ? 'inside' : 'after'} ${op.anchorLabel || 'the selected element'}`;
    if (op.t === 'style') return `Style ${op.label}: ${op.prop} ${op.from || '(default)'} → ${op.to || '(default)'}` + (op.src ? ` [${op.src}]` : '');
    if (op.t === 'rule') return (op.all ? `All ${op.n} elements matching \`${op.sel}\`` : `Style ${op.label}`) + `: ${op.prop} → ${op.to || '(default)'}` + (op.src ? ` [first one at ${op.src}]` : '');
    if (op.t === 'class') return `${op.on ? 'Add' : 'Remove'} effect .${op.cls} ${op.on ? 'on' : 'from'} ${op.label}` + (op.cls === 'fx-halo' ? ' (notification halo: not in DUWOP yet; the app needs its own .fx-halo CSS)' : '');
    return op.t;
  }
  function buildHandoff() {
    const lk = S.look || lookNow();
    const L = [];
    L.push(`# Prototype handoff — ${document.title || PAGE}`, '');
    L.push(`- Page: \`${PAGE}\``, `- Captured: ${new Date().toISOString()}`, `- Look: theme \`${lk.theme || 'default'}\`${lk.fx && lk.fx.length ? ', fx ' + lk.fx.map((f) => '`' + f + '`').join(' ') : ''}`);
    if (CFG.designRefs.length) L.push(`- Design references: ${CFG.designRefs.map((d) => '`' + d + '`').join(', ')}`);
    L.push('', '## How to use this', 'This is design **intent**, not a patch to apply literally. Selectors are paths in the page DOM as the editor saw it: on a prototype they will not exist in the real app; on a real app opened through the editor\'s proxy they do. A `[file:line]` after a change is the source that rendered that element. Edit there.',
      'Map each element to the real component (the `data-slot` / label tells you which), reuse existing components and design tokens instead of inventing new ones, and let the **intent** notes decide the *why* when a literal reading is ambiguous.', '');
    const notes = S.notes.filter((n) => !n.resolved);
    L.push(`## Notes (${notes.length} open)`);
    if (!notes.length) L.push('_None._');
    notes.forEach((n, i) => L.push(`${i + 1}. **${n.kind === 'description' ? 'Description' : 'Intent'}** on ${n.label}${n.slot ? ' (`data-slot=' + n.slot + '`)' : ''}: ${n.text}`, `   - target: \`${n.sel}\``));
    L.push('', `## Changes (${S.ops.length}, in order)`);
    if (!S.ops.length) L.push('_None._');
    S.ops.forEach((op, i) => L.push(`${i + 1}. ${describeOp(op)}${op.by ? ' _(by ' + op.by + ')_' : ''}`));
    const done = S.notes.filter((n) => n.resolved).length; if (done) L.push('', `_${done} resolved note(s) omitted._`);
    L.push('', '## Machine-readable', '```json', JSON.stringify({ page: PAGE, look: lk, notes, ops: S.ops.map(({ ts, ...o }) => o) }, null, 2), '```', '');
    return L.join('\n');
  }

  /* ───────────────────────── panel rendering ───────────────────────── */
  const TABS = [['inspect', 'Inspect'], ['style', 'Style'], ['palette', 'Palette'], ['changes', 'Changes'], ['look', 'Look']];
  function renderTabs() {
    const n = S.ops.length + S.notes.filter((x) => !x.resolved).length;
    el$.tabs.innerHTML = TABS.map(([k, l]) => `<button role="tab" data-act="tab:${k}" aria-selected="${tab === k}">${l}${k === 'changes' && n ? `<span class="n">${n}</span>` : ''}</button>`).join('');
  }
  function crumbHtml() {
    const chain = []; for (let n = sel; n && n !== document.documentElement && chain.length < 6; n = n.parentElement) chain.unshift(n);
    return `<div class="crumbs">${chain.map((n, i) => `<button class="${n === sel ? 'cur' : ''}" data-act="crumb:${i}" title="${esc(pathOf(n))}">${esc(slotOf(n) || n.tagName.toLowerCase() + (n.classList[0] ? '.' + n.classList[0] : ''))}</button>`).join('')}</div>`;
  }
  let crumbChain = [];
  function tabInspect() {
    if (!sel) return `<div class="hint"><div><span class="kbd">click</span> select · <span class="kbd">drag</span> move · <span class="kbd">dbl-click</span> reword</div>
      <div><span class="kbd">↑ ↓ ← →</span> parent / child / siblings</div><div><span class="kbd">Alt+↑↓</span> nudge in its list · <span class="kbd">Del</span> remove</div>
      <div><span class="kbd">C</span> comment · <span class="kbd">Ctrl+D</span> duplicate · <span class="kbd">Ctrl+Z</span> undo</div><div><span class="kbd">I</span> switch Edit ⇄ Use (open modals, change tabs)</div></div>`;
    crumbChain = []; for (let n = sel; n && n !== document.documentElement && crumbChain.length < 6; n = n.parentElement) crumbChain.unshift(n);
    const cs = getComputedStyle(sel), r = sel.getBoundingClientRect(), notes = S.notes.filter((n) => byTok('data-eh-note', n.id) === sel);
    const bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '—' : cs.backgroundColor;
    return `${crumbHtml()}
    <div class="sec"><dl class="kv"><dt>Element</dt><dd>${esc(labelOf(sel))}</dd><dt>Component</dt><dd>${esc(nearestSlot(sel) || '—')}</dd><dt>Size</dt><dd>${Math.round(r.width)} × ${Math.round(r.height)}</dd>
      <dt>Text</dt><dd class="mono">${esc(cs.fontFamily.split(',')[0].replace(/"/g, ''))} ${esc(cs.fontSize)}</dd><dt>Colors</dt><dd class="mono">${esc(cs.color)} on ${esc(bg)}</dd>${srcOf(sel) ? `<dt>Source</dt><dd class="mono">${esc(srcOf(sel).split('/').slice(-2).join('/'))}</dd>` : ''}</dl></div>
    ${((d) => (d ? scopeHtml() + d : ''))(drawnHtml())}
    <div class="sec"><div class="btns"><button class="b" data-act="edit-text">Reword</button><button class="b" data-act="dup">Duplicate</button><button class="b" data-act="nudge:-1" title="Alt+↑">↑ Move up</button><button class="b" data-act="nudge:1" title="Alt+↓">↓ Move down</button><button class="b bad" data-act="hide">Remove</button></div></div>
    <div class="sec"><h4>Note on this element</h4>
      <div class="kinds"><button class="chip k-comment" data-act="kind:comment" aria-pressed="${draft.kind === 'comment'}">Intent</button><button class="chip k-description" data-act="kind:description" aria-pressed="${draft.kind === 'description'}">Description</button></div>
      <textarea class="in" id="noteIn" rows="3" placeholder="${draft.kind === 'comment' ? 'Why should this change? What should it feel like?' : 'What is this piece, and how should it behave?'}">${esc(draft.text)}</textarea>
      <div class="btns" style="margin-top:5px"><button class="b pri" data-act="note-add">Pin note</button></div></div>
    ${notes.length ? `<div class="sec"><h4>Pinned here</h4>${notes.map(noteRow).join('')}</div>` : ''}`;
  }
  function noteRow(n) {
    const i = S.notes.indexOf(n) + 1, live = !!noteEl(n.id);
    return `<div class="row" ${focusNote === n.id ? 'style="background:rgba(76,137,183,.08)"' : ''}><span class="dot ${n.kind === 'description' ? 'd' : ''} ${n.resolved ? 'r' : ''}">${i}</span><div class="t"><div class="m">${n.kind === 'description' ? 'Description' : 'Intent'} · ${esc(n.label)}${live ? '' : ' · <span class="badge missing">target not on screen</span>'}</div>${esc(n.text)}</div>
      <div class="btns"><button class="ib" title="${n.resolved ? 'Reopen' : 'Resolve'}" data-act="note-res:${n.id}">${n.resolved ? '↺' : '✓'}</button><button class="ib" title="Show" data-act="note-go:${n.id}">⌖</button><button class="ib" title="Delete" data-act="note-del:${n.id}">×</button></div></div>`;
  }
  let palItems = [];
  function scanPalette() {
    const seen = new Map();
    document.querySelectorAll('[data-slot],[data-component]').forEach((e) => {
      if (host.contains(e) || e.hasAttribute('data-eh-added')) return;
      const slot = slotOf(e), sig = sigOf(e);
      if (!seen.has(sig)) seen.set(sig, { sig, slot, html: cleanHtml(e), text: snip(e.textContent, 26), n: 0, tag: e.tagName.toLowerCase() });
      seen.get(sig).n++;
    });
    palItems = [...seen.values()].sort((a, b) => a.slot.localeCompare(b.slot) || b.n - a.n).slice(0, 60);
  }
  /** Every element on the page a palette row stands for: kit rows by their selector, page rows by signature. */
  function matchesOf(key) {
    const [k, i] = key.split(':');
    if (k === 'like') { const ls = sel && likeSel(sel); return ls ? [...document.querySelectorAll(ls)].filter((e) => !host.contains(e)) : []; }
    if (k === 'kit') { try { return [...document.querySelectorAll(KIT[+i].m)].filter((e) => !host.contains(e)); } catch { return []; } }
    const p = palItems[+i];
    return p ? [...document.querySelectorAll('[data-slot],[data-component]')].filter((e) => !host.contains(e) && sigOf(e) === p.sig) : [];
  }
  function palRow(key, hl, name, sub, act) {
    const nm = names[key];
    if (renaming === key) return `<div class="pal"><input class="in" id="renIn" value="${esc(nm || name)}" placeholder="${esc(name)}"></div>`;
    return `<div class="pal" data-hl="${hl}"><span class="t" title="Hover to see where these are on the page"><b>${esc(nm || name)}</b> <span style="color:var(--mut)">${esc(sub)}</span></span>
      <button class="ib" title="Rename" data-act="rename:${esc(key)}">✎</button><button class="b" data-act="${act}:after" ${sel ? '' : 'disabled'}>After</button><button class="b ghost" data-act="${act}:append" ${sel ? '' : 'disabled'}>Inside</button></div>`;
  }
  function tabPalette() {
    scanPalette();
    const kit = KIT.map((k, i) => { const n = matchesOf('kit:' + i).length; return palRow('kit:' + k.id, 'kit:' + i, k.name, n ? `×${n} on page` : 'not on page', 'kit:' + i); }).join('');
    const page = palItems.map((p, i) => palRow('pg:' + p.sig, 'pg:' + i, p.slot, `${names['pg:' + p.sig] ? p.slot + ' · ' : ''}${p.text || '<' + p.tag + '>'} · ×${p.n}`, 'pal:' + i)).join('');
    return `<div class="ctx" style="margin-bottom:6px">${sel ? 'Insert next to: ' + esc(labelOf(sel)) : 'Select an element, then insert. Hover a name to find it on the page; ✎ renames it.'}</div>
      <div class="sec"><h4>DUWOP kit</h4>${kit}
        <div class="hint" style="margin-top:4px">Hover behaviour comes from DUWOP: <b>fx-lift</b> on cards (Style tab), and the underglow / shine effects (Look tab).</div></div>
      <div class="sec"><h4>On this page</h4>${page || '<div class="empty">No <code>data-slot</code> or <code>data-component</code> elements found. Tag your components to fill this list.</div>'}</div>`;
  }

  /* ───────────────────────── style ───────────────────────── */
  const SHADOWS = [['None', 'none'], ['Soft', '0 1px 3px rgb(0 0 0 / .3)'], ['Medium', '0 6px 20px rgb(0 0 0 / .4)'], ['Strong', '0 14px 44px rgb(0 0 0 / .6)'],
    ['Glow', '0 0 0 1px var(--ring), 0 0 24px color-mix(in oklab, var(--primary) 45%, transparent)']];
  const camel = (p) => p.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  /** The colour for prop: the picked base (token or hex) faded to alpha% (default: the alpha slider, else 100). */
  function mixOf(prop, a) {
    if (a == null) { const s = root.querySelector(`[data-alpha="${prop}"]`); a = s ? +s.value : 100; }
    const base = stBase[prop] || hexOf(rgba(getComputedStyle(sel)[camel(prop)]));
    return a >= 100 ? base : `color-mix(in oklab, ${base} ${a}%, transparent)`;
  }
  /** One op per element + property while you drag: consecutive changes update the last op instead of adding more. */
  // Style scope: 'one' = inline style on the selection, 'all' = a CSS rule for everything likeSel() matches.
  // Resets to 'one' on every new selection so a mass change is always a deliberate click.
  let scope = 'one';
  /** The rule selector a style edit on the selection writes to, or null for an inline edit. */
  const ruleSel = (pseudo) => { const base = scope === 'all' && likeSel(sel) ? likeSel(sel) : pseudo ? pathOf(sel) : null; return base && base + (pseudo ? '::' + pseudo : ''); };
  function setStyle(prop, to, pseudo = '', g) {
    if (!sel || sel === document.body) return;
    // a border colour or width on a borderless element would not show: give it a solid 1px border first
    const bm = to && prop.match(/^border-(?:(top|right|bottom|left)-)?(width|color)$/);
    if (bm) {
      const cs = getComputedStyle(sel, pseudo ? '::' + pseudo : null), side = bm[1] || 'top', pre = 'border-' + (bm[1] ? bm[1] + '-' : '');
      // read both first: computed style is live, and once style is solid the default width reads as 3px (medium)
      const noStyle = cs[camel(`border-${side}-style`)] === 'none', noWidth = bm[2] === 'color' && (noStyle || !parseFloat(cs[camel(`border-${side}-width`)]));
      if (noStyle || noWidth) g = g || uid(); // one group, so one undo or one × removes the colour and the border it needed
      if (noStyle) setStyle(pre + 'style', 'solid', pseudo, g);
      if (noWidth) setStyle(pre + 'width', '1px', pseudo, g);
    }
    const rs = ruleSel(pseudo), last = S.ops[S.ops.length - 1];
    if (rs) {
      if (last && last.t === 'rule' && last.prop === prop && last.sel === rs) { last.to = to; writeRules(); touch(); return; }
      const all = rs !== pathOf(sel) + '::' + pseudo, n = document.querySelectorAll(rs.replace(/::\w+$/, '')).length;
      return commit({ t: 'rule', sel: rs, prop, from: '', to, all, n, g, label: all ? `${n} elements matching ${rs}` : labelOf(sel) + '::' + pseudo }, null, true);
    }
    if (last && last.t === 'style' && last.prop === prop && byTok('data-eh-op', last.id) === sel) {
      last.to = to; withApply(() => (to ? sel.style.setProperty(prop, to, 'important') : sel.style.removeProperty(prop))); touch(); return;
    }
    commit({ t: 'style', sel: pathOf(sel), fp: fp(sel), label: labelOf(sel), prop, from: sel.style.getPropertyValue(prop), to, g }, null, true);
  }

  /* "Set by": which stylesheet rule draws each line, shadow or fill on the selection and its ::before / ::after. */
  const sheetName = (sh) => {
    const o = sh.ownerNode;
    if (o && o.hasAttribute && (o.hasAttribute('data-eh-rules') || o.hasAttribute('data-eh-style'))) return 'EH editor';
    if (o && o.getAttribute && o.getAttribute('data-vite-dev-id')) return o.getAttribute('data-vite-dev-id').split('/').slice(-2).join('/');
    return sh.href ? sh.href.split('?')[0].split('/').pop() : 'page <style>';
  };
  // ponytail: document order only; specificity, !important and @layer order are ignored, so the first row is usually
  // (not always) the winner. Nested CSS (&:hover) and selectors with commas inside :is() are skipped.
  function setBy(el, pseudo, prop) {
    const out = [], want = pseudo || '';
    const walk = (rules, sh) => {
      for (const r of rules) {
        if (r.media && !matchMedia(r.media.mediaText).matches) continue;
        if (r.selectorText == null) { if (r.cssRules) walk(r.cssRules, sh); continue; }
        const v = r.style.getPropertyValue(prop); if (!v) continue;
        const hit = r.selectorText.split(',').some((part) => {
          const ps = /::?(before|after)\b/.exec(part); if ((ps ? ps[1] : '') !== want) return false;
          try { return el.matches(part.replace(/::?(before|after)\b/g, '').trim() || '*'); } catch { return false; }
        });
        if (hit) out.push({ sel: r.selectorText, v, src: sheetName(sh) });
      }
    };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, sh); } catch { /* cross-origin sheet */ } }
    if (!pseudo && el.style.getPropertyValue(prop)) out.push({ sel: 'inline style', v: el.style.getPropertyValue(prop), src: el.matches('[data-eh-op]') ? 'EH editor or app' : 'app' });
    return out.reverse();
  }
  const SIDES = ['top', 'right', 'bottom', 'left'];
  /** Everything visible that draws on el or a pseudo: [{pseudo, what, val, by, kill:[prop, value]}]. */
  function drawn(el) {
    const out = [];
    for (const pseudo of ['', 'before', 'after']) {
      const cs = getComputedStyle(el, pseudo ? '::' + pseudo : null);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue;
      const add = (what, val, props, kill) => out.push({ pseudo, what, val, kill, by: [...new Map(props.flatMap((p) => setBy(el, pseudo, p)).map((r) => [r.sel + r.src, r])).values()] });
      const sides = SIDES.filter((s) => parseFloat(cs[camel(`border-${s}-width`)]) > 0 && !/none|hidden/.test(cs[camel(`border-${s}-style`)]));
      const bv = (s) => `${cs[camel(`border-${s}-width`)]} ${cs[camel(`border-${s}-style`)]} ${cs[camel(`border-${s}-color`)]}`;
      if (sides.length === 4 && SIDES.every((s) => bv(s) === bv('top'))) add('border', bv('top'), ['border-top-width', 'border-top-color'], ['border-style', 'none']);
      else sides.forEach((s) => add('border-' + s, bv(s), [`border-${s}-width`, `border-${s}-color`], [`border-${s}-style`, 'none']));
      if (cs.boxShadow !== 'none') add('box-shadow', cs.boxShadow, ['box-shadow'], ['box-shadow', 'none']);
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) add('outline', `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, ['outline-width', 'outline-style'], ['outline-style', 'none']);
      if (cs.backgroundImage !== 'none') add('background-image', cs.backgroundImage, ['background-image'], ['background-image', 'none']);
      if (rgba(cs.backgroundColor)[3] > 0) add('background', cs.backgroundColor, ['background-color'], pseudo ? ['display', 'none'] : ['background-color', 'transparent']);
    }
    return out;
  }
  let drawnRows = [];
  function drawnHtml() {
    drawnRows = drawn(sel);
    if (!drawnRows.length) return '';
    return `<div class="sec"><h4>Lines, shadows and fills</h4>${drawnRows.map((d, i) => `<div class="row"><div class="t"><div><b>${d.pseudo ? '::' + d.pseudo + ' ' : ''}${esc(d.what)}</b> <span class="mono m">${esc(snip(d.val, 60))}</span></div>
      <div class="m">${d.by.length ? d.by.slice(0, 3).map((r) => `set by <span class="mono">${esc(snip(r.sel, 48))}</span> in ${esc(r.src)}`).join('<br>') : 'set by: browser default or a rule this tool cannot read'}</div></div>
      <button class="b" data-act="kill:${i}" title="${scope === 'all' ? 'Turn this off on every element like this one' : 'Turn this off on this element'}">Hide</button></div>`).join('')}</div>`;
  }
  /** "Change: This one | All N like this". Hovering the All button outlines every element it would change. */
  function scopeHtml() {
    const ls = likeSel(sel), n = ls ? matchesOf('like').length : 0;
    return `<div class="sec"><div class="seg" role="group" aria-label="Change which elements"><button data-act="scope:one" aria-pressed="${scope === 'one'}">This one</button><button data-act="scope:all" data-hl="like" aria-pressed="${scope === 'all'}" ${ls && n > 1 ? '' : 'disabled title="No other elements share this tag and classes"'}>All ${n > 1 ? n + ' ' : ''}like this</button></div>
      ${scope === 'all' ? `<div class="ctx" style="margin-top:4px">Edits go to every <span class="mono">${esc(ls)}</span></div>` : ''}</div>`;
  }
  function tabStyle() {
    if (!sel || sel === document.body) return '<div class="empty">Select an element to style it.</div>';
    const cs = getComputedStyle(sel), toks = TOKENS.filter(tokenVal);
    const rng = (lbl, attr, prop, val, min, max, step, unit = '') => `<label>${lbl}</label><input type="range" ${attr}="${prop}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${val}${unit}</output>`;
    const txt = (lbl, prop) => `<label>${lbl}</label><input class="in" data-st="${prop}" value="${esc(sel.style.getPropertyValue(prop))}" placeholder="${esc(cs[camel(prop)])}"><span></span>`;
    const col = (lbl, prop, cprop = prop) => {
      const c = rgba(cs[camel(cprop)]); if (!stBase[prop]) stBase[prop] = hexOf(c);
      return `<label>${lbl}</label><div class="sw">${toks.map((t) => `<button class="swb" style="background:${esc(tokenVal(t))}" title="--${t}" data-act="col:${prop}:${t}"></button>`).join('')}</div><input type="color" class="in col" data-col="${prop}" value="${hexOf(c)}">
        ${rng('', 'data-alpha', prop, Math.round(c[3] * 100), 0, 100, 1, '%')}`;
    };
    const sel1 = (lbl, prop, opts, cprop = prop) => `<label>${lbl}</label><select class="in" data-st="${prop}">${opts.map((o) => `<option ${String(cs[camel(cprop)]) === o ? 'selected' : ''}>${o}</option>`).join('')}</select><span></span>`;
    const bs = bSide || 'top', bp = (k) => 'border-' + (bSide ? bSide + '-' : '') + k; // side picker: '' = all four
    const px = (p) => Math.round(parseFloat(cs[camel(p)]) || 0);
    return `<div class="ctx" style="margin-bottom:8px">${esc(labelOf(sel))}</div>${scopeHtml()}
    <div class="sec"><h4>Fill</h4><div class="st">${col('Colour', 'background-color')}${rng('Opacity', 'data-st', 'opacity', +(+cs.opacity).toFixed(2), 0, 1, 0.05)}</div></div>
    <div class="sec"><h4>Border</h4><div class="st"><label>Side</label><select class="in" data-bside>${['all', 'top', 'right', 'bottom', 'left'].map((o) => `<option ${(bSide || 'all') === o ? 'selected' : ''}>${o}</option>`).join('')}</select><span></span>
      ${rng('Width', 'data-st', bp('width'), px(`border-${bs}-width`), 0, 8, 1, 'px')}${sel1('Style', bp('style'), ['none', 'solid', 'dashed', 'dotted'], `border-${bs}-style`)}${col('Colour', bp('color'), `border-${bs}-color`)}${rng('Radius', 'data-st', 'border-radius', px('border-top-left-radius'), 0, 40, 1, 'px')}</div></div>
    <div class="sec"><h4>Shadow</h4><div class="fxs">${SHADOWS.map(([n], i) => `<button class="chip k-comment" data-act="shadow:${i}">${n}</button>`).join('')}</div></div>
    <div class="sec"><h4>Text</h4><div class="st">${col('Colour', 'color')}${rng('Size', 'data-st', 'font-size', px('font-size'), 8, 64, 1, 'px')}${sel1('Weight', 'font-weight', ['300', '400', '500', '600', '700', '800'])}</div></div>
    <div class="sec"><h4>Spacing and size</h4><div class="st">${SIDES.map((s) => rng('Pad ' + s, 'data-st', 'padding-' + s, px('padding-' + s), 0, 64, 4, 'px')).join('')}${txt('Margin', 'margin')}${txt('Gap', 'gap')}${txt('Width', 'width')}${txt('Height', 'height')}</div></div>
    <div class="sec"><h4>DUWOP effects</h4><div class="fxs">${FXC.map((c) => `<button class="chip k-comment" data-act="cls:${c}" aria-pressed="${sel.classList.contains(c)}">${c}</button>`).join('')}</div></div>
    <div class="sec"><div class="btns"><button class="b" data-act="undo" ${S.ops.length ? '' : 'disabled'}>Undo last</button></div>
      <div class="hint" style="margin-top:5px">Each slider drag is one change. Empty a text box to go back to the page's own value. Swatches are this theme's tokens.</div></div>`;
  }
  function tabChanges() {
    const ops = S.ops.map((op, i) => `<div class="row"><span class="dot" style="background:var(--ctrl);border:1px solid var(--line);color:var(--tx2)">${i + 1}</span><div class="t">${esc(describeOp(op))}${status[op.id] && status[op.id] !== 'ok' ? ` <span class="badge ${status[op.id]}">${status[op.id] === 'stale' ? 'target changed' : 'not on screen'}</span>` : ''}</div>
      <button class="ib" data-act="op-del:${op.id}" title="${op.g && S.ops.some((o) => o !== op && o.g === op.g) ? 'Delete this change and the ones made with it' : 'Delete this change'}">×</button></div>`).join('');
    const notes = S.notes.map(noteRow).join('');
    return `<div class="sec"><div class="btns"><button class="b" data-act="undo" ${S.ops.length ? '' : 'disabled'}>Undo</button><button class="b pri" data-act="copy">Copy handoff</button><button class="b" data-act="dl">Download</button>${serverOK ? '<button class="b" data-act="save">Save to repo</button>' : ''}${chatOn ? '<button class="b" data-act="send-claude">Send to Claude</button>' : ''}<button class="b ghost bad" data-act="clear">Clear</button></div>
      ${serverOK ? '<div class="ctx" style="margin-top:5px">Auto-saved to eh-data/ — tell Claude Code to read the .handoff.md</div>' : ''}</div>
      <div class="sec"><h4>Changes (${S.ops.length})</h4>${ops || '<div class="empty">Nothing changed yet.</div>'}</div>
      <div class="sec"><h4>Notes (${S.notes.length})</h4>${notes || '<div class="empty">No notes yet. Select an element and pin one.</div>'}</div>`;
  }
  function tabLook() {
    const lk = detectLooks(), cur = lookNow();
    return `<div class="sec"><h4>Theme</h4><select class="in" id="lookTheme">${lk.themes.map((t) => `<option value="${esc(t)}" ${t === cur.theme ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="sec"><h4>Effects</h4><div class="fxs">${lk.fx.length ? lk.fx.map((f) => `<button class="chip k-comment" data-act="fx:${esc(f)}" aria-pressed="${cur.fx.includes(f)}">${esc(f)}</button>`).join('') : '<span class="empty">No data-fx effects detected.</span>'}</div></div>
      <div class="sec"><div class="btns"><button class="b ghost" data-act="look-reset">Reset to page default</button></div></div>
      <div class="hint">The look you pick is recorded in the handoff, so Claude Code knows which theme the design was judged in.</div>`;
  }
  function renderBody() {
    renderTabs();
    const keepFocus = root.activeElement && root.activeElement.id === 'noteIn';
    el$.body.innerHTML = ({ inspect: tabInspect, style: tabStyle, palette: tabPalette, changes: tabChanges, look: tabLook })[tab]();
    const ri = root.getElementById('renIn');
    if (ri) {
      ri.focus(); ri.select();
      const done = (save) => {
        if (renaming == null) return;
        const v = ri.value.trim();
        if (save) { if (v) names[renaming] = v; else delete names[renaming]; lsSet(NAMES_KEY, JSON.stringify(names)); }
        renaming = null; renderBody(); renderCtx();
      };
      ri.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
      ri.addEventListener('blur', () => done(true));
    }
    const ni = root.getElementById('noteIn');
    if (ni) { ni.addEventListener('input', () => { draft.text = ni.value; }); if (keepFocus) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); } }
    const lt = root.getElementById('lookTheme'); if (lt) lt.addEventListener('change', () => setLook({ theme: lt.value }));
  }
  function renderCtx() {
    el$.ctx.textContent = sel ? 'Claude will see: ' + labelOf(sel) + (S.ops.length || S.notes.length ? ` + ${S.ops.length} change(s), ${S.notes.length} note(s)` : '') : (S.ops.length || S.notes.length ? `Claude will see ${S.ops.length} change(s) and ${S.notes.length} note(s)` : 'Select something to give Claude context');
  }
  function renderChat() {
    el$.msgs.innerHTML = chat.map((m) => `<div class="msg ${m.who === 'u' ? 'u' : ''} ${m.stub ? 'stub' : ''} ${m.err ? 'err' : ''}">${esc(m.text)}</div>`).join('')
      + (busy ? '<div class="msg stub" id="working">Claude is working… (up to 5 min)</div>' : '');
    el$.msgs.scrollTop = el$.msgs.scrollHeight;
    ssSet(CHATKEY, JSON.stringify(chat.slice(-40)));
  }
  function renderPins() {
    el$.pins.innerHTML = S.notes.map((n, i) => `<div class="pin ${n.kind === 'description' ? 'd' : ''} ${n.resolved ? 'r' : ''} ${focusNote === n.id ? 'cur' : ''}" data-pin="${n.id}" title="${esc(n.text)}">${i + 1}</div>`).join('');
  }
  function refresh() { renderBody(); renderPins(); renderCtx(); }

  function syncChrome() {
    el$.pill.style.display = on ? 'none' : 'flex';
    el$.panel.hidden = !on;
    el$.main.style.display = collapsed ? 'none' : 'contents';
    root.querySelector('.chat').style.display = collapsed ? 'none' : 'flex';
    root.querySelectorAll('[data-act^="mode:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === 'mode:' + mode)));
    root.querySelector('[data-act="collapse"]').textContent = collapsed ? '+' : '–';
    el$.pgl.textContent = '· ' + (PAGE.split('/').pop() || PAGE);
    if (!on) { ['hb', 'sb', 'drop', 'ghost'].forEach((k) => (el$[k].style.display = 'none')); el$.pins.style.display = 'none'; } else el$.pins.style.display = '';
    ssSet('eh:on', on ? mode : '');
  }

  /* ───────────────────────── actions ───────────────────────── */
  const ACTIONS = {
    mode: (v) => { mode = v; if (mode === 'interact') { hover = null; endTextEdit(false); } syncChrome(); },
    tab: (v) => { tab = v; renderBody(); },
    collapse: () => { collapsed = !collapsed; uiSave({ c: collapsed }); syncChrome(); },
    close: () => setOn(false),
    crumb: (v) => select(crumbChain[+v]),
    'edit-text': () => startTextEdit(sel), dup: dupSel, hide: hideSel, nudge: (v) => nudge(+v),
    kind: (v) => { draft.kind = v; renderBody(); },
    'note-add': addNote,
    'note-del': (v) => delNote(v),
    'note-res': (v) => { const n = S.notes.find((x) => x.id === v); if (n) { n.resolved = !n.resolved; touch(); refresh(); } },
    'note-go': (v) => { const e = noteEl(v); if (e) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); select(e); focusNote = v; renderBody(); } else toast('That element is not on screen right now.'); },
    pal: (v) => { const [i, pos] = v.split(':'); const p = palItems[+i]; if (p) addAt(p.html, sel, pos, names['pg:' + p.sig] || p.slot); },
    kit: (v) => { const [i, pos] = v.split(':'); const k = KIT[+i]; if (k) addAt(k.html, sel, pos, (names['kit:' + k.id] || k.name) + ' (DUWOP kit)'); },
    rename: (v) => { renaming = v; renderBody(); },
    col: (v) => { const [prop, t] = v.split(':'); stBase[prop] = `var(--${t})`; setStyle(prop, mixOf(prop)); renderBody(); },
    shadow: (v) => { setStyle('box-shadow', SHADOWS[+v][1]); renderBody(); },
    scope: (v) => { scope = v; highlight(null); renderBody(); },
    'op-del': (v) => delOp(v),
    kill: (v) => { const d = drawnRows[+v]; if (d) { setStyle(d.kill[0], d.kill[1], d.pseudo); renderBody(); } },
    cls: (v) => { if (!sel || sel === document.body) return; const el = sel; commit({ t: 'class', sel: pathOf(el), fp: fp(el), label: labelOf(el), cls: v, on: !el.classList.contains(v) }); },
    undo, copy: async () => { try { await navigator.clipboard.writeText(buildHandoff()); toast('Handoff copied.'); } catch { download('handoff.md', buildHandoff(), 'text/markdown'); } },
    dl: () => { download(slugName() + '.handoff.md', buildHandoff(), 'text/markdown'); download(slugName() + '.json', JSON.stringify(S, null, 2), 'application/json'); },
    save: async () => { await pushServer(); toast('Saved to eh-data/.'); },
    'send-claude': () => { pushServer(); sendChat('Implement the changes and notes in the handoff in the real source, then list what you changed.'); },
    clear: () => { if (!confirm('Remove all changes and notes for this page?')) return; while (S.ops.length) { const op = S.ops.pop(); withApply(() => revertOp(op)); } S.notes.forEach((n) => { const e = noteEl(n.id); if (e) withApply(() => delTok(e, 'data-eh-note', n.id)); }); S.notes = []; touch(); refresh(); },
    fx: (v) => { const cur = lookNow(); const s = new Set(cur.fx); s.has(v) ? s.delete(v) : s.add(v); setLook({ fx: [...s] }); },
    'look-reset': () => { S.look = null; const h = document.documentElement; if (look0.theme != null) { applyLook({ theme: look0.theme, fx: (look0.fx || '').split(/\s+/).filter(Boolean) }); } touch(); renderBody(); },
  };
  const slugName = () => (PAGE.split('/').pop() || 'page').replace(/\.\w+$/, '') || 'page';
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  root.addEventListener('click', (e) => {
    const pin = e.target.closest && e.target.closest('[data-pin]');
    if (pin) { ACTIONS['note-go'](pin.dataset.pin); return; }
    if (e.target === el$.pill || el$.pill.contains(e.target)) { setOn(true); return; }
    const a = e.target.closest && e.target.closest('[data-act]'); if (!a) return;
    const [k, ...rest] = a.dataset.act.split(':'); if (ACTIONS[k]) ACTIONS[k](rest.join(':'));
  });
  el$.body.addEventListener('input', (e) => {
    const t = e.target, d = t.dataset;
    if (t.type === 'range' && t.nextElementSibling) t.nextElementSibling.textContent = t.value + (d.unit || '');
    if (d.st && t.type === 'range') setStyle(d.st, t.value + (d.unit || ''));
    else if (d.alpha) setStyle(d.alpha, mixOf(d.alpha, +t.value));
    else if (d.col) { stBase[d.col] = t.value; setStyle(d.col, mixOf(d.col)); }
  });
  el$.body.addEventListener('change', (e) => {
    const t = e.target, d = t.dataset;
    if (d.st && t.type !== 'range') { setStyle(d.st, t.value.trim()); renderBody(); }
    if ('bside' in d) { bSide = t.value === 'all' ? '' : t.value; renderBody(); }
  });
  let hlKey = null;
  const highlight = (key) => {
    if (key === hlKey) return; hlKey = key; el$.hls.innerHTML = '';
    if (key) matchesOf(key).slice(0, 200).forEach((e) => { const r = visRect(e); if (!r) return; const b = document.createElement('div'); b.className = 'box hlbox'; el$.hls.appendChild(b); place(b, r, 2); });
  };
  el$.body.addEventListener('pointerover', (e) => { const r = e.target.closest('[data-hl]'); highlight(r ? r.dataset.hl : null); });
  el$.body.addEventListener('pointerleave', () => highlight(null));
  el$.grip.addEventListener('pointerdown', (e) => { if (!sel) return; e.preventDefault(); e.stopPropagation(); startDrag(sel, e, true); });
  // corner resize: live inline width/height while dragging, then one width op + one height op on release (snapped to 4px)
  let rsz = null;
  el$.rsz.addEventListener('pointerdown', (e) => {
    if (!sel || sel === document.body) return; e.preventDefault(); e.stopPropagation(); el$.rsz.setPointerCapture(e.pointerId);
    const cs = getComputedStyle(sel);
    rsz = { el: sel, x: e.clientX, y: e.clientY, w: parseFloat(cs.width), h: parseFloat(cs.height), fw: sel.style.getPropertyValue('width'), fh: sel.style.getPropertyValue('height') };
  });
  const rszTo = (e) => ({ w: Math.max(4, Math.round((rsz.w + e.clientX - rsz.x) / 4) * 4) + 'px', h: Math.max(4, Math.round((rsz.h + e.clientY - rsz.y) / 4) * 4) + 'px' });
  el$.rsz.addEventListener('pointermove', (e) => { if (!rsz) return; const t = rszTo(e); withApply(() => { rsz.el.style.setProperty('width', t.w, 'important'); rsz.el.style.setProperty('height', t.h, 'important'); }); });
  el$.rsz.addEventListener('pointerup', (e) => {
    if (!rsz) return; const r = rsz, t = rszTo(e); rsz = null;
    withApply(() => ['width', 'height'].forEach((p, i) => { const f = i ? r.fh : r.fw; if (f) r.el.style.setProperty(p, f); else r.el.style.removeProperty(p); }));
    if (Math.abs(e.clientX - r.x) + Math.abs(e.clientY - r.y) < 2) return;
    sel = r.el; const was = scope, g = uid(); scope = 'one'; setStyle('width', t.w, '', g); setStyle('height', t.h, '', g); scope = was; refresh();
  });

  // draggable panel
  let pdrag = null;
  el$.hd.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = el$.panel.getBoundingClientRect(); pdrag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; el$.hd.setPointerCapture(e.pointerId); el$.hd.style.cursor = 'grabbing';
  });
  el$.hd.addEventListener('pointermove', (e) => {
    if (!pdrag) return; const p = el$.panel.style;
    p.left = Math.min(Math.max(0, e.clientX - pdrag.dx), innerWidth - 120) + 'px'; p.top = Math.min(Math.max(0, e.clientY - pdrag.dy), innerHeight - 40) + 'px'; p.right = 'auto'; p.bottom = 'auto';
  });
  function uiSave(patch) { lsSet(UIKEY, JSON.stringify(Object.assign(tryJSON(lsGet(UIKEY)) || {}, patch))); }
  el$.hd.addEventListener('pointerup', () => { if (pdrag) { uiSave({ l: el$.panel.style.left, t: el$.panel.style.top }); pdrag = null; el$.hd.style.cursor = ''; } });
  const ui0 = tryJSON(lsGet(UIKEY)) || {};
  if (ui0.l) { const p = el$.panel.style; p.left = ui0.l; p.top = ui0.t; p.right = 'auto'; p.bottom = 'auto'; }
  collapsed = !!ui0.c;

  /* ───────────────────────── chat bar (server --claude) ───────────────────────── */
  function selectionInfo() {
    if (!sel) return null;
    const r = sel.getBoundingClientRect();
    return { label: labelOf(sel), selector: pathOf(sel), tag: sel.tagName.toLowerCase(), slot: nearestSlot(sel), classes: [...sel.classList].slice(0, 8), text: snip(sel.textContent, 120), rect: { w: Math.round(r.width), h: Math.round(r.height) } };
  }
  const chatContext = () => ({ page: { path: PAGE, title: document.title, url: location.href }, look: S.look || lookNow(), selection: selectionInfo(), ops: S.ops.map(({ ts, ...o }) => o), notes: S.notes, designRefs: CFG.designRefs });
  async function sendChat(message) {
    if (busy) { toast('Claude is still working on the last message.'); return; }
    chat.push({ who: 'u', text: message }); busy = true; renderChat();
    const payload = { message, context: chatContext(), handoff: buildHandoff() };
    let res;
    try {
      if (serverOK) res = await api('chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      else res = { stub: true, reply: 'Chat needs the editor server: node server.mjs --claude <folder> (or --proxy … --app <repo> --claude).' };
    } catch (err) { res = { err: true, reply: 'Chat failed: ' + (err && err.message ? err.message : err) }; }
    busy = false;
    chat.push({ who: 'c', text: res.reply || res.error || '(no reply)', stub: !!res.stub, err: !!(res.err || res.error) });
    renderChat();
    if (res.reload) setTimeout(() => location.reload(), 300);
  }
  el$.cform.addEventListener('submit', (e) => { e.preventDefault(); const v = el$.cin.value.trim(); if (!v) return; el$.cin.value = ''; sendChat(v); });
  el$.cin.addEventListener('keydown', (e) => e.stopPropagation());

  /* ───────────────────────── page event interception ───────────────────────── */
  const BLOCK = ['click', 'dblclick', 'mousedown', 'mouseup', 'auxclick', 'contextmenu', 'touchstart', 'dragstart', 'selectstart', 'submit'];
  function onBlock(e) {
    if (!on || mode !== 'edit' || isOurs(e)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.type === 'dblclick') { const t = targetAt(e.clientX, e.clientY); if (t) { select(t); startTextEdit(t); } }
  }
  BLOCK.forEach((t) => window.addEventListener(t, onBlock, true));
  window.addEventListener('pointerdown', (e) => {
    if (!on || mode !== 'edit' || isOurs(e) || e.button !== 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (edit) endTextEdit(true);
    const t = targetAt(e.clientX, e.clientY);
    if (t && sel && sel !== t && sel.contains(t)) {
      // inside the current selection: a drag moves the selection (e.g. a card picked with ↑); a plain click still picks the deeper element
      startDrag(sel, e, false); drag.clickTarget = t;
    } else { select(t); if (t) startDrag(t, e, false); }
  }, true);
  window.addEventListener('pointermove', (e) => {
    ptr = { x: e.clientX, y: e.clientY };
    if (drag) { e.stopImmediatePropagation(); moveDrag(e); }
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (drag) {
      e.stopImmediatePropagation();
      if (!drag.active && drag.clickTarget) { const t = drag.clickTarget; drag = null; select(t); return; }
      endDrag(); return;
    }
    if (on && mode === 'edit' && !isOurs(e)) { e.stopImmediatePropagation(); e.preventDefault(); } // keep the app from seeing the release
  }, true);
  window.addEventListener('pointercancel', () => { drag = null; dropInfo = null; el$.ghost.style.display = 'none'; el$.drop.style.display = 'none'; }, true);
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopImmediatePropagation(); setOn(!on); return; }
    if (!on || inEditable(e)) return;
    // undo works even when focus is on a panel button (it is, right after clicking one)
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && mode === 'edit') { e.preventDefault(); e.stopImmediatePropagation(); undo(); return; }
    if (isOurs(e)) return;
    const k = e.key;
    const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (k.toLowerCase() === 'i' && !mod) { swallow(); ACTIONS.mode(mode === 'edit' ? 'interact' : 'edit'); return; }
    if (mode !== 'edit') return;
    if (mod && k.toLowerCase() === 'z') { swallow(); undo(); return; }
    if (mod && k.toLowerCase() === 'd') { swallow(); dupSel(); return; }
    if (k === 'Escape') { swallow(); drag = null; select(null); return; }
    if (k === 'Delete') { if (sel) { swallow(); hideSel(); } return; }
    if (k === 'Backspace') { // Backspace is easy to hit by accident while thinking about text: it needs a second press
      if (!sel) return; swallow();
      if (bsArm.el === sel && Date.now() - bsArm.t < 1500) { bsArm = {}; hideSel(); } else { bsArm = { el: sel, t: Date.now() }; toast('Press Backspace again to remove it. Delete removes at once.'); }
      return;
    }
    if (k === 'Enter' || k === 'F2') { if (sel) { swallow(); startTextEdit(sel); } return; }
    if (k.toLowerCase() === 'c' && !mod) { if (sel) { swallow(); tab = 'inspect'; renderBody(); const ni = root.getElementById('noteIn'); ni && ni.focus(); } return; }
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { swallow(); nudge(k === 'ArrowUp' ? -1 : 1); return; }
    if (k === 'ArrowUp') { swallow(); nav.parent(); } else if (k === 'ArrowDown') { swallow(); nav.child(); }
    else if (k === 'ArrowLeft') { swallow(); nav.prev(); } else if (k === 'ArrowRight') { swallow(); nav.next(); }
  }, true);

  /* ───────────────────────── frame loop ───────────────────────── */
  function topLayer() {
    let modal = null;
    for (const d of document.querySelectorAll('dialog[open]')) { try { if (d.matches(':modal')) modal = d; } catch { /* old browser */ } }
    const want = modal || document.documentElement;
    if (host.parentNode !== want) {
      want.appendChild(host);
      if (host.showPopover) { try { host.showPopover(); } catch { /* already open */ } }
      else host.style.zIndex = '2147483647';
    } else if (host.showPopover) { try { if (!host.matches(':popover-open')) host.showPopover(); } catch { /* ignore */ } }
  }
  let lastSig = '', looping = false;
  function frame() {
    if (!on) { looping = false; return; }
    topLayer();
    if (sel && !sel.isConnected) { const again = selPath && q(selPath); select(again && again !== document.body ? again : null); }
    // hover
    if (mode === 'edit' && !drag && !edit) { hover = targetAt(ptr.x, ptr.y); if (hover === sel) hover = null; } else hover = null;
    place(el$.hb, visRect(hover));
    const sr = visRect(sel);
    place(el$.sb, sr, 1);
    if (sr) { el$.sbl.textContent = labelOf(sel); el$.sb.classList.toggle('low', sr.t < 22); el$.sb.classList.toggle('gin', sr.l + sr.w > innerWidth - 34); }
    // pins
    const pinEls = el$.pins.children;
    for (const p of pinEls) {
      const n = S.notes.find((x) => x.id === p.dataset.pin), t = n && noteEl(n.id), r = visRect(t);
      if (!r) { p.style.display = 'none'; continue; }
      p.style.display = 'grid'; p.style.left = Math.min(Math.max(2, r.l - 7), innerWidth - 20) + 'px'; p.style.top = Math.min(Math.max(2, r.t - 7), innerHeight - 20) + 'px';
    }
    const sig = S.ops.map((o) => status[o.id]).join('') + S.notes.map((n) => (noteEl(n.id) ? 1 : 0)).join('');
    const busy = root.activeElement && el$.body.contains(root.activeElement) && root.activeElement.id !== 'noteIn';
    if (sig !== lastSig && !busy) { lastSig = sig; if (tab === 'changes' || (tab === 'inspect' && sel)) renderBody(); }
    requestAnimationFrame(frame);
  }

  /* ───────────────────────── lifecycle ───────────────────────── */
  function setOn(v) {
    on = !!v; if (!on) { endTextEdit(false); drag = null; }
    syncChrome(); if (on) { renderBody(); renderPins(); renderCtx(); renderChat(); if (!looping) { looping = true; requestAnimationFrame(frame); } }
  }
  let pending = false;
  mo = new MutationObserver(() => {
    if (applying || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (S.ops.length || S.notes.length) { reconcile(); } });
  });

  /** S for the current PAGE: localStorage first, then the server copy if it is newer. */
  async function loadState() {
    const local = tryJSON(lsGet(KEY)); S = local && local.v === 1 ? Object.assign(blank(), local) : blank();
    if (!serverOK) return;
    try { const remote = await api('state?page=' + encodeURIComponent(PAGE)); if (remote && remote.v === 1 && (remote.updated || 0) > (S.updated || 0)) { S = Object.assign(blank(), remote); lsSet(KEY, JSON.stringify(S)); } } catch { /* offline */ }
  }
  /** Single-page app changed its path: save this page, take its changes off, load the new page's. */
  // ponytail: edits made in the few ms while the new page's server copy loads are lost; a per-load token would fix it if that ever bites.
  async function onRoute() {
    if (location.pathname === PAGE) return;
    clearTimeout(saveTimer); pushServer(); // builds its request from the old PAGE and S before the first await
    withApply(() => {
      [...S.ops].reverse().forEach(revertOp);
      S.notes.forEach((n) => { const e = noteEl(n.id); if (e) delTok(e, 'data-eh-note', n.id); });
    });
    PAGE = location.pathname; KEY = 'eh:v1:' + location.origin + PAGE;
    Object.keys(status).forEach((k) => delete status[k]);
    await loadState();
    writeRules(); select(null); reconcile(); syncChrome(); refresh();
  }
  async function boot() {
    document.documentElement.appendChild(host);
    if (host.showPopover) { try { host.showPopover(); } catch { /* ignore */ } }
    const style = document.createElement('style'); style.setAttribute('data-eh-style', '');
    style.textContent = '[data-eh-hidden]{display:none!important}\n' + KIT_CSS;
    names = tryJSON(lsGet(NAMES_KEY)) || {};
    document.head.appendChild(style);

    if (CFG.server != null) { try { const ping = await api('ping'); serverOK = !!(ping && ping.ok); chatOn = serverOK && !!ping.claude; } catch { serverOK = false; } }
    await loadState();
    ['pushState', 'replaceState'].forEach((m) => { const f = history[m]; history[m] = function (...a) { const r = f.apply(this, a); setTimeout(onRoute, 0); return r; }; });
    window.addEventListener('popstate', onRoute);
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    reconcile(); if (S.look) applyLook(S.look);
    const was = ssGet('eh:on'); if (was) { mode = was === 'interact' ? 'interact' : 'edit'; }
    syncChrome(); renderPins();
    setOn(!!was);
    // pages render late: retry a few times so replay catches the first paint
    [250, 800, 2000].forEach((ms) => setTimeout(() => (S.ops.length || S.notes.length) && reconcile(), ms));
  }

  window.__EH__ = {
    toggle: () => setOn(!on), on: () => setOn(true), off: () => setOn(false),
    state: () => S, handoff: buildHandoff, reconcile,
    context: chatContext, select, version: '0.1.0',
  };
  window.EH = window.EH || window.__EH__;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
