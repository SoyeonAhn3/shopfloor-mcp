// Local check only: serves site/ on 127.0.0.1 (pages fetch JSON, so file:// does not work).
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 4173);
createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
  const type = types[extname(file)];
  if (!file.startsWith(root) || file.startsWith(resolve(root, 'src') + sep) || !type) return response.writeHead(404).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Replay page: http://127.0.0.1:${port}/`));
