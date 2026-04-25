#!/usr/bin/env bun

/**
 * Mirrors Claude Code's native config into AGENTS.md for non-Claude AI agents
 * (Codex, OpenCode, etc.) that don't read .claude/rules/.
 *
 * ## Why this exists
 *
 * Claude Code loads CLAUDE.md + .claude/rules/ natively — it never reads AGENTS.md.
 * Other AI agents (Codex, OpenCode) don't understand .claude/rules/ but do walk
 * the directory tree loading AGENTS.md files. This script keeps them in sync so
 * all agents share the same source of truth.
 *
 * ## Mapping
 *
 *   Source (Claude Code native)      → Generated (for other agents)
 *   ──────────────────────────────────────────────────────────────
 *   CLAUDE.md                        → ./AGENTS.md
 *   .claude/rules/<rule>.md          → <dir>/AGENTS.md
 *
 * <dir> is the path prefix before the first glob wildcard in the rule's
 * `paths:` frontmatter (e.g., "src/cli" from "src/cli/\**\/\*.ts",
 * "scripts/setup" from "scripts/setup/\**").
 *
 * Layer files contain ONLY the matched rules — no root content duplication.
 * Non-Claude agents get root context from ./AGENTS.md and directory-specific
 * rules from <dir>/AGENTS.md as they navigate the directory tree.
 *
 * ## Rule file schema (.claude/rules/*.md)
 *
 *   ---
 *   paths:
 *     - "src/<layer>/**\/*.ts"      # glob patterns; target dir = prefix before first wildcard
 *     - "scripts/setup/**"          # → scripts/setup/AGENTS.md
 *   ---
 *
 *   ## Rule Title
 *
 *   Rule body (markdown). Everything after frontmatter is copied verbatim
 *   into the target layer's AGENTS.md.
 *
 * A single rule can target multiple layers (cross-cutting rules) by listing
 * multiple path patterns.
 *
 * ## Manifest schema (.agents/agents-md-manifest.json)
 *
 *   { "generated": ["AGENTS.md", "src/cli/AGENTS.md", ...] }
 *
 * Tracks all managed files. Used to detect stale files when rules are removed.
 *
 * ## Drift detection
 *
 * --check mode (default) performs three checks:
 *   1. Byte-exact match of each generated file against expected content
 *   2. Manifest paths match current rule → layer mapping
 *   3. Semantic check: each layer file contains all expected rule bodies
 *
 * The validation hook (validate-on-stop.ts) runs --check automatically.
 *
 * ## Usage
 *
 *   bun scripts/agents/sync-agents-md.ts --write                 # generate/update files
 *   bun scripts/agents/sync-agents-md.ts --check                 # verify no drift (default)
 *   bun scripts/agents/sync-agents-md.ts --write --preserve-root # keep existing root AGENTS.md
 */

import { Glob } from "bun";
import { lstat, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const RULES_DIR = ".claude/rules";
const ROOT_MD = "CLAUDE.md";
const ROOT_AGENTS_MD = "AGENTS.md";
const MANIFEST_PATH = ".agents/agents-md-manifest.json";
const MANAGED_AGENTS_GLOBS = ["src/*/AGENTS.md", "scripts/AGENTS.md", "scripts/*/AGENTS.md"];

export type Manifest = {
  generated: string[];
};

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null || !("generated" in value)) {
    return false;
  }

  const generated = value["generated"];
  return Array.isArray(generated) && generated.every((entry) => typeof entry === "string");
}

export function normalizeNewlines(content: string): string {
  return content.replaceAll("\r\n", "\n");
}

export function parsePaths(content: string): string[] {
  content = normalizeNewlines(content);
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch === null) {
    return [];
  }

  const frontmatter = fmMatch[1] ?? "";
  const pathLines = frontmatter.match(/^\s*-\s*"([^"]+)"/gm);
  if (pathLines === null) {
    return [];
  }

  const dirs: string[] = [];
  for (const line of pathLines) {
    const quoted = line.match(/"([^"]+)"/);
    if (quoted === null) {
      continue;
    }
    const glob = quoted[1] ?? "";
    const segments = glob.split("/");
    const dirSegments: string[] = [];
    for (const seg of segments) {
      if (seg.includes("*") || seg.includes("?") || seg.includes("{")) {
        break;
      }
      dirSegments.push(seg);
    }
    if (dirSegments.length >= 1) {
      dirs.push(dirSegments.join("/"));
    }
  }
  return [...new Set(dirs)];
}

