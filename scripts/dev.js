#!/usr/bin/env node
/**
 * Unified dev script: runs esbuild watch + dev server in a single process.
 * Usage: node scripts/dev.js
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

console.log("\n  Wireframe Mapper Dev Mode");
console.log("  ─────────────────────────\n");

// Start esbuild watch (--watch=forever keeps watching even without stdin)
const esbuild = spawn(
  "bunx",
  [
    "esbuild",
    "src/main.ts",
    "--bundle",
    "--outfile=dist/wireframe-mapper.js",
    "--format=iife",
    "--watch=forever",
  ],
  {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

esbuild.stdout.on("data", (data) => {
  const msg = data.toString().trim();
  if (msg) {
    console.log(`  [build] ${msg}`);
  }
});

esbuild.stderr.on("data", (data) => {
  const msg = data.toString().trim();
  if (msg) {
    console.error(`  [build] ${msg}`);
  }
});

// Start dev server after a short delay to let first build complete
setTimeout(() => {
  const server = spawn("node", ["scripts/dev-server.js"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  server.on("error", (err) => {
    console.error(`  [server] Failed to start: ${err.message}`);
  });

  // Clean up on exit
  process.on("SIGINT", () => {
    esbuild.kill();
    server.kill();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    esbuild.kill();
    server.kill();
    process.exit(0);
  });
}, 500);

esbuild.on("error", (err) => {
  console.error(`  [build] Failed to start: ${err.message}`);
  process.exit(1);
});

console.log("  Starting esbuild watch...");
console.log("  Press Ctrl+C to stop\n");
