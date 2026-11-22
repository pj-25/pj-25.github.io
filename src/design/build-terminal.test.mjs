// node --test (SPEC-003 R3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTerminal, gates, ghostty } from './build-terminal.mjs';

const read = (n) => JSON.parse(readFileSync(new URL(`./tokens/${n}`, import.meta.url), 'utf8'));
const real = () => buildTerminal(read('base.tokens.json'), read('terminal.tokens.json'));

test('real palettes pass every contrast gate in both themes', () => {
  const { checks } = real();
  assert.equal(checks.filter((c) => !c.ok).length, 0);
  assert.equal(checks.length, 33);
});

test('ghostty theme has 16 palette entries and the core keys', () => {
  const t = real().files['ghostty/pj-light'];
  assert.equal((t.match(/^palette = \d+=#[0-9a-f]{6}$/gm) ?? []).length, 16);
  for (const k of ['background', 'foreground', 'cursor-color', 'selection-background']) assert.match(t, new RegExp(`^${k} = #[0-9a-f]{6}$`, 'm'));
  assert.match(t, /^background = #fbfaf7$/m);                 // paper, from base tokens
  assert.match(real().files['ghostty/pj-dark'], /^background = #121314$/m);
});

test('neovim colorscheme carries both palettes and picks by background', () => {
  const lua = real().files['nvim/colors/pj.lua'];
  assert.match(lua, /light = \{ bg = "#fbfaf7"/);
  assert.match(lua, /dark = \{ bg = "#121314"/);
  assert.match(lua, /palettes\[vim\.o\.background\]/);
  assert.equal((lua.match(/vim\.g\.terminal_color_\d+/g) ?? []).length, 16);
});

test('a low-contrast ANSI colour fails its gate', () => {
  const p = { bg: '#ffffff', fg: '#000000', comment: '#000000', ansi: Array(16).fill('#000000') };
  p.ansi[3] = '#f0e68c'; // khaki on white ≈ 1.2
  const bad = gates(p, 'light').filter((c) => !c.ok);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].name, 'ansi 3');
});

test('ghostty serialisation is stable', () => {
  const p = { bg: '#000000', fg: '#ffffff', cursor: '#111111', selBg: '#222222', selFg: '#ffffff', ansi: Array(16).fill('#333333') };
  assert.equal(ghostty(p).split('\n').filter(Boolean).length, 1 + 16 + 6);
});
