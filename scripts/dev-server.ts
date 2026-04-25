#!/usr/bin/env bun

/**
 * Dev server that serves the built wireframe-mapper.js with CORS headers.
 * Handles port conflicts gracefully by killing the existing process.
 *
 * Usage: bun scripts/dev-server.ts [port]
 * Default port: 9876
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

const DIST_PATH: string = join(import.meta.dirname, "..", "dist", "wireframe-mapper.js");
const DEFAULT_PORT = 9876;

function killProcessOnPort(port: number): boolean {
  try {
    const output: string = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf-8" });
    const pids: string[] = output.trim().split("\n").filter(Boolean);

    for (const pid of pids) {
      try {
        execFileSync("kill", [pid]);
      } catch {
        // Process may have already exited.
      }
    }
    return pids.length > 0;
  } catch {
    // lsof returns non-zero if no process is found.
    return false;
  }
}

function createHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void (async (): Promise<void> => {
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
          const content: string = await readFile(DIST_PATH, "utf-8");
          res.writeHead(200, {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          });
          res.end(content);
          const time = new Date().toLocaleTimeString();
          console.log(`  [${time}] Served wireframe-mapper.js`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Build not found. Run: bun run build");
          console.error(`  [Error] ${message}`);
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    })();
  };
}

async function startServer(port: number, retryCount = 0): Promise<void> {
  const server = createServer(createHandler());

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (retryCount === 0) {
        console.log(`  Port ${port} in use, killing existing process...`);
        const killed = killProcessOnPort(port);
        if (killed) {
          setTimeout(() => {
            void startServer(port, retryCount + 1);
          }, 500);
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

const portArg: string | undefined = process.argv[2];
const port: number = Number.parseInt(portArg ?? String(DEFAULT_PORT), 10);
void startServer(port);
