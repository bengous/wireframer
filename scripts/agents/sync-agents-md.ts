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
  const normalized = normalizeNewlines(content);
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---/);
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
  const normalized = normalizeNewlines(content);
  const match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (match === null) {
    return normalized;
  }
  return normalized.slice(match[0].length).replace(/^\n/, "");
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
  const batches = await Promise.all(
    MANAGED_AGENTS_GLOBS.map(async (pattern) =>
      Array.fromAsync(new Glob(pattern).scan({ cwd: "." })),
    ),
  );
  for (const batch of batches) {
    paths.push(...batch);
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

  const ruleFiles: string[] = await Array.fromAsync(glob.scan({ cwd: RULES_DIR }));
  ruleFiles.sort();

  const contents = await Promise.all(
    ruleFiles.map(async (filename) => Bun.file(`${RULES_DIR}/${filename}`).text()),
  );
  for (const [i, content] of contents.entries()) {
    const filename = ruleFiles[i] ?? "";
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

async function runWriteMode(
  generated: Map<string, string>,
  stale: string[],
  targetPaths: Set<string>,
  errors: string[],
): Promise<void> {
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(e);
    }
    process.exit(1);
  }
  await Promise.all(
    [...generated].map(async ([path, content]) => {
      await writeLfFile(path, content);
      console.log(`wrote ${path}`);
    }),
  );
  await Promise.all(
    stale.map(async (path) => {
      if (await Bun.file(path).exists()) {
        await rm(path, { force: true });
        console.log(`removed stale ${path}`);
      }
    }),
  );
  const manifest: Manifest = { generated: [...targetPaths].toSorted() };
  await Bun.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
  console.log(`wrote ${MANIFEST_PATH}`);
}

async function checkByteExactGenerated(
  generated: Map<string, string>,
  errors: string[],
): Promise<void> {
  const results = await Promise.all(
    [...generated].map(async ([path, expected]) => {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return [`${path}: missing — run \`bun run agents:sync\``];
      }
      const localErrors: string[] = [];
      const actual = await file.text();
      if (normalizeNewlines(actual) !== expected) {
        localErrors.push(`${path}: content drift — run \`bun run agents:sync\``);
      }
      if (await fileContainsCrlf(path)) {
        localErrors.push(`${path}: must use LF line endings`);
      }
      return localErrors;
    }),
  );
  for (const batch of results) {
    errors.push(...batch);
  }
}

async function checkStalePresent(stale: string[], errors: string[]): Promise<void> {
  const flags = await Promise.all(stale.map(async (path) => Bun.file(path).exists()));
  for (const [i, present] of flags.entries()) {
    if (present) {
      errors.push(`${stale[i]}: stale generated file — run \`bun run agents:sync\``);
    }
  }
}

async function checkManifest(targetPaths: Set<string>, errors: string[]): Promise<void> {
  const manifestFile = Bun.file(MANIFEST_PATH);
  if (!(await manifestFile.exists())) {
    errors.push(`${MANIFEST_PATH}: missing — run \`bun run agents:sync\``);
    return;
  }
  const parsed = (await manifestFile.json()) as unknown;
  const current = isManifest(parsed) ? parsed : null;
  if (current === null) {
    errors.push(`${MANIFEST_PATH}: invalid manifest shape — run \`bun run agents:sync\``);
    return;
  }
  const expectedPaths = [...targetPaths].toSorted();
  const actualPaths = [...current.generated].toSorted();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
    errors.push(`${MANIFEST_PATH}: manifest drift — run \`bun run agents:sync\``);
  }
}

async function checkSemanticContent(
  generated: Map<string, string>,
  dirToRules: Map<string, { name: string; body: string }[]>,
  errors: string[],
): Promise<void> {
  const layerPaths = [...generated].filter(([path]) => path !== ROOT_AGENTS_MD).map(([p]) => p);
  const layerEntries = await Promise.all(
    layerPaths.map(async (path) => {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return null;
      }
      return [path, normalizeNewlines(await file.text())] as const;
    }),
  );
  const agentsFiles = new Map<string, string>(
    layerEntries.filter((e): e is readonly [string, string] => e !== null),
  );
  errors.push(...verifyLayerContent(dirToRules, agentsFiles));
}

async function runCheckMode(
  generated: Map<string, string>,
  stale: string[],
  targetPaths: Set<string>,
  dirToRules: Map<string, { name: string; body: string }[]>,
  errors: string[],
): Promise<void> {
  await checkByteExactGenerated(generated, errors);
  await checkStalePresent(stale, errors);
  await checkManifest(targetPaths, errors);
  await checkSemanticContent(generated, dirToRules, errors);
}

async function main(): Promise<void> {
  const mode: "write" | "check" = process.argv.includes("--write") ? "write" : "check";
  const preserveRoot = process.argv.includes("--preserve-root");

  const { dirToRules } = await buildDirectoryMap();
  const rootContent = normalizeNewlines(await Bun.file(ROOT_MD).text());
  const oldManifest = await readManifest();
  const rootAgentsFile = Bun.file(ROOT_AGENTS_MD);
  const rootExists = await rootAgentsFile.exists();
  const rootWasManaged = oldManifest.generated.includes(ROOT_AGENTS_MD);
  const preserveExistingRoot = preserveRoot && rootExists && !rootWasManaged;
  const targetPaths = new Set<string>(preserveExistingRoot ? [] : [ROOT_AGENTS_MD]);

  const generated = new Map<string, string>();
  if (!preserveExistingRoot) {
    generated.set(ROOT_AGENTS_MD, rootContent);
  }
  for (const [dir, rules] of dirToRules) {
    const path = `${dir}/AGENTS.md`;
    targetPaths.add(path);
    generated.set(path, generateLayerAgentsMd(rules));
  }

  const stale = oldManifest.generated.filter((p) => !targetPaths.has(p));
  const errors: string[] = [];
  const managedAgentsPaths = await listManagedAgentsPaths(!preserveExistingRoot);
  const symlinkErrors = await Promise.all(managedAgentsPaths.map(ensureManagedPathIsRegularFile));
  for (const e of symlinkErrors) {
    if (e !== null) {
      errors.push(e);
    }
  }
  if (await fileContainsCrlf(ROOT_MD)) {
    errors.push(`${ROOT_MD}: must use LF line endings`);
  }

  if (mode === "write") {
    await runWriteMode(generated, stale, targetPaths, errors);
  } else {
    await runCheckMode(generated, stale, targetPaths, dirToRules, errors);
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
