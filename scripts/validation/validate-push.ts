#!/usr/bin/env bun

import { expandConfigScope, getChangedScopes } from "./detect-scope";
import { resolveProjectRoot } from "./resolve-bin";

async function main(): Promise<void> {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const scopes = expandConfigScope(await getChangedScopes("push"));

  if (scopes.size === 0) {
    console.log("No scoped changes detected, skipping validation.");
    process.exit(0);
  }

  const errors: string[] = [];

  async function run(label: string, script: string): Promise<void> {
    const result = await Bun.$`bun run --silent ${script}`.cwd(projectRoot).nothrow().quiet();
    if (result.exitCode !== 0) {
      const output = [result.stderr.toString(), result.stdout.toString()]
        .filter(Boolean)
        .join("\n")
        .trim();
      errors.push(`[${label}] ${output || `exited with code ${result.exitCode}`}`);
    }
  }

  if (scopes.has("backend") || scopes.has("scripts")) {
    await run("typecheck", "typecheck");
    await run("lint:errors", "lint:errors");
    await run("format:check", "format:check");
    await run("lint:arch", "lint:arch");
    await run("test", "test");
  }
  if (scopes.has("frontend")) {
    await run("validate:frontend", "validate:frontend");
  }

  if (errors.length > 0) {
    console.error(`Push validation failed:\n\n${errors.join("\n\n")}`);
    process.exit(1);
  }

  console.log(`Push validation passed (scopes: ${[...scopes].join(", ")}).`);
}

if (import.meta.main) {
  await main();
}
