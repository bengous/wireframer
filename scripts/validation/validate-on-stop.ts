#!/usr/bin/env bun

import { CODE_PATTERN, classifyScopes, expandConfigScope, getChangedFiles } from "./detect-scope";
import { resolveBin, resolveProjectRoot } from "./resolve-bin";

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
  const files = await getChangedFiles("working");
  const codeFiles = files.filter((file) => CODE_PATTERN.test(file));

  if (codeFiles.length === 0) {
    process.exit(0);
  }

  const scopes = expandConfigScope(classifyScopes(codeFiles));
  const oxlint = resolveBin(projectRoot, "oxlint");
  const errors: string[] = [];

  if (scopes.has("backend") || scopes.has("scripts")) {
    run(
      "lint:errors",
      [oxlint, "-c", ".oxlintrc.jsonc", "--quiet", "--format=unix", "src/", "scripts/"],
      projectRoot,
      errors,
    );
    run("format:check", ["bun", "run", "--silent", "format:check"], projectRoot, errors);
  }
  if (scopes.has("frontend")) {
    run(
      "typecheck:frontend",
      ["bun", "run", "--silent", "typecheck:frontend"],
      projectRoot,
      errors,
    );
    run("lint:frontend", ["bun", "run", "--silent", "lint:frontend"], projectRoot, errors);
    run("lint:css:frontend", ["bun", "run", "--silent", "lint:css:frontend"], projectRoot, errors);
    run(
      "format:check:frontend",
      ["bun", "run", "--silent", "format:check:frontend"],
      projectRoot,
      errors,
    );
  }

  if (errors.length > 0) {
    process.stderr.write(`Validation failed:\n${errors.join("\n\n")}\n`);
    process.exit(2);
  }
}

if (import.meta.main) {
  await main();
}
