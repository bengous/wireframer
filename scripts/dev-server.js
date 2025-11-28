#!/usr/bin/env node

/**
 * Dev server that serves the built wireframe-mapper.js with CORS headers.
 * Handles port conflicts gracefully by killing existing process.
 *
 * Usage: node scripts/dev-server.js [port]
 * Default port: 9876
 */

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, "..", "dist", "wireframe-mapper.js");
const DEFAULT_PORT = 9876;

function killProcessOnPort(port) {
	try {
		// Get PIDs using the port via lsof
		const output = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf-8" });
		const pids = output.trim().split("\n").filter(Boolean);

		for (const pid of pids) {
			try {
				execFileSync("kill", [pid]);
			} catch {
				// Process may have already exited
			}
		}
		return pids.length > 0;
	} catch {
		// lsof returns non-zero if no process found
		return false;
	}
}

function createHandler() {
	return async (req, res) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.url === "/" || req.url === "/wireframe-mapper.js") {
			try {
				const content = await readFile(DIST_PATH, "utf-8");
				res.writeHead(200, {
					"Content-Type": "application/javascript",
					"Cache-Control": "no-cache, no-store, must-revalidate",
				});
				res.end(content);
				const time = new Date().toLocaleTimeString();
				console.log(`  [${time}] Served wireframe-mapper.js`);
			} catch (err) {
				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Build not found. Run: pnpm run build");
				console.error(`  [Error] ${err.message}`);
			}
		} else {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("Not found");
		}
	};
}

async function startServer(port, retryCount = 0) {
	const server = createServer(createHandler());

	server.on("error", (err) => {
		if (err.code === "EADDRINUSE") {
			if (retryCount === 0) {
				console.log(`  Port ${port} in use, killing existing process...`);
				const killed = killProcessOnPort(port);
				if (killed) {
					// Wait a moment for the port to be released
					setTimeout(() => startServer(port, retryCount + 1), 500);
				} else {
					console.error(
						`  Could not free port ${port}. Try manually: lsof -ti:${port} | xargs kill`,
					);
					process.exit(1);
				}
			} else {
				console.error(`  Port ${port} still in use after cleanup.`);
				process.exit(1);
			}
		} else {
			console.error(`  Server error: ${err.message}`);
			process.exit(1);
		}
	});

	server.listen(port, () => {
		console.log(`\n  Wireframe Mapper Dev Server`);
		console.log(`  ───────────────────────────`);
		console.log(`  URL: http://localhost:${port}/`);
		console.log(`  Press Ctrl+C to stop\n`);
	});
}

const port = parseInt(process.argv[2] || String(DEFAULT_PORT), 10);
startServer(port);
