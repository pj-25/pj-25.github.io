// node --test src/design/  (SPEC-001 R11)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contrast, build, resolve, flatten, merge, toCss, cssVar, colorHex, lintRawColours, lintFontSizes } from './build-tokens.mjs';

const col = (hex) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hex } });
const pair = (ref, on, min) => ({ $type: 'color', $value: `{${ref}}`, $extensions: { 'io.github.pj-25': { contrast: { on, min } } } });

test('contrast matches WCAG reference values', () => {
  assert.equal(+contrast('#000000', '#ffffff').toFixed(2), 21);
  assert.equal(+contrast('#767676', '#ffffff').toFixed(2), 4.54); // the classic AA threshold grey
  assert.equal(contrast('#ffffff', '#000000'), contrast('#000000', '#ffffff')); // order-independent
  assert.equal(+contrast('#777777', '#777777').toFixed(2), 1);
});

test('aliases resolve through chains; unknown refs and cycles fail clearly', () => {
  const t = flatten({ a: col('#112233'), b: { $value: '{a}' }, c: { $value: '{b}' }, x: { $value: '{y}' }, y: { $value: '{x}' }, z: { $value: '{nope}' } });
  assert.equal(resolve(t, 'c').value.hex, '#112233');
  assert.throws(() => resolve(t, 'x'), /Reference cycle: x → y → x/);
  assert.throws(() => resolve(t, 'z'), /Unknown reference \{nope\}/);
});

test('theme override keeps base $extensions and changes only $value', () => {
  const m = merge({ c: { t: pair('a', ['bg'], 4.5) } }, { c: { t: { $value: '{b}' } } });
  assert.equal(m.c.t.$value, '{b}');
  assert.ok(m.c.t.$extensions['io.github.pj-25'].contrast);
});

test('a failing contrast pair is reported, in the theme where it fails', () => {
  const base = { ref: { ink: col('#111111'), grey: col('#999999'), paper: col('#ffffff'), night: col('#000000') },
    color: { bg: { $type: 'color', $value: '{ref.paper}' }, fg: pair('ref.ink', ['color.bg'], 4.5) } };
  const ok = build(base, { dark: { color: { bg: { $value: '{ref.night}' }, fg: { $value: '{ref.paper}' } } } });
  assert.deepEqual(ok.errors, []);
  const bad = build(base, { dark: { color: { bg: { $value: '{ref.night}' }, fg: { $value: '{ref.ink}' } } } });
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /^contrast dark: color.fg on color.bg = 1\.\d+ < 4\.5$/);
});

test('reference tier is not emitted; dark block and reduced motion are', () => {
  const base = { ref: { a: col('#ffffff'), b: col('#000000') }, color: { bg: { $type: 'color', $value: '{ref.a}' } },
    motion: { duration: { fast: { $type: 'duration', $value: { value: 120, unit: 'ms' } } } } };
  const { css } = build(base, { dark: { color: { bg: { $value: '{ref.b}' } } } });
  assert.doesNotMatch(css, /--pj-ref-/);
  assert.match(css, /:root \{\n  color-scheme: light;\n  --pj-color-bg: #ffffff;/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \{\n    color-scheme: dark;\n    --pj-color-bg: #000000;/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\n  :root \{\n    --pj-motion-duration-fast: 0ms;/);
});

test('value serialisation follows DTCG 2025.10 shapes', () => {
  assert.equal(toCss('dimension', { value: 0.25, unit: 'rem' }), '0.25rem');
  assert.equal(toCss('duration', { value: 200, unit: 'ms' }), '200ms');
  assert.equal(toCss('fontFamily', ['system-ui', 'Segoe UI']), 'system-ui, "Segoe UI"');
  assert.equal(toCss('cubicBezier', [0.2, 0, 0, 1]), 'cubic-bezier(0.2, 0, 0, 1)');
  assert.equal(cssVar('size.focusWidth'), '--pj-size-focus-width');
  assert.throws(() => colorHex({ colorSpace: 'srgb', components: [1, 0, 0], hex: '#00ff00' }), /disagrees/);
});

test('raw-colour lint finds literals in CSS and Astro style contexts only', () => {
  const d = mkdtempSync(join(tmpdir(), 'pj-lint-')); mkdirSync(join(d, 'x'));
  writeFileSync(join(d, 'a.css'), 'a{color:#fff;background:var(--pj-color-bg)}');
  writeFileSync(join(d, 'x', 'b.astro'), '<a href="#add">x</a><p style="color:rgb(0 0 0)">y</p>');
  writeFileSync(join(d, 'gen.css'), ':root{--x:#000}');
  const found = lintRawColours(d, join(d, 'gen.css'));
  assert.equal(found.length, 2);
  assert.ok(found.some((f) => f.endsWith('a.css: #fff')));
  assert.ok(found.some((f) => f.endsWith('b.astro: rgb(')));
});

test('fontWeight and number serialise; a bad weight is rejected', () => {
  assert.equal(toCss('fontWeight', 600), '600');
  assert.equal(toCss('number', 1.65), '1.65');
  assert.throws(() => toCss('fontWeight', 'bold'), /fontWeight must be a number/);
  assert.equal(cssVar('font.lineHeight.body'), '--pj-font-line-height-body');
});

test('working-surface switch remaps the display family to the text family (SPEC-004 R5)', () => {
  const ff = (v) => ({ $type: 'fontFamily', $value: v });
  const { css } = build({ font: { family: { display: ff(['Source Serif 4', 'serif']), text: ff(['system-ui']) } } });
  assert.match(css, /--pj-font-family-display: "Source Serif 4", serif;/);
  assert.match(css, /\[data-surface="working"\] \{\n  --pj-font-family-display: var\(--pj-font-family-text\);\n\}/);
  assert.doesNotMatch(build({ font: { family: { text: ff(['system-ui']) } } }).css, /data-surface/);
});

test('font-size lint flags literal sizes in CSS, Astro style blocks and the font shorthand; allows tokens', () => {
  const d = mkdtempSync(join(tmpdir(), 'pj-fs-')); mkdirSync(join(d, 'x'));
  writeFileSync(join(d, 'a.css'), 'a{font-size:1rem}b{font-size:var(--pj-font-size-body)}c{font:17px/1.65 var(--pj-font-family-text)}d{font-size:inherit;line-height:1.2;font-family:x}e{font-size: .8em}');
  writeFileSync(join(d, 'x', 'b.astro'), '<p style="font-size:12px">y</p><style>.q{font-size:large}.r{font-size:var(--pj-font-size-meta)}</style><div class="font-size:9px"></div>');
  writeFileSync(join(d, 'gen.css'), ':root{--pj-font-size-body:1.0625rem}');
  const found = lintFontSizes(d, join(d, 'gen.css'));
  assert.equal(found.length, 5, found.join('\n'));
  assert.ok(found.some((f) => f.endsWith('a.css: font-size: 1rem')));
  assert.ok(found.some((f) => f.endsWith('a.css: font: 17px/1.65 var(--pj-font-family-text)')));
  assert.ok(found.some((f) => f.endsWith('b.astro: font-size: 12px')));
  assert.ok(found.some((f) => f.endsWith('b.astro: font-size: large')));
  assert.ok(!found.some((f) => f.includes('var(--pj-font-size')));
});