export function stripFrontmatter(content: string): string {
  content = normalizeNewlines(content);
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (match === null) {
    return content;
  }
  return content.slice(match[0].length).replace(/^\n/, "");
}

/** Generate a layer AGENTS.md containing only matched rule bodies. */
export function generateLayerAgentsMd(rules: { name: string; body: string }[]): string {
  if (rules.length === 0) {
    return "";
  }
  const parts: string[] = [];
  for (const rule of rules) {
    parts.push(rule.body.trimEnd(), "");
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

/**
 * Verify that each layer AGENTS.md contains exactly the expected rule blocks.
 */
export function verifyLayerContent(
  dirToRules: Map<string, { name: string; body: string }[]>,
  agentsFiles: Map<string, string>,
): string[] {
  const errors: string[] = [];

  for (const [dir, rules] of dirToRules) {
    const path = `${dir}/AGENTS.md`;
    const content = agentsFiles.get(path);
    if (content === undefined) {
      continue;
    } // missing file already caught by byte check

    for (const rule of rules) {
      const ruleBody = rule.body.trimEnd();
      if (!content.includes(ruleBody)) {
        errors.push(`${path}: missing rule content from ${rule.name}`);
      }
    }
  }

  return errors;
}

export async function fileContainsCrlf(path: string): Promise<boolean> {
  return (await Bun.file(path).text()).includes("\r\n");
}

export async function pathIsSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function ensureManagedPathIsRegularFile(path: string): Promise<string | null> {
  if (await pathIsSymlink(path)) {
    return `${path}: symlinks are not allowed for managed AGENTS.md files`;
  }
  return null;
}

async function writeLfFile(path: string, content: string): Promise<void> {
  const normalized = normalizeNewlines(content);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, normalized);
}

async function listManagedAgentsPaths(includeRoot: boolean): Promise<string[]> {
  const paths = includeRoot ? [ROOT_AGENTS_MD] : [];
  for (const pattern of MANAGED_AGENTS_GLOBS) {
    const glob = new Glob(pattern);
    for await (const path of glob.scan({ cwd: "." })) {
      paths.push(path);
    }
  }
  return [...new Set(paths)].toSorted();
}

async function readManifest(): Promise<Manifest> {
  const file = Bun.file(MANIFEST_PATH);
  if (!(await file.exists())) {
    return { generated: [] };
  }

  const parsed = (await file.json()) as unknown;
  if (!isManifest(parsed)) {
    throw new Error(`${MANIFEST_PATH}: invalid manifest shape`);
  }

  return parsed;
}

async function buildDirectoryMap(): Promise<{
  dirToRules: Map<string, { name: string; body: string }[]>;
}> {
  const dirToRules = new Map<string, { name: string; body: string }[]>();
  const glob = new Glob("*.md");

  const ruleFiles: string[] = [];
  for await (const path of glob.scan({ cwd: RULES_DIR })) {
    ruleFiles.push(path);
  }
  ruleFiles.sort();

  for (const filename of ruleFiles) {
    const content = await Bun.file(`${RULES_DIR}/${filename}`).text();
    const dirs = parsePaths(content);
    const body = stripFrontmatter(content);

    for (const dir of dirs) {
      if (!dirToRules.has(dir)) {
        dirToRules.set(dir, []);
      }
      dirToRules.get(dir)!.push({ name: filename, body });
    }
  }

  return { dirToRules };
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const preserveRoot = process.argv.includes("--preserve-root");

  const { dirToRules } = await buildDirectoryMap();
  const rootContent = normalizeNewlines(await Bun.file(ROOT_MD).text());
  const oldManifest = await readManifest();
  const rootAgentsFile = Bun.file(ROOT_AGENTS_MD);
  const rootExists = await rootAgentsFile.exists();
  const rootWasManaged = oldManifest.generated.includes(ROOT_AGENTS_MD);
  const preserveExistingRoot = preserveRoot && rootExists && !rootWasManaged;
  const targetPaths = new Set<string>(preserveExistingRoot ? [] : [ROOT_AGENTS_MD]);

  // Generate layer AGENTS.md (rules only, no root duplication)
  const generated = new Map<string, string>();
  if (!preserveExistingRoot) {
    generated.set(ROOT_AGENTS_MD, rootContent);
  }
  for (const [dir, rules] of dirToRules) {
    const path = `${dir}/AGENTS.md`;
    targetPaths.add(path);
    generated.set(path, generateLayerAgentsMd(rules));
  }

  // Detect stale files from previous manifest
  const stale = oldManifest.generated.filter((p) => !targetPaths.has(p));

  const errors: string[] = [];
  const managedAgentsPaths = await listManagedAgentsPaths(!preserveExistingRoot);

  for (const path of managedAgentsPaths) {
    const symlinkError = await ensureManagedPathIsRegularFile(path);
    if (symlinkError !== null) {
      errors.push(symlinkError);
    }
  }

  if (await fileContainsCrlf(ROOT_MD)) {
    errors.push(`${ROOT_MD}: must use LF line endings`);
  }

  if (mode === "write") {
    if (errors.length > 0) {
      for (const e of errors) {
        console.error(e);
      }
      process.exit(1);
    }
    for (const [path, content] of generated) {
      await writeLfFile(path, content);
      console.log(`wrote ${path}`);
    }
    for (const path of stale) {
      if (await Bun.file(path).exists()) {
        await rm(path, { force: true });
        console.log(`removed stale ${path}`);
      }
    }
    // Write manifest
    const manifest: Manifest = {
      generated: [...targetPaths].toSorted(),
    };
    await Bun.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
    console.log(`wrote ${MANIFEST_PATH}`);
  } else {
    // Byte-exact check
    for (const [path, expected] of generated) {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        errors.push(`${path}: missing — run \`bun run agents:sync\``);
        continue;
      }
      const actual = await file.text();
      if (normalizeNewlines(actual) !== expected) {
        errors.push(`${path}: content drift — run \`bun run agents:sync\``);
      }
      if (await fileContainsCrlf(path)) {
        errors.push(`${path}: must use LF line endings`);
      }
    }
    for (const path of stale) {
      if (await Bun.file(path).exists()) {
        errors.push(`${path}: stale generated file — run \`bun run agents:sync\``);
      }
    }

    // Manifest check
    const manifestFile = Bun.file(MANIFEST_PATH);
    if (!(await manifestFile.exists())) {
      errors.push(`${MANIFEST_PATH}: missing — run \`bun run agents:sync\``);
    } else {
      const parsedManifest = (await manifestFile.json()) as unknown;
      const currentManifest = isManifest(parsedManifest) ? parsedManifest : null;
      if (currentManifest === null) {
        errors.push(`${MANIFEST_PATH}: invalid manifest shape — run \`bun run agents:sync\``);
      }
      const expectedPaths = [...targetPaths].toSorted();
      const actualPaths = currentManifest === null ? [] : [...currentManifest.generated].toSorted();
      if (
        currentManifest !== null &&
        JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)
      ) {
        errors.push(`${MANIFEST_PATH}: manifest drift — run \`bun run agents:sync\``);
      }
    }

    // Semantic check: verify each layer file contains its expected rules
    const agentsFiles = new Map<string, string>();
    for (const [path] of generated) {
      if (path === ROOT_AGENTS_MD) {
        continue;
      } // root checked via byte-exact above
      const file = Bun.file(path);
      if (await file.exists()) {
        agentsFiles.set(path, normalizeNewlines(await file.text()));
      }
    }
    const semanticErrors = verifyLayerContent(dirToRules, agentsFiles);
    errors.push(...semanticErrors);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(e);
    }
    console.error(
      `\nFound ${errors.length} AGENTS.md drift issue(s). Run \`bun run agents:sync\` to fix.`,
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
