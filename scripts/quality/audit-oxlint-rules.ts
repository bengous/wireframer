#!/usr/bin/env bun

import { join } from "node:path";

type Severity = "deny" | "warn" | "allow";
type Subcommand = "summary" | "active" | "available" | "test";

type Options = {
  readonly subcommand: Subcommand;
  readonly ruleName: string | undefined;
};

type ActiveRule = {
  readonly name: string;
  readonly severity: Severity;
  readonly plugin: string;
};

type CatalogRule = {
  readonly name: string;
  readonly plugin: string;
  readonly category: string;
  readonly fixable: boolean;
};

type ParsedConfigJson = {
  readonly rules: Record<string, unknown>;
};

const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = ".oxlintrc.jsonc";
const SCAN_PATHS = ["src/", "scripts/"];
const OXLINT_BIN = join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "oxlint.exe" : "oxlint",
);

const SKIP_PLUGINS = new Set([
  "jest",
  "vitest",
  "jsdoc",
  "nextjs",
  "vue",
  "react_perf",
  "node",
  "promise",
]);
const SKIP_RULES = new Set([
  "sort-keys",
  "sort-vars",
  "sort-imports",
  "no-ternary",
  "no-undefined",
  "no-continue",
  "no-inline-comments",
  "id-length",
  "func-style",
  "func-names",
  "no-magic-numbers",
  "max-lines",
  "max-lines-per-function",
  "max-params",
  "max-depth",
  "max-statements",
  "max-nested-callbacks",
  "max-classes-per-file",
  "capitalized-comments",
  "new-cap",
  "init-declarations",
  "unicode-bom",
  "unicorn/filename-case",
  "unicorn/no-null",
  "unicorn/no-array-reduce",
  "unicorn/no-nested-ternary",
  "oxc/no-barrel-file",
  "oxc/no-optional-chaining",
  "oxc/no-rest-spread-properties",
  "oxc/no-async-await",
  "import/prefer-default-export",
  "import/no-named-export",
  "import/exports-last",
  "import/group-exports",
]);

function parseArgs(argv: ReadonlyArray<string>): Options {
  let subcommand: Subcommand = "summary";
  let ruleName: string | undefined;
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const command = positional[0];
  if (
    command === "summary" ||
    command === "active" ||
    command === "available" ||
    command === "test"
  ) {
    subcommand = command;
  }
  if (subcommand === "test") {
    ruleName = positional[1];
    if (ruleName === undefined) {
      console.error("usage: audit-oxlint-rules.ts test <rule-name>");
      process.exit(1);
    }
  }
  return { subcommand, ruleName };
}

function exec(args: ReadonlyArray<string>): string {
  const result = Bun.spawnSync([OXLINT_BIN, ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.toString().trim() || `oxlint exited with code ${result.exitCode}`,
    );
  }
  return result.stdout.toString();
}

