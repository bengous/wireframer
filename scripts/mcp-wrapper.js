#!/usr/bin/env node
/**
 * Robust MCP Entry Point Wrapper
 *
 * Handles build path changes and provides clear error messages.
 * This file is stable (checked into git) and should rarely change.
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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
	console.error("   pnpm build:all");
	process.exit(1);
}

// Import and run the actual server
await import(entry);
