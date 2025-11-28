/**
 * MCP Build Verification Script
 *
 * Verifies:
 * 1. Entry point exists
 * 2. .mcp.json points to correct path
 * 3. Shared package is built
 */

import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENTRY = resolve(__dirname, "../dist/index.js");
const MCP_CONFIG = resolve(ROOT, ".mcp.json");

const errors = [];

// 1. Check entry point exists
if (!existsSync(ENTRY)) {
	errors.push(`Entry point not found: ${ENTRY}`);
} else {
	const stats = statSync(ENTRY);
	const age = Date.now() - stats.mtimeMs;
	if (age > 60000) {
		console.warn(`⚠ Build is ${Math.round(age / 1000)}s old`);
	}
	console.log(`✓ Entry point exists: ${ENTRY}`);
}

// 2. Check .mcp.json configuration
if (existsSync(MCP_CONFIG)) {
	const config = JSON.parse(readFileSync(MCP_CONFIG, "utf-8"));
	const configuredPath = config.mcpServers?.["wireframe-mapper"]?.args?.[0];

	if (!configuredPath) {
		errors.push(".mcp.json missing wireframe-mapper configuration");
	} else if (!existsSync(configuredPath)) {
		errors.push(`.mcp.json points to non-existent path: ${configuredPath}`);
	} else {
		console.log(`✓ .mcp.json path valid: ${configuredPath}`);
	}
} else {
	errors.push(`.mcp.json not found at ${MCP_CONFIG}`);
}

// 3. Check shared package is built
const SHARED_DIST = resolve(ROOT, "packages/shared/dist/index.js");
if (!existsSync(SHARED_DIST)) {
	errors.push(
		`Shared package not built. Run: pnpm --filter @wireframe-mapper/shared build`
	);
} else {
	console.log(`✓ Shared package built`);
}

// Report
if (errors.length > 0) {
	console.error("\n❌ Verification failed:");
	for (const e of errors) {
		console.error(`  - ${e}`);
	}
	process.exit(1);
} else {
	console.log("\n✓ Build verified successfully");
}
