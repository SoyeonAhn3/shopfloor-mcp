import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../dist/generator/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/generator/schema.sql', import.meta.url), new URL('../dist/generator/schema.sql', import.meta.url));
