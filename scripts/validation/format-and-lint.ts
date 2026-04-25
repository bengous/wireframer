#!/usr/bin/env bun

import { resolveBin, resolveProjectRoot } from "./resolve-bin";

export type HookInput = {
  tool_input: {
    file_path?: string;
  };
};

type Workspace = {
  readonly oxlintConfig: string;
  readonly oxlintArgs: ReadonlyArray<string>;
  readonly oxfmtConfig: string;
};

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ROOT_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
};
const FRONTEND_WORKSPACE: Workspace = {
  oxlintConfig: "apps/frontend/.oxlintrc.jsonc",
  oxlintArgs: ["--type-aware"],
  oxfmtConfig: "apps/frontend/.oxfmtrc.jsonc",
};

const SUMMARY_LINE = /^\d+ problems?$/;
const PHANTOM_WARNING = /^:0:0:\s+\[Warning\]$/;

export function parseFilePath(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tool_input" in parsed &&
      typeof parsed["tool_input"] === "object" &&
      parsed["tool_input"] !== null &&
      "file_path" in parsed["tool_input"] &&
      (typeof parsed["tool_input"]["file_path"] === "string" ||
        parsed["tool_input"]["file_path"] === undefined)
    ) {
      return parsed["tool_input"]["file_path"] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveWorkspace(filePath: string): Workspace | null {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  if (!LINTABLE_EXTENSIONS.has(ext)) {
    return null;
  }

  const normalized = filePath.replace(`${process.cwd()}/`, "").replace(/^\.\//, "");
  if (normalized.startsWith("src/") || normalized.startsWith("scripts/")) {
    return ROOT_WORKSPACE;
  }
  if (normalized.startsWith("apps/frontend/")) {
    return FRONTEND_WORKSPACE;
  }
  return null;
}

function blockingLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !SUMMARY_LINE.test(line) && !PHANTOM_WARNING.test(line));
}

if (import.meta.main) {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const oxlint = resolveBin(projectRoot, "oxlint");
  const oxfmt = resolveBin(projectRoot, "oxfmt");
  const input = await Bun.stdin.text();
  const filePath = parseFilePath(input);
  const workspace = filePath !== null ? resolveWorkspace(filePath) : null;

  if (filePath === null || workspace === null) {
    process.exit(0);
  }

  Bun.spawnSync(
    [oxlint, ...workspace.oxlintArgs, "-c", workspace.oxlintConfig, "--fix", "--quiet", filePath],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );

  Bun.spawnSync([oxfmt, "--write", "-c", workspace.oxfmtConfig, filePath], {
    stdout: "ignore",
    stderr: "ignore",
  });

  const lint = Bun.spawnSync(
    [
      oxlint,
      ...workspace.oxlintArgs,
      "-c",
      workspace.oxlintConfig,
      "--quiet",
      "--format=unix",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  if (lint.exitCode !== 0) {
    const output = [lint.stderr.toString(), lint.stdout.toString()]
      .filter(Boolean)
      .join("\n")
      .trim();
    const lines = blockingLines(output);
    if (lines.length > 0) {
      console.log(JSON.stringify({ decision: "block", reason: lines.join("\n") }));
    }
  }
}
