// Design tokens → CSS custom properties, with WCAG contrast, raw-colour lint (SPEC-001) and font-size lint (SPEC-004).
// Source: DTCG 2025.10 JSON in ./tokens. Node built-ins only.
// Usage: node src/design/build-tokens.mjs           write tokens.css (fails on errors)
//        node src/design/build-tokens.mjs --check   fail if tokens.css is stale, a contrast pair fails, or src/ has raw colours or literal font sizes
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREFIX = 'pj';
const EXT = 'io.github.pj-25';
const ALIAS = /^\{([^{}]+)\}$/;

export const isToken = (o) => o !== null && typeof o === 'object' && '$value' in o;

/** Deep-merge `over` into a copy of `base` (theme files override $value, keep $description/$extensions). */
export function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : structuredClone(v);
  }
  return out;
}

/** Flatten a DTCG tree into Map<path, token>. Group-level $type is inherited. */
export function flatten(tree, prefix = [], inherited) {
  const map = new Map();
  const type = tree.$type ?? inherited;
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$') || v === null || typeof v !== 'object') continue;
    const path = [...prefix, k];
    if (isToken(v)) map.set(path.join('.'), { ...v, $type: v.$type ?? type });
    else for (const [p, t] of flatten(v, path, type)) map.set(p, t);
  }
  return map;
}

/** Resolve a token's value, following aliases. Throws on unknown references and cycles. */
export function resolve(tokens, path, stack = []) {
  if (stack.includes(path)) throw new Error(`Reference cycle: ${[...stack, path].join(' → ')}`);
  const t = tokens.get(path);
  if (!t) throw new Error(`Unknown reference {${path}}${stack.length ? ` (from ${stack.at(-1)})` : ''}`);
  const m = typeof t.$value === 'string' && t.$value.match(ALIAS);
  return m ? resolve(tokens, m[1], [...stack, path]) : { type: t.$type ?? tokens.get(m?.[1])?.$type, value: t.$value };
}

const hex2 = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
export function colorHex(v) {
  if (v.colorSpace !== 'srgb') throw new Error(`Only srgb is supported in v0, got ${v.colorSpace}`);
  const fromComponents = '#' + v.components.map(hex2).join('');
  if (v.hex && v.hex.toLowerCase() !== fromComponents) throw new Error(`hex ${v.hex} disagrees with components (${fromComponents})`);
  return v.hex?.toLowerCase() ?? fromComponents;
}

