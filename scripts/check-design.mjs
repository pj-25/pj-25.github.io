// Design-system rules for this site's own source (ENG-2, SPEC-004 R4): no raw colours, no literal font sizes.
// Tokens, contrast gates and generators live in pj-design-system (https://github.com/pj-25/design-system).
import { lintRawColours, lintFontSizes } from 'pj-design-system/lib';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function checkDesign(srcDir = 'src') {
  const problems = [
    ...lintRawColours(srcDir).map((l) => `raw colour (ENG-2): ${l}`),
    ...lintFontSizes(srcDir).map((l) => `literal font size (use --pj-font-size-*): ${l}`),
  ];
  const css = createRequire(import.meta.url).resolve('pj-design-system/tokens.css');
  if (!existsSync(css)) problems.push('pj-design-system/tokens.css not found: run npm ci');
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = checkDesign();
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  console.log('✓ design: tokens from pj-design-system, no raw colours, no literal font sizes');
}