function execAllowFailure(args: ReadonlyArray<string>): { stdout: string; exitCode: number } {
  const result = Bun.spawnSync([OXLINT_BIN, ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  return { stdout: result.stdout.toString(), exitCode: result.exitCode };
}

function getVersion(): string {
  const result = Bun.spawnSync([OXLINT_BIN, "--version"], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.stdout
    .toString()
    .trim()
    .replace(/^Version:\s*/i, "");
}

function isParsedConfigJson(value: unknown): value is ParsedConfigJson {
  return (
    typeof value === "object" &&
    value !== null &&
    "rules" in value &&
    typeof value["rules"] === "object" &&
    value["rules"] !== null
  );
}

function toSeverity(value: string): Severity {
  if (value === "deny" || value === "warn" || value === "allow") {
    return value;
  }
  throw new Error(`Unknown severity: ${value}`);
}

function extractSeverity(value: unknown): Severity {
  if (typeof value === "string") {
    return toSeverity(value);
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return toSeverity(value[0]);
  }
  throw new Error(`Unknown rule config shape: ${JSON.stringify(value)}`);
}

function parseActiveConfig(): ReadonlyArray<ActiveRule> {
  const json = exec(["--print-config", "-c", CONFIG_PATH, ...SCAN_PATHS]);
  const parsed = JSON.parse(json) as unknown;
  if (!isParsedConfigJson(parsed)) {
    throw new Error("Invalid oxlint config JSON");
  }
  const config = parsed;
  return Object.entries(config.rules).map(([name, severity]) => ({
    name,
    severity: extractSeverity(severity),
    plugin: name.includes("/") ? name.split("/")[0]! : "eslint",
  }));
}

const CATEGORY_RE = /^## (\w+) \(\d+\)/;

function parseCatalogRules(): ReadonlyArray<CatalogRule> {
  const output = exec(["--import-plugin", "--rules"]);
  let currentCategory = "";
  return output.split(/\r?\n/).flatMap((line) => {
    const categoryMatch = CATEGORY_RE.exec(line);
    if (categoryMatch !== null) {
      currentCategory = categoryMatch[1]!.toLowerCase();
      return [];
    }
    if (!line.startsWith("|")) {
      return [];
    }
    const cols = line
      .split("|")
      .slice(1, -1)
      .map((col) => col.trim());
    const [ruleName, source, , , fixableCol] = cols;
    if (
      ruleName === undefined ||
      source === undefined ||
      fixableCol === undefined ||
      ruleName === "Rule name"
    ) {
      return [];
    }
    const plugin = ruleName.includes("/") ? ruleName.split("/")[0]! : source.toLowerCase();
    return [
      {
        name: ruleName,
        plugin,
        category: currentCategory,
        fixable: fixableCol.toLowerCase().includes("fix"),
      },
    ];
  });
}

function groupByPlugin<T extends { readonly plugin: string }>(
  items: ReadonlyArray<T>,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const bucket = grouped.get(item.plugin) ?? [];
    bucket.push(item);
    grouped.set(item.plugin, bucket);
  }
  return grouped;
}

function printSummary(
  activeRules: ReadonlyArray<ActiveRule>,
  availableRules: ReadonlyArray<CatalogRule>,
): void {
  console.log("Config: backend");
  console.log(`Oxlint: ${getVersion()}`);
  console.log(`Active rules: ${activeRules.length}`);
  console.log(`Available candidate rules: ${availableRules.length}`);
  for (const [plugin, rules] of [...groupByPlugin(activeRules).entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`- ${plugin}: ${rules.length} active`);
  }
}

function printActive(activeRules: ReadonlyArray<ActiveRule>): void {
  for (const [plugin, rules] of [...groupByPlugin(activeRules).entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`## ${plugin}`);
    for (const rule of rules.toSorted((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${rule.severity} ${rule.name}`);
    }
  }
}

function printAvailable(rules: ReadonlyArray<CatalogRule>): void {
  for (const [plugin, pluginRules] of [...groupByPlugin(rules).entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`## ${plugin}`);
    for (const rule of pluginRules.toSorted((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${rule.category}${rule.fixable ? " fixable" : ""} ${rule.name}`);
    }
  }
}

function printRuleTest(ruleName: string): void {
  const result = execAllowFailure([
    "-c",
    CONFIG_PATH,
    "--deny",
    ruleName,
    "--format=unix",
    ...SCAN_PATHS,
  ]);
  const lines = result.stdout.split("\n").filter(Boolean);
  console.log(`Rule: ${ruleName}`);
  console.log(`Violations: ${lines.length}`);
  for (const line of lines.slice(0, 20)) {
    console.log(line);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const activeRules = parseActiveConfig();
  const availableRules = parseCatalogRules().filter((rule) => {
    if (activeRules.some((activeRule) => activeRule.name === rule.name)) {
      return false;
    }
    if (SKIP_PLUGINS.has(rule.plugin)) {
      return false;
    }
    if (SKIP_RULES.has(rule.name)) {
      return false;
    }
    return true;
  });

  switch (options.subcommand) {
    case "summary":
      printSummary(activeRules, availableRules);
      break;
    case "active":
      printActive(activeRules);
      break;
    case "available":
      printAvailable(availableRules);
      break;
    case "test":
      printRuleTest(options.ruleName!);
      break;
  }
}

if (import.meta.main) {
  main();
}
