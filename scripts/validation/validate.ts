#!/usr/bin/env bun

const DEFAULT_STEPS = [
  "agents:check",
  "format:check",
  "lint:errors",
  "lint:arch",
  "typecheck",
  "test",
  "validate:frontend",
  "lint:audit",
] as const;

const SPAWN_OPTS = {
  stdin: "inherit" as const,
  ...(process.platform === "win32" ? { windowsHide: true } : {}),
};

function parseFlag(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  const value = Number(process.argv[index + 1]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

async function packageScripts(): Promise<string[]> {
  const packageJson = (await Bun.file(`${process.cwd()}/package.json`).json()) as unknown;
  if (
    typeof packageJson === "object" &&
    packageJson !== null &&
    "scripts" in packageJson &&
    typeof packageJson["scripts"] === "object" &&
    packageJson["scripts"] !== null
  ) {
    const scripts = packageJson["scripts"];
    return Object.keys(scripts);
  }
  return [];
}

type Result = {
  readonly step: string;
  readonly exit: number;
  readonly output: string;
  readonly ms: number;
};

function printFail(result: Result): void {
  console.error(`FAIL ${result.step} (${formatMs(result.ms)})`);
  if (result.output.length > 0) {
    console.error(result.output);
    console.error();
  }
}

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");
  const jobs = parseFlag("--jobs", 3);
  const availableScripts = new Set(await packageScripts());
  const steps = (process.env["VALIDATE_STEPS"]?.split(",") ?? [...DEFAULT_STEPS]).filter((step) =>
    availableScripts.has(step),
  );

  async function run(step: string): Promise<Result> {
    const startedAt = performance.now();
    const proc = Bun.spawn([process.execPath, "run", "--silent", step], {
      ...SPAWN_OPTS,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exit] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);

    return { step, exit, output: (stdout + stderr).trimEnd(), ms: performance.now() - startedAt };
  }

  async function verboseSequential(): Promise<Result[]> {
    async function runAt(index: number): Promise<Result[]> {
      const step = steps[index];
      if (step === undefined) {
        return [];
      }

      const startedAt = performance.now();
      const proc = Bun.spawn([process.execPath, "run", "--silent", step], {
        ...SPAWN_OPTS,
        stdout: "inherit",
        stderr: "inherit",
      });
      const exit = await proc.exited;
      return [
        { step, exit, output: "", ms: performance.now() - startedAt },
        ...(await runAt(index + 1)),
      ];
    }

    return runAt(0);
  }

  async function pool(concurrency: number, onResult: (result: Result) => void): Promise<void> {
    let cursor = 0;
    const width = concurrency === 0 ? steps.length : Math.min(concurrency, steps.length);

    async function worker(): Promise<void> {
      const index = cursor++;
      const step = steps[index];
      if (step === undefined) {
        return;
      }
      onResult(await run(step));
      await worker();
    }

    await Promise.all(Array.from({ length: width }, worker));
  }

  let failed = 0;
  let total = 0;

  if (verbose) {
    const results = await verboseSequential();
    for (const result of results) {
      total++;
      if (result.exit !== 0) {
        failed++;
        printFail(result);
      }
    }
  } else {
    await pool(jobs, (result) => {
      total++;
      if (result.exit !== 0) {
        failed++;
        printFail(result);
      }
    });
  }

  if (failed === 0) {
    console.log("OK");
  } else {
    console.log(`validate: ${total - failed}/${total} passed, ${failed} failed`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
