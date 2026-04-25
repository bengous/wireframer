#!/usr/bin/env bun

/**
 * Unified dev script: runs esbuild watch + dev server in a single process.
 * Usage: bun scripts/dev.ts
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT: string = join(import.meta.dirname, "..");

console.log("\n  Wireframe Mapper Dev Mode");
console.log("  ─────────────────────────\n");

// Start esbuild watch (--watch=forever keeps watching even without stdin).
const esbuild: ChildProcess = spawn(
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

esbuild.stdout?.on("data", (data: Buffer) => {
  const msg = data.toString().trim();
  if (msg.length > 0) {
    console.log(`  [build] ${msg}`);
  }
});

esbuild.stderr?.on("data", (data: Buffer) => {
  const msg = data.toString().trim();
  if (msg.length > 0) {
    console.error(`  [build] ${msg}`);
  }
});

// Start dev server after a short delay to let the first build complete.
setTimeout(() => {
  const server: ChildProcess = spawn("bun", ["scripts/dev-server.ts"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  server.on("error", (err: Error) => {
    console.error(`  [server] Failed to start: ${err.message}`);
  });

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

esbuild.on("error", (err: Error) => {
  console.error(`  [build] Failed to start: ${err.message}`);
  process.exit(1);
});

console.log("  Starting esbuild watch...");
console.log("  Press Ctrl+C to stop\n");
