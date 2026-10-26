import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../dist/generator/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/generator/schema.sql', import.meta.url), new URL('../dist/generator/schema.sql', import.meta.url));
mkdirSync(new URL('../dist/resources/', import.meta.url), { recursive: true });
for (const name of ['glossary', 'data-guide', 'anomaly-criteria']) {
  copyFileSync(new URL('../resources/' + name + '.md', import.meta.url), new URL('../dist/resources/' + name + '.md', import.meta.url));
}
mkdirSync(new URL('../dist/eval/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/eval/review-sheet.html', import.meta.url), new URL('../dist/eval/review-sheet.html', import.meta.url));
mkdirSync(new URL('../dist/server/ui/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/server/ui/issue-preview.html', import.meta.url), new URL('../dist/server/ui/issue-preview.html', import.meta.url));
