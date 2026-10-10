// DUWOP boot (@duwop/boot). Puts the saved look on <html> before the page paints, so there's no flash of
// the wrong theme. Must load as a plain blocking script in <head> (not type="module", not async/defer).
//   Vite:  <script src="/duwop-boot.js" data-key="duwop-look"></script> in index.html
//   Astro: <DuwopBoot /> in the layout's <head> (it adds this script with the app's config)
// data-key is the app's storageKey; data-default (optional) is the look for first-time visitors.
// It reads the copy lib/theme.ts applyLook saves, which already carries everything needed to paint.
(() => {
  const me = document.currentScript;
  try {
    const key = (me && me.dataset.key) || "duwop-look";
    const look = JSON.parse(localStorage.getItem(key) || (me && me.dataset.default) || "null");
    if (!look || !look.theme) return;
    const html = document.documentElement;
    html.dataset.theme = look.theme;
    html.dataset.fx = (look.effects || []).join(" ");
    html.classList.toggle("dark", look.dark !== false);
    html.toggleAttribute("data-amoled", !!look.amoled);
    if (look.family !== undefined) html.style.setProperty("--app-font", look.family ? `"${look.family}"` : "system-ui");
    if (look.adjust) html.style.setProperty("--app-font-adjust", String(look.adjust));
    for (const [k, v] of Object.entries(look.vars || {})) html.style.setProperty(k, v);
    if (look.url) {
      const link = document.createElement("link");
      link.id = "app-font";
      link.rel = "stylesheet";
      link.href = look.url;
      document.head.append(link);
    }
  } catch {
    // Storage blocked or bad JSON: the app applies its default once it loads.
  }
})();
