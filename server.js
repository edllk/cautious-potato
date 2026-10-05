const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!doctype html>
    <html>
      <head>
        <title>Claude Website Test</title>
      </head>
      <body>
        <h1>Dev Container works!</h1>
        <p>This page is being served from Node.js inside the Docker Dev Container.</p>
      </body>
    </html>
  `);
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Server listening on port 3000');
});
