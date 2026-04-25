/**
 * Robust MCP entry-point wrapper. Compiled by scripts/build-mcp-wrapper.ts to
 * scripts/mcp-wrapper.js so .mcp.json can keep invoking 'node' on a static
 * file (the MCP server runtime must stay Node — @napi-rs/canvas and
 * playwright ship Node-targeted N-API bindings).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT: string = resolve(import.meta.dirname, "..");

const CANDIDATES: readonly string[] = [
  resolve(ROOT, "mcp-server/dist/index.js"),
  resolve(ROOT, "mcp-server/dist/mcp-server/src/index.js"), // legacy nested path
];

const entry: string | undefined = CANDIDATES.find((p) => existsSync(p));

if (entry === undefined) {
  console.error("❌ MCP server entry point not found.");
  console.error("   Tried:", CANDIDATES.join("\n         "));
  console.error("\n   To fix, run:");
  console.error("   cd", ROOT);
  console.error("   bun run build:all");
  process.exit(1);
}

await import(entry);
