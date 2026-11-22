// node --test src/components/evidence.test.mjs  (SPEC-002 R2, R5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceModel } from './evidence.mjs';
import { audit } from '../../scripts/audit-evidence.mjs';

test('verified without href is a build error', () => {
  assert.throws(() => evidenceModel({ kind: 'verified' }), /requires an href/);
  assert.throws(() => evidenceModel({ kind: 'verified', label: 'Source' }), /requires an href/);
});
test('described/in-progress must not carry an href; unknown kinds fail', () => {
  assert.throws(() => evidenceModel({ kind: 'described', href: 'https://github.com/x' }), /must not carry an href/);
  assert.throws(() => evidenceModel({ kind: 'planned' }), /unknown kind/);
});
test('the three kinds produce their text', () => {
  assert.equal(evidenceModel({ kind: 'verified', href: 'https://github.com/x' }).text, 'Verified · source');
  assert.equal(evidenceModel({ kind: 'verified', href: 'https://github.com/x', label: 'Source' }).text, 'Verified · Source');
  assert.equal(evidenceModel({ kind: 'described' }).text, 'Described, not shown');
  assert.equal(evidenceModel({ kind: 'in-progress' }).text, 'In progress');
});

const mark = (kind, inner) => `<span class="meta">2021 · <span class="evidence evidence--${kind} astro-x"><svg aria-hidden="true"><circle/></svg>${inner}</span></span>`;
test('audit accepts allowed hosts and counts kinds', () => {
  const html = mark('verified', '<a href="https://github.com/pj-25/a" rel="noopener">Verified · Source</a>') + mark('described', '<span>Described, not shown</span>');
  const r = audit(html);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.counts, { verified: 1, described: 1, 'in-progress': 0 });
});
test('audit rejects missing link, extra link, http, and foreign host', () => {
  assert.match(audit(mark('verified', '<span>Verified · source</span>')).problems[0], /0 links/);
  assert.match(audit(mark('verified', '<a href="https://github.com/a">x</a><a href="https://github.com/b">y</a>')).problems[0], /2 links/);
  assert.match(audit(mark('verified', '<a href="http://github.com/a">x</a>')).problems[0], /not https/);
  assert.match(audit(mark('verified', '<a href="https://example.com/a">x</a>')).problems[0], /not allowed/);
  assert.match(audit(mark('described', '<a href="https://github.com/a">x</a>')).problems[0], /must not link/);
});
