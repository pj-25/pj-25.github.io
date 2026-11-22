import { defineConfig } from 'astro/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Wrap every built <table> in a keyboard-focusable, labelled scroll region (WCAG 2.1.1, 1.4.10; A11Y-3, A11Y-6).
// The wrapper scrolls, not the table, so the table keeps its semantics (display:block on <table> drops them in
// Safari/VoiceOver). Build-time because Astro 7's default Markdown processor no longer runs rehype plugins.
function tableScroll() {
  const walk = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true }))
    .map((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])))).flat();
  return {
    name: 'pj-table-scroll',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        for (const f of (await walk(fileURLToPath(dir))).filter((p) => p.endsWith('.html'))) {
          const html = await readFile(f, 'utf8');
          if (!html.includes('<table')) continue;
          const out = html.replace(/<table\b[\s\S]*?<\/table>/g,
            (t) => `<div class="table-scroll" tabindex="0" role="region" aria-label="Table (scrolls sideways on small screens)">${t}</div>`);
          await writeFile(f, out);
        }
      },
    },
  };
}

// TODO(domain): set `site` once the domain is chosen (own domain or https://pj-25.github.io).
export default defineConfig({ site: 'https://pj-25.github.io', integrations: [tableScroll()] });