export function toCss(type, value) {
  switch (type) {
    case 'color': { const h = colorHex(value); const a = value.alpha ?? 1;
      return a === 1 ? h : `rgb(${value.components.map((c) => Math.round(c * 255)).join(' ')} / ${a})`; }
    case 'dimension': case 'duration': return `${value.value}${value.unit}`;
    case 'fontFamily': return (Array.isArray(value) ? value : [value]).map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ');
    case 'cubicBezier': return `cubic-bezier(${value.join(', ')})`;
    case 'number': return String(value);
    case 'fontWeight': if (typeof value !== 'number' || value < 1 || value > 1000) throw new Error(`fontWeight must be a number 1-1000, got ${JSON.stringify(value)}`); return String(value);
    default: throw new Error(`Unsupported $type ${type}`);
  }
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a, b) {
  const lum = (h) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
export const cssVar = (path) => `--${PREFIX}-${path.split('.').map(kebab).join('-')}`;

/** Build CSS and run contrast checks for the base theme and each override theme. */
export function build(baseTree, themes = {}) {
  const errors = []; const checks = [];
  const sets = { light: flatten(baseTree), ...Object.fromEntries(Object.entries(themes).map(([n, t]) => [n, flatten(merge(baseTree, t))])) };
  const emit = (tokens, filter) => {
    const lines = [];
    for (const path of tokens.keys()) {
      if (path.startsWith('ref.') || !filter(path)) continue; // reference tier is never emitted (TOK-2)
      try { const r = resolve(tokens, path); lines.push(`  ${cssVar(path)}: ${toCss(r.type, r.value)};`); }
      catch (e) { errors.push(`${path}: ${e.message}`); }
    }
    return lines.join('\n');
  };
  for (const [theme, tokens] of Object.entries(sets)) {
    for (const [path, t] of tokens) {
      const c = t.$extensions?.[EXT]?.contrast; if (!c) continue;
      for (const on of c.on) {
        try {
          const fg = colorHex(resolve(tokens, path).value); const bg = colorHex(resolve(tokens, on).value);
          const ratio = contrast(fg, bg); const ok = ratio >= c.min;
          checks.push({ theme, fg: path, bg: on, ratio: +ratio.toFixed(2), min: c.min, ok });
          if (!ok) errors.push(`contrast ${theme}: ${path} on ${on} = ${ratio.toFixed(2)} < ${c.min}`);
        } catch (e) { errors.push(`contrast ${theme}: ${path} on ${on}: ${e.message}`); }
      }
    }
  }
  const light = sets.light;
  const motion = [...light.keys()].filter((p) => p.startsWith('motion.duration.'));
  let css = `/* GENERATED by src/design/build-tokens.mjs from src/design/tokens/*.tokens.json. Do not edit. */\n`;
  css += `:root {\n  color-scheme: light;\n${emit(light, () => true)}\n}\n`;
  for (const [theme, tokens] of Object.entries(sets)) {
    if (theme === 'light') continue;
    const body = `  color-scheme: ${theme};\n${emit(tokens, (p) => p.startsWith('color.'))}`;
    css += `@media (prefers-color-scheme: ${theme}) {\n  :root:not([data-theme="light"]) {\n${body.replace(/^/gm, '  ')}\n  }\n}\n`;
    css += `:root[data-theme="${theme}"] {\n${body}\n}\n`;
  }
  // IDN-5: working surfaces (workbench) use no serif; the display role falls back to the text family.
  if (light.has('font.family.display') && light.has('font.family.text'))
    css += `[data-surface="working"] {\n  ${cssVar('font.family.display')}: var(${cssVar('font.family.text')});\n}\n`;
  if (motion.length) css += `@media (prefers-reduced-motion: reduce) {\n  :root {\n${motion.map((p) => `    ${cssVar(p)}: 0ms;`).join('\n')}\n  }\n}\n`;
  return { css, errors, checks };
}

/** ENG-2 (colours only in v0): no raw colour literals in .css/.astro under src/, except the generated file. */
export function lintRawColours(srcDir, generated) {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const raw = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
  const found = [];
  for (const f of walk(srcDir)) {
    if (f === generated || !/\.(css|astro)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    // In .astro, only CSS contexts: <style> blocks and style="" attributes.
    const css = f.endsWith('.css') ? [text] : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|style="([^"]*)"/g)].map((m) => m[1] ?? m[2]);
    for (const chunk of css) for (const m of chunk.matchAll(raw)) found.push(`${relative(process.cwd(), f)}: ${m[0]}`);
  }
  return found;
}

/** ENG-2 / SPEC-004 R4: font sizes come from --pj-font-size-* role tokens. Flags literal lengths in `font-size` and in the `font` shorthand. */
export function lintFontSizes(srcDir, generated) {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const LEN = /(?<![\w-])\d*\.?\d+(?:px|rem|em|pt|%|ex|ch|vw|vh)\b|(?<![\w-])(?:xx?-small|x{1,2}-large|xxx-large|small|medium|large|larger|smaller)\b/;
  const decl = /(?:^|[;{\s])(font-size|font)\s*:\s*([^;}"]*)/g;
  const found = [];
  for (const f of walk(srcDir)) {
    if (f === generated || !/\.(css|astro)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    const css = f.endsWith('.css') ? [text] : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|style="([^"]*)"/g)].map((m) => m[1] ?? m[2]);
    for (const chunk of css) for (const m of chunk.matchAll(decl)) {
      const value = m[2].replace(/var\([^)]*\)/g, ''); // tokens are fine; look at what is left
      if (LEN.test(value)) found.push(`${relative(process.cwd(), f)}: ${m[1]}: ${m[2].trim()}`);
    }
  }
  return found;
}

function main() {
  const check = process.argv.includes('--check');
  const read = (n) => JSON.parse(readFileSync(join(HERE, 'tokens', n), 'utf8'));
  const { css, errors, checks } = build(read('base.tokens.json'), { dark: read('dark.tokens.json') });
  const out = join(HERE, 'tokens.css');
  const lint = lintRawColours(join(HERE, '..'), out);
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.theme.padEnd(5)} ${c.fg} on ${c.bg}: ${c.ratio} (min ${c.min})`);
  const sizes = lintFontSizes(join(HERE, '..'), out);
  const problems = [...errors, ...lint.map((l) => `raw colour (ENG-2): ${l}`), ...sizes.map((l) => `literal font size (use --pj-font-size-*): ${l}`)];
  if (check && (!existsSync(out) || readFileSync(out, 'utf8') !== css)) problems.push('tokens.css is stale: run `npm run tokens`');
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  if (!check) writeFileSync(out, css);
  console.log(check ? '✓ tokens: up to date, contrast ok, no raw colours, no literal font sizes' : `✓ wrote ${relative(process.cwd(), out)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
