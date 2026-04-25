import { join } from "node:path";

export function resolveProjectRoot(scriptDir: string): string {
  return scriptDir.replace(/[\\/]scripts[\\/]validation$/, "");
}

export function resolveBin(projectRoot: string, name: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(projectRoot, "node_modules", ".bin", `${name}${ext}`);
}
