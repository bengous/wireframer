#!/usr/bin/env bun

import { CODE_PATTERN, classifyScopes, expandConfigScope, getChangedFiles } from "./detect-scope";
import { resolveProjectRoot } from "./resolve-bin";

function run(label: string, cmd: string[], cwd: string, errors: string[]): void {
  const result = Bun.spawnSync(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const output = [result.stderr.toString(), result.stdout.toString()]
      .filter(Boolean)
      .join("\n")
      .trim();
    errors.push(`[${label}] ${output || `exited with code ${result.exitCode}`}`);
  }
}

async function main(): Promise<void> {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const files = await getChangedFiles("staged");
  const codeFiles = files.filter((file) => CODE_PATTERN.test(file));

  if (codeFiles.length === 0) {
    process.exit(0);
  }

  const scopes = expandConfigScope(classifyScopes(codeFiles));
  const errors: string[] = [];

  if (scopes.has("backend") || scopes.has("scripts")) {
    run("typecheck", ["bun", "run", "--silent", "typecheck"], projectRoot, errors);
  }
  if (scopes.has("frontend")) {
    run(
      "typecheck:frontend",
      ["bun", "run", "--silent", "typecheck:frontend"],
      projectRoot,
      errors,
    );
  }

  if (errors.length > 0) {
    console.error(errors.join("\n\n"));
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
