// Evidence audit over the built site (SPEC-002 R5, J-02, OUT-2).
// Usage: node scripts/audit-evidence.mjs [--dir dist] [--online]
// Every verified mark must contain exactly one https:// link on an allowed host. Exit 1 on any violation.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ALLOWED_HOSTS = ['github.com', 'www.npmjs.com', 'the-odyssey-experience.vercel.app', 'pj-25.github.io'];
const KINDS = ['verified', 'described', 'in-progress'];

/** Extract evidence marks from one HTML string. Marks never nest, so a lazy match up to </span></span> is safe. */
export function marks(html) {
  const out = [];
  for (const m of html.matchAll(/<span class="[^"]*\bevidence evidence--([a-z-]+)[^"]*"[^>]*>([\s\S]*?)<\/svg>([\s\S]*?)<\/span>(?:<\/span>)?/g)) {
    out.push({ kind: m[1], body: m[3] });
  }
  return out;
}

/** Violations for the marks in one file's HTML. */
export function audit(html, file = '') {
  const problems = []; const counts = Object.fromEntries(KINDS.map((k) => [k, 0])); const urls = [];
  for (const { kind, body } of marks(html)) {
    if (!KINDS.includes(kind)) { problems.push(`${file}: unknown mark kind "${kind}"`); continue; }
    counts[kind]++;
    const hrefs = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
    if (kind !== 'verified') { if (hrefs.length) problems.push(`${file}: ${kind} mark must not link`); continue; }
    if (hrefs.length !== 1) { problems.push(`${file}: verified mark has ${hrefs.length} links (need exactly 1)`); continue; }
    let u; try { u = new URL(hrefs[0]); } catch { problems.push(`${file}: verified link "${hrefs[0]}" is not a valid URL`); continue; }
    if (u.protocol !== 'https:') problems.push(`${file}: verified link ${hrefs[0]} is not https`);
    else if (!ALLOWED_HOSTS.includes(u.hostname)) problems.push(`${file}: verified link host ${u.hostname} is not allowed`);
    else urls.push(hrefs[0]);
  }
  return { problems, counts, urls };
}

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

async function main() {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'dist';
  if (!existsSync(dir)) { console.error(`✗ ${dir}/ not found: run \`npm run build\` first`); process.exit(1); }
  const total = { verified: 0, described: 0, 'in-progress': 0 }; const problems = []; const urls = new Set();
  for (const f of walk(dir).filter((p) => p.endsWith('.html'))) {
    const r = audit(readFileSync(f, 'utf8'), relative(process.cwd(), f));
    problems.push(...r.problems); r.urls.forEach((u) => urls.add(u));
    for (const k of KINDS) total[k] += r.counts[k];
  }
  console.log(`marks: verified ${total.verified}, described ${total.described}, in-progress ${total['in-progress']}`);
  if (args.includes('--online')) {
    for (const u of urls) {
      try { const res = await fetch(u, { method: 'HEAD', redirect: 'follow' }); if (!res.ok) problems.push(`online: ${u} → HTTP ${res.status}`); else console.log(`ok   ${res.status} ${u}`); }
      catch (e) { problems.push(`online: ${u} → ${e.message}`); }
    }
  }
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  console.log('✓ evidence audit passed');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
