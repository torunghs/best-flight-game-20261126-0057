// SAYAP NUSANTARA: a tiny static server for game/ (Node 22, standard
// library only), so the entry can be played locally with no build step:
//   node serve.ts            serves game/ on http://localhost:8080
//   node serve.ts --port N   serves it on port N instead
// It sends the MIME types a browser game needs, refuses any path outside
// game/, and otherwise does nothing clever: a development convenience, not
// a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const wanted = portFlag === -1 ? 8080 : Number(argv[portFlag + 1]);
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const parts = normalize(path).split(sep).filter((seg) => seg !== '..' && seg !== '.' && seg !== '');
    const file = resolve(join(gameRoot, ...parts));
    if (!file.startsWith(gameRoot + sep) && file !== gameRoot) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const stat = statSync(file);
    if (!stat.isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`SAYAP NUSANTARA serving game/ at http://localhost:${port}`);
});
