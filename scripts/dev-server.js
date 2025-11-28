#!/usr/bin/env node
/**
 * Simple dev server that serves the built wireframe-mapper.js
 * with CORS headers so Tampermonkey can fetch it.
 *
 * Usage: node scripts/dev-server.js [port]
 * Default port: 9876
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist', 'wireframe-mapper.js');
const PORT = parseInt(process.argv[2] || '9876', 10);

const server = createServer(async (req, res) => {
  // CORS headers for Tampermonkey
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/wireframe-mapper.js') {
    try {
      const content = await readFile(DIST_PATH, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(content);
      console.log(`[${new Date().toISOString()}] Served wireframe-mapper.js`);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Build not found. Run: pnpm run build');
      console.error(`[${new Date().toISOString()}] Error:`, err.message);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Wireframe Mapper Dev Server`);
  console.log(`  ───────────────────────────`);
  console.log(`  URL: http://localhost:${PORT}/`);
  console.log(`  Press Ctrl+C to stop\n`);
});
