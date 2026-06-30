const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const root = path.join(__dirname, 'dist');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = path.join(root, safePath);
  const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : path.join(root, 'index.html');
  const ext = path.extname(filePath);

  response.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
