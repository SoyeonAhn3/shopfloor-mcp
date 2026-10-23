import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../dist/generator/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/generator/schema.sql', import.meta.url), new URL('../dist/generator/schema.sql', import.meta.url));
mkdirSync(new URL('../dist/resources/', import.meta.url), { recursive: true });
for (const name of ['glossary', 'data-guide', 'anomaly-criteria']) {
  copyFileSync(new URL('../resources/' + name + '.md', import.meta.url), new URL('../dist/resources/' + name + '.md', import.meta.url));
}
