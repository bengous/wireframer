/**
 * MCP Server Build Script
 *
 * Uses esbuild for fast bundling to a single file,
 * then tsc for declaration files (IDE support).
 */

import { build } from "esbuild";
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Bundle with esbuild (fast)
console.log("Building with esbuild...");
await build({
	entryPoints: [resolve(__dirname, "src/index.ts")],
	bundle: true,
	platform: "node",
	target: "node18",
	format: "esm",
	outfile: resolve(__dirname, "dist/index.js"),
	sourcemap: true,
	external: [
		// Native modules that can't be bundled
		"playwright",
		"@napi-rs/canvas",
		// MCP SDK (keep as external for cleaner output)
		"@modelcontextprotocol/sdk",
	],
	banner: {
		js: `// Built: ${new Date().toISOString()}`,
	},
});

console.log("✓ Built mcp-server/dist/index.js");

// 2. Generate declaration files with tsc (for IDE support)
console.log("Generating declaration files...");
try {
	execFileSync("npx", ["tsc", "--emitDeclarationOnly"], {
		cwd: __dirname,
		stdio: "inherit",
	});
	console.log("✓ Generated declaration files");
} catch {
	console.warn("⚠ Declaration generation failed (non-fatal)");
}
