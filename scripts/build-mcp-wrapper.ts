#!/usr/bin/env bun

/**
 * Compiles scripts/mcp-wrapper.ts -> scripts/mcp-wrapper.js (Node ESM target).
 * Runs as part of 'bun run build:all'. Output is gitignored.
 */

import { build } from "esbuild";
import { join } from "node:path";

const ROOT: string = join(import.meta.dirname, "..");

await build({
  entryPoints: [join(ROOT, "scripts/mcp-wrapper.ts")],
  bundle: false,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(ROOT, "scripts/mcp-wrapper.js"),
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
