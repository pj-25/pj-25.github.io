// Real-browser verification of the built site (design-intent VER-2, VER-3, ENG-4).
// Usage: node scripts/verify-ui.mjs [--shots DIR] [--compare BASE_DIR] [--json FILE]
// Also records CLS per route (SPEC-004 R6, pass <= 0.05), every request host, and the serif face's load state.
// Needs a local Chrome (playwright-core, channel "chrome"); serves dist/ itself; no network.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const shots = opt('--shots'); const base = opt('--compare');
const DIST = 'dist';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(DIST);
const routes = files.filter((f) => f.endsWith('index.html')).map((f) => '/' + relative(DIST, f).replace(/index\.html$/, '')).sort();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const report = { routes, axe: [], reflow: [], keyboard: [], scripts: 0, cssGzipBytes: 0, shots: 0, shotDiffs: [], cls: [], hosts: {}, requests: [], fonts: [] };
const CLS_MAX = 0.05;
report.scripts = files.filter((f) => f.endsWith('.html')).reduce((n, f) => n + (readFileSync(f, 'utf8').match(/<script\b/g) ?? []).length, 0);
// CSS budget (ENG-4): per page, inline <style> blocks + linked .css files, gzipped; report the largest page.
const cssOf = (f) => { const h = readFileSync(f, 'utf8');
  const inline = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
  const linked = [...h.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => readFileSync(join(DIST, m[1]), 'utf8')).join('');
  return gzipSync(inline + linked).length; };
report.cssGzipBytes = Math.max(...files.filter((f) => f.endsWith('.html')).map(cssOf));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const scheme of ['light', 'dark']) {
    for (const width of [375, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      // SPEC-004 R6: CLS = sum of layout-shift values without recent input (buffered, so it covers the whole load).
      await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      page.on('request', (rq) => { const u = new URL(rq.url()); const h = u.protocol.startsWith('http') ? u.host.replace(/:\d+$/, '') : u.protocol; report.hosts[h] = (report.hosts[h] ?? 0) + 1; if (report.requests.length < 2000) report.requests.push(`${scheme} ${width} ${rq.resourceType()} ${u.protocol}//${u.host.replace(/:\d+$/, ':PORT')}${u.pathname}`); });
      for (const r of routes) {
        await page.goto(origin + r, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150);
        report.cls.push({ route: r, scheme, width, cls: +(await page.evaluate(() => window.__cls)).toFixed(4) });
        if (width === 1280 && scheme === 'light' && /^\/(projects\/jsc-gameholic\/)?$/.test(r)) report.fonts.push({ route: r, ...(await page.evaluate(() => ({ serifLoaded: [...document.fonts].some((f) => f.family.includes('Source Serif 4') && !f.family.includes('Fallback') && f.status === 'loaded'), h1Family: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0] }))) });
        if (shots) {
          const name = `${scheme}-${width}${r.replace(/\//g, '_') || '_'}.png`;
          mkdirSync(shots, { recursive: true });
          const buf = await page.screenshot({ fullPage: true, path: join(shots, name) });
          report.shots++;
          if (base) { const b = join(base, name); if (!existsSync(b) || !readFileSync(b).equals(buf)) report.shotDiffs.push(name); }
        }
        // axe at every width: overflow-dependent rules (e.g. scrollable-region-focusable) only fire on narrow screens.
        await page.addScriptTag({ content: axeSource });
        const res = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
          .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));
        report.axe.push({ route: `${r} @${width}`, scheme, violations: res });
        // A11Y-6 reflow: the page itself must never scroll horizontally.
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 0) report.reflow.push(`${r} @${width} ${scheme}: +${over}px`);
        if (width === 1280) {
          if (scheme === 'light') {
            // Keyboard: first Tab target, skip-link activation, focus ring on every focusable element.
            await page.goto(origin + r, { waitUntil: 'load' });
            await page.keyboard.press('Tab');
            const first = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href') }));
            let skipLands = null;
            if (first.href === '#content') { await page.keyboard.press('Enter'); skipLands = await page.evaluate(() => document.activeElement?.id || location.hash); }
            const n = await page.evaluate(() => document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length);
            const noRing = [];
            await page.goto(origin + r, { waitUntil: 'load' });
            for (let i = 0; i < n; i++) {
              await page.keyboard.press('Tab');
              const s = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e);
                return { tag: e.tagName, text: (e.textContent || '').trim().slice(0, 30), w: parseFloat(cs.outlineWidth), st: cs.outlineStyle }; });
              if (!(s.st !== 'none' && s.w >= 2)) noRing.push(`${s.tag}:${s.text}`);
            }
            report.keyboard.push({ route: r, firstTab: first, skipLands, focusables: n, withoutRing: noRing });
          }
        }
      }
      await ctx.close();
    }
  }
} finally { await browser.close(); server.close(); }

const serious = report.axe.flatMap((a) => a.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${a.route} ${a.scheme} ${v.id} (${v.nodes})`));
const summary = {
  routes: routes.length, shots: report.shots, shotDiffs: report.shotDiffs,
  axeSeriousOrCritical: serious, axeAll: [...new Set(report.axe.flatMap((a) => a.violations.map((v) => `${v.id}:${v.impact}`)))],
  horizontalOverflow: report.reflow,
  skipLinkFirstOnAllRoutes: report.keyboard.every((k) => k.firstTab.href === '#content'),
  skipLinkLandsOnContent: report.keyboard.every((k) => k.skipLands === 'content'),
  elementsWithoutFocusRing: report.keyboard.reduce((n, k) => n + k.withoutRing.length, 0),
  clsMax: Object.fromEntries([375, 1280].map((w) => [w, Math.max(...report.cls.filter((c) => c.width === w).map((c) => c.cls))])),
  clsOverBudget: report.cls.filter((c) => c.cls > CLS_MAX).map((c) => `${c.route} ${c.scheme} ${c.width}: ${c.cls}`),
  requestHosts: report.hosts, thirdPartyRequests: Object.keys(report.hosts).filter((h) => h !== '127.0.0.1'),
  serifFace: report.fonts,
  scriptTags: report.scripts, cssGzipBytes: report.cssGzipBytes,
};
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ summary, report }, null, 2));
console.log(JSON.stringify(summary, null, 2));
