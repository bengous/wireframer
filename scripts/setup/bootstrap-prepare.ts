#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { isAbsolute, join, normalize, resolve } from "node:path";

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

function run(command: string[], cwd = process.cwd()): CommandResult {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
  };
}

function runOrThrow(command: string[], cwd = process.cwd()): void {
  const result = run(command, cwd);
  if (result.exitCode === 0) {
    return;
  }
  throw new Error(result.stderr || `${command.join(" ")} failed with exit code ${result.exitCode}`);
}

function localBin(name: string): string {
  return process.platform === "win32"
    ? `./node_modules/.bin/${name}.cmd`
    : `./node_modules/.bin/${name}`;
}

function resolveHookPath(cwd: string, hookPath: string): string {
  return normalize(isAbsolute(hookPath) ? hookPath : resolve(cwd, hookPath));
}

function installLefthook(): void {
  const cwd = process.cwd();
  if (!existsSync(localBin("lefthook")) || !existsSync(".git")) {
    return;
  }

  const hooksPathResult = run(["git", "config", "--local", "--get-all", "core.hooksPath"], cwd);
  const configuredPaths =
    hooksPathResult.exitCode === 0
      ? hooksPathResult.stdout
          .split("\n")
          .map((path) => path.trim())
          .filter(Boolean)
      : [];

  if (configuredPaths.length === 0) {
    runOrThrow([localBin("lefthook"), "install"], cwd);
    return;
  }

  const commonDirResult = run(["git", "rev-parse", "--git-common-dir"], cwd);
  if (commonDirResult.exitCode !== 0 || commonDirResult.stdout.length === 0) {
    throw new Error(commonDirResult.stderr || "Unable to determine git common dir");
  }

  const defaultHooksPath = resolveHookPath(cwd, join(commonDirResult.stdout, "hooks"));
  const allPathsAreDefault = configuredPaths.every(
    (hookPath) => resolveHookPath(cwd, hookPath) === defaultHooksPath,
  );

  if (allPathsAreDefault) {
    runOrThrow(["git", "config", "--unset-all", "--local", "core.hooksPath"], cwd);
    runOrThrow([localBin("lefthook"), "install"], cwd);
    return;
  }

  runOrThrow([localBin("lefthook"), "install", "--force"], cwd);
}

if (import.meta.main) {
  installLefthook();
}
