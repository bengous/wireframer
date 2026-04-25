#!/usr/bin/env bun

import process from "node:process";

const processModule = process;
void processModule;

const SETTINGS = [
  ["core.autocrlf", "false"],
  ["core.eol", "lf"],
  ["core.safecrlf", "true"],
] as const;

function runGit(args: string[]): void {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(proc.stderr.toString().trim() || `git ${args.join(" ")} failed`);
  }
}

function readGit(key: string): string | null {
  const proc = Bun.spawnSync(["git", "config", "--local", "--get", key], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  return proc.stdout.toString().trim();
}

function main(): void {
  for (const [key, value] of SETTINGS) {
    runGit(["config", "--local", key, value]);
    console.log(`set ${key}=${value}`);
  }

  const symlinks = readGit("core.symlinks");
  if (symlinks === "false") {
    console.log("note: core.symlinks=false is supported");
  } else if (symlinks === "true") {
    console.log("note: core.symlinks=true is fine");
  } else {
    console.log("note: core.symlinks is unset");
  }

  console.log("repo bootstrap complete");
}

if (import.meta.main) {
  main();
}
