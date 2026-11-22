import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDesign } from './check-design.mjs';

test('the site source passes the design rules', () => assert.deepEqual(checkDesign('src'), []));
test('a raw colour and a literal font size are both reported', () => {
  const d = mkdtempSync(join(tmpdir(), 'pj-site-'));
  writeFileSync(join(d, 'x.css'), 'a{color:#fff;font-size:14px}');
  const p = checkDesign(d);
  assert.equal(p.length, 2);
});
