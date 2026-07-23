// Dependency-free healthcheck used by the Docker HEALTHCHECK instruction —
// avoids needing curl/wget installed in the runtime image.
const http = require('http');

const req = http.get(
  { host: '127.0.0.1', port: process.env.PORT || 3000, path: '/api', timeout: 3000 },
  (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  }
);

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
