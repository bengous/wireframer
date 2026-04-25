import { $ } from "bun";
import { existsSync } from "node:fs";

export type Scope = "backend" | "frontend" | "scripts" | "config";

export const CODE_PATTERN = /\.(ts|tsx|js|mjs|css|json|jsonc)$/;

const CONFIG_FILES = new Set([
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  ".oxlintrc.jsonc",
  ".oxfmtrc.jsonc",
  "lefthook.yml",
  ".dependency-cruiser.cjs",
  ".jscpd.json",
  "mise.toml",
]);

function hasFrontendWorkspace(): boolean {
  return existsSync("apps/frontend/package.json");
}

export function classifyFile(filePath: string): Scope | null {
  const normalized = filePath.replaceAll("\\", "/").replaceAll(/^\.\//g, "");

  if (normalized.startsWith("apps/frontend/") && hasFrontendWorkspace()) {
    return "frontend";
  }
  if (normalized.startsWith("src/")) {
    return "backend";
  }
  if (normalized.startsWith("scripts/")) {
    return "scripts";
  }

  const basename = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  if (CONFIG_FILES.has(basename)) {
    return "config";
  }

  return null;
}

export function classifyScopes(files: string[]): Set<Scope> {
  const scopes = new Set<Scope>();
  for (const file of files) {
    const scope = classifyFile(file);
    if (scope !== null) {
      scopes.add(scope);
    }
  }
  return scopes;
}

export function expandConfigScope(scopes: Set<Scope>): Set<Scope> {
  if (!scopes.has("config")) {
    return scopes;
  }
  const expanded = new Set(scopes);
  expanded.add("backend");
  expanded.add("scripts");
  if (hasFrontendWorkspace()) {
    expanded.add("frontend");
  }
  return expanded;
}

function parseFileList(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type GitContext = "working" | "staged" | "push";

export async function getChangedFiles(context: GitContext): Promise<string[]> {
  switch (context) {
    case "working": {
      const [unstaged, staged, untracked] = await Promise.all([
        $`git diff --name-only`.nothrow().quiet().text(),
        $`git diff --cached --name-only`.nothrow().quiet().text(),
        $`git ls-files --others --exclude-standard`.nothrow().quiet().text(),
      ]);
      return [
        ...new Set([
          ...parseFileList(unstaged),
          ...parseFileList(staged),
          ...parseFileList(untracked),
        ]),
      ];
    }
    case "staged": {
      return parseFileList(await $`git diff --cached --name-only`.nothrow().quiet().text());
    }
    case "push": {
      const pushResult = await $`git diff --name-only @{push}...HEAD`.nothrow().quiet();
      if (pushResult.exitCode === 0) {
        return parseFileList(pushResult.text());
      }
      return parseFileList(await $`git diff --name-only HEAD~1...HEAD`.nothrow().quiet().text());
    }
    default: {
      throw new Error(`Unsupported git context: ${String(context)}`);
    }
  }
}

export async function getChangedScopes(context: GitContext): Promise<Set<Scope>> {
  return classifyScopes(await getChangedFiles(context));
}
