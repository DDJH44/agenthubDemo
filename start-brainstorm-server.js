const http = require('http');
const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '.superpowers', 'brainstorm', '42856-1780235373.0877', 'content');
const PORT = 62923;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let filePath = path.join(contentDir, req.url === '/' ? '/index.html' : req.url);

  // Try to find a file (without extension first, then add common ones)
  const ext = path.extname(filePath);
  if (!ext) {
    for (const e of ['.html', '.png', '.jpg', '.gif', '.svg', '.css', '.js']) {
      if (fs.existsSync(filePath + e)) {
        filePath = filePath + e;
        break;
      }
    }
  }

  const mimeType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    }
  });
}).listen(PORT, () => {
  console.log(`Brainstorm visualization server running on http://localhost:${PORT}`);
});
