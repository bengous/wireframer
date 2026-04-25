#!/usr/bin/env node
/**
 * Robust MCP Entry Point Wrapper
 *
 * Handles build path changes and provides clear error messages.
 * This file is stable (checked into git) and should rarely change.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// Candidate entry points (in order of preference)
const CANDIDATES = [
  resolve(ROOT, "mcp-server/dist/index.js"),
  resolve(ROOT, "mcp-server/dist/mcp-server/src/index.js"), // Legacy nested path
];

const entry = CANDIDATES.find(existsSync);

if (!entry) {
  console.error("❌ MCP server entry point not found.");
  console.error("   Tried:", CANDIDATES.join("\n         "));
  console.error("\n   To fix, run:");
  console.error("   cd", ROOT);
  console.error("   bun run build:all");
  process.exit(1);
}

// Import and run the actual server
await import(entry);
